// Provider behavior tests run as a verified, paid account. Free-tier denial
// tests call the production handlers directly.
import { base64urlEncode } from '../../functions/shared/entitlement.js';

export async function proContext(context) {
  if (context.request.headers.has('Authorization')) return context;
  const secret = 'provider-test-secret';
  const encode = value => base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'provider-test', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = base64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
  const headers = new Headers(context.request.headers);
  headers.set('Authorization', `Bearer ${payload}.${signature}`);
  const cache = context.env.CARD_CACHE;
  return { ...context, request: new Request(context.request, { headers }), env: {
    ...context.env, SUPABASE_JWT_SECRET: secret,
    CARD_CACHE: {
      ...cache,
      get: async key => key === 'billing:user:provider-test'
        ? JSON.stringify({ plan: 'pro', status: 'active' }) : cache?.get(key) ?? null,
      put: (...args) => cache?.put(...args)
    }
  } };
}
