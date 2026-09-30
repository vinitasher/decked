import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const decisionsSource = await readFile(new URL('../js/design-decisions.js', import.meta.url), 'utf8');
const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const wikiSource = await readFile(new URL('../js/wiki.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

const context = vm.createContext({});
vm.runInContext(`${decisionsSource}; ${cardsSource}; ${wikiSource}; globalThis.DESIGN_DECISIONS = DESIGN_DECISIONS; globalThis.TOPIC_CATALOG = TOPIC_CATALOG; globalThis.WIKI = WIKI;`, context);
const decisions = context.DESIGN_DECISIONS;
const topicKeys = new Set(Object.keys(context.TOPIC_CATALOG || {}));
const wikiKeys = new Set(Object.keys(context.WIKI || {}));

test('design decisions data declares at least 10 architecture matrices', () => {
  assert.ok(Array.isArray(decisions), 'DESIGN_DECISIONS is an array');
  assert.ok(decisions.length >= 10, `expected at least 10 matrices, got ${decisions.length}`);
});

test('every decision has a unique id, title, question, decision, and rationale', () => {
  const ids = new Set();
  for (const d of decisions) {
    assert.ok(typeof d.id === 'string' && d.id, 'id present');
    assert.ok(!ids.has(d.id), `duplicate id: ${d.id}`);
    ids.add(d.id);
    assert.ok(typeof d.title === 'string' && d.title, 'title present');
    assert.ok(typeof d.question === 'string' && d.question, 'question present');
    assert.ok(typeof d.decision === 'string' && d.decision, 'decision present');
    assert.ok(typeof d.rationale === 'string' && d.rationale, 'rationale present');
  }
});

test('each decision matrix aligns criteria, options, and cells', () => {
  for (const d of decisions) {
    assert.ok(Array.isArray(d.criteria) && d.criteria.length >= 2, `${d.id} declares criteria`);
    assert.ok(Array.isArray(d.options) && d.options.length >= 2, `${d.id} declares options`);
    assert.ok(Array.isArray(d.cells), `${d.id} declares cells`);
    assert.equal(d.cells.length, d.criteria.length, `${d.id} has one cell row per criterion`);
    for (const row of d.cells) {
      assert.equal(row.length, d.options.length, `${d.id} has one cell column per option`);
    }
  }
});

test('every decision links to real concept pages and flashcard topics', () => {
  for (const d of decisions) {
    assert.ok(Array.isArray(d.relatedConcepts), `${d.id} declares relatedConcepts`);
    assert.ok(Array.isArray(d.practiceTopics), `${d.id} declares practiceTopics`);
    for (const topic of d.relatedConcepts) {
      assert.ok(wikiKeys.has(topic), `${d.id} concept link "${topic}" is not a Wiki entry`);
    }
    for (const topic of d.practiceTopics) {
      assert.ok(topicKeys.has(topic), `${d.id} flashcard link "${topic}" is not a catalog topic`);
    }
  }
});

test('SQL vs NoSQL is the first documented decision', () => {
  assert.match(decisions[0].title, /SQL vs NoSQL/i);
});

test('each design decision has its own deep-linkable screen and route', () => {
  assert.match(html, /<div id="screen-design-decisions"/);
  assert.match(html, /<div id="screen-design-decision"/);
  assert.match(html, /<script src="js\/design-decisions\.js"><\/script>/);
  assert.match(appSource, /'design-decisions'/);
  assert.match(appSource, /'design-decision'/);
  assert.match(appSource, /route === 'design-decision'/);
  assert.match(appSource, /_routeDesignDecisionId\(\)/);
  assert.match(appSource, /renderDesignDecisions\(\)/);
  assert.match(appSource, /renderDesignDecision\(/);
  assert.match(appSource, /showDesignDecision\(/);
});

test('decision detail links read concepts and practice flashcards', () => {
  assert.match(appSource, /APP\.openConcept\('/);
  assert.match(appSource, /APP\.startTopicSession\('/);
});

test('the design decisions script is registered in the service worker cache', () => {
  assert.match(serviceWorker, /'\/js\/design-decisions\.js'/);
});
