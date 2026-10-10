import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { weightObj } from '../validators/neighborhood.js';
import { objectIdParam } from '../validators/saved.js';
import * as ai from '../ai/service.js';
import { weightsFor } from '../services/neighborhoodService.js';
import { ok, created } from '../utils/respond.js';

const nbRef = z.string().min(1).max(120).regex(/^[a-z0-9-]+$|^[a-f0-9]{24}$/i);
const analyzeBody = z.object({
  agent: z.enum(['research', 'comparison']),
  neighborhoodIds: z.array(nbRef).min(1).max(4),
  question: z.string().trim().min(3).max(300).optional(),
  weights: weightObj.optional(),
}).strict();

const h = (fn) => (req, res, next) => fn(req, res).catch(next);
const r = Router();
r.get('/status', optionalAuth, h(async (req, res) => ok(res, await ai.status(req.user))));
r.use(requireAuth);
r.post('/analyze', aiLimiter, validate({ body: analyzeBody }), h(async (req, res) => created(res, await ai.analyze(req, req.valid.body, weightsFor(req, req.valid.body.weights)))));
r.get('/runs', h(async (req, res) => ok(res, await ai.listRuns(req.user))));
r.get('/runs/:id', validate({ params: objectIdParam }), h(async (req, res) => ok(res, await ai.getRun(req.user, req.valid.params.id))));
export default r;
