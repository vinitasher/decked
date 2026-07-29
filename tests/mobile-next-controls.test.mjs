import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('post-answer tray contains confidence and next-card controls', () => {
  const trayStart = html.indexOf('id="post-answer-actions"');
  const confidence = html.indexOf('id="confidence-buttons"');
  const next = html.indexOf('id="next-btn"');

  assert.ok(trayStart >= 0);
  assert.ok(confidence > trayStart);
  assert.ok(next > confidence);
  assert.match(html, /How difficult was this question\?/);
  assert.equal((html.match(/data-confidence="[1-4]"/g) || []).length, 4);
  assert.doesNotMatch(html, /onclick="APP\.rateConfidence/);
});

test('question header provides accessible dashboard navigation', () => {
  const sessionStart = html.indexOf('id="screen-session"');
  const header = html.indexOf('class="card-header"', sessionStart);
  const dashboard = html.indexOf('id="session-dashboard-btn"', header);
  const scenario = html.indexOf('id="scenario"', header);

  assert.ok(sessionStart >= 0);
  assert.ok(header > sessionStart);
  assert.ok(dashboard > header);
  assert.ok(dashboard < scenario);
  assert.match(html, /id="session-dashboard-btn"[^>]*aria-label="Back to dashboard"/);
  assert.match(css, /\.session-dashboard-btn \{[^}]*width: 32px;[^}]*height: 32px;/);
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

test('difficulty controls bind explicit click listeners', () => {
  assert.match(app, /document\.querySelectorAll\('\[data-confidence\]'\)/);
  assert.match(app, /button\.addEventListener\('click'/);
  assert.match(app, /this\.rateConfidence\(Number\(button\.dataset\.confidence\)\)/);
});

test('dashboard control binds to session exit', () => {
  assert.match(app, /getElementById\('session-dashboard-btn'\)/);
  assert.match(app, /addEventListener\('click', \(\) => this\.exitSession\(\)\)/);
});

test('difficulty transition occurs before persistence work', () => {
  const transition = app.indexOf("confidenceButtons.classList.add('hidden')");
  const timer = app.indexOf('this._advanceTimer = setTimeout(() => this.nextCard(), 3000)', transition);
  const persistence = app.indexOf('const review = this.getCardReview(card.id)', transition);

  assert.ok(transition >= 0);
  assert.ok(timer > transition);
  assert.ok(persistence > timer);
  assert.match(app, /if \(this\._confidenceSubmitted \|\| !Number\.isInteger\(confidence\)/);
  assert.match(app, /Unable to persist confidence feedback/);
  assert.match(app, /button\.disabled = false/);
});

test('service worker refreshes deployed assets and retains offline fallback', () => {
  assert.match(serviceWorker, /const CACHE = 'sdf-v5'/);
  assert.match(serviceWorker, /fetch\(e\.request\)/);
  assert.match(serviceWorker, /cache\.put\(e\.request, cachedResponse\)/);
  assert.match(serviceWorker, /\.catch\(\(\) => caches\.match\(e\.request\)/);
});

test('session startup supports the previous cached dashboard markup', () => {
  assert.match(app, /document\.getElementById\('start-session-btn'\)\s*\|\|\s*document\.querySelector/);
});
