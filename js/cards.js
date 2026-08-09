/* Canonical learning graph and fallback deck. */

const TOPIC_CATALOG = {
  "api-design": { label: "API Design", prerequisites: [] },
  dns: { label: "DNS", prerequisites: [] },
  caching: { label: "Caching", prerequisites: ["api-design"] },
  queues: { label: "Queues", prerequisites: ["api-design"] },
  databases: { label: "Databases", prerequisites: ["api-design"] },
  security: { label: "Security", prerequisites: ["api-design"] },
  loadbalancing: { label: "Load Balancing", prerequisites: ["dns", "api-design"] },
  storage: { label: "Storage", prerequisites: ["databases"] },
  messaging: { label: "Messaging", prerequisites: ["queues"] },
  "rate-limiting": { label: "Rate Limiting", prerequisites: ["api-design", "caching"] },
  observability: { label: "Observability", prerequisites: ["api-design"] },
  "real-time": { label: "Real-Time", prerequisites: ["api-design", "messaging"] },
  consensus: { label: "Consensus", prerequisites: ["databases", "storage"] }
};

const LEGACY_OPTION_PREREQUISITES = {
  "fallback-cache-001": {
    A: ["cdn-caching", "http-cacheability", "cache-invalidation"],
    B: ["cache-aside", "workload-skew", "cache-eviction"],
    C: ["read-replication", "database-indexing", "replication-cost"],
    D: ["static-site-generation", "content-freshness", "cache-invalidation"]
  },
  "fallback-queue-001": {
    A: ["durable-queues", "asynchronous-processing", "webhook-callbacks", "idempotency"],
    B: ["async-io", "connection-lifecycle", "backpressure"],
    C: ["thread-pools", "blocking-io", "backpressure"],
    D: ["database-polling", "batch-processing", "latency-budgets"]
  },
  "fallback-db-001": {
    A: ["read-replication", "replication-lag", "read-after-write-consistency"],
    B: ["asynchronous-replication", "read-models", "cache-invalidation"],
    C: ["vertical-scaling", "connection-pooling", "database-bottlenecks"],
    D: ["distributed-databases", "eventual-consistency", "data-partitioning"]
  },
  "fallback-consensus-001": {
    A: ["leader-failover", "failure-detection", "single-point-of-failure"],
    B: ["leader-election", "quorum-commit", "linearizability"],
    C: ["gossip-protocols", "eventual-consistency", "split-brain"],
    D: ["shared-filesystems", "single-point-of-failure", "failure-domains"]
  },
  "fallback-api-001": {
    A: ["resource-modeling", "idempotency", "operation-lifecycle"],
    B: ["rest-resources", "http-method-semantics", "idempotency"],
    C: ["graphql-schemas", "mutation-semantics", "query-cost-control"],
    D: ["grpc-streaming", "connection-lifecycle", "client-compatibility"]
  },
  "caching-gen-1785292361000": {
    A: ["cdn-caching", "cache-invalidation", "content-freshness"],
    B: ["write-through-caching", "cache-coherence", "write-ordering"],
    C: ["local-caches", "cache-coherence", "cache-invalidation"],
    D: ["database-indexing", "read-replication", "connection-pooling"]
  },
  "queues-gen-1785292786255": {
    A: ["transaction-isolation", "row-locking", "deadlocks", "connection-pooling"],
    B: ["message-partitioning", "message-ordering", "optimistic-concurrency"],
    C: ["competing-consumers", "cache-coherence", "read-modify-write-races"],
    D: ["fifo-queues", "conditional-writes", "serverless-cold-starts"]
  }
};

function getTopicPrerequisites(topic) {
  return [...(TOPIC_CATALOG[topic]?.prerequisites || [])];
}

function formatPrerequisiteLabel(topic) {
  return TOPIC_CATALOG[topic]?.label
    || topic.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function normalizePrerequisiteTopics(topics, cardTopic) {
  return [...new Set(Array.isArray(topics) ? topics : [])]
    .filter(topic =>
      typeof topic === "string" &&
      topic !== cardTopic &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)
    );
}

function normalizeCardPrerequisites(card) {
  if (!card || typeof card !== "object") return card;
  card.options = Array.isArray(card.options)
    ? card.options.map(option => ({
        ...option,
        prerequisiteTopics: normalizePrerequisiteTopics(
          LEGACY_OPTION_PREREQUISITES[card.id]?.[option?.id]
            || option?.prerequisiteTopics,
          card.topic
        )
      }))
    : [];
  const existingCardPrerequisites = LEGACY_OPTION_PREREQUISITES[card.id]
    ? []
    : (Array.isArray(card.prerequisiteTopics) ? card.prerequisiteTopics : []);
  card.prerequisiteTopics = normalizePrerequisiteTopics([
    ...getTopicPrerequisites(card.topic),
    ...existingCardPrerequisites,
    ...card.options.flatMap(option => option.prerequisiteTopics)
  ], card.topic);
  return card;
}

/* ——— Difficulty classification ———
   Mirror of functions/shared/requirement-count.js (canonical server copy).
   A card's difficulty equals the number of distinct requirements in its
   scenario, clamped to the 1-5 scale. Keep both copies in lockstep. */

const CLAUSE_SPLIT = /(?<=[.!?])\s+|\s*;\s*/;
const HAS_DIGIT = /\d/;

const DIRECTIVE_START = new RegExp(
  '^(?:you|we|your team|the (?:team|system|service|developer|engineer|sre team))\\s+' +
  '(?:are (?:designing|building|creating|choosing)|' +
  '(?:must|should|need(?:s)? to)\\s+(?:choose|select|pick|decide|balance|justify|recommend|trade)|' +
  'choose|select|pick|decide|balance|justify|recommend|trade)|' +
  '^(?:design|build|choose|select|pick|decide|create|make|the trade[- ]?off)',
  'i'
);

const THROUGHPUT = /\d[\d,]*(?:\.\d+)?\s*[KMGTP]?\s*(?:booking |concurrent |read[- ]heavy |write[- ]heavy |read |write )?(?:qps|tps|rps|req\/s|requests\/s|req\/sec|requests\/sec|orders?\/s|orders?\/sec|spans?\/s|msg\/s|rpm|rph|req\/min)\b|\d[\d,]*(?:\.\d+)?\s*[KMGTP]?\s*(?:new |concurrent |booking |read[- ]heavy |write[- ]heavy |read |write )?(?:requests?|transactions?|charges?|queries?|posts?|events?|reads?|writes?|messages?|bookings?|orders?) per (?:second|minute|hour|day)\b/gi;

const VOLUME = /\d+(?:\.\d+)?\s*(?:[KMGTP]?i?B\b(?!\s*(?:per (?:month|day|week|year)|\/month))|bytes?|kilobytes?|megabytes?|gigabytes?|terabytes?)/gi;

const TIME = /\d+(?:\.\d+)?\s*(?:ms|msecs?|milliseconds?|seconds?|secs?|minutes?|hours?|days?)\b|\d+[- ](?:second|minute|hour|day)\b|sub[- ]?(?:\d+[- ]?)?s(?:econds?)?\b/gi;

const SCALE = /\d[\d,]*(?:\.\d+)?\s*(?:millions?|thousands?|billions?)\b|\b(?:millions?|thousands?|billions?)\b|\d[\d,]*(?:\.\d+)?\s*[KMGTP]?\s*(?:concurrent |total |simultaneous |registered |daily )?(?:users?|seats?|readers?|nodes?|devices?|posts?|articles?|messages?|subscribers?|customers?|drivers?|riders?|services?)\b/gi;

const SHARE = /\d+(?:\.\d+)?%/gi;

const CONSISTENCY = /\b(?:read[- ]after[- ]write(?:\s+consisten[ct]y)?|strong consistency|eventual consistency|consisten[ct]y|serializ\w+|lineariz\w+|atomicity|exactly[- ]once|at[- ]least[- ]once|in order|in the order|order received|ordering\b|no duplicate|duplicate processing|double[- ]bookings?|split[- ]brain|quorum|idempoten\w+|must agree)\b/gi;

const SCALING = /\b(?:spikes?|peaks?|bursts?|grow(?:s|ing)?|surges?)\b(?!\s*\d+x)|\d+x\b/gi;

const COST = /\b(?:cost\w*|budget\w*)\b/gi;

const DISTRIBUTION = /\b(?:data centers?|datacenters?|regions?|availability zones?|rtt|geo[- ]?distributed|multi[- ]?region)\b/gi;

const RELIABILITY = /\b(?:availab\w+|failover|durab\w+|redundan\w+|resilien\w+|no data loss|recover\w+|survive\w+|backup\w+|retry|retries|retried)\b/gi;

const FRESHNESS = /\b(?:fresh\w*|stale\w*|publish\w*|appear\w*|deadline\w*|confirm\w*|retention|real[- ]?time|sla)\b|past\s+\d+|within\s+\d+/i;
const LATENCY_CONTEXT = /\b(?:latenc\w*|response|rtt|p99|p95|budget|under|below|max)\b/i;
const LATENCY_WINDOW = /\b(?:latenc\w*|response)\b/i;
const SLA_AFTER_SHARE = /\b(?:availab\w*|durab\w*|uptime)\b/i;

function collectMatches(regex, clause) {
  return [...clause.matchAll(new RegExp(regex.source, 'gi'))];
}

function countScenarioRequirements(scenario) {
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

    const throughputMatches = collectMatches(THROUGHPUT, clause);
    for (const match of throughputMatches.slice(0, 3)) add('Throughput', match[0].trim());

    const volumeMatches = collectMatches(VOLUME, clause);
    for (const match of volumeMatches.slice(0, 3)) add('Data volume', match[0].trim());

    const timeMatches = collectMatches(TIME, clause);
    for (const match of timeMatches) {
      const before = clause.slice(Math.max(0, match.index - 28), match.index);
      const isLatency = LATENCY_CONTEXT.test(before);
      const isFreshness = FRESHNESS.test(clause);
      add(isLatency || !isFreshness ? 'Latency' : 'Deadline', match[0].trim());
    }

    const scaleMatches = collectMatches(SCALE, clause);
    for (const match of scaleMatches.slice(0, 3)) add('Scale', match[0].trim());

    for (const match of collectMatches(SHARE, clause)) {
      if (SLA_AFTER_SHARE.test(clause.slice(match.index + match[0].length, match.index + match[0].length + 14))) continue;
      add('Share', match[0].trim());
    }

    const consistencyMatches = collectMatches(CONSISTENCY, clause);
    for (const match of consistencyMatches.slice(0, 3)) add('Consistency', match[0].trim());

    const unitIndexes = [
      ...throughputMatches,
      ...scaleMatches,
      ...volumeMatches,
      ...timeMatches
    ].map(match => match.index);
    for (const match of collectMatches(SCALING, clause)) {
      if (/\d+x\b/i.test(match[0])) {
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

    for (const match of collectMatches(COST, clause)) {
      const before = clause.slice(Math.max(0, match.index - 14), match.index);
      if (LATENCY_WINDOW.test(before)) continue;
      add('Cost', match[0].trim());
    }

    const distributionMatches = collectMatches(DISTRIBUTION, clause);
    if (distributionMatches.length > 0) add('Distribution', distributionMatches[0][0].trim());

    for (const match of collectMatches(RELIABILITY, clause).slice(0, 2)) add('Reliability', match[0].trim());

    if (clauseCount === 0 && FRESHNESS.test(clause)) {
      const freshnessMatch = clause.match(FRESHNESS);
      add('Deadline', freshnessMatch ? freshnessMatch[0] : 'real-time updates');
    }
  }
  return { count: requirements.length, requirements };
}

function difficultyFromScenario(scenario) {
  return Math.max(1, Math.min(5, countScenarioRequirements(scenario).count));
}

function requirementsLabel(scenario) {
  return countScenarioRequirements(scenario).requirements
    .map(item => item.value).join(' · ');
}

const SEED_CARDS = [
  {
    id: "fallback-cache-001", topic: "caching", difficulty: 3,
    prerequisiteTopics: ["api-design", "dns", "databases", "storage"],
    scenario: "A news website serves articles to millions of daily readers. The most popular 100 articles generate 80% of traffic.",
    nodes: ["Web Client", "API Server", "Cache Layer", "Database"],
    options: [
      { id: "A", label: "Put a CDN in front of the API server and cache all responses", prerequisiteTopics: ["dns", "api-design"] },
      { id: "B", label: "Cache hot articles in Redis on the API server; miss goes to DB", prerequisiteTopics: ["databases", "api-design"] },
      { id: "C", label: "Add 10 read replicas to the database", prerequisiteTopics: ["databases"] },
      { id: "D", label: "Pre-render every article as static HTML during deploy", prerequisiteTopics: ["storage"] }
    ],
    correct: "B",
    explanation: "B wins because the access pattern is heavily skewed (80/20 rule). A CDN (A) requires stripping per-user state from API responses. Read replicas (C) are expensive for one bottleneck query. Pre-rendering (D) doesn't work at scale with millions of rarely-accessed articles."
  },
  {
    id: "fallback-queue-001", topic: "queues", difficulty: 2,
    prerequisiteTopics: ["api-design", "messaging", "real-time", "databases"],
    scenario: "A payment service processes 500 charges per second. Each charge calls an external bank API that takes 1-5 seconds to respond.",
    nodes: ["Web App", "API Server", "Queue", "Worker Pool", "Bank API"],
    options: [
      { id: "A", label: "API sends charge to a queue; workers call the bank; post result to callback URL", prerequisiteTopics: ["api-design", "messaging"] },
      { id: "B", label: "API uses async/await on the bank call; keep-alive handles concurrency", prerequisiteTopics: ["api-design", "real-time"] },
      { id: "C", label: "API spawns a thread per charge; thread pool of 1000", prerequisiteTopics: ["api-design"] },
      { id: "D", label: "Write charges to a shared DB table; cron job processes them every minute", prerequisiteTopics: ["databases"] }
    ],
    correct: "A",
    explanation: "A decouples the HTTP request from the slow bank call; workers scale independently. B still ties up connections for 1-5s at 500/s. C doesn't solve the blocking problem. D adds up to 60 seconds of latency."
  },
  {
    id: "fallback-db-001", topic: "databases", difficulty: 2,
    prerequisiteTopics: ["api-design", "caching", "consensus", "storage"],
    scenario: "A social media app stores user posts. Users view their timeline (latest 50 posts) and a global trending feed. Writes spike 10x during events.",
    nodes: ["Mobile App", "API Server", "Primary DB", "Read Replica", "Cache"],
    options: [
      { id: "A", label: "Write to primary, read timeline from primary, trending from replica", prerequisiteTopics: ["caching"] },
      { id: "B", label: "Write to primary, async replicate to read-optimized store; reads from cache", prerequisiteTopics: ["caching"] },
      { id: "C", label: "Write and read everything from the primary DB", prerequisiteTopics: [] },
      { id: "D", label: "Use distributed NoSQL; writes go anywhere, reads from local replicas", prerequisiteTopics: ["consensus", "storage"] }
    ],
    correct: "B",
    explanation: "B handles both patterns: timeline is user-specific and benefits from a write-through cache; trending can be pre-computed asynchronously. A reads timeline from primary — doesn't scale. C puts all load on one node. D adds unnecessary complexity for this use case."
  },
  {
    id: "fallback-consensus-001", topic: "consensus", difficulty: 2,
    prerequisiteTopics: ["databases", "storage", "messaging"],
    scenario: "A distributed config service stores cluster membership for 5 nodes. All nodes must agree on who is in the cluster.",
    nodes: ["Node A", "Node B", "Node C", "Node D", "Node E"],
    options: [
      { id: "A", label: "Leader-follower: Node A is always leader; operator promotes on crash", prerequisiteTopics: ["databases"] },
      { id: "B", label: "Raft consensus: auto-election, majority commit, linearizable", prerequisiteTopics: ["databases", "storage"] },
      { id: "C", label: "Gossip protocol: each node broadcasts; cluster converges eventually", prerequisiteTopics: ["messaging"] },
      { id: "D", label: "Store config on a shared NFS filesystem", prerequisiteTopics: ["storage"] }
    ],
    correct: "B",
    explanation: "Raft (B) is purpose-built: single leader, majority commit, automatic re-election. A involves minutes of downtime. C is eventually consistent — risk of split-brain. D introduces a single point of failure."
  },
  {
    id: "fallback-api-001", topic: "api-design", difficulty: 1,
    prerequisiteTopics: ["real-time"],
    scenario: "A ride-hailing API is used by third-party apps (airlines, hotels) to book rides on behalf of users.",
    nodes: ["Third-Party App", "API Gateway", "Booking Service", "Driver Dispatch"],
    options: [
      { id: "A", label: "Single POST /ride endpoint with all params; returns ride status", prerequisiteTopics: [] },
      { id: "B", label: "REST: POST /bookings, GET /bookings/{id}, PATCH /bookings/{id}/cancel", prerequisiteTopics: [] },
      { id: "C", label: "GraphQL: query { bookRide(...) { status driver eta } }", prerequisiteTopics: [] },
      { id: "D", label: "gRPC bidirectional stream: client sends request, server streams updates", prerequisiteTopics: ["real-time"] }
    ],
    correct: "B",
    explanation: "B is the most practical public API. RESTful resource endpoints are universal. A mixes creation with query, defeating idempotency. GraphQL shifts cost and complexity to the API owner. gRPC is poor for diverse third-party clients."
  }
];
