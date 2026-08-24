import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { onRequest } from '../functions/api/wiki.js';

const goodEntry = {
  topic: 'hot-key-handling',
  title: 'Hot Key Handling',
  summary: 'A hot key is a single key that absorbs a disproportionate share of reads or writes. Hot key handling spreads that load across replicas, shards, or client caches so one key cannot bottleneck the system. For example, a viral post on a social feed can produce millions of reads per second on one cache entry.',
  why_it_matters: 'Engineers must handle hot keys because a single skewed key can turn a distributed system into a single-point-of-failure bottleneck.',
  key_points: [
    'Detect hot keys by monitoring request-rate skew per key.',
    'Replicate the hot key across multiple cache nodes to spread reads.',
    'Shard hot write keys by hash suffix or dedicated partitions.',
    'Client-side caching of the hot value reduces upstream load.'
  ],
  common_pitfalls: [
    'Replicating write-heavy hot keys creates consistency overhead.',
    'Treating every large key as hot without measuring skew.'
  ],
  related_topics: ['cache-eviction', 'workload-skew']
};

function env(overrides = {}) {
  return {
    OPENCODE_API_KEY: 'test-key',
    WIKI_CACHE: {
      get: async () => null,
      put: async () => {}
    },
    waitUntil: () => {},
    ...overrides
  };
}

test('wiki endpoint rejects invalid topics', async () => {
  for (const topic of ['', 'Bad Topic!', 'UPPER', 'with space']) {
    const response = await onRequest({
      request: new Request(`https://example.com/api/wiki?topic=${encodeURIComponent(topic)}`),
      env: env()
    });
    assert.equal(response.status, 400, `topic: ${topic}`);
  }
});

test('wiki endpoint serves a cached entry without calling the provider', async () => {
  let providerCalls = 0;
  const response = await onRequest({
    request: new Request('https://example.com/api/wiki?topic=hot-key-handling'),
    env: env({
      WIKI_CACHE: {
        get: async () => JSON.stringify(goodEntry),
        put: async () => { providerCalls++; }
      }
    }),
    fetch: async () => { providerCalls++; throw new Error('must not call provider'); }
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).topic, goodEntry.topic);
  assert.equal(providerCalls, 0);
});

test('wiki endpoint generates, validates, and caches a fresh entry', async () => {
  const originalFetch = globalThis.fetch;
  let cached;
  let providerCalls = 0;
  const models = [];
  globalThis.fetch = async (_url, options) => {
    providerCalls++;
    models.push(JSON.parse(options.body).model);
    return Response.json({
      choices: [{ message: { content: JSON.stringify(goodEntry) } }]
    });
  };
  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/wiki?topic=hot-key-handling'),
      env: env({
        WIKI_CACHE: {
          get: async () => null,
          put: async (key, value) => { cached = { key, value }; }
        }
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.topic, 'hot-key-handling');
    assert.ok(body.key_points.length >= 3);
    assert.equal(cached.key, 'wiki:hot-key-handling');
    assert.deepEqual(JSON.parse(cached.value).related_topics, ['cache-eviction', 'workload-skew']);
    assert.equal(providerCalls, 1);
    assert.deepEqual(models, ['gpt-5.6-luna']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('wiki endpoint rejects an entry that violates the schema without caching', async () => {
  const originalFetch = globalThis.fetch;
  const bad = { ...goodEntry, key_points: [] };
  let cacheWrites = 0;
  let providerCalls = 0;
  const models = [];
  globalThis.fetch = async (_url, options) => {
    providerCalls++;
    models.push(JSON.parse(options.body).model);
    return Response.json({ choices: [{ message: { content: JSON.stringify(bad) } }] });
  };
  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/wiki?topic=hot-key-handling'),
      env: env({
        WIKI_CACHE: { get: async () => null, put: async () => { cacheWrites++; } }
      })
    });
    assert.equal(response.status, 503);
    assert.equal(cacheWrites, 0);
    assert.equal(providerCalls, 2, 'retries once then gives up');
    assert.deepEqual(models, ['gpt-5.6-luna', 'deepseek-v4-flash']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('wiki endpoint normalizes related topic names into kebab-case', async () => {
  const originalFetch = globalThis.fetch;
  const variants = { ...goodEntry, related_topics: ['Eventual Consistency', 'Database', 'Cache_Eviction', '  ', 42, 'cache-eviction'] };
  let cached;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify(variants) } }]
  });
  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/wiki?topic=hot-key-handling'),
      env: env({
        WIKI_CACHE: { get: async () => null, put: async (key, value) => { cached = { key, value }; } }
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      (await response.json()).related_topics,
      ['eventual-consistency', 'database', 'cache-eviction']
    );
    assert.deepEqual(JSON.parse(cached.value).related_topics, ['eventual-consistency', 'database', 'cache-eviction']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('wiki endpoint fails clearly when the server-side key is missing', async () => {
  const response = await onRequest({
    request: new Request('https://example.com/api/wiki?topic=hot-key-handling'),
    env: { WIKI_CACHE: { get: async () => null } }
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'Card generation is not configured');
});
