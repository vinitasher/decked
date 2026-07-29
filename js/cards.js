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
    A: ["dns", "api-design"],
    B: ["databases", "api-design"],
    C: ["databases"],
    D: ["storage"]
  },
  "fallback-queue-001": {
    A: ["api-design", "messaging"],
    B: ["api-design", "real-time"],
    C: ["api-design"],
    D: ["databases"]
  },
  "fallback-db-001": {
    A: ["caching"],
    B: ["caching"],
    C: [],
    D: ["consensus", "storage"]
  },
  "fallback-consensus-001": {
    A: ["databases"],
    B: ["databases", "storage"],
    C: ["messaging"],
    D: ["storage"]
  },
  "fallback-api-001": {
    A: [],
    B: [],
    C: [],
    D: ["real-time"]
  },
  "caching-gen-1785292361000": {
    A: ["dns", "api-design"],
    B: ["databases"],
    C: ["api-design"],
    D: ["databases"]
  },
  "queues-gen-1785292786255": {
    A: ["databases"],
    B: ["messaging", "databases"],
    C: ["messaging", "caching", "databases"],
    D: ["messaging", "databases"]
  }
};

function getTopicPrerequisites(topic) {
  return [...(TOPIC_CATALOG[topic]?.prerequisites || [])];
}

function normalizePrerequisiteTopics(topics, cardTopic) {
  return [...new Set(Array.isArray(topics) ? topics : [])]
    .filter(topic =>
      typeof topic === "string" &&
      topic !== cardTopic &&
      TOPIC_CATALOG[topic]
    );
}

function normalizeCardPrerequisites(card) {
  if (!card || typeof card !== "object") return card;
  card.options = Array.isArray(card.options)
    ? card.options.map(option => ({
        ...option,
        prerequisiteTopics: normalizePrerequisiteTopics(
          Array.isArray(option?.prerequisiteTopics)
            ? option.prerequisiteTopics
            : LEGACY_OPTION_PREREQUISITES[card.id]?.[option?.id],
          card.topic
        )
      }))
    : [];
  card.prerequisiteTopics = normalizePrerequisiteTopics([
    ...getTopicPrerequisites(card.topic),
    ...(Array.isArray(card.prerequisiteTopics) ? card.prerequisiteTopics : []),
    ...card.options.flatMap(option => option.prerequisiteTopics)
  ], card.topic);
  return card;
}

const SEED_CARDS = [
  {
    id: "fallback-cache-001", topic: "caching", difficulty: 2,
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
    id: "fallback-db-001", topic: "databases", difficulty: 3,
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
    id: "fallback-consensus-001", topic: "consensus", difficulty: 4,
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
