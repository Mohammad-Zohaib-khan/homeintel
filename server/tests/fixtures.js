// Response fixtures shaped like the real provider APIs (structure per their public docs).
export const center = { lat: 18.5074, lng: 73.8077 };
const off = (dLatM, dLngM) => ({ lat: center.lat + dLatM / 111320, lon: center.lng + dLngM / (111320 * Math.cos((center.lat * Math.PI) / 180)) });

export const overpass = {
  version: 0.6, generator: 'Overpass API',
  elements: [
    { type: 'node', id: 1, ...off(300, 0), tags: { amenity: 'school', name: 'Nearby School' } },
    { type: 'node', id: 2, ...off(1200, 0), tags: { amenity: 'kindergarten' } },
    { type: 'node', id: 3, ...off(2000, 0), tags: { amenity: 'school' } },             // outside 1.5 km count
    { type: 'way', id: 4, center: off(0, 2500), tags: { amenity: 'hospital', name: 'General Hospital' } },
    { type: 'node', id: 5, ...off(400, 400), tags: { amenity: 'pharmacy', name: '<script>alert(1)</script>Chemist' } },
    { type: 'node', id: 6, ...off(-900, 0), tags: { amenity: 'police' } },
    { type: 'node', id: 7, ...off(100, 100), tags: { highway: 'bus_stop' } },
    { type: 'node', id: 8, ...off(150, -100), tags: { highway: 'bus_stop' } },
    { type: 'way', id: 9, center: off(500, 500), tags: { leisure: 'park', name: 'Garden' } },
    { type: 'node', id: 10, ...off(700, 0), tags: { shop: 'supermarket' } },
    { type: 'node', id: 11, ...off(200, 0), tags: { amenity: 'atm' } },
    { type: 'way', id: 12, center: off(1500, 1000), tags: { landuse: 'construction' } },
    { type: 'node', id: 13, ...off(50, 50), tags: { amenity: 'bench' } },                 // ignored type
    { type: 'relation', id: 14, tags: { amenity: 'school' } },                             // no coordinates → ignored
    { bogus: true },                                                                       // malformed → ignored
  ],
};

export const openaqLocations = { meta: { found: 2 }, results: [
  { id: 900, name: 'Far Station', coordinates: { latitude: center.lat + 0.1, longitude: center.lng }, sensors: [{ id: 9001, parameter: { name: 'pm25', units: 'µg/m³' } }], datetimeLast: { utc: new Date().toISOString() } },
  { id: 100, name: 'Karve Road', coordinates: { latitude: center.lat + 0.02, longitude: center.lng }, sensors: [{ id: 1001, parameter: { name: 'pm25', units: 'µg/m³' } }, { id: 1002, parameter: { name: 'pm10', units: 'µg/m³' } }], datetimeLast: { utc: new Date().toISOString() } },
] };
export const openaqLatest = { results: [
  { sensorsId: 1001, value: 42.37, datetime: { utc: new Date().toISOString() } },
  { sensorsId: 1002, value: 88, datetime: { utc: new Date().toISOString() } },
] };
export const openaqMonthly = { results: [
  { value: 55.1, period: { datetimeFrom: { utc: '2026-01-01T00:00:00Z' } } },
  { value: 31.2, period: { datetimeFrom: { utc: '2026-06-01T00:00:00Z' } } },
] };
export const cpcbRecords = { title: 'Real time Air Quality Index from various locations', records: [
  { country: 'India', state: 'Maharashtra', city: 'Pune', station: 'Karve Road, Pune - MPCB', last_update: '08-10-2026 18:00:00', latitude: String(center.lat + 0.01), longitude: String(center.lng), pollutant_id: 'PM2.5', min_value: '40', max_value: '120', avg_value: '96' },
  { country: 'India', state: 'Maharashtra', city: 'Pune', station: 'Karve Road, Pune - MPCB', last_update: '08-10-2026 18:00:00', latitude: String(center.lat + 0.01), longitude: String(center.lng), pollutant_id: 'PM10', min_value: '30', max_value: '90', avg_value: '74' },
  { country: 'India', state: 'Maharashtra', city: 'Pune', station: 'Karve Road, Pune - MPCB', last_update: '08-10-2026 18:00:00', latitude: String(center.lat + 0.01), longitude: String(center.lng), pollutant_id: 'OZONE', min_value: 'NA', max_value: 'NA', avg_value: 'NA' },
  { country: 'India', state: 'Maharashtra', city: 'Mumbai', station: 'Far away', last_update: '08-10-2026 18:00:00', latitude: '19.0', longitude: '72.8', pollutant_id: 'PM2.5', avg_value: '20' },
] };

/** A fake transport that routes by URL; records calls. */
export function fakeTransport(routes) {
  const calls = [];
  const fn = async (req) => {
    calls.push(req);
    for (const [pattern, reply] of routes) {
      if (pattern.test(req.url)) { const r = typeof reply === 'function' ? reply(req) : reply; return { status: r.status ?? 200, headers: r.headers ?? {}, text: typeof r.body === 'string' ? r.body : JSON.stringify(r.body) }; }
    }
    return { status: 404, headers: {}, text: '{}' };
  };
  fn.calls = calls;
  return fn;
}
