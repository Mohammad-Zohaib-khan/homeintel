import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../router.jsx';
import { AppProviders } from '../AppProviders.jsx';
import { api } from '../lib/api.js';

export const user = { id: '1', email: 'ada@example.com', name: 'Ada Lovelace', role: 'user', mfaEnabled: false };
const reply = (data) => Promise.resolve({ data: { data } });
const fail = (status, code, message) => Promise.reject(Object.assign(new Error(message), { status, code }));

// Route table of fake server responses, keyed by "METHOD /path".
export function mockServer(routes = {}) {
  const table = {
    'GET /auth/me': () => fail(401, 'UNAUTHORIZED', 'Authentication required'),
    'GET /neighborhoods/search': () => Promise.resolve({ data: { data: [], meta: { total: 0, page: 1, pages: 1 } } }),
    'GET /neighborhoods/facets': () => reply({ cities: [], total: 0 }),
    ...routes,
  };
  const handler = (method) => (url, bodyOrCfg) => (table[`${method} ${url}`] ?? (() => fail(404, 'NOT_FOUND', `no mock for ${method} ${url}`)))(bodyOrCfg);
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) api[m].mockImplementation(handler(m.toUpperCase()));
  return { reply, fail };
}

export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<AppProviders><RouterProvider router={router} /></AppProviders>);
  return router;
}
export { reply, fail };
