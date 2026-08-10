import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
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
globalThis.TOPIC_CATALOG = TOPIC_CATALOG;
globalThis.SEED_CARDS = SEED_CARDS;
globalThis.normalizeCardPrerequisites = normalizeCardPrerequisites;
${appSource}
globalThis.normalizeProfileDataForTest = normalizeProfileData;
globalThis.appForTest = APP;`, context);
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
  return { id, scenario, topic, difficulty, prerequisiteTopics: [] };
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

test('session plans cover all 13 topics and extend with unique topic+difficulty pairs', () => {
  seedRandom(0);
  const app = freshApp();

  const thirteen = app._buildSessionPlan(13);
  assert.equal(thirteen.length, 13);
  assert.equal(thirteen.map(item => item.topic).sort().join(','), [...catalogTopics].sort().join(','));

  const fifteen = app._buildSessionPlan(15);
  assert.equal(fifteen.length, 15);
  const keys = fifteen.map(item => `${item.topic}:${item.difficulty}`);
  assert.equal(new Set(keys).size, 15);
  for (const item of fifteen) {
    assert.ok(catalogTopics.includes(item.topic));
    assert.ok(item.difficulty >= 1 && item.difficulty <= 5);
  }
  assert.equal(new Set(fifteen.map(item => item.topic)).size < 15, true);

  const forty = app._buildSessionPlan(40);
  assert.equal(forty.length, 40);
  assert.equal(new Set(forty.map(item => `${item.topic}:${item.difficulty}`)).size, 40);
});

test('standard sessions cap fresh cards at half the session', async () => {
  seedRandom(0);
  const app = freshApp();
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Scenario number ${calls}`, topic, difficulty);
  };

  const { cards, requested, mixShortfall } = await app._generateSessionCards(8);

  assert.equal(requested, 8);
  assert.equal(cards.length, 4); // 0 due reviews → fresh capped at half
  assert.equal(mixShortfall, true);
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 4);
  assert.equal(calls, 4);
});

test('quick review sessions cap fresh cards at half the session', async () => {
  seedRandom(0);
  const app = freshApp();
  let calls = 0;
  app.fetchCard = async (topic, difficulty) => {
    calls++;
    return generatedCard(`card-${calls}`, `Quick scenario ${calls}`, topic, difficulty);
  };

  const { cards, requested, mixShortfall } = await app._generateSessionCards(15);

  assert.equal(requested, 15);
  assert.equal(cards.length, 8); // 0 due reviews → fresh capped at half
  assert.equal(mixShortfall, true);
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 8);
  assert.equal(calls, 8);
});

test('due reviews limit the fresh budget of a session', async () => {
  seedRandom(0);
  const app = freshApp();
  for (let i = 0; i < 5; i++) {
    const due = { id: `due-${i}`, scenario: `Due scenario ${i}`, topic: 'caching', difficulty: 2, prerequisiteTopics: [], options: [], correct: 'A' };
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
    const due = { id: `due-${i}`, scenario: `Due scenario ${i}`, topic: 'caching', difficulty: 2, prerequisiteTopics: [], options: [], correct: 'A' };
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

  assert.equal(cards.length, 4);
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

  const { cards } = await app._generateSessionCards(30);

  assert.equal(cards.length, 15); // fresh capped at half of the request
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

  assert.equal(cards.length, 10);
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
      options: [{ id: 'A', label: 'Option A', prerequisiteTopics: [] }],
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

  assert.equal(cards.length, 5);
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

  assert.equal(cards.length, 4); // fresh budget of 4, one base + three refills
  assert.equal(new Set(cards.map(card => app._scenarioFingerprint(card.scenario))).size, 4);
  assert.ok(calls <= 12, `refill stayed within the fresh-budget fetch bound (${calls})`);
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
  assert.ok(calls <= 12, `bounded to freshBudget*3 fetches (${calls})`);
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

test('prefetchNext picks from the full catalog, not just seed topics', async () => {
  seedRandom(0);
  const app = freshApp();
  app.profile.topicScores = { dns: { raw: 0, cardsReviewed: 0, daysSpanned: [] } };
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

test('a wrong answer re-serves the card at the end of the session', () => {
  seedRandom(0);
  const app = freshApp();
  const card = generatedCard('card-a', 'A missable scenario', 'caching', 2);
  app.sessionCards = [card];
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
