import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('dashboard hosts the account bar, quota bar, and upgrade banner', () => {
  assert.match(html, /<div id="account-bar" class="account-bar hidden"><\/div>/);
  assert.match(html, /<div id="upgrade-banner" class="upgrade-banner hidden"><\/div>/);
  assert.match(html, /<div id="quota-bar" class="quota-bar hidden"><\/div>/);
});

test('supabase client is loaded before app.js', () => {
  const supabaseScript = html.indexOf('@supabase/supabase-js');
  const appScript = html.indexOf('src="js/app.js"');
  assert.ok(supabaseScript >= 0);
  assert.ok(supabaseScript < appScript);
});

test('app.js initializes accounts from the runtime config', () => {
  assert.match(app, /fetch\(`\$\{SERVER_BASE\}\/api\/config`\)/);
  assert.match(app, /supabaseClient = window\.supabase\.createClient\(appConfig\.supabaseUrl, appConfig\.supabaseAnonKey\)/);
  assert.match(app, /supabaseClient\.auth\.getSession\(\)/);
  assert.match(app, /supabaseClient\.auth\.onAuthStateChange/);
  assert.match(app, /initAccount\(\)/);
});

test('app.js sends device id and bearer token headers on API calls', () => {
  assert.match(app, /function apiHeaders\(\) \{\s*const headers = \{\};/);
  assert.match(app, /headers\['X-Device-Id'\] = getOrCreateDeviceId\(\)/);
  assert.match(app, /if \(currentSession\?\.access_token\) headers\.Authorization = `Bearer \$\{currentSession\.access_token\}`/);
  assert.match(app, /api\/generate\?/, 'generate fetch');
  assert.match(app, /api\/wiki\?topic=/, 'wiki fetch');
  assert.match(app, /api\/quota/, 'quota fetch');
});

test('app.js handles quota-exceeded responses with an upgrade notice', () => {
  assert.match(app, /if \(res\.status === 429\) \{\s*const quotaBody = await res\.json\(\)\.catch\(\(\) => \(\{\}\)\);/);
  assert.match(app, /quotaBody\.code === 'quota_exceeded'\) this\.showQuotaNotice\('cards'\)/);
  assert.match(app, /quotaBody\.code === 'quota_exceeded'\) this\.showQuotaNotice\('wiki'\)/);
  assert.match(app, /Daily card limit reached — <button[^>]*>Upgrade to Pro<\/button> for unlimited cards\./);
  assert.match(app, /Daily wiki limit reached — <button[^>]*>Upgrade to Pro<\/button> for unlimited entries\./);
});

test('app.js wires sign-in, sign-out, and the checkout flow', () => {
  assert.match(app, /signInGoogle\(\) \{\s*if \(!supabaseClient\) return;/);
  assert.match(app, /signInWithOAuth\(\{ provider: 'google', redirectTo: 'https:\/\/decked\.pages\.dev' \}\)/);
  assert.match(app, /signInGithub\(\) \{\s*if \(!supabaseClient\) return;/);
  assert.match(app, /signInWithOAuth\(\{ provider: 'github', redirectTo: 'https:\/\/decked\.pages\.dev' \}\)/);
  assert.match(app, /Sign in with GitHub/);
  assert.match(app, /signOut\(\) \{\s*if \(supabaseClient\) supabaseClient\.auth\.signOut\(\);/);
  assert.match(app, /api\/billing\/checkout/);
  assert.match(app, /window\.location\.href = body\.url;/);
  assert.match(app, /handleUpgradeReturn\(\)/);
  assert.match(app, /upgrade'\) === 'success'/);
});

test('styles exist for the account bar, plan badge, quota bar, and upgrade banner', () => {
  assert.match(css, /\.account-bar \{ display: flex;/);
  assert.match(css, /\.account-chip \{ display: inline-flex;/);
  assert.match(css, /\.plan-badge\.plan-pro \{ background: var\(--success\); color: #fff; \}/);
  assert.match(css, /\.quota-bar \{ display: flex;/);
  assert.match(css, /\.upgrade-banner \{ margin: 8px 0 12px;/);
});

test('service worker cache version is bumped for the account assets', () => {
});
