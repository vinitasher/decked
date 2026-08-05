#!/usr/bin/env node
/* generate-wiki.mjs — generate a wiki entry for every "know first" topic and
   bundle the result into js/wiki.js (loaded like cards.js).

   Topic universe = union of TOPIC_CATALOG prerequisites, every card/option
   prerequisiteTopic, and the production card cache.

   Provider: opencode zen API (deepseek-v4-flash, thinking disabled — same
   configuration as the card generator). Requests run 3-at-a-time with one
   retry each; results are validated against the wiki schema before write.

   Usage: OPENCODE_API_KEY=... node scripts/generate-wiki.mjs [--limit N]
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_KEY = process.env.OPENCODE_API_KEY ||
  JSON.parse(readFileSync(join(process.env.HOME, '.local/share/opencode/auth.json'), 'utf8'))['opencode-go']?.key;
const API_URL = 'https://opencode.ai/zen/go/v1/chat/completions';

const LIMIT = process.argv.includes('--limit')
  ? Number(process.argv[process.argv.indexOf('--limit') + 1])
  : Infinity;

if (!API_KEY) {
  console.error('generate-wiki: OPENCODE_API_KEY required');
  process.exit(1);
}

/* ---- Topic universe (mirrors how the app derives know-first lists) ---- */
const cardsJs = readFileSync(join(ROOT, 'js/cards.js'), 'utf8');
const catalog = Function('return ' + cardsJs.match(/const TOPIC_CATALOG = ({[\s\S]*?});/)[1])();
const legacy = Function('return ' + cardsJs.match(/const LEGACY_OPTION_PREREQUISITES = ({[\s\S]*?});/)[1])();

const topics = new Set();
for (const [topic, details] of Object.entries(catalog)) {
  topics.add(topic);
  (details.prerequisites || []).forEach(p => topics.add(p));
}
for (const opts of Object.values(legacy)) {
  for (const prereqs of Object.values(opts)) prereqs.forEach(p => topics.add(p));
}
try {
  const cache = JSON.parse(readFileSync(join(ROOT, 'server/production-card-cache.json'), 'utf8'));
  const cards = cache.cards || (Array.isArray(cache) ? cache : []);
  for (const card of cards) {
    (card.prerequisiteTopics || []).forEach(t => topics.add(t));
    (card.options || []).forEach(o => (o.prerequisiteTopics || []).forEach(t => topics.add(t)));
  }
} catch {
  // production cache snapshot is optional
}
const ordered = [...topics].sort();

/* ---- Provider call (same params as the card generator) ---- */
async function callModel(prompt, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'opencode/1.18.9'
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        temperature: 0.6,
        thinking: { type: 'disabled' }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
    const completion = await response.json();
    const text = completion?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('empty provider response');
    const cleaned = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('no JSON in response');
    return JSON.parse(cleaned.substring(start, end + 1));
  } finally {
    clearTimeout(timer);
  }
}

/* ---- Schema validation ---- */
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
    if (entry[field] === undefined || entry[field] === null) throw new Error(`missing ${field}`);
  }
  if (entry.topic !== topic) throw new Error(`topic mismatch: ${entry.topic}`);
  if (typeof entry.title !== 'string' || entry.title.length < 2) throw new Error('title too short');
  if (typeof entry.summary !== 'string' || entry.summary.length < 60) throw new Error('summary too short');
  if (typeof entry.why_it_matters !== 'string' || entry.why_it_matters.length < 30) throw new Error('why_it_matters too short');
  if (!Array.isArray(entry.key_points) || entry.key_points.length < 3) throw new Error('key_points < 3');
  if (!Array.isArray(entry.common_pitfalls) || entry.common_pitfalls.length < 2) throw new Error('common_pitfalls < 2');
  if (!Array.isArray(entry.related_topics)) throw new Error('related_topics not array');
  return {
    ...entry,
    related_topics: [...new Set(entry.related_topics
      .map(name => typeof name === 'string' ? normalizeTopicName(name) : '')
      .filter(name => TOPIC_RE.test(name)))]
      .slice(0, 4)
  };
}

function buildPrompt(topic, titleHint) {
  return `Write a concise system-design wiki entry for the concept "${topic}"${titleHint ? ` (display title "${titleHint}")` : ''}. It is a BACKEND / DISTRIBUTED-SYSTEMS engineering concept (caching, databases, queues, networking, consensus, API design, observability) — it is NOT a user-interface, keyboard, or mobile-app feature. It will be viewed inside a flashcard app by engineers learning system design, alongside cards that list this concept as a prerequisite.

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

/* ---- Worker pool (3 concurrent, 1 retry per topic) ---- */
const results = {};
let cursor = 0;
let processed = 0;
const failures = new Map();

async function worker() {
  while (cursor < ordered.length && processed < LIMIT) {
    const index = cursor++;
    processed++;
    const topic = ordered[index];
    const titleHint = catalog[topic]?.label;
    const prompt = buildPrompt(topic, titleHint);
    let entry = null;
    for (let attempt = 1; attempt <= 2 && !entry; attempt++) {
      try {
        entry = validate(await callModel(prompt), topic);
        results[topic] = entry;
        console.log(`ok ${topic}${attempt > 1 ? ' (retry)' : ''}`);
      } catch (error) {
        if (attempt === 2) {
          failures.set(topic, error.message);
          console.error(`FAIL ${topic}: ${error.message}`);
        } else {
          console.error(`retry ${topic}: ${error.message}`);
        }
      }
    }
  }
}
const started = Date.now();
await Promise.all([worker(), worker(), worker()]);

console.log(`\n${Object.keys(results).length}/${ordered.length} topics generated in ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (failures.size) {
  console.error(`Failures (${failures.size}):`, [...failures].map(([t, m]) => `${t} (${m})`).join(', '));
  process.exitCode = 1;
} else {
  const orderedResults = Object.fromEntries(ordered.filter(t => results[t]).map(t => [t, results[t]]));
  const output = `/* Auto-generated wiki (${Object.keys(orderedResults).length} entries) — see scripts/generate-wiki.mjs */
const WIKI = ${JSON.stringify(orderedResults, null, 2)};
`;
  writeFileSync(join(ROOT, 'js/wiki.js'), output);
  console.log(`wrote js/wiki.js (${output.length} bytes)`);
}
