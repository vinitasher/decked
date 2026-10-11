# Flashcard Mobile Difficulty Controls

## Functionality

The post-answer Hard, Good, Easy, and Perfect controls must respond to a tap in
mobile Safari and installed PWAs. A valid tap immediately hides the controls,
shows the next-question transition, records the confidence when storage is
available, and advances after three seconds.

Confidence submission is idempotent: repeated taps cannot record the same
answer more than once. A storage or profile migration failure must not block
navigation.

The service worker must deliver current application assets after a deployment
while retaining an offline fallback.

## Use Cases

- A mobile learner submits question difficulty with one tap.
- An installed PWA receives feedback-control fixes without manual cache
  clearing or reinstallation.
- A learner with unavailable or full browser storage can continue a session.

## User Journey

1. The learner answers a question.
2. The four difficulty controls appear.
3. The learner taps one control.
4. The controls disappear and a next-question state appears immediately.
5. The next question opens after three seconds.

## Non-Goals

- Changing the spaced-repetition grading scale.
- Changing the three-second transition duration.
- Synchronizing browser progress to a server.
