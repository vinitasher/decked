const SEED_CARDS = [
  {
    id: "cache-001",
    topic: "caching",
    difficulty: 2,
    scenario: "A news website serves articles to millions of daily readers. The 100 most popular articles generate 80% of traffic; the remaining millions of articles are accessed rarely.",
    nodes: ["Web Client", "API Server", "Database"],
    options: [
      { id: "A", label: "Put a CDN in front of the API server and cache all responses" },
      { id: "B", label: "Cache the top 100 articles in Redis on the API server; miss goes to DB" },
      { id: "C", label: "Add 10 read replicas to the database" },
      { id: "D", label: "Pre-render every article as static HTML during deploy" }
    ],
    correct: "B",
    explanation: "B wins because the access pattern is highly skewed (80/20). A CDN (A) caches by URL, but API responses include per-user state (auth, personalization) — you'd need to strip cookies, which breaks the use case. Read replicas (C) work but 10 replicas for one bottleneck query is overkill and expensive. Pre-rendering (D) is impossible at the scale of millions of rarely-accessed articles. Redis on the API server gives sub-millisecond cache hits for the hot set, and the DB only gets the cold misses."
  },
  {
    id: "queue-001",
    topic: "queues",
    difficulty: 2,
    scenario: "A payment service processes 500 charges per second. Each charge calls an external bank API that may take 1-5 seconds to respond. The API server must not block waiting for each response.",
    nodes: ["Web App", "API Server", "Queue", "Worker Pool", "Bank API"],
    options: [
      { id: "A", label: "API server sends charge to a queue; workers pick up and call the bank, post result to a callback endpoint" },
      { id: "B", label: "API server uses async/await on the bank call; keep-alive connections handle concurrency" },
      { id: "C", label: "API server spawns a thread per charge; thread pool size = 1000" },
      { id: "D", label: "Write charges to a shared DB table; a cron job processes them every minute" }
    ],
    correct: "A",
    explanation: "A is the standard async processing pattern: queue decouples the HTTP request from the slow external call, workers scale independently, and the client gets a callback or polls for the result. B (async/await) still ties up an HTTP connection for 1-5s — at 500/s you exhaust ports and connections. C (thread-per-request) doesn't help — the blocking is the bank API latency, not CPU. D (cron) adds up to 60s of latency, unacceptable for payments."
  },
  {
    id: "db-001",
    topic: "databases",
    difficulty: 3,
    scenario: "A social media app stores user posts. Users can view their own timeline (latest 50 posts) and a global trending feed. Writes spike during major events (10x normal).",
    nodes: ["Mobile App", "API Server", "Primary DB", "Read Replica", "Cache"],
    options: [
      { id: "A", label: "Write to primary, read timeline from primary, read trending from replica" },
      { id: "B", label: "Write to primary, replicate asynchronously to a read-optimized store; reads go to cache" },
      { id: "C", label: "Write and read everything from the primary DB" },
      { id: "D", label: "Use a distributed NoSQL DB; writes go to any node, reads from local replicas" }
    ],
    correct: "B",
    explanation: "B handles both read patterns and write spikes. The timeline is user-specific and benefits from cache (write-through: cache on write, serve from cache on read). The trending feed can be pre-computed asynchronously. A reads timeline from primary — every timeline load hits the primary, which doesn't scale. C puts all load on one node — fails under 10x spike. D works at scale but adds complexity (consistency, joins) that B avoids with simple caching."
  },
  {
    id: "consensus-001",
    topic: "consensus",
    difficulty: 4,
    scenario: "A distributed configuration service stores cluster membership. All 5 nodes must agree on who is in the cluster. The network is reliable but a node may crash and restart.",
    nodes: ["Node A", "Node B", "Node C", "Node D", "Node E"],
    options: [
      { id: "A", label: "Use a leader-follower setup: Node A is always the leader; if it crashes, an operator promotes a follower" },
      { id: "B", label: "Use Raft consensus: nodes elect a leader, log entries replicate to a majority, leader crash triggers automatic re-election" },
      { id: "C", label: "Use a gossip protocol: every node periodically broadcasts its view; the cluster converges eventually" },
      { id: "D", label: "Store config in a shared filesystem (NFS); all nodes read from the same file" }
    ],
    correct: "B",
    explanation: "Raft (B) is purpose-built for this: a single leader drives decisions, majority commit ensures linearizability, automatic leader election handles crashes. A (manual failover) introduces minutes of downtime during every crash — unacceptable for a config service. C (gossip) is eventually consistent — two nodes can disagree about membership, leading to split-brain. D (NFS) is a single point of failure and a common source of bugs (caching, locks, partial writes)."
  },
  {
    id: "api-001",
    topic: "api-design",
    difficulty: 1,
    scenario: "A ride-hailing app needs a public API for third-party developers to integrate ride booking. Partners include airlines (offer ride to hotel on landing), hotels (book ride from airport), and event apps (ride to venue).",
    nodes: ["Third-Party App", "API Gateway", "Booking Service", "Driver Dispatch"],
    options: [
      { id: "A", label: "One REST endpoint: POST /ride with pickup, dropoff, time; returns ride status" },
      { id: "B", label: "REST endpoints per resource: POST /bookings, GET /bookings/{id}, PATCH /bookings/{id}/cancel" },
      { id: "C", label: "GraphQL endpoint: query { bookRide(input: ...) { status driver eta } }" },
      { id: "D", label: "gRPC bidirectional stream: client sends ride request, server streams status updates" }
    ],
    correct: "B",
    explanation: "B is the most practical public API. RESTful resource endpoints are universal, well-understood, and easy for third-party developers of any background. A (single POST) mixes creation with query — every interaction becomes a POST, defeating caching and idempotency. GraphQL (C) gives flexibility but shifts complexity to the API owner and adds query cost risks. gRPC (D) is powerful for internal services but a poor fit for diverse third-party clients (no native browser support, HTTP/2 requirement, complex error handling)."
  }
];
