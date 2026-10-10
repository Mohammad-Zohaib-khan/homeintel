import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const make = (windowMs, limit, code) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code, message: 'Too many requests. Please slow down and try again shortly.' } }),
});

export const globalLimiter = make(60_000, env.isTest ? 100_000 : 300, 'RATE_LIMITED');
export const authLimiter = make(15 * 60_000, env.AUTH_RATE_LIMIT_MAX, 'AUTH_RATE_LIMITED');
export const searchLimiter = make(60_000, env.isTest ? 10_000 : 60, 'SEARCH_RATE_LIMITED');
export const aiLimiter = make(60_000, env.isTest ? 10_000 : 10, 'AI_RATE_LIMITED');
