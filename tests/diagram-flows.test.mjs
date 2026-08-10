import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const renderSource = await readFile(new URL('../js/render.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

const context = vm.createContext({
  console, Math, Date, JSON
});
vm.runInContext(`${cardsSource}
globalThis.normalizeFlowsForTest = normalizeFlows;
globalThis.normalizeCardFlowsForTest = normalizeCardFlows;
globalThis.normalizeCardPrerequisitesForTest = normalizeCardPrerequisites;
globalThis.SEED_FLOWS_FOR_TEST = SEED_FLOWS;
globalThis.SEED_CARDS_FOR_TEST = SEED_CARDS;
${renderSource}
globalThis.RenderForTest = Render;`, context);

const normalizeFlows = context.normalizeFlowsForTest;
const normalizeCardFlows = context.normalizeCardFlowsForTest;
const normalizeCardPrerequisites = context.normalizeCardPrerequisitesForTest;
const SEED_FLOWS = context.SEED_FLOWS_FOR_TEST;
const Render = context.RenderForTest;

function cardWithFlows(flows) {
  return {
    id: 'x', topic: 'caching', difficulty: 2,
    nodes: ['client', 'api', 'cache', 'db'],
    flows,
    options: [{ id: 'A', label: 'Option A', prerequisiteTopics: ['a'] }],
    correct: 'A', explanation: 'x'
  };
}

test('every seed card has curated base flows and per-option wiring', () => {
  const seeds = ['fallback-cache-001', 'fallback-queue-001', 'fallback-db-001',
    'fallback-consensus-001', 'fallback-api-001'];
  for (const id of seeds) {
    const entry = SEED_FLOWS[id];
    assert.ok(entry, `${id} is missing seed flows`);
    assert.ok(entry.base.length >= 1, `${id}: base flows`);
    assert.deepEqual(Object.keys(entry.options).sort(), ['A', 'B', 'C', 'D'], `${id}: all four options`);
  }
});

test('legacy cards without flows normalize to a linear chain', () => {
  const card = normalizeCardFlows(cardWithFlows(undefined));
  assert.deepEqual(card.flows.map(flow => flow.from + '->' + flow.to),
    ['client->api', 'api->cache', 'cache->db']);
});

test('flows referencing unknown nodes are dropped, then fall back to the chain', () => {
  const card = normalizeCardFlows(cardWithFlows([
    { from: 'client', to: 'ghost', verb: 'x', kind: 'sync' },
    { from: 'ghost', to: 'db', verb: 'x', kind: 'sync' }
  ]));
  assert.equal(card.flows.length, 3); // invalid edges dropped → chain fallback
  assert.deepEqual(card.flows.map(flow => flow.from + '->' + flow.to),
    ['client->api', 'api->cache', 'cache->db']);
});

test('flow kinds are whitelisted and unknown verbs are kept as-is', () => {
  const card = normalizeCardFlows(cardWithFlows([
    { from: 'client', to: 'api', verb: 'requests', kind: 'bogus' },
    { from: 'api', to: 'cache', verb: '', kind: 'async' }
  ]));
  assert.equal(card.flows[0].kind, 'sync');
  assert.equal(card.flows[1].kind, 'async');
  assert.equal(card.flows[1].verb, '');
});

test('option flows are normalized and emptied options become undefined', () => {
  const card = cardWithFlows([
    { from: 'client', to: 'api', verb: 'requests', kind: 'sync' },
    { from: 'api', to: 'db', verb: 'queries', kind: 'sync' }
  ]);
  card.options = [
    { id: 'A', label: 'A', prerequisiteTopics: [], flows: [{ from: 'api', to: 'cache', verb: 'caches', kind: 'sync' }] },
    { id: 'B', label: 'B', prerequisiteTopics: [], flows: [{ from: 'api', to: 'ghost', verb: 'x', kind: 'sync' }] }
  ];
  normalizeCardFlows(card);
  assert.equal(card.options[0].flows.length, 1);
  assert.equal(card.options[1].flows, undefined);
});

test('cards without an end-user node get one synthesized at the graph entry', () => {
  const card = normalizeCardFlows({
    id: 'x', topic: 'caching', difficulty: 2,
    nodes: ['Cloudflare CDN', 'API Server', 'Redis', 'PostgreSQL'],
    flows: [
      { from: 'Cloudflare CDN', to: 'API Server', verb: 'forwards', kind: 'sync' },
      { from: 'API Server', to: 'Redis', verb: 'checks', kind: 'sync' },
      { from: 'Redis', to: 'PostgreSQL', verb: 'loads on miss', kind: 'sync' }
    ],
    options: [{ id: 'A', label: 'A', prerequisiteTopics: ['a'] }],
    correct: 'A', explanation: 'x'
  });
  assert.equal(card.nodes[0], 'End User');
  assert.equal(card.flows[0].from, 'End User');
  assert.equal(card.flows[0].to, 'Cloudflare CDN');
  // idempotent
  const again = normalizeCardFlows(JSON.parse(JSON.stringify(card)));
  assert.deepEqual(again.nodes, card.nodes);
  assert.equal(again.flows.length, card.flows.length);
});

test('a synthesized end-user edge is repaired onto the true graph entry', () => {
  const card = normalizeCardFlows({
    id: 'x', topic: 'caching', difficulty: 2,
    nodes: ['End User', 'MySQL Cluster', 'Redis', 'CDN', 'API Server'],
    flows: [
      { from: 'End User', to: 'MySQL Cluster', verb: '', kind: 'sync' },
      { from: 'CDN', to: 'API Server', verb: 'forwards', kind: 'sync' },
      { from: 'API Server', to: 'Redis', verb: 'checks', kind: 'sync' }
    ],
    options: [{ id: 'A', label: 'A', prerequisiteTopics: ['a'] }],
    correct: 'A', explanation: 'x'
  });
  assert.equal(card.flows[0].to, 'CDN');
});

test('Render.layout anchors the end-user node in the first row despite incoming edges', () => {
  const layout = Render.layout([
    { from: 'Worker Pool', to: 'Web App', verb: 'posts result', kind: 'callback' },
    { from: 'Web App', to: 'API Server', verb: 'posts', kind: 'sync' },
    { from: 'API Server', to: 'Queue', verb: 'enqueues', kind: 'async' },
    { from: 'Queue', to: 'Worker Pool', verb: 'delivers', kind: 'async' }
  ], ['Web App', 'API Server', 'Queue', 'Worker Pool']);
  const byName = new Map(layout.nodes.map((pos, i) => ['Web App', 'API Server', 'Queue', 'Worker Pool'][i]).map((name, i) => [name, layout.nodes[i]]));
  assert.ok(byName.get('Web App').y <= byName.get('API Server').y);
  assert.ok(byName.get('Web App').y <= byName.get('Queue').y);
  assert.ok(byName.get('Web App').y <= byName.get('Worker Pool').y);
});

test('seed cards receive curated flows through prerequisite normalization', () => {
  const seed = normalizeCardPrerequisites(JSON.parse(JSON.stringify(context.SEED_CARDS_FOR_TEST.find(c => c.id === 'fallback-queue-001'))));
  assert.ok(seed.flows.length >= 2);
  const correct = seed.options.find(option => option.id === seed.correct);
  assert.ok(Array.isArray(correct.flows) && correct.flows.length >= 3,
    'the correct seed option should have explicit wiring');
});

test('Render.layout stacks sources at the top and dependents below', () => {
  const layout = Render.layout([
    { from: 'client', to: 'api', verb: 'requests', kind: 'sync' },
    { from: 'api', to: 'cache', verb: 'checks', kind: 'sync' },
    { from: 'api', to: 'db', verb: 'queries', kind: 'sync' }
  ], ['client', 'api', 'cache', 'db']);
  const byName = new Map(layout.nodes.map((pos, i) => ['client', 'api', 'cache', 'db'][i]).map((name, i) => [name, layout.nodes[i]]));
  assert.ok(byName.get('client').y <= byName.get('api').y);
  assert.ok(byName.get('api').y <= byName.get('cache').y);
  assert.ok(byName.get('api').y <= byName.get('db').y);
  assert.ok(layout.width > 0 && layout.height > 0);
  for (const pos of layout.nodes) {
    assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y));
    assert.ok(pos.w >= 64 && pos.w <= 170);
  }
});

test('Render.layout places parallel branches side by side in one row', () => {
  const layout = Render.layout([
    { from: 'client', to: 'lb', verb: 'requests', kind: 'sync' },
    { from: 'lb', to: 'worker-a', verb: 'routes', kind: 'sync' },
    { from: 'lb', to: 'worker-b', verb: 'routes', kind: 'sync' },
    { from: 'worker-a', to: 'db', verb: 'writes', kind: 'sync' },
    { from: 'worker-b', to: 'db', verb: 'writes', kind: 'sync' }
  ], ['client', 'lb', 'worker-a', 'worker-b', 'db']);
  const workerA = layout.nodes[2];
  const workerB = layout.nodes[3];
  assert.ok(workerA.x !== workerB.x, 'parallel workers must sit side by side, not overlap');
  assert.equal(workerA.y, workerB.y, 'parallel workers share the same row');
  assert.ok(layout.nodes[4].y > workerA.y, 'the db row sits below the workers');
  assert.ok(layout.edges.length === 5);
});

test('Render.layout returns edges with finite bezier controls', () => {
  const layout = Render.layout([
    { from: 'client', to: 'api', verb: 'requests', kind: 'sync' },
    { from: 'api', to: 'db', verb: 'queries', kind: 'sync' }
  ], ['client', 'api', 'db']);
  for (const edge of layout.edges) {
    for (const value of [edge.x1, edge.y1, edge.x2, edge.y2, edge.c1x, edge.c1y, edge.c2x, edge.c2y]) {
      assert.ok(Number.isFinite(value));
    }
  }
});

test('diagram rendering uses theme variables and per-option highlight logic', () => {
  assert.match(renderSource, /var\(--diagram-bg\)/);
  assert.match(renderSource, /var\(--success\)/);
  assert.match(renderSource, /var\(--danger\)/);
  assert.match(renderSource, /var\(--muted\)/);
  assert.match(renderSource, /chosenOption\?\.flows/);
  assert.match(renderSource, /correctOption/);
  assert.match(renderSource, /viewBox/);
});

test('compare mode overlays every option wiring, color-coded with a legend', () => {
  const holder = { innerHTML: '' };
  context.document = { getElementById: () => holder };
  const card = {
    id: 'cmp', topic: 'caching', difficulty: 2, correct: 'B',
    nodes: ['Client', 'API', 'Cache', 'DB'],
    options: [
      { id: 'A', label: 'A', flows: [{ from: 'Client', to: 'API', verb: 'requests', kind: 'sync' }, { from: 'API', to: 'DB', verb: 'queries', kind: 'sync' }] },
      { id: 'B', label: 'B', flows: [{ from: 'Client', to: 'API', verb: 'requests', kind: 'sync' }, { from: 'API', to: 'Cache', verb: 'checks', kind: 'sync' }, { from: 'Cache', to: 'DB', verb: 'loads on miss', kind: 'sync' }] },
      { id: 'C', label: 'C', flows: [{ from: 'API', to: 'DB', verb: 'queries', kind: 'sync' }] },
      { id: 'D', label: 'D', flows: [] }
    ]
  };
  context.RenderForTest.diagram(card, 'diagram-container', { reveal: true, compare: true });
  const htmlOut = holder.innerHTML;
  assert.match(htmlOut, /diagram-legend/);
  // four option colors present, including the ones without wiring (dimmed)
  for (const color of Object.values(context.RenderForTest.OPTION_COLORS)) {
    assert.ok(htmlOut.includes(color), `missing option color ${color}`);
  }
  // every distinct edge is drawn with an option letter badge
  assert.equal((htmlOut.match(/<circle /g) || []).length, 6); // Client→API ×2, API→Cache, API→DB ×2, Cache→DB
  assert.match(htmlOut, /B ✓/);
  assert.doesNotMatch(htmlOut, /<script/);
});

test('compare mode is wired to a toggle button in the app', () => {
  assert.match(html, /id="compare-btn"[^>]*onclick="APP\.showCompareDiagram\(\)"/);
  assert.match(appSource, /showCompareDiagram\(\) \{/);
  assert.match(appSource, /compare: true/);
  assert.match(appSource, /this\._compareMode = false;/);
});

test('mermaid definition maps flows onto a flowchart with per-edge styling', () => {
  const card = {
    id: 'm', topic: 'queues', difficulty: 2, correct: 'B',
    nodes: ['Web App', 'API Server', 'Queue', 'Worker'],
    options: [
      { id: 'A', label: 'A', flows: [
        { from: 'Web App', to: 'API Server', verb: 'posts', kind: 'sync' },
        { from: 'API Server', to: 'Queue', verb: 'enqueues', kind: 'async' },
        { from: 'API Server', to: 'Worker', verb: 'calls directly', kind: 'sync' } // not in B → red
      ] },
      { id: 'B', label: 'B', flows: [
        { from: 'Web App', to: 'API Server', verb: 'posts', kind: 'sync' },
        { from: 'API Server', to: 'Queue', verb: 'enqueues', kind: 'async' },
        { from: 'Queue', to: 'Worker', verb: 'delivers', kind: 'async' },
        { from: 'Worker', to: 'Web App', verb: 'posts result', kind: 'callback' }
      ] }
    ]
  };
  const reveal = context.RenderForTest._mermaidDefinition(card, { reveal: true, option: card.options[0] });
  assert.match(reveal.definition, /^flowchart TB$/m);
  assert.match(reveal.definition, /n0\["Web App"\]/);
  assert.match(reveal.definition, /n0 -->\|posts\| n1/); // sync solid
  assert.match(reveal.definition, /n1 -\.->\|enqueues\| n2/); // async dotted
  assert.match(reveal.definition, /linkStyle 0 stroke:#43a047/); // shared edge: green
  assert.match(reveal.definition, /linkStyle 2 stroke:#e53935/); // chosen-only edge: red

  const compare = context.RenderForTest._mermaidDefinition(card, { reveal: true, compare: true });
  assert.match(compare.definition, /enqueues \(A, B\)/); // shared edge lists both options
  assert.match(compare.definition, /n3 -\.->\|posts result \(B\)\| n0/); // callback back-edge
  assert.match(compare.definition, /linkStyle 0 stroke:#1976d2/); // option A color
  assert.match(compare.definition, /linkStyle 3 stroke:#2e7d32,stroke-width:3px/); // correct option thicker
  assert.match(compare.legendHtml, /B ✓/);
});

test('diagram prefers mermaid and falls back to the custom renderer', () => {
  assert.match(renderSource, /window\.mermaid && typeof window\.mermaid\.render === 'function'/);
  assert.match(renderSource, /_renderMermaid\(card, el, opts\)\.catch\(\(\) => this\._renderCustom/);
  assert.match(renderSource, /async _renderMermaid/);
  assert.match(renderSource, /mermaid\.initialize\(\{ startOnLoad: false, theme/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/mermaid@11\/dist\/mermaid\.min\.js/);
  assert.match(serviceWorker, /mermaid@11\/dist\/mermaid\.min\.js/);
});

test('rateConfidence passes the chosen option to the diagram renderer', () => {
  assert.match(appSource, /Render\.diagram\(card, 'diagram-container', \{/);
  assert.match(appSource, /option: \(card\.options \|\| \[\]\)\.find\(option => option\.id === this\._selectedId\)/);
});

test('snapshots persist card and option flows', () => {
  assert.match(appSource, /flows: Array\.isArray\(card\.flows\) \? card\.flows\.map\(flow => \(\{ \.\.\.flow \}\)\) : \[\]/);
  assert.match(appSource, /flows: Array\.isArray\(option\?\.flows\) \? option\.flows\.map\(flow => \(\{ \.\.\.flow \}\)\) : \[\]/);
});
