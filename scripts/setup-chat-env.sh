#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/setup-chat-env.sh [--source PATH] [--refresh] [--link]

Prepare local environment files for the current RubyWhisper checkout/worktree.

Options:
  --source PATH  Use PATH as the private env source.
  --refresh      Replace .env.local from the source even if .env.local exists.
  --link         Symlink .env.local to the source instead of copying it.
  -h, --help     Show this help.

Defaults:
  Source lookup order:
    1. --source PATH
    2. RUBYWHISPER_ENV_FILE
    3. ~/.config/rubywhisper/rubywhisper.env
    4. ~/.rubywhisper.env

Secrets are never committed. .env.local is ignored by .gitignore.
USAGE
}

refresh=0
link_mode=0
source_path="${RUBYWHISPER_ENV_FILE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --source" >&2
        exit 2
      fi
      source_path="$2"
      shift 2
      ;;
    --refresh)
      refresh=1
      shift
      ;;
    --link)
      link_mode=1
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

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

default_source="$HOME/.config/rubywhisper/rubywhisper.env"
fallback_source="$HOME/.rubywhisper.env"

if [[ -z "$source_path" ]]; then
  if [[ -f "$default_source" ]]; then
    source_path="$default_source"
  elif [[ -f "$fallback_source" ]]; then
    source_path="$fallback_source"
  fi
fi

dest="$repo_root/.env.local"
example="$repo_root/.env.example"

ensure_local_exclude() {
  local exclude_file="$repo_root/.git/info/exclude"
  if [[ -f "$exclude_file" ]]; then
    [[ -w "$exclude_file" ]] || return 0
    if ! grep -qxF ".env.local" "$exclude_file"; then
      printf "\n.env.local\n.env\n.env.*\n" >> "$exclude_file"
    fi
  fi
}

install_from_source() {
  if [[ ! -f "$source_path" ]]; then
    echo "Env source does not exist: $source_path" >&2
    exit 1
  fi

  if [[ -e "$dest" && "$refresh" -eq 0 ]]; then
    echo ".env.local already exists; leaving it unchanged. Use --refresh to replace it."
    return
  fi

  if [[ -e "$dest" || -L "$dest" ]]; then
    backup="$dest.backup.$(date +%Y%m%d%H%M%S)"
    mv "$dest" "$backup"
    echo "Backed up previous .env.local to ${backup#$repo_root/}"
  fi

  if [[ "$link_mode" -eq 1 ]]; then
    ln -s "$source_path" "$dest"
    echo "Linked .env.local -> $source_path"
  else
    cp "$source_path" "$dest"
    chmod 600 "$dest"
    echo "Copied env source into .env.local"
  fi
}

create_placeholder() {
  if [[ -e "$dest" ]]; then
    echo ".env.local already exists; leaving it unchanged."
    return
  fi

  if [[ -f "$example" ]]; then
    cp "$example" "$dest"
    chmod 600 "$dest"
    echo "Created placeholder .env.local from .env.example"
  else
    touch "$dest"
    chmod 600 "$dest"
    echo "Created empty .env.local"
  fi

  cat <<EOF

No private env source was found.
Create one at:
  $default_source

Or rerun with:
  scripts/setup-chat-env.sh --source /path/to/private.env --refresh
EOF
}

ensure_local_exclude

if [[ -n "$source_path" ]]; then
  install_from_source
else
  create_placeholder
fi

cat <<'EOF'

Environment setup complete.

For this shell session:
  set -a
  source .env.local
  set +a

For automatic per-directory loading, install direnv and run:
  direnv allow
EOF
