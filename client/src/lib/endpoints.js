import { api, unwrap } from './api.js';
import { weightsToQuery } from './format.js';

// One place for every API call the client makes.
export const nb = {
  search: (params, signal) => api.get('/neighborhoods/search', { params, signal }).then((r) => r.data),
  facets: (signal) => unwrap(api.get('/neighborhoods/facets', { signal })),
  profile: (id, weights, signal) => unwrap(api.get(`/neighborhoods/${encodeURIComponent(id)}`, { params: { weights: weightsToQuery(weights) }, signal })),
  metrics: (id, signal) => unwrap(api.get(`/neighborhoods/${encodeURIComponent(id)}/metrics`, { signal })),
  sources: (id, signal) => unwrap(api.get(`/neighborhoods/${encodeURIComponent(id)}/sources`, { signal })),
  history: (id, key, signal) => unwrap(api.get(`/neighborhoods/${encodeURIComponent(id)}/history`, { params: { key }, signal })),
  pois: (id, params, signal) => unwrap(api.get(`/neighborhoods/${encodeURIComponent(id)}/pois`, { params, signal })),
  quality: (id, signal) => unwrap(api.get(`/neighborhoods/${encodeURIComponent(id)}/quality`, { signal })),
  compare: (ids, weights) => unwrap(api.post('/neighborhoods/compare', { ids, ...(weights ? { weights } : {}) })),
  lookup: (q, signal) => unwrap(api.get('/neighborhoods/lookup', { params: { q }, signal })),
  create: (q, ref) => unwrap(api.post('/neighborhoods', { q, ref })),
  refresh: (id) => unwrap(api.post(`/neighborhoods/${encodeURIComponent(id)}/refresh`, {})),
};
export const prefs = {
  get: (signal) => unwrap(api.get('/me/preferences', { signal })),
  set: (body) => unwrap(api.put('/me/preferences', body)),
  reset: () => unwrap(api.delete('/me/preferences')),
};
export const saved = {
  list: (params, signal) => api.get('/saved-neighborhoods', { params, signal }).then((r) => r.data),
  status: (neighborhoodId, signal) => unwrap(api.get('/saved-neighborhoods/status', { params: { neighborhoodId }, signal })),
  save: (neighborhoodId, extra = {}) => unwrap(api.post('/saved-neighborhoods', { neighborhoodId, ...extra })),
  update: (id, body) => unwrap(api.patch(`/saved-neighborhoods/${id}`, body)),
  remove: (id) => unwrap(api.delete(`/saved-neighborhoods/${id}`)),
  importCsv: (file) => { const fd = new FormData(); fd.append('file', file); return unwrap(api.post('/saved-neighborhoods/import', fd)); },
  exportUrl: () => `${api.defaults.baseURL}/saved-neighborhoods/export.csv`,
};
export const comparisons = {
  list: (signal) => unwrap(api.get('/comparisons', { signal })),
  save: (body) => unwrap(api.post('/comparisons', body)),
  remove: (id) => unwrap(api.delete(`/comparisons/${id}`)),
};
export const reports = {
  list: (params, signal) => api.get('/reports', { params, signal }).then((r) => r.data),
  get: (id, signal) => unwrap(api.get(`/reports/${id}`, { signal })),
  shared: (token, signal) => unwrap(api.get(`/reports/shared/${token}`, { signal })),
  create: (body) => unwrap(api.post('/reports', body, { timeout: 90000 })),
  rename: (id, title) => unwrap(api.patch(`/reports/${id}`, { title })),
  share: (id, enabled) => unwrap(api.post(`/reports/${id}/share`, { enabled })),
  remove: (id) => unwrap(api.delete(`/reports/${id}`)),
};
export const aiApi = {
  analyze: (body) => unwrap(api.post('/ai/analyze', body, { timeout: 90000 })),
  runs: (signal) => unwrap(api.get('/ai/runs', { signal })),
  run: (id, signal) => unwrap(api.get(`/ai/runs/${id}`, { signal })),
};
export const adminApi = {
  overview: (signal) => unwrap(api.get('/admin/overview', { signal })),
  localities: (params, signal) => api.get('/admin/localities', { params, signal }).then((r) => r.data),
  refreshLocality: (id) => unwrap(api.post(`/admin/localities/${id}/refresh`, {})),
  refreshStale: (body) => unwrap(api.post('/admin/localities/refresh-stale', body)),
  runs: (params, signal) => api.get('/admin/ingestion-runs', { params, signal }).then((r) => r.data),
  quality: (params, signal) => api.get('/admin/quality', { params, signal }).then((r) => r.data),
  events: (params, signal) => api.get('/admin/security-events', { params, signal }).then((r) => r.data),
  users: (params, signal) => api.get('/admin/users', { params, signal }).then((r) => r.data),
  unlock: (id) => unwrap(api.post(`/admin/users/${id}/unlock`, {})),
  signOut: (id) => unwrap(api.post(`/admin/users/${id}/sign-out`, {})),
  setRole: (id, role) => unwrap(api.patch(`/admin/users/${id}/role`, { role })),
};
