import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Neighborhood } from '../models/Neighborhood.js';
import { normName, slugify } from '../utils/geo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const loadLocalityFixtures = () => JSON.parse(fs.readFileSync(path.join(here, '../ingestion/config/localities.json'), 'utf8')).localities;

export const searchKeyFor = (n) => normName([n.name, n.locality, n.city, n.district, n.state].filter(Boolean).join(' '));
export const slugFor = (n) => slugify(`${n.name} ${n.city}`);

export async function upsertLocality(n, { origin, geocodeSource, createdBy = null } = {}) {
  const slug = slugFor(n);
  const doc = { name: n.name, locality: n.locality, city: n.city, district: n.district, state: n.state, country: 'India', lat: n.lat, lng: n.lng, bbox: n.bbox ?? [], searchKey: searchKeyFor(n), geocodeSource };
  await Neighborhood.updateOne({ slug }, { $set: doc, $setOnInsert: { slug, origin, createdBy } }, { upsert: true, runValidators: true });
  return Neighborhood.findOne({ slug });
}
