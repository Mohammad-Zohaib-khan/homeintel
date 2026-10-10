/*
 * HomeIntel deterministic scoring engine.
 * Pure functions only: metrics in → scores + explanation out. No I/O, no randomness, no AI.
 * Every number the UI shows can be traced to a rule in this file.
 */
import { CATEGORIES, CATEGORY_IDS, DEFAULT_WEIGHTS, scoreBand } from '@homeintel/shared';

export const SCORING_VERSION = '1.0.0';

const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;
const fmtKm = (m) => (m >= 1000 ? `${r1(m / 1000)} km` : `${Math.round(m)} m`);

// CPCB National AQI breakpoints for PM2.5 (24-hour average, µg/m³) → sub-index.
const PM25_BREAKS = [[0, 30, 0, 50], [30, 60, 50, 100], [60, 90, 100, 200], [90, 120, 200, 300], [120, 250, 300, 400], [250, 500, 400, 500]];
export function pm25ToAqi(c) {
  const v = Math.max(0, c);
  const b = PM25_BREAKS.find(([lo, hi]) => v <= hi) ?? PM25_BREAKS.at(-1);
  const [lo, hi, ilo, ihi] = b;
  return Math.round(Math.min(500, ilo + ((Math.min(v, hi) - lo) * (ihi - ilo)) / (hi - lo)));
}
export const AQI_CATEGORY = (aqi) => (aqi <= 50 ? 'Good' : aqi <= 100 ? 'Satisfactory' : aqi <= 200 ? 'Moderate' : aqi <= 300 ? 'Poor' : aqi <= 400 ? 'Very poor' : 'Severe');
// AQI → 0–100 score (piecewise linear).
const AQI_POINTS = [[0, 100], [50, 90], [100, 70], [200, 40], [300, 20], [400, 5], [500, 0]];
export function aqiToScore(aqi) {
  for (let i = 1; i < AQI_POINTS.length; i++) {
    const [x0, y0] = AQI_POINTS[i - 1]; const [x1, y1] = AQI_POINTS[i];
    if (aqi <= x1) return r1(y0 + ((aqi - x0) * (y1 - y0)) / (x1 - x0));
  }
  return 0;
}

// ---- rule kinds ---------------------------------------------------------------------------------
const count = (target, noun) => ({
  kind: 'count', target,
  score: (m) => clamp((m.value / target) * 100),
  explain: (m, s) => `${m.value} ${noun} — full marks at ${target} or more (${Math.round(s)}/100).`,
});
const distance = (good, poor, noun) => ({
  kind: 'distance', good, poor,
  score: (m) => (m.details?.noneWithin ? 0 : clamp(((poor - m.value) / (poor - good)) * 100)),
  explain: (m, s) => (m.details?.noneWithin
    ? `No ${noun} mapped within ${fmtKm(m.value)} — scored 0.`
    : `${fmtKm(m.value)} to the nearest ${noun}${m.details?.name ? ` (${m.details.name})` : ''}; full marks within ${fmtKm(good)}, zero beyond ${fmtKm(poor)} (${Math.round(s)}/100).`),
});
const airPm25 = {
  kind: 'pm25',
  score: (m) => aqiToScore(pm25ToAqi(m.value)),
  explain: (m, s) => { const a = pm25ToAqi(m.value); return `PM2.5 ${m.value} µg/m³ ≈ AQI ${a} (${AQI_CATEGORY(a)}) on CPCB breakpoints (${Math.round(s)}/100).`; },
};
const airCpcb = {
  kind: 'aqi',
  score: (m) => (m.unit === 'AQI' ? aqiToScore(m.value) : aqiToScore(pm25ToAqi(m.value))),
  explain: (m, s) => (m.unit === 'AQI' ? `AQI ${m.value} (${AQI_CATEGORY(m.value)}) as published by CPCB (${Math.round(s)}/100).` : airPm25.explain(m, s)),
};
const crimeRank = {
  kind: 'rank',
  score: (m) => clamp((m.details?.beatsShareOfAreas ?? 0) * 100),
  explain: (m, s) => `${m.value} ${m.unit}; lower than ${Math.round((m.details?.beatsShareOfAreas ?? 0) * 100)}% of the ${m.details?.areasInTable ?? '?'} areas in the same table. ${m.granularity}-level figure, not neighborhood-specific (${Math.round(s)}/100).`,
};

// ---- metric registry: key → { category, weight within category, rule } ---------------------------
export const METRIC_RULES = {
  schools_1500m: { category: 'education', weight: 0.5, rule: count(8, 'schools/kindergartens within 1.5 km') },
  nearest_school_m: { category: 'education', weight: 0.3, rule: distance(500, 2500, 'school') },
  colleges_3000m: { category: 'education', weight: 0.2, rule: count(3, 'colleges/universities within 3 km') },
  hospitals_3000m: { category: 'healthcare', weight: 0.35, rule: count(3, 'hospitals within 3 km') },
  nearest_hospital_m: { category: 'healthcare', weight: 0.35, rule: distance(1000, 3000, 'hospital') },
  clinics_pharmacies_1500m: { category: 'healthcare', weight: 0.3, rule: count(10, 'clinics/pharmacies within 1.5 km') },
  nearest_police_m: { category: 'safety', weight: 0.25, rule: distance(1000, 3000, 'police station') },
  nearest_fire_m: { category: 'safety', weight: 0.15, rule: distance(1500, 3000, 'fire station') },
  crime: { category: 'safety', weight: 0.6, rule: crimeRank },               // matches crime_* keys
  pm25: { category: 'environment', weight: 0.4, rule: airPm25 },
  aqi_cpcb: { category: 'environment', weight: 0.4, rule: airCpcb },
  parks_1000m: { category: 'environment', weight: 0.2, rule: count(4, 'parks/green spaces within 1 km') },
  bus_stops_800m: { category: 'transport', weight: 0.5, rule: count(6, 'bus stops within 800 m') },
  nearest_rail_m: { category: 'transport', weight: 0.5, rule: distance(800, 3000, 'rail/metro station') },
  groceries_1000m: { category: 'essentials', weight: 0.6, rule: count(8, 'groceries/markets within 1 km') },
  banking_1000m: { category: 'essentials', weight: 0.4, rule: count(5, 'banks/ATMs within 1 km') },
  construction_2000m: { category: 'development', weight: 1, rule: count(5, 'mapped construction sites within 2 km') },
};
const ruleFor = (key) => METRIC_RULES[key] ?? (key.startsWith('crime_') ? METRIC_RULES.crime : null);
const CATEGORY_WEIGHT_TOTAL = Object.fromEntries(CATEGORY_IDS.map((c) => [c, Object.values(METRIC_RULES).filter((r) => r.category === c).reduce((a, r) => a + r.weight, 0)]));

export const CATEGORY_NOTES = {
  utilities: 'No open dataset with neighborhood-level water or utility reliability is connected. HomeIntel does not estimate it.',
  power: 'No open dataset with neighborhood-level power-outage records is connected. HomeIntel does not estimate it.',
  connectivity: 'No open dataset with neighborhood-level broadband or mobile coverage is connected. HomeIntel does not estimate it.',
  development: 'Counts construction mapped in OpenStreetMap. More activity signals growth but can also mean disruption.',
};

// Freshness windows by source (days).
const FRESH_DAYS = { 'openaq-v3': 3, 'ogd-cpcb-aqi': 3, 'osm-overpass': 120, 'ogd-ncrb': 1100, 'demo-fixture': 36500 };
export function freshness(m, now = new Date()) {
  const ref = m.sourceKey === 'openaq-v3' || m.sourceKey === 'ogd-cpcb-aqi' ? (m.observedAt ?? m.collectedAt) : m.collectedAt;
  if (!ref) return 'unknown';
  const days = (now - new Date(ref)) / 86_400_000;
  return days > (FRESH_DAYS[m.sourceKey] ?? 30) || m.details?.stale ? 'stale' : 'fresh';
}

export function normalizeWeights(w = {}) {
  const out = {};
  for (const id of CATEGORY_IDS) {
    const v = Number(w[id]);
    out[id] = Number.isFinite(v) ? Math.min(5, Math.max(0, Math.round(v))) : DEFAULT_WEIGHTS[id];
  }
  return out;
}

/** Scores one metric. Returns null if no rule exists (metric still shown as evidence, but not scored). */
export function scoreMetric(m, now = new Date()) {
  const def = ruleFor(m.key);
  if (!def) return null;
  const score = r1(def.rule.score(m));
  return { key: m.key, category: def.category, weight: def.weight, score, explanation: def.rule.explain(m, score), confidence: m.confidence ?? 0.8, freshness: freshness(m, now) };
}

/**
 * @param {Array} metrics normalized Metric docs for ONE neighborhood
 * @param {Object} weights category weights 0–5
 */
export function scoreNeighborhood(metrics, weights = DEFAULT_WEIGHTS, now = new Date()) {
  const w = normalizeWeights(weights);
  const scored = metrics.map((m) => ({ m, s: scoreMetric(m, now) })).filter((x) => x.s);

  const categories = CATEGORIES.map(({ id, label }) => {
    const items = scored.filter((x) => x.s.category === id);
    if (!items.length) {
      return { id, label, score: null, band: 'No data', status: 'no_data', coverage: 0, confidence: 0, weight: w[id], note: CATEGORY_NOTES[id] ?? 'No source data available for this category yet.', metrics: [] };
    }
    const wsum = items.reduce((a, x) => a + x.s.weight, 0);
    const score = r1(items.reduce((a, x) => a + x.s.score * x.s.weight, 0) / wsum);
    const confidence = r1(items.reduce((a, x) => a + x.s.confidence * x.s.weight, 0) / wsum * 100) / 100;
    const coverage = r1(Math.min(1, wsum / CATEGORY_WEIGHT_TOTAL[id]) * 100) / 100;
    const origins = [...new Set(items.map((x) => x.m.origin))];
    const granularities = [...new Set(items.map((x) => x.m.granularity))];
    const anyStale = items.some((x) => x.s.freshness === 'stale');
    return {
      id, label, score, band: scoreBand(score), weight: w[id], coverage, confidence,
      status: coverage < 0.5 ? 'partial' : anyStale ? 'stale' : 'ok',
      origins, granularities, note: CATEGORY_NOTES[id],
      metrics: items.map((x) => ({ key: x.m.key, label: x.m.label, value: x.m.value, unit: x.m.unit, score: x.s.score, contribution: r1((x.s.weight / wsum) * x.s.score), explanation: x.s.explanation, freshness: x.s.freshness, granularity: x.m.granularity, origin: x.m.origin })),
    };
  });

  const active = categories.filter((c) => c.weight > 0);
  const withData = active.filter((c) => c.score != null);
  const wTotal = active.reduce((a, c) => a + c.weight, 0);
  const wData = withData.reduce((a, c) => a + c.weight, 0);
  const overall = wData ? r1(withData.reduce((a, c) => a + c.score * c.weight, 0) / wData) : null;
  const coverage = wTotal ? r1((wData / wTotal) * 100) / 100 : 0;
  const originCounts = metrics.reduce((a, m) => ({ ...a, [m.origin]: (a[m.origin] ?? 0) + 1 }), {});

  return {
    version: SCORING_VERSION,
    overall, band: scoreBand(overall), coverage,
    status: overall == null ? 'no_data' : coverage < 0.5 ? 'limited' : 'ok',
    weights: w,
    categories,
    missing: categories.filter((c) => c.score == null).map((c) => c.id),
    dataMix: { live: originCounts.live ?? 0, cached: originCounts.cached ?? 0, seed: originCounts.seed ?? 0, isDemo: (originCounts.seed ?? 0) > 0 && !(originCounts.live || originCounts.cached) },
    method: 'Each metric is converted to 0–100 by a fixed rule; categories are weighted means of their metrics; the overall score is the weighted mean of categories that have data, using your priority weights. Missing categories are excluded and reported, never estimated.',
  };
}

/** Deterministic comparison of several scored neighborhoods. Highlights trade-offs, not a single "winner". */
export function compareScores(entries) {
  const ids = entries.map((e) => e.id);
  const categories = CATEGORIES.map(({ id, label }) => {
    const vals = entries.map((e) => ({ id: e.id, score: e.score.categories.find((c) => c.id === id)?.score ?? null }));
    const present = vals.filter((v) => v.score != null);
    const best = present.length ? Math.max(...present.map((v) => v.score)) : null;
    const worst = present.length ? Math.min(...present.map((v) => v.score)) : null;
    return {
      id, label, values: vals,
      leaders: present.length > 1 && best - worst >= 5 ? present.filter((v) => v.score === best).map((v) => v.id) : [],
      spread: present.length > 1 ? r1(best - worst) : null,
      comparable: present.length === vals.length,
    };
  });
  const overall = entries.map((e) => ({ id: e.id, overall: e.score.overall, coverage: e.score.coverage }));
  const tradeoffs = entries.map((e) => ({
    id: e.id,
    strengths: categories.filter((c) => c.leaders.includes(e.id)).map((c) => c.id),
    gaps: categories.filter((c) => c.comparable && c.spread >= 5 && c.values.find((v) => v.id === e.id).score === Math.min(...c.values.map((v) => v.score))).map((c) => c.id),
  }));
  const close = overall.every((o) => o.overall != null) && Math.max(...overall.map((o) => o.overall)) - Math.min(...overall.map((o) => o.overall)) < 3;
  return { ids, overall, categories, tradeoffs, summary: close ? 'Overall scores are within 3 points — the decision rests on which category trade-offs matter most to you.' : null };
}
