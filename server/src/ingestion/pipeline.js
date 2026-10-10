import mongoose from 'mongoose';
import { Neighborhood } from '../models/Neighborhood.js';
import { Metric } from '../models/Metric.js';
import { HistoricalMetric } from '../models/HistoricalMetric.js';
import { Poi } from '../models/Poi.js';
import { Source } from '../models/Source.js';
import { IngestionRun } from '../models/IngestionRun.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as overpass from './adapters/overpass.js';
import * as openaq from './adapters/openaq.js';
import * as cpcb from './adapters/cpcb.js';
import * as ncrb from './adapters/ncrb.js';
import { poiMetrics, airMetrics, crimeMetric } from './normalize.js';

export const PROVIDERS = ['overpass', 'air', 'crime'];

export async function ensureSources() {
  for (const s of [overpass.SOURCE, openaq.SOURCE, cpcb.SOURCE, ncrb.SOURCE]) await Source.updateOne({ key: s.key }, { $set: s }, { upsert: true });
}

// Live data replaces demo data wholesale: we never mix seed and source-backed values for one neighborhood.
async function purgeSeed(nid) {
  await Promise.all([Metric.deleteMany({ neighborhoodId: nid, origin: 'seed' }), Poi.deleteMany({ neighborhoodId: nid, origin: 'seed' }), HistoricalMetric.deleteMany({ neighborhoodId: nid, origin: 'seed' })]);
}

export async function upsertMetrics(nid, metrics, collectedAt) {
  for (const m of metrics) {
    await Metric.updateOne({ neighborhoodId: nid, key: m.key }, { $set: { ...m, neighborhoodId: nid, collectedAt } }, { upsert: true, runValidators: true });
  }
  return metrics.length;
}

const sanitizeError = (e) => (e?.message || 'Unknown error').replace(/api-key=[^&\s]+/gi, 'api-key=[REDACTED]').slice(0, 300);

async function runProvider(nb, provider, trigger, fn) {
  const run = await IngestionRun.create({ neighborhoodId: nb._id, provider, trigger, status: 'running', startedAt: new Date() });
  try {
    const result = await fn();
    const status = result.skipped ? 'skipped' : 'success';
    await IngestionRun.updateOne({ _id: run._id }, { $set: { status, counts: result.counts ?? {}, error: result.reason, finishedAt: new Date() } });
    return { status, at: new Date(), ...(result.reason ? { reason: result.reason } : {}), counts: result.counts };
  } catch (e) {
    const notConfigured = e.code === 'NOT_CONFIGURED';
    const msg = sanitizeError(e);
    await IngestionRun.updateOne({ _id: run._id }, { $set: { status: notConfigured ? 'skipped' : 'failed', error: msg, finishedAt: new Date() } });
    if (!notConfigured) logger.warn({ provider, neighborhood: nb.slug, code: e.code }, 'ingestion provider failed');
    return { status: notConfigured ? 'skipped' : 'failed', at: new Date(), reason: msg };
  }
}

const PROVIDER_FNS = {
  async overpass(nb) {
    const { pois, fetchedAt, cached } = await overpass.fetchAmenities(nb.lat, nb.lng);
    await purgeSeed(nb._id);
    const origin = cached ? 'cached' : 'live';
    const ops = pois.slice(0, 1500).map((p) => ({ updateOne: { filter: { neighborhoodId: nb._id, ref: p.ref }, update: { $set: { ...p, neighborhoodId: nb._id, origin, sourceKey: 'osm-overpass', collectedAt: fetchedAt } }, upsert: true } }));
    if (ops.length) await Poi.bulkWrite(ops, { ordered: false });
    // Remove POIs no longer present in the source (so deletions in OSM propagate).
    await Poi.deleteMany({ neighborhoodId: nb._id, sourceKey: 'osm-overpass', ref: mongoose.trusted({ $nin: pois.slice(0, 1500).map((p) => p.ref) }) });
    const n = await upsertMetrics(nb._id, poiMetrics(pois, overpass.SEARCH_RADIUS_M, { origin, sourceKey: 'osm-overpass' }), fetchedAt);
    return { counts: { pois: ops.length, metrics: n } };
  },
  async air(nb) {
    const results = await Promise.allSettled([openaq.fetchAirQuality(nb.lat, nb.lng), cpcb.fetchCpcb(nb.lat, nb.lng, nb.state)]);
    const [oa, cp] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    if (!oa && !cp) {
      const errs = results.map((r) => r.reason);
      if (errs.every((e) => e?.code === 'NOT_CONFIGURED')) return { skipped: true, reason: 'No air-quality API key configured (OPENAQ_API_KEY / DATA_GOV_IN_API_KEY)' };
      throw errs.find((e) => e?.code !== 'NOT_CONFIGURED') ?? errs[0];
    }
    if (cp?.station) cp.station.observedAt = cpcb.parseCpcbDate(cp.station.lastUpdate) ?? undefined;
    const metrics = airMetrics(oa, cp).map((m) => ({ ...m, origin: 'live' }));
    if (!metrics.length) return { skipped: true, reason: 'No monitoring station with readings found nearby' };
    await purgeSeed(nb._id);
    const now = new Date();
    await upsertMetrics(nb._id, metrics, now);
    let hist = 0;
    for (const h of oa?.history ?? []) {
      await HistoricalMetric.updateOne({ neighborhoodId: nb._id, key: 'pm25', period: 'month', observedAt: h.observedAt },
        { $set: { value: h.value, unit: 'µg/m³', origin: 'live', sourceKey: 'openaq-v3', collectedAt: now } }, { upsert: true });
      hist++;
    }
    const partial = results.filter((r) => r.status === 'rejected' && r.reason?.code !== 'NOT_CONFIGURED').map((r) => sanitizeError(r.reason));
    return { counts: { metrics: metrics.length, history: hist }, reason: partial.length ? `Partial: ${partial.join('; ')}` : undefined };
  },
  async crime(nb) {
    const mappings = ncrb.loadMappings();
    if (!mappings.length) return { skipped: true, reason: 'No verified NCRB resource mapping configured (see server/src/ingestion/config/crimeResources.json)' };
    let n = 0;
    for (const m of mappings) {
      const { rows, fetchedAt } = await ncrb.loadCrimeTable(m);
      const match = ncrb.matchArea(rows, m, nb);
      if (!match) continue;
      await purgeSeed(nb._id);
      n += await upsertMetrics(nb._id, [{ ...crimeMetric(m, match), origin: 'live' }], fetchedAt);
    }
    return n ? { counts: { metrics: n } } : { skipped: true, reason: 'No matching area in configured crime tables' };
  },
};

/** Runs the selected providers for one neighborhood and records overall status. Never throws for provider errors. */
export async function ingestNeighborhood(id, { trigger = 'cli', providers = PROVIDERS } = {}) {
  const nb = await Neighborhood.findById(id);
  if (!nb) throw new Error('Neighborhood not found');
  await Neighborhood.updateOne({ _id: nb._id }, { $set: { 'ingestion.status': 'running', 'ingestion.lastRunAt': new Date() } });
  await ensureSources();
  const results = {};
  for (const p of providers) results[p] = await runProvider(nb, p, trigger, () => PROVIDER_FNS[p](nb));
  const statuses = Object.values(results).map((r) => r.status);
  const ok = statuses.filter((s) => s === 'success').length;
  const overall = ok === statuses.length ? 'complete' : ok > 0 ? 'partial' : statuses.every((s) => s === 'skipped') ? 'partial' : 'failed';
  const set = { 'ingestion.status': overall };
  for (const [p, r] of Object.entries(results)) set[`ingestion.providers.${p}`] = r;
  if (ok > 0) set['ingestion.lastSuccessAt'] = new Date();
  await Neighborhood.updateOne({ _id: nb._id }, { $set: set });
  return { status: overall, results };
}

// In-process queue for on-demand ingestion (bounded concurrency; dedupes by neighborhood).
const queue = []; const inFlight = new Set(); let active = 0; const MAX_ACTIVE = 2;
export const isIngestionActive = (id) => inFlight.has(String(id));
// ONDEMAND_INGESTION gates automatic/user-triggered jobs; explicit admin requests pass { force: true }.
export function enqueueIngestion(id, trigger = 'on_demand', { force = false } = {}) {
  const key = String(id);
  if (inFlight.has(key) || (!force && env.ONDEMAND_INGESTION !== '1')) return false;
  inFlight.add(key); queue.push({ key, trigger });
  Neighborhood.updateOne({ _id: id }, { $set: { 'ingestion.status': 'queued' } }).catch(() => {});
  drain();
  return true;
}
function drain() {
  while (active < MAX_ACTIVE && queue.length) {
    const job = queue.shift(); active++;
    ingestNeighborhood(job.key, { trigger: job.trigger })
      .catch((e) => logger.error({ err: { message: e.message } }, 'ingestion job failed'))
      .finally(() => { active--; inFlight.delete(job.key); drain(); });
  }
}
export const ingestionQueueState = () => ({ queued: queue.length, active });
