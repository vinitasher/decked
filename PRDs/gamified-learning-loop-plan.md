# Gamified Learning Loop Implementation Plan

PRD: [gamified-learning-loop.md](gamified-learning-loop.md)

## Technical Approach

Add one browser-side game module that turns existing learner events into XP,
stars, quest progress, boss state, and rematches. The module owns pure rule
functions (XP for an event, combo multiplier, stars for a topic, quests for a
date, boss availability) so they can be tested in Node without the DOM. The
`APP` object calls it at the points that already update the profile: answer
recording, explanation views, sandbox runs and predictions, and concept opens.

Each award carries a stable event key (for example `answer:<cardId>:<date>` or
`situation:<modelId>:<level>`). The game state keeps the keys it has awarded
for the retained 14-day window, so replays, reloads, and profile merges cannot
double-award. Lifetime totals are stored, not recomputed.

Quests are chosen from an authored pool by a seeded hash of the UTC date and
profile identity, then filtered by eligibility (for example, no rematch quest
when there are no misses).

The world map reuses the Concept Lab category assignments in
`js/concept-categories.js`. Recommended-next uses the existing prerequisite
graph and star state; it never hides or disables a concept.

Add concept reuses `matchWikiTopic` and `normalizeConceptName`, then calls the
existing `/api/wiki` endpoint (which already ensures a generated sandbox) and
`/api/generate` for one difficulty-1 card. The concept is written to
`game.customConcepts` only after both succeed or the card request falls back to
"no starter card yet", which still allows stars 1 and 2.

## Delivery In Three Pull Requests

1. **Core loop.** Game module, XP and combo, stars, quests, profile
   normalization and back-fill, the simpler home screen with Play and the More
   menu, the merged world map, and the results screen.
2. **Add a concept.** Map control, allowance notice, generation flow, My
   Concepts world, and failure handling.
3. **Play to understand.** Rematches, boss challenges with hearts, and
   sandbox prediction scoring presentation. Mobile and accessibility pass.

Each pull request runs `bash check.sh` and leaves the app shippable.

## Expected Changes

- `js/game.js` (new): rule functions and game-state normalization.
- `js/app.js`: event hooks, home screen, results screen, map rendering, add
  concept flow, rematch and boss sessions, More menu.
- `js/sandbox.js`: report situation clears and prediction results to the game
  module.
- `js/concept-categories.js`: world identifiers and boss model assignment.
- `index.html` and `css/style.css`: home, map, quest, results, boss, and
  More menu UI; load `js/game.js`.
- `sw.js`: cache the new script.
- `functions/api/profile.js`: accept and bound the additive `game` object.
- `tests/game-rules.test.mjs` (new) and additions to
  `tests/profile-persistence.test.mjs`, `tests/routing.test.mjs`, and
  `tests/learning-lab-ui.test.mjs`.
- `README.md`: describe the loop, XP rules, and the new profile field.

## Testing Strategy

- Unit-test XP per event, combo thresholds and cap, and once-per-event keys.
- Verify quest selection is deterministic for a date and profile and always
  includes one short quest.
- Verify star derivation from wiki views, sandbox clears, and drill accuracy,
  and back-fill from existing history.
- Verify boss availability, heart loss, retry, and best-result retention.
- Verify add-concept paths: existing concept, new concept success, wiki
  failure, card failure, and quota exhaustion.
- Verify profile normalization for missing, malformed, and oversized `game`
  data, and that sync merges do not double-award.
- Verify every existing hash route still resolves.
- Run `bash check.sh` and a local responsive smoke test at phone width.

## Rollout And Compatibility

The `game` field is additive and normalized on load. Profiles without it get an
empty state plus a one-time back-fill. Old clients ignore the field, and the
profile endpoint must preserve it when an old client writes. No KV migration is
needed.

## Risks And Decisions

- **Two level systems.** Rank stays the only level so XP cannot unlock harder
  content. Revisit if testing shows learners want a level number.
- **Profile size.** Award keys and daily XP are kept for 14 days and the
  profile endpoint bounds the `game` object.
- **Generation cost.** Add concept uses existing quotas and caches. It shows
  the cost first and never spends allowance silently.
- **Scope creep.** Leaderboards, social features, and paid boosts are out of
  scope.
