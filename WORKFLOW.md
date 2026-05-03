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
  command: 'CODEX_HOME="${SYMPHONY_CODEX_HOME}" "${SYMPHONY_CODEX_COMMAND:-/Users/brandonshore/.npm-global/bin/codex}" --config shell_environment_policy.inherit=all --config mcp_servers={} --config "model=\"${SYMPHONY_CODEX_MODEL:-gpt-5.5}\"" --config "model_reasoning_effort=\"${SYMPHONY_CODEX_REASONING:-high}\"" --config model_reasoning_summary=\"none\" app-server'
  approval_policy: never
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

Use Symphony's injected `linear_graphql` dynamic tool for Linear reads and writes. Do not use interactive Codex app connectors or MCP tools for Linear unless the issue explicitly says they are configured for this run.

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
