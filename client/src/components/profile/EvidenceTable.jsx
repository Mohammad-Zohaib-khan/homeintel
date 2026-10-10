import { ExternalLink } from 'lucide-react';
import { categoryLabel } from '@homeintel/shared';
import { GranularityTag, OriginTag, FreshnessTag } from '../data/Tags.jsx';
import { ErrorState, ListSkeleton } from '../States.jsx';
import { fmtDate, fmtRelative, fmtValue } from '../../lib/format.js';
import { CopyButton } from '../ui.jsx';

export function EvidenceTable({ metrics }) {
  if (metrics.error) return <ErrorState error={metrics.error} onRetry={metrics.reload} title="Evidence could not load" />;
  if (metrics.loading && !metrics.data) return <ListSkeleton rows={6} label="Loading evidence" />;
  const rows = metrics.data ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Every value behind this profile, with its source</caption>
        <thead><tr className="border-b border-line-strong text-left text-xs text-muted"><th className="py-2 pr-3 font-normal">Metric</th><th className="py-2 pr-3 text-right font-normal">Value</th><th className="py-2 pr-3 font-normal">Covers</th><th className="py-2 pr-3 font-normal">Origin</th><th className="py-2 font-normal">Collected</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-line align-top">
              <td className="py-2.5 pr-3"><span className="font-medium">{m.label}</span><span className="block text-xs text-muted">{categoryLabel(m.category)}</span></td>
              <td className="tnum py-2.5 pr-3 text-right font-medium whitespace-nowrap">{fmtValue(m)}</td>
              <td className="py-2.5 pr-3"><GranularityTag granularity={m.granularity} /><span className="mt-1 block max-w-xs text-xs text-muted">{m.scope}</span></td>
              <td className="py-2.5 pr-3"><div className="flex flex-wrap gap-1"><OriginTag origin={m.origin} /><FreshnessTag freshness={m.freshness} /></div><span className="mt-1 block text-xs text-muted">{m.source.name}</span></td>
              <td className="py-2.5 text-xs text-muted whitespace-nowrap" title={new Date(m.collectedAt).toISOString()}>{fmtRelative(m.collectedAt)}{m.observedAt && <span className="block">Measured {fmtDate(m.observedAt)}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceList({ sources }) {
  if (sources.error) return <ErrorState error={sources.error} onRetry={sources.reload} title="Sources could not load" />;
  if (sources.loading && !sources.data) return <ListSkeleton rows={2} label="Loading sources" />;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {(sources.data ?? []).map((s) => (
        <li key={s.key} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <p className="font-medium">{s.name}</p>
            <p className="text-sm text-muted">{s.provider}. Licence: {s.license}. {s.attribution}.</p>
            <p className="mt-1 text-xs text-muted">{s.metrics} metrics{s.pois ? `, ${s.pois} mapped amenities` : ''}; last collected {fmtRelative(s.lastCollected)}.</p>
          </div>
          <div className="flex items-center gap-2">
            {s.isDemo ? <OriginTag origin="seed" /> : s.url && (
              <>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent underline underline-offset-4">Source<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>
                <CopyButton value={s.url} label="Copy link" />
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
