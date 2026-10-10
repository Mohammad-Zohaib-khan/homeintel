import { z } from 'zod';
import { env } from '../../config/env.js';
import { safeFetch, ProviderError } from '../../utils/safeFetch.js';
import { cached } from '../../services/cacheService.js';
import { haversineM } from '../../utils/geo.js';

export const SOURCE = {
  key: 'openaq-v3', provider: 'OpenAQ', name: 'OpenAQ API v3 — public air-quality measurements',
  url: 'https://docs.openaq.org/', license: 'Varies by originating provider (see OpenAQ)', attribution: 'Data via OpenAQ',
};
export const MAX_RADIUS_M = 25000; // OpenAQ v3 coordinates search limit

const base = () => env.OPENAQ_ENDPOINT.replace(/\/$/, '');
async function get(path, params, ttlMs) {
  if (!env.OPENAQ_API_KEY) throw new ProviderError('OPENAQ_API_KEY is not configured', { code: 'NOT_CONFIGURED' });
  const qs = new URLSearchParams(params).toString();
  const { body } = await cached('openaq', `${path}?${qs}`, ttlMs, async () =>
    (await safeFetch(`${base()}${path}?${qs}`, { headers: { 'x-api-key': env.OPENAQ_API_KEY }, minIntervalMs: 250, timeoutMs: 15000 })).json);
  return body;
}

const sensor = z.object({ id: z.number(), parameter: z.object({ name: z.string(), units: z.string().optional().default('') }).passthrough() }).passthrough();
const location = z.object({
  id: z.number(), name: z.string().nullable().optional(), locality: z.string().nullable().optional(),
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }),
  sensors: z.array(sensor).default([]),
  datetimeLast: z.object({ utc: z.string() }).nullable().optional(),
  provider: z.object({ name: z.string() }).partial().nullable().optional(),
}).passthrough();
const latest = z.object({ sensorsId: z.number(), value: z.number(), datetime: z.object({ utc: z.string() }).passthrough() }).passthrough();
const monthly = z.object({ value: z.number(), period: z.object({ datetimeFrom: z.object({ utc: z.string() }).passthrough() }).passthrough() }).passthrough();

/**
 * Nearest monitoring location with a PM2.5 sensor, its latest values and up to 24 months of monthly PM2.5 averages.
 * Station data is representative of the area — the caller labels it with distance, never as neighborhood-exact.
 */
export async function fetchAirQuality(lat, lng) {
  const locs = await get('/v3/locations', { coordinates: `${lat.toFixed(5)},${lng.toFixed(5)}`, radius: String(MAX_RADIUS_M), limit: '25' }, 24 * 3600 * 1000);
  const candidates = z.object({ results: z.array(z.unknown()) }).parse(locs).results
    .map((r) => location.safeParse(r)).filter((r) => r.success).map((r) => r.data)
    .filter((l) => l.sensors.some((s) => s.parameter.name === 'pm25'))
    .map((l) => ({ ...l, distanceM: haversineM(lat, lng, l.coordinates.latitude, l.coordinates.longitude) }))
    .sort((a, b) => a.distanceM - b.distanceM);
  if (!candidates.length) return { station: null };

  const st = candidates[0];
  const bySensor = new Map(st.sensors.map((s) => [s.id, s.parameter]));
  const lat0 = await get(`/v3/locations/${st.id}/latest`, {}, 3 * 3600 * 1000);
  const readings = {};
  for (const r of z.object({ results: z.array(z.unknown()) }).parse(lat0).results) {
    const p = latest.safeParse(r); if (!p.success) continue;
    const param = bySensor.get(p.data.sensorsId); if (!param) continue;
    if (['pm25', 'pm10', 'no2', 'o3', 'so2'].includes(param.name) && p.data.value >= 0) readings[param.name] = { value: p.data.value, unit: param.units || 'µg/m³', at: p.data.datetime.utc };
  }

  let history = [];
  const pmSensor = st.sensors.find((s) => s.parameter.name === 'pm25');
  try {
    const to = new Date(); const from = new Date(to); from.setUTCMonth(from.getUTCMonth() - 24);
    const h = await get(`/v3/sensors/${pmSensor.id}/days/monthly`, { date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10), limit: '36' }, 7 * 24 * 3600 * 1000);
    history = z.object({ results: z.array(z.unknown()) }).parse(h).results.map((r) => monthly.safeParse(r)).filter((r) => r.success && r.data.value >= 0)
      .map((r) => ({ observedAt: new Date(r.data.period.datetimeFrom.utc), value: r.data.value }));
  } catch { history = []; } // history is optional; the latest value still stands

  return {
    station: { id: st.id, name: st.name || st.locality || `OpenAQ location ${st.id}`, distanceKm: st.distanceM / 1000, lastSeen: st.datetimeLast?.utc ?? null, provider: st.provider?.name ?? null },
    readings, history,
  };
}
