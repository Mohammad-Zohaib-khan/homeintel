// Only same-origin, absolute-path redirects are honoured (blocks open redirects such as //evil.com or /\evil.com).
export function safeNext(value, fallback = '/account') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
