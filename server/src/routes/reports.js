import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import * as v from '../validators/saved.js';
import * as svc from '../services/reportService.js';
import { weightsFor } from '../services/neighborhoodService.js';
import { ok, created } from '../utils/respond.js';

const h = (fn) => (req, res, next) => fn(req, res).catch(next);
const r = Router();
// Public, read-only shared view (no auth; capability token).
r.get('/shared/:token', validate({ params: v.tokenParam }), h(async (req, res) => { res.set('Cache-Control', 'no-store'); ok(res, await svc.getShared(req.valid.params.token)); }));

r.use(requireAuth);
r.get('/', validate({ query: v.pageQuery }), h(async (req, res) => { const x = await svc.listReports(req.user, req.valid.query); ok(res, x.items, x.meta); }));
r.post('/', (req, res, next) => (req.body?.includeAi ? aiLimiter(req, res, next) : next()), validate({ body: v.reportBody }),
  h(async (req, res) => created(res, await svc.createReport(req, req.valid.body, weightsFor(req, req.valid.body.weights)))));
r.get('/:id', validate({ params: v.objectIdParam }), h(async (req, res) => ok(res, await svc.getReport(req.user, req.valid.params.id))));
r.patch('/:id', validate({ params: v.objectIdParam, body: v.renameBody }), h(async (req, res) => ok(res, await svc.renameReport(req.user, req.valid.params.id, req.valid.body.title))));
r.post('/:id/share', validate({ params: v.objectIdParam, body: v.shareBody }), h(async (req, res) => ok(res, await svc.setSharing(req, req.valid.params.id, req.valid.body.enabled))));
r.delete('/:id', validate({ params: v.objectIdParam }), h(async (req, res) => { await svc.deleteReport(req, req.valid.params.id); ok(res, { deleted: true }); }));
export default r;
