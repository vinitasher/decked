/* Cloudflare Pages Function — lazily generate a wiki entry for a "know first"
   topic on demand, caching it in KV. Mirrors the schema and provider settings
   of scripts/generate-wiki.mjs so bulk and lazy entries are interchangeable. */

import { resolveEntitlement, consumeQuota } from '../shared/entitlement.js';
import { API_MODEL_SEQUENCE } from '../shared/model-routing.js';
import { ensureGeneratedSandbox } from '../shared/generated-sandbox-service.js';

const TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED = ['topic', 'title', 'summary', 'why_it_matters', 'key_points', 'common_pitfalls', 'related_topics'];

/* Fold any casing/separator variant onto the canonical kebab-case key so
   related topics like "Eventual Consistency" or "Database" become valid
   concept names the client can match against existing entries. */
function normalizeTopicName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validate(entry, topic) {
  for (const field of REQUIRED) {
    if (entry[field] === undefined || entry[field] === null) throw new Error(`Missing field: ${field}`);
  }
  if (entry.topic !== topic) throw new Error(`Invalid field: topic must be ${topic}`);
  if (typeof entry.title !== 'string' || entry.title.length < 2) throw new Error('Invalid field: title');
  if (typeof entry.summary !== 'string' || entry.summary.length < 60) throw new Error('Invalid field: summary');
  if (typeof entry.why_it_matters !== 'string' || entry.why_it_matters.length < 30) throw new Error('Invalid field: why_it_matters');
  if (!Array.isArray(entry.key_points) || entry.key_points.length < 3) throw new Error('Invalid field: key_points');
  if (!Array.isArray(entry.common_pitfalls) || entry.common_pitfalls.length < 2) throw new Error('Invalid field: common_pitfalls');
  if (!Array.isArray(entry.related_topics)) throw new Error('Invalid field: related_topics');
  return {
    ...entry,
    related_topics: [...new Set(entry.related_topics
      .map(name => typeof name === 'string' ? normalizeTopicName(name) : '')
      .filter(name => TOPIC_RE.test(name)))]
      .slice(0, 4)
  };
}

function buildPrompt(topic) {
  return `Write a concise system-design wiki entry for the concept "${topic}". It is a BACKEND / DISTRIBUTED-SYSTEMS engineering concept (caching, databases, queues, networking, consensus, API design, observability) — it is NOT a user-interface, keyboard, or mobile-app feature. It will be viewed inside a flashcard app by engineers learning system design, alongside cards that list this concept as a prerequisite.

Return a JSON object with exactly these keys:
- topic: "${topic}"
- title: a short human-readable display title (max 4 words)
- summary: 2-3 plain-English sentences explaining what it is, with one concrete example
- why_it_matters: one sentence on why engineers must understand it
- key_points: 3-5 bullet strings, each a complete sentence (no markdown)
- common_pitfalls: 2-4 bullet strings of mistakes beginners make
- related_topics: 2-4 lowercase kebab-case concept names that connect to it

CRITICAL: Output ONLY the JSON. No markdown, no code fences, no surrounding text.`;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  const topic = (new URL(request.url)).searchParams.get('topic') || '';
  if (!TOPIC_RE.test(topic)) {
    return jsonResponse({ error: 'Invalid topic' }, 400);
  }

  if (env.WIKI_CACHE) {
    const cached = await env.WIKI_CACHE.get(`wiki:${topic}`);
    if (cached) {
      try {
        return jsonResponse(JSON.parse(cached));
      } catch (_) {
        // corrupted entry — regenerate below
      }
    }
  }

  if (!env.OPENCODE_API_KEY) {
    return jsonResponse({ error: 'Card generation is not configured' }, 500);
  }

  const entitlement = await resolveEntitlement(env, request, 'wiki');
  if (!entitlement.pro && entitlement.used >= entitlement.limit) {
    console.error('Wiki generation quota exceeded', topic, entitlement.used, entitlement.limit);
    return jsonResponse({
      error: 'Daily wiki limit reached — upgrade to Pro for unlimited wiki entries',
      code: 'quota_exceeded',
      kind: 'wiki',
      used: entitlement.used,
      limit: entitlement.limit,
      remaining: 0
    }, 429);
  }

  let entry = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2 && !entry; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      let aiResponse;
      try {
        aiResponse = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENCODE_API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'opencode/1.18.9'
          },
          body: JSON.stringify({
            model: API_MODEL_SEQUENCE[attempt],
            messages: [{ role: 'user', content: buildPrompt(topic) }],
            max_tokens: 2048,
            temperature: 0.6,
            thinking: { type: 'disabled' }
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      if (!aiResponse.ok) throw new Error(`provider HTTP ${aiResponse.status}`);
      const completion = await aiResponse.json();
      const text = completion?.choices?.[0]?.message?.content || '';
      const cleaned = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON in response');
      entry = validate(JSON.parse(cleaned.substring(start, end + 1)), topic);
    } catch (error) {
      lastError = error;
    }
  }

  if (!entry) {
    console.error('Wiki generation failed', topic, lastError?.message);
    return jsonResponse({ error: 'Wiki generation is temporarily unavailable' }, 503);
  }

  if (!entitlement.pro) {
    await consumeQuota(env, entitlement.identity, 'wiki');
  }

  if (env.WIKI_CACHE) {
    const write = env.WIKI_CACHE.put(`wiki:${topic}`, JSON.stringify(entry), { expirationTtl: 2592000 });
    if (typeof context.waitUntil === 'function') context.waitUntil(write);
    else write.catch(() => {});
  }
  /* A newly generated Wiki topic should converge on a matching Sandbox, but
     the learner must not wait for a second provider call. Pages supplies
     waitUntil for this best-effort background lifecycle. */
  if (typeof context.waitUntil === 'function') {
    const warm = ensureGeneratedSandbox(env, topic).catch(error => {
      console.error('Sandbox prewarm after Wiki generation failed', topic, error?.message);
    });
    context.waitUntil(warm);
  }
  return jsonResponse(entry);
}
