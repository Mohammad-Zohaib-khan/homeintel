import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockServer, renderApp, reply, fail } from './test/utils.jsx';
import * as fx from './test/fixtures.js';

vi.mock('./lib/api.js', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: '/api' } }, authEvents: new EventTarget(), unwrap: (p) => p.then((r) => r.data.data) }));
vi.mock('./components/data/MapView.jsx', () => ({ default: ({ label, pins = [] }) => <div role="region" aria-label={label}>{pins.length} pins</div> }));

const list = (items) => () => Promise.resolve({ data: { data: items, meta: { total: items.length, page: 1, pages: 1, limit: 20 } } });
const profileRoutes = (extra = {}) => ({
  'GET /neighborhoods/kothrud-pune': () => reply(fx.profile()),
  'GET /neighborhoods/kothrud-pune/metrics': () => reply([{ id: 'm1', key: 'schools_1500m', category: 'education', label: 'Schools & kindergartens', value: 4, unit: 'count', granularity: 'neighborhood', scope: 'Within 1.5 km — synthetic demo value', origin: 'seed', source: { key: 'demo-fixture', name: 'Demo fixture', isDemo: true }, collectedAt: new Date().toISOString(), freshness: 'fresh' },
    { id: 'm2', key: 'crime_x', category: 'safety', label: 'IPC crime rate', value: 300, unit: 'per 100k people', granularity: 'city', scope: 'Pune (city-level)', origin: 'live', source: { key: 'ogd-ncrb', name: 'NCRB', isDemo: false }, collectedAt: new Date().toISOString(), freshness: 'stale' }]),
  'GET /neighborhoods/kothrud-pune/pois': () => reply([{ id: 'p1', type: 'school', name: 'Demo school 1', lat: 18.5, lng: 73.8, distanceM: 420, origin: 'seed' }]),
  'GET /neighborhoods/kothrud-pune/history': () => reply([]),
  'GET /neighborhoods/kothrud-pune/sources': () => reply([{ key: 'demo-fixture', name: 'Demo fixture', provider: 'HomeIntel', license: 'N/A', attribution: 'Synthetic', isDemo: true, metrics: 2, pois: 1, lastCollected: new Date().toISOString() }]),
  'GET /neighborhoods/kothrud-pune/quality': () => reply({ flags: [{ level: 'info', code: 'COARSE_GRANULARITY', message: 'IPC crime rate describes the whole city, not this neighborhood.' }] }),
  ...extra,
});

beforeEach(() => { vi.clearAllMocks(); localStorage.setItem('hi-consent', JSON.stringify({ v: 1, preferences: true, at: 'x' })); });

describe('Explore', () => {
  it('lists scored localities with demo labels and a map alternative note', async () => {
    mockServer({ 'GET /neighborhoods/search': list([fx.summary('Kothrud', 'kothrud-pune', 72), fx.summary('Baner', 'baner-pune', 64)]) });
    renderApp('/explore');
    expect(await screen.findByRole('link', { name: 'Kothrud' })).toHaveAttribute('href', '/neighborhood/kothrud-pune');
    expect(screen.getByText('2 localities')).toBeInTheDocument();
    expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: /map of the localities/i })).toHaveTextContent('2 pins');
  });
  it('adds to the compare tray and links to the comparison', async () => {
    mockServer({ 'GET /neighborhoods/search': list([fx.summary('Kothrud', 'kothrud-pune'), fx.summary('Baner', 'baner-pune')]) });
    renderApp('/explore');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Kothrud to compare' }));
    const tray = screen.getByRole('complementary', { name: /compare tray/i });
    expect(within(tray).getByText('Add one more')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Baner to compare' }));
    expect(within(tray).getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare?ids=kothrud-pune,baner-pune');
    expect(JSON.parse(localStorage.getItem('hi-compare')).map((x) => x.slug)).toEqual(['kothrud-pune', 'baner-pune']);
  });
  it('shows an empty state that offers OpenStreetMap lookup (sign-in prompt when anonymous)', async () => {
    mockServer({ 'GET /neighborhoods/search': list([]) });
    renderApp('/explore?q=Baner');
    expect(await screen.findByRole('heading', { name: /no locality in homeintel matches “baner”/i })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', expect.stringContaining('/login?next='));
  });
  it('shows a retryable error state when the API fails', async () => {
    mockServer({ 'GET /neighborhoods/search': () => fail(500, 'INTERNAL_ERROR', 'Something went wrong') });
    renderApp('/explore');
    expect(await screen.findByRole('alert')).toHaveTextContent(/results could not load/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('Neighborhood profile', () => {
  it('renders score, demo banner, explained categories, and missing-data notes', async () => {
    mockServer(profileRoutes());
    renderApp('/neighborhood/kothrud-pune');
    expect(await screen.findByRole('heading', { level: 1, name: 'Kothrud' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /overall score: 72 out of 100, strong, based on demo data/i })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/synthetic/i);
    await userEvent.click(screen.getByRole('button', { name: /^Education/ }));
    expect(screen.getByText('Rule text for education.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Power reliability/ }));
    expect(screen.getAllByText(/does not estimate it/).length).toBeGreaterThan(0);
  });
  it('labels coarse-granularity and stale evidence', async () => {
    mockServer(profileRoutes());
    renderApp('/neighborhood/kothrud-pune');
    const table = await screen.findByRole('table', { name: /every value behind this profile/i });
    expect(within(table).getByText('City-wide')).toBeInTheDocument();
    expect(within(table).getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText(/1 data-quality note/)).toBeInTheDocument();
  });
  it('offers a list alternative to the map', async () => {
    mockServer(profileRoutes());
    renderApp('/neighborhood/kothrud-pune');
    await userEvent.click(await screen.findByRole('button', { name: 'list' }));
    const t = screen.getByRole('table', { name: /nearest amenity/i });
    expect(within(t).getByText('Demo school 1')).toBeInTheDocument();
  });
  it('shows 404 for unknown neighborhoods', async () => {
    mockServer({ 'GET /neighborhoods/nope': () => fail(404, 'NOT_FOUND', 'Neighborhood not found') });
    renderApp('/neighborhood/nope');
    expect(await screen.findByRole('heading', { name: /isn’t on the map/i })).toBeInTheDocument();
  });
  it('polls while data collection runs and says so', async () => {
    let n = 0;
    mockServer(profileRoutes({ 'GET /neighborhoods/kothrud-pune': () => { n++; const p = fx.profile(); p.neighborhood.ingestion.status = n < 2 ? 'running' : 'complete'; return reply(p); } }));
    renderApp('/neighborhood/kothrud-pune');
    expect(await screen.findByText(/collecting data from openstreetmap/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/collecting data from openstreetmap/i)).not.toBeInTheDocument(), { timeout: 6000 });
  }, 10000);
});

describe('Search combobox', () => {
  it('suggests matches and opens one with the keyboard', async () => {
    mockServer({ 'GET /neighborhoods/search': list([fx.summary('Kothrud', 'kothrud-pune')]), ...profileRoutes() });
    const router = renderApp('/');
    const box = await screen.findByRole('combobox', { name: /search localities/i });
    await userEvent.type(box, 'kot');
    expect(await screen.findByRole('option', { name: /kothrud/i })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/neighborhood/kothrud-pune'));
  });
});

describe('App shell', () => {
  it('asks for storage consent; "Necessary only" removes optional storage', async () => {
    localStorage.clear(); localStorage.setItem('hi-theme', 'dark');
    mockServer(); renderApp('/');
    const banner = await screen.findByRole('region', { name: /storage preferences/i });
    await userEvent.click(within(banner).getByRole('button', { name: /necessary only/i }));
    expect(screen.queryByRole('region', { name: /storage preferences/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('hi-theme')).toBeNull();
    expect(JSON.parse(localStorage.getItem('hi-consent')).preferences).toBe(false);
  });
  it('opens keyboard shortcut help with ? and navigates with g e', async () => {
    mockServer();
    const router = renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.keyboard('?');
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.keyboard('ge');
    await waitFor(() => expect(router.state.location.pathname).toBe('/explore'));
  });
});

describe('Signed-in pages', () => {
  const me = { 'GET /auth/me': () => reply({ user: { id: 'u1', email: 'a@b.co', name: 'Asha', role: 'user', mfaEnabled: false } }), 'GET /ai/status': () => reply({ available: false, provider: null, quota: null }) };
  it('Compare renders a matrix with leaders and an AI-unavailable note', async () => {
    const e = (slug, name, edu) => ({ id: slug, neighborhood: fx.summary(name, slug), score: { ...fx.score(70), categories: fx.score(70).categories.map((c) => (c.id === 'education' ? { ...c, score: edu } : c)) } });
    mockServer({ ...me, 'GET /me/preferences': () => reply({ weights: { education: 3, healthcare: 4, safety: 4, environment: 3, utilities: 3, power: 3, connectivity: 2, transport: 3, essentials: 3, development: 1 } }),
      'POST /neighborhoods/compare': () => reply({ neighborhoods: [e('a-x', 'Alpha', 90), e('b-x', 'Beta', 40)], comparison: { summary: null, categories: fx.score().categories.map((c) => ({ id: c.id, label: c.label, values: [{ id: 'a-x', score: c.id === 'education' ? 90 : c.score }, { id: 'b-x', score: c.id === 'education' ? 40 : c.score }], leaders: c.id === 'education' ? ['a-x'] : [], spread: 0, comparable: true })), tradeoffs: [{ id: 'a-x', strengths: ['education'], gaps: [] }, { id: 'b-x', strengths: [], gaps: ['education'] }] } }) });
    renderApp('/compare?ids=a-x,b-x');
    const table = await screen.findByRole('table', { name: /category scores for each neighborhood/i });
    const row = within(table).getByRole('row', { name: /education/i });
    expect(within(row).getByText('Leads')).toBeInTheDocument();
    expect(await screen.findByText(/research assistant isn’t configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create report/i })).toBeInTheDocument();
  });
  it('Compare with fewer than two ids shows guidance', async () => {
    mockServer(me); renderApp('/compare');
    expect(await screen.findByRole('heading', { name: /pick two or more/i })).toBeInTheDocument();
  });
  it('Saved lists items with notes and supports removal', async () => {
    mockServer({ ...me, 'GET /saved-neighborhoods': () => Promise.resolve({ data: { data: [{ id: 's1', note: 'Near school', tags: ['shortlist'], createdAt: new Date().toISOString(), neighborhood: fx.summary('Kothrud', 'kothrud-pune') }], meta: { total: 1, page: 1, pages: 1, tags: ['shortlist'] } } }),
      'GET /comparisons': () => reply([]), 'DELETE /saved-neighborhoods/s1': () => reply({ deleted: true }) });
    renderApp('/saved');
    expect(await screen.findByText('Near school')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove kothrud from saved/i }));
    await waitFor(() => expect(screen.queryByText('Near school')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: /no saved comparisons/i })).toBeInTheDocument();
  });
  it('Report view renders sections as text and offers sharing', async () => {
    const content = { title: 'T', generatedAt: new Date().toISOString(), weights: Object.fromEntries(fx.score().categories.map((c) => [c.id, 3])), comparison: null, method: 'Method.', sources: [], disclaimer: 'Not advice.',
      sections: [{ neighborhood: { id: 'n1', slug: 'kothrud-pune', name: 'Kothrud', city: 'Pune', state: 'MH' }, overall: 70, band: 'Strong', coverage: 0.8, isDemo: true, categories: fx.score().categories.map((c) => ({ id: c.id, label: c.label, score: c.score, weight: 3 })),
        strengths: [{ id: 'education', text: '<b>Education</b> scores 70.' }], concerns: [], missing: [], caveats: ['City-wide figure.'], evidence: [] }] };
    mockServer({ ...me, 'GET /reports/r1': () => reply({ id: 'r1', title: 'My report', kind: 'profile', createdAt: new Date().toISOString(), scoringVersion: '1.0.0', containsDemoData: true, ai: { status: 'unavailable' }, share: { enabled: false, token: null }, content }) });
    renderApp('/report/r1');
    expect(await screen.findByRole('heading', { level: 1, name: 'My report' })).toBeInTheDocument();
    expect(screen.getByText('<b>Education</b> scores 70.')).toBeInTheDocument();
    expect(screen.getByText(/research assistant is not configured/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^share$/i }));
    expect(screen.getByRole('button', { name: /create link/i })).toBeInTheDocument();
  });
  it('AI workspace explains when no provider is configured', async () => {
    mockServer(me); renderApp('/ai');
    expect(await screen.findByRole('heading', { name: /isn’t configured/i })).toBeInTheDocument();
  });
  it('protected pages redirect anonymous users', async () => {
    mockServer(); const router = renderApp('/reports');
    await screen.findByRole('form', { name: /sign in/i });
    expect(router.state.location.search).toBe('?next=%2Freports');
  });
});

describe('Compare from the tray', () => {
  it('offers to compare the tray when opened without ids', async () => {
    localStorage.setItem('hi-compare', JSON.stringify([{ slug: 'a-x', name: 'Alpha', city: 'P' }, { slug: 'b-x', name: 'Beta', city: 'P' }]));
    mockServer({ 'GET /ai/status': () => reply({ available: false }) });
    const router = renderApp('/compare');
    await userEvent.click(await screen.findByRole('button', { name: /compare your tray \(2\)/i }));
    await waitFor(() => expect(router.state.location.search).toBe('?ids=a-x%2Cb-x'));
  });
});

describe('Admin console (UI)', () => {
  const adminMe = { 'GET /auth/me': () => reply({ user: { id: 'a1', email: 'ops@ex.com', name: 'Ops', role: 'admin', mfaEnabled: true } }), 'GET /ai/status': () => reply({ available: false }) };
  const overview = { localities: { total: 3, live: 1, demo: 1, empty: 1, failing: 1, withStale: 0 }, ingestion: { runs24h: 4, failed24h: 1, queue: { queued: 0, active: 0 }, recentFailures: [{ id: 'r1', locality: 'Kothrud', provider: 'air', error: 'api.openaq.org responded 503', at: new Date().toISOString() }] },
    users: { total: 5, admins: 1, withMfa: 2, locked: 0 }, security: { failures24h: 3, sessionTheftAlerts7d: 0 }, ai: { runs24h: 0 }, generatedAt: new Date().toISOString() };
  it('is hidden from ordinary users (nav and page)', async () => {
    mockServer({ 'GET /auth/me': () => reply({ user: { id: 'u', email: 'u@ex.com', name: 'U', role: 'user', mfaEnabled: false } }) });
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: /for administrators/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^admin$/i })).not.toBeInTheDocument();
  });
  it('shows the overview with real counts and the Admin nav link for admins', async () => {
    mockServer({ ...adminMe, 'GET /admin/overview': () => reply(overview) });
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Latest failed runs' })).toBeInTheDocument();
    expect(screen.getByText('api.openaq.org responded 503')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^admin$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: /admin sections/i })).toBeInTheDocument();
  });
  it('explains a step-up requirement instead of a generic error', async () => {
    mockServer({ ...adminMe, 'GET /admin/overview': () => Promise.reject(Object.assign(new Error('Sign out and sign in again with your authenticator code to open the admin console.'), { code: 'ADMIN_STEP_UP_REQUIRED', status: 403 })) });
    renderApp('/admin');
    expect(await screen.findByText(/sign in again with your authenticator code/i, { selector: 'p.font-medium' })).toBeInTheDocument();
  });
  it('users: "Make admin" is disabled without two-factor; actions confirm before running', async () => {
    const users = [{ id: 'a1', email: 'ops@ex.com', name: 'Ops', role: 'admin', mfaEnabled: true, locked: false, lockUntil: null, createdAt: new Date().toISOString(), lastLoginAt: null, counts: { saved: 0, reports: 0, aiRuns: 0 } },
      { id: 'u2', email: 'bea@ex.com', name: 'Bea', role: 'user', mfaEnabled: false, locked: true, lockUntil: new Date(Date.now() + 6e5).toISOString(), createdAt: new Date().toISOString(), lastLoginAt: null, counts: { saved: 2, reports: 1, aiRuns: 0 } }];
    mockServer({ ...adminMe, 'GET /admin/users': () => Promise.resolve({ data: { data: users, meta: { total: 2, page: 1, pages: 1 } } }), 'POST /admin/users/u2/unlock': () => reply({ ...users[1], locked: false, lockUntil: null }), 'POST /admin/users/u2/sign-out': () => reply(users[1]) });
    renderApp('/admin/users');
    expect(await screen.findByRole('button', { name: 'Make bea@ex.com an admin' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /remove admin access from ops@ex.com/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /unlock/i })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Sign bea@ex.com out everywhere' }));
    expect(await screen.findByRole('heading', { name: /sign bea@ex.com out everywhere\?/i })).toBeInTheDocument();
  });
});
