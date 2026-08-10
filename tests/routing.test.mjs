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
  assert.match(appSource, /if \(SCREEN_ROUTES\.includes\(id\)\) this\._syncScreen\(id\);/);
  assert.match(appSource, /showScreen\(route\)/);
  assert.match(appSource, /_currentRoute\(\) \|\| 'welcome'/);
});

test('session pages without an active session fall back to the dashboard', () => {
  assert.match(appSource, /route === 'session' \|\| route === 'session-end'\) && this\.sessionCards\.length === 0/);
  assert.match(appSource, /route = 'welcome';/);
});

test('wiki topics are deep-linkable at #/wiki/<topic>', () => {
  assert.match(appSource, /#\\\/wiki\\\/\(\[\\w-\]\+\)/);
  assert.match(appSource, /_navigate\('wiki\/' \+ encodeURIComponent\(topic\)\)/);
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
  return app;
}

test('the router parses the current screen from the hash', () => {
  assert.equal(routerApp('')._currentRoute(), null);
  assert.equal(routerApp('#/search')._currentRoute(), 'search');
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

test('a deep link to #/wiki/<topic> opens that topic', () => {
  const app = routerApp('#/wiki/queues');
  let topic = null;
  app.showWiki = t => { topic = t; };
  app._handleHashChange();
  assert.equal(topic, 'queues');
  assert.equal(app._currentRoute(), 'wiki');
});

test('navigating to a routable screen updates the hash', () => {
  const app = routerApp('');
  app._handleHashChange();
  assert.equal(app._currentRoute(), 'welcome');
});
