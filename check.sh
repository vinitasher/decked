#!/usr/bin/env bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

scripts=(
  js/app.js
  js/cards.js
  js/render.js
  js/srs.js
  js/wiki.js
  sw.js
  functions/api/generate.js
  functions/api/cache-stats.js
  functions/api/wiki.js
  functions/api/feedback.js
  functions/api/feedback/diagnostic.js
  functions/api/feedback/config.js
  functions/api/quota.js
  functions/api/config.js
  functions/api/billing/checkout.js
  functions/api/billing/webhook.js
  functions/shared/production-option-prerequisites.js
  functions/shared/server-logger.js
  functions/shared/feedback-security.js
  functions/shared/feedback-diagnostics.js
  functions/shared/entitlement.js
  functions/shared/requirement-count.js
  server/generate-card.js
  server/server.js
  scripts/migrate-option-prerequisites.mjs
  scripts/dump-production-card-cache.mjs
  scripts/generate-wiki.mjs
  scripts/audit-card-difficulties.mjs
)

for script in "${scripts[@]}"; do
  node --check "$script"
done

node scripts/audit-card-difficulties.mjs
node --test tests/*.test.mjs
bash -n build.sh
bash -n deploy.sh

if grep -q "__FILL_ME_IN__" wrangler.toml; then
  echo "wrangler.toml contains placeholder resource IDs" >&2
  exit 1
fi

echo "System Design Flashcards checks passed."
