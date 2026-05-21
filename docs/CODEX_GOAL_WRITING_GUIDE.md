# Codex Goal Writing Guide

Source: OpenAI Cookbook, "Using Goals in Codex" (May 9, 2026)
https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex

This repo uses `/goal` for work that needs a persistent objective, multiple
iterations, and evidence-based completion. Use a normal prompt for one-off
edits, simple questions, small reviews, or tasks without a clear finish line.

## Goal Contract

A strong `/goal` should define six things:

1. Outcome: what must be true when the work is done.
2. Verification surface: tests, build commands, benchmarks, screenshots,
   Computer Use evidence, docs, logs, or artifacts that prove it.
3. Constraints: behavior, privacy, UX, APIs, data, and workflows that must not
   regress.
4. Boundaries: allowed files, repos, tools, environments, and data sources.
5. Iteration policy: how Codex should decide the next experiment after each
   test or finding.
6. Blocked stop condition: when to stop and report the evidence, blocker, and
   exact input needed.

## Template

```text
/goal <desired end state>, verified by <specific evidence>, while preserving
<constraints>. Use <allowed inputs/tools/boundaries>. Between iterations,
<how to choose the next best action and what to record>. If blocked or no valid
paths remain, stop with <attempted paths, evidence gathered, blocker, and next
input needed>.
```

## RubyWhisper Defaults

Every RubyWhisper goal should start with:

```text
Run scripts/setup-chat-env.sh first. Do not inspect, print, summarize, or commit
.env.local or private env files.
```

For macOS app work, usually require:

```text
Use /Users/brandonshore/rubywispr- as the real main checkout unless there is a
clear reason not to. Use the actual built macOS app plus Computer Use for UI
verification, not only unit tests. Run make all and make test in apps/macos.
```

For web/backend work, usually require:

```text
Run the relevant web typecheck/tests. Keep secrets server-side. Add tests for
production guardrails when adding any dev/test override.
```

## Quality Bar

Good goals are narrow enough to audit but broad enough for Codex to choose the
next action. Avoid goals like "make it better", "fix the app", or "redesign the
UI" unless they also name the target states, evidence, non-goals, and stop
conditions.

Completion must be evidence-based. Codex should only mark a goal complete after
checking the stated files, tests, logs, screenshots, benchmarks, generated
artifacts, or other concrete evidence. Budget exhaustion, plausible progress, or
a nice-looking diff is not completion.

## UI/UX Goal Additions

For RubyWhisper visual polish, include:

- Reference capture: what product/state screenshots or videos are being used.
- State inventory: idle, recording, finalizing, inserting, success, no speech,
  fallback/error, blocked permissions/account states.
- Evidence: before/after screenshots or Computer Use observations across the
  target states.
- Constraints: no core transcription behavior change unless explicitly scoped.
- Accessibility: readable text, no clipped controls, sensible focus/keyboard
  behavior, no secrets/private transcripts in screenshots or reports.

## Dev Account / Billing Goal Additions

For trial/free/paid testing, include:

- No production bypasses.
- Dev-only personas or test fixtures must be impossible to enable accidentally
  in production.
- Production guardrail tests are required.
- The app must visibly label dev/test account state when active.
- Verify trial active, trial expired, free active, free quota exhausted, paid
  active, payment failed, and signed-out states where applicable.
