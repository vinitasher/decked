#!/usr/bin/env bash
set -Eeuo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "==> System Design Flashcards - Cloudflare Deploy"
echo ""

if ! command -v npx &>/dev/null; then
  echo "ERROR: npx not found. Install Node.js first."
  exit 1
fi

NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Wrangler requires Node.js 22 or newer (found $(node --version))."
  exit 1
fi

echo "==> Checking Cloudflare auth..."
if ! npx --yes wrangler whoami >/dev/null; then
  echo "ERROR: Wrangler is not authenticated. Run: npx wrangler login"
  exit 1
fi

if grep -q "__FILL_ME_IN__" wrangler.toml; then
  echo "ERROR: wrangler.toml still contains placeholder resource IDs."
  exit 1
fi

# Stage only public assets. Pages Functions are discovered from ./functions.
./build.sh

echo "==> Deploying to Cloudflare Pages (project: decked)..."
npx --yes wrangler pages deploy "$DIR/.pages-dist" \
  --project-name decked \
  --branch main \
  --commit-dirty=true

echo ""
echo "Deployed: https://decked.pages.dev"
