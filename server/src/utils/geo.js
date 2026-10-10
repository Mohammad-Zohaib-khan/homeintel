const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
export function haversineM(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
// Degree deltas for a bounding-box prefilter around a point.
export function boxAround(lat, lng, meters) {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.max(Math.cos(rad(lat)), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
export const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
export const normName = (s = '') => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const slugify = (s) => normName(s).replace(/\s+/g, '-').slice(0, 100);
