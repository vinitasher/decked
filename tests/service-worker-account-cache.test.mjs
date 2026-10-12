import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('account API requests bypass service-worker caching while learning content remains cacheable', () => {
  const handlers = {};
  let intercepted = false;
  vm.runInNewContext(source, {
    self: { location: { origin: 'https://example.com' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    URL, Response,
    fetch: async () => new Response('Offline', { status: 503 }),
    caches: { match: async () => undefined }
  });
  for (const path of ['/api/quota', '/api/profile', '/api/billing/status', '/api/feedback/config']) {
    intercepted = false;
    handlers.fetch({ request: new Request(`https://example.com${path}`), respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, `${path} must never return another account's cached response`);
  }
  handlers.fetch({ request: new Request('https://example.com/api/wiki?topic=caching'), respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, true);
});
