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
  }
];
