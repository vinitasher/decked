/* Cloudflare Pages Function — Stripe webhook: verifies the signature and
   grants or revokes the Pro plan in KV. checkout.session.completed attaches
   the subscription to the user (client_reference_id); subscription events
   keep the mapping through the Stripe customer id. */

import { createServerRequestContext, logServerEvent } from '../../shared/server-logger.js';
import { userBillingKey } from '../../shared/entitlement.js';

const enc = new TextEncoder();

/* Stripe signs the raw body as `${t}.${body}` with HMAC-SHA256 using the
   webhook signing secret. The v1 signature is a hex digest. */
export async function verifyStripeSignature(secret, signatureHeader, rawBody, now = Date.now()) {
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(pair => {
      const [name, ...rest] = pair.split('=');
      return [name, rest.join('=')];
    })
  );
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;

  let key;
  try {
    key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return false;
  }
  const signedPayload = enc.encode(`${timestamp}.${rawBody}`);
  const expectedBytes = hexToBytes(expected);
  const valid = await crypto.subtle.verify('HMAC', key, expectedBytes, signedPayload);
  return valid;
}

export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function jsonResponse(payload, status = 200, log, event = 'request completed') {
  if (log) {
    logServerEvent(log, event, { status }, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function setPlan(env, userId, plan) {
  const key = userBillingKey(userId);
  if (!env.CARD_CACHE) return;
  if (plan === 'free') {
    await env.CARD_CACHE.delete(key);
    return;
  }
  await env.CARD_CACHE.put(key, JSON.stringify({
    plan: 'pro',
    status: 'active',
    updatedAt: new Date().toISOString()
  }));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const log = createServerRequestContext('billing-webhook', request);

  const rawBody = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  if (!(await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, signature, rawBody))) {
    logServerEvent(log, 'Stripe webhook signature rejected', {}, 'error');
    return jsonResponse({ error: 'Invalid signature' }, 400, log, 'request rejected', { reason: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, log, 'request rejected', { reason: 'Invalid JSON.' });
  }

  logServerEvent(log, 'Stripe webhook event received', { type: event.type });
  try {
    await handleEvent(env, event, log);
  } catch (error) {
    logServerEvent(log, 'Stripe webhook handling failed', { type: event.type, error: error instanceof Error ? error.message : String(error) }, 'error');
    return jsonResponse({ error: 'Webhook handling failed' }, 500, log, 'request completed');
  }

  return jsonResponse({ ok: true }, 200, log, 'request completed', { type: event.type });
}

async function handleEvent(env, event, log) {
  const { type, data } = event;

  if (type === 'checkout.session.completed') {
    const session = data?.object || {};
    const userId = session.client_reference_id;
    if (userId) {
      await setPlan(env, userId, 'pro');
      if (env.CARD_CACHE && session.customer) {
        await env.CARD_CACHE.put(`stripe:customer:${session.customer}`, userId);
      }
      if (env.CARD_CACHE && session.subscription) {
        await env.CARD_CACHE.put(`stripe:sub:${session.subscription}`, userId);
      }
      logServerEvent(log, 'Pro granted from checkout', { userId });
    }
    return;
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const subscription = data?.object || {};
    const userId = subscription.metadata?.user_id
      || (await lookupCustomerUser(env, subscription.customer))
      || (await lookupSubscriptionUser(env, subscription.id));
    if (!userId) {
      logServerEvent(log, 'Subscription event has no mapped user', { customer: subscription.customer, subscription: subscription.id }, 'warn');
      return;
    }
    if (type === 'customer.subscription.deleted' || subscription.status !== 'active') {
      await setPlan(env, userId, 'free');
      logServerEvent(log, 'Pro revoked', { userId, status: subscription.status });
    } else {
      await setPlan(env, userId, 'pro');
      logServerEvent(log, 'Pro confirmed', { userId, status: subscription.status });
    }
    return;
  }

  if (type === 'customer.subscription.created') {
    const subscription = data?.object || {};
    const userId = await lookupCustomerUser(env, subscription.customer) || subscription.metadata?.user_id;
    if (userId) {
      await setPlan(env, userId, 'pro');
      if (env.CARD_CACHE) {
        await env.CARD_CACHE.put(`stripe:sub:${subscription.id}`, userId);
      }
      logServerEvent(log, 'Pro granted from subscription created', { userId });
    }
    return;
  }
}

async function lookupCustomerUser(env, customerId) {
  if (!env.CARD_CACHE || !customerId) return null;
  return env.CARD_CACHE.get(`stripe:customer:${customerId}`);
}

async function lookupSubscriptionUser(env, subscriptionId) {
  if (!env.CARD_CACHE || !subscriptionId) return null;
  return env.CARD_CACHE.get(`stripe:sub:${subscriptionId}`);
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, createServerRequestContext('billing-webhook', request), 'request rejected');
  }
  return onRequestPost(context);
}
