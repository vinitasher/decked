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

test('OAuth callbacks always return to the Cloudflare production app', () => {
  assert.match(app, /function getOAuthRedirectUrl\(\) \{/);
  assert.match(app, /return 'https:\/\/decked\.pages\.dev';/);
  assert.match(app, /signInWithOAuth\(\{ provider: 'github', redirectTo: getOAuthRedirectUrl\(\) \}\)/);
});

test('the hash router preserves Supabase OAuth response fragments', () => {
  assert.match(app, /function isOAuthCallbackHash\(hash = window\.location\.hash\) \{/);
  assert.match(app, /access_token\|refresh_token\|expires_at\|error\|error_description/);
  assert.match(app, /if \(SCREEN_ROUTES\.includes\(id\) && !isOAuthCallbackHash\(\)\) this\._syncScreen\(id\)/);
});

test('OAuth callback errors are surfaced instead of failing silently', () => {
  assert.match(app, /function getOAuthCallbackError\(hash = window\.location\.hash\) \{/);
  assert.match(app, /function renderAccountError\(message\) \{/);
  assert.match(app, /GitHub sign-in failed:/);
  assert.match(app, /sessionData = await supabaseClient\.auth\.getSession\(\)/);
  assert.match(app, /const authError = callbackError \|\| error\?\.message \|\| ''/);
});

test('app.js sends device id and bearer token headers on API calls', () => {
  assert.match(app, /function apiHeaders\(\) \{\s*const headers = \{\};/);
  assert.match(app, /headers\['X-Device-Id'\] = getOrCreateDeviceId\(\)/);
  assert.match(app, /if \(currentSession\?\.access_token\) headers\.Authorization = `Bearer \$\{currentSession\.access_token\}`/);
  assert.match(app, /api\/generate\?/, 'generate fetch');
  assert.match(app, /api\/wiki\?topic=/, 'wiki fetch');
  assert.match(app, /api\/sandbox\?topic=/, 'sandbox fetch');
  assert.match(app, /api\/quota/, 'quota fetch');
});

test('app.js synchronizes the identity-scoped learner profile through KV', () => {
  assert.match(app, /fetch\(`\$\{SERVER_BASE\}\/api\/profile`, \{ headers: apiHeaders\(\) \}\)/);
  assert.match(app, /method: 'PUT'/);
  assert.match(app, /body: JSON\.stringify\(\{ profile: this\.profile, clientUpdatedAt \}\)/);
  assert.match(app, /_profilePendingMigration/);
  assert.match(app, /_profileSyncReady/);
});

test('service worker never caches identity-scoped profile responses', () => {
  assert.match(serviceWorker, /url\.pathname === '\/api\/profile'/);
});

test('app.js handles quota-exceeded responses with an upgrade notice', () => {
  assert.match(app, /if \(res\.status === 429\) \{\s*const quotaBody = await res\.json\(\)\.catch\(\(\) => \(\{\}\)\);/);
  assert.match(app, /quotaBody\.code === 'quota_exceeded'\) this\.showQuotaNotice\('cards'\)/);
  assert.match(app, /quotaBody\.code === 'quota_exceeded'\) this\.showQuotaNotice\('wiki'\)/);
  assert.match(app, /body\.code === 'quota_exceeded'\) this\.showQuotaNotice\('sandbox'\)/);
  assert.match(app, /Daily card limit reached — <button[^>]*>Upgrade to Pro<\/button> for unlimited cards\./);
  assert.match(app, /Daily wiki limit reached — <button[^>]*>Upgrade to Pro<\/button> for unlimited entries\./);
  assert.match(app, /Daily generated-experiment limit reached — <button[^>]*>Upgrade to Pro<\/button> for unlimited generated experiments\./);
});

test('app.js wires sign-in, sign-out, and the checkout flow', () => {
  assert.match(app, /signInGithub\(\) \{\s*if \(!supabaseClient\) return;/);
  assert.match(app, /Sign in with GitHub/);
  assert.doesNotMatch(app, /Sign in with Google/);
  assert.doesNotMatch(app, /signInGoogle/);
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
  assert.match(css, /\.sandbox-generation-status \{/);
});

test('service worker cache version is bumped for the account assets', () => {
  assert.match(serviceWorker, /const CACHE = 'sdf-v28';/);
});

test('modern visual system keeps dashboard and study surfaces hooked together', () => {
  assert.match(html, /class="welcome-topline"/);
  assert.match(html, /class="intro welcome-hero"/);
  assert.match(html, /class="card-progress"/);
  assert.match(html, /class="bookmark-btn"/);
  assert.match(css, /--surface-strong: #101a30;/);
  assert.match(css, /\.welcome-hero \{/);
  assert.match(css, /\.diagram-placeholder \{/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.welcome-actions \{ flex-direction: column; \}/);
  assert.match(app, /class="achievement-pill/);
  assert.match(app, /class="review-item \$\{/);
});
