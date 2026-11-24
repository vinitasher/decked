import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const gameSource = await readFile(new URL('../js/game.js', import.meta.url), 'utf8');
const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

const G = {};
vm.createContext(G);
vm.runInContext(`${gameSource}
Object.assign(globalThis, { GAME_XP, GAME_QUESTS, emptyGameState, normalizeGameState, pruneGameState,
  comboMultiplier, xpForEvent, awardGameXp, xpToday, xpThisWeek, deriveConceptStars, updateConceptStars,
  dailyQuestIds, ensureDailyQuests, advanceQuests, questDefinition, recommendNextConcept, backfillGameState,
  parseConceptName, isCustomConcept, addCustomConcept, MY_CONCEPTS_WORLD });`, G);

const plain = value => JSON.parse(JSON.stringify(value));

test('correct answers earn 10 XP per difficulty and wrong answers earn 2', () => {
  assert.equal(G.xpForEvent({ type: 'answer', correct: true, difficulty: 3 }), 30);
  assert.equal(G.xpForEvent({ type: 'answer', correct: true, difficulty: 9 }), 50);
  assert.equal(G.xpForEvent({ type: 'answer', correct: false, difficulty: 5 }), 2);
  assert.equal(G.xpForEvent({ type: 'prediction', correct: true }), 15);
  assert.equal(G.xpForEvent({ type: 'prediction', correct: false }), 0);
  assert.equal(G.xpForEvent({ type: 'situation', level: 4 }), 40);
  assert.equal(G.xpForEvent({ type: 'quest' }), 50);
  assert.equal(G.xpForEvent({ type: 'unknown' }), 0);
});

test('combo multiplier starts at three in a row and caps at x2', () => {
  assert.deepEqual([0, 2, 3, 4, 5, 50].map(G.comboMultiplier), [1, 1, 1.5, 1.5, 2, 2]);
  assert.equal(G.xpForEvent({ type: 'answer', correct: true, difficulty: 2, consecutiveCorrect: 3 }), 30);
  assert.equal(G.xpForEvent({ type: 'answer', correct: true, difficulty: 2, consecutiveCorrect: 12 }), 40);
});

test('XP is awarded at most once per event key', () => {
  const game = G.emptyGameState();
  assert.equal(G.awardGameXp(game, 'answer:c1:1', 30, '2026-11-24'), 30);
  assert.equal(G.awardGameXp(game, 'answer:c1:1', 30, '2026-11-24'), 0);
  assert.equal(G.awardGameXp(game, 'answer:c1:2', 30, '2026-11-24'), 30);
  assert.equal(game.xp.total, 60);
  assert.equal(G.xpToday(game, '2026-11-24'), 60);
});

test('pruning keeps lifetime XP and drops days outside the 14-day window', () => {
  const game = G.emptyGameState();
  G.awardGameXp(game, 'old', 10, '2026-11-01');
  G.awardGameXp(game, 'recent', 20, '2026-11-20');
  G.pruneGameState(game, '2026-11-24');
  assert.equal(game.xp.total, 30);
  assert.deepEqual(Object.keys(game.xp.byDay), ['2026-11-20']);
  assert.deepEqual(Object.keys(game.awarded), ['recent']);
  assert.equal(G.xpThisWeek(game, '2026-11-24'), 20);
});

test('stars follow read, tested, and mastered rules', () => {
  assert.equal(G.deriveConceptStars({}), 0);
  assert.equal(G.deriveConceptStars({ read: true }), 1);
  assert.equal(G.deriveConceptStars({ correctDrills: 1 }), 1);
  assert.equal(G.deriveConceptStars({ clearedLevelSets: [[1, 2]] }), 0);
  assert.equal(G.deriveConceptStars({ clearedLevelSets: [[1, 2], [1, 2, 3]] }), 2);
  assert.equal(G.deriveConceptStars({ clearedLevelSets: [[1, 2, 3, 4, 5]], correctDrills: 1 }), 2);
  assert.equal(G.deriveConceptStars({ clearedLevelSets: [[1, 2, 3, 4, 5]], correctDrills: 2 }), 3);
});

test('stars never go down', () => {
  const game = G.emptyGameState();
  assert.deepEqual(plain(G.updateConceptStars(game, 'caching', 2)), { previous: 0, stars: 2 });
  assert.deepEqual(plain(G.updateConceptStars(game, 'caching', 1)), { previous: 2, stars: 2 });
  assert.equal(game.stars.caching, 2);
});

test('daily quests are deterministic, distinct, and always include a short quest', () => {
  for (let day = 1; day <= 60; day++) {
    const date = new Date(Date.UTC(2026, 10, day)).toISOString().slice(0, 10);
    for (const seed of ['', 'device-a', 'user-b']) {
      const ids = G.dailyQuestIds(date, seed);
      assert.deepEqual(plain(ids), plain(G.dailyQuestIds(date, seed)));
      assert.equal(new Set(ids).size, 3);
      assert.ok(ids.some(id => G.questDefinition(id).short), `${date}/${seed} has no short quest`);
    }
  }
});

test('quests advance on matching events and award quest XP once', () => {
  const game = G.emptyGameState();
  const today = '2026-11-24';
  G.ensureDailyQuests(game, today, 'seed');
  const target = game.quests.items[0];
  const quest = G.questDefinition(target.id);
  let completed = [];
  for (let i = 0; i < quest.target; i++) completed = G.advanceQuests(game, quest.event, 1, today, 'seed');
  assert.equal(completed.length >= 1, true);
  assert.equal(game.quests.items[0].done, true);
  const xpAfter = game.xp.total;
  assert.deepEqual(plain(G.advanceQuests(game, quest.event, 1, today, 'seed')).filter(item => item.id === quest.id), []);
  assert.equal(game.xp.total, xpAfter);
  assert.ok(xpAfter >= 50);
});

test('quests reset on a new day', () => {
  const game = G.emptyGameState();
  G.ensureDailyQuests(game, '2026-11-24', 's');
  game.quests.items[0].progress = 1;
  G.ensureDailyQuests(game, '2026-11-25', 's');
  assert.equal(game.quests.date, '2026-11-25');
  assert.ok(game.quests.items.every(item => item.progress === 0));
});

test('recommended concept prefers in-progress, then ready new concepts, and never returns locked state', () => {
  const order = ['dns', 'caching', 'sharding'];
  const prereqs = topic => ({ caching: ['dns'], sharding: ['caching'] }[topic] || []);
  assert.equal(G.recommendNextConcept(order, {}, prereqs), 'dns');
  assert.equal(G.recommendNextConcept(order, { dns: 3 }, prereqs), 'caching');
  assert.equal(G.recommendNextConcept(order, { dns: 3, sharding: 1 }, prereqs), 'sharding');
  assert.equal(G.recommendNextConcept(order, { dns: 3, caching: 3, sharding: 3 }, prereqs), null);
});

test('normalization repairs malformed game state', () => {
  const game = G.normalizeGameState({
    xp: { total: -5, byDay: { bad: 4, '2026-11-24': 'x', '2026-11-23': 12 } },
    stars: { caching: 9, 'Bad Topic': 2, dns: 0 },
    readTopics: ['dns', 'dns', 7],
    clearedSituations: { 'redis-cache': [1, 1, 3, 8] },
    quests: { date: '2026-11-24', items: [{ id: 'correct-5', progress: 99 }, { id: 'nope' }] },
    customConcepts: [{ topic: 'bloom-filters' }, { topic: 'Bad' }]
  });
  assert.equal(game.xp.total, 0);
  assert.deepEqual(plain(game.xp.byDay), { '2026-11-23': 12 });
  assert.deepEqual(plain(game.stars), { caching: 3 });
  assert.deepEqual(plain(game.readTopics), ['dns']);
  assert.deepEqual(plain(game.clearedSituations), { 'redis-cache': [1, 3] });
  assert.deepEqual(plain(game.quests.items), [{ id: 'correct-5', progress: 5, target: 5, done: true }]);
  assert.deepEqual(plain(game.customConcepts), [{ topic: 'bloom-filters', title: null, addedAt: null, hasStarterCard: false }]);
  assert.deepEqual(plain(G.normalizeGameState(null)), plain(G.emptyGameState()));
});

test('back-fill gives returning learners a star per practiced topic and starting XP, once', () => {
  const profile = {
    totalCorrect: 7,
    topicScores: { caching: { cardsReviewed: 3 }, dns: { cardsReviewed: 0 } },
    topicAccuracy: { caching: [{ correct: true }, { correct: false }, { correct: true }] }
  };
  const game = G.backfillGameState(G.emptyGameState(), profile, '2026-11-24');
  assert.deepEqual(plain(game.stars), { caching: 1 });
  assert.equal(game.correctByTopic.caching, 2);
  assert.equal(game.xp.total, 70);
  G.backfillGameState(game, profile, '2026-11-24');
  assert.equal(game.xp.total, 70);
});

/* ——— App integration ——— */

function createApp() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const values = new Set();
      elements.set(id, {
        id, textContent: '', innerHTML: '', className: '', style: {},
        classList: { add: v => values.add(v), remove: v => values.delete(v), contains: v => values.has(v), toggle() {} }
      });
    }
    return elements.get(id);
  };
  const store = new Map();
  const context = {
    window: { location: { hostname: 'example.com', hash: '' } },
    URLSearchParams,
    document: {
      addEventListener() {},
      getElementById: element,
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key)
    },
    fetch() { throw new Error('network should not be called'); },
    Render: { diagram() {} },
    console,
    setTimeout() {},
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(`${cardsSource}
${srsSource}
${gameSource}
${appSource}
globalThis.appForTest = APP;`, context);
  const app = Object.create(context.appForTest);
  app.profile = {
    userId: 'tester', topicScores: {}, cardHistory: {}, streaks: { current: 2, best: 2, lastDate: null },
    totalSessions: 0, totalAnswered: 0, totalCorrect: 0, _topicCardSeen: {}, sandbox: {}
  };
  app.saveProfile = () => {};
  app._consecutiveCorrect = 0;
  return { app, element };
}

test('answers award XP with combo, count correct drills, and advance quests', () => {
  const { app } = createApp();
  const card = { id: 'c1', topic: 'caching', difficulty: 2 };
  app._consecutiveCorrect = 1;
  assert.equal(app._gameRecordAnswer(card, true, 1), 20);
  assert.equal(app._gameRecordAnswer(card, true, 1), 0, 'same review is not re-awarded');
  app._consecutiveCorrect = 3;
  assert.equal(app._gameRecordAnswer({ ...card, id: 'c2' }, true, 1), 30);
  assert.equal(app._gameRecordAnswer({ ...card, id: 'c3' }, false, 1), 2);
  const game = app._game();
  assert.equal(game.correctByTopic.caching, 2);
  assert.equal(game.stars.caching, 1);
  assert.ok(app._sessionXp >= 52);
});

test('sandbox runs clear situations once and earn stars on the mapped concept', () => {
  const { app } = createApp();
  const node = { id: 'redis-cache', situations: [1, 2, 3].map(level => ({ id: `s${level}`, level })) };
  app._sandboxModelIdsForTopic = topic => topic === 'caching' ? ['redis-cache'] : [];
  assert.equal(app._gameRecordSandboxRun(node, 's1', false), 0);
  const first = app._gameRecordSandboxRun(node, 's1', true);
  assert.equal(first, 15 + 10);
  assert.equal(app._gameRecordSandboxRun(node, 's1', true), 0, 'same situation on the same day earns nothing more');
  app._gameRecordSandboxRun(node, 's2', true);
  app._activeWikiTopic = 'caching';
  app._gameRecordSandboxRun(node, 's3', true);
  assert.deepEqual(plain(app._game().clearedSituations['redis-cache']), [1, 2, 3]);
  assert.equal(app.conceptStars('caching'), 2);
});

test('opening an explanation earns the first star', () => {
  const { app } = createApp();
  app._gameMarkRead('dns');
  assert.equal(app.conceptStars('dns'), 1);
  app._gameMarkRead('Not A Topic');
  assert.equal(app.conceptStars('Not A Topic'), 0);
});

test('the home HUD renders rank, XP, streak, and three quests', () => {
  const { app, element } = createApp();
  app._conceptEntries = () => [];
  app.renderGameHud();
  assert.equal(element('game-hud').classList.contains('hidden'), false);
  assert.match(element('game-rank').textContent, /^Rank 1 · Foundations$/);
  assert.match(element('game-xp-today').textContent, /^0 XP today$/);
  assert.match(element('game-streak').textContent, /2-day streak/);
  assert.equal((element('game-quests').innerHTML.match(/<li class="game-quest/g) || []).length, 3);
});

test('the home screen and offline shell load the game module', () => {
  assert.match(html, /<script src="js\/game\.js"><\/script>[\s\S]*<script src="js\/app\.js"><\/script>/);
  assert.match(html, /id="game-hud"/);
  assert.match(html, /id="play-btn"[^>]*onclick="APP\.play\(\)"/);
  assert.match(html, /id="game-quests"/);
  assert.match(html, /id="concept-recommended"/);
  assert.match(html, /More: progress, stats &amp; tools/);
  assert.match(serviceWorker, /'\/js\/game\.js'/);
});
