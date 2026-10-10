import { Router } from 'express';
import { env } from '../config/env.js';
import { getShared } from '../services/reportService.js';

// Server-rendered Open Graph preview for shared reports (crawlers don't run the SPA). Humans are sent on to the app.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r = Router();
r.get('/reports/:token', async (req, res) => {
  const token = req.params.token;
  let rep = null;
  try { rep = await getShared(token); } catch { /* fall through to 404 page */ }
  const appUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/r/${encodeURIComponent(token)}`;
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" });
  if (!rep) return res.status(404).send('<!doctype html><title>Report not found — HomeIntel</title><meta name="robots" content="noindex"><p>This shared report is not available.</p>');
  const names = rep.content.sections.map((s) => `${s.neighborhood.name} (${s.overall ?? '—'}/100)`).join(', ');
  const desc = `${rep.kind === 'comparison' ? 'Neighborhood comparison' : 'Neighborhood report'}: ${names}.${rep.containsDemoData ? ' Contains demo data.' : ''} Generated with HomeIntel.`;
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(rep.title)} — HomeIntel</title>
<meta name="robots" content="noindex"><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="HomeIntel"><meta property="og:title" content="${esc(rep.title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(appUrl)}"><meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url=${esc(appUrl)}"></head><body><p><a href="${esc(appUrl)}">Open the report in HomeIntel</a></p></body></html>`);
});
export default r;
