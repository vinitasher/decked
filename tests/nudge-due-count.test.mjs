import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

function makeClassList() {
  const values = new Set();
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
    classList: makeClassList(),
    style: {},
    children: [],
    setAttribute() {},
    appendChild() {},
    querySelectorAll() { return []; },
    scrollIntoView() {}
  });
  for (const id of ['start-session-btn', 'screen-session']) elements.set(id, makeElement(id));

  const notifications = [];
  function NotificationMock(title, options) {
    notifications.push({ title, body: options && options.body });
  }
  NotificationMock.permission = 'granted';
  NotificationMock.requestPermission = () => {};
  NotificationMock.sent = () => notifications;

  const context = {
    Notification: NotificationMock,
    window: {
      location: { hostname: 'example.com' },
      Notification: NotificationMock
    },
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
  return { context, notifications };
}

const { context, notifications } = createContext();

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

function reviewRecord(nextReviewAt) {
  return {
    stability: 1.5,
    difficulty: 0.5,
    interval: 3,
    nextReviewAt,
    timesReviewed: 2,
    timesCorrect: 1,
    confidenceSum: 3,
    lastConfidence: 2
  };
}

test('sendNudge counts due reviews across generated and seed cards combined', () => {
  notifications.length = 0;
  const app = freshApp();
  const now = Date.now();
  const seedId = context.SEED_CARDS[0].id;
  app.profile.cardHistory[seedId] = reviewRecord(now - 3600000);
  app.profile.cardHistory['gen-1'] = reviewRecord(now - 3600000);
  app.profile.cardHistory['gen-2'] = reviewRecord(now - 3600000);

  app.sendNudge();

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].body, '3 cards due for review! A quick session?');
});

test('sendNudge uses the shared due-count signal, not the seed-card list', () => {
  notifications.length = 0;
  const app = freshApp();
  const now = Date.now();
  app.profile.cardHistory['gen-1'] = reviewRecord(now - 3600000);
  app.profile.cardHistory['gen-2'] = reviewRecord(now - 3600000);
  app.profile.cardHistory['gen-3'] = reviewRecord(now - 3600000);
  app.profile.cardHistory['gen-4'] = reviewRecord(now - 3600000);
  app.profile.cardHistory['gen-5'] = reviewRecord(now - 3600000);

  app.sendNudge();

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].body, '5 cards due for review! A quick session?');
});

test('sendNudge does not fire when no reviewed card is due', () => {
  notifications.length = 0;
  const app = freshApp();
  const now = Date.now();
  app.profile.cardHistory['gen-1'] = reviewRecord(now + 86400000);

  app.sendNudge();

  assert.equal(notifications.length, 0);
});

test('sendNudge does not count unreviewed seed cards as due', () => {
  notifications.length = 0;
  const app = freshApp();

  app.sendNudge();

  assert.equal(notifications.length, 0);
});

test('enableNudges persists the preference and sends an honest nudge', () => {
  notifications.length = 0;
  const app = freshApp();
  const now = Date.now();
  app.profile.cardHistory['gen-1'] = reviewRecord(now - 3600000);

  app.enableNudges();

  assert.equal(context.localStorage.getItem('sdf_nudges'), 'true');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].body, '1 card due for review! A quick session?');
});
