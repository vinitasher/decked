# Flashcard Mobile Difficulty Controls Implementation Plan

## Technical Approach

Replace inline confidence handlers with explicit click listeners registered
during application initialization. Move visible transition and timer scheduling
ahead of persistence work, guard against duplicate submissions, and normalize
legacy profile counters before use.

Rotate the service-worker cache and use network-first requests with cache
updates for same-origin static assets. Fall back to cached responses when the
network is unavailable.

## Expected Changes

- `index.html`: stable confidence metadata without inline handlers.
- `js/app.js`: listener setup, idempotent immediate transition, profile defaults.
- `sw.js`: cache rotation and network-refresh behavior.
- `tests/`: feedback binding, ordering, idempotency, and cache policy checks.
- `README.md` and `CHANGELOG.md`: update and compatibility documentation.

## Testing Strategy

- Verify all four controls expose confidence values and no inline handler.
- Verify initialization binds each control.
- Verify the transition and timer occur before persistence.
- Verify duplicate submissions are rejected.
- Verify the service worker rotates cache and updates successful responses.
- Run the complete flashcard check and production build.

## Rollout And Compatibility

The new cache name forces existing service workers to install the update.
`skipWaiting` and `clients.claim` activate it without requiring PWA
reinstallation. Existing profile data is normalized in place.

## Risks

- Network-first requests add a network lookup before cache fallback, but ensure
  deployed fixes reach active learners.
- Progress cannot be saved when browser storage is unavailable; navigation
  continues and the error is logged.
