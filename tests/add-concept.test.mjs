import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const gameSource = await readFile(new URL('../js/game.js', import.meta.url), 'utf8');
const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const plain = value => JSON.parse(JSON.stringify(value));

const wikiEntry = topic => ({
  topic,
  title: 'Bloom Filters',
  summary: 'A compact probabilistic set that can say an item is definitely absent or probably present.',
  why_it_matters: 'It avoids expensive lookups for keys that do not exist.',
  key_points: ['a', 'b', 'c'],
  common_pitfalls: ['x', 'y'],
  related_topics: []
});

function createApp({ wikiStatus = 200, wikiBody } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const values = new Set();
      elements.set(id, {
        id, textContent: '', innerHTML: '', className: '', style: {}, value: '', disabled: false,
        classList: { add: v => values.add(v), remove: v => values.delete(v), contains: v => values.has(v), toggle() {} }
      });
    }
    return elements.get(id);
  };
  const store = new Map();
  const requests = [];
  const context = {
    window: { location: { hostname: 'example.com', hash: '' } },
    URLSearchParams,
    document: {
      addEventListener() {},
      getElementById: element,
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key)
    },
    fetch: async url => {
      requests.push(String(url));
      if (String(url).includes('/api/wiki')) {
        const topic = new URL(url, 'https://example.com').searchParams.get('topic');
        return { ok: wikiStatus === 200, status: wikiStatus, json: async () => wikiBody ?? wikiEntry(topic) };
      }
      return { ok: false, status: 503, json: async () => ({}) };
    },
    Render: { diagram() {} },
    console: { ...console, error() {} },
    setTimeout() {},
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(`${cardsSource}
${srsSource}
${gameSource}
const WIKI = { caching: { topic: 'caching', title: 'Caching', related_topics: [] } };
${appSource}
globalThis.appForTest = APP;
globalThis.WIKI_FOR_TEST = WIKI;`, context);
  const app = Object.create(context.appForTest);
  app.profile = {
    userId: 'tester', topicScores: {}, cardHistory: {}, streaks: { current: 0, best: 0, lastDate: null },
    totalSessions: 0, totalAnswered: 0, totalCorrect: 0, _topicCardSeen: {}, sandbox: {}
  };
  app.saveProfile = () => {};
  const opened = [];
  app.openConcept = topic => opened.push(topic);
  app.renderConceptCloud = () => {};
  app.fetchCard = async () => null;
  return { app, element, store, requests, opened, context };
}

test('concept names are validated and folded onto kebab-case keys', () => {
  const { context } = createApp();
  assert.deepEqual(plain(context.parseConceptName('  Write-Ahead Log ')), { topic: 'write-ahead-log' });
  assert.match(context.parseConceptName('').error, /Type the name/);
  assert.match(context.parseConceptName('!!!').error, /letters and numbers/);
  assert.match(context.parseConceptName('x'.repeat(61)).error, /under 60/);
});

test('adding a new concept loads its explanation, saves it locally, and opens it in My Concepts', async () => {
  const { app, element, store, opened } = createApp();
  element('concept-add-input').value = 'Bloom filters';
  assert.equal(await app.addConcept(), true);
  const game = app._game();
  assert.deepEqual(plain(game.customConcepts.map(item => [item.topic, item.title])), [['bloom-filters', 'Bloom Filters']]);
  assert.ok(store.has('sdf_wiki_bloom-filters'));
  assert.deepEqual(opened, ['bloom-filters']);
  assert.equal(element('concept-add-input').value, '');
  assert.match(element('concept-add-status').innerHTML, /Added Bloom Filters to My Concepts/);
  const groups = app._orderedConceptGroups(app._conceptEntries());
  assert.equal(groups.at(-1).category, 'My Concepts');
  assert.deepEqual(plain(groups.at(-1).items.map(item => item.entry.topic)), ['bloom-filters']);
});

test('an existing concept opens without any request', async () => {
  const { app, requests, opened } = createApp();
  assert.equal(await app.addConcept('Caching'), true);
  assert.deepEqual(requests, []);
  assert.deepEqual(opened, ['caching']);
  assert.equal(app._game().customConcepts.length, 0);
});

test('a concept that needs Pro leaves nothing on the map', async () => {
  const { app, element, opened } = createApp({ wikiStatus: 403, wikiBody: { code: 'pro_required' } });
  assert.equal(await app.addConcept('bloom filters'), false);
  assert.equal(app._game().customConcepts.length, 0);
  assert.deepEqual(opened, []);
  assert.match(element('concept-add-status').innerHTML, /needs Pro/);
});

test('a generation outage leaves nothing on the map', async () => {
  const { app, element } = createApp({ wikiStatus: 503 });
  assert.equal(await app.addConcept('bloom filters'), false);
  assert.equal(app._game().customConcepts.length, 0);
  assert.match(element('concept-add-status').innerHTML, /Nothing was added/);
});

test('an invalid name shows an error without a request', async () => {
  const { app, element, requests } = createApp();
  assert.equal(await app.addConcept('   '), false);
  assert.deepEqual(requests, []);
  assert.match(element('concept-add-status').innerHTML, /Type the name/);
});

test('added concepts reload from the local copy without a network request', async () => {
  const { app, store, requests, context } = createApp();
  store.set('sdf_wiki_bloom-filters', JSON.stringify(wikiEntry('bloom-filters')));
  const entry = await app._ensureWiki('bloom-filters');
  assert.equal(entry.title, 'Bloom Filters');
  assert.deepEqual(requests, []);
  assert.equal(context.WIKI_FOR_TEST['bloom-filters'].title, 'Bloom Filters');
});

test('a starter card marks the added concept as practicable', async () => {
  const { app } = createApp();
  await app.addConcept('bloom filters');
  app.fetchCard = async () => ({ id: 'bloom-filters-1', topic: 'bloom-filters' });
  await app._requestStarterCard('bloom-filters');
  assert.equal(app._game().customConcepts[0].hasStarterCard, true);
});

test('the world map has the add concept form and its cost notice', () => {
  assert.match(html, /<form id="concept-add"[^>]*onsubmit="event\.preventDefault\(\);APP\.addConcept\(\)"/);
  assert.match(html, /id="concept-add-input"[^>]*maxlength="60"/);
  assert.match(html, /id="concept-add-status"/);
  assert.match(html, /Nothing is generated until you press Add/);
});
