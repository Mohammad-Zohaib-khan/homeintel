import { useResource } from './useResource.js';
import { api, unwrap } from './api.js';

// AI availability is reported by the server; the UI never assumes it.
let cache = null;
export const aiStatus = (signal) => (cache ??= unwrap(api.get('/ai/status', { signal })).catch((e) => { cache = null; throw e; }));
export function useAi() {
  const { data } = useResource((s) => aiStatus(s), []);
  return { available: !!data?.available, provider: data?.provider ?? null, quota: data?.quota ?? null, loaded: !!data };
}
export const resetAiStatusCache = () => { cache = null; };
