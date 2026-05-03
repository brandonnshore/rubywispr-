# Symphony Setup

Symphony is the RubyWhisper worker runtime. It polls Linear, creates one isolated workspace per eligible issue, and runs Codex app-server against that issue using this repo's `WORKFLOW.md`.

The operating model is:

```text
Ruby operator shapes the board -> Linear Todo issues become eligible -> Symphony starts workers -> workers open PRs and workpads -> operator reviews and dispatches the next wave
```

## Why This Setup

Research notes:

- OpenAI describes Symphony as turning a project-management board like Linear into the control plane for coding agents.
- The public spec defines Symphony as a scheduler/runner plus tracker reader; ticket updates and PR behavior live in the repo-owned workflow prompt and agent tools.
- Symphony is an engineering preview for trusted environments, not a polished multi-tenant product.
- It works best after harness engineering: repo docs, build commands, validation scripts, review gates, and clear issue states.
- The strongest public usage pattern is not "let everything run." It is "prepare a safe wave, let workers run, review proof, patch the harness, then dispatch the next wave."

## One-Time Private Env

Put these values in the private RubyWhisper env source, not in git:

```bash
LINEAR_API_KEY=...
LINEAR_PROJECT_SLUG=rubywhisper-paid-beta-launch-caaab48c6aa9
SYMPHONY_SOURCE_REPO_URL=https://github.com/brandonnshore/rubywispr-.git
SYMPHONY_SOURCE_REF=
SYMPHONY_WORKSPACE_ROOT=~/code/rubywhisper-symphony-workspaces
SYMPHONY_CODEX_HOME=.tools/codex-symphony-home
SYMPHONY_PORT=4007
```

`LINEAR_PROJECT_SLUG` and `SYMPHONY_WORKSPACE_ROOT` have RubyWhisper defaults in `scripts/run-symphony.sh`, but keeping them in private env makes the runtime explicit. `SYMPHONY_SOURCE_REF` is optional; when blank, the runner uses the current branch so control-test workers clone the same pushed branch you are operating from.

Optional:

```bash
SYMPHONY_CODEX_COMMAND=/Users/brandonshore/.npm-global/bin/codex
SYMPHONY_CODEX_MODEL=gpt-5.5
SYMPHONY_CODEX_REASONING=high
SYMPHONY_REFERENCE_DIR=.tools/symphony
SYMPHONY_LOGS_ROOT=.tools/symphony-logs
SYMPHONY_REPO_URL=https://github.com/openai/symphony.git
```

Never paste or print secret values into chat, Linear, PRs, logs, or docs.

`SYMPHONY_CODEX_HOME` is a dedicated worker home for sessions and runtime files. The runner links the existing Codex auth, config, plugins, skills, and helper binaries into that home without reading secret contents. Workers keep access to configured MCP/app tools, while RubyWhisper issue bookkeeping should still use Symphony's injected `linear_graphql` tool.

Workers run with Codex `workspaceWrite` turn sandboxing plus `networkAccess: true`. The local runner expands the Symphony workspace root into `writableRoots` so normal Git metadata writes, Git fetch/push, GitHub PR creation, and connected MCP/app calls can work inside issue workspaces.

## Local Setup

Build or update the OpenAI reference implementation:

```bash
scripts/setup-symphony.sh
```

Validate environment and generated workflow without starting workers:

```bash
scripts/run-symphony.sh --dry-run
```

Start Symphony:

```bash
scripts/run-symphony.sh
```

Default dashboard:

```text
http://localhost:4007
```

## Files

- `WORKFLOW.md`: versioned worker contract and runtime config.
- `scripts/setup-symphony.sh`: clones/builds `openai/symphony` under `.tools/symphony`.
- `scripts/run-symphony.sh`: loads private env, generates `.tools/WORKFLOW.runtime.md`, and starts Symphony.
- `docs/HARNESS_ENGINEERING.md`: repo harness rules for agent-safe work.
- `docs/SYMPHONY_OPERATOR.md`: human/operator runbook for shaping and supervising waves.
- `.tools/`: gitignored runtime directory for the reference implementation, generated workflow, and logs.

## Worker Context Policy

Workers should receive a map first, then load details only when the issue requires them. `WORKFLOW.md` always points workers to `AGENTS.md` and the Linear issue/workpad, then routes them to the smallest relevant doc:

- harness/setup/Symphony work: `docs/HARNESS_ENGINEERING.md` and `docs/SYMPHONY.md`
- operator/queue/review work: `docs/SYMPHONY_OPERATOR.md`
- reusable Ruby build pipeline work: `docs/RUBY_BUILD_PIPELINE.md`
- product/fork/privacy work: `PRODUCT_BRIEF.md`, `FORK_STRATEGY.md`, and targeted docs discovered with `rg`

Do not expand this into a mandatory read-everything list. If workers stall or burn excessive context, shrink the entry prompt or split the Linear ticket before retrying broadly.

## Linear Contract

Active states in `WORKFLOW.md`:

- `Todo`
- `In Progress`
- `Rework`

Handoff state:

- `In Review` in the current RubyWhisper Linear workflow.
- `Human Review` in older docs or imported projects; treat it as the same handoff concept if that state exists.

Terminal states:

- `Done`
- `Closed`
- `Cancelled`
- `Canceled`
- `Duplicate`

Current launch policy:

- `execute-now`: safe to dispatch in the current wave.
- `agent-ready`: sufficiently specified for an agent.
- `symphony`: intended for Symphony.
- `needs-breakdown`: useful backlog, but later split into smaller leaf issues.
- `needs-human`: human decision needed before implementation.
- `blocked`: blocked by dependency, auth, vendor, unclear product call, or missing repo harness.

## Concurrency Policy

Start conservative:

- global workers: `2`
- Todo workers: `1`
- Rework workers: `1`

Raise concurrency only after:

- first wave produced reviewable PRs
- workers consistently update workpads
- validation commands exist
- PR review load is manageable
- no repeated scope drift is happening

## Safety Boundaries

Agents may:

- edit repo files for their issue
- run local validation
- create commits and PRs
- update a single Linear workpad
- file follow-up issues when scope expands

Agents may not silently:

- expose env files or secrets
- modify billing live mode
- deploy production
- change DNS
- change Apple signing/notarization credentials
- merge PRs without explicit issue state or human approval
- store audio or transcripts server-side

## First RubyWhisper Run

Run only the harness/setup tickets first:

- repo command contract
- ADR and agent guide
- service/env checklist
- Linear metadata/import policy
- FreeFlow audits
- Groq latency/cost spike
- Apple signing/notarization/updater spike

After that wave, review the artifacts and split the next backlog into leaves before enabling more product work.

## Troubleshooting

- Missing `LINEAR_API_KEY`: add it to the private env source, then rerun `scripts/setup-chat-env.sh --refresh` if needed.
- Missing `LINEAR_PROJECT_SLUG`: use the Linear project slug ID, not the display name.
- Missing `mise`: install `mise` before building the Elixir reference implementation.
- Missing `codex`: install/authenticate Codex before running workers.
- Workers cannot clone: verify `SYMPHONY_SOURCE_REPO_URL` and GitHub auth.
- Workers fail instantly with zero tokens: verify `SYMPHONY_CODEX_COMMAND` points to a Codex CLI new enough for `gpt-5.5`; Homebrew `codex-cli 0.113.0` rejects `gpt-5.5`.
- Workers fail with `unknown variant reject`: use string-form `approval_policy: never`; newer Codex app-server schemas no longer accept Symphony's older object-form `reject` policy.
- Workers stall on `mcpServer/elicitation/request`: rerun `scripts/setup-symphony.sh` and confirm the Codex 0.128 MCP elicitation compatibility patch applies. The patch declines non-interactive MCP input prompts instead of leaving the turn wedged.
- Workers stall on missing external authorization: update the workpad with the exact missing auth/tool/action and move the issue to `In Review` or the project's equivalent human review state so Symphony does not keep retrying the same blocker.

## Sources

- OpenAI Symphony post: https://openai.com/index/open-source-codex-orchestration-symphony/
- OpenAI Symphony repo: https://github.com/openai/symphony
- Symphony spec: https://github.com/openai/symphony/blob/main/SPEC.md
- Harness engineering: https://openai.com/index/harness-engineering/
