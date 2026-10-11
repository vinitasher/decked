# Concept Coverage — 23 Core System-Design Concepts

Source issue: (none — direct founder request)
Implementation plan: [flashcard-concept-coverage-plan.md](flashcard-concept-coverage-plan.md)
Status: Ready for implementation

## Functionality

The app must let a learner **explain**, **decide**, **simulate**, and **test**
every concept in the requested list of 23 core system-design concepts:

client/server architecture, consistent hashing, websockets, webhooks, message
queues, rate limiting, API Gateway, idempotency, caching, denormalization,
SQL vs NoSQL, sharding, replication, load balancers, databases, GraphQL,
REST API, HTTP/HTTPS, proxy/reverse proxy, DNS, IP address, CDN, blob storage.

Each concept maps onto the four existing surfaces:

1. **Explain** — a Concept Wiki entry (`js/wiki.js`) with a title, summary,
   why-it-matters, key points, and common pitfalls.
2. **Decide** — a Design Decisions matrix (`js/design-decisions.js`) comparing
   the viable options across criteria with a recorded decision + rationale.
3. **Simulate** — a Concept Sandbox node model (`js/sandbox.js`) where the
   learner changes assumptions and predicts an outcome.
4. **Test** — a flashcard topic in `TOPIC_CATALOG` (`js/cards.js`) so the
   adaptive session planner and AI card generator produce practice cards for it.

## Inputs and outputs

- Input: the 23-concept list above.
- Output:
  - 16 new Wiki entries (concepts already covered are reused; idempotency,
    rate limiting, caching, queues, messaging, load balancing, databases,
    DNS already exist).
  - 16 new `TOPIC_CATALOG` topics (all listed concepts absent from the catalog;
    existing topics cover queues/messaging, rate limiting, caching, load
    balancing, databases, DNS). Idempotency stays a specific "know-first"
    concept (wiki + decision guide) rather than a broad session topic, matching
    its role as a cross-cutting technique and keeping the catalog/disjointness
    invariant the migration test enforces.
  - ~21 new Design Decisions matrices (SQL vs NoSQL already exists).
  - 8 new hand-authored Sandbox node models for the distinctly simulatable
    concepts: consistent hashing, load balancer, API gateway, reverse proxy,
    CDN, WebSockets, database sharding, and replication.
- Persisted state: none new; all content is static, bundled, and offline.

## Use cases

- An engineer studying for a system-design interview wants a single place that
  explains, compares, simulates, and quizzes every core concept.
- A learner who answers a card about (say) sharding can immediately read the
  sharding Wiki entry, compare sharding strategies in a decision matrix, and
  run a sharding simulation.

## Non-goals

- No changes to the generation/sync/auth/quota infrastructure.
- No seed-card expansion for offline fallback (offline mode already covers a
  small representative deck; new topics are exercised through AI generation,
  matching how the 8 currently seed-less topics already behave).
- No ranking, gating, or marketing claims — the concept cloud and decision
  guides remain discovery surfaces, not a curriculum lock.

## Success criteria

- Every one of the 23 concepts has a Wiki entry, a decision matrix (or is the
  SQL-vs-NoSQL entry), a `TOPIC_CATALOG` topic, and is either simulatable via a
  reviewed model or reachable through the generated pressure model.
- `bash check.sh` and `bash build.sh` pass, including updated count assertions.
- The concept cloud, decision page, and sandbox selector render without errors.
