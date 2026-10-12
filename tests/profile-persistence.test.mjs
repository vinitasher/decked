import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const context = {
  window: { location: { hostname: 'example.com' } },
  URLSearchParams,
  document: { addEventListener() {} },
  setTimeout,
  clearTimeout,
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
  hasDegenerateLinearOptionTopology(card) {
    return card?.id === 'bad-diagram';
  },
  hasUsableCorrectOptionWiring(card) {
    return card?.id !== 'missing-correct-diagram';
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

test('resumeSession drops cached cards with degenerate diagram topology', () => {
  const app = context.appForTest;
  const originalStartTimer = app._startTimer;
  const originalShowCard = app.showCard;
  const originalShowScreen = app.showScreen;
  const bad = { id: 'bad-diagram', scenario: 'Bad', topic: 'caching' };
  const good = { id: 'good-diagram', scenario: 'Good', topic: 'caching' };
  context.localStorage.setItem(app._resumeStorageKey(), JSON.stringify({
    cards: [bad, good], index: 1, start: 123
  }));
  app._startTimer = () => {};
  app.showCard = () => {};
  app.showScreen = () => {};

  try {
    assert.equal(app.resumeSession(), true);
    assert.equal(app.sessionCards.map(card => card.id).join(','), 'good-diagram');
    assert.equal(app.sessionIndex, 0);
  } finally {
    app._startTimer = originalStartTimer;
    app.showCard = originalShowCard;
    app.showScreen = originalShowScreen;
    context.localStorage.removeItem(app._resumeStorageKey());
  }
});

test('resumeSession drops cached cards without correct-option wiring', () => {
  const app = context.appForTest;
  const originalStartTimer = app._startTimer;
  const originalShowCard = app.showCard;
  const originalShowScreen = app.showScreen;
  const bad = { id: 'missing-correct-diagram', scenario: 'Missing wiring', topic: 'caching' };
  const good = { id: 'good-diagram', scenario: 'Good', topic: 'caching' };
  context.localStorage.setItem(app._resumeStorageKey(), JSON.stringify({
    cards: [bad, good], index: 1, start: 123
  }));
  app._startTimer = () => {};
  app.showCard = () => {};
  app.showScreen = () => {};

  try {
    assert.equal(app.resumeSession(), true);
    assert.equal(app.sessionCards.map(card => card.id).join(','), 'good-diagram');
    assert.equal(app.sessionIndex, 0);
  } finally {
    app._startTimer = originalStartTimer;
    app.showCard = originalShowCard;
    app.showScreen = originalShowScreen;
    context.localStorage.removeItem(app._resumeStorageKey());
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
  assert.deepEqual(JSON.parse(context.localStorage.getItem('sdf_gen_caching:3')), { cards: [card] });
});

function generatedCard(id, scenario, topic = 'caching', difficulty = 3) {
  return { id, scenario, topic, difficulty, prerequisiteTopics: [] };
}

function resetApp() {
  context.localStorage.values.clear();
  vm.runInContext('currentSession = null', context);
  context.appForTest._cardCache = {};
  context.appForTest.sessionCards = [];
  context.appForTest._profileSyncReady = false;
  context.appForTest._profileSyncInFlight = false;
  context.appForTest._profileSyncIdentity = null;
  context.appForTest._profileSyncTimer = null;
  context.appForTest._profilePendingMigration = null;
  context.appForTest._profileLocalUpdatedAt = 0;
  context.appForTest._profileLastSyncedClientUpdatedAt = 0;
  context.appForTest._profileChangeVersion = 0;
  context.appForTest.profile = context.normalizeProfileDataForTest({
    userId: 'profile-a', topicScores: {}, cardHistory: {}, streaks: {}, _topicCardSeen: {}
  });
}

function setAuthUser(userId) {
  vm.runInContext(`currentSession = { user: { id: ${JSON.stringify(userId)} } }`, context);
}

test('signed-in users load isolated local profile caches before remote hydration', () => {
  resetApp();
  const app = context.appForTest;
  const userOneProfile = context.normalizeProfileDataForTest({
    userId: 'user-one', topicScores: {}, cardHistory: {}, streaks: {},
    _topicCardSeen: {}, totalAnswered: 8
  });
  const userOneKey = app._profileStorageKey('user:user-one');
  context.localStorage.setItem(userOneKey, JSON.stringify(userOneProfile));

  try {
    setAuthUser('user-one');
    app.loadProfile();
    assert.equal(app._profileSyncIdentity, 'user:user-one');
    assert.equal(app.profile.totalAnswered, 8);

    setAuthUser('user-two');
    app.loadProfile();
    assert.equal(app._profileSyncIdentity, 'user:user-two');
    assert.equal(app.profile.totalAnswered, 0);
  } finally {
    vm.runInContext('currentSession = null', context);
    context.localStorage.values.clear();
  }
});

test('card pools preserve valid legacy cards and deduplicate scenarios', () => {
  // Arrange
  resetApp();
  const first = generatedCard('first', 'The same   scenario');
  const replacement = generatedCard('replacement', 'the same scenario');
  context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify({ cards: [first, replacement] }));

  // Act
  const pool = context.appForTest._readCardPool('caching:3');

  // Assert
  assert.equal(pool.cards.length, 1);
  assert.equal(pool.cards[0].id, 'replacement');
});

test('card pools discard entries without correct-option wiring', () => {
  // Arrange
  resetApp();
  const invalid = generatedCard('missing-correct-diagram', 'Missing wiring');
  context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify({ cards: [invalid] }));

  // Act
  const pool = context.appForTest._readCardPool('caching:3');

  // Assert
  assert.deepEqual(JSON.parse(JSON.stringify(pool)), { cards: [] });
  assert.deepEqual(JSON.parse(context.localStorage.getItem('sdf_gen_caching:3')), { cards: [] });
});

test('fetchCard selects an unseen local variant without network access', async () => {
  // Arrange
  resetApp();
  const seen = generatedCard('seen', 'Previously shown scenario');
  const unseen = generatedCard('unseen', 'Brand new scenario');
  context.appForTest.profile.seenScenarioFingerprints = [context.appForTest._scenarioFingerprint(seen.scenario)];
  context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify({ cards: [seen, unseen] }));
  let requests = 0;
  context.fetch = () => { requests++; throw new Error('unexpected network request'); };

  // Act
  const result = await context.appForTest.fetchCard('caching', 3);

  // Assert
  assert.equal(result.id, 'unseen');
  assert.equal(requests, 0);
});

test('exhausted pools send profile and session exclusions then append server card', async () => {
  // Arrange
  resetApp();
  const profileCard = generatedCard('profile', 'Profile scenario');
  const sessionCard = generatedCard('session', 'Session scenario');
  const serverCard = generatedCard('server', 'Server scenario');
  context.appForTest.profile.seenScenarioFingerprints = [context.appForTest._scenarioFingerprint(profileCard.scenario)];
  context.appForTest.sessionCards = [sessionCard];
  context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify({ cards: [profileCard] }));
  let requestUrl;
  context.fetch = async url => {
    requestUrl = new URL(url, 'https://example.com');
    return { ok: true, async json() { return { card: serverCard }; } };
  };

  // Act
  const result = await context.appForTest.fetchCard('caching', 3);

  // Assert
  assert.equal(result.id, 'server');
  assert.deepEqual(requestUrl.searchParams.getAll('exclude').sort(), [
    context.appForTest._scenarioFingerprint(profileCard.scenario),
    context.appForTest._scenarioFingerprint(sessionCard.scenario)
  ].sort());
  assert.deepEqual(
    JSON.parse(context.localStorage.getItem('sdf_gen_caching:3')).cards.map(card => card.id),
    ['profile', 'server']
  );
});

test('local card pools retain only the newest twenty distinct scenarios', () => {
  // Arrange
  resetApp();
  const cards = Array.from({ length: 22 }, (_, index) => generatedCard(`card-${index}`, `Scenario ${index}`));

  // Act
  const pool = context.appForTest._writeCardPool('caching:3', cards);

  // Assert
  assert.equal(pool.cards.length, 20);
  assert.equal(pool.cards[0].id, 'card-2');
  assert.equal(pool.cards[19].id, 'card-21');
});

test('malformed storage recovers through generation and offline failures use seed fallback', async () => {
  // Arrange
  resetApp();
  const fallback = generatedCard('seed', 'Offline seed scenario');
  context.SEED_CARDS.push(fallback);
  context.localStorage.setItem('sdf_gen_caching:3', '{bad json');
  context.fetch = async () => { throw new Error('offline'); };

  try {
    // Act
    const result = await context.appForTest.fetchCard('caching', 3);

    // Assert
    assert.equal(result.id, 'seed');
    assert.equal(context.localStorage.getItem('sdf_gen_caching:3'), null);
  } finally {
    context.SEED_CARDS.pop();
  }
});

test('API responses without correct-option wiring are rejected', async () => {
  // Arrange
  resetApp();
  const invalid = generatedCard('missing-correct-diagram', 'Missing wiring');
  context.fetch = async () => ({ ok: true, async json() { return { card: invalid }; } });

  // Act / Assert
  await assert.rejects(
    () => context.appForTest.fetchCard('caching', 3, [], { force: true }),
    /server returned an invalid or excluded card/
  );
});

test('custom-card and reviewed-card fallbacks reject missing correct wiring', () => {
  // Arrange
  resetApp();
  const invalid = generatedCard('missing-correct-diagram', 'Missing wiring');
  context.localStorage.setItem('sdf_custom_cards', JSON.stringify([invalid]));
  context.appForTest._loadCustomCards();
  context.appForTest.profile.cardHistory[invalid.id] = {
    card: invalid,
    nextReviewAt: 0
  };

  // Act / Assert
  assert.equal(context.SEED_CARDS.some(card => card.id === invalid.id), false);
  assert.equal(context.appForTest._resolveCardContent(invalid.id), null);
  context.localStorage.removeItem('sdf_custom_cards');
});

test('remote profile hydration replaces the local cache for the active identity', async () => {
  resetApp();
  const app = context.appForTest;
  context.localStorage.setItem('sdf_device_id', 'device-sync');
  const remote = {
    userId: 'dev:device-sync',
    topicScores: { caching: { raw: 0.8, cardsReviewed: 2, daysSpanned: [] } },
    cardHistory: {},
    streaks: { current: 2, best: 2, lastDate: '2026-08-24' },
    totalSessions: 3,
    totalAnswered: 4,
    totalCorrect: 3,
    _topicCardSeen: {},
    seenScenarioFingerprints: []
  };
  const originalFetch = context.fetch;
  const originalRenderDeckStats = app.renderDeckStats;
  context.fetch = async (url, options) => {
    assert.equal(url, '/api/profile');
    assert.equal(options.headers['X-Device-Id'], 'device-sync');
    return { ok: true, status: 200, async json() {
      return { ok: true, profile: remote, clientUpdatedAt: 500, updatedAt: '2026-08-24T00:00:00.000Z' };
    } };
  };
  app.renderDeckStats = () => {};

  try {
    app.loadProfile();
    assert.equal(await app._onAccountIdentityReady(), true);
    assert.equal(app.profile.totalAnswered, 4);
    assert.equal(JSON.parse(context.localStorage.getItem('sdf_profile')).totalAnswered, 4);
  } finally {
    app._cancelProfileSync();
    context.fetch = originalFetch;
    app.renderDeckStats = originalRenderDeckStats;
    context.localStorage.values.clear();
  }
});

test('local progress migrates to KV when the remote profile is empty', async () => {
  resetApp();
  const app = context.appForTest;
  context.localStorage.setItem('sdf_device_id', 'device-migrate');
  const local = context.normalizeProfileDataForTest({
    userId: 'local-profile', topicScores: {}, cardHistory: {}, streaks: {},
    _topicCardSeen: {}, totalAnswered: 7, totalCorrect: 5
  });
  let putBody;
  const originalFetch = context.fetch;
  const originalRenderDeckStats = app.renderDeckStats;
  context.fetch = async (_url, options = {}) => {
    if (options.method === 'PUT') {
      putBody = JSON.parse(options.body);
      return { ok: true, status: 200, async json() {
        return { ok: true, ...putBody, updatedAt: '2026-08-24T00:00:00.000Z' };
      } };
    }
    return { ok: true, status: 200, async json() {
      return { ok: true, profile: null, clientUpdatedAt: 0, updatedAt: null };
    } };
  };
  app.renderDeckStats = () => {};

  try {
    app.loadProfile();
    app.profile = local;
    app._profileLocalUpdatedAt = 100;
    assert.equal(await app._onAccountIdentityReady(), true);
    app._cancelProfileSync();
    await app._flushProfileSync();
    assert.equal(putBody.profile.totalAnswered, 7);
    assert.equal(putBody.profile.userId, 'dev:device-migrate');
  } finally {
    app._cancelProfileSync();
    context.fetch = originalFetch;
    app.renderDeckStats = originalRenderDeckStats;
    context.localStorage.values.clear();
  }
});

test('a newer user-local profile is preserved when an anonymous profile is promoted', async () => {
  resetApp();
  const app = context.appForTest;
  context.localStorage.setItem('sdf_device_id', 'device-promote');
  const deviceProfile = context.normalizeProfileDataForTest({
    userId: 'device-profile', topicScores: {}, cardHistory: {}, streaks: {},
    _topicCardSeen: {}, totalAnswered: 3
  });
  const userProfile = context.normalizeProfileDataForTest({
    userId: 'user-profile', topicScores: {}, cardHistory: {}, streaks: {},
    _topicCardSeen: {}, totalAnswered: 8
  });
  let putBody;
  const originalFetch = context.fetch;
  const originalRenderDeckStats = app.renderDeckStats;
  context.fetch = async (_url, options = {}) => {
    if (options.method === 'PUT') {
      putBody = JSON.parse(options.body);
      return { ok: true, status: 200, async json() {
        return { ok: true, ...putBody, updatedAt: '2026-08-24T00:00:00.000Z' };
      } };
    }
    return { ok: true, status: 200, async json() {
      return { ok: true, profile: null, clientUpdatedAt: 0, updatedAt: null };
    } };
  };
  app.renderDeckStats = () => {};

  try {
    app.loadProfile();
    app.profile = deviceProfile;
    app._profileLocalUpdatedAt = 100;
    app._persistLocalProfile('dev:device-promote', 100);
    context.localStorage.setItem(
      app._profileStorageKey('user:user-promote'), JSON.stringify(userProfile)
    );
    context.localStorage.setItem(
      app._profileMetaKey('user:user-promote'), JSON.stringify({ clientUpdatedAt: 200 })
    );
    setAuthUser('user-promote');
    assert.equal(await app._onAccountIdentityReady(), true);
    app._cancelProfileSync();
    await app._flushProfileSync();

    assert.equal(putBody.profile.totalAnswered, 8);
  } finally {
    app._cancelProfileSync();
    context.fetch = originalFetch;
    app.renderDeckStats = originalRenderDeckStats;
    vm.runInContext('currentSession = null', context);
    context.localStorage.values.clear();
  }
});

test('profile changes persist locally before an asynchronous KV write', async () => {
  resetApp();
  const app = context.appForTest;
  context.localStorage.setItem('sdf_device_id', 'device-write');
  let putBody;
  const originalFetch = context.fetch;
  context.fetch = async (_url, options = {}) => {
    putBody = JSON.parse(options.body);
    return { ok: true, status: 200, async json() {
      return { ok: true, ...putBody, updatedAt: '2026-08-24T00:00:00.000Z' };
    } };
  };

  try {
    app.loadProfile();
    app._profileSyncReady = true;
    app.profile.totalAnswered = 9;
    app.saveProfile();
    assert.equal(JSON.parse(context.localStorage.getItem('sdf_profile')).totalAnswered, 9);
    app._cancelProfileSync();
    await app._flushProfileSync();
    assert.equal(putBody.profile.totalAnswered, 9);
  } finally {
    app._cancelProfileSync();
    context.fetch = originalFetch;
    context.localStorage.values.clear();
  }
});

test('a local profile change during a stale-write response is never replaced', async () => {
  resetApp();
  const app = context.appForTest;
  context.localStorage.setItem('sdf_device_id', 'device-conflict');
  let resolveFetch;
  const originalFetch = context.fetch;
  context.fetch = () => new Promise(resolve => { resolveFetch = resolve; });

  try {
    app.loadProfile();
    app._profileSyncReady = true;
    app.profile.totalAnswered = 1;
    app.saveProfile();
    const sync = app._flushProfileSync();
    app.profile.totalAnswered = 2;
    app.saveProfile();
    resolveFetch({ ok: false, status: 409, async json() {
      return {
        profile: context.normalizeProfileDataForTest({
          totalAnswered: 4, totalCorrect: 4, topicScores: {}, cardHistory: {},
          streaks: {}, _topicCardSeen: {}
        }),
        clientUpdatedAt: 500
      };
    } });
    await sync;

    assert.equal(app.profile.totalAnswered, 2);
    assert.ok(app._profileSyncTimer);
  } finally {
    app._cancelProfileSync();
    context.fetch = originalFetch;
    context.localStorage.values.clear();
  }
});

test('profile sync failure keeps local progress available', async () => {
  resetApp();
  const app = context.appForTest;
  context.localStorage.setItem('sdf_device_id', 'device-offline');
  const originalFetch = context.fetch;
  context.fetch = async () => { throw new Error('offline'); };
  app.renderDeckStats = () => {};

  try {
    app.loadProfile();
    app.profile.totalAnswered = 11;
    app.saveProfile();
    app._cancelProfileSync();
    assert.equal(await app._onAccountIdentityReady(), false);
    assert.equal(app.profile.totalAnswered, 11);
    assert.equal(JSON.parse(context.localStorage.getItem('sdf_profile')).totalAnswered, 11);
  } finally {
    app._cancelProfileSync();
    context.fetch = originalFetch;
    context.localStorage.values.clear();
  }
});

test('seen ledgers persist per profile and prefetch does not mark cards seen', async () => {
  // Arrange
  resetApp();
  const app = context.appForTest;
  const displayed = generatedCard('displayed', 'Displayed scenario');
  const prefetched = generatedCard('prefetched', 'Prefetched scenario');
  context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify({ cards: [prefetched] }));

  // Act
  await app.fetchCard('caching', 3);
  app._recordDisplayedScenario(displayed);
  const savedProfileA = JSON.parse(context.localStorage.getItem('sdf_profile'));
  app.profile = context.normalizeProfileDataForTest({
    userId: 'profile-b', topicScores: {}, cardHistory: {}, streaks: {}, _topicCardSeen: {}
  });

  // Assert
  assert.deepEqual(savedProfileA.seenScenarioFingerprints, [app._scenarioFingerprint(displayed.scenario)]);
  assert.deepEqual([...app.profile.seenScenarioFingerprints], []);
  assert.equal(savedProfileA.seenScenarioFingerprints.includes(app._scenarioFingerprint(prefetched.scenario)), false);
});

test('distinct generated IDs remain separate card history entries', () => {
  // Arrange
  resetApp();
  const app = context.appForTest;

  // Act
  app.saveCardReview('generated-1', { timesReviewed: 1 });
  app.saveCardReview('generated-2', { timesReviewed: 1 });

  // Assert
  assert.deepEqual(Object.keys(app.profile.cardHistory).sort(), ['generated-1', 'generated-2']);
});

function installRegenerateDom() {
  const button = { disabled: false, textContent: '🔄 Regenerate', nextSibling: null,
    classList: { add() {}, remove() {}, contains() { return false; } } };
  const parent = { child: null, insertBefore(child) { parent.child = child; } };
  button.parentNode = parent;
  const created = [];
  const originalDocument = context.document;
  const originalShowCard = context.appForTest.showCard;
  context.document = {
    addEventListener() {},
    getElementById(id) {
      if (id === 'regenerate-btn') return button;
      if (id === 'regenerate-status') return created[0] || null;
      return null;
    },
    createElement() {
      const el = { id: '', textContent: '', style: {}, setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k]; } };
      created.push(el);
      return el;
    },
    body: { appendChild() {} }
  };
  return {
    button, created, parent,
    restore() { context.document = originalDocument; context.appForTest.showCard = originalShowCard; }
  };
}

function setSession(app, cards) {
  app.sessionCards = cards;
  app.sessionIndex = 0;
  app.currentCard = cards[0];
}

test('regenerate forces fresh generation with current, session, and profile exclusions, bypassing pools', async () => {
  resetApp();
  const app = context.appForTest;
  const dom = installRegenerateDom();
  try {
    const current = generatedCard('current', 'Current scenario');
    const other = generatedCard('other', 'Other session scenario');
    const fresh = generatedCard('fresh', 'Fresh distinct scenario');
    app.profile.seenScenarioFingerprints = [app._scenarioFingerprint('Profile scenario')];
    context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify({ cards: [generatedCard('pool', 'Pooled scenario')] }));
    app._cardCache['caching:3'] = { cards: [generatedCard('memory', 'Memory scenario')] };
    setSession(app, [current, other]);
    let requestUrl;
    context.fetch = async url => {
      requestUrl = new URL(url, 'https://example.com');
      return { ok: true, async json() { return { card: fresh }; } };
    };
    app.showCard = () => { app.currentCard = app.sessionCards[app.sessionIndex]; app._recordDisplayedScenario(app.currentCard); };

    await app.regenerateCard();

    assert.equal(requestUrl.searchParams.get('force'), '1');
    assert.deepEqual(requestUrl.searchParams.getAll('exclude').sort(), [
      app._scenarioFingerprint(current.scenario),
      app._scenarioFingerprint(other.scenario),
      app._scenarioFingerprint('Profile scenario')
    ].sort());
    assert.deepEqual(app.sessionCards.map(c => c.id), ['fresh', 'other']);
    assert.equal(app.currentCard.id, 'fresh');
    assert.equal(JSON.parse(context.localStorage.getItem('sdf_gen_caching:3')).cards.map(c => c.id).includes('fresh'), true);
    assert.equal(app.profile.seenScenarioFingerprints.includes(app._scenarioFingerprint(fresh.scenario)), true);
    assert.equal(dom.button.disabled, false);
    assert.equal(dom.button.textContent, '🔄 Regenerate');
  } finally {
    dom.restore();
  }
});

test('regenerate failures retain the current card, session slot, and seen ledger, and restore the control', async () => {
  resetApp();
  const app = context.appForTest;
  const dom = installRegenerateDom();
  try {
    const current = generatedCard('current', 'Current scenario');
    const other = generatedCard('other', 'Other session scenario');
    const cases = [
      ['http error', async () => ({ ok: false, status: 500, async json() { return { error: 'unavailable' }; } })],
      ['network failure', async () => { throw new TypeError('network down'); }],
      ['timeout', async () => { throw new Error('aborted'); }],
      ['malformed payload', async () => ({ ok: true, async json() { return {}; } })],
      ['duplicate response', async () => ({ ok: true, async json() { return { card: generatedCard('dup', current.scenario) }; } })],
      ['unconfigured generation', async () => ({ ok: false, status: 500, async json() { return { error: 'not configured' }; } })]
    ];
    for (const [name, fetchImpl] of cases) {
      setSession(app, [current, other]);
      app.profile.seenScenarioFingerprints = ['profile-seen-fp'];
      context.fetch = fetchImpl;
      await app.regenerateCard();
      assert.equal(app.currentCard.id, 'current', name);
      assert.deepEqual(app.sessionCards.map(c => c.id), ['current', 'other'], name);
      assert.deepEqual(app.profile.seenScenarioFingerprints, ['profile-seen-fp'], name);
      assert.equal(dom.button.disabled, false, name);
      assert.equal(dom.button.textContent, '🔄 Regenerate', name);
    }
  } finally {
    dom.restore();
  }
});

test('forced regenerate never falls back to a seed and announces retry in an aria-live region', async () => {
  resetApp();
  const app = context.appForTest;
  const dom = installRegenerateDom();
  context.SEED_CARDS.push(generatedCard('seed', 'Offline seed scenario'));
  try {
    const current = generatedCard('current', 'Current scenario');
    context.localStorage.setItem('sdf_gen_caching:3', JSON.stringify({ cards: [generatedCard('cached', 'Cached scenario')] }));
    context.fetch = async () => { throw new Error('offline'); };
    setSession(app, [current]);

    await app.regenerateCard();

    assert.equal(app.currentCard.id, 'current');
    const status = dom.created[0];
    assert.equal(status.getAttribute('role'), 'status');
    assert.equal(dom.parent.child, status);
    assert.match(status.textContent, /Fresh generation is unavailable.*try again/);
  } finally {
    context.SEED_CARDS.pop();
    dom.restore();
  }
});

test('regenerate guards concurrency and disables the control while in flight', async () => {
  resetApp();
  const app = context.appForTest;
  const dom = installRegenerateDom();
  try {
    const current = generatedCard('current', 'Current scenario');
    const fresh = generatedCard('fresh', 'Fresh distinct scenario');
    let requests = 0;
    let resolveFetch;
    context.fetch = () => {
      requests++;
      return new Promise(resolve => { resolveFetch = resolve; });
    };
    app.showCard = () => {};
    setSession(app, [current]);

    const first = app.regenerateCard();
    const second = app.regenerateCard();
    assert.equal(requests, 1);
    assert.equal(dom.button.disabled, true);
    assert.equal(dom.button.textContent, '⏳ Generating...');

    resolveFetch({ ok: true, async json() { return { card: fresh }; } });
    await Promise.all([first, second]);

    assert.equal(requests, 1);
    assert.equal(app.currentCard.id, 'fresh');
    assert.deepEqual(app.sessionCards.map(c => c.id), ['fresh']);
    assert.equal(dom.button.disabled, false);
    assert.equal(dom.button.textContent, '🔄 Regenerate');
  } finally {
    dom.restore();
  }
});

test('regenerate restores the control when an unexpected exception escapes', async () => {
  resetApp();
  const app = context.appForTest;
  const dom = installRegenerateDom();
  try {
    const current = generatedCard('current', 'Current scenario');
    context.fetch = async () => ({ ok: true, async json() { return { card: generatedCard('fresh', 'Fresh distinct scenario') }; } });
    app.showCard = () => { throw new Error('render failed'); };
    setSession(app, [current]);

    await assert.rejects(() => app.regenerateCard(), /render failed/);

    assert.equal(dom.button.disabled, false);
    assert.equal(dom.button.textContent, '🔄 Regenerate');
    assert.equal(app._regenerating, false);
  } finally {
    dom.restore();
  }
});
