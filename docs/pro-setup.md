# Pro monetization setup (Supabase + Stripe)

The app's monetization: everyone gets a free tier (10 freshly generated cards,
10 wiki entries, and 3 generated Sandbox definitions per day, UTC), and Pro
removes the limits. Quotas are enforced server-side in the Cloudflare Pages
Functions; Stripe Checkout sells the Pro subscription; the Stripe webhook
grants Pro by writing the user's entitlement into KV. No database is required
— KV is the source of truth.

## 1. Supabase (accounts)

1. Create a project at https://supabase.com (free tier is fine).
2. Enable sign-in providers under **Authentication → Providers**:
   - **GitHub**: create an OAuth app in GitHub → paste id/secret.
3. Copy from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY` (public, safe for the client)
   - `JWT Secret` → `SUPABASE_JWT_SECRET` (server-side only, secret)

4. In **Authentication → URL Configuration**, add these entries to
   **Redirect URLs**:
   - `https://decked.pages.dev`
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`

   The app returns to the origin where sign-in started, so both the deployed
   site and local GitHub development logins need to be allow-listed.

No tables are needed. Accounts exist purely so Pro can be attached to a
stable identity; entitlements live in Cloudflare KV.

## 2. Stripe (payments)

1. Create an account at https://stripe.com (or use test mode first).
2. **Products → Add product**: name "Deck Pro — System Design Flashcards",
   recurring price, e.g. $7.00 / month. Copy the price id (`price_...`).
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://decked.pages.dev/api/billing/webhook`
   - Events: `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - Copy the signing secret (`whsec_...`).

## 3. Cloudflare Pages environment variables

| Variable | Value | Secret? |
|---|---|---|
| `SUPABASE_URL` | project URL | no |
| `SUPABASE_ANON_KEY` | anon key | no |
| `SUPABASE_JWT_SECRET` | JWT secret | **yes** |
| `STRIPE_SECRET_KEY` | `sk_...` (test `sk_test_...` first) | **yes** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | **yes** |
| `STRIPE_PRICE_ID` | `price_...` | no |
| `FREE_DAILY_CARD_LIMIT` | optional, default `10` | no |
| `FREE_DAILY_WIKI_LIMIT` | optional, default `10` | no |
| `FREE_DAILY_SANDBOX_LIMIT` | optional, default `3` | no |
| `SANDBOX_PREWARM_TOKEN` | shared bearer token for maintenance prewarming | **yes** |

Saving environment variables triggers a redeploy.

### Background Sandbox prewarming

The repository's `sandbox-prewarm.yml` workflow reads the bundled Wiki catalog
and calls `POST /api/sandbox/prewarm` after changes, on a schedule, or through
manual dispatch. Add the same `SANDBOX_PREWARM_TOKEN` value as a GitHub Actions
secret and as a Cloudflare Pages secret. The workflow submits one topic and
waits for its result before submitting the next, so only one bulk provider call
is in flight. `SANDBOX_PREWARM_URL` is an optional GitHub Actions secret for
preview testing; it defaults to `https://decked.pages.dev/api/sandbox/prewarm`.

The endpoint accepts small batches for operators, skips valid cached entries,
and reports each topic independently without consuming learner quota. Missing
or invalid definitions remain retryable, while a learner can still use the
quota-aware on-demand `/api/sandbox` fallback.

## 4. Verify

- `GET /api/config` returns `supabaseUrl`, `supabaseAnonKey`, `stripePriceId`,
  and the public free-tier limits, including `freeDailySandboxLimit`.
- `GET /api/quota` (with `X-Device-Id` header) returns today's usage.
- Signing in with GitHub updates the account bar; "Upgrade" opens Stripe
  Checkout; after paying, the webhook flips the plan to Pro and `GET
  /api/quota` reports `plan: "pro"` with unlimited generation.
- Quota counters live in KV under `quota:cards:<identity>:<date>`,
  `quota:wiki:<identity>:<date>`, and `quota:sandbox:<identity>:<date>` (expire
  after ~3 days); billing records under `billing:<identity>`. Cache hits never
  consume quota — only fresh AI generation does.

Stripe customer and subscription identity mappings (`stripe:customer:*` and
`stripe:sub:*`) are durable KV records so delayed webhooks can still resolve a
user. Expired historical mappings are not backfilled.

## Notes

- Anonymous users get the free tier too, keyed by `X-Device-Id` (fallback:
  client IP). This is advisory, not tamper-proof; signed-in free users are
  keyed by their Supabase user id.
- Test the whole flow in Stripe test mode before going live, then swap in the
  live keys and re-verify with a test purchase.
