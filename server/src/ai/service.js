import mongoose from 'mongoose';
import { AIRun } from '../models/AIRun.js';
import { findNeighborhood } from '../services/neighborhoodService.js';
import { compareScores, scoreNeighborhood } from '../scoring/engine.js';
import { Metric } from '../models/Metric.js';
import { findOwned } from '../services/ownership.js';
import { setNarrativeHook } from '../services/reportService.js';
import { runAgent, runView, quotaFor } from './agents.js';
import { getProvider } from './providers/index.js';
import { audit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

export async function status(user) {
  const p = getProvider();
  return { available: p.available, provider: p.available ? p.name : null, model: p.available ? p.model : null, quota: user && p.available ? await quotaFor(user) : null };
}

export async function analyze(req, { agent, neighborhoodIds, question }, weights) {
  if (agent === 'comparison' && neighborhoodIds.length < 2) throw AppError.badRequest('A comparison needs at least two neighborhoods');
  if (agent === 'research' && neighborhoodIds.length !== 1) throw AppError.badRequest('Research works on one neighborhood at a time');
  const nbs = await Promise.all(neighborhoodIds.map(findNeighborhood));
  const entries = [];
  for (const nb of nbs) { const metrics = await Metric.find({ neighborhoodId: nb._id }).lean(); entries.push({ nb, metrics, score: scoreNeighborhood(metrics, weights) }); }
  let extraContext;
  if (agent === 'comparison') {
    const c = compareScores(entries.map((e) => ({ id: String(e.nb._id), score: e.score })));
    const name = Object.fromEntries(nbs.map((n) => [String(n._id), n.name]));
    extraContext = { leadersByCategory: c.categories.filter((x) => x.leaders.length).map((x) => ({ category: x.label, leaders: x.leaders.map((i) => name[i]), spread: x.spread })), overall: c.overall.map((o) => ({ name: name[o.id], overall: o.overall, coverage: o.coverage })) };
  }
  const run = await runAgent(req.user, agent, { entries, weights, question, extraContext });
  await audit(req, 'ai.analyze', { userId: req.user._id, outcome: run.status === 'succeeded' ? 'success' : 'failure', meta: { agent } });
  return runView(run);
}

export const getRun = async (user, id) => runView(await findOwned(AIRun, user, id));
export async function listRuns(user, limit = 20) {
  const rows = await AIRun.find({ userId: user._id, agent: mongoose.trusted({ $in: ['research', 'comparison'] }) }).sort({ createdAt: -1 }).limit(limit);
  return rows.map((r) => { const v = runView(r); return { ...v, output: v.output ? { paragraphs: v.output.paragraphs.slice(0, 1) } : null }; });
}

// Report narrative: grounded in the report's own snapshot evidence.
setNarrativeHook(async (req, rep, content) => {
  if (!getProvider().available) return { status: 'unavailable', narrative: null };
  const nbs = await Promise.all(content.sections.map((s) => findNeighborhood(s.neighborhood.id)));
  const run = await runAgent(req.user, 'report', { entries: nbs.map((nb) => ({ nb })), weights: content.weights, reportId: rep._id,
    extraContext: { caveats: content.sections.flatMap((s) => s.caveats).slice(0, 12), comparisonSummary: content.comparison?.summary ?? null } });
  if (run.status !== 'succeeded') return { status: 'failed', runId: run._id, narrative: null };
  const out = JSON.parse(run.output);
  return { status: 'included', runId: run._id, narrative: { provider: `${run.provider}${run.model ? `, ${run.model}` : ''}`, paragraphs: out.paragraphs, uncertainties: out.uncertainties } };
});
