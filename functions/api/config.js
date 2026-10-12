/* Cloudflare Pages Function — public client configuration. Supabase URL and
   anon key, the Stripe price id, and the free-tier daily limits are all
   public by design; secrets never leave the server. Served as an endpoint
   because this app has no build step where VITE_* vars could be injected. */

import { freeLimit } from '../shared/entitlement.js';

export function onRequestGet(context) {
  const { env } = context;
  const client = env.ADSENSE_CLIENT_ID?.trim() || 'ca-pub-1421098160303360';
  const slot = env.ADSENSE_DASHBOARD_SLOT?.trim() || '';
  const adsense = env.ADSENSE_ENABLED === 'true' && env.ADSENSE_CONSENT_READY === 'true'
    && /^ca-pub-\d{16}$/.test(client) && /^\d{10}$/.test(slot)
    ? { client, slot } : null;
  return new Response(
    JSON.stringify({
      ok: true,
      supabaseUrl: env.SUPABASE_URL?.trim() || '',
      supabaseAnonKey: env.SUPABASE_ANON_KEY?.trim() || '',
      stripePriceId: env.STRIPE_PRICE_ID?.trim() || '',
      freeDailyCardLimit: freeLimit(env, 'cards'),
      freeDailyWikiLimit: freeLimit(env, 'wiki'),
      freeDailySandboxLimit: freeLimit(env, 'sandbox'),
      adsense,
      turnstileSiteKey: env.TURNSTILE_SITE_KEY?.trim() || ''
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    }
  );
}
