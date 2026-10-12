/* Cloudflare Pages Function — report today's free-tier quota usage, remaining
   allowances, and the user's plan. Signed-in users are identified by their
   Supabase JWT; anonymous users by device id. */

import {
  resolveEntitlement,
  freeLimit,
  quotaEnabled,
  isProRecord,
  getBillingRecord
} from '../shared/entitlement.js';
import { dailyBucket } from '../shared/entitlement.js';
import { profileKey, parseProfileEnvelope } from './profile.js';
import { createServerRequestContext, logServerEvent } from '../shared/server-logger.js';

function jsonResponse(payload, status = 200, log, event = 'request completed') {
  if (log) {
    logServerEvent(log, event, { status }, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const log = createServerRequestContext('quota', request);

  const cards = await resolveEntitlement(env, request, 'cards');
  const wiki = await resolveEntitlement(env, request, 'wiki');
  const sandbox = await resolveEntitlement(env, request, 'sandbox');
  const billing = await getBillingRecord(env, cards.identity);
  const envelope = parseProfileEnvelope(await env.CARD_CACHE?.get(profileKey(cards.identity)));
  const questionsUsed = Math.max(0, Number(envelope?.profile?.dailyAnswers?.[dailyBucket()]) || 0);

  return jsonResponse(
    {
      ok: true,
      signedIn: Boolean(cards.claims),
      plan: isProRecord(billing) ? 'pro' : 'free',
      aiGenerationAllowed: cards.pro,
      cards: {
        enabled: quotaEnabled(env, 'cards'),
        limit: freeLimit(env, 'cards'),
        used: questionsUsed,
        remaining: Math.max(0, cards.limit - questionsUsed)
      },
      wiki: {
        enabled: quotaEnabled(env, 'wiki'),
        limit: freeLimit(env, 'wiki'),
        used: wiki.used,
        remaining: wiki.remaining
      },
      sandbox: {
        enabled: quotaEnabled(env, 'sandbox'),
        limit: freeLimit(env, 'sandbox'),
        used: sandbox.used,
        remaining: sandbox.remaining
      }
    },
    200,
    log,
    'request completed',
    { signedIn: Boolean(cards.claims), plan: isProRecord(billing) ? 'pro' : 'free' }
  );
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, createServerRequestContext('quota', request), 'request rejected');
  }
  return onRequestGet(context);
}
