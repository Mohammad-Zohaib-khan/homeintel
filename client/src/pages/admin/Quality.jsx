import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Info } from 'lucide-react';
import { useResource } from '../../lib/useResource.js';
import { adminApi } from '../../lib/endpoints.js';
import { EmptyState, ListSkeleton } from '../../components/States.jsx';
import { AdminError, Pager, QUALITY_LABEL, Segmented } from './shared.jsx';

export default function AdminQuality() {
  const [level, setLevel] = useState(''); const [code, setCode] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [level, code]);
  const q = useResource((s) => adminApi.quality({ level: level || undefined, code: code || undefined, page, limit: 50 }, s), [level, code, page]);
  const byCode = q.data?.meta?.byCode ?? {};
  const rows = q.data?.data ?? [];
  return (
    <section aria-labelledby="q-h">
      <h2 id="q-h" className="text-3xl">Data quality</h2>
      <p className="mb-5 max-w-2xl text-sm text-muted">The same checks each profile runs, across every locality: stale values, low confidence, values that describe a whole city, sources that disagree, demo data and failed sources. Warnings first.</p>
      <div className="mb-3"><Segmented label="Severity" value={level} onChange={setLevel} options={[['', 'All'], ['warning', 'Warnings'], ['info', 'Notes']]} /></div>
      <div className="mb-5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Check">
        {[['', 'Every check', Object.values(byCode).reduce((a, b) => a + b, 0)], ...Object.keys(QUALITY_LABEL).map((k) => [k, QUALITY_LABEL[k], byCode[k] ?? 0])].map(([k, label, n]) => (
          <button key={k || 'all'} type="button" role="radio" aria-checked={code === k} onClick={() => setCode(k)} disabled={k && !n}
            className={`rounded-sm border px-2.5 py-1 text-sm disabled:opacity-40 ${code === k ? 'border-ink bg-ink text-surface' : 'border-line bg-surface hover:border-line-strong'}`}>
            {label} <span className="tnum opacity-70">{n}</span>
          </button>
        ))}
      </div>
      {q.error ? <AdminError error={q.error} onRetry={q.reload} />
        : !q.data ? <ListSkeleton rows={6} label="Running checks" />
        : !rows.length ? <EmptyState level={3} title="Nothing to review">No locality has a flag of this kind.</EmptyState>
        : (
          <ul className="divide-y divide-line border-y border-line">
            {rows.map((f, i) => (
              <li key={`${f.slug}-${f.code}-${f.metric ?? f.provider ?? ''}-${i}`} className="grid grid-cols-[1.25rem_1fr] gap-3 py-3 sm:grid-cols-[1.25rem_12rem_1fr]">
                {f.level === 'warning' ? <AlertTriangle size={16} className="mt-0.5 text-warn" aria-label="Warning" /> : <Info size={16} className="mt-0.5 text-muted" aria-label="Note" />}
                <div><Link to={`/neighborhood/${f.slug}`} className="font-medium hover:text-accent">{f.locality}</Link><span className="block text-xs text-muted">{f.city}, {QUALITY_LABEL[f.code]}</span></div>
                <p className="col-start-2 text-sm text-muted sm:col-start-3">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      <Pager meta={q.data?.meta} onPage={setPage} />
    </section>
  );
}
