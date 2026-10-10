#!/usr/bin/env node
/*
 * Data CLI.  npm run seed:<task> [-- --slug <slug>] [-- --geocode]
 *   localities   upsert locality identities from server/src/ingestion/config/localities.json
 *   demo         generate labelled synthetic demo data for localities without source-backed data
 *   osm          ingest OpenStreetMap amenities (Overpass)          — no key required
 *   air-quality  ingest OpenAQ v3 + CPCB (data.gov.in)               — OPENAQ_API_KEY / DATA_GOV_IN_API_KEY
 *   crime        ingest mapped NCRB tables (data.gov.in)             — DATA_GOV_IN_API_KEY + verified mapping
 *   all          localities → demo (fallback) → osm → air-quality → crime
 * All operations are idempotent upserts.
 */
import mongoose from 'mongoose';
import { env } from '../server/src/config/env.js';
import '../server/src/config/outbound.js';
import { Neighborhood } from '../server/src/models/Neighborhood.js';
import { loadLocalityFixtures, upsertLocality } from '../server/src/services/localityService.js';
import { seedDemoFor } from '../server/src/ingestion/demo.js';
import { ingestNeighborhood } from '../server/src/ingestion/pipeline.js';
import { geocode } from '../server/src/ingestion/adapters/nominatim.js';

const [task, ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes(`--${n}`);
const arg = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };
const PROVIDER_FOR = { osm: ['overpass'], 'air-quality': ['air'], crime: ['crime'] };

async function targets() {
  const slug = arg('slug');
  return Neighborhood.find(slug ? { slug } : {}).sort({ name: 1 });
}

async function localities() {
  let n = 0;
  for (const f of loadLocalityFixtures()) {
    let loc = f; let geocodeSource = { provider: 'fixture', ref: 'approximate centre', license: 'N/A' };
    if (flag('geocode')) {
      try {
        const [hit] = await geocode(`${f.name}, ${f.city}, ${f.state}`);
        if (hit) { loc = { ...f, lat: hit.lat, lng: hit.lng, bbox: hit.bbox }; geocodeSource = { provider: 'nominatim', ref: hit.ref, license: 'ODbL 1.0' }; }
      } catch (e) { console.warn(`  geocode failed for ${f.name}: ${e.message}`); }
    }
    await upsertLocality(loc, { origin: 'seed', geocodeSource }); n++;
  }
  console.log(`localities: ${n} upserted`);
}

async function demo() {
  for (const nb of await targets()) {
    const r = await seedDemoFor(nb);
    console.log(`demo  ${nb.slug.padEnd(28)} ${r.skipped ? 'skipped (has source-backed data)' : `${r.metrics} metrics, ${r.pois} POIs, ${r.history} history points`}`);
  }
}

async function ingest(providers) {
  for (const nb of await targets()) {
    const r = await ingestNeighborhood(nb._id, { trigger: 'cli', providers });
    const parts = Object.entries(r.results).map(([p, x]) => `${p}=${x.status}${x.reason ? ` (${x.reason})` : ''}`);
    console.log(`ingest ${nb.slug.padEnd(27)} ${r.status.padEnd(8)} ${parts.join('  ')}`);
  }
}

async function main() {
  mongoose.set('sanitizeFilter', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    if (task === 'localities') await localities();
    else if (task === 'demo') await demo();
    else if (PROVIDER_FOR[task]) await ingest(PROVIDER_FOR[task]);
    else if (task === 'all') { await localities(); await demo(); await ingest(['overpass', 'air', 'crime']); }
    else { console.error('Usage: node scripts/seed.js <localities|demo|osm|air-quality|crime|all> [--slug s] [--geocode]'); process.exitCode = 2; }
  } finally { await mongoose.disconnect(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
