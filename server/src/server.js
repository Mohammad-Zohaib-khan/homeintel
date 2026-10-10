import mongoose from 'mongoose';
import { setTimeout as sleep } from 'node:timers/promises';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createApp } from './app.js';

async function connect() {
  mongoose.set('sanitizeFilter', true); // blocks NoSQL operator injection via query filters
  mongoose.set('strictQuery', true);
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, autoIndex: true });
      logger.info('MongoDB connected');
      return true;
    } catch (e) {
      logger.error({ attempt, err: { name: e.name } }, 'MongoDB connection failed');
      if (attempt < 5) await sleep(1000 * 2 ** attempt);
    }
  }
  return false;
}

async function main() {
  const ok = await connect();
  if (!ok && env.isProd) { logger.fatal('Giving up on MongoDB; exiting so the platform can restart the service.'); process.exit(1); }
  if (!ok) logger.warn('Starting without a database (development only). Only /api/health will work.');
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`HomeIntel listening on :${env.PORT}`));
  server.headersTimeout = 65_000; server.requestTimeout = 120_000;
  const shutdown = (sig) => { logger.info({ sig }, 'shutting down'); server.close(() => mongoose.disconnect().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10_000).unref(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
  process.on('unhandledRejection', (e) => logger.error({ err: { message: e?.message } }, 'unhandled rejection'));
}
main();
