import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as v from '../validators/saved.js';
import * as svc from '../services/savedService.js';
import { ok, created } from '../utils/respond.js';

const h = (fn) => (req, res, next) => fn(req, res).catch(next);
const r = Router();
r.use(requireAuth);
r.get('/', h(async (req, res) => ok(res, await svc.listComparisons(req.user))));
r.post('/', validate({ body: v.comparisonBody }), h(async (req, res) => created(res, await svc.saveComparison(req, req.valid.body))));
r.delete('/:id', validate({ params: v.objectIdParam }), h(async (req, res) => { await svc.deleteComparison(req.user, req.valid.params.id); ok(res, { deleted: true }); }));
export default r;
