import mongoose from 'mongoose';
import { Neighborhood } from '../models/Neighborhood.js';
import { Metric } from '../models/Metric.js';
import { HistoricalMetric } from '../models/HistoricalMetric.js';
import { Poi } from '../models/Poi.js';
import { Source } from '../models/Source.js';
import { scoreNeighborhood, compareScores, freshness, normalizeWeights, pm25ToAqi } from '../scoring/engine.js';
import { DEFAULT_WEIGHTS } from '@homeintel/shared';
import { AppError } from '../utils/AppError.js';
import { normName } from '../utils/geo.js';
import { geocode } from '../ingestion/adapters/nominatim.js';
import { enqueueIngestion } from '../ingestion/pipeline.js';
import { upsertLocality, slugFor } from './localityService.js';
import { audit } from './auditService.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function weightsFor(req, explicit) {
  if (explicit) return normalizeWeights(explicit);
  if (req.user?.preferences?.weights) return normalizeWeights(req.user.preferences.weights);
  return { ...DEFAULT_WEIGHTS };
}

export async function findNeighborhood(idOrSlug) {
  const nb = mongoose.isValidObjectId(idOrSlug) && String(idOrSlug).length === 24
    ? await Neighborhood.findById(idOrSlug)
    : /^[a-z0-9-]{1,120}$/.test(idOrSlug) ? await Neighborhood.findOne({ slug: idOrSlug }) : null;
  if (!nb) throw AppError.notFound('Neighborhood not found');
  return nb;
}

async function metricsByNeighborhood(ids) {
  const all = await Metric.find({ neighborhoodId: mongoose.trusted({ $in: ids }) }).lean();
  const map = new Map(ids.map((id) => [String(id), []]));
  for (const m of all) map.get(String(m.neighborhoodId))?.push(m);
  return map;
}

const summarize = (nb, score) => ({
  ...nb.toSummary(),
  score: { overall: score.overall, band: score.band, coverage: score.coverage, status: score.status, dataMix: score.dataMix,
    categories: score.categories.map((c) => ({ id: c.id, score: c.score, band: c.band, status: c.status })) },
});

const SORTS = { name: (a, b) => a.name.localeCompare(b.name), score: (a, b) => (b.score.overall ?? -1) - (a.score.overall ?? -1) || a.name.localeCompare(b.name) };

export async function search({ q, city, state, sort = 'score', page = 1, limit = 20 }, weights) {
  const filter = {};
  if (q) {
    const key = normName(q);
    if (!key) return { items: [], meta: { total: 0, page, limit, pages: 1, weights } };
    filter.searchKey = new RegExp(`(^|\\s)${escapeRe(key)}`);
  }
  if (city) filter.city = city;
  if (state) filter.state = state;
  const docs = await Neighborhood.find(filter).limit(500);
  const mm = await metricsByNeighborhood(docs.map((d) => d._id));
  let items = docs.map((d) => summarize(d, scoreNeighborhood(mm.get(String(d._id)), weights)));
  if (q) { // exact/prefix name matches first
    const key = normName(q);
    items.sort((a, b) => Number(!normName(a.name).startsWith(key)) - Number(!normName(b.name).startsWith(key)) || SORTS[sort](a, b));
  } else items.sort(SORTS[sort]);
  const total = items.length;
  items = items.slice((page - 1) * limit, page * limit);
  return { items, meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), weights } };
}

export async function facets() {
  const docs = await Neighborhood.find({}, { city: 1, state: 1 }).lean();
  const cities = {}; for (const d of docs) cities[d.city] = d.state;
  return { cities: Object.entries(cities).map(([city, state]) => ({ city, state })).sort((a, b) => a.city.localeCompare(b.city)), total: docs.length };
}

export async function profile(idOrSlug, weights) {
  const nb = await findNeighborhood(idOrSlug);
  const metrics = await Metric.find({ neighborhoodId: nb._id }).lean();
  const score = scoreNeighborhood(metrics, weights);
  const lastCollected = metrics.reduce((a, m) => (!a || m.collectedAt > a ? m.collectedAt : a), null);
  return { neighborhood: { ...nb.toSummary(), bbox: nb.bbox, geocodeSource: nb.geocodeSource, ingestion: nb.ingestion }, score, lastCollected };
}

export async function metrics(idOrSlug) {
  const nb = await findNeighborhood(idOrSlug);
  const list = await Metric.find({ neighborhoodId: nb._id }).sort({ category: 1, key: 1 }).lean();
  const sources = await Source.find({ key: mongoose.trusted({ $in: [...new Set(list.map((m) => m.sourceKey))] }) }).lean();
  const sMap = Object.fromEntries(sources.map((s) => [s.key, s]));
  return list.map((m) => ({
    id: String(m._id), key: m.key, category: m.category, label: m.label, value: m.value, unit: m.unit, granularity: m.granularity, scope: m.scope,
    origin: m.origin, source: { key: m.sourceKey, name: sMap[m.sourceKey]?.name ?? m.sourceKey, url: sMap[m.sourceKey]?.url ?? null, isDemo: !!sMap[m.sourceKey]?.isDemo },
    sourceRef: m.sourceRef ?? null, observedAt: m.observedAt ?? null, collectedAt: m.collectedAt, confidence: m.confidence, distanceKm: m.distanceKm ?? null,
    freshness: freshness(m), details: m.details ?? null,
  }));
}

export async function sources(idOrSlug) {
  const nb = await findNeighborhood(idOrSlug);
  const [agg, poiAgg] = await Promise.all([Metric.find({ neighborhoodId: nb._id }, { sourceKey: 1, collectedAt: 1, origin: 1 }).lean(), Poi.find({ neighborhoodId: nb._id }, { sourceKey: 1 }).lean()]);
  const byKey = {};
  for (const m of agg) { const b = (byKey[m.sourceKey] ??= { metrics: 0, pois: 0, lastCollected: null, origins: new Set() }); b.metrics++; b.origins.add(m.origin); if (!b.lastCollected || m.collectedAt > b.lastCollected) b.lastCollected = m.collectedAt; }
  for (const p of poiAgg) (byKey[p.sourceKey] ??= { metrics: 0, pois: 0, lastCollected: null, origins: new Set() }).pois++;
  const docs = await Source.find({ key: mongoose.trusted({ $in: Object.keys(byKey) }) }).lean();
  return docs.map((s) => ({ key: s.key, provider: s.provider, name: s.name, url: s.url ?? null, license: s.license, attribution: s.attribution, isDemo: !!s.isDemo,
    metrics: byKey[s.key].metrics, pois: byKey[s.key].pois, lastCollected: byKey[s.key].lastCollected, origins: [...byKey[s.key].origins] }));
}

export async function history(idOrSlug, key) {
  const nb = await findNeighborhood(idOrSlug);
  const rows = await HistoricalMetric.find({ neighborhoodId: nb._id, key }).sort({ observedAt: 1 }).limit(400).lean();
  return rows.map((r) => ({ observedAt: r.observedAt, value: r.value, unit: r.unit, period: r.period, origin: r.origin, sourceKey: r.sourceKey }));
}

export async function pois(idOrSlug, { type, limit = 300 }) {
  const nb = await findNeighborhood(idOrSlug);
  const filter = { neighborhoodId: nb._id };
  if (type) filter.type = type;
  const rows = await Poi.find(filter).sort({ distanceM: 1 }).limit(limit).lean();
  return rows.map((p) => ({ id: p.ref, type: p.type, name: p.name ?? null, lat: p.lat, lng: p.lng, distanceM: p.distanceM, origin: p.origin, sourceKey: p.sourceKey }));
}

/** Deterministic data-quality review: stale, low-confidence, coarse, contradictory, demo, provider failures. Pure. */
const PROVIDER_NAME = { overpass: 'OpenStreetMap amenities', air: 'air-quality', crime: 'crime-data' };
export function qualityFlags(nb, list, now = new Date()) {
  const flags = [];
  for (const m of list) {
    if (freshness(m, now) === 'stale') flags.push({ level: 'warning', code: 'STALE', metric: m.key, message: `${m.label} is older than its freshness window for ${m.sourceKey}.` });
    if ((m.confidence ?? 1) < 0.5) flags.push({ level: 'info', code: 'LOW_CONFIDENCE', metric: m.key, message: `${m.label} has low confidence (${Math.round(m.confidence * 100)}%): ${m.scope}.` });
    if (['city', 'district', 'state'].includes(m.granularity)) flags.push({ level: 'info', code: 'COARSE_GRANULARITY', metric: m.key, message: `${m.label} describes the whole ${m.granularity}, not this neighborhood.` });
  }
  const pm = list.find((m) => m.key === 'pm25'); const cp = list.find((m) => m.key === 'aqi_cpcb' && m.unit === 'AQI');
  if (pm && cp && Math.abs(pm25ToAqi(pm.value) - cp.value) > 100) flags.push({ level: 'warning', code: 'CONTRADICTION', metric: 'pm25', message: `OpenAQ PM2.5 implies AQI ${pm25ToAqi(pm.value)} while CPCB reports AQI ${cp.value}. Stations, times or averaging periods may differ.` });
  if (list.some((m) => m.origin === 'seed')) flags.push({ level: 'warning', code: 'DEMO_DATA', message: 'This neighborhood shows synthetic demo data. Run ingestion with network access to replace it with source-backed data.' });
  for (const [p, r] of Object.entries(nb.ingestion?.providers ?? {})) if (r?.status === 'failed') flags.push({ level: 'warning', code: 'PROVIDER_FAILED', provider: p, message: `The last ${PROVIDER_NAME[p] ?? p} refresh failed (${r.reason ?? 'unknown error'}); earlier values are shown.` });
  return flags;
}

export async function quality(idOrSlug) {
  const nb = await findNeighborhood(idOrSlug);
  const list = await Metric.find({ neighborhoodId: nb._id }).lean();
  return { flags: qualityFlags(nb, list), checkedAt: new Date() };
}

export async function compare(ids, weights) {
  if (new Set(ids).size !== ids.length) throw AppError.badRequest('Choose different neighborhoods to compare');
  const nbs = await Promise.all(ids.map(findNeighborhood));
  const mm = await metricsByNeighborhood(nbs.map((n) => n._id));
  const entries = nbs.map((n) => ({ id: String(n._id), neighborhood: n.toSummary(), score: scoreNeighborhood(mm.get(String(n._id)), weights) }));
  return { neighborhoods: entries, comparison: compareScores(entries), weights };
}

// ---- resolving new localities ------------------------------------------------------------------
export async function lookup(q) {
  let candidates;
  try { candidates = await geocode(q); } catch (e) { throw new AppError(503, 'GEOCODER_UNAVAILABLE', 'The location service is unavailable right now. Try one of the localities already in HomeIntel.'); }
  const existing = new Set((await Neighborhood.find({ slug: mongoose.trusted({ $in: candidates.map(slugFor) }) }, { slug: 1 }).lean()).map((d) => d.slug));
  return candidates.map((c) => ({ ref: c.ref, name: c.name, city: c.city, district: c.district ?? null, state: c.state, displayName: c.displayName, lat: c.lat, lng: c.lng, exists: existing.has(slugFor(c)), slug: slugFor(c) }));
}

// The client sends only (q, ref); coordinates are re-derived server-side from the geocoder so they cannot be forged.
export async function createFromLookup(req, { q, ref }) {
  const candidates = await geocode(q).catch(() => { throw new AppError(503, 'GEOCODER_UNAVAILABLE', 'The location service is unavailable right now.'); });
  const c = candidates.find((x) => x.ref === ref);
  if (!c) throw AppError.badRequest('That location could not be confirmed. Search again.');
  const nb = await upsertLocality(c, { origin: 'live', geocodeSource: { provider: 'nominatim', ref: c.ref, license: 'ODbL 1.0' }, createdBy: req.user._id });
  await audit(req, 'neighborhood.create', { userId: req.user._id, meta: { slug: nb.slug } });
  const queued = enqueueIngestion(nb._id, 'on_demand');
  return { neighborhood: nb.toSummary(), ingestionQueued: queued };
}

const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
export async function refresh(req, idOrSlug) {
  const nb = await findNeighborhood(idOrSlug);
  const last = nb.ingestion?.lastRunAt;
  if (last && Date.now() - new Date(last).getTime() < REFRESH_COOLDOWN_MS) {
    throw new AppError(429, 'REFRESH_COOLDOWN', `This neighborhood was refreshed recently. Try again after ${new Date(new Date(last).getTime() + REFRESH_COOLDOWN_MS).toISOString()}.`);
  }
  const queued = enqueueIngestion(nb._id, 'refresh');
  await audit(req, 'neighborhood.refresh', { userId: req.user._id, meta: { slug: nb.slug, queued } });
  return { queued, status: queued ? 'queued' : nb.ingestion?.status ?? 'idle' };
}
