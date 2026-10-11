# KV-backed learner progress Implementation Plan

Source issue: [#254](https://github.com/vinitasher/mamaLab/issues/254)
PRD: [flashcard-progress-kv.md](flashcard-progress-kv.md)
Owner: Developer
Status: Verified

## Technical Approach

1. Add a Pages Function at `/api/profile` that verifies the existing Supabase
   JWT helper, resolves a stable user or device identity, validates profile
   payload size and shape, and reads/writes only the caller's
   `profile:v1:<identity>` key in the existing `CARD_CACHE` KV binding.
2. Store a versioned envelope with server and client timestamps. Reject stale
   writes when a newer remote client timestamp is already stored.
3. Keep the current `sdf_profile` localStorage record as an offline-first cache
   and compatibility path. `APP.saveProfile()` writes locally immediately and
   schedules a debounced asynchronous PUT after account identity is ready.
4. During account initialization, GET the remote profile. A missing remote
   profile receives the current local profile as a one-time migration; an
   existing remote profile hydrates the app unless the local cache has a newer
   unsynchronized timestamp.
5. Reset synchronization state on auth identity changes so a signed-in
   profile is never sent under an anonymous or different-user key.
6. Update project documentation with the storage contract, offline behavior,
   KV key namespace, and last-write-wins limitation.

## Expected Files And Modules

- `functions/api/profile.js`: profile GET/PUT endpoint and payload validation.
- `functions/api/cache-stats.js` and `scripts/dump-production-card-cache.mjs`:
  keep profile records out of generated-card metrics and snapshots.
- `functions/shared/entitlement.js`: reusable stable identity resolution.
- `js/app.js`: remote hydration, migration, debounced writes, identity-change
  handling, and local fallback.
- `sw.js`: keep identity-scoped profile responses out of the shared service
  worker cache.
- `tests/api-profile.test.mjs`: endpoint identity, validation, migration, and
  stale-write coverage.
- `tests/cache-stats.test.mjs` and `tests/production-card-cache.test.mjs`:
  verify profile records are excluded from cache tooling.
- `tests/profile-persistence.test.mjs`: browser sync and offline regression
  coverage.
- `tests/pro-ui.test.mjs`: auth/profile initialization contract assertions.
- `README.md`: user-state storage and recovery documentation.
- `PRDs/flashcard-progress-kv.md` and this plan: product and implementation
  contract.

## Testing Strategy

- Unit-test stable identity resolution and profile payload normalization.
- Integration-test GET/PUT with an in-memory KV double for authenticated,
  device, missing-identity, malformed, oversized, and stale requests.
- Regression-test local-first writes, remote hydration, first-sync migration,
  failed network requests, and auth identity transitions in the VM browser
  harness.
- Run the full repository check and production build before opening the PR.

## Manual And Visual QA

- Sign in, answer a card, refresh, and verify the profile loads from the API.
- Open the app in a second browser, sign in to the same account, and verify
  the review history and totals appear.
- Disable the network, answer a card, restore the network, and verify the next
  profile sync succeeds without losing the local answer.
- Confirm the existing compare diagram remains unchanged; only profile
  persistence is affected.

## Rollout And Compatibility

- No data migration command is needed: the first profile GET/PUT migrates the
  current local profile lazily.
- Existing generated-card and billing/quota KV keys are untouched by the
  `profile:v1:` prefix.
- If profile API calls fail, the app continues in local-only mode.
- Recovery is a reviewed revert PR or selection of a prior successful Pages
  deployment; application rollback never deletes KV data.

## Risks

- KV is eventually consistent and does not provide compare-and-swap; timestamp
  rejection limits stale overwrites but is not a full transactional merge.
- Profile snapshots can grow as reviewed cards accumulate; payload limits and
  existing card snapshot fields bound each request, with a follow-up split-key
  design available if profiles approach the limit.
- Anonymous device IDs are not an authentication boundary; signed-in profiles
  are protected by verified Supabase subjects, while anonymous persistence is
  intentionally best-effort and device-scoped.
- A failed sync can leave another device temporarily behind; local state is
  preserved and the next successful sync repairs it.

## Dependencies

- Existing `CARD_CACHE` binding in `wrangler.toml`.
- Existing Supabase JWT secret and `apiHeaders()` auth/device headers.
- Feature issue [#254](https://github.com/vinitasher/mamaLab/issues/254).

## Unresolved Decisions

- None. The source issue and user request resolve KV reuse, identity scope,
  offline compatibility, and last-write-wins conflict behavior for this
  iteration.
