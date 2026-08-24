import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildPrompt,
  deduplicatePool,
  hasDegenerateLinearOptionTopology,
  normalizeCacheValue,
  onRequest,
  scenarioFingerprint,
  selectCorrectLetter,
  validateGeneratedCard
} from '../functions/api/generate.js';
import { difficultyFromScenario } from '../functions/shared/requirement-count.js';
const require = createRequire(import.meta.url);
const localGenerator = require('../server/generate-card.js');
const {
  buildPrompt: buildFlowUpgradePrompt,
  deriveFlows: deriveCachedFlows
} = await import('../scripts/upgrade-cached-card-flows.mjs');

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
    {
      id: 'A',
      label: 'Call the consumer synchronously',
      prerequisiteTopics: ['api-design', 'real-time'],
      flows: [
        { from: 'producer', to: 'consumer', verb: 'calls', kind: 'sync' },
        { from: 'consumer', to: 'database', verb: 'writes', kind: 'sync' }
      ]
    },
    {
      id: 'B',
      label: 'Buffer work in a durable queue',
      prerequisiteTopics: ['api-design', 'messaging'],
      flows: [
        { from: 'producer', to: 'queue', verb: 'publishes', kind: 'async' },
        { from: 'queue', to: 'consumer', verb: 'delivers', kind: 'async' },
        { from: 'consumer', to: 'database', verb: 'writes', kind: 'sync' }
      ]
    },
    {
      id: 'C',
      label: 'Poll a shared database table',
      prerequisiteTopics: ['databases', 'queues', 'unknown'],
      flows: [
        { from: 'producer', to: 'database', verb: 'writes', kind: 'sync' },
        { from: 'consumer', to: 'database', verb: 'polls', kind: 'async' }
      ]
    },
    {
      id: 'D',
      label: 'Broadcast work to every consumer',
      prerequisiteTopics: ['messaging', 'queues'],
      flows: [
        { from: 'producer', to: 'queue', verb: 'broadcasts', kind: 'async' },
        { from: 'queue', to: 'consumer', verb: 'delivers', kind: 'async' }
      ]
    }
  ],
  correct: 'B',
  explanation: 'A queue absorbs bursts and lets the consumer recover.'
};

const letterCases = [
  { value: 0, expected: 'A' },
  { value: 0.25, expected: 'B' },
  { value: 0.5, expected: 'C' },
  { value: 0.75, expected: 'D' }
];

test('correct-letter selection maps four equal intervals and safe boundaries to A-D', () => {
  for (const { value, expected } of letterCases) {
    assert.equal(selectCorrectLetter(() => value), expected);
    assert.equal(localGenerator.selectCorrectLetter(() => value), expected);
  }
  assert.equal(selectCorrectLetter(() => 1), 'D');
  assert.equal(selectCorrectLetter(() => -1), 'A');
  assert.equal(selectCorrectLetter(() => Number.NaN), 'A');
});

test('both generation prompts consistently apply every designated correct letter', () => {
  for (const { expected } of letterCases) {
    for (const prompt of [
      buildPrompt('queues', 2, expected, 123),
      localGenerator.buildPrompt('queues', 2, expected, 123)
    ]) {
      assert.match(prompt, new RegExp(`(?:Option |where )${expected} is correct`));
      assert.match(prompt, new RegExp(`correct: "${expected}"`));
      assert.match(prompt, new RegExp(`why ${expected} wins`));
      assert.match(prompt, /Every option must include a non-empty flows array/);
      assert.match(prompt, /must not collapse into one identical linear chain/);
    }
  }
  const upgradePrompt = buildFlowUpgradePrompt({
    scenario: 'A queue serves 1000 requests per second.',
    nodes: ['Client', 'Queue'],
    options: [{ id: 'A', label: 'Use the queue' }],
    correct: 'A'
  });
  assert.match(upgradePrompt, /Every option must have wiring/);
  assert.match(upgradePrompt, /must not all collapse into one identical linear chain/);
});

test('cache normalization removes cards whose options share one linear topology', () => {
  const linearOptions = ['A', 'B', 'C', 'D'].map(id => ({
    id,
    label: `Option ${id}`,
    prerequisiteTopics: ['api-design', 'latency'],
    flows: [
      { from: 'Client', to: 'API', verb: `${id} requests`, kind: 'sync' },
      { from: 'API', to: 'Database', verb: `${id} queries`, kind: 'sync' }
    ]
  }));
  const badCard = {
    id: 'linear-options',
    topic: 'caching',
    scenario: 'An API serves 20,000 QPS and must keep p99 latency below 50ms.',
    nodes: ['Client', 'API', 'Database'],
    flows: [
      { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
      { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
    ],
    options: linearOptions,
    correct: 'A'
  };

  assert.equal(hasDegenerateLinearOptionTopology(badCard), true);
  assert.deepEqual(normalizeCacheValue({ cards: [badCard] }, 'caching', 2), { cards: [] });
});

test('standalone generator rejects cards whose options share one linear topology', () => {
  const linearOptions = ['A', 'B', 'C', 'D'].map(id => ({
    id,
    label: `A sufficiently descriptive option ${id} for this design`,
    prerequisiteTopics: ['api-design', 'latency'],
    flows: [
      { from: 'Client', to: 'API', verb: `${id} requests`, kind: 'sync' },
      { from: 'API', to: 'Database', verb: `${id} queries`, kind: 'sync' }
    ]
  }));
  const badCard = {
    id: 'linear-options',
    topic: 'caching',
    difficulty: 2,
    prerequisiteTopics: ['api-design'],
    scenario: 'An API serves 20,000 QPS and must keep p99 latency below 50ms.',
    nodes: ['Client', 'API', 'Database'],
    flows: [
      { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
      { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
    ],
    options: linearOptions,
    correct: 'A',
    explanation: 'This explanation is intentionally long enough to pass the minimum length check for the standalone generator.'
  };

  assert.throws(
    () => localGenerator.extractAndValidate(JSON.stringify(badCard), 'A'),
    /option flows collapse into the same linear topology/
  );
  assert.throws(
    () => validateGeneratedCard(badCard, 'A'),
    /option flows collapse into the same linear topology/
  );
});

test('cached flow migration refuses to invent a correct option diagram', async () => {
  const result = await deriveCachedFlows({
    nodes: ['Client', 'API', 'Database'],
    options: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' }
    ],
    correct: 'B'
  }, 1, () => JSON.stringify({
    flows: [
      { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
      { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
    ],
    optionFlows: {
      A: [{ from: 'Client', to: 'API', verb: 'requests', kind: 'sync' }]
    }
  }));

  assert.match(result.error, /correct option wiring is unavailable/);
  assert.deepEqual(result.optionFlows, {});
});

test('cached flow migration rejects an all-linear option topology', async () => {
  const result = await deriveCachedFlows({
    nodes: ['Client', 'API', 'Database'],
    options: ['A', 'B', 'C', 'D'].map(id => ({ id, label: id })),
    correct: 'A'
  }, 1, () => JSON.stringify({
    flows: [
      { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
      { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
    ],
    optionFlows: Object.fromEntries(['A', 'B', 'C', 'D'].map(id => [id, [
      { from: 'Client', to: 'API', verb: `${id} requests`, kind: 'sync' },
      { from: 'API', to: 'Database', verb: `${id} queries`, kind: 'sync' }
    ]]))
  }));

  assert.match(result.error, /option flows collapse into the same linear topology/);
  assert.deepEqual(result.optionFlows, {});
});

test('generation retries a temporary provider failure and caches the card', async () => {
  const originalFetch = globalThis.fetch;
  const models = [];
  let attempts = 0;
  let cached;

  globalThis.fetch = async (_url, options) => {
    attempts++;
    models.push(JSON.parse(options.body).model);
    if (attempts === 1) {
      return new Response('overloaded', { status: 503 });
    }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(card) } }]
    });
  };

  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2'),
      random: () => 0.25,
      env: {
        OPENCODE_API_KEY: 'test-key',
        CARD_CACHE: {
          get: async () => null,
          put: async (key, value, options) => {
            cached = { key, value, options };
          }
        }
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.cached, false);
    assert.equal(body.card.id, card.id);
    assert.deepEqual(models, ['deepseek-v4-flash', 'deepseek-v4-flash']);
    assert.equal(cached.key, 'queues:2');
    assert.equal(JSON.parse(cached.value).cards[0].id, card.id);
    assert.deepEqual(
      JSON.parse(cached.value).cards[0].prerequisiteTopics,
      ['api-design', 'real-time', 'messaging', 'databases', 'unknown']
    );
    assert.deepEqual(
      JSON.parse(cached.value).cards[0].options.map(option => option.prerequisiteTopics),
      [
        ['api-design', 'real-time'],
        ['api-design', 'messaging'],
        ['databases', 'unknown'],
        ['messaging']
      ]
    );
    assert.equal(cached.options, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generation rejects a designated-letter mismatch without caching it', async () => {
  const originalFetch = globalThis.fetch;
  let cacheWrites = 0;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify(card) } }]
  });

  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2'),
      random: () => 0.5,
      env: {
        OPENCODE_API_KEY: 'test-key',
        CARD_CACHE: {
          get: async () => null,
          put: async () => { cacheWrites++; }
        }
      }
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, 'Invalid field: correct must match designated option C');
    assert.equal(cacheWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local validation rejects a designated-letter mismatch', () => {
  const localCard = {
    ...card,
    scenario: 'A service handles 1000 requests per second under burst traffic.',
    nodes: ['producer', 'queue', 'consumer'],
    options: card.options.map(option => ({
      ...option,
      label: `${option.label} with a production-ready scaling strategy`
    })),
    explanation: 'This detailed explanation is intentionally longer than eighty characters and compares each distinct system design trade-off.'
  };

  assert.throws(
    () => localGenerator.extractAndValidate(JSON.stringify(localCard), 'C'),
    /correct must match designated option C/
  );
});

test('local validation rejects an unlabeled flow', () => {
  const localCard = {
    ...card,
    flows: card.flows.map((flow, index) => index === 0 ? { ...flow, verb: ' ' } : flow),
    explanation: 'This detailed explanation is intentionally longer than eighty characters and compares each distinct system design trade-off.'
  };

  assert.throws(
    () => localGenerator.extractAndValidate(JSON.stringify(localCard), 'B'),
    /flows must have non-empty labels/
  );
});

test('local validation rejects option flows that reference unknown nodes', () => {
  const localCard = {
    ...card,
    scenario: 'A service handles 1000 requests per second under burst traffic.',
    options: card.options.map((option, index) => index === 0
      ? { ...option, flows: [{ from: 'producer', to: 'ghost', verb: 'connects', kind: 'sync' }] }
      : option),
    explanation: 'This detailed explanation is intentionally longer than eighty characters and compares each distinct system design trade-off.'
  };

  assert.throws(
    () => localGenerator.extractAndValidate(JSON.stringify(localCard), 'B'),
    /option flows must reference distinct node names/
  );
});

test('cached legacy cards gain canonical prerequisites without an expiration', async () => {
  const legacyCard = {
    ...card,
    options: card.options.map(({ prerequisiteTopics: _, ...option }) => option)
  };
  delete legacyCard.prerequisiteTopics;
  let rewritten;

  const response = await onRequest({
    request: new Request('https://example.com/api/generate?topic=queues&difficulty=2'),
    env: {
      CARD_CACHE: {
        get: async () => JSON.stringify(legacyCard),
        put: async (key, value, options) => {
          rewritten = { key, value, options };
        }
      }
    }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.cached, true);
  assert.deepEqual(body.card.prerequisiteTopics, ['api-design']);
  assert.deepEqual(
    body.card.options.map(option => option.prerequisiteTopics),
    [[], [], [], []]
  );
  assert.equal(rewritten.key, 'queues:2');
  assert.deepEqual(JSON.parse(rewritten.value).cards[0].prerequisiteTopics, ['api-design']);
  assert.equal(rewritten.options, undefined);
});

test('cached curated cards backfill option prerequisites once and stay idempotent', async () => {
  const legacyCard = {
    ...card,
    id: 'caching-gen-1785366879678',
    topic: 'caching',
    options: card.options.map(({ prerequisiteTopics: _, ...option }) => option)
  };
  let stored = JSON.stringify({ cards: [legacyCard] });
  let cacheWrites = 0;

  const cache = {
    get: async () => stored,
    put: async (key, value, options) => {
      assert.equal(key, 'caching:2');
      assert.equal(options, undefined);
      cacheWrites++;
      stored = value;
    }
  };
  const request = new Request('https://example.com/api/generate?topic=caching&difficulty=2');

  const first = await onRequest({ request, env: { CARD_CACHE: cache } });
  const firstBody = await first.json();

  assert.equal(firstBody.cached, true);
  assert.deepEqual(
    firstBody.card.options.map(option => option.prerequisiteTopics),
    [
      ['cdn-caching', 'cache-invalidation', 'content-freshness'],
      ['cache-aside', 'cache-eviction', 'aggregation-latency'],
      ['read-replication', 'replication-lag', 'connection-pooling'],
      ['write-through-caching', 'write-latency', 'cache-coherence']
    ]
  );
  assert.deepEqual(firstBody.card.prerequisiteTopics, [
    'api-design', 'cdn-caching', 'cache-invalidation', 'content-freshness',
    'cache-aside', 'cache-eviction', 'aggregation-latency', 'read-replication',
    'replication-lag', 'connection-pooling', 'write-through-caching',
    'write-latency', 'cache-coherence'
  ]);
  assert.equal(cacheWrites, 1);

  const second = await onRequest({ request, env: { CARD_CACHE: cache } });
  const secondBody = await second.json();
  assert.deepEqual(secondBody.card, JSON.parse(stored).cards[0]);
  assert.equal(cacheWrites, 1);
});

test('cached cards without a curated entry preserve empty option prerequisites', async () => {
  const emptyOptionsCard = {
    ...card,
    difficulty: difficultyFromScenario(card.scenario),
    options: card.options.map(option => ({ ...option, prerequisiteTopics: [] }))
  };
  let cacheWrites = 0;

  const response = await onRequest({
    request: new Request('https://example.com/api/generate?topic=queues&difficulty=2'),
    env: {
      CARD_CACHE: {
        get: async () => JSON.stringify({ cards: [emptyOptionsCard] }),
        put: async () => { cacheWrites++; }
      }
    }
  });
  const body = await response.json();

  assert.equal(body.cached, true);
  assert.deepEqual(body.card.options.map(option => option.prerequisiteTopics), [[], [], [], []]);
  assert.equal(cacheWrites, 0);
});

test('cached curated cards with authored option prerequisites stay byte-identical', async () => {
  const authoredCard = {
    ...card,
    id: 'caching-gen-1785366879678',
    topic: 'caching',
    difficulty: difficultyFromScenario(card.scenario),
    prerequisiteTopics: [
      'api-design', 'cdn-caching', 'cache-invalidation', 'content-freshness',
      'cache-aside', 'cache-eviction', 'aggregation-latency', 'read-replication',
      'replication-lag', 'connection-pooling', 'write-through-caching',
      'write-latency', 'cache-coherence'
    ],
    options: [
      { ...card.options[0], prerequisiteTopics: ['cdn-caching', 'cache-invalidation', 'content-freshness'] },
      { ...card.options[1], prerequisiteTopics: ['cache-aside', 'cache-eviction', 'aggregation-latency'] },
      { ...card.options[2], prerequisiteTopics: ['read-replication', 'replication-lag', 'connection-pooling'] },
      { ...card.options[3], prerequisiteTopics: ['write-through-caching', 'write-latency', 'cache-coherence'] }
    ]
  };
  const stored = JSON.stringify({ cards: [authoredCard] });
  let cacheWrites = 0;

  const response = await onRequest({
    request: new Request('https://example.com/api/generate?topic=caching&difficulty=2'),
    env: {
      CARD_CACHE: {
        get: async () => stored,
        put: async () => { cacheWrites++; }
      }
    }
  });
  const body = await response.json();

  assert.equal(body.cached, true);
  assert.deepEqual(body.card, authoredCard);
  assert.equal(cacheWrites, 0);
});

test('generation rejects an option without prerequisite topics', async () => {
  const originalFetch = globalThis.fetch;
  const invalidCard = {
    ...card,
    options: card.options.map(option => ({ ...option }))
  };
  delete invalidCard.options[2].prerequisiteTopics;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify(invalidCard) } }]
  });

  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2'),
      env: { OPENCODE_API_KEY: 'test-key' }
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, 'Invalid field: option prerequisiteTopics');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generation rejects shallow one-concept option prerequisites', async () => {
  const originalFetch = globalThis.fetch;
  const shallowCard = {
    ...card,
    options: card.options.map(option => ({
      ...option,
      prerequisiteTopics: ['databases']
    }))
  };
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify(shallowCard) } }]
  });

  try {
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2'),
      env: { OPENCODE_API_KEY: 'test-key' }
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, 'Each option needs 2-4 prerequisite concepts');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generation fails clearly when the server-side key is missing', async () => {
  const response = await onRequest({
    request: new Request('https://example.com/api/generate?topic=queues'),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, 'Card generation is not configured');
});

test('pool helpers fingerprint, normalize, deduplicate, and retain the newest cards', () => {
  // Arrange
  const cards = Array.from({ length: 22 }, (_, index) => ({
    ...card,
    id: `card-${index}`,
    scenario: ` Scenario   ${index} `
  }));
  cards.push({ ...card, id: 'newest-duplicate', scenario: 'scenario 21' });

  // Act
  const normalized = normalizeCacheValue({ cards }, 'caching', 4);

  // Assert
  assert.equal(scenarioFingerprint('  Mixed\n CASE  '), 'mixed case');
  assert.equal(scenarioFingerprint(null), '');
  assert.equal(normalized.cards.length, 20);
  assert.equal(normalized.cards.at(-1).id, 'newest-duplicate');
  assert.equal(normalized.cards[0].id, 'card-2');
  assert.ok(normalized.cards.every(candidate => candidate.topic === 'caching'));
  assert.ok(normalized.cards.every(candidate => candidate.difficulty === difficultyFromScenario(candidate.scenario)));
  assert.deepEqual(deduplicatePool([{ scenario: '' }, { scenario: null }]), []);
  assert.deepEqual(normalizeCacheValue({ cards: 'invalid' }, 'queues', 2), { cards: [] });
});

test('an unseen cached pool member is returned after one normalization write', async () => {
  // Arrange
  const first = { ...card, id: 'first', scenario: 'Already seen scenario' };
  const second = { ...card, id: 'second', scenario: 'Fresh cached scenario' };
  let cacheWrites = 0;

  // Act
  const response = await onRequest({
    request: new Request('https://example.com/api/generate?topic=queues&difficulty=2&exclude=already%20seen%20scenario'),
    env: {
      CARD_CACHE: {
        get: async () => JSON.stringify({ cards: [first, second] }),
        put: async () => { cacheWrites++; }
      }
    }
  });
  const body = await response.json();

  // Assert
  assert.equal(response.status, 200);
  assert.equal(body.cached, true);
  assert.equal(body.card.id, 'second');
  assert.equal(body.poolSize, 2);
  assert.equal(body.poolLimit, 20);
  assert.equal(cacheWrites, 1);
});

test('exhausted exclusions generate and append a distinct card', async () => {
  // Arrange
  const originalFetch = globalThis.fetch;
  const existing = { ...card, id: 'existing', scenario: 'Existing scenario' };
  const generated = { ...card, id: 'generated', scenario: 'Brand new scenario handles 5,000 requests per second' };
  let stored;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify(generated) } }]
  });

  try {
    // Act
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2&exclude=existing%20scenario'),
      random: () => 0.25,
      env: {
        OPENCODE_API_KEY: 'test-key',
        CARD_CACHE: {
          get: async () => JSON.stringify({ cards: [existing] }),
          put: async (_key, value) => { stored = JSON.parse(value); }
        }
      }
    });
    const body = await response.json();

    // Assert
    assert.equal(response.status, 200);
    assert.equal(body.cached, false);
    assert.equal(body.card.id, 'generated');
    assert.deepEqual(stored.cards.map(candidate => candidate.id), ['existing', 'generated']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('force generation skips an available cached card', async () => {
  // Arrange
  const originalFetch = globalThis.fetch;
  const generated = { ...card, id: 'forced', scenario: 'Forced distinct scenario handles 5,000 requests per second' };
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls++;
    return Response.json({ choices: [{ message: { content: JSON.stringify(generated) } }] });
  };

  try {
    // Act
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2&force=1'),
      random: () => 0.25,
      env: {
        OPENCODE_API_KEY: 'test-key',
        CARD_CACHE: {
          get: async () => JSON.stringify({ cards: [card] }),
          put: async () => {}
        }
      }
    });
    const body = await response.json();

    // Assert
    assert.equal(body.card.id, 'forced');
    assert.equal(body.cached, false);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('duplicate generated scenarios are retried and never appended', async () => {
  // Arrange
  const originalFetch = globalThis.fetch;
  const existing = { ...card, id: 'existing', scenario: 'Same scenario' };
  const distinct = { ...card, id: 'distinct', scenario: 'Different scenario handles 5,000 requests per second' };
  let providerCalls = 0;
  let stored;
  globalThis.fetch = async () => {
    providerCalls++;
    const candidate = providerCalls === 1 ? existing : distinct;
    return Response.json({ choices: [{ message: { content: JSON.stringify(candidate) } }] });
  };

  try {
    // Act
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2&force=1'),
      random: () => 0.25,
      env: {
        OPENCODE_API_KEY: 'test-key',
        CARD_CACHE: {
          get: async () => JSON.stringify({ cards: [existing] }),
          put: async (_key, value) => { stored = JSON.parse(value); }
        }
      }
    });

    // Assert
    assert.equal(response.status, 200);
    assert.equal(providerCalls, 2);
    assert.deepEqual(stored.cards.map(candidate => candidate.id), ['existing', 'distinct']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('malformed cache recovers through generation with one pool write', async () => {
  // Arrange
  const originalFetch = globalThis.fetch;
  let writes = 0;
  let stored;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify(card) } }]
  });

  try {
    // Act
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2'),
      random: () => 0.25,
      env: {
        OPENCODE_API_KEY: 'test-key',
        CARD_CACHE: {
          get: async () => '{broken',
          put: async (key, value) => { if (key === 'queues:2') { writes++; stored = JSON.parse(value); } }
        }
      }
    });

    // Assert
    assert.equal(response.status, 200);
    assert.equal(writes, 1);
    assert.equal(stored.cards[0].id, card.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider failure leaves the stored pool unchanged', async () => {
  // Arrange
  const originalFetch = globalThis.fetch;
  const storedPool = JSON.stringify({ cards: [card] });
  let cacheWrites = 0;
  globalThis.fetch = async () => new Response('unavailable', { status: 500 });

  try {
    // Act
    const response = await onRequest({
      request: new Request('https://example.com/api/generate?topic=queues&difficulty=2&force=1'),
      env: {
        OPENCODE_API_KEY: 'test-key',
        CARD_CACHE: {
          get: async () => storedPool,
          put: async () => { cacheWrites++; }
        }
      }
    });
    const body = await response.json();

    // Assert
    assert.equal(response.status, 500);
    assert.equal(body.error, 'Card generation provider is temporarily unavailable');
    assert.equal(cacheWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('only the first 100 valid exclusion fingerprints are accepted', async () => {
  // Arrange
  const pool = Array.from({ length: 101 }, (_, index) => ({
    ...card,
    id: `cached-${index}`,
    scenario: `excluded scenario ${index}`
  }));
  const query = pool.map(candidate => `exclude=${encodeURIComponent(candidate.scenario)}`).join('&');

  // Act
  const response = await onRequest({
    request: new Request(`https://example.com/api/generate?topic=queues&difficulty=2&${query}`),
    env: { CARD_CACHE: { get: async () => JSON.stringify({ cards: pool }), put: async () => {} } }
  });
  const body = await response.json();

  // Assert
  assert.equal(response.status, 200);
  assert.equal(body.cached, true);
  assert.equal(body.card.id, 'cached-100');
});
