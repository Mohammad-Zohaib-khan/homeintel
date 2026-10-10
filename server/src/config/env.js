import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const hex = (n) => z.string().regex(new RegExp(`^[0-9a-fA-F]{${n}}$`), `must be ${n} hex chars`);
const isProd = process.env.NODE_ENV === 'production';
const emptyToUndef = (v) => (v === '' ? undefined : v);
const opt = (s) => z.preprocess(emptyToUndef, s.optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/homeintel'),
  JWT_ACCESS_SECRET: opt(z.string().min(32)),
  MFA_ENCRYPTION_KEY: opt(hex(64)),
  COOKIE_DOMAIN: opt(z.string()),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  DISABLE_TTL_INDEXES: z.enum(['0', '1']).default('0'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  OVERPASS_ENDPOINT: z.string().url().default('https://overpass-api.de/api/interpreter'),
  NOMINATIM_ENDPOINT: z.string().url().default('https://nominatim.openstreetmap.org'),
  OPENAQ_ENDPOINT: z.string().url().default('https://api.openaq.org'),
  OGD_ENDPOINT: z.string().url().default('https://api.data.gov.in'),
  CPCB_AQI_RESOURCE_ID: z.string().regex(/^[0-9a-f-]{36}$/).default('3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69'),
  CPCB_VALUE_KIND: z.enum(['subindex', 'concentration']).default('subindex'),
  CONTACT_EMAIL: opt(z.string().email()),
  ONDEMAND_INGESTION: z.enum(['0', '1']).default('1'),
  OPENAQ_API_KEY: opt(z.string()),
  DATA_GOV_IN_API_KEY: opt(z.string()),
  AI_PROVIDER: z.enum(['none', 'anthropic', 'openai', 'gemini', 'mock']).default('none'),
  AI_MODEL: opt(z.string().max(100)),
  AI_DAILY_LIMIT: z.coerce.number().int().positive().default(30),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  ANTHROPIC_API_KEY: opt(z.string()),
  OPENAI_API_KEY: opt(z.string()),
  GEMINI_API_KEY: opt(z.string()),
  WEBHOOK_SIGNING_SECRET: opt(z.string().min(32)),
  WEBHOOK_SIGNING_SECRET_PREVIOUS: opt(z.string().min(32)),
  JWT_ACCESS_SECRET_PREVIOUS: opt(z.string().min(32)),
  MFA_ENCRYPTION_KEY_PREVIOUS: opt(hex(64)),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  SERVE_CLIENT: z.enum(['0', '1']).default('0'),
  API_PUBLIC_ORIGIN: opt(z.string().url()),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Variable names only — never values.
  const names = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  console.error(`Invalid environment configuration:\n  ${names}`);
  process.exit(1);
}
const e = parsed.data;

if (e.AI_PROVIDER === 'mock' && e.NODE_ENV !== 'test') {
  console.error('AI_PROVIDER=mock is only permitted when NODE_ENV=test');
  process.exit(1);
}
if (isProd) {
  const missing = ['JWT_ACCESS_SECRET', 'MFA_ENCRYPTION_KEY'].filter((k) => !e[k]);
  if (missing.length) {
    console.error(`Missing required production secrets: ${missing.join(', ')}`);
    process.exit(1);
  }
  const insecureOrigins = e.CLIENT_ORIGINS.split(',').map((x) => x.trim()).filter((o) => o && !o.startsWith('https://'));
  if (insecureOrigins.length) {
    console.error(`CLIENT_ORIGINS must use https in production: ${insecureOrigins.join(', ')}`);
    process.exit(1);
  }
}
// Development: generated secrets are persisted to server/.dev-secrets.json (git-ignored, owner-only) so the server,
// the admin CLI and restarts all share one key set — otherwise sessions reset on every restart and two-factor secrets
// encrypted by one process can't be decrypted by another. Tests use throwaway keys. Production must set real values.
const DEV_SECRETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.dev-secrets.json');
function devSecrets() {
  if (isProd || e.NODE_ENV === 'test') return { JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('hex'), MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex') };
  try {
    const saved = JSON.parse(fs.readFileSync(DEV_SECRETS, 'utf8'));
    if (/^[0-9a-f]{96}$/.test(saved.JWT_ACCESS_SECRET) && /^[0-9a-f]{64}$/.test(saved.MFA_ENCRYPTION_KEY)) return saved;
  } catch { /* create below */ }
  const fresh = { JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('hex'), MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex') };
  try { fs.writeFileSync(DEV_SECRETS, JSON.stringify(fresh, null, 2), { mode: 0o600, flag: 'wx' }); }
  catch (err) { if (err.code === 'EEXIST') return JSON.parse(fs.readFileSync(DEV_SECRETS, 'utf8')); }
  return fresh;
}
const fallback = (!e.JWT_ACCESS_SECRET || !e.MFA_ENCRYPTION_KEY) ? devSecrets() : {};

export const env = Object.freeze({
  ...e,
  isProd,
  isTest: e.NODE_ENV === 'test',
  clientOrigins: e.CLIENT_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  JWT_ACCESS_SECRET: e.JWT_ACCESS_SECRET ?? fallback.JWT_ACCESS_SECRET,
  MFA_ENCRYPTION_KEY: e.MFA_ENCRYPTION_KEY ?? fallback.MFA_ENCRYPTION_KEY,
});
