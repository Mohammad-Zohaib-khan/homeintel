import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bookmark, GitCompareArrows, Link2, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_WEIGHTS, MAX_COMPARE } from '@homeintel/shared';
import PageHeader from '../components/PageHeader.jsx';
import SearchBox from '../components/SearchBox.jsx';
import ContourScore from '../components/data/ContourScore.jsx';
import ScaleBar from '../components/data/ScaleBar.jsx';
import { DemoBanner, OriginTag } from '../components/data/Tags.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import WeightSliders from '../components/WeightSliders.jsx';
import CreateReportButton from '../components/CreateReportButton.jsx';
import AiExplain from '../components/AiExplain.jsx';
import Dialog from '../components/Dialog.jsx';
import { Button, TextField } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { nb, comparisons, prefs } from '../lib/endpoints.js';
import { useAuth } from '../lib/auth.jsx';
import { useCompare } from '../lib/compare.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { fmtScore, placeLine } from '../lib/format.js';

function SaveComparison({ ids, weights, names }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try { await comparisons.save({ name: name.trim() || names.join(' vs '), neighborhoodIds: ids, weights }); toast.success('Comparison saved'); setOpen(false); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Bookmark size={16} aria-hidden="true" />Save comparison</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Save this comparison">
        <form onSubmit={save} className="space-y-4">
          <TextField label="Name" placeholder={names.join(' vs ')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <p className="text-sm text-muted">The neighborhoods and the priorities shown are saved. Scores update as data refreshes.</p>
          <div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
    </>
  );
}

export default function Compare() {
  useDocumentTitle('Compare');
  const [params, setParams] = useSearchParams();
  const ids = useMemo(() => (params.get('ids') ?? '').split(',').filter((x) => /^[a-z0-9-]{1,120}$/.test(x)).slice(0, MAX_COMPARE), [params]);
  const { user } = useAuth();
  const tray = useCompare();
  const toast = useToast();
  const [weights, setWeights] = useState(null);
  const [showWeights, setShowWeights] = useState(false);
  const [state, setState] = useState({ loading: false, data: null, error: null });

  // Start from the user's saved priorities (or defaults); edits here are temporary unless saved.
  useEffect(() => {
    if (weights) return;
    if (user) prefs.get().then((p) => setWeights(p.weights)).catch(() => setWeights({ ...DEFAULT_WEIGHTS }));
    else setWeights({ ...DEFAULT_WEIGHTS });
  }, [user, weights]);

  useEffect(() => {
    if (ids.length < 2 || !weights) { setState({ loading: false, data: null, error: null }); return undefined; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(() => nb.compare(ids, weights).then((data) => live && setState({ loading: false, data, error: null })).catch((error) => live && setState({ loading: false, data: null, error })), 150);
    return () => { live = false; clearTimeout(t); };
  }, [ids.join(','), weights]); // eslint-disable-line react-hooks/exhaustive-deps

  const setIds = (next) => setParams(next.length ? { ids: next.join(',') } : {});
  const add = (slug) => { if (!ids.includes(slug) && ids.length < MAX_COMPARE) setIds([...ids, slug]); };
  const remove = (slug) => setIds(ids.filter((x) => x !== slug));
  const copyLink = async () => { try { await navigator.clipboard.writeText(window.location.href); toast.success('Link copied'); } catch { toast.error('Copy is blocked in this browser.'); } };

  const d = state.data;
  const byId = d ? Object.fromEntries(d.neighborhoods.map((e) => [e.id, e])) : {};
  const anyDemo = d?.neighborhoods.some((e) => e.score.dataMix.isDemo);
  const cols = d?.neighborhoods.length ?? ids.length;

  return (
    <div>
      <PageHeader title="Compare neighborhoods" actions={d && (
        <>
          <Button variant="ghost" onClick={copyLink}><Link2 size={16} aria-hidden="true" />Copy link</Button>
          {user && <SaveComparison ids={ids} weights={weights} names={d.neighborhoods.map((e) => e.neighborhood.name)} />}
          {user && <CreateReportButton neighborhoods={d.neighborhoods.map((e) => e.neighborhood)} weights={weights} variant="primary" />}
        </>
      )}>
        Up to {MAX_COMPARE} side by side, on the same rules and the same priorities. Look for the trade-offs, not just the highest number.
      </PageHeader>

      {ids.length < MAX_COMPARE && (
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:w-96"><SearchBox placeholder="Add a locality to compare" onSelect={(it) => add(it.slug)} /></div>
          {tray.items.filter((i) => !ids.includes(i.slug)).length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">From your tray:
              {tray.items.filter((i) => !ids.includes(i.slug)).map((i) => <button key={i.slug} type="button" onClick={() => add(i.slug)} className="rounded-sm border border-line bg-surface px-2 py-0.5 text-ink hover:border-accent">{i.name}</button>)}
            </p>
          )}
        </div>
      )}

      {ids.length < 2 ? (
        <EmptyState icon={GitCompareArrows} title={ids.length ? 'Add one more neighborhood' : 'Pick two or more neighborhoods'}
          action={!ids.length && tray.items.length >= 2 ? <Button onClick={() => setIds(tray.items.map((i) => i.slug))}>Compare your tray ({tray.items.length})</Button> : null}>
          Search above, or use the + button on <Link to="/explore" className="text-accent underline underline-offset-4">Explore</Link> to collect localities in your compare tray.
          {ids.length === 1 && <p className="mt-2">Selected: {ids[0]}</p>}
        </EmptyState>
      ) : state.error ? <ErrorState error={state.error} onRetry={() => setWeights({ ...weights })} title="The comparison could not load" />
        : !d ? <div aria-busy="true" aria-label="Loading comparison" className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>{ids.map((i) => <Skeleton key={i} className="h-72" />)}</div>
        : (
          <div aria-busy={state.loading}>
            {anyDemo && <DemoBanner className="mb-6" />}
            {d.comparison.summary && <p className="mb-6 rounded-md border border-line bg-surface px-4 py-3">{d.comparison.summary}</p>}

            {/* Mobile: stacked by category, one bar per neighborhood */}
            <div className="md:hidden">
              <ul className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                {d.neighborhoods.map((e) => (
                  <li key={e.id} className="rounded-md border border-line bg-surface p-3">
                    <Link to={`/neighborhood/${e.neighborhood.slug}`} className="block truncate font-display text-lg font-semibold leading-tight">{e.neighborhood.name}</Link>
                    <span className="num block text-4xl leading-none">{fmtScore(e.score.overall)}</span>
                    <span className="text-xs text-muted">{e.score.band}</span>
                    <button type="button" onClick={() => remove(e.neighborhood.slug)} className="mt-2 block text-xs text-muted underline">Remove</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setShowWeights(true)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"><SlidersHorizontal size={15} aria-hidden="true" />Adjust priorities</button>
              <dl className="divide-y divide-line border-y border-line">
                {[...d.comparison.categories].sort((a, b) => a.values.every((v) => v.score == null) - b.values.every((v) => v.score == null)).map((c) => (
                  <div key={c.id} className="py-3">
                    <dt className="mb-2 flex justify-between text-sm"><span className="font-medium">{c.label}</span><span className="text-muted">weight {weights?.[c.id] ?? '—'}</span></dt>
                    {c.values.map((v) => (
                      <dd key={v.id} className="grid grid-cols-[6.5rem_1fr_2.25rem] items-center gap-2 py-0.5 text-sm">
                        <span className="truncate text-muted">{byId[v.id]?.neighborhood.name}</span>
                        <ScaleBar value={v.score} tone={byId[v.id]?.score.dataMix.isDemo ? 'demo' : undefined} />
                        <span className={`num text-right text-lg ${c.leaders.includes(v.id) ? 'text-accent' : ''}`}>{fmtScore(v.score)}{c.leaders.includes(v.id) && <span className="sr-only"> (leads)</span>}</span>
                      </dd>
                    ))}
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted">Green numbers lead their category by 5 points or more.</p>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] table-fixed border-collapse">
                <caption className="sr-only">Category scores for each neighborhood. “Leads” marks a lead of 5 points or more.</caption>
                <colgroup><col className="w-44" />{d.neighborhoods.map((e) => <col key={e.id} />)}</colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="align-bottom"><span className="sr-only">Category</span>
                      <button type="button" onClick={() => setShowWeights(true)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-normal text-accent underline-offset-4 hover:underline"><SlidersHorizontal size={15} aria-hidden="true" />Adjust priorities</button></th>
                    {d.neighborhoods.map((e) => (
                      <th key={e.id} scope="col" className="px-3 pb-4 text-left align-bottom font-normal">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><Link to={`/neighborhood/${e.neighborhood.slug}`} className="block truncate font-display text-2xl font-semibold hover:text-accent">{e.neighborhood.name}</Link><span className="block truncate text-sm text-muted">{placeLine(e.neighborhood)}</span></div>
                          <button type="button" onClick={() => remove(e.neighborhood.slug)} aria-label={`Remove ${e.neighborhood.name}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><X size={15} aria-hidden="true" /></button>
                        </div>
                        <div className="mt-3 flex justify-center"><ContourScore score={e.score.overall} seed={e.neighborhood.slug} size={150} demo={e.score.dataMix.isDemo} animate={false} /></div>
                        <div className="mt-2 flex justify-center">{e.score.dataMix.isDemo ? <OriginTag origin="seed" /> : <OriginTag origin="live" />}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...d.comparison.categories].sort((a, b) => a.values.every((v) => v.score == null) - b.values.every((v) => v.score == null)).map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <th scope="row" className="py-3 pr-3 text-left align-top font-medium">{c.label}<span className="block text-xs font-normal text-muted">Weight {weights?.[c.id] ?? '—'} of 5</span></th>
                      {c.values.map((v) => {
                        const lead = c.leaders.includes(v.id);
                        return (
                          <td key={v.id} className={`px-3 py-3 align-top ${lead ? 'bg-accent-soft/60' : ''}`}>
                            <div className="flex items-baseline justify-between gap-2"><span className="num text-2xl">{fmtScore(v.score)}</span>{lead && <span className="text-xs font-medium text-accent">Leads</span>}{v.score == null && <span className="text-xs text-muted">No data</span>}</div>
                            <ScaleBar value={v.score} className="mt-1.5" tone={byId[v.id]?.score.dataMix.isDemo ? 'demo' : undefined} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section aria-labelledby="tradeoffs" className="mt-12 border-t border-line pt-8">
              <h2 id="tradeoffs" className="text-3xl">Trade-offs</h2>
              <div className="mt-5 grid gap-x-8 gap-y-6" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(14rem, 1fr))` }}>
                {d.comparison.tradeoffs.map((t) => {
                  const e = byId[t.id];
                  const lbl = (ids2) => ids2.map((x) => d.comparison.categories.find((c) => c.id === x)?.label.toLowerCase()).join(', ');
                  return (
                    <div key={t.id} className="border-t-2 border-ink pt-3">
                      <h3 className="text-xl">{e.neighborhood.name}</h3>
                      <p className="mt-1 text-sm"><span className="font-medium">Ahead on: </span><span className="text-muted">{t.strengths.length ? lbl(t.strengths) : 'no category by 5 points or more'}</span></p>
                      <p className="mt-1 text-sm"><span className="font-medium">Behind on: </span><span className="text-muted">{t.gaps.length ? lbl(t.gaps) : 'no category by 5 points or more'}</span></p>
                    </div>
                  );
                })}
              </div>
            </section>
            <AiExplain kind="comparison" neighborhoodIds={ids} weights={weights} />
          </div>
        )}

      <Dialog open={showWeights} onClose={() => setShowWeights(false)} title="Priorities for this comparison" wide>
        <p className="mb-4 text-sm text-muted">Changes apply here only. {user ? <>To change them everywhere, use <Link to="/personalize" className="text-accent underline">Priorities</Link>.</> : 'Sign in to save them.'}</p>
        {weights && <WeightSliders weights={weights} onChange={setWeights} compact />}
        <div className="mt-5 flex gap-2"><Button onClick={() => setShowWeights(false)}>Done</Button><Button variant="ghost" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>Reset to defaults</Button></div>
      </Dialog>
    </div>
  );
}

