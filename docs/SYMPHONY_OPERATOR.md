# Symphony Operator Runbook

The operator is the human/Codex session above Symphony. Symphony keeps workers alive; the operator keeps the project sane.

Connor's pattern maps well to RubyWhisper:

```text
Use a long-running goal/operator session to keep checking Linear, prepare the next safe wave, dispatch only ready tickets, monitor active workers, review workpads and PRs, recover failed runs, and merge or hand off only when validation is real.
```

## Operator Responsibilities

1. Read project state.
2. Choose the next safe wave.
3. Shape issues before dispatch.
4. Add or remove `execute-now`, `agent-ready`, `symphony`, `needs-breakdown`, `needs-human`, and `blocked` labels.
5. Monitor Symphony dashboard, Linear state, workpads, branches, and PRs.
6. Review validation evidence before moving work forward.
7. Convert repeated failures into better docs, tickets, scripts, or tests.
8. Keep humans in control of production, billing, DNS, Apple signing, and privacy/legal gates.

## Daily Operating Loop

### 1. Start

```bash
scripts/setup-chat-env.sh
scripts/run-symphony.sh --dry-run
scripts/run-symphony.sh
```

Open the dashboard:

```text
http://localhost:4007
```

### 2. Inspect Board

Check:

- `Todo`: only current wave, unblocked, agent-ready.
- `In Progress`: workers currently active.
- `Rework`: review feedback needing agent action, if that state exists in the team workflow.
- `In Review` / `Human Review`: PRs/artifacts needing human/operator review.
- `Backlog`: future work and breakdown candidates.
- Current RubyWhisper mapping: blocked work stays in `Backlog` with the `blocked` label, and handoff uses `In Review`.

### 3. Dispatch Wave

A ticket is dispatchable only when:

- it has one clear outcome
- acceptance criteria are testable
- validation command or manual proof path is named
- dependencies are linked
- likely files/areas are identified when known
- secrets or external permissions are not required, or the issue explicitly says how to handle them
- it is safe for a worker to run without asking follow-up questions

Current labels:

- dispatch now: `execute-now`, `agent-ready`, `symphony`
- split later: `needs-breakdown`
- do not dispatch without clarification: `needs-human`, `blocked`, `external-dependency`, `high-risk`

### 4. Monitor Workers

Watch for:

- no workpad update after a reasonable interval
- repeated setup failure
- missing env/auth/tool blocker
- PR created without validation
- branch not pushed
- issue moved too early
- scope drift
- conflicting edits across PRs

When a worker stalls:

1. Read the workpad.
2. Read the latest logs.
3. Classify the failure:
   - missing auth/tool
   - unclear ticket
   - repo harness missing
   - real bug/test failure
   - agent drift
4. Fix the harness/ticket when possible.
5. Move the issue to `Rework` or `In Review` / `Human Review` with the exact blocker.

### 5. Review PRs

For each PR:

- read the issue and workpad
- inspect changed files
- confirm scope matches the issue
- run targeted validation locally if needed
- verify no private env, `.tools`, logs, or generated runtime artifacts are staged
- check no privacy boundary was weakened
- check UI work with browser/manual evidence
- leave review feedback or move the issue forward

### 6. Merge Gate

Do not merge until:

- PR is linked to Linear
- acceptance criteria are complete
- validation evidence is current
- CI/checks are green or explicitly not applicable
- security/privacy notes are acceptable
- human approval exists for risky work

Production deploys, live Stripe changes, DNS, and Apple notarization remain explicit human gates.

## RubyWhisper First Run

Only run the harness wave first:

1. repo command contract
2. ADR log and implementation agent guide
3. service/secret/environment setup checklist
4. Linear project metadata/import policy
5. FreeFlow build reliability audit
6. FreeFlow hotkey/insertion/island/privacy audit
7. FreeFlow license/rebrand audit
8. Groq latency/cost spike
9. Apple signing/notarization/updater spike

After those PRs are reviewed, break down the next backlog into leaf tickets.

## Long-Running Goal Prompt Template

Use this as the starting point for a `/goal` style operator session:

```text
Act as the Symphony operator for the RubyWhisper Paid Beta Launch Linear project.

Keep checking project state, select the next safe implementation or verification wave, shape issues before dispatch, dispatch only intentionally prepared Symphony-ready issues, monitor active workers, review workpads and PRs, recover failed or stalled runs, and move work forward only when validation is safe.

Use Linear as the project tracker and Symphony as the worker runtime. Treat `execute-now` + `agent-ready` + `symphony` as the current dispatch signal. Treat `needs-breakdown`, `needs-human`, `blocked`, `external-dependency`, and `high-risk` as non-dispatchable unless the current task is explicitly to clarify or split that work.

For every PR, verify the issue scope, inspect changed files, confirm validation evidence, check for secrets/runtime artifacts, and require privacy notes for any auth, billing, transcription, cleanup, logging, storage, or provider work.

For frontend or user-facing web PRs, start the app locally, use browser automation or Playwright to navigate affected routes, exercise affected buttons, links, menus, modals, forms, responsive states, and backend-wired behavior, check console/errors, and record sanitized validation evidence before approval.

For macOS app PRs, require the relevant build command and manual QA notes for hotkeys, recording island behavior, permissions, transcription, cleanup, insertion, clipboard fallback, and recent whispers when touched.

Do not call the paid beta ready until the release gate verifies auth, Stripe, Supabase, Groq, privacy boundaries, admin view, signing/notarization/update path, website checkout, and macOS dictation path.

Keep secrets, credentials, env values, audio, transcripts, clipboard content, private user data, and sensitive screenshots out of Linear comments, PR bodies, logs, workpads, and committed files.
```

## Final Verification Classification

During final launch verification, classify every finding as:

1. broken existing behavior to fix
2. missing spec/design parity to implement
3. new product/backend scope requiring human approval
4. launch blocker
5. acceptable beta limitation

Do not call the project complete until every launch blocker is fixed or explicitly accepted by Brandon.
