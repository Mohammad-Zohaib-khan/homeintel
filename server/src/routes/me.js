import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { preferencesBody } from '../validators/neighborhood.js';
import * as prefs from '../services/preferenceService.js';
import { ok } from '../utils/respond.js';

const r = Router();
r.use(requireAuth);
r.get('/preferences', (req, res) => ok(res, prefs.get(req.user)));
r.put('/preferences', validate({ body: preferencesBody }), (req, res, next) => prefs.set(req.user, req.valid.body).then((d) => ok(res, d)).catch(next));
r.delete('/preferences', (req, res, next) => prefs.reset(req.user).then((d) => ok(res, d)).catch(next));
export default r;
