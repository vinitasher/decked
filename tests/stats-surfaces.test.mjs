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

function makeElement(id) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    disabled: false,
    className: '',
    value: '',
    classList: makeClassList([]),
    style: {},
    children: [],
    parentNode: null,
    nextSibling: null,
    setAttribute() {},
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return []; },
    scrollIntoView() {}
  };
}

function createContext(elementIds = []) {
  const elements = new Map();
  for (const id of elementIds) elements.set(id, makeElement(id));
  const context = {
    window: { location: { hostname: 'example.com' } },
    URLSearchParams,
    document: {
      addEventListener() {},
      getElementById(id) { return elements.get(id); },
      createElement() { return makeElement(''); },
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

const statsElementIds = ['stats-global', 'study-calendar', 'mastery-chart', 'coverage-heatmap', 'confidence-buttons', 'next-btn', 'consecutive-correct'];
const context = createContext(statsElementIds);
const chartEl = context.document.getElementById('mastery-chart');
const heatEl = context.document.getElementById('coverage-heatmap');
const seedIds = context.SEED_CARDS.map(card => card.id);

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

function reviewRecord(nextReviewAt, cardSnapshot, createdAt) {
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
  if (createdAt !== undefined) record._createdAt = createdAt;
  return record;
}

test('rateConfidence records _createdAt on the first review of a card', () => {
  const app = freshApp();
  app._cardCorrect = true;
  app.currentCard = snapshotCard('gen-card', 'A generated scenario', 'storage');

  app.rateConfidence(3);

  assert.equal(typeof app.profile.cardHistory['gen-card']._createdAt, 'number');
  assert.ok(app.profile.cardHistory['gen-card']._createdAt > 0);
});

test('showStats derives topic totals and card totals from the studied set', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-storage'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-storage', 'A storage scenario', 'storage'));
  app.profile.cardHistory['gen-security'] = reviewRecord(Date.now() + 86400000,
    snapshotCard('gen-security', 'A security scenario', 'security'));

  app.showStats();

  const html = context.document.getElementById('stats-global').innerHTML;
  assert.equal(html.includes(`${seedIds.length + 2} studied`), true);
  // 5 seed topics + storage + security
  assert.equal(html.includes('Topics: 0 / 7 mastered'), true);
});

test('mastery chart lists topics that exist only in cardHistory', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-storage'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-storage', 'A storage scenario', 'storage'));
  app.profile.cardHistory['gen-security'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-security', 'A security scenario', 'security'));

  app.renderMasteryChart();

  assert.equal(chartEl.innerHTML.includes('Storage'), true);
  assert.equal(chartEl.innerHTML.includes('Security'), true);
  assert.equal(chartEl.innerHTML.includes('LB'), false);
});

test('coverage heatmap includes topics that exist only in cardHistory', () => {
  const app = freshApp();
  app.profile.cardHistory['gen-storage'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-storage', 'A storage scenario', 'storage'));
  app.profile.cardHistory['gen-security'] = reviewRecord(Date.now() - 3600000,
    snapshotCard('gen-security', 'A security scenario', 'security'));

  app.renderMasteryChart();

  const heat = heatEl.innerHTML;
  assert.equal(heat.includes('Storage'), true);
  assert.equal(heat.includes('Security'), true);
  assert.equal(heat.includes('Caching'), true);
});

test('coverage heatmap rerenders in place without duplicating the surface', () => {
  const app = freshApp();

  app.renderMasteryChart();
  app.renderMasteryChart();

  assert.equal((heatEl.innerHTML.match(/class="heatmap"/g) || []).length, 1);
});

test('study calendar counts generated-card reviews on the correct day', () => {
  const app = freshApp();
  const dayMs = 86400000;
  const now = Date.now();
  const threeDaysAgo = now - 3 * dayMs;
  const twoDaysAgo = now - 2 * dayMs;
  const key3 = new Date(threeDaysAgo).toISOString().split('T')[0];
  const key2 = new Date(twoDaysAgo).toISOString().split('T')[0];

  app.profile.cardHistory[seedIds[0]] = reviewRecord(threeDaysAgo,
    snapshotCard(seedIds[0], 'Seed scenario', 'caching'), threeDaysAgo);
  app.profile.cardHistory['gen-storage'] = reviewRecord(threeDaysAgo,
    snapshotCard('gen-storage', 'A generated storage scenario', 'storage'), threeDaysAgo);
  app.profile.cardHistory['gen-security'] = reviewRecord(twoDaysAgo,
    snapshotCard('gen-security', 'A generated security scenario', 'security'), twoDaysAgo);

  app.renderStudyCalendar();

  const calendar = context.document.getElementById('study-calendar');
  const titles = calendar.children.map(dot => dot.title);
  assert.equal(titles.includes(`${key3}: 2 reviews`), true);
  assert.equal(titles.includes(`${key2}: 1 reviews`), true);
});

test('study calendar tolerates legacy records without a snapshot or timestamp', () => {
  const app = freshApp();
  app.profile.cardHistory['legacy-gen'] = {
    stability: 1.5,
    difficulty: 0.5,
    interval: 3,
    nextReviewAt: Date.now() - 3600000,
    timesReviewed: 1,
    timesCorrect: 1
  };

  assert.doesNotThrow(() => app.renderStudyCalendar());
});
