import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const gameSource = await readFile(new URL('../js/game.js', import.meta.url), 'utf8');
const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const plain = value => JSON.parse(JSON.stringify(value));

function createApp() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const values = new Set();
      elements.set(id, {
        id, textContent: '', innerHTML: '', className: '', style: {}, value: '',
        classList: { add: v => values.add(v), remove: v => values.delete(v), contains: v => values.has(v), toggle() {} }
      });
    }
    return elements.get(id);
  };
  const store = new Map();
  const context = {
    window: { location: { hostname: 'example.com', hash: '' } },
    URLSearchParams,
    document: { addEventListener() {}, getElementById: element, querySelector() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
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
const WIKI = {
  caching: { topic: 'caching', title: 'Caching', related_topics: [] },
  'cache-aside': { topic: 'cache-aside', title: 'Cache Aside', related_topics: [] }
};
function conceptCategory(topic) { return 'Caching'; }
const BOSS_NODE = { id: 'social-feed', label: 'Social feed', situations: [1, 2, 3, 4, 5].map(level => ({ id: 'feed-' + level, level, values: {} })), normalize: values => values };
function getSandboxNode() { return BOSS_NODE; }
${appSource}
globalThis.appForTest = APP;`, context);
  const app = Object.create(context.appForTest);
  app.profile = {
    userId: 'tester', topicScores: {}, cardHistory: {}, streaks: { current: 0, best: 0, lastDate: null },
    totalSessions: 0, totalAnswered: 0, totalCorrect: 0, _topicCardSeen: {}, sandbox: {}
  };
  app.saveProfile = () => {};
  app._canPractice = () => true;
  app._startTimer = () => {};
  app.showCard = () => {};
  app.showScreen = () => {};
  app.renderSandbox = () => {};
  app.showSandbox = () => {};
  return { app, element, context };
}

test('missed cards become rematches once and a correct answer resolves them', () => {
  const { context } = createApp();
  const game = context.emptyGameState();
  assert.equal(context.addRematch(game, { id: 'c1', topic: 'caching' }, '2026-11-24'), true);
  assert.equal(context.addRematch(game, { id: 'c1', topic: 'caching' }, '2026-11-24'), false);
  assert.deepEqual(plain(game.rematches), [{ cardId: 'c1', topic: 'caching', addedAt: '2026-11-24' }]);
  assert.equal(context.resolveRematch(game, 'c1'), true);
  assert.equal(context.resolveRematch(game, 'c1'), false);
  for (let i = 0; i < 40; i++) context.addRematch(game, { id: `c${i}`, topic: 'caching' });
  assert.equal(game.rematches.length, 30);
  assert.equal(game.rematches[0].cardId, 'c10');
});

test('a boss appears at half the world with two stars', () => {
  const { context } = createApp();
  assert.deepEqual(plain(context.bossProgress(['a', 'b', 'c'], { a: 2 })), { tested: 1, needed: 2, total: 3, available: false });
  assert.equal(context.bossProgress(['a', 'b', 'c'], { a: 2, b: 3 }).available, true);
  assert.equal(context.bossProgress([], {}).available, false);
  assert.equal(context.bossHeartsAfter(2, false), 1);
  assert.equal(context.bossHeartsAfter(0, false), 0);
  assert.equal(context.bossHeartsAfter(2, true), 2);
});

test('boss XP is awarded on the first clear only and the best hearts are kept', () => {
  const { context } = createApp();
  const game = context.emptyGameState();
  assert.equal(context.recordBossResult(game, 'Caching', 0, false, '2026-11-24'), 0);
  assert.equal(context.recordBossResult(game, 'Caching', 1, true, '2026-11-24'), 250);
  assert.equal(context.recordBossResult(game, 'Caching', 3, true, '2026-11-25'), 0);
  assert.deepEqual(plain(game.bosses.Caching), { bestHearts: 3, clearedAt: '2026-11-24', attempts: 3 });
  assert.equal(game.xp.total, 250);
  assert.equal(context.recordBossResult(game, 'Not a world', 3, true), 0);
});

test('boss and rematch state is normalized', () => {
  const { context } = createApp();
  const game = context.normalizeGameState({
    bosses: { Caching: { bestHearts: 9, clearedAt: 'nope', attempts: 2 }, Atlantis: { bestHearts: 1 } },
    rematches: [{ cardId: 'a', topic: 'caching', addedAt: '2026-11-24' }, { cardId: 'a' }, { cardId: '' }, 'x']
  });
  assert.deepEqual(plain(game.bosses), { Caching: { bestHearts: 3, clearedAt: null, attempts: 2 } });
  assert.deepEqual(plain(game.rematches), [{ cardId: 'a', topic: 'caching', addedAt: '2026-11-24' }]);
});

test('answers add and resolve rematches, and rematch sessions replay the missed card', () => {
  const { app } = createApp();
  const card = app._bundledPracticeCards()[0];
  app.profile.cardHistory[card.id] = { card };
  app._gameAfterAnswer(card, false);
  assert.equal(app._game().rematches.length, 1);
  assert.equal(app.startRematch(), true);
  assert.equal(app.sessionCards.length, 1);
  assert.equal(app.sessionCards[0].id, card.id);
  assert.equal(app.sessionCards[0].retry, true);
  app._gameAfterAnswer(card, true);
  assert.equal(app._game().rematches.length, 0);
  assert.equal(app.startRematch(), false);
});

test('a boss run costs a heart per miss and ends when hearts run out', () => {
  const { app, element } = createApp();
  app._boss = { world: 'Caching', model: 'social-feed', hearts: 3, stage: 'cards' };
  app.sessionCards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  app.sessionIndex = 0;
  app._gameAfterAnswer({ id: 'a', topic: 'caching' }, false);
  assert.equal(app._boss.hearts, 2);
  assert.match(element('boss-hearts').textContent, /Caching boss · ❤❤♡/);
  app._maybeScheduleRetry({ id: 'a', topic: 'caching' });
  assert.equal(app.sessionCards.length, 4, 'boss runs never append retries');
  app.sessionIndex = 1;
  app._gameAfterAnswer({ id: 'b', topic: 'caching' }, false);
  app._gameAfterAnswer({ id: 'b', topic: 'caching' }, false);
  assert.equal(app._boss.hearts, 0);
  assert.equal(app.sessionCards.length, 2);
  const summary = app._bossSessionEndHtml();
  assert.match(summary, /Out of hearts/);
  assert.equal(app._boss, null);
  assert.equal(app._game().bosses.Caching.attempts, 1);
});

test('surviving the cards leads to a level-4 finale that clears the boss once', () => {
  const { app, element, context } = createApp();
  app._boss = { world: 'Caching', model: 'social-feed', hearts: 2, stage: 'cards' };
  assert.match(app._bossSessionEndHtml(), /Start the final situation/);
  assert.equal(app.startBossFinale(), true);
  assert.equal(app._sandboxState.situationId, 'feed-4');
  const node = context.getSandboxNode();
  app._bossAfterSandboxRun(node, 'feed-2', false);
  assert.equal(app._boss.hearts, 2, 'easier situations do not count for the finale');
  app._bossAfterSandboxRun(node, 'feed-4', false);
  assert.equal(app._boss.hearts, 1);
  app._bossAfterSandboxRun(node, 'feed-4', true);
  assert.match(element('boss-status').innerHTML, /Caching boss cleared with ❤♡♡ · \+250 XP/);
  assert.equal(app._boss, null);
  assert.equal(app._game().bosses.Caching.clearedAt !== null, true);
  assert.equal(app._game().xp.total >= 250, true);
});

test('the world map shows a boss once half its concepts have two stars', () => {
  const { app } = createApp();
  assert.match(app._bossMapHtml('Caching'), /appears at 1 concept with ★★ \(0\/1\)/);
  app._game().stars.caching = 2;
  const ready = app._bossMapHtml('Caching');
  assert.match(ready, /Boss: Social feed/);
  assert.match(ready, /APP\.startBoss\(&quot;Caching&quot;\)/);
  assert.equal(app._bossMapHtml('Atlantis'), '');
});

test('the shell has boss hearts, the boss banner, and the rematch button', () => {
  assert.match(html, /id="boss-hearts"/);
  assert.match(html, /id="boss-status"/);
  assert.match(html, /id="rematch-btn"[^>]*onclick="APP\.startRematch\(\)"/);
});
