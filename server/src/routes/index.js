import { Router } from 'express';
import authRoutes from './auth.js';
import neighborhoodRoutes from './neighborhoods.js';
import meRoutes from './me.js';
import savedRoutes from './saved.js';
import comparisonRoutes from './comparisons.js';
import reportRoutes from './reports.js';
import aiRoutes from './ai.js';
import webhookRoutes from './webhooks.js';
import adminRoutes from './admin.js';
import { csrfProtection } from '../middleware/csrf.js';
import { ok } from '../utils/respond.js';

const api = Router();
api.get('/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));
api.use(csrfProtection);            // every state-changing /api request needs a valid CSRF token (webhooks exempt)
api.use('/auth', authRoutes);
api.use('/neighborhoods', neighborhoodRoutes);
api.use('/me', meRoutes);
api.use('/saved-neighborhoods', savedRoutes);
api.use('/comparisons', comparisonRoutes);
api.use('/reports', reportRoutes);
api.use('/ai', aiRoutes);
api.use('/webhooks', webhookRoutes);
api.use('/admin', adminRoutes);   // exempt from CSRF; authenticated by HMAC signature
export default api;
