import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockServer, renderApp, reply, fail, user } from './test/utils.jsx';

vi.mock('./lib/api.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: '/api' } },
  authEvents: new EventTarget(),
  unwrap: (p) => p.then((r) => r.data.data),
}));

beforeEach(() => vi.clearAllMocks());

describe('routing', () => {
  it('home route (lazy) renders the hero and search', async () => {
    mockServer(); renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /know the neighborhood/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /search localities/i })).toBeInTheDocument();
  });
  it('unknown nested paths render 404', async () => {
    mockServer(); renderApp('/does/not/exist');
    expect(await screen.findByRole('heading', { level: 1, name: /isn.t on the map/i })).toBeInTheDocument();
  });
  it('every route keeps skip link, landmarks', async () => {
    mockServer(); renderApp('/login');
    await screen.findByRole('main');
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main');
    expect(screen.getAllByRole('navigation', { name: /primary/i }).length).toBeGreaterThan(0);
  });
  it('/register renders its form and links to /login within the page', async () => {
    mockServer(); const router = renderApp('/register');
    expect(await screen.findByRole('form', { name: /create account/i })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: /sign in/i }));
    expect(await screen.findByRole('form', { name: /sign in/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
  it('404 link returns home', async () => {
    mockServer(); renderApp('/nope');
    await userEvent.click(await screen.findByRole('link', { name: /back to start/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /know the neighborhood/i })).toBeInTheDocument();
  });
});

describe('protected routes', () => {
  it('redirects anonymous visitors to /login preserving destination', async () => {
    mockServer(); const router = renderApp('/account');
    await screen.findByRole('form', { name: /sign in/i });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Faccount');
  });
  it('shows the account page when signed in', async () => {
    mockServer({ 'GET /auth/me': () => reply({ user }), 'GET /auth/mfa/status': () => reply({ enabled: false, recoveryCodesRemaining: 0 }) });
    renderApp('/account');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /set up two-factor/i })).toBeInTheDocument();
  });
});

describe('sign-in', () => {
  it('signs in, lands on the account page, and stores no credentials in browser storage', async () => {
    mockServer({ 'POST /auth/login': () => reply({ mfaRequired: false, user }), 'GET /auth/mfa/status': () => reply({ enabled: false, recoveryCodesRemaining: 0 }) });
    const router = renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Correct-Horse-9');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toMatch(/token|jwt|Correct-Horse|ada@example/i);
  });
  it('shows server errors without losing the form', async () => {
    mockServer({ 'POST /auth/login': () => fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password') });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co');
  });
  it('continues to a second-factor step, and can switch to a recovery code', async () => {
    mockServer({ 'POST /auth/login': () => reply({ mfaRequired: true }), 'POST /auth/mfa/login': (b) => (b.code === '123456' ? reply({ user }) : fail(401, 'MFA_INVALID', 'That code is not valid')), 'GET /auth/mfa/status': () => reply({ enabled: true, recoveryCodesRemaining: 9 }) });
    const router = renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Correct-Horse-9');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    const code = await screen.findByLabelText(/authenticator code/i);
    await userEvent.type(code, '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid/i);
    await userEvent.click(screen.getByRole('button', { name: /recovery code instead/i }));
    expect(screen.getByLabelText(/recovery code/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /authenticator app instead/i }));
    await userEvent.type(screen.getByLabelText(/authenticator code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
  });
  it('ignores a malicious ?next= and uses the safe default', async () => {
    mockServer({ 'POST /auth/login': () => reply({ mfaRequired: false, user }), 'GET /auth/mfa/status': () => reply({ enabled: false, recoveryCodesRemaining: 0 }) });
    const router = renderApp('/login?next=//evil.com');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
  });
  it('password field has an accessible visibility toggle', async () => {
    mockServer(); renderApp('/login');
    const pw = await screen.findByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(pw).toHaveAttribute('type', 'text');
  });
});

describe('register', () => {
  it('maps server validation errors onto fields', async () => {
    mockServer({ 'POST /auth/register': () => Promise.reject(Object.assign(new Error('Invalid input'), { code: 'VALIDATION_ERROR', details: [{ path: 'password', message: 'Use at least 12 characters' }] })) });
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Use at least 12 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('theme', () => {
  it('toggles and persists preference only', async () => {
    localStorage.setItem('hi-consent', JSON.stringify({ v: 1, preferences: true, at: 'x' }));
    mockServer(); renderApp('/');
    await userEvent.click((await screen.findAllByRole('button', { name: /switch to dark theme/i }))[0]);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('hi-theme')).toBe('dark');
  });
  it('does not persist the theme without preferences consent', async () => {
    localStorage.setItem('hi-consent', JSON.stringify({ v: 1, preferences: false, at: 'x' }));
    mockServer(); renderApp('/');
    await userEvent.click((await screen.findAllByRole('button', { name: /switch to dark theme/i }))[0]);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('hi-theme')).toBeNull();
  });
});
