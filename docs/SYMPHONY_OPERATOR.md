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
4. Add or remove `execute-now`, `agent-ready`, `symphony`, `needs-breakdown`, `needs-leaf`, `needs-human`, and `blocked` labels.
5. Monitor Symphony dashboard, Linear state, workpads, branches, and PRs.
6. Review validation evidence before moving work forward.
7. Convert repeated failures into better docs, tickets, scripts, or tests.
8. Keep humans in control of production, billing, DNS, Apple signing, and privacy/legal gates.

## Goal Mode Calibration

Treat `/goal` as a constraint workflow, not a "do my ticket" button. The operator should keep the ship on course by repeatedly narrowing context, checking reality, and choosing the next safe move.

Before starting or restarting a long `/goal` run, warm up the session with a short calibration pass:

- explain what RubyWhisper is and which surfaces matter now
- name the user-visible failures that would be bad
- list what has already been tried, accepted, or ruled out
- name the current risk areas, such as privacy, hotkeys, insertion, auth, Stripe, Groq, signing, or release packaging
- ask the model to identify missing context before dispatching workers

Every `/goal` run needs a measurable stop condition. Avoid open-ended goals like "keep going until everything is fixed." Use a count, gate, or queue boundary instead:

- find 20 discrete bugs, then stop and summarize
- review all open PRs, then stop before dispatching the next wave
- complete the current Todo wave, then stop for review
- split one epic into leaf tickets, then stop before implementation
- verify every launch gate once, then report blockers

Choose the run mode explicitly:

- `QA hunt`: reproduce realistic user paths and log discrete issues before fixing
- `Review/merge`: inspect PRs, validate, merge clean work, and send unsafe work back
- `Breakdown`: turn broad specs, audit findings, or parent issues into dependency-aware leaf tickets
- `Implementation wave`: dispatch only prepared, unblocked leaves and monitor workers
- `Final verification`: prove launch gates and classify findings

Use `QA hunt` when the problem space is unclear. In that mode, do not fix while hunting unless Brandon explicitly asks. First produce repro steps, affected surfaces, severity, likely cause, and candidate Linear tickets.

Use `Implementation wave` only after issues are warm, small, and dispatchable. A cold-start implementation run on a broad ticket is expected to waste tokens or drift.

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
- split later: `needs-breakdown`, `needs-leaf`, `needs-leaf-ticket`
- do not dispatch without clarification: `needs-human`, `blocked`, `external-dependency`, `high-risk`

#### Dependency Preflight

Before moving anything into `Todo`, inspect the candidate issue's `## Dependencies`, labels, and Linear relations.

Hard rules:

- Linear `blocked by` / `blocks` relations are the source of truth for sequencing.
- Description text such as `Blocked by: RUB-20` is binding even if the relation was not added yet; convert it to a Linear relation before dispatch.
- `needs-breakdown`, `needs-leaf`, `needs-leaf-ticket`, and `split-later` stay out of `Todo` unless the issue is explicitly a breakdown/planning ticket.
- `blocked` and `needs-human` stay out of `Todo` until the blocker is resolved or Brandon explicitly accepts the risk.
- `external-dependency` and `high-risk` require a named safe path before dispatch.

If a queued issue would break dependency order, move it back to `Backlog`, add or preserve the blocker relation/label, and report:

```text
Dependency break: <issue> is blocked by <blocker>. It should not run until <blocker> is Done or explicitly accepted.
```

If a queued issue is too broad, move it back to `Backlog` and report:

```text
Needs breakdown: you need to break this down into leaf tickets before Symphony can work it.
```

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
8. Groq latency/cost spike, only after the service/env checklist is accepted and the safe dev key path exists
9. Apple signing/notarization/updater spike

After those PRs are reviewed, break down the next backlog into leaf tickets.

## Long-Running Goal Prompt Template

Use this as the starting point for a `/goal` style operator session:

```text
Use the RubyWhisper Symphony operator pattern to continue driving the RubyWhisper Paid Beta Launch project, using Linear as the project tracker and Symphony as the worker runtime.

First calibrate before dispatch. Read docs/SYMPHONY_OPERATOR.md, WORKFLOW.md, the current Linear board, open PRs, recent workpads, and the smallest relevant product docs. Summarize what RubyWhisper is, which surfaces matter in this run, what bad user outcomes to prevent, what has already been tried or ruled out, and what information is missing. Ask Brandon for clarification only if the missing context changes dispatch safety.

Treat `/goal` as a constraint workflow, not a "do my ticket" button. Pick an explicit mode for each wave: QA hunt, Review/merge, Breakdown, Implementation wave, or Final verification. State the mode and measurable stop condition before taking action.

Act as the long-running Symphony orchestrator/operator for the RubyWhisper Paid Beta Launch Linear project. Keep checking project state, select the next safe implementation, audit, breakdown, or verification wave, shape issues before dispatch, dispatch only intentionally prepared Symphony-ready issues, monitor active workers, review workpads and PRs, recover failed or stalled runs, and merge only when the work is validated and safe.

Use Linear as the control plane. Treat `Todo` plus `execute-now` + `agent-ready` + `symphony` as the current dispatch signal. Treat `needs-breakdown`, `needs-leaf`, `needs-leaf-ticket`, `split-later`, `needs-human`, `blocked`, `external-dependency`, and `high-risk` as non-dispatchable unless the current task is explicitly to clarify, split, audit, or unblock that work.

Continue the current sequence:
1. Review and merge or send back all issues currently in `In Review`.
2. Mark clean merged issues `Done`.
3. Keep `RUB-26` blocked until `RUB-20` is accepted and the safe Groq dev-key path exists.
4. Use the FreeFlow audit outputs to decide whether FreeFlow remains the macOS base or whether a fallback comparison issue must run.
5. Break the next product backlog into dependency-aware leaf tickets before dispatching implementation.
6. Dispatch only the next safe wave, with conservative concurrency, and stop expanding the wave when review load becomes the bottleneck.

Default measurable stop condition for this run: finish one complete operator cycle, then report. A complete cycle means review current PRs, update Linear states, resolve dependency breaks or breakdown needs, dispatch at most one safe wave, and monitor until each active worker has either produced a PR, entered Rework/In Review with a clear blocker, or needs Brandon approval.

If the run mode is QA hunt, stop once you have found 20 discrete new issues or exhausted the named surfaces. For each issue, record repro, affected surface, severity, likely cause, proposed fix direction, and whether it should become a Linear leaf ticket. Hunt first; do not fix until the hunt summary is complete unless Brandon explicitly changes the mode.

Before dispatching or continuing any issue, run a dependency preflight: check Linear `blocked by` / `blocks` relations, `## Dependencies` text, active labels, and workpad blockers. If a Todo issue would violate a dependency, move it back to Backlog with the blocker relation/label and tell Brandon `Dependency break: <issue> is blocked by <blocker>.` If a Todo issue is too broad or labeled `needs-breakdown`, `needs-leaf`, `needs-leaf-ticket`, or `split-later`, move it back to Backlog and tell Brandon `Needs breakdown: you need to break this down into leaf tickets before Symphony can work it.`

When a broad backlog item, parent issue, spec section, or audit finding needs breakdown, use the `linear-tickets` skill pattern: create leaf tickets with Goal, Context, Scope, Out of Scope, Acceptance Criteria, Validation, Dependencies, Agent Notes, milestone, labels, queue state, and Linear `blocked by` / `blocks` relations. Do not place newly created implementation leaves into `Todo` until their prerequisites are Done or explicitly accepted.

When a worker stalls or fails, classify the failure as one of: missing auth/tool, dependency break, needs breakdown, unclear ticket, repo harness missing, real build/test failure, external service blocker, or agent drift. Fix the board, issue, docs, or harness when possible; otherwise leave a clear workpad note and hand the exact blocker to Brandon.

For every PR, verify the issue scope, inspect changed files, confirm validation evidence, check for secrets/runtime artifacts, and require privacy notes for any auth, billing, transcription, cleanup, logging, storage, or provider work.

For frontend or user-facing web PRs, start the app locally, use browser automation or Playwright to navigate affected routes, exercise every affected page, button, link, menu, modal, form, responsive state, and backend-wired behavior, check console/errors, and record sanitized validation evidence before approval.

For macOS app PRs, require the relevant build command and manual QA notes for permissions, hotkeys, recording island behavior, focus behavior, transcription, cleanup, insertion, clipboard fallback, privacy boundaries, and Recent Wisprs when touched.

During final verification, ensure 100% coverage across paid-beta launch surfaces and classify every issue found as:
1. broken existing behavior to fix,
2. missing spec/design parity to implement,
3. new backend/product scope requiring Brandon approval,
4. launch blocker,
5. acceptable beta limitation.

Do not call the paid beta ready until every launch blocker is Done or explicitly accepted, and the release gate verifies auth, Stripe, Supabase, Groq, privacy boundaries, admin view, signing/notarization/update path, website checkout, and macOS dictation path.

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
