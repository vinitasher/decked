# Flashcard Option Prerequisites Implementation Plan

## Technical Approach

Add shared normalization behavior to both card ingestion paths: the Cloudflare
generation function and browser card model. Normalize every option's
`prerequisiteTopics`, then compute the card-level aggregate from canonical,
existing card-level, and option-level prerequisites.

Update both AI generation prompts. The production Cloudflare endpoint will
strictly validate four options and require an array on each option before
caching. The local generator will apply the same schema and aggregation rules.

## Expected Changes

- `functions/api/generate.js`: prompt, validation, normalization, KV migration.
- `server/generate-card.js`: local generation prompt and validation parity.
- `js/cards.js`: browser and local-storage migration plus aggregation.
- `README.md`: document the additive card schema.
- `tests/`: generated, cached, invalid, and browser normalization coverage.

## Testing Strategy

- Verify generated option prerequisites are retained and aggregated.
- Verify duplicates, unknown topics, and self-dependencies are removed.
- Verify legacy cached options gain empty arrays without expiry.
- Reject generated cards with missing option prerequisite arrays.
- Verify browser normalization applies the same migration and aggregation.
- Run the complete flashcard check script.

## Rollout And Compatibility

The schema is additive. Cached KV cards and browser records migrate when read,
and rewritten KV entries remain permanent. No cache purge is required.

## Risks

- Model output may violate the stricter schema, producing a clear generation
  error instead of incomplete learning metadata.
- Browser and worker normalization could drift; parallel regression tests pin
  their expected behavior.
