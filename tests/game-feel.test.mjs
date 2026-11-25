import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const gameSource = await readFile(new URL('../js/game.js', import.meta.url), 'utf8');
const fxSource = await readFile(new URL('../js/fx.js', import.meta.url), 'utf8');
const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

const plain = value => JSON.parse(JSON.stringify(value));

function loadGame() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${gameSource}
globalThis.G = { emptyGameState, normalizeGameState, comboTier, xpForEvent, grantLifeline, spendLifeline,
  comboEarnsLifeline, pickStrikeOption, sessionGrade, bestComboOf, advanceQuests, dailyQuestIds, GAME_MAX_LIFELINES };`, context);
  return context.G;
}

function createApp({ withFx = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const values = new Set(['hidden']);
      elements.set(id, {
        id, textContent: '', innerHTML: '', className: '', style: {}, value: '', disabled: false,
        classList: { add: v => values.add(v), remove: v => values.delete(v), contains: v => values.has(v), toggle() {} }
      });
    }
    return elements.get(id);
  };
  const context = {
    window: { location: { hostname: 'example.com', hash: '' } },
    URLSearchParams,
    document: { addEventListener() {}, getElementById: element, querySelector() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
${withFx ? fxSource : ''}
const WIKI = {};
${appSource}
globalThis.appForTest = APP;`, context);
  const app = Object.create(context.appForTest);
  app.profile = {
    userId: 'tester', topicScores: {}, cardHistory: {}, streaks: { current: 0, best: 0, lastDate: null },
    totalSessions: 0, totalAnswered: 0, totalCorrect: 0, _topicCardSeen: {}, sandbox: {}
  };
  app.saveProfile = () => {};
  return { app, element, context };
}

test('the combo meter reports progress toward the next multiplier', () => {
  const G = loadGame();
  assert.deepEqual(plain(G.comboTier(0)), { streak: 0, multiplier: 1, next: 1.5, toNext: 3, progress: 0 });
  assert.deepEqual(plain(G.comboTier(2)), { streak: 2, multiplier: 1, next: 1.5, toNext: 1, progress: 2 / 3 });
  assert.deepEqual(plain(G.comboTier(4)), { streak: 4, multiplier: 1.5, next: 2, toNext: 1, progress: 0.5 });
  assert.deepEqual(plain(G.comboTier(9)), { streak: 9, multiplier: 2, next: null, toNext: 0, progress: 1 });
});

test('a Strike-assisted correct answer earns half XP', () => {
  const G = loadGame();
  assert.equal(G.xpForEvent({ type: 'answer', correct: true, difficulty: 3 }), 30);
  assert.equal(G.xpForEvent({ type: 'answer', correct: true, difficulty: 3, assisted: true }), 15);
  assert.equal(G.xpForEvent({ type: 'answer', correct: true, difficulty: 3, consecutiveCorrect: 5, assisted: true }), 30);
});

test('Strikes start at one, cap at three, and survive normalization', () => {
  const G = loadGame();
  const game = G.emptyGameState();
  assert.equal(game.lifelines, 1);
  assert.equal(G.grantLifeline(game), true);
  assert.equal(G.grantLifeline(game), true);
  assert.equal(G.grantLifeline(game), false);
  assert.equal(game.lifelines, G.GAME_MAX_LIFELINES);
  assert.equal(G.normalizeGameState({ lifelines: 2 }).lifelines, 2);
  assert.equal(G.normalizeGameState({ lifelines: 0 }).lifelines, 0);
  assert.equal(G.normalizeGameState({ lifelines: 99 }).lifelines, 3);
  assert.equal(G.normalizeGameState({ lifelines: 'x' }).lifelines, 0);
  assert.equal(G.normalizeGameState({}).lifelines, 1);
  game.lifelines = 1;
  assert.equal(G.spendLifeline(game), true);
  assert.equal(G.spendLifeline(game), false);
});

test('five-answer combos and completed quests earn Strikes', () => {
  const G = loadGame();
  assert.equal(G.comboEarnsLifeline(4), false);
  assert.equal(G.comboEarnsLifeline(5), true);
  assert.equal(G.comboEarnsLifeline(10), true);
  assert.equal(G.comboEarnsLifeline(0), false);
  const game = G.emptyGameState();
  game.lifelines = 0;
  const date = '2026-11-25';
  const ids = G.dailyQuestIds(date, 'seed');
  const eventFor = { 'finish-session': ['session', 1], 'correct-5': ['correct', 5], 'combo-3': ['combo3', 1],
    'clear-situation': ['situation', 1], 'predict-3': ['prediction', 3], 'new-star': ['newStar', 1] };
  const [event, amount] = eventFor[ids[0]];
  const completed = G.advanceQuests(game, event, amount, date, 'seed');
  assert.ok(completed.length >= 1);
  assert.equal(completed[0].lifeline, true);
  assert.equal(game.lifelines, completed.length);
});

test('a Strike removes a wrong option but always leaves one', () => {
  const G = loadGame();
  const options = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
  assert.equal(G.pickStrikeOption(options, 'B', [], () => 0), 'A');
  assert.equal(G.pickStrikeOption(options, 'B', ['A'], () => 0.99), 'D');
  assert.equal(G.pickStrikeOption(options, 'B', ['A', 'C'], () => 0), null);
  assert.equal(G.pickStrikeOption([{ id: 'A' }, { id: 'B' }], 'A', [], () => 0), null);
});

test('session grades reward accuracy and S needs a perfect run of five', () => {
  const G = loadGame();
  assert.equal(G.sessionGrade(0, 0), null);
  assert.equal(G.sessionGrade(5, 5).grade, 'S');
  assert.equal(G.sessionGrade(3, 3).grade, 'A');
  assert.equal(G.sessionGrade(8, 7).grade, 'A');
  assert.equal(G.sessionGrade(10, 7).grade, 'B');
  assert.equal(G.sessionGrade(10, 5).grade, 'C');
  assert.equal(G.sessionGrade(10, 2).grade, 'D');
  assert.equal(G.bestComboOf([{ correct: true }, { correct: true }, { correct: false }, { correct: true }]), 2);
  assert.equal(G.bestComboOf([]), 0);
});

test('using a Strike crosses out a wrong option, spends it, and halves the answer XP', () => {
  const { app } = createApp();
  const card = { id: 'card-1', topic: 'caching', difficulty: 4, correct: 'B', options: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }] };
  const buttons = card.options.map(() => {
    const classes = new Set();
    return { disabled: false, classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v) }, setAttribute() {} };
  });
  app.currentCard = card;
  app._displayedOptions = card.options;
  app._optionButtons = buttons;
  app._selectedId = null;
  app._struckOptions = [];
  app._assisted = false;
  const game = app._game();
  assert.equal(game.lifelines, 1);
  assert.equal(app.useStrike(), true);
  assert.equal(game.lifelines, 0);
  assert.equal(app._struckOptions.length, 1);
  assert.notEqual(app._struckOptions[0], 'B');
  const struck = buttons[card.options.findIndex(option => option.id === app._struckOptions[0])];
  assert.equal(struck.disabled, true);
  assert.equal(struck.classList.contains('is-struck'), true);
  assert.equal(app.useStrike(), false, 'no Strikes left');
  app._consecutiveCorrect = 1;
  assert.equal(app._gameRecordAnswer(card, true, 1), 20);
});

test('fx.js is a safe no-op without a real DOM', () => {
  const { app, element } = createApp({ withFx: true });
  app.sessionCards = [{ id: 'a' }, { id: 'b' }, { id: 'c', retry: true }];
  app.sessionIndex = 1;
  app._sessionAttempts = [{ correct: true }];
  app._consecutiveCorrect = 4;
  assert.doesNotThrow(() => {
    app._gameAnswerFx(true, 30, 3);
    app._sandboxRunFx(true, 15, 3);
    app._bossHeartLostFx();
    app._sessionResultsFx({ answered: 5, correct: 5 });
  });
  assert.match(element('session-pips').innerHTML, /is-correct[\s\S]*is-current[\s\S]*is-retry/);
  assert.match(element('combo-meter').innerHTML, /🔥 4 · ×1\.5/);
  assert.match(element('combo-meter').innerHTML, /1 more for ×2/);
  assert.match(element('combo-meter').className, /heat-2/);
});

test('the session screen has the combo meter, run pips, and Strike button', () => {
  assert.match(html, /id="session-pips"/);
  assert.match(html, /id="combo-meter"/);
  assert.match(html, /id="strike-btn"[^>]*onclick="APP\.useStrike\(\)"/);
  assert.match(html, /id="game-strikes"/);
  assert.match(html, /<script src="js\/game\.js"><\/script>\s*<script src="js\/fx\.js"><\/script>/);
  assert.match(serviceWorker, /'\/js\/fx\.js'/);
});

test('the session summary keeps the game results above the card review', () => {
  const { app, element, context } = createApp();
  const card = { id: 'c1', topic: 'caching', scenario: 'A cache question', correct: 'B', difficulty: 2, options: [] };
  app._sessionAttempts = [{ card, correct: true, confidence: 2 }];
  app.sessionCards = [card];
  app._sessionXp = 20;
  app._mistakesHtml = () => '';
  app.showScreen = () => {};
  app._stopTimer = () => {};
  app._saveSession = () => {};
  app.renderDeckStats = () => {};
  app._invalidatePrefetch = () => {};
  app._resumeStorageKey = () => 'resume';
  app._boss = { world: 'Caching', model: 'social-feed', hearts: 2, stage: 'cards' };
  app.endSession();
  const html = element('session-summary').innerHTML;
  assert.match(html, /startBossFinale/, 'the boss finale button survives the review');
  assert.match(html, /game-grade/);
  assert.match(html, /cards answered/);
  assert.ok(html.indexOf('game-grade') < html.indexOf('cards answered'));
});
