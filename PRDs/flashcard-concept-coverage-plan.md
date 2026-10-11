# Concept Coverage — Implementation Plan

Source issue: (none — direct founder request)
PRD: [flashcard-concept-coverage.md](flashcard-concept-coverage.md)
Owner: Vinit Asher
Status: Implementing

## Technical approach

Static, additive content changes across the four existing data modules. No
runtime, server, or schema changes. Each surface keeps its current schema and
is validated by the existing test suite (with count assertions updated).

## Expected files and modules

- `js/cards.js`: add 16 entries to `TOPIC_CATALOG` (label + prerequisites drawn
  from existing topics so the graph stays acyclic). No seed cards and no
  `LEGACY_OPTION_PREREQUISITES` changes, so the reviewed-migration test is
  untouched.
- `js/wiki.js`: append 16 hand-authored entries matching the wiki schema
  (summary ≥ 60 chars, why_it_matters ≥ 30, key_points ≥ 3 × 20 chars,
  common_pitfalls ≥ 2, related_topics kebab-case). Update the header comment
  count.
- `js/concept-categories.js`: categorize every new Wiki topic (the test requires
  every Wiki key to have an authored category).
- `js/design-decisions.js`: append ~21 matrices, each with aligned
  criteria × options cells and a decision + rationale.
- `js/sandbox.js`: add 8 hand-authored interview models
  (`consistent-hashing`, `load-balancer`, `api-gateway`, `reverse-proxy`,
  `cdn`, `websockets`, `database-sharding`, `replication`) following the
  existing `createInterviewSandboxModel` pattern (LIMITS / DEFAULTS / CONTROLS /
  SITUATIONS / PREDICTION_OPTIONS / simulate / predictionBucket) and register
  them in `POPULAR_SANDBOX_MODELS` plus `SANDBOX_WIKI_TOPIC_MAP`.
- `tests/learning-lab-ui.test.mjs`: update hardcoded category counts and the
  sandbox-node count.
- `tests/session-builder.test.mjs`: update the "13 topics" assertion to the new
  catalog size.
- `README.md`: refresh the topic list and the concept-coverage description.

## Testing strategy

- `node --check` over every changed JS file (covered by `check.sh`).
- Existing tests re-run; update the four hardcoded count assertions
  (session plan size, "API Basics" and "Databases" group counts, sandbox model
  count).
- New Wiki entries are validated by `tests/wiki.test.mjs` schema + uniqueness
  checks; new matrices by `tests/design-decisions.test.mjs`; new models by
  `tests/learning-lab-ui.test.mjs` reverse-lookup checks.

## Manual and visual QA

- Load the app: the Concept Lab cloud shows the new concepts grouped by
  category; each opens its Wiki entry with related topics.
- The Design Decisions page renders the new matrices with aligned tables.
- The Concept Sandbox selector lists the new models; changing assumptions and
  running an experiment shows a coherent trace and teaching conclusion.
- A session can produce cards for the new topics (online generation).

## Rollout and compatibility

- Static, additive change. No migrations, no data or API changes, no service
  worker cache-version bump (no new asset filenames).
- Compatible with dark and high-contrast themes (all styling reuses existing
  surfaces; no new CSS).

## Risks

- Low. Content-only changes to four data modules. The main risk is a schema
  violation in hand-authored content; mitigated by the existing test suite.
- Merge-conflict risk with concurrent work touching the same four files.

## Dependencies

None beyond the existing static PWA plumbing.

## Unresolved decisions

None.
