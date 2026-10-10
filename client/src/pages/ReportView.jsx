import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Pencil, Printer, Share2, Trash2 } from 'lucide-react';
import ReportBody from '../components/ReportBody.jsx';
import Dialog from '../components/Dialog.jsx';
import { ErrorState, Skeleton } from '../components/States.jsx';
import { Button, CopyButton, TextField } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { reports } from '../lib/endpoints.js';
import { useResource } from '../lib/useResource.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { fmtDate } from '../lib/format.js';
import NotFound from './NotFound.jsx';

const shareUrl = (token) => `${window.location.origin}/r/${token}`;
const AI_NOTE = { unavailable: 'A written summary was requested, but the research assistant is not configured on this server.', failed: 'A written summary was requested but could not be generated. The rest of the report is complete.', pending: 'The written summary is still being generated.' };

export default function ReportView() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const rep = useResource((s) => reports.get(id, s), [id]);
  const [shareOpen, setShareOpen] = useState(false); const [renaming, setRenaming] = useState(false); const [title, setTitle] = useState(''); const [busy, setBusy] = useState(false);
  useDocumentTitle(rep.data?.title ?? 'Report');
  if (rep.error?.status === 404) return <NotFound />;
  if (rep.error) return <ErrorState error={rep.error} onRetry={rep.reload} title="This report could not load" />;
  if (!rep.data) return <div aria-busy="true" aria-label="Loading report" className="space-y-4"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  const r = rep.data;

  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const toggleShare = (enabled) => run(async () => { rep.setData(await reports.share(r.id, enabled)); toast.success(enabled ? 'Link created' : 'Link turned off. The old link no longer works.'); });
  const rename = (e) => { e.preventDefault(); run(async () => { rep.setData(await reports.rename(r.id, title)); setRenaming(false); toast.success('Report renamed'); }); };
  const remove = () => run(async () => { if (!window.confirm('Delete this report? Shared links will stop working.')) return; await reports.remove(r.id); toast.info('Report deleted'); nav('/reports'); });

  return (
    <article aria-labelledby="rep-title">
      <header className="mb-10 border-b border-line pb-6">
        <p className="text-sm text-muted">{r.kind === 'comparison' ? 'Comparison report' : 'Neighborhood report'}, created {fmtDate(r.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 id="rep-title" className="mt-1 text-5xl">{r.title}</h1>
        {AI_NOTE[r.ai.status] && <p className="mt-3 text-sm text-muted">{AI_NOTE[r.ai.status]}</p>}
        <div className="no-print mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShareOpen(true)}><Share2 size={16} aria-hidden="true" />{r.share.enabled ? 'Shared by link' : 'Share'}</Button>
          <Button variant="secondary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print or save as PDF</Button>
          <Button variant="ghost" onClick={() => { setTitle(r.title); setRenaming(true); }}><Pencil size={16} aria-hidden="true" />Rename</Button>
          <Button variant="ghost" onClick={remove} disabled={busy} className="text-bad"><Trash2 size={16} aria-hidden="true" />Delete</Button>
        </div>
      </header>
      <ReportBody report={r} />

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} title="Share this report">
        {r.share.enabled ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Anyone with this link can read the report. It doesn’t show your name or email. Turning sharing off breaks the link for good.</p>
            <div className="flex items-center gap-2 rounded-md border border-line bg-sunken p-2"><code className="min-w-0 flex-1 truncate text-sm">{shareUrl(r.share.token)}</code><CopyButton value={shareUrl(r.share.token)} label="Copy link" /></div>
            <Button variant="danger" onClick={() => toggleShare(false)} loading={busy}>Turn off sharing</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">Create a private, unguessable link that lets anyone with it read this report, without signing in. You can turn it off at any time.</p>
            {r.containsDemoData && <p className="text-sm text-warn">This report contains demo data. Readers will see it labelled as such.</p>}
            <Button onClick={() => toggleShare(true)} loading={busy}>Create link</Button>
          </div>
        )}
      </Dialog>
      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename report">
        <form onSubmit={rename} className="space-y-4"><TextField label="Title" value={title} maxLength={140} required onChange={(e) => setTitle(e.target.value)} /><div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button><Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button></div></form>
      </Dialog>
    </article>
  );
}
