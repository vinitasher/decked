/* Cloudflare Pages Function — generate flash cards using OpenCode Go */

const TOPIC_PREREQUISITES = {
  'api-design': [],
  dns: [],
  caching: ['api-design'],
  queues: ['api-design'],
  databases: ['api-design'],
  security: ['api-design'],
  loadbalancing: ['dns', 'api-design'],
  storage: ['databases'],
  messaging: ['queues'],
  'rate-limiting': ['api-design', 'caching'],
  observability: ['api-design'],
  'real-time': ['api-design', 'messaging'],
  consensus: ['databases', 'storage']
};

export function normalizeCard(card, topic, difficulty) {
  return {
    ...card,
    topic,
    difficulty,
    prerequisiteTopics: [...(TOPIC_PREREQUISITES[topic] || [])]
  };
}

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
        const parsed = JSON.parse(cached);
        const card = normalizeCard(parsed, topic, difficulty);
        if (JSON.stringify(card) !== JSON.stringify(parsed)) {
          await env.CARD_CACHE.put(cacheKey, JSON.stringify(card));
        }
        return new Response(JSON.stringify({ cached: true, card }), {
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
- prerequisiteTopics: ${JSON.stringify(TOPIC_PREREQUISITES[topic] || [])}
- scenario: a 2-3 sentence system design problem with concrete numbers (QPS, latency, data size). Must force a trade-off.
- nodes: array of 4-5 system components with real technology names.
- options: array of 4 objects {id, label}. Option B is correct. Each wrong option fails for a DIFFERENT reason (cost, consistency, latency).
- correct: "B"
- explanation: 3-5 sentences on why each other option fails and why B wins. Name specific bottlenecks and trade-offs.

CRITICAL: Output ONLY the JSON. No markdown, no explanation.`;

  try {
    if (!env.OPENCODE_API_KEY) {
      throw new Error('Card generation is not configured');
    }

    const models = [
      'deepseek-v4-flash',
      'deepseek-v4-flash',
      'deepseek-v4-flash',
      'deepseek-v4-pro'
    ];
    let completion;
    let providerError = '';

    for (let attempt = 0; attempt < models.length; attempt++) {
      const aiResponse = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENCODE_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'opencode/1.18.9'
        },
        body: JSON.stringify({
          model: models[attempt],
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
          temperature: 0.7
        })
      });

      if (aiResponse.ok) {
        completion = await aiResponse.json();
        break;
      }

      providerError = await aiResponse.text();
      console.error(
        'OpenCode card generation failed',
        models[attempt],
        aiResponse.status,
        providerError.slice(0, 500)
      );
      if (aiResponse.status !== 503) break;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }

    if (!completion) {
      throw new Error('Card generation provider is temporarily unavailable');
    }

    let text = completion?.choices?.[0]?.message?.content || '';
    // Extract JSON from response
    const cleaned = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('No JSON in response');
    }
    const generatedCard = JSON.parse(cleaned.substring(start, end + 1));

    // Validate required fields
    const required = ['id', 'topic', 'difficulty', 'prerequisiteTopics', 'scenario', 'nodes', 'options', 'correct', 'explanation'];
    for (const f of required) {
      if (generatedCard[f] === undefined || generatedCard[f] === null) {
        throw new Error(`Missing field: ${f}`);
      }
    }
    if (!Array.isArray(generatedCard.prerequisiteTopics)) {
      throw new Error('Invalid field: prerequisiteTopics');
    }

    const card = normalizeCard(generatedCard, topic, difficulty);

    // Cache in KV
    if (env.CARD_CACHE) {
      await env.CARD_CACHE.put(cacheKey, JSON.stringify(card));
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
