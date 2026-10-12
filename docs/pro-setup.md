# Pro monetization setup (Supabase + Stripe)

Free users can answer up to 100 questions per UTC day from bundled and cached
cards, and use existing wiki entries and experiments. All fresh AI generation
requires Pro. The Pages Functions check the paid entitlement before calling a
provider, even for forced requests. The app counts completed answers (including
retries) in the learner profile and blocks practice after 100 until midnight UTC.
This study allowance is an application limit, not a tamper-proof server counter:
static/offline content can be accessed outside the UI. Stripe Checkout sells Pro,
and the Stripe webhook stores the entitlement in KV.

## 1. Supabase (accounts)

1. Create a project at https://supabase.com (free tier is fine).
2. Enable sign-in providers under **Authentication → Providers**:
   - **GitHub**: create an OAuth app in GitHub → paste id/secret.
3. Copy from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY` (public, safe for the client)
   - `JWT Secret` → `SUPABASE_JWT_SECRET` (server-side only, for legacy HS256 tokens)

   The server also verifies ES256 access tokens against the project's public
   JWKS at `SUPABASE_URL/auth/v1/.well-known/jwks.json`. Keep `SUPABASE_URL`
   pointed at the same project used for sign-in. The JWT secret cannot verify
   ES256 tokens; the public signing key is fetched and cached for five minutes.

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
| `SUPABASE_JWT_SECRET` | legacy HS256 JWT secret, if those tokens are still issued | **yes, when used** |
| `STRIPE_SECRET_KEY` | `sk_...` (test `sk_test_...` first) | **yes** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | **yes** |
| `STRIPE_PRICE_ID` | `price_...` | no |
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
Pro-only on-demand `/api/sandbox` fallback.

## 4. Verify

- `GET /api/config` returns `supabaseUrl`, `supabaseAnonKey`, `stripePriceId`,
  and the public free-tier limits, including `freeDailySandboxLimit`.
- `GET /api/quota` (with `X-Device-Id` header) returns today's usage.
- Signing in with GitHub updates the account bar; "Upgrade" opens Stripe
  Checkout; after paying, the webhook flips the plan to Pro and `GET
  /api/quota` reports `plan: "pro"` with unlimited generation.
- The former `FREE_DAILY_*_LIMIT` generation overrides are ignored. They cannot
  enable free AI generation. `/api/config` advertises 100 daily questions and
  zero free generation allowance for wiki and experiments.
- `/api/quota` reports the plan, `aiGenerationAllowed`, and the daily answer
  count from the most recently synchronized learner profile. The browser uses
  its current profile to enforce the allowance, including when offline.
- Cache hits remain available without paid generation; fresh cache misses return
  HTTP 403 with `code: "pro_required"` for free accounts.

Stripe customer and subscription identity mappings (`stripe:customer:*` and
`stripe:sub:*`) are durable KV records so delayed webhooks can still resolve a
user. Expired historical mappings are not backfilled.

## Notes

- Anonymous practice uses the device profile; signed-in practice uses the
  account profile. Existing content remains accessible offline.
- Test checkout and entitlement changes in Stripe test mode before going live.
