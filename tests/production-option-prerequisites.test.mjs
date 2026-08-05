import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

import {
  PRODUCTION_OPTION_PREREQUISITES,
  getOptionPrerequisites
} from '../functions/shared/production-option-prerequisites.js';

const snapshot = JSON.parse(
  await readFile(new URL('../server/production-card-cache.json', import.meta.url), 'utf8')
);

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${cardsSource}
globalThis.catalog = TOPIC_CATALOG;`, context);
const broadCategories = new Set(Object.keys(context.catalog));

const generateSource = await readFile(
  new URL('../functions/api/generate.js', import.meta.url),
  'utf8'
);
const { normalizeCard } = await import('../functions/api/generate.js');

function cardsIn(value) {
  if (Array.isArray(value?.cards)) return value.cards;
  if (value && typeof value === 'object' && !Array.isArray(value)) return [value];
  return [];
}

function snapshotCards() {
  return Object.values(snapshot).flatMap(cardsIn);
}

test('curated map covers every production snapshot card id', () => {
  const snapshotIds = snapshotCards().map(card => card.id).sort();
  assert.equal(snapshotIds.length, 11);
  assert.deepEqual(
    snapshotIds,
    Object.keys(PRODUCTION_OPTION_PREREQUISITES).sort()
  );
});

test('every curated card maps all four option letters', () => {
  for (const [cardId, options] of Object.entries(PRODUCTION_OPTION_PREREQUISITES)) {
    assert.deepEqual(Object.keys(options).sort(), ['A', 'B', 'C', 'D'], cardId);
  }
});

test('every option holds 2-4 unique kebab-case concepts', () => {
  for (const [cardId, options] of Object.entries(PRODUCTION_OPTION_PREREQUISITES)) {
    for (const [optionId, concepts] of Object.entries(options)) {
      assert.ok(
        Array.isArray(concepts) && concepts.length >= 2 && concepts.length <= 4,
        `${cardId}/${optionId} must hold 2-4 concepts`
      );
      assert.equal(
        new Set(concepts).size,
        concepts.length,
        `${cardId}/${optionId} contains duplicate concepts`
      );
      for (const concept of concepts) {
        assert.match(concept, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${cardId}/${optionId}: ${concept}`);
      }
    }
  }
});

test('no curated concept is a broad category or the card own topic', () => {
  for (const [cardId, options] of Object.entries(PRODUCTION_OPTION_PREREQUISITES)) {
    const card = snapshotCards().find(candidate => candidate.id === cardId);
    assert.ok(card, `${cardId} is not in the committed snapshot`);
    for (const [optionId, concepts] of Object.entries(options)) {
      for (const concept of concepts) {
        assert.equal(
          broadCategories.has(concept),
          false,
          `${cardId}/${optionId} uses broad category ${concept}`
        );
        assert.notEqual(concept, card.topic, `${cardId}/${optionId} uses its own topic`);
      }
    }
  }
});

test('applying the map to a snapshot card aggregates every option concept', () => {
  for (const card of snapshotCards()) {
    const curated = JSON.parse(JSON.stringify(card));
    for (const option of curated.options) {
      option.prerequisiteTopics = getOptionPrerequisites(card.id, option.id);
    }
    const normalized = normalizeCard(curated, card.topic, card.difficulty);
    const union = new Set(curated.options.flatMap(option => option.prerequisiteTopics));
    for (const concept of union) {
      assert.ok(
        normalized.prerequisiteTopics.includes(concept),
        `${card.id} aggregate omits ${concept}`
      );
    }
    assert.deepEqual(
      normalized.options.map(option => option.prerequisiteTopics),
      curated.options.map(option => option.prerequisiteTopics),
      `${card.id} option concepts were altered by normalization`
    );
  }
});

test('curated map for observability:3 matches the stored card concepts exactly', () => {
  const card = snapshotCards().find(candidate => candidate.id === 'observability-gen-1785703525081');
  assert.ok(card);
  const expected = {};
  for (const option of card.options) {
    expected[option.id] = option.prerequisiteTopics;
  }
  assert.deepEqual(PRODUCTION_OPTION_PREREQUISITES[card.id], expected);
});

test('getOptionPrerequisites returns defensive copies and undefined for unknowns', () => {
  const cardId = 'api-design-gen-1785309798717';
  const first = getOptionPrerequisites(cardId, 'A');
  const second = getOptionPrerequisites(cardId, 'A');
  assert.deepEqual(first, PRODUCTION_OPTION_PREREQUISITES[cardId].A);
  first.push('mutated');
  assert.notDeepEqual(first, second);
  assert.equal(getOptionPrerequisites('unknown-card', 'A'), undefined);
  assert.equal(getOptionPrerequisites(cardId, 'E'), undefined);
  assert.equal(getOptionPrerequisites(undefined, undefined), undefined);
});
