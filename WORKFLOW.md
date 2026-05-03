---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "$LINEAR_PROJECT_SLUG"
  active_states:
    - Todo
    - In Progress
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 30000
workspace:
  root: $SYMPHONY_WORKSPACE_ROOT
hooks:
  timeout_ms: 120000
  after_create: |
    : "${SYMPHONY_SOURCE_REPO_URL:=https://github.com/brandonnshore/rubywispr-.git}"
    if [[ -n "${SYMPHONY_SOURCE_REF:-}" ]]; then
      git clone --branch "$SYMPHONY_SOURCE_REF" --single-branch "$SYMPHONY_SOURCE_REPO_URL" .
    else
      git clone "$SYMPHONY_SOURCE_REPO_URL" .
    fi
    scripts/setup-chat-env.sh
  before_run: |
    scripts/setup-chat-env.sh
agent:
  max_concurrent_agents: 2
  max_turns: 20
  max_retry_backoff_ms: 300000
  max_concurrent_agents_by_state:
    todo: 1
    in progress: 2
    rework: 1
codex:
  command: 'codex --config shell_environment_policy.inherit=all --config "model=\"${SYMPHONY_CODEX_MODEL:-gpt-5.2}\"" --config "model_reasoning_effort=\"${SYMPHONY_CODEX_REASONING:-high}\"" app-server'
  approval_policy:
    reject:
      sandbox_approval: true
      rules: true
      mcp_elicitations: true
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
  turn_timeout_ms: 3600000
  read_timeout_ms: 5000
  stall_timeout_ms: 300000
---
You are working autonomously on Linear issue `{{ issue.identifier }}` for RubyWhisper.

{% if attempt %}
Continuation context:
- This is retry or continuation attempt #{{ attempt }}.
- Resume from the existing workspace state. Do not restart analysis unless the issue or branch state changed.
{% endif %}

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}
- Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

## Source Of Truth

Read these before changing files:

1. `AGENTS.md`
2. `docs/HARNESS_ENGINEERING.md`
3. `docs/SYMPHONY.md`
4. `docs/SYMPHONY_OPERATOR.md`
5. `docs/RUBY_BUILD_PIPELINE.md`
6. `PRODUCT_BRIEF.md`
7. `IMPLEMENTATION_PLAN.md`
8. `TECHNICAL_INFRASTRUCTURE.md`
9. `TECHNICAL_SPEC.md`
10. `WEB_DESIGN_SPEC.md`
11. `FORK_STRATEGY.md`

If product docs conflict, prefer the latest explicit user-approved decision in `IMPLEMENTATION_PLAN.md`, `TECHNICAL_INFRASTRUCTURE.md`, `TECHNICAL_SPEC.md`, and the current Linear issue. If the conflict affects privacy, billing, architecture, or release risk, document it in the workpad and stop only when a reasonable safe choice cannot be made.

## Core Rules

1. Work only inside the provided issue workspace.
2. Never print, inspect, summarize, commit, or expose `.env.local` or any private env source.
3. Treat Linear as the control plane and use exactly one persistent issue comment headed `## Codex Workpad`.
4. Keep the workpad current with plan, acceptance criteria, validation, notes, blockers, and current environment stamp.
5. Operate end-to-end unless blocked by missing auth, missing external permissions, or ambiguous product direction that cannot be resolved from repo docs.
6. Prefer small, reviewable PRs. Keep out-of-scope discoveries as separate Linear issues instead of expanding the current task.
7. Do not move work to human review until validation evidence is recorded.
8. Do not merge, deploy production, change live billing, change DNS, change Apple signing credentials, or touch real customer data unless the issue explicitly authorizes that action.

## Status Flow

- `Todo`: move the issue to `In Progress`, create or update the `## Codex Workpad`, then begin work.
- `In Progress`: continue implementation from the current workpad and workspace.
- `Rework`: read all review feedback, update the workpad, address feedback, revalidate, and return to review readiness.
- `Human Review`: do not make code changes unless new feedback explicitly requires rework.
- Terminal states (`Done`, `Closed`, `Cancelled`, `Canceled`, `Duplicate`): do nothing and exit cleanly.

## Queue Policy

- Only issues with `agent-ready` and either `execute-now` or an explicitly active status should be worked.
- Treat `needs-breakdown` and `split-later` as not ready for implementation unless the issue is specifically a planning/breakdown task.
- Treat `needs-human`, `blocked`, `external-dependency`, and `high-risk` as reasons to look for explicit unblock instructions before coding.
- If a task discovers meaningful follow-up work, create or request a separate Backlog issue instead of widening scope.

## Execution Protocol

1. Confirm branch, `HEAD`, and git cleanliness.
2. Read the issue, existing workpad, linked PRs, and relevant review comments.
3. Create or refresh the workpad with:
   - plan
   - acceptance criteria
   - validation checklist
   - current environment stamp in the form `host:path@sha`
4. Reproduce or establish the current signal before changing behavior. For docs or setup, the signal can be command output or missing-file observation.
5. Implement the smallest coherent change that satisfies the issue.
6. Run validation appropriate to scope:
   - docs/scripts only: `bash -n` plus targeted dry-runs/help paths when possible
   - web app present: install/build/lint/typecheck/test and browser validation for user-facing changes
   - macOS app present: relevant Xcode/Swift build/test plus targeted runtime checks
   - UI-facing work: record screenshot, video, or written browser/manual proof in the workpad/PR
7. Commit and push when work is coherent, with no private env files or runtime artifacts staged.
8. Open or update a PR, link it to the Linear issue, and add concise validation summary.
9. Move to `Human Review` only after acceptance criteria are checked off and validation evidence is recorded.

## Workpad Template

Use this structure for the persistent Linear issue comment:

```text
## Codex Workpad

<host>:<absolute-workspace-path>@<short-sha>

### Plan
- [ ] ...

### Acceptance Criteria
- [ ] ...

### Validation
- [ ] ...

### Notes
- ...

### Blockers
- None

### Confusions
- None
```

## Completion Bar

- Workpad plan, acceptance criteria, and validation are current and checked off.
- Tests or targeted validation pass for the latest commit.
- No secrets, local runtime artifacts, generated `.tools` content, or private env files are staged.
- PR is pushed and linked, or a blocker is clearly documented with exact missing external requirement.
- UI-facing work includes browser/manual proof.
- Security/privacy-sensitive work includes a privacy note and confirms no server-side audio/transcript storage.
