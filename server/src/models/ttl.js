import { env } from '../config/env.js';
// TTL indexes are skipped only where the engine lacks support (test FerretDB). Expiry is still enforced in code.
export const ttlIndex = (schema, field) => { if (env.DISABLE_TTL_INDEXES !== '1') schema.index({ [field]: 1 }, { expireAfterSeconds: 0 }); };
