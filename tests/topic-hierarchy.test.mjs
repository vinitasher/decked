import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const localCache = JSON.parse(
  await readFile(new URL('../server/card-cache.json', import.meta.url), 'utf8')
);
const context = {};
vm.createContext(context);
vm.runInContext(`${source}
globalThis.catalog = TOPIC_CATALOG;
globalThis.cards = SEED_CARDS;
globalThis.legacyOptionPrerequisites = LEGACY_OPTION_PREREQUISITES;
globalThis.normalize = normalizeCardPrerequisites;`, context);

const catalog = JSON.parse(JSON.stringify(context.catalog));
const cards = JSON.parse(JSON.stringify(context.cards));
const legacyOptionPrerequisites = JSON.parse(
  JSON.stringify(context.legacyOptionPrerequisites)
);

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
    const normalized = JSON.parse(JSON.stringify(
      context.normalize(JSON.parse(JSON.stringify(card)))
    ));
    for (const option of normalized.options) {
      assert.ok(Array.isArray(option.prerequisiteTopics), `${card.id}/${option.id} lacks prerequisites`);
      assert.ok(option.prerequisiteTopics.length >= 2, `${card.id}/${option.id} is too broad`);
      assert.ok(option.prerequisiteTopics.length <= 4, `${card.id}/${option.id} is unfocused`);
      for (const prerequisite of option.prerequisiteTopics) {
        assert.match(prerequisite, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        assert.notEqual(prerequisite, card.topic);
        assert.ok(normalized.prerequisiteTopics.includes(prerequisite));
      }
    }
  }
});

test('reviewed migration covers every repository-held historical option', () => {
  const historicalCards = [...cards, ...Object.values(localCache)];
  const broadCategories = new Set(Object.keys(catalog));
  assert.equal(historicalCards.length, 7);
  assert.equal(
    historicalCards.reduce((total, card) => total + card.options.length, 0),
    28
  );
  assert.deepEqual(
    historicalCards.map(card => card.id).sort(),
    Object.keys(legacyOptionPrerequisites).sort()
  );

  for (const card of historicalCards) {
    const normalized = JSON.parse(JSON.stringify(
      context.normalize(JSON.parse(JSON.stringify(card)))
    ));
    assert.deepEqual(
      normalized.options.map(option => option.id).sort(),
      Object.keys(legacyOptionPrerequisites[card.id]).sort()
    );
    for (const option of normalized.options) {
      assert.deepEqual(
        JSON.parse(JSON.stringify(option.prerequisiteTopics)),
        JSON.parse(JSON.stringify(legacyOptionPrerequisites[card.id][option.id]))
      );
      assert.equal(
        option.prerequisiteTopics.some(topic => broadCategories.has(topic)),
        false,
        `${card.id}/${option.id} still uses a broad category`
      );
    }
  }
});

test('legacy cards receive defaults and empty option prerequisite lists', () => {
  const legacy = context.normalize({
    topic: 'consensus',
    options: [{ id: 'A', label: 'Legacy option' }]
  });
  const authored = context.normalize({
    topic: 'custom-topic',
    prerequisiteTopics: ['api-design', 'api-design', 'custom-topic', 'unknown'],
    options: []
  });

  assert.deepEqual([...legacy.prerequisiteTopics], ['databases', 'storage']);
  assert.deepEqual([...legacy.options[0].prerequisiteTopics], []);
  assert.deepEqual([...authored.prerequisiteTopics], ['api-design', 'unknown']);
});

test('card prerequisites aggregate all normalized option prerequisites', () => {
  const card = context.normalize({
    topic: 'queues',
    prerequisiteTopics: ['security'],
    options: [
      { id: 'A', label: 'A', prerequisiteTopics: ['api-design', 'databases'] },
      { id: 'B', label: 'B', prerequisiteTopics: ['messaging', 'databases'] },
      { id: 'C', label: 'C', prerequisiteTopics: ['queues', 'unknown', null] },
      { id: 'D', label: 'D', prerequisiteTopics: ['security'] }
    ]
  });

  assert.deepEqual(
    [...card.prerequisiteTopics],
    ['api-design', 'security', 'databases', 'messaging', 'unknown']
  );
  assert.deepEqual(
    card.options.map(option => [...option.prerequisiteTopics]),
    [
      ['api-design', 'databases'],
      ['messaging', 'databases'],
      ['unknown'],
      ['security']
    ]
  );
});

test('reviewed migration replaces previous coarse historical values', () => {
  const migrated = context.normalize({
    id: 'fallback-cache-001',
    topic: 'caching',
    prerequisiteTopics: ['api-design'],
    options: [
      { id: 'A', label: 'Legacy CDN option' },
      { id: 'B', label: 'Previously coarse option', prerequisiteTopics: ['databases'] }
    ]
  });

  assert.deepEqual(
    [...migrated.options[0].prerequisiteTopics],
    ['cdn-caching', 'http-cacheability', 'cache-invalidation']
  );
  assert.deepEqual(
    [...migrated.options[1].prerequisiteTopics],
    ['cache-aside', 'workload-skew', 'cache-eviction']
  );
  assert.equal(migrated.prerequisiteTopics.includes('databases'), false);
});

test('card options render their own know-first topics', () => {
  assert.match(appSource, /opt\.prerequisiteTopics/);
  assert.match(appSource, /option-prerequisites/);
  assert.match(appSource, /Know first:/);
});
