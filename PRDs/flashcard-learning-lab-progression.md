# Learning Lab And Progressive Challenge

Source issue: Direct user request (no tracked issue)
Implementation plan: [flashcard-learning-lab-progression-plan.md](flashcard-learning-lab-progression-plan.md)
Status: Complete

## Popularity-based model expansion

The first release shipped three foundational models: a Redis-like cache, a
queue/worker, and a relational database. This expansion adds ten distinct
interview patterns, bringing the reviewed catalog to thirteen models. The
selection is a transparent popularity proxy rather than a claim about a
measured probability: current public preparation catalogs repeatedly list the
same families under different product names. The proxy cross-checks [Hello
Interview's guided-practice catalog](https://www.hellointerview.com/practice/system-design),
[SWE Helper's common-question list](https://swehelper.com/blog/common-questions/),
and [LLDCanvas's tiered most-asked list](https://www.lldcanvas.in/blog/most-asked-system-design-questions).

The ten new model families, in approximate recurrence order, are:

| Model | Common question variants | Interview pattern exercised |
|---|---|---|
| Social feed | Twitter/X, Instagram, Facebook News Feed | fan-out on write/read and celebrity skew |
| Realtime messaging | WhatsApp, chat, live comments | connections, presence, ordering, offline delivery |
| Video pipeline | YouTube, video streaming | asynchronous transcoding and CDN/origin pressure |
| Geospatial dispatch | Uber, Google Maps, local delivery | spatial indexing, freshness, and hot areas |
| URL shortener | Bitly | unique IDs, read-heavy redirects, and cacheability |
| Rate limiter | API rate limiter | token refill, bursts, shared state, and rejection |
| Object storage and sync | Google Drive, Dropbox, Pastebin | chunking, deduplication, egress, and conflicts |
| Notification fanout | Notification service | channel fanout, preferences, retries, and provider limits |
| Search autocomplete | Typeahead, search suggestions | prefix index, rebuild lag, and hot prefixes |
| Distributed key-value store | Key-value store, DynamoDB-style storage | partitioning, replication, quorums, and hot shards |

The list intentionally collapses product aliases into reusable node patterns;
for example, Twitter and Instagram share a feed model, while Google Drive and
Dropbox share an object-sync model. No source publishes a comparable
sample-weighted frequency table, so the catalog must not describe these ranks
as interview odds.

## Functionality

The app makes progression visible through a five-level challenge ladder and
adds a hands-on, model-driven Concept Sandbox for architecture nodes. Redis is
one example preset, not the product boundary.

The challenge ladder names the current level, explains the next milestone, and
shows the learner where the current card sits on the five-step difficulty
scale. Fresh cards in a session continue to ramp from easy to hard. Once a
learner has answered enough questions with sufficient accuracy and topic
coverage, future fresh cards may use the next difficulty level. Scheduled
reviews and retries retain their existing priority and are not discarded by
the ladder.

The Concept Sandbox is a bounded collection of reviewed node models. It
includes the original Redis-like cache, queue/worker, and relational database,
plus the ten popularity-selected families listed above. A learner chooses a
node, chooses a reviewed situation, adjusts the inputs that model supports,
predicts the key outcome, runs the deterministic model, and receives an
explanation of the causal result. A learner can then move through the
situations in an escalating sequence and see completion progress.

The models are explicitly instructional. They do not connect to a vendor,
provision infrastructure, benchmark a product, or make a universal capacity
claim.

## Wiki and Sandbox learning loop

The Concept Wiki and Concept Sandbox are one integrated Concept Lab surface,
not two separate primary destinations. On a wide screen, one URL-addressable
page presents an `Understand` Wiki pane beside a `Test` Sandbox pane. On a
narrow screen, the same two panes stack in that order so the learner never
loses the connection between explanation and experiment. The existing
`#/wiki/<topic>` and `#/sandbox` links remain compatible entry points into this
same surface.

Every reviewed sandbox model declares at least three bundled Wiki concepts that
explain the trade-offs exercised by its controls and situations. The learner
can choose a concept in the Wiki pane while the experiment remains visible,
then choose a relevant node in the Sandbox pane without leaving the page.
Selecting a node updates the Wiki pane to that node's first mapped concept.
If the learner changes a concept while an active run is visible, the current
node state remains unless the learner explicitly chooses a different node. A
same-node return therefore keeps the selected situation, controls, prediction,
and result in memory; switching to a different node intentionally starts its
baseline.

Every bundled Wiki entry that has a matching model shows the related Sandbox
node or nodes in its learning callout. Unmapped generated or unrelated topics
remain readable and show a general Sandbox fallback inside the same page.

The bridge is local and offline. It uses an explicit topic-to-model map, never
guesses a node from arbitrary Wiki prose, and falls back to a general Sandbox
link when a generated or unrelated Wiki topic has no reviewed experiment.

After a run, the result includes a model-specific simulation trace. The trace
shows a three-stage path, the observed branches, actual derived values, and a
short explanation of why the workload took that path. The trace is rendered
with dependency-free HTML/CSS so it remains available offline and does not
depend on Mermaid or a second diagram service.

## Inputs And Outputs

The sandbox accepts local inputs defined by the selected node model. Shared
workload vocabulary includes:

- arrival/request rate, read/write mix, and service time;
- capacity, concurrency or worker count, and queue/memory limits; and
- model-specific factors such as cache hit rate, working-set size, index
  coverage, retries, or hot-key share.

The browser derives model-specific metrics and a short causal explanation. For
example, the cache model derives hits, misses, backend traffic, utilization,
latency, and memory pressure; the queue model derives backlog, wait time,
throughput, and drops; the database model derives query throughput,
connection pressure, latency, and replication lag; and the new models derive
the bottleneck signals implied by their interview pattern, such as feed
fan-out work, token-bucket admission, chunked storage writes, prefix lookup
pressure, or replica quorum cost. The learner prediction is compared with the
modeled result before the next situation is offered.

Each result also returns a presentation-safe trace contract: a title, time
window, ordered stages, branch outcomes, an accessible text description, and a
teaching callout. Stage and branch tones are limited to neutral, healthy,
watch, and stress so the visual state cannot leak arbitrary markup into the
page.

Aggregate sandbox evidence is added to the existing local profile: run count,
correct prediction count, current and best prediction streak, and completed
labs. No raw personal data or network request is added. The existing profile
sync path may carry these non-sensitive aggregates for signed-in users.

## Use Cases

- A learner who has only read about caching can predict and observe how hit
  rate changes database traffic.
- A learner can pressure-test a cache, queue, or database under a reviewed
  workload change without installing infrastructure.
- A learner preparing for an interview can compare how different node types
  fail: a cache misses, a queue backs up, and a database saturates for
  different reasons.
- A learner can transfer the same predict-run-explain habit across the most
  common system-design families without memorizing one vendor's architecture.
- A learner can open the Wiki explanation for a Sandbox model's trade-off,
  then return to the same experiment and test the explanation against a
  changing constraint.
- A learner can keep the Wiki explanation and the live experiment visible on
  the same page while moving between concepts and node models.
- A learner reading a Wiki concept can jump directly to the node model that
  demonstrates it, instead of searching through an unrelated catalog.
- A learner can see a concrete next challenge instead of an unexplained star
  rating or a sudden jump to a hard card.
- A returning learner can resume the lab and see evidence that predictions are
  improving without needing a real Redis installation.

## User Journeys

1. From the dashboard, the learner sees the current challenge level and opens
   `Concept Wiki` or `Concept Sandbox`; both entry points open the same Concept
   Lab page with the Wiki and experiment panes visible together.
2. The learner reads the selected concept in the `Understand` pane, chooses a
   node in the `Test` pane, and sees the node's mapped concept become active in
   the Wiki pane.
3. The learner chooses a situation, adjusts supported assumptions, selects a
   prediction, and runs the experiment while the explanation remains visible.
4. The result shows the prediction outcome, model-specific metrics, and a
   causal explanation. The learner can rerun after changing a constraint or
   select `Try next situation` to progress through the node lab.
5. The learner selects another Wiki concept or node model on the same page to
   transfer the predict-run-explain habit. A same-node change preserves the
   active run; a different node starts its baseline situation.

Alternate paths:

- If no prediction is selected, the lab keeps the experiment unrunnable and
  explains what is required.
- If the browser has no profile persistence, the experiment still runs in
  memory and the learner can continue the current lab.
- If a learner changes a slider after a result, the result remains visible as
  the previous run until `Run again` is selected, avoiding a moving target.

## Non-Goals

- A real Redis client, server-side simulation, infrastructure provisioning, or
  live capacity benchmark.
- A free-form architecture builder, vendor-specific benchmark, or live
  infrastructure simulator.
- Separate Wiki and Sandbox pages as the primary learning experience; the
  legacy hash links remain aliases for the shared Concept Lab surface.
- Generating a bespoke Wiki article for every slider value or pretending that
  a Wiki explanation is a production runbook.
- Treating the educational assumptions as vendor guarantees or recommending a
  production node size.
- Replacing the existing spaced-repetition scheduler, due-review ordering,
  topic graph, or generated-card validation.
- Gating wiki content or preventing learners from exploring advanced topics.

## Edge And Error Behavior

- Numeric inputs are clamped to documented safe ranges and invalid values fall
  back to the current situation's defaults.
- Zero read traffic produces zero cache hits/misses and a clear explanation
  rather than a divide-by-zero result.
- Saturated node, memory pressure, low hit rate, and hot-key concentration are
  shown as modeled warnings or stress states with the assumption that caused
  them.
- The run action requires a prediction; the user sees an inline status message
  and no progress is recorded until a prediction is selected.
- Re-running a situation updates aggregate run and prediction counts but does
  not duplicate its completion marker in the current lab.
- The sandbox is available offline. Missing Mermaid, generation APIs, or
  account state do not affect it.
- Every reviewed model has bounded numeric inputs, five escalating situations,
  a prediction target, deterministic equations, and a three-stage trace. A
  model cannot be added to the catalog by supplying only a label or a generic
  fallback trace.
- Every reviewed model has at least three explicit bundled Wiki concept links,
  and every Wiki-to-Sandbox link names the target node family. Missing
  mappings show a general Sandbox fallback instead of inventing a relation.
- Wiki and Sandbox primary entry points render the same Concept Lab surface;
  the two panes remain visible together on wide screens and stack without
  losing context on narrow screens.
- Selecting a Wiki concept does not discard the visible experiment state;
  changing the node explicitly resets only that node's lab to its baseline.
- The sandbox keeps radio buttons and range sliders at their native sizes;
  advanced assumptions may be collapsed so the prediction step remains in a
  readable viewport on narrow screens.

## Success Criteria

- A fresh learner sees a named Level 1 and a next-level milestone on the
  dashboard; after the documented thresholds, fresh-card target difficulty is
  capped at the earned level and the UI reflects the level.
- The sandbox exposes the reviewed node models and their situations and all
  documented inputs, and a run produces deterministic metrics for the same
  node and inputs.
- The catalog contains thirteen unique reviewed models: the original three and
  the ten popularity-selected families, with no duplicate product aliases.
- Each of the ten new models has five runnable situations, at least three
  meaningful prediction outcomes, model-specific derived metrics, and a
  model-specific three-stage trace whose values are tied to those metrics.
- The Wiki and Sandbox are bidirectionally linked: a model exposes its
  concepts, a mapped Wiki entry exposes its model(s), and a same-node return
  preserves the current in-memory experiment.
- The primary Wiki and Sandbox actions open one integrated Concept Lab page
  with the explanation and experiment panes visible together, while existing
  Wiki and Sandbox hash links remain deep-link compatible.
- The README and implementation plan identify the popularity sources and make
  clear that the ordering is a prioritization proxy, not a forecast of hiring
  probability.
- A prediction is required, compared with the derived hit-rate bucket, and the
  result explains at least one causal relationship and one risk/assumption.
- Before a run, the result panel shows a compact preview path; after a run,
  every node model shows an engaging three-stage simulation trace with at
  least three observed branches and values tied to the derived output.
- A full five-situation lab can be completed without network access, and
  aggregate evidence survives profile serialization and reload.
- Automated tests cover model math, input clamping, zero-load and stress
  paths, level thresholds, route/UI hooks, prediction gating, and progress
  persistence. `bash check.sh` and `bash build.sh` pass.
