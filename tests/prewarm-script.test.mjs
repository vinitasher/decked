import assert from 'node:assert/strict';
import test from 'node:test';

import {
  main,
  parseArgs,
  readWikiTopics,
  runPrewarm
} from '../scripts/prewarm-sandboxes.mjs';

function topicFromRequest(options) {
  return JSON.parse(options.body).topics[0];
}

test('prewarm script discovers the complete canonical Wiki catalog', async () => {
  const topics = await readWikiTopics();
  assert.ok(topics.length >= 80);
  assert.equal(new Set(topics).size, topics.length);
  assert.ok(topics.includes('caching'));
  assert.ok(topics.includes('database-indexing'));
  assert.ok(topics.every(topic => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)));
});

test('prewarm script parses bounded sequential options', () => {
  assert.deepEqual(parseArgs(['--limit', '4', '--retries', '0', '--dry-run']), {
    limit: 4,
    dryRun: true,
    url: null,
    retries: 0
  });
  assert.throws(() => parseArgs(['--limit', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--retries', '-1']), /non-negative integer/);
});

test('prewarm script waits for each topic before starting the next request', async () => {
  let active = 0;
  let maximumActive = 0;
  const order = [];
  const results = await runPrewarm({
    topics: ['first-topic', 'second-topic', 'third-topic'],
    url: 'https://example.com/api/sandbox/prewarm',
    token: 'secret-that-must-not-be-logged',
    retries: 0,
    fetchImpl: async (_url, options) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      const topic = topicFromRequest(options);
      order.push(topic);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return Response.json({ results: [{ topic, status: 'generated' }] });
    }
  });
  assert.equal(maximumActive, 1);
  assert.deepEqual(order, ['first-topic', 'second-topic', 'third-topic']);
  assert.deepEqual(results.map(result => result.status), ['generated', 'generated', 'generated']);
});

test('prewarm script retries one failed topic before moving on', async () => {
  const order = [];
  const attempts = new Map();
  const results = await runPrewarm({
    topics: ['retry-topic', 'next-topic'],
    url: 'https://example.com/api/sandbox/prewarm',
    token: 'secret',
    retries: 1,
    fetchImpl: async (_url, options) => {
      const topic = topicFromRequest(options);
      const attempt = (attempts.get(topic) || 0) + 1;
      attempts.set(topic, attempt);
      order.push(`${topic}:${attempt}`);
      if (topic === 'retry-topic' && attempt === 1) return new Response('', { status: 503 });
      return Response.json({ results: [{ topic, status: 'cached' }] });
    },
    sleepImpl: async () => {}
  });
  assert.deepEqual(order, ['retry-topic:1', 'retry-topic:2', 'next-topic:1']);
  assert.deepEqual(results.map(result => result.status), ['cached', 'cached']);
});

test('dry-run reports the selected catalog slice without requiring a token', async () => {
  const result = await main(['--dry-run', '--limit', '3'], {});
  assert.equal(result.topics.length, 3);
  assert.deepEqual(result.results, []);
});
