# Modern Study Studio UI Implementation Plan

Source issue: Direct user request (no tracked issue)
PRD: [modern-study-studio-ui.md](modern-study-studio-ui.md)
Owner: Developer
Status: Verified

## Technical Approach

Keep the plain HTML and JavaScript application and preserve its stable IDs,
classes, routes, event handlers, and storage contracts. Add semantic hooks for
the dashboard title row, daily goal, session metadata, and generated list
surfaces. Layer a responsive design system in `css/style.css` using custom
properties for surfaces, text, borders, mint/coral accents, state colors, and
focus rings across light, dark, and high-contrast themes.

The refresh includes a focused dashboard hero, clearer progress/stat cards,
stronger session question and option surfaces, consistent secondary screens,
responsive answer controls, and a cache-version bump for deployed assets.

## Expected Files And Modules

- `system-design-flashcards/index.html`: presentation hooks and form cleanup.
- `system-design-flashcards/css/style.css`: visual system and responsive rules.
- `system-design-flashcards/js/app.js`: classes for generated list surfaces.
- `system-design-flashcards/sw.js`: static asset cache version.
- `system-design-flashcards/tests/pro-ui.test.mjs`: focused visual assertions.
- `system-design-flashcards/README.md`: visual verification instructions.

## Testing Strategy

- Run `bash check.sh` for syntax, validation, and the Node test suite.
- Run `bash build.sh` to verify the Pages asset build.
- Render Chromium screenshots at 1440px and 390px widths.
- Inspect focus, long-text, empty, disabled, correct/incorrect, dark, and
  high-contrast states where the local runtime makes them available.

## Manual And Visual QA

- Desktop dashboard: hierarchy, action emphasis, progress density, and topic
  readability.
- Phone dashboard/session: no horizontal clipping, readable buttons, and a
  visible answer tray.
- Secondary screens, forms, wiki, statistics, overlays, and account/quota
  states use the same surface and focus treatment.

## Rollout And Compatibility

This is a static presentation change with no migration or feature flag. Local
storage, service-worker routing, hash routes, APIs, profile synchronization,
card data, and study algorithms are unchanged. Cache `sdf-v18` forces clients
to receive the new static bundle.

## Risks

- Inline generated markup could override CSS; use named hooks and narrow scoped
  selectors, with important declarations only for legacy empty-state markup.
- Mermaid theme output may vary; style its containing panel and retain its
existing theme-aware renderer.

## Unresolved Decisions

- Resolved: use a navy/ink canvas with mint and coral accents; rationale: it
  gives the study action a strong visual anchor without adding assets.
- Resolved: keep the existing stack; rationale: this is a presentation pass.
