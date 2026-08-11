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

test('the session layout gives the diagram a full-height right-side panel', () => {
  const sessionStart = html.indexOf('id="screen-session"');
  const layout = html.indexOf('class="session-layout"', sessionStart);
  const main = html.indexOf('class="session-main"', layout);
  const diagram = html.indexOf('class="session-diagram"', main);
  const container = html.indexOf('id="diagram-container"', diagram);

  assert.ok(layout > sessionStart);
  assert.ok(main > layout);
  assert.ok(diagram > main);
  assert.ok(container > diagram);
  assert.match(html, /<aside class="session-diagram"[^>]*aria-label="Architecture diagram">/);
  assert.match(css, /\.session-diagram \{[\s\S]*?position: sticky;[\s\S]*?max-height: calc\(100vh - 24px\);[\s\S]*?overflow: auto;/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.session-diagram \{ position: static;/);
});

test('the diagram panel owns its title and peek control', () => {
  const sessionStart = html.indexOf('id="screen-session"');
  const header = html.indexOf('class="card-header"', sessionStart);
  const prerequisites = html.indexOf('id="card-prerequisites"', header);
  const layout = html.indexOf('class="session-layout"', prerequisites);
  const aside = html.indexOf('class="session-diagram"', layout);
  const panelHeader = html.indexOf('class="diagram-panel-header"', aside);
  const peek = html.indexOf('id="diagram-peek-btn"', panelHeader);
  const container = html.indexOf('id="diagram-container"', panelHeader);

  assert.ok(header > sessionStart);
  assert.ok(prerequisites > header);
  assert.ok(layout > prerequisites);
  assert.ok(aside > layout);
  assert.ok(panelHeader > aside);
  assert.ok(peek > panelHeader && peek < container, 'peek control lives in the diagram panel');
  assert.match(html, /<div class="diagram-panel-header">\s*<strong>System design<\/strong>/);
  assert.match(html, /<aside class="session-diagram"[^>]*>[\s\S]*<div id="diagram-container">/);
  assert.match(css, /#diagram-container \{ margin: 8px 0 0;/);
  assert.match(css, /\.session-diagram \{[\s\S]*?padding: 0 14px 14px;/);
  assert.match(css, /\.diagram-panel-header \{ display: flex; align-items: center; justify-content: space-between;/);
  assert.doesNotMatch(app, /Peek at Diagram/); // the placeholder no longer embeds a peek button
});

test('wide monitors expand the app container and give the panel the extra room', () => {
  assert.match(css, /@media \(min-width: 1100px\)[\s\S]*\.container \{ max-width: 1440px; \}/);
  assert.match(css, /@media \(min-width: 1100px\)[\s\S]*\.session-main \{ max-width: 780px; \}/);
});

test('homepage study actions share a row when there is room and stack on phones', () => {
  const welcome = html.indexOf('id="screen-welcome"');
  const actions = html.indexOf('class="welcome-actions"', welcome);
  const start = html.indexOf('id="start-session-btn"', actions);
  const resume = html.indexOf('id="resume-btn"', actions);
  const quickReview = html.indexOf('APP.startQuickReview()', actions);

  assert.ok(actions > welcome);
  assert.ok(start > actions);
  assert.ok(resume > start);
  assert.ok(quickReview > resume);
  assert.match(css, /\.welcome-actions \{ display: flex; gap: 12px;/);
  assert.match(css, /\.welcome-actions \.btn \{ flex: 1 1 190px;/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.welcome-actions \{ flex-direction: column; \}/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.welcome-actions \.btn \{ flex: 0 0 auto; width: 100%; \}/);
});

test('homepage progress components stay within a readable width', () => {
  const welcome = html.indexOf('id="screen-welcome"');
  const progress = html.indexOf('class="progress-section"', welcome);
  const goal = html.indexOf('id="study-goal"', progress);
  const achievements = html.indexOf('class="achievements-section"', goal);
  const list = html.indexOf('id="achievement-list"', achievements);

  assert.ok(progress > welcome);
  assert.ok(goal > progress);
  assert.ok(achievements > goal);
  assert.ok(list > achievements);
  assert.match(css, /\.progress-section \{ width: 100%; max-width: 860px; margin: 0 auto; \}/);
  assert.match(css, /\.study-goal \{ margin: 12px 0; padding: 12px;/);
  assert.match(css, /#achievement-list \{ display: flex; flex-wrap: wrap; gap: 6px;/);
});

test('profile does not expose data transfer or study reminder controls', () => {
  assert.doesNotMatch(html, /Export Data|Import Data|id="import-file"|Enable Study Reminders|id="study-reminder"/);
  assert.doesNotMatch(app, /exportProfile\(|importProfile\(|enableNudges\(|sendNudge\(|_requestNotificationPermission\(/);
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
  assert.match(serviceWorker, /fetch\(e\.request\)/);
  assert.match(serviceWorker, /cache\.put\(e\.request, cachedResponse\)/);
  assert.match(serviceWorker, /\.catch\(\(\) => caches\.match\(e\.request\)/);
});

test('session startup supports the previous cached dashboard markup', () => {
  assert.match(app, /document\.getElementById\('start-session-btn'\)\s*\|\|\s*document\.querySelector/);
});
