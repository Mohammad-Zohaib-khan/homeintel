/*
 * Admin console service. Operational views only: data health, data quality, security events, account controls.
 * Deliberately exposes NO user-created content (saved notes, reports, research questions) — only counts.
 * Every mutating action is written to the audit log as `admin.*` with the acting admin and the target.
 */
import mongoose from 'mongoose';
import { Neighborhood } from '../models/Neighborhood.js';
import { Metric } from '../models/Metric.js';
import { IngestionRun } from '../models/IngestionRun.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { SavedLocation } from '../models/SavedLocation.js';
import { Report } from '../models/Report.js';
import { AIRun } from '../models/AIRun.js';
import { freshness } from '../scoring/engine.js';
import { qualityFlags } from './neighborhoodService.js';
import { enqueueIngestion, ingestionQueueState, isIngestionActive } from '../ingestion/pipeline.js';
import { revokeAllForUser } from './tokenService.js';
import { audit } from './auditService.js';
import { AppError } from '../utils/AppError.js';

const T = mongoose.trusted;
const DAY = 24 * 3600 * 1000;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const page = (items, { page: p, limit }) => ({ items: items.slice((p - 1) * limit, p * limit), meta: { total: items.length, page: p, limit, pages: Math.max(1, Math.ceil(items.length / limit)) } });

// ---- data health ----------------------------------------------------------------------------------
/** Loads every locality with its metrics once and derives data state, freshness and quality flags. */
async function localityRows(now = new Date()) {
  const [nbs, metrics] = await Promise.all([
    Neighborhood.find({}).sort({ name: 1 }),
    Metric.find({}, { neighborhoodId: 1, key: 1, label: 1, origin: 1, granularity: 1, confidence: 1, sourceKey: 1, collectedAt: 1, observedAt: 1, value: 1, unit: 1, scope: 1, details: 1 }).lean(),
  ]);
  const by = new Map(nbs.map((n) => [String(n._id), []]));
  for (const m of metrics) by.get(String(m.neighborhoodId))?.push(m);
  return nbs.map((n) => {
    const list = by.get(String(n._id));
    const live = list.filter((m) => m.origin !== 'seed').length;
    const seed = list.length - live;
    const stale = list.filter((m) => m.origin !== 'seed' && freshness(m, now) === 'stale').length;
    const providers = Object.fromEntries(['overpass', 'air', 'crime'].map((p) => {
      const r = n.ingestion?.providers?.[p];
      return [p, r ? { status: r.status, at: r.at ?? null, reason: r.reason ?? null } : { status: 'never', at: null, reason: null }];
    }));
    const data = live ? 'live' : seed ? 'demo' : 'empty';
    const failing = Object.values(providers).filter((p) => p.status === 'failed').length;
    return {
      n, list,
      row: {
        id: String(n._id), slug: n.slug, name: n.name, city: n.city, state: n.state, origin: n.origin,
        data, metrics: { live, seed, stale },
        ingestion: { status: isIngestionActive(n._id) ? 'running' : n.ingestion?.status ?? 'idle', lastRunAt: n.ingestion?.lastRunAt ?? null, lastSuccessAt: n.ingestion?.lastSuccessAt ?? null, providers, failing },
        needsAttention: failing > 0 || stale > 0 || data !== 'live',
      },
    };
  });
}

export async function overview() {
  const now = new Date();
  const since = new Date(now - DAY);
  const rows = await localityRows(now);
  const [users, admins, mfaUsers, lockedUsers, runs24, failed24, sec24, reuse7, aiRuns24] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ 'mfa.enabled': true }),
    User.countDocuments({ lockUntil: T({ $gt: now }) }),
    IngestionRun.countDocuments({ startedAt: T({ $gte: since }) }),
    IngestionRun.countDocuments({ startedAt: T({ $gte: since }), status: 'failed' }),
    AuditLog.countDocuments({ createdAt: T({ $gte: since }), outcome: 'failure' }),
    AuditLog.countDocuments({ createdAt: T({ $gte: new Date(now - 7 * DAY) }), action: 'auth.refresh_reuse_detected' }),
    AIRun.countDocuments({ createdAt: T({ $gte: since }) }),
  ]);
  const count = (k) => rows.filter((r) => r.row.data === k).length;
  const recentFailures = await IngestionRun.find({ status: 'failed' }).sort({ startedAt: -1 }).limit(5).lean();
  const nbNames = new Map(rows.map((r) => [String(r.n._id), r.n.name]));
  return {
    localities: { total: rows.length, live: count('live'), demo: count('demo'), empty: count('empty'), failing: rows.filter((r) => r.row.ingestion.failing).length, withStale: rows.filter((r) => r.row.metrics.stale).length },
    ingestion: { runs24h: runs24, failed24h: failed24, queue: ingestionQueueState(), recentFailures: recentFailures.map((r) => ({ id: String(r._id), locality: nbNames.get(String(r.neighborhoodId)) ?? 'Removed locality', provider: r.provider, error: r.error ?? null, at: r.startedAt })) },
    users: { total: users, admins, withMfa: mfaUsers, locked: lockedUsers },
    security: { failures24h: sec24, sessionTheftAlerts7d: reuse7 },
    ai: { runs24h: aiRuns24 },
    generatedAt: now,
  };
}

export async function listLocalities({ q, data, attention, page: p = 1, limit = 25 }) {
  let rows = (await localityRows()).map((r) => r.row);
  if (q) { const re = new RegExp(escapeRe(q), 'i'); rows = rows.filter((r) => re.test(r.name) || re.test(r.city) || re.test(r.state)); }
  if (data) rows = rows.filter((r) => r.data === data);
  if (attention) rows = rows.filter((r) => r.needsAttention);
  return page(rows, { page: p, limit });
}

export async function refreshLocality(req, id) {
  if (!mongoose.isValidObjectId(id) || String(id).length !== 24) throw AppError.notFound();
  const nb = await Neighborhood.findById(id);
  if (!nb) throw AppError.notFound('Locality not found');
  const queued = enqueueIngestion(nb._id, 'admin', { force: true });
  await audit(req, 'admin.locality_refresh', { userId: req.user._id, meta: { slug: nb.slug, queued } });
  return { queued, status: queued ? 'queued' : 'already_running' };
}

export async function refreshStale(req, { olderThanHours = 24, limit = 50 }) {
  const before = new Date(Date.now() - olderThanHours * 3600e3);
  const targets = await Neighborhood.find({ $or: [{ 'ingestion.lastRunAt': null }, { 'ingestion.lastRunAt': T({ $lt: before }) }] }, { _id: 1, slug: 1 }).limit(limit);
  const queued = targets.filter((n) => enqueueIngestion(n._id, 'admin', { force: true })).map((n) => n.slug);
  await audit(req, 'admin.refresh_stale', { userId: req.user._id, meta: { olderThanHours, queued: queued.length } });
  return { queued, considered: targets.length };
}

export async function listRuns({ status, provider, page: p = 1, limit = 25 }) {
  const filter = {};
  if (status) filter.status = status;
  if (provider) filter.provider = provider;
  const [total, runs] = await Promise.all([IngestionRun.countDocuments(filter), IngestionRun.find(filter).sort({ startedAt: -1 }).skip((p - 1) * limit).limit(limit).lean()]);
  const nbs = new Map((await Neighborhood.find({ _id: T({ $in: [...new Set(runs.map((r) => String(r.neighborhoodId)))] }) }, { name: 1, slug: 1 }).lean()).map((n) => [String(n._id), n]));
  return {
    items: runs.map((r) => ({ id: String(r._id), locality: nbs.get(String(r.neighborhoodId))?.name ?? 'Removed locality', slug: nbs.get(String(r.neighborhoodId))?.slug ?? null, provider: r.provider, trigger: r.trigger, status: r.status, counts: r.counts ?? {}, error: r.error ?? null, startedAt: r.startedAt, finishedAt: r.finishedAt ?? null, ms: r.finishedAt ? new Date(r.finishedAt) - new Date(r.startedAt) : null })),
    meta: { total, page: p, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// ---- data quality ---------------------------------------------------------------------------------
export async function qualityQueue({ level, code, page: p = 1, limit = 50 }) {
  const rows = await localityRows();
  let flags = rows.flatMap(({ n, list }) => qualityFlags(n, list).map((f) => ({ ...f, locality: n.name, slug: n.slug, city: n.city })));
  const byCode = flags.reduce((a, f) => ({ ...a, [f.code]: (a[f.code] ?? 0) + 1 }), {});
  if (level) flags = flags.filter((f) => f.level === level);
  if (code) flags = flags.filter((f) => f.code === code);
  flags.sort((a, b) => (a.level === b.level ? a.locality.localeCompare(b.locality) : a.level === 'warning' ? -1 : 1));
  const r = page(flags, { page: p, limit });
  return { ...r, meta: { ...r.meta, byCode } };
}

// ---- security events ------------------------------------------------------------------------------
const ACTION_GROUPS = { auth: /^auth\./, admin: /^admin\./, data: /^(neighborhood|saved|report|ai)\./ };
export async function securityEvents({ group, outcome, action, page: p = 1, limit = 50 }) {
  const filter = {};
  if (action) filter.action = action;
  else if (group) filter.action = T({ $regex: ACTION_GROUPS[group].source });
  if (outcome) filter.outcome = outcome;
  const [total, logs] = await Promise.all([AuditLog.countDocuments(filter), AuditLog.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).lean()]);
  const ids = [...new Set(logs.flatMap((l) => [l.userId, l.meta?.targetUserId]).filter(Boolean).map(String))];
  const emails = new Map((await User.find({ _id: T({ $in: ids }) }, { email: 1 }).lean()).map((u) => [String(u._id), u.email]));
  return {
    items: logs.map((l) => ({
      id: String(l._id), at: l.createdAt, action: l.action, outcome: l.outcome, ipPrefix: l.ipPrefix ?? null, userAgent: l.userAgent ?? null,
      user: l.userId ? { id: String(l.userId), email: emails.get(String(l.userId)) ?? '(deleted account)' } : null,
      target: l.meta?.targetUserId ? { id: String(l.meta.targetUserId), email: emails.get(String(l.meta.targetUserId)) ?? '(deleted account)' } : null,
      detail: summarizeMeta(l.meta),
    })),
    meta: { total, page: p, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}
// Audit meta holds only non-sensitive scalars; render a short, safe summary.
function summarizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const parts = Object.entries(meta).filter(([k, v]) => k !== 'targetUserId' && ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`);
  return parts.length ? parts.join(', ') : null;
}

// ---- users ----------------------------------------------------------------------------------------
const userRow = (u, counts, now = new Date()) => ({
  id: String(u._id), email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt ?? null,
  mfaEnabled: !!u.mfa?.enabled, locked: !!(u.lockUntil && u.lockUntil > now), lockUntil: u.lockUntil ?? null,
  counts: counts ?? { saved: 0, reports: 0, aiRuns: 0 },
});

export async function listUsers({ q, role, page: p = 1, limit = 25 }) {
  const filter = {};
  if (q) filter.email = T({ $regex: `^${escapeRe(q.toLowerCase())}` });
  if (role) filter.role = role;
  const [total, users] = await Promise.all([User.countDocuments(filter), User.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit)]);
  const ids = users.map((u) => u._id);
  const countBy = async (Model) => {
    const docs = await Model.find({ userId: T({ $in: ids }) }, { userId: 1 }).lean();
    return docs.reduce((a, d) => a.set(String(d.userId), (a.get(String(d.userId)) ?? 0) + 1), new Map());
  };
  const [saved, reports, ai] = await Promise.all([countBy(SavedLocation), countBy(Report), countBy(AIRun)]);
  return {
    items: users.map((u) => userRow(u, { saved: saved.get(String(u._id)) ?? 0, reports: reports.get(String(u._id)) ?? 0, aiRuns: ai.get(String(u._id)) ?? 0 })),
    meta: { total, page: p, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function targetUser(id) {
  if (!mongoose.isValidObjectId(id) || String(id).length !== 24) throw AppError.notFound('User not found');
  const u = await User.findById(id);
  if (!u) throw AppError.notFound('User not found');
  return u;
}

export async function unlockUser(req, id) {
  const u = await targetUser(id);
  await User.updateOne({ _id: u._id }, { $set: { failedLogins: 0, lockUntil: null } });
  await audit(req, 'admin.user_unlock', { userId: req.user._id, meta: { targetUserId: String(u._id) } });
  return userRow(await User.findById(u._id));
}

export async function signOutUser(req, id) {
  const u = await targetUser(id);
  await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } });
  await revokeAllForUser(u._id);
  await audit(req, 'admin.user_sign_out', { userId: req.user._id, meta: { targetUserId: String(u._id) } });
  return userRow(await User.findById(u._id));
}

/**
 * Role changes. Guards: never your own role (no accidental lock-out), never remove the last admin, and only
 * accounts that already have two-factor sign-in can become admins. The target's sessions are revoked so the
 * new role takes effect cleanly.
 */
export async function setRole(req, id, role) {
  const u = await targetUser(id);
  if (String(u._id) === String(req.user._id)) throw new AppError(409, 'CANNOT_CHANGE_OWN_ROLE', 'You can’t change your own role. Ask another admin.');
  if (u.role === role) return userRow(u);
  if (role === 'admin' && !u.mfa?.enabled) throw new AppError(409, 'TARGET_NEEDS_MFA', 'This person must turn on two-factor sign-in before they can become an admin.');
  if (u.role === 'admin' && role !== 'admin') {
    const admins = await User.countDocuments({ role: 'admin' });
    if (admins <= 1) throw new AppError(409, 'LAST_ADMIN', 'This is the only admin. Make someone else an admin first.');
  }
  await User.updateOne({ _id: u._id }, { $set: { role }, $inc: { tokenVersion: 1 } });
  await revokeAllForUser(u._id);
  await audit(req, 'admin.user_role', { userId: req.user._id, meta: { targetUserId: String(u._id), from: u.role, to: role } });
  return userRow(await User.findById(u._id));
}
