import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('footer offers a send-feedback button that opens a modal, not an external link', () => {
  const footer = html.indexOf('<footer>');
  const footerBtn = html.indexOf('class="footer-btn"', footer);
  assert.ok(footerBtn > footer);
  assert.match(html, /<button[^>]*class="footer-btn"[^>]*onclick="APP\.openFeedbackModal\(\)"/);
  assert.doesNotMatch(html.slice(footer), /<a\s/);
});

test('feedback modal contains title, details, five categories, contact, and a turnstile container', () => {
  const modalStart = html.indexOf('id="feedback-modal"');
  assert.ok(modalStart >= 0);
  assert.match(html, /<input id="feedback-title"[^>]*maxlength="120"[^>]*required/);
  assert.match(html, /<textarea id="feedback-text"[^>]*maxlength="10000"[^>]*required/);
  assert.ok(html.indexOf('id="feedback-category"') > modalStart);
  for (const category of ['bug', 'idea', 'ux', 'content', 'other']) {
    assert.match(html, new RegExp(`<option value="${category}">`));
  }
  assert.match(html, /<input id="feedback-contact"[^>]*maxlength="120"/);
  assert.ok(html.indexOf('id="feedback-turnstile"') > modalStart);
  assert.match(html, /<form id="feedback-form"[^>]*onsubmit="return APP\.submitFeedback\(event\)"/);
});

test('feedback form styles exist for fields, labels, turnstile, and the footer button', () => {
  assert.match(css, /\.feedback-field \{[^}]*display: block;[^}]*width: 100%;/);
  assert.match(css, /\.feedback-label \{ display: block; font-weight: 600; /);
  assert.match(css, /\.feedback-turnstile \{ margin: 6px 0 12px;/);
  assert.match(css, /\.footer-btn \{[^}]*color: var\(--muted\);[^}]*text-decoration: underline;[^}]*cursor: pointer;/);
});

test('app.js loads the Turnstile site key from the runtime config endpoint', () => {
  assert.match(app, /fetch\(`\$\{SERVER_BASE\}\/api\/feedback\/config`\)/);
  assert.match(app, /feedbackSiteKey = body\.turnstileSiteKey \|\| ''/);
  assert.match(app, /renderTurnstile\(\)/);
  assert.match(app, /window\.turnstile\.render\(container/);
  assert.match(app, /sitekey: feedbackSiteKey/);
  assert.match(app, /expired-callback/);
});

test('app.js submits the full feedback payload with device id and turnstile token', () => {
  assert.match(app, /getOrCreateDeviceId\(\)/);
  assert.match(app, /localStorage\.getItem\('sdf_device_id'\)/);
  assert.match(app, /JSON\.stringify\(\{[\s\S]*?\bcategory,[\s\S]*?\btitle,[\s\S]*?\bdetails,[\s\S]*?\bcontact,[\s\S]*?\bpagePath[\s\S]*?\buserId[\s\S]*?\bturnstileToken\s*\}/);
  assert.match(app, /Complete the verification challenge before submitting\./);
  assert.match(app, /window\.turnstile\.reset\(turnstileWidgetId\)/);
  assert.match(app, /window\.turnstile\.remove\(turnstileWidgetId\)/);
});

test('service worker cache version is bumped for the feedback assets', () => {
  assert.match(serviceWorker, /const CACHE = 'sdf-v13'/);
});
