# Modern Study Studio UI

Source issue: Direct user request (no tracked issue)
Implementation plan: [modern-study-studio-ui-plan.md](modern-study-studio-ui-plan.md)
Status: Complete

## Functionality

Refresh the System Design Flashcards dashboard, study session, secondary
screens, forms, and overlays with one modern responsive visual system. Preserve
the existing study workflow and DOM hooks used by the application.

The interface uses a focused type scale, layered surfaces, ink/navy contrast,
mint and coral accents, clearer state colors, and visible focus treatment.

## Inputs And Outputs

Inputs are the existing HTML structure, dynamic card content, theme state,
account/quota state, and viewport. Outputs are CSS and presentation-markup
changes only. No card schema, persisted state, network request, or dependency
changes are introduced.

## Use Cases

- A learner can understand the next dashboard action and progress at a glance.
- A learner can answer a card on desktop or phone without losing context or
  feedback controls.
- A learner can open search, wiki, statistics, topic map, history, bookmarks,
  or authoring and see consistent surfaces and controls.

## User Journeys

1. Open the dashboard, scan the progress summary, and start a session.
2. Read a scenario, choose an option, review feedback, rate confidence, and
   continue on a desktop or phone.
3. Open a secondary tool, use its controls, and return to the dashboard.
4. Toggle dark or high-contrast mode and retain readable content and focus.

## Non-Goals

- Changing card content, answer correctness, SRS, generation, profile sync, or
  routes.
- Adding a frontend framework, analytics, font service, or image dependency.

## Edge And Error Behavior

Existing offline, quota, account, empty, validation, and diagram-error states
remain visible and readable. Long generated text must not overflow its surface.

## Success Criteria

- Desktop and mobile screenshots show a clear hierarchy and no clipping.
- Existing checks pass, plus focused assertions cover the new visual hooks.
- No application behavior or persisted data format changes.
