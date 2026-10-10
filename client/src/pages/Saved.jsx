import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bookmark, Download, GitCompareArrows, Pencil, Trash2, Upload } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { EmptyState, ErrorState, ListSkeleton } from '../components/States.jsx';
import { OriginTag } from '../components/data/Tags.jsx';
import Dialog from '../components/Dialog.jsx';
import { Alert, Button, Field, TextField } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { saved, comparisons } from '../lib/endpoints.js';
import { useResource } from '../lib/useResource.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { fmtDate, fmtScore, placeLine } from '../lib/format.js';

function EditSaved({ item, onSaved, onClose }) {
  const [note, setNote] = useState(item.note); const [tags, setTags] = useState(item.tags.join(', ')); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { onSaved(await saved.update(item.id, { note, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })); onClose(); }
    catch (x) { setErr(x.details?.[0]?.message ?? x.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <Alert>{err}</Alert>}
      <Field label="Note">{(p) => <textarea {...p} rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${p.className} h-auto py-2`} />}</Field>
      <TextField label="Tags" hint="Separate with commas, up to 8. For example: shortlist, near office" value={tags} onChange={(e) => setTags(e.target.value)} />
      <div className="flex gap-2"><Button type="submit" loading={busy}>Save changes</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function ImportCsv({ onDone }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null); const [err, setErr] = useState('');
  const fileRef = useRef(null);
  async function submit(e) {
    e.preventDefault(); const f = fileRef.current?.files?.[0]; if (!f) { setErr('Choose a .csv file first.'); return; }
    setBusy(true); setErr(''); setResult(null);
    try { const r = await saved.importCsv(f); setResult(r); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setResult(null); setErr(''); }}><Upload size={16} aria-hidden="true" />Import CSV</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Import a shortlist">
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted">One locality per line as <code>name,city</code> (city optional), up to 100 rows and 64 KB. Rows are matched against localities already in HomeIntel. The file is read once and not stored.</p>
          <Field label="CSV file">{(p) => <input {...p} ref={fileRef} type="file" accept=".csv,text/csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5" />}</Field>
          {err && <Alert>{err}</Alert>}
          {result && (
            <div className="space-y-1 rounded-md border border-line bg-surface p-3 text-sm" role="status">
              <p><span className="font-medium">{result.saved.length}</span> saved, <span className="font-medium">{result.alreadySaved.length}</span> already saved.</p>
              {result.ambiguous.length > 0 && <p className="text-warn">{result.ambiguous.length} matched more than one locality; add the city: {result.ambiguous.map((r) => r.name).join(', ')}.</p>}
              {result.unmatched.length > 0 && <p className="text-muted">Not in HomeIntel yet: {result.unmatched.map((r) => r.name).join(', ')}. Search for them on Explore to add them.</p>}
            </div>
          )}
          <div className="flex gap-2"><Button type="submit" loading={busy}>Import</Button><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
        </form>
      </Dialog>
    </>
  );
}

function SavedNeighborhoods() {
  const toast = useToast();
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const list = useResource((s) => saved.list({ page, limit: 20, tag: tag || undefined }, s), [page, tag]);
  const items = list.data?.data ?? []; const meta = list.data?.meta;
  async function remove(it) {
    try { await saved.remove(it.id); list.setData((d) => ({ ...d, data: d.data.filter((x) => x.id !== it.id), meta: { ...d.meta, total: d.meta.total - 1 } })); toast.info(`${it.neighborhood?.name ?? 'Item'} removed`); }
    catch (e) { toast.error(e.message); }
  }
  return (
    <section aria-labelledby="sn-h">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 id="sn-h" className="text-3xl">Neighborhoods {meta && <span className="num text-muted">{meta.total}</span>}</h2>
        <div className="flex flex-wrap gap-2">
          <ImportCsv onDone={list.reload} />
          {meta?.total > 0 && <a href={saved.exportUrl()} download className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-sunken"><Download size={16} aria-hidden="true" />Export CSV</a>}
        </div>
      </div>
      {meta?.tags?.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
          {['', ...meta.tags].map((t) => <button key={t || 'all'} type="button" aria-pressed={tag === t} onClick={() => { setTag(t); setPage(1); }} className={`rounded-sm border px-2.5 py-1 text-sm ${tag === t ? 'border-ink bg-ink text-surface' : 'border-line bg-surface hover:border-line-strong'}`}>{t || 'All'}</button>)}
        </div>
      )}
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} />
        : !list.data ? <ListSkeleton rows={4} label="Loading saved neighborhoods" />
        : !items.length ? (
          <EmptyState level={3} icon={Bookmark} title={tag ? `Nothing tagged “${tag}”` : 'No saved neighborhoods yet'}>
            {tag ? <button type="button" className="text-accent underline" onClick={() => setTag('')}>Show all</button> : <>Open any profile and choose <span className="font-medium text-ink">Save</span>, or import a shortlist from a CSV file. <Link to="/explore" className="text-accent underline underline-offset-4">Explore localities</Link></>}
          </EmptyState>
        ) : (
          <>
            <ul className="border-t border-line">
              {items.map((it) => (
                <li key={it.id} className="grid grid-cols-[3.25rem_1fr_auto] items-start gap-4 border-b border-line py-4">
                  <span className="num pt-0.5 text-center text-[1.9rem] leading-none">{fmtScore(it.neighborhood?.score?.overall)}</span>
                  <div className="min-w-0">
                    {it.neighborhood ? <Link to={`/neighborhood/${it.neighborhood.slug}`} className="font-display text-xl font-semibold hover:text-accent">{it.neighborhood.name}</Link> : <span className="text-muted">This locality was removed</span>}
                    {it.neighborhood && <p className="text-sm text-muted">{placeLine(it.neighborhood)}{it.neighborhood.score?.dataMix?.isDemo ? '' : ''}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {it.neighborhood?.score?.dataMix?.isDemo && <OriginTag origin="seed" />}
                      {it.tags.map((t) => <span key={t} className="rounded-sm bg-sunken px-1.5 py-0.5 text-xs">{t}</span>)}
                      <span className="text-xs text-faint">Saved {fmtDate(it.createdAt)}</span>
                    </div>
                    {it.note && <p className="mt-2 max-w-prose whitespace-pre-line text-sm">{it.note}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setEditing(it)} aria-label={`Edit note and tags for ${it.neighborhood?.name ?? 'item'}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><Pencil size={15} aria-hidden="true" /></button>
                    <button type="button" onClick={() => remove(it)} aria-label={`Remove ${it.neighborhood?.name ?? 'item'} from saved`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-bad"><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ul>
            {meta.pages > 1 && <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Previous</button><span className="tnum text-muted">Page {page} of {meta.pages}</span><button type="button" disabled={page >= meta.pages} onClick={() => setPage(page + 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Next</button></nav>}
          </>
        )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.neighborhood?.name ?? ''}`}>
        {editing && <EditSaved item={editing} onClose={() => setEditing(null)} onSaved={(u) => { list.setData((d) => ({ ...d, data: d.data.map((x) => (x.id === u.id ? { ...x, note: u.note, tags: u.tags } : x)) })); toast.success('Changes saved'); }} />}
      </Dialog>
    </section>
  );
}

function SavedComparisons() {
  const toast = useToast();
  const list = useResource((s) => comparisons.list(s), []);
  async function remove(c) { try { await comparisons.remove(c.id); list.setData((d) => d.filter((x) => x.id !== c.id)); toast.info('Comparison removed'); } catch (e) { toast.error(e.message); } }
  return (
    <section aria-labelledby="sc-h" className="mt-14">
      <h2 id="sc-h" className="mb-4 text-3xl">Comparisons {list.data && <span className="num text-muted">{list.data.length}</span>}</h2>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} />
        : !list.data ? <ListSkeleton rows={2} label="Loading saved comparisons" />
        : !list.data.length ? <EmptyState level={3} icon={GitCompareArrows} title="No saved comparisons">On <Link to="/compare" className="text-accent underline underline-offset-4">Compare</Link>, choose <span className="font-medium text-ink">Save comparison</span> to keep a set of neighborhoods and priorities.</EmptyState>
        : (
          <ul className="border-t border-line">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center gap-4 border-b border-line py-3">
                <div className="min-w-0 flex-1"><Link to={`/compare?ids=${c.neighborhoods.map((n) => n.slug).join(',')}`} className="font-medium hover:text-accent">{c.name}</Link><p className="truncate text-sm text-muted">{c.neighborhoods.map((n) => n.name).join(', ')}. Saved {fmtDate(c.createdAt)}</p></div>
                <button type="button" onClick={() => remove(c)} aria-label={`Delete comparison ${c.name}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-bad"><Trash2 size={15} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

export default function Saved() {
  useDocumentTitle('Saved');
  return (
    <div>
      <PageHeader title="Saved">Neighborhoods you are considering, with your own notes, and comparisons you want to revisit. Scores stay current as data refreshes.</PageHeader>
      <SavedNeighborhoods />
      <SavedComparisons />
    </div>
  );
}
