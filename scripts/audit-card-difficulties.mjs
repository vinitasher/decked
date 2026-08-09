#!/usr/bin/env node

/* Corpus difficulty audit — every card in every repository-held corpus must
   have difficulty === number of requirements in its scenario (clamped 1-5).
   Run by check.sh; fails on any mismatch. */

import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { countScenarioRequirements, difficultyFromScenario } from '../functions/shared/requirement-count.js';

function* flatten(key, value) {
  if (value && Array.isArray(value.cards)) {
    for (const card of value.cards) {
      if (card && typeof card === 'object' && typeof card.scenario === 'string') yield card;
    }
  } else if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.scenario === 'string') {
    yield value;
  }
}

async function corpusCards() {
  const cards = [];

  const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cardsSource, ctx);
  for (const card of vm.runInContext('SEED_CARDS', ctx)) {
    cards.push({ source: 'js/cards.js SEED_CARDS', card });
  }

  for (const file of ['../server/card-cache.json', '../server/production-card-cache.json']) {
    const snapshot = JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
    for (const [key, value] of Object.entries(snapshot)) {
      for (const card of flatten(key, value)) {
        cards.push({ source: `${file.replace('../', '')} ${key}`, card });
      }
    }
  }
  return cards;
}

const mismatches = [];
const cards = await corpusCards();
for (const { source, card } of cards) {
  const { count } = countScenarioRequirements(card.scenario);
  const derived = difficultyFromScenario(card.scenario);
  if (card.difficulty !== derived) {
    mismatches.push(
      `${source}: ${card.id} has difficulty ${card.difficulty} but its scenario contains ${count} requirements (derived ${derived})`
    );
  }
}

if (mismatches.length > 0) {
  console.error(`Difficulty audit failed: ${mismatches.length} card(s) misclassified:`);
  for (const line of mismatches) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`Difficulty audit passed: ${cards.length} cards match requirement-derived difficulty.`);
