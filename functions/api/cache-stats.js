/* Cloudflare Pages Function — cache stats for the CARD_CACHE KV */

const PROFILE_PREFIX = 'profile:v1:';

export async function onRequest(context) {
  const { env } = context;
  try {
    const keys = env.CARD_CACHE ? await env.CARD_CACHE.list() : { keys: [] };
    const byTopic = {};
    const cardKeys = (keys.keys || []).filter(k => !k.name.startsWith(PROFILE_PREFIX));
    for (const k of cardKeys) {
      const topic = k.name.split(':')[0];
      byTopic[topic] = (byTopic[topic] || 0) + 1;
    }
    return new Response(JSON.stringify({ total: cardKeys.length, byTopic }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
