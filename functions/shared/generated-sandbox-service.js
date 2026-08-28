/* Shared generated-Sandbox provider and cache lifecycle.
 *
 * GET /api/sandbox adds learner entitlement around this service. The
 * prewarm endpoint and the lazy Wiki hook use it without charging a learner.
 * Provider attempts and callers are deliberately sequential so a bulk job
 * never creates concurrent provider requests.
 */

import { API_MODEL_SEQUENCE } from './model-routing.js';
import {
  buildGeneratedSandboxPrompt,
  GENERATED_SANDBOX_MAX_TOPIC_LENGTH,
  GENERATED_SANDBOX_TOPIC_RE,
  normalizeGeneratedSandboxDefinition
} from './generated-sandbox.js';

export const GENERATED_SANDBOX_CACHE_TTL_SECONDS = 2592000;

export function sandboxCache(env) {
  return env?.SANDBOX_CACHE || env?.WIKI_CACHE || null;
}

export function sandboxCacheKey(topic) {
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

function validTopic(topic) {
  return typeof topic === 'string'
    && GENERATED_SANDBOX_TOPIC_RE.test(topic)
    && topic.length <= GENERATED_SANDBOX_MAX_TOPIC_LENGTH;
}

export async function readCachedGeneratedSandbox(env, topic) {
  if (!validTopic(topic)) return null;
  const cache = sandboxCache(env);
  if (!cache) return null;
  try {
    const cached = await cache.get(sandboxCacheKey(topic));
    if (!cached) return null;
    return normalizeGeneratedSandboxDefinition(JSON.parse(cached), topic);
  } catch (_) {
    // A corrupt or temporarily unavailable cache is a miss. The caller can
    // retry with the provider or leave the entry for a later prewarm run.
    return null;
  }
}

export async function writeGeneratedSandbox(env, definition) {
  const cache = sandboxCache(env);
  if (!cache) return false;
  await cache.put(
    sandboxCacheKey(definition.topic),
    JSON.stringify(definition),
    { expirationTtl: GENERATED_SANDBOX_CACHE_TTL_SECONDS }
  );
  return true;
}

/* Provider fallback is intentionally await-based. A fallback model is not
   started until the previous provider attempt has completed. */
export async function generateGeneratedSandboxDefinition(env, topic) {
  if (!env?.OPENCODE_API_KEY) throw new Error('Sandbox generation is not configured');
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

export async function ensureGeneratedSandbox(env, topic) {
  const cached = await readCachedGeneratedSandbox(env, topic);
  if (cached) return { definition: cached, source: 'cache' };

  const definition = await generateGeneratedSandboxDefinition(env, topic);
  await writeGeneratedSandbox(env, definition);
  return { definition, source: 'provider' };
}
