import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const context = {
  window: { location: { hostname: 'example.com' } },
  document: { addEventListener() {} },
  localStorage: {
    values: new Map(),
    get length() { return this.values.size; },
    key(index) { return [...this.values.keys()][index] ?? null; },
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); },
    removeItem(key) { this.values.delete(key); }
  },
  normalizeCardPrerequisites(card) {
    if (!Array.isArray(card.prerequisiteTopics)) card.prerequisiteTopics = [];
    return card;
  },
  SEED_CARDS: [],
  fetch() { throw new Error('network should not be called'); }
};
vm.createContext(context);
vm.runInContext(`${source}
globalThis.normalizeProfileDataForTest = normalizeProfileData;
globalThis.appForTest = APP;`, context);

test('profile migration replaces non-serializable set remnants with arrays', () => {
  const profile = context.normalizeProfileDataForTest({
    topicScores: { caching: { raw: 0.8, cardsReviewed: 3, daysSpanned: {} } },
    cardHistory: {},
    streaks: {},
    _topicCardSeen: { caching: {} }
  });

  assert.deepEqual([...profile.topicScores.caching.daysSpanned], []);
  assert.deepEqual([...profile._topicCardSeen.caching], []);
  assert.equal(profile.streaks.current, 0);
  assert.equal(profile.streaks.best, 0);
  assert.equal(profile.totalSessions, 0);
  assert.equal(profile.totalAnswered, 0);
  assert.equal(profile.totalCorrect, 0);
});

test('difficulty button invokes feedback with its numeric value', () => {
  const app = context.appForTest;
  let handler;
  let submitted;
  const originalQuerySelectorAll = context.document.querySelectorAll;
  const originalRateConfidence = app.rateConfidence;
  context.document.querySelectorAll = selector => {
    assert.equal(selector, '[data-confidence]');
    return [{
      dataset: { confidence: '3' },
      addEventListener(type, listener) {
        assert.equal(type, 'click');
        handler = listener;
      }
    }];
  };
  app.rateConfidence = confidence => { submitted = confidence; };

  try {
    app._setupConfidenceButtons();
    handler();
    assert.equal(submitted, 3);
  } finally {
    context.document.querySelectorAll = originalQuerySelectorAll;
    app.rateConfidence = originalRateConfidence;
  }
});

test('exiting a session stops timers and preserves resume state', () => {
  const app = context.appForTest;
  const originalClearTimeout = context.clearTimeout;
  const originalStopTimer = app._stopTimer;
  const originalRenderDeckStats = app.renderDeckStats;
  const originalShowScreen = app.showScreen;
  let clearedTimer;
  let timerStopped = false;
  let rendered = false;
  let screen;

  context.localStorage.setItem('sdf_resume', '{"index":0}');
  context.clearTimeout = timer => { clearedTimer = timer; };
  app._advanceTimer = 42;
  app._quickReview = true;
  app._stopTimer = () => { timerStopped = true; };
  app.renderDeckStats = () => { rendered = true; };
  app.showScreen = value => { screen = value; };

  try {
    app.exitSession();
    assert.equal(clearedTimer, 42);
    assert.equal(app._advanceTimer, null);
    assert.equal(app._quickReview, false);
    assert.equal(timerStopped, true);
    assert.equal(rendered, true);
    assert.equal(screen, 'welcome');
    assert.equal(context.localStorage.getItem('sdf_resume'), '{"index":0}');
  } finally {
    context.clearTimeout = originalClearTimeout;
    app._stopTimer = originalStopTimer;
    app.renderDeckStats = originalRenderDeckStats;
    app.showScreen = originalShowScreen;
  }
});

test('topic review remains valid after profile serialization and reload', () => {
  const app = context.appForTest;
  app.profile = context.normalizeProfileDataForTest({
    topicScores: {},
    cardHistory: {},
    streaks: {},
    _topicCardSeen: {}
  });

  app._recordTopicReview('caching', 'card-1', true);
  app.profile = context.normalizeProfileDataForTest(JSON.parse(JSON.stringify(app.profile)));
  app._recordTopicReview('caching', 'card-2', true);

  assert.equal(app.profile.topicScores.caching.cardsReviewed, 2);
  assert.deepEqual([...app.profile._topicCardSeen.caching], ['card-1', 'card-2']);
  assert.equal(app.profile.topicScores.caching.daysSpanned.length, 1);
});

test('fetchCard reuses its own local cache entry without a network request', async () => {
  const app = context.appForTest;
  const card = {
    id: 'cached-card',
    topic: 'caching',
    difficulty: 3,
    prerequisiteTopics: ['api-design'],
    scenario: 'A cached scenario'
  };
  context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify(card));
  app.sessionCards = [];

  const result = await app.fetchCard('caching', 3);

  assert.equal(result.id, 'cached-card');
});
