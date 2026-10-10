// Some proxies append the client port to X-Forwarded-For (Azure App Service sends "203.0.113.7:51234"). Express would
// then report req.ip as "ip:port", so every connection gets its own rate-limit key and audit prefixes break. Strip the
// port from each hop before Express derives req.ip; plain addresses pass through unchanged.
const V4_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
const V6_BRACKETED = /^\[([0-9A-Fa-f:.]+)\](?::\d{1,5})?$/;

export function stripForwardedPort(value) {
  return value.split(',').map((hop) => {
    const h = hop.trim();
    return h.match(V4_PORT)?.[1] ?? h.match(V6_BRACKETED)?.[1] ?? h;
  }).join(', ');
}

export function normalizeForwardedFor(req, _res, next) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) req.headers['x-forwarded-for'] = stripForwardedPort(xff);
  next();
}
