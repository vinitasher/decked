/* Cloudflare Pages Function — start a Stripe Checkout session for the Pro
   subscription. Requires a valid Supabase JWT so the subscription can be
   attached to a user; the checkout session carries client_reference_id so
   the webhook knows who to grant. */

import { verifySupabaseJwt } from '../../shared/entitlement.js';
import { createServerRequestContext, logServerEvent } from '../../shared/server-logger.js';

const STRIPE_API = 'https://api.stripe.com/v1';

function jsonResponse(payload, status = 200, log, event = 'request completed') {
  if (log) {
    logServerEvent(log, event, { status }, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function baseUrl(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const log = createServerRequestContext('billing-checkout', request);

  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const claims = token ? await verifySupabaseJwt(token, env.SUPABASE_JWT_SECRET, env.SUPABASE_URL) : null;
  if (!claims) {
    return jsonResponse({ error: 'Sign in to upgrade to Pro.' }, 401, log, 'request rejected', { reason: 'Missing or invalid Supabase JWT.' });
  }

  const priceId = env.STRIPE_PRICE_ID?.trim();
  if (!priceId) {
    return jsonResponse({ error: 'Pro subscriptions are not configured yet.' }, 503, log, 'request rejected', { reason: 'STRIPE_PRICE_ID is not configured.' });
  }

  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    client_reference_id: claims.sub,
    'metadata[user_id]': claims.sub,
    'subscription_data[metadata][user_id]': claims.sub,
    success_url: `${baseUrl(request)}/?upgrade=success`,
    cancel_url: `${baseUrl(request)}/?upgrade=cancelled`
  });
  if (typeof claims.email === 'string' && claims.email) {
    body.set('customer_email', claims.email);
  }

  try {
    const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      logServerEvent(log, 'Stripe checkout creation failed', { status: response.status, detail }, 'error');
      return jsonResponse({ error: 'Could not start checkout. Please try again.' }, 502, log, 'request completed', { reason: 'Stripe checkout creation failed.' });
    }
    const session = await response.json();
    logServerEvent(log, 'Stripe checkout session created', { userId: claims.sub, sessionId: session.id });
    return jsonResponse({ ok: true, url: session.url }, 200, log, 'request completed', { sessionId: session.id });
  } catch (error) {
    logServerEvent(log, 'Stripe checkout creation threw', { error: error instanceof Error ? error.message : String(error) }, 'error');
    return jsonResponse({ error: 'Could not start checkout. Please try again.' }, 502, log, 'request completed', { reason: 'Stripe checkout creation threw.' });
  }
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, createServerRequestContext('billing-checkout', request), 'request rejected');
  }
  return onRequestPost(context);
}
