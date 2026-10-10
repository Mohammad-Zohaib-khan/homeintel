/*
 * Deterministic, buyer-oriented report content. Plain-text strings in typed blocks only (no HTML), so the
 * frontend renders them as text and nothing in a report can execute. An optional AI narrative is attached
 * separately and marked as such.
 */
import { CATEGORIES, GRANULARITY_LABEL } from '@homeintel/shared';
import { scoreNeighborhood, compareScores, SCORING_VERSION } from '../scoring/engine.js';

const label = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
const r = (n) => (n == null ? null : Math.round(n));

function fmt(m) {
  if (m.unit === 'm') return m.details?.noneWithin ? `none within ${Math.round(m.value / 100) / 10} km` : m.value >= 1000 ? `${Math.round(m.value / 100) / 10} km` : `${Math.round(m.value)} m`;
  if (m.unit === 'count') return String(m.value);
  return `${Math.round(m.value * 10) / 10} ${m.unit}`;
}

export function buildNeighborhoodSection(nb, metrics, weights, flags = []) {
  const score = scoreNeighborhood(metrics, weights);
  const scored = score.categories.filter((c) => c.score != null && c.weight > 0);
  const strengths = scored.filter((c) => c.score >= 65).sort((a, b) => b.score - a.score).slice(0, 3);
  const concerns = scored.filter((c) => c.score < 50).sort((a, b) => a.score - b.score).slice(0, 3);
  const coarse = metrics.filter((m) => ['city', 'district', 'state'].includes(m.granularity));
  const stations = metrics.filter((m) => m.granularity === 'station');
  return {
    neighborhood: { id: String(nb._id), slug: nb.slug, name: nb.name, city: nb.city, state: nb.state, lat: nb.lat, lng: nb.lng },
    overall: r(score.overall), band: score.band, coverage: score.coverage, status: score.status, isDemo: score.dataMix.isDemo,
    categories: score.categories.map((c) => ({ id: c.id, label: c.label, score: r(c.score), band: c.band, weight: c.weight, status: c.status })),
    strengths: strengths.map((c) => ({ id: c.id, text: `${c.label} scores ${r(c.score)} (${c.band.toLowerCase()}). ${c.metrics.slice().sort((a, b) => b.contribution - a.contribution)[0]?.explanation ?? ''}`.trim() })),
    concerns: concerns.map((c) => ({ id: c.id, text: `${c.label} scores ${r(c.score)} (${c.band.toLowerCase()}). ${c.metrics.slice().sort((a, b) => a.score - b.score)[0]?.explanation ?? ''}`.trim() })),
    missing: score.categories.filter((c) => c.score == null).map((c) => ({ id: c.id, text: `${c.label}: ${c.note}` })),
    evidence: metrics.map((m) => ({ key: m.key, label: m.label, category: label(m.category), value: fmt(m), covers: GRANULARITY_LABEL[m.granularity], scope: m.scope, origin: m.origin, source: m.sourceKey, collectedAt: m.collectedAt })),
    caveats: [
      ...(score.dataMix.isDemo ? ['This section uses synthetic demo data. It does not describe the real place and must not inform a decision.'] : []),
      ...coarse.map((m) => `${m.label} is a ${GRANULARITY_LABEL[m.granularity].toLowerCase()} figure and does not describe this neighborhood specifically.`),
      ...stations.map((m) => `${m.label} comes from a monitoring station ${m.distanceKm != null ? `${m.distanceKm} km away` : 'nearby'}; conditions on a given street can differ.`),
      ...flags.filter((f) => f.level === 'warning' && f.code !== 'DEMO_DATA').map((f) => f.message),
    ],
  };
}

export function buildReport({ title, neighborhoods, weights }) {
  const sections = neighborhoods.map(({ nb, metrics, flags }) => buildNeighborhoodSection(nb, metrics, weights, flags));
  const kind = sections.length > 1 ? 'comparison' : 'profile';
  let comparison = null;
  if (kind === 'comparison') {
    const entries = neighborhoods.map(({ nb, metrics }) => ({ id: String(nb._id), score: scoreNeighborhood(metrics, weights) }));
    const c = compareScores(entries);
    const name = Object.fromEntries(neighborhoods.map(({ nb }) => [String(nb._id), nb.name]));
    comparison = {
      summary: c.summary,
      rows: c.categories.map((x) => ({ id: x.id, label: x.label, values: x.values.map((v) => ({ id: v.id, name: name[v.id], score: r(v.score) })), leaders: x.leaders.map((id) => name[id]), comparable: x.comparable })),
      tradeoffs: c.tradeoffs.map((t) => ({ name: name[t.id], strengths: t.strengths.map(label), gaps: t.gaps.map(label) })),
    };
  }
  const sourceKeys = [...new Set(neighborhoods.flatMap(({ metrics }) => metrics.map((m) => m.sourceKey)))];
  return {
    kind,
    content: {
      title, generatedAt: new Date().toISOString(), weights,
      sections, comparison,
      method: `Scores use HomeIntel scoring rules v${SCORING_VERSION}. Each metric is converted to 0–100 by a fixed rule, categories are weighted means of their metrics, and the overall score is the weighted mean of categories with data using the priorities shown. Missing categories are excluded, never estimated.`,
      sourceKeys,
      disclaimer: 'This report summarises public and open data collected by HomeIntel at the time shown. It is not a property valuation, legal, or financial advice. Verify important facts on site and with official records before deciding.',
    },
    containsDemoData: sections.some((s) => s.isDemo),
  };
}
