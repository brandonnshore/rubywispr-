#!/usr/bin/env bash
set -euo pipefail

# Codex settings setup script for RubyWhisper.
# Safe to run at the start of every new chat/worktree.
#
# Expected private env source, in priority order:
#   1. RUBYWHISPER_ENV_FILE
#   2. ~/.config/rubywhisper/rubywhisper.env
#   3. ~/.rubywhisper.env
#
# This script copies the env source into .env.local, which is gitignored.

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1 &&
  ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  current_branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo HEAD)"
  cat <<EOF
RubyWhisper setup notice:
  This checkout is on '$current_branch', but the branch has no commits yet.
  Codex/Git worktree creation from '$current_branch' will fail until you make an initial commit.
EOF
fi

if [[ ! -x "scripts/setup-chat-env.sh" ]]; then
  chmod +x scripts/setup-chat-env.sh 2>/dev/null || true
fi

scripts/setup-chat-env.sh --refresh

if [[ -f ".env.local" ]]; then
  chmod 600 .env.local 2>/dev/null || true
fi

echo "RubyWhisper setup complete."
