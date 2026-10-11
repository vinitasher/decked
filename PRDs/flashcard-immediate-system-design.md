# Immediate System Design Visibility

Source issue: Direct user request (no tracked issue)
Implementation plan: [flashcard-immediate-system-design-plan.md](flashcard-immediate-system-design-plan.md)
Status: Complete

## Functionality

After a learner selects any answer option, the session immediately renders the
card's complete system-design wiring as one unified diagram. The existing
option colors and legend keep shared edges, option-specific edges, and the
correct option distinguishable in one view.

The diagram stays behind the retrieval-practice placeholder until a choice is
made. The separate Peek and Compare options are removed because the answer
event now both reveals the diagram and shows every option's wiring.

## Inputs And Outputs

- Input: the selected option and the current card's normalized nodes, base
  flows, and per-option flows.
- Output: one Mermaid compare diagram in `#diagram-container` immediately
  from the answer action, followed by the existing answer feedback and
  confidence controls.
- Persisted state: none beyond existing answer, review, and session state.
  Diagram mode is not stored and does not alter scoring.
- External effect: Mermaid remains the existing client-side dependency, with
  its current unavailable/error message.

## Use Cases

- A learner chooses an option and immediately sees how every candidate design
  routes traffic while the answer is fresh.
- A learner reviews a wrong answer without discovering a second Compare action
  or waiting for confidence submission.
- Mouse, touch, and keyboard learners receive the same visual explanation
  through the shared answer method.

## User Journeys

1. The learner opens a card and sees the retrieval-practice placeholder in the
   System design panel.
2. The learner selects an option by click, touch, or keyboard shortcut.
3. The options lock, the unified all-option diagram starts rendering
   immediately, and the existing correct/incorrect feedback appears.
4. The learner uses the legend and feedback to compare the selected,
   alternative, and correct wirings, then rates confidence and continues.
5. If Mermaid is unavailable or fails, the panel shows its existing clear
   unavailable message; answer and confidence remain usable.

## Non-Goals

- Changing correctness, scoring, SRS scheduling, option order, or Mermaid's
  graph layout and color rules.
- Showing a diagram before the learner commits to an option.
- Adding a new renderer, persistent diagram preference, or compare interaction.
- Changing the card data contract or regenerating existing card flows.

## Edge And Error Behavior

- Valid option wiring uses the existing unified compare renderer; inherited
  correct-option wiring remains represented in the legend.
- Missing or invalid Mermaid uses the current diagram-error message and never
  blocks option feedback or confidence controls.
- A malformed card reaching the renderer follows existing validation and
  error behavior; this change adds no second diagram fallback.
- Moving to the next card resets the panel to the retrieval placeholder.
- Repeated answer events remain guarded by disabled option controls; rendering
  introduces no additional review or score.

## Success Criteria

- The first answer action calls the diagram renderer with `reveal: true` and
  `compare: true`, before confidence submission is required.
- The compare definition contains all available option labels in its unified
  edge labels and legend.
- Session HTML contains neither Peek nor Compare options, and the app has no
  dead handlers for them.
- A new card restores the retrieval placeholder and current Mermaid
  unavailable/error behavior remains covered.
- Focused regression tests, `bash check.sh`, `bash build.sh`, and
  `node governance/validate-projects.mjs` pass.
