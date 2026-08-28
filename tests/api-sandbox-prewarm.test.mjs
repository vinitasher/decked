import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/sandbox/prewarm.js';

const PREWARM_TOKEN = 'maintenance-test-token';

function definition(topic) {
  return {
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
  };
}

function kvStore() {
  const store = new Map();
  return {
    get: async key => store.get(key)?.value ?? null,
    put: async (key, value, options) => { store.set(key, { value, options }); },
    store
  };
}

function request(topics, token = PREWARM_TOKEN) {
  return new Request('https://example.com/api/sandbox/prewarm', {
    method: 'POST',
    headers: {
      Authorization: token === null ? '' : `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ topics })
  });
}

function env(cache, overrides = {}) {
  return {
    OPENCODE_API_KEY: 'test-key',
    SANDBOX_PREWARM_TOKEN: PREWARM_TOKEN,
    WIKI_CACHE: cache,
    ...overrides
  };
}

function withProvider(handler) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    return handler(url, options, calls);
  };
  return { calls: () => calls, restore: () => { globalThis.fetch = originalFetch; } };
}

function topicFromPrompt(options) {
  const prompt = JSON.parse(options.body).messages[0].content;
  return [...prompt.matchAll(/concept "([a-z0-9-]+)"/g)][0]?.[1] || '';
}

test('prewarm endpoint authenticates before reading or calling the provider', async () => {
  const cache = kvStore();
  const provider = withProvider(() => { throw new Error('provider must not be called'); });
  try {
    const missing = await onRequest({ request: request(['caching'], null), env: env(cache) });
    assert.equal(missing.status, 401);
    const unconfigured = await onRequest({
      request: request(['caching']),
      env: env(cache, { SANDBOX_PREWARM_TOKEN: '' })
    });
    assert.equal(unconfigured.status, 503);
    assert.equal(provider.calls(), 0);
  } finally {
    provider.restore();
  }
});

test('prewarm endpoint reports rejected topics while processing valid topics', async () => {
  const cache = kvStore();
  const provider = withProvider((_url, options) => Response.json({
    choices: [{ message: { content: JSON.stringify(definition(topicFromPrompt(options))) } }]
  }));
  try {
    const response = await onRequest({
      request: request(['first-topic', 'Bad Topic', 'first-topic']),
      env: env(cache)
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.accepted, 1);
    assert.equal(body.completed, 1);
    assert.equal(body.failed, 0);
    assert.deepEqual(body.results.map(result => result.status), ['generated', 'rejected', 'rejected']);
    assert.equal(provider.calls(), 1);
    assert.ok(cache.store.has('sandbox:v1:first-topic'));
  } finally {
    provider.restore();
  }
});

test('prewarm processes topics strictly in input order with one provider call in flight', async () => {
  const cache = kvStore();
  const calls = [];
  let releaseFirst;
  let firstStarted;
  const firstStartedPromise = new Promise(resolve => { firstStarted = resolve; });
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const provider = withProvider(async (_url, options) => {
    const topic = topicFromPrompt(options);
    calls.push(topic);
    if (topic === 'first-topic') {
      firstStarted();
      await firstGate;
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(definition(topic)) } }] });
  });
  try {
    const pending = onRequest({
      request: request(['first-topic', 'second-topic']),
      env: env(cache)
    });
    await firstStartedPromise;
    assert.deepEqual(calls, ['first-topic']);
    releaseFirst();
    const response = await pending;
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['first-topic', 'second-topic']);
    assert.deepEqual((await response.json()).results.map(result => result.status), ['generated', 'generated']);
    assert.equal([...cache.store.keys()].some(key => key.startsWith('quota:sandbox:')), false);
  } finally {
    provider.restore();
  }
});

test('prewarm skips valid cache hits and continues after an independent failure', async () => {
  const cache = kvStore();
  cache.store.set('sandbox:v1:cached-topic', { value: JSON.stringify(definition('cached-topic')) });
  const calls = [];
  const provider = withProvider((_url, options) => {
    const topic = topicFromPrompt(options);
    calls.push(topic);
    if (topic === 'broken-topic') return Response.json({ choices: [{ message: { content: '{bad json}' } }] });
    return Response.json({ choices: [{ message: { content: JSON.stringify(definition(topic)) } }] });
  });
  try {
    const response = await onRequest({
      request: request(['cached-topic', 'broken-topic', 'ready-topic']),
      env: env(cache)
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.results.map(result => result.status), ['cached', 'failed', 'generated']);
    assert.deepEqual(calls, ['broken-topic', 'broken-topic', 'ready-topic']);
    assert.ok(cache.store.has('sandbox:v1:ready-topic'));
  } finally {
    provider.restore();
  }
});

test('prewarm rejects oversized batches before any provider call', async () => {
  const provider = withProvider(() => { throw new Error('provider must not be called'); });
  try {
    const response = await onRequest({
      request: request(Array.from({ length: 9 }, (_, index) => `topic-${index}`)),
      env: env(kvStore())
    });
    assert.equal(response.status, 400);
    assert.equal(provider.calls(), 0);
  } finally {
    provider.restore();
  }
});
