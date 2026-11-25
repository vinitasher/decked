import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const gameSource = await readFile(new URL('../js/game.js', import.meta.url), 'utf8');
const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function createApp(hash = '') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const attributes = {};
      elements.set(id, {
        id, textContent: '', innerHTML: '', attributes,
        setAttribute: (name, value) => { attributes[name] = value; },
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }
      });
    }
    return elements.get(id);
  };
  const store = new Map();
  const context = {
    window: { location: { hostname: 'example.com', hash } },
    URLSearchParams,
    document: { addEventListener() {}, getElementById: element, querySelector() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    fetch() { throw new Error('network should not be called'); },
    Render: { diagram() {} },
    console,
    setTimeout() {},
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(`${cardsSource}
${srsSource}
${gameSource}
const WIKI = Object.fromEntries(Object.entries(TOPIC_CATALOG).map(([topic, details]) => [topic, { topic, title: details.label, related_topics: [] }]));
function conceptCategory() { return 'Foundations'; }
function renderFreeAd() {}
${appSource}
globalThis.appForTest = APP;`, context);
  const app = Object.create(context.appForTest);
  app.profile = {
    userId: 'tester', topicScores: {}, cardHistory: {}, streaks: { current: 0, best: 0, lastDate: null },
    totalSessions: 0, totalAnswered: 0, totalCorrect: 0, _topicCardSeen: {}, sandbox: {}
  };
  app.saveProfile = () => {};
  return { app, element, context, store };
}

test('the old Topic Map screen and its profile button are gone', () => {
  assert.doesNotMatch(html, /id="screen-learning-path"/);
  assert.doesNotMatch(html, /Topic Map/);
  assert.match(html, /id="map-view-area"[^>]*onclick="APP\.setMapView\('area'\)"/);
  assert.match(html, /id="map-view-path"[^>]*onclick="APP\.setMapView\('path'\)"/);
});

test('the learning path groups drill topics by prerequisite depth', () => {
  const { app } = createApp();
  const levels = app._learningPathLevels();
  assert.equal(levels[0].label, 'Foundations');
  assert.ok(levels[0].topics.includes('api-design'));
  const depthOf = topic => levels.find(level => level.topics.includes(topic)).depth;
  assert.ok(depthOf('caching') > depthOf('api-design'));
  assert.ok(depthOf('rate-limiting') > depthOf('caching'));
  const total = levels.reduce((sum, level) => sum + level.topics.length, 0);
  assert.equal(total, Object.keys(JSON.parse(JSON.stringify(vm.runInNewContext(`${cardsSource};TOPIC_CATALOG`)))).length);
});

test('the world map path view shows stars, card mastery, links, and practice', () => {
  const { app, element } = createApp();
  app.profile.topicScores.caching = { raw: 0.8, cardsReviewed: 4 };
  app.setMapView('path');
  const markup = element('concept-cloud').innerHTML;
  assert.match(markup, /Foundations/);
  assert.match(markup, /data-topic="caching"[\s\S]*?Cards 80%/);
  assert.match(markup, /Know first: API Design/);
  assert.match(markup, /Leads to: [^<]*Rate Limiting/);
  assert.match(markup, /APP\.startTopicSession\('caching'\)/);
  assert.match(markup, /APP\.openConcept\('caching'\)/);
  assert.match(markup, /No cards answered yet/);
  assert.equal(element('map-view-path').attributes['aria-pressed'], 'true');
  assert.equal(element('map-view-area').attributes['aria-pressed'], 'false');

  app.setMapView('area');
  assert.match(element('concept-cloud').innerHTML, /concept-group-items/);
  assert.equal(element('map-view-area').attributes['aria-pressed'], 'true');
});

test('the chosen map layout is remembered', () => {
  const { app, store } = createApp();
  app.setMapView('path');
  assert.equal(store.get('decked.mapView'), 'path');
  const fresh = Object.create(Object.getPrototypeOf(app));
  fresh.profile = app.profile;
  assert.equal(fresh._currentMapView(), 'path');
});

test('old #/learning-path links open the world map learning path', () => {
  const { app, context } = createApp('#/learning-path');
  app._handleHashChange();
  assert.equal(context.window.location.hash, '#/concepts');
  assert.equal(app._mapView, 'path');
});

test('a concept page shows where the topic sits on the learning path', () => {
  const { app } = createApp();
  const block = app._wikiEntryHtml({ topic: 'caching', title: 'Caching', summary: '', why_it_matters: '', key_points: [], common_pitfalls: [], related_topics: [] });
  assert.match(block, /On the learning path/);
  assert.match(block, /Know first<\/span><span class="wiki-related">[\s\S]*data-topic="api-design"/);
  assert.match(block, /Leads to<\/span>[\s\S]*data-topic="rate-limiting"/);
  assert.match(block, /APP\.startTopicSession\('caching'\)/);
  assert.match(block, /APP\.showLearningPath\(\)/);
  const outside = app._wikiEntryHtml({ topic: 'bloom-filter', title: 'Bloom filter', summary: '', why_it_matters: '', key_points: [], common_pitfalls: [], related_topics: [] });
  assert.doesNotMatch(outside, /On the learning path/);
});
