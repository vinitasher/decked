import assert from 'node:assert/strict';
import test from 'node:test';

import {
  verifySupabaseJwt,
  base64urlEncode,
  base64urlDecode,
  identityKey,
  resolveStableIdentity,
  dailyBucket,
  quotaKey,
  freeLimit,
  quotaEnabled,
  getUsage,
  consumeQuota,
  getBillingRecord,
  isProRecord,
  isPro,
  resolveEntitlement,
  DEFAULT_FREE_DAILY_CARD_LIMIT,
  DEFAULT_FREE_DAILY_WIKI_LIMIT
} from '../functions/shared/entitlement.js';

const enc = new TextEncoder();

async function signJwt(claims, secret, expOffsetSeconds = 3600) {
  const header = base64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64urlEncode(enc.encode(JSON.stringify({
    ...claims,
    exp: Math.floor(Date.now() / 1000) + expOffsetSeconds
  })));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64urlEncode(new Uint8Array(signature))}`;
}

function kvStore() {
  const store = new Map();
  return {
    get: async (key, type) => store.get(key)?.value ?? null,
    put: async (key, value, options) => { store.set(key, { value, options }); },
    delete: async key => { store.delete(key); },
    store
  };
}

function request(headers = {}) {
  return new Request('https://example.com/api/generate', { headers });
}

test('verifySupabaseJwt accepts a valid HS256 token and returns claims', async () => {
  const token = await signJwt({ sub: 'user-123', email: 'a@b.com', role: 'authenticated' }, 'jwt-secret');
  const claims = await verifySupabaseJwt(token, 'jwt-secret');
  assert.equal(claims.sub, 'user-123');
  assert.equal(claims.email, 'a@b.com');
});

test('verifySupabaseJwt rejects wrong secrets, garbage, and expired tokens', async () => {
  const token = await signJwt({ sub: 'user-123' }, 'jwt-secret');
  assert.equal(await verifySupabaseJwt(token, 'other-secret'), null);
  assert.equal(await verifySupabaseJwt('garbage.token.here', 'jwt-secret'), null);
  assert.equal(await verifySupabaseJwt(null, 'jwt-secret'), null);
  assert.equal(await verifySupabaseJwt(token, ''), null);
  const expired = await signJwt({ sub: 'user-123' }, 'jwt-secret', -3600);
  assert.equal(await verifySupabaseJwt(expired, 'jwt-secret'), null);
});

test('identityKey prefers the signed-in user, then device id, then IP', () => {
  assert.equal(identityKey(request({ 'X-Device-Id': 'dev-1' }), { sub: 'user-9' }), 'user:user-9');
  assert.equal(identityKey(request({ 'X-Device-Id': 'dev-1' }), null), 'dev:dev-1');
  assert.equal(identityKey(request({}), null), 'ip:unknown');
  assert.equal(identityKey(request({ 'CF-Connecting-IP': '1.2.3.4' }), null), 'ip:1.2.3.4');
});

test('resolveStableIdentity isolates signed-in and anonymous profile keys', async () => {
  const token = await signJwt({ sub: 'user-9' }, 'jwt-secret');
  const signedIn = await resolveStableIdentity(
    { SUPABASE_JWT_SECRET: 'jwt-secret' },
    request({ Authorization: `Bearer ${token}`, 'X-Device-Id': 'device-9' })
  );
  const anonymous = await resolveStableIdentity(
    {},
    request({ 'X-Device-Id': 'device-9' })
  );
  const missing = await resolveStableIdentity({}, request());
  const invalidDevice = await resolveStableIdentity({}, request({ 'X-Device-Id': 'bad id' }));

  assert.equal(signedIn.identity, 'user:user-9');
  assert.equal(signedIn.claims.sub, 'user-9');
  assert.equal(anonymous.identity, 'dev:device-9');
  assert.equal(anonymous.claims, null);
  assert.equal(missing.identity, null);
  assert.equal(invalidDevice.identity, null);
});

test('dailyBucket and quotaKey rotate with the UTC date', () => {
  const now = Date.UTC(2026, 7, 5, 23, 59, 59);
  assert.equal(dailyBucket(now), '2026-08-05');
  assert.equal(quotaKey('cards', 'dev:1', now), 'quota:cards:dev:1:2026-08-05');
  assert.equal(quotaKey('wiki', 'user:u', now + 1000), 'quota:wiki:user:u:2026-08-06');
});

test('freeLimit defaults to ten and honors env overrides and zero', () => {
  assert.equal(freeLimit({}, 'cards'), DEFAULT_FREE_DAILY_CARD_LIMIT);
  assert.equal(freeLimit({}, 'wiki'), DEFAULT_FREE_DAILY_WIKI_LIMIT);
  assert.equal(freeLimit({ FREE_DAILY_CARD_LIMIT: '25' }, 'cards'), 25);
  assert.equal(freeLimit({ FREE_DAILY_WIKI_LIMIT: '3' }, 'wiki'), 3);
  assert.equal(freeLimit({ FREE_DAILY_CARD_LIMIT: '0' }, 'cards'), 0);
  assert.equal(freeLimit({ FREE_DAILY_CARD_LIMIT: 'nope' }, 'cards'), 10);
  assert.equal(quotaEnabled({}, 'cards'), true);
  assert.equal(quotaEnabled({ FREE_DAILY_CARD_LIMIT: '0' }, 'cards'), false);
});

test('consumeQuota increments per identity and per kind and sets a TTL', async () => {
  const store = kvStore();
  const env = { CARD_CACHE: store };
  assert.equal(await consumeQuota(env, 'dev:1', 'cards'), 1);
  assert.equal(await consumeQuota(env, 'dev:1', 'cards'), 2);
  assert.equal(await consumeQuota(env, 'dev:1', 'wiki'), 1);
  assert.equal(await consumeQuota(env, 'dev:2', 'cards'), 1);
  assert.equal(await getUsage(env, 'dev:1', 'cards'), 2);
  const key = [...store.store.keys()].find(k => k.includes('dev:1'));
  assert.ok(key.includes(':cards:'));
  assert.ok(store.store.get(key).options.expirationTtl > 0 && store.store.get(key).options.expirationTtl < 3 * 86400);
});

test('billing records grant pro and free is the default', async () => {
  const store = kvStore();
  const env = { CARD_CACHE: store };
  assert.equal(await isPro(env, 'user:1'), false);
  assert.equal(isProRecord(await getBillingRecord(env, 'user:1')), false);

  store.store.set('billing:user:1', { value: JSON.stringify({ plan: 'pro', status: 'active' }) });
  assert.equal(await isPro(env, 'user:1'), true);

  store.store.set('billing:user:1', { value: JSON.stringify({ plan: 'pro', status: 'canceled' }) });
  assert.equal(await isPro(env, 'user:1'), false);
});

test('resolveEntitlement enforces the limit for anonymous and signed-in users', async () => {
  const store = kvStore();
  const now = Date.now();
  store.store.set(`quota:cards:dev:abc:${dailyBucket(now)}`, { value: '10' });
  const env = { CARD_CACHE: store, FREE_DAILY_CARD_LIMIT: '10' };
  const result = await resolveEntitlement(env, request({ 'X-Device-Id': 'abc' }), 'cards', now);
  assert.equal(result.identity, 'dev:abc');
  assert.equal(result.used, 10);
  assert.equal(result.limit, 10);
  assert.equal(result.remaining, 0);
  assert.equal(result.pro, false);
});

test('resolveEntitlement skips the limit for pro users', async () => {
  const store = kvStore();
  const now = Date.now();
  store.store.set(`quota:cards:user:u1:${dailyBucket(now)}`, { value: '999' });
  store.store.set('billing:user:u1', { value: JSON.stringify({ plan: 'pro', status: 'active' }) });
  const token = await signJwt({ sub: 'u1' }, 'jwt-secret');
  const env = { CARD_CACHE: store, SUPABASE_JWT_SECRET: 'jwt-secret' };
  const result = await resolveEntitlement(env, request({ Authorization: `Bearer ${token}` }), 'cards', now);
  assert.equal(result.identity, 'user:u1');
  assert.equal(result.pro, true);
  assert.equal(result.used, 0);
  assert.equal(result.remaining, 10);
});

test('base64url round trips bytes', () => {
  const bytes = enc.encode('hello world');
  assert.deepEqual(base64urlDecode(base64urlEncode(bytes)), bytes);
});
