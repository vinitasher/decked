# Flashcard Session Dashboard Navigation

## Functionality

Every question screen must provide a persistent back-to-dashboard control in
the session header. Activating it stops the session timer and any pending
three-second auto-advance, then returns to the dashboard.

The current question and session index remain in the existing resume record so
the learner can continue later. Leaving does not grade, skip, or discard the
current question.

## Use Cases

- A learner pauses a session to inspect progress or change application state.
- A mobile learner can leave a question without browser back-navigation.
- A learner exits during the post-answer countdown without an unexpected card
  transition occurring on the dashboard.

## User Journey

1. The learner opens any question.
2. A back arrow is visible in the question header.
3. The learner activates it.
4. The app returns to the dashboard and shows Resume Unfinished Session.
5. Resume returns to the saved question.

## Non-Goals

- Abandoning or deleting a session.
- Recording an unanswered question as incorrect.
- Adding a confirmation dialog.
