#!/usr/bin/env node
// Sends a signed refresh webhook (for cron/CI schedules).
//   WEBHOOK_SIGNING_SECRET=... node scripts/sign-webhook.js https://api.example.com '{"event":"ingestion.refresh_stale","olderThanHours":24}'
import crypto from 'node:crypto';
const [base, body = '{"event":"ingestion.refresh_stale","olderThanHours":24}'] = process.argv.slice(2);
const secret = process.env.WEBHOOK_SIGNING_SECRET;
if (!base || !secret) { console.error('Usage: WEBHOOK_SIGNING_SECRET=... node scripts/sign-webhook.js <api-base-url> [json-body]'); process.exit(2); }
JSON.parse(body);
const t = Math.floor(Date.now() / 1000);
const sig = `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const res = await fetch(`${base.replace(/\/$/, '')}/api/webhooks/ingestion`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-homeintel-signature': sig }, body });
console.log(res.status, await res.text());
process.exitCode = res.ok ? 0 : 1;
