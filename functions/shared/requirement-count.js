/* Deterministic difficulty classification: a card's difficulty equals the
   number of distinct requirements in its scenario, clamped to the 1-5 scale.
   Canonical server-side implementation; the client mirror lives in
   js/cards.js and must stay in lockstep. Used by:
   - functions/api/generate.js (generation validation + normalization)
   - server/generate-card.js (local generator validation)
   - scripts/audit-card-difficulties.mjs (corpus audit, run by check.sh)
   - tests/difficulty.test.mjs */

const CLAUSE_SPLIT = /(?<=[.!?])\s+|\s*;\s*/;
const HAS_DIGIT = /\d/;

/* Design-directive clauses ("You must choose a strategy that balances X, Y,
   Z") carry no concrete requirement and are skipped — unless they contain a
   number, in which case they hold a real constraint ("Design an API that
   must handle 10,000 QPS"). */
/* Design-directive clauses ("You must choose a strategy that balances X, Y,
   Z") carry no concrete requirement and are skipped — unless they contain a
   number, in which case they hold a real constraint ("Design an API that
   must handle 10,000 QPS"). Only "must/should/need to" followed by a
   choice verb is a directive: "must tolerate failures", "must keep
   read-after-write consistency" and "must be served within 500ms" are real
   requirements. */
const DIRECTIVE_START = new RegExp(
  '^(?:you|we|your team|the (?:team|system|service|developer|engineer|sre team))\\s+' +
  '(?:are (?:designing|building|creating|choosing)|' +
  '(?:must|should|need(?:s)? to)\\s+(?:choose|select|pick|decide|balance|justify|recommend|trade)|' +
  'choose|select|pick|decide|balance|justify|recommend|trade)|' +
  '^(?:design|build|choose|select|pick|decide|create|make|the trade[- ]?off)',
  'i'
);

/* Throughput: bridges cover "50,000 booking requests per second",
   "20,000 read-heavy requests per second", "100K new bookings per day",
   "1M QPS reads", "10,000 orders/sec", "750k spans/s". */
const THROUGHPUT = /\d[\d,]*(?:\.\d+)?\s*[KMGTP]?\s*(?:booking |concurrent |read[- ]heavy |write[- ]heavy |read |write )?(?:qps|tps|rps|req\/s|requests\/s|req\/sec|requests\/sec|orders?\/s|orders?\/sec|spans?\/s|msg\/s|rpm|rph|req\/min)\b|\d[\d,]*(?:\.\d+)?\s*[KMGTP]?\s*(?:new |concurrent |booking |read[- ]heavy |write[- ]heavy |read |write )?(?:requests?|transactions?|charges?|queries?|posts?|events?|reads?|writes?|messages?|bookings?|orders?) per (?:second|minute|hour|day)\b/gi;

/* Data volume: "1TB/month" is a growth rate, not a static size — excluded. */
const VOLUME = /\d+(?:\.\d+)?\s*(?:[KMGTP]?i?B\b(?!\s*(?:per (?:month|day|week|year)|\/month))|bytes?|kilobytes?|megabytes?|gigabytes?|terabytes?)/gi;

const TIME = /\d+(?:\.\d+)?\s*(?:ms|msecs?|milliseconds?|seconds?|secs?|minutes?|hours?|days?)\b|\d+[- ](?:second|minute|hour|day)\b|sub[- ]?(?:\d+[- ]?)?s(?:econds?)?\b/gi;

/* Scale: word bridge covers "500,000 concurrent users" and "20,000 total
   seats"; quantity words are counted, unit words are not ("requests" only
   counts via the per-second throughput pattern). */
const SCALE = /\d[\d,]*(?:\.\d+)?\s*(?:millions?|thousands?|billions?)\b|\b(?:millions?|thousands?|billions?)\b|\d[\d,]*(?:\.\d+)?\s*[KMGTP]?\s*(?:concurrent |total |simultaneous |registered |daily )?(?:users?|seats?|readers?|nodes?|devices?|posts?|articles?|messages?|subscribers?|customers?|drivers?|riders?|services?)\b/gi;

const SHARE = /\d+(?:\.\d+)?%/gi;

const CONSISTENCY = /\b(?:read[- ]after[- ]write(?:\s+consisten[ct]y)?|strong consistency|eventual consistency|consisten[ct]y|serializ\w+|lineariz\w+|atomicity|exactly[- ]once|at[- ]least[- ]once|in order|in the order|order received|ordering\b|no duplicate|duplicate processing|double[- ]bookings?|split[- ]brain|quorum|idempoten\w+|must agree)\b/gi;

/* Scaling words: skipped when immediately followed by a quantified unit
   ("peaks at 20,000 QPS" is the throughput match's constraint, not a second
   one); "spike 10x" and bare "10x" still count. */
const SCALING = /\b(?:spikes?|peaks?|bursts?|grow(?:s|ing)?|surges?)\b(?!\s*\d+x)|\d+x\b/gi;

/* Cost: "budget" that is a latency/response budget is already counted by the
   time classifier, so it is excluded here via a per-match window check. */
const COST = /\b(?:cost\w*|budget\w*)\b/gi;

const DISTRIBUTION = /\b(?:data centers?|datacenters?|regions?|availability zones?|rtt|geo[- ]?distributed|multi[- ]?region)\b/gi;

const RELIABILITY = /\b(?:availab\w+|failover|durab\w+|redundan\w+|resilien\w+|no data loss|recover\w+|survive\w+|backup\w+|retry|retries|retried)\b/gi;

/* "99.9% availability" is one availability SLA, not a share + a reliability
   claim. */
const SLA_AFTER_SHARE = /\b(?:availab\w*|durab\w*|uptime)\b/i;

/* A clause about freshness/publishing/retention turns its time matches into
   deadline constraints instead of latency budgets. */
const FRESHNESS = /\b(?:fresh\w*|stale\w*|publish\w*|appear\w*|deadline\w*|confirm\w*|retention|real[- ]?time|sla)\b|past\s+\d+|within\s+\d+/i;
const LATENCY_CONTEXT = /\b(?:latenc\w*|response|rtt|p99|p95|budget|under|below|max)\b/i;
const LATENCY_WINDOW = /\b(?:latenc\w*|response)\b/i;

function clampDifficulty(count) {
  return Math.max(1, Math.min(5, count));
}

function collect(regex, clause) {
  return [...clause.matchAll(new RegExp(regex.source, 'gi'))];
}

/* Count the distinct requirements in a scenario. Returns
   { count, requirements: [{ type, value }] } where value is the matched
   snippet shown to the user. */
export function countScenarioRequirements(scenario) {
  const requirements = [];
  if (typeof scenario !== 'string' || !scenario.trim()) {
    return { count: 0, requirements };
  }
  for (const rawClause of scenario.split(CLAUSE_SPLIT)) {
    const clause = rawClause.trim();
    if (!clause) continue;
    if (DIRECTIVE_START.test(clause) && !HAS_DIGIT.test(clause)) continue;

    const local = new Set();
    let clauseCount = 0;
    const add = (type, value) => {
      const key = `${type}:${value.toLowerCase()}`;
      if (local.has(key)) return;
      local.add(key);
      requirements.push({ type, value });
      clauseCount++;
    };

    const throughputMatches = collect(THROUGHPUT, clause);
    for (const match of throughputMatches.slice(0, 3)) add('Throughput', match[0].trim());

    const volumeMatches = collect(VOLUME, clause);
    for (const match of volumeMatches.slice(0, 3)) add('Data volume', match[0].trim());

    const timeMatches = collect(TIME, clause);
    for (const match of timeMatches) {
      const before = clause.slice(Math.max(0, match.index - 28), match.index);
      const isLatency = LATENCY_CONTEXT.test(before);
      const isFreshness = FRESHNESS.test(clause);
      add(isLatency || !isFreshness ? 'Latency' : 'Deadline', match[0].trim());
    }

    const scaleMatches = collect(SCALE, clause);
    for (const match of scaleMatches.slice(0, 3)) add('Scale', match[0].trim());

    for (const match of collect(SHARE, clause)) {
      if (SLA_AFTER_SHARE.test(clause.slice(match.index + match[0].length, match.index + match[0].length + 14))) continue;
      add('Share', match[0].trim());
    }

    const consistencyMatches = collect(CONSISTENCY, clause);
    for (const match of consistencyMatches.slice(0, 3)) add('Consistency', match[0].trim());

    const unitIndexes = [
      ...throughputMatches,
      ...scaleMatches,
      ...volumeMatches,
      ...timeMatches
    ].map(match => match.index);
    for (const match of collect(SCALING, clause)) {
      const wordMatch = /\d+x\b/i.test(match[0]) ? null : match;
      if (!wordMatch) {
        add('Scaling', match[0].trim());
        continue;
      }
      const gap = Math.max(0, match.index + match[0].length);
      const absorbed = unitIndexes.some(index => {
        const distance = index - gap;
        return distance >= 0 && distance <= 12;
      });
      if (!absorbed) add('Scaling', match[0].trim());
    }

    for (const match of collect(COST, clause)) {
      const before = clause.slice(Math.max(0, match.index - 14), match.index);
      if (LATENCY_WINDOW.test(before)) continue;
      add('Cost', match[0].trim());
    }

    if (collect(DISTRIBUTION, clause).length > 0) {
      add('Distribution', collect(DISTRIBUTION, clause)[0][0].trim());
    }

    for (const match of collect(RELIABILITY, clause).slice(0, 2)) add('Reliability', match[0].trim());

    /* Freshness-flavored clause with no time match ("prices change in real
       time") is itself a deadline requirement — but only when the clause has
       not already contributed a concrete requirement. */
    if (clauseCount === 0 && FRESHNESS.test(clause)) {
      const freshnessMatch = clause.match(FRESHNESS);
      add('Deadline', freshnessMatch ? freshnessMatch[0] : 'real-time updates');
    }
  }
  return { count: requirements.length, requirements };
}

/* Difficulty = number of requirements, clamped to the 1-5 scale. */
export function difficultyFromScenario(scenario) {
  return clampDifficulty(countScenarioRequirements(scenario).count);
}

export function requirementsLabel(scenario) {
  const { requirements } = countScenarioRequirements(scenario);
  return requirements.map(item => item.value).join(' · ');
}
