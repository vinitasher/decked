import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../functions/api/config.js';

const source = await readFile(new URL('../js/ads.js', import.meta.url), 'utf8');
const config = { client: 'ca-pub-1234567890123456', slot: '1234567890' };
function fixture() {
  const host = { hidden: true, classList: { add() { host.hidden = true; }, remove() { host.hidden = false; } } };
  const slot = { children: [], replaceChildren(...children) { this.children = children; } };
  const scripts = [];
  const ctx = {
    window: {},
    document: {
      getElementById: id => id === 'free-ad' ? host : slot,
      createElement: tag => ({ tag, style: {}, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } }),
      head: { appendChild: script => scripts.push(script) }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(`${source}; globalThis.ads = FreeAds;`, ctx);
  return { ctx, host, slot, scripts, ads: ctx.ads };
}

test('AdSense stays disabled without complete configuration and consent setup', async () => {
  const env = { ADSENSE_ENABLED: 'true', ADSENSE_CLIENT_ID: config.client, ADSENSE_DASHBOARD_SLOT: config.slot };
  assert.equal((await onRequestGet({ env }).json()).adsense, null);
  env.ADSENSE_CONSENT_READY = 'true';
  assert.deepEqual((await onRequestGet({ env }).json()).adsense, config);
  env.ADSENSE_CLIENT_ID = '<script>';
  assert.equal((await onRequestGet({ env }).json()).adsense, null);
});

test('paid, unknown-plan, and unconfigured users never load an ad script', async () => {
  const f = fixture();
  await f.ads.render(config, false);
  await f.ads.render(null, true);
  assert.equal(f.scripts.length, 0);
  assert.equal(f.host.hidden, true);
});

test('free dashboard mounts one ad, and leaving removes the placement', async () => {
  const f = fixture();
  const pending = f.ads.render(config, true);
  assert.equal(f.scripts.length, 1);
  f.scripts[0].onload();
  await pending;
  assert.equal(f.host.hidden, false);
  assert.equal(f.slot.children.length, 1);
  assert.equal(f.slot.children[0].attrs['data-ad-slot'], config.slot);
  await f.ads.render(config, true);
  assert.equal(f.ctx.window.adsbygoogle.length, 1);
  await f.ads.render(config, false);
  assert.equal(f.slot.children.length, 0);
  assert.equal(f.host.hidden, true);
});

test('an ad loading during navigation or a Pro upgrade cannot mount late', async () => {
  const f = fixture();
  const pending = f.ads.render(config, true);
  await f.ads.render(config, false);
  f.scripts[0].onload();
  await pending;
  assert.equal(f.host.hidden, true);
  assert.equal(f.slot.children.length, 0);
  assert.equal(f.ctx.window.adsbygoogle, undefined);
});

test('blocked ad scripts leave practice usable without an empty ad box', async () => {
  const f = fixture();
  const pending = f.ads.render(config, true);
  f.scripts[0].onerror(new Error('blocked'));
  await pending;
  assert.equal(f.host.hidden, true);
  assert.equal(f.slot.children.length, 0);
});
