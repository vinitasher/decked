# Design Decisions Reference Page Implementation Plan

Source issue: [#400](https://github.com/vinitasher/mamaLab/issues/400)
PRD: [flashcard-design-decisions-page.md](flashcard-design-decisions-page.md)
Owner: Vinit Asher
Status: Implementing

## Technical Approach

Follow the app's existing screen pattern: a static `screen-*` div in
`index.html`, entries in `SCREEN_ROUTES`, dispatch branches in
`_handleHashChange`, and `showX()`/`renderX()` pairs on the `APP` object. The
content is a static data module (`js/design-decisions.js`) exposing
`DESIGN_DECISIONS`. The index is rendered by `renderDesignDecisions()` →
`_decisionIndexHtml()` into `#design-decisions-list`; each decision opens a
child route `#/design-decision/<id>` rendered by `renderDesignDecision()` →
`_decisionDetailHtml()` into `#design-decision-content`, with "Read the
concepts" (`APP.openConcept`) and "Practice the flashcards"
(`APP.startTopicSession`) links resolved from `relatedConcepts` and
`practiceTopics`. All text is escaped with the existing `_escapeHtml` helper.
The service worker cache version is bumped and the new script is added to its
static asset list so the pages work offline.

## Expected Files And Modules

- `js/design-decisions.js`: new data module (12 matrices with criteria/options/cells plus `relatedConcepts` and `practiceTopics`).
- `index.html`: load the script, add `#screen-design-decisions` (index) and `#screen-design-decision` (detail), add the dashboard nav button.
- `js/app.js`: add `'design-decisions'` and `'design-decision'` to `SCREEN_ROUTES`, dispatch branches, and `showDesignDecisions`/`renderDesignDecisions`/`showDesignDecision`/`renderDesignDecision`/`_routeDesignDecisionId`/`_decisionIndexHtml`/`_decisionDetailHtml`.
- `css/style.css`: `.decision-card`, `.decision-table`, `.decision-outcome`, `.decision-card-link`, `.decision-related`, and topline styles.
- `sw.js`: bump `CACHE` to `sdf-v28` and add `/js/design-decisions.js`.
- `tests/design-decisions.test.mjs`: new test for data shape and wiring.
- `tests/pro-ui.test.mjs`: update the expected cache version to `sdf-v28`.

## Testing Strategy

- `node --check` over the new module (covered automatically by `check.sh`).
- New `tests/design-decisions.test.mjs` evaluates the data module in a VM and
  asserts: at least 10 matrices; unique ids with title/question/decision/
  rationale; cells aligned to criteria × options; `relatedConcepts` resolve to
  real wiki entries and `practiceTopics` to real catalog topics; SQL vs NoSQL
  first; the screen divs, script tag, route strings, dispatch branches, and
  render/show methods exist; and the service worker registers the script.
- Existing routing and service-worker tests continue to pass (the new screens
  are already covered by "every screen has its own URL route").

## Manual And Visual QA

- Load the app and open `#/design-decisions`; confirm 12 decision cards render,
  the first is "Data store — SQL vs NoSQL (key-value)", and each card shows a
  comparison table plus Decision/Rationale.
- Verify the dashboard "⚖️ Design Decisions" button navigates to the page and
  back, and that a deep link survives refresh.
- Verify tables scroll horizontally (not overflow the page) at a 390px width.

## Rollout And Compatibility

- Static, additive change: new script, screen, styles, and route. No migrations,
  no data changes, no API changes.
- The service worker cache version bump invalidates the old cache so returning
  users fetch the new asset.
- Compatible with dark and high-contrast themes (all colors use CSS variables).

## Risks

- Low. Content is static and read-only; no user or server data is touched.
- Merge-conflict risk with concurrent work touching `index.html`, `js/app.js`,
  `css/style.css`, and `sw.js`; resolved at integration.

## Dependencies

None beyond the existing static PWA plumbing.

## Unresolved Decisions

None.
