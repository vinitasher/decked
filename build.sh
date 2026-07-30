#!/usr/bin/env bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

OUTPUT_DIR="$DIR/.pages-dist"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp -R index.html manifest.json sw.js css js "$OUTPUT_DIR/"
cp -f icon-192.png icon-512.png apple-touch-icon.png favicon.ico "$OUTPUT_DIR/"

echo "Built Cloudflare Pages assets in $OUTPUT_DIR"
