# Dashboard advertising

Decked supports one manual Google AdSense horizontal banner below the dashboard
content for free users. No placements appear in study sessions or Concept Lab.
Pro users have no ads. The loader waits until the server has confirmed the free
plan, and removes the placement when the account or screen changes. Ad failures
and blockers do not prevent practice. External ad requests are not cached by the
service worker.

## Activate

1. Add `decked.pages.dev` to your AdSense account and complete site approval.
2. Create a display ad unit for the dashboard. Disable **Auto ads** for this
   site, including anchor, vignette, and other automatic placements. The app
   controls only its manual placement; Auto ads are controlled in AdSense.
3. Configure AdSense **Privacy & messaging** and the required consent messages
   for the regions you serve before enabling ads. See Google's
   [consent-management requirements](https://support.google.com/adsense/answer/13554020).
4. In Cloudflare Pages, set the following public configuration and redeploy:

| Variable | Value |
| --- | --- |
| `ADSENSE_CLIENT_ID` | Optional override; defaults to `ca-pub-1421098160303360` |
| `ADSENSE_DASHBOARD_SLOT` | Your 10-digit display ad-unit ID |
| `ADSENSE_CONSENT_READY` | `true` after configuring consent messaging |
| `ADSENSE_ENABLED` | `true` to activate the placement |

Ads remain disabled when configuration is missing or invalid. The example IDs
are illustrative; never deploy them as real account configuration. Keep ads
disabled in previews and development. Add an `ads.txt` file to the published
root if AdSense requests it, using the exact line supplied by your account.

## Verify

Check the free dashboard on a phone and desktop, navigate into practice and
Concept Lab, then sign in as Pro. Only the free dashboard should request an ad.
Check consent behavior in the regions you serve and confirm Auto ads are off.
Do not click your own live ads to test them. Deployment and site approval are
required before inventory can appear or generate revenue.

The ad code follows Google's
[responsive display tag guidance](https://support.google.com/adsense/answer/9183460).
