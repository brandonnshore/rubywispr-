# RUB-317 Paid Beta Human-Gate Launch Handoff

Status: source-safe handoff prepared for human launch-gate review.
Date: 2026-05-06.

This document maps the remaining paid beta launch gates to the exact sanitized
evidence Brandon needs to provide, approve, or accept. It does not approve
launch, does not close `RUB-80` / `RW-107`, and does not authorize autonomous
production, provider, billing, DNS, Apple signing, notarization, publishing, or
clean-Mac actions.

`RUB-80` / `RW-107` remains blocked until every gate below is either `Done` in
Linear with acceptable evidence or explicitly accepted by Brandon as a beta
limitation.

## Evidence Rules

Allowed source-safe evidence:

- Issue IDs, PR numbers, commit SHAs, route names, command names, test names,
  state categories, environment category labels, provider category labels,
  status codes, normalized error codes, timing buckets, row-count summaries, and
  pass/fail/blocker summaries.
- Source diffs, placeholder-only docs, synthetic fixtures, mocked tests, and
  source guardrail scans.

Forbidden evidence in repo, PRs, Linear, logs, and release notes:

- Secret values, private environment values, auth tokens, magic links, signing
  identities, notary credentials, release keys, production dashboard details,
  private URLs, private local paths, customer data, card data, audio,
  transcripts, cleaned text, prompts, provider payloads, clipboard contents,
  dictionary terms, Recent Wisprs contents, private screenshots, and support
  attachments containing private text.

## Current Linear Blocker Snapshot

Source checked from `RUB-80` / `RW-107` on 2026-05-06:

| Gate area | Relevant issues | Current evidence status |
| --- | --- | --- |
| Final launch checklist | `RUB-80` / `RW-107` | Backlog, blocked, needs human approval. |
| Human-gate handoff | `RUB-317` / `RW-107A` | This source-safe document only; does not unblock launch by itself. |
| Auth and Terms live QA | `RUB-112`, `RUB-113` | Backlog, blocked by Brandon-owned Clerk/Supabase setup and approved test account flow. |
| Billing checkout, portal, webhook, Friend of Ruby | `RUB-161`, `RUB-174`, `RUB-197` | Backlog, blocked by Stripe test/live setup and manual smoke evidence. |
| Groq and authenticated transcription live smoke | `RUB-140`, `RUB-150`, `RUB-245` | Backlog, blocked by approved provider credentials, synthetic audio, and service setup. |
| Privacy storage/log audit | `RUB-73`, `RUB-76`, `RUB-306` | `RUB-73` and `RUB-76` remain blocked; `RUB-306` is source-only Mac local storage evidence. |
| Performance and latency | `RUB-75`, `RUB-315`, `RUB-26` | `RUB-75` remains blocked; `RUB-315` is source-side latency work; live/provider timing remains manual. |
| Mac insertion/manual QA | `RUB-295`, `RUB-296`, `RUB-64` | Backlog/manual; requires human Mac run against neutral target apps. |
| Signing, notarization, packaging, update path | `RUB-78`, `RUB-310`, `RUB-311`, `RUB-313` | Source-safe update/guardrail work is done; public artifact, notarization, upload, and clean-Mac QA remain human-gated under `RUB-78`. |
| Domain, legal, support, public claims | `RUB-30`, `RUB-314` | `RUB-314` source copy handoff exists; `RUB-30` remains human decision/approval. |
| Production deployment and rollback | `RUB-79` | Runbook is source-complete; production promotion remains a `RUB-80` human gate. |
| Security audit | `RUB-74`, `RUB-199` | Source/security audit gate is recorded Done; live/manual gates above still control launch. |

## Gate Checklist

### Auth, Account, And Supabase Terms Gate

Relevant issues: `RUB-112`, `RUB-113`, `RUB-80`.

Evidence type: Brandon/manual/live-only.

Brandon actions:

- Approve the Clerk development or staging app setup for email magic-link auth.
- Select an approved synthetic test inbox or account flow.
- Confirm Supabase development or staging metadata schema is available for
  Terms acceptance writes.
- Run, delegate, or approve a live sign-in and Terms acceptance QA pass.

Required sanitized evidence:

- Clerk app category, route names exercised, account category, and auth state
  categories only.
- Confirmation that magic-link sign-in succeeded or the exact non-secret
  blocker category.
- Confirmation that protected account/admin/session paths enforce auth.
- Confirmation that Terms acceptance writes metadata only.
- No magic links, tokens, user IDs, email contents, private env values, database
  URLs, screenshots with private text, or customer data.

Source-safe acceptance that can be reviewed by agents:

- Existing mocked auth, account, Terms, and privacy tests.
- Source review that protected routes verify Clerk sessions and do not log
  magic links or tokens.

### Billing And Friend Of Ruby Gate

Relevant issues: `RUB-161`, `RUB-174`, `RUB-197`, `RUB-80`.

Evidence type: Brandon/manual/live-only for Stripe test/live operations.

Brandon actions:

- Approve Stripe test-mode product, monthly price, annual price, customer
  portal, webhook endpoint, and Friend of Ruby promotion-code setup.
- Configure required secrets only in approved secret storage.
- Run or approve monthly checkout, annual checkout, portal, webhook, duplicate
  delivery, and Friend of Ruby redemption smokes with synthetic accounts.
- Decide separately whether live mode is approved for beta launch.

Required sanitized evidence:

- Test mode or live mode classification, route names, plan category, redirect
  success/cancel state, webhook event category, subscription cache state
  category, Friend of Ruby redemption status, and any follow-up issue IDs.
- No API keys, webhook secrets, dashboard screenshots with private data, card
  data, customer private data, raw webhook payloads, or production dashboard
  details.

Source-safe acceptance that can be reviewed by agents:

- Mocked Stripe checkout, portal, webhook signature, idempotency, subscription
  cache, and Friend of Ruby tests.
- Source review that Stripe remains the billing source of truth and card data
  is not stored by RubyWhisper.

### Provider And Transcription Gate

Relevant issues: `RUB-140`, `RUB-150`, `RUB-245`, `RUB-80`.

Evidence type: Brandon/manual/live-only for provider calls and authenticated
live route smoke.

Brandon actions:

- Approve a non-production Groq key through the private secret path.
- Approve short synthetic/sample audio for provider and route smoke tests.
- Run or approve one live Groq provider smoke and one authenticated
  `POST /api/desktop/transcribe` smoke through local or staging.
- Confirm Supabase request/usage records and logs are metadata-only after the
  smoke.

Required sanitized evidence:

- Provider category, model category, route path, status code or normalized error
  code, duration bucket, request metadata category, and metadata-only
  inspection result.
- No provider key, audio, transcript, cleaned text, context, dictionary terms,
  prompts, provider request/response bodies, or raw database/log payloads.

Source-safe acceptance that can be reviewed by agents:

- Mocked provider/client/route tests and source guardrails proving the desktop
  app does not contain provider secrets and talks to the backend, not directly
  to Groq.

### Privacy, Logging, Crash Reporting, And Admin Gate

Relevant issues: `RUB-73`, `RUB-76`, `RUB-306`, `RUB-80`.

Evidence type: mixed.

Brandon actions:

- For `RUB-73`, approve a human/live privacy audit covering Supabase rows,
  backend logs, provider logs where available, admin/support surfaces, Mac local
  stores, Keychain category, clipboard fallback behavior, and evidence packets.
- For `RUB-76`, approve the selected crash/error reporting provider setup or
  explicitly accept disabling it for beta.
- Review captured test events before beta if crash/error reporting is enabled.

Required sanitized evidence:

- Allowed metadata categories, table/log/surface names, row-count summaries,
  event category lists, admin role category, enabled/disabled crash-reporting
  status, and pass/fail/blocker status.
- No event screenshots/session replay, request bodies, private content,
  transcript/audio/clipboard/context/dictionary content, auth material,
  provider payloads, customer data, or private dashboard details.

Source-safe acceptance that can be reviewed by agents:

- `docs/qa/rub-306-mac-local-storage-source-privacy-audit.md`.
- Backend/Mac source privacy tests and guardrails for metadata-only server
  records, local-only Recent Wisprs, local-only dictionary, Keychain session
  storage, transient audio cleanup, and forbidden-content log scans.

### Performance And Latency Gate

Relevant issues: `RUB-75`, `RUB-315`, `RUB-26`, `RUB-80`.

Evidence type: mixed.

Brandon actions:

- Accept source-side backend latency metadata only after `RUB-315` is complete.
- Approve live Groq and authenticated route timing using synthetic audio.
- Approve a human Mac timing pass for recording end to insertion or recovery.
- Decide whether any measured misses are launch blockers or acceptable beta
  limitations.

Required sanitized evidence:

- Timing buckets for upload, provider, cleanup, response, insertion/recovery,
  and total path where available.
- Metadata-only row inspection summary and issue IDs for any mitigations.
- No audio, transcript, cleaned text, prompts, provider payloads, target app
  content, clipboard content, private URLs, or raw logs.

Source-safe acceptance that can be reviewed by agents:

- `RUB-315` source-side metadata implementation and tests once Done.
- Existing source latency metadata contract and privacy tests.

### Mac Permissions, Dictation, Insertion, And Recovery Gate

Relevant issues: `RUB-295`, `RUB-296`, `RUB-64`, `RUB-80`.

Evidence type: Brandon/manual/live-only for the full Mac run.

Brandon actions:

- Select the approved Mac machine or clean profile, build/artifact, synthetic
  account category, backend/provider category, and neutral target apps.
- Run or delegate `docs/qa/macos-manual-qa-harness.md` rows covering install,
  sign-in, Terms, microphone, Accessibility, hotkeys, island states, upload,
  provider errors, direct insertion, clipboard fallback, Recent Wisprs,
  dictionary, settings, local storage, and evidence review.
- Record unsupported targets as either recoverable beta limitations or launch
  blockers.

Required sanitized evidence:

- Harness row IDs, target categories, app/build version, macOS version,
  architecture, account state category, provider category, duration/latency
  bucket, error code category, insertion/recovery category, cleanup booleans,
  and pass/fail/blocker status.
- No real conversations, private notes, real emails, production admin/billing
  screens, target field content, dictated text, clipboard contents, audio,
  transcripts, private screenshots, or accidental sends.

Source-safe acceptance that can be reviewed by agents:

- Source tests and docs for onboarding, Keychain/API client, hotkeys, island
  states, duration cap, upload flow, direct insertion contracts, clipboard
  fallback, Recent Wisprs, dictionary, and privacy guardrails.
- Source-safe Mac builds are not substitutes for manual permission or clean-Mac
  QA.

### Signing, Notarization, Packaging, And Update Gate

Relevant issues: `RUB-78`, `RUB-310`, `RUB-311`, `RUB-313`, `RUB-80`.

Evidence type: mixed; public release artifact evidence is Brandon/manual/live-only.

Brandon actions:

- Approve the release owner, Apple Developer signing assets, notary credential
  path, artifact version/build, update/feed URL decision, public download URL,
  checksum notes, and release evidence location.
- Run or approve Developer ID signing, `.dmg` packaging, notarization,
  stapling, checksum generation, upload/publication, and first update check only
  after all prerequisite approvals are in place.
- Run clean-Mac install/open QA from a quarantine-preserving download.

Required sanitized evidence:

- Release issue ID, commit SHA, app version/build, artifact filename category,
  checksum, notarization status category, stapling validation status, Gatekeeper
  result, macOS version, architecture, update check status, and attribution
  confirmation.
- No Apple account values, signing identities, certificate details, notary
  credential details, private keys, release tokens, private release notes,
  private machine paths, unpublished private URLs, or full logs with private
  details.

Source-safe acceptance that can be reviewed by agents:

- `RUB-310`, `RUB-311`, and `RUB-313` source-level update and packaging
  guardrails.
- `docs/MAC_BETA_RELEASE_RUNBOOK.md` placeholder-only release checklist.
- Ad hoc local build or ad hoc local DMG checks do not satisfy this launch gate.

### Domain, Legal, Policy, Support, And Public Copy Gate

Relevant issues: `RUB-30`, `RUB-314`, `RUB-80`.

Evidence type: Brandon/manual/live-only for final decisions and approvals.

Brandon actions:

- Record canonical domain decision.
- Record Terms and Privacy owner/reviewer and approval status.
- Approve support address and beta support guidance.
- Approve fair-use language and public claims before production publication.
- Confirm public copy uses "works anywhere you can type" and does not claim
  "every text box."

Required sanitized evidence:

- Decision status, reviewer/owner category, approved route/page list, public
  claim checklist status, support path category, and any follow-up issue IDs.
- No legal advice claims, private drafts, private customer examples, private
  URLs, or approval claims unless Brandon explicitly made them.

Source-safe acceptance that can be reviewed by agents:

- `docs/qa/rub-314-public-copy-handoff.md`.
- Source review of public routes and support/legal links against approved copy
  posture.

### Production Deployment And Final Launch Approval Gate

Relevant issues: `RUB-79`, `RUB-80`.

Evidence type: Brandon/manual/live-only for production promotion and final
approval.

Brandon actions:

- Confirm all preceding gates are Done or explicitly accepted as beta
  limitations.
- Approve exact production commit, branch or tag, deployment path, rollback
  owner, production domain, production env category, public app URL, and public
  download URL.
- Approve any live Stripe, Groq, Clerk, Supabase, Vercel, DNS, and crash/error
  reporting operations.
- Explicitly approve paid beta launch in `RUB-80`.

Required sanitized evidence:

- Commit SHA, PR ID, deployment ID category, route smoke summary, rollback
  owner category, public URL category, manual approval statement, and a list of
  accepted beta limitations if any.
- No production secret values, private env output, live customer data, raw logs,
  provider payloads, transcripts, audio, private screenshots, or dashboard
  details.

Source-safe acceptance that can be reviewed by agents:

- `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` and passing CI/build/test evidence.
- Production promotion itself remains manual and cannot be completed by this
  handoff.

## Launch Acceptance Rule

Do not mark `RUB-80` / `RW-107` Done, do not call RubyWhisper paid beta ready,
and do not publish or announce the beta until:

- Every Linear blocker listed in this handoff is Done, or Brandon explicitly
  accepts the remaining item as a beta limitation.
- All live/manual evidence is sanitized and attached to the relevant issue.
- No source, PR, Linear, release note, or public page contains forbidden
  evidence.
- Brandon explicitly approves launch in `RUB-80`.
