import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { Link } from 'react-router';
import { CATEGORIES } from '@homeintel/shared';
import SearchBox from '../components/SearchBox.jsx';
import ContourScore from '../components/data/ContourScore.jsx';
import ScaleBar from '../components/data/ScaleBar.jsx';
import { OriginTag, GranularityTag } from '../components/data/Tags.jsx';
import { Skeleton } from '../components/States.jsx';
import Faq from '../components/Faq.jsx';
import CoverageGlobe from '../components/CoverageGlobe.jsx';
import HeroMap from '../components/HeroMap.jsx';
import { useResource } from '../lib/useResource.js';
import { nb } from '../lib/endpoints.js';
import { fmtScore, placeLine } from '../lib/format.js';

function Specimen() {
  const { data, error, loading } = useResource((s) => nb.search({ sort: 'score', limit: 1 }, s), []);
  const top = data?.data?.[0];
  if (loading) return <div className="rounded-lg border border-line bg-surface p-6" aria-busy="true" aria-label="Loading an example profile"><Skeleton className="mx-auto h-52 w-52 rounded-full" /><Skeleton className="mt-6 h-4 w-2/3" /><Skeleton className="mt-3 h-4 w-1/2" /></div>;
  if (error || !top) return <div className="rounded-lg border border-dashed border-line-strong p-6 text-sm text-muted">No localities are loaded yet. Run <code>npm run seed:all</code> on the server to load localities.</div>;
  const cats = top.score.categories.filter((c) => c.score != null).slice(0, 5);
  return (
    <figure className="rounded-lg border border-line bg-surface p-5 shadow-raise sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm text-muted">Highest-scoring locality in HomeIntel right now</p><p className="mt-0.5 font-display text-2xl font-semibold">{top.name}</p><p className="text-sm text-muted">{placeLine(top)}</p></div>
        {top.score.dataMix.isDemo && <OriginTag origin="seed" />}
      </div>
      <div className="my-4 flex justify-center"><ContourScore score={top.score.overall} seed={top.slug} size={208} demo={top.score.dataMix.isDemo} /></div>
      <ul className="space-y-2.5">
        {cats.map((c) => {
          const label = CATEGORIES.find((x) => x.id === c.id)?.label;
          return <li key={c.id} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm"><span className="text-muted">{label}</span><ScaleBar value={c.score} tone={top.score.dataMix.isDemo ? 'demo' : undefined} /><span className="num text-right text-base">{fmtScore(c.score)}</span></li>;
        })}
      </ul>
      <figcaption className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
        <span className="text-muted">Scores out of 100</span>
        <Link to={`/neighborhood/${top.slug}`} className="font-medium text-accent underline-offset-4 hover:underline">Open the full profile</Link>
      </figcaption>
    </figure>
  );
}

function Cities() {
  const { data } = useResource((s) => nb.facets(s), []);
  if (!data?.cities?.length) return null;
  return (
    <p className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm text-muted">
      <span className="mr-1">Browse by city:</span>
      {data.cities.map((c) => <Link key={c.city} to={`/explore?city=${encodeURIComponent(c.city)}`} className="rounded-sm border border-line bg-surface px-2 py-0.5 text-ink hover:border-accent hover:text-accent">{c.city}</Link>)}
    </p>
  );
}

const STEPS = [
  ['Locate', 'The locality is resolved to a centre point and an analysis radius, using OpenStreetMap geocoding.'],
  ['Collect', 'Amenities come from OpenStreetMap, air quality from the nearest CPCB and OpenAQ stations, crime from NCRB tables where one is configured.'],
  ['Normalise', 'Each value becomes a 0–100 score by a fixed rule. For example, 8 schools within 1.5 km earns full marks.'],
  ['Weigh', 'Categories are combined using your priorities. Categories with no data are left out and listed, never guessed.'],
];

const FAQ = [
  ['Where does the data come from?', <>Amenities are from OpenStreetMap via the Overpass API. Air quality comes from CPCB monitoring stations (via data.gov.in) and OpenAQ. Crime figures come from NCRB tables on data.gov.in. Each value in a profile links to its source, with the date it was collected. See <Link className="text-accent underline" to="/about#sources">data sources</Link>.</>],
  ['Does AI decide the scores?', 'No. Scores are computed by fixed rules that you can read on every profile. The optional research assistant only explains and summarises evidence that HomeIntel already stores. It cannot change a number.'],
  ['Why do some values say “City-wide” or “Nearby station”?', 'Some official data only exists for a whole city or district, and air quality is measured at monitoring stations. HomeIntel labels this every time so a city-wide figure is never mistaken for your street.'],
  ['What does “Demo data” mean?', 'When HomeIntel runs without network access or API keys, it shows synthetic values so the product can be tried. They are labelled everywhere and replaced automatically once real data is collected.'],
  ['Why is there no score for power or water?', 'No open dataset covers outages or water supply at neighborhood level across India yet. Rather than estimate, HomeIntel shows the category as having no data.'],
];

export default function Home() {
  useDocumentTitle(undefined);
  return (
    <>
      <HeroMap>
        <h1 id="hero" className="text-[3rem] leading-[0.95] sm:text-[3.8rem]">Know the neighborhood before you sign.</h1>
        <p className="mt-6 max-w-md text-lg text-muted">HomeIntel brings together amenities, air quality and public safety records for Indian localities. It scores them by published rules and shows where every number came from.</p>
        <div className="mt-8 max-w-md"><SearchBox size="lg" autoFocus={false} /></div>
        <Cities />
      </HeroMap>

      <section aria-labelledby="specimen" className="grid items-center gap-10 pb-16 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <h2 id="specimen" className="text-4xl">A profile, live from the data</h2>
          <p className="mt-3 max-w-md text-muted">This is the highest-scoring locality in HomeIntel right now. Every category bar opens into the measurements behind it, with the source and the date each value was collected.</p>
          <Link to="/explore" className="mt-6 inline-flex rounded-sm border border-ink px-4 py-2 font-medium hover:bg-ink hover:text-surface">Explore all localities</Link>
        </div>
        <Specimen />
      </section>

      <CoverageGlobe />

      <section aria-labelledby="how" className="border-t border-line py-16" id="method">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="how" className="text-4xl">How a score is made</h2>
            <p className="mt-3 max-w-sm text-muted">The same four steps run for every locality. Change your priorities and only the last step changes.</p>
          </div>
          <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="border-t-2 border-ink pt-4">
                <p className="num text-sm text-muted">Step {i + 1}</p>
                <h3 className="mt-1 text-2xl">{t}</h3>
                <p className="mt-2 text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="labels" className="border-t border-line py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="labels" className="text-4xl">Every value says what it covers</h2>
            <p className="mt-3 max-w-sm text-muted">Each value carries two labels: how local it is, and how trustworthy its origin is.</p>
          </div>
          <dl className="divide-y divide-line border-y border-line">
            {[
              [<GranularityTag key="a" granularity="neighborhood" />, 'Measured around this locality’s centre, such as schools within 1.5 km.'],
              [<GranularityTag key="b" granularity="station" />, 'Read at the nearest air-quality monitor. The distance is always shown.'],
              [<GranularityTag key="c" granularity="city" />, 'Published for the whole city, such as NCRB crime rates. It does not describe your street.'],
              [<OriginTag key="d" origin="live" />, 'Collected from the named public source, with the collection date.'],
              [<OriginTag key="e" origin="seed" />, 'Synthetic, for trying the product offline. It never describes the real place.'],
            ].map(([tag, text], i) => (
              <div key={i} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr] sm:items-center"><dt>{tag}</dt><dd className="text-muted">{text}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="faq" className="border-t border-line py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 id="faq" className="text-4xl">Questions</h2>
          <Faq items={FAQ} />
        </div>
      </section>
    </>
  );
}
