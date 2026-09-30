import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
    toggle(value) {
      if (values.has(value)) { values.delete(value); } else { values.add(value); }
    },
    values
  };
}

function createContext(elementIds = []) {
  const elements = new Map();
  const makeElement = id => ({
    id,
    textContent: '',
    innerHTML: '',
    disabled: false,
    className: '',
    value: '',
    classList: makeClassList([]),
    style: {},
    children: [],
    setAttribute() {},
    appendChild() {},
    querySelectorAll() { return []; },
    scrollIntoView() {}
  });
  for (const id of elementIds) elements.set(id, makeElement(id));
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
      values: new Map(),
      get length() { return this.values.size; },
      key(index) { return [...this.values.keys()][index] ?? null; },
      getItem(key) { return this.values.get(key) ?? null; },
      setItem(key, value) { this.values.set(key, value); },
      removeItem(key) { this.values.delete(key); }
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
globalThis.normalizeCardPrerequisites = normalizeCardPrerequisites;
${srsSource}
globalThis.SRS = SRS;
${appSource}
globalThis.normalizeProfileDataForTest = normalizeProfileData;
globalThis.appForTest = APP;`, context);
  return context;
}

const dashboardElementIds = [
  'stat-total', 'stat-reviewed', 'stat-due', 'stat-streak',
  'resume-btn', 'achievement-list', 'topic-breakdown',
  'goal-fill', 'goal-target', 'achievement-toast', 'intro-hero'
];
const context = createContext(dashboardElementIds);
const seedIds = context.SEED_CARDS.map(card => card.id);
const seedTopics = [...new Set(context.SEED_CARDS.map(card => card.topic))];

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

function freshApp() {
  const app = Object.create(context.appForTest);
  app.profile = context.normalizeProfileDataForTest(baseProfile());
  app.sessionCards = [];
  app.sessionIndex = 0;
  app.currentCard = null;
  app._cardCache = {};
  app._nextCard = null;
  app._isGenerating = false;
  app._consecutiveCorrect = 0;
  app.prefetchNext = async () => {};
  app._checkAchievements = () => {};
  return app;
}

function snapshotCard(id, scenario, topic) {
  return {
    id,
    topic,
    difficulty: 3,
    prerequisiteTopics: ['api-design'],
    scenario,
    options: [
      { id: 'A', label: 'Option A', prerequisiteTopics: ['cache-invalidation'] },
      { id: 'B', label: 'Option B', prerequisiteTopics: ['cache-coherence'] }
    ],
    correct: 'B',
    explanation: `Explanation for ${scenario}`
  };
}

function reviewRecord(nextReviewAt, cardSnapshot) {
  const record = {
    stability: 1.5,
    difficulty: 0.5,
    interval: 3,
    nextReviewAt,
    timesReviewed: 2,
    timesCorrect: 1,
    confidenceSum: 3,
    lastConfidence: 2
  };
  if (cardSnapshot) record.card = cardSnapshot;
  return record;
}

test('Cards total equals the union of seed cards and distinct reviewed cards', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-a'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-a', 'A generated scenario', 'storage'));
  app.profile.cardHistory['gen-b'] = reviewRecord(Date.now() + 86400000,
    snapshotCard('gen-b', 'Another generated scenario', 'security'));

  const studied = app._studiedCardIds();
  assert.equal(studied.size, seedIds.length + 2);
  for (const id of seedIds) assert.equal(studied.has(id), true);
  assert.equal(studied.has('gen-a'), true);
  assert.equal(studied.has('gen-b'), true);

  app.renderDeckStats();
  assert.equal(Number(context.document.getElementById('stat-total').textContent), studied.size);
});

test('Due Now counts only past-due reviewed cards, not unreviewed seed cards', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-past'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-past', 'Past due generated scenario', 'storage'));
  app.profile.cardHistory['gen-future'] = reviewRecord(Date.now() + 86400000,
    snapshotCard('gen-future', 'Future due generated scenario', 'security'));

  assert.equal(app._dueReviewCount(), 1);
  app.renderDeckStats();
  assert.equal(Number(context.document.getElementById('stat-due').textContent), 1);
});

test('Reviewed counts only distinct reviewed cards', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-a'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-a', 'A generated scenario', 'storage'));
  app.profile.cardHistory['gen-b'] = reviewRecord(Date.now() + 86400000,
    snapshotCard('gen-b', 'Another generated scenario', 'storage'));

  app.renderDeckStats();
  assert.equal(Number(context.document.getElementById('stat-reviewed').textContent), 2);
});

test('topic breakdown includes topics that exist only in cardHistory', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-storage'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-storage', 'A storage scenario', 'storage'));
  app.profile._topicCardSeen = { storage: ['gen-storage'] };

  const topics = [...app._studiedTopics()];
  assert.equal(topics.includes('storage'), true);
  assert.equal(seedTopics.includes('storage'), false);
  for (const seedTopic of seedTopics) assert.equal(topics.includes(seedTopic), true);

  app.renderDeckStats();
  const breakdown = context.document.getElementById('topic-breakdown').innerHTML;
  assert.equal(breakdown.includes('Storage'), true);
});

test('unreviewed seed cards never count toward Due Now', () => {
  const app = freshApp();
  assert.equal(app._dueReviewCount(), 0);
  app.renderDeckStats();
  assert.equal(Number(context.document.getElementById('stat-due').textContent), 0);
});

test('the onboarding intro is shown to first-time users with no study history', () => {
  const app = freshApp();
  app.renderDeckStats();
  const introHero = context.document.getElementById('intro-hero');
  assert.equal(introHero.classList.contains('hidden'), false);
});

test('the onboarding intro is hidden for returning users with study history', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-a'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-a', 'A generated scenario', 'storage'));
  app.renderDeckStats();
  const introHero = context.document.getElementById('intro-hero');
  assert.equal(introHero.classList.contains('hidden'), true);
});

test('a past-due reviewed seed card does count toward Due Now', () => {
  const app = freshApp();
  const seedCard = context.SEED_CARDS[0];
  app.profile.cardHistory[seedCard.id] = reviewRecord(Date.now() - 3600000,
    snapshotCard(seedCard.id, seedCard.scenario, seedCard.topic));

  assert.equal(app._dueReviewCount(), 1);
  app.renderDeckStats();
  assert.equal(Number(context.document.getElementById('stat-due').textContent), 1);
});

test('renderDeckStats tolerates a harness with no dashboard elements', () => {
  const bare = createContext(['achievement-toast']);
  const app = Object.create(bare.appForTest);
  app.profile = bare.normalizeProfileDataForTest(baseProfile());
  app.profile.cardHistory['gen-a'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-a', 'A generated scenario', 'storage'));
  app._consecutiveCorrect = 0;
  app.prefetchNext = async () => {};
  app._checkAchievements = () => {};

  assert.doesNotThrow(() => app.renderDeckStats());
});
