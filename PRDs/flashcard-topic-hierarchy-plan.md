# Flashcard Topic Hierarchy Implementation Plan

## Technical Approach

Define one browser-side topic catalog containing display labels and canonical
prerequisite relationships. Normalize cards at all browser ingestion points.
Render a dedicated topic-map screen by calculating each topic's dependency
depth and reverse dependencies. Add focused sessions that request one card for
each difficulty level.

Mirror the canonical prerequisite mapping in the Cloudflare generation
function. Require the field in model output, overwrite it with canonical data,
and migrate legacy KV values when they are read.

## Expected Changes

- `js/cards.js`: topic catalog, helpers, and seed-card metadata.
- `js/app.js`: normalization, prerequisite display, topic-map rendering,
  focused sessions, and custom-card prerequisites.
- `index.html` and `css/style.css`: topic-map, card guidance, and authoring UI.
- `functions/api/generate.js`: generated-card schema and KV migration.
- `tests/`: hierarchy integrity and generation migration coverage.
- `README.md` and `CHANGELOG.md`: data model and release documentation.

## Testing Strategy

- Validate all seed prerequisites against the catalog.
- Detect missing references, self-dependencies, and cycles.
- Verify generated cards receive canonical prerequisites.
- Verify legacy KV cards are normalized and rewritten without expiration.
- Run JavaScript syntax checks, Node tests, shell checks, and a local responsive
  UI smoke test.

## Rollout And Compatibility

The new field is additive. Browser records are normalized in memory, while
legacy generated cards are rewritten to KV on first read. No storage reset or
manual cache migration is required.

## Risks And Decisions

- Browser and worker catalogs can drift; tests cover each representation and
  documentation identifies the canonical relationships.
- Focused sessions may reuse cached topic/difficulty cards by design.
- Prerequisites are advisory to preserve learner autonomy and direct access to
  advanced material.
