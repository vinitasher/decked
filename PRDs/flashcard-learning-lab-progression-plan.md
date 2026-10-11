# Learning Lab And Progressive Challenge Implementation Plan

Source issue: Direct user request (no tracked issue)
PRD: [flashcard-learning-lab-progression.md](flashcard-learning-lab-progression.md)
Owner: Developer
Status: Verified

## Technical Approach

Extend the dependency-free `js/sandbox.js` module's versioned, model-driven
contract from three to thirteen reviewed presets. The ten additions are
distinct interview patterns selected by recurrence across the public catalogs
listed in the PRD: social feed, realtime messaging, video pipeline,
geospatial dispatch, URL shortener, rate limiter, object storage/sync,
notification fanout, search autocomplete, and distributed key-value storage.
Each model declares its controls, five situations, prediction target,
equations, metrics, assumptions, and model-specific trace. The engine will use
explicit assumptions and finite arithmetic so it works offline and is
straightforward to test without a browser.

Add a `sandbox` hash route and an accessible screen in `index.html`. The app
will own ephemeral lab state (selected situation, controls, prediction,
result, and current-lab completion) while aggregate evidence is normalized and
stored in the existing profile. Wiki cache concepts and the dashboard will
link to the lab.

Add a five-level learning ladder in `js/app.js`. Level thresholds will use
answered-card count, lifetime accuracy, and distinct reviewed topics. The
existing adaptive planner will apply the earned level as a ceiling only for
fresh cards after real answers exist; due reviews, retries, topic ordering,
fresh-card mix caps, and scenario-derived card difficulty remain intact.

The UI will separate assumptions from derived metrics, show a prediction
before execution, explain the result after execution, allow node switching,
and keep controls usable on narrow viewports and with keyboard navigation.
Each model will provide a dependency-free simulation trace contract with
ordered stages, branch outcomes, and an accessible summary. The result panel
will render that contract as a responsive flow diagram, while the empty state
will show the selected model's path preview. Product aliases will map to a
single reusable model family instead of creating duplicate vendor presets.

Add an explicit Wiki-to-Sandbox bridge to the same contract. Each node model
will declare at least three bundled Wiki topic IDs. Sandbox rendering will
show those topics beside the selected model and route to the full Wiki screen;
Wiki rendering will resolve the reverse map and show the related Sandbox node
buttons. Same-node navigation will reuse the existing in-memory sandbox state,
while a different node uses the existing baseline reset behavior. Unmapped
Wiki topics will retain a general Sandbox fallback and will not be inferred
from article prose.

Make the bridge a single Concept Lab surface by moving the existing Wiki and
Sandbox markup into one screen. Preserve `wiki` and `sandbox` as hash-route
aliases so existing links remain valid, but map both aliases to the shared
screen. Keep the existing element IDs so the current renderers remain the
single source of truth; add a synchronized entry-point method that renders the
active Wiki entry and Sandbox node together. The desktop layout uses two
readable panes, while the mobile layout stacks them without hiding either
context. Wiki topic selection keeps the current node state, and explicit node
selection updates the active Wiki concept.

## Expected Files And Modules

- `system-design-flashcards/js/sandbox.js`: generic model contract plus
  thirteen reviewed models, situations, helpers, equations, and
  model-specific simulation traces and Wiki concept mappings.
- `system-design-flashcards/js/app.js`: profile migration, learning-level
  calculations, route handling, sandbox state/actions/rendering, responsive
  control grouping, simulation trace markup, Wiki/Sandbox bridge rendering,
  and dashboard links.
- `system-design-flashcards/index.html`: challenge ladder, shared Concept Lab
  screen, two-pane navigation controls, and script inclusion.
- `system-design-flashcards/css/style.css`: responsive ladder, sandbox controls,
  metrics, preview/trace diagrams, states, and focus styling.
- `system-design-flashcards/sw.js`: cache the new offline module and bump the
  static cache version.
- `system-design-flashcards/README.md`: document the user-facing ladder and
  the educational multi-node sandbox boundary, popularity-based catalog
  selection, and the Wiki/Sandbox learning loop.
- `PRDs/flashcard-learning-lab-progression.md`: record the ten-model expansion,
  interview-family mapping, and popularity evidence.
- `PRDs/flashcard-learning-lab-progression-plan.md`: record the implementation
  and verification contract for the expanded catalog.
- `system-design-flashcards/tests/sandbox.test.mjs`: pure-model and edge-case
  coverage.
- `system-design-flashcards/tests/learning-lab-ui.test.mjs`: route, profile,
  level, prediction-gating, responsive input hooks, trace rendering, and
  progress integration coverage.

## Testing Strategy

- Unit-test model lookup, per-model input clamping, prediction buckets,
  deterministic outputs, cache miss/backend reduction, queue backlog and
  drops, database connection/replication pressure, all ten new model formulas,
  and stress paths.
- Assert the catalog has thirteen unique models, with five escalating
  situations, bounded controls, meaningful prediction choices, and a
  model-specific trace for every model.
- Test Level 1 through Level 5 thresholds and confirm fresh-card planning does
  not exceed an earned level while due reviews still lead a session.
- Test profile normalization/serialization for sandbox aggregates, duplicate
  completion handling, required prediction gating, and route registration.
- Test static HTML/CSS/script/service-worker hooks and the no-network path.
- Test the explicit topic-to-model map in both directions, Wiki callouts for
  mapped and unmapped concepts, and same-node Sandbox state preservation.
- Test that Wiki and Sandbox entry points expose the same rendered screen,
  both panes are present together, Wiki changes preserve the active experiment,
  and explicit node changes synchronize the Wiki concept.
- Test that native radio/range controls are not given text-field sizing and
  that each node result renders a three-stage trace with model-specific
  branches.
- Run `node --test tests/*.test.mjs`, `bash check.sh`, and `bash build.sh`.

## Manual And Visual QA

- Open `#/sandbox` with the network disabled, run a baseline for each node,
  move through a higher-pressure situation, and verify the model-specific
  numbers and explanation change predictably. Cover all thirteen models, with
  focused spot checks for fan-out, rate limiting, storage, search, video,
  geospatial, messaging, and notification behavior.
- Check that a run cannot start without a prediction, sliders retain focus,
  and `Run again` is distinct from moving to the next situation. Verify the
  result trace follows the actual cache, queue, or database branch values.
- Inspect dashboard and lab at desktop and 390px widths, plus light, dark,
  and high-contrast themes. Verify visible focus rings and readable labels.
- Verify direct `#/sandbox` navigation, dashboard-to-lab navigation, and
  cache-wiki-to-lab navigation after refresh. Verify `#/wiki/<topic>` and
  `#/sandbox` show the same two-pane Concept Lab, then switch concepts and
  nodes while watching both panes remain visible.

## Rollout And Compatibility

The feature is static and ships with the existing PWA. Existing profiles gain
an empty normalized `sandbox` object; no destructive migration is needed.
Existing cards and sessions remain valid. The service-worker cache version is
bumped so installed clients receive `sandbox.js` and the updated shell.
Rollback is a normal static asset rollback; profiles with the extra fields are
ignored safely by older code.

## Risks

- Learners may mistake modeled numbers for real Redis capacity. Mitigate with
  prominent assumption labels, a model-version note, and no vendor benchmark
  language.
- Ten additional models increase the surface area for misleadingly precise
  outputs. Mitigate with family-level names, explicit assumptions, bounded
  formulas, five reviewed situations, and a persistent educational-model
  notice.
- An overcomplicated lab could distract from the prediction loop. Mitigate by
  limiting the first model to five situations and a small control vocabulary.
- New profile fields could break legacy profile parsing. Mitigate with strict
  normalization and serialization tests.
- A visible difficulty ceiling could feel punitive. Mitigate by keeping review
  cards available, showing the next milestone, and never locking topic-map or
  wiki content.
- A stale topic-to-model map could teach the wrong relationship. Mitigate with
  explicit IDs, offline-map tests against the bundled Wiki, and a general
  fallback for unmapped generated topics.
- A shared screen could accidentally reset the experiment while the learner
  browses concepts. Mitigate by keeping Wiki selection separate from explicit
  node selection and testing the state transition at both entry points.

## Dependencies

- Existing local profile and hash-route infrastructure.
- Existing adaptive session planner and Concept Wiki surfaces.
- The bundled Wiki topic IDs and the existing hash-route/state infrastructure.
- The existing `wiki` and `sandbox` routes remain compatibility aliases for the
  shared Concept Lab screen.
- No new server endpoint, package, account permission, or external service.

## Unresolved Decisions

- The sandbox is model-driven with thirteen reviewed presets: the original
  Redis-like cache, queue/worker, and relational database plus ten
  popularity-selected interview families. Resolved by the direct user request
  and the cross-catalog recurrence proxy documented in the PRD.
- Product aliases are collapsed into model families rather than separate
  vendor nodes. Resolved because the cited catalogs describe the same
  underlying trade-offs under names such as Twitter/Instagram and
  Google Drive/Dropbox.
- The prediction target is model-specific: resolved because backing-store read
  traffic is correct for a cache, while backlog/throughput is more meaningful
  for a queue, saturation/latency for a database, and the dominant trade-off
  for each new family.
- Thresholds are instructional, not a claim about universal human mastery:
  resolved and documented in the PRD; they can be tuned later using product
  evidence without changing the simulation contract.
