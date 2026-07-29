# System Design Flashcards

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
- Each option lists the topics needed to evaluate that approach; the card's
  Know First list aggregates the prerequisites from every option
- A navigable topic map shows prerequisites, dependent topics, mastery, and
  focused practice actions without locking advanced content

**User profile:**
- Tracked per topic: load balancers, caching, databases, queues, consensus,
  API design, storage, observability, security
- Strength per topic: accuracy × recency-weighted
- Systematic coverage: the app knows which topics you haven't seen enough of
  and surfaces cards from those areas

**Adaptive deck:**
- Cards due for review on a spaced repetition schedule (1d, 3d, 7d, 14d)
- When picking a new card: weight by (1 - topic strength) × (coverage gap)
- Daily session: 5-10 cards drawn to maximize learning rate

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

## Suggested tech stack

- **Backend:** Python (FastAPI) + PostgreSQL + SQLAlchemy
- **Frontend:** React (or plain HTML/CSS/JS PWA) — mobile-first
- **Auth:** optional / email magic link for MVP
- **Deck algorithm:** custom spaced repetition (FSRS-inspired or SM-2 variant)
  adapted for multi-option decisions rather than binary recall
- **No AI dependency for v1** — cards are hand-authored; AI-assisted card
  generation can come later

## Content strategy

- Seed with ~50 hand-authored cards covering 10 core topics
- Cards are 2-4 options each; one clearly correct, others capturing common
  wrong intuitions
- Explanations are the real value — not just "A is right" but "B fails
  because X, C fails because Y, A wins because Z"
- Future: community-submitted cards with review; AI-generated cards vetted
  by community; curated packs for specific companies / domains

## Why this fits mamaLab

- **Simple & easy:** one-card-at-a-time mobile UI; 3 minutes per session
- **Best user experience:** adaptive difficulty means the app never feels too
  hard or too easy — it meets the user where they are
- **Profitable:** subscription ($8/mo or $60/yr) for full deck + progress
  tracking; free tier for 10 cards/week
- **Community:** user-submitted cards with voting; community-ranked "best
  explanations" for each card
- **Force for good:** democratises system design education; transparent about
  the model (users can see why a card was chosen)

## Deploy

The production site runs on Cloudflare Pages with OpenCode Go
`deepseek-v4-flash` generation and a KV-backed generated-card cache. The
`OPENCODE_API_KEY` credential is stored as a Cloudflare Pages secret. Node.js
22 or newer and an authenticated Wrangler session are required. Deploy from
this directory:

Generation retries transient Flash capacity failures and uses
`deepseek-v4-pro` as the final OpenCode Go fallback.

Generated cards are stored permanently in Cloudflare KV until explicitly
replaced or deleted. Learner progress remains local to each browser.
Each generated option declares prerequisite topics, and the question-level
Know First list is their deduplicated aggregate. Legacy cached options receive
empty prerequisite arrays while existing card prerequisites are preserved;
normalized cards are rewritten permanently. Custom cards and their prerequisite
lists remain in browser local storage.

The PWA refreshes same-origin application assets from the network after
deployment and keeps the latest successful responses for offline use. Feedback
controls remain navigable when browser progress storage is unavailable.

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
