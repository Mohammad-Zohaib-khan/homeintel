import { z } from 'zod';
import { env } from '../../config/env.js';
import { safeFetch } from '../../utils/safeFetch.js';
import { cached } from '../../services/cacheService.js';
import { haversineM } from '../../utils/geo.js';

export const SOURCE = {
  key: 'osm-overpass', provider: 'OpenStreetMap', name: 'OpenStreetMap data via the Overpass API',
  url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors',
};
export const SEARCH_RADIUS_M = 3000;

// Normalized amenity taxonomy. Order matters: first match wins.
const RULES = [
  ['school', (t) => ['school', 'kindergarten'].includes(t.amenity)],
  ['college', (t) => ['college', 'university'].includes(t.amenity)],
  ['hospital', (t) => t.amenity === 'hospital' || t.healthcare === 'hospital'],
  ['clinic', (t) => ['clinic', 'doctors'].includes(t.amenity) || ['clinic', 'doctor', 'centre'].includes(t.healthcare)],
  ['pharmacy', (t) => t.amenity === 'pharmacy' || t.healthcare === 'pharmacy' || t.shop === 'chemist'],
  ['police', (t) => t.amenity === 'police'],
  ['fire_station', (t) => t.amenity === 'fire_station'],
  ['rail_station', (t) => ['station', 'halt'].includes(t.railway) || t.station === 'subway' || t.railway === 'subway_entrance'],
  ['bus_stop', (t) => t.highway === 'bus_stop' || (t.public_transport === 'platform' && t.bus === 'yes')],
  ['grocery', (t) => ['supermarket', 'convenience', 'greengrocer', 'general', 'department_store'].includes(t.shop) || t.amenity === 'marketplace'],
  ['bank', (t) => ['bank', 'atm'].includes(t.amenity)],
  ['park', (t) => ['park', 'garden', 'playground', 'nature_reserve'].includes(t.leisure)],
  ['construction', (t) => t.landuse === 'construction' || t.highway === 'construction' || t.railway === 'construction' || t.building === 'construction'],
];
export const classify = (tags = {}) => RULES.find(([, test]) => test(tags))?.[0] ?? null;

export function buildQuery(lat, lng, r = SEARCH_RADIUS_M) {
  const a = `(around:${r},${lat.toFixed(6)},${lng.toFixed(6)})`;
  return `[out:json][timeout:25];
(
  nwr${a}["amenity"~"^(school|kindergarten|college|university|hospital|clinic|doctors|pharmacy|police|fire_station|bank|atm|marketplace)$"];
  nwr${a}["healthcare"~"^(hospital|clinic|doctor|centre|pharmacy)$"];
  nwr${a}["shop"~"^(supermarket|convenience|greengrocer|general|department_store|chemist)$"];
  nwr${a}["leisure"~"^(park|garden|playground|nature_reserve)$"];
  nwr${a}["highway"="bus_stop"];
  nwr${a}["railway"~"^(station|halt|subway_entrance|construction)$"];
  nwr${a}["landuse"="construction"];
  nwr${a}["highway"="construction"];
);
out center 6000;`;
}

const elementSchema = z.object({
  type: z.enum(['node', 'way', 'relation']), id: z.number(),
  lat: z.number().optional(), lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).optional(),
}).passthrough();
const responseSchema = z.object({ elements: z.array(z.unknown()) }).passthrough();

const cleanName = (s) => (s ? String(s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 200) : null);

/** Fetches and normalizes amenities around a point. Returns { pois, fetchedAt, cached }. */
export async function fetchAmenities(lat, lng) {
  const query = buildQuery(lat, lng);
  const { body, cached: wasCached, fetchedAt } = await cached('overpass', query, 7 * 24 * 3600 * 1000, async () => {
    const { json } = await safeFetch(env.OVERPASS_ENDPOINT, { method: 'POST', body: new URLSearchParams({ data: query }).toString(), timeoutMs: 40000, minIntervalMs: 2000, maxBytes: 25 * 1024 * 1024 });
    return responseSchema.parse(json);
  });
  const pois = [];
  const seen = new Set();
  for (const raw of body.elements) {
    const p = elementSchema.safeParse(raw);
    if (!p.success) continue;
    const el = p.data;
    const plat = el.lat ?? el.center?.lat; const plng = el.lon ?? el.center?.lon;
    if (plat == null || plng == null) continue;
    const type = classify(el.tags);
    if (!type) continue;
    const ref = `osm:${el.type}/${el.id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    pois.push({ ref, type, name: cleanName(el.tags?.name || el.tags?.['name:en']), lat: plat, lng: plng, distanceM: Math.round(haversineM(lat, lng, plat, plng)) });
  }
  pois.sort((a, b) => a.distanceM - b.distanceM);
  return { pois, fetchedAt, cached: wasCached };
}
