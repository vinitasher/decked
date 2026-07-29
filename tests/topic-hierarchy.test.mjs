import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${source}
globalThis.catalog = TOPIC_CATALOG;
globalThis.cards = SEED_CARDS;
globalThis.normalize = normalizeCardPrerequisites;`, context);

const catalog = JSON.parse(JSON.stringify(context.catalog));
const cards = JSON.parse(JSON.stringify(context.cards));

test('topic catalog references existing topics and has no self-dependencies', () => {
  for (const [topic, details] of Object.entries(catalog)) {
    assert.ok(Array.isArray(details.prerequisites));
    assert.equal(details.prerequisites.includes(topic), false);
    for (const prerequisite of details.prerequisites) {
      assert.ok(catalog[prerequisite], `${topic} references missing topic ${prerequisite}`);
    }
  }
});

test('topic catalog is acyclic', () => {
  const visited = new Set();
  const visiting = new Set();

  function visit(topic) {
    assert.equal(visiting.has(topic), false, `cycle detected at ${topic}`);
    if (visited.has(topic)) return;
    visiting.add(topic);
    for (const prerequisite of catalog[topic].prerequisites) visit(prerequisite);
    visiting.delete(topic);
    visited.add(topic);
  }

  for (const topic of Object.keys(catalog)) visit(topic);
  assert.equal(visited.size, Object.keys(catalog).length);
});

test('every seed card declares valid prerequisites', () => {
  for (const card of cards) {
    assert.ok(Array.isArray(card.prerequisiteTopics), `${card.id} lacks prerequisites`);
    assert.deepEqual(card.prerequisiteTopics, catalog[card.topic].prerequisites);
  }
});

test('legacy cards receive defaults while authored prerequisites are preserved', () => {
  const legacy = context.normalize({ topic: 'consensus' });
  const authored = context.normalize({
    topic: 'custom-topic',
    prerequisiteTopics: ['api-design', 'api-design', 'custom-topic', 'unknown']
  });

  assert.deepEqual([...legacy.prerequisiteTopics], ['databases', 'storage']);
  assert.deepEqual([...authored.prerequisiteTopics], ['api-design']);
});
