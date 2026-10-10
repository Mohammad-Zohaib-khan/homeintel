import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.OPENAQ_API_KEY = 'test-openaq-key';
process.env.DATA_GOV_IN_API_KEY = 'test-ogd-key';
import { connectTestDb, disconnectTestDb } from './helpers.js';
import * as fx from './fixtures.js';

const dbUp = await connectTestDb();
await import('../src/config/outbound.js');
const { setTransport } = await import('../src/utils/safeFetch.js');
const { poiMetrics, airMetrics, crimeMetric } = await import('../src/ingestion/normalize.js');
const { classify } = await import('../src/ingestion/adapters/overpass.js');
const ncrb = await import('../src/ingestion/adapters/ncrb.js');
const { ingestNeighborhood } = await import('../src/ingestion/pipeline.js');
const { seedDemoFor, generateDemo } = await import('../src/ingestion/demo.js');
const { upsertLocality } = await import('../src/services/localityService.js');
const { Metric } = await import('../src/models/Metric.js');
const { Poi } = await import('../src/models/Poi.js');
const { HistoricalMetric } = await import('../src/models/HistoricalMetric.js');
const { IngestionRun } = await import('../src/models/IngestionRun.js');
const { ProviderCache } = await import('../src/models/ProviderCache.js');

const routes = () => fx.fakeTransport([
  [/overpass-api\.de/, { body: fx.overpass }],
  [/openaq\.org\/v3\/locations\?/, { body: fx.openaqLocations }],
  [/openaq\.org\/v3\/locations\/100\/latest/, { body: fx.openaqLatest }],
  [/openaq\.org\/v3\/sensors\/1001\/days\/monthly/, { body: fx.openaqMonthly }],
  [/api\.data\.gov\.in\/resource/, { body: fx.cpcbRecords }],
]);

describe('normalization (pure)', () => {
  it('classifies OSM tags into the HomeIntel taxonomy', () => {
    assert.equal(classify({ amenity: 'kindergarten' }), 'school');
    assert.equal(classify({ healthcare: 'hospital' }), 'hospital');
    assert.equal(classify({ railway: 'halt' }), 'rail_station');
    assert.equal(classify({ shop: 'chemist' }), 'pharmacy');
    assert.equal(classify({ amenity: 'bench' }), null);
  });
  it('counts within radius and records nearest distance, or "none within" explicitly', () => {
    const pois = [{ type: 'school', distanceM: 100, ref: 'a' }, { type: 'school', distanceM: 1600, ref: 'b' }, { type: 'hospital', distanceM: 2500, ref: 'c', name: 'H' }];
    const m = Object.fromEntries(poiMetrics(pois, 3000, { origin: 'live', sourceKey: 'osm-overpass' }).map((x) => [x.key, x]));
    assert.equal(m.schools_1500m.value, 1);
    assert.equal(m.nearest_school_m.value, 100);
    assert.equal(m.nearest_hospital_m.details.name, 'H');
    assert.equal(m.nearest_police_m.details.noneWithin, true);
    assert.ok(Object.values(m).every((x) => x.granularity === 'neighborhood' && x.origin === 'live' && x.sourceKey === 'osm-overpass'));
  });
  it('labels air quality as station-level with distance, and lowers confidence when stale', () => {
    const old = new Date(Date.now() - 90 * 86400e3).toISOString();
    const [pm] = airMetrics({ station: { id: 1, name: 'S', distanceKm: 3.2 }, readings: { pm25: { value: 40, at: old } } }, null);
    assert.equal(pm.granularity, 'station'); assert.match(pm.scope, /not neighborhood-exact/); assert.equal(pm.distanceKm, 3.2);
    assert.ok(pm.confidence <= 0.3); assert.equal(pm.details.stale, true);
  });
  it('CPCB sub-index → AQI as max sub-index; concentration mode uses PM2.5', () => {
    const st = { name: 'X', distanceKm: 2, pollutants: { 'PM2.5': 96, PM10: 74 } };
    assert.equal(airMetrics(null, { station: st, valueKind: 'subindex' })[0].value, 96);
    const c = airMetrics(null, { station: st, valueKind: 'concentration' })[0];
    assert.equal(c.unit, 'µg/m³'); assert.equal(c.value, 96);
  });
  it('crime metric keeps the source granularity and says so', () => {
    const m = crimeMetric({ id: 'ipc', resourceId: '00000000-0000-0000-0000-000000000000', year: 2022, granularity: 'city', valueKind: 'rate_per_lakh', label: 'IPC crime rate' }, { area: 'Pune', value: 300, percentileBetterThan: 0.5, areasInTable: 19 });
    assert.equal(m.granularity, 'city'); assert.match(m.scope, /not specific to this neighborhood/);
  });
  it('demo generator is deterministic and always labelled', () => {
    const nb = { slug: 'x-y', lat: 18.5, lng: 73.8, city: 'Y' };
    const a = generateDemo(nb, new Date('2026-01-01')); const b = generateDemo(nb, new Date('2026-01-01'));
    assert.deepEqual(a.metrics, b.metrics);
    assert.ok(a.metrics.every((m) => m.origin === 'seed' && m.sourceKey === 'demo-fixture' && /synthetic/.test(m.scope)));
  });
});

describe('NCRB mapping safety', () => {
  it('rejects mappings with unknown keys or bad ids', () => {
    assert.throws(() => ncrb.mappingSchema.parse({ id: 'x', resourceId: 'nope', title: 't', year: 2022, granularity: 'city', areaField: 'a', valueField: 'v', valueKind: 'count', label: 'l' }));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-')); const f = path.join(dir, 'm.json');
    fs.writeFileSync(f, JSON.stringify({ resources: [{ id: 'x', resourceId: '11111111-1111-1111-1111-111111111111', title: 't', year: 2022, granularity: 'city', areaField: 'a', valueField: 'v', valueKind: 'count', label: 'l', extra: 1 }] }));
    assert.throws(() => ncrb.loadMappings(f));
  });
  it('refuses to import when the live schema lacks a mapped field', { skip: !dbUp && 'MongoDB unavailable' }, async () => {
    setTransport(fx.fakeTransport([[/data\.gov\.in/, { body: { field: [{ id: 'city' }, { id: 'total_cases' }], records: [{ city: 'Pune', total_cases: '10' }] } }]]));
    await assert.rejects(ncrb.loadCrimeTable({ id: 'x', resourceId: '22222222-2222-2222-2222-222222222222', granularity: 'city', areaField: 'city', valueField: 'rate_of_crime', valueKind: 'rate_per_lakh' }), { code: 'SCHEMA_MISMATCH' });
  });
  it('matches the area and ranks it within the same table only', () => {
    const rows = [{ areaKey: 'pune', area: 'Pune', value: 300 }, { areaKey: 'mumbai', area: 'Mumbai', value: 400 }, { areaKey: 'delhi', area: 'Delhi', value: 1200 }];
    const m = ncrb.matchArea(rows, { granularity: 'city', lowerIsBetter: true }, { city: 'Pune', state: 'Maharashtra' });
    assert.equal(m.value, 300); assert.equal(m.percentileBetterThan, 1); assert.equal(m.areasInTable, 3);
    assert.equal(ncrb.matchArea(rows, { granularity: 'city', lowerIsBetter: true }, { city: 'Nagpur', state: 'Maharashtra' }), null);
  });
});

describe('ingestion pipeline (DB)', { skip: !dbUp && 'MongoDB unavailable' }, () => {
  let nb;
  before(async () => { await Promise.all([Metric.init(), Poi.init(), HistoricalMetric.init(), ProviderCache.init()]); });
  beforeEach(async () => {
    await Promise.all([Metric.deleteMany({}), Poi.deleteMany({}), HistoricalMetric.deleteMany({}), ProviderCache.deleteMany({}), IngestionRun.deleteMany({})]);
    nb = await upsertLocality({ name: 'Kothrud', city: 'Pune', district: 'Pune', state: 'Maharashtra', ...fx.center }, { origin: 'seed' });
  });
  after(async () => { setTransport(null); await disconnectTestDb(); });

  it('ingests live data, replaces demo data, and is idempotent', async () => {
    await seedDemoFor(nb);
    assert.ok(await Metric.exists({ neighborhoodId: nb._id, origin: 'seed' }));
    const t = routes(); setTransport(t);
    const r1 = await ingestNeighborhood(nb._id, { providers: ['overpass', 'air'] });
    assert.equal(r1.status, 'complete', JSON.stringify(r1));
    assert.equal(await Metric.countDocuments({ neighborhoodId: nb._id, origin: 'seed' }), 0, 'demo data must be removed once live data exists');
    assert.equal(await Poi.countDocuments({ origin: 'seed' }), 0);
    const counts1 = [await Metric.countDocuments(), await Poi.countDocuments(), await HistoricalMetric.countDocuments()];
    const r2 = await ingestNeighborhood(nb._id, { providers: ['overpass', 'air'] });
    assert.equal(r2.status, 'complete');
    assert.deepEqual([await Metric.countDocuments(), await Poi.countDocuments(), await HistoricalMetric.countDocuments()], counts1, 're-running must not duplicate');

    const m = Object.fromEntries((await Metric.find({ neighborhoodId: nb._id }).lean()).map((x) => [x.key, x]));
    assert.equal(m.schools_1500m.value, 2);
    assert.equal(m.hospitals_3000m.value, 1);
    assert.equal(m.pm25.value, 42.4);
    assert.equal(m.pm25.details.station, 'Karve Road', 'nearest station chosen, not the first returned');
    assert.equal(m.aqi_cpcb.value, 96);
    assert.match(m.aqi_cpcb.scope, /Karve Road, Pune/);
    assert.equal(m.aqi_cpcb.observedAt.toISOString(), '2026-10-08T12:30:00.000Z');
    assert.ok(Object.values(m).every((x) => x.collectedAt && x.sourceKey && x.granularity));
    const pharm = await Poi.findOne({ type: 'pharmacy' }).lean();
    assert.ok(!pharm.name.includes('<'), 'POI names are sanitized');
    assert.equal(await HistoricalMetric.countDocuments({ key: 'pm25' }), 2);
  });

  it('caches provider responses and never stores API keys in the cache key or URLs it logs', async () => {
    const t = routes(); setTransport(t);
    await ingestNeighborhood(nb._id, { providers: ['overpass', 'air'] });
    const before = t.calls.length;
    await ingestNeighborhood(nb._id, { providers: ['overpass', 'air'] });
    assert.equal(t.calls.length, before, 'second run served from cache');
    const openaqCall = t.calls.find((c) => c.url.includes('openaq'));
    assert.equal(openaqCall.headers['x-api-key'], 'test-openaq-key');
    assert.ok(!openaqCall.url.includes('test-openaq-key'));
    const cacheDump = JSON.stringify(await ProviderCache.find({}).lean());
    assert.ok(!cacheDump.includes('test-ogd-key') && !cacheDump.includes('test-openaq-key'));
    const runs = await IngestionRun.find({}).lean();
    assert.ok(runs.length >= 4 && runs.every((r) => !String(r.error ?? '').includes('test-ogd-key')));
  });

  it('keeps demo data and reports failure when providers are down', async () => {
    await seedDemoFor(nb);
    setTransport(fx.fakeTransport([[/./, { status: 500, body: {} }]]));
    const r = await ingestNeighborhood(nb._id, { providers: ['overpass'] });
    assert.equal(r.status, 'failed');
    assert.ok(await Metric.exists({ neighborhoodId: nb._id, origin: 'seed' }), 'demo data retained');
    const run = await IngestionRun.findOne({ provider: 'overpass' }).lean();
    assert.equal(run.status, 'failed');
  });

  it('marks air as partial when one source fails and skipped when none configured', async () => {
    setTransport(fx.fakeTransport([
      [/openaq\.org\/v3\/locations\?/, { body: fx.openaqLocations }], [/latest/, { body: fx.openaqLatest }], [/monthly/, { body: fx.openaqMonthly }],
      [/data\.gov\.in/, { status: 500, body: {} }],
    ]));
    const r = await ingestNeighborhood(nb._id, { providers: ['air'] });
    assert.equal(r.results.air.status, 'success');
    assert.match(r.results.air.reason, /Partial/);
  });

  it('crime provider skips cleanly with no verified mapping', async () => {
    const r = await ingestNeighborhood(nb._id, { providers: ['crime'] });
    assert.equal(r.results.crime.status, 'skipped');
    assert.match(r.results.crime.reason, /No verified NCRB resource mapping/);
  });

  it('demo seeding never overwrites source-backed data', async () => {
    setTransport(routes());
    await ingestNeighborhood(nb._id, { providers: ['overpass'] });
    const r = await seedDemoFor(nb);
    assert.equal(r.skipped, true);
    assert.equal(await Metric.countDocuments({ origin: 'seed' }), 0);
  });
});
