import { describe, it, expect } from 'vitest';
import { safeNext } from './safeRedirect.js';

describe('safeNext (open-redirect protection)', () => {
  it.each(['/account', '/neighborhood/abc?x=1'])('allows internal path %s', (p) => expect(safeNext(p)).toBe(p));
  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, '/ok\n//evil.com', 42])('rejects %s', (p) => expect(safeNext(p)).toBe('/account'));
});
