import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fetchResource } from './ogd.js';
import { normName } from '../../utils/geo.js';
import { ProviderError } from '../../utils/safeFetch.js';

export const SOURCE = {
  key: 'ogd-ncrb', provider: 'NCRB via Open Government Data Platform India', name: 'Crime in India (NCRB) — OGD resources',
  url: 'https://www.data.gov.in/catalog/crime-india-2023', license: 'Government Open Data License – India', attribution: 'National Crime Records Bureau / data.gov.in',
};

export const mappingSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{2,40}$/),
  resourceId: z.string().regex(/^[0-9a-f-]{36}$/),
  title: z.string().max(200),
  year: z.number().int().min(2000).max(2100),
  granularity: z.enum(['city', 'district', 'state']),        // what one row describes — verified by a human from the schema
  areaField: z.string().min(1).max(80),                       // column holding the city/district/state name
  stateField: z.string().max(80).optional(),                  // needed for district granularity to disambiguate
  valueField: z.string().min(1).max(80),
  valueKind: z.enum(['rate_per_lakh', 'count']),
  label: z.string().max(120),
  lowerIsBetter: z.boolean().default(true),
}).strict();
const fileSchema = z.object({ _readme: z.string().optional(), resources: z.array(mappingSchema) });

const here = path.dirname(fileURLToPath(import.meta.url));
export function loadMappings(file = path.join(here, '../config/crimeResources.json')) {
  return fileSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))).resources;
}

const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

/** Downloads a mapped resource, verifies the mapped columns exist, and returns normalized rows. */
export async function loadCrimeTable(m) {
  const first = await fetchResource(m.resourceId, { limit: 1000, ttlMs: 7 * 24 * 3600 * 1000 });
  const fields = new Set([...(first.field ?? []).map((f) => f.id), ...Object.keys(first.records[0] ?? {})]);
  for (const f of [m.areaField, m.valueField, m.stateField].filter(Boolean)) {
    if (!fields.has(f)) throw new ProviderError(`Mapping "${m.id}" references field "${f}" which is not in resource ${m.resourceId}`, { code: 'SCHEMA_MISMATCH' });
  }
  const rows = first.records.map((r) => ({ area: String(r[m.areaField] ?? '').trim(), areaKey: normName(String(r[m.areaField] ?? '')), stateKey: m.stateField ? normName(String(r[m.stateField] ?? '')) : null, value: num(r[m.valueField]) }))
    .filter((r) => r.areaKey && r.value != null && !/^total|^all india/.test(r.areaKey));
  return { rows, fetchedAt: first.fetchedAt };
}

/** Finds the row for a neighborhood at the mapping's granularity and its rank among all areas in the same table. */
export function matchArea(rows, m, nb) {
  const want = normName(m.granularity === 'city' ? nb.city : m.granularity === 'district' ? (nb.district || nb.city) : nb.state);
  const stateKey = normName(nb.state);
  const row = rows.find((r) => r.areaKey === want && (!r.stateKey || r.stateKey === stateKey));
  if (!row) return null;
  const sorted = rows.map((r) => r.value).sort((a, b) => a - b);
  const below = sorted.filter((v) => (m.lowerIsBetter ? v < row.value : v > row.value)).length;
  return { ...row, percentileBetterThan: 1 - below / Math.max(sorted.length - 1, 1), areasInTable: sorted.length };
}
