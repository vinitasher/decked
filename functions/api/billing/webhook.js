/* Cloudflare Pages Function — Stripe webhook: verifies the signature and
   reconciles current subscription status before granting or revoking Pro.
   Successful event IDs suppress duplicate deliveries; failed reconciliations
   return an error so Stripe can retry. Customer/subscription mappings persist. */

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

export async function setPlan(env, userId, plan, subscriptionId = null) {
  const key = userBillingKey(userId);
  if (!env.CARD_CACHE) return;
  if (plan === 'free') {
    await env.CARD_CACHE.delete(key);
    return;
  }
  await env.CARD_CACHE.put(key, JSON.stringify({
    plan: 'pro',
    status: 'active',
    subscriptionId,
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

async function reconcileSubscription(env, subscriptionId, userId) {
  if (!env.STRIPE_SECRET_KEY || !subscriptionId) throw new Error('Subscription reconciliation is not configured.');
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
  });
  if (!response.ok) throw new Error('Could not retrieve current subscription state.');
  const subscription = await response.json();
  if (subscription.id !== subscriptionId || typeof subscription.status !== 'string') {
    throw new Error('Stripe returned an invalid subscription.');
  }
  if (subscription.status === 'active') {
    await setPlan(env, userId, 'pro', subscriptionId);
  } else {
    const current = JSON.parse(await env.CARD_CACHE.get(userBillingKey(userId)) || 'null');
    // An older subscription must not revoke access granted by another one.
    if (!current?.subscriptionId || current.subscriptionId === subscriptionId) await setPlan(env, userId, 'free');
  }
}

async function handleEvent(env, event, log) {
  const relevant = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
  if (!relevant.includes(event.type)) return;
  if (!env.CARD_CACHE) throw new Error('Billing storage is not configured.');
  const eventKey = typeof event.id === 'string' ? `stripe:event:${event.id}` : null;
  if (eventKey && await env.CARD_CACHE.get(eventKey)) return;
  const object = event.data?.object || {};
  const checkout = event.type === 'checkout.session.completed';
  const subscriptionId = checkout ? object.subscription : object.id;
  const userId = checkout ? object.client_reference_id : object.metadata?.user_id
    || await lookupCustomerUser(env, object.customer)
    || await lookupSubscriptionUser(env, subscriptionId);
  if (!userId) throw new Error('Subscription event has no mapped user; retry after checkout mapping.');
  if (object.customer) await env.CARD_CACHE.put(`stripe:customer:${object.customer}`, userId);
  if (subscriptionId) await env.CARD_CACHE.put(`stripe:sub:${subscriptionId}`, userId);
  await reconcileSubscription(env, subscriptionId, userId);
  if (eventKey) await env.CARD_CACHE.put(eventKey, 'processed');
  logServerEvent(log, 'Current subscription reconciled', { userId, subscriptionId });
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
