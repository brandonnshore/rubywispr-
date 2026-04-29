# RubyWhisper Agent Startup

At the start of every new Codex chat or git worktree in this repo, run:

```bash
scripts/setup-chat-env.sh
```

Rules:

- Never print, inspect, summarize, or commit `.env.local` or any private env source file.
- Keep secrets outside git. The default private source is `~/.config/rubywhisper/rubywhisper.env`.
- Use `.env.example` only as a placeholder/template.
- If a command needs environment variables in the current shell, run:

```bash
set -a
source .env.local
set +a
```

- If `direnv` is installed, `direnv allow` may be used once per worktree to auto-load `.env.local`.
- For new worktrees, prefer:

```bash
scripts/new-worktree.sh <target-path> <branch-name>
```

