# Generated Concept Sandbox Implementation Plan

Source issue: Direct user request (no tracked issue)
PRD: [generated-concept-sandbox.md](generated-concept-sandbox.md)
Owner: Developer
Status: Verified

## Technical Approach

Add a server-side `GET /api/sandbox` endpoint that accepts one canonical Wiki
topic, checks a versioned `sandbox:v1:<topic>` KV key, and only on a miss
requests a JSON recipe from the reviewed provider sequence. A shared server
validator will reject unknown control keys, invalid ranges, missing mandatory
controls, malformed text, unordered situations, unstable prediction IDs, and
any schema outside the bounded contract. The endpoint will use the existing
identity, Pro entitlement, and daily-quota helpers; it will reuse the existing
Wiki KV binding with a distinct key prefix until a separate namespace is
needed.

Extend `js/sandbox.js` with application-owned control specifications,
client-side validation, runtime registration, and a generic deterministic
`bounded-pressure` simulator. The generated recipe supplies only labels,
assumptions, and numeric situation values. The runtime constructs normalize,
simulate, prediction-bucket, metrics, and trace functions from fixed code, so
provider output can never execute.

Update `js/app.js` so full Concept Lab topic navigation first checks the
reviewed and already-registered generated maps, then restores a valid local
definition or asynchronously fetches `/api/sandbox`. The UI will expose a
generation status, select a generated model when no active experiment would
be reset, and preserve an active state while a new recipe loads. Generation
errors retain the Wiki and show the reviewed-catalog fallback. Add the Sandbox
quota to the config/quota surfaces and upgrade notice.

## Expected Files And Modules

- `system-design-flashcards/functions/api/sandbox.js`: generation endpoint,
  cache lookup, provider calls, entitlement, and error responses.
- `system-design-flashcards/functions/shared/generated-sandbox.js`: server
  schema constants, prompt, and strict normalization/validation helpers.
- `system-design-flashcards/functions/shared/entitlement.js`: Sandbox daily
  limit defaults and environment override handling.
- `system-design-flashcards/functions/api/config.js`: expose the public
  Sandbox generation limit.
- `system-design-flashcards/functions/api/quota.js`: report Sandbox usage and
  remaining allowance.
- `system-design-flashcards/js/sandbox.js`: approved control vocabulary,
  client validation, runtime model registration, and fixed simulator/trace.
- `system-design-flashcards/js/app.js`: local definition cache, async
  generation flow, status/error states, and quota messaging.
- `system-design-flashcards/index.html`: generation status and generated-model
  accessibility hooks in the shared Concept Lab.
- `system-design-flashcards/css/style.css`: loading, generated-model, and
  fallback status styling.
- `system-design-flashcards/sw.js`: bump the static shell cache version.
- `system-design-flashcards/README.md`: document generated sandbox behavior,
  educational boundaries, caching, and quotas.
- `system-design-flashcards/docs/pro-setup.md`: document Sandbox quota
  configuration and observability.
- `system-design-flashcards/tests/api-sandbox.test.mjs`: endpoint validation,
  cache, provider retry, quota, and Pro coverage.
- `system-design-flashcards/tests/generated-sandbox.test.mjs`: contract,
  registration, clamping, determinism, and simulator safety coverage.
- `system-design-flashcards/tests/learning-lab-ui.test.mjs`: integrated route,
  local-cache, loading/failure, state-preservation, and quota UI coverage.
- `system-design-flashcards/tests/entitlement.test.mjs`,
  `tests/billing.test.mjs`, and `tests/pro-ui.test.mjs`: new Sandbox quota
  contract coverage.

## Testing Strategy

- Unit-test every accepted control range, required key, text limit, situation
  order, stable prediction ID, cache key, and rejection path.
- Assert generated recipes cannot add executable fields or custom formulas and
  that client and server validators reject the same malformed shapes.
- Verify deterministic simulation, prediction bucketing, stress boundaries,
  three-stage trace values, and finite outputs for baseline and extreme inputs.
- Test cache hits without provider/quota calls, successful generation quota
  consumption, failed-generation non-consumption, exhausted free quota, and
  Pro bypass.
- Test mapped concepts skip generation; unmapped concepts load local cache,
  fetch a fresh recipe, preserve active state while waiting, and use a clear
  reviewed-catalog fallback after failure.
- Run static HTML/CSS/service-worker checks, all existing project tests,
  `bash check.sh`, `bash build.sh`, and `node governance/validate-projects.mjs`.

## Manual And Visual QA

- Open a bundled mapped concept and confirm no generation message or quota
  request appears.
- Open an unmapped concept online and confirm a labeled generated model appears
  in the Test pane with five situations and bounded controls; run all five
  levels and compare the Wiki pane while the result remains visible.
- Reload the same concept with network disabled and confirm the locally cached
  definition runs. Clear the cache and confirm the fallback message is honest.
- Simulate provider failure and quota exhaustion; verify the Wiki remains
  readable, active experiments are not reset, and the upgrade notice is clear.
- Inspect desktop, 390px mobile, dark, and high-contrast themes for loading,
  generated, fallback, and result states, including visible focus rings.

## Rollout And Compatibility

The endpoint is additive and uses the existing Wiki KV namespace with a
distinct versioned key prefix, so no binding migration is required. Existing
reviewed models, routes, profiles, and offline behavior remain valid. The
service-worker cache version is bumped for the updated shell. A rollback can
remove the endpoint and client request path; previously cached generated
definitions are ignored by older code and do not alter profile data.

## Risks

- Provider output could contain unsafe or misleading content. Mitigate with
  strict schema validation, output escaping, fixed code-owned simulation, and
  educational-boundary copy.
- A generic pressure model may oversimplify a concept. Mitigate by labeling
  assumptions, requiring concept-specific text/situation framing, and never
  presenting results as production guidance.
- Generation latency could make the two-pane page feel broken. Mitigate with
  an explicit status, preserved active state, local cache, and reviewed-catalog
  fallback.
- Quota abuse or duplicate requests could increase provider cost. Mitigate
  with KV caching, stable keys, identity-scoped quota, and in-flight request
  coalescing in the browser.
- A generated model could be mistaken for a reviewed model. Mitigate with a
  visible `Generated experiment` label and separate runtime registration.

## Dependencies

- Existing Concept Lab route and Wiki lazy-generation endpoint.
- Existing `WIKI_CACHE` and `CARD_CACHE` bindings and entitlement helpers.
- Existing provider model routing and API headers.
- Existing deterministic Sandbox renderers and profile/quota UI.
- No new package or external service.

## Unresolved Decisions

- Generated recipes use one fixed bounded-pressure simulator rather than
  provider-authored code or formulas. Resolved for safety, deterministic
  offline replay, and reviewability.
- The initial free allowance is three fresh generated definitions per UTC day;
  cache hits are free and Pro bypasses the limit. Resolved as a conservative
  provider-cost guardrail that can be tuned through configuration.
- Generated definitions use the existing Wiki KV binding under a separate
  `sandbox:v1:` prefix until usage justifies a dedicated namespace. Resolved to
  avoid an infrastructure migration in the first vertical slice.
- A quick Wiki modal does not trigger generation; only full Concept Lab topic
  navigation does. Resolved to avoid hidden network spend from a content-only
  interaction.
