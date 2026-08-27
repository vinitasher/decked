#!/usr/bin/env bash
set -Eeuo pipefail

readonly MIN_NODE_MAJOR=22

node_major_version() {
  local node_binary="${1:-node}"
  local node_version

  if [[ -x "$node_binary" ]] || command -v "$node_binary" >/dev/null 2>&1; then
    node_version="$("$node_binary" --version 2>/dev/null)" || return 1
  else
    return 1
  fi

  node_version="${node_version#v}"
  case "$node_version" in
    ''|*[!0-9.]*) return 1 ;;
  esac
  printf '%s\n' "${node_version%%.*}"
}

node_is_supported() {
  local node_major

  node_major="$(node_major_version)" || return 1
  [[ "$node_major" =~ ^[0-9]+$ ]] && (( node_major >= MIN_NODE_MAJOR ))
}

prepend_node_bin() {
  local node_bin_dir="$1"

  export PATH="$node_bin_dir:$PATH"
  hash -r 2>/dev/null || true
}

use_nvm_node() {
  local node_version_manager_dir="${NVM_DIR:-${HOME:-}/.nvm}"
  local node_version_dir="$node_version_manager_dir/versions/node"
  local nvm_script="$node_version_manager_dir/nvm.sh"
  local candidate_bin candidate_major selected_bin="" selected_major=0

  if [[ -s "$nvm_script" ]]; then
    NVM_DIR="$node_version_manager_dir"
    export NVM_DIR
    # shellcheck disable=SC1090
    . "$nvm_script" --no-use
    if command -v nvm >/dev/null 2>&1 \
      && nvm use "$MIN_NODE_MAJOR" >/dev/null 2>&1 \
      && node_is_supported; then
      return 0
    fi
  fi

  for candidate_bin in "$node_version_dir"/v*/bin; do
    [[ -x "$candidate_bin/node" ]] || continue
    candidate_major="$(node_major_version "$candidate_bin/node")" || continue
    if (( candidate_major >= MIN_NODE_MAJOR && candidate_major > selected_major )); then
      selected_major="$candidate_major"
      selected_bin="$candidate_bin"
    fi
  done

  if [[ -n "$selected_bin" ]]; then
    prepend_node_bin "$selected_bin"
    if node_is_supported; then
      return 0
    fi
  fi

  return 1
}

ensure_supported_node() {
  if command -v node >/dev/null 2>&1 && node_is_supported; then
    return 0
  fi

  if use_nvm_node; then
    echo "==> Using Node.js $(node --version) from the available NVM installation"
    return 0
  fi

  local found_version
  found_version="$(node --version 2>/dev/null || printf 'not found')"
  echo "ERROR: Node.js $MIN_NODE_MAJOR or newer is required (found $found_version)." >&2
  echo "Install Node.js $MIN_NODE_MAJOR+ (for example, 'nvm install $MIN_NODE_MAJOR') and rerun." >&2
  return 1
}

main() {
  local dir="$(cd "$(dirname "$0")" && pwd)"
  cd "$dir"

  echo "==> System Design Flashcards - Cloudflare Deploy"
  echo ""

  if ! ensure_supported_node; then
    exit 1
  fi

  if ! command -v npx &>/dev/null; then
    echo "ERROR: npx not found. Install Node.js first."
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
  npx --yes wrangler pages deploy "$dir/.pages-dist" \
    --project-name decked \
    --branch main \
    --commit-dirty=true

  echo ""
  echo "Deployed: https://decked.pages.dev"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
