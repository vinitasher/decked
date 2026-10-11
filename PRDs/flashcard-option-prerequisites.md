# Flashcard Option Prerequisites

## Functionality

Every generated answer option must include a `prerequisiteTopics` array using
specific lowercase kebab-case study concepts. The card-level
`prerequisiteTopics` array is the deduplicated union of:

- the card topic's canonical prerequisites;
- any valid existing card-level prerequisites; and
- the prerequisites declared by options A, B, C, and D.

Legacy options without the field receive an empty array when read. Legacy card
prerequisites remain valid and are preserved in the aggregate. Malformed
concepts, the card's own topic, duplicate values, and non-string values are
discarded.

Generated cards that omit an option prerequisite array are rejected rather
than cached. The feature does not lock cards or options based on prerequisites.

## Use Cases

- A learner can see all background topics needed to evaluate every proposed
  architecture before attempting the question.
- Content generation can express that one option requires queue knowledge while
  another requires database or caching knowledge.
- The topic hierarchy can navigate from the question's complete prerequisite
  set without losing option-specific source metadata.
- Existing cached and browser-stored cards continue to work without a reset.

## User Journey

1. A card is generated with four options and prerequisites for each option.
2. The backend validates and normalizes each option.
3. The backend aggregates all option prerequisites into the card's Know First
   list and stores the normalized card permanently.
4. The learner opens the card and sees the complete Know First list.
5. The learner can use the existing topic map to review those topics.

## Non-Goals

- Blocking advanced cards until prerequisites are mastered.
- Using technology names or broad categories when a specific evaluative
  concept is available.
- Inferring option prerequisites for legacy content.
