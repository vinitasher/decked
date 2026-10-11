# KV-backed learner progress

Source issue: [#254](https://github.com/vinitasher/mamaLab/issues/254)
Implementation plan: [flashcard-progress-kv-plan.md](flashcard-progress-kv-plan.md)
Status: Complete

## Functionality

System Design Flashcards stores learner profile state and progress in the
existing Cloudflare KV namespace used by the application. The browser keeps a
local copy for immediate rendering and offline use, while signed-in and
anonymous profiles are synchronized to an identity-scoped KV record.

Signed-in profiles use the verified Supabase subject as their identity.
Anonymous profiles use the existing random browser device ID. A request with
neither identity is not allowed to read or write a profile.

## Inputs And Outputs

- `GET /api/profile` returns the caller's profile or an empty result when no
  remote profile exists.
- `PUT /api/profile` accepts the normalized profile and a client update
  timestamp, validates the payload, and stores it under `profile:v1:<identity>`
  in `CARD_CACHE`.
- The stored envelope includes the schema version, server update timestamp,
  client update timestamp, and profile JSON. Auth tokens are never persisted.
- Profile data includes SRS reviews and card snapshots, topic scores, streaks,
  session totals, and scenario-seen ledgers. Card diagrams remain embedded in
  snapshots as `nodes`, `flows`, and `options[].flows`.
- Generated-card cache statistics and snapshot tooling exclude `profile:v1:`
  records so learner data is not exposed as card-cache content.

## Use Cases

- A signed-in learner continues progress on another browser or device.
- An anonymous learner keeps progress after a refresh and can recover it on
  the same device when the browser cache is restored.
- A learner can continue studying offline; local writes are synchronized when
  the service becomes available.
- Existing local progress migrates to KV when the first remote profile is
  created for that identity.

## User Journeys

1. A learner opens the app. The local profile renders immediately.
2. Account initialization resolves the Supabase session or device identity.
3. The app fetches the identity-scoped remote profile. If none exists, the
   existing local profile is uploaded as the migration.
4. The learner answers cards. Progress is written locally first and queued for
   asynchronous KV synchronization, so answer controls are not blocked.
5. If synchronization fails, the learner continues from local state and a
   later account initialization or visibility change retries the upload.
6. On another device, the remote profile hydrates the local cache after sign-in.

## Non-Goals

- Adding a relational database or a new KV namespace.
- Storing auth tokens, passwords, or raw provider responses in KV.
- Replacing the generated-card or wiki cache contracts.
- Guaranteeing transactional multi-device merges; conflicting profile writes
  use the latest accepted client update timestamp.
- Moving theme, UI preferences, bookmarks, or custom-card authoring out of
  browser storage in this iteration.

## Edge And Error Behavior

- Invalid or expired auth tokens fall back to the device identity only when a
  valid device ID is present; otherwise profile access returns `401`.
- Malformed JSON, wrong profile shapes, or payloads over the configured size
  limit return a client error and leave the existing KV record unchanged.
- Missing KV configuration returns a clear server error; the app continues
  using local storage.
- A failed GET or PUT never clears local progress. The app keeps the local
  profile and retries later.
- A remote profile is never returned for a different user or device identity.
- The service worker does not cache `/api/profile` responses; profile offline
  behavior uses the identity-specific local cache instead.
- A newer user-local profile is preserved when anonymous local progress is
  promoted into a signed-in identity.

## Success Criteria

- Profile API tests prove identity isolation, migration, validation, and
  failure-path preservation.
- Browser tests prove immediate local writes, remote hydration, migration,
  asynchronous save behavior, and offline fallback.
- `bash check.sh`, `bash build.sh`, and `git diff --check` pass.
- A manual signed-in smoke test verifies progress survives a fresh browser
  session; an offline smoke test verifies answering remains usable.
