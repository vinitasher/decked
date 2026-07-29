#!/usr/bin/env node
/* generate-card.js — calls opencode CLI to produce a flash card JSON object */

const { execSync } = require('child_process');

const topic = process.argv[2] || 'caching';
const difficulty = process.argv[3] || '2';

const prompt = `Generate a system design flash card for the topic "${topic}" at difficulty ${difficulty}/5 (5 = hardest).

The card must be a single JSON object with these exact keys:
- id: a unique string like "${topic}-gen-${Date.now()}"
- topic: "${topic}"
- difficulty: ${difficulty}
- scenario: a realistic system design problem as one paragraph (2-4 sentences). Include concrete numbers (latency, QPS, data size) where possible. The problem must involve a trade-off between at least two architectural approaches.
- nodes: an array of 3-5 system components involved (e.g. ["Web Client", "API Server", "Cache", "Database"]). Use real technology names where appropriate.
- options: an array of 4 objects, each with "id" ("A","B","C","D") and "label" (one-sentence description of the approach). Option B must be the correct answer. The other three options must be PLAUSIBLE but each fails for a specific, teachable reason.
- correct: "B"
- explanation: a paragraph explaining why each wrong option fails and why B is correct. Reference specific trade-offs (consistency vs availability, cost vs latency, complexity vs scalability, etc.) rather than vague statements.

CRITICAL RULES:
- Every option must be a real, defensible architectural choice that an experienced engineer might reasonably consider.
- The wrong options must teach something — each fails for a different reason.
- The scenario must be original (not a clone of any existing card).
- Output ONLY the JSON object — no markdown, no explanation, no surrounding text.
- Keep the scenario and explanation concise (3-5 sentences each).
- Make the scenario feel realistic with concrete technology references (Redis, Kafka, S3, Postgres, WebSocket, CDN, gRPC, etc.).`;

try {
  const stdout = execSync(
    `/home/pi/.nvm/versions/node/v22.23.1/bin/opencode run --auto --dir /home/pi/git/mamaLab --model opencode-go/deepseek-v4-flash "${prompt.replace(/"/g, '\\"')}"`,
    { timeout: 60000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
  );

  // extract JSON from the output (opencode may wrap it in markdown)
  const cleaned = stdout.replace(/```json?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    console.error(JSON.stringify({ error: 'no JSON found in model output', raw: cleaned }));
    process.exit(1);
  }

  const card = JSON.parse(cleaned.substring(start, end + 1));

  // validate required fields
  const required = ['id', 'topic', 'difficulty', 'scenario', 'nodes', 'options', 'correct', 'explanation'];
  for (const f of required) {
    if (!card[f]) throw new Error(`missing field: ${f}`);
  }
  if (card.options.length < 2) throw new Error('need at least 2 options');
  if (!card.options.find(o => o.id === card.correct)) throw new Error('correct answer not in options');

  // normalize
  card.topic = topic;
  card.difficulty = parseInt(difficulty) || 2;

  console.log(JSON.stringify(card));
} catch (err) {
  console.error(JSON.stringify({ error: err.message, stderr: err.stderr?.substring(0, 1000) }));
  process.exit(1);
}
