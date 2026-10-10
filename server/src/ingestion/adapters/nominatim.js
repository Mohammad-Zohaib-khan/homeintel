import { z } from 'zod';
import { env } from '../../config/env.js';
import { safeFetch } from '../../utils/safeFetch.js';
import { cached } from '../../services/cacheService.js';

export const SOURCE = {
  key: 'osm-nominatim', provider: 'OpenStreetMap', name: 'Nominatim geocoder (OpenStreetMap)',
  url: 'https://nominatim.org/release-docs/latest/api/Search/', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors',
};

const result = z.object({
  osm_type: z.string(), osm_id: z.coerce.number(), lat: z.coerce.number(), lon: z.coerce.number(),
  name: z.string().optional().default(''), display_name: z.string(), addresstype: z.string().optional(),
  boundingbox: z.array(z.coerce.number()).length(4).optional(),
  address: z.record(z.string()).optional().default({}),
}).passthrough();

const ACCEPTED = new Set(['suburb', 'neighbourhood', 'quarter', 'city_district', 'residential', 'village', 'town', 'city', 'hamlet', 'borough', 'locality', 'county']);

/** Geocodes a free-text locality within India. Returns normalized candidates (never throws on zero results). */
export async function geocode(q) {
  const params = new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'in', addressdetails: '1', limit: '5', 'accept-language': 'en' });
  if (env.CONTACT_EMAIL) params.set('email', env.CONTACT_EMAIL);
  const url = `${env.NOMINATIM_ENDPOINT.replace(/\/$/, '')}/search?${params}`;
  const { body } = await cached('nominatim', `search|${q.toLowerCase()}`, 30 * 24 * 3600 * 1000, async () => (await safeFetch(url, { minIntervalMs: 1100, timeoutMs: 12000 })).json);
  const list = z.array(z.unknown()).parse(body);
  const out = [];
  for (const raw of list) {
    const r = result.safeParse(raw);
    if (!r.success) continue;
    const a = r.data.address;
    if (r.data.addresstype && !ACCEPTED.has(r.data.addresstype)) continue;
    const name = r.data.name || a.suburb || a.neighbourhood || a.city_district || a.town || a.city || r.data.display_name.split(',')[0];
    const city = a.city || a.town || a.municipality || a.county || a.state_district || name;
    if (!a.state) continue;
    const [s, n, w, e] = r.data.boundingbox ?? [];
    out.push({
      ref: `osm:${r.data.osm_type}/${r.data.osm_id}`, name: name.slice(0, 120), locality: (a.suburb || a.neighbourhood || '').slice(0, 120) || undefined,
      city: city.slice(0, 80), district: (a.state_district || a.county || '').slice(0, 80) || undefined, state: a.state.slice(0, 80),
      lat: r.data.lat, lng: r.data.lon, bbox: r.data.boundingbox ? [s, w, n, e] : undefined, displayName: r.data.display_name.slice(0, 300),
    });
  }
  return out;
}
