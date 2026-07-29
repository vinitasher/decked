#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "==> System Design Flashcards — Cloudflare Deploy"
echo ""

# 1. Check if wrangler is available
WRANGLER="npx wrangler"
if ! command -v npx &>/dev/null; then
  echo "ERROR: npx not found. Install Node.js first."
  exit 1
fi

# 2. Check auth
echo "==> Checking Cloudflare auth..."
$WRANGLER whoami 2>&1 | grep -q "You are not authenticated" && {
  echo "    Not authenticated. Opening login..."
  echo ""
  echo "    ┌─────────────────────────────────────────────────────┐"
  echo "    │ Run this one-time command in your local terminal:   │"
  echo "    │   npx wrangler login                                │"
  echo "    │                                                     │"
  echo "    │ It opens a browser. Log in to Cloudflare, then     │"
  echo "    │ re-run this script:                                │"
  echo "    │   bash deploy.sh                                    │"
  echo "    └─────────────────────────────────────────────────────┘"
  exit 1
} || echo "    Authenticated!"

# 3. Create KV namespace (idempotent via API)
echo "==> Creating KV namespace..."
KV_NAME="DECKD_CACHE_$(date +%s)"
KV_OUTPUT=$($WRANGLER kv:namespace create "CARD_CACHE" 2>&1 || true)
KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id: "\K[^"]+' || echo "")
if [ -z "$KV_ID" ]; then
  # maybe already exists — extract from existing config
  KV_ID=$(grep -oP 'id = "\K[^"]+' wrangler.toml | head -1)
  if [ -z "$KV_ID" ] || [ "$KV_ID" = "__FILL_ME_IN__" ]; then
    echo "ERROR: Could not create KV namespace. Create manually:"
    echo "  $WRANGLER kv:namespace create CARD_CACHE"
    echo "Then paste the id into wrangler.toml"
    exit 1
  fi
fi
PREVIEW_ID=$($WRANGLER kv:namespace create "CARD_CACHE" --preview 2>&1 | grep -oP 'id: "\K[^"]+' || echo "$KV_ID")
echo "    KV ID: $KV_ID"
echo "    Preview ID: $PREVIEW_ID"

# 4. Fill in wrangler.toml
sed -i "s/id = \"__FILL_ME_IN__\"/id = \"$KV_ID\"/" wrangler.toml
sed -i "s/preview_id = \"__FILL_ME_IN__\"/preview_id = \"$PREVIEW_ID\"/" wrangler.toml

# 5. Deploy to Pages
echo "==> Deploying to Cloudflare Pages (project: deckd)..."
$WRANGLER pages deploy . --project-name deckd

echo ""
echo "✅ Deployed! Your app is at: https://deckd.pages.dev"
echo "   (or your custom domain if configured)"
echo ""
echo "To auto-deploy on push, connect this repo in Cloudflare Dashboard:"
echo "  Workers & Pages -> deckd -> Settings -> Build -> Git integration"
