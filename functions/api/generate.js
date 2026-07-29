/* Cloudflare Pages Function — generate flash cards using Workers AI */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic') || 'caching';
  const difficulty = parseInt(url.searchParams.get('difficulty')) || 3;
  const cacheKey = `${topic}:${difficulty}`;

  // Check KV cache
  if (env.CARD_CACHE) {
    const cached = await env.CARD_CACHE.get(cacheKey);
    if (cached) {
      try {
        return new Response(JSON.stringify({ cached: true, card: JSON.parse(cached) }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (_) {}
    }
  }

  // Build the AI prompt
  const prompt = `Generate a system design flash card for the topic "${topic}" at difficulty ${difficulty}/5 (5 = hardest).

Return a JSON object with these exact keys:
- id: "${topic}-gen-${Date.now()}"
- topic: "${topic}"
- difficulty: ${difficulty}
- scenario: a 2-3 sentence system design problem with concrete numbers (QPS, latency, data size). Must force a trade-off.
- nodes: array of 4-5 system components with real technology names.
- options: array of 4 objects {id, label}. Option B is correct. Each wrong option fails for a DIFFERENT reason (cost, consistency, latency).
- correct: "B"
- explanation: 3-5 sentences on why each other option fails and why B wins. Name specific bottlenecks and trade-offs.

CRITICAL: Output ONLY the JSON. No markdown, no explanation.`;

  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.7
    });

    let text = aiResponse?.response || aiResponse?.choices?.[0]?.message?.content || '';
    // Extract JSON from response
    const cleaned = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('No JSON in response');
    }
    const card = JSON.parse(cleaned.substring(start, end + 1));

    // Validate required fields
    const required = ['id', 'topic', 'difficulty', 'scenario', 'nodes', 'options', 'correct', 'explanation'];
    for (const f of required) {
      if (!card[f]) throw new Error(`Missing field: ${f}`);
    }

    // Normalize
    card.topic = topic;
    card.difficulty = difficulty;

    // Cache in KV
    if (env.CARD_CACHE) {
      await env.CARD_CACHE.put(cacheKey, JSON.stringify(card), { expirationTtl: 86400 * 30 });
    }

    return new Response(JSON.stringify({ cached: false, card }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
