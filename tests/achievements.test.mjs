import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

function createContext() {
  const values = new Map();
  const elements = new Map([['achievement-toast', { innerHTML: '', className: '' }]]);
  const context = {
    window: { location: { hostname: 'example.com' } },
    URLSearchParams,
    document: {
      addEventListener() {},
      getElementById(id) { return elements.get(id); },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); }
    },
    fetch() { throw new Error('network should not be called'); },
    Render: { diagram() {} },
    console,
    setTimeout() {},
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(`${cardsSource}
globalThis.TOPIC_CATALOG = TOPIC_CATALOG;
globalThis.SEED_CARDS = SEED_CARDS;
${srsSource}
globalThis.SRS = SRS;
${appSource}
globalThis.normalizeProfileDataForTest = normalizeProfileData;
globalThis.appForTest = APP;`, context);
  return context;
}

function baseProfile() {
  return {
    userId: 'tester',
    topicScores: {},
    cardHistory: {},
    streaks: { current: 0, best: 0, lastDate: null },
    totalSessions: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    _topicCardSeen: {},
    seenScenarioFingerprints: []
  };
}

function appWithGeneratedCards(context, count) {
  const app = Object.create(context.appForTest);
  app.profile = context.normalizeProfileDataForTest(baseProfile());
  for (let index = 0; index < count; index++) {
    app.profile.cardHistory[`generated-${index}`] = {};
  }
  // Achievement checks are arrow functions defined in the browser global scope.
  context.profile = app.profile;
  context._consecutiveCorrect = 0;
  return app;
}

test('deck-explorer unlocks at 25 distinct generated cards, not before', () => {
  const context = createContext();

  for (const count of [24, 25, 26]) {
    const app = appWithGeneratedCards(context, count);
    app._checkAchievements();
    const earned = app.profile.achievements || [];
    const persisted = JSON.parse(context.localStorage.getItem('sdf_profile'));

    assert.equal(earned.includes('deck-explorer'), count >= 25);
    assert.equal(Object.keys(persisted.cardHistory).length, count);
    app._checkAchievements();
    assert.deepEqual(app.profile.achievements, earned);
  }
});

test('deck-explorer counts a reviewed seed card with generated cards', () => {
  const context = createContext();
  const app = appWithGeneratedCards(context, 24);
  app.profile.cardHistory[context.SEED_CARDS[0].id] = {};
  context.profile = app.profile;

  app._checkAchievements();

  assert.equal(app.profile.achievements.includes('deck-explorer'), true);
});

test('deck-explorer presents the fixed distinct-card milestone', () => {
  const context = createContext();
  const app = appWithGeneratedCards(context, 0);
  const achievement = app._achievementDefs.find(def => def.id === 'deck-explorer');

  assert.equal(achievement.label, 'Card Explorer');
  assert.equal(achievement.desc, 'Review 25 distinct cards');
});
