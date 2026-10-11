# Flashcard Topic Hierarchy

## Functionality

Every System Design Flashcards card must include `prerequisiteTopics`, an array
of topic identifiers representing knowledge a learner is expected to have
before attempting the card. The application must:

- Show prerequisite topics on each practice card.
- Provide a navigable topic map derived from the prerequisite relationships.
- Let a learner start a focused practice session from any topic in the map.
- Include prerequisite metadata in authored and AI-generated cards.
- Normalize older browser and KV records that do not contain the field.
- Keep prerequisite guidance advisory; topics are never hard locked.

The canonical topic catalog defines labels and acyclic prerequisite
relationships. AI generation may not invent relationships outside that catalog.
Custom cards may select zero or more known topics as prerequisites.

## Inputs And Outputs

Inputs are the card topic, selected prerequisites for custom cards, learner
mastery, and generated card payloads. Outputs are normalized card records,
prerequisite guidance in practice, and a topic map grouped by learning depth
with mastery and practice actions.

## Use Cases

- A learner checks what concepts they should review before answering a card.
- A learner navigates from foundational API concepts to dependent architecture
  topics.
- A learner selects one topic and practices progressively harder cards.
- A card author records the expected background knowledge for a custom card.
- Existing users retain their local and generated cards after the schema
  changes.

## User Journeys

### Navigate The Topic Map

1. The learner opens the dashboard and selects Topic Map.
2. The application groups topics from foundations through advanced concepts.
3. Each topic shows prerequisites, dependent topics, and current mastery.
4. The learner selects Practice on any topic.
5. The application opens a focused session without blocking unmastered topics.

### Answer A Card

1. The application opens a card.
2. The learner sees its topic, difficulty, and expected prerequisite topics.
3. The learner answers and receives feedback.
4. A visible mobile action tray asks for a confidence rating.
5. After rating, the result remains visible for three seconds.
6. The application advances to the next card automatically.

Existing profiles are normalized on load so persisted mastery data cannot
interrupt confidence submission or navigation.

Starting a session immediately shows a preparing state. Cached cards are reused
without rejecting themselves as duplicates, and independent topic requests run
concurrently so startup is not blocked by sequential generation.

### Author A Card

1. The author opens Create a Card.
2. The author selects known prerequisite topics.
3. The application rejects the card topic itself as a prerequisite.
4. The saved card participates in prerequisite display and focused practice.

## Non-Goals

- Enforcing prerequisite mastery before practice.
- Building a general-purpose graph editor.
- Synchronizing learner progress between browsers.
- Allowing AI-generated cards to alter the canonical hierarchy.

## Success Criteria

- Every seed and newly generated card has a validated prerequisite array.
- Legacy cards are usable without manual migration.
- The canonical graph has no missing references, self-dependencies, or cycles.
- Learners can navigate the graph and begin topic-focused practice.
- Automated tests cover schema normalization and graph integrity.
