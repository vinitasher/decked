# Immediate System Design Visibility Implementation Plan

Source issue: Direct user request (no tracked issue)
PRD: [flashcard-immediate-system-design.md](flashcard-immediate-system-design.md)
Owner: Developer
Status: Verified

## Technical Approach

Use the existing `Render.diagram` compare path as the single source of truth.
Call it from `APP.answer(selectedId)` with `reveal: true` and `compare: true`
after the selected option is recorded and the option buttons are disabled.
This preserves the current unified edge grouping, option color legend, correct
option emphasis, and Mermaid error handling. Remove the post-answer Compare
button, the panel Peek button, and the now-unused app state and handlers. Keep
the pre-answer placeholder, with wording that describes the new answer-triggered
reveal.

No card or profile migration is required. The renderer continues to receive
the current normalized card object, and the answer method remains the common
path for mouse, touch, and keyboard selection.

## Expected Files And Modules

- `system-design-flashcards/index.html`: remove the Peek and Compare controls.
- `system-design-flashcards/js/app.js`: reset the diagram placeholder for each
  card, render unified option wiring during answer, and remove obsolete toggle
  state/handlers and confidence-time rendering.
- `system-design-flashcards/js/render.js`: clarify that the existing compare
  renderer is the unified answer view.
- `system-design-flashcards/sw.js`: bump the static cache so clients receive
  the answer-time behavior.
- `system-design-flashcards/tests/diagram-flows.test.mjs`: update static
  contract tests for control removal and answer-time compare behavior.
- `system-design-flashcards/tests/option-order.test.mjs`: assert the runtime
  answer path invokes the compare renderer for each selection.
- `system-design-flashcards/tests/mobile-next-controls.test.mjs`: retain the
  panel layout assertions while verifying the panel no longer owns a control.
- `system-design-flashcards/tests/pro-ui.test.mjs`: update the service-worker
  cache-version assertion.
- `system-design-flashcards/tests/documentation.test.mjs`: verify the paired
  product contract and implementation plan.
- `system-design-flashcards/README.md`: document immediate unified diagrams
  and remove old Peek/Compare interaction wording.
- `PRDs/flashcard-immediate-system-design.md`: product contract.
- `PRDs/flashcard-immediate-system-design-plan.md`: implementation and QA
  plan.

## Testing Strategy

- Unit/regression: invoke `APP.answer` in the existing option-order harness
  and assert the renderer receives the card with both `reveal` and `compare`
  enabled before confidence is rated.
- Static UI: assert both obsolete controls and their handlers are absent,
  while the diagram panel and retrieval placeholder remain.
- Renderer integration: retain compare definition tests for shared edges,
  distinct verbs, labels, fallback wiring, and Mermaid failure behavior.
- Run syntax checks and the full `node --test tests/*.test.mjs` suite through
  `bash check.sh`; build the Pages assets and validate the project registry.

## Manual And Visual QA

- Open a session on desktop and narrow screens, select an answer, and verify
  the diagram begins rendering without touching another control or submitting
  confidence first.
- Verify the unified legend and all option wirings are visible, feedback and
  confidence controls still appear, and the next card resets the panel.
- Verify keyboard shortcuts produce the same immediate render and focus
  remains usable on answer controls.
- Temporarily block Mermaid or use an offline load to confirm the existing
  error message does not prevent scoring or confidence input.

## Rollout And Compatibility

- This is a client-only interaction change with no schema, cache, profile, or
  API migration.
- Existing cards and normalized option flows remain compatible. A rollback is
  a revert of the UI/app commit; the renderer's compare implementation is
  unchanged.
- The feature ships through the normal branch/PR flow and is not deployed or
  merged without explicit approval.

## Risks

- A unified four-option graph can be visually dense; mitigate by reusing the
  existing color legend and responsive diagram panel.
- Mermaid is asynchronous and can fail; preserve the current error handler
  and keep answer feedback independent of render success.
- Removing controls may break stale static references; cover HTML, app source,
  and runtime test harnesses in the same change.

## Dependencies

- Existing normalized card flow contract in `js/cards.js`.
- Existing compare rendering in `js/render.js` and Mermaid dependency in the
  static shell.
- Existing answer and confidence test harnesses.

## Unresolved Decisions

- Resolved: reveal all option wirings immediately after selection. Rationale:
  this is the requested replacement for both Peek and Compare and preserves
  the current compare renderer's explanatory value.
- Resolved: keep the pre-answer placeholder rather than rendering a base graph.
  Rationale: retrieval practice remains intentional until the learner commits
  to an answer.
