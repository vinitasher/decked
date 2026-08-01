import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../functions/api/generate.js', import.meta.url), 'utf8');
const { buildPrompt, onRequest, selectCorrectLetter } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const require = createRequire(import.meta.url);
const localGenerator = require('../server/generate-card.js');

const card = {
  id: 'queues-generated',
  topic: 'queues',
  difficulty: 2,
  prerequisiteTopics: ['api-design'],
  scenario: 'A producer sends more work than a consumer can process.',
  nodes: ['producer', 'queue', 'consumer', 'database'],
  options: [
    {
      id: 'A',
      label: 'Call the consumer synchronously',
      prerequisiteTopics: ['api-design', 'real-time']
    },
    {
      id: 'B',
      label: 'Buffer work in a durable queue',
      prerequisiteTopics: ['api-design', 'messaging']
    },
    {
      id: 'C',
      label: 'Poll a shared database table',
      prerequisiteTopics: ['databases', 'queues', 'unknown']
    },
    {
      id: 'D',
      label: 'Broadcast work to every consumer',
      prerequisiteTopics: ['messaging', 'queues']
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
    }
  }
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
    assert.equal(JSON.parse(cached.value).id, card.id);
    assert.deepEqual(
      JSON.parse(cached.value).prerequisiteTopics,
      ['api-design', 'real-time', 'messaging', 'databases', 'unknown']
    );
    assert.deepEqual(
      JSON.parse(cached.value).options.map(option => option.prerequisiteTopics),
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
  assert.deepEqual(JSON.parse(rewritten.value).prerequisiteTopics, ['api-design']);
  assert.equal(rewritten.options, undefined);
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
