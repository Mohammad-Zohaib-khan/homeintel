import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { csvUpload } from '../middleware/upload.js';
import { authLimiter } from '../middleware/rateLimit.js';
import * as v from '../validators/saved.js';
import * as svc from '../services/savedService.js';
import { weightsFor } from '../services/neighborhoodService.js';
import { ok, created } from '../utils/respond.js';

const h = (fn) => (req, res, next) => fn(req, res).catch(next);
const r = Router();
r.use(requireAuth);
r.get('/', validate({ query: v.pageQuery }), h(async (req, res) => { const x = await svc.listSaved(req.user, req.valid.query, weightsFor(req)); ok(res, x.items, x.meta); }));
r.get('/status', validate({ query: v.statusQuery }), h(async (req, res) => ok(res, await svc.savedStatus(req.user, req.valid.query.neighborhoodId))));
r.get('/export.csv', h(async (req, res) => {
  const csv = await svc.exportSavedCsv(req.user, weightsFor(req));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="homeintel-saved.csv"', 'Cache-Control': 'no-store' }).send(csv);
}));
r.post('/', validate({ body: v.saveBody }), h(async (req, res) => { const x = await svc.saveLocation(req, req.valid.body); (x.created ? created : ok)(res, x.item); }));
r.post('/import', authLimiter, csvUpload, h(async (req, res) => ok(res, await svc.importShortlist(req, req.file.buffer))));
r.patch('/:id', validate({ params: v.objectIdParam, body: v.updateSavedBody }), h(async (req, res) => ok(res, await svc.updateSaved(req.user, req.valid.params.id, req.valid.body))));
r.delete('/:id', validate({ params: v.objectIdParam }), h(async (req, res) => { await svc.deleteSaved(req, req.valid.params.id); ok(res, { deleted: true }); }));
export default r;
