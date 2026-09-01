#!/usr/bin/env bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

syntax_check_sources() {
  local source_dir script
  local -a source_dirs=(js functions scripts server)

  {
    for source_dir in "${source_dirs[@]}"; do
      [[ -d "$source_dir" ]] || continue
      find "$source_dir" -type f \( -name '*.js' -o -name '*.mjs' \) -print0
    done
    find . -maxdepth 1 -type f \( -name '*.js' -o -name '*.mjs' \) -print0
  } | while IFS= read -r -d '' script; do
    node --check "$script"
  done
}

run_checks() {
  cd "$DIR"

  syntax_check_sources

  node scripts/audit-card-difficulties.mjs
  node scripts/audit-option-prerequisites.mjs
  node --test tests/*.test.mjs
  bash -n build.sh
  bash -n deploy.sh

  if grep -q "__FILL_ME_IN__" wrangler.toml; then
    echo "wrangler.toml contains placeholder resource IDs" >&2
    exit 1
  fi

  echo "System Design Flashcards checks passed."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  run_checks
fi
