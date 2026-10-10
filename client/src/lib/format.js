import { GRANULARITY_LABEL } from '@homeintel/shared';

export const fmtNumber = (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const fmtDistance = (m) => (m == null ? '—' : m >= 1000 ? `${fmtNumber(m / 1000, 1)} km` : `${Math.round(m)} m`);
export const fmtScore = (s) => (s == null ? '—' : String(Math.round(s)));

export function fmtValue(m) {
  if (m.value == null) return '—';
  if (m.unit === 'm') return m.details?.noneWithin ? `None within ${fmtDistance(m.value)}` : fmtDistance(m.value);
  if (m.unit === 'count') return fmtNumber(m.value);
  return `${fmtNumber(m.value, 1)} ${m.unit}`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function fmtRelative(date, now = Date.now()) {
  if (!date) return 'unknown';
  const s = (new Date(date).getTime() - now) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'just now';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 45) return rtf.format(Math.round(s / 86400), 'day');
  if (a < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
  return rtf.format(Math.round(s / (86400 * 365)), 'year');
}
export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (d ? new Date(d).toLocaleDateString('en-IN', opts) : '—');
export const granularityLabel = (g) => GRANULARITY_LABEL[g] ?? g;
export const placeLine = (n) => [n.city !== n.name ? n.city : null, n.state].filter(Boolean).join(', ');

export const weightsToQuery = (w) => (w ? Object.entries(w).map(([k, v]) => `${k}:${v}`).join(',') : undefined);
