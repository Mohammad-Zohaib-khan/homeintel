/*
 * Provider-agnostic LLM interface. Business logic only calls `getProvider().complete({ system, user, maxTokens })`
 * and receives text. Switching vendors is configuration (AI_PROVIDER / AI_MODEL / API key), not code.
 * Keys stay server-side; requests go through the SSRF-safe client to allowlisted hosts only.
 */
import { env } from '../../config/env.js';
import { safeFetch } from '../../utils/safeFetch.js';

export class AiUnavailableError extends Error { constructor(msg = 'The research assistant is not configured.') { super(msg); this.code = 'AI_UNAVAILABLE'; } }

const anthropic = {
  name: 'anthropic', model: env.AI_MODEL || 'claude-sonnet-5-5', available: !!env.ANTHROPIC_API_KEY,
  async complete({ system, user, maxTokens = 1200 }) {
    const { json } = await safeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', timeoutMs: 60000, retries: 1, expect: 'json',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
    });
    const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, usage: { inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens } };
  },
};

const openai = {
  name: 'openai', model: env.AI_MODEL || 'gpt-4o-mini', available: !!env.OPENAI_API_KEY,
  async complete({ system, user, maxTokens = 1200 }) {
    const { json } = await safeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', timeoutMs: 60000, retries: 1,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    return { text: json.choices?.[0]?.message?.content ?? '', usage: { inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens } };
  },
};

// Google Gemini (generateContent). The key travels in a header, never in the URL, so it can't leak into logs.
// Thinking models spend output tokens on reasoning first, so the budget gets headroom; thought parts are discarded.
const gemini = {
  name: 'gemini', model: env.AI_MODEL || 'gemini-3.5-flash', available: !!env.GEMINI_API_KEY,
  async complete({ system, user, maxTokens = 1200 }) {
    const { json } = await safeFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST', timeoutMs: 60000, retries: 1,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens + 4096, responseMimeType: 'application/json' },
      }),
    });
    const text = (json.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    return { text, usage: { inputTokens: json.usageMetadata?.promptTokenCount, outputTokens: json.usageMetadata?.candidatesTokenCount } };
  },
};

// Test-only provider (env.js refuses AI_PROVIDER=mock outside NODE_ENV=test). Deterministic, and deliberately
// includes one fabricated citation so tests prove the validator drops it.
const mock = {
  name: 'mock', model: 'mock-1', available: true,
  async complete({ user }) {
    const ids = [...user.matchAll(/"id":"(E\d+|S\d*-[a-z]+)"/g)].map((m) => m[1]);
    if (user.includes('FORCE_AI_FAILURE')) throw new Error('mock failure');
    const cite = (n) => ids.slice(n, n + 2);
    return {
      text: JSON.stringify({
        paragraphs: ['Mock summary paragraph grounded in the evidence.', 'Second paragraph.'],
        findings: [{ text: 'Mock finding one.', evidence: cite(0) }, { text: 'Mock finding with a fabricated source.', evidence: ['E999'] }, { text: 'Mock finding two.', evidence: cite(2) }],
        tradeoffs: [{ text: 'Mock trade-off.', evidence: cite(1) }],
        uncertainties: ['Mock uncertainty.'],
      }),
      usage: { inputTokens: user.length, outputTokens: 100 },
    };
  },
};

const none = { name: 'none', model: null, available: false, async complete() { throw new AiUnavailableError(); } };

const PROVIDERS = { anthropic, openai, gemini, mock, none };
export function getProvider() {
  const p = PROVIDERS[env.AI_PROVIDER] ?? none;
  return p.available ? p : none;
}
export const setProviderForTests = (name, impl) => { PROVIDERS[name] = impl; };
