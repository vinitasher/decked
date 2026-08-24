import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildSnapshot } from '../scripts/dump-production-card-cache.mjs';
import {
  hasDegenerateLinearOptionTopology,
  hasUsableCorrectOptionWiring
} from '../functions/api/generate.js';
import { difficultyFromScenario } from '../functions/shared/requirement-count.js';

const snapshot = JSON.parse(
  await readFile(new URL('../server/production-card-cache.json', import.meta.url), 'utf8')
);

function cardsIn(value) {
  if (Array.isArray(value?.cards)) return value.cards;
  if (value && typeof value === 'object' && !Array.isArray(value)) return [value];
  return [];
}

function isSingleCard(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.scenario === 'string';
}

function fixtureKV() {
  return {
    async listKeys() {
      return Object.keys(snapshot);
    },
    async getKey(key) {
      return JSON.stringify(snapshot[key]);
    }
  };
}

test('snapshot parses as JSON and holds exactly 11 topic:difficulty keys', () => {
  const keys = Object.keys(snapshot);
  assert.equal(keys.length, 11);
  for (const key of keys) {
    assert.match(key, /^[a-z0-9]+(?:-[a-z0-9]+)*:[0-9]+$/, `${key} is not a topic:difficulty key`);
  }
});

test('snapshot spans exactly 6 distinct topics', () => {
  const topics = new Set(Object.keys(snapshot).map(key => key.split(':')[0]));
  assert.equal(topics.size, 6);
  for (const topic of topics) {
    assert.equal(typeof topic, 'string');
    assert.ok(topic.length > 0);
  }
});

test('every value is a cards pool or a single card object', () => {
  for (const [key, value] of Object.entries(snapshot)) {
    assert.equal(typeof value, 'object');
    assert.ok(value !== null, `${key} value is null`);
    assert.ok(!Array.isArray(value), `${key} value is an array`);
    const isPool = Array.isArray(value.cards);
    assert.ok(isPool || isSingleCard(value), `${key} is neither a pool nor a single card`);
  }
});

test('every card carries the stored fields and four options', () => {
  const required = ['id', 'topic', 'difficulty', 'scenario', 'nodes', 'options', 'correct', 'explanation'];
  for (const [key, value] of Object.entries(snapshot)) {
    for (const card of cardsIn(value)) {
      assert.equal(typeof card, 'object');
      for (const field of required) {
        assert.ok(
          card[field] !== undefined && card[field] !== null,
          `${key}/${card.id} is missing ${field}`
        );
      }
      assert.ok(Array.isArray(card.nodes) && card.nodes.length >= 3, `${key}/${card.id} nodes look wrong`);
      assert.ok(Array.isArray(card.options) && card.options.length === 4, `${key}/${card.id} options look wrong`);
      assert.equal(card.topic, key.split(':')[0], `${key}/${card.id} topic does not match its key`);
      assert.equal(
        card.difficulty,
        difficultyFromScenario(card.scenario),
        `${key}/${card.id} difficulty does not match its scenario's requirement count`
      );
    }
  }
});

test('every cached card carries validated diagram flows', () => {
  const kinds = new Set(['sync', 'async', 'callback']);
  const endUser = /^(end[- ]?user|user|web client|mobile app|browser|client|customer|app)$/i;
  for (const [key, value] of Object.entries(snapshot)) {
    for (const card of cardsIn(value)) {
      assert.ok(Array.isArray(card.flows) && card.flows.length >= card.nodes.length - 1,
        `${key}/${card.id} flows must connect the nodes`);
      const nodeSet = new Set(card.nodes);
      for (const flow of card.flows) {
        assert.ok(flow && nodeSet.has(flow.from) && nodeSet.has(flow.to) && flow.from !== flow.to,
          `${key}/${card.id} flow references an unknown node`);
        assert.ok(typeof flow.verb === 'string', `${key}/${card.id} flow verb missing`);
        assert.ok(kinds.has(flow.kind), `${key}/${card.id} flow kind invalid`);
      }
      for (const node of card.nodes) {
        assert.ok(card.flows.some(flow => flow.from === node || flow.to === node),
          `${key}/${card.id} node ${node} appears in no flow`);
      }
      assert.ok(endUser.test(card.nodes[0]), `${key}/${card.id} must start from the end user`);
      assert.equal(card.flows[0].from, card.nodes[0],
        `${key}/${card.id} first flow must leave the end-user node`);
      assert.equal(hasDegenerateLinearOptionTopology(card), false,
        `${key}/${card.id} options must not collapse into one linear topology`);
      assert.equal(hasUsableCorrectOptionWiring(card), true,
        `${key}/${card.id} must have usable correct-option wiring`);
      const correctOption = card.options.find(option => option?.id === card.correct);
      assert.ok(Array.isArray(correctOption?.flows) && correctOption.flows.length > 0,
        `${key}/${card.id} correct option must carry wiring for compare diagrams`);
      for (const option of card.options) {
        if (!option.flows) continue;
        for (const flow of option.flows) {
          assert.ok(nodeSet.has(flow.from) && nodeSet.has(flow.to),
            `${key}/${card.id} option ${option.id} flow references an unknown node`);
        }
      }
    }
  }
});

test('pool values expose their cards via the cards array', () => {
  const poolKeys = Object.keys(snapshot).filter(key => Array.isArray(snapshot[key].cards));
  assert.ok(poolKeys.length > 0, 'expected at least one pool value in the snapshot');
  for (const key of poolKeys) {
    assert.ok(snapshot[key].cards.length >= 1, `${key} pool is empty`);
  }
});

test('snapshot records the known production cards from the founder evidence', () => {
  const known = [
    ['caching:3', 'caching-gen-1785308045999'],
    ['queues:2', 'queues-gen-1785309937957'],
    ['databases:3', 'databases-gen-1785307992817']
  ];
  for (const [key, id] of known) {
    const cards = cardsIn(snapshot[key]);
    assert.ok(cards.some(card => card.id === id), `${key} should contain ${id}`);
  }
});

test('buildSnapshot regenerates the committed snapshot verbatim from a fixture', async () => {
  const { snapshot: regenerated, warnings } = await buildSnapshot(fixtureKV());
  assert.deepEqual(warnings, []);
  assert.deepEqual(regenerated, snapshot);
});

test('buildSnapshot reports malformed values and off-pattern keys without crashing', async () => {
  const kv = {
    async listKeys() {
      return ['caching:1', 'not-a-valid-key', 'malformed:1', 'unreadable:1'];
    },
    async getKey(key) {
      if (key === 'malformed:1') return '{not valid json';
      if (key === 'unreadable:1') throw new Error('boom');
      return JSON.stringify({
        id: 'caching-gen-1',
        topic: 'caching',
        difficulty: 1,
        scenario: 'A scenario.',
        nodes: ['A', 'B', 'C'],
        options: [],
        correct: 'A',
        explanation: 'Why.'
      });
    }
  };
  const { snapshot: result, warnings } = await buildSnapshot(kv);
  assert.deepEqual(Object.keys(result).sort(), ['caching:1', 'malformed:1', 'not-a-valid-key']);
  assert.equal(result['malformed:1'], '{not valid json');
  const messages = warnings.map(warning => String(warning));
  assert.ok(messages.some(message => message.includes('malformed:1')));
  assert.ok(messages.some(message => message.includes('not-a-valid-key')));
  assert.ok(messages.some(message => message.includes('unreadable:1')));
});
