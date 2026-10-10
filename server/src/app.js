import './config/outbound.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLog } from './middleware/requestLog.js';
import { normalizeForwardedFor } from './middleware/forwardedFor.js';
import apiRoutes from './routes/index.js';
import shareRoutes from './routes/share.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, '../../client/dist');

// CSP for the single-page app when this server hosts it (SERVE_CLIENT=1). Mirrors client/vercel.json.
export const SPA_CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],            // inline style attributes from React/Leaflet/Recharts; no inline <script>
  imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"], objectSrc: ["'none'"],
  upgradeInsecureRequests: env.isProd ? [] : null,
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.isProd ? env.TRUST_PROXY : false);

  app.use(normalizeForwardedFor);
  app.use(requestLog);
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xFrameOptions: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use((_req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'); next(); });

  app.use('/api', cors({
    origin(origin, cb) {
      if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS_ORIGIN_DENIED'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After', 'X-Request-Id'],
    maxAge: 600,
  }));

  app.use('/api', globalLimiter);
  // Keep the exact raw body for webhook signature verification only.
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf.toString('utf8'); } }));
  app.use(cookieParser());
  app.use(hpp());

  app.use('/api', apiRoutes);
  app.use('/api', notFoundHandler);
  app.use('/share', shareRoutes);

  if (env.SERVE_CLIENT === '1' && fs.existsSync(CLIENT_DIST)) {
    const spaHeaders = helmet({ contentSecurityPolicy: { useDefaults: false, directives: SPA_CSP }, hsts: false, xFrameOptions: { action: 'deny' }, crossOriginResourcePolicy: { policy: 'same-origin' } });
    app.use(spaHeaders);
    app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y', index: false }));
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|share\/).*/, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
