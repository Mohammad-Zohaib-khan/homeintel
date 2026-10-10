#!/usr/bin/env node
/*
 * End-to-end smoke test through the real UI (production build + real API + seeded DB).
 *   CHROME_PATH=/path/to/chrome BASE_URL=http://localhost:4173 node tests/e2e/smoke.e2e.mjs
 * Requires: `npm run build`, `vite preview` (or SERVE_CLIENT=1), API running, `npm run seed:all` done.
 */
import puppeteer from 'puppeteer-core';
import * as OTPAuth from 'otpauth';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const exe = process.env.CHROME_PATH;
if (!exe) { console.error('Set CHROME_PATH to a Chrome/Chromium binary'); process.exit(2); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu', ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : [])] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|net::ERR|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(e.message));
await page.evaluateOnNewDocument(() => localStorage.setItem('hi-consent', JSON.stringify({ v: 1, preferences: true, at: 'e2e' })));

let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
const fail = (msg) => { console.error(`  ✗ ${msg}`); throw new Error(msg); };
const text = () => page.evaluate(() => document.body.innerText);
const waitText = async (re, timeout = 15000) => { await page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), { timeout }, re.source); };
// Prefers controls inside an open dialog, then <main>, then the whole page (e.g. the compare tray).
const clickButton = async (re) => {
  const handle = await page.waitForFunction((src) => {
    const scopes = [document.querySelector('dialog[open]'), document.querySelector('main'), document].filter(Boolean);
    for (const sc of scopes) { const el = [...sc.querySelectorAll('button, a')].find((b) => new RegExp(src, 'i').test(b.innerText.trim()) && b.offsetParent !== null && !b.disabled); if (el) return el; }
    return null;
  }, { timeout: 15000 }, re.source);
  await handle.asElement().click();
};
const fill = async (label, value) => {
  const id = await page.waitForFunction((l) => { const lab = [...document.querySelectorAll('label')].find((x) => x.innerText.trim() === l); return lab?.htmlFor || null; }, { timeout: 10000 }, label);
  const sel = `[id="${await id.jsonValue()}"]`;
  await page.focus(sel); await page.$eval(sel, (el) => el.select?.());
  await page.keyboard.type(value);
  const got = await page.$eval(sel, (el) => el.value);
  if (got.replace(/\s/g, '') !== value.replace(/\s/g, '')) throw new Error(`typing into "${label}" produced "${got}"`);
};

const email = `e2e${Date.now()}@example.com`; const PW = 'Correct-Horse-9-Battery';
try {
  console.log(`HomeIntel E2E against ${BASE}`);
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle2' });
  await fill('Name', 'E2E Tester'); await fill('Email', email); await fill('Password', PW);
  await clickButton(/^create account$/); await page.waitForFunction(() => location.pathname === '/account', { timeout: 15000 });
  ok('registered through the form and landed on Account');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  if (/token|jwt|Correct-Horse/i.test(stored)) fail('credentials found in browser storage'); ok('no tokens or passwords in browser storage');

  await clickButton(/set up two-factor/); await waitText(/enter this key manually/);
  const secret = await page.evaluate(() => [...document.querySelectorAll('p')].find((p) => /^[A-Z2-7]{16,}$/.test(p.innerText.trim()))?.innerText.trim());
  if (!secret) fail('MFA secret not displayed');
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
  await fill('6-digit code', totp.generate()); await clickButton(/confirm and turn on/); await waitText(/save these recovery codes/);
  ok('enabled two-factor sign-in with a real TOTP code; recovery codes shown once');
  await clickButton(/i have saved them/);

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await page.type('[data-search-input="true"]', 'kothr'); await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.pathname.startsWith('/neighborhood/'), { timeout: 10000 }); await waitText(/category scores/);
  ok('searched with the keyboard combobox and opened a profile');
  const slug = page.url().split('/neighborhood/')[1];
  const scoreAlt = await page.$eval('[role="img"][aria-label*="out of 100"]', (e) => e.getAttribute('aria-label'));
  ok(`profile score has a text alternative: "${scoreAlt}"`);

  await clickButton(/^save$/); await waitText(/^saved$|\nsaved\n/m).catch(() => {});
  await page.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed="true"]')].some((b) => /saved/i.test(b.innerText)), { timeout: 10000 });
  ok('saved the neighborhood');
  await clickButton(/add to compare/);
  await page.goto(`${BASE}/explore`, { waitUntil: 'networkidle2' });
  const other = await page.$$eval('button[aria-label^="Add "][aria-label$=" to compare"]', (bs) => bs[0]?.getAttribute('aria-label'));
  await page.click(`button[aria-label="${other}"]`);
  await page.click('aside[aria-label="Compare tray"] a');
  await page.waitForSelector('table caption', { timeout: 15000 });
  await page.waitForFunction(() => /category scores for each neighborhood/i.test(document.querySelector('table caption')?.innerText ?? ''), { timeout: 15000 });
  ok('built a comparison from the compare tray');

  await clickButton(/create report/); await page.waitForSelector('dialog[open]');
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => /create report/i.test(b.innerText)).click());
  await page.waitForFunction(() => location.pathname.startsWith('/report/'), { timeout: 20000 }); await waitText(/at a glance/);
  ok('created a comparison report snapshot');
  await clickButton(/^share$/); await clickButton(/create link/); await waitText(/anyone with this link/);
  const shareUrl = await page.evaluate(() => document.querySelector('dialog[open] code').innerText.trim());
  ok('created a share link');

  const anon = await browser.createBrowserContext().catch(() => null);
  const p2 = anon ? await anon.newPage() : await browser.newPage();
  if (!anon) { const c = await p2.createCDPSession(); await c.send('Network.clearBrowserCookies'); }
  await p2.goto(shareUrl, { waitUntil: 'networkidle2' });
  const pub = await p2.evaluate(() => document.body.innerText);
  if (!/read-only/i.test(pub) || /E2E Tester|@example\.com/.test(pub)) fail('public report missing or leaks identity');
  ok('shared report opens anonymously, read-only, without owner identity');
  await p2.close();
  if (!anon) { await page.reload({ waitUntil: 'networkidle2' }); } // session cookies were cleared above; re-login below covers it

  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle2' });
  if (/sign in/i.test(await page.evaluate(() => document.querySelector('main').innerText.slice(0, 40)))) { /* already signed out */ } else { await clickButton(/^sign out$/); }
  await page.waitForFunction(() => location.pathname === '/' || location.pathname === '/login', { timeout: 10000 });
  ok('signed out');
  await page.goto(`${BASE}/login?next=/saved`, { waitUntil: 'networkidle2' });
  await fill('Email', email); await fill('Password', PW); await clickButton(/^sign in$/);
  await waitText(/authenticator app/);
  await new Promise((r) => setTimeout(r, Math.max(0, 31000 - (Date.now() % 30000)))); // next TOTP step (codes are single-use)
  await fill('Authenticator code', totp.generate()); await clickButton(/verify and sign in/);
  await page.waitForFunction(() => location.pathname === '/saved', { timeout: 15000 }); await waitText(new RegExp(slug.split('-')[0]));
  ok('signed in again with password + TOTP and was returned to Saved, with the saved item present');

  if (consoleErrors.length) fail(`console errors: ${consoleErrors.join(' | ')}`);
  ok('no console or runtime errors');
  console.log(`\nE2E PASSED (${step} checks)`);
} catch (e) {
  console.error(`\nE2E FAILED at step ${step + 1}: ${e.message}`);
  await page.screenshot({ path: 'e2e-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
