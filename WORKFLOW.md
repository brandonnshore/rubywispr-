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
  command: 'CODEX_HOME="${SYMPHONY_CODEX_HOME}" "${SYMPHONY_CODEX_COMMAND:-/Users/brandonshore/.npm-global/bin/codex}" --config shell_environment_policy.inherit=all --config "model=\"${SYMPHONY_CODEX_MODEL:-gpt-5.5}\"" --config "model_reasoning_effort=\"${SYMPHONY_CODEX_REASONING:-high}\"" --config model_reasoning_summary=\"none\" app-server'
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
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
- Issue ID: {{ issue.id }}
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

## Context Map

Start with a map, not a manual.

Always read:

1. `AGENTS.md`
2. The current Linear issue, existing `## Codex Workpad`, linked PRs, and relevant review comments.

Then load only the smallest repo context needed for this issue:

- Harness, setup, workflow, Linear, or Symphony tickets: read the relevant sections of `docs/HARNESS_ENGINEERING.md` and `docs/SYMPHONY.md`.
- Operator, queue, state, wave dispatch, or review-process tickets: read the relevant sections of `docs/SYMPHONY_OPERATOR.md`.
- Ruby Advisory client-pipeline, scope/spec/ticketing, or reusable-build-system tickets: read the relevant sections of `docs/RUBY_BUILD_PIPELINE.md`.
- Product, privacy, FreeFlow fork/import, or paid-beta direction tickets: read `PRODUCT_BRIEF.md` and `FORK_STRATEGY.md`, then use `rg --files`/`rg` to find any more specific product docs if they exist.
- App implementation tickets after source import: use `rg --files`, package manifests, README files, and local source structure to identify the few relevant files before reading broad docs.

Do not read every planning document "just in case." Missing future docs are not blockers unless this issue explicitly requires them. If product docs conflict, prefer the current Linear issue and the latest explicit user-approved repo decision; document privacy, billing, architecture, or release-risk conflicts in the workpad.

## Context Discipline

- Keep the first turn small: identify the issue scope, inspect git state, update the workpad, and gather targeted context.
- Use `rg`/`rg --files` before opening files. Prefer section reads (`sed -n`) over full-file reads for long docs.
- Do not paste full repo docs, secret values, private env content, or giant command output into Linear, PRs, commits, or workpads.
- If the task appears too broad, split or request a smaller leaf issue instead of expanding context indefinitely.

## Linear Tool Contract

Use Symphony's injected `linear_graphql` dynamic tool for current Linear issue reads and writes. Other MCP/app tools are allowed when the issue genuinely requires them, but `linear_graphql` is the default for issue state, workpads, comments, and queue bookkeeping because it is non-interactive and uses Symphony's tracker auth.

Use the `Issue ID` from this prompt for current-issue queries and mutations. Do not query `issues(filter: {identifier: ...})`; Linear's public GraphQL filters do not support that shape.

Known-good operations:

```graphql
query RubyWhisperIssue($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    description
    url
    state { id name }
    labels { nodes { name } }
    comments(first: 25) {
      nodes { id body createdAt updatedAt }
    }
    relations {
      nodes {
        type
        relatedIssue { id identifier title state { name } url }
      }
    }
    inverseRelations {
      nodes {
        type
        issue { id identifier title state { name } url }
      }
    }
  }
}
```

```graphql
mutation RubyWhisperCreateWorkpad($issueId: String!, $body: String!) {
  commentCreate(input: {issueId: $issueId, body: $body}) {
    success
    comment { id url }
  }
}
```

```graphql
mutation RubyWhisperUpdateWorkpad($commentId: String!, $body: String!) {
  commentUpdate(id: $commentId, input: {body: $body}) {
    success
    comment { id url }
  }
}
```

```graphql
query RubyWhisperStateId($issueId: String!, $stateName: String!) {
  issue(id: $issueId) {
    team {
      states(filter: {name: {eq: $stateName}}, first: 1) {
        nodes { id name }
      }
    }
  }
}
```

```graphql
mutation RubyWhisperUpdateIssueState($issueId: String!, $stateId: String!) {
  issueUpdate(id: $issueId, input: {stateId: $stateId}) {
    success
    issue { id identifier state { name } }
  }
}
```

## Core Rules

1. Work only inside the provided issue workspace.
2. Never print, inspect, summarize, commit, or expose `.env.local` or any private env source.
3. Treat Linear as the control plane and use exactly one persistent issue comment headed `## Codex Workpad`.
4. Keep the workpad current with plan, acceptance criteria, validation, notes, blockers, and current environment stamp.
5. Operate end-to-end unless blocked by missing auth, missing external permissions, or ambiguous product direction that cannot be resolved from repo docs.
6. Prefer small, reviewable PRs. Keep out-of-scope discoveries as separate Linear issues instead of expanding the current task.
7. Do not move work to review until validation evidence is recorded and either a PR is linked or the exact external blocker is documented.
8. Do not merge, deploy production, change live billing, change DNS, change Apple signing credentials, or touch real customer data unless the issue explicitly authorizes that action.

## Dependency Gate

Before moving a `Todo` issue to `In Progress` or editing files, check the issue labels, `## Dependencies` text, existing workpad blockers, and Linear relations/inverse relations returned by `linear_graphql`.

Do not implement the issue if any of these are true:

- It has `needs-breakdown`, `needs-leaf`, `needs-leaf-ticket`, or `split-later`, unless the issue explicitly asks you to create the breakdown/leaf tickets.
- It has `blocked` or `needs-human`, unless the issue explicitly asks you to unblock, clarify, or document the blocker.
- It has `external-dependency` or `high-risk` and the issue does not include an explicit safe, non-production path for the external action.
- Its description or Linear relations say it is blocked by another issue that is not in a terminal state.
- It depends on secrets, credentials, production services, Apple signing, live billing, DNS, customer data, or other human-held access that is not already provided through a safe dev path.

If the dependency gate fails:

1. Do not code, commit, push, or open a PR.
2. Create or update the `## Codex Workpad`.
3. Record the exact blocker in `### Blockers`.
4. Add `### Operator Action` with one of these plain-language messages:
   - `Needs breakdown: you need to break this down into leaf tickets before Symphony can work it.`
   - `Dependency break: this issue is blocked by <issue>; keep it out of Todo until the blocker is Done or explicitly accepted.`
   - `Human gate: this issue needs approval or credentials before work can proceed.`
5. Move the issue out of the active execution lane: use `Backlog` when the team has that state available; otherwise use `In Review` so the operator sees the handoff and Symphony stops retrying.
6. Stop after the workpad update.

Treat Linear `blocked by` / `blocks` relationships as the source of truth for hard sequencing. Labels and description text are secondary safety signals, but they are still binding when the Linear relationship is missing.

Linear relation interpretation for the dependency gate:

- `relations.nodes` with `type: "blocks"` means the current issue blocks the listed downstream issue; this does not block the current issue.
- `inverseRelations.nodes` with `type: "blocks"` means the listed issue blocks the current issue; if that listed issue is not terminal, the current issue must not run.
- `related` is context only and does not block work unless the description says otherwise.

## Status Flow

- `Todo`: move the issue to `In Progress`, create or update the `## Codex Workpad`, then begin work.
- `In Progress`: continue implementation from the current workpad and workspace.
- `Rework`: read all review feedback, update the workpad, address feedback, revalidate, and return to review readiness.
- `In Review` or `Human Review`: do not make code changes unless new feedback explicitly requires rework.
- Terminal states (`Done`, `Closed`, `Cancelled`, `Canceled`, `Duplicate`): do nothing and exit cleanly.

## Queue Policy

- Only issues with `agent-ready` and either `execute-now` or an explicitly active status should be worked.
- Treat `needs-breakdown`, `needs-leaf`, `needs-leaf-ticket`, and `split-later` as not ready for implementation unless the issue is specifically a planning/breakdown task.
- Treat `needs-human`, `blocked`, `external-dependency`, and `high-risk` as reasons to look for explicit unblock instructions before coding.
- Treat unresolved `blocked by` relations as hard stop signs even if the issue is in `Todo`.
- If an issue says `Blocked by:` in the description but the Linear relation is missing, respect the textual blocker and tell the operator to add the Linear relation.
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
9. Move to `In Review` only after acceptance criteria are checked off and validation evidence is recorded. If the implementation is complete but PR handoff is blocked by missing external access, record the exact failed command/tool/error in the workpad and move to `In Review` so the operator can resolve the blocker instead of re-running the same turn.

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

### Operator Action
- None

### Confusions
- None
```

## Completion Bar

- Workpad plan, acceptance criteria, and validation are current and checked off.
- Tests or targeted validation pass for the latest commit.
- No secrets, local runtime artifacts, generated `.tools` content, or private env files are staged.
- PR is pushed and linked, or a blocker is clearly documented with exact missing external requirement.
- If push or PR creation is blocked by network/GitHub auth/permission, stop after documenting the blocker and move to `In Review`; do not keep retrying the same external operation.
- UI-facing work includes browser/manual proof.
- Security/privacy-sensitive work includes a privacy note and confirms no server-side audio/transcript storage.
