#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

usage() {
  cat <<'USAGE'
Usage: scripts/run-symphony.sh [--dry-run] [WORKFLOW.md]

Load RubyWhisper's private env, generate a local Symphony runtime workflow,
and start the OpenAI Symphony Elixir reference implementation.

Options:
  --dry-run   Validate local setup and generate the runtime workflow without starting Symphony.
  -h, --help  Show this help.
USAGE
}

dry_run=0
workflow_source="$repo_root/WORKFLOW.md"
passthrough_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --i-understand-that-this-will-be-running-without-the-usual-guardrails)
      passthrough_args+=("$1")
      shift
      ;;
    *)
      workflow_source="$1"
      shift
      ;;
  esac
done

scripts/setup-chat-env.sh

if [[ ! -f ".env.local" ]]; then
  echo "Missing .env.local. Run scripts/setup-chat-env.sh first." >&2
  exit 1
fi

pre_LINEAR_API_KEY="${LINEAR_API_KEY:-}"
pre_LINEAR_PROJECT_SLUG="${LINEAR_PROJECT_SLUG:-}"
pre_SYMPHONY_SOURCE_REF="${SYMPHONY_SOURCE_REF:-}"
pre_SYMPHONY_WORKSPACE_ROOT="${SYMPHONY_WORKSPACE_ROOT:-}"
pre_SYMPHONY_CODEX_HOME="${SYMPHONY_CODEX_HOME:-}"
pre_SYMPHONY_CODEX_COMMAND="${SYMPHONY_CODEX_COMMAND:-}"
pre_SYMPHONY_CODEX_MODEL="${SYMPHONY_CODEX_MODEL:-}"
pre_SYMPHONY_CODEX_REASONING="${SYMPHONY_CODEX_REASONING:-}"

set -a
# shellcheck disable=SC1091
source .env.local
set +a

restore_if_blank() {
  local name="$1"
  local fallback="$2"
  if [[ -z "${!name:-}" && -n "$fallback" ]]; then
    export "$name=$fallback"
  fi
}

restore_if_blank LINEAR_API_KEY "$pre_LINEAR_API_KEY"
restore_if_blank LINEAR_PROJECT_SLUG "$pre_LINEAR_PROJECT_SLUG"
restore_if_blank SYMPHONY_SOURCE_REF "$pre_SYMPHONY_SOURCE_REF"
restore_if_blank SYMPHONY_WORKSPACE_ROOT "$pre_SYMPHONY_WORKSPACE_ROOT"
restore_if_blank SYMPHONY_CODEX_HOME "$pre_SYMPHONY_CODEX_HOME"
restore_if_blank SYMPHONY_CODEX_COMMAND "$pre_SYMPHONY_CODEX_COMMAND"
restore_if_blank SYMPHONY_CODEX_MODEL "$pre_SYMPHONY_CODEX_MODEL"
restore_if_blank SYMPHONY_CODEX_REASONING "$pre_SYMPHONY_CODEX_REASONING"

: "${LINEAR_PROJECT_SLUG:=rubywhisper-paid-beta-launch-caaab48c6aa9}"
: "${SYMPHONY_WORKSPACE_ROOT:=~/code/rubywhisper-symphony-workspaces}"
: "${SYMPHONY_CODEX_HOME:=$repo_root/.tools/codex-symphony-home}"
: "${SYMPHONY_CODEX_COMMAND:=/Users/brandonshore/.npm-global/bin/codex}"
: "${SYMPHONY_CODEX_MODEL:=gpt-5.5}"
: "${SYMPHONY_CODEX_REASONING:=high}"
export LINEAR_PROJECT_SLUG
export SYMPHONY_WORKSPACE_ROOT
export SYMPHONY_CODEX_HOME
export SYMPHONY_CODEX_COMMAND
export SYMPHONY_CODEX_MODEL
export SYMPHONY_CODEX_REASONING

if [[ ! -x "$SYMPHONY_CODEX_COMMAND" ]]; then
  echo "Refusing to start Symphony: SYMPHONY_CODEX_COMMAND is not executable: $SYMPHONY_CODEX_COMMAND" >&2
  exit 1
fi

codex_version="$("$SYMPHONY_CODEX_COMMAND" --version 2>/dev/null || true)"
if [[ "$codex_version" == *"0.113.0"* ]]; then
  echo "Refusing to start Symphony: $SYMPHONY_CODEX_COMMAND reports $codex_version, which rejects gpt-5.5." >&2
  echo "Point SYMPHONY_CODEX_COMMAND at a newer Codex CLI, such as /Users/brandonshore/.npm-global/bin/codex." >&2
  exit 1
fi

if [[ "$SYMPHONY_CODEX_MODEL" != "gpt-5.5" ]]; then
  echo "Refusing to start Symphony: SYMPHONY_CODEX_MODEL must be gpt-5.5 for this harness." >&2
  echo "Set SYMPHONY_CODEX_MODEL=gpt-5.5 in your private env or shell, then rerun." >&2
  exit 1
fi

if [[ -z "${SYMPHONY_SOURCE_REF:-}" ]]; then
  current_ref="$(git branch --show-current 2>/dev/null || true)"
  if [[ -n "$current_ref" ]]; then
    export SYMPHONY_SOURCE_REF="$current_ref"
  fi
fi

require_env() {
  if [[ -z "${!1:-}" ]]; then
    echo "Missing required environment variable: $1" >&2
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

require_env LINEAR_API_KEY
require_env LINEAR_PROJECT_SLUG
require_env SYMPHONY_WORKSPACE_ROOT
require_env SYMPHONY_CODEX_HOME

SYMPHONY_WORKSPACE_ROOT="$(expand_path "$SYMPHONY_WORKSPACE_ROOT")"
export SYMPHONY_WORKSPACE_ROOT

symphony_ref_dir="$(expand_path "${SYMPHONY_REFERENCE_DIR:-.tools/symphony}")"
logs_root="$(expand_path "${SYMPHONY_LOGS_ROOT:-.tools/symphony-logs}")"
runtime_dir="$repo_root/.tools"
runtime_workflow="$runtime_dir/WORKFLOW.runtime.md"
codex_home="$(expand_path "$SYMPHONY_CODEX_HOME")"

if [[ ! -x "$symphony_ref_dir/elixir/bin/symphony" ]]; then
  scripts/setup-symphony.sh
fi

mkdir -p "$runtime_dir" "$logs_root" "$codex_home"
export SYMPHONY_CODEX_HOME="$codex_home"

link_codex_home_item() {
  local name="$1"
  local source="$HOME/.codex/$name"
  local target="$codex_home/$name"

  if [[ -e "$target" && ! -L "$target" ]]; then
    if [[ "$name" == "config.toml" ]] && grep -q "Dedicated non-interactive Symphony worker profile" "$target"; then
      mv "$target" "$target.generated-minimal.bak"
    else
      return
    fi
  fi

  if [[ ! -e "$target" && -e "$source" ]]; then
    ln -s "$source" "$target"
  fi
}

link_codex_home_item auth.json
link_codex_home_item config.toml
link_codex_home_item plugins
link_codex_home_item skills
link_codex_home_item bin

awk -v slug="$LINEAR_PROJECT_SLUG" -v workspace_root="$SYMPHONY_WORKSPACE_ROOT" '
  BEGIN {
    gsub(/\\/,"\\\\",slug)
    gsub(/"/,"\\\"",slug)
    gsub(/\\/,"\\\\",workspace_root)
    gsub(/"/,"\\\"",workspace_root)
  }
  /^[[:space:]]*project_slug:[[:space:]]*"\$LINEAR_PROJECT_SLUG"[[:space:]]*$/ {
    match($0, /^[[:space:]]*/)
    indent = substr($0, RSTART, RLENGTH)
    print indent "project_slug: \"" slug "\""
    next
  }
  {
    gsub(/__SYMPHONY_WORKSPACE_ROOT__/, workspace_root)
    print
  }
' "$workflow_source" > "$runtime_workflow"

args=("$runtime_workflow" "--logs-root" "$logs_root")
if [[ -n "${SYMPHONY_PORT:-4007}" && "${SYMPHONY_PORT:-4007}" != "0" ]]; then
  args+=("--port" "${SYMPHONY_PORT:-4007}")
fi
if ((${#passthrough_args[@]})); then
  args+=("${passthrough_args[@]}")
fi

if [[ "$dry_run" -eq 1 ]]; then
  cat <<EOF
Symphony dry run passed.

Reference implementation:
  $symphony_ref_dir

Runtime workflow:
  $runtime_workflow

Logs root:
  $logs_root

Source ref:
  ${SYMPHONY_SOURCE_REF:-<default clone ref>}

Codex command:
  $SYMPHONY_CODEX_COMMAND

Codex home:
  $SYMPHONY_CODEX_HOME

Codex version:
  ${codex_version:-unknown}

Codex model:
  $SYMPHONY_CODEX_MODEL

Codex reasoning:
  $SYMPHONY_CODEX_REASONING

Start command:
  scripts/run-symphony.sh
EOF
  exit 0
fi

cd "$symphony_ref_dir/elixir"
exec mise exec -- ./bin/symphony "${args[@]}"
