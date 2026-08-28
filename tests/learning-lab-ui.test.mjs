import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const srsSource = await readFile(new URL('../js/srs.js', import.meta.url), 'utf8');
const wikiSource = await readFile(new URL('../js/wiki.js', import.meta.url), 'utf8');
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
      dataset: {},
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
    'screen-welcome', 'screen-concepts', 'screen-wiki', 'concept-cloud', 'concept-cloud-count',
    'concept-prewarm-status', 'wiki-sidebar', 'wiki-content', 'challenge-ladder',
    'learning-level-title', 'learning-level-copy', 'learning-level-next',
    'learning-level-fill', 'learning-level-steps', 'sandbox-progress-summary', 'sandbox-node',
    'sandbox-node-description', 'sandbox-situation', 'sandbox-situation-description',
    'sandbox-situation-objective', 'sandbox-wiki-links', 'sandbox-controls', 'sandbox-prediction-question',
    'sandbox-predictions', 'sandbox-prediction-error', 'sandbox-progress-text',
    'sandbox-progress-fill', 'sandbox-current-level', 'sandbox-run-btn',
    'sandbox-next-btn', 'sandbox-results', 'sandbox-generation-status', 'sandbox-learner-problems'
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
${wikiSource}
globalThis.WIKI = WIKI;
${sandboxSource}
globalThis.SANDBOX_NODE_MODELS = SANDBOX_NODE_MODELS;
globalThis.getSandboxNode = getSandboxNode;
globalThis.getSandboxPredictionBucket = getSandboxPredictionBucket;
globalThis.getSandboxWikiTopics = getSandboxWikiTopics;
globalThis.getSandboxModelsForWikiTopic = getSandboxModelsForWikiTopic;
globalThis.getSandboxLearnerProblems = getSandboxLearnerProblems;
globalThis.getSandboxProblemEvidence = getSandboxProblemEvidence;
globalThis.validateGeneratedSandboxDefinition = validateGeneratedSandboxDefinition;
globalThis.registerGeneratedSandboxModel = registerGeneratedSandboxModel;
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
  app._activeWikiTopic = '';
  app._generatedSandboxRequests = null;
  app._sandboxGenerationTopic = '';
  context.localStorage.values.clear();
  app.saveProfile = () => {};
  return app;
}

function generatedDefinition(topic) {
  return {
    schemaVersion: 1,
    modelKind: 'bounded-pressure',
    generated: true,
    id: `generated-${topic}`,
    topic,
    label: 'Generated pressure',
    description: 'A bounded experiment connects incoming work, capacity, and concentrated pressure for this concept.',
    predictionQuestion: 'Will effective work stay below the modeled capacity?',
    learnerProblems: [
      { id: 'keep-up', question: 'Can the modeled path keep up as demand grows?', explanation: 'Compare effective demand with effective capacity to see when work begins waiting.', evidenceKeys: ['effectiveWorkRps', 'effectiveCapacityRps', 'backlogWork'] },
      { id: 'protect-latency', question: 'Where does user-visible delay appear first?', explanation: 'Use utilization, backlog, and estimated latency to find the pressure boundary.', evidenceKeys: ['estimatedP95LatencyMs', 'utilizationPct', 'backlogWork'] },
      { id: 'avoid-amplification', question: 'Do retries or extra work amplify pressure?', explanation: 'Trace retry work into offered and effective work to see whether failure adds load.', evidenceKeys: ['retryWorkRps', 'offeredWorkRps', 'effectiveWorkRps'] },
      { id: 'find-concentration', question: 'Can skew make one partition the real limit?', explanation: 'Compare skew-adjusted capacity with demand instead of trusting aggregate capacity.', evidenceKeys: ['skew', 'effectiveCapacityRps', 'utilizationPct'] }
    ],
    controls: [
      { key: 'arrivalRate', label: 'Incoming work', advanced: false },
      { key: 'capacity', label: 'Modeled capacity', advanced: false },
      { key: 'skew', label: 'Pressure skew', advanced: true }
    ],
    situations: [1, 2, 3, 4, 5].map(level => ({
      id: `pressure-level-${level}`,
      label: `Pressure level ${level}`,
      level,
      description: 'This situation changes a bounded pressure input so the learner can compare modeled outcomes.',
      objective: 'Predict whether the node stays healthy, needs watching, or enters stress.',
      focusProblemId: ['keep-up', 'protect-latency', 'avoid-amplification', 'find-concentration', 'keep-up'][level - 1],
      values: { arrivalRate: level === 5 ? 20000 : level * 1000, capacity: 10000, skew: (level - 1) * 15 }
    })),
    predictionOptions: [
      { id: 'healthy', label: 'The modeled path keeps comfortable headroom' },
      { id: 'watch', label: 'The modeled path is nearing a pressure boundary' },
      { id: 'stress', label: 'The modeled path develops backlog and stress' }
    ],
    assumptions: [
      'The input values are bounded teaching examples, not production recommendations.',
      'Capacity is represented by one effective work budget for the modeled path.',
      'Skew represents concentration on one representative partition or key.'
    ]
  };
}

function clearGeneratedModels() {
  for (let index = context.SANDBOX_NODE_MODELS.length - 1; index >= 0; index--) {
    if (context.SANDBOX_NODE_MODELS[index].generated) context.SANDBOX_NODE_MODELS.splice(index, 1);
  }
  context.localStorage.values.clear();
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
  assert.match(htmlSource, /id="screen-wiki"/);
  assert.match(htmlSource, /class="concept-lab-layout"/);
  assert.match(htmlSource, /class="concept-lab-pane concept-lab-wiki-pane"/);
  assert.match(htmlSource, /class="concept-lab-pane concept-lab-sandbox-pane"/);
  assert.doesNotMatch(htmlSource, /id="screen-sandbox"/);
  assert.match(htmlSource, /id="sandbox-node"/);
  assert.match(htmlSource, /id="sandbox-generation-status"/);
  assert.match(htmlSource, /Open Concept Lab/);
  assert.match(htmlSource, /Explore Concept Lab/);
  assert.match(htmlSource, /id="screen-concepts"/);
  assert.match(htmlSource, /id="concept-cloud"/);
  assert.match(htmlSource, /id="sandbox-learner-problems"/);
  assert.match(htmlSource, /js\/sandbox\.js/);
  assert.match(appSource, /'sandbox'/);
  assert.match(serviceWorkerSource, /'\/js\/sandbox\.js'/);
});

test('Wiki and Sandbox entry points render the same two-sided Concept Lab screen', () => {
  const app = freshApp();
  const screen = context.document.getElementById('screen-wiki');

  app.showWiki('http-cacheability');
  assert.equal(screen.classList.contains('hidden'), false);
  assert.equal(app._activeWikiTopic, 'http-cacheability');
  assert.equal(app._sandboxState.nodeId, 'url-shortener');

  app.showSandbox('url-shortener');
  assert.equal(screen.classList.contains('hidden'), false);
  assert.equal(app._activeWikiTopic, 'http-cacheability');
  assert.match(context.document.getElementById('sandbox-node').innerHTML, /URL shortener/);
});

test('Concept Lab word cloud renders every Wiki concept exactly once', () => {
  const app = freshApp();
  app.showConceptLab();
  const cloud = context.document.getElementById('concept-cloud').innerHTML;
  const buttons = cloud.match(/<button class="concept-cloud-item/g) || [];
  assert.equal(buttons.length, Object.keys(context.WIKI).length);
  for (const topic of Object.keys(context.WIKI)) {
    assert.match(cloud, new RegExp(`data-topic="${topic}"`));
  }
  assert.equal(context.document.getElementById('concept-cloud-count').textContent, `${buttons.length} concepts`);
  assert.match(cloud, /concept-cloud-size-[1-5]/);
  assert.equal(context.window.location.hash, '#/concepts');
});

test('selecting a cloud concept opens one Wiki and Sandbox child page', () => {
  const app = freshApp();
  app.openConcept('http-cacheability');
  assert.equal(context.window.location.hash, '#/concept/http-cacheability');
  assert.equal(context.document.getElementById('screen-wiki').classList.contains('hidden'), false);
  assert.match(context.document.getElementById('wiki-content').innerHTML, /Loading wiki entry|HTTP Cacheability/);
  assert.match(context.document.getElementById('sandbox-node').innerHTML, /URL shortener/);
});

test('sandbox names learner problems and ties a completed run to fixed evidence', () => {
  const app = freshApp();
  app.showSandbox('redis-cache');
  const problems = context.document.getElementById('sandbox-learner-problems').innerHTML;
  assert.match(problems, /What should this experiment help you decide/);
  assert.match(problems, /Can this path keep up as demand grows/);
  const expected = context.getSandboxPredictionBucket('redis-cache', app._sandboxState.input);
  app.selectSandboxPrediction(expected);
  assert.equal(app.runSandbox(), true);
  const result = context.document.getElementById('sandbox-results').innerHTML;
  assert.match(result, /Evidence for your decision/);
  assert.match(result, /derived signal|assumption/);
});

test('sandbox selector exposes the full reviewed node catalog', () => {
  const app = freshApp();
  app.showSandbox('redis-cache');
  const options = context.document.getElementById('sandbox-node').innerHTML.match(/<option/g) || [];
  assert.equal(options.length, 13);
  assert.match(context.document.getElementById('sandbox-node').innerHTML, /Social feed/);
  assert.match(context.document.getElementById('sandbox-node').innerHTML, /Distributed key-value store/);
});

test('every reviewed sandbox model has explicit Wiki concepts with reverse lookup', () => {
  for (const model of context.SANDBOX_NODE_MODELS) {
    assert.ok(model.wikiTopics.length >= 3, `${model.id}: needs at least three Wiki concepts`);
    for (const topic of model.wikiTopics) {
      assert.ok(context.WIKI[topic], `${model.id}: missing Wiki entry for ${topic}`);
      assert.ok(
        context.getSandboxModelsForWikiTopic(topic).some(candidate => candidate.id === model.id),
        `${topic}: missing reverse lookup for ${model.id}`
      );
    }
  }
});

test('sandbox links each node trade-off to its Wiki entries', () => {
  const app = freshApp();
  app.showSandbox('url-shortener');
  const bridge = context.document.getElementById('sandbox-wiki-links').innerHTML;

  assert.match(bridge, /Learn the concept/);
  assert.match(bridge, /HTTP Cacheability/i);
  assert.match(bridge, /APP\.openConcept\('http-cacheability'\)/);
  assert.ok(context.getSandboxWikiTopics('url-shortener').length >= 3);
});

test('Wiki entries link back to related sandbox nodes and retain a general fallback', () => {
  const app = freshApp();
  const mapped = app._wikiEntryHtml(context.WIKI['http-cacheability']);
  const unmapped = app._wikiEntryHtml(context.WIKI.dns);

  assert.match(mapped, /Put this concept under pressure/);
  assert.match(mapped, /Try URL shortener/);
  assert.match(mapped, /APP\.showSandbox\('url-shortener'\)/);
  assert.match(unmapped, /Browse Concept Sandbox/);
});

test('returning from Wiki preserves the active same-node experiment state', () => {
  const app = freshApp();
  app.showSandbox('url-shortener');
  app.selectSandboxSituation('cold-redirect-cache');
  const before = JSON.stringify(app._sandboxState);

  app.showWiki('http-cacheability');
  app.showSandbox('url-shortener');

  assert.equal(app._sandboxState.situationId, 'cold-redirect-cache');
  assert.equal(JSON.stringify(app._sandboxState), before);
});

test('selecting a different sandbox node refreshes the Wiki side to its mapped concept', () => {
  const app = freshApp();
  app.showSandbox('redis-cache');
  app.selectSandboxNode('url-shortener');

  assert.equal(app._sandboxState.nodeId, 'url-shortener');
  assert.equal(app._activeWikiTopic, 'http-cacheability');
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
  assert.equal(context.window.location.hash, '#/concept/queues');
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
    ['relational-database', 'Primary path', 'Replica reads'],
    ['social-feed', 'Precomputed hits', 'Celebrity merge'],
    ['realtime-messaging', 'Live deliveries', 'Offline queue'],
    ['video-pipeline', 'Encoded variants', 'Processing backlog'],
    ['geospatial-dispatch', 'Indexed updates', 'Nearby candidates'],
    ['url-shortener', 'Cached redirects', 'Mapping lookups'],
    ['rate-limiter', 'Allowed', 'Throttled'],
    ['object-storage', 'Changed chunks', 'Deduplicated bytes'],
    ['notification-fanout', 'Delivered', 'Retry loop'],
    ['search-autocomplete', 'Cache hits', 'Trie lookups'],
    ['distributed-kv', 'Quorum reads', 'Replicated writes']
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

test('opening an unmapped Wiki concept generates and selects a bounded sandbox', async () => {
  clearGeneratedModels();
  const app = freshApp();
  const originalFetch = context.fetch;
  let calls = 0;
  context.fetch = async url => {
    calls++;
    assert.match(url, /\/api\/sandbox\?topic=dns/);
    return {
      ok: true,
      status: 200,
      async json() { return generatedDefinition('dns'); }
    };
  };
  try {
    const pending = app.showWiki('dns');
    assert.equal(context.document.getElementById('sandbox-generation-status').dataset.state, 'loading');
    await pending;
    assert.equal(calls, 1);
    assert.equal(app._sandboxState.nodeId, 'generated-dns');
    assert.match(context.document.getElementById('sandbox-node').innerHTML, /Generated · Generated pressure/);
    assert.equal(context.document.getElementById('sandbox-generation-status').dataset.state, 'ready');
    assert.match(context.document.getElementById('sandbox-generation-status').textContent, /bounded educational model/i);
    assert.ok(context.localStorage.getItem('sdf_generated_sandbox_v1:dns'));
  } finally {
    context.fetch = originalFetch;
  }
});

test('generated sandbox requests coalesce and local cache avoids a second network call', async () => {
  clearGeneratedModels();
  const app = freshApp();
  const originalFetch = context.fetch;
  let resolveFetch;
  let calls = 0;
  context.fetch = async () => {
    calls++;
    return new Promise(resolve => { resolveFetch = resolve; });
  };
  try {
    const first = app._ensureGeneratedSandboxForTopic('dns');
    const second = app._ensureGeneratedSandboxForTopic('dns');
    resolveFetch({ ok: true, status: 200, async json() { return generatedDefinition('dns'); } });
    const [firstModel, secondModel] = await Promise.all([first, second]);
    assert.equal(firstModel.id, secondModel.id);
    assert.equal(calls, 1);

    const cachedValue = context.localStorage.getItem('sdf_generated_sandbox_v1:dns');
    clearGeneratedModels();
    const cachedApp = freshApp();
    context.localStorage.setItem('sdf_generated_sandbox_v1:dns', cachedValue);
    context.fetch = async () => { throw new Error('local cache should be used'); };
    const cached = await cachedApp._ensureGeneratedSandboxForTopic('dns');
    assert.equal(cached.id, 'generated-dns');
    assert.equal(calls, 1);
  } finally {
    context.fetch = originalFetch;
  }
});

test('generation failure keeps an active reviewed experiment and reports the fallback', async () => {
  clearGeneratedModels();
  const app = freshApp();
  app.showSandbox('redis-cache');
  const expected = context.getSandboxPredictionBucket('redis-cache', app._sandboxState.input);
  app.selectSandboxPrediction(expected);
  assert.equal(app.runSandbox(), true);
  const before = JSON.stringify(app._sandboxState);
  const originalFetch = context.fetch;
  context.fetch = async () => ({
    ok: false,
    status: 503,
    async json() { return { error: 'temporarily unavailable' }; }
  });
  try {
    await app.showWiki('dns');
    assert.equal(JSON.stringify(app._sandboxState), before);
    assert.equal(context.document.getElementById('sandbox-generation-status').dataset.state, 'error');
    assert.match(context.document.getElementById('sandbox-generation-status').textContent, /reviewed Sandbox catalog/i);
  } finally {
    context.fetch = originalFetch;
  }
});

test('successful generation keeps an active experiment instead of silently switching nodes', async () => {
  clearGeneratedModels();
  const app = freshApp();
  app.showSandbox('redis-cache');
  const expected = context.getSandboxPredictionBucket('redis-cache', app._sandboxState.input);
  app.selectSandboxPrediction(expected);
  assert.equal(app.runSandbox(), true);
  const before = JSON.stringify(app._sandboxState);
  const originalFetch = context.fetch;
  context.fetch = async () => ({
    ok: true,
    status: 200,
    async json() { return generatedDefinition('dns'); }
  });
  try {
    await app.showWiki('dns');
    assert.equal(JSON.stringify(app._sandboxState), before);
    assert.match(context.document.getElementById('sandbox-generation-status').textContent, /without losing this run/i);
    assert.match(context.document.getElementById('sandbox-node').innerHTML, /Redis-like cache/);
    assert.match(context.document.getElementById('wiki-content').innerHTML, /Generated pressure/);
  } finally {
    context.fetch = originalFetch;
  }
});
