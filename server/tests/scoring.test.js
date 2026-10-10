import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { scoreNeighborhood, scoreMetric, pm25ToAqi, aqiToScore, compareScores, normalizeWeights, SCORING_VERSION } = await import('../src/scoring/engine.js');
const { DEFAULT_WEIGHTS } = await import('@homeintel/shared');

const M = (key, value, extra = {}) => ({ key, value, unit: 'count', label: key, granularity: 'neighborhood', origin: 'live', sourceKey: 'osm-overpass', collectedAt: new Date(), confidence: 0.8, ...extra });

describe('rules', () => {
  it('PM2.5 → AQI uses CPCB breakpoints', () => {
    assert.equal(pm25ToAqi(0), 0); assert.equal(pm25ToAqi(30), 50); assert.equal(pm25ToAqi(60), 100);
    assert.equal(pm25ToAqi(90), 200); assert.equal(pm25ToAqi(120), 300); assert.equal(pm25ToAqi(250), 400); assert.equal(pm25ToAqi(900), 500);
    assert.equal(pm25ToAqi(45), 75);
  });
  it('AQI → score is monotonic decreasing and bounded', () => {
    let prev = 101;
    for (let a = 0; a <= 500; a += 25) { const s = aqiToScore(a); assert.ok(s <= prev && s >= 0 && s <= 100); prev = s; }
  });
  it('count rule saturates at target; distance rule is linear; "none within" scores 0', () => {
    assert.equal(scoreMetric(M('schools_1500m', 4)).score, 50);
    assert.equal(scoreMetric(M('schools_1500m', 40)).score, 100);
    assert.equal(scoreMetric(M('nearest_school_m', 500, { unit: 'm' })).score, 100);
    assert.equal(scoreMetric(M('nearest_school_m', 1500, { unit: 'm' })).score, 50);
    assert.equal(scoreMetric(M('nearest_police_m', 3000, { unit: 'm', details: { noneWithin: true } })).score, 0);
  });
  it('crime metrics score by rank within their own table', () => {
    assert.equal(scoreMetric(M('crime_ipc_city', 300, { granularity: 'city', details: { beatsShareOfAreas: 0.75, areasInTable: 19 } })).score, 75);
  });
  it('unknown metrics are evidence only (not scored)', () => assert.equal(scoreMetric(M('mystery', 1)), null));
  it('explanations mention the value and the rule', () => assert.match(scoreMetric(M('bus_stops_800m', 3)).explanation, /3 bus stops within 800 m — full marks at 6/));
});

describe('scoreNeighborhood', () => {
  const metrics = [M('schools_1500m', 8), M('nearest_school_m', 500, { unit: 'm' }), M('pm25', 30, { unit: 'µg/m³', granularity: 'station', sourceKey: 'openaq-v3', observedAt: new Date() }), M('bus_stops_800m', 6)];
  it('is deterministic', () => assert.deepEqual(scoreNeighborhood(metrics, DEFAULT_WEIGHTS, new Date('2026-01-01')), scoreNeighborhood(metrics, DEFAULT_WEIGHTS, new Date('2026-01-01'))));
  it('never invents missing categories', () => {
    const s = scoreNeighborhood(metrics);
    const util = s.categories.find((c) => c.id === 'utilities');
    assert.equal(util.score, null); assert.equal(util.status, 'no_data'); assert.match(util.note, /does not estimate/);
    assert.ok(s.missing.includes('utilities') && s.missing.includes('power') && s.missing.includes('connectivity'));
  });
  it('category score renormalizes over present metrics and reports coverage', () => {
    const edu = scoreNeighborhood(metrics).categories.find((c) => c.id === 'education');
    assert.equal(edu.score, 100); assert.equal(edu.coverage, 0.8); assert.equal(edu.status, 'ok');
    const tr = scoreNeighborhood(metrics).categories.find((c) => c.id === 'transport');
    assert.equal(tr.coverage, 0.5); assert.equal(tr.status, 'ok');
  });
  it('overall uses only categories with data and respects weights; zero weight excludes a category', () => {
    const base = scoreNeighborhood([M('schools_1500m', 8), M('bus_stops_800m', 0)], { ...normalizeWeights({}), education: 5, transport: 5 });
    assert.equal(base.overall, 50);
    const eduOnly = scoreNeighborhood([M('schools_1500m', 8), M('bus_stops_800m', 0)], { ...normalizeWeights({}), education: 5, transport: 0 });
    assert.equal(eduOnly.overall, 100);
  });
  it('flags limited coverage and demo data', () => {
    const s = scoreNeighborhood([M('schools_1500m', 2, { origin: 'seed', sourceKey: 'demo-fixture' })]);
    assert.equal(s.status, 'limited'); assert.equal(s.dataMix.isDemo, true);
  });
  it('no metrics → no score, not zero', () => { const s = scoreNeighborhood([]); assert.equal(s.overall, null); assert.equal(s.status, 'no_data'); });
  it('marks stale air data', () => {
    const old = new Date(Date.now() - 10 * 86400e3);
    const env = scoreNeighborhood([M('pm25', 30, { unit: 'µg/m³', sourceKey: 'openaq-v3', observedAt: old, collectedAt: old })]).categories.find((c) => c.id === 'environment');
    assert.equal(env.metrics[0].freshness, 'stale');
  });
  it('clamps and defaults weights', () => assert.deepEqual(normalizeWeights({ education: 99, healthcare: -3, bogus: 4 }), { ...DEFAULT_WEIGHTS, education: 5, healthcare: 0 }));
  it('exposes a version', () => assert.match(SCORING_VERSION, /^\d+\.\d+\.\d+$/));
});

describe('compareScores', () => {
  const a = { id: 'a', score: scoreNeighborhood([M('schools_1500m', 8), M('bus_stops_800m', 0)]) };
  const b = { id: 'b', score: scoreNeighborhood([M('schools_1500m', 2), M('bus_stops_800m', 6)]) };
  const c = compareScores([a, b]);
  it('identifies category leaders and gaps (trade-offs), not a single winner', () => {
    assert.deepEqual(c.categories.find((x) => x.id === 'education').leaders, ['a']);
    assert.deepEqual(c.categories.find((x) => x.id === 'transport').leaders, ['b']);
    assert.deepEqual(c.tradeoffs.find((t) => t.id === 'a').gaps, ['transport']);
  });
  it('categories with no data on either side have no leaders', () => { const s = c.categories.find((x) => x.id === 'safety'); assert.deepEqual(s.leaders, []); assert.equal(s.spread, null); });
});
