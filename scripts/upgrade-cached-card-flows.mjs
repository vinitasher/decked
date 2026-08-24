#!/usr/bin/env node

/* Upgrade cached cards (server/production-card-cache.json, server/card-cache.json)
   with diagram flows so existing cards render with the structured graph
   renderer instead of the linear-chain fallback.

   For each card, the opencode CLI (same provider as generate-card.js) derives
   the base architecture edges (card.flows) and each option's wiring
   (option.flows) from the card's scenario, nodes, and options. Results are
   validated against the generator's rules (every node in at least one base
   flow, from/to must reference node names, kind whitelisted) with one retry;
   options without distinct wiring inherit the validated correct-option graph,
   and on failure the card falls back to a linear chain over its nodes without
   inventing a correct answer graph. Cards whose option graphs collapse into
   one identical linear topology are rejected.

   Usage:
     node scripts/upgrade-cached-card-flows.mjs          # dry run
     node scripts/upgrade-cached-card-flows.mjs --write  # persist both files
*/

import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

import { hasDegenerateLinearOptionTopology } from '../functions/api/generate.js';
import { CLI_MODEL_SEQUENCE } from '../functions/shared/model-routing.js';

const FLOW_KINDS = new Set(['sync', 'async', 'callback']);
const CACHE_FILES = [
  new URL('../server/production-card-cache.json', import.meta.url),
  new URL('../server/card-cache.json', import.meta.url)
];

/* Reuse the client normalizer (single source of truth): validates flows,
   synthesizes the chain fallback, and anchors every diagram on the end user. */
const cardsSource = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
const cardsContext = vm.createContext({ console, Math, Date, JSON });
vm.runInContext(`${cardsSource}\nglobalThis.normalizeCardFlowsForUpgrade = normalizeCardFlows;`, cardsContext);
const normalizeCachedFlows = card => cardsContext.normalizeCardFlowsForUpgrade(card);

const opencodeBin = process.env.OPENCODE_BIN
  || '/home/pi/.nvm/versions/node/v22.23.1/bin/opencode';
const modelSequence = [
  process.env.OPENCODE_MODEL || CLI_MODEL_SEQUENCE[0],
  CLI_MODEL_SEQUENCE[1]
];

function normalizeFlows(flows, nodes) {
  const nodeSet = new Set(nodes || []);
  return (Array.isArray(flows) ? flows : [])
    .filter(flow => flow && typeof flow === 'object')
    .map(flow => ({
      from: typeof flow.from === 'string' ? flow.from : '',
      to: typeof flow.to === 'string' ? flow.to : '',
      verb: typeof flow.verb === 'string' ? flow.verb : '',
      kind: FLOW_KINDS.has(flow.kind) ? flow.kind : 'sync'
    }))
    .filter(flow =>
      flow.from && flow.to && flow.from !== flow.to &&
      nodeSet.has(flow.from) && nodeSet.has(flow.to)
    );
}

function chainFlows(nodes) {
  return nodes.slice(0, -1).map((node, index) => ({
    from: node, to: nodes[index + 1], verb: '', kind: 'sync'
  }));
}

/* Validated base flows, or null when the candidate does not connect the graph. */
function validateBaseFlows(flows, nodes) {
  const normalized = normalizeFlows(flows, nodes);
  if (normalized.length < nodes.length - 1) return null;
  for (const node of nodes) {
    if (!normalized.some(flow => flow.from === node || flow.to === node)) return null;
  }
  return normalized;
}

function buildPrompt(card) {
  return `You are upgrading an existing system design flash card so it can render an architecture diagram. Given the card below, produce ONLY a JSON object with:
{
  "flows": [ { "from": "...", "to": "...", "verb": "...", "kind": "sync|async|callback" } ],
  "optionFlows": { "A": [...], "B": [...], "C": [...], "D": [...] }
}

RULES:
- "flows" describes the base architecture the scenario describes. from/to MUST be exact node names from the nodes array. verb is the action on that edge ("requests", "publishes", "queries", "caches", "loads on miss", "acks", "enqueues", "delivers", ...). kind is "sync", "async", or "callback".
- The base flows MUST start from the end user: the first edge leaves the end-user node (the client, web app, mobile app, browser, or similar node when the nodes array includes one). If the nodes array has no end-user node, start from the node closest to the user (the entry point, e.g. the CDN or load balancer).
- Every node MUST appear in at least one base flow. Keep the topology realistic (fan-out, callbacks, back-edges) — never a plain linear chain when the architecture is not one.
- "optionFlows" maps every option id to the exact wiring that option implies: edges between the nodes that option connects, consistent with the option label. Every option must have wiring; use the correct option's graph only when an alternative has no distinct wiring. Never send empty arrays.
- The option flows must not all collapse into one identical linear chain through every card node. At least one option must show the topology implied by its trade-off. Never send a card whose options all use the same linear topology.

Card:
${JSON.stringify({
    scenario: card.scenario,
    nodes: card.nodes,
    options: card.options.map(option => ({ id: option.id, label: option.label })),
    correct: card.correct
  })}

CRITICAL: Output ONLY valid JSON — no markdown, no code fences, no surrounding text. DO NOT write any files. Your entire response must be the JSON object and nothing else.`;
}

function callModel(prompt, model) {
  const escaped = prompt.replace(/"/g, '\\"');
  const env = {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: '{"permission":{"edit":"deny","bash":"deny"}}'
  };
  return execSync(
    `${opencodeBin} run --auto --dir /home/pi/git/mamaLab --model ${model} "${escaped}"`,
    { timeout: 120000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, env }
  );
}

function extractJson(stdout) {
  const cleaned = stdout.replace(/```json?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON in model output');
  return JSON.parse(cleaned.substring(start, end + 1));
}

async function deriveFlows(card, attemptCount = 2, modelCall = callModel) {
  if (!Array.isArray(card.nodes) || card.nodes.length < 2) return { flows: [], optionFlows: {} };
  const nodes = card.nodes;
  let lastError;
  for (let attempt = 0; attempt < attemptCount; attempt++) {
    try {
      const model = modelSequence[Math.min(attempt, modelSequence.length - 1)];
      const parsed = extractJson(modelCall(buildPrompt(card), model));
      const base = validateBaseFlows(parsed.flows, nodes);
      if (!base) throw new Error('base flows do not connect every node');
      const parsedOptionFlows = {};
      for (const option of card.options || []) {
        if (!option?.id) continue;
        const flows = normalizeFlows(parsed.optionFlows?.[option.id], nodes);
        if (flows.length) parsedOptionFlows[option.id] = flows;
      }
      const correctFlows = parsedOptionFlows[card.correct] || [];
      if (!correctFlows.length) throw new Error('correct option wiring is unavailable');
      const optionFlows = {};
      for (const option of card.options || []) {
        if (!option?.id) continue;
        const flows = parsedOptionFlows[option.id] || correctFlows;
        if (flows.length) optionFlows[option.id] = flows.map(flow => ({ ...flow }));
      }
      if (hasDegenerateLinearOptionTopology({
        nodes,
        correct: card.correct,
        options: (card.options || []).map(option => ({
          id: option.id,
          flows: optionFlows[option.id] || []
        }))
      })) {
        throw new Error('option flows collapse into the same linear topology');
      }
      return { flows: base, optionFlows };
    } catch (error) {
      lastError = error;
    }
  }
  return { flows: chainFlows(nodes), optionFlows: {}, error: lastError?.message };
}

/* Apply the migration to every card in a cache value (single card or pool).
   AI derivation runs only for cards without flows; the deterministic
   end-user anchoring + validation always runs. */
async function upgradeCard(card, stats) {
  if (!card || typeof card !== 'object' || !Array.isArray(card.nodes)) return card;
  let changed = false;
  if (!(Array.isArray(card.flows) && card.flows.length)) {
    const result = await deriveFlows(card);
    card.flows = result.flows;
    for (const option of Array.isArray(card.options) ? card.options : []) {
      if (option && result.optionFlows[option.id]) option.flows = result.optionFlows[option.id];
    }
    changed = true;
    if (result.error) stats.errors++;
  }
  normalizeCachedFlows(card);
  const correctOption = Array.isArray(card.options)
    ? card.options.find(option => option?.id === card.correct)
    : null;
  const correctFlows = normalizeFlows(correctOption?.flows, card.nodes);
  for (const option of Array.isArray(card.options) ? card.options : []) {
    if (!option || typeof option !== 'object') continue;
    const explicitFlows = normalizeFlows(option.flows, card.nodes);
    const nextFlows = (explicitFlows.length ? explicitFlows : correctFlows)
      .map(flow => ({ ...flow }));
    if (JSON.stringify(option.flows) !== JSON.stringify(nextFlows)) changed = true;
    option.flows = nextFlows;
  }
  if (changed) stats.updated++;
  else stats.skipped++;
  return card;
}

async function main() {
  const write = process.argv.includes('--write');

  for (const fileUrl of CACHE_FILES) {
    const stats = { updated: 0, skipped: 0, errors: 0, cards: 0 };
    const cache = JSON.parse(await readFile(fileUrl, 'utf8'));
    for (const [key, value] of Object.entries(cache)) {
      if (value && Array.isArray(value.cards)) {
        for (let i = 0; i < value.cards.length; i++) {
          stats.cards++;
          value.cards[i] = await upgradeCard(value.cards[i], stats);
        }
      } else if (value && typeof value === 'object') {
        stats.cards++;
        cache[key] = await upgradeCard(value, stats);
      }
    }
    if (write) {
      await writeFile(fileUrl, `${JSON.stringify(cache, null, 2)}\n`);
    }
    console.log(JSON.stringify({ file: fileUrl.pathname.split('/').pop(), ...stats, write }));
  }
}

export {
  buildPrompt,
  deriveFlows,
  normalizeFlows,
  validateBaseFlows,
  chainFlows,
  extractJson,
  modelSequence
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
