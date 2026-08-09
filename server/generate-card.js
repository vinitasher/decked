#!/usr/bin/env node
/* generate-card.js — calls opencode CLI to produce a flash card JSON object with
   validation and auto-retry (up to 3 attempts). */

const { execSync } = require('child_process');

const topic = process.argv[2] || 'caching';
const difficulty = process.argv[3] || '2';
const OPTION_IDS = ['A', 'B', 'C', 'D'];

function selectCorrectLetter(random = Math.random) {
  const value = Number(random());
  const bounded = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
  return OPTION_IDS[Math.min(Math.floor(bounded * OPTION_IDS.length), OPTION_IDS.length - 1)];
}

function buildPrompt(topicName, cardDifficulty, designatedCorrect, now = Date.now()) {
  return `Generate a system design flash card for the topic "${topicName}" at difficulty ${cardDifficulty}/5 (5 = hardest). This card will be used by engineers learning system design — it must be accurate, specific, and teach a real trade-off.

The card must be a single JSON object with these exact keys:
- id: "${topicName}-gen-${now}"
- topic: "${topicName}"
- difficulty: ${cardDifficulty}
- scenario: a realistic system design problem as 2-3 sentences. MUST include concrete numbers (QPS, latency in ms, data volume in GB/TB, users, or RPS). The problem must force a trade-off between two approaches. The scenario must contain exactly ${cardDifficulty} distinct requirements (quantified SLAs, throughput targets, latency budgets, data volumes, consistency guarantees, or deadlines).
- nodes: 4-5 system components, use real technology names (e.g. "Redis Cluster" not just "Cache", "Postgres with read replicas" not just "DB").
- options: exactly 4 objects {id, label, prerequisiteTopics} with ids A, B, C, D, where ${designatedCorrect} is correct. Each option needs 2-4 specific lowercase kebab-case prerequisite concepts required to evaluate its trade-off (for example "cache-invalidation", "replication-lag", or "message-ordering"). Do not use technology names merely because they appear in the option, avoid broad categories, and do not include "${topicName}". Each option must be a real approach an experienced engineer might argue for. The three wrong options must fail for THREE COMPLETELY DIFFERENT reasons — one for cost/scalability, one for consistency/correctness, one for latency/complexity.
- prerequisiteTopics: the deduplicated union of all four options' prerequisiteTopics.
- correct: "${designatedCorrect}"
- explanation: explain why each option other than ${designatedCorrect} fails (different reason per option) and why ${designatedCorrect} wins. Be specific: name the scalability bottleneck, the consistency anomaly, the cost trade-off. 4-6 sentences.

CRITICAL RULES:
- Every option must be concrete (name real technologies: Redis, Kafka, S3, Postgres, WebSocket, gRPC, CDN, DynamoDB, Elasticsearch, RabbitMQ, etc.)
- The scenario MUST differ from every previous card's scenario
- The explanation must name the specific bottleneck or trade-off for each option
- Difficulty ${cardDifficulty}/5 means: 1=basic CRUD, 3=multi-service caching/async, 5=distributed consensus/partitioning
- Output ONLY valid JSON — no markdown, no code fences, no surrounding text.
- DO NOT write any files. DO NOT create files. Your entire response must be the JSON object and nothing else.`;
}

const model = process.env.OPENCODE_MODEL || 'opencode-go/deepseek-v4-flash';
const opencodeBin = '/home/pi/.nvm/versions/node/v22.23.1/bin/opencode';

function callModel(prompt) {
  const escaped = prompt.replace(/"/g, '\\"');
  // Read-only enforcement: the model must not write files
  const env = { ...process.env, OPENCODE_CONFIG_CONTENT: '{"permission":{"edit":"deny","bash":"deny"}}' };
  return execSync(
    `${opencodeBin} run --auto --dir /home/pi/git/mamaLab --model ${model} "${escaped}"`,
    { timeout: 90000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, env }
  );
}

function extractAndValidate(stdout, designatedCorrect, countScenarioRequirements = () => ({ count: 1, requirements: [] }), difficultyFromScenario = () => 1) {
  // try parsing JSON from stdout
  const cleaned = stdout.replace(/```json?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  let card;
  if (start !== -1) {
    const end = cleaned.lastIndexOf('}');
    if (end !== -1) {
      try { card = JSON.parse(cleaned.substring(start, end + 1)); } catch (_) {}
    }
  }
  // if not found in stdout, check for newly written JSON files (fallback)
  if (!card) {
    const fs = require('fs');
    const dir = '/home/pi/git/mamaLab';
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && (f.includes('card') || f.includes('gen')));
    // pick the most recent
    files.sort((a, b) => fs.statSync(dir + '/' + b).mtimeMs - fs.statSync(dir + '/' + a).mtimeMs);
    for (const fname of files) {
      try {
        card = JSON.parse(fs.readFileSync(dir + '/' + fname, 'utf-8'));
        fs.unlinkSync(dir + '/' + fname); // clean up
        break;
      } catch (_) {}
    }
  }
  if (!card) throw new Error('no JSON found in output');

  const required = ['id', 'topic', 'difficulty', 'scenario', 'nodes', 'options', 'correct', 'explanation'];
  for (const f of required) {
    if (!card[f]) throw new Error(`missing field: ${f}`);
  }

  const errors = [];
  if (!/\d{2,}/.test(card.scenario)) errors.push('scenario lacks concrete numbers');
  if (countScenarioRequirements(card.scenario).count < 1) errors.push('scenario has no concrete requirements');
  if (card.nodes.length < 3) errors.push('need at least 3 nodes');
  if (
    card.options.length !== OPTION_IDS.length ||
    !OPTION_IDS.every(id => card.options.some(option => option?.id === id))
  ) errors.push('options must have ids A, B, C, D exactly');
  if (!card.options.every(o => Array.isArray(o.prerequisiteTopics))) {
    errors.push('every option needs prerequisiteTopics');
  }
  if (!card.options.every(o => o.prerequisiteTopics.length >= 2 && o.prerequisiteTopics.length <= 4)) {
    errors.push('every option needs 2-4 prerequisite concepts');
  }
  if (!card.options.map(o => o.id).includes(card.correct)) errors.push('correct not in options');
  if (card.correct !== designatedCorrect) errors.push(`correct must match designated option ${designatedCorrect}`);
  if (card.explanation.length < 80) errors.push('explanation too short');
  const labels = card.options.map(o => o.label.toLowerCase());
  if (new Set(labels).size < labels.length) errors.push('duplicate option labels');
  if (!card.options.every(o => o.label.length > 25)) errors.push('option labels too short');

  if (errors.length > 0) {
    throw new Error('validation: ' + errors.join('; ') + '\n' + JSON.stringify(card).substring(0, 200));
  }

  card.topic = topic;
  /* The difficulty is never taken from the request argument: it is derived
     deterministically from the scenario's requirement count. */
  card.difficulty = difficultyFromScenario(card.scenario);
  const normalizeTopics = topics => [...new Set(Array.isArray(topics) ? topics : [])]
    .filter(value =>
      typeof value === 'string' &&
      value !== topic &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    );
  card.options = card.options.map(option => ({
    ...option,
    prerequisiteTopics: normalizeTopics(option.prerequisiteTopics)
  }));
  card.prerequisiteTopics = normalizeTopics([
    ...(Array.isArray(card.prerequisiteTopics) ? card.prerequisiteTopics : []),
    ...card.options.flatMap(option => option.prerequisiteTopics)
  ]);
  return card;
}

async function run() {
  let lastErr;
  let classifier;
  try {
    classifier = await import('../functions/shared/requirement-count.js');
  } catch (err) {
    classifier = {
      countScenarioRequirements: () => ({ count: 1, requirements: [] }),
      difficultyFromScenario: () => 1
    };
  }
  const { countScenarioRequirements, difficultyFromScenario } = classifier;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const designatedCorrect = selectCorrectLetter();
      const stdout = callModel(buildPrompt(topic, difficulty, designatedCorrect));
      const card = extractAndValidate(stdout, designatedCorrect, countScenarioRequirements, difficultyFromScenario);
      console.log(JSON.stringify(card));
      return 0;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) process.stderr.write(`Attempt ${attempt} failed: ${err.message}\n`);
    }
  }

  console.error(JSON.stringify({ error: 'all 3 attempts failed', last: lastErr?.message }));
  return 1;
}

module.exports = { buildPrompt, extractAndValidate, selectCorrectLetter };

if (require.main === module) {
  run().then(code => process.exit(code));
}
