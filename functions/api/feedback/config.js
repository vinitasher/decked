/* Cloudflare Pages Function — public feedback configuration for the client.
   The Turnstile site key is public by design; the secret key never leaves the
   server. Exposed as an endpoint because this app has no build step where a
   VITE_* env var could be injected. */

export function onRequestGet(context) {
  return new Response(
    JSON.stringify({
      ok: true,
      turnstileSiteKey: context.env.TURNSTILE_SITE_KEY?.trim() || ''
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
