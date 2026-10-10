#!/usr/bin/env node
// Prints the live field schema and sample rows of a data.gov.in resource. Run BEFORE writing a crime mapping.
//   npm run inspect:ogd -- <resourceId>
import mongoose from 'mongoose';
import { env } from '../server/src/config/env.js';
import '../server/src/config/outbound.js';
import { inspectResource } from '../server/src/ingestion/adapters/ogd.js';

const id = process.argv[2];
if (!id) { console.error('Usage: npm run inspect:ogd -- <resourceId>'); process.exit(2); }
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
try {
  const r = await inspectResource(id);
  console.log(`Title: ${r.title ?? '(none)'}\nTotal rows: ${r.total ?? '?'}\nFields:`);
  for (const f of r.fields) console.log(`  - ${f.id}${f.name ? `  "${f.name}"` : ''}${f.type ? `  [${f.type}]` : ''}`);
  console.log('Sample rows:'); console.log(JSON.stringify(r.sample, null, 2));
} catch (e) { console.error(`Failed: ${e.message}`); process.exitCode = 1; } finally { await mongoose.disconnect(); }
