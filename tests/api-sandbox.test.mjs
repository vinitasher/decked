import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/sandbox.js';
import { dailyBucket } from '../functions/shared/entitlement.js';

const generatedDefinition = {
  topic: 'database-indexing',
  label: 'Index pressure',
  description: 'Indexes trade write work and storage for faster lookups under a bounded request workload.',
  predictionQuestion: 'When does lookup demand outrun the modeled index-serving capacity?',
  controls: [
    { key: 'arrivalRate', label: 'Lookup arrival rate', advanced: false },
    { key: 'capacity', label: 'Index-serving capacity', advanced: false },
    { key: 'retryRate', label: 'Retry rate', advanced: true },
    { key: 'skew', label: 'Key-range skew', advanced: true }
  ],
  situations: [
    { id: 'steady-lookups', label: 'Steady lookups', level: 1, description: 'A stable lookup stream stays below the modeled index capacity.', objective: 'Find the headroom before pressure appears.', values: { arrivalRate: 1000, capacity: 10000, retryRate: 0, skew: 0 } },
    { id: 'busy-lookups', label: 'Busy lookups', level: 2, description: 'More clients arrive while the index capacity stays fixed.', objective: 'Connect arrival rate to utilization.', values: { arrivalRate: 5000, capacity: 10000, retryRate: 0, skew: 0 } },
    { id: 'retrying-lookups', label: 'Retrying lookups', level: 3, description: 'A transient failure causes a portion of lookup work to retry.', objective: 'Notice that retries add work to the same path.', values: { arrivalRate: 5000, capacity: 10000, retryRate: 20, skew: 0 } },
    { id: 'skewed-range', label: 'Skewed range', level: 4, description: 'A concentrated key range sends more work to one representative partition.', objective: 'Compare aggregate capacity with concentrated pressure.', values: { arrivalRate: 5000, capacity: 10000, retryRate: 0, skew: 60 } },
    { id: 'saturated-index', label: 'Saturated index', level: 5, description: 'A high lookup rate and retries push effective demand beyond capacity.', objective: 'Predict the backlog before running the model.', values: { arrivalRate: 10000, capacity: 10000, retryRate: 20, skew: 60 } }
  ],
  predictionOptions: [
    { id: 'healthy', label: 'The modeled path keeps comfortable headroom' },
    { id: 'watch', label: 'The modeled path is nearing a pressure boundary' },
    { id: 'stress', label: 'The modeled path develops backlog and stress' }
  ],
  assumptions: [
    'The request rate is a bounded teaching input, not a production capacity claim.',
    'Capacity is represented by one effective work budget for the modeled path.',
    'Retries are additional work and do not include a vendor-specific backoff policy.'
  ]
};

function kvStore() {
  const store = new Map();
  return {
    get: async key => store.get(key)?.value ?? null,
    put: async (key, value, options) => { store.set(key, { value, options }); },
    store
  };
}

function env(overrides = {}) {
  const cache = kvStore();
  return {
    OPENCODE_API_KEY: 'test-key',
    CARD_CACHE: cache,
    WIKI_CACHE: cache,
    ...overrides
  };
}

function request(topic = generatedDefinition.topic, headers = {}) {
  return new Request(`https://example.com/api/sandbox?topic=${encodeURIComponent(topic)}`, { headers });
}

function withProvider(handler) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    return handler(url, options, calls);
  };
  return {
    calls: () => calls,
    restore: () => { globalThis.fetch = originalFetch; }
  };
}

test('sandbox endpoint rejects invalid topics and non-GET methods', async () => {
  for (const topic of ['', 'Bad Topic!', 'UPPER', 'with space', `${'a'.repeat(81)}`]) {
    const response = await onRequest({ request: request(topic), env: env() });
    assert.equal(response.status, 400, `topic: ${topic}`);
  }
  const response = await onRequest({
    request: new Request('https://example.com/api/sandbox?topic=database-indexing', { method: 'POST' }),
    env: env()
  });
  assert.equal(response.status, 405);
});

test('sandbox endpoint reports missing provider configuration clearly', async () => {
  const response = await onRequest({
    request: request(),
    env: { CARD_CACHE: kvStore(), SANDBOX_CACHE: kvStore() }
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'Sandbox generation is not configured');
});

test('sandbox endpoint serves a valid cached definition without provider or quota use', async () => {
  const cache = kvStore();
  cache.store.set('sandbox:v1:database-indexing', { value: JSON.stringify({ ...generatedDefinition, ignored: 'discard me' }) });
  const provider = withProvider(() => { throw new Error('provider must not be called'); });
  try {
    const response = await onRequest({ request: request(), env: env({ SANDBOX_CACHE: cache }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, 'generated-database-indexing');
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.generated, true);
    assert.equal(body.ignored, undefined);
    assert.equal(provider.calls(), 0);
    assert.equal([...cache.store.keys()].some(key => key.includes('quota:sandbox:')), false);
  } finally {
    provider.restore();
  }
});

test('sandbox endpoint validates, caches, and charges one fresh definition', async () => {
  let cached;
  const cache = kvStore();
  const provider = withProvider((_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 4096);
    assert.match(body.messages[0].content, /application owns the simulator/i);
    assert.match(body.messages[0].content, /Do not return JavaScript, formulas, code, HTML, URLs, vendor capacity claims/i);
    return Response.json({ choices: [{ message: { content: `\n\`\`\`json\n${JSON.stringify(generatedDefinition)}\n\`\`\`\n` } }] });
  });
  const requestHeaders = { 'X-Device-Id': 'sandbox-device' };
  try {
    const response = await onRequest({
      request: request(undefined, requestHeaders),
      env: env({
        CARD_CACHE: cache,
        SANDBOX_CACHE: { ...cache, put: async (key, value, options) => { cached = { key, value, options }; await cache.put(key, value, options); } }
      }),
      waitUntil: promise => promise
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.topic, generatedDefinition.topic);
    assert.equal(body.controls[0].unit, 'req/s');
    assert.equal(body.controls[1].unit, 'work/s');
    assert.equal(cached.key, 'sandbox:v1:database-indexing');
    assert.equal(JSON.parse(cached.value).modelKind, 'bounded-pressure');
    assert.equal(cached.options.expirationTtl, 2592000);
    assert.equal(cache.store.get(`quota:sandbox:dev:sandbox-device:${dailyBucket()}`).value, '1');
    assert.equal(provider.calls(), 1);
  } finally {
    provider.restore();
  }
});

test('sandbox endpoint retries malformed provider output without charging or caching', async () => {
  const cache = kvStore();
  const provider = withProvider(() => Response.json({ choices: [{ message: { content: '{not valid json}' } }] }));
  try {
    const response = await onRequest({
      request: request(undefined, { 'X-Device-Id': 'retry-device' }),
      env: env({ SANDBOX_CACHE: cache })
    });
    assert.equal(response.status, 503);
    assert.equal(provider.calls(), 2);
    assert.equal([...cache.store.keys()].some(key => key.startsWith('quota:sandbox:')), false);
    assert.equal(cache.store.has('sandbox:v1:database-indexing'), false);
  } finally {
    provider.restore();
  }
});

test('sandbox endpoint enforces the free daily quota before calling the provider', async () => {
  const cache = kvStore();
  cache.store.set(`quota:sandbox:dev:limited:${dailyBucket()}`, { value: '3' });
  const provider = withProvider(() => { throw new Error('provider must not be called'); });
  try {
    const response = await onRequest({
      request: request(undefined, { 'X-Device-Id': 'limited' }),
      env: env({ CARD_CACHE: cache, SANDBOX_CACHE: kvStore(), FREE_DAILY_SANDBOX_LIMIT: '3' })
    });
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      error: 'Daily Sandbox generation limit reached — upgrade to Pro for more generated experiments',
      code: 'quota_exceeded',
      kind: 'sandbox',
      used: 3,
      limit: 3,
      remaining: 0
    });
    assert.equal(provider.calls(), 0);
  } finally {
    provider.restore();
  }
});

test('Pro users bypass the Sandbox quota while still receiving a fresh definition', async () => {
  const cache = kvStore();
  cache.store.set('billing:user:pro-user', { value: JSON.stringify({ plan: 'pro', status: 'active' }) });
  const provider = withProvider(() => Response.json({ choices: [{ message: { content: JSON.stringify(generatedDefinition) } }] }));
  try {
    const response = await onRequest({
      request: request(undefined, { Authorization: `Bearer ${await signProToken()}` }),
      env: env({ CARD_CACHE: cache, SANDBOX_CACHE: cache, SUPABASE_JWT_SECRET: 'jwt-secret' })
    });
    assert.equal(response.status, 200);
    assert.equal(provider.calls(), 1);
    assert.equal([...cache.store.keys()].some(key => key.startsWith('quota:sandbox:')), false);
  } finally {
    provider.restore();
  }
});

test('sandbox endpoint regenerates invalid cache entries', async () => {
  const cache = kvStore();
  cache.store.set('sandbox:v1:database-indexing', { value: JSON.stringify({ topic: generatedDefinition.topic, controls: [] }) });
  const provider = withProvider(() => Response.json({ choices: [{ message: { content: JSON.stringify(generatedDefinition) } }] }));
  try {
    const response = await onRequest({ request: request(), env: env({ SANDBOX_CACHE: cache }) });
    assert.equal(response.status, 200);
    assert.equal(provider.calls(), 1);
    assert.equal(JSON.parse(cache.store.get('sandbox:v1:database-indexing').value).generated, true);
  } finally {
    provider.restore();
  }
});

async function signProToken() {
  const encoder = new TextEncoder();
  const base64url = bytes => Buffer.from(bytes).toString('base64url');
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(encoder.encode(JSON.stringify({ sub: 'pro-user', exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', encoder.encode('jwt-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}
