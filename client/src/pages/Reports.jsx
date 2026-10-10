import { useState } from 'react';
import { Link } from 'react-router';
import { FileText, Share2, Sparkles, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { EmptyState, ErrorState, ListSkeleton } from '../components/States.jsx';
import { OriginTag } from '../components/data/Tags.jsx';
import { useToast } from '../components/Toast.jsx';
import { reports } from '../lib/endpoints.js';
import { useResource } from '../lib/useResource.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { fmtDate, fmtScore } from '../lib/format.js';

export default function Reports() {
  useDocumentTitle('Reports');
  const toast = useToast();
  const [page, setPage] = useState(1);
  const list = useResource((s) => reports.list({ page, limit: 20 }, s), [page]);
  const items = list.data?.data ?? []; const meta = list.data?.meta;
  async function remove(r) {
    if (!window.confirm(`Delete “${r.title}”? Shared links to it will stop working.`)) return;
    try { await reports.remove(r.id); list.setData((d) => ({ ...d, data: d.data.filter((x) => x.id !== r.id), meta: { ...d.meta, total: d.meta.total - 1 } })); toast.info('Report deleted'); } catch (e) { toast.error(e.message); }
  }
  return (
    <div>
      <PageHeader title="Reports">Snapshots of profiles and comparisons, with strengths, concerns, caveats and sources. Create one from any profile or comparison.</PageHeader>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} />
        : !list.data ? <ListSkeleton rows={4} label="Loading reports" />
        : !items.length ? <EmptyState icon={FileText} title="No reports yet">Open a <Link to="/explore" className="text-accent underline underline-offset-4">neighborhood profile</Link> or a <Link to="/compare" className="text-accent underline underline-offset-4">comparison</Link> and choose <span className="font-medium text-ink">Create report</span>.</EmptyState>
        : (
          <>
            <ul className="border-t border-line">
              {items.map((r) => (
                <li key={r.id} className="flex items-start gap-4 border-b border-line py-4">
                  <FileText size={20} className="mt-1 shrink-0 text-faint" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/report/${r.id}`} className="font-display text-xl font-semibold hover:text-accent">{r.title}</Link>
                    <p className="text-sm text-muted">{r.kind === 'comparison' ? 'Comparison' : 'Profile'}: {r.neighborhoods.map((n) => `${n.name} ${fmtScore(n.overall)}`).join(', ')}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{fmtDate(r.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {r.containsDemoData && <OriginTag origin="seed" />}
                      {r.ai.status === 'included' && <span className="inline-flex items-center gap-1"><Sparkles size={12} aria-hidden="true" />Written summary</span>}
                      {r.shared && <span className="inline-flex items-center gap-1 text-accent"><Share2 size={12} aria-hidden="true" />Shared by link</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => remove(r)} aria-label={`Delete report ${r.title}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-bad"><Trash2 size={15} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
            {meta.pages > 1 && <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Previous</button><span className="tnum text-muted">Page {page} of {meta.pages}</span><button type="button" disabled={page >= meta.pages} onClick={() => setPage(page + 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Next</button></nav>}
          </>
        )}
    </div>
  );
}
