const SEED_CARDS = [
  // ── Caching ──
  {
    id: "cache-001", topic: "caching", difficulty: 2,
    scenario: "A news website serves articles to millions of daily readers. The 100 most popular articles generate 80% of traffic; remaining articles are accessed rarely.",
    nodes: ["Web Client", "API Server", "Cache Layer", "Database"],
    options: [
      { id: "A", label: "Put a CDN in front of the API server and cache all responses" },
      { id: "B", label: "Cache hot articles in Redis on the API server; miss goes to DB" },
      { id: "C", label: "Add 10 read replicas to the database" },
      { id: "D", label: "Pre-render every article as static HTML during deploy" }
    ],
    correct: "B",
    explanation: "B wins because the access pattern is heavily skewed (80/20 rule). A CDN (A) would require stripping per-user state from API responses, which breaks auth and personalization. Read replicas (C) work but 10 replicas for one bottleneck query is expensive. Pre-rendering (D) is impossible at scale with millions of rarely-accessed articles. Redis gives sub-millisecond cache hits for the hot set."
  },
  {
    id: "cache-002", topic: "caching", difficulty: 3,
    scenario: "A video platform streams content globally. Popular videos get millions of views in the first hour. The platform must reduce origin server load while keeping first-byte latency under 200ms worldwide.",
    nodes: ["User", "DNS", "CDN Edge", "Origin Server"],
    options: [
      { id: "A", label: "Cache full videos at CDN edges; origin stores only the master copy" },
      { id: "B", label: "Stream directly from the origin; use HTTP/2 multiplexing" },
      { id: "C", label: "Place servers in every country; route users via geo-DNS" },
      { id: "D", label: "Cache video metadata at CDN; stream video bytes from origin" }
    ],
    correct: "A",
    explanation: "A is the standard CDN pattern: edge servers cache the popular content, serving millions of views without touching the origin. B eliminates the benefit of a CDN — every view hits the origin, which doesn't scale. C (geo-distributed servers) is what a CDN does for you — no need to build it yourself. D is half the solution: caching metadata while streaming bytes from origin still ties bandwidth to one location."
  },
  {
    id: "cache-003", topic: "caching", difficulty: 2,
    scenario: "An e-commerce product page receives 10,000 reads per second but product details change only when the merchant updates them (typically every few hours).",
    nodes: ["Browser", "Load Balancer", "App Server", "Cache", "Database"],
    options: [
      { id: "A", label: "Cache the rendered product page HTML in Redis; invalidate on merchant update" },
      { id: "B", label: "Serve every request from the database with connection pooling" },
      { id: "C", label: "Generate a static HTML page per product during deploy" },
      { id: "D", label: "Cache the product page in the browser with a 1-year TTL; app pushes updates via WebSocket" }
    ],
    correct: "A",
    explanation: "A is ideal: read-heavy with infrequent writes. Cache-aside with explicit invalidation on update gives zero stale reads and handles the 10K RPS easily. B forces the database to handle 10K reads/s, which is expensive and brittle. C doesn't work because products change independently of deploys. D (long browser cache) would show stale prices until a WebSocket reconnects — fragile and complex for no benefit over Redis."
  },

  // ── Queues & Async ──
  {
    id: "queue-001", topic: "queues", difficulty: 2,
    scenario: "A payment service processes 500 charges per second. Each charge calls an external bank API that takes 1-5 seconds to respond. The API must not block waiting.",
    nodes: ["Web App", "API Server", "Queue", "Worker Pool", "Bank API"],
    options: [
      { id: "A", label: "API sends charge to a queue; workers call the bank, post result to callback URL" },
      { id: "B", label: "API uses async/await on the bank call; keep-alive handles concurrency" },
      { id: "C", label: "API spawns a thread per charge; thread pool of 1000" },
      { id: "D", label: "Write charges to a shared DB table; cron job processes them every minute" }
    ],
    correct: "A",
    explanation: "A decouples the HTTP request from the slow bank call; workers scale independently, and the client polls or gets a callback. B still ties up connections for 1-5s at 500/s — port exhaustion. C doesn't solve the blocking problem. D adds up to 60 seconds of latency, unacceptable for payments."
  },
  {
    id: "queue-002", topic: "queues", difficulty: 3,
    scenario: "A ride-hailing app needs to match riders with nearby drivers. When a rider requests a ride, nearby drivers must be notified within 500ms. The system handles 1,000 requests/s during peak.",
    nodes: ["Rider App", "Matching Service", "Notification Queue", "Driver Location Cache", "Driver App"],
    options: [
      { id: "A", label: "Matching service pushes to a per-driver message queue; each driver polls its queue" },
      { id: "B", label: "Drivers send location via WebSocket; matching service broadcasts the request to nearby drivers via fan-out" },
      { id: "C", label: "Write the request to a shared DB; drivers poll the DB every 2 seconds" },
      { id: "D", label: "All drivers connect to a single chat room; matching service posts ride requests there" }
    ],
    correct: "B",
    explanation: "B gives the lowest latency: WebSocket for driver location updates, fan-out to nearby drivers via server-sent events or a lightweight message broker. A's per-driver queue adds serialization and pull latency. C's 2-second poll is far above the 500ms SLA. D doesn't scale — every driver receives every request, overwhelming their clients."
  },
  {
    id: "queue-003", topic: "queues", difficulty: 2,
    scenario: "A photo upload service resizes each image into 3 sizes (thumbnail, preview, full). Uploads arrive at 50/s and resizing takes 200-800ms per size.",
    nodes: ["Mobile App", "API Server", "Object Store", "Queue", "Resizer Workers"],
    options: [
      { id: "A", label: "API server resizes synchronously before responding to the client" },
      { id: "B", label: "API uploads to object store, enqueues a resize task; client polls for completion" },
      { id: "C", label: "API writes the image to the database; a cron job picks up new rows and resizes" },
      { id: "D", label: "Client resizes the image locally in the app before uploading" }
    ],
    correct: "B",
    explanation: "B follows the async pattern: upload fast, process later, notify client. A would hold the HTTP connection for 200-800ms × 3 → 600-2400ms per upload, at 50/s that's 75-200 concurrent connections per second just for resizing. C adds DB storage as an unnecessary intermediate step. D doesn't work — mobile resizing is slow and drains battery."
  },

  // ── Databases ──
  {
    id: "db-001", topic: "databases", difficulty: 3,
    scenario: "A social media app stores user posts. Users read their own timeline (latest 50 posts) and a global trending feed. Writes spike 10x during major events.",
    nodes: ["Mobile App", "API Server", "Primary DB", "Read Replica", "Cache"],
    options: [
      { id: "A", label: "Write to primary, read timeline from primary, trending from replica" },
      { id: "B", label: "Write to primary, async replicate to read-optimized store; reads from cache" },
      { id: "C", label: "Write and read everything from the primary DB" },
      { id: "D", label: "Use distributed NoSQL; writes go anywhere, reads from local replicas" }
    ],
    correct: "B",
    explanation: "B handles both patterns: timeline is user-specific and benefits from a write-through cache; trending can be pre-computed asynchronously. A reads timeline from primary — every timeline load hits the primary, which doesn't scale. C puts all load on one node — fails under 10x spike. D adds complexity (joins, consistency) that B avoids with simple caching."
  },
  {
    id: "db-002", topic: "databases", difficulty: 4,
    scenario: "A global SaaS product needs to store customer data. Regulations require data residency (EU data stays in EU). Queries must be fast regardless of which region the customer was created in.",
    nodes: ["Global Load Balancer", "API Server", "Geo-aware Router", "EU DB Cluster", "US DB Cluster", "Read Replicas (per region)"],
    options: [
      { id: "A", label: "Single global database with cross-region replication; application routes by customer region" },
      { id: "B", label: "Separate database cluster per region; customer data is written and read from the home region" },
      { id: "C", label: "One database in the cloud provider's US region; VPN tunnels for EU compliance" },
      { id: "D", label: "Store all data in S3; use Athena for queries" }
    ],
    correct: "B",
    explanation: "B satisfies data residency by design: customer data never leaves its home region. Each region has its own stack. Cross-region queries (a user traveling) read from local replicas. A risks regulatory violations if data crosses borders during replication. C fails data residency entirely. D removes relational integrity and adds high query latency."
  },

  // ── Consensus ──
  {
    id: "consensus-001", topic: "consensus", difficulty: 4,
    scenario: "A distributed config service stores cluster membership for 5 nodes. All nodes must agree on who is in the cluster. Network is reliable but nodes may crash and restart.",
    nodes: ["Node A", "Node B", "Node C", "Node D", "Node E"],
    options: [
      { id: "A", label: "Leader-follower: Node A is always leader; operator promotes a follower on crash" },
      { id: "B", label: "Raft consensus: nodes elect a leader, log replicates to majority, auto re-election on crash" },
      { id: "C", label: "Gossip protocol: every node broadcasts its view; cluster converges eventually" },
      { id: "D", label: "Store config on a shared NFS filesystem; all nodes read the same file" }
    ],
    correct: "B",
    explanation: "Raft (B) is purpose-built: single leader drives decisions, majority commit = linearizability, automatic re-election handles crashes. A involves minutes of downtime. C is eventually consistent — two nodes may disagree, causing split-brain. D (NFS) is a single point of failure with well-known bugs (caching, partial writes, locks)."
  },

  // ── API Design ──
  {
    id: "api-001", topic: "api-design", difficulty: 1,
    scenario: "A ride-hailing API is used by third-party apps (airlines, hotels, event apps) to book rides on behalf of users.",
    nodes: ["Third-Party App", "API Gateway", "Booking Service", "Driver Dispatch"],
    options: [
      { id: "A", label: "Single POST /ride endpoint with pickup, dropoff, time; returns status" },
      { id: "B", label: "REST: POST /bookings, GET /bookings/{id}, PATCH /bookings/{id}/cancel" },
      { id: "C", label: "GraphQL: query { bookRide(...) { status driver eta } }" },
      { id: "D", label: "gRPC bidirectional stream: client sends request, server streams updates" }
    ],
    correct: "B",
    explanation: "B is the most practical public API. RESTful resource endpoints are universal and well-understood. A mixes creation with query — every interaction becomes a POST, defeating idempotency. GraphQL shifts cost and complexity to the API owner. gRPC is powerful internally but a poor fit for diverse third-party clients (no native browser support)."
  },
  {
    id: "api-002", topic: "api-design", difficulty: 2,
    scenario: "A real-time chat service sends millions of messages per day. Users expect messages to arrive in under 100ms. The API must scale horizontally.",
    nodes: ["Sender Client", "API Server", "Message Queue", "Fan-out Service", "Recipient Client"],
    options: [
      { id: "A", label: "REST POST /messages; recipient polls GET /messages every second" },
      { id: "B", label: "WebSocket persistent connection; server pushes messages on write" },
      { id: "C", label: "Server-Sent Events (SSE); client opens a long-lived GET stream" },
      { id: "D", label: "REST POST /messages; webhook callback to recipient's endpoint" }
    ],
    correct: "B",
    explanation: "WebSockets (B) give bidirectional, low-latency communication — the server pushes the message the moment it's written. A's polling wastes bandwidth and adds up to 1 second of latency. C (SSE) is one-directional (server→client), so the sender still needs a separate API call. D assumes every recipient has a public HTTP endpoint — impractical for mobile clients."
  },

  // ── Load Balancing ──
  {
    id: "lb-001", topic: "loadbalancing", difficulty: 3,
    scenario: "A web service runs 20 backend instances. Some requests are slow (5+ seconds) due to external API dependencies. Slow requests consume resources and degrade latency for other requests.",
    nodes: ["Client", "Load Balancer", "Backend Pool", "External API"],
    options: [
      { id: "A", label: "Round-robin across all backends; increase health check timeout" },
      { id: "B", label: "Least-connections routing; set aggressive request timeout and circuit breaker" },
      { id: "C", label: "Distribute by client IP hash so sticky sessions pin clients to one backend" },
      { id: "D", label: "Use a single backend; scale vertically until the 5-second requests are fast" }
    ],
    correct: "B",
    explanation: "B handles the slow-request problem: least-connections avoids piling requests onto already-busy backends. A timeout + circuit breaker prevents slow requests from cascading (fail fast). A's round-robin doesn't account for load. C (IP hash) makes slow requests someone's permanent problem. D doesn't solve the root cause — vertical scaling is expensive."
  },

  // ── Storage ──
  {
    id: "store-001", topic: "storage", difficulty: 3,
    scenario: "A file-sharing service stores 50 TB of user files and needs to serve them with high throughput. Files average 10 MB. Users frequently access files from the past 30 days.",
    nodes: ["Client", "API Server", "Hot Storage", "Cold Storage", "Metadata DB"],
    options: [
      { id: "A", label: "Store everything in S3 (hot). Use S3 lifecycle policies to move files older than 30 days to S3 Glacier (cold)" },
      { id: "B", label: "Store everything on a single NFS server attached to the API servers" },
      { id: "C", label: "Store all files in the metadata database as BLOBs" },
      { id: "D", label: "Use an in-memory cache for all files; persist to disk nightly" }
    ],
    correct: "A",
    explanation: "A is the correct hybrid: S3 for hot (low-latency, high-throughput access), Glacier for cold (90% cost reduction). Lifecycle transitions automate the migration. B (NFS) doesn't scale to 50 TB. C (DB BLOBs) kills database performance for 10 MB files. D (in-memory) is economically infeasible at 50 TB."
  },

  // ── Observability ──
  {
    id: "obs-001", topic: "observability", difficulty: 2,
    scenario: "A microservices platform with 50 services needs to find the root cause when end-user requests slow down. The team wants to correlate errors across services quickly.",
    nodes: ["User Request", "API Gateway", "Service A", "Service B", "Service C"],
    options: [
      { id: "A", label: "Centralized logging: all services write to the same Elasticsearch cluster" },
      { id: "B", label: "Distributed tracing: a correlation ID propagates through every request; traces are sampled and sent to a trace backend" },
      { id: "C", label: "Monitor CPU and memory per service; set alerts on high utilization" },
      { id: "D", label: "Add health check endpoints and monitor which services are up" }
    ],
    correct: "B",
    explanation: "B (distributed tracing) is designed for this: a correlation ID follows each request across service boundaries, showing exactly which hop caused latency or error. A (centralized logs) requires manual correlation of timestamps across services. C (CPU/memory) doesn't distinguish which services are on the request path. D (health checks) only tells you if services are alive, not whether they're producing correct results."
  },

  // ── Security ──
  {
    id: "sec-001", topic: "security", difficulty: 2,
    scenario: "A financial API exposes customer account data. A third-party developer's app makes API calls on behalf of users. The bank must ensure each API call was authorized by the user and cannot be replayed.",
    nodes: ["User", "Third-Party App", "Auth Server", "API Gateway", "Bank API"],
    options: [
      { id: "A", label: "The third-party app sends the user's username and password with every API call (basic auth)" },
      { id: "B", label: "OAuth 2.0: user authorizes via the auth server, gets a short-lived access token; the app sends the token with each request" },
      { id: "C", label: "API key shared between bank and third-party; embed it in the mobile app" },
      { id: "D", label: "The user shares their session cookie with the third-party app" }
    ],
    correct: "B",
    explanation: "OAuth 2.0 (B) is the standard: the user authenticates directly with the bank's auth server, which issues a scoped, short-lived token. The third-party app never sees the user's credentials. A exposes passwords. C (API key) embeds credentials in the app where they can be extracted. D (cookie sharing) leaks user sessions."
  },

  // ── Real-Time ──
  {
    id: "rt-001", topic: "real-time", difficulty: 3,
    scenario: "A collaborative document editor must sync edits from multiple users in real time with no data loss. A user typing is producing characters every 50ms.",
    nodes: ["User A Browser", "User B Browser", "Sync Service", "Document Store"],
    options: [
      { id: "A", label: "Each user locks the document before editing; releases on save" },
      { id: "B", label: "Operational Transform (OT): each keystroke is an operation; the server transforms concurrent ops against each other" },
      { id: "C", label: "Last-write-wins: the server accepts whatever write arrives last" },
      { id: "D", label: "Users take turns editing; a queue enforces turns" }
    ],
    correct: "B",
    explanation: "Operational Transform (B) is the proven approach for character-by-character collaboration: each operation is transformed against concurrent operations from other users to produce a consistent document. A (locking) kills real-time collaboration. C (last-write-wins) causes data loss. D is impractical for real-time collaboration."
  },

  // ── Rate Limiting ──
  {
    id: "rl-001", topic: "rate-limiting", difficulty: 2,
    scenario: "A public API is used by thousands of developers. One misbehaving client is sending 10,000 requests/second, degrading the experience for everyone else. The API needs to protect itself while still allowing legitimate bursts.",
    nodes: ["Client", "API Gateway", "Rate Limiter", "App Server", "Redis"],
    options: [
      { id: "A", label: "Block the client's IP at the firewall when traffic spikes" },
      { id: "B", label: "Token bucket algorithm: each client gets N tokens/minute; refill happens in Redis" },
      { id: "C", label: "Charge per request; the client will naturally slow down as costs rise" },
      { id: "D", label: "Rate limit at the app server level using an in-memory counter per IP" }
    ],
    correct: "B",
    explanation: "Token bucket (B) is the standard: Redis stores each client's token count, the API gateway checks before forwarding the request. It allows bursts up to the bucket size while enforcing a steady-state rate. A (IP blocking) is too aggressive — a legitimate user sharing an IP gets collateral damage. C (charging) is a business solution, not an architectural one. D works only on a single server — behind a load balancer each server gets a fraction of the requests and doesn't see the full picture."
  },
  {
    id: "rl-002", topic: "rate-limiting", difficulty: 3,
    scenario: "A multi-tenant SaaS platform has customers on tiered plans: Free (100 req/hr), Pro (10,000 req/hr), Enterprise (unlimited with fair-use caps). Enforcement must be consistent across 20 backend servers.",
    nodes: ["Client", "API Gateway", "Redis Cluster", "Rate Limit Service", "Backend Pool"],
    options: [
      { id: "A", label: "Each backend server tracks its own rate limit counter locally; sum across servers at query time" },
      { id: "B", label: "Redis-backed sliding window counter; API gateway checks the count before proxying each request" },
      { id: "C", label: "Issue signed tokens to each client on login; the token encodes how many requests are allowed" },
      { id: "D", label: "Use a separate database table per customer; log every request and count rows" }
    ],
    correct: "B",
    explanation: "A Redis-backed sliding window (B) gives consistent enforcement across all 20 backends with sub-millisecond overhead. A (local counters) is inconsistent — the client can exceed limits by hitting multiple servers. C (signed tokens) is fine for pre-paid quotas but doesn't handle real-time refill. D (DB table per customer) does not scale — logging every request to a database introduces write amplification and latency."
  },

  // ── DNS ──
  {
    id: "dns-001", topic: "dns", difficulty: 2,
    scenario: "A global e-commerce site serves users in 50 countries. During a flash sale, traffic spikes 50x in one region. The site uses a single DNS A record pointing to a single server IP.",
    nodes: ["User Browser", "Recursive DNS", "Authoritative DNS", "Load Balancer IP", "Web Server"],
    options: [
      { id: "A", label: "Upgrade the single server to handle 50x traffic" },
      { id: "B", label: "Use DNS-based load balancing: multiple A records resolve to different IPs; DNS round-robins" },
      { id: "C", label: "Replace the A record with a CNAME pointing to a CDN that has the site's content" },
      { id: "D", label: "Use latency-based DNS routing; different regions resolve to different server pools" }
    ],
    correct: "D",
    explanation: "Latency-based DNS routing (D) is ideal for global services: DNS returns the IP of the closest server pool, keeping latency low and absorbing regional spikes independently. A (single server) doesn't scale. B (round-robin DNS) distributes traffic but ignores region — clients in Japan may get routed to Europe. C (CNAME to CDN) works for static content but dynamic requests still need to hit origin servers."
  },

  // ── Service Mesh ──
  {
    id: "mesh-001", topic: "loadbalancing", difficulty: 4,
    scenario: "A microservices platform has 200 services. Each service needs to discover other services, retry on failure, collect latency metrics, and enforce mTLS. Adding this logic to every service individually is not sustainable.",
    nodes: ["Service A", "Sidecar Proxy", "Control Plane", "Service Registry", "Service B"],
    options: [
      { id: "A", label: "Write a shared library implementing retry, discovery, and TLS; every service must use it" },
      { id: "B", label: "Deploy a service mesh with sidecar proxies: each service gets a proxy that handles networking concerns transparently" },
      { id: "C", label: "Configure each service to use DNS-based service discovery and leave TLS to the infrastructure" },
      { id: "D", label: "Route all traffic through a single API gateway that handles everything" }
    ],
    correct: "B",
    explanation: "Service mesh (B) is the proven solution at 200+ services: sidecar proxies intercept all traffic transparently, providing discovery, retries, metrics, and mTLS without modifying service code. A (shared library) requires every team to adopt and maintain the same library — at 200 services this fragments quickly. C leaves security and observability gaps. D (single gateway) becomes a bottleneck and a single point of failure for all inter-service communication."
  },

  // ── Messaging Patterns ──
  {
    id: "msg-001", topic: "queues", difficulty: 3,
    scenario: "An order processing system must guarantee that every order is processed exactly once. The order service receives 2,000 orders/s. If the processing service crashes mid-way, the order must not be lost or duplicated on restart.",
    nodes: ["Web App", "Order Service", "Message Broker", "Processing Service", "Database"],
    options: [
      { id: "A", label: "Order service writes to DB synchronously; processing service polls DB for new orders" },
      { id: "B", label: "Message broker with at-least-once delivery + consumer-side dedup using a unique order ID" },
      { id: "C", label: "Processing service reads from a TCP socket; if it crashes the OS sends remaining data" },
      { id: "D", label: "Use a file-based approach: write orders to NFS; processing service reads new files" }
    ],
    correct: "B",
    explanation: "B gives exactly-once semantics: at-least-once delivery guarantees the message survives crashes, while consumer-side dedup (checking order ID against processed orders in the DB) makes it idempotent. A (DB polling) is fragile — polling intervals add latency and the DB becomes a message store. C (TCP socket) loses in-flight data when the consumer crashes. D (NFS) introduces file locking and stale-NFS-cache bugs."
  },
  {
    id: "msg-002", topic: "queues", difficulty: 3,
    scenario: "An event-driven architecture has 10 event producers and 50 event consumers. Each event should be delivered to all interested consumers. New consumers should be able to replay past events to build their own state.",
    nodes: ["Producer A", "Event Bus", "Topic (partitioned)", "Consumer Group X", "Consumer Group Y"],
    options: [
      { id: "A", label: "Each producer broadcasts events via HTTP POST to every consumer" },
      { id: "B", label: "Apache Kafka: events are published to a partitioned topic; consumer groups read independently, each with its own offset" },
      { id: "C", label: "Redis pub/sub: producers publish to a channel; all subscribers receive events in real time" },
      { id: "D", label: "Store events in a shared database table; consumers poll for new rows" }
    ],
    correct: "B",
    explanation: "Kafka (B) exactly matches this: partitioned topics for parallelism, consumer groups for independent consumption, offset tracking for replay. A (HTTP POST) doesn't scale to 50 consumers — every producer fans out to 50 endpoints. C (Redis pub/sub) doesn't persist messages — a late-joining consumer cannot replay history. D (shared DB table) doesn't provide the ordering, partitioning, or throughput that Kafka provides."
  },

  // ── Monitoring ──
  {
    id: "mon-001", topic: "observability", difficulty: 1,
    scenario: "A team deploys a new API endpoint that occasionally returns 500 errors, but only for a small subset of users. The errors happen randomly and are hard to reproduce locally.",
    nodes: ["User", "CDN", "API Server", "Log Aggregator", "Monitoring Dashboard"],
    options: [
      { id: "A", label: "Add a try/catch around the new code; log the error to stdout; grep the logs when users complain" },
      { id: "B", label: "Add structured logging with the user ID and request context; send logs to a centralized logging service; set up an alert on 5xx rate" },
      { id: "C", label: "Watch the server's CPU and memory; infer the problem from resource usage patterns" },
      { id: "D", label: "Ask users to send screenshots of the error when they see it" }
    ],
    correct: "B",
    explanation: "B is proper observability: structured logs with request context let you correlate errors with user behavior, and a 5xx alert catches the problem in real time. A relies on manual grep after the fact. C gives no insight into application errors. D (user-reported screenshots) is slow, low-fidelity, and privacy-invasive."
  },

  // ── Container Orchestration ──
  {
    id: "k8s-001", topic: "loadbalancing", difficulty: 4,
    scenario: "A Python web service runs in a Docker container on a Kubernetes cluster. During a traffic spike, the service slows down but doesn't crash. Kubernetes has no way to know the service is degraded and keeps sending traffic.",
    nodes: ["User", "Ingress Controller", "K8s Service", "Pod A", "Pod B", "Horizontal Pod Autoscaler"],
    options: [
      { id: "A", label: "Increase the CPU request so Kubernetes notices the load and auto-scales" },
      { id: "B", label: "Add a liveness probe (HTTP /health) and a readiness probe (HTTP /ready that checks internal health); configure HPA based on custom metrics" },
      { id: "C", label: "Manually increase the replica count during every forecasted peak" },
      { id: "D", label: "Use a bigger instance type for the entire cluster" }
    ],
    correct: "B",
    explanation: "B is Kubernetes-native: a readiness probe that checks internal health (DB connection, queue depth, latency) tells the Service to stop sending traffic to degraded pods, while the HPA with custom metrics (requests per second, latency) triggers horizontal scaling. A (higher CPU request) doesn't help because the process isn't CPU-bound. C and D don't address automatic detection and response."
  },

  // ── CDN ──
  {
    id: "cdn-001", topic: "caching", difficulty: 2,
    scenario: "A SaaS dashboard renders dynamic charts for each user. Chart data changes every few minutes. The page loads in 4 seconds — mostly from database queries for the chart data.",
    nodes: ["User Browser", "CDN", "API Server", "Chart Render Cache", "Database"],
    options: [
      { id: "A", label: "Cache the entire dashboard HTML at the CDN for 5 minutes; invalidate on data change" },
      { id: "B", label: "Cache the raw chart data in a server-side cache (Redis), keyed by user + chart ID; CDN caches static assets only" },
      { id: "C", label: "Pre-render all chart images on a cron job every 5 minutes; serve as static PNGs from CDN" },
      { id: "D", label: "Remove the CDN entirely; serve pages and data directly from the origin server" }
    ],
    correct: "B",
    explanation: "B maximizes speed without sacrificing correctness: chart data is cached server-side in Redis (sub-millisecond reads vs 100+ms DB queries), while the CDN serves the static assets (JS, CSS). A (caching dynamic dashboard HTML at CDN) would show stale data to users — the cache invalidates on data change, but any user viewing a slightly older dataset sees wrong numbers. C pre-rendering doesn't support interactive or drill-down charts."
  }
];
