/* Entitlement helpers — daily free-tier quotas and Supabase JWT verification
   for the System Design Flashcards app.

   Identity: signed-in users are keyed by their Supabase user id; anonymous
   users by a device id sent as X-Device-Id (falling back to client IP).
   Pro plans are stored in KV under `billing:` by the Stripe webhook. Quota
   counters live in KV under `quota:` and expire after three days, so each
   UTC date bucket naturally dies off after the day ends. */

export const DEFAULT_FREE_DAILY_CARD_LIMIT = 10;
export const DEFAULT_FREE_DAILY_WIKI_LIMIT = 10;

const enc = new TextEncoder();

export function base64urlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

export function base64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Verify a Supabase-signed HS256 JWT (the app's auth tokens are signed with
   the project's JWT secret). Returns the claims or null. */
export async function verifySupabaseJwt(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let key;
  try {
    key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return null;
  }
  const signature = base64urlDecode(signatureB64);
  const valid = await crypto.subtle.verify('HMAC', key, signature, enc.encode(`${headerB64}.${payloadB64}`));
  if (!valid) return null;

  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch {
    return null;
  }
  if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000) return null;
  if (!claims.sub) return null;
  return claims;
}

function requestDeviceId(request) {
  const deviceId = request.headers.get('X-Device-Id')?.trim() || '';
  return /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(deviceId) ? deviceId : '';
}

/* Resolve only identities that are stable enough for user-owned data. Quota
   callers may still use the IP fallback below, but profile data must never be
   keyed only by a shared network address. */
export async function resolveStableIdentity(env, request) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  let claims = null;
  try {
    claims = token ? await verifySupabaseJwt(token, env.SUPABASE_JWT_SECRET) : null;
  } catch (_) {
    claims = null;
  }
  if (typeof claims?.sub === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(claims.sub)) {
    return { identity: `user:${claims.sub}`, claims };
  }
  const deviceId = requestDeviceId(request);
  return { identity: deviceId ? `dev:${deviceId}` : null, claims: null };
}

/* Identity for quota keys: authenticated users are stable and tracked by
   Supabase id; anonymous users by their device id (with an IP fallback so
   requests without the header still get a bucket). */
export function identityKey(request, claims) {
  if (claims?.sub) return `user:${claims.sub}`;
  const deviceId = requestDeviceId(request);
  if (deviceId) return `dev:${deviceId}`;
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
  return `ip:${ip}`;
}

export function dailyBucket(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function quotaKey(kind, identity, now = Date.now()) {
  return `quota:${kind}:${identity}:${dailyBucket(now)}`;
}

export function freeLimit(env, kind) {
  const raw = kind === 'cards' ? env.FREE_DAILY_CARD_LIMIT : env.FREE_DAILY_WIKI_LIMIT;
  const parsed = Number.parseInt(raw ?? '', 10);
  if (raw === undefined || raw === null || raw === '') return kind === 'cards' ? DEFAULT_FREE_DAILY_CARD_LIMIT : DEFAULT_FREE_DAILY_WIKI_LIMIT;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : (kind === 'cards' ? DEFAULT_FREE_DAILY_CARD_LIMIT : DEFAULT_FREE_DAILY_WIKI_LIMIT);
}

/* An explicit limit of 0 disables the free quota entirely (used by tests and
   previews). */
export function quotaEnabled(env, kind) {
  return freeLimit(env, kind) > 0;
}

export async function getBillingRecord(env, identity) {
  if (!env.CARD_CACHE) return null;
  const raw = await env.CARD_CACHE.get(`billing:${identity}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* KV key for a signed-in user's billing record. The webhook stores plans
   under this key so entitlement lookups (which key users as user:<sub>)
   find them. */
export function userBillingKey(userId) {
  return `billing:user:${userId}`;
}

export function isProRecord(record) {
  return Boolean(record && record.plan === 'pro' && record.status === 'active');
}

export async function isPro(env, identity) {
  return isProRecord(await getBillingRecord(env, identity));
}

export async function getUsage(env, identity, kind, now = Date.now()) {
  if (!env.CARD_CACHE) return 0;
  const raw = await env.CARD_CACHE.get(quotaKey(kind, identity, now));
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/* Atomically claim one unit of a daily quota. Returns the new usage count.
   The counter expires three days out, which is enough for the date bucket to
   rotate while staying safe if a request straddles midnight. */
export async function consumeQuota(env, identity, kind, now = Date.now()) {
  if (!env.CARD_CACHE) return 0;
  const key = quotaKey(kind, identity, now);
  const current = await getUsage(env, identity, kind, now);
  const next = current + 1;
  const ttlSeconds = 3 * 24 * 60 * 60 - Math.floor(((now / 1000) % 86400));
  await env.CARD_CACHE.put(key, String(next), { expirationTtl: ttlSeconds });
  return next;
}

/* Resolve identity from the Authorization header when a valid Supabase JWT is
   present; otherwise fall back to the device/ip key. Returns { identity,
   claims, pro } and performs a quota check. */
export async function resolveEntitlement(env, request, kind, now = Date.now()) {
  const resolved = await resolveStableIdentity(env, request);
  const claims = resolved.claims;
  const identity = resolved.identity || identityKey(request, claims);
  const pro = await isPro(env, identity);
  const limit = freeLimit(env, kind);
  const used = pro ? 0 : await getUsage(env, identity, kind, now);
  return { identity, claims, pro, limit, used, remaining: Math.max(0, limit - used) };
}
