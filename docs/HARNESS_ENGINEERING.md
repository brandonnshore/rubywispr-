# RubyWhisper Harness Engineering

RubyWhisper follows the harness-engineering pattern from OpenAI's Codex/Symphony work: humans steer the system, while agents operate inside a clear, legible, mechanically verifiable repo.

## What This Means Here

- `AGENTS.md` is a map, not a manual.
- Root docs are sources of truth for product direction, implementation plan, infrastructure, and fork/import strategy.
- `WORKFLOW.md` is the Symphony worker contract for autonomous Linear-driven work.
- Scripts make setup repeatable instead of relying on memory.
- Every autonomous task needs an explicit workpad, acceptance criteria, and validation evidence.
- Repeated review feedback should become docs, tests, scripts, or lint rules.

## Current Repo State

RubyWhisper is still a planning/fork harness. The current repo contains planning docs and setup scripts, but product source has not been imported yet.

The harness includes:

- `PRODUCT_BRIEF.md`
- `IMPLEMENTATION_PLAN.md`
- `TECHNICAL_INFRASTRUCTURE.md`
- `TECHNICAL_SPEC.md`
- `WEB_DESIGN_SPEC.md`
- `FORK_STRATEGY.md`
- `LINEAR_ISSUE_DRAFT.md`
- `AGENTS.md`
- `WORKFLOW.md`
- `docs/SYMPHONY.md`
- `docs/SYMPHONY_OPERATOR.md`
- `docs/RUBY_BUILD_PIPELINE.md`
- `scripts/setup-chat-env.sh`
- `scripts/setup-symphony.sh`
- `scripts/run-symphony.sh`

Autonomous implementation should stay conservative until the FreeFlow audit/import decision is complete.

## Agent Legibility Rules

Agents do better when important knowledge lives where they can inspect it. Put durable project knowledge in the repo:

- product principles and non-goals
- command contracts
- architecture decisions
- privacy/security boundaries
- setup and release runbooks
- validation procedures
- common failure fixes
- review expectations

Do not rely on chat memory for rules that should shape future PRs.

## Symphony Readiness Checklist

- `LINEAR_API_KEY` exists in private env, never in git.
- `LINEAR_PROJECT_SLUG` points to the Linear project slug ID Symphony should poll.
- `SYMPHONY_SOURCE_REPO_URL` points to the clone URL agents should use for per-issue workspaces.
- `SYMPHONY_WORKSPACE_ROOT` points outside the repo or to a gitignored local directory.
- `scripts/setup-symphony.sh` has successfully cloned and built the OpenAI reference implementation.
- `scripts/run-symphony.sh --dry-run` passes.
- Linear has active states used by `WORKFLOW.md`: `Todo`, `In Progress`, and `Rework` if that state exists in the team workflow.
- Current RubyWhisper Linear state mapping uses `Backlog` plus the `blocked` label for blocked work, and `In Review` for human/operator handoff.
- Linear has a review handoff state such as `In Review` or `Human Review`.
- Only unblocked, leaf-level, agent-ready tickets are in `Todo`.
- Hard dependencies are represented with Linear `blocked by` / `blocks` relations, not only labels or description text.
- Tickets labeled `needs-breakdown`, `needs-leaf`, `needs-leaf-ticket`, `blocked`, or `needs-human` are outside the Symphony dispatch lane unless the ticket is explicitly a clarification/breakdown task.

## Verification Ladder

Use the lowest validation level that genuinely proves the change:

- Docs only: link/check references and inspect rendered Markdown if needed.
- Shell scripts: `bash -n` plus a dry-run or help path when available.
- Repo setup: run bootstrap scripts and verify expected files/directories are present without printing secrets.
- Web app: run root npm workspace commands `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`; use `npm run dev` for local browser validation of affected routes.
- macOS app: run `make -C apps/macos clean all CODESIGN_IDENTITY=-` for the imported Debug/ad hoc build gate, then validate the affected user path manually when the change is UI- or runtime-facing.
- PR CI: GitHub should enforce `Web CI / npm validation` for root web/backend changes and `macOS CI / Debug ad hoc build` for macOS app changes.
- CI secret boundary: workflows must not expose provider, production, Apple signing/notarization, billing, database, release packaging, or private env secrets.
- UI polish: include screenshot or video proof when possible.
- Release/package work: verify signing/notarization assumptions separately from app behavior.
- Security/privacy work: prove no forbidden data is stored or logged.

## Guardrail Backlog

These investments make Symphony safer and more useful:

- Import/audit FreeFlow and add deterministic build commands.
- Add a repo-level `scripts/check.sh` that runs the right validation for the current source layout.
- Add PR template with validation, privacy, and manual QA sections.
- Add a staged-secret/local-artifact guard.
- Add app-launch and UI smoke-test scripts after the Mac app exists.
- Add browser validation scripts for the Next.js app after it exists.
- Add daily or weekly cleanup tickets to remove drift and update docs.

## Golden Principles

- Privacy boundaries are architecture, not copy.
- Do not store audio or transcript text server-side.
- Prefer boring, inspectable dependencies and typed/validated boundaries.
- Keep issue scope small enough to review.
- If an agent fails, patch the harness or ticket shape before retrying broadly.
- Use humans for product taste, production gates, live billing, legal/privacy copy, and high-risk architecture decisions.
