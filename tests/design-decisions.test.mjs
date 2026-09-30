import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const decisionsSource = await readFile(new URL('../js/design-decisions.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

const context = vm.createContext({});
vm.runInContext(`${decisionsSource}; globalThis.DESIGN_DECISIONS = DESIGN_DECISIONS;`, context);
const decisions = context.DESIGN_DECISIONS;

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

test('SQL vs NoSQL is the first documented decision', () => {
  assert.match(decisions[0].title, /SQL vs NoSQL/i);
});

test('the Design Decisions screen is URL-addressable and rendered', () => {
  assert.match(html, /<div id="screen-design-decisions"/);
  assert.match(html, /<script src="js\/design-decisions\.js"><\/script>/);
  assert.match(appSource, /'design-decisions'/);
  assert.match(appSource, /route === 'design-decisions'/);
  assert.match(appSource, /renderDesignDecisions\(\)/);
  assert.match(appSource, /showDesignDecisions\(\)/);
});

test('the design decisions script is registered in the service worker cache', () => {
  assert.match(serviceWorker, /'\/js\/design-decisions\.js'/);
});
