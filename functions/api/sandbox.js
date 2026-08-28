/* Cloudflare Pages Function — generate a bounded Concept Sandbox definition.
 *
 * The provider returns a data recipe only. The browser validates it again and
 * executes the application-owned deterministic pressure simulator; provider
 * output is never treated as code or a formula.
 */

import { resolveEntitlement, consumeQuota } from '../shared/entitlement.js';
import {
  GENERATED_SANDBOX_MAX_TOPIC_LENGTH,
  GENERATED_SANDBOX_TOPIC_RE
} from '../shared/generated-sandbox.js';
import {
  generateGeneratedSandboxDefinition,
  readCachedGeneratedSandbox,
  sandboxCache,
  writeGeneratedSandbox
} from '../shared/generated-sandbox-service.js';

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

export async function onRequestGet(context) {
  const { request, env } = context;
  const topic = (new URL(request.url)).searchParams.get('topic') || '';
  if (!GENERATED_SANDBOX_TOPIC_RE.test(topic)
      || topic.length > GENERATED_SANDBOX_MAX_TOPIC_LENGTH) {
    return jsonResponse({ error: 'Invalid topic' }, 400);
  }

  const cached = await readCachedGeneratedSandbox(env, topic);
  if (cached) return jsonResponse(cached);

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
    definition = await generateGeneratedSandboxDefinition(env, topic);
  } catch (error) {
    console.error('Sandbox generation failed', topic, error?.message);
    return jsonResponse({ error: 'Sandbox generation is temporarily unavailable' }, 503);
  }

  if (!entitlement.pro) await consumeQuota(env, entitlement.identity, 'sandbox');

  const cache = sandboxCache(env);
  if (cache) {
    const write = writeGeneratedSandbox(env, definition);
    if (typeof context.waitUntil === 'function') context.waitUntil(write);
    else write.catch(() => {});
  }
  return jsonResponse(definition);
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
  return onRequestGet(context);
}
