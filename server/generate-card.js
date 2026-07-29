#!/usr/bin/env node
/* generate-card.js — calls opencode CLI to produce a flash card JSON object */

const { execSync } = require('child_process');

const topic = process.argv[2] || 'caching';
const difficulty = process.argv[3] || '2';

const prompt = `Generate a system design flash card for the topic "${topic}" at difficulty ${difficulty}/5 (5 = hardest). This card will be used by engineers learning system design — it must be accurate, specific, and teach a real trade-off.

The card must be a single JSON object with these exact keys:
- id: "${topic}-gen-${Date.now()}"
- topic: "${topic}"
- difficulty: ${difficulty}
- scenario: a realistic system design problem as 2-3 sentences. MUST include concrete numbers (QPS, latency in ms, data volume in GB/TB, users, or RPS). The problem must force a trade-off between two approaches.
- nodes: 4-5 system components, use real technology names (e.g. "Redis Cluster" not just "Cache", "Postgres with read replicas" not just "DB").
- options: 4 objects {id, label} where B is correct. Each option must be a real approach an experienced engineer might argue for. The three wrong options must fail for THREE COMPLETELY DIFFERENT reasons — one for cost/scalability, one for consistency/correctness, one for latency/complexity.
- correct: "B"
- explanation: explain why each of A, C, D fails (different reason per option) and why B wins. Be specific: name the scalability bottleneck, the consistency anomaly, the cost trade-off. 4-6 sentences.

EXAMPLES OF GOOD OPTIONS STRUCTURE:
- Option A fails because it introduces a single point of failure or coupling
- Option C fails because it doesn't scale cost-effectively at the given QPS
- Option D fails because it sacrifices consistency guarantees the scenario requires

CRITICAL RULES:
- Every option must be concrete (name real technologies: Redis, Kafka, S3, Postgres, WebSocket, gRPC, CDN, DynamoDB, Elasticsearch, RabbitMQ, etc.)
- The scenario MUST differ from every previous card's scenario
- The explanation must name the specific bottleneck or trade-off for each option
- Difficulty ${difficulty}/5 means: 1=basic CRUD, 3=multi-service caching/async, 5=distributed consensus/partitioning
- Output ONLY valid JSON — no markdown, no code fences, no surrounding text.`;

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
