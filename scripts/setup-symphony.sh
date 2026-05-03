#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

if [[ -x "scripts/setup-chat-env.sh" ]]; then
  scripts/setup-chat-env.sh
fi

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

expand_path() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$repo_root" "$1" ;;
  esac
}

require_command git
require_command mise
require_command codex

symphony_repo_url="${SYMPHONY_REPO_URL:-https://github.com/openai/symphony.git}"
symphony_ref_dir="$(expand_path "${SYMPHONY_REFERENCE_DIR:-.tools/symphony}")"

mkdir -p "$(dirname "$symphony_ref_dir")"

if [[ -d "$symphony_ref_dir/.git" ]]; then
  echo "Updating Symphony reference implementation in $symphony_ref_dir"
  git -C "$symphony_ref_dir" fetch --depth 1 origin main
  git -C "$symphony_ref_dir" checkout main
  git -C "$symphony_ref_dir" pull --ff-only origin main
else
  echo "Cloning Symphony reference implementation into $symphony_ref_dir"
  git clone --depth 1 "$symphony_repo_url" "$symphony_ref_dir"
fi

cd "$symphony_ref_dir/elixir"
mise trust
mise install
mise exec -- mix setup
mise exec -- mix build

cat <<EOF

Symphony is built.

Start it from the RubyWhisper repo with:
  scripts/run-symphony.sh
EOF
