import { useState } from 'react';
import { Link } from 'react-router';
import { Sparkles, X } from 'lucide-react';
import { MAX_COMPARE } from '@homeintel/shared';
import PageHeader from '../components/PageHeader.jsx';
import SearchBox from '../components/SearchBox.jsx';
import AiResult from '../components/AiResult.jsx';
import { EmptyState, ErrorState, ListSkeleton } from '../components/States.jsx';
import { Alert, Button, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { aiApi } from '../lib/endpoints.js';
import { useAi, resetAiStatusCache } from '../lib/ai.js';
import { useResource } from '../lib/useResource.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { fmtDate } from '../lib/format.js';

export default function Ai() {
  useDocumentTitle('Research assistant');
  const ai = useAi();
  const toast = useToast();
  const [mode, setMode] = useState('research');
  const [picked, setPicked] = useState([]);
  const [question, setQuestion] = useState('');
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const history = useResource((s) => aiApi.runs(s), [], { enabled: ai.available });
  const max = mode === 'research' ? 1 : MAX_COMPARE;
  const add = (it) => setPicked((p) => (p.some((x) => x.slug === it.slug) ? p : [...p, { slug: it.slug, name: it.name, city: it.city }].slice(-max)));

  async function submit(e) {
    e.preventDefault(); setBusy(true); setRun(null);
    try { const r = await aiApi.analyze({ agent: mode, neighborhoodIds: picked.map((p) => p.slug), question: question.trim() || undefined }); setRun(r); history.reload(); resetAiStatusCache(); }
    catch (x) { toast.error(x.message); } finally { setBusy(false); }
  }
  const open = async (id) => { try { setRun(await aiApi.run(id)); window.scrollTo({ top: 0 }); } catch (e) { toast.error(e.message); } };
  const ready = mode === 'research' ? picked.length === 1 : picked.length >= 2;

  return (
    <div>
      <PageHeader title="Research assistant">Ask for a written explanation of one neighborhood or a comparison. Answers use only the evidence HomeIntel has stored, cite it, and never change a score.</PageHeader>
      {!ai.loaded ? <ListSkeleton rows={2} label="Checking the research assistant" />
        : !ai.available ? (
          <EmptyState icon={Sparkles} title="The research assistant isn’t configured">
            This server has no AI provider set (<code>AI_PROVIDER</code> and an API key). Search, scores, comparisons, saved items and reports all work without it. <Link to="/explore" className="text-accent underline underline-offset-4">Explore localities</Link>
          </EmptyState>
        ) : (
          <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
            <div>
              <form onSubmit={submit} className="space-y-5 rounded-lg border border-line bg-surface p-6">
                <div role="radiogroup" aria-label="What to analyse" className="flex rounded-md border border-line p-0.5 text-sm sm:w-fit">
                  {[['research', 'One neighborhood'], ['comparison', 'Compare 2–4']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => { setMode(v); setPicked((p) => p.slice(0, v === 'research' ? 1 : MAX_COMPARE)); }} className={`flex-1 rounded-sm px-4 py-1.5 ${mode === v ? 'bg-ink text-surface' : 'text-muted'}`}>{l}</button>)}
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium">{mode === 'research' ? 'Neighborhood' : 'Neighborhoods'}</p>
                  {picked.length > 0 && <ul className="mb-2 flex flex-wrap gap-1.5">{picked.map((p) => <li key={p.slug} className="flex items-center gap-1 rounded-sm bg-sunken py-1 pl-2.5 pr-1 text-sm">{p.name}, {p.city}<button type="button" onClick={() => setPicked(picked.filter((x) => x.slug !== p.slug))} aria-label={`Remove ${p.name}`} className="grid h-5 w-5 place-items-center text-muted hover:text-ink"><X size={13} aria-hidden="true" /></button></li>)}</ul>}
                  {picked.length < max && <SearchBox placeholder="Find a locality" onSelect={add} />}
                </div>
                <Field label="Focus (optional)" hint="For example: what matters for a family with a toddler? Up to 300 characters.">{(p) => <textarea {...p} rows={3} maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} className={`${p.className} h-auto py-2`} />}</Field>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" loading={busy} disabled={!ready}>{busy ? 'Writing…' : 'Ask'}</Button>
                  {ai.quota && <span className="text-sm text-muted">{ai.quota.limit - ai.quota.used} of {ai.quota.limit} requests left today</span>}
                </div>
              </form>
              <section aria-live="polite" aria-labelledby="answer-h" className="mt-8">
                <h2 id="answer-h" className="sr-only">Answer</h2>
                {run && <div className="border-t-2 border-ink pt-5"><p className="mb-3 text-sm text-muted">{run.agent === 'comparison' ? 'Comparison' : 'Research'}{run.question ? `: “${run.question}”` : ''}, {fmtDate(run.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p><AiResult run={run} /></div>}
              </section>
            </div>
            <aside aria-labelledby="hist-h">
              <h2 id="hist-h" className="text-xl">Recent answers</h2>
              {history.error ? <ErrorState error={history.error} onRetry={history.reload} />
                : !history.data ? <ListSkeleton rows={3} label="Loading history" />
                : !history.data.length ? <p className="mt-2 text-sm text-muted">Your answers appear here.</p>
                : <ul className="mt-3 divide-y divide-line border-y border-line">{history.data.map((r) => (
                  <li key={r.id}><button type="button" onClick={() => open(r.id)} className="block w-full py-3 text-left hover:text-accent">
                    <span className="block text-sm font-medium">{r.agent === 'comparison' ? 'Comparison' : 'Research'}{r.status === 'failed' ? ', failed' : ''}</span>
                    <span className="line-clamp-2 block text-xs text-muted">{r.question || r.output?.paragraphs?.[0] || r.error}</span>
                    <span className="text-xs text-faint">{fmtDate(r.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </button></li>))}</ul>}
            </aside>
          </div>
        )}
      {ai.available && <div className="mt-10"><Alert tone="info"><span className="text-sm">Answers are generated by a language model from stored evidence. They can be wrong. Each point links to the value it uses so you can check it.</span></Alert></div>}
    </div>
  );
}
