# Flashcard Session Dashboard Navigation Implementation Plan

## Technical Approach

Add an accessible icon button to the stable session header and bind it during
application initialization. Implement one exit method that clears pending
auto-advance, stops the elapsed timer, disables quick-review countdown state,
renders current dashboard statistics, and shows the welcome screen.

Rotate the PWA cache so installed clients receive the new control.

## Expected Changes

- `index.html` and `css/style.css`: header control and stable dimensions.
- `js/app.js`: event binding and session-exit behavior.
- `sw.js`: cache version rotation.
- `tests/`: control presence, binding, timer cleanup, and resume preservation.
- `README.md` and `CHANGELOG.md`: behavior documentation.

## Testing Strategy

- Verify the control is inside the session header and has an accessible label.
- Verify initialization binds the control to the exit method.
- Verify exit clears auto-advance and stops the timer.
- Verify exit does not remove the resume record.
- Run the complete flashcard checks and production build.

## Rollout And Compatibility

The change uses the existing `sdf_resume` record. The service-worker cache
rotation updates installed PWAs without clearing learner progress.

## Risks

- Exiting during generation does not cancel an in-flight network request; its
  result may still populate an in-memory prefetch cache.
