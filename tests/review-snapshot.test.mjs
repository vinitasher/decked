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
    values
  };
}

function createContext() {
  const elements = new Map();
  const makeElement = id => ({
    id,
    textContent: '',
    innerHTML: '',
    disabled: false,
    className: '',
    classList: makeClassList(['feedback', 'screen-session'].includes(id) ? [] : ['hidden']),
    style: {},
    children: [],
    setAttribute() {},
    appendChild() {},
    querySelectorAll() { return []; },
    scrollIntoView() {}
  });
  for (const id of [
    'confidence-buttons', 'next-btn', 'consecutive-correct', 'achievement-toast',
    'feedback', 'post-answer-actions', 'regenerate-btn', 'quality-rating'
  ]) elements.set(id, makeElement(id));
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

const context = createContext();

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
  app.renderDeckStats = () => {};
  app.prefetchNext = async () => {};
  app._checkAchievements = () => {};
  return app;
}

function generatedCard() {
  return {
    id: 'gen-1785292361000',
    topic: 'caching',
    difficulty: 3,
    prerequisiteTopics: ['api-design', 'dns'],
    scenario: 'A service caches hot reads in memory but misses spike under load.',
    nodes: ['Web Client', 'API Server', 'Cache Layer', 'Database'],
    flows: [
      { from: 'Web Client', to: 'API Server', verb: 'requests', kind: 'sync' },
      { from: 'API Server', to: 'Cache Layer', verb: 'checks', kind: 'sync' },
      { from: 'Cache Layer', to: 'Database', verb: 'loads', kind: 'sync' }
    ],
    options: [
      { id: 'A', label: 'Put a CDN in front', prerequisiteTopics: ['dns'] },
      { id: 'B', label: 'Cache aside with TTL', prerequisiteTopics: ['cache-invalidation'], flows: [{ from: 'API Server', to: 'Cache Layer', verb: 'checks', kind: 'sync' }] },
      { id: 'C', label: 'Read replicas', prerequisiteTopics: ['replication-lag'] },
      { id: 'D', label: 'Write-through cache', prerequisiteTopics: ['cache-coherence'] }
    ],
    correct: 'B',
    explanation: 'Cache-aside with TTL bounds staleness while absorbing the hot-read spike.'
  };
}

test('rateConfidence persists a minimal content snapshot for a generated card', () => {
  const app = freshApp();
  const card = generatedCard();
  app.currentCard = card;
  app._cardCorrect = true;
  app._cardStartTime = 1000;

  app.rateConfidence(3);

  const record = app.profile.cardHistory[card.id];
  assert.ok(record, 'review record is stored');
  assert.deepEqual(JSON.parse(JSON.stringify(record.card)), {
    scenario: card.scenario,
    topic: card.topic,
    difficulty: card.difficulty,
    prerequisiteTopics: ['api-design', 'dns'],
    flows: card.flows,
    options: card.options.map(option => ({
      id: option.id,
      label: option.label,
      prerequisiteTopics: option.prerequisiteTopics,
      flows: option.flows || []
    })),
    correct: card.correct,
    explanation: card.explanation,
    nodes: card.nodes
  });
});

test('snapshot is persisted alongside the SRS review state, not instead of it', () => {
  const app = freshApp();
  const card = generatedCard();
  app.currentCard = card;
  app._cardCorrect = true;
  app._cardStartTime = 1000;

  app.rateConfidence(2);

  const record = app.profile.cardHistory[card.id];
  assert.equal(record.stability > 0, true);
  assert.ok(record.nextReviewAt > Date.now());
  assert.equal(record.timesReviewed, 1);
  assert.equal(record.card.scenario, card.scenario);
});

test('seed cards receive a snapshot uniformly with no special-casing', () => {
  const app = freshApp();
  const seedCard = context.SEED_CARDS[0];
  assert.ok(seedCard, 'harness exposes seed cards');
  app.currentCard = seedCard;
  app._cardCorrect = true;
  app._cardStartTime = 1000;

  app.rateConfidence(3);

  const record = app.profile.cardHistory[seedCard.id];
  assert.ok(record.card, 'seed card review persists a snapshot');
  assert.equal(record.card.scenario, seedCard.scenario);
  assert.equal(record.card.topic, seedCard.topic);
  assert.equal(record.card.correct, seedCard.correct);
  assert.equal(Array.isArray(record.card.options), true);
  assert.equal(record.card.options.length, seedCard.options.length);
});

test('snapshot survives a profile serialize-and-normalize round trip', () => {
  const app = freshApp();
  const card = generatedCard();
  app.currentCard = card;
  app._cardCorrect = true;
  app._cardStartTime = 1000;

  app.rateConfidence(3);
  const reloaded = context.normalizeProfileDataForTest(
    JSON.parse(JSON.stringify(app.profile))
  );

  assert.equal(
    JSON.stringify(reloaded.cardHistory[card.id].card),
    JSON.stringify(app.profile.cardHistory[card.id].card)
  );
});

test('legacy profiles whose cardHistory lacks a snapshot load without error', () => {
  const profile = context.normalizeProfileDataForTest({
    cardHistory: {
      'legacy-1': {
        stability: 0.5, difficulty: 0.4, interval: 1, nextReviewAt: 12345,
        timesReviewed: 2, timesCorrect: 1
      }
    },
    topicScores: {},
    streaks: {}
  });

  assert.equal(profile.cardHistory['legacy-1'].stability, 0.5);
  assert.equal(profile.cardHistory['legacy-1'].card, undefined);
});

test('snapshot arrays are normalized even when a record carries malformed fields', () => {
  const profile = context.normalizeProfileDataForTest({
    cardHistory: {
      'gen-1': {
        stability: 0.5,
        card: { scenario: 'x', options: 'nope', prerequisiteTopics: 'x', nodes: 'y' }
      }
    },
    topicScores: {},
    streaks: {}
  });

  assert.deepEqual(JSON.parse(JSON.stringify(profile.cardHistory['gen-1'].card.options)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(profile.cardHistory['gen-1'].card.prerequisiteTopics)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(profile.cardHistory['gen-1'].card.nodes)), []);
});

test('nodes is optional in the snapshot when the card has none', () => {
  const app = freshApp();
  const card = generatedCard();
  delete card.nodes;
  app.currentCard = card;
  app._cardCorrect = false;
  app._cardStartTime = 1000;

  app.rateConfidence(1);

  assert.equal('nodes' in app.profile.cardHistory[card.id].card, false);
});

test('response time ends at the answer rather than the confidence rating', () => {
  const app = freshApp();
  const card = generatedCard();
  app.currentCard = card;
  app.sessionCards = [card];
  app._selectedId = null;
  app._cardStartTime = 0;
  app.closeWikiModal = () => {};
  let now = 2500;
  context.Date = class extends Date { static now() { return now; } };
  try {
    app.answer(card.correct);
    now = 15000;
    // Repeated answer events must not reset the choice or response time.
    app.answer('A');
    app.rateConfidence(3);
    assert.equal(app.profile.cardHistory[card.id].lastResponseTime, 2500);
    assert.equal(app.profile.cardHistory[card.id].timesCorrect, 1);
  } finally {
    delete context.Date;
  }
});
