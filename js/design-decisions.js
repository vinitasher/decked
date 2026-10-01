/* System Design Flashcards — Design Decisions reference data.
   Each entry compares the viable options for one recurring architecture
   decision across the criteria that matter, then records the decision and the
   rationale. `cells` is a row-per-criterion, column-per-option matrix aligned
   with `criteria` and `options`. */
const DESIGN_DECISIONS = [
  {
    id: 'data-store',
    relatedConcepts: ["databases","distributed-databases","data-partitioning","database-indexing","read-replication","eventual-consistency","caching","storage"],
    practiceTopics: ["databases","storage","caching"],
    title: 'Data store — SQL vs NoSQL (key-value)',
    question: 'Where should generated content, learner profiles, and cached wiki entries live?',
    context: 'The app is read-heavy (a card or profile is read far more often than it is written), writes are infrequent and user-scoped, and the payloads are self-contained JSON blobs fetched by key and never joined across records.',
    criteria: ['Read latency at the edge', 'Schema flexibility', 'Cross-record joins', 'Write-volume fit', 'Operational cost / ops', 'Time-to-live expiry', 'Offline first-load path'],
    options: ['SQL (PostgreSQL)', 'NoSQL document (MongoDB)', 'NoSQL key-value (Cloudflare KV)'],
    cells: [
      ['Weak (origin round-trip)', 'Weak (origin round-trip)', 'Strong (edge-replicated)'],
      ['Weak (migrations)', 'Good (flexible docs)', 'Strong (opaque JSON values)'],
      ['Strong', 'Fair', 'Weak (not supported)'],
      ['Overkill', 'Overkill', 'Well matched (low)'],
      ['High (server, backups)', 'High', 'Minimal (managed)'],
      ['Needs cron/jobs', 'Needs TTL index', 'Built in'],
      ['Needs a live API', 'Needs a live API', 'Pairs with bundled JSON']
    ],
    decision: 'NoSQL key-value (Cloudflare KV) for generated cards, learner profiles, wiki entries, and sandbox recipes; the seed card catalog and the 80-entry wiki snapshot ship as static JSON inside the PWA bundle.',
    rationale: 'The access pattern is keyed reads of self-contained JSON blobs with no relational queries, which is exactly KV\'s sweet spot. Bundling seed content as static JSON removes the database from the critical first-load path and keeps the app usable offline. A relational engine would add migrations, server operations, and origin latency for features the app never uses.'
  },
  {
    id: 'compute',
    relatedConcepts: ["serverless-cold-starts","connection-lifecycle","vertical-scaling","async-io","connection-pooling"],
    practiceTopics: ["api-design","observability"],
    title: 'Compute — serverless edge functions vs self-hosted application server',
    question: 'Where does the small amount of server logic (card/wiki generation, profile sync, sandbox prewarm) actually run?',
    context: 'The server surface is a handful of endpoints that call an external model, validate the result, and cache it.',
    criteria: ['Global latency', 'Ops / patching burden', 'Cost at low/idle traffic', 'Cold starts / scaling', 'Long-running generation calls', 'Vendor lock-in'],
    options: ['Self-hosted server (FastAPI on a VPS)', 'Containerized service', 'Serverless edge (Cloudflare Pages Functions)'],
    cells: [
      ['Weak (one region)', 'Weak (one region)', 'Strong (edge network)'],
      ['High', 'Medium', 'None (managed)'],
      ['Fixed, wasted', 'Fixed, wasted', 'Pay per request'],
      ['Manual', 'Manual', 'Automatic'],
      ['Strong', 'Strong', 'Fair (CPU-time limits)'],
      ['None', 'Low', 'High']
    ],
    decision: 'Serverless edge functions on Cloudflare Pages, with the long-running model call isolated to a single function invoked per request.',
    rationale: 'Serverless removes patching and scaling entirely, and edge placement puts the endpoints close to users worldwide. The main risk, CPU-time limits, is avoided because generation is I/O-bound (waiting on the provider), not compute-bound.'
  },
  {
    id: 'frontend-delivery',
    relatedConcepts: ["cdn-caching","http-cacheability","static-site-generation","content-freshness","dns"],
    practiceTopics: ["caching","dns"],
    title: 'Frontend delivery — static PWA vs server-rendered vs native app',
    question: 'How is the product delivered to the learner\'s device?',
    context: 'The experience is one-card-at-a-time and fully client-driven once the deck is loaded.',
    criteria: ['Offline / installable', 'First-load speed', 'App-store gate', 'Build/CI complexity', 'Reach (one codebase)', 'Push / device APIs'],
    options: ['Server-rendered (SSR/MPA)', 'Static SPA + PWA', 'Native app (iOS/Android)'],
    cells: [
      ['Weak', 'Strong', 'Strong'],
      ['Fair (server work)', 'Strong (CDN-cached)', 'Strong (installed)'],
      ['None', 'None', 'Required'],
      ['Medium', 'Low', 'High (two platforms)'],
      ['Strong', 'Strong', 'Weak (separate builds)'],
      ['Weak', 'Fair (service worker)', 'Strong']
    ],
    decision: 'A static, installable PWA served from a CDN (Cloudflare Pages), written in vanilla JavaScript with a service worker.',
    rationale: 'There is no server rendering to do, so a static PWA gives native-like installability and offline use without the app-store gate or the cost of maintaining two platform codebases.'
  },
  {
    id: 'client-framework',
    relatedConcepts: ["static-site-generation","cdn-caching","http-cacheability"],
    practiceTopics: ["caching"],
    title: 'Client framework — vanilla JavaScript vs a frontend framework',
    question: 'Should the PWA be built on a framework (React/Svelte/Vue) or plain JavaScript?',
    context: 'The surface is a small number of screens (dashboard, card, concept lab, stats) with modest state.',
    criteria: ['Dependency / bundle size', 'Build step required', 'Control over SW/routing', 'Hiring / ecosystem familiarity', 'Long-term refactoring ergonomics', 'Suitability for this UI (a few screens)'],
    options: ['Vanilla JS', 'React/Vue/Svelte'],
    cells: [
      ['Strong (minimal)', 'Weak (larger)'],
      ['Weak (served directly)', 'Strong (bundler)'],
      ['Strong', 'Fair (abstracted)'],
      ['Weak', 'Strong'],
      ['Weak', 'Strong'],
      ['Strong', 'Overkill']
    ],
    decision: 'Vanilla JavaScript with hash-based routing and a hand-rolled service worker.',
    rationale: 'Shipping plain JavaScript means the app is served directly as static assets with no build step, keeping CI simple and the bundle tiny, while retaining full control over the service worker and offline caching that a PWA depends on.'
  },
  {
    id: 'profile-state',
    relatedConcepts: ["read-after-write-consistency","eventual-consistency","optimistic-concurrency","read-modify-write-races","local-caches"],
    practiceTopics: ["databases","caching"],
    title: 'Profile state — client-side vs server-side vs hybrid sync',
    question: 'Where does the learner\'s progress live, and how does it survive device changes?',
    context: 'The profile must render instantly, work offline, and follow the user across devices.',
    criteria: ['Offline / instant UI', 'Cross-device continuity', 'Privacy / data ownership', 'Conflict handling', 'Resilience to server outage'],
    options: ['Client-only (localStorage)', 'Server-only (DB)', 'Hybrid (local + sync)'],
    cells: [
      ['Strong', 'Weak', 'Strong'],
      ['Weak', 'Strong', 'Strong'],
      ['Strong', 'Weak', 'Fair'],
      ['None needed', 'None (single source)', 'Needed (timestamps)'],
      ['Strong', 'Weak', 'Strong']
    ],
    decision: 'Hybrid — the browser\'s local copy is the source of truth for immediate rendering and offline use, and changes synchronize asynchronously to Cloudflare KV; signed-in profiles use the verified Supabase subject, anonymous profiles use the device id.',
    rationale: 'Local-first storage gives instant, offline-capable UI, while the KV mirror adds cross-device continuity. Because profiles are single-user, the only conflict is two devices edited while apart, which is resolved by the newer-timestamp-wins rule.'
  },
  {
    id: 'content-generation',
    relatedConcepts: ["static-site-generation","serverless-cold-starts","content-freshness","cache-invalidation","http-cacheability"],
    practiceTopics: ["caching","api-design"],
    title: 'Content generation — build-time vs runtime vs hybrid',
    question: 'When are cards and wiki entries produced — ahead of time, on demand, or both?',
    context: 'The most common content must be instant and offline, while the long tail still needs fresh coverage.',
    criteria: ['First-load / offline coverage', 'Freshness / long tail', 'Model cost control', 'Latency for new content', 'Content breadth'],
    options: ['Build-time only', 'Runtime only', 'Hybrid (snapshot + lazy)'],
    cells: [
      ['Strong', 'Weak', 'Strong'],
      ['Weak (fixed catalog)', 'Strong', 'Strong'],
      ['Strong (bounded)', 'Weak (unbounded)', 'Strong (quota + cache)'],
      ['Instant', 'Depends on generation', 'Instant (cached)'],
      ['Weak', 'Strong', 'Strong']
    ],
    decision: 'Hybrid — a committed snapshot (seed cards and 80 wiki entries) ships in the bundle, while unseen concepts and fresh cards are lazily generated at runtime and cached in KV (30-day TTL for wiki, permanent pools for cards).',
    rationale: 'The snapshot makes the most common content instant and offline; lazy generation covers the long tail without pre-paying for it. Quota limits and cache reuse bound model cost, so cache hits never consume quota.'
  },
  {
    id: 'offline-strategy',
    relatedConcepts: ["http-cacheability","cdn-caching","cache-invalidation","content-freshness"],
    practiceTopics: ["caching"],
    title: 'Offline strategy — cache-first vs network-first',
    question: 'When the network is slow or down, what should the PWA serve?',
    context: 'The app shell changes rarely; generated content is immutable by key.',
    criteria: ['Perceived speed offline', 'Freshness of app shell', 'Freshness of generated content', 'Complexity'],
    options: ['Cache-first', 'Network-first', 'Stale-while-revalidate'],
    cells: [
      ['Strong', 'Weak', 'Strong'],
      ['Weak (stale risk)', 'Strong', 'Strong'],
      ['Good (cached by key)', 'Strong', 'Fair'],
      ['Low', 'Low', 'Medium']
    ],
    decision: 'Network-first for same-origin application assets (so a deploy reaches users promptly, keeping the last good response for offline), and cache-first for generated content and the bundled snapshot.',
    rationale: 'The app shell must update cleanly after a deploy, so it is refreshed from the network. Content is immutable by key and cached, so serving it cache-first is both fast and correct.'
  },
  {
    id: 'authentication',
    relatedConcepts: ["security","client-compatibility","webhook-callbacks","idempotency"],
    practiceTopics: ["security"],
    title: 'Authentication — managed identity vs roll-your-own',
    question: 'How are users identified for synced profiles?',
    context: 'Identity is high-risk, low-differentiation work that must not block anonymous use.',
    criteria: ['OAuth flows / security review', 'Anonymous device-id path', 'Time to ship', 'Operational burden', 'Cost'],
    options: ['Roll-your-own auth', 'Managed identity (Supabase)'],
    cells: [
      ['Weak (build + audit)', 'Strong (handled)'],
      ['Strong', 'Strong'],
      ['Weak', 'Strong'],
      ['High', 'Low'],
      ['Low (DIY)', 'Freemium tier']
    ],
    decision: 'Supabase for verified signed-in identities, plus an anonymous browser device-id path; both resolve to a stable identity key for the KV profile namespace.',
    rationale: 'Delegating identity and OAuth to a managed provider removes the security review and redirect handling burden, while the anonymous path keeps the product usable without an account.'
  },
  {
    id: 'consistency-model',
    relatedConcepts: ["eventual-consistency","linearizability","quorum-commit","read-after-write-consistency","replication-lag","split-brain"],
    practiceTopics: ["databases","consensus","storage"],
    title: 'Consistency model — strong vs eventual',
    question: 'Must profile and cache writes be immediately consistent across replicas?',
    context: 'This is single-user, single-writer data with rare multi-device races.',
    criteria: ['Cross-device conflict freedom', 'Edge write latency', 'Offline tolerance', 'Operational complexity'],
    options: ['Strong consistency', 'Eventual consistency'],
    cells: [
      ['Strong', 'Fair (LWW by timestamp)'],
      ['Weak (coordination)', 'Strong'],
      ['Weak', 'Strong'],
      ['High', 'Low']
    ],
    decision: 'Eventual consistency, with last-writer-wins by timestamp for profile fields and immutable cached keys for generated content.',
    rationale: 'The coordination cost of strong consistency buys nothing for single-user data. Timestamped LWW handles the rare two-device race simply, and generated content is immutable by key so a cached read is always consistent with itself.'
  },
  {
    id: 'content-storage',
    relatedConcepts: ["storage","distributed-databases","data-partitioning","database-indexing","caching"],
    practiceTopics: ["storage","databases"],
    title: 'Content storage — KV vs object storage vs relational',
    question: 'Is key-value the right store for all content, or do larger or relational artifacts need something else?',
    context: 'Every stored artifact is a small, keyed JSON blob.',
    criteria: ['Small JSON blobs by key', 'Large binaries / media', 'Querying across records', 'Edge replication', 'Cost for this payload profile'],
    options: ['KV (Cloudflare KV)', 'Object storage (R2)', 'Relational (SQL)'],
    cells: [
      ['Strong', 'Overkill', 'Overkill'],
      ['Weak (25 MB value cap)', 'Strong', 'Weak'],
      ['Weak', 'Weak', 'Strong'],
      ['Strong', 'Fair', 'Weak'],
      ['Strong', 'Fair', 'High']
    ],
    decision: 'KV for small, keyed JSON blobs (cards, profiles, wiki entries, sandbox recipes) and static JSON in the bundle for seed content; no object store or relational engine is used.',
    rationale: 'Every stored artifact is small and read by key, so KV is the cheapest, simplest store that meets the needs. R2 and SQL would each solve a problem this app does not have.'
  },
  {
    id: 'deployment-topology',
    relatedConcepts: ["cdn-caching","dns","content-freshness","loadbalancing"],
    practiceTopics: ["dns","loadbalancing","caching"],
    title: 'Deployment topology — multi-region edge vs single-region origin',
    question: 'Should the app be served from many edge locations or one origin region?',
    context: 'The audience is global, and the payloads are static or edge-replicated.',
    criteria: ['Latency for global learners', 'Availability / failover', 'Operations / setup', 'Cost'],
    options: ['Single-region origin', 'Multi-region edge (Cloudflare)'],
    cells: [
      ['Weak', 'Strong'],
      ['Fair', 'Strong'],
      ['Simple', 'Simple (managed)'],
      ['Low', 'Low (static + edge)']
    ],
    decision: 'Multi-region edge via Cloudflare Pages + KV, with a global CDN for static assets.',
    rationale: 'Serving from the edge collapses round-trip latency with no additional operational burden.'
  },
  {
    id: 'repository-structure',
    relatedConcepts: ["api-design","messaging"],
    practiceTopics: ["api-design"],
    title: 'Repository structure — monorepo vs polyrepo',
    question: 'Should this project live in its own repository or share the lab monorepo?',
    context: 'This is inherited from the lab\'s governance rather than a product-specific trade-off.',
    criteria: ['Independent versioning/release', 'Shared CI / portfolio context', 'Cross-project drift visibility', 'Promotion cost (when launched)'],
    options: ['Polyrepo (own repo)', 'Monorepo (lab subdirectory)'],
    cells: [
      ['Strong', 'Fair'],
      ['Weak', 'Strong'],
      ['Weak', 'Strong'],
      ['None', 'A one-time split']
    ],
    decision: 'Monorepo — this project is one top-level subdirectory of mamaLab until a promotion trigger (launch, independent versioning, ownership, or bloat) fires, at which point it moves to its own repository.',
    rationale: 'Extra repositories fragment portfolio context and cost agent runs without a launch-level benefit. The project stays here until a concrete trigger justifies a split.'
  },
  {
    id: 'client-server-topology',
    title: 'Topology — client-server vs peer-to-peer vs serverless',
    question: 'How should the system nodes be arranged, and who holds authoritative state?',
    context: 'The workload determines whether a central server, direct peer links, or managed functions fit best.',
    criteria: ['State authority', 'Operational control', 'Scale model', 'Peer latency'],
    options: ['Client-server', 'Peer-to-peer', 'Serverless functions'],
    cells: [
      ['Central server', 'Replicated across peers', 'External managed store'],
      ['Full control', 'Full control, complex', 'Least control'],
      ['Scale servers', 'Scale with peers', 'Auto-scale per request'],
      ['Via server', 'Direct (low)', 'Via platform']
    ],
    decision: 'Client-server for most products because it centralizes shared state and security; peer-to-peer only when direct peer exchange or censorship resistance is the point; serverless when the logic is small and event-driven.',
    rationale: 'A central server is the simplest place to enforce consistency and access control. Peer-to-peer pays a coordination and trust cost that few products need, and serverless trades control for operational simplicity.'
  },
  {
    id: 'consistent-hashing',
    title: 'Hashing — consistent hashing vs modulo vs rendezvous',
    question: 'How should keys be assigned to a changing set of nodes so rebalancing stays cheap?',
    context: 'A cache or sharded store must remap keys when nodes join or leave.',
    criteria: ['Rebalancing cost', 'Load balance', 'Hot-key handling', 'Complexity'],
    options: ['Modulo hashing', 'Consistent hashing', 'Rendezvous (HRW)'],
    cells: [
      ['Nearly all keys remap', 'Only affected range moves', 'Only affected range moves'],
      ['Even when stable', 'Needs virtual nodes', 'Good with weights'],
      ['None', 'None', 'None'],
      ['Trivial', 'Moderate', 'Moderate']
    ],
    decision: 'Consistent hashing (with virtual nodes) for caches and sharded stores; rendezvous hashing when weighted, minimal-movement placement matters; never naive modulo for a resizable cluster.',
    rationale: 'Modulo is simplest but remaps almost everything on any node change. Consistent hashing bounds the disruption to a small key range, and rendezvous hashing generalizes it with per-key node ordering at a small lookup cost.'
  },
  {
    id: 'websockets',
    title: 'Real-time channel — WebSockets vs SSE vs long polling',
    question: 'How should the server push live updates to clients?',
    context: 'The feature needs low-latency, possibly bidirectional, updates.',
    criteria: ['Direction', 'Latency', 'Proxy support', 'Connection overhead'],
    options: ['Long polling', 'Server-Sent Events', 'WebSockets'],
    cells: [
      ['Client pulls', 'Server pushes (one-way)', 'Full duplex'],
      ['Higher (poll gap)', 'Low', 'Lowest'],
      ['Broad', 'Broad (plain HTTP)', 'Needs upgrade support'],
      ['Repeated requests', 'One long connection', 'One long connection']
    ],
    decision: 'WebSockets when true two-way messaging is needed; Server-Sent Events for one-way server pushes over plain HTTP; long polling only as a fallback where neither is available.',
    rationale: 'WebSockets give the lowest latency and bidirectional traffic but need proxy support. SSE is simpler and firewall-friendly for one-way streams. Long polling is a lowest-common-denominator fallback at the cost of latency and overhead.'
  },
  {
    id: 'webhooks',
    title: 'Event delivery — webhooks vs polling',
    question: 'How should a consumer learn about events from a provider?',
    context: 'A provider emits events; a consumer needs timely, reliable updates.',
    criteria: ['Timeliness', 'Reachability requirement', 'Delivery guarantees', 'Consumer load'],
    options: ['Polling', 'Webhooks'],
    cells: [
      ['Bounded by poll interval', 'Immediate'],
      ['Consumer-only', 'Provider must reach consumer'],
      ['Consumer controls', 'At-least-once + retries'],
      ['Steady poll traffic', 'Bursty on events']
    ],
    decision: 'Webhooks for timely, event-driven delivery when the consumer is reachable; polling when the consumer cannot accept inbound calls or wants pull-based control.',
    rationale: 'Webhooks deliver events immediately but require a public endpoint and idempotent handling for retries. Polling is simpler and works behind firewalls but pays constant request overhead and poll latency.'
  },
  {
    id: 'messaging',
    title: 'Decoupling — synchronous call vs message queue',
    question: 'Should the caller wait for the work, or hand it off to a queue?',
    context: 'A slow or bursty operation does not need to block the caller.',
    criteria: ['Caller latency', 'Backpressure', 'Ordering guarantees', 'Complexity'],
    options: ['Synchronous call', 'Message queue'],
    cells: [
      ['Waits for completion', 'Immediate acknowledgment'],
      ['Rejects under load', 'Buffers in queue'],
      ['Inherent', 'Needs partitions/keys'],
      ['Low', 'Higher']
    ],
    decision: 'A message queue when the caller must not wait or the producer outpaces the consumer; a synchronous call when the result is needed inline and load is bounded.',
    rationale: 'Queues decouple producer and consumer, smooth spikes, and enable retries, but add ordering and visibility complexity. Synchronous calls are simpler but couple the caller to the callee latency and availability.'
  },
  {
    id: 'api-gateway',
    title: 'API entry — gateway vs direct client-to-service',
    question: 'Should clients call services directly or through a single gateway?',
    context: 'Many services expose APIs to several client types.',
    criteria: ['Cross-cutting policy', 'Coupling', 'Failure point', 'Latency'],
    options: ['Direct to services', 'API gateway'],
    cells: [
      ['Replicated per service', 'Centralized'],
      ['Client coupled to many endpoints', 'Client sees one surface'],
      ['None', 'Gateway is one'],
      ['Fewer hops', 'One extra hop']
    ],
    decision: 'An API gateway when clients need one consistent surface and shared auth/rate-limiting; direct calls for internal, low-latency service-to-service traffic.',
    rationale: 'A gateway centralizes auth, rate limiting, and routing at the cost of an extra hop and a shared failure point. Direct calls are lower latency but spread policy and coupling across every service.'
  },
  {
    id: 'rate-limiting',
    title: 'Rate limiting — fixed window vs sliding window vs token bucket',
    question: 'Which algorithm should enforce per-client rate limits?',
    context: 'An API must bound request rate while tolerating bursts.',
    criteria: ['Burst behavior', 'Boundary fairness', 'Memory cost', 'Implementation'],
    options: ['Fixed window', 'Sliding window', 'Token bucket'],
    cells: [
      ['Allows double at boundary', 'Smooths', 'Allows configured burst'],
      ['Poor', 'Good', 'Good'],
      ['Low', 'Higher', 'Low'],
      ['Trivial', 'Moderate', 'Simple']
    ],
    decision: 'Token bucket for most APIs because it admits bursts cleanly and is cheap; sliding window where strict rate smoothness matters; avoid fixed window boundary doubling.',
    rationale: 'Fixed window is trivial but lets a client send two windows worth of traffic at a boundary. Sliding window is fair but costlier. Token bucket gives smooth, burst-tolerant behavior at low cost.'
  },
  {
    id: 'idempotency',
    title: 'Idempotency — client key vs server dedupe',
    question: 'Where should duplicate requests be made safe under retries?',
    context: 'Retries and at-least-once delivery can execute an operation twice.',
    criteria: ['Guarantee scope', 'Client burden', 'Storage cost', 'Failure handling'],
    options: ['Client idempotency key', 'Server-side dedupe', 'Idempotent operations'],
    cells: [
      ['Per operation', 'Per operation', 'Only naturally idempotent ops'],
      ['Generate + retry same key', 'None', 'Design ops to be safe'],
      ['Key ledger', 'Key ledger', 'None'],
      ['Explicit', 'Explicit', 'Implicit']
    ],
    decision: 'A client-supplied idempotency key for non-idempotent mutations such as payments and order creation; design reads and naturally idempotent operations so they are safe to retry without a ledger.',
    rationale: 'An idempotency key lets the server deduplicate repeated attempts for the same logical operation, but it needs a key ledger and a client that reuses the key on retry. Where possible, make the operation itself idempotent.'
  },
  {
    id: 'caching-strategy',
    title: 'Cache policy — cache-aside vs write-through vs write-back',
    question: 'How should the cache stay consistent with the source of truth?',
    context: 'A cache speeds reads but must not serve stale or lost data.',
    criteria: ['Write latency', 'Consistency', 'Data-loss risk', 'Complexity'],
    options: ['Cache-aside', 'Write-through', 'Write-back'],
    cells: [
      ['Low (lazy update)', 'Higher (DB every write)', 'Lowest (defer DB)'],
      ['Can be stale', 'Strong', 'Risk of loss'],
      ['None (DB is source)', 'None', 'Lost writes on crash'],
      ['Simple', 'Simple', 'Complex']
    ],
    decision: 'Cache-aside for read-heavy data where a brief stale window is fine; write-through where strong consistency matters; write-back only for bursty writes that tolerate losing recent writes.',
    rationale: 'Cache-aside leaves the database authoritative and invalidates lazily. Write-through keeps cache and store in lockstep at higher write latency. Write-back is fastest but risks losing buffered writes on failure.'
  },
  {
    id: 'denormalization',
    title: 'Data shape — normalize vs denormalize',
    question: 'Should data be normalized to remove redundancy or denormalized for fast reads?',
    context: 'Read patterns and write frequency determine the right redundancy level.',
    criteria: ['Read latency', 'Write cost', 'Storage', 'Consistency effort'],
    options: ['Normalized', 'Denormalized'],
    cells: [
      ['Joins / multiple lookups', 'Single read'],
      ['Single place', 'Many copies'],
      ['Less', 'More'],
      ['None', 'Keep copies in sync']
    ],
    decision: 'Denormalize read-heavy paths where latency matters and writes are rare; normalize write-heavy or strongly-consistent data where redundancy becomes a liability.',
    rationale: 'Normalization removes redundancy and keeps writes cheap but forces joins. Denormalization precomputes derived data for fast reads at the cost of duplicated storage and eventual-consistency work.'
  },
  {
    id: 'sharding',
    title: 'Sharding — range vs hash vs directory',
    question: 'Which shard key strategy best distributes data and queries?',
    context: 'A dataset outgrows one node and must be partitioned.',
    criteria: ['Hotspot risk', 'Range queries', 'Rebalancing', 'Complexity'],
    options: ['Range sharding', 'Hash sharding', 'Directory sharding'],
    cells: [
      ['High on popular ranges', 'Low (even spread)', 'Depends on mapping'],
      ['Efficient', 'Cross-shard', 'Depends'],
      ['Splits ranges', 'Reshuffle', 'Update directory'],
      ['Low', 'Low', 'Higher']
    ],
    decision: 'Hash sharding for even, hotspot-resistant distribution; range sharding when range scans are common; a directory service when flexible, explicit placement is needed.',
    rationale: 'Hash sharding spreads load evenly but breaks range locality. Range sharding keeps ranges contiguous but risks hot ranges. Directory sharding adds an indirection layer for fine control at extra complexity.'
  },
  {
    id: 'replication',
    title: 'Replication — synchronous vs asynchronous',
    question: 'Should writes wait for replicas to acknowledge before committing?',
    context: 'Copies of data on multiple nodes serve reads and survive failure.',
    criteria: ['Consistency', 'Write latency', 'Availability', 'Data-loss window'],
    options: ['Synchronous', 'Asynchronous'],
    cells: [
      ['Strong', 'Eventually consistent'],
      ['Higher (wait for ack)', 'Lower (fire-and-forget)'],
      ['Reduced if replica down', 'Higher'],
      ['None on commit', 'Possible recent writes']
    ],
    decision: 'Synchronous replication for data that must not be lost or read inconsistently; asynchronous where latency and availability outweigh a small loss window.',
    rationale: 'Synchronous replication makes a commit durable on replicas but stalls if a replica is unavailable. Asynchronous is fast and available but can lose recent writes and serve stale reads.'
  },
  {
    id: 'load-balancer',
    title: 'Load balancing — round-robin vs least-connections vs consistent hashing',
    question: 'Which algorithm distributes traffic across backend servers?',
    context: 'Many servers serve requests with varying cost and stickiness needs.',
    criteria: ['Cost awareness', 'Session stickiness', 'Skew', 'Complexity'],
    options: ['Round-robin', 'Least-connections', 'Consistent hashing'],
    cells: [
      ['None (uniform)', 'Routes to least busy', 'None'],
      ['No', 'No', 'Yes (stable mapping)'],
      ['Can skew', 'Low', 'Low'],
      ['Trivial', 'Simple', 'Moderate']
    ],
    decision: 'Least-connections when requests vary in cost; consistent hashing when a client or key must land on the same backend; round-robin as a simple default for uniform work.',
    rationale: 'Round-robin ignores per-request cost and can overload slow backends. Least-connections tracks in-flight load. Consistent hashing keeps a key on the same node, useful for caches and sticky sessions.'
  },
  {
    id: 'graphql-api',
    title: 'API style — GraphQL vs REST',
    question: 'Should clients shape their own queries or use fixed REST endpoints?',
    context: 'Client flexibility and server cost must be balanced.',
    criteria: ['Over/under-fetching', 'Caching', 'Server complexity', 'Tooling'],
    options: ['REST', 'GraphQL'],
    cells: [
      ['Possible', 'Minimal'],
      ['Simple (URL-keyed)', 'Harder'],
      ['Low', 'Higher (resolvers)'],
      ['Mature', 'Strong introspection']
    ],
    decision: 'REST for simple, cacheable, resource-oriented APIs; GraphQL when clients need flexible, batched field selection and can pay the resolver and caching cost.',
    rationale: 'REST maps cleanly to HTTP caching and is easy to reason about. GraphQL eliminates over-fetching and round trips but concentrates complexity on the server and complicates caching.'
  },
  {
    id: 'rest-api',
    title: 'API contract — REST resources vs RPC actions',
    question: 'Should the API model resources or expose procedural actions?',
    context: 'Some operations are CRUD-like, others are imperative commands.',
    criteria: ['Modeling fit', 'Idempotency', 'Discoverability', 'Versioning'],
    options: ['REST (resources)', 'RPC (actions)'],
    cells: [
      ['CRUD, entities', 'Commands, procedures'],
      ['Natural via methods', 'Needs design'],
      ['URLs + methods', 'Schema only'],
      ['Path/version', 'Per-endpoint']
    ],
    decision: 'REST resources for entity/CRUD surfaces; RPC-style actions for imperative operations that do not map to resources, keeping both idiomatic where they fit.',
    rationale: 'REST uses standard methods and status codes that make CRUD predictable and idempotent. RPC models verbs directly, which suits commands but loses REST uniform semantics and caching.'
  },
  {
    id: 'http-version',
    title: 'HTTP — 1.1 vs 2 vs 3',
    question: 'Which HTTP version should the service and clients negotiate?',
    context: 'Connection multiplexing and transport characteristics affect latency and throughput.',
    criteria: ['Multiplexing', 'Header overhead', 'Transport', 'Adoption'],
    options: ['HTTP/1.1', 'HTTP/2', 'HTTP/3'],
    cells: [
      ['One request per connection', 'Streams over one connection', 'Streams over QUIC'],
      ['High (no compression)', 'Compressed (HPACK)', 'Compressed (QPACK)'],
      ['TCP', 'TCP', 'UDP (QUIC)'],
      ['Universal', 'Broad', 'Growing']
    ],
    decision: 'HTTP/2 as the baseline for modern APIs; HTTP/3 where head-of-line blocking and handshake latency on lossy networks matter; HTTP/1.1 only for legacy clients.',
    rationale: 'HTTP/1.1 suffers connection-per-request overhead. HTTP/2 multiplexes over TCP but still hits head-of-line blocking. HTTP/3 moves to QUIC over UDP, removing that blocking and speeding handshakes.'
  },
  {
    id: 'reverse-proxy',
    title: 'Exposure — reverse proxy vs direct backend',
    question: 'Should clients reach application servers directly or through a reverse proxy?',
    context: 'TLS, routing, and resilience are needed at the edge.',
    criteria: ['TLS termination', 'Routing', 'Attack surface', 'Ops'],
    options: ['Direct backend', 'Reverse proxy'],
    cells: [
      ['Per server', 'Centralized'],
      ['Client knows backends', 'Proxy routes'],
      ['Backends exposed', 'Backends hidden'],
      ['Simple', 'One more hop/component']
    ],
    decision: 'A reverse proxy as the front door for TLS, routing, and shielding backends; direct exposure only in constrained internal setups.',
    rationale: 'A reverse proxy centralizes TLS and routing and hides backend topology, at the cost of an added hop and a component to operate. Direct exposure pushes those concerns onto every server.'
  },
  {
    id: 'dns',
    title: 'DNS — self-hosted vs managed',
    question: 'How should the system resolve names and route traffic?',
    context: 'Names, records, and traffic steering need availability and low latency.',
    criteria: ['Ops burden', 'Latency', 'Traffic steering', 'Resilience'],
    options: ['Self-hosted DNS', 'Managed DNS'],
    cells: [
      ['High', 'None (managed)'],
      ['Depends on placement', 'Global anycast'],
      ['Custom', 'Built-in (geo, failover)'],
      ['Your problem', 'Provider SLA']
    ],
    decision: 'Managed DNS for most products to get global anycast and traffic steering without operating name servers; self-hosted only for unusual control or compliance needs.',
    rationale: 'DNS is critical infrastructure where managed providers give anycast latency, geo routing, and failover out of the box. Self-hosting buys control at a steep operational cost.'
  },
  {
    id: 'ip-addressing',
    title: 'Addressing — IPv4 vs IPv6',
    question: 'Which IP version should the service support?',
    context: 'Address space and modern-network compatibility affect reachability.',
    criteria: ['Address space', 'NAT requirement', 'Client compatibility', 'Transition cost'],
    options: ['IPv4-only', 'Dual-stack', 'IPv6-only'],
    cells: [
      ['Exhausted', 'Both', 'Abundant'],
      ['Yes', 'For IPv4', 'None'],
      ['Universal', 'Universal', 'Modern only'],
      ['None', 'Moderate', 'Higher']
    ],
    decision: 'Dual-stack (IPv4 + IPv6) to reach all clients while the world transitions; IPv6-only only for greenfield networks where legacy IPv4 clients are irrelevant.',
    rationale: 'IPv4 is exhausted and forces NAT, but most clients still use it. Dual-stack reaches everyone. IPv6-only is cleanest long-term but breaks legacy-only clients.'
  },
  {
    id: 'cdn',
    title: 'Delivery — CDN vs origin-only',
    question: 'Should static content be served from a CDN or directly from the origin?',
    context: 'Global users and traffic spikes shape the delivery decision.',
    criteria: ['Latency', 'Origin load', 'Cost', 'Cache control'],
    options: ['Origin-only', 'CDN'],
    cells: [
      ['Depends on origin location', 'Low (edge)'],
      ['Full', 'Offloaded'],
      ['No CDN fee', 'CDN + egress'],
      ['Direct', 'Via headers']
    ],
    decision: 'A CDN for static, cacheable, globally-read content to cut latency and origin load; origin-only serving only when content is dynamic, private, or single-region.',
    rationale: 'A CDN collapses round-trip time for global users and absorbs spikes at the edge. It adds cost and requires correct cache headers, which uncacheable content cannot benefit from.'
  },
  {
    id: 'blob-storage',
    title: 'Storage — object vs block vs file',
    question: 'Which storage model fits the data being stored?',
    context: 'Large binaries, random-access volumes, and shared trees have different needs.',
    criteria: ['Access model', 'Scalability', 'Metadata/search', 'Latency'],
    options: ['Object storage', 'Block storage', 'File storage'],
    cells: [
      ['Get/put by key (HTTP)', 'Raw blocks (attached disk)', 'Shared filesystem'],
      ['Very high', 'Bounded per volume', 'Moderate'],
      ['Rich object metadata', 'None', 'File names/paths'],
      ['Higher', 'Lowest', 'Low']
    ],
    decision: 'Object storage for large, immutable, keyed blobs such as images, video, and backups; block storage for databases and low-latency random access; file storage for shared, human-navigable trees.',
    rationale: 'Object stores trade low-latency random access for massive scale and rich metadata. Block storage gives the lowest latency to a single host. File systems fit shared, path-based access.'
  }
];
