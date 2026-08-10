import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest as generateOnRequest } from '../functions/api/generate.js';
import { onRequest as wikiOnRequest } from '../functions/api/wiki.js';
import { dailyBucket } from '../functions/shared/entitlement.js';

const card = {
  id: 'queues-generated',
  topic: 'queues',
  difficulty: 2,
  prerequisiteTopics: ['api-design'],
  scenario: 'A producer sends 5,000 messages per second while a single consumer can process only 1,000 messages per second.',
  nodes: ['producer', 'queue', 'consumer', 'database'],
  flows: [
    { from: 'producer', to: 'queue', verb: 'publishes', kind: 'async' },
    { from: 'queue', to: 'consumer', verb: 'delivers', kind: 'async' },
    { from: 'consumer', to: 'database', verb: 'writes', kind: 'sync' }
  ],
  options: [
    { id: 'A', label: 'Call the consumer synchronously', prerequisiteTopics: ['api-design', 'real-time'] },
    { id: 'B', label: 'Buffer work in a queue and drain asynchronously', prerequisiteTopics: ['api-design', 'queues'] },
    { id: 'C', label: 'Drop excess work', prerequisiteTopics: ['api-design', 'rate-limiting'] },
    { id: 'D', label: 'Persist every event in the database', prerequisiteTopics: ['api-design', 'databases'] }
  ],
  correct: 'B',
  explanation: 'A queue decouples the producer from the consumer.'
};

const wikiEntry = {
  topic: 'hot-key-handling',
  title: 'Hot Key Handling',
  summary: 'A hot key absorbs a disproportionate share of reads. Replication and client caching spread the load across nodes so one key cannot bottleneck the system.',
  why_it_matters: 'A single skewed key can turn a distributed system into a single point of failure.',
  key_points: ['Detect hot keys by monitoring request-rate skew.', 'Replicate the hot key across cache nodes.', 'Client-side caching reduces upstream load.'],
  common_pitfalls: ['Replicating write-heavy hot keys creates consistency overhead.', 'Treating every large key as hot without measuring skew.'],
  related_topics: ['cache-eviction', 'workload-skew']
};

function kvStore() {
  const store = new Map();
  return {
    get: async (key, type) => store.get(key)?.value ?? null,
    put: async (key, value, options) => { store.set(key, { value, options }); },
    store
  };
}

function generateEnv(overrides = {}) {
  return {
    CARD_CACHE: kvStore(),
    OPENCODE_API_KEY: 'test-key',
    ...overrides
  };
}

function wikiEnv(overrides = {}) {
  return {
    WIKI_CACHE: {
      get: async () => null,
      put: async () => {}
    },
    CARD_CACHE: kvStore(),
    OPENCODE_API_KEY: 'test-key',
    ...overrides
  };
}

function mockProvider() {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    const prompt = JSON.parse(options.body).messages[0].content;
    if (prompt.includes('wiki entry')) {
      return Response.json({ choices: [{ message: { content: JSON.stringify(wikiEntry) } }] });
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(card) } }] });
  };
  return { restore: () => { globalThis.fetch = originalFetch; }, calls: () => calls };
}

test('card generation rejects with 429 once the free daily limit is reached', async () => {
  const store = kvStore();
  const now = Date.now();
  store.store.set(`quota:cards:dev:abc:${dailyBucket(now)}`, { value: '10' });
  const provider = mockProvider();
  try {
    const response = await generateOnRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2', { headers: { 'X-Device-Id': 'abc' } }),
      random: () => 0.25,
      env: generateEnv({ CARD_CACHE: store, FREE_DAILY_CARD_LIMIT: '10' })
    });
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.code, 'quota_exceeded');
    assert.equal(body.kind, 'cards');
    assert.equal(provider.calls(), 0, 'the AI provider must not be called when quota is exhausted');
  } finally {
    provider.restore();
  }
});

test('successful card generation consumes one unit of quota', async () => {
  const store = kvStore();
  const provider = mockProvider();
  try {
    const response = await generateOnRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2', { headers: { 'X-Device-Id': 'abc' } }),
      random: () => 0.25,
      env: generateEnv({ CARD_CACHE: store })
    });
    assert.equal(response.status, 200);
    const key = `quota:cards:dev:abc:${dailyBucket()}`;
    assert.equal(store.store.get(key).value, '1');
  } finally {
    provider.restore();
  }
});

test('cached card hits never consume quota', async () => {
  const store = kvStore();
  const provider = mockProvider();
  try {
    const env = generateEnv({
      CARD_CACHE: store,
      ...({
        CARD_CACHE: {
          ...store,
          get: async key => key === 'queues:2'
            ? JSON.stringify({ cards: [card] })
            : store.get(key)?.value ?? null
        }
      })
    });
    const response = await generateOnRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2', { headers: { 'X-Device-Id': 'abc' } }),
      random: () => 0.25,
      env
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).cached, true);
    assert.equal(provider.calls(), 0);
    assert.ok(![...store.store.keys()].some(key => key.includes('quota:cards')), 'no quota key written on cache hit');
  } finally {
    provider.restore();
  }
});

test('pro users bypass the card quota entirely', async () => {
  const store = kvStore();
  const now = Date.now();
  store.store.set(`quota:cards:user:u1:${dailyBucket(now)}`, { value: '999' });
  store.store.set('billing:user:u1', { value: JSON.stringify({ plan: 'pro', status: 'active' }) });
  const provider = mockProvider();
  try {
    const response = await generateOnRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2', {
        headers: { Authorization: `Bearer ${await signProToken()}`, 'X-Device-Id': 'abc' }
      }),
      random: () => 0.25,
      env: generateEnv({ CARD_CACHE: store, SUPABASE_JWT_SECRET: 'jwt-secret' })
    });
    assert.equal(response.status, 200);
    assert.equal(provider.calls(), 1);
    assert.equal(store.store.get(`quota:cards:user:u1:${dailyBucket(now)}`).value, '999', 'quota untouched for pro');
  } finally {
    provider.restore();
  }
});

test('wiki generation rejects with 429 once the free daily limit is reached', async () => {
  const store = kvStore();
  const now = Date.now();
  store.store.set(`quota:wiki:dev:abc:${dailyBucket(now)}`, { value: '10' });
  const provider = mockProvider();
  try {
    const response = await wikiOnRequest({
      request: new Request('https://example.com/api/wiki?topic=hot-key-handling', { headers: { 'X-Device-Id': 'abc' } }),
      env: wikiEnv({ CARD_CACHE: store, FREE_DAILY_WIKI_LIMIT: '10' })
    });
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.code, 'quota_exceeded');
    assert.equal(body.kind, 'wiki');
    assert.equal(provider.calls(), 0);
  } finally {
    provider.restore();
  }
});

test('successful wiki generation consumes one unit of quota', async () => {
  const store = kvStore();
  const provider = mockProvider();
  try {
    const response = await wikiOnRequest({
      request: new Request('https://example.com/api/wiki?topic=hot-key-handling', { headers: { 'X-Device-Id': 'abc' } }),
      env: wikiEnv({ CARD_CACHE: store })
    });
    assert.equal(response.status, 200);
    assert.equal(store.store.get(`quota:wiki:dev:abc:${dailyBucket()}`).value, '1');
  } finally {
    provider.restore();
  }
});

async function signProToken() {
  const enc = new TextEncoder();
  const base64url = bytes => Buffer.from(bytes).toString('base64url');
  const header = base64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(enc.encode(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', enc.encode('jwt-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}
