import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
    values
  };
}

function createContext() {
  const elements = new Map();
  const optionButtons = [];
  const renderCalls = [];
  const makeElement = id => ({
    id,
    textContent: '',
    innerHTML: '',
    className: '',
    classList: makeClassList(['feedback', 'screen-session'].includes(id) ? [] : ['hidden']),
    style: {},
    children: [],
    setAttribute() {},
    appendChild(child) { this.children.push(child); optionButtons.push(child); },
    querySelectorAll() { return []; },
    scrollIntoView() {}
  });
  for (const id of [
    'card-counter', 'card-topic', 'card-difficulty', 'scenario',
    'card-prerequisites', 'diagram-container', 'options', 'bookmark-btn',
    'feedback', 'post-answer-actions', 'confidence-buttons', 'next-btn',
    'regenerate-btn', 'quality-rating', 'screen-session'
  ]) elements.set(id, makeElement(id));

  const keydownListeners = [];
  const document = {
    addEventListener(type, listener) {
      if (type === 'keydown') keydownListeners.push(listener);
    },
    createElement() {
      return {
        className: '', innerHTML: '', disabled: false, classList: makeClassList(),
        setAttribute() {}, click() { this.onclick?.(); }
      };
    },
    getElementById(id) { return elements.get(id); },
    querySelectorAll(selector) {
      if (selector === '.option-btn') return optionButtons;
      if (selector === '.option-btn:not(:disabled)') return optionButtons.filter(button => !button.disabled);
      return [];
    }
  };
  const context = {
    window: { location: { hostname: 'example.com' } }, document,
    localStorage: { getItem() { return null; }, setItem() {} },
    normalizeCardPrerequisites(card) {
      card.prerequisiteTopics ??= [];
      for (const option of card.options) option.prerequisiteTopics ??= [];
      return card;
    },
    countScenarioRequirements: () => ({ count: 0, requirements: [] }),
    difficultyFromScenario: () => 1,
    formatPrerequisiteLabel(value) { return value; },
    TOPIC_CATALOG: { queues: { label: 'Queues' } },
    SEED_CARDS: [], fetch() { throw new Error('unexpected fetch'); },
    Render: { diagram(...args) { renderCalls.push(args); } },
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.shuffleForTest = shuffledOptions;
globalThis.appForTest = APP;`, context);
  return { context, elements, optionButtons, keydownListeners, renderCalls };
}

const options = ['A', 'B', 'C', 'D'].map(id => ({ id, label: `Choice ${id}` }));

test('shuffle copies the source and retains every option exactly once', () => {
  const { context } = createContext();
  const result = context.shuffleForTest(options, () => 0);

  assert.notEqual(result, options);
  assert.deepEqual(Array.from(result, option => option.id), ['B', 'C', 'D', 'A']);
  assert.deepEqual(options.map(option => option.id), ['A', 'B', 'C', 'D']);
});

test('shuffle safely handles RNG boundaries for two to four options', () => {
  const { context } = createContext();
  for (const size of [2, 3, 4]) {
    for (const value of [-1, 0, 0.999999, 1, Number.NaN]) {
      const result = context.shuffleForTest(options.slice(0, size), () => value);
      assert.equal(result.length, size);
      assert.deepEqual([...result].map(option => option.id).sort(), options.slice(0, size).map(option => option.id));
    }
  }
});

test('deterministic shuffles place the authored correct option in every position', () => {
  const { context } = createContext();
  const positions = new Set();
  for (const values of [[0, 0, 0], [0, 0, 0.8], [0, 0.4, 0], [0.4, 0, 0]]) {
    let call = 0;
    const result = context.shuffleForTest(options, () => values[call++]);
    positions.add(result.findIndex(option => option.id === 'B'));
  }
  assert.deepEqual([...positions].sort(), [0, 1, 2, 3]);
});

test('card rendering, answer feedback, and diagram rendering use one stable shuffled identity order', () => {
  const { context, optionButtons, renderCalls } = createContext();
  const app = context.appForTest;
  const card = {
    id: 'card-1', topic: 'queues', difficulty: 2, scenario: 'Choose.',
    prerequisiteTopics: [], options: options.map(option => ({ ...option, prerequisiteTopics: [] })),
    correct: 'B', explanation: 'Option B wins; Option A fails.'
  };
  app.sessionCards = [card];
  app.sessionIndex = 0;
  app._optionRng = () => 0;
  app._saveSessionState = () => {};
  app.isBookmarked = () => false;

  app.showCard();

  assert.deepEqual(Array.from(app._displayedOptions, option => option.id), ['B', 'C', 'D', 'A']);
  assert.deepEqual(card.options.map(option => option.id), ['A', 'B', 'C', 'D']);
  assert.match(optionButtons[0].innerHTML, /option-letter">B/);
  assert.match(optionButtons[0].innerHTML, /\[1\]/);

  optionButtons[0].click();

  assert.equal(app._cardCorrect, true);
  assert.equal(optionButtons[0].classList.contains('correct'), true);
  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0][0], card);
  assert.equal(renderCalls[0][2].reveal, true);
  assert.equal(renderCalls[0][2].compare, true);

  // Start a new presentation to exercise the incorrect-answer path.
  optionButtons.length = 0;
  app.showCard();
  optionButtons[1].click();

  assert.equal(app._cardCorrect, false);
  assert.equal(optionButtons[0].classList.contains('correct'), true);
  assert.equal(optionButtons[1].classList.contains('incorrect'), true);
  assert.match(context.document.getElementById('feedback').innerHTML, /Option B wins; Option A fails\./);
  assert.equal(renderCalls.length, 2);
  assert.equal(renderCalls[1][2].reveal, true);
  assert.equal(renderCalls[1][2].compare, true);
});

test('numeric shortcuts select displayed positions', () => {
  const { context, optionButtons, keydownListeners } = createContext();
  const app = context.appForTest;
  let selected;
  optionButtons.push(
    { disabled: false, click() { selected = 'first'; } },
    { disabled: false, click() { selected = 'second'; } }
  );

  app._setupKeyboard();
  keydownListeners[0]({ target: { tagName: 'BODY' }, key: '2' });

  assert.equal(selected, 'second');
});
