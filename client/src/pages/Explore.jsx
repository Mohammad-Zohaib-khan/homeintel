import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, Plus, SearchX } from 'lucide-react';
import { CATEGORIES } from '@homeintel/shared';
import SearchBox from '../components/SearchBox.jsx';
import MapView from '../components/data/MapView.jsx';
import ScaleBar from '../components/data/ScaleBar.jsx';
import { OriginTag, StatusTag } from '../components/data/Tags.jsx';
import { EmptyState, ErrorState, ListSkeleton } from '../components/States.jsx';
import LocalityLookup from '../components/LocalityLookup.jsx';
import { useResource } from '../lib/useResource.js';
import { nb } from '../lib/endpoints.js';
import { fmtScore, placeLine } from '../lib/format.js';
import { useCompare } from '../lib/compare.jsx';
import { useAuth } from '../lib/auth.jsx';

function CompareToggle({ item }) {
  const { has, toggle, full } = useCompare();
  const on = has(item.slug);
  return (
    <button type="button" onClick={() => toggle(item)} disabled={!on && full} aria-pressed={on}
      aria-label={on ? `Remove ${item.name} from compare` : `Add ${item.name} to compare`}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border text-sm transition-colors disabled:opacity-40 ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted hover:border-ink hover:text-ink'}`}>
      {on ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
    </button>
  );
}

function Row({ item, active, onHover }) {
  const strong = item.score.categories.filter((c) => c.score != null).sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <li id={`row-${item.slug}`} onMouseEnter={() => onHover(item.id)} onFocus={() => onHover(item.id)}
      className={`group grid grid-cols-[3.25rem_1fr_auto] items-center gap-4 border-b border-line px-1 py-4 transition-colors ${active ? 'bg-accent-soft/50' : ''}`}>
      <div className="text-center"><span className="num block text-[1.9rem] leading-none">{fmtScore(item.score.overall)}</span><span className="text-[0.7rem] text-muted">{item.score.band}</span></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/neighborhood/${item.slug}`} className="font-display text-xl font-semibold leading-tight hover:text-accent">{item.name}</Link>
          {item.score.dataMix.isDemo && <OriginTag origin="seed" />}
          <StatusTag status={item.score.status} />
        </div>
        <p className="text-sm text-muted">{placeLine(item)}</p>
        {strong.length > 0 && (
          <p className="mt-1.5 text-xs text-muted">Strongest: {strong.map((c) => `${CATEGORIES.find((x) => x.id === c.id).label} ${fmtScore(c.score)}`).join(', ')}</p>
        )}
      </div>
      <CompareToggle item={item} />
    </li>
  );
}

export default function Explore() {
  useDocumentTitle('Explore localities');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? ''; const city = params.get('city') ?? ''; const sort = params.get('sort') ?? 'score'; const page = Number(params.get('page') ?? 1);
  const { user } = useAuth();
  const [hover, setHover] = useState(null);
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); setParams(p); };

  const { data: facets } = useResource((s) => nb.facets(s), []);
  const { data, error, loading, reload } = useResource((s) => nb.search({ q: q || undefined, city: city || undefined, sort, page, limit: 20 }, s), [q, city, sort, page]);
  const items = data?.data ?? []; const meta = data?.meta;

  const pins = useMemo(() => items.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, label: fmtScore(i.score.overall), title: `${i.name}, score ${fmtScore(i.score.overall)}`, demo: i.score.dataMix.isDemo, slug: i.slug })), [items]);
  const onPin = (id) => { const it = items.find((i) => i.id === id); document.getElementById(`row-${it?.slug}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setHover(id); };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="text-[2.6rem] leading-none sm:text-5xl">Explore localities</h1>
          <p className="mt-2 text-muted">Scored with {user ? <Link to="/personalize" className="text-accent underline underline-offset-4">your priorities</Link> : <>default priorities. <Link to="/personalize" className="text-accent underline underline-offset-4">Set your own</Link></>}.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:w-[34rem]">
          <SearchBox key={q} initial={q} onSubmit={(v) => set('q', v)} placeholder="Filter by name" />
          <label className="sr-only" htmlFor="city">City</label>
          <select id="city" value={city} onChange={(e) => set('city', e.target.value)} className="h-10 rounded-md border border-line-strong bg-raised px-3 text-sm">
            <option value="">All cities</option>
            {facets?.cities?.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
          </select>
          <label className="sr-only" htmlFor="sort">Sort by</label>
          <select id="sort" value={sort} onChange={(e) => set('sort', e.target.value)} className="h-10 rounded-md border border-line-strong bg-raised px-3 text-sm">
            <option value="score">Highest score</option><option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        <section aria-labelledby="results-h" aria-busy={loading}>
          <h2 id="results-h" className="sr-only">Results</h2>
          <p className="mb-1 text-sm text-muted" aria-live="polite">{meta ? `${meta.total} ${meta.total === 1 ? 'locality' : 'localities'}${q ? ` matching “${q}”` : ''}${city ? ` in ${city}` : ''}` : ' '}</p>
          {error ? <ErrorState error={error} onRetry={reload} title="Results could not load" />
            : loading && !data ? <ListSkeleton rows={6} label="Loading localities" />
            : items.length ? (
              <>
                <ul className="border-t border-line">{items.map((it) => <Row key={it.id} item={it} active={hover === it.id} onHover={setHover} />)}</ul>
                {meta.pages > 1 && (
                  <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
                    <button type="button" disabled={page <= 1} onClick={() => set('page', String(page - 1))} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Previous</button>
                    <span className="tnum text-muted">Page {page} of {meta.pages}</span>
                    <button type="button" disabled={page >= meta.pages} onClick={() => set('page', String(page + 1))} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Next</button>
                  </nav>
                )}
              </>
            ) : (
              <EmptyState level={3} icon={SearchX} title={q ? `No locality in HomeIntel matches “${q}”` : 'No localities match these filters'}>
                {q ? <div className="mt-2 space-y-3"><p>HomeIntel can look it up on OpenStreetMap and start collecting its data.</p><LocalityLookup q={q} /></div>
                  : <button type="button" className="text-accent underline underline-offset-4" onClick={() => setParams({})}>Clear filters</button>}
              </EmptyState>
            )}
        </section>
        <div className="lg:sticky lg:top-[84px] lg:h-[calc(100vh-110px)]">
          <MapView pins={pins} activeId={hover} onPinClick={onPin} className="h-80 lg:h-full" label="Map of the localities in the results list" />
          <p className="mt-2 text-xs text-muted">Pins show each locality’s overall score. Amber pins are demo data. The list on this page has the same information.</p>
        </div>
      </div>
    </div>
  );
}
