// Pure transformations from adapter output → normalized Metric records (no I/O; unit-tested).
import { round } from '../utils/geo.js';

const km = (m) => `${round(m / 1000, 1)} km`;

// [key, category, label, types, radiusM]
export const COUNT_METRICS = [
  ['schools_1500m', 'education', 'Schools & kindergartens', ['school'], 1500],
  ['colleges_3000m', 'education', 'Colleges & universities', ['college'], 3000],
  ['hospitals_3000m', 'healthcare', 'Hospitals', ['hospital'], 3000],
  ['clinics_pharmacies_1500m', 'healthcare', 'Clinics & pharmacies', ['clinic', 'pharmacy'], 1500],
  ['parks_1000m', 'environment', 'Parks & green spaces', ['park'], 1000],
  ['bus_stops_800m', 'transport', 'Bus stops', ['bus_stop'], 800],
  ['groceries_1000m', 'essentials', 'Groceries & markets', ['grocery'], 1000],
  ['banking_1000m', 'essentials', 'Banks & ATMs', ['bank'], 1000],
  ['construction_2000m', 'development', 'Mapped construction sites', ['construction'], 2000],
];
// [key, category, label, type]
export const NEAREST_METRICS = [
  ['nearest_school_m', 'education', 'Nearest school', 'school'],
  ['nearest_hospital_m', 'healthcare', 'Nearest hospital', 'hospital'],
  ['nearest_police_m', 'safety', 'Nearest police station', 'police'],
  ['nearest_fire_m', 'safety', 'Nearest fire station', 'fire_station'],
  ['nearest_rail_m', 'transport', 'Nearest rail / metro station', 'rail_station'],
];

export function poiMetrics(pois, searchRadiusM, meta) {
  const out = [];
  for (const [key, category, label, types, r] of COUNT_METRICS) {
    const n = pois.filter((p) => types.includes(p.type) && p.distanceM <= r).length;
    out.push({ key, category, label, value: n, unit: 'count', granularity: 'neighborhood', scope: `Within ${km(r)} of the area centre (as mapped in OpenStreetMap)`, confidence: 0.7, ...meta });
  }
  for (const [key, category, label, type] of NEAREST_METRICS) {
    const p = pois.find((x) => x.type === type);
    out.push(p
      ? { key, category, label, value: p.distanceM, unit: 'm', granularity: 'neighborhood', scope: `Straight-line distance from the area centre`, confidence: 0.75, details: { name: p.name ?? null, ref: p.ref }, ...meta }
      : { key, category, label, value: searchRadiusM, unit: 'm', granularity: 'neighborhood', scope: `None mapped within ${km(searchRadiusM)}`, confidence: 0.6, details: { noneWithin: true }, ...meta });
  }
  return out;
}

const STALE_DAYS = 30;
export function airMetrics(openaq, cpcb, now = new Date()) {
  const out = [];
  if (openaq?.station && openaq.readings?.pm25) {
    const r = openaq.readings.pm25;
    const age = (now - new Date(r.at)) / 86_400_000;
    out.push({
      key: 'pm25', category: 'environment', label: 'PM2.5 (latest)', value: round(r.value, 1), unit: 'µg/m³', granularity: 'station',
      scope: `${openaq.station.name}, ${round(openaq.station.distanceKm, 1)} km away — representative, not neighborhood-exact`,
      distanceKm: round(openaq.station.distanceKm, 2), observedAt: new Date(r.at), confidence: age > STALE_DAYS ? 0.3 : openaq.station.distanceKm > 10 ? 0.5 : 0.8,
      sourceKey: 'openaq-v3', sourceRef: `openaq:location/${openaq.station.id}`, details: { station: openaq.station.name, stale: age > STALE_DAYS },
    });
  }
  if (cpcb?.station) {
    const s = cpcb.station;
    const vals = Object.values(s.pollutants);
    if (vals.length) {
      const isIndex = cpcb.valueKind === 'subindex';
      out.push({
        key: 'aqi_cpcb', category: 'environment', label: isIndex ? 'Air Quality Index (CPCB, max sub-index)' : 'PM2.5 (CPCB, as published)',
        value: isIndex ? Math.max(...vals) : (s.pollutants['PM2.5'] ?? null), unit: isIndex ? 'AQI' : 'µg/m³', granularity: 'station',
        scope: `${s.name}, ${round(s.distanceKm, 1)} km away — representative, not neighborhood-exact`,
        distanceKm: round(s.distanceKm, 2), observedAt: s.observedAt ?? undefined, confidence: s.distanceKm > 10 ? 0.5 : 0.8,
        sourceKey: 'ogd-cpcb-aqi', sourceRef: `cpcb:station/${s.name}`, details: { station: s.name, pollutants: Object.entries(s.pollutants).map(([id, value]) => ({ id, value })) },
      });
    }
  }
  return out.filter((m) => m.value != null);
}

export function crimeMetric(mapping, match) {
  return {
    key: `crime_${mapping.id}`, category: 'safety', label: mapping.label, value: match.value,
    unit: mapping.valueKind === 'rate_per_lakh' ? 'per 100k people' : 'cases', granularity: mapping.granularity,
    scope: `${match.area} (${mapping.granularity}-level), NCRB ${mapping.year} — not specific to this neighborhood`,
    observedAt: new Date(Date.UTC(mapping.year, 11, 31)), confidence: mapping.granularity === 'city' ? 0.6 : 0.4,
    sourceKey: 'ogd-ncrb', sourceRef: `ogd:${mapping.resourceId}`,
    details: { beatsShareOfAreas: round(match.percentileBetterThan, 3), areasInTable: match.areasInTable, valueKind: mapping.valueKind },
  };
}
