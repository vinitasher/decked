# Gamified Learning Loop

Source issue: Direct user request (no tracked issue)
Implementation plan: [gamified-learning-loop-plan.md](gamified-learning-loop-plan.md)
Status: Complete

Implementation notes: fresh AI generation requires Pro under the current
entitlement model, so Add a concept is free only for concepts already in the
server library. The Topic Map has since been folded into the world map as its
Learning path view, and each drill topic's concept page shows its know-first
and leads-to links; `#/learning-path` redirects there.

## Goal

Make learning system design fun and easier to start. A learner should always
know what to play next, feel progress after every few minutes, be able to add
a concept they are curious about in one step, and come to understand it by
playing with it rather than only reading about it.

Decked already has most of the parts a game needs: drill sessions, a five-level
challenge ladder, day streaks, eight achievements, a categorized Concept Lab
map, and sandboxes where the learner predicts an outcome and runs a model.
Today they sit on separate screens behind a grid of ten dashboard buttons. This
feature joins them into one loop and removes screens from the main path
instead of adding more.

## The Core Loop

1. **Play.** The home screen has one primary action, Play, which starts the
   most useful next activity: due reviews, today's unfinished quest, or the
   recommended next concept on the map.
2. **Earn.** Every drill answer and sandbox prediction earns XP, with a combo
   multiplier for consecutive correct answers.
3. **Clear.** Concepts earn up to three stars. Stars fill in the concept's
   spot on the world map.
4. **Challenge.** When a world is mostly cleared, its boss challenge appears.
5. **Return.** Three daily quests and the existing day streak bring the
   learner back tomorrow.

## Functionality

### XP and rank

- XP is awarded for events the app already records:

  | Event | XP |
  |---|---|
  | Correct drill answer | 10 × card difficulty |
  | Incorrect drill answer whose explanation is viewed | 2 |
  | Correct sandbox prediction | 15 |
  | Sandbox situation cleared for the first time | 10 × situation level |
  | Daily quest completed | 50 |
  | Boss challenge cleared | 250, first clear only |

- Consecutive correct answers (the existing `🔥×N` counter) apply a combo
  multiplier of ×1.5 from three in a row and ×2 from five, capped at ×2.
- There is one level system. The five existing challenge levels become the
  learner's **rank** (Foundations through Architecture judgment). Rank is still
  earned by accuracy and coverage, never by XP alone, so XP cannot buy
  harder cards. XP is shown as a total, a today count, and a weekly count.

### World map

- The Concept Lab's ten categories become ten **worlds** on one map, plus a
  **My Concepts** world for concepts the learner adds.
- Each concept shows a 0 to 3 star state:
  - ★ Read: the concept's explanation was opened.
  - ★★ Tested: sandbox situations 1 to 3 were cleared with a correct
    prediction.
  - ★★★ Mastered: all five situations were cleared and the learner answered at
    least two drill cards on the topic correctly. Concepts outside the 29-topic
    drill catalog use their starter cards (see Add a Concept).
- Nothing is locked. Prerequisites stay advisory, as the topic hierarchy
  requires. The map highlights a **recommended next** concept whose
  prerequisites have stars, and dims concepts that are far ahead, but every
  concept remains clickable.
- The existing Topic Map and Concept Lab index merge into this map.

### Daily quests

- Three quests per UTC day, chosen deterministically from the date and the
  learner's profile so they are stable across reloads and devices.
- Quests come from a small authored pool, for example: finish one session,
  clear one sandbox situation, earn a star on a new concept, rematch two
  missed cards, or play a world you have not touched this week.
- At least one quest each day must be completable in under three minutes.
- The existing day streak is kept as it is today.

### Boss challenges

- Each world has one boss built on a reviewed sandbox model that fits it
  (for example, URL shortener for Databases or social feed for Caching).
- A boss is a short run: three to five drill cards from the world's topics,
  then one sandbox situation at level 4 or 5. The learner has three hearts;
  each wrong answer costs one.
- The boss appears on the map when at least half of the world's concepts have
  two stars. It can be retried without limit, and the best result is kept.

### Add a concept

- An **Add concept** control on the map takes a free-text name such as
  "write-ahead log" or "bloom filters".
- The name is folded onto a canonical kebab-case key with the existing
  concept matching. If the concept already exists, the app opens it.
- Otherwise the app requests the concept's explanation through
  `GET /api/wiki`, which already generates its bounded sandbox, and one
  difficulty-1 starter drill card through `GET /api/generate`. The concept
  then appears in My Concepts with zero stars.
- Before generating, the app states what the add will use from the learner's
  daily allowance. Cached concepts cost nothing. Failure leaves no half-added
  concept on the map.

### Rematch

- A missed drill card or sandbox prediction becomes a **rematch**: a one-tap
  retry later in the same session or in tomorrow's quests, earning full XP when
  answered correctly. This builds on the existing review scheduling instead of
  replacing it.

### Simpler home

- The home screen shows Play, today's quests, rank and XP, streak, and the map.
- Search, Bookmarks, Session History, Statistics, Create a Card, Design
  Decisions, and High Contrast move to a **More** menu. Their hash routes keep
  working.

## Inputs And Outputs

Inputs are existing learner events (answers, explanation views, sandbox runs
and predictions, concept opens), the learner's add-concept text, and the
current UTC date.

The profile gains one additive object, synchronized with the rest of the
profile through `GET/PUT /api/profile`:

```json
{
  "game": {
    "version": 1,
    "xp": { "total": 0, "byDay": {} },
    "stars": { "<topic>": 0 },
    "clearedSituations": { "<model-id>": [1, 2] },
    "quests": { "date": "2026-11-24", "items": [] },
    "bosses": { "<world-id>": { "bestHearts": 0, "clearedAt": null } },
    "customConcepts": [{ "topic": "bloom-filters", "addedAt": "..." }],
    "rematches": []
  }
}
```

`byDay` keeps only the last 14 days. Older profiles without `game` are
normalized to an empty game state. Existing profiles do not record which
explanations were opened or which sandbox situations were cleared (only
aggregate sandbox counts), so the one-time back-fill grants one star to every
topic the learner has answered drill cards on and converts existing correct
answers into starting XP. Returning learners do not start from zero.

## Use Cases

- A new visitor taps Play and is in a first question within one tap.
- A returning learner sees three quests and finishes one in a coffee break.
- A learner curious about a concept adds it and plays its sandbox right away.
- A learner who missed a card gets a rematch instead of only an explanation.
- A learner works through a world and beats its boss as a checkpoint.

## User Journeys

### Play from home

1. The learner opens Decked.
2. The home screen shows Play, today's quests, rank, XP, and streak.
3. Play starts due reviews if any exist, otherwise the next quest, otherwise
   the recommended concept.
4. After the activity, a short results screen shows XP earned, stars gained,
   and quest progress, with Play Again as the primary action.

### Add and play a new concept

1. The learner opens the map and selects Add concept.
2. The learner types "bloom filters" and sees what it will use from the
   allowance.
3. The app generates the explanation, sandbox, and starter card.
4. The concept appears in My Concepts and opens on its Concept Lab page.
5. Reading it earns the first star; clearing sandbox situations earns the next.

### Beat a boss

1. Half the concepts in a world reach two stars and the boss appears.
2. The learner starts the boss with three hearts.
3. The learner answers the drill cards and runs the final sandbox situation.
4. Clearing it awards XP and marks the world as cleared on the map.

## Non-Goals

- Leaderboards, friends, or any social or public ranking.
- Paid boosts, purchasable XP, or randomized loot rewards.
- Hard locks on concepts or difficulty that the topic hierarchy forbids.
- Letting generated concepts change the canonical 29-topic catalog or its
  prerequisite graph.
- Replacing the existing spaced repetition schedule.

## Success Criteria

- From a fresh load, a learner reaches a first question in one tap.
- Every XP award comes from a recorded event and is awarded at most once per
  event, including after a profile sync.
- Quests are identical across reloads and devices on the same UTC day.
- A learner can add a new concept and play its sandbox without leaving the map
  flow, and a failed add leaves no partial state.
- Existing profiles load without data loss and with stars back-filled.
- Every existing hash route still resolves.
- Automated tests cover XP rules, combo caps, quest determinism, star
  derivation, boss unlock and hearts, add-concept success and failure, and
  profile normalization.

## Open Questions

- Should XP show a player level number as well as rank, or is rank plus XP
  totals enough? The proposal is rank only, to avoid two competing levels.
- Should bosses appear at half the world at two stars, or earlier?
- Should added concepts try to join one of the ten worlds automatically, or
  always start in My Concepts?
