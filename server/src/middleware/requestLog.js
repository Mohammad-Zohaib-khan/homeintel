import crypto from 'node:crypto';
import { logger } from '../config/logger.js';

// Structured access log. Query strings are never logged, and capability tokens in paths are masked.
const mask = (p) => p.replace(/\/(shared|share\/reports|r)\/[A-Za-z0-9_-]{16,}/g, '/$1/[TOKEN]');
export function requestLog(req, res, next) {
  const id = /^[A-Za-z0-9-]{8,64}$/.test(req.get('x-request-id') || '') ? req.get('x-request-id') : crypto.randomUUID();
  res.set('X-Request-Id', id);
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'info' : 'debug';
    logger[level]({ reqId: id, method: req.method, path: mask(req.baseUrl + req.path), status: res.statusCode, ms: Math.round(ms), user: req.user ? String(req.user._id) : undefined }, 'request');
  });
  next();
}
