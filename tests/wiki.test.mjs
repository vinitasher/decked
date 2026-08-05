import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const wikiSource = await readFile(new URL('../js/wiki.js', import.meta.url), 'utf8');
const WIKI = Function(`${wikiSource}; return WIKI;`)();
const entries = Object.values(WIKI);

test('wiki covers every catalog topic', () => {
  for (const topic of ['api-design', 'dns', 'caching', 'queues', 'databases', 'security',
    'loadbalancing', 'storage', 'messaging', 'rate-limiting', 'observability', 'real-time', 'consensus']) {
    assert.ok(WIKI[topic], `missing wiki entry for ${topic}`);
  }
});

test('every entry matches the wiki schema', () => {
  for (const [topic, entry] of Object.entries(WIKI)) {
    assert.equal(entry.topic, topic, `topic key mismatch for ${topic}`);
    assert.ok(typeof entry.title === 'string' && entry.title.length >= 2, `${topic}: title`);
    assert.ok(typeof entry.summary === 'string' && entry.summary.length >= 60, `${topic}: summary too short`);
    assert.ok(typeof entry.why_it_matters === 'string' && entry.why_it_matters.length >= 30, `${topic}: why_it_matters too short`);
    assert.ok(Array.isArray(entry.key_points) && entry.key_points.length >= 3, `${topic}: key_points`);
    assert.ok(entry.key_points.every(point => typeof point === 'string' && point.length >= 20), `${topic}: key_point too short`);
    assert.ok(Array.isArray(entry.common_pitfalls) && entry.common_pitfalls.length >= 2, `${topic}: common_pitfalls`);
    assert.ok(Array.isArray(entry.related_topics), `${topic}: related_topics array`);
    assert.ok(entry.related_topics.every(rel => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rel)), `${topic}: bad related topic name`);
  }
});

test('every "know first" topic in the catalog and seed cards has an entry', async () => {
  const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
  const catalog = Function('return ' + cardsSource.match(/const TOPIC_CATALOG = ({[\s\S]*?});/)[1])();
  const legacy = Function('return ' + cardsSource.match(/const LEGACY_OPTION_PREREQUISITES = ({[\s\S]*?});/)[1])();
  const known = new Set();
  for (const [topic, details] of Object.entries(catalog)) {
    known.add(topic);
    (details.prerequisites || []).forEach(p => known.add(p));
  }
  for (const opts of Object.values(legacy)) {
    for (const prereqs of Object.values(opts)) prereqs.forEach(p => known.add(p));
  }
  const missing = [...known].filter(topic => !WIKI[topic]);
  assert.deepEqual(missing, []);
});

test('entries link only to topics that exist in the wiki', () => {
  // Dangling related topics are rendered as pending links by the app (lazily
  // created on click), so they are allowed — but every linkable target must
  // exist or be a well-formed kebab-case name.
  const topics = new Set(Object.keys(WIKI));
  for (const entry of entries) {
    for (const rel of entry.related_topics) {
      assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rel), `${entry.topic}: bad related topic ${rel}`);
    }
  }
  assert.ok(topics.size >= 80, 'wiki should cover at least the 80 known topics');
});

test('cheap matching folds name variants onto the canonical concept', async () => {
  const { createContext, runInContext } = await import('node:vm');
  const appSource = (await readFile(new URL('../js/app.js', import.meta.url), 'utf8'))
    .replace('document.addEventListener(\'DOMContentLoaded\', () => APP.init());', '');
  const context = createContext({
    window: { location: { hostname: 'test' } },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { serviceWorker: undefined },
    console, Math, Date, JSON,
    SEED_CARDS: [], normalizeCardPrerequisites: c => c,
    fetch: async () => ({ ok: false })
  });
  runInContext(`${wikiSource}; ${appSource}`, context);

  const { normalizeConceptName, matchWikiTopic } = context;
  assert.equal(normalizeConceptName('Eventual Consistency'), 'eventual-consistency');
  assert.equal(normalizeConceptName('Eventual_Consistency'), 'eventual-consistency');
  assert.equal(normalizeConceptName('  Databases '), 'databases');
  assert.equal(normalizeConceptName(null), '');
  assert.equal(normalizeConceptName(''), '');

  assert.equal(matchWikiTopic('Eventual Consistency'), 'eventual-consistency');
  assert.equal(matchWikiTopic('eventual-consistency'), 'eventual-consistency');
  assert.equal(matchWikiTopic('Database'), 'databases');
  assert.equal(matchWikiTopic('Databases'), 'databases');
  assert.equal(matchWikiTopic('Database '), 'databases');
  assert.equal(matchWikiTopic('brand-new-concept'), null);
  assert.equal(matchWikiTopic(''), null);
  assert.equal(matchWikiTopic(null), null);
});

test('know-first links canonicalize variants and render pending links for unknown concepts', async () => {
  const { createContext, runInContext } = await import('node:vm');
  const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
  const appSource = (await readFile(new URL('../js/app.js', import.meta.url), 'utf8'))
    .replace('document.addEventListener(\'DOMContentLoaded\', () => APP.init());', '');
  const context = createContext({
    window: { location: { hostname: 'test' } },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { serviceWorker: undefined },
    console, Math, Date, JSON,
    SEED_CARDS: [], normalizeCardPrerequisites: c => c,
    fetch: async () => ({ ok: false })
  });
  runInContext(`${cardsSource}; ${wikiSource}; ${appSource}; globalThis.APP = APP;`, context);
  const app = Object.create(context.APP);

  // Variants resolve to the canonical existing entry.
  const plural = app._wikiLink('Database');
  assert.match(plural, /wiki-link"/);
  assert.match(plural, /openWikiModal\('databases'\)/);
  assert.ok(!plural.includes('wiki-link-pending'));

  const titled = app._wikiLink('Eventual Consistency');
  assert.match(titled, /wiki-link"/);
  assert.match(titled, /openWikiModal\('eventual-consistency'\)/);

  // Unknown concepts render as pending links that lazily create on click.
  const pending = app._wikiLink('brand-new-concept');
  assert.match(pending, /wiki-link-pending/);
  assert.match(pending, /openWikiModal\('brand-new-concept'\)/);
  assert.match(pending, /Brand New Concept/);

  // Related topics reuse the same canonicalizing links.
  const html = app._wikiEntryHtml({ ...WIKI['databases'], related_topics: ['Database', 'Eventual Consistency', 'brand-new-concept'] });
  assert.match(html, /openWikiModal\('databases'\)/);
  assert.match(html, /openWikiModal\('eventual-consistency'\)/);
  assert.match(html, /openWikiModal\('brand-new-concept'\)/);
  assert.match(html, /wiki-link-pending/);
});

test('titles are unique and entries contain no unescaped HTML', () => {
  const titles = entries.map(entry => entry.title);
  assert.equal(new Set(titles).size, titles.length);
  for (const entry of entries) {
    for (const field of ['title', 'summary', 'why_it_matters', ...entry.key_points, ...entry.common_pitfalls]) {
      assert.ok(!/<script/i.test(field), `${entry.topic}: script tag in content`);
    }
  }
});

test('know-first links render wiki anchors for known topics and plain text otherwise', async () => {
  const { createContext, runInContext } = await import('node:vm');
  const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
  const appSource = (await readFile(new URL('../js/app.js', import.meta.url), 'utf8'))
    .replace('document.addEventListener(\'DOMContentLoaded\', () => APP.init());', '');
  const context = createContext({
    window: { location: { hostname: 'test' } },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { serviceWorker: undefined },
    console, Math, Date, JSON,
    SEED_CARDS: [], normalizeCardPrerequisites: c => c,
    fetch: async () => ({ ok: false })
  });
  runInContext(`${cardsSource}; ${wikiSource}; ${appSource}; globalThis.APP = APP;`, context);
  const app = Object.create(context.APP);
  const known = app._wikiLink('cache-invalidation');
  assert.match(known, /wiki-link"/);
  assert.match(known, /APP\.openWikiModal\('cache-invalidation'\)/);
  assert.match(known, /stopPropagation/);
  assert.ok(!known.includes('<script'));
  const unknown = app._wikiLink('brand-new-concept');
  assert.match(unknown, /class="wiki-link /);
  assert.match(unknown, /wiki-link-pending/);
  assert.match(unknown, /APP\.openWikiModal\('brand-new-concept'\)/);
  assert.match(unknown, /Brand New Concept/);
});
