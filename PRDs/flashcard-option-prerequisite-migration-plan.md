# Flashcard Option Prerequisite Migration Plan

## Technical Approach

Maintain a reviewed card-and-option mapping in the browser card model. Apply it
only when an option lacks prerequisite metadata, preserving newer authored
values. Add explicit metadata to all seed cards and run a repository migration
script over the local generated-card cache.

Inventory production and preview KV namespaces with Wrangler. If keys exist,
export values before mutation, apply the same normalization, write migrated
cards, and verify all values. Empty namespaces require no write.

## Expected Changes

- `js/cards.js`: reviewed legacy mapping, browser migration, seed metadata.
- `scripts/migrate-option-prerequisites.mjs`: repeatable cache migration.
- `server/card-cache.json`: migrated historical generated cards.
- `tests/`: complete option coverage and migration-preservation checks.
- `README.md` and `CHANGELOG.md`: migration scope and compatibility.

## Testing Strategy

- Assert all seven reviewed cards contain arrays for every option.
- Assert all option topics exist in the catalog and exclude the card topic.
- Assert browser migration fills missing known values.
- Assert authored option values are preserved.
- Assert question aggregates contain every option prerequisite.
- Run the complete flashcard checks and production build.

## Rollout And Compatibility

The migration is additive and idempotent. Existing authored option arrays are
never overwritten. Known browser cache entries are rewritten through the
existing ingestion path.

## Risks

- Topic assignment involves editorial judgment; the reviewed mapping remains
  explicit and testable.
- Browser-only custom cards cannot be centrally reviewed because their content
  never leaves the device.
