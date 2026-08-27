# System Design Flashcards

**Website:** https://decked.pages.dev

A flash card app that trains system design intuition. Each card presents a
**mini system design problem between two nodes** (e.g. "Client wants to send
1,000 events/s to a downstream service") with a few concrete options the user
selects from. The app builds a **user profile of strengths, weaknesses, and
gaps**, then systematically surfaces cards that target the user's weakest areas
to maximize learning.

## Problem

System design interviews and real-world architecture decisions require
recognizing recurring patterns (queues vs streams, sync vs async, cache
placement, sharding strategies, consensus protocols) quickly and correctly.
Existing resources (DDIA, blogs, YouTube) are passive: you read or watch but
you don't *practice*. Spaced repetition systems like Anki work for facts but
not for *decisions between trade-offs*. This app fills that gap: active,
decision-based practice with adaptive difficulty.

## Target users

- Engineers preparing for system design interviews (FAANG, startups)
- Junior+mid engineers who want to build architectural intuition
- Senior engineers brushing up on patterns they don't use day-to-day

## Core features (v1)

**Cards:**
- Each card describes a scenario and constraint: e.g. *"A mobile app uploads
  photos to the cloud. Users see a gallery of their recent 50 photos instantly.
  The backend must process each photo into 3 sizes."*
- A few nodes are named (client, API gateway, worker, object store, database)
- The user selects from 2-4 plausible wiring options (e.g. "sync resize in the
  API process" vs "async worker queue + object store callback")
- After answering, the card shows WHY the better option wins (the trade-offs)
- Answer options are shuffled for each card view while their authored letters
  stay attached, so keyboard positions cannot reveal the answer and explanation
  references remain accurate
- Each option lists the topics needed to evaluate that approach; the card's
  Know First list aggregates the prerequisites from every option
- A navigable topic map shows prerequisites, dependent topics, mastery, and
  focused practice actions without locking advanced content
- Every screen is URL-addressable via hash routes (`#/search`, `#/wiki`,
  `#/sandbox`, `#/stats`, `#/wiki/<concept>`, ...), so any page can be bookmarked, shared,
  or deep-linked and survives refresh and back/forward navigation

**User profile:**
- Tracked per topic: load balancers, caching, databases, queues, consensus,
  API design, storage, observability, security
- Strength per topic: accuracy × recency-weighted
- Systematic coverage: the app knows which topics you haven't seen enough of
  and surfaces cards from those areas

**Adaptive deck:**
- Cards due for review on a spaced repetition schedule (1d, 3d, 7d, 14d)
- When picking a new card: weight by (1 - topic strength) × (coverage gap)
- Standard session: exactly 8 distinct cards drawn from the full 13-topic
  catalog; Quick Review requests 15
- Progressive difficulty ramp: never-studied topics start at difficulty 1, and
  within each session fresh cards play easy → hard (due reviews keep their
  first position), so users start with lower-difficulty problems and move up
  as mastery grows
- Five visible challenge levels — Foundations, Trade-offs, Pressure test,
  Failure modes, and Architecture judgment — make the next milestone clear.
  Fresh-card difficulty is capped at the earned level after real practice;
  scheduled reviews and retries remain available.
- Prerequisite-first ordering: within a difficulty tier, foundational topics
  are served before the topics that build on them
- Anki-style mix ratio: fresh cards are capped at half the session so
  scheduled reviews keep their slots and new content never dominates
- Desirable-difficulty pacing: recent answers (last 10 per topic) steer each
  topic's difficulty toward the 60-80% accuracy band
- Due reviews are ordered by predicted-recall risk (FSRS R = e^(-t/S)), not
  recency alone
- Delayed repetition: a card answered wrong returns at the end of the session
  for an immediate second chance (once per card per session)
- Session end shows a "Review your mistakes" list with the correct answer and
  explanation for every card answered wrong
- Architecture diagrams: every card carries a directed flow graph (`flows`
  with `from`/`to`/`verb`/`kind`) and each option carries a non-empty set of the
  exact wiring it implies. Cards with incomplete or invalid correct-option
  wiring are rejected from server/browser caches, custom-card fallback, saved
  profiles, and resumed sessions so they can be regenerated instead of
  reaching compare mode. Options without distinct wiring may inherit the
  validated correct-option graph; cards whose options collapse into one
  identical linear topology are also rejected before compare mode.
  Diagrams use Mermaid
  flowcharts with parallel branches, callback back-edges, verb-labeled edges,
  theme-aware colors, and on reveal they
  highlight the correct wiring — red where the chosen option diverges. Every
  diagram uses top-to-bottom flowchart mode, including the compare view. If
  Mermaid is unavailable or fails to render, the app shows a reload message
  instead of generating a second diagram format.

**Data model:**
```json
{
  "card": {
    "id": "cache-003",
    "scenario": "A read-heavy API returns user profiles...",
    "nodes": ["mobile app", "API server", "PostgreSQL"],
    "options": [
      {"id": "A", "label": "Add Redis between API and PG", "prerequisiteTopics": ["caching"]},
      {"id": "B", "label": "Add CDN in front of API", "prerequisiteTopics": ["caching", "dns"]},
      {"id": "C", "label": "Add read replicas to PG", "prerequisiteTopics": ["databases"]}
    ],
    "correct": "A",
    "explanation": "Redis ... because ...",
    "topic": "caching",
    "prerequisiteTopics": ["api-design"],
    "difficulty": 3
  },
  "profile": {
    "user_id": "...",
    "topic_scores": {"caching": 0.75, "queues": 0.3, ...},
    "card_history": [
      {"card_id": "cache-003", "correct": true, "attempted_at": "..."}
    ]
  }
}
```

**Concept Wiki:**
- Every know-first topic opens a Concept Wiki screen with a clickable topic
  side panel for each concept
- Entries are bundled with the app as `js/wiki.js` in a fixed schema
  (`topic`, `title`, `summary`, `why_it_matters`, `key_points`,
  `common_pitfalls`, `related_topics`) and shown inline on cards via the Know
  First links and a modal

**Concept Sandbox:**
- A deterministic, offline `#/sandbox` laboratory lets learners predict, run,
  and explain a node under changing constraints.
- The first reviewed node models are a Redis-like cache, a queue + worker, and
  a relational database. Each model declares its own controls, situations,
  outputs, and teaching assumptions in `js/sandbox.js`.
- Results show model-specific derived metrics such as cache misses and backend
  traffic, queue backlog and drops, or database connection pressure and
  replica lag. The lab is explicitly not a production benchmark or capacity
  recommendation.
- The result panel draws a model-specific, responsive simulation trace with a
  three-stage path and observed branches, so learners can see where work went
  instead of reading metrics in isolation. The pre-run state shows the same
  path as a compact preview.

**Generated content and quotas:**
- Cards are generated on demand with AI, cached for reuse, and supported by an
  offline seed-card fallback.
- The default free tier is 10 freshly generated cards and 10 wiki entries per UTC
  day. Pro removes those limits, and cache hits do not consume quota.

## Concept wiki

Every option lists prerequisite topics, and the card's Know First list
aggregates them. Each concept name is a clickable wiki link that opens a wiki
side panel/modal with a concise system-design explainer (title, summary, key
points, common pitfalls, and related topics) for that concept.

- A committed snapshot of **80 wiki entries** ships in `js/wiki.js` and loads
  with the app like the card data, so the most common concepts work instantly
  and offline.
- Concepts missing from the snapshot are **lazily generated on demand** by
  `functions/api/wiki.js` (`GET /api/wiki?topic=<kebab-case-concept>`) using
  the same OpenCode Go provider and schema as the card generator. Results are
  cached in the `WIKI_CACHE` Cloudflare KV binding with a **30-day TTL**
  (2592000 s) and merged into the in-app snapshot, so each concept is
  generated at most once per cache window.
- The snapshot can be regenerated in bulk with
  `OPENCODE_API_KEY=... node scripts/generate-wiki.mjs [--limit N]`, which
  walks the topic universe derived from the card catalog, every card/option
  prerequisite, and the production card cache. Generation runs **3-at-a-time
  with one retry per topic** and every entry is validated against the wiki
  schema before it is written.
- `bash check.sh` already syntax-checks `js/wiki.js`,
  `functions/api/wiki.js`, and `scripts/generate-wiki.mjs`, and runs
  `tests/wiki.test.mjs` and `tests/api-wiki.test.mjs`.

The wiki UI — the sidebar index and the link affordance on Know First topics
in card question headers — lives in `js/app.js`. Cache and related wiki entries
also link directly to the Concept Sandbox.

The product contract and implementation verification path for the learning
ladder and sandbox live in
[`PRDs/flashcard-learning-lab-progression.md`](../PRDs/flashcard-learning-lab-progression.md)
and its [implementation plan](../PRDs/flashcard-learning-lab-progression-plan.md).

## Suggested tech stack

- **Backend:** Python (FastAPI) + PostgreSQL + SQLAlchemy
- **Frontend:** React (or plain HTML/CSS/JS PWA) — mobile-first
- **Auth:** optional / email magic link for MVP
- **Deck algorithm:** custom spaced repetition (FSRS-inspired or SM-2 variant)
  adapted for multi-option decisions rather than binary recall
- **AI generation:** cards are generated on demand, with cached results reused
  and bundled seed cards available as an offline fallback

## Content strategy

- Seed with ~50 curated fallback cards covering 10 core topics
- Cards are 2-4 options each; one clearly correct, others capturing common
  wrong intuitions
- Explanations are the real value — not just "A is right" but "B fails
  because X, C fails because Y, A wins because Z"
- Future: community-submitted cards with review; curated packs for specific
  companies / domains

## Why this fits mamaLab

- **Simple & easy:** one-card-at-a-time mobile UI; 3 minutes per session
- **Best user experience:** adaptive difficulty means the app never feels too
  hard or too easy — it meets the user where they are
- **Profitable:** subscription ($8/mo or $60/yr) for full deck + progress
  tracking; the free tier provides 10 freshly generated cards and 10 wiki
  entries per UTC day, while Pro removes those limits. Cache hits do not
  consume quota.
- **Community:** user-submitted cards with voting; community-ranked "best
  explanations" for each card
- **Force for good:** democratises system design education; transparent about
  the model (users can see why a card was chosen)

## Product strategy

The [LearnHub and MathPath strategic gap analysis](docs/learnhub-mathpath-gap-analysis.md)
assesses the current product against a question-centered adaptive learning
model and today's system-design interview market. It defines the recommended
position, capability gaps, evidence gates, three-year direction, metrics, and a
90-day validation plan for evolving from multiple-choice recognition into
guided architecture judgment.

## Deploy

The production site runs on Cloudflare Pages with OpenCode Go
`gpt-5.6-luna` generation and a KV-backed generated-card cache. The
`OPENCODE_API_KEY` credential is stored as a Cloudflare Pages secret. Node.js
22 or newer and an authenticated Wrangler session are required. The required
runtime is pinned in `.nvmrc`; `deploy.sh` automatically activates an
installed NVM Node 22+ runtime when the shell's default Node is older. If no
compatible runtime is installed, run `nvm install 22` once. Deploy from this
directory:

Generation tries `gpt-5.6-luna` first and uses `deepseek-v4-flash` as its
OpenCode Go fallback when the primary attempt fails validation or the provider
is unavailable. Further retries remain on the fallback model.
Each generation attempt designates a uniformly selected correct letter from
A-D, and model output is rejected unless it follows that prompt contract.

Generated cards are stored permanently in Cloudflare KV as bounded
`{"cards": [...]}` pools for each topic and difficulty. The generation endpoint
serves a cached card whose whitespace-normalized, case-insensitive scenario
fingerprint is not present in repeated `exclude` query parameters. When every
cached scenario is excluded, or when `force=1` is supplied, it generates and
appends a distinct card. Pools retain the newest 20 distinct scenarios; legacy
single-card values migrate to one-card pools when read. Responses include
`cached`, `card`, `poolSize`, and `poolLimit` without exposing the other cards.
At most 100 valid exclusion fingerprints are considered per request.
Learner profile progress is stored in the existing `CARD_CACHE` Cloudflare KV
namespace under `profile:v1:<identity>` and is served through
`GET/PUT /api/profile`. Signed-in profiles use the verified Supabase subject;
anonymous profiles use the browser's device id. The browser still keeps a
local copy for immediate rendering and offline use, then synchronizes changes
asynchronously. Existing local profiles migrate on the first successful
profile fetch, and newer local changes win over an older remote timestamp.
SRS reviews and card snapshots (including diagram `nodes`, `flows`, and
option wiring), topic scores, streaks, totals, and displayed-scenario ledgers
are included in the synced profile. Session resume state, bookmarks, theme/UI
preferences, and custom-card authoring remain browser-local.
Generated-card cache metrics and snapshot tooling exclude `profile:v1:` keys.

The browser mirrors the server format with bounded `{"cards": [...]}` pools
under `sdf_gen_<topic>:<difficulty>`. Existing single-card entries migrate on
read, malformed entries are ignored, and each local profile keeps its own
persisted ledger of scenario fingerprints actually displayed. Unseen cached
cards are used before a server request; prefetching does not mark a card seen.
Normal study sessions retain the existing seed-card fallback when generation is
offline, and seed cards are never stored or presented as newly generated cards.
The Regenerate control always requests forced fresh generation: it sends
`force=1` with the current card, all active session cards, and the profile-seen
ledger as repeated `exclude` parameters, bypassing local, in-memory, and seed
pools. The current session slot is replaced and marked seen only after a valid
fingerprint-distinct response arrives; HTTP errors, network failures, timeouts,
malformed or duplicate payloads, and unconfigured generation all leave the
current card and session intact and announce in an accessible live region that
fresh generation is unavailable and can be retried. The control disables itself
while generating and always restores its enabled state, and overlapping clicks
or keyboard presses never issue concurrent requests.
Session planning draws from every topic in the 13-topic catalog (never just the
seed topics) at each topic's mastery-derived target difficulty, ranked by the
existing adaptive weight with a random tie-break; sessions that need more cards
than there are topics add other unique topic+difficulty pairs. Candidates are
fetched with accumulated exclusions so duplicates are refilled rather than
silently dropped, bounded to three plan passes (count × 3 fetches). A session
only starts once its requested count is assembled: when generation and the
offline fallback cannot reach the requested count within the bound, the app
states the requested and available counts and asks the user to start the smaller
session or cancel — it never silently shows `1 / 5` for an advertised 8 or 15.
Offline seed substitution is topic-scoped, so a session slot is never padded
with a card from an unrelated topic. Prefetching and cache warming also draw
from the full catalog so the non-seed topics are not starved.
Each generated option declares prerequisite topics, and the question-level
Know First list is their deduplicated aggregate. Option prerequisites are
specific study concepts such as Cache Invalidation, Replication Lag, or Message
Ordering, not broad category or product-name tags. Legacy cached options receive
reviewed concept metadata for the seven repository-held historical cards;
their question aggregates are rebuilt and normalized cards are rewritten
permanently. Unknown browser-only custom cards retain their authored metadata
and remain in local storage.

The PWA refreshes same-origin application assets from the network after
deployment and keeps the latest successful responses for offline use. Feedback
controls remain navigable when browser progress storage is unavailable.
The question-header back control returns to the dashboard without discarding
the current session, which remains available through Resume Unfinished Session.

Unknown wiki topics are **lazily generated on first view** by
`functions/api/wiki.js` and cached in the `WIKI_CACHE` Cloudflare KV binding
for ~30 days (2592000 s), mirroring the `generate-wiki.mjs` schema and
provider settings (`gpt-5.6-luna` first, `deepseek-v4-flash` fallback,
thinking disabled). Cached entries are served without a generation call, so
each concept is generated at most once per cache window.

```sh
bash check.sh
bash deploy.sh
```

The script verifies Cloudflare authentication and configured resource IDs,
stages only public PWA assets, bundles the functions under `functions/`, and
publishes the production branch to `https://decked.pages.dev`.

Cloudflare Git integration uses `bash check.sh && bash build.sh`, watches
`system-design-flashcards/**`, and deploys `.pages-dist` from the `main`
branch. Pull requests receive preview deployments, while changes outside this
project directory do not trigger unnecessary builds.

## PWA installability

The app is installable as a Progressive Web App. To test on each platform:

**Desktop Chrome:**
Open DevTools (F12) > Application > Manifest — verify no errors. An install
icon should appear in the address bar after visiting twice, five minutes apart.

**Android Chrome:**
Visit the site, then look for the "Add to Home Screen" prompt or tap the
menu (⋮) > "Install app" / "Add to Home Screen". The installed app launches
in standalone mode with no browser UI.

**iOS Safari (iPhone):**
Tap the share button (□↑) > "Add to Home Screen". The app icon appears on
the home screen and launches in full-screen mode. `navigator.standalone` is
`true` after installation.

**Lighthouse audit:**
Chrome DevTools > Lighthouse > Progressive Web App — should score 100% on
installability checks (valid manifest, registered service worker, HTTPS,
icons at required sizes).

## Visual verification

The dashboard and study surfaces use the same responsive visual system across
desktop, phone, dark mode, and high-contrast mode. Verify the static shell with
the existing checks, then render `index.html` at 1440px and 390px widths and
inspect the dashboard, card controls, and secondary-screen surfaces.

```sh
bash check.sh
bash build.sh
chromium --headless --no-sandbox --window-size=1440,1200 \
  --screenshot=/tmp/system-design-flashcards-desktop.png index.html
chromium --headless --no-sandbox --window-size=390,1200 \
  --screenshot=/tmp/system-design-flashcards-mobile.png index.html
```

The learning ladder and Concept Sandbox are behavior changes in addition to the
shared visual system: the ladder updates from study evidence, and sandbox
prediction aggregates are included in the existing local profile sync path.
