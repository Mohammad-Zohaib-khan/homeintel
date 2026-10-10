import { Link } from 'react-router';
import { RotateCw } from 'lucide-react';
import { useResource } from '../../lib/useResource.js';
import { adminApi } from '../../lib/endpoints.js';
import { Skeleton } from '../../components/States.jsx';
import { Button } from '../../components/ui.jsx';
import { AdminError, PROVIDER_LABEL, when } from './shared.jsx';

// One row per fact: the number, what it means, and where to act on it. No decorative charts.
function Ledger({ title, to, cta, rows }) {
  return (
    <section aria-labelledby={`ov-${title}`} className="border-t-2 border-ink pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id={`ov-${title}`} className="text-2xl">{title}</h2>
        {to && <Link to={to} className="text-sm text-accent underline-offset-4 hover:underline">{cta}</Link>}
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([label, value, tone, note]) => (
          <div key={label} className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-2.5">
            <dt><span className="text-sm">{label}</span>{note && <span className="block text-xs text-muted">{note}</span>}</dt>
            <dd className={`num text-2xl leading-none ${tone === 'bad' && value ? 'text-bad' : tone === 'warn' && value ? 'text-warn' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CoverageBar({ l }) {
  const parts = [['live', 'Source-backed', 'bg-good'], ['demo', 'Demo data', 'bg-demo'], ['empty', 'No data', 'bg-bad']].filter(([k]) => l[k] > 0);
  return (
    <figure className="mb-8">
      <div className="flex h-3 overflow-hidden rounded-sm bg-sunken" aria-hidden="true">
        {parts.map(([k, , c]) => <span key={k} className={`${c} h-full`} style={{ width: `${(l[k] / Math.max(l.total, 1)) * 100}%` }} />)}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map(([k, label, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${c}`} aria-hidden="true" />{label} <span className="num text-base">{l[k]}</span></span>)}
        <span className="text-muted">of {l.total} localities</span>
      </figcaption>
    </figure>
  );
}

export default function AdminOverview() {
  const { data: d, error, reload, loading } = useResource((s) => adminApi.overview(s), []);
  if (error) return <AdminError error={error} onRetry={reload} />;
  if (!d) return <div aria-busy="true" aria-label="Loading overview" className="space-y-4"><Skeleton className="h-3 w-full" /><div className="grid gap-8 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div></div>;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl">Data coverage</h2>
        <Button variant="ghost" onClick={reload} loading={loading} className="h-8 px-2 text-xs"><RotateCw size={14} aria-hidden="true" />Refresh</Button>
      </div>
      <CoverageBar l={d.localities} />
      <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
        <Ledger title="Data" to="/admin/data" cta="Open data health" rows={[
          ['Localities needing a refresh', d.localities.failing, 'bad', 'Last refresh failed for at least one source'],
          ['Localities with stale values', d.localities.withStale, 'warn', 'Older than their source’s freshness window'],
          ['Localities still on demo data', d.localities.demo, 'warn'],
          ['Ingestion runs, last 24 h', d.ingestion.runs24h],
          ['Failed runs, last 24 h', d.ingestion.failed24h, 'bad'],
          ['Jobs queued or running now', d.ingestion.queue.queued + d.ingestion.queue.active],
        ]} />
        <Ledger title="Security" to="/admin/security" cta="Open security events" rows={[
          ['Failed security events, last 24 h', d.security.failures24h, 'warn', 'Wrong passwords, bad codes, refused actions'],
          ['Stolen-session alerts, last 7 days', d.security.sessionTheftAlerts7d, 'bad', 'A revoked refresh token was reused; that session family was signed out'],
          ['Locked accounts right now', d.users.locked, 'warn'],
        ]} />
        <Ledger title="Accounts" to="/admin/users" cta="Manage users" rows={[
          ['Accounts', d.users.total],
          ['With two-factor sign-in', d.users.withMfa, null, d.users.total ? `${Math.round((d.users.withMfa / d.users.total) * 100)}% of accounts` : undefined],
          ['Admins', d.users.admins],
          ['Research-assistant requests, last 24 h', d.ai.runs24h],
        ]} />
        <section aria-labelledby="ov-fail" className="border-t-2 border-ink pt-4">
          <h2 id="ov-fail" className="mb-2 text-2xl">Latest failed runs</h2>
          {d.ingestion.recentFailures.length ? (
            <ul className="divide-y divide-line">
              {d.ingestion.recentFailures.map((f) => (
                <li key={f.id} className="py-2.5 text-sm">
                  <p><span className="font-medium">{f.locality}</span> <span className="text-muted">{PROVIDER_LABEL[f.provider]}, {when(f.at)}</span></p>
                  <p className="truncate text-xs text-bad" title={f.error ?? ''}>{f.error ?? 'Unknown error'}</p>
                </li>
              ))}
            </ul>
          ) : <p className="py-2.5 text-sm text-muted">No failed runs recorded.</p>}
        </section>
      </div>
      <p className="mt-8 text-xs text-muted">Generated {when(d.generatedAt)}. Counts come straight from the database; nothing here is estimated.</p>
    </div>
  );
}
