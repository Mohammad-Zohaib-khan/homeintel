import { AlertTriangle, Clock, FlaskConical, MapPin, ShieldCheck } from 'lucide-react';
import { granularityLabel } from '../../lib/format.js';

const base = 'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs leading-tight whitespace-nowrap';

export function OriginTag({ origin }) {
  if (origin === 'seed') return <span className={`${base} bg-demo-soft font-medium text-demo`}><FlaskConical size={12} aria-hidden="true" />Demo data</span>;
  if (origin === 'cached') return <span className={`${base} bg-sunken text-muted`}><ShieldCheck size={12} aria-hidden="true" />Source-backed (cached)</span>;
  return <span className={`${base} bg-accent-soft text-accent`}><ShieldCheck size={12} aria-hidden="true" />Source-backed</span>;
}

export function GranularityTag({ granularity }) {
  const coarse = ['city', 'district', 'state'].includes(granularity);
  return (
    <span className={`${base} ${coarse ? 'border border-warn/50 text-warn' : 'border border-line text-muted'}`} title={coarse ? 'This value describes a larger area, not this neighborhood' : undefined}>
      <MapPin size={12} aria-hidden="true" />{granularityLabel(granularity)}
    </span>
  );
}

export function FreshnessTag({ freshness }) {
  if (freshness !== 'stale') return null;
  return <span className={`${base} border border-warn/50 text-warn`}><Clock size={12} aria-hidden="true" />Stale</span>;
}

export function StatusTag({ status }) {
  const map = { partial: ['Partial data', 'text-warn border-warn/50'], stale: ['Some data stale', 'text-warn border-warn/50'], no_data: ['No data', 'text-muted border-line'], limited: ['Limited coverage', 'text-warn border-warn/50'] };
  const v = map[status]; if (!v) return null;
  return <span className={`${base} border ${v[1]}`}><AlertTriangle size={12} aria-hidden="true" />{v[0]}</span>;
}

export function DemoBanner({ className = '' }) {
  return (
    <div role="note" className={`flex gap-3 rounded-md border border-demo/40 bg-demo-soft px-4 py-3 text-sm text-ink ${className}`}>
      <FlaskConical size={18} className="mt-0.5 shrink-0 text-demo" aria-hidden="true" />
      <p><span className="font-semibold">Demo data.</span> These values are synthetic, generated so the product works without API keys. They do not describe the real place. Source-backed values replace them automatically once ingestion runs with network access.</p>
    </div>
  );
}
