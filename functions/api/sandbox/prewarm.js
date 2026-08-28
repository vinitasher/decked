/* Protected maintenance endpoint for generated Sandbox cache fills.
 *
 * This is intentionally an awaited, serial loop. A caller may send a small
 * batch, but the next topic does not start until the previous topic has
 * finished its cache lookup, provider fallback sequence, and KV write.
 */

import {
  GENERATED_SANDBOX_MAX_TOPIC_LENGTH,
  GENERATED_SANDBOX_TOPIC_RE
} from '../../shared/generated-sandbox.js';
import { ensureGeneratedSandbox } from '../../shared/generated-sandbox-service.js';

const MAX_TOPICS_PER_REQUEST = 8;

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

function isCanonicalTopic(topic) {
  return typeof topic === 'string'
    && GENERATED_SANDBOX_TOPIC_RE.test(topic)
    && topic.length <= GENERATED_SANDBOX_MAX_TOPIC_LENGTH;
}

function topicResult(topic, status, error) {
  return error ? { topic, status, error } : { topic, status };
}

function authorized(request, env) {
  const configured = typeof env.SANDBOX_PREWARM_TOKEN === 'string'
    ? env.SANDBOX_PREWARM_TOKEN
    : '';
  if (!configured) return { configured: false, valid: false };
  return {
    configured: true,
    valid: request.headers.get('Authorization') === `Bearer ${configured}`
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = authorized(request, env);
  if (!auth.configured) return jsonResponse({ error: 'Sandbox prewarm is not configured' }, 503);
  if (!auth.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Request body must be JSON' }, 400);
  }
  if (!body || !Array.isArray(body.topics)
      || body.topics.length < 1 || body.topics.length > MAX_TOPICS_PER_REQUEST) {
    return jsonResponse({ error: `topics must contain 1-${MAX_TOPICS_PER_REQUEST} entries` }, 400);
  }

  const results = new Array(body.topics.length);
  const accepted = [];
  const seen = new Set();
  body.topics.forEach((topic, index) => {
    if (!isCanonicalTopic(topic)) {
      results[index] = topicResult(null, 'rejected', 'Topic must be canonical kebab-case');
      return;
    }
    if (seen.has(topic)) {
      results[index] = topicResult(topic, 'rejected', 'Duplicate topic');
      return;
    }
    seen.add(topic);
    accepted.push({ topic, index });
  });

  if (!accepted.length) {
    return jsonResponse({
      requested: body.topics.length,
      accepted: 0,
      completed: 0,
      failed: 0,
      results
    }, 400);
  }

  let completed = 0;
  let failed = 0;
  /* Do not replace this loop with Promise.all: keeping one provider request
     in flight is the reason this endpoint exists. */
  for (const item of accepted) {
    try {
      const outcome = await ensureGeneratedSandbox(env, item.topic);
      results[item.index] = topicResult(item.topic, outcome.source === 'cache' ? 'cached' : 'generated');
      completed++;
    } catch (error) {
      failed++;
      results[item.index] = topicResult(
        item.topic,
        'failed',
        error?.message === 'Sandbox generation is not configured'
          ? 'Sandbox generation is not configured'
          : 'Sandbox generation is temporarily unavailable'
      );
      console.error('Sandbox prewarm failed', item.topic, error?.message);
    }
  }

  return jsonResponse({
    requested: body.topics.length,
    accepted: accepted.length,
    completed,
    failed,
    results
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
}
