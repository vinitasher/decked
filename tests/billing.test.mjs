import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  onRequest as webhookOnRequest,
  verifyStripeSignature
} from '../functions/api/billing/webhook.js';
import { onRequest as checkoutOnRequest } from '../functions/api/billing/checkout.js';
import { onRequest as quotaOnRequest } from '../functions/api/quota.js';
import { onRequestGet as configOnRequestGet } from '../functions/api/config.js';

const enc = new TextEncoder();

function kvStore() {
  const store = new Map();
  let now = Date.now();
  return {
    get: async key => {
      const entry = store.get(key);
      if (!entry || (entry.expiresAt && entry.expiresAt <= now)) return null;
      return entry.value;
    },
    put: async (key, value, options) => {
      store.set(key, { value, options, expiresAt: options?.expirationTtl ? now + options.expirationTtl * 1000 : null });
    },
    delete: async key => { store.delete(key); },
    advanceDays: days => { now += days * 24 * 3600 * 1000; },
    store
  };
}

function stripeSignature(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

async function signJwt(claims) {
  const base64url = bytes => Buffer.from(bytes).toString('base64url');
  const header = base64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(enc.encode(JSON.stringify({ sub: 'user-42', email: 'pro@example.com', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })));
  const key = await crypto.subtle.importKey('raw', enc.encode('jwt-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

async function postWebhook(store, event) {
  const body = JSON.stringify(event);
  return webhookOnRequest({
    request: new Request('https://example.com/api/billing/webhook', {
      method: 'POST', headers: { 'Stripe-Signature': stripeSignature('whsec_test', body) }, body
    }),
    env: { CARD_CACHE: store, STRIPE_WEBHOOK_SECRET: 'whsec_test' }
  });
}

test('verifyStripeSignature accepts a valid signature and rejects bad ones', async () => {
  const body = JSON.stringify({ type: 'checkout.session.completed' });
  const signature = stripeSignature('whsec_test', body);
  assert.equal(await verifyStripeSignature('whsec_test', signature, body), true);
  assert.equal(await verifyStripeSignature('whsec_other', signature, body), false);
  assert.equal(await verifyStripeSignature('whsec_test', 'garbage', body), false);
  assert.equal(await verifyStripeSignature('', signature, body), false);
  const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
  const stale = stripeSignature('whsec_test', body, oldTimestamp);
  assert.equal(await verifyStripeSignature('whsec_test', stale, body), false, 'timestamps older than 5 minutes are rejected');
});

test('checkout.session.completed grants Pro to the client_reference_id user', async () => {
  const store = kvStore();
  const event = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_123', client_reference_id: 'user-42', customer: 'cus_1', subscription: 'sub_1' } }
  });
  const response = await webhookOnRequest({
    request: new Request('https://example.com/api/billing/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': stripeSignature('whsec_test', event) },
      body: event
    }),
    env: { CARD_CACHE: store, STRIPE_WEBHOOK_SECRET: 'whsec_test' }
  });
  assert.equal(response.status, 200);
  const record = JSON.parse(store.store.get('billing:user:user-42').value);
  assert.equal(record.plan, 'pro');
  assert.equal(record.status, 'active');
  assert.ok(store.store.has('stripe:customer:cus_1'));
  assert.ok(store.store.has('stripe:sub:sub_1'));
  assert.equal(store.store.get('stripe:customer:cus_1').options, undefined);
  assert.equal(store.store.get('stripe:sub:sub_1').options, undefined);
});

test('subscription.created writes a durable subscription mapping', async () => {
  const store = kvStore();
  await postWebhook(store, { type: 'checkout.session.completed', data: { object: { client_reference_id: 'user-8', customer: 'cus_8' } } });
  await postWebhook(store, { type: 'customer.subscription.created', data: { object: { id: 'sub_8', customer: 'cus_8', status: 'active' } } });
  assert.equal(store.store.get('stripe:sub:sub_8').value, 'user-8');
  assert.equal(store.store.get('stripe:sub:sub_8').options, undefined);
});

test('subscription.deleted revokes Pro after eight days without metadata', async () => {
  const store = kvStore();
  await postWebhook(store, { type: 'checkout.session.completed', data: { object: { client_reference_id: 'user-9', customer: 'cus_9' } } });
  store.advanceDays(8);
  const response = await postWebhook(store, { type: 'customer.subscription.deleted', data: { object: { id: 'sub_9', customer: 'cus_9', status: 'canceled' } } });
  assert.equal(response.status, 200);
  assert.equal(store.store.has('billing:user:user-9'), false);
});

test('non-active subscription.updated revokes Pro after eight days without metadata', async () => {
  const store = kvStore();
  await postWebhook(store, { type: 'checkout.session.completed', data: { object: { client_reference_id: 'user-10', customer: 'cus_10' } } });
  store.advanceDays(8);
  const response = await postWebhook(store, { type: 'customer.subscription.updated', data: { object: { id: 'sub_10', customer: 'cus_10', status: 'past_due' } } });
  assert.equal(response.status, 200);
  assert.equal(store.store.has('billing:user:user-10'), false);
});

test('customer.subscription.deleted revokes Pro', async () => {
  const store = kvStore();
  store.store.set('billing:user:user-7', { value: JSON.stringify({ plan: 'pro', status: 'active' }) });
  const event = JSON.stringify({
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_9', customer: 'cus_9', status: 'canceled', metadata: { user_id: 'user-7' } } }
  });
  const response = await webhookOnRequest({
    request: new Request('https://example.com/api/billing/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': stripeSignature('whsec_test', event) },
      body: event
    }),
    env: { CARD_CACHE: store, STRIPE_WEBHOOK_SECRET: 'whsec_test' }
  });
  assert.equal(response.status, 200);
  assert.equal(store.store.has('billing:user:user-7'), false, 'billing record removed on cancellation');
});

test('customer.subscription.updated with a non-active status revokes Pro', async () => {
  const store = kvStore();
  store.store.set('billing:user:user-3', { value: JSON.stringify({ plan: 'pro', status: 'active' }) });
  const event = JSON.stringify({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_3', customer: 'cus_3', status: 'past_due', metadata: { user_id: 'user-3' } } }
  });
  await webhookOnRequest({
    request: new Request('https://example.com/api/billing/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': stripeSignature('whsec_test', event) },
      body: event
    }),
    env: { CARD_CACHE: store, STRIPE_WEBHOOK_SECRET: 'whsec_test' }
  });
  assert.equal(store.store.has('billing:user:user-3'), false);
});

test('webhook rejects requests with an invalid signature', async () => {
  const store = kvStore();
  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } });
  const response = await webhookOnRequest({
    request: new Request('https://example.com/api/billing/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': 't=1,v1=deadbeef' },
      body: event
    }),
    env: { CARD_CACHE: store, STRIPE_WEBHOOK_SECRET: 'whsec_test' }
  });
  assert.equal(response.status, 400);
  assert.equal([...store.store.keys()].length, 0, 'nothing written on invalid signature');
});

test('checkout requires a signed-in user', async () => {
  const response = await checkoutOnRequest({
    request: new Request('https://example.com/api/billing/checkout', { method: 'POST' }),
    env: { SUPABASE_JWT_SECRET: 'jwt-secret', STRIPE_PRICE_ID: 'price_1' }
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'Sign in to upgrade to Pro.');
});

test('checkout creates a Stripe session with the user as client_reference_id', async () => {
  const originalFetch = globalThis.fetch;
  let requestSeen = null;
  globalThis.fetch = async (url, options) => {
    requestSeen = { url, options, body: new URLSearchParams(options.body) };
    return Response.json({ id: 'cs_99', url: 'https://checkout.stripe.com/c/pay/cs_99' }, { status: 200 });
  };
  try {
    const token = await signJwt({});
    const response = await checkoutOnRequest({
      request: new Request('https://decked.pages.dev/api/billing/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }),
      env: { SUPABASE_JWT_SECRET: 'jwt-secret', STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID: 'price_1' }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_99');
    assert.equal(requestSeen.url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(requestSeen.body.get('client_reference_id'), 'user-42');
    assert.equal(requestSeen.body.get('metadata[user_id]'), 'user-42');
    assert.equal(requestSeen.body.get('subscription_data[metadata][user_id]'), 'user-42');
    assert.equal(requestSeen.body.get('line_items[0][price]'), 'price_1');
    assert.equal(requestSeen.body.get('mode'), 'subscription');
    assert.equal(requestSeen.body.get('customer_email'), 'pro@example.com');
    assert.match(requestSeen.body.get('success_url'), /decked\.pages\.dev\/\?upgrade=success/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkout accepts a Supabase ES256 session token', async () => {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  Object.assign(jwk, { kid: 'billing-key', alg: 'ES256', use: 'sig' });
  const base64url = bytes => Buffer.from(bytes).toString('base64url');
  const header = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: 'billing-key' })));
  const payload = base64url(enc.encode(JSON.stringify({
    sub: 'es-buyer', iss: 'https://billing-auth.example/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 3600
  })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, enc.encode(`${header}.${payload}`));
  const token = `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
  const originalFetch = globalThis.fetch;
  let stripeBody;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://billing-auth.example/auth/v1/.well-known/jwks.json') return Response.json({ keys: [jwk] });
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    stripeBody = new URLSearchParams(options.body);
    return Response.json({ id: 'cs_es', url: 'https://checkout.stripe.com/c/pay/cs_es' });
  };
  try {
    const response = await checkoutOnRequest({
      request: new Request('https://decked.pages.dev/api/billing/checkout', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      }),
      env: { SUPABASE_URL: 'https://billing-auth.example', STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID: 'price_1' }
    });
    assert.equal(response.status, 200);
    assert.equal(stripeBody.get('client_reference_id'), 'es-buyer');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkout reports 503 when the price is not configured', async () => {
  const token = await signJwt({});
  const response = await checkoutOnRequest({
    request: new Request('https://example.com/api/billing/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }),
    env: { SUPABASE_JWT_SECRET: 'jwt-secret' }
  });
  assert.equal(response.status, 503);
});

test('quota endpoint reports usage, limits, and plan', async () => {
  const store = kvStore();
  store.store.set('billing:user:user-42', { value: JSON.stringify({ plan: 'pro', status: 'active' }) });
  const token = await signJwt({});
  const response = await quotaOnRequest({
    request: new Request('https://example.com/api/quota', {
      headers: { Authorization: `Bearer ${token}` }
    }),
    env: { CARD_CACHE: store, SUPABASE_JWT_SECRET: 'jwt-secret' }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.signedIn, true);
  assert.equal(body.plan, 'pro');
  assert.equal(body.cards.limit, 10);
  assert.equal(body.cards.remaining, 10);
  assert.equal(body.wiki.limit, 10);
  assert.equal(body.sandbox.limit, 3);
  assert.equal(body.sandbox.remaining, 3);
});

test('quota endpoint tracks anonymous device usage and rejects non-GET', async () => {
  const store = kvStore();
  const response = await quotaOnRequest({
    request: new Request('https://example.com/api/quota', { headers: { 'X-Device-Id': 'dev-1' } }),
    env: { CARD_CACHE: store }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.signedIn, false);
  assert.equal(body.plan, 'free');
  assert.equal(body.sandbox.limit, 3);
  assert.equal(body.sandbox.used, 0);

  const post = await quotaOnRequest({
    request: new Request('https://example.com/api/quota', { method: 'POST' }),
    env: { CARD_CACHE: store }
  });
  assert.equal(post.status, 405);
});

test('public config exposes the generated Sandbox daily limit', async () => {
  const response = configOnRequestGet({
    env: {
      FREE_DAILY_SANDBOX_LIMIT: '6',
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      STRIPE_PRICE_ID: 'price_test'
    }
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.freeDailySandboxLimit, 6);
  assert.equal(body.freeDailyCardLimit, 10);
  assert.equal(body.freeDailyWikiLimit, 10);
});
