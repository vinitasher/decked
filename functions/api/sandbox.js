/* Cloudflare Pages Function — generate a bounded Concept Sandbox definition.
 *
 * The provider returns a data recipe only. The browser validates it again and
 * executes the application-owned deterministic pressure simulator; provider
 * output is never treated as code or a formula.
 */

import { resolveEntitlement, consumeQuota } from '../shared/entitlement.js';
import { API_MODEL_SEQUENCE } from '../shared/model-routing.js';
import {
  buildGeneratedSandboxPrompt,
  GENERATED_SANDBOX_MAX_TOPIC_LENGTH,
  GENERATED_SANDBOX_TOPIC_RE,
  normalizeGeneratedSandboxDefinition
} from '../shared/generated-sandbox.js';

const CACHE_TTL_SECONDS = 2592000;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

function sandboxCache(env) {
  return env.SANDBOX_CACHE || env.WIKI_CACHE || null;
}

function cacheKey(topic) {
  return `sandbox:v1:${topic}`;
}

function providerJson(content) {
  const cleaned = String(content || '')
    .replace(/```json?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Provider returned no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function generateDefinition(context, topic) {
  const { env } = context;
  let lastError = null;
  for (let attempt = 0; attempt < API_MODEL_SEQUENCE.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENCODE_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'opencode/1.18.9'
        },
        body: JSON.stringify({
          model: API_MODEL_SEQUENCE[attempt],
          messages: [{ role: 'user', content: buildGeneratedSandboxPrompt(topic) }],
          max_tokens: 4096,
          temperature: 0.4,
          thinking: { type: 'disabled' }
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
      const completion = await response.json();
      const content = completion?.choices?.[0]?.message?.content || '';
      return normalizeGeneratedSandboxDefinition(providerJson(content), topic);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('provider returned no definition');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const topic = (new URL(request.url)).searchParams.get('topic') || '';
  if (!GENERATED_SANDBOX_TOPIC_RE.test(topic)
      || topic.length > GENERATED_SANDBOX_MAX_TOPIC_LENGTH) {
    return jsonResponse({ error: 'Invalid topic' }, 400);
  }

  const cache = sandboxCache(env);
  const key = cacheKey(topic);
  if (cache) {
    try {
      const cached = await cache.get(key);
      if (cached) {
        try {
          return jsonResponse(normalizeGeneratedSandboxDefinition(JSON.parse(cached), topic));
        } catch (_) {
          // A stale or corrupt definition is treated as a cache miss.
        }
      }
    } catch (_) {
      // A temporarily unavailable cache must not prevent a fresh attempt.
    }
  }

  if (!env.OPENCODE_API_KEY) {
    return jsonResponse({ error: 'Sandbox generation is not configured' }, 500);
  }

  const entitlement = await resolveEntitlement(env, request, 'sandbox');
  if (!entitlement.pro && entitlement.used >= entitlement.limit) {
    return jsonResponse({
      error: 'Daily Sandbox generation limit reached — upgrade to Pro for more generated experiments',
      code: 'quota_exceeded',
      kind: 'sandbox',
      used: entitlement.used,
      limit: entitlement.limit,
      remaining: 0
    }, 429);
  }

  let definition;
  try {
    definition = await generateDefinition(context, topic);
  } catch (error) {
    console.error('Sandbox generation failed', topic, error?.message);
    return jsonResponse({ error: 'Sandbox generation is temporarily unavailable' }, 503);
  }

  if (!entitlement.pro) await consumeQuota(env, entitlement.identity, 'sandbox');

  if (cache) {
    const write = cache.put(key, JSON.stringify(definition), { expirationTtl: CACHE_TTL_SECONDS });
    if (typeof context.waitUntil === 'function') context.waitUntil(write);
    else write.catch(() => {});
  }
  return jsonResponse(definition);
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
  return onRequestGet(context);
}
