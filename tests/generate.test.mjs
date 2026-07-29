import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../functions/api/generate.js', import.meta.url), 'utf8');
const { onRequest } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const card = {
  id: 'queues-generated',
  topic: 'queues',
  difficulty: 2,
  prerequisiteTopics: ['api-design'],
  scenario: 'A producer sends more work than a consumer can process.',
  nodes: ['producer', 'queue', 'consumer', 'database'],
  options: [
    { id: 'A', label: 'Call the consumer synchronously' },
    { id: 'B', label: 'Buffer work in a durable queue' }
  ],
  correct: 'B',
  explanation: 'A queue absorbs bursts and lets the consumer recover.'
};

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
    assert.deepEqual(JSON.parse(cached.value).prerequisiteTopics, ['api-design']);
    assert.equal(cached.options, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cached legacy cards gain canonical prerequisites without an expiration', async () => {
  const legacyCard = { ...card };
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
  assert.equal(rewritten.key, 'queues:2');
  assert.deepEqual(JSON.parse(rewritten.value).prerequisiteTopics, ['api-design']);
  assert.equal(rewritten.options, undefined);
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
