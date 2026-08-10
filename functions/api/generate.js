/* Cloudflare Pages Function — generate flash cards using OpenCode Go */

import { resolveEntitlement, consumeQuota } from '../shared/entitlement.js';
import { countScenarioRequirements, difficultyFromScenario } from '../shared/requirement-count.js';

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

const OPTION_IDS = ['A', 'B', 'C', 'D'];
const MAX_POOL_SIZE = 20;
const MAX_EXCLUSIONS = 100;

export function scenarioFingerprint(scenario) {
  return typeof scenario === 'string'
    ? scenario.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';
}

export function selectCorrectLetter(random = Math.random) {
  const value = Number(random());
  const bounded = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
  return OPTION_IDS[Math.min(Math.floor(bounded * OPTION_IDS.length), OPTION_IDS.length - 1)];
}

export function buildPrompt(topic, difficulty, designatedCorrect, now = Date.now()) {
  return `Generate a system design flash card for the topic "${topic}" at difficulty ${difficulty}/5 (5 = hardest).

Return a JSON object with these exact keys:
- id: "${topic}-gen-${now}"
- topic: "${topic}"
- difficulty: ${difficulty}
- prerequisiteTopics: the aggregate list of topics needed to understand the whole question.
- scenario: a 2-3 sentence system design problem with concrete numbers (QPS, latency, data size). Must force a trade-off. The scenario must contain exactly ${difficulty} distinct requirements (quantified SLAs, throughput targets, latency budgets, data volumes, consistency guarantees, or deadlines).
- nodes: array of 4-5 system components with real technology names.
- flows: array of directed edges {from, to, verb, kind} describing the base architecture in the scenario. from/to are node names, verb is the action ("requests", "publishes", "queries", "caches", "acks"), kind is "sync", "async", or "callback". Every node must appear in at least one flow; keep the topology realistic (fan-out, callbacks, back-edges), never a plain linear chain when the architecture is not one.
- options: array of exactly 4 objects {id, label, prerequisiteTopics, flows}, with ids A, B, C, D. Each option's flows array describes the exact wiring that option implies ({from, to, verb, kind} edges between nodes, using only the nodes that option connects, consistent with the option label); omit the flows key entirely when an option has no specific wiring — never send an empty array. Each option needs 2-4 prerequisite concepts required to evaluate its trade-off. Use specific lowercase kebab-case concepts such as "cache-invalidation", "replication-lag", or "message-ordering"; never use a technology/product name merely because it appears in the option, and avoid broad categories such as "databases", "caching", or "api-design". Do not include "${topic}". Option ${designatedCorrect} is correct. Each wrong option fails for a DIFFERENT reason (cost, consistency, latency).
- prerequisiteTopics must include the union of all four options' prerequisiteTopics.
- correct: "${designatedCorrect}"
- explanation: 3-5 sentences on why each other option fails and why ${designatedCorrect} wins. Name specific bottlenecks and trade-offs.

CRITICAL: Output ONLY the JSON. No markdown, no explanation.`;
}

function normalizeTopics(topics, cardTopic) {
  return [...new Set(Array.isArray(topics) ? topics : [])]
    .filter(topic =>
      typeof topic === 'string' &&
      topic !== cardTopic &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)
    );
}

export function normalizeCard(card, topic, difficulty) {
  const options = Array.isArray(card.options)
    ? card.options.map(option => ({
        ...option,
        prerequisiteTopics: normalizeTopics(option.prerequisiteTopics, topic)
      }))
    : [];
  const prerequisiteTopics = normalizeTopics([
    ...(TOPIC_PREREQUISITES[topic] || []),
    ...(Array.isArray(card.prerequisiteTopics) ? card.prerequisiteTopics : []),
    ...options.flatMap(option => option.prerequisiteTopics)
  ], topic);

  return {
    ...card,
    topic,
    /* The true difficulty is derived from the scenario's requirement count,
       never taken from the request: a card cached under any key keeps its
       honest rating no matter which difficulty bucket served it. */
    difficulty: difficultyFromScenario(card?.scenario),
    prerequisiteTopics,
    options
  };
}

export function deduplicatePool(cards, limit = MAX_POOL_SIZE) {
  const newest = [];
  const fingerprints = new Set();

  for (let index = cards.length - 1; index >= 0; index--) {
    const card = cards[index];
    const fingerprint = scenarioFingerprint(card?.scenario);
    if (!fingerprint || fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    newest.unshift(card);
    if (newest.length === limit) break;
  }

  return newest;
}

export function normalizeCacheValue(value, topic, difficulty) {
  let cards;
  if (value && Array.isArray(value.cards)) {
    cards = value.cards;
  } else if (value && typeof value === 'object' && !Array.isArray(value) && value.scenario !== undefined) {
    cards = [value];
  } else {
    cards = [];
  }

  return {
    cards: deduplicatePool(
      cards
        .filter(card => card && typeof card === 'object' && !Array.isArray(card))
        .map(card => normalizeCard(card, topic, difficulty))
    )
  };
}

function parseExclusions(searchParams) {
  const exclusions = new Set();
  for (const value of searchParams.getAll('exclude')) {
    const fingerprint = scenarioFingerprint(value);
    if (!fingerprint || fingerprint.length > 500) continue;
    exclusions.add(fingerprint);
    if (exclusions.size === MAX_EXCLUSIONS) break;
  }
  return exclusions;
}

/* Server-side diagnostic log: one KV entry per request (collision-free random
   key) plus one entry per failed provider attempt. Readable with
   `bash /home/pi/bin/decked-logs`. Tolerates a missing binding so preview
   environments without GEN_LOG keep working. */
function logEntry(context, entry) {
  const { env } = context;
  if (!env.GEN_LOG) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = `genlog:${day}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const write = env.GEN_LOG.put(key, JSON.stringify(entry), { expirationTtl: 604800 });
  // waitUntil keeps the write alive after the response is returned; a bare
  // fire-and-forget promise gets cancelled when the request completes.
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(write);
  } else {
    write.catch(() => {});
  }
}

export function validateGeneratedCard(generatedCard, designatedCorrect) {
  const required = ['id', 'topic', 'difficulty', 'prerequisiteTopics', 'scenario', 'nodes', 'flows', 'options', 'correct', 'explanation'];
  for (const field of required) {
    if (generatedCard[field] === undefined || generatedCard[field] === null) {
      throw new Error(`Missing field: ${field}`);
    }
  }
  if (!scenarioFingerprint(generatedCard.scenario)) {
    throw new Error('Invalid field: scenario');
  }
  if (!Array.isArray(generatedCard.prerequisiteTopics)) {
    throw new Error('Invalid field: prerequisiteTopics');
  }
  if (!Array.isArray(generatedCard.nodes) || generatedCard.nodes.length < 3) {
    throw new Error('Invalid field: nodes');
  }
  if (!Array.isArray(generatedCard.flows) || generatedCard.flows.length < generatedCard.nodes.length - 1) {
    throw new Error('Invalid field: flows');
  }
  const nodeSet = new Set(generatedCard.nodes);
  for (const flow of generatedCard.flows) {
    if (!flow || typeof flow.from !== 'string' || typeof flow.to !== 'string'
        || !nodeSet.has(flow.from) || !nodeSet.has(flow.to) || flow.from === flow.to) {
      throw new Error('Invalid field: flows must reference distinct node names');
    }
  }
  for (const node of generatedCard.nodes) {
    if (!generatedCard.flows.some(flow => flow.from === node || flow.to === node)) {
      throw new Error(`Invalid field: node "${node}" appears in no flow`);
    }
  }
  if (
    !Array.isArray(generatedCard.options) ||
    generatedCard.options.length !== OPTION_IDS.length ||
    !OPTION_IDS.every(id => generatedCard.options.some(option => option?.id === id))
  ) {
    throw new Error('Invalid field: options');
  }
  if (!generatedCard.options.every(option => Array.isArray(option.prerequisiteTopics))) {
    throw new Error('Invalid field: option prerequisiteTopics');
  }
  if (!generatedCard.options.every(option =>
    option.prerequisiteTopics.length >= 2 && option.prerequisiteTopics.length <= 4
  )) {
    throw new Error('Each option needs 2-4 prerequisite concepts');
  }
  if (generatedCard.options.some(option => option.flows !== undefined && !Array.isArray(option.flows))) {
    throw new Error('Invalid field: option flows must be arrays when present');
  }
  if (generatedCard.correct !== designatedCorrect) {
    throw new Error(`Invalid field: correct must match designated option ${designatedCorrect}`);
  }
  if (countScenarioRequirements(generatedCard.scenario).count < 1) {
    throw new Error('Scenario must contain at least one concrete requirement');
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic') || 'caching';
  const difficulty = parseInt(url.searchParams.get('difficulty')) || 3;
  const cacheKey = `${topic}:${difficulty}`;
  const exclusions = parseExclusions(url.searchParams);
  const forceGeneration = url.searchParams.get('force') === '1';
  const startedAt = Date.now();
  let pool = { cards: [] };
  let storedValue = null;
  let cacheNeedsRewrite = false;

  if (env.CARD_CACHE) {
    storedValue = await env.CARD_CACHE.get(cacheKey);
    if (storedValue) {
      try {
        const parsed = JSON.parse(storedValue);
        pool = normalizeCacheValue(parsed, topic, difficulty);
        cacheNeedsRewrite = JSON.stringify(pool) !== JSON.stringify(parsed);
      } catch (_) {
        cacheNeedsRewrite = false;
      }
    }
  }

  if (!forceGeneration) {
    const card = pool.cards.find(candidate => !exclusions.has(scenarioFingerprint(candidate.scenario)));
    if (card) {
      if (cacheNeedsRewrite) {
        await env.CARD_CACHE.put(cacheKey, JSON.stringify(pool));
      }
      logEntry(context, {
        event: 'request', outcome: 'cached', topic, difficulty,
        ms: Date.now() - startedAt
      });
      return new Response(JSON.stringify({
        cached: true,
        card,
        poolSize: pool.cards.length,
        poolLimit: MAX_POOL_SIZE
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  try {
    if (!env.OPENCODE_API_KEY) {
      throw new Error('Card generation is not configured');
    }

    const entitlement = await resolveEntitlement(env, request, 'cards');
    if (!entitlement.pro && entitlement.used >= entitlement.limit) {
      logEntry(context, {
        event: 'request', outcome: 'quota_exceeded', topic, difficulty,
        identity: entitlement.identity, used: entitlement.used, limit: entitlement.limit,
        ms: Date.now() - startedAt
      });
      return new Response(JSON.stringify({
        error: 'Daily card limit reached — upgrade to Pro for unlimited cards',
        code: 'quota_exceeded',
        kind: 'cards',
        used: entitlement.used,
        limit: entitlement.limit,
        remaining: 0
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const models = [
      'deepseek-v4-flash',
      'deepseek-v4-flash',
      'deepseek-v4-flash',
      'deepseek-v4-flash'
    ];
    const distinctFrom = new Set([
      ...pool.cards.map(candidate => scenarioFingerprint(candidate.scenario)),
      ...exclusions
    ]);
    let card;
    let lastError = new Error('Card generation provider is temporarily unavailable');

    for (let attempt = 0; attempt < models.length; attempt++) {
      const attemptCorrect = selectCorrectLetter(context.random);
      const prompt = buildPrompt(topic, difficulty, attemptCorrect);
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
          temperature: 0.7,
          thinking: { type: 'disabled' }
        }),
        signal: AbortSignal.timeout(45000)
      });

      if (aiResponse.ok) {
        try {
          const completion = await aiResponse.json();
          const text = completion?.choices?.[0]?.message?.content || '';
          const cleaned = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start === -1 || end === -1) throw new Error('No JSON in response');

          const generatedCard = JSON.parse(cleaned.substring(start, end + 1));
          validateGeneratedCard(generatedCard, attemptCorrect);
          const generatedFingerprint = scenarioFingerprint(generatedCard.scenario);
          if (distinctFrom.has(generatedFingerprint)) {
            throw new Error('Generated scenario duplicates an existing or excluded card');
          }
          card = normalizeCard(generatedCard, topic, difficulty);
          break;
        } catch (error) {
          lastError = error;
          continue;
        }
      }

      const providerError = await aiResponse.text();
      console.error(
        'OpenCode card generation failed',
        models[attempt],
        aiResponse.status,
        providerError.slice(0, 500)
      );
      logEntry(context, {
        event: 'attempt_failed', topic, difficulty,
        attempt: attempt + 1, model: models[attempt],
        status: aiResponse.status, ms: Date.now() - startedAt
      });
      lastError = new Error('Card generation provider is temporarily unavailable');
      if (aiResponse.status !== 503) break;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }

    if (!card) {
      logEntry(context, {
        event: 'request', outcome: 'failed', topic, difficulty,
        attempts: models.length, ms: Date.now() - startedAt,
        error: lastError.message
      });
      throw lastError;
    }

    pool = { cards: deduplicatePool([...pool.cards, card]) };

    if (!entitlement.pro) {
      await consumeQuota(env, entitlement.identity, 'cards');
    }

    if (env.CARD_CACHE) {
      await env.CARD_CACHE.put(cacheKey, JSON.stringify(pool));
    }

    logEntry(context, {
      event: 'request', outcome: 'generated', topic, difficulty,
      ms: Date.now() - startedAt
    });

    return new Response(JSON.stringify({
      cached: false,
      card,
      poolSize: pool.cards.length,
      poolLimit: MAX_POOL_SIZE
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
