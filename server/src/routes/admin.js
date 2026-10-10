import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as admin from '../services/adminService.js';
import { ok } from '../utils/respond.js';

const h = (fn) => (req, res, next) => fn(req, res).catch(next);
const pg = { page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) };
const oid = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id') }).strict();
const send = (res, r) => (r.items ? ok(res, r.items, r.meta) : ok(res, r));

const r = Router();
// Every admin route: authenticated, admin role, two-factor enabled and an MFA-verified session. No caching.
r.use(requireAuth, requireAdmin, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

r.get('/overview', h(async (_req, res) => ok(res, await admin.overview())));
r.get('/localities', validate({ query: z.object({ q: z.string().trim().max(80).optional(), data: z.enum(['live', 'demo', 'empty']).optional(), attention: z.enum(['1']).optional(), ...pg }).strict() }),
  h(async (req, res) => send(res, await admin.listLocalities(req.valid.query))));
r.post('/localities/refresh-stale', validate({ body: z.object({ olderThanHours: z.number().int().min(1).max(24 * 90).default(24), limit: z.number().int().min(1).max(200).default(50) }).strict() }),
  h(async (req, res) => ok(res, await admin.refreshStale(req, req.valid.body))));
r.post('/localities/:id/refresh', validate({ params: oid }), h(async (req, res) => ok(res, await admin.refreshLocality(req, req.valid.params.id))));
r.get('/ingestion-runs', validate({ query: z.object({ status: z.enum(['running', 'success', 'skipped', 'failed']).optional(), provider: z.enum(['overpass', 'air', 'crime']).optional(), ...pg }).strict() }),
  h(async (req, res) => send(res, await admin.listRuns(req.valid.query))));
r.get('/quality', validate({ query: z.object({ level: z.enum(['warning', 'info']).optional(), code: z.enum(['STALE', 'LOW_CONFIDENCE', 'COARSE_GRANULARITY', 'CONTRADICTION', 'DEMO_DATA', 'PROVIDER_FAILED']).optional(), ...pg, limit: z.coerce.number().int().min(1).max(100).default(50) }).strict() }),
  h(async (req, res) => send(res, await admin.qualityQueue(req.valid.query))));
r.get('/security-events', validate({ query: z.object({ group: z.enum(['auth', 'admin', 'data']).optional(), outcome: z.enum(['success', 'failure']).optional(), action: z.string().regex(/^[a-z_]+\.[a-z_]+$/).max(64).optional(), ...pg, limit: z.coerce.number().int().min(1).max(100).default(50) }).strict() }),
  h(async (req, res) => send(res, await admin.securityEvents(req.valid.query))));
r.get('/users', validate({ query: z.object({ q: z.string().trim().max(254).optional(), role: z.enum(['user', 'admin']).optional(), ...pg }).strict() }),
  h(async (req, res) => send(res, await admin.listUsers(req.valid.query))));
r.post('/users/:id/unlock', validate({ params: oid }), h(async (req, res) => ok(res, await admin.unlockUser(req, req.valid.params.id))));
r.post('/users/:id/sign-out', validate({ params: oid }), h(async (req, res) => ok(res, await admin.signOutUser(req, req.valid.params.id))));
r.patch('/users/:id/role', validate({ params: oid, body: z.object({ role: z.enum(['user', 'admin']) }).strict() }),
  h(async (req, res) => ok(res, await admin.setRole(req, req.valid.params.id, req.valid.body.role))));
export default r;
