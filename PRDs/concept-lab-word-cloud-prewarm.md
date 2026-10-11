# Concept Lab Word Cloud And Sandbox Prewarming

Source issue: Direct user request (no tracked issue)
Implementation plan: [concept-lab-word-cloud-prewarm-plan.md](concept-lab-word-cloud-prewarm-plan.md)
Status: Complete

## Functionality

Concept Lab becomes a two-level learning surface:

1. `#/concepts` is the Concept Lab homepage. It presents the current Wiki
   concept catalog as an accessible, responsive word cloud. Every word is a
   keyboard-focusable concept selection, and visual size is a discovery aid,
   not a ranking or a lock.
2. `#/concept/<topic>` is a concept child page. It contains the existing Wiki
   explanation and the Sandbox in one page, with the selected concept shown in
   both panes. A learner can return to the cloud without losing a running
   experiment.

The previous `#/wiki`, `#/wiki/<topic>`, and `#/sandbox` links remain supported
as compatibility aliases. The dashboard Concept Lab action opens the cloud;
choosing a concept opens the child page.

Sandboxes are prepared asynchronously:

- A token-protected `POST /api/sandbox/prewarm` accepts a bounded batch of
  canonical Wiki topics and processes accepted topics strictly in sequence.
  Cache hits are skipped and do not call the provider. The maintenance
  workflow runs out of band from learner requests, but never has more than one
  bulk provider call in flight.
- `scripts/prewarm-sandboxes.mjs` reads the bundled Wiki catalog and submits
  one topic at a time, waiting for the result before continuing. A scheduled
  and manually dispatchable GitHub Actions workflow runs it against production.
  A push that changes the Wiki,
  sandbox contract, or prewarm code also starts the workflow, so newly bundled
  concepts enter the queue automatically.
- When `/api/wiki` creates a previously unknown Wiki entry, it schedules the
  matching sandbox prewarm in the same background lifecycle. A failed prewarm
  never prevents the Wiki response and the existing on-demand Sandbox route
  remains the fallback.

Generated definitions continue to be data-only and run through the fixed
application-owned simulator. Generation is revised around four learner
problems:

- `keep-up`: Can the modeled path keep up as demand grows?
- `protect-latency`: Where does user-visible delay appear first?
- `avoid-amplification`: Do failures, retries, or extra work amplify pressure?
- `find-concentration`: Can skew make one partition or key the real limit?

Each generated definition selects at least three of these canonical problems,
gives each a plain-language question and evidence keys, and assigns one focus
problem to every situation. The UI shows the problem being investigated and
connects the result to fixed derived signals, so the learner answers a design
question rather than merely reading a healthy/watch/stress label.

## Inputs And Outputs

### Concept navigation

- Input: the current bundled `WIKI` entries and their canonical kebab-case
  topics; local mastery and card coverage may influence word size only.
- Output: accessible cloud buttons and hash routes. The child route renders
  the Wiki entry, related concepts, selected Sandbox model, problem prompts,
  situations, predictions, deterministic metrics, and assumptions.
- Persisted state: existing local profile and Sandbox run statistics; the
  current in-memory experiment remains intact when returning to the cloud.

### Prewarm API

`POST /api/sandbox/prewarm` with:

```json
{
  "topics": ["caching", "database-indexing", "workload-skew"]
}
```

The request requires `Authorization: Bearer <SANDBOX_PREWARM_TOKEN>`, accepts
at most eight valid topics per call, and processes them one at a time before
returning per-topic results. The bulk client intentionally sends one-topic
requests and waits between calls to keep provider concurrency at one. Each
successful definition is normalized and stored under the versioned
`sandbox:v1:<topic>` key in the existing Wiki KV namespace. The endpoint never
consumes learner quota.

### Question-focused definition

The generated schema adds `learnerProblems` and a `focusProblemId` on each
situation. Problem IDs and evidence keys are fixed application vocabulary;
the provider supplies only safe labels, questions, explanations, and bounded
numeric values. The client derives problem evidence, metrics, prediction
outcomes, and trace diagrams from the app-owned simulator.

## Use Cases

- A learner who does not know where to start scans a visual concept map and
  chooses the idea that sounds relevant without navigating a long sidebar.
- A learner studying a concept wants the definition and a concrete pressure
  test on the same child page, with no context switch between separate tools.
- A learner asks whether a design will keep up, protect latency, avoid retry
  storms, or withstand skew; the Sandbox makes one of those questions explicit
  before the run and shows evidence afterward.
- A maintainer adds a new Wiki concept and expects its Sandbox to be prepared
  in the background without hand-editing a second runtime catalog.
- An operator wants to refresh missing or invalid Sandbox definitions in small,
  observable batches without charging learner quotas or blocking page requests.

## User Journeys

1. The learner opens Concept Lab from the dashboard and lands on `#/concepts`.
   They see the concept word cloud, a short explanation of its purpose, and a
   note that sandboxes are prepared in the background.
2. They select `caching` by mouse, touch, or keyboard. The app navigates to
   `#/concept/caching`, renders the Wiki and Sandbox together, and starts with
   the existing reviewed cache model when available.
3. They select an unfamiliar concept such as `database-indexing`. If the
   prewarm cache is ready, the child page is immediate. If it is still
   pending, the Wiki remains readable while the Sandbox shows a clear loading
   state and then becomes selectable when ready.
4. The Sandbox identifies the current learner problem, such as whether the
   path can keep up. The learner predicts an outcome, changes one bounded
   assumption, runs the model, and sees the evidence tied to that question.
5. The learner returns to `#/concepts` and later reopens the child route. A
   result or dirty experiment is preserved in memory while navigating, and a
   cached generated definition can be replayed offline.
6. A maintainer merges a Wiki catalog update. The prewarm workflow reads the
   new catalog, submits only missing definitions asynchronously, retries failed
   topics later, and leaves reviewed/on-demand behavior available during the
   rollout. A runtime-created Wiki topic follows the same path through the
   background hook.

## Non-Goals

- Using a word cloud to hide, lock, or permanently rank concepts by popularity.
- Replacing the Wiki explanation or the reviewed Sandbox models with generated
  content.
- Running provider-authored code, formulas, arbitrary controls, or production
  infrastructure benchmarks in the browser.
- Blocking concept navigation until every Sandbox definition is prewarmed.
- Charging a learner's daily generation quota for operator prewarming or cache
  hits.
- Building a general-purpose background job platform or promising exactly-once
  provider execution; jobs are idempotent cache fills and may be retried.

## Edge And Error Behavior

- Empty or malformed Wiki catalogs render an explanatory empty state; no
  malformed topic is put into a route or prewarm request.
- Unknown, duplicated, overlong, or non-canonical prewarm topics are rejected
  per item; a request containing only rejected topics receives `400`. A missing
  or invalid prewarm token receives `401` and no provider call occurs.
- A partial prewarm batch accepts valid topics and reports rejected topics;
  each accepted topic is independently cached or reported as failed, in input
  order.
- A missing provider key, provider timeout, invalid definition, or KV failure
  does not break the Wiki or cloud. The child page shows the reviewed catalog
  fallback and the on-demand path can retry later.
- A generated definition that lacks canonical learner problems, evidence keys,
  or valid focus references is not cached or registered.
- A concept selected while another experiment is dirty or has a result does
  not silently reset that experiment; the new Sandbox is available through the
  child page and model selector.
- If JavaScript, generation, or prewarm is unavailable, legacy Wiki routes and
  the reviewed Sandbox catalog remain usable where the existing app supports
  them.
- The word cloud remains usable on narrow screens and exposes the same concept
  choices as text labels and focusable buttons for screen readers and keyboard
  users.

## Success Criteria

- `#/concepts` renders every bundled Wiki topic exactly once as a selectable,
  keyboard-accessible word-cloud item; responsive and empty-state behavior are
  covered by UI/static tests.
- Selecting any cloud item navigates to `#/concept/<topic>` and renders both
  Wiki and Sandbox context; old Wiki/Sandbox routes continue to resolve.
- The prewarm workflow runs asynchronously relative to learner navigation,
  skips valid cache hits, validates the token and topic bounds, and never
  consumes learner quota; endpoint tests cover success, partial input,
  authorization, cache, provider failure, and retry behavior.
- The scheduled/manual prewarm script derives its topic list from the current
  Wiki bundle, and the workflow runs on relevant catalog changes and on a
  recurring schedule.
- A newly lazy-generated Wiki topic schedules a best-effort Sandbox cache fill
  without delaying or failing the Wiki response.
- Every generated definition includes at least three canonical learner
  problems with valid evidence and a focus problem for each situation; tests
  reject invented IDs, missing evidence, unsafe text, formulas, and executable
  fields.
- The Sandbox displays the active learner problem before a prediction and a
  fixed evidence-based explanation after a run. Existing reviewed models and
  offline behavior remain intact.
- `bash check.sh`, `bash build.sh`, and `node governance/validate-projects.mjs`
  pass, and the PR records manual/visual QA plus the required prewarm secret
  configuration and rollback path.
