# Generated Concept Sandbox

Source issue: Direct user request (no tracked issue)
Implementation plan: [generated-concept-sandbox-plan.md](generated-concept-sandbox-plan.md)
Status: Complete

## Functionality

When a learner opens a full Concept Lab for a Wiki concept that has no
reviewed Sandbox node, the app requests a generated sandbox definition for
that concept. The definition is a bounded data recipe, not executable code.
After validation, the app registers it beside the reviewed node catalog and
shows it in the `Test` pane of the same two-sided Concept Lab.

The generated experiment uses the app's fixed `bounded-pressure` simulator.
The model provider may choose human-readable labels, explanations, and
scenario values, but it may not choose formulas, JavaScript, arbitrary input
types, or runtime behavior. The learner receives five escalating situations,
three stable prediction outcomes, bounded controls, derived metrics, and the
same causal trace used by reviewed models.

Existing Wiki-to-reviewed-node mappings continue to open immediately without
generation. A generated definition is cached server-side under a versioned
Sandbox key and locally after the first successful fetch. Cache hits do not
consume generation quota. The initial free allowance is three fresh Sandbox
definitions per UTC day; Pro users have no daily limit.

Generation is initiated by the full Concept Lab route and its Wiki topic
navigation. A quick Know First modal remains a content-only interaction and
does not silently spend a Sandbox-generation allowance.

## Inputs And Outputs

The request is `GET /api/sandbox?topic=<canonical-kebab-topic>` with the same
device and optional authenticated-user headers used by the other generation
endpoints.

The server accepts only a canonical topic matching
`^[a-z0-9]+(?:-[a-z0-9]+)*$`. A successful response contains:

- `schemaVersion: 1`, `modelKind: "bounded-pressure"`, `generated: true`,
  and the requested `topic`;
- a safe display label, description, prediction question, three prediction
  labels with stable IDs (`healthy`, `watch`, `stress`), and three to five
  controls;
- exactly five situations with levels 1 through 5 and numeric values for
  every selected control; and
- three to six plain-text assumptions.

Controls are selected from the application-owned vocabulary `arrivalRate`,
`capacity`, `workMultiplier`, `absorptionRate`, `retryRate`, and `skew`.
`arrivalRate` and `capacity` are mandatory. Each key has an application-owned
range, step, unit, and default. The browser derives the effective work,
utilization, backlog, latency, status, observations, and three-stage trace.

The generated model is registered only in the current browser session and
local generated-definition cache. Aggregate Sandbox run statistics continue
to use the existing profile fields; generated definitions are not copied into
the profile or synced as learner data.

## Use Cases

- A learner opens an unfamiliar generated Wiki concept and can test its main
  pressure relationship without waiting for a hand-authored node model.
- A learner can compare a generated concept experiment with the explanation
  while remaining on the same page.
- A learner can revisit a generated concept offline after its definition has
  been cached locally.
- A learner can see an honest fallback when generation is unavailable instead
  of being shown a misleadingly unrelated default node.

## User Journeys

1. The learner opens `#/wiki/<topic>` or chooses a topic in the full Concept
   Lab. If the topic has a reviewed node, that node remains immediate. If it
   does not, the `Test` pane announces that a bounded experiment is being
   generated.
2. The server returns a validated recipe, or the browser loads a previously
   cached recipe. The app registers the generated model, selects it, and
   renders its five situations and controls beside the Wiki explanation.
3. The learner changes a bounded assumption, selects `healthy`, `watch`, or
   `stress`, and runs the fixed simulator. The result shows derived metrics,
   observed branches, assumptions, and a three-stage causal trace.
4. The learner selects another Wiki concept. An active experiment is preserved;
   a generated model is selected automatically only when there is no active
   result or changed state. When ready, a generated model can be selected
   explicitly from the node list.
5. On a later visit, a local or KV cache hit restores the same definition
   without a provider call or quota charge. If neither cache nor generation is
   available, the app offers the reviewed catalog as a clearly labeled
   fallback.

## Non-Goals

- Generating or executing JavaScript, formulas, network calls, infrastructure
  actions, vendor benchmarks, or production capacity recommendations.
- Making every Wiki concept a reviewed production-quality model; generated
  experiments are educational and labeled as such.
- Spending a generation quota for a concept that already has a reviewed node
  or for a quick content-only Wiki modal.
- Persisting generated definitions in the learner profile or treating them as
  durable authored catalog entries.
- Inferring a relation from arbitrary Wiki prose when the requested topic is
  invalid or missing.

## Edge And Error Behavior

- Invalid topics are rejected with HTTP 400 before quota or provider work.
- Malformed, out-of-range, incomplete, or extra-control definitions are
  rejected server-side and client-side and are never cached or registered.
- The provider may be attempted twice with the reviewed model sequence; a
  failure returns a clear temporary-unavailable response and does not consume
  quota.
- Exhausted free quota returns HTTP 429 with the existing upgrade affordance;
  cached definitions remain usable.
- A missing provider key or generation API leaves the current Wiki readable
  and shows the reviewed Sandbox catalog fallback with an explanation.
- If the learner has an active or dirty experiment while a new definition is
  loading, that experiment remains visible and is not reset automatically.
- Local cache corruption is discarded and retried from the server. A stale
  schema version is treated as a cache miss.
- All provider text is escaped before rendering, and all numeric inputs are
  clamped to application-owned limits.

## Success Criteria

- An unmapped valid Wiki topic causes at most one server generation request per
  cache window and, after success, appears as a selectable generated node in
  the same Concept Lab screen.
- Generated definitions contain exactly five ordered situations, three stable
  prediction IDs, three to five approved controls including `arrivalRate` and
  `capacity`, and no executable or formula fields.
- The same generated definition produces identical metrics and trace output
  for identical inputs in every browser session.
- Invalid provider output is rejected without KV writes, model registration,
  or quota consumption; valid cache hits consume neither quota nor provider
  calls.
- A generated definition survives local cache reload and works offline after
  its first successful fetch.
- Active reviewed or generated experiment state is not lost when a Wiki topic
  is changed while generation is in flight.
- Free, Pro, failure, quota, mapped-topic, unmapped-topic, cache, and
  responsive two-pane flows are covered by automated tests. `bash check.sh`
  and `bash build.sh` pass.
