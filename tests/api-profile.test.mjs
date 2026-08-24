import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PROFILE_BYTES,
  onRequest,
  profileKey
} from '../functions/api/profile.js';
import { base64urlEncode } from '../functions/shared/entitlement.js';

const enc = new TextEncoder();

function kvStore() {
  const store = new Map();
  return {
    get: async key => store.get(key)?.value ?? null,
    put: async (key, value, options) => { store.set(key, { value, options }); },
    delete: async key => { store.delete(key); },
    store
  };
}

function env(store = kvStore(), overrides = {}) {
  return { CARD_CACHE: store, SUPABASE_JWT_SECRET: 'jwt-secret', ...overrides };
}

function profile(totalAnswered = 1) {
  return {
    userId: 'local-profile',
    topicScores: {},
    cardHistory: {},
    streaks: { current: 0, best: 0, lastDate: null },
    totalSessions: 1,
    totalAnswered,
    totalCorrect: totalAnswered,
    _topicCardSeen: {},
    seenScenarioFingerprints: []
  };
}

function request(method = 'GET', headers = {}, body) {
  return new Request('https://example.com/api/profile', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function signJwt(sub, secret = 'jwt-secret') {
  const header = base64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64urlEncode(enc.encode(JSON.stringify({
    sub,
    exp: Math.floor(Date.now() / 1000) + 3600
  })));
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64urlEncode(new Uint8Array(signature))}`;
}

test('profile endpoint requires a stable identity and KV binding', async () => {
  const missingIdentity = await onRequest({
    request: request(),
    env: env()
  });
  assert.equal(missingIdentity.status, 401);

  const missingKv = await onRequest({
    request: request('GET', { 'X-Device-Id': 'device-1' }),
    env: env(undefined, { CARD_CACHE: undefined })
  });
  assert.equal(missingKv.status, 503);
});

test('anonymous profiles round-trip under the device-scoped key', async () => {
  const store = kvStore();
  const saved = await onRequest({
    request: request('PUT', { 'X-Device-Id': 'device-1' }, { profile: profile(), clientUpdatedAt: 100 }),
    env: env(store)
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.profile.userId, 'dev:device-1');
  assert.ok(store.store.has(profileKey('dev:device-1')));

  const loaded = await onRequest({
    request: request('GET', { 'X-Device-Id': 'device-1' }),
    env: env(store)
  });
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).profile.userId, 'dev:device-1');
});

test('authenticated profiles use the verified subject and stay isolated', async () => {
  const store = kvStore();
  const userOne = await signJwt('user-one');
  const userTwo = await signJwt('user-two');
  const saved = await onRequest({
    request: request('PUT', {
      Authorization: `Bearer ${userOne}`,
      'X-Device-Id': 'spoofed-device'
    }, { profile: profile(3), clientUpdatedAt: 100 }),
    env: env(store)
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).profile.userId, 'user:user-one');

  const otherUser = await onRequest({
    request: request('GET', { Authorization: `Bearer ${userTwo}`, 'X-Device-Id': 'spoofed-device' }),
    env: env(store)
  });
  assert.equal(otherUser.status, 200);
  assert.equal((await otherUser.json()).profile, null);

  const originalUser = await onRequest({
    request: request('GET', { Authorization: `Bearer ${userOne}`, 'X-Device-Id': 'another-device' }),
    env: env(store)
  });
  assert.equal((await originalUser.json()).profile.totalAnswered, 3);
});

test('stale profile writes are rejected without replacing newer progress', async () => {
  const store = kvStore();
  const first = profile(1);
  const second = profile(2);
  await onRequest({
    request: request('PUT', { 'X-Device-Id': 'device-2' }, { profile: first, clientUpdatedAt: 200 }),
    env: env(store)
  });
  const stale = await onRequest({
    request: request('PUT', { 'X-Device-Id': 'device-2' }, { profile: second, clientUpdatedAt: 100 }),
    env: env(store)
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).profile.totalAnswered, 1);
  const stored = JSON.parse(store.store.get(profileKey('dev:device-2')).value);
  assert.equal(stored.profile.totalAnswered, 1);
});

test('malformed and oversized payloads do not overwrite an existing profile', async () => {
  const store = kvStore();
  const headers = { 'X-Device-Id': 'device-3' };
  await onRequest({
    request: request('PUT', headers, { profile: profile(4), clientUpdatedAt: 100 }),
    env: env(store)
  });
  const original = store.store.get(profileKey('dev:device-3')).value;

  const malformed = await onRequest({
    request: new Request('https://example.com/api/profile', {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: 'not-json'
    }),
    env: env(store)
  });
  assert.equal(malformed.status, 400);

  const wrongShape = await onRequest({
    request: request('PUT', headers, { profile: { cardHistory: [] }, clientUpdatedAt: 300 }),
    env: env(store)
  });
  assert.equal(wrongShape.status, 400);

  const nestedWrongShape = await onRequest({
    request: request('PUT', headers, {
      profile: { topicScores: { caching: [] } }, clientUpdatedAt: 350
    }),
    env: env(store)
  });
  assert.equal(nestedWrongShape.status, 400);

  const oversized = await onRequest({
    request: request('PUT', headers, {
      profile: { ...profile(), padding: 'x'.repeat(MAX_PROFILE_BYTES) }, clientUpdatedAt: 400
    }),
    env: env(store)
  });
  assert.equal(oversized.status, 413);
  assert.equal(store.store.get(profileKey('dev:device-3')).value, original);
});

test('invalid stored profiles are never overwritten', async () => {
  const store = kvStore();
  store.store.set(profileKey('dev:device-4'), { value: '{bad json' });
  const response = await onRequest({
    request: request('PUT', { 'X-Device-Id': 'device-4' }, { profile: profile(), clientUpdatedAt: 100 }),
    env: env(store)
  });
  assert.equal(response.status, 500);
  assert.equal(store.store.get(profileKey('dev:device-4')).value, '{bad json');
});
