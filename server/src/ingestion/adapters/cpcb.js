import { env } from '../../config/env.js';
import { fetchResource } from './ogd.js';
import { haversineM } from '../../utils/geo.js';

export const SOURCE = {
  key: 'ogd-cpcb-aqi', provider: 'CPCB via Open Government Data Platform India', name: 'Real time Air Quality Index from various locations (CPCB)',
  url: 'https://www.data.gov.in/catalog/real-time-air-quality-index', license: 'Government Open Data License – India', attribution: 'Central Pollution Control Board / data.gov.in',
};

const num = (v) => { const n = Number(v); return v === null || v === '' || v === 'NA' || !Number.isFinite(n) ? null : n; };
const pick = (r, ...keys) => keys.map((k) => r[k]).find((v) => v !== undefined);

/** Nearest CPCB station (in the neighborhood's state) with readings; returns per-pollutant values as published. */
export async function fetchCpcb(lat, lng, state) {
  const { records, fetchedAt } = await fetchResource(env.CPCB_AQI_RESOURCE_ID, { filters: { state }, limit: 2000, ttlMs: 3 * 3600 * 1000 });
  const stations = new Map();
  for (const r of records) {
    const slat = num(r.latitude), slng = num(r.longitude);
    const pollutant = String(r.pollutant_id ?? '').toUpperCase();
    const avg = num(pick(r, 'avg_value', 'pollutant_avg'));
    if (slat == null || slng == null || !pollutant || avg == null) continue;
    const key = String(r.station ?? `${slat},${slng}`);
    if (!stations.has(key)) stations.set(key, { name: key.slice(0, 200), city: String(r.city ?? '').slice(0, 80), lat: slat, lng: slng, lastUpdate: r.last_update ? String(r.last_update) : null, pollutants: {} });
    stations.get(key).pollutants[pollutant] = avg;
  }
  const ranked = [...stations.values()].map((s) => ({ ...s, distanceKm: haversineM(lat, lng, s.lat, s.lng) / 1000 })).sort((a, b) => a.distanceKm - b.distanceKm);
  return { station: ranked[0] ?? null, fetchedAt, valueKind: env.CPCB_VALUE_KIND };
}

// "dd-mm-yyyy hh:mm:ss" (as published) → Date (IST)
export function parseCpcbDate(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+05:30`);
}
