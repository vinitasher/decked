/* Cloudflare Pages Function — identity-scoped learner profile storage.
   Profiles are kept in the existing CARD_CACHE namespace under a separate
   prefix so generated-card, quota, billing, and feedback keys are unaffected. */

import { resolveStableIdentity } from '../shared/entitlement.js';
import { createServerRequestContext, logServerEvent } from '../shared/server-logger.js';

export const PROFILE_PREFIX = 'profile:v1:';
export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_PROFILE_BYTES = 2 * 1024 * 1024;

function jsonResponse(payload, status = 200, log, event = 'request completed') {
  if (log) {
    logServerEvent(log, event, { status }, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function profileKey(identity) {
  return `${PROFILE_PREFIX}${identity}`;
}

export function isValidProfileShape(profile) {
  if (!isPlainObject(profile)) return false;
  const objectFields = ['topicScores', 'cardHistory', 'streaks', '_topicCardSeen', 'topicAccuracy'];
  if (objectFields.some(field => profile[field] !== undefined && !isPlainObject(profile[field]))) return false;
  if (typeof profile.userId !== 'undefined' && typeof profile.userId !== 'string') return false;
  if (profile.seenScenarioFingerprints !== undefined && (
    !Array.isArray(profile.seenScenarioFingerprints)
      || profile.seenScenarioFingerprints.some(value => typeof value !== 'string')
  )) return false;
  if (profile.achievements !== undefined && (
    !Array.isArray(profile.achievements)
      || profile.achievements.some(value => typeof value !== 'string')
  )) return false;
  if (profile.topicScores && Object.values(profile.topicScores).some(value => !isPlainObject(value))) return false;
  if (profile.cardHistory && Object.values(profile.cardHistory).some(value => !isPlainObject(value))) return false;
  if (profile._topicCardSeen && Object.values(profile._topicCardSeen).some(value => (
    !Array.isArray(value) || value.some(item => typeof item !== 'string')
  ))) return false;
  if (profile.topicAccuracy && Object.values(profile.topicAccuracy).some(value => !Array.isArray(value))) return false;
  const numericFields = ['totalSessions', 'totalAnswered', 'totalCorrect'];
  if (numericFields.some(field => profile[field] !== undefined
      && (!Number.isFinite(profile[field]) || profile[field] < 0))) return false;
  return true;
}

export function normalizeProfilePayload(profile, identity) {
  if (!isValidProfileShape(profile)) return null;
  const normalized = JSON.parse(JSON.stringify(profile));
  normalized.userId = identity;
  return normalized;
}

export function parseProfileEnvelope(raw) {
  if (!raw) return null;
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch (_) {
    return null;
  }
  if (!isPlainObject(envelope)
      || envelope.schemaVersion !== PROFILE_SCHEMA_VERSION
      || !isPlainObject(envelope.profile)
      || !isValidProfileShape(envelope.profile)
      || !Number.isFinite(envelope.clientUpdatedAt)
      || envelope.clientUpdatedAt < 0
      || typeof envelope.updatedAt !== 'string') {
    return null;
  }
  return envelope;
}

async function resolveRequest(context) {
  const { request, env } = context;
  const log = createServerRequestContext('profile', request);
  const { identity } = await resolveStableIdentity(env, request);
  if (!identity) {
    return { error: jsonResponse({ error: 'A signed-in user or device identity is required.' }, 401, log, 'request rejected') };
  }
  if (!env.CARD_CACHE) {
    return { error: jsonResponse({ error: 'CARD_CACHE is not configured for this deployment.' }, 503, log, 'request rejected') };
  }
  return { request, env, log, identity };
}

export async function onRequestGet(context) {
  const resolved = await resolveRequest(context);
  if (resolved.error) return resolved.error;
  const { env, log, identity } = resolved;
  const raw = await env.CARD_CACHE.get(profileKey(identity));
  if (!raw) {
    return jsonResponse({ ok: true, profile: null, clientUpdatedAt: 0, updatedAt: null }, 200, log);
  }
  const envelope = parseProfileEnvelope(raw);
  if (!envelope) {
    return jsonResponse({ error: 'Stored profile is invalid and was not overwritten.' }, 500, log, 'request rejected');
  }
  return jsonResponse({ ok: true, ...envelope }, 200, log);
}

export async function onRequestPut(context) {
  const resolved = await resolveRequest(context);
  if (resolved.error) return resolved.error;
  const { request, env, log, identity } = resolved;
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_PROFILE_BYTES) {
    return jsonResponse({ error: 'Profile payload is too large.' }, 413, log, 'request rejected');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (_) {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400, log, 'request rejected');
  }
  const profile = normalizeProfilePayload(body?.profile, identity);
  const clientUpdatedAt = Number(body?.clientUpdatedAt);
  if (!profile || !Number.isFinite(clientUpdatedAt) || clientUpdatedAt < 0) {
    return jsonResponse({ error: 'Profile payload is invalid.' }, 400, log, 'request rejected');
  }

  const key = profileKey(identity);
  const existingRaw = await env.CARD_CACHE.get(key);
  if (existingRaw && !parseProfileEnvelope(existingRaw)) {
    return jsonResponse({ error: 'Stored profile is invalid and was not overwritten.' }, 500, log, 'request rejected');
  }
  const existing = parseProfileEnvelope(existingRaw);
  if (existing && existing.clientUpdatedAt > clientUpdatedAt) {
    return jsonResponse({ error: 'A newer profile is already stored.', ...existing }, 409, log, 'request rejected');
  }

  const envelope = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    clientUpdatedAt,
    profile
  };
  const serialized = JSON.stringify(envelope);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROFILE_BYTES) {
    return jsonResponse({ error: 'Profile payload is too large.' }, 413, log, 'request rejected');
  }
  await env.CARD_CACHE.put(key, serialized);
  return jsonResponse({ ok: true, ...envelope }, 200, log);
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PUT') return onRequestPut(context);
  return jsonResponse({ error: 'Method not allowed' }, 405,
    createServerRequestContext('profile', context.request), 'request rejected');
}
