import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { RefreshCw, Search } from 'lucide-react';
import { useResource } from '../../lib/useResource.js';
import { adminApi } from '../../lib/endpoints.js';
import { ListSkeleton, EmptyState } from '../../components/States.jsx';
import { Button } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import { AdminError, Pager, PROVIDER_LABEL, Segmented, Status, useDebounced, when } from './shared.jsx';

function Localities() {
  const toast = useToast();
  const [q, setQ] = useState(''); const [data, setData] = useState(''); const [attention, setAttention] = useState(false); const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, data, attention]);
  const list = useResource((s) => adminApi.localities({ q: dq || undefined, data: data || undefined, attention: attention ? '1' : undefined, page, limit: 25 }, s), [dq, data, attention, page]);
  const rows = list.data?.data ?? [];
  const busy = rows.some((r) => ['running', 'queued'].includes(r.ingestion.status));
  useEffect(() => { if (!busy) return undefined; const t = setInterval(list.reload, 3000); return () => clearInterval(t); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh(r) {
    try { const x = await adminApi.refreshLocality(r.id); toast.info(x.queued ? `Refreshing ${r.name}` : `${r.name} is already refreshing`); list.reload(); } catch (e) { toast.error(e.message); }
  }
  async function refreshStale() {
    try { const x = await adminApi.refreshStale({ olderThanHours: 24 }); toast.info(x.queued.length ? `Refreshing ${x.queued.length} ${x.queued.length === 1 ? 'locality' : 'localities'} not refreshed in 24 hours` : 'Every locality was refreshed in the last 24 hours'); list.reload(); } catch (e) { toast.error(e.message); }
  }

  return (
    <section aria-labelledby="loc-h">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="loc-h" className="text-3xl">Localities</h2><p className="text-sm text-muted">Where each locality’s data came from, and how its last refresh went for each source.</p></div>
        <Button variant="secondary" onClick={refreshStale}><RefreshCw size={16} aria-hidden="true" />Refresh everything older than 24 h</Button>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-raised px-3 sm:w-72">
          <Search size={15} className="text-muted" aria-hidden="true" /><span className="sr-only">Search localities</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, city or state" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
        </label>
        <Segmented label="Data" value={data} onChange={setData} options={[['', 'All'], ['live', 'Source-backed'], ['demo', 'Demo'], ['empty', 'No data']]} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />Needs attention only</label>
      </div>
      {list.error ? <AdminError error={list.error} onRetry={list.reload} />
        : !list.data ? <ListSkeleton rows={6} label="Loading localities" />
        : !rows.length ? <EmptyState level={3} title="No localities match">Change the filters above.</EmptyState>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">Data health per locality</caption>
              <thead><tr className="border-b border-line-strong text-left text-xs text-muted">
                <th className="py-2 pr-3 font-normal whitespace-nowrap">Locality</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Data</th><th className="py-2 pr-3 text-right font-normal whitespace-nowrap">Values</th>
                {Object.values(PROVIDER_LABEL).map((p) => <th key={p} className="py-2 pr-3 font-normal whitespace-nowrap">{p}</th>)}
                <th className="py-2 pr-3 font-normal whitespace-nowrap">Last success</th><th className="py-2 font-normal whitespace-nowrap"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-b border-line align-top ${r.needsAttention ? '' : ''}`}>
                    <td className="py-2.5 pr-3"><Link to={`/neighborhood/${r.slug}`} className="font-medium hover:text-accent">{r.name}</Link><span className="block text-xs text-muted">{r.city}, {r.state}</span></td>
                    <td className="py-2.5 pr-3"><Status value={r.data} /></td>
                    <td className="tnum py-2.5 pr-3 text-right text-xs leading-5"><span className="block">{r.metrics.live} source-backed</span><span className="block text-muted">{r.metrics.seed} demo</span>{r.metrics.stale > 0 && <span className="block text-warn">{r.metrics.stale} stale</span>}</td>
                    {['overpass', 'air', 'crime'].map((p) => {
                      const v = r.ingestion.providers[p];
                      const st = ['running', 'queued'].includes(r.ingestion.status) ? r.ingestion.status : v.status;
                      return <td key={p} className="max-w-[12rem] py-2.5 pr-3"><Status value={st} />{v.reason && st !== 'running' && <span className="mt-0.5 block truncate text-xs text-muted" title={v.reason}>{v.reason}</span>}</td>;
                    })}
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted">{when(r.ingestion.lastSuccessAt)}</td>
                    <td className="py-2 text-right"><Button variant="ghost" className="h-8 px-2 text-xs" disabled={['running', 'queued'].includes(r.ingestion.status)} onClick={() => refresh(r)} aria-label={`Refresh ${r.name}`}><RefreshCw size={14} aria-hidden="true" />Refresh</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </section>
  );
}

function Runs() {
  const [status, setStatus] = useState(''); const [provider, setProvider] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, provider]);
  const runs = useResource((s) => adminApi.runs({ status: status || undefined, provider: provider || undefined, page, limit: 20 }, s), [status, provider, page]);
  const rows = runs.data?.data ?? [];
  return (
    <section aria-labelledby="runs-h" className="mt-14">
      <h2 id="runs-h" className="text-3xl">Ingestion runs</h2>
      <p className="mb-4 text-sm text-muted">Every collection attempt, newest first. Errors are stored without API keys.</p>
      <div className="mb-4 flex flex-wrap gap-4">
        <Segmented label="Status" value={status} onChange={setStatus} options={[['', 'All'], ['failed', 'Failed'], ['success', 'Succeeded'], ['skipped', 'Skipped'], ['running', 'Running']]} />
        <Segmented label="Source" value={provider} onChange={setProvider} options={[['', 'All sources'], ...Object.entries(PROVIDER_LABEL)]} />
      </div>
      {runs.error ? <AdminError error={runs.error} onRetry={runs.reload} />
        : !runs.data ? <ListSkeleton rows={5} label="Loading runs" />
        : !rows.length ? <EmptyState level={3} title="No runs match">Runs appear when data is collected from the CLI, a user, a refresh or a webhook.</EmptyState>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Ingestion runs</caption>
              <thead><tr className="border-b border-line-strong text-left text-xs text-muted"><th className="py-2 pr-3 font-normal whitespace-nowrap">Started</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Locality</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Source</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Trigger</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Result</th><th className="py-2 pr-3 text-right font-normal whitespace-nowrap">Duration</th><th className="py-2 font-normal whitespace-nowrap">Detail</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted">{when(r.startedAt)}</td>
                    <td className="py-2 pr-3">{r.slug ? <Link to={`/neighborhood/${r.slug}`} className="hover:text-accent">{r.locality}</Link> : r.locality}</td>
                    <td className="py-2 pr-3">{PROVIDER_LABEL[r.provider]}</td>
                    <td className="py-2 pr-3 text-muted">{r.trigger.replace('_', ' ')}</td>
                    <td className="py-2 pr-3"><Status value={r.status} /></td>
                    <td className="tnum py-2 pr-3 text-right text-muted">{r.ms != null ? `${(r.ms / 1000).toFixed(1)} s` : '—'}</td>
                    <td className="max-w-[20rem] py-2 text-xs text-muted">{r.error ?? Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <Pager meta={runs.data?.meta} onPage={setPage} />
    </section>
  );
}

export default function AdminData() { return <><Localities /><Runs /></>; }
