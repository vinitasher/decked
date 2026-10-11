# Concept Lab Word Cloud And Sandbox Prewarming Implementation Plan

Source issue: Direct user request (no tracked issue)
PRD: [concept-lab-word-cloud-prewarm.md](concept-lab-word-cloud-prewarm.md)
Owner: Developer
Status: Verified

## Technical Approach

Add explicit `concepts` and `concept` route aliases while preserving the
existing `wiki`, `wiki/<topic>`, and `sandbox` entry points. Introduce a
dedicated Concept Lab index screen that renders the bundled `WIKI` keys as
safe buttons in a deterministic flex/grid cloud. `APP.showConceptLab()` opens
the index; `APP.openConcept(topic)` navigates to the child route and renders
the existing two-pane Wiki + Sandbox screen with a breadcrumb/back action.
The cloud uses stable, explainable weights from catalog relationships and
learner coverage, but never removes or locks a concept.

Refactor the generated-sandbox provider/cache path into a reusable shared
service. Keep `GET /api/sandbox` as the quota-aware learner fallback. Add a
token-protected `POST /api/sandbox/prewarm` that validates a batch, skips
canonical cache hits, and generates/cache-fills missing topics strictly in
input order. The endpoint will await each topic before beginning the next;
there will be no `Promise.all` or concurrent bulk provider calls. The service
will canonicalize definitions before KV writes, use the existing provider
retry sequence, and avoid learner quota consumption for operator work. Update
`/api/wiki` to schedule a best-effort single-topic prewarm with `waitUntil`
after a successful lazy Wiki write.

Add `scripts/prewarm-sandboxes.mjs` to parse the current `js/wiki.js` bundle,
send one-topic requests sequentially, and report per-topic failures without
including secrets in logs. Add a scheduled and `workflow_dispatch` GitHub
Actions workflow with `SANDBOX_PREWARM_URL` and
`SANDBOX_PREWARM_TOKEN` secrets. Relevant Wiki/catalog/endpoint changes also
trigger it so newly bundled concepts are eventually prepared.

Extend the generated contract with fixed learner-problem IDs and fixed signal
keys. Provider output supplies only problem copy, evidence selection from the
allowlist, and the focus ID on each situation. The browser maps signals to
app-owned simulator outputs and renders a problem/evidence panel for generated
and reviewed models. No provider formula, code, input type, or arbitrary
signal is executed or displayed as trusted markup.

## Expected Files And Modules

- `PRDs/concept-lab-word-cloud-prewarm.md`: product contract and learner
  problem definition.
- `PRDs/concept-lab-word-cloud-prewarm-plan.md`: this implementation and
  verification plan.
- `system-design-flashcards/index.html`: Concept Lab index, child-page
  breadcrumb, cloud, and learner-problem hooks.
- `system-design-flashcards/js/app.js`: concept routes, cloud rendering,
  selection, state-preserving child navigation, and problem UI.
- `system-design-flashcards/js/sandbox.js`: canonical problem vocabulary,
  generated-definition validation, signal evidence, and model rendering.
- `system-design-flashcards/css/style.css`: word-cloud layout, cloud states,
  breadcrumb, and problem/evidence styling with responsive/accessibility rules.
- `system-design-flashcards/functions/shared/generated-sandbox.js`: expanded
  schema, problem allowlist, prompt, and canonical normalization.
- `system-design-flashcards/functions/shared/generated-sandbox-service.js`:
  reusable provider retry, cache read/write, and background prewarm helpers.
- `system-design-flashcards/functions/api/sandbox.js`: learner endpoint
  integration with the shared generation service.
- `system-design-flashcards/functions/api/sandbox/prewarm.js`: authenticated
  sequential batch prewarm endpoint.
- `system-design-flashcards/functions/api/wiki.js`: best-effort background
  prewarm hook after lazy Wiki generation.
- `system-design-flashcards/scripts/prewarm-sandboxes.mjs`: catalog-derived
  asynchronous batch client for scheduled/manual maintenance.
- `.github/workflows/sandbox-prewarm.yml`: scheduled, dispatchable, and
  catalog-change-triggered prewarm workflow.
- `system-design-flashcards/docs/pro-setup.md`: prewarm secret/setup and
  operational troubleshooting.
- `system-design-flashcards/README.md`: Concept Lab navigation, learner
  questions, prewarming, and fallback behavior.
- `system-design-flashcards/sw.js`: static shell cache version bump.
- `system-design-flashcards/tests/`: route/cloud UI, schema/problem, service,
  prewarm endpoint/script, documentation, and regression coverage.

## Testing Strategy

- Add route tests for `#/concepts`, `#/concept/<topic>`, legacy aliases,
  invalid/empty topics, direct links, back navigation, and dirty/result state
  preservation.
- Add DOM/static tests that assert every current Wiki entry renders once as an
  accessible button, cloud weights are bounded/deterministic, the child page
  contains Wiki and Sandbox panes, and narrow-screen styles remain present.
- Extend generated-definition tests for canonical problem IDs, signal keys,
  focus references, minimum problem coverage, unsafe text, formulas, unknown
  fields, and deterministic evidence mapping.
- Add endpoint tests for prewarm authentication, topic validation, duplicate
  handling, serial result ordering, cache skips, independent failures,
  provider retry, no learner quota writes, and Wiki-hook best effort behavior.
- Add script tests using a fixture Wiki bundle or dry-run mode to verify topic
  discovery, one-at-a-time request ordering, bounded input, retry/error
  reporting, and secret redaction. Validate the workflow triggers, required
  secret names, and scheduled/manual modes as text/static checks.
- Run the complete project suite, syntax checks, `bash check.sh`, `bash
  build.sh`, and `node governance/validate-projects.mjs`.

## Manual And Visual QA

- Open `#/concepts` at desktop and narrow viewport sizes; verify the cloud is
  visually varied but readable, every item has a focus ring, and no concept is
  hidden behind the layout.
- Select a foundation, a generated/unmapped concept, and a related concept;
  verify the URL changes to `#/concept/<topic>` and Wiki + Sandbox remain on
  one child page.
- Start a Sandbox run, change an input, return to the cloud, and reopen the
  child page; verify the active result/dirty state is not silently discarded.
- Verify a ready generated model shows the active learner problem, asks the
  matching prediction, and explains fixed evidence after running.
- Run the prewarm script in dry-run mode and inspect that it finds every
  bundled Wiki topic, sends one topic at a time, and never prints the token.
- In a configured preview, dispatch one prewarm batch and verify the workflow
  is out of band from learner navigation, cache hits avoid provider calls, and
  the UI still works while a topic is pending. Capture desktop and narrow
  screenshots for the PR when a browser session is available.

## Rollout And Compatibility

- Ship the index and child routes with the existing reviewed models first;
  legacy hash routes remain aliases during rollout.
- Deploy the API endpoint and workflow together. Configure
  `SANDBOX_PREWARM_TOKEN` as a GitHub Actions secret and the same value as the
  Cloudflare Pages `SANDBOX_PREWARM_TOKEN` secret before enabling scheduled
  prewarming. `SANDBOX_PREWARM_URL` defaults to the production endpoint but
  can target a preview for manual QA.
- The first workflow run fills missing entries one at a time. Existing
  versioned cache entries are reused; no profile migration or learner quota
  backfill is needed. New Wiki bundle commits and lazy Wiki writes keep the
  cache converging after rollout.
- If prewarming is misconfigured, disable the workflow or remove its token;
  on-demand generation, reviewed models, and Wiki navigation remain available.
  To roll back the UI/API, revert the commit; old clients ignore the new route
  and problem fields.

## Risks

- Provider cost and latency: bounded batches, cache skips, one topic per
  idempotent job, and a schedule limit reduce duplicate work; failures remain
  retryable.
- Token exposure or endpoint abuse: require a server-side token, never log it,
  bound request size/topics, and document secret rotation.
- Generated copy may be generic: fixed problem IDs/evidence and reviewed
  fallback keep the educational contract honest.
- Word-cloud visual size could imply authority: use it only as a discovery
  signal, keep all labels accessible, and document that concepts are not
  ranked or locked.
- Background generation may not finish before a learner selects a topic: keep
  the Wiki readable, show pending status, and retain the learner fallback.

## Dependencies

- Existing `WIKI_CACHE`, `OPENCODE_API_KEY`, generated-sandbox validator, and
  learner `GET /api/sandbox` endpoint.
- GitHub Actions secrets `SANDBOX_PREWARM_TOKEN` and optionally
  `SANDBOX_PREWARM_URL`; a maintainer must configure them before production
  prewarming can run.
- Existing Cloudflare Pages deployment and GitHub Actions runner.
- No new external provider or database is required.

## Unresolved Decisions

- Resolved: the bundled Wiki catalog is the initial prewarm universe; dynamic
  Wiki entries use the lazy-generation hook. Rationale: one source of truth
  avoids a second hand-maintained concept list.
- Resolved: use a protected GitHub Actions batch client plus the existing Pages
  KV rather than adding a separate Worker/queue. Rationale: the current app is
  Pages-based, and small idempotent batches provide asynchronous convergence
  without a new production service.
- Resolved: run bulk prewarming sequentially and keep `GET /api/sandbox` as the
  learner fallback. Rationale: the provider token budget is more important
  than maximum fill throughput; the scheduled workflow is already out of band
  from learner navigation.
- Resolved: generated problems use a fixed four-ID vocabulary and fixed
  evidence keys. Rationale: provider copy can be concept-specific while the
  simulator and safety boundary remain application-owned.
