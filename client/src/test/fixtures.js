import { CATEGORIES } from '@homeintel/shared';

export const cat = (id, score) => ({ id, label: CATEGORIES.find((c) => c.id === id).label, score, band: score == null ? 'No data' : score >= 65 ? 'Strong' : 'Fair', weight: 3, status: score == null ? 'no_data' : 'ok', coverage: score == null ? 0 : 1, confidence: 0.8, origins: ['seed'], granularities: ['neighborhood'], note: score == null ? 'No open dataset is connected. HomeIntel does not estimate it.' : undefined,
  metrics: score == null ? [] : [{ key: `${id}_m`, label: `${id} metric`, value: 4, unit: 'count', score, contribution: score, explanation: `Rule text for ${id}.`, freshness: 'fresh', granularity: 'neighborhood', origin: 'seed' }] });

export const score = (overall = 72, isDemo = true) => ({
  version: '1.0.0', overall, band: 'Strong', coverage: 0.8, status: 'ok', weights: {}, missing: ['utilities', 'power', 'connectivity'],
  dataMix: { live: isDemo ? 0 : 10, cached: 0, seed: isDemo ? 10 : 0, isDemo }, method: 'Method text.',
  categories: CATEGORIES.map((c) => cat(c.id, ['utilities', 'power', 'connectivity'].includes(c.id) ? null : 70)),
});
export const summary = (name, slug, overall = 72) => ({ id: slug.padEnd(24, '0').slice(0, 24), slug, name, city: 'Pune', state: 'Maharashtra', lat: 18.5, lng: 73.8, radiusM: 1500, origin: 'seed', ingestion: { status: 'complete' },
  score: { overall, band: 'Strong', coverage: 0.8, status: 'ok', dataMix: { isDemo: true }, categories: score(overall).categories.map((c) => ({ id: c.id, score: c.score, band: c.band, status: c.status })) } });
export const profile = (slug = 'kothrud-pune', isDemo = true) => ({
  neighborhood: { ...summary('Kothrud', slug), district: 'Pune', bbox: [], geocodeSource: {}, ingestion: { status: 'complete', providers: {} } },
  score: score(72, isDemo), lastCollected: new Date().toISOString(),
});
