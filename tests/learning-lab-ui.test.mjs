import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const sandboxSource = await readFile(new URL('../js/sandbox.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const serviceWorkerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value) {
      if (values.has(value)) values.delete(value);
      else values.add(value);
    },
    contains(value) { return values.has(value); },
    values
  };
}

function createContext() {
  const elements = new Map();
  const screens = [];
  const makeElement = (id, isScreen = false) => {
    const element = {
      id,
      textContent: '',
      innerHTML: '',
      disabled: false,
      value: '',
      checked: false,
      className: '',
      classList: makeClassList(isScreen ? ['screen', 'hidden'] : []),
      style: {},
      children: [],
      setAttribute() {},
      appendChild(child) { this.children.push(child); },
      querySelectorAll() { return []; },
      scrollIntoView() {},
      focus() {}
    };
    elements.set(id, element);
    if (isScreen) screens.push(element);
    return element;
  };

  for (const id of [
    'screen-welcome', 'screen-sandbox', 'challenge-ladder',
    'learning-level-title', 'learning-level-copy', 'learning-level-next',
    'learning-level-fill', 'learning-level-steps', 'sandbox-progress-summary', 'sandbox-node',
    'sandbox-node-description', 'sandbox-situation', 'sandbox-situation-description',
    'sandbox-situation-objective', 'sandbox-controls', 'sandbox-prediction-question',
    'sandbox-predictions', 'sandbox-prediction-error', 'sandbox-progress-text',
    'sandbox-progress-fill', 'sandbox-current-level', 'sandbox-run-btn',
    'sandbox-next-btn', 'sandbox-results'
  ]) makeElement(id, id.startsWith('screen-'));

  const context = {
    window: {
      location: { hostname: 'example.com', hash: '', pathname: '/', search: '' },
      addEventListener() {},
      scrollTo() {}
    },
    URLSearchParams,
    document: {
      addEventListener() {},
      getElementById(id) { return elements.get(id); },
      querySelector() { return null; },
      querySelectorAll(selector) { return selector === '.screen' ? screens : []; }
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
    setTimeout() {},
    clearTimeout() {},
    console
  };
  vm.createContext(context);
  vm.runInContext(`${cardsSource}
globalThis.TOPIC_CATALOG = TOPIC_CATALOG;
globalThis.SEED_CARDS = SEED_CARDS;
globalThis.normalizeCardPrerequisites = normalizeCardPrerequisites;
${srsSource}
globalThis.SRS = SRS;
${sandboxSource}
globalThis.SANDBOX_NODE_MODELS = SANDBOX_NODE_MODELS;
globalThis.getSandboxNode = getSandboxNode;
globalThis.getSandboxPredictionBucket = getSandboxPredictionBucket;
${appSource}
globalThis.learningLevelForProfileForTest = learningLevelForProfile;
globalThis.normalizeProfileDataForTest = normalizeProfileData;
globalThis.appForTest = APP;`, context);
  return context;
}

const context = createContext();

function profileWithEvidence(answered, correct, topicCount) {
  return {
    totalAnswered: answered,
    totalCorrect: correct,
    topicScores: Object.fromEntries(
      Array.from({ length: topicCount }, (_, index) => [
        `topic-${index}`,
        { raw: 1, cardsReviewed: 1, daysSpanned: ['2026-08-26'] }
      ])
    )
  };
}

function baseProfile() {
  return {
    userId: 'tester',
    topicScores: {},
    cardHistory: {},
    topicAccuracy: {},
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
  app._sandboxState = null;
  app.saveProfile = () => {};
  return app;
}

test('learning ladder advances only when practice, accuracy, and topic evidence agree', () => {
  const level = context.learningLevelForProfileForTest;
  assert.equal(level(profileWithEvidence(0, 0, 0)), 1);
  assert.equal(level(profileWithEvidence(3, 2, 1)), 2);
  assert.equal(level(profileWithEvidence(8, 6, 2)), 3);
  assert.equal(level(profileWithEvidence(16, 12, 4)), 4);
  assert.equal(level(profileWithEvidence(30, 24, 6)), 5);
  assert.equal(level(profileWithEvidence(30, 23, 6)), 4);
});

test('earned learning level caps fresh topic targets without hiding topics', () => {
  const app = freshApp();
  app.profile = context.normalizeProfileDataForTest({
    ...baseProfile(),
    totalAnswered: 3,
    totalCorrect: 3,
    topicScores: Object.fromEntries(
      Object.keys(context.TOPIC_CATALOG).map(topic => [
        topic,
        { raw: 1, cardsReviewed: 1, daysSpanned: ['2026-08-26'] }
      ])
    )
  });

  const ranked = app._rankedSessionTopics();
  assert.equal(ranked.length, Object.keys(context.TOPIC_CATALOG).length);
  assert.equal(Math.max(...ranked.map(item => item.difficulty)), 2);
  assert.equal(ranked.every(item => item.difficulty >= 1), true);
});

test('challenge ladder renders the current level and next milestone', () => {
  const app = freshApp();
  app.profile = context.normalizeProfileDataForTest({
    ...baseProfile(),
    ...profileWithEvidence(8, 6, 2)
  });
  app.renderChallengeLadder();

  assert.equal(context.document.getElementById('learning-level-title').textContent, 'Level 3 · Pressure test');
  assert.match(context.document.getElementById('learning-level-next').textContent, /Level 4/);
  assert.equal(context.document.getElementById('learning-level-fill').style.width, '60%');
  assert.match(context.document.getElementById('learning-level-steps').innerHTML, /is-current/);
});

test('sandbox route and offline shell include the model module', () => {
  assert.match(htmlSource, /id="screen-sandbox"/);
  assert.match(htmlSource, /id="sandbox-node"/);
  assert.match(htmlSource, /Open Concept Sandbox/);
  assert.match(htmlSource, /js\/sandbox\.js/);
  assert.match(appSource, /'sandbox'/);
  assert.match(serviceWorkerSource, /'\/js\/sandbox\.js'/);
});

test('sandbox controls keep native radio and range inputs from expanding the layout', () => {
  assert.match(cssSource, /\.screen input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\)/);
  assert.match(cssSource, /\.sandbox-controls-grid \{[\s\S]*grid-template-columns/);
  assert.match(cssSource, /\.sandbox-prediction-option input \{[\s\S]*width: 16px/);
});

test('sandbox requires a prediction and does not record a blocked run', () => {
  const app = freshApp();
  app.showSandbox('queue-worker');
  assert.equal(app._sandboxState.nodeId, 'queue-worker');
  assert.match(context.document.getElementById('sandbox-results').innerHTML, /sandbox-preview-flow/);
  assert.equal(app.runSandbox(), false);
  assert.match(context.document.getElementById('sandbox-prediction-error').textContent, /Choose the outcome/i);
  assert.equal(app.profile.sandbox.runs, 0);
  assert.equal(context.window.location.hash, '#/sandbox');
  app.selectSandboxSituation('burst-arrivals');
  assert.equal(context.document.getElementById('sandbox-prediction-error').textContent, '');
});

test('sandbox records predictions, keeps duplicate completion markers unique, and survives reload', () => {
  const app = freshApp();
  app.showSandbox('redis-cache');
  const input = app._sandboxState.input;
  const expected = context.getSandboxPredictionBucket('redis-cache', input);
  app.selectSandboxPrediction(expected);

  assert.equal(app.runSandbox(), true);
  assert.equal(app.profile.sandbox.runs, 1);
  assert.equal(app.profile.sandbox.correctPredictions, 1);
  assert.equal(app._sandboxState.completedSituationIds.length, 1);
  assert.equal(app.runSandbox(), true);
  assert.equal(app.profile.sandbox.runs, 2);
  assert.equal(app._sandboxState.completedSituationIds.length, 1);

  const reloaded = context.normalizeProfileDataForTest(
    JSON.parse(JSON.stringify(app.profile))
  );
  assert.equal(reloaded.sandbox.runs, 2);
  assert.equal(reloaded.sandbox.correctPredictions, 2);
});

test('learner can complete all five situations in a node lab', () => {
  const app = freshApp();
  app.showSandbox('relational-database');
  const node = context.getSandboxNode('relational-database');

  for (let index = 0; index < node.situations.length; index++) {
    const state = app._sandboxState;
    const expected = context.getSandboxPredictionBucket('relational-database', state.input);
    app.selectSandboxPrediction(expected);
    assert.equal(app.runSandbox(), true);
    if (index < node.situations.length - 1) assert.equal(app.advanceSandboxChallenge(), true);
  }

  assert.equal(app._sandboxState.labComplete, true);
  assert.equal(app._sandboxState.completedSituationIds.length, 5);
  assert.equal(app.profile.sandbox.completedLabs, 1);
  assert.equal(app.profile.sandbox.runs, 5);
  assert.equal(context.document.getElementById('sandbox-progress-text').textContent, '5 / 5 situations complete');
  assert.match(context.document.getElementById('sandbox-results').innerHTML, /Teaching takeaway/);
});

test('sandbox result renders an engaging model-specific simulation trace', () => {
  const cases = [
    ['redis-cache', 'Cache hits', 'Backing store'],
    ['queue-worker', 'Completed', 'Worker pool'],
    ['relational-database', 'Primary path', 'Replica reads']
  ];

  for (const [nodeId, firstLabel, expectedText] of cases) {
    const app = freshApp();
    app.showSandbox(nodeId);
    const expected = context.getSandboxPredictionBucket(nodeId, app._sandboxState.input);
    app.selectSandboxPrediction(expected);
    assert.equal(app.runSandbox(), true);
    const html = context.document.getElementById('sandbox-results').innerHTML;
    assert.match(html, /sandbox-simulation/);
    assert.match(html, /Simulation trace/);
    assert.match(html, new RegExp(firstLabel));
    assert.match(html, new RegExp(expectedText));
    assert.match(html, /Branches observed/);
  }
});

test('switching node models resets the current lab to that model baseline', () => {
  const app = freshApp();
  app.showSandbox('redis-cache');
  app.selectSandboxNode('queue-worker');
  assert.equal(app._sandboxState.nodeId, 'queue-worker');
  assert.equal(app._sandboxState.situationId, 'steady-workers');
  assert.equal(app._sandboxState.result, null);
  assert.match(context.document.getElementById('sandbox-node-description').textContent, /worker capacity/i);
});
