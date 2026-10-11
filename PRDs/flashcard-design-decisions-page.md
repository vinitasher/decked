# Design Decisions Reference Page

Source issue: [#400](https://github.com/vinitasher/mamaLab/issues/400)
Implementation plan: [flashcard-design-decisions-page-plan.md](flashcard-design-decisions-page-plan.md)
Status: Ready for implementation

## Functionality

A URL-addressable `#/design-decisions` index lists the recurring architecture
decisions that system design is made of, and each decision opens its own
deep-linkable page at `#/design-decision/<id>`. Every decision renders its
question, a short context paragraph, a criterion-by-option comparison table, and
the recorded decision plus its rationale. The first and central matrix is SQL
vs NoSQL; the rest cover compute, delivery, framework, state, generation,
offline, auth, consistency, storage, topology, and repository structure.

Each decision page links back to the material that practices it: "Read the
concepts" buttons open the matching Concept Lab wiki pages, and "Practice the
flashcards" buttons start a topic session on the relevant catalog topics.

The pages are reachable from the dashboard via a "⚖️ Design Decisions" button,
deep-linkable and refresh-safe through the existing hash router, and cached
offline by the service worker.

## Inputs And Outputs

- Input: static data in `js/design-decisions.js` (a `DESIGN_DECISIONS` array of
  objects with `id`, `title`, `question`, `context`, `criteria`, `options`,
  `cells`, `decision`, and `rationale`).
- Output: rendered HTML in `#design-decisions-list` — one `.decision-card`
  article per entry, each containing a comparison table and a decision/rationale
  callout.
- Persisted state: none. The page is read-only reference content.

## Use Cases

- A learner preparing for interviews wants a single browsable reference for
  "what should I actually choose and why" across the most common decisions.
- A user who answered a card wants to re-read the underlying trade-off
  (e.g. why key-value storage beat a relational engine here) in more depth.

## User Journeys

1. From the dashboard, tap "⚖️ Design Decisions" → the index opens listing all
   12 matrices in dependency order.
2. Tap a decision (e.g. "Data store — SQL vs NoSQL") → its own page opens with
   the full matrix and "Read the concepts" / "Practice the flashcards" links.
3. Visit `https://decked.pages.dev/#/design-decision/data-store` directly → the
   page renders immediately, and back/forward/refresh all return to it.

## Non-Goals

- No interactive scoring or per-user progress on this page.
- No backend changes, no generation, no data persistence or profile sync.
- No editing of decision content from the UI.

## Edge And Error Behavior

- If `DESIGN_DECISIONS` is empty or unavailable, the page shows an empty-state
  message instead of failing.
- All data is rendered through `_escapeHtml`; missing optional fields (e.g.
  `context`) are omitted rather than crashing.
- On narrow screens, comparison tables scroll horizontally within their cards.

## Success Criteria

- `#/design-decisions` lists all 12 decisions, and each `#/design-decision/<id>`
  renders its comparison table, decision, and rationale.
- Every decision links to at least one real concept page and one flashcard topic.
- The pages are reachable from the dashboard, deep-linkable, and offline-cached.
- `bash check.sh` and `bash build.sh` pass, including a test that validates the
  data shape and the route/screen/service-worker wiring.
