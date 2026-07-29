import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('post-answer tray contains confidence and next-card controls', () => {
  const trayStart = html.indexOf('id="post-answer-actions"');
  const confidence = html.indexOf('id="confidence-buttons"');
  const next = html.indexOf('id="next-btn"');

  assert.ok(trayStart >= 0);
  assert.ok(confidence > trayStart);
  assert.ok(next > confidence);
  assert.match(html, /How difficult was this question\?/);
});

test('mobile post-answer tray is sticky and hides keyboard-only guidance', () => {
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.post-answer-actions:not\(\.hidden\)[\s\S]*position: sticky/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.keyboard-hint \{ display: none; \}/);
});

test('answer flow reveals and scrolls the action tray into view', () => {
  assert.match(app, /actionsEl\.classList\.remove\('hidden'\)/);
  assert.match(app, /actionsEl\.scrollIntoView\(\{ behavior: 'smooth', block: 'nearest' \}\)/);
});

test('confidence feedback advances automatically after three seconds', () => {
  assert.match(app, /nextButton\.textContent = 'Next question\.\.\.'/);
  assert.match(app, /this\._advanceTimer = setTimeout\(\(\) => this\.nextCard\(\), 3000\)/);
  assert.match(app, /clearTimeout\(this\._advanceTimer\)/);
});

test('session startup supports the previous cached dashboard markup', () => {
  assert.match(app, /document\.getElementById\('start-session-btn'\)\s*\|\|\s*document\.querySelector/);
});
