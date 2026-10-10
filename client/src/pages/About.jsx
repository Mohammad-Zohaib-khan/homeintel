import { Link } from 'react-router';
import PageHeader from '../components/PageHeader.jsx';
import Faq from '../components/Faq.jsx';
import { GranularityTag, OriginTag } from '../components/data/Tags.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

const RULES = [
  ['Education', 'Schools and kindergartens within 1.5 km (full marks at 8), nearest school (full marks within 500 m, zero beyond 2.5 km), colleges within 3 km (full marks at 3).'],
  ['Healthcare', 'Hospitals within 3 km (full marks at 3), nearest hospital (1–3 km), clinics and pharmacies within 1.5 km (full marks at 10).'],
  ['Safety', 'Nearest police and fire stations, plus recorded crime rate when a verified NCRB table is configured. Crime is ranked against the other areas in the same table and is city- or district-level.'],
  ['Air & environment', 'Latest PM2.5 at the nearest OpenAQ station and the CPCB AQI at the nearest CPCB station, converted with the national AQI breakpoints, plus parks within 1 km.'],
  ['Transport', 'Bus stops within 800 m (full marks at 6) and nearest rail or metro station (full marks within 800 m, zero beyond 3 km).'],
  ['Daily essentials', 'Groceries and markets within 1 km (full marks at 8), banks and ATMs within 1 km (full marks at 5).'],
  ['Development signals', 'Construction sites mapped within 2 km (full marks at 5). More activity signals growth, and can also mean disruption.'],
  ['Water, power, connectivity', 'Not scored. No open dataset covers these at neighborhood level across India yet, so HomeIntel shows them as having no data rather than estimating.'],
];

const SOURCES = [
  ['OpenStreetMap via Overpass', 'Schools, hospitals, clinics, pharmacies, police and fire stations, transport, groceries, banks, parks and construction.', 'ODbL 1.0, © OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright'],
  ['Nominatim', 'Turning a locality name into a centre point and boundary box.', 'ODbL 1.0', 'https://nominatim.org/'],
  ['CPCB real-time AQI (data.gov.in)', 'AQI at government monitoring stations, by pollutant.', 'Government Open Data License – India', 'https://www.data.gov.in/catalog/real-time-air-quality-index'],
  ['OpenAQ API v3', 'PM2.5 measurements and monthly history from public monitors.', 'Varies by originating provider', 'https://docs.openaq.org/'],
  ['NCRB Crime in India (data.gov.in)', 'Recorded crime at city, district or state level, once a table has been checked and mapped.', 'Government Open Data License – India', 'https://www.data.gov.in/catalog/crime-india-2023'],
];

export default function About() {
  useDocumentTitle('About');
  return (
    <div>
      <PageHeader title="About HomeIntel">Property listings describe the flat. HomeIntel describes everything around it, from public sources, with the method in the open.</PageHeader>
      <section id="method" aria-labelledby="method-h" className="scroll-mt-24 grid gap-8 lg:grid-cols-[1fr_2fr]">
        <div><h2 id="method-h" className="text-4xl">How scores work</h2><p className="mt-3 text-muted">Every number comes from a fixed rule. The same inputs always give the same score, and AI is never involved.</p></div>
        <div>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Each value becomes a score from 0 to 100 by its rule (below).</li>
            <li>A category’s score is the weighted average of its metrics that have data. Coverage shows how much of the category was available.</li>
            <li>The overall score is the weighted average of categories with data, using your <Link to="/personalize" className="text-accent underline">priorities</Link> (0–5 each). Categories with no data are left out and listed.</li>
          </ol>
          <dl className="mt-6 divide-y divide-line border-y border-line">
            {RULES.map(([k, v]) => <div key={k} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><dt className="font-medium">{k}</dt><dd className="text-muted">{v}</dd></div>)}
          </dl>
          <p className="mt-3 text-sm text-muted">Score bands: 80+ excellent, 65+ strong, 50+ fair, 35+ weak, below 35 poor. Scoring rules version 1.0.0.</p>
        </div>
      </section>
      <section id="sources" aria-labelledby="sources-h" className="mt-16 scroll-mt-24 grid gap-8 border-t border-line pt-12 lg:grid-cols-[1fr_2fr]">
        <div><h2 id="sources-h" className="text-4xl">Data sources</h2><p className="mt-3 text-muted">Only public and open sources. Each value records where and when it was collected.</p></div>
        <ul className="divide-y divide-line border-y border-line">
          {SOURCES.map(([n, d, l, u]) => <li key={n} className="py-4"><a href={u} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-4">{n}<span className="sr-only"> (opens in a new tab)</span></a><p className="mt-1 text-muted">{d}</p><p className="mt-1 text-xs text-faint">Licence: {l}</p></li>)}
        </ul>
      </section>
      <section aria-labelledby="honest-h" className="mt-16 grid gap-8 border-t border-line pt-12 lg:grid-cols-[1fr_2fr]">
        <h2 id="honest-h" className="text-4xl">What the labels promise</h2>
        <div className="space-y-4 text-muted">
          <p><GranularityTag granularity="city" /> A value labelled city-wide, district-wide or state-wide describes that whole area. It is never presented as a fact about your street.</p>
          <p><GranularityTag granularity="station" /> Air quality is measured at monitoring stations. HomeIntel shows the station and its distance; a station 8 km away is a rough guide only.</p>
          <p><OriginTag origin="seed" /> Demo data is synthetic. It lets you try HomeIntel without network access, and is replaced the moment real data is collected. Demo and real values are never mixed for one locality.</p>
        </div>
      </section>
      <section aria-labelledby="faq2" className="mt-16 grid gap-8 border-t border-line pt-12 lg:grid-cols-[1fr_2fr]">
        <h2 id="faq2" className="text-4xl">More questions</h2>
        <Faq items={[
          ['Why does OpenStreetMap show fewer schools than I know exist?', 'OpenStreetMap is mapped by volunteers and coverage varies by city. Counts reflect what is mapped. You can improve it by contributing to OpenStreetMap.'],
          ['How fresh is the data?', 'Air quality is refreshed when a profile is refreshed and flagged as stale after 3 days. Amenities are cached for a week and flagged after 4 months. Crime tables are annual.'],
          ['Can I add a locality?', 'Yes. Signed-in users can search for any Indian locality on Explore; HomeIntel finds it on OpenStreetMap and starts collecting its data.'],
          ['Is my data sold or tracked?', <>No. There are no analytics or advertising trackers. See the <Link to="/privacy" className="text-accent underline">privacy notice</Link>.</>],
        ]} />
      </section>
    </div>
  );
}
