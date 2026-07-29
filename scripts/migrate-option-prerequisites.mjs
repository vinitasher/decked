#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${cardsSource}
globalThis.normalizeForMigration = normalizeCardPrerequisites;`, context);

const cacheUrl = new URL('../server/card-cache.json', import.meta.url);
const cache = JSON.parse(await readFile(cacheUrl, 'utf8'));
let migrated = 0;

for (const [key, card] of Object.entries(cache)) {
  const before = JSON.stringify(card);
  context.normalizeForMigration(card);
  if (JSON.stringify(card) !== before) migrated++;
  cache[key] = card;
}

if (process.argv.includes('--write')) {
  await writeFile(cacheUrl, `${JSON.stringify(cache, null, 2)}\n`);
}

console.log(JSON.stringify({
  cards: Object.keys(cache).length,
  migrated,
  write: process.argv.includes('--write')
}));
