import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { verifyWebhook } from '../middleware/webhookSignature.js';
import { validate } from '../middleware/validate.js';
import { Neighborhood } from '../models/Neighborhood.js';
import { enqueueIngestion } from '../ingestion/pipeline.js';
import { ok } from '../utils/respond.js';
import { logger } from '../config/logger.js';

/*
 * Signed webhook for scheduled data refreshes (e.g. a cron job or CI schedule):
 *   { "event": "ingestion.refresh", "neighborhoods": ["kothrud-pune", ...] }   or   { "event": "ingestion.refresh_stale", "olderThanHours": 24 }
 * Only enqueues work for localities that already exist; never accepts URLs or hosts.
 */
const body = z.discriminatedUnion('event', [
  z.object({ event: z.literal('ingestion.refresh'), neighborhoods: z.array(z.string().regex(/^[a-z0-9-]{1,120}$/)).min(1).max(100) }).strict(),
  z.object({ event: z.literal('ingestion.refresh_stale'), olderThanHours: z.number().int().min(1).max(24 * 90).default(24), limit: z.number().int().min(1).max(200).default(50) }).strict(),
]);

const r = Router();
r.post('/ingestion', verifyWebhook, validate({ body }), async (req, res, next) => {
  try {
    const b = req.valid.body;
    let targets;
    if (b.event === 'ingestion.refresh') targets = await Neighborhood.find({ slug: mongoose.trusted({ $in: b.neighborhoods }) }, { _id: 1, slug: 1 });
    else {
      const before = new Date(Date.now() - b.olderThanHours * 3600e3);
      targets = await Neighborhood.find({ $or: [{ 'ingestion.lastRunAt': null }, { 'ingestion.lastRunAt': mongoose.trusted({ $lt: before }) }] }, { _id: 1, slug: 1 }).limit(b.limit);
    }
    const queued = targets.filter((n) => enqueueIngestion(n._id, 'webhook')).map((n) => n.slug);
    logger.info({ event: b.event, queued: queued.length }, 'webhook accepted');
    ok(res, { accepted: true, queued });
  } catch (e) { next(e); }
});
export default r;
