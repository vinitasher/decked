import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enforceFeedbackRateLimit,
  getClientIp,
  verifyTurnstileToken,
  FEEDBACK_RATE_LIMIT_MAX,
  FEEDBACK_RATE_LIMIT_WINDOW_SECONDS
} from '../functions/shared/feedback-security.js';

function kvStore() {
  const store = new Map();
  return {
    get: async (key, type) => store.get(key)?.value ?? null,
    put: async (key, value, options) => { store.set(key, { value, options }); },
    store
  };
}

test('rate limit allows five submissions per ten-minute window and then blocks', async () => {
  const store = kvStore();
  const headers = { 'CF-Connecting-IP': '203.0.113.5' };
  for (let i = 0; i < FEEDBACK_RATE_LIMIT_MAX; i++) {
    const result = await enforceFeedbackRateLimit(store, headers);
    assert.equal(result.allowed, true, `submission ${i + 1}`);
    assert.equal(result.currentCount, i + 1);
  }
  const blocked = await enforceFeedbackRateLimit(store, headers);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.currentCount, FEEDBACK_RATE_LIMIT_MAX);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.ok(blocked.retryAfterSeconds <= FEEDBACK_RATE_LIMIT_WINDOW_SECONDS);
});

test('rate limit keys are windowed per IP and expire after the window', async () => {
  const store = kvStore();
  await enforceFeedbackRateLimit(store, { 'CF-Connecting-IP': '203.0.113.5' });
  await enforceFeedbackRateLimit(store, { 'CF-Connecting-IP': '198.51.100.9' });

  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / FEEDBACK_RATE_LIMIT_WINDOW_SECONDS) * FEEDBACK_RATE_LIMIT_WINDOW_SECONDS;
  const key = `feedback-rate:${windowStart}:203.0.113.5`;
  assert.ok(store.store.has(key));
  assert.equal(store.store.get(key).options.expirationTtl, FEEDBACK_RATE_LIMIT_WINDOW_SECONDS + 60);
  assert.equal(store.store.get(key).value, '1');
});

test('rate limit treats a missing store entry as zero', async () => {
  const empty = { get: async () => null, put: async () => {} };
  const result = await enforceFeedbackRateLimit(empty, { 'CF-Connecting-IP': '203.0.113.5' });
  assert.equal(result.allowed, true);
  assert.equal(result.currentCount, 1);
});

test('getClientIp prefers cf-connecting-ip, then x-forwarded-for, then x-real-ip', () => {
  assert.equal(getClientIp({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }), '1.1.1.1');
  assert.equal(getClientIp({ 'x-forwarded-for': ' 2.2.2.2, 3.3.3.3 ' }), '2.2.2.2');
  assert.equal(getClientIp({ 'x-real-ip': '4.4.4.4' }), '4.4.4.4');
  assert.equal(getClientIp({}), 'unknown');
  assert.equal(getClientIp(new Headers({ 'CF-Connecting-IP': '5.5.5.5' })), '5.5.5.5');
});

test('verifyTurnstileToken skips verification when no secret key is configured', async () => {
  const result = await verifyTurnstileToken({ secretKey: '', token: '', headers: {} });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
});

test('verifyTurnstileToken requires a token when a secret key is configured', async () => {
  const result = await verifyTurnstileToken({ secretKey: 'secret', token: '  ', headers: {} });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'Turnstile verification is required.');
});

test('verifyTurnstileToken accepts a successful siteverify response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.match(options.body, /secret=secret/);
    assert.match(options.body, /response=token123/);
    assert.match(options.body, /remoteip=203\.0\.113\.5/);
    return Response.json({ success: true });
  };
  try {
    const result = await verifyTurnstileToken({
      secretKey: 'secret',
      token: 'token123',
      headers: { 'cf-connecting-ip': '203.0.113.5' }
    });
    assert.equal(result.allowed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('verifyTurnstileToken rejects failed siteverify responses with error codes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  try {
    const result = await verifyTurnstileToken({ secretKey: 'secret', token: 'bad', headers: {} });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /timeout-or-duplicate/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('verifyTurnstileToken rejects non-OK and throwing siteverify responses', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('down', { status: 502 });
    const http = await verifyTurnstileToken({ secretKey: 'secret', token: 't', headers: {} });
    assert.equal(http.allowed, false);
    assert.match(http.reason, /502/);

    globalThis.fetch = async () => { throw new Error('network'); };
    const thrown = await verifyTurnstileToken({ secretKey: 'secret', token: 't', headers: {} });
    assert.equal(thrown.allowed, false);
    assert.equal(thrown.reason, 'Turnstile verification could not be completed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
