import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-gemini-key';
const { setTransport } = await import('../src/utils/safeFetch.js');
await import('../src/config/outbound.js');
const { getProvider } = await import('../src/ai/providers/index.js');

after(() => setTransport(null));

describe('Gemini provider', () => {
  it('sends the key in a header (not the URL), asks for JSON, and returns only non-thought text', async () => {
    let seen;
    setTransport(async (req) => {
      seen = { url: String(req.url), opts: req };
      return { status: 200, headers: {}, text: JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'reasoning…', thought: true }, { text: '{"paragraphs":' }, { text: '["ok"]}' }] } }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
      }) };
    });
    const p = getProvider();
    assert.equal(p.name, 'gemini');
    const out = await p.complete({ system: 'SYS', user: 'USER', maxTokens: 500 });
    assert.equal(out.text, '{"paragraphs":["ok"]}');
    assert.deepEqual(out.usage, { inputTokens: 11, outputTokens: 7 });
    assert.match(seen.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-[\w.-]+:generateContent$/);
    assert.ok(!seen.url.includes('test-gemini-key'));
    const headers = Object.fromEntries(Object.entries(seen.opts.headers).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(headers['x-goog-api-key'], 'test-gemini-key');
    const body = JSON.parse(seen.opts.body);
    assert.equal(body.systemInstruction.parts[0].text, 'SYS');
    assert.equal(body.contents[0].parts[0].text, 'USER');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
  });
});
