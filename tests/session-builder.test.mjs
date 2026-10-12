import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const freeCardsSource = await readFile(new URL('../js/free-cards.js', import.meta.url), 'utf8');
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
    confirmValue
  };
  vm.createContext(context);
  vm.runInContext(`${cardsSource}
${freeCardsSource}
globalThis.TOPIC_CATALOG = TOPIC_CATALOG;
globalThis.SEED_CARDS = SEED_CARDS;
globalThis.normalizeCardPrerequisites = normalizeCardPrerequisites;
${appSource}
globalThis.normalizeProfileDataForTest = normalizeProfileData;
globalThis.appForTest = APP; currentPlan = 'pro';`, context);
  return context;
}

const context = createContext();
const catalogTopics = Object.keys(JSON.parse(JSON.stringify(context.TOPIC_CATALOG)));

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
  return app;
}

function seedRandom(value) {
  vm.runInContext(`Math.random = () => ${value};`, context);
}

function generatedCard(id, scenario, topic, difficulty) {
  const nodes = ['Client', 'API', 'Database'];
  const flows = [
    { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
    { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
  ];
  return {
    id,
    scenario,
    topic,
    difficulty,
    prerequisiteTopics: [],
    nodes,
    flows,
    options: [{ id: 'A', label: 'Option A', prerequisiteTopics: [], flows }],
    correct: 'A',
    explanation: 'Explanation'
  };
}

test('ranked topics include every catalog topic at a mastery-derived difficulty', () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.topicScores = {
    caching: { raw: 0.9, cardsReviewed: 1, daysSpanned: [] },
    dns: { raw: 0.1, cardsReviewed: 1, daysSpanned: [] },
    queues: { raw: 0.5, cardsReviewed: 1, daysSpanned: [] }
  };

  const ranked = app._rankedSessionTopics();

  assert.equal(ranked.map(item => item.topic).sort().join(','), [...catalogTopics].sort().join(','));
  for (const item of ranked) {
    assert.ok(item.difficulty >= 1 && item.difficulty <= 5);
  }
  assert.equal(ranked.find(item => item.topic === 'caching').difficulty, 5);
  assert.equal(ranked.find(item => item.topic === 'dns').difficulty, 1);
  assert.equal(ranked.find(item => item.topic === 'queues').difficulty, 3);
});

test('session plans cover all catalog topics and extend with unique topic+difficulty pairs', () => {
  seedRandom(0);
  const app = freshApp();
  const topicCount = catalogTopics.length;

  const full = app._buildSessionPlan(topicCount);
  assert.equal(full.length, topicCount);
  assert.equal(full.map(item => item.topic).sort().join(','), [...catalogTopics].sort().join(','));

  const extended = app._buildSessionPlan(topicCount + 2);
  assert.equal(extended.length, topicCount + 2);
  const keys = extended.map(item => `${item.topic}:${item.difficulty}`);
  assert.equal(new Set(keys).size, topicCount + 2);
  for (const item of extended) {
    assert.ok(catalogTopics.includes(item.topic));
    assert.ok(item.difficulty >= 1 && item.difficulty <= 5);
  }
  assert.equal(new Set(extended.map(item => item.topic)).size, topicCount);

  const forty = app._buildSessionPlan(40);
  assert.equal(forty.length, 40);
  assert.equal(new Set(forty.map(item => `${item.topic}:${item.difficulty}`)).size, 40);
});

test('standard sessions fill all requested slots when no reviews are due', async () => {
  seedRandom(0);
  const app = freshApp();
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Scenario number ${calls}`, topic, difficulty);
  };

  const { cards, requested, mixShortfall } = await app._generateSessionCards(8);

  assert.equal(requested, 8);
  assert.equal(cards.length, 8);
  assert.equal(mixShortfall, false);
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 8);
  assert.equal(calls, 8);
});

test('quick review planning fills its requested slots', async () => {
  seedRandom(0);
  const app = freshApp();
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Quick scenario ${calls}`, topic, difficulty);
  };

  const { cards, requested, mixShortfall } = await app._generateSessionCards(15);

  assert.equal(requested, 15);
  assert.equal(cards.length, 15);
  assert.equal(mixShortfall, false);
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 15);
  assert.equal(calls, 15);
});

test('due reviews limit the fresh budget of a session', async () => {
  seedRandom(0);
  const app = freshApp();
  for (let i = 0; i < 5; i++) {
    const due = generatedCard(`due-${i}`, `Due scenario ${i}`, 'caching', 2);
    app.profile.cardHistory[`due-${i}`] = {
      stability: 1.5, difficulty: 0.5, interval: 3,
      nextReviewAt: Date.now() - 1000 - i * 1000,
      timesReviewed: 2, timesCorrect: 1, confidenceSum: 3, lastConfidence: 2,
      card: due
    };
  }
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Fresh scenario ${calls}`, topic, difficulty);
  };

  const { cards, mixShortfall } = await app._generateSessionCards(8);

  assert.equal(cards.length, 8); // 5 due + 3 fresh fills the session
  assert.equal(mixShortfall, false);
  assert.equal(cards.slice(0, 5).every(card => card.review), true);
  assert.equal(calls, 3);
});

test('a session saturated with due reviews serves no fresh cards', async () => {
  seedRandom(0);
  const app = freshApp();
  for (let i = 0; i < 8; i++) {
    const due = generatedCard(`due-${i}`, `Due scenario ${i}`, 'caching', 2);
    app.profile.cardHistory[`due-${i}`] = {
      stability: 1.5, difficulty: 0.5, interval: 3,
      nextReviewAt: Date.now() - 1000 - i * 1000,
      timesReviewed: 2, timesCorrect: 1, confidenceSum: 3, lastConfidence: 2,
      card: due
    };
  }
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Fresh scenario ${calls}`, topic, difficulty);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.length, 8);
  assert.equal(cards.every(card => card.review), true);
  assert.equal(calls, 0);
});

test('a new user starts sessions at the easiest difficulty', async () => {
  seedRandom(0);
  const app = freshApp();
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Scenario ${calls}`, topic, difficulty);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.length, 8);
  assert.ok(cards.every(card => card.difficulty === 1),
    `first sessions should be difficulty 1, got ${cards.map(card => card.difficulty)}`);
});

test('generated cards ramp from low to high difficulty within a session', async () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.topicScores = {
    caching: { raw: 1, cardsReviewed: 3, daysSpanned: ['2026-08-01', '2026-08-02'] },
    dns: { raw: 0, cardsReviewed: 1, daysSpanned: ['2026-08-01'] },
    storage: { raw: 0.6, cardsReviewed: 2, daysSpanned: ['2026-08-01', '2026-08-02'] }
  };
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Scenario ${calls}`, topic, difficulty);
  };

  const { cards } = await app._generateSessionCards(60);

  assert.equal(cards.length, 60);
  const difficulties = cards.map(card => card.difficulty);
  assert.deepEqual(difficulties, difficulties.slice().sort((a, b) => a - b));
  assert.equal(difficulties[0], 1);
  assert.equal(difficulties[difficulties.length - 1], 5, // caching (raw 1.0) plays last
    `progressed users should reach higher difficulties, got ${difficulties[difficulties.length - 1]}`);
});

test('within a difficulty tier, prerequisite topics are served before dependents', async () => {
  seedRandom(0);
  const app = freshApp();
  // Caching (mastery 0) outranks its prerequisite api-design (mastery 0.12) in
  // the adaptive plan, so the plan order is not prerequisite-first — the
  // session must reorder it topologically.
  app.profile.topicScores = {
    caching: { raw: 0, cardsReviewed: 1, daysSpanned: ['2026-08-01'] },
    'api-design': { raw: 0.12, cardsReviewed: 1, daysSpanned: ['2026-08-01'] }
  };
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Scenario ${calls}`, topic, difficulty);
  };

  const plan = app._buildSessionPlan(10);
  const topo = app._topicTopoOrder();
  const topoRank = new Map(topo.map((topic, index) => [topic, index]));
  assert.ok(topoRank.get(plan[0].topic) > topoRank.get(plan[1].topic),
    'the adaptive plan should rank a dependent before its prerequisite');

  const { cards } = await app._generateSessionCards(20);

  assert.equal(cards.length, 20);
  const sessionTopics = cards.map(card => card.topic);
  const byRank = sessionTopics.slice().sort((a, b) => topoRank.get(a) - topoRank.get(b));
  assert.deepEqual(sessionTopics, byRank, 'session topic order must be prerequisite-first');
  assert.equal(sessionTopics[0], 'api-design');
});

test('due reviews keep the first position in a ramped session', async () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.cardHistory['gen-due-ramp'] = {
    stability: 1.5,
    difficulty: 0.5,
    interval: 3,
    nextReviewAt: Date.now() - 3600000,
    timesReviewed: 2,
    timesCorrect: 1,
    confidenceSum: 3,
    lastConfidence: 2,
    card: {
      id: 'gen-due-ramp',
      scenario: 'A due review scenario at the hardest level',
      topic: 'caching',
      difficulty: 5,
      prerequisiteTopics: ['api-design'],
      nodes: ['Client', 'API', 'Database'],
      flows: [
        { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
        { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
      ],
      options: [{
        id: 'A',
        label: 'Option A',
        prerequisiteTopics: [],
        flows: [
          { from: 'Client', to: 'API', verb: 'requests', kind: 'sync' },
          { from: 'API', to: 'Database', verb: 'queries', kind: 'sync' }
        ]
      }],
      correct: 'A',
      explanation: 'Explanation'
    }
  };
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Fresh scenario ${calls}`, topic, difficulty);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.length, 8);
  assert.equal(cards[0].id, 'gen-due-ramp');
  assert.equal(cards[0].review, true);
  const fresh = cards.slice(1);
  const difficulties = fresh.map(card => card.difficulty);
  assert.deepEqual(difficulties, difficulties.slice().sort((a, b) => a - b));
});

test('duplicate candidates are refilled with accumulated session exclusions', async () => {
  seedRandom(0);
  const app = freshApp();
  let calls = 0;
  const avoidLists = [];
  let baseScenario = '';
  app.fetchCard = async (topic, difficulty, avoidList) => {
    calls++;
    avoidLists.push({ calls, avoidList });
    if (calls === 1) {
      baseScenario = `Base scenario for ${topic}`;
      return generatedCard('first', baseScenario, topic, difficulty);
    }
    if (calls <= 4) return generatedCard('dup', baseScenario, topic, difficulty);
    return generatedCard(`fresh-${calls}`, `Fresh scenario ${calls}`, topic, difficulty);
  };

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.length, 8); // fresh budget of 8, duplicate candidates refilled
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 8);
  assert.ok(calls <= 24, `refill stayed within the fresh-budget fetch bound (${calls})`);
  const baseFingerprint = app._scenarioFingerprint(baseScenario);
  const refillRequests = avoidLists.filter(entry => entry.calls > 4);
  assert.ok(refillRequests.length > 0);
  assert.ok(refillRequests.every(entry =>
    entry.avoidList.some(card => app._scenarioFingerprint(card.scenario) === baseFingerprint)
  ));
});

test('refill attempts are bounded and report the real available count', async () => {
  seedRandom(0);
  const app = freshApp();
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard('only', 'The one and only scenario', topic, difficulty);
  };

  const { cards, requested } = await app._generateSessionCards(8);

  assert.equal(requested, 8);
  assert.equal(cards.length, 1);
  assert.ok(calls <= 24, `bounded to freshBudget*3 fetches (${calls})`);
});

test('cross-topic padding candidates are never accepted into a session', async () => {
  seedRandom(0);
  const app = freshApp();
  app.fetchCard = async () => generatedCard('wrong', 'A wrong-topic scenario', 'unmatched', 3);

  const { cards } = await app._generateSessionCards(8);

  assert.equal(cards.length, 0);
});

test('shortfall confirmation states the requested and available counts', () => {
  const app = freshApp();
  context.confirmValue.value = false;

  assert.equal(app._confirmShortSession(8, 3), false);
  context.confirmValue.value = true;
  assert.equal(app._confirmShortSession(8, 3), true);
});

test('startSession proceeds with a smaller session only after confirmation', async () => {
  const app = freshApp();
  const short = generatedCard('short', 'Only card scenario', 'queues', 2);
  const screens = [];
  app._generateSessionCards = async () => ({ cards: [short], requested: 8 });
  app.prefetchNext = async () => {};
  app._warmCache = async () => {};
  app.showCard = () => {};
  app.showScreen = screen => screens.push(screen);
  app._startTimer = () => {};
  app.saveProfile = () => {};
  context.confirmValue.value = true;

  await app.startSession();

  assert.deepEqual(screens, ['session']);
  assert.deepEqual(app.sessionCards.map(card => card.id), ['short']);
});

test('startSession cancels without mutating state when the shortfall is declined', async () => {
  const app = freshApp();
  const short = generatedCard('short', 'Only card scenario', 'queues', 2);
  const screens = [];
  app.sessionCards = [{ id: 'prior', scenario: 'Prior scenario', topic: 'queues', difficulty: 2 }];
  app._generateSessionCards = async () => ({ cards: [short], requested: 8 });
  app.prefetchNext = async () => {};
  app._warmCache = async () => {};
  app.showCard = () => {};
  app.showScreen = screen => screens.push(screen);
  app._startTimer = () => {};
  app.saveProfile = () => {};
  context.confirmValue.value = false;

  await app.startSession();

  assert.deepEqual(screens, []);
  assert.deepEqual(app.sessionCards.map(card => card.id), ['prior']);
});

test('prefetchNext respects the upcoming full-catalog slot', async () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.topicScores = { dns: { raw: 0, cardsReviewed: 0, daysSpanned: [] } };
  app.sessionCards = [generatedCard('first', 'First scenario', 'caching', 1), generatedCard('next', 'Next scenario', 'dns', 1)];
  let requestedTopic;
  app.fetchCard = async (topic, difficulty) => {
    requestedTopic = topic;
    return generatedCard('prefetched', 'Prefetched scenario', topic, difficulty);
  };

  await app.prefetchNext();

  assert.equal(requestedTopic, 'dns');
  assert.ok(app._nextCard !== null);
});

test('warm cache targets the top full-catalog topics', async () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.topicScores = {
    dns: { raw: 0, cardsReviewed: 0, daysSpanned: [] },
    security: { raw: 0, cardsReviewed: 0, daysSpanned: [] },
    storage: { raw: 0, cardsReviewed: 0, daysSpanned: [] }
  };
  const topics = [];
  app.fetchCard = async (topic, difficulty) => {
    topics.push(topic);
    return generatedCard(`warm-${topic}`, `Warm scenario ${topic}`, topic, difficulty);
  };

  await app._warmCache();

  assert.deepEqual([...topics].sort(), ['dns', 'security', 'storage']);
});

test('topic sessions remain scoped to their selected topic', async () => {
  seedRandom(0);
  const app = freshApp();
  const calls = [];
  let callNumber = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls.push({ topic, difficulty });
    callNumber++;
    return generatedCard(`topic-${callNumber}`, `Topic scenario ${callNumber}`, topic, difficulty);
  };
  app._startTimer = () => {};
  app.saveProfile = () => {};
  app.showCard = () => {};
  app.showScreen = () => {};

  await app.startTopicSession('queues');

  assert.deepEqual(calls.map(call => call.topic), ['queues', 'queues', 'queues', 'queues', 'queues']);
  assert.deepEqual([...new Set(calls.map(call => call.difficulty))].sort(), [1, 2, 3, 4, 5]);
});

test('a wrong answer uses a future slot without extending the session', () => {
  seedRandom(0);
  const app = freshApp();
  const card = generatedCard('card-a', 'A missable scenario', 'caching', 2);
  app.sessionCards = [card, generatedCard('future', 'Future scenario', 'dns', 1)];
  app._retriedCardIds = new Set();

  app._maybeScheduleRetry(card);
  app._maybeScheduleRetry(card);

  assert.equal(app.sessionCards.length, 2);
  assert.equal(app.sessionCards[1].id, 'card-a');
  assert.equal(app.sessionCards[1].review, true);
  assert.equal(app.sessionCards[1].retry, true);
  assert.equal(app._retriedCardIds.has('card-a'), true);
});

test('correct answers never schedule a retry', () => {
  assert.match(appSource, /if \(!correct\) this\._maybeScheduleRetry\(card\);/);
  // Only two references: the guarded call site and the method definition.
  assert.equal((appSource.match(/_maybeScheduleRetry\(card\)/g) || []).length, 2);
});

test('recent accuracy steers difficulty toward the 60-80% band', () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.topicScores = { caching: { raw: 0.5, cardsReviewed: 3, daysSpanned: ['2026-08-01'] } };

  const base = app._rankedSessionTopics().find(item => item.topic === 'caching').difficulty;
  assert.equal(base, 3); // raw 0.5 → 1 + round(2)

  app.profile.topicAccuracy = { caching: [true, true, true, true, true].map(correct => ({ correct })) };
  const easy = app._rankedSessionTopics().find(item => item.topic === 'caching').difficulty;
  assert.equal(easy, 4); // 100% recent accuracy → harder

  app.profile.topicAccuracy = { caching: [true, false, false, false, false].map(correct => ({ correct })) };
  const hard = app._rankedSessionTopics().find(item => item.topic === 'caching').difficulty;
  assert.equal(hard, 2); // 20% recent accuracy → easier

  app.profile.topicAccuracy = { caching: [{ correct: true }] };
  assert.equal(app._topicRecentAccuracy('caching'), null); // too little data
});

test('recent accuracy pacing respects the difficulty bounds', () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.topicScores = { caching: { raw: 0.9, cardsReviewed: 3, daysSpanned: ['2026-08-01'] } };
  app.profile.topicAccuracy = { caching: [true, true, true].map(correct => ({ correct })) };
  assert.equal(app._rankedSessionTopics().find(item => item.topic === 'caching').difficulty, 5);

  app.profile.topicScores = { caching: { raw: 0, cardsReviewed: 3, daysSpanned: ['2026-08-01'] } };
  app.profile.topicAccuracy = { caching: [false, false, false].map(correct => ({ correct })) };
  assert.equal(app._rankedSessionTopics().find(item => item.topic === 'caching').difficulty, 1);
});

test('session-end mistake review lists only cards answered wrong', () => {
  seedRandom(0);
  const app = freshApp();
  const wrong = generatedCard('wrong-1', 'Wrong scenario with a long explanation', 'caching', 3);
  wrong.correct = 'B';
  wrong.explanation = 'Why B wins here';
  const right = generatedCard('right-1', 'Right scenario', 'dns', 1);
  app.sessionCards = [wrong, right];
  app._sessionResults = { 'wrong-1': false, 'right-1': true };

  const html = app._mistakesHtml();

  assert.match(html, /Review your mistakes/);
  assert.match(html, /Wrong scenario with a long explanation/);
  assert.doesNotMatch(html, /Right scenario/);
  assert.match(html, /Why B wins here/);
  assert.doesNotMatch(html, /<script/);
});

test('mistake review is empty when nothing was missed', () => {
  seedRandom(0);
  const app = freshApp();
  const right = generatedCard('right-1', 'Right scenario', 'dns', 1);
  app.sessionCards = [right];
  app._sessionResults = { 'right-1': true };

  assert.equal(app._mistakesHtml(), '');
});


test('session results use completed attempts, not lifetime totals or prepared cards', () => {
  const app = freshApp();
  app.profile.totalCorrect = 100;
  app.profile.totalAnswered = 120;
  app.sessionCards = Array.from({ length: 8 }, (_, i) => generatedCard(`card-${i}`, `Scenario ${i}`, 'caching', 1));
  app._sessionAttempts = [
    { card: app.sessionCards[0], correct: false, confidence: 4 },
    { card: app.sessionCards[1], correct: true, confidence: 1 }
  ];
  const stats = app._sessionStats();
  assert.equal(stats.answered, 2);
  assert.equal(stats.correct, 1);
  assert.equal(stats.percent, 50);
  app._sessionAttempts = [];
  assert.equal(app._sessionStats().percent, 0);
});

test('a final-question mistake does not add an unrequested retry', () => {
  const app = freshApp();
  const card = generatedCard('last', 'Last question scenario', 'caching', 1);
  app.sessionCards = [card];
  app._retriedCardIds = new Set();
  app._maybeScheduleRetry(card);
  assert.equal(app.sessionCards.length, 1);
});


test('session review marks a confident wrong answer incorrect and excludes unanswered cards', () => {
  const testContext = createContext();
  const app = Object.create(testContext.appForTest);
  const wrong = generatedCard('wrong', 'A confidently wrong answer', 'caching', 1);
  const right = generatedCard('right', 'A hesitant right answer', 'dns', 1);
  app.sessionCards = [wrong, right, generatedCard('unanswered', 'Not answered yet', 'queues', 1)];
  app._sessionAttempts = [{ card: wrong, correct: false, confidence: 4 }, { card: right, correct: true, confidence: 1 }];
  app.profile = { totalCorrect: 100, totalAnswered: 120 };
  app._mistakesHtml = () => '';
  const summary = { innerHTML: '' };
  const getElement = testContext.document.getElementById;
  testContext.document.getElementById = id => id === 'session-summary' ? summary : getElement(id);
  testContext.SRS = { confidenceLabel: value => String(value) };
  app.showSessionReview();
  assert.match(summary.innerHTML, /2<\/strong> cards answered/);
  assert.match(summary.innerHTML, /50%/);
  assert.match(summary.innerHTML, /is-incorrect/);
  assert.match(summary.innerHTML, /is-correct/);
  assert.doesNotMatch(summary.innerHTML, /Not answered yet/);
});

test('normal account rendering refreshes a non-default generation allowance', () => {
  const testContext = createContext();
  const allowance = { textContent: 'Free: 10 cards' };
  const getElement = testContext.document.getElementById;
  testContext.document.getElementById = id => id === 'session-allowance' ? allowance : getElement(id);
  vm.runInContext('appConfig.freeDailyCardLimit = 7; renderAccountBar();', testContext);
  assert.match(allowance.textContent, /Free: up to 7 questions/);
  assert.match(allowance.textContent, /midnight UTC/);
});


function timerContext() {
  const ctx = createContext();
  const callbacks = new Map();
  let nextId = 0;
  ctx.setTimeout = fn => { callbacks.set(++nextId, fn); return nextId; };
  ctx.clearTimeout = id => callbacks.delete(id);
  const nodes = new Map();
  const getElement = ctx.document.getElementById;
  ctx.document.getElementById = id => getElement(id) || (nodes.has(id) ? nodes.get(id) : (nodes.set(id, { textContent: '', innerHTML: '', style: {} }), nodes.get(id)));
  return { ctx, callbacks };
}

test('quick review has one countdown loop and stopping cancels it', () => {
  const { ctx, callbacks } = timerContext();
  const app = Object.create(ctx.appForTest);
  app._quickReview = true;
  app._quickTimer = 120;
  app._startTimer();
  assert.equal(ctx.document.getElementById('session-timer').textContent, '⏱ 120s');
  assert.equal(callbacks.size, 1);
  app._startTimer();
  assert.equal(callbacks.size, 1, 'restarting must cancel the old loop');
  app._stopTimer();
  assert.equal(callbacks.size, 0);
});

test('ending a timed session cancels delayed advancement and clears resume', () => {
  const { ctx, callbacks } = timerContext();
  const app = Object.create(ctx.appForTest);
  app.profile = { totalCorrect: 0, totalAnswered: 0, streaks: { current: 0, best: 0 } };
  app.sessionCards = [];
  app._sessionAttempts = [];
  app._profileIdentity = () => 'user:a';
  app.showScreen = app.showSessionReview = app.renderDeckStats = app._saveSession = () => {};
  app._advanceTimer = ctx.setTimeout(() => { throw new Error('unexpected advancement'); });
  app._timerTimeout = ctx.setTimeout(() => {});
  ctx.localStorage.setItem(app._resumeStorageKey(), '{}');
  app.endSession();
  assert.equal(callbacks.size, 0);
  assert.equal(ctx.localStorage.getItem(app._resumeStorageKey()), null);
});

test('daily goal ignores lifetime totals and answers from yesterday', () => {
  const { ctx } = timerContext();
  const app = Object.create(ctx.appForTest);
  app.profile = { totalAnswered: 100, dailyAnswers: { '2000-01-01': 10 } };
  app.renderGoal();
  assert.equal(ctx.document.getElementById('goal-fill').style.width, '0%');
  app.profile.dailyAnswers[new Date().toISOString().split('T')[0]] = 3;
  app.renderGoal();
  assert.equal(ctx.document.getElementById('goal-fill').style.width, '30%');
});

test('resume records stay with their owner across account switches', () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  let identity = 'user:a';
  app._profileIdentity = () => identity;
  app.sessionCards = [generatedCard('a', 'Account A scenario', 'caching', 1)];
  app.sessionIndex = 0;
  app._saveSessionState();
  const ownerKey = app._resumeStorageKey();
  identity = 'user:b';
  assert.equal(app.resumeSession(), false);
  assert.notEqual(app._resumeStorageKey(), ownerKey);
  assert.ok(ctx.localStorage.getItem(ownerKey));
  identity = 'user:a';
  app._startTimer = app.showCard = app.showScreen = () => {};
  assert.equal(app.resumeSession(), true);
  assert.equal(app.sessionCards[0].id, 'a');
});


test('a late prefetch cannot modify a newer session', async () => {
  const app = freshApp();
  app.sessionCards = [generatedCard('a', 'First scenario', 'caching', 1), generatedCard('b', 'Next scenario', 'dns', 1)];
  let resolveOld;
  app.fetchCard = () => new Promise(resolve => { resolveOld = resolve; });
  const pending = app.prefetchNext();
  app.sessionCards = [generatedCard('new', 'New session scenario', 'queues', 1)];
  app._invalidatePrefetch();
  resolveOld(generatedCard('stale', 'Old prefetch scenario', 'dns', 1));
  await pending;
  assert.equal(app._nextCard, null);
  assert.equal(app._isGenerating, false);
});

test('prefetch retains the next slot difficulty and skips scheduled reviews', async () => {
  const app = freshApp();
  const next = generatedCard('next', 'Next scenario', 'dns', 1);
  app.sessionCards = [generatedCard('first', 'First scenario', 'caching', 1), next];
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    assert.equal(topic, 'dns');
    assert.equal(difficulty, 1);
    return generatedCard('prefetch', 'Fresh next scenario', topic, difficulty);
  };
  await app.prefetchNext();
  assert.equal(app._nextCard.difficulty, 1);
  next.review = true;
  await app.prefetchNext();
  assert.equal(calls, 1);
});

test('exiting quick review saves its remaining time and mode', () => {
  const { ctx } = timerContext();
  const app = Object.create(ctx.appForTest);
  app._profileIdentity = () => 'user:quick';
  app.sessionCards = [generatedCard('quick', 'Quick scenario', 'caching', 1)];
  app.sessionIndex = 0;
  app._quickReview = true;
  app._quickTimer = 60;
  app.renderDeckStats = app.showScreen = () => {};
  app.exitSession();
  const saved = JSON.parse(ctx.localStorage.getItem(app._resumeStorageKey()));
  assert.equal(saved.quickTimer, 60);
  assert.equal(saved.quickReview, true);
});


test('exit after authentication changes saves only under the original session owner', () => {
  const { ctx } = timerContext();
  const app = Object.create(ctx.appForTest);
  app._sessionOwner = 'user:a';
  app._profileIdentity = () => 'user:b';
  app.sessionCards = [generatedCard('a', 'Account A question', 'caching', 1)];
  app.sessionIndex = 0;
  app.renderDeckStats = app.showScreen = () => {};
  app.exitSession();
  assert.ok(ctx.localStorage.getItem(app._resumeStorageKey('user:a')));
  assert.equal(ctx.localStorage.getItem(app._resumeStorageKey('user:b')), null);
});


test('navigation cancels an unfinished quick-review preparation', async () => {
  const app = freshApp();
  app._syncScreen = () => {};
  let complete;
  app._generateSessionCards = () => new Promise(resolve => { complete = resolve; });
  const pending = app.startQuickReview();
  app.showScreen('concepts');
  complete({ cards: [generatedCard('late', 'Late scenario', 'caching', 1)], requested: 1 });
  await pending;
  assert.equal(app.sessionCards.length, 0);
  assert.equal(app.profile.totalSessions, 0);
});

test('newer preparation wins when earlier preparation finishes last', async () => {
  const app = freshApp();
  const completions = [];
  app._generateSessionCards = () => new Promise(resolve => completions.push(resolve));
  app._startTimer = app.showCard = app.showScreen = app.prefetchNext = () => {};
  const first = app.startQuickReview();
  const second = app.startQuickReview();
  completions[1]({ cards: [generatedCard('new', 'New request', 'dns', 1)], requested: 1 });
  await second;
  completions[0]({ cards: [generatedCard('old', 'Old request', 'caching', 1)], requested: 1 });
  await first;
  assert.equal(app.sessionCards[0].id, 'new');
  assert.equal(app.profile.totalSessions, 1);
});

test('regenerate is visible before answering a card', () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app.sessionCards = [generatedCard('card', 'Scenario', 'caching', 1)];
  app.sessionIndex = 0;
  app._recordDisplayedScenario = () => {};
  app._wikiLink = () => '';
  app.isBookmarked = () => false;
  ctx.document.createElement = () => ({ className: '', innerHTML: '', setAttribute() {} });
  app.showCard();
  assert.equal(ctx.document.getElementById('regenerate-btn').classList.contains('hidden'), false);
});

test('late regeneration cannot overwrite a newer session', async () => {
  const app = freshApp();
  const old = generatedCard('old', 'Old scenario', 'caching', 1);
  app.sessionCards = [old];
  app.currentCard = old;
  let complete;
  app.fetchCard = () => new Promise(resolve => { complete = resolve; });
  const pending = app.regenerateCard();
  const next = generatedCard('new', 'New scenario', 'dns', 1);
  app.sessionCards = [next];
  app.currentCard = next;
  complete(generatedCard('late', 'Late replacement', 'caching', 1));
  await pending;
  assert.equal(app.sessionCards[0].id, 'new');
});

test('answering while regeneration is pending preserves the answered card', async () => {
  const app = freshApp();
  const original = generatedCard('original', 'Original scenario', 'caching', 1);
  app.sessionCards = [original];
  app.currentCard = original;
  app._selectedId = null;
  let complete;
  app.fetchCard = () => new Promise(resolve => { complete = resolve; });
  app.showCard = () => assert.fail('must not reset the answered card');
  const pending = app.regenerateCard();
  app._selectedId = original.correct;
  complete(generatedCard('replacement', 'Replacement scenario', 'caching', 1));
  await pending;
  assert.equal(app.currentCard, original);
  assert.equal(app.sessionCards[0], original);
  assert.equal(app._selectedId, original.correct);
});

test('failed regeneration cannot announce an error in a newer session', async () => {
  const app = freshApp();
  const original = generatedCard('original', 'Original scenario', 'caching', 1);
  app.sessionCards = [original];
  app.currentCard = original;
  let reject;
  app.fetchCard = () => new Promise((resolve, fail) => { reject = fail; });
  app._announceRegenerate = () => assert.fail('stale errors must not reach the new session');
  const pending = app.regenerateCard();
  const next = generatedCard('next', 'Next scenario', 'dns', 1);
  app.sessionCards = [next];
  app.currentCard = next;
  reject(new Error('generation failed'));
  await pending;
  assert.equal(app.sessionCards[0], next);
});

test('an answered card cannot start regeneration', async () => {
  const app = freshApp();
  app.currentCard = generatedCard('answered', 'Answered scenario', 'caching', 1);
  app._selectedId = app.currentCard.correct;
  app.fetchCard = () => assert.fail('answered cards must not be regenerated');
  await app.regenerateCard();
});

test('session export uses completed attempts and preserves plain text', async () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app.profile.totalCorrect = 90;
  const answered = generatedCard('answered', 'Cache <hot> reads & writes', 'caching', 1);
  const unseen = generatedCard('unseen', 'Unanswered scenario', 'dns', 1);
  app.sessionCards = [answered, unseen];
  app._sessionAttempts = [
    { card: answered, correct: false, confidence: 1 },
    { card: answered, correct: true, confidence: 3 }
  ];
  let copied;
  ctx.navigator = { clipboard: { writeText: async text => { copied = text; } } };
  app.exportSession();
  await Promise.resolve();
  assert.match(copied, /Cards: 2\nCorrect: 1 \(50%\)/);
  assert.match(copied, /Topics: caching\n/);
  assert.match(copied, /Cache <hot> reads & writes/);
  assert.doesNotMatch(copied, /Unanswered scenario|&lt;|&amp;/);
});

test('empty session export does not include lifetime results or planned cards', async () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app.profile.totalCorrect = 90;
  app.sessionCards = [generatedCard('unseen', 'Unanswered scenario', 'dns', 1)];
  app._sessionAttempts = [];
  let copied;
  ctx.navigator = { clipboard: { writeText: async text => { copied = text; } } };
  app.exportSession();
  await Promise.resolve();
  assert.match(copied, /Cards: 0\nCorrect: 0 \(0%\)/);
  assert.doesNotMatch(copied, /Unanswered scenario/);
});

test('free sessions stop at the remaining daily answer allowance', async () => {
  const ctx = createContext();
  vm.runInContext("currentPlan = 'free'", ctx);
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  const today = new Date().toISOString().slice(0, 10);
  app.profile.dailyAnswers = { [today]: 99 };
  app._dueReviewCards = () => [];
  app._buildSessionPlan = () => [{ topic: 'caching', difficulty: 1 }];
  app.fetchCard = async () => generatedCard('one', 'One remaining question', 'caching', 1);
  const session = await app._generateSessionCards(8);
  assert.equal(session.requested, 1);
  assert.equal(session.cards.length, 1);
  app.profile.dailyAnswers[today] = 100;
  assert.equal(app._freeQuestionsRemaining(), 0);
  app.showQuotaNotice = kind => { assert.equal(kind, 'cards'); };
  assert.equal(app._canPractice(), false);
  const exhausted = await app._generateSessionCards(8);
  assert.equal(exhausted.cards.length, 0);
  app.profile.dailyAnswers = { '2000-01-01': 100 };
  assert.equal(app._freeQuestionsRemaining(), 100);
  vm.runInContext("currentPlan = 'pro'", ctx);
  app.profile.dailyAnswers[today] = 1000;
  assert.equal(app._freeQuestionsRemaining(), Infinity);
});

test('free requests use cache-only cards and cannot force AI generation', async () => {
  const ctx = createContext();
  vm.runInContext("currentPlan = 'free'", ctx);
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app._cardCache = {};
  app.sessionCards = [];
  let requests = 0;
  const card = generatedCard('existing', 'An existing server card', 'caching', 1);
  ctx.fetch = async url => {
    requests++;
    assert.equal(new URL(url, 'https://example.com').searchParams.get('cache_only'), '1');
    return { ok: true, json: async () => ({ card }) };
  };
  assert.equal((await app.fetchCard('caching', 1)).id, card.id);
  app.showProNotice = () => {};
  assert.equal(await app.fetchCard('caching', 1, [], { force: true }), null);
  await app.prefetchNext();
  await app._warmCache();
  assert.equal(requests, 1);
  // A later free session may reuse the same existing card.
  app.profile.seenScenarioFingerprints = [app._scenarioFingerprint(card.scenario)];
  assert.equal((await app.fetchCard('caching', 1)).id, card.id);
  assert.equal(requests, 1);
});

test('a new free visitor gets a complete offline session from existing cards', async () => {
  const ctx = createContext();
  vm.runInContext("currentPlan = 'free'", ctx);
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app.sessionCards = [];
  app._cardCache = {};
  app.fetchCard = async () => assert.fail('free sessions must not need generation requests');
  const first = await app._generateSessionCards(8);
  assert.equal(first.cards.length, 8);
  assert.equal(new Set(first.cards.map(card => card.id)).size, 8);
  assert.ok(app._bundledPracticeCards().every(card => card.id && card.topic && card.options), 'snapshot pools must be flattened into cards');
  app.profile.seenScenarioFingerprints = first.cards.map(card => app._scenarioFingerprint(card.scenario));
  app.profile.dailyAnswers = { [new Date().toISOString().slice(0, 10)]: 8 };
  const next = await app._generateSessionCards(8);
  assert.equal(next.cards.length, 8, 'existing content remains reusable later in the day');
});


test('late quota responses cannot expose a previous account plan', async () => {
  const ctx = createContext();
  const nodes = new Map();
  const getElement = ctx.document.getElementById;
  ctx.document.getElementById = id => getElement(id) || (nodes.has(id) ? nodes.get(id) : (nodes.set(id, { innerHTML: '', textContent: '', classList: makeClassList(['hidden']) }), nodes.get(id)));
  let complete;
  ctx.fetch = () => new Promise(resolve => { complete = resolve; });
  vm.runInContext("setAccountSession({user:{id:'a'}});", ctx);
  const pending = vm.runInContext('renderQuotaBar()', ctx);
  vm.runInContext("setAccountSession({user:{id:'b'}});", ctx);
  complete({ ok: true, json: async () => ({ plan: 'pro' }) });
  await pending;
  assert.equal(vm.runInContext('currentPlan', ctx), 'free');
  assert.equal(ctx.document.getElementById('quota-bar').classList.contains('hidden'), true);
});

test('account switches clear a previously displayed Pro plan immediately', () => {
  const ctx = createContext();
  vm.runInContext("setAccountSession({user:{id:'a'}}); currentPlan = 'pro'; setAccountSession({user:{id:'b'}});", ctx);
  assert.equal(vm.runInContext('currentPlan', ctx), 'free');
});

test('generated bookmarks persist content before grading and survive cache eviction', () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app.currentCard = generatedCard('generated-bookmark', 'A generated bookmarked scenario', 'caching', 1);
  const list = { innerHTML: '', textContent: '' };
  const getElement = ctx.document.getElementById;
  ctx.document.getElementById = id => id === 'bookmark-list' ? list : getElement(id);
  app._loadCachedKeys = () => [];
  app.toggleBookmark(app.currentCard.id);
  app.currentCard = null;
  app.renderBookmarks();
  assert.match(list.innerHTML, /A generated bookmarked scenario/);
  app.toggleBookmark('generated-bookmark');
  assert.deepEqual(JSON.parse(ctx.localStorage.getItem('sdf_bookmark_cards')), {});
});

test('card options and explanations render markup as text', () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  const card = generatedCard('markup', 'Plain scenario', 'caching', 1);
  card.options[0].label = '<img src=x onerror=alert(1)>';
  card.explanation = '<img src=x onerror=alert(2)>';
  app.sessionCards = [card];
  app.sessionIndex = 0;
  app._recordDisplayedScenario = () => {};
  app._wikiLink = () => '';
  app.isBookmarked = () => false;
  const buttons = [];
  ctx.document.createElement = () => { const button = { innerHTML: '', setAttribute() {} }; buttons.push(button); return button; };
  ctx.Render = { diagram() {} };
  app.showCard();
  assert.ok(buttons.some(button => button.innerHTML.includes('&lt;img')));
  assert.ok(buttons.every(button => !button.innerHTML.includes('<img')));
  app.answer(card.correct);
  const feedback = ctx.document.getElementById('feedback').innerHTML;
  assert.match(feedback, /&lt;img/);
  assert.doesNotMatch(feedback, /<img/);
});


test('UTC yesterday remains correct across the daylight-saving fallback', () => {
  const ctx = createContext();
  const priorTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  const instant = Date.parse('2026-11-02T06:30:00Z');
  ctx.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
  try {
    assert.equal(ctx.appForTest._yesterday(), '2026-11-01');
  } finally {
    if (priorTimezone === undefined) delete process.env.TZ; else process.env.TZ = priorTimezone;
  }
});

test('displaying the first or a regenerated card starts its response timer', () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app.sessionCards = [generatedCard('first', 'First timed scenario', 'caching', 1)];
  app.sessionIndex = 0;
  app._recordDisplayedScenario = () => {};
  app._wikiLink = () => '';
  app.isBookmarked = () => false;
  ctx.document.createElement = () => ({ innerHTML: '', setAttribute() {} });
  ctx.Date = class extends Date { static now() { return 1000; } };
  app.showCard();
  assert.equal(app._cardStartTime, 1000);
  ctx.Date = class extends Date { static now() { return 2000; } };
  app.showCard();
  assert.equal(app._cardStartTime, 2000);
});

test('a previous account save releases pending sync for the current account', async () => {
  const ctx = createContext();
  const app = Object.create(ctx.appForTest);
  app.profile = ctx.normalizeProfileDataForTest(baseProfile());
  app._profileSyncIdentity = 'user:a';
  app._profileSyncReady = true;
  app._profileLocalUpdatedAt = 100;
  app._profileChangeVersion = 1;
  let complete;
  ctx.fetch = () => new Promise(resolve => { complete = resolve; });
  const pending = app._flushProfileSync();
  app._profileSyncIdentity = 'user:b';
  app._profileLocalUpdatedAt = 200;
  app._profileLastSyncedClientUpdatedAt = 0;
  let scheduled = false;
  app._scheduleProfileSync = delay => { scheduled = delay === 0; };
  // The new account's scheduled attempt is blocked by the earlier in-flight PUT.
  await app._flushProfileSync();
  complete({ ok: true, json: async () => ({ clientUpdatedAt: 100 }) });
  await pending;
  assert.equal(scheduled, true);
  assert.equal(app._profileSyncInFlight, false);
});
