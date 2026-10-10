import mongoose from 'mongoose';
import { Report } from '../models/Report.js';
import { Metric } from '../models/Metric.js';
import { Source } from '../models/Source.js';
import { SCORING_VERSION } from '../scoring/engine.js';
import { findNeighborhood, quality } from './neighborhoodService.js';
import { buildReport } from './reportBuilder.js';
import { findOwned, ownedFilter } from './ownership.js';
import { AppError } from '../utils/AppError.js';
import { randomToken } from '../utils/crypto.js';
import { audit } from './auditService.js';

// Phase 8 attaches an AI narrative through this hook; reports are complete without it.
let narrativeHook = null;
export const setNarrativeHook = (fn) => { narrativeHook = fn; };

const view = (rep, { owner = true } = {}) => {
  const content = JSON.parse(rep.content);
  return {
    id: owner ? String(rep._id) : undefined, title: rep.title, kind: rep.kind, createdAt: rep.createdAt, scoringVersion: rep.scoringVersion,
    containsDemoData: rep.containsDemoData, ai: { status: rep.ai?.status ?? 'not_requested' },
    share: owner ? { enabled: !!rep.share?.enabled, token: rep.share?.enabled ? rep.share.token : null, sharedAt: rep.share?.sharedAt ?? null } : undefined,
    content: owner ? content : { ...content, weights: content.weights }, // public view never includes user identity (none is stored in content)
  };
};
const listView = (rep) => {
  const c = JSON.parse(rep.content);
  return { id: String(rep._id), title: rep.title, kind: rep.kind, createdAt: rep.createdAt, containsDemoData: rep.containsDemoData, ai: { status: rep.ai?.status }, shared: !!rep.share?.enabled,
    neighborhoods: c.sections.map((s) => ({ name: s.neighborhood.name, city: s.neighborhood.city, overall: s.overall })) };
};

export async function createReport(req, { neighborhoodIds, title, includeAi = false }, weights) {
  const nbs = await Promise.all(neighborhoodIds.map(findNeighborhood));
  if (new Set(nbs.map((n) => String(n._id))).size !== nbs.length) throw AppError.badRequest('Choose different neighborhoods');
  if (await Report.countDocuments({ userId: req.user._id }) >= 200) throw AppError.badRequest('You can keep up to 200 reports. Delete some first.');
  const neighborhoods = [];
  for (const nb of nbs) neighborhoods.push({ nb, metrics: await Metric.find({ neighborhoodId: nb._id }).lean(), flags: (await quality(nb.slug)).flags });
  const t = title || (nbs.length === 1 ? `${nbs[0].name}, ${nbs[0].city}` : nbs.map((n) => n.name).join(' vs '));
  const built = buildReport({ title: t, neighborhoods, weights });
  const sources = await Source.find({ key: mongoose.trusted({ $in: built.content.sourceKeys }) }).lean();
  built.content.sources = sources.map((s) => ({ key: s.key, name: s.name, provider: s.provider, url: s.url ?? null, license: s.license, attribution: s.attribution, isDemo: !!s.isDemo }));

  const rep = await Report.create({
    userId: req.user._id, title: t.slice(0, 140), kind: built.kind, neighborhoodIds: nbs.map((n) => n._id), weights,
    content: JSON.stringify(built.content), scoringVersion: SCORING_VERSION, containsDemoData: built.containsDemoData,
    ai: { status: includeAi ? 'pending' : 'not_requested' },
  });
  await audit(req, 'report.create', { userId: req.user._id, meta: { kind: built.kind, n: nbs.length } });

  if (includeAi) {
    if (!narrativeHook) { await Report.updateOne({ _id: rep._id }, { $set: { 'ai.status': 'unavailable' } }); }
    else {
      try {
        const r = await narrativeHook(req, rep, built.content);
        const content = { ...built.content, aiNarrative: r.narrative };
        await Report.updateOne({ _id: rep._id }, { $set: { content: JSON.stringify(content), 'ai.status': r.status, 'ai.runId': r.runId ?? null } });
      } catch { await Report.updateOne({ _id: rep._id }, { $set: { 'ai.status': 'failed' } }); }
    }
  }
  return view(await Report.findById(rep._id));
}

export async function listReports(user, { page, limit }) {
  const [total, rows] = await Promise.all([Report.countDocuments({ userId: user._id }), Report.find({ userId: user._id }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)]);
  return { items: rows.map(listView), meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export const getReport = async (user, id) => view(await findOwned(Report, user, id));

export async function renameReport(user, id, title) {
  const r = await Report.updateOne(ownedFilter(user, id), { $set: { title } });
  if (!r.matchedCount) throw AppError.notFound();
  return view(await findOwned(Report, user, id));
}

export async function deleteReport(req, id) {
  const r = await Report.deleteOne(ownedFilter(req.user, id));
  if (!r.deletedCount) throw AppError.notFound();
  await audit(req, 'report.delete', { userId: req.user._id });
}

// Sharing creates an unguessable read-only link (192-bit token). Turning sharing off revokes it; re-enabling issues a new token.
export async function setSharing(req, id, enabled) {
  const rep = await findOwned(Report, req.user, id);
  const update = enabled
    ? { $set: { 'share.enabled': true, 'share.token': rep.share?.enabled && rep.share.token ? rep.share.token : randomToken(24), 'share.sharedAt': new Date() } }
    : { $set: { 'share.enabled': false, 'share.sharedAt': null }, $unset: { 'share.token': '' } };
  await Report.updateOne(ownedFilter(req.user, id), update);
  await audit(req, enabled ? 'report.share' : 'report.unshare', { userId: req.user._id });
  return view(await findOwned(Report, req.user, id));
}

export async function getShared(token) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw AppError.notFound();
  const rep = await Report.findOne({ 'share.token': token, 'share.enabled': true });
  if (!rep) throw AppError.notFound();
  return view(rep, { owner: false });
}
