import { z } from 'zod';
import { CATEGORY_IDS, MAX_COMPARE } from '@homeintel/shared';

export const idParam = z.object({ id: z.string().min(1).max(120).regex(/^[a-z0-9-]+$|^[a-f0-9]{24}$/i, 'Invalid id') }).strict();

const weightObj = z.object(Object.fromEntries(CATEGORY_IDS.map((c) => [c, z.number().int().min(0).max(5)]))).partial().strict();
// Query-string weights: "education:5,healthcare:3"
const weightStr = z.string().max(300).regex(/^([a-z]+:[0-5])(,[a-z]+:[0-5])*$/, 'Invalid weights').transform((s, ctx) => {
  const o = {};
  for (const part of s.split(',')) { const [k, v] = part.split(':'); if (!CATEGORY_IDS.includes(k)) { ctx.addIssue({ code: 'custom', message: `Unknown category ${k}` }); return z.NEVER; } o[k] = Number(v); }
  return o;
});

export const searchQuery = z.object({
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  sort: z.enum(['score', 'name']).default('score'),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  weights: weightStr.optional(),
}).strict();
export const weightsQuery = z.object({ weights: weightStr.optional() }).strict();
export const historyQuery = z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/).default('pm25') }).strict();
export const poiQuery = z.object({ type: z.string().regex(/^[a-z_]{1,40}$/).optional(), limit: z.coerce.number().int().min(1).max(500).default(300) }).strict();
export const compareBody = z.object({
  ids: z.array(z.string().min(1).max(120).regex(/^[a-z0-9-]+$|^[a-f0-9]{24}$/i)).min(2, 'Choose at least two neighborhoods').max(MAX_COMPARE, `Compare at most ${MAX_COMPARE}`),
  weights: weightObj.optional(),
}).strict();
export const lookupQuery = z.object({ q: z.string().trim().min(2).max(80) }).strict();
export const createBody = z.object({ q: z.string().trim().min(2).max(80), ref: z.string().regex(/^osm:(node|way|relation)\/\d{1,15}$/) }).strict();
export const preferencesBody = z.object({ weights: weightObj, presetId: z.string().regex(/^[a-z-]{1,40}$/).nullable().optional() }).strict();
export { weightObj };
