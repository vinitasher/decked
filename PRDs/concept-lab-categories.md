# Concept Lab Categorized Index

Source issue: [#397](https://github.com/vinitasher/mamaLab/issues/397)
Implementation plan: [concept-lab-categories-plan.md](concept-lab-categories-plan.md)
Status: Complete

## Functionality

The Concept Lab index (`#/concepts`) currently presents every bundled Wiki
concept as one flat, alphabetized word cloud. This feature groups those
concepts under authored domain categories so the map is scannable by area.
Each concept remains a single, keyboard-focusable, clickable item that opens
its `#/concept/<topic>` child page; visual size remains a discovery hint, never
a ranking or a gate.

- The index renders ten authored categories in a fixed order: API Basics,
  Networking, Databases, Caching, Messaging & Queues, Data Processing,
  Distributed Systems, Reliability & Scaling, Storage, and Security &
  Observability.
- Each category shows a heading with a count of its concepts, and its concepts
  wrap below in a word-cloud style where size still reflects connections and
  study coverage.
- Every bundled concept is assigned exactly one category. A concept whose
  category is unknown (for example, a future lazily-added Wiki topic) falls
  into an "Other" group and is never dropped from the index.
- The Concept Lab child page (`#/concept/<topic>`) shows the same grouped
  category cloud in its Wiki sidebar, with the active concept highlighted, so a
  learner can keep browsing by area without returning to the index. The
  Sandbox and the rest of the child page are unchanged.

## Inputs And Outputs

- Input: the bundled `WIKI` entries (topic keys and titles), an authored
  `CONCEPT_CATEGORIES` map, and a `CONCEPT_CATEGORY_ORDER` list. Local mastery
  and card coverage influence word size only.
- Output: the `#/concepts` screen renders category headings with per-category
  counts and one clickable concept item per bundled topic, all with stable hash
  routes.
- Persisted state: none new. Existing profile, Sandbox run state, and
  generated-sandbox cache are untouched.

## Use Cases

- A learner who does not know the vocabulary can scan by domain (for example,
  "Databases") instead of reading one long alphabetical list.
- A learner brushing up on a specific area finds related concepts colocated
  under one heading.
- A maintainer adding a new Wiki topic does not need to edit the index; the
  topic appears under its category, or "Other" until it is categorized.

## User Journeys

1. The learner opens Concept Lab from the dashboard and lands on `#/concepts`,
   seeing concepts grouped under labeled area headings with per-area counts.
2. They select "Database Indexing" under Databases and land on
   `#/concept/database-indexing` with the Wiki and Sandbox side by side, exactly
   as before.
3. A new concept without a category appears in the "Other" group rather than
   disappearing, and remains selectable.
4. On a narrow screen, groups stack and wrap so every concept stays reachable
   and keyboard-focusable.

## Non-Goals

- No change to the child page, Wiki content, Sandbox models, or the generation
  path.
- No ranking, locking, or hiding of concepts; grouping is organizational only.
- No per-user or server-side category preferences.
- No search, autocomplete, or filtering UI.
- No category for topics that do not yet exist (for example, a "Search"
  category is out of scope until search concepts are bundled).

## Edge And Error Behavior

- Empty Wiki catalog: the existing explanatory empty state renders; no category
  headings.
- Unknown or uncategorized topic: renders under "Other" so it stays
  discoverable.
- Missing category data or module: `conceptCategory()` falls back to "Other",
  and the render path guards `typeof` so a missing module degrades to a single
  "Other" group rather than crashing.
- Duplicate topics remain deduplicated by the existing `_conceptEntries()`.
- Narrow screens and screen readers: category headings are headings, items are
  list items, and every item keeps a visible focus ring and accessible label.

## Success Criteria

- `#/concepts` renders all bundled concepts exactly once, grouped under the ten
  authored category headings with correct counts.
- Every bundled topic has an authored category (no accidental "Other"); a test
  asserts this.
- Selecting any item still navigates to `#/concept/<topic>` and renders Wiki +
  Sandbox.
- The concept child page's Wiki sidebar renders the same grouped categories,
  marks the active concept, and keeps every concept reachable from the child
  page.
- Responsive and accessibility styling remains; existing word-size hints
  (`concept-cloud-size-1..5`) remain.
- `bash check.sh`, `bash build.sh`, and `node governance/validate-projects.mjs`
  pass in CI, with the new category module precached by the service worker.
