# RubyWhisper Implementation Agent Guide

Use this guide with `AGENTS.md`, the current Linear issue, and the smallest relevant source docs for the task. The current issue and latest approved repo decision win over older planning text.

## Always

- Run `scripts/setup-chat-env.sh` at the start of every new Codex chat or worktree.
- Keep Linear as the control plane and maintain one persistent `## Codex Workpad` comment with plan, acceptance criteria, validation, notes, blockers, and the current environment stamp.
- Use `rg` or `rg --files` before opening broad docs, then read the smallest relevant sections.
- Keep implementation changes scoped to the current issue and preserve the proposed ADR boundaries in `DECISION_LOG.md`.
- Route transcription and cleanup through the RubyWhisper backend so provider keys stay server-side.
- Store product metadata only on the server.
- Keep Recent Wisprs, personal dictionary content, and other transcript-like user content local-only unless an approved ADR changes that posture.
- Make privacy-sensitive behavior explicit in review notes and PR descriptions.
- Include acceptance criteria, validation evidence, required tests, and security/privacy notes in implementation PRs.

## Ask first

- Importing FreeFlow permanently after audit.
- Choosing a fallback app base.
- Changing the provider, cleanup model, subscription model, auth provider, database provider, or auto-update provider from the proposed direction.
- Enabling live Stripe mode or changing billing behavior that affects real customers.
- Using production Groq, Clerk, Supabase, Stripe, Apple, Sentry, or equivalent credentials.
- Changing privacy posture, retention periods, telemetry scope, crash-reporting payloads, or local/server storage boundaries.
- Adding server-side audio storage, transcript storage, clipboard storage, surrounding app text storage, meeting transcription, or customer-data access.
- Creating additional live Linear issues when the current issue says they are out of scope.

## Never

- Never inspect, print, summarize, or commit `.env.local` or any private env source file.
- Never commit secrets, local runtime artifacts, generated `.tools` content, or private environment files.
- Never put Groq, Stripe, Supabase service-role, Clerk secret, Apple signing, Sentry auth, or equivalent private keys into desktop app code.
- Never send clipboard contents to the backend.
- Never persist audio, raw transcripts, cleaned transcripts, clipboard contents, surrounding app text, or Recent Wisprs on the server.
- Never log magic links, auth tokens, provider keys, payment data, transcripts, clipboard text, or surrounding app content.
- Never merge, deploy production, change live billing, change DNS, change Apple signing credentials, or touch real customer data unless the issue explicitly authorizes it.

## Privacy Rules

- Treat audio, transcripts, cleaned text, clipboard contents, surrounding app text, and Recent Wisprs as private user content.
- Backend services may handle audio/transcript data transiently for the requested dictation flow, but must not store it.
- Supabase is for product metadata, usage/account state, admin roles, and request metadata only.
- Stripe is the billing source of truth; RubyWhisper must not store card data.
- Clerk sessions must be verified server-side on protected routes.
- Stripe webhooks must be signature-verified.
- Crash reporting must be privacy-safe: disable screenshots, transcript payloads, clipboard text, surrounding app content, and other private content capture.
- Privacy copy in onboarding, settings, website, and support surfaces must match the actual architecture.

## Implementation PR Requirements

Every implementation PR should include:

- Linked Linear issue.
- Acceptance criteria and whether each item is complete.
- Validation commands run, with a concise pass/fail summary.
- Required tests added or updated, or a clear reason no tests apply.
- Security/privacy notes that call out data flow, storage, credentials, logging, telemetry, and user-content handling.
- File/module boundaries touched.
- Known blockers or follow-up work that remains out of scope.

## Validation Expectations

- For docs/scripts only: run syntax checks where applicable and the issue's targeted `rg` or dry-run commands.
- For web/backend work: run install/build/lint/typecheck/test paths available in the repo, plus targeted endpoint or webhook validation.
- For macOS work: run the relevant Xcode/Swift build or test command once the FreeFlow import records the repo-local project path.
- For UI-facing work: capture browser, screenshot, video, or written manual proof.
- Before handoff, confirm no private env files, secret values, runtime artifacts, or generated tool output are staged.
