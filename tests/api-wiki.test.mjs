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

const generatedSandbox = topic => ({
  topic,
  label: 'Bounded pressure',
  description: 'A bounded pressure model connects incoming work, capacity, and concentration for learning.',
  predictionQuestion: 'Will effective work stay below the modeled capacity?',
  learnerProblems: [
    { id: 'keep-up', question: 'Can the modeled path keep up as demand grows?', explanation: 'Compare effective demand with effective capacity to see when work begins waiting.', evidenceKeys: ['effectiveWorkRps', 'effectiveCapacityRps', 'backlogWork'] },
    { id: 'protect-latency', question: 'Where does user-visible delay appear first?', explanation: 'Use utilization, backlog, and estimated latency to find the pressure boundary.', evidenceKeys: ['estimatedP95LatencyMs', 'utilizationPct', 'backlogWork'] },
    { id: 'find-concentration', question: 'Can skew make one partition the real limit?', explanation: 'Compare skew-adjusted capacity with demand instead of trusting aggregate capacity.', evidenceKeys: ['skew', 'effectiveCapacityRps', 'utilizationPct'] }
  ],
  controls: [
    { key: 'arrivalRate', label: 'Incoming work', advanced: false },
    { key: 'capacity', label: 'Modeled capacity', advanced: false },
    { key: 'skew', label: 'Pressure skew', advanced: true }
  ],
  situations: [1, 2, 3, 4, 5].map(level => ({
    id: `pressure-level-${level}`,
    label: `Pressure level ${level}`,
    level,
    description: 'This situation changes a bounded pressure input for comparison.',
    objective: 'Predict the pressure state before running the model.',
    focusProblemId: ['keep-up', 'protect-latency', 'find-concentration', 'keep-up', 'protect-latency'][level - 1],
    values: { arrivalRate: level * 1000, capacity: 10000, skew: (level - 1) * 15 }
  })),
  predictionOptions: [
    { id: 'healthy', label: 'The modeled path keeps comfortable headroom' },
    { id: 'watch', label: 'The modeled path is nearing a pressure boundary' },
    { id: 'stress', label: 'The modeled path develops backlog and stress' }
  ],
  assumptions: [
    'The input values are bounded teaching examples, not production recommendations.',
    'Capacity is represented by one effective work budget for the modeled path.',
    'Skew represents concentration on one representative partition or key.'
  ]
});

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

test('wiki generation schedules a non-blocking Sandbox prewarm after its cache write', async () => {
  const originalFetch = globalThis.fetch;
  const waits = [];
  const cache = {
    get: async () => null,
    put: async (key, value) => { cache.values.set(key, value); },
    values: new Map()
  };
  let providerCalls = 0;
  globalThis.fetch = async (_url, options) => {
    providerCalls++;
    const prompt = JSON.parse(options.body).messages[0].content;
    const body = prompt.includes('wiki entry') ? { ...goodEntry, topic: 'new-topic' } : generatedSandbox('new-topic');
    return Response.json({ choices: [{ message: { content: JSON.stringify(body) } }] });
  };
  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/wiki?topic=new-topic'),
      env: env({ WIKI_CACHE: cache }),
      waitUntil: promise => waits.push(promise)
    });
    assert.equal(response.status, 200);
    assert.equal(providerCalls, 1, 'Wiki response returns before Sandbox generation completes');
    assert.equal(waits.length, 2, 'Wiki write and Sandbox prewarm are both background tasks');
    await Promise.all(waits);
    assert.equal(providerCalls, 2);
    assert.ok(cache.values.has('wiki:new-topic'));
    assert.ok(cache.values.has('sandbox:v1:new-topic'));
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
