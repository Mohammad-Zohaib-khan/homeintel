import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { DEFAULT_WEIGHTS, WEIGHT_PRESETS } from '@homeintel/shared';
import PageHeader from '../components/PageHeader.jsx';
import WeightSliders from '../components/WeightSliders.jsx';
import { Button, Alert } from '../components/ui.jsx';
import { ErrorState, ListSkeleton } from '../components/States.jsx';
import { OriginTag } from '../components/data/Tags.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../lib/auth.jsx';
import { prefs, nb } from '../lib/endpoints.js';
import { useResource } from '../lib/useResource.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { fmtScore, placeLine, weightsToQuery } from '../lib/format.js';

const same = (a, b) => a && b && Object.keys(DEFAULT_WEIGHTS).every((k) => a[k] === b[k]);

function Preview({ weights }) {
  const [debounced, setDebounced] = useState(weights);
  useEffect(() => { const t = setTimeout(() => setDebounced(weights), 250); return () => clearTimeout(t); }, [weights]);
  const mine = useResource((s) => nb.search({ sort: 'score', limit: 6, weights: weightsToQuery(debounced) }, s), [weightsToQuery(debounced)]);
  const base = useResource((s) => nb.search({ sort: 'score', limit: 50, weights: weightsToQuery(DEFAULT_WEIGHTS) }, s), []);
  const baseRank = useMemo(() => Object.fromEntries((base.data?.data ?? []).map((x, i) => [x.slug, i + 1])), [base.data]);
  if (mine.error) return <ErrorState error={mine.error} onRetry={mine.reload} title="Preview unavailable" />;
  if (!mine.data) return <ListSkeleton rows={6} label="Ranking localities" />;
  return (
    <ol className="divide-y divide-line border-y border-line" aria-live="polite" aria-busy={mine.loading}>
      {mine.data.data.map((x, i) => {
        const was = baseRank[x.slug]; const move = was ? was - (i + 1) : 0;
        return (
          <li key={x.slug} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 py-3">
            <span className="num text-lg text-muted">{i + 1}</span>
            <span className="min-w-0"><Link to={`/neighborhood/${x.slug}`} className="block truncate font-medium hover:text-accent">{x.name}</Link><span className="block truncate text-xs text-muted">{placeLine(x)}{move ? `, ${move > 0 ? `up ${move}` : `down ${-move}`} from default ranking` : ''}</span></span>
            <span className="num text-2xl">{fmtScore(x.score.overall)}</span>
          </li>
        );
      })}
      {mine.data.data.some((x) => x.score.dataMix.isDemo) && <li className="py-2"><OriginTag origin="seed" /> <span className="text-xs text-muted">Ranking uses demo data.</span></li>}
    </ol>
  );
}

export default function Personalize() {
  useDocumentTitle('Your priorities');
  const { user } = useAuth();
  const toast = useToast();
  const saved = useResource((s) => prefs.get(s), [user?.id], { enabled: !!user });
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (saved.data) setWeights(saved.data.weights); }, [saved.data]);
  const preset = WEIGHT_PRESETS.find((p) => same(p.weights, weights));
  const dirty = user && saved.data && !same(saved.data.weights, weights);

  async function save() {
    setBusy(true);
    try { const r = await prefs.set({ weights, presetId: preset?.id ?? null }); saved.setData(r); toast.success('Priorities saved. Every score now uses them.'); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try { const r = await prefs.reset(); saved.setData(r); setWeights(r.weights); toast.info('Priorities reset to defaults'); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Your priorities">How much each category counts toward the overall score. Category scores never change; only how they are combined does.</PageHeader>
      {!user && <Alert tone="info">You can try priorities here without an account. <Link to="/login?next=/personalize" className="font-medium text-accent underline">Sign in</Link> to save them and apply them across HomeIntel.</Alert>}
      {saved.error && <ErrorState error={saved.error} onRetry={saved.reload} title="Your saved priorities could not load" />}
      <div className="mt-6 grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <fieldset>
            <legend className="mb-3 text-xl font-display font-semibold">Start from a profile</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEIGHT_PRESETS.map((p) => (
                <label key={p.id} className={`flex cursor-pointer gap-3 rounded-md border px-4 py-3 ${preset?.id === p.id ? 'border-accent bg-accent-soft/50' : 'border-line bg-surface hover:border-line-strong'}`}>
                  <input type="radio" name="preset" className="mt-1 accent-[rgb(var(--accent))]" checked={preset?.id === p.id} onChange={() => setWeights({ ...p.weights })} />
                  <span><span className="block font-medium">{p.label}</span><span className="text-sm text-muted">{p.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <h2 className="mb-2 mt-10 text-xl">Fine-tune</h2>
          <WeightSliders weights={weights} onChange={setWeights} />
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {user ? <><Button onClick={save} loading={busy} disabled={!dirty}>Save priorities</Button><Button variant="ghost" onClick={reset} disabled={busy || saved.data?.isDefault}>Reset to defaults</Button>{dirty && <span className="text-sm text-warn">Unsaved changes</span>}</>
              : <Link to="/register" className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-surface">Create an account to save</Link>}
          </div>
        </div>
        <aside aria-labelledby="preview-h" className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="preview-h" className="text-xl">Top localities with these priorities</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Updates as you move the sliders. Movement is compared with the default ranking.</p>
          <Preview weights={weights} />
        </aside>
      </div>
    </div>
  );
}
