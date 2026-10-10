import mongoose from 'mongoose';
import { SavedLocation } from '../models/SavedLocation.js';
import { Comparison } from '../models/Comparison.js';
import { Neighborhood } from '../models/Neighborhood.js';
import { Metric } from '../models/Metric.js';
import { scoreNeighborhood } from '../scoring/engine.js';
import { findNeighborhood } from './neighborhoodService.js';
import { findOwned, ownedFilter } from './ownership.js';
import { AppError } from '../utils/AppError.js';
import { normName } from '../utils/geo.js';
import { audit } from './auditService.js';

const cleanTags = (tags = []) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);

async function scoredSummaries(nids, weights) {
  const [nbs, metrics] = await Promise.all([Neighborhood.find({ _id: mongoose.trusted({ $in: nids }) }), Metric.find({ neighborhoodId: mongoose.trusted({ $in: nids }) }).lean()]);
  const by = new Map(nbs.map((n) => [String(n._id), { n, m: [] }]));
  for (const m of metrics) by.get(String(m.neighborhoodId))?.m.push(m);
  const out = new Map();
  for (const [id, { n, m }] of by) { const s = scoreNeighborhood(m, weights); out.set(id, { ...n.toSummary(), score: { overall: s.overall, band: s.band, coverage: s.coverage, status: s.status, dataMix: s.dataMix } }); }
  return out;
}

const savedView = (s, nb) => ({ id: String(s._id), note: s.note, tags: s.tags, createdAt: s.createdAt, updatedAt: s.updatedAt, neighborhood: nb ?? null });

export async function saveLocation(req, { neighborhoodId, note = '', tags = [] }) {
  const nb = await findNeighborhood(neighborhoodId);
  const existing = await SavedLocation.findOne({ userId: req.user._id, neighborhoodId: nb._id });
  if (existing) return { created: false, item: savedView(existing, nb.toSummary()) };
  const count = await SavedLocation.countDocuments({ userId: req.user._id });
  if (count >= 200) throw AppError.badRequest('You can save up to 200 neighborhoods. Remove some first.');
  const s = await SavedLocation.create({ userId: req.user._id, neighborhoodId: nb._id, note, tags: cleanTags(tags) });
  await audit(req, 'saved.create', { userId: req.user._id, meta: { neighborhood: nb.slug } });
  return { created: true, item: savedView(s, nb.toSummary()) };
}

export async function listSaved(user, { page, limit, tag }, weights) {
  const filter = { userId: user._id };
  if (tag) filter.tags = tag;
  const [total, rows] = await Promise.all([SavedLocation.countDocuments(filter), SavedLocation.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)]);
  const sums = await scoredSummaries(rows.map((r) => r.neighborhoodId), weights);
  const tagRows = await SavedLocation.find({ userId: user._id }, { tags: 1 }).lean();
  const tags = [...new Set(tagRows.flatMap((r) => r.tags))].sort();
  return { items: rows.map((r) => savedView(r, sums.get(String(r.neighborhoodId)))), meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), tags } };
}

export async function savedStatus(user, neighborhoodId) {
  const nb = await findNeighborhood(neighborhoodId);
  const s = await SavedLocation.findOne({ userId: user._id, neighborhoodId: nb._id });
  return { saved: !!s, id: s ? String(s._id) : null };
}

export async function updateSaved(user, id, { note, tags }) {
  const set = {};
  if (note !== undefined) set.note = note;
  if (tags !== undefined) set.tags = cleanTags(tags);
  const r = await SavedLocation.updateOne(ownedFilter(user, id), { $set: set }, { runValidators: true });
  if (!r.matchedCount) throw AppError.notFound();
  const s = await findOwned(SavedLocation, user, id);
  return savedView(s, (await Neighborhood.findById(s.neighborhoodId))?.toSummary());
}

export async function deleteSaved(req, id) {
  const r = await SavedLocation.deleteOne(ownedFilter(req.user, id));
  if (!r.deletedCount) throw AppError.notFound();
  await audit(req, 'saved.delete', { userId: req.user._id });
}

// CSV export with spreadsheet formula-injection neutralised.
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function exportSavedCsv(user, weights) {
  const rows = await SavedLocation.find({ userId: user._id }).sort({ createdAt: -1 }).limit(200);
  const sums = await scoredSummaries(rows.map((r) => r.neighborhoodId), weights);
  const lines = [['name', 'city', 'state', 'overall_score', 'data', 'tags', 'note', 'saved_at'].join(',')];
  for (const r of rows) {
    const n = sums.get(String(r.neighborhoodId)); if (!n) continue;
    lines.push([n.name, n.city, n.state, n.score.overall ?? '', n.score.dataMix.isDemo ? 'demo' : 'source-backed', r.tags.join(' '), r.note, r.createdAt.toISOString()].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/*
 * Secure CSV shortlist import. The file is held in memory only (never written to disk), size- and line-capped,
 * required to be valid UTF-8 text without NUL bytes, and parsed as plain data. Rows are matched only against
 * localities already in HomeIntel — an upload can never trigger outbound requests.
 */
export function parseShortlistCsv(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw AppError.badRequest('The file is empty.');
  if (buf.includes(0)) throw new AppError(415, 'UNSUPPORTED_FILE', 'That file is not plain text. Upload a .csv file.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { throw new AppError(415, 'UNSUPPORTED_FILE', 'The file must be UTF-8 encoded text.'); }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 101) throw AppError.badRequest('Import up to 100 rows at a time.');
  const rows = [];
  for (const [i, line] of lines.entries()) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, '').replace(/^'/, '').slice(0, 80));
    if (i === 0 && /^name$/i.test(cells[0])) continue; // header
    if (!cells[0]) continue;
    rows.push({ line: i + 1, name: cells[0], city: cells[1] || null });
  }
  if (!rows.length) throw AppError.badRequest('No rows found. Use one locality per line: name,city');
  return rows;
}

export async function importShortlist(req, buf) {
  const rows = parseShortlistCsv(buf);
  const result = { saved: [], alreadySaved: [], unmatched: [], ambiguous: [] };
  for (const row of rows) {
    const key = normName(row.name);
    if (!key) { result.unmatched.push(row); continue; }
    const filter = { searchKey: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`) };
    if (row.city) filter.city = new RegExp(`^${normName(row.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const matches = await Neighborhood.find(filter).limit(3);
    if (!matches.length) { result.unmatched.push(row); continue; }
    if (matches.length > 1) { result.ambiguous.push({ ...row, candidates: matches.map((m) => `${m.name}, ${m.city}`) }); continue; }
    const r = await saveLocation(req, { neighborhoodId: matches[0].slug, tags: ['imported'] });
    (r.created ? result.saved : result.alreadySaved).push({ ...row, slug: matches[0].slug, matched: `${matches[0].name}, ${matches[0].city}` });
  }
  await audit(req, 'saved.import', { userId: req.user._id, meta: { rows: rows.length, saved: result.saved.length } });
  return result;
}

// ---- comparisons --------------------------------------------------------------------------------
export async function saveComparison(req, { name, neighborhoodIds, weights }) {
  const nbs = await Promise.all(neighborhoodIds.map(findNeighborhood));
  if (new Set(nbs.map((n) => String(n._id))).size !== nbs.length) throw AppError.badRequest('Choose different neighborhoods');
  if (await Comparison.countDocuments({ userId: req.user._id }) >= 100) throw AppError.badRequest('You can keep up to 100 saved comparisons.');
  const c = await Comparison.create({ userId: req.user._id, name, neighborhoodIds: nbs.map((n) => n._id), weights: weights ?? null });
  return comparisonView(c, nbs.map((n) => n.toSummary()));
}
const comparisonView = (c, nbs) => ({ id: String(c._id), name: c.name, weights: c.weights, createdAt: c.createdAt, neighborhoods: nbs });
export async function listComparisons(user) {
  const rows = await Comparison.find({ userId: user._id }).sort({ createdAt: -1 }).limit(100);
  const ids = [...new Set(rows.flatMap((r) => r.neighborhoodIds.map(String)))];
  const nbs = new Map((await Neighborhood.find({ _id: mongoose.trusted({ $in: ids }) })).map((n) => [String(n._id), n.toSummary()]));
  return rows.map((r) => comparisonView(r, r.neighborhoodIds.map((id) => nbs.get(String(id))).filter(Boolean)));
}
export async function deleteComparison(user, id) {
  const r = await Comparison.deleteOne(ownedFilter(user, id));
  if (!r.deletedCount) throw AppError.notFound();
}
