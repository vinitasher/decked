import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = (await readFile(new URL('../js/app.js', import.meta.url), 'utf8'))
  .replace("document.addEventListener('DOMContentLoaded', () => APP.init());", '');

const screenIds = [...html.matchAll(/<div id="screen-([\w-]+)"/g)].map(m => m[1]);

test('every screen has its own URL route', () => {
  assert.ok(screenIds.length >= 10, 'expected at least the 10 main screens');
  for (const id of screenIds) {
    assert.match(appSource, new RegExp(`SCREEN_ROUTES = \\[[\\s\\S]*?'${id}'[\\s\\S]*?\\]`), `${id} is not URL-addressable`);
  }
});

test('showScreen keeps the address bar in sync and routing is hash-driven', () => {
  assert.match(appSource, /window\.addEventListener\('hashchange', \(\) => this\._handleHashChange\(\)\)/);
  assert.match(appSource, /if \(SCREEN_ROUTES\.includes\(id\) && !isOAuthCallbackHash\(\)\) this\._syncScreen\(id\);/);
  assert.match(appSource, /showScreen\(route\)/);
  assert.match(appSource, /_currentRoute\(\) \|\| 'welcome'/);
});

test('session pages without an active session fall back to the dashboard', () => {
  assert.match(appSource, /route === 'session' \|\| route === 'session-end'\) && this\.sessionCards\.length === 0/);
  assert.match(appSource, /route = 'welcome';/);
});

test('Concept Lab topics are deep-linkable at #/concept/<topic> with a Wiki alias', () => {
  assert.match(appSource, /route === 'concept' \|\| route === 'wiki'/);
  assert.match(appSource, /route === 'concept' \? '#\/concept\/' : '#\/wiki\//);
  assert.match(appSource, /_navigate\('concept\/'.*encodeURIComponent/);
});

function routerApp(hash) {
  const context = vm.createContext({
    window: { location: { hostname: 'test', hash }, scrollTo() {} },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    WIKI: { caching: { title: 'Caching' }, queues: { title: 'Queues' } },
    console, Math, Date, JSON
  });
  vm.runInContext(`${appSource}; globalThis.APP = APP;`, context);
  const app = Object.create(context.APP);
  app.sessionCards = [];
  app.renderDeckStats = () => {};
  app.testLocation = context.window.location;
  return app;
}

test('the router parses the current screen from the hash', () => {
  assert.equal(routerApp('')._currentRoute(), null);
  assert.equal(routerApp('#/search')._currentRoute(), 'search');
  assert.equal(routerApp('#/concepts')._currentRoute(), 'concepts');
  assert.equal(routerApp('#/concept/caching')._currentRoute(), 'concept');
  assert.equal(routerApp('#/wiki')._currentRoute(), 'wiki');
  assert.equal(routerApp('#/not-a-screen')._currentRoute(), null);
});

test('navigating writes the canonical hash exactly once', () => {
  const location = { hostname: 'test', hash: '#/search' };
  const context = vm.createContext({
    window: { location },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    WIKI: {},
    console, Math, Date, JSON
  });
  vm.runInContext(`${appSource}; globalThis.APP = APP;`, context);
  const app = Object.create(context.APP);
  app._navigate('bookmarks');
  assert.equal(location.hash, '#/bookmarks');
  app._navigate('bookmarks');
  assert.equal(location.hash, '#/bookmarks');
  app._syncScreen('bookmarks');
  assert.equal(location.hash, '#/bookmarks');
});

test('a deep link to #/session with no session shows the dashboard', () => {
  const app = routerApp('#/session');
  app._handleHashChange();
  assert.equal(app._currentRoute(), 'welcome');
});

test('an OAuth access-token fragment is preserved while the account initializes', () => {
  const callbackHash = '#access_token=oauth-token&refresh_token=refresh-token';
  const app = routerApp(callbackHash);
  app._handleHashChange();
  assert.equal(app._currentRoute(), null);
  assert.equal(app.testLocation.hash, callbackHash);
});

test('a legacy deep link to #/wiki/<topic> opens the Concept Lab child', () => {
  const app = routerApp('#/wiki/queues');
  let topic = null;
  app.openConcept = (t) => { topic = t; };
  app._handleHashChange();
  assert.equal(topic, 'queues');
  assert.equal(app._currentRoute(), 'wiki');
});

test('a Concept Lab deep link opens the selected child', () => {
  const app = routerApp('#/concept/caching');
  let topic = null;
  app.openConcept = t => { topic = t; };
  app._handleHashChange();
  assert.equal(topic, 'caching');
  assert.equal(app._currentRoute(), 'concept');
});

test('navigating to a routable screen updates the hash', () => {
  const app = routerApp('');
  app._handleHashChange();
  assert.equal(app._currentRoute(), 'welcome');
});
