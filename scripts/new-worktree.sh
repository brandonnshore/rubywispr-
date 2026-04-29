#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/new-worktree.sh <target-path> <branch-name> [--existing] [--source PATH] [--link]

Create a git worktree and immediately set up RubyWhisper env files inside it.

Examples:
  scripts/new-worktree.sh ../rubywhisper-ui codex/rubywhisper-ui
  scripts/new-worktree.sh ../rubywhisper-audit main --existing

Options:
  --existing     Check out an existing branch instead of creating a new one.
  --source PATH  Pass a private env source to setup-chat-env.sh.
  --link         Symlink .env.local to the source instead of copying it.
USAGE
}

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

target_path="$1"
branch_name="$2"
shift 2

existing=0
source_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --existing)
      existing=1
      shift
      ;;
    --source)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --source" >&2
        exit 2
      fi
      source_args+=(--source "$2")
      shift 2
      ;;
    --link)
      source_args+=(--link)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  current_branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo HEAD)"
  cat >&2 <<EOF
Cannot create a worktree yet: branch '$current_branch' has no commits.

Git worktrees need a real commit to branch from. Fix this once from the main checkout:

  git add .gitignore .env.example .envrc AGENTS.md PRODUCT_BRIEF.md FORK_STRATEGY.md scripts
  git commit -m "Initial RubyWhisper project setup"
  git push origin "$current_branch"

Then retry worktree creation.
EOF
  exit 1
fi

if [[ "$existing" -eq 1 ]]; then
  if ! git rev-parse --verify "$branch_name" >/dev/null 2>&1; then
    cat >&2 <<EOF
Cannot create worktree for existing branch '$branch_name': it is not a valid local ref.

If this repo is brand new, make an initial commit first. If the branch exists only on the remote, run:

  git fetch origin "$branch_name:$branch_name"

Then retry.
EOF
    exit 1
  fi
  git worktree add "$target_path" "$branch_name"
else
  git worktree add -b "$branch_name" "$target_path"
fi

(
  cd "$target_path"
  scripts/setup-chat-env.sh "${source_args[@]}"
)

cat <<EOF

Worktree ready:
  $target_path

Branch:
  $branch_name
EOF
