import { z } from 'zod';
import { env } from '../../config/env.js';
import { safeFetch, ProviderError } from '../../utils/safeFetch.js';
import { cached } from '../../services/cacheService.js';

// data.gov.in (Open Government Data Platform India) resource API.
const recordsSchema = z.object({
  records: z.array(z.record(z.unknown())).default([]),
  field: z.array(z.object({ id: z.string(), name: z.string().optional(), type: z.string().optional() }).passthrough()).optional(),
  total: z.coerce.number().optional(), count: z.coerce.number().optional(), title: z.string().optional(),
}).passthrough();

export async function fetchResource(resourceId, { filters = {}, limit = 1000, offset = 0, ttlMs = 24 * 3600 * 1000 } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(resourceId)) throw new ProviderError('Invalid OGD resource id', { code: 'BAD_RESOURCE' });
  if (!env.DATA_GOV_IN_API_KEY) throw new ProviderError('DATA_GOV_IN_API_KEY is not configured', { code: 'NOT_CONFIGURED' });
  const params = new URLSearchParams({ format: 'json', limit: String(limit), offset: String(offset) });
  for (const [k, v] of Object.entries(filters)) params.set(`filters[${k}]`, v);
  const descriptor = `${resourceId}?${params}`;                 // cache key never contains the API key
  params.set('api-key', env.DATA_GOV_IN_API_KEY);
  const url = `${env.OGD_ENDPOINT.replace(/\/$/, '')}/resource/${resourceId}?${params}`;
  const { body, fetchedAt, cached: wasCached } = await cached('ogd', descriptor, ttlMs, async () => (await safeFetch(url, { timeoutMs: 25000, minIntervalMs: 500 })).json);
  return { ...recordsSchema.parse(body), fetchedAt, cached: wasCached };
}

/** Returns the resource's field list and a few sample records — used by `npm run inspect:ogd` before writing a mapping. */
export async function inspectResource(resourceId) {
  const r = await fetchResource(resourceId, { limit: 5, ttlMs: 3600 * 1000 });
  const fields = r.field?.length ? r.field : Object.keys(r.records[0] ?? {}).map((id) => ({ id }));
  return { title: r.title, total: r.total, fields, sample: r.records.slice(0, 3) };
}
