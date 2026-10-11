# Capacitor wrapper readiness guide

Status: evaluation guide only. This document does not add native projects or change the PWA. Re-check linked vendor requirements before starting a pilot;
Capacitor and store policies change independently of this repository.

## 1. What Capacitor would add

[Capacitor](https://capacitorjs.com/docs) is an open-source native runtime. It
puts an existing web application in iOS and Android containers, copies built
assets into those projects, and exposes native APIs through versioned plugins.
The web UI remains primary; native code is added only for a platform
capability or store integration. Capacitor is [MIT licensed](https://github.com/ionic-team/capacitor/blob/main/LICENSE)
and free to use commercially.

[Cordova](https://cordova.apache.org/docs/en/latest/guide/overview/) solves a
similar hybrid-app problem. Capacitor is more recent Ionic-maintained tooling:
native projects are source artifacts, its plugin API targets modern web
projects, and it includes a Cordova compatibility layer. Existing web code can
be adopted without Ionic or a UI rewrite; vet every plugin's platform,
permission, privacy-manifest, and maintenance requirements.

[PWABuilder](https://www.pwabuilder.com/) is the lighter alternative to
evaluate first when the goal is packaging or validating an installable PWA,
not adding native behavior. It can reduce setup work, while Capacitor gives
the team a maintained native project and a path to native APIs.

## 2. Current repository map

The current app is a plain HTML/CSS/JavaScript PWA deployed at [`https://decked.pages.dev`](https://decked.pages.dev) through Cloudflare Pages.
The relevant inputs are:

- `manifest.json` is linked from `index.html` and declares the app name,
  standalone display, portrait orientation, theme, and 192/512px icons.
- `sw.js` caches same-origin assets and provides an offline fallback, including
  the manifest, icons, app scripts, and Mermaid CDN asset in its static list.
- The README's [PWA installability guidance](../README.md#pwa-installability)
  covers HTTPS, installation, and mobile checks. The mobile-first UI still
  needs touch-target, safe-area, keyboard, gesture, orientation, and small-
  screen testing.
- `bash build.sh` creates `.pages-dist/`, including root `.pages-dist/index.html`,
  the future Capacitor `webDir` candidate. There is currently no `package.json`,
  Capacitor dependency, `ios/` project, or `android/` project; do not add them
  in this documentation ticket.

Before wrapping, finish or re-check the tracked prerequisites: installability
(#15), offline reliability (#16), and mobile UX (#18).

## 3. Prerequisites and platform setup

Web prerequisites:

1. Serve the production PWA over HTTPS. Cloudflare Pages already serves
   `https://decked.pages.dev`; verify the hostname and every API/auth redirect.
2. Keep a valid `manifest.json`, tested `sw.js`, and polished responsive UX; a
   native shell does not repair an incomplete PWA.
3. The future project needs `package.json`, a separate built-assets directory,
   and root `index.html` with a `<head>`; see the [installation guide](https://capacitorjs.com/docs/getting-started).
4. Test CORS, OAuth redirects, billing hand-offs, and offline behavior from a
   native origin. The current app uses Cloudflare endpoints and local storage.

Native prerequisites:

- iOS requires macOS, Xcode, signing setup, and an Apple Developer Program
  membership for distribution. The current guide lists iOS 15+ and Xcode 26.0+;
  re-check [iOS requirements](https://capacitorjs.com/docs/ios) for the chosen version.
- Android requires Android Studio, the SDK/emulator or a device, and a Play
  Console account. The guide supports API 24+; verify target-SDK and Play
  requirements in the [Android guide](https://capacitorjs.com/docs/android).
- Budget the current account fees: [Apple is $99 USD per membership
  year](https://developer.apple.com/programs/whats-included/), and [Google
  Play is $25 USD one time](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
  Prices, eligibility, identity checks, and regional taxes can change.

## 4. Future setup sequence

Run this from the repository root in a dedicated branch after the
decision to pilot. The commands are a runbook, not a request to run them now.

```sh
# Ensure package.json exists and the build produces .pages-dist/index.html.
npm install @capacitor/core @capacitor/cli
npx cap init

# Keep platform packages on the same version as core and CLI.
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android

# Rebuild, copy the web bundle, and update native dependencies.
bash build.sh
npx cap sync

# Debug runs, then inspect native projects in their IDEs.
npx cap run ios
npx cap run android
npx cap open ios
npx cap open android
```

Follow the [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow)
for build, sync, run, open, signing, and release details. Commit the generated
`ios/` and `android/` projects once a pilot is approved; they are source
artifacts and need normal code review and upgrade ownership.

### Configuration

After `npx cap init`, configure the file format chosen by the CLI. A JSON
configuration for this repository would be conceptually:

```json
{
  "appId": "com.example.systemdesignflashcards",
  "appName": "System Design Flashcards",
  "webDir": ".pages-dist"
}
```

Choose an owned reverse-domain `appId` before creating store records; it is
the iOS Bundle ID and Android Application ID. `webDir` must contain the final
`index.html`, so it should remain aligned with `build.sh` and the
[Capacitor config reference](https://capacitorjs.com/docs/config).

For production, prefer the bundled `.pages-dist` assets. Do not point a
released app at the remote PWA with `server.url`: Capacitor documents that
setting for a controlled live-reload server and explicitly says it is not for
production. If used temporarily, use a private development URL, remove it
before release, and do not enable cleartext traffic in production.

## 5. Native APIs to evaluate later

No native plugins are added by this guide. Start with the web behavior and add
one plugin only when a tested product requirement justifies platform-specific
permissions and maintenance.

| Need | Future Capacitor option | Current app / decision note |
| --- | --- | --- |
| Push notifications | [`@capacitor/push-notifications`](https://capacitorjs.com/docs/apis/push-notifications) | No push-notification implementation exists today. Native push needs APNs/FCM setup, permission UX, token handling, and a server delivery design; Web Push remains a separate PWA option. |
| Haptics | [`@capacitor/haptics`](https://capacitorjs.com/docs/apis/haptics) | No haptic behavior exists today. Consider brief feedback only after usability testing shows it helps answer/review flows. |
| Camera or image upload | [`@capacitor/camera`](https://capacitorjs.com/docs/apis/camera) | The current product has no camera requirement. Add only with a concrete upload use case and platform permission/privacy copy. |
| Durable lightweight preferences | [`@capacitor/preferences`](https://capacitorjs.com/docs/apis/preferences) | The PWA currently stores profile, session, theme, bookmarks, generated cards, and related state in `localStorage`. Preferences is a native key/value store and falls back to `localStorage` on the web; plan a migration and data-loss test rather than silently changing storage. |

The [Preferences storage guidance](https://capacitorjs.com/docs/guides/storage)
also warns that web storage can be evicted and that Preferences is not a
database. Keep larger or query-heavy data on an explicitly designed storage
layer. Native plugins also add privacy declarations, permissions, device
testing, and release maintenance.

## 6. Store submission readiness

Treat iOS and Android as separate release products with separate signing,
review, metadata, and policy checks.

### iOS

- Enroll in the Apple Developer Program, create the Bundle ID and signing
  certificates/profiles, and test a signed archive on physical devices.
- Read the [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
  Submit a complete, stable app, working links, support contact, review notes,
  demo credentials or demo mode if needed, and no placeholder content.
- Publish an accessible privacy policy in App Store Connect metadata and in
  the app. Complete [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
  for data collected by this app and third-party SDKs, including identifiers,
  usage, diagnostics, authentication, billing, and any future native plugin.
- Prepare screenshots and app previews for supported devices, an accurate
  description, keywords, category, age rating, icon/splash assets, and a
  tested update/rollback plan. Confirm any subscription or digital-feature
  payment uses the applicable App Store rules.

### Android

- Create and verify a Play Console organization/personal account, reserve the
  package name, configure signing, and test a signed AAB on physical devices
  and representative API levels. New personal accounts may have additional
  testing and device-verification requirements; check the [Play Console
  setup guide](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
- Follow the [Google Play Developer Policy Center](https://play.google.com/about/developer-content-policy/),
  complete the [Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en),
  and complete the [content-rating questionnaire](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en).
- Prepare an accurate store description, screenshots, icon/feature graphic,
  category and relevant tags, target audience, privacy policy, support email,
  and any required declarations. See [store-listing guidance](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)
  and [categories/tags](https://support.google.com/googleplay/android-developer/answer/9859673?hl=en).

For both stores, use internal QA and TestFlight/closed testing as appropriate:
fresh installs, upgrades, offline review, sign-in, API failure, deep links,
back navigation, notifications (if added), billing, accessibility, and
rotation. Review queues and outcomes are variable; do not promise a fixed
time. Use the official [iOS release guide](https://capacitorjs.com/docs/ios/deploying-to-app-store)
and [Android release guide](https://capacitorjs.com/docs/android/deploying-to-google-play)
for the final upload flow.

## 7. Decision, cost, and maintenance gates

Keep the PWA as the primary product. Start a time-boxed Capacitor pilot only
when evidence supports at least one of these: strong product-market-fit and
retention metrics, repeated user demand for store distribution or native
capabilities, or a business requirement that genuinely needs app-store
presence. Before committing, compare incremental activation/retention and
revenue against privacy review, offline differences, signing, native API
permissions, two-platform QA, and ongoing OS/plugin upgrades.

Do not wrap yet when the PWA meets user needs, store presence is not a goal,
or the maintenance and policy burden exceeds measurable benefit. PWABuilder
is the first alternative to test for a simple packaging/distribution need.

Planning estimates, not commitments: allow 1-2 engineering days for an
initial shell and basic device test, 1-3 engineering days per submission
cycle plus a variable store queue/review, and roughly 2-4 hours per month for
OS, SDK, dependency, and policy maintenance once launched. Re-estimate after
the pilot. Store revenue fees are variable: Apple documents 30% generally,
with 15% programs/qualifying cases, while [Google Play service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)
depend on program, region, transaction type, and policy. Do not model a
universal 15-30% rate without checking the current terms.

## 8. Readiness checklist

- [ ] Production PWA is on HTTPS and its API/auth redirect URLs are verified.
- [ ] `manifest.json` is complete, valid, linked, and installability-tested.
- [ ] `sw.js` provides tested offline support and cache-failure behavior.
- [ ] Mobile UX is polished: touch targets, gestures, safe areas, keyboard,
      responsive layout, orientation, and accessibility.
- [ ] `package.json` and a repeatable build produce `.pages-dist/index.html`.
- [ ] A Capacitor version is selected; core, CLI, iOS, Android, and plugins
      are kept on compatible versions.
- [ ] `appId`, `appName`, and `webDir` are reviewed; `server.url` is absent
      from production configuration.
- [ ] Native API decisions are documented: Web Push versus native push,
      haptics, camera, and a localStorage-to-Preferences migration if needed.
- [ ] Apple Developer and Google Play Console accounts, identity verification,
      signing keys, and package/bundle identifiers are ready.
- [ ] Privacy policy, App Privacy details, Google Data safety, permissions,
      privacy manifests, support contact, review notes, and content rating are
      complete and accurate.
- [ ] Store screenshots, description, keywords/tags, category, icons, and
      release notes are prepared without placeholder content.
- [ ] iOS and Android physical-device, offline, upgrade, accessibility, and
      failure-path testing passes; a rollback plan exists.
- [ ] A named owner budgets ongoing OS/plugin updates, store policy changes,
      crash monitoring, and resubmission work.
