import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest as cards } from '../functions/api/generate.js';
import { onRequest as wiki } from '../functions/api/wiki.js';
import { onRequest as sandbox } from '../functions/api/sandbox.js';
import { proContext } from './helpers/pro-context.mjs';

test('free identities cannot call any AI provider, even with quota overrides or force', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('AI must not be called'); };
  try {
    for (const [handler, path] of [
      [cards, 'generate?topic=caching&difficulty=3'],
      [cards, 'generate?topic=caching&difficulty=3&force=1'],
      [wiki, 'wiki?topic=caching'],
      [sandbox, 'sandbox?topic=caching']
    ]) {
      for (const identity of ['anonymous', 'invalid-token', 'signed-in-free']) {
        let context = { request: new Request(`https://example.com/api/${path}`), env: {
          OPENCODE_API_KEY: 'test-key', FREE_DAILY_CARD_LIMIT: '0',
          FREE_DAILY_WIKI_LIMIT: '1000', FREE_DAILY_SANDBOX_LIMIT: '1000'
        } };
        if (identity === 'invalid-token') context.request.headers.set('Authorization', 'Bearer forged');
        if (identity === 'signed-in-free') {
          context = await proContext(context);
          context.env.CARD_CACHE = { get: async () => null, put: async () => {} };
        }
        const response = await handler(context);
        assert.equal(response.status, 403, `${path}: ${identity}`);
        assert.equal((await response.json()).code, 'pro_required');
      }
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('cache-only card requests cannot generate even for paid accounts', async () => {
  const context = await proContext({ request: new Request('https://example.com/api/generate?topic=caching&difficulty=3&cache_only=1'), env: {} });
  const response = await cards(context);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'pro_required');
});
