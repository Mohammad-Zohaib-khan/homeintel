import { describe, it, before, after } from 'node:test';
after(async () => { await disconnectTestDb(); });
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb, Client } from './helpers.js';

process.env.ONDEMAND_INGESTION = '0';
const dbUp = await connectTestDb();
const { createApp } = await import('../src/app.js');
const { upsertLocality } = await import('../src/services/localityService.js');
const { seedDemoFor } = await import('../src/ingestion/demo.js');
const { SavedLocation } = await import('../src/models/SavedLocation.js');
const { Report } = await import('../src/models/Report.js');
const { parseShortlistCsv } = await import('../src/services/savedService.js');

let server, base, a, b, c, alice, bob;
const PW = 'Correct-Horse-9-Battery';
const user = async () => { const cl = new Client(base); await cl.post('/api/auth/register', { email: `u${Date.now()}${Math.random()}@ex.com`, name: 'U', password: PW }); return cl; };

describe('CSV shortlist parser (pure)', () => {
  it('parses rows, skips header, strips formula prefixes', () => {
    const rows = parseShortlistCsv(Buffer.from('name,city\nKothrud,Pune\n"=HYPERLINK(1)",X\n\n'));
    assert.deepEqual(rows.map((r) => r.name), ['Kothrud', '=HYPERLINK(1)']);
  });
  it('rejects binary, non-UTF-8, empty and oversized files', () => {
    assert.throws(() => parseShortlistCsv(Buffer.from([0x4b, 0x00, 0x41])), { code: 'UNSUPPORTED_FILE' });
    assert.throws(() => parseShortlistCsv(Buffer.from([0xff, 0xfe, 0xfd])), { code: 'UNSUPPORTED_FILE' });
    assert.throws(() => parseShortlistCsv(Buffer.alloc(0)));
    assert.throws(() => parseShortlistCsv(Buffer.from(Array.from({ length: 150 }, (_, i) => `n${i}`).join('\n'))));
  });
});

describe('saved, comparisons, reports (DB)', { skip: !dbUp && 'MongoDB unavailable' }, () => {
  before(async () => {
    await Promise.all([SavedLocation.init(), Report.init()]);
    a = await upsertLocality({ name: 'Kothrud', city: 'Pune', district: 'Pune', state: 'Maharashtra', lat: 18.5074, lng: 73.8077 }, { origin: 'seed' });
    b = await upsertLocality({ name: 'Koramangala', city: 'Bengaluru', state: 'Karnataka', lat: 12.9352, lng: 77.6245 }, { origin: 'seed' });
    c = await upsertLocality({ name: 'Kothrud', city: 'Nashik', state: 'Maharashtra', lat: 20, lng: 73.8 }, { origin: 'seed' }); // ambiguous name
    for (const n of [a, b, c]) await seedDemoFor(n);
    server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
    alice = await user(); bob = await user();
  });
  after(() => server?.close());

  it('requires authentication for every private route', async () => {
    const anon = new Client(base);
    for (const [m, p] of [['GET', '/api/saved-neighborhoods'], ['POST', '/api/saved-neighborhoods'], ['GET', '/api/comparisons'], ['GET', '/api/reports'], ['POST', '/api/reports'], ['GET', '/api/saved-neighborhoods/export.csv']]) {
      assert.equal((await anon.req(m, p, m === 'POST' ? {} : undefined)).status, 401, `${m} ${p}`);
    }
  });

  it('saves (idempotently), lists with live scores, tags and notes, exports CSV', async () => {
    const s1 = await alice.post('/api/saved-neighborhoods', { neighborhoodId: a.slug, note: 'Near office', tags: ['Shortlist', 'shortlist', 'family'] });
    assert.equal(s1.status, 201); assert.deepEqual(s1.body.data.tags, ['shortlist', 'family']);
    const s2 = await alice.post('/api/saved-neighborhoods', { neighborhoodId: String(a._id) });
    assert.equal(s2.status, 200); assert.equal(s2.body.data.id, s1.body.data.id);
    const list = await alice.get('/api/saved-neighborhoods');
    assert.equal(list.body.meta.total, 1); assert.ok(list.body.data[0].neighborhood.score.overall != null); assert.deepEqual(list.body.meta.tags, ['family', 'shortlist']);
    assert.equal((await alice.get('/api/saved-neighborhoods?tag=family')).body.data.length, 1);
    assert.equal((await alice.get(`/api/saved-neighborhoods/status?neighborhoodId=${a.slug}`)).body.data.saved, true);
    await alice.req('PATCH', `/api/saved-neighborhoods/${s1.body.data.id}`, { note: '=cmd|calc' });
    const csv = await alice.raw('/api/saved-neighborhoods/export.csv');
    assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.text, /'=cmd\|calc/, 'formula injection neutralised');
    assert.equal((await alice.post('/api/saved-neighborhoods', { neighborhoodId: a.slug, tags: ['<script>'] })).status, 400);
  });

  it('BOLA: another user can neither see, change nor delete — and gets 404, not 403', async () => {
    const mine = (await alice.get('/api/saved-neighborhoods')).body.data[0].id;
    assert.equal((await bob.get('/api/saved-neighborhoods')).body.meta.total, 0);
    const patch = await bob.req('PATCH', `/api/saved-neighborhoods/${mine}`, { note: 'pwned' });
    assert.equal(patch.status, 404);
    assert.equal((await bob.req('DELETE', `/api/saved-neighborhoods/${mine}`)).status, 404);
    assert.equal((await SavedLocation.findById(mine)).note, '=cmd|calc');
    assert.equal((await bob.req('DELETE', '/api/saved-neighborhoods/not-an-id')).status, 400);
    assert.equal((await alice.req('DELETE', `/api/saved-neighborhoods/${mine}`)).status, 200);
    assert.equal((await alice.req('DELETE', `/api/saved-neighborhoods/${mine}`)).status, 404);
  });

  it('imports a CSV shortlist safely: matches existing localities only, reports ambiguity', async () => {
    const r = await alice.upload('/api/saved-neighborhoods/import', 'list.csv', 'name,city\nKothrud,Pune\nKoramangala\nKothrud\nAtlantis,Nowhere\n');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.data.saved.map((x) => x.slug).sort(), ['koramangala-bengaluru', 'kothrud-pune']);
    assert.equal(r.body.data.ambiguous.length, 1); assert.equal(r.body.data.unmatched[0].name, 'Atlantis');
    assert.equal((await alice.upload('/api/saved-neighborhoods/import', 'evil.exe', 'MZ\x00')).status, 415);
    assert.equal((await alice.upload('/api/saved-neighborhoods/import', 'x.csv', 'a', 'application/x-msdownload')).status, 415);
    assert.equal((await alice.upload('/api/saved-neighborhoods/import', 'big.csv', 'a,b\n'.repeat(20000))).status, 413);
    assert.equal((await alice.upload('/api/saved-neighborhoods/import', 'nul.csv', 'Kothrud\x00,Pune')).status, 415);
  });

  it('saves and lists comparisons per owner', async () => {
    const r = await alice.post('/api/comparisons', { name: 'Pune vs Bengaluru', neighborhoodIds: [a.slug, b.slug], weights: { education: 5 } });
    assert.equal(r.status, 201);
    assert.equal((await alice.get('/api/comparisons')).body.data[0].neighborhoods.length, 2);
    assert.equal((await bob.get('/api/comparisons')).body.data.length, 0);
    assert.equal((await bob.req('DELETE', `/api/comparisons/${r.body.data.id}`)).status, 404);
    assert.equal((await alice.post('/api/comparisons', { name: 'x', neighborhoodIds: [a.slug, a.slug] })).status, 400);
  });

  it('creates deterministic snapshot reports with caveats; AI absent ⇒ marked unavailable', async () => {
    const r = await alice.post('/api/reports', { neighborhoodIds: [a.slug, b.slug], includeAi: true });
    assert.equal(r.status, 201);
    const rep = r.body.data;
    assert.equal(rep.kind, 'comparison'); assert.equal(rep.containsDemoData, true); assert.equal(rep.ai.status, 'unavailable');
    assert.equal(rep.content.sections.length, 2);
    assert.ok(rep.content.sections[0].caveats.some((x) => /synthetic demo data/.test(x)));
    assert.ok(rep.content.sections[0].caveats.some((x) => /city-wide figure/.test(x)));
    assert.ok(rep.content.comparison.rows.length === 10 && rep.content.sources.some((s) => s.isDemo));
    assert.ok(!JSON.stringify(rep).includes('<'), 'content is plain text');
    const single = await alice.post('/api/reports', { neighborhoodIds: [a.slug], title: 'My Kothrud notes' });
    assert.equal(single.body.data.kind, 'profile'); assert.equal(single.body.data.title, 'My Kothrud notes');
    const list = await alice.get('/api/reports');
    assert.equal(list.body.meta.total, 2); assert.equal(list.body.data[0].neighborhoods[0].name, 'Kothrud');
  });

  it('BOLA on reports: read, rename, share and delete are owner-only', async () => {
    const id = (await alice.get('/api/reports')).body.data[0].id;
    for (const [m, p, body] of [['GET', `/api/reports/${id}`], ['PATCH', `/api/reports/${id}`, { title: 'x' }], ['POST', `/api/reports/${id}/share`, { enabled: true }], ['DELETE', `/api/reports/${id}`]]) {
      assert.equal((await bob.req(m, p, body)).status, 404, `${m} ${p}`);
    }
    assert.equal((await alice.get(`/api/reports/${id}`)).status, 200);
  });

  it('share links are unguessable, read-only, revocable, and carry no owner identity', async () => {
    const id = (await alice.get('/api/reports')).body.data[0].id;
    const on = await alice.post(`/api/reports/${id}/share`, { enabled: true });
    const token = on.body.data.share.token;
    assert.match(token, /^[A-Za-z0-9_-]{32}$/);
    const anon = new Client(base);
    const pub = await anon.get(`/api/reports/shared/${token}`);
    assert.equal(pub.status, 200); assert.equal(pub.body.data.id, undefined); assert.equal(pub.body.data.share, undefined);
    assert.ok(!JSON.stringify(pub.body).includes('userId'));
    const og = await anon.raw(`/share/reports/${token}`);
    assert.match(og.text, /<meta property="og:title" content="[^"]+">/); assert.match(og.headers.get('content-security-policy'), /default-src 'none'/);
    await alice.post(`/api/reports/${id}/share`, { enabled: false });
    assert.equal((await anon.get(`/api/reports/shared/${token}`)).status, 404);
    assert.equal((await anon.raw(`/share/reports/${token}`)).status, 404);
    assert.equal((await anon.get('/api/reports/shared/short')).status, 400);
  });

  it('escapes report titles in the OG page (XSS)', async () => {
    const r = await alice.post('/api/reports', { neighborhoodIds: [a.slug], title: '"><script>alert(1)</script>' });
    const share = await alice.post(`/api/reports/${r.body.data.id}/share`, { enabled: true });
    const og = await new Client(base).raw(`/share/reports/${share.body.data.share.token}`);
    assert.ok(!og.text.includes('<script>alert(1)</script>')); assert.match(og.text, /&lt;script&gt;/);
  });
});

describe('account deletion (DB)', { skip: !dbUp && 'MongoDB unavailable' }, () => {
  let srv, b2;
  before(async () => { srv = createApp().listen(0); b2 = `http://127.0.0.1:${srv.address().port}`; });
  after(() => srv?.close());
  it('requires password + explicit confirmation, then removes the user and owned data', async () => {
    const cl = new Client(b2); const email = `del${Date.now()}@ex.com`;
    await cl.post('/api/auth/register', { email, name: 'Del', password: PW });
    await cl.post('/api/saved-neighborhoods', { neighborhoodId: 'kothrud-pune' });
    const rep = await cl.post('/api/reports', { neighborhoodIds: ['kothrud-pune'] });
    assert.equal((await cl.post('/api/auth/delete-account', { password: PW })).status, 400);
    assert.equal((await cl.post('/api/auth/delete-account', { password: 'wrong-password-x', confirm: 'DELETE' })).status, 401);
    assert.equal((await cl.post('/api/auth/delete-account', { password: PW, confirm: 'DELETE' })).status, 200);
    assert.equal((await cl.get('/api/auth/me')).status, 401);
    assert.equal(await Report.countDocuments({ _id: rep.body.data.id }), 0);
    assert.equal((await new Client(b2).post('/api/auth/login', { email, password: PW })).status, 401);
  });
});
