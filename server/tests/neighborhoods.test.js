import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb, Client } from './helpers.js';
import * as fx from './fixtures.js';

process.env.ONDEMAND_INGESTION = '0'; // don't start background jobs inside API tests
const dbUp = await connectTestDb();
const { createApp } = await import('../src/app.js');
const { setTransport } = await import('../src/utils/safeFetch.js');
const { upsertLocality } = await import('../src/services/localityService.js');
const { seedDemoFor } = await import('../src/ingestion/demo.js');
const { Neighborhood } = await import('../src/models/Neighborhood.js');
const { Metric } = await import('../src/models/Metric.js');

let server, base, a, b, c;
const PW = 'Correct-Horse-9-Battery';
const signedIn = async () => { const cl = new Client(base); await cl.post('/api/auth/register', { email: `n${Date.now()}${Math.random()}@ex.com`, name: 'N', password: PW }); return cl; };

describe('neighborhood API', { skip: !dbUp && 'MongoDB unavailable' }, () => {
  before(async () => {
    await Promise.all([Neighborhood.init(), Metric.init()]);
    a = await upsertLocality({ name: 'Kothrud', city: 'Pune', district: 'Pune', state: 'Maharashtra', lat: 18.5074, lng: 73.8077 }, { origin: 'seed' });
    b = await upsertLocality({ name: 'Koramangala', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', lat: 12.9352, lng: 77.6245 }, { origin: 'seed' });
    c = await upsertLocality({ name: 'Hinjewadi', city: 'Pune', district: 'Pune', state: 'Maharashtra', lat: 18.5913, lng: 73.7389 }, { origin: 'seed' });
    for (const n of [a, b, c]) await seedDemoFor(n);
    server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { setTransport(null); server?.close(); await disconnectTestDb(); });

  it('searches by prefix, filters by city, paginates, and scores every result', async () => {
    const cl = new Client(base);
    const r = await cl.get('/api/neighborhoods/search?q=kor');
    assert.equal(r.status, 200);
    assert.equal(r.body.data[0].name, 'Koramangala');
    assert.ok(r.body.data[0].score.overall >= 0 && r.body.data[0].score.dataMix.isDemo === true);
    const pune = await cl.get('/api/neighborhoods/search?city=Pune&sort=name');
    assert.deepEqual(pune.body.data.map((x) => x.name), ['Hinjewadi', 'Kothrud']);
    const p = await cl.get('/api/neighborhoods/search?limit=1&page=2&sort=name');
    assert.equal(p.body.data.length, 1); assert.equal(p.body.meta.total, 3); assert.equal(p.body.meta.pages, 3);
  });

  it('treats search input as literal text (no regex injection) and validates params', async () => {
    const cl = new Client(base);
    assert.equal((await cl.get('/api/neighborhoods/search?q=.*')).body.data.length, 0);
    assert.equal((await cl.get('/api/neighborhoods/search?q=(a+)+$')).status, 200);
    assert.equal((await cl.get('/api/neighborhoods/search?limit=5000')).status, 400);
    assert.equal((await cl.get('/api/neighborhoods/search?city[$ne]=x')).status, 400);
    assert.equal((await cl.get('/api/neighborhoods/search?weights=education:9')).status, 400);
  });

  it('returns a profile by slug or id with an explained, deterministic score', async () => {
    const cl = new Client(base);
    const bySlug = await cl.get(`/api/neighborhoods/${a.slug}`);
    const byId = await cl.get(`/api/neighborhoods/${a._id}`);
    assert.equal(bySlug.status, 200);
    assert.deepEqual(bySlug.body.data.score.overall, byId.body.data.score.overall);
    const edu = bySlug.body.data.score.categories.find((x) => x.id === 'education');
    assert.ok(edu.metrics.length > 0 && edu.metrics.every((m) => typeof m.explanation === 'string'));
    assert.equal(bySlug.body.data.score.categories.find((x) => x.id === 'power').status, 'no_data');
    assert.equal((await cl.get('/api/neighborhoods/does-not-exist')).status, 404);
    assert.equal((await cl.get('/api/neighborhoods/<script>')).status, 400);
  });

  it('weights change the overall score (personalisation) but never the category scores', async () => {
    const cl = new Client(base);
    const x = (await cl.get(`/api/neighborhoods/${a.slug}?weights=education:5,healthcare:0,safety:0,environment:0,transport:0,essentials:0,development:0`)).body.data.score;
    const y = (await cl.get(`/api/neighborhoods/${a.slug}?weights=education:0,healthcare:0,safety:0,environment:5,transport:0,essentials:0,development:0`)).body.data.score;
    assert.equal(x.overall, x.categories.find((k) => k.id === 'education').score);
    assert.equal(y.overall, y.categories.find((k) => k.id === 'environment').score);
    assert.deepEqual(x.categories.map((k) => k.score), y.categories.map((k) => k.score));
  });

  it('exposes metrics with provenance, sources, history, POIs and quality flags', async () => {
    const cl = new Client(base);
    const m = (await cl.get(`/api/neighborhoods/${a.slug}/metrics`)).body.data;
    assert.ok(m.every((x) => x.granularity && x.origin === 'seed' && x.source.isDemo === true && x.collectedAt));
    const s = (await cl.get(`/api/neighborhoods/${a.slug}/sources`)).body.data;
    assert.equal(s[0].key, 'demo-fixture'); assert.ok(s[0].metrics > 0 && s[0].pois > 0);
    const h = (await cl.get(`/api/neighborhoods/${a.slug}/history?key=pm25`)).body.data;
    assert.equal(h.length, 24); assert.ok(new Date(h[0].observedAt) < new Date(h[23].observedAt));
    const p = (await cl.get(`/api/neighborhoods/${a.slug}/pois?type=school&limit=5`)).body.data;
    assert.ok(p.length <= 5 && p.every((x) => x.type === 'school')); assert.ok(p[0].distanceM <= p.at(-1).distanceM);
    const q = (await cl.get(`/api/neighborhoods/${a.slug}/quality`)).body.data;
    assert.ok(q.flags.some((f) => f.code === 'DEMO_DATA')); assert.ok(q.flags.some((f) => f.code === 'COARSE_GRANULARITY'));
  });

  it('compares 2–4 distinct neighborhoods deterministically', async () => {
    const cl = new Client(base);
    const r = await cl.post('/api/neighborhoods/compare', { ids: [a.slug, b.slug, String(c._id)] });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.neighborhoods.length, 3);
    assert.equal(r.body.data.comparison.categories.length, 10);
    assert.equal((await cl.post('/api/neighborhoods/compare', { ids: [a.slug] })).status, 400);
    assert.equal((await cl.post('/api/neighborhoods/compare', { ids: [a.slug, a.slug] })).status, 400);
    assert.equal((await cl.post('/api/neighborhoods/compare', { ids: [a.slug, b.slug, c.slug, 'x', 'y'] })).status, 400);
  });

  it('stores personal weights; anonymous requests use defaults; prefs are per-user', async () => {
    const anon = new Client(base);
    assert.equal((await anon.get('/api/me/preferences')).status, 401);
    const u1 = await signedIn(); const u2 = await signedIn();
    const put = await u1.req('PUT', '/api/me/preferences', { weights: { education: 5, transport: 0 }, presetId: 'family' });
    assert.equal(put.status, 200); assert.equal(put.body.data.weights.education, 5); assert.equal(put.body.data.presetId, null, 'preset id dropped when weights differ from preset');
    assert.equal((await u1.req('PUT', '/api/me/preferences', { weights: { education: 7 } })).status, 400);
    assert.equal((await u1.req('PUT', '/api/me/preferences', { weights: { hacking: 1 } })).status, 400);
    const p1 = (await u1.get(`/api/neighborhoods/${a.slug}`)).body.data.score.weights;
    const p2 = (await u2.get(`/api/neighborhoods/${a.slug}`)).body.data.score.weights;
    assert.equal(p1.education, 5); assert.equal(p1.transport, 0); assert.equal(p2.education, 3);
    const reset = await u1.req('DELETE', '/api/me/preferences');
    assert.equal(reset.body.data.isDefault, true);
  });

  it('resolves a new locality via the geocoder: auth required, coordinates derived server-side', async () => {
    setTransport(fx.fakeTransport([[/nominatim/, { body: [
      { osm_type: 'relation', osm_id: 555, lat: '18.5590', lon: '73.7868', name: 'Baner', display_name: 'Baner, Pune, Maharashtra, India', addresstype: 'suburb', boundingbox: ['18.55', '18.57', '73.77', '73.80'], address: { suburb: 'Baner', city: 'Pune', state_district: 'Pune', state: 'Maharashtra', country: 'India' } },
      { osm_type: 'node', osm_id: 9, lat: '1', lon: '1', display_name: 'A shop', addresstype: 'shop', address: { state: 'X' } },
    ] }]]));
    assert.equal((await new Client(base).get('/api/neighborhoods/lookup?q=baner')).status, 401);
    const u = await signedIn();
    const look = await u.get('/api/neighborhoods/lookup?q=baner');
    assert.equal(look.status, 200); assert.equal(look.body.data.length, 1, 'non-area results filtered out');
    assert.equal(look.body.data[0].exists, false);
    const bad = await u.post('/api/neighborhoods', { q: 'baner', ref: 'osm:relation/999', lat: 0 });
    assert.equal(bad.status, 400);
    const made = await u.post('/api/neighborhoods', { q: 'baner', ref: 'osm:relation/555' });
    assert.equal(made.status, 201);
    const nb = await Neighborhood.findOne({ slug: 'baner-pune' });
    assert.equal(nb.lat, 18.559); assert.equal(nb.origin, 'live'); assert.deepEqual([...nb.bbox], [18.55, 73.77, 18.57, 73.8]);
    assert.equal((await u.get('/api/neighborhoods/lookup?q=baner')).body.data[0].exists, true);
  });

  it('reports geocoder outages as 503 with a helpful message', async () => {
    setTransport(fx.fakeTransport([[/nominatim/, { status: 500, body: {} }]]));
    const u = await signedIn();
    const r = await u.get('/api/neighborhoods/lookup?q=nowhere-xyz');
    assert.equal(r.status, 503); assert.equal(r.body.error.code, 'GEOCODER_UNAVAILABLE');
  });

  it('refresh requires auth and enforces a cooldown', async () => {
    assert.equal((await new Client(base).post(`/api/neighborhoods/${b.slug}/refresh`, {})).status, 401);
    const u = await signedIn();
    await Neighborhood.updateOne({ _id: b._id }, { $set: { 'ingestion.lastRunAt': new Date() } });
    const r = await u.post(`/api/neighborhoods/${b.slug}/refresh`, {});
    assert.equal(r.status, 429); assert.equal(r.body.error.code, 'REFRESH_COOLDOWN');
  });

  it('facets list cities with states', async () => {
    const r = await new Client(base).get('/api/neighborhoods/facets');
    assert.ok(r.body.data.cities.some((x) => x.city === 'Pune' && x.state === 'Maharashtra'));
  });
});
