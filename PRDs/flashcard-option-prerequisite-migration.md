# Flashcard Option Prerequisite Migration

## Functionality

Backfill option-level `prerequisiteTopics` for every historical card controlled
by the repository. The migration covers five seed cards and two generated cards
in the local cache fixture: 7 cards and 28 options.

Each option is reviewed against its scenario, architecture, and explanation and
assigned 2-4 specific study concepts needed to evaluate its trade-off. Broad
category tags and technology-name matching are rejected. The card-level Know First
list is rebuilt as the normalized union of canonical, existing card-level, and
option-level prerequisites.

Known historical card IDs are migrated in browser storage when read. Production
and preview Cloudflare KV must be inventoried before rollout and migrated if
keys exist. Custom cards that exist only in a learner's browser are outside the
centrally inspectable dataset.

## Use Cases

- Returning learners receive meaningful option prerequisites on old cards.
- The question-level Know First list reflects all historical answer choices.
- Maintainers can verify that no repository-held option remains unclassified.

## User Journey

1. A learner opens a historical card.
2. Browser normalization recognizes its card and option IDs.
3. Missing option prerequisites receive the reviewed classification.
4. The question-level Know First list is rebuilt.
5. The normalized card replaces the older browser-cache value.

## Non-Goals

- Guessing prerequisites for private custom cards unavailable to the repository.
- Treating a mentioned product or technology as a prerequisite by itself.
- Reclassifying newly generated cards that already satisfy the strict schema.
