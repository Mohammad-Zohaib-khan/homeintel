import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, Check, Info, Loader2, Plus, RefreshCw } from 'lucide-react';
import ContourScore from '../components/data/ContourScore.jsx';
import { DemoBanner, OriginTag, StatusTag } from '../components/data/Tags.jsx';
import CategoryLedger from '../components/profile/CategoryLedger.jsx';
import AmenityMap from '../components/profile/AmenityMap.jsx';
import { EvidenceTable, SourceList } from '../components/profile/EvidenceTable.jsx';
import ProfileActions from '../components/profile/ProfileActions.jsx';
import { ErrorState, Skeleton } from '../components/States.jsx';
import { Button } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { useResource } from '../lib/useResource.js';
import { nb } from '../lib/endpoints.js';
import { fmtRelative, fmtScore, placeLine } from '../lib/format.js';
import { useCompare } from '../lib/compare.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import NotFound from './NotFound.jsx';
import AiExplain from '../components/AiExplain.jsx';

// The chart library is only needed below the fold; load it separately.
const AirTrend = lazy(() => import('../components/profile/AirTrend.jsx'));

const SECTIONS = [['categories', 'Categories'], ['map', 'Map'], ['air', 'Air quality'], ['evidence', 'Evidence'], ['sources', 'Sources']];
const ACTIVE_INGESTION = ['queued', 'running'];

function Section({ id, title, intro, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-line pt-8">
      <div className="mb-5 max-w-2xl"><h2 id={`${id}-h`} className="text-3xl">{title}</h2>{intro && <p className="mt-1.5 text-muted">{intro}</p>}</div>
      {children}
    </section>
  );
}

function IngestionNotice({ ingestion }) {
  if (ACTIVE_INGESTION.includes(ingestion.status)) {
    return <div role="status" className="flex items-center gap-3 rounded-md border border-accent/40 bg-accent-soft px-4 py-3 text-sm"><Loader2 size={17} className="animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />Collecting data from OpenStreetMap and air-quality sources. This page updates by itself when it finishes.</div>;
  }
  const failed = Object.entries(ingestion.providers ?? {}).filter(([, r]) => r?.status === 'failed');
  if (!failed.length) return null;
  return (
    <div role="note" className="flex gap-3 rounded-md border border-warn/40 bg-surface px-4 py-3 text-sm">
      <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
      <p>The last refresh was partial. {failed.map(([p, r]) => `${p === 'overpass' ? 'OpenStreetMap' : p === 'air' ? 'Air quality' : 'Crime data'}: ${r.reason ?? 'failed'}`).join('. ')}. Values below are the most recent successful ones.</p>
    </div>
  );
}

function QualityFlags({ quality }) {
  const flags = (quality.data?.flags ?? []).filter((f) => f.code !== 'DEMO_DATA' && f.code !== 'PROVIDER_FAILED');
  if (!flags.length) return null;
  return (
    <details className="rounded-md border border-line bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium"><Info size={15} className="mr-1.5 inline text-muted" aria-hidden="true" />{flags.length} data-quality {flags.length === 1 ? 'note' : 'notes'}</summary>
      <ul className="mt-2 space-y-1.5 text-muted">{flags.map((f, i) => <li key={i} className={f.level === 'warning' ? 'text-warn' : ''}>{f.message}</li>)}</ul>
    </details>
  );
}

export default function Neighborhood() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { has, toggle, full } = useCompare();
  const profile = useResource((s) => nb.profile(id, undefined, s), [id, user?.id]);
  const metrics = useResource((s) => nb.metrics(id, s), [id]);
  const pois = useResource((s) => nb.pois(id, { limit: 500 }, s), [id]);
  const history = useResource((s) => nb.history(id, 'pm25', s), [id]);
  const sources = useResource((s) => nb.sources(id, s), [id]);
  const quality = useResource((s) => nb.quality(id, s), [id]);
  const n = profile.data?.neighborhood; const score = profile.data?.score;
  useDocumentTitle(n ? `${n.name}, ${n.city}` : 'Neighborhood');

  // Poll while ingestion runs, then refresh every section once.
  const running = n && ACTIVE_INGESTION.includes(n.ingestion?.status);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => profile.reload(), 4000);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastStatus = n?.ingestion?.status;
  useEffect(() => { if (lastStatus && !ACTIVE_INGESTION.includes(lastStatus)) { metrics.reload(); pois.reload(); history.reload(); sources.reload(); quality.reload(); } }, [lastStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const station = useMemo(() => metrics.data?.find((m) => m.key === 'pm25')?.scope ?? '', [metrics.data]);

  if (profile.error?.status === 404) return <NotFound />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} title="This profile could not load" />;
  if (!n) {
    return <div aria-busy="true" aria-label="Loading profile" className="grid gap-10 lg:grid-cols-[1fr_auto]"><div className="space-y-4"><Skeleton className="h-14 w-2/3" /><Skeleton className="h-5 w-1/3" /><Skeleton className="mt-8 h-40 w-full" /></div><Skeleton className="h-56 w-56 rounded-full" /></div>;
  }

  async function refresh() {
    try { const r = await nb.refresh(n.slug); toast.info(r.queued ? 'Refresh started. This page updates when it finishes.' : 'A refresh is already running.'); profile.reload(); }
    catch (e) { toast.error(e.message); }
  }
  const inCompare = has(n.slug);
  const covered = score.categories.filter((c) => c.score != null && c.weight > 0).length;
  const weighted = score.categories.filter((c) => c.weight > 0).length;

  return (
    <article aria-labelledby="nb-title">
      <header className="grid gap-8 pb-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-muted">{placeLine(n)}{n.district && n.district !== n.city ? `, ${n.district} district` : ''}</p>
          <h1 id="nb-title" className="mt-1 text-[3.2rem] leading-[0.95] sm:text-[4.6rem]">{n.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {score.dataMix.isDemo ? <OriginTag origin="seed" /> : <OriginTag origin={score.dataMix.live ? 'live' : 'cached'} />}
            <StatusTag status={score.status} />
            <span className="text-sm text-muted">Data collected {fmtRelative(profile.data.lastCollected)}</span>
          </div>
          <p className="mt-5 max-w-xl text-muted">
            Scored on {covered} of {weighted} categories using {user?.id ? <Link to="/personalize" className="text-accent underline underline-offset-4">your priorities</Link> : <Link to="/personalize" className="text-accent underline underline-offset-4">default priorities</Link>}. {score.missing.length ? `No data for ${score.categories.filter((c) => c.score == null).map((c) => c.label.toLowerCase()).join(', ')}.` : ''}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant={inCompare ? 'primary' : 'secondary'} onClick={() => toggle(n)} disabled={!inCompare && full} aria-pressed={inCompare}>
              {inCompare ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{inCompare ? 'In compare' : 'Add to compare'}
            </Button>
            <ProfileActions neighborhood={n} />
            {user && <Button variant="ghost" onClick={refresh} disabled={running}><RefreshCw size={16} aria-hidden="true" />Refresh data</Button>}
          </div>
        </div>
        <div className="flex justify-center lg:justify-end"><ContourScore score={score.overall} seed={n.slug} size={248} demo={score.dataMix.isDemo} /></div>
      </header>

      <div className="mb-8 space-y-3">
        {score.dataMix.isDemo && <DemoBanner />}
        <IngestionNotice ingestion={n.ingestion} />
        <QualityFlags quality={quality} />
      </div>

      <nav aria-label="Profile sections" className="no-print sticky top-[60px] z-30 -mx-4 mb-8 overflow-x-auto border-y border-line bg-ground/95 px-4 backdrop-blur-[6px] sm:mx-0 sm:px-0">
        <ul className="flex gap-1 text-sm">{SECTIONS.map(([sid, label]) => <li key={sid}><a href={`#${sid}`} className="block whitespace-nowrap px-3 py-3 text-muted hover:text-ink">{label}</a></li>)}</ul>
      </nav>

      <div className="space-y-14">
        <Section id="categories" title="Category scores" intro="Open a category to see each metric, the rule that scored it, and how much it adds."><CategoryLedger score={score} /></Section>
        <Section id="map" title="What’s nearby" intro="Amenities mapped around the area centre. Switch to the list for the same information without the map."><AmenityMap n={n} pois={pois} /></Section>
        <Section id="air" title="Air quality over time" intro="Monthly PM2.5 at the nearest station with history. Stations are representative of the area, not exact for every street."><Suspense fallback={<Skeleton className="h-64 w-full" />}><AirTrend history={history} stationLabel={station} /></Suspense></Section>
        <Section id="evidence" title="Evidence" intro="Every value behind this profile, what area it covers, and when it was collected."><EvidenceTable metrics={metrics} /></Section>
        <Section id="sources" title="Sources and licences"><SourceList sources={sources} /></Section>
      </div>
      <AiExplain kind="research" neighborhoodIds={[n.slug]} />
      <p className="mt-10 text-sm text-muted">Overall {fmtScore(score.overall)} of 100. <Link to="/about#method" className="text-accent underline underline-offset-4">How scores work</Link></p>
    </article>
  );
}
