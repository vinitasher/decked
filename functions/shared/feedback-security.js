/* Feedback security helpers — fixed-window per-IP rate limiting and Cloudflare
   Turnstile verification. Mirrors the system-design playground's
   feedbackSecurity pattern. */

export const FEEDBACK_RATE_LIMIT_MAX = 5;
export const FEEDBACK_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

export async function enforceFeedbackRateLimit(store, headers) {
  const ip = getClientIp(headers);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / FEEDBACK_RATE_LIMIT_WINDOW_SECONDS) * FEEDBACK_RATE_LIMIT_WINDOW_SECONDS;
  const key = `feedback-rate:${windowStart}:${ip}`;
  const current = await store.get(key, 'text');
  const currentCount = parseCount(current);
  const nextCount = currentCount + 1;

  if (nextCount > FEEDBACK_RATE_LIMIT_MAX) {
    const retryAfterSeconds = windowStart + FEEDBACK_RATE_LIMIT_WINDOW_SECONDS - now;
    return {
      allowed: false,
      currentCount,
      retryAfterSeconds: Math.max(1, retryAfterSeconds)
    };
  }

  await store.put(key, String(nextCount), { expirationTtl: FEEDBACK_RATE_LIMIT_WINDOW_SECONDS + 60 });
  return {
    allowed: true,
    currentCount: nextCount,
    retryAfterSeconds: null
  };
}

export async function verifyTurnstileToken(options) {
  const secretKey = options.secretKey.trim();
  if (!secretKey) {
    return { allowed: true, reason: null };
  }

  const token = options.token.trim();
  if (!token) {
    return { allowed: false, reason: 'Turnstile verification is required.' };
  }

  const payload = new URLSearchParams({
    secret: secretKey,
    response: token,
    remoteip: getClientIp(options.headers)
  });

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString()
    });

    if (!response.ok) {
      return { allowed: false, reason: `Turnstile verification failed (${response.status} ${response.statusText}).` };
    }

    const result = await response.json().catch(() => null);
    if (!result?.success) {
      const codes = Array.isArray(result?.['error-codes']) ? result['error-codes'].join(', ') : '';
      return { allowed: false, reason: `Turnstile verification failed${codes ? `: ${codes}` : ''}.` };
    }
  } catch {
    return { allowed: false, reason: 'Turnstile verification could not be completed.' };
  }

  return { allowed: true, reason: null };
}

export function getClientIp(headers) {
  const cfConnectingIp = readHeader(headers, 'cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = readHeader(headers, 'x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';

  const xRealIp = readHeader(headers, 'x-real-ip');
  if (xRealIp) return xRealIp;

  return 'unknown';
}

function parseCount(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readHeader(headers, name) {
  if (headers && typeof headers.get === 'function') {
    return headers.get(name)?.trim() || null;
  }
  if (headers && typeof headers === 'object') {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== lowerName) continue;
      if (Array.isArray(value)) return value.join(',').trim() || null;
      if (typeof value === 'string') return value.trim() || null;
    }
  }
  return null;
}
