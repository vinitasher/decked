/* Cloudflare Pages Function — cache stats for the CARD_CACHE KV */

export async function onRequest(context) {
  const { env } = context;
  try {
    const keys = env.CARD_CACHE ? await env.CARD_CACHE.list() : { keys: [] };
    const byTopic = {};
    for (const k of keys.keys || []) {
      const topic = k.name.split(':')[0];
      byTopic[topic] = (byTopic[topic] || 0) + 1;
    }
    return new Response(JSON.stringify({ total: keys.keys?.length || 0, byTopic }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
