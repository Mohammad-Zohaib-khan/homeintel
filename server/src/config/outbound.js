import { env } from './env.js';
import { allowHost } from '../utils/safeFetch.js';

// The complete outbound allowlist. Hosts come only from server configuration, never from requests.
const hostOf = (u) => new URL(u).hostname;
export const OUTBOUND_HOSTS = [
  hostOf(env.OVERPASS_ENDPOINT), hostOf(env.NOMINATIM_ENDPOINT), hostOf(env.OPENAQ_ENDPOINT), hostOf(env.OGD_ENDPOINT),
  'api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com',
];
OUTBOUND_HOSTS.forEach(allowHost);
