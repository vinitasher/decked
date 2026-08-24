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
  const confirmValue = { value: false };
  for (const id of [
    'start-session-btn', 'card-counter', 'card-topic', 'card-difficulty', 'scenario',
    'card-prerequisites', 'diagram-container', 'options', 'bookmark-btn',
    'feedback', 'post-answer-actions', 'confidence-buttons', 'next-btn',
    'regenerate-btn', 'quality-rating', 'screen-session'
  ]) elements.set(id, makeElement(id));
  const context = {
    window: { location: { hostname: 'example.com' }, confirm() { return confirmValue.value; } },
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
    confirmValue,
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

function seedRandom(value) {
  vm.runInContext(`Math.random = () => ${value};`, context);
}

/* Snapshot-shaped content mirroring the persisted `review.card` field */
function snapshotCard(id, scenario, topic, difficulty) {
  const nodes = ['Client', 'API', 'Database'];
  const flows = [
    { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
    { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
  ];
  const clientOnlyFlow = [flows[0]];
  const databaseOnlyFlow = [flows[1]];
  return {
    id,
    topic,
    difficulty,
    prerequisiteTopics: ['api-design'],
    scenario,
    nodes,
    flows,
    options: [
      { id: 'A', label: 'Option A', prerequisiteTopics: ['cache-invalidation'], flows: clientOnlyFlow.map(flow => ({ ...flow })) },
      { id: 'B', label: 'Option B', prerequisiteTopics: ['cache-coherence'], flows: flows.map(flow => ({ ...flow })) },
      { id: 'C', label: 'Option C', prerequisiteTopics: ['read-replication'], flows: databaseOnlyFlow.map(flow => ({ ...flow })) },
      { id: 'D', label: 'Option D', prerequisiteTopics: ['cdn-caching'], flows: clientOnlyFlow.map(flow => ({ ...flow })) }
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

function newCandidate(id, scenario, topic = 'caching') {
  return { id, scenario, topic, difficulty: 3, prerequisiteTopics: [] };
}

test('past-due cards appear first with content matching the snapshot', async () => {
  seedRandom(0);
  const app = freshApp();
  const due = snapshotCard('gen-due-1', 'A due review scenario', 'caching', 3);
  app.profile.cardHistory['gen-due-1'] = reviewRecord(Date.now() - 3600000, due);
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards, requested } = await app._generateSessionCards(8);

  assert.equal(requested, 8);
  assert.equal(cards.length, 5); // 1 due review + up to 4 fresh (mix ratio)
  assert.equal(cards[0].id, 'gen-due-1');
  assert.equal(cards[0].scenario, due.scenario);
  assert.equal(cards[0].correct, 'B');
  assert.equal(cards[0].explanation, `Explanation for ${due.scenario}`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(cards[0].options)),
    JSON.parse(JSON.stringify(due.options))
  );
  assert.equal(cards[0].review, true);
});

test('a past-due card whose fingerprint is already seen still appears', async () => {
  seedRandom(0);
  const app = freshApp();
  const due = snapshotCard('gen-due-2', 'Already displayed due scenario', 'queues', 2);
  app.profile.cardHistory['gen-due-2'] = reviewRecord(Date.now() - 3600000, due);
  app.profile.seenScenarioFingerprints = [app._scenarioFingerprint(due.scenario)];
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards[0].id, 'gen-due-2');
});

test('future-due cards are not included in a session', async () => {
  seedRandom(0);
  const app = freshApp();
  const future = snapshotCard('gen-future', 'Not yet due scenario', 'dns', 2);
  app.profile.cardHistory['gen-future'] = reviewRecord(Date.now() + 86400000, future);
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.some(card => card.id === 'gen-future'), false);
  assert.equal(cards.length, 4); // no due reviews → 4 fresh (mix ratio cap)
  assert.equal(calls, 4);
});

test('standard sessions still deliver exactly 8 fingerprint-distinct cards when blended', async () => {
  seedRandom(0);
  const app = freshApp();
  const dueA = snapshotCard('gen-due-a', 'Due scenario A', 'caching', 3);
  const dueB = snapshotCard('gen-due-b', 'Due scenario B', 'queues', 2);
  app.profile.cardHistory['gen-due-a'] = reviewRecord(Date.now() - 7200000, dueA);
  app.profile.cardHistory['gen-due-b'] = reviewRecord(Date.now() - 3600000, dueB);
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards, requested } = await app._generateSessionCards(8);

  assert.equal(requested, 8);
  assert.equal(cards.length, 6); // 2 due reviews + 4 fresh (mix ratio cap)
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 6);
  assert.equal(calls, 4);
});

test('quick review still delivers a full-size session when blended', async () => {
  seedRandom(0);
  const app = freshApp();
  const dueA = snapshotCard('gen-due-a', 'Due scenario A', 'caching', 3);
  const dueB = snapshotCard('gen-due-b', 'Due scenario B', 'queues', 2);
  app.profile.cardHistory['gen-due-a'] = reviewRecord(Date.now() - 7200000, dueA);
  app.profile.cardHistory['gen-due-b'] = reviewRecord(Date.now() - 3600000, dueB);
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards, requested } = await app._generateSessionCards(15);

  assert.equal(requested, 15);
  assert.equal(cards.length, 10); // 2 due reviews + 8 fresh (mix ratio cap)
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 10);
  assert.equal(calls, 8);
});

test('a past-due entry with no resolvable content is skipped without error', async () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.cardHistory['ghost-1'] = reviewRecord(Date.now() - 3600000);
  app.profile.cardHistory['ghost-2'] = reviewRecord(Date.now() - 3600000);
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.some(card => card.id === 'ghost-1'), false);
  assert.equal(cards.some(card => card.id === 'ghost-2'), false);
  assert.equal(cards.length, 4); // no due reviews → 4 fresh (mix ratio cap)
  assert.equal(calls, 4);
});

test('when due cards exceed the requested count, the oldest are served first', async () => {
  seedRandom(0);
  const app = freshApp();
  const newest = snapshotCard('gen-newest', 'Newest due scenario', 'caching', 3);
  const oldest = snapshotCard('gen-oldest', 'Oldest due scenario', 'caching', 2);
  const middle = snapshotCard('gen-middle', 'Middle due scenario', 'caching', 4);
  app.profile.cardHistory['gen-newest'] = reviewRecord(Date.now() - 1000, newest);
  app.profile.cardHistory['gen-oldest'] = reviewRecord(Date.now() - 999000, oldest);
  app.profile.cardHistory['gen-middle'] = reviewRecord(Date.now() - 500000, middle);
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards } = await app._generateSessionCards(2);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, 'gen-oldest');
  assert.equal(cards[1].id, 'gen-middle');
  assert.equal(calls, 0);
});

test('due reviews are ordered by predicted-recall risk, not recency alone', async () => {
  seedRandom(0);
  const app = freshApp();
  // Same review time, but fragile stability → much lower predicted recall.
  const fragile = snapshotCard('gen-fragile', 'Fragile due scenario', 'caching', 3);
  const sturdy = snapshotCard('gen-sturdy', 'Sturdy due scenario', 'queues', 2);
  const dueAt = Date.now() - 3600000;
  const fragileRecord = reviewRecord(dueAt, fragile);
  fragileRecord.stability = 0.2;
  const sturdyRecord = reviewRecord(dueAt, sturdy);
  sturdyRecord.stability = 8;
  app.profile.cardHistory['gen-fragile'] = fragileRecord;
  app.profile.cardHistory['gen-sturdy'] = sturdyRecord;

  const due = app._dueReviewCards(2);

  assert.equal(due.length, 2);
  assert.equal(due[0].id, 'gen-fragile');
  assert.equal(due[1].id, 'gen-sturdy');
  assert.ok(app._predictedRecall(fragileRecord) < app._predictedRecall(sturdyRecord));
});

test('a due card already in the session is not fetched again as a new candidate', async () => {
  seedRandom(0);
  const app = freshApp();
  const due = snapshotCard('gen-due-3', 'Already scheduled due scenario', 'caching', 3);
  app.profile.cardHistory['gen-due-3'] = reviewRecord(Date.now() - 3600000, due);
  let calls = 0;
  app.fetchCard = async (topic, difficulty, avoidList) => {
    calls++;
    if (calls === 1) return newCandidate('dup', due.scenario, topic);
    return newCandidate(`new-${calls}`, `Fresh scenario ${calls}`, topic);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.length, 5); // 1 due review + 4 fresh (mix ratio cap)
  assert.equal(cards[0].id, 'gen-due-3');
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 5);
});

test('nextCard does not replace a due-review slot with the prefetched card', () => {
  seedRandom(0);
  const app = freshApp();
  const due = snapshotCard('gen-due-4', 'Due review slot scenario', 'caching', 3);
  const fresh = newCandidate('fresh-slot', 'Fresh slot scenario');
  app.sessionCards = [
    newCandidate('first', 'First card scenario'),
    { ...due, review: true },
    fresh
  ];
  app.sessionIndex = 0;
  app.currentCard = app.sessionCards[0];
  app._nextCard = newCandidate('prefetched', 'Prefetched scenario');
  app.showCard = () => {};

  app.nextCard();

  assert.equal(app.sessionCards[1].id, 'gen-due-4');
  assert.equal(app.sessionCards[1].review, true);
});

test('nextCard replaces a non-review slot with the prefetched card as before', () => {
  seedRandom(0);
  const app = freshApp();
  app.sessionCards = [
    newCandidate('first', 'First card scenario'),
    newCandidate('second', 'Second card scenario')
  ];
  app.sessionIndex = 0;
  app.currentCard = app.sessionCards[0];
  app._nextCard = newCandidate('prefetched', 'Prefetched scenario');
  app.showCard = () => {};

  app.nextCard();

  assert.equal(app.sessionCards[1].id, 'prefetched');
});
