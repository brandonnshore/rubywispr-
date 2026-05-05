# RubyWhisper Implementation Plan

Status: Draft for approval
Last updated: 2026-04-30

## Summary

RubyWhisper is a paid macOS dictation product with a native desktop app, a light Apple-like website, browser-based magic-link auth, Stripe subscriptions, and a privacy-forward backend. The product promise is simple:

```text
Put cursor anywhere you can type -> hold Fn or toggle Command+Fn -> speak -> RubyWhisper transcribes and lightly cleans the text -> text appears in the active app.
```

The first release should be a paid beta that friends, family, and early customers can use for real daily writing. It should be direct-download only, signed/notarized through the Apple Developer account, and built from an audited FreeFlow fork if the audit passes.

## Goals

- Deliver a native macOS app named `RubyWhisper`.
- Support browser-based magic-link login before first dictation.
- Require Terms/Privacy acceptance before trial use.
- Offer a 5,000-word free trial per account.
- Sell one paid plan: `$7/month` or `$60/year`, shown as `$5/month billed annually`.
- Support Friend of Ruby promo codes that grant one year free for small groups.
- Include provider costs in the paid plan; users do not bring their own API keys.
- Route desktop transcription and cleanup through RubyWhisper backend services.
- Use Groq for transcription and cleanup where feasible.
- Store only final cleaned Recent Wisprs locally on the Mac.
- Never store audio, raw transcript text, cleaned transcript text, clipboard text, or surrounding app context on the server.
- Work anywhere the user can type, within macOS permission and app-accessibility limits.
- Handle insertion failures without losing text.
- Ship a light, polished website inspired by Superwhisper's product clarity without cloning its design.

## Non-Goals

- No Windows, Linux, iOS, or Android app in v0.1.
- No Mac App Store launch in v0.1.
- No one-time purchase or lifetime license.
- No meeting transcription in v0.1.
- No file upload transcription in v0.1.
- No local transcription model in v0.1.
- No team accounts or organization billing in v0.1.
- No device-license activation system in v0.1.
- No server-side transcript/audio history.
- No public changelog requirement for launch.

## Current State

The repo currently contains planning artifacts and setup scripts only:

- `PRODUCT_BRIEF.md`
- `FORK_STRATEGY.md`
- `AGENTS.md`
- `scripts/setup-chat-env.sh`
- `scripts/new-worktree.sh`
- `scripts/codex-settings-setup.sh`

The target implementation does not exist in this repo yet. FreeFlow is the recommended starting harness, pending audit.

## Target State

The product should include:

- Native macOS desktop app, likely Swift/AppKit or SwiftUI based on FreeFlow.
- One Next.js app containing marketing pages, auth entry points, Stripe checkout/account routes, admin pages, and backend API routes.
- Clerk for email magic-link authentication.
- Supabase Postgres for product state, usage counters, admin roles, and metadata.
- Stripe for subscriptions, annual billing, customer portal, coupons/promotion codes, and webhooks.
- Groq backend integration for transcription and cleanup.
- Sparkle or equivalent for direct-download auto-updates.
- Privacy-safe crash/error reporting.

## Delivery Principles

- Audit before forking deeply.
- Build the shortest vertical path first: account -> trial entitlement -> record -> transcribe -> clean -> insert -> recover on failure.
- Keep transcript/audio privacy rules enforced at architecture boundaries, not only by policy text.
- Keep the paid beta small but real: signing, updates, billing, admin visibility, and support path must exist.
- Treat every milestone as incomplete unless it has runnable validation and manual user checks.

## Milestones

### M0: FreeFlow Audit And Import Decision

Outcome: decide whether FreeFlow is safe to use as the implementation base.

Required work:

- Clone or inspect `zachlatta/freeflow` in a temporary workspace.
- Confirm MIT license and attribution requirements.
- Confirm it builds on the current Mac.
- Inspect hotkey handling for `Fn` and `Command+Fn`.
- Inspect insertion and clipboard fallback behavior.
- Inspect recording island/overlay focus behavior.
- Inspect Groq provider integration.
- Inspect cleanup/context behavior and privacy boundaries.
- Inspect history/storage behavior.
- Estimate rebranding difficulty.
- Record findings in `RESEARCH_LOG.md` or a compact audit appendix.

Dependencies:

- Apple/Xcode toolchain available locally.
- Network access for cloning FreeFlow.

Acceptance criteria:

- Audit documents build result, app structure, key modules, risks, and recommendation.
- License/attribution requirements are documented.
- Decision is one of: use FreeFlow, use fallback candidate, or build custom.
- If FreeFlow is rejected, the reason is specific and tied to v0.1 requirements.

Validation by running:

```bash
xcodebuild -list
xcodebuild -scheme <FreeFlowScheme> -configuration Debug build
```

Exact scheme/workspace commands are TBD until the repo is inspected.

Required tests:

- Manual launch test.
- Manual hotkey test.
- Manual insertion test into at least Notes, browser text field, Slack or equivalent, and a code editor.

Security/privacy notes:

- Do not inspect or commit private env files.
- Do not add real API keys to the fork.
- Confirm where context/transcript text is sent and whether anything is persisted.

Boundary:

- External FreeFlow checkout.
- `RESEARCH_LOG.md`
- No product code import until audit is accepted.

Risks:

- FreeFlow may not build reliably.
- FreeFlow may assume direct-to-Groq API keys in the app, while RubyWhisper needs backend proxying.
- Rebrand may touch many Xcode/bundle/signing files.

### M1: Repo Structure, Web App, Auth, Database, And Billing Foundation

Outcome: users can sign in through the website, accept Terms/Privacy, start a trial, subscribe, and have backend-visible entitlement state.

Required work:

- Add a Next.js app in the repo.
- Configure Clerk email magic-link auth.
- Configure Supabase schema and migrations.
- Configure Stripe products/prices:
  - Monthly: `$7/month`.
  - Annual: `$60/year`.
  - Friend of Ruby: one-year free promo path.
- Implement Stripe Checkout and customer portal routes.
- Implement Stripe webhooks to update subscription state.
- Implement usage/quota counters.
- Implement admin role model.
- Implement beta admin page.
- Follow the usage policy in `docs/USAGE_QUOTA_CONTRACT.md` for trial word
  counting, quota errors, and metadata-only storage.

Dependencies:

- Domain TBD.
- Clerk project.
- Supabase project.
- Stripe account.
- Stripe product/price IDs.

Acceptance criteria:

- A new user can sign in with email magic link.
- A user cannot start trial/dictation until Terms/Privacy is accepted.
- A user sees trial usage and plan state.
- A user can subscribe monthly or annually through Stripe Checkout.
- A user can open Stripe customer portal from account settings.
- Stripe webhooks update subscription state in Supabase.
- Admin can view users, plans, word usage, errors, and Friend of Ruby status.
- Admin can create or configure Friend of Ruby coupon/promo code batches for small groups.

Validation by running:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
stripe listen --forward-to localhost:<port>/api/stripe/webhook
```

The package manager is npm. The exact local webhook port is set by RW-020 when `apps/web` is scaffolded.

Required tests:

- Unit tests for quota accounting and plan-state helpers.
- Integration tests for webhook signature validation and subscription transitions.
- Admin authorization tests.
- Manual Stripe test-mode checkout.

Security/privacy notes:

- Admin routes require Clerk auth plus server-side Supabase role verification.
- No client-only admin checks.
- Store payment state and metadata only, never card data.
- Stripe is billing source of truth; Supabase stores a cache for app behavior.
- Do not log magic links, session tokens, webhook secrets, or payment method details.

Boundary:

- Next.js app.
- Supabase migrations.
- Stripe webhook/API routes.
- Clerk middleware.
- Admin pages.

Risks:

- Stripe coupon semantics may not exactly match Friend of Ruby needs.
- Auth/session handoff to the desktop app needs careful token handling.

### M2: Backend Transcription, Cleanup, Quota, And Privacy Gateway

Outcome: authenticated desktop clients can submit audio to RubyWhisper backend and receive cleaned text while server storage remains metadata-only.

Required work:

- Define desktop API authentication using Clerk-issued session/JWT tokens.
- Add transcription endpoint.
- Add cleanup endpoint or combined transcribe-clean endpoint.
- Route provider calls to Groq.
- Enforce plan/trial entitlement before processing.
- Count cleaned output words against trial/usage.
- Enforce single-whisper duration cap of 10 minutes.
- Return structured errors for unauthenticated, terms-not-accepted, trial-exhausted, subscription-required, rate-limited, provider-down, and invalid-audio states.
- Store request metadata only.
- Apply `docs/USAGE_QUOTA_CONTRACT.md` so quota preflight, post-success
  increments, and usage metadata stay consistent across backend and desktop
  surfaces.

Dependencies:

- M1 auth/database foundation.
- Groq API key.
- Audio format decided by Mac client/FreeFlow audit.

Acceptance criteria:

- Authenticated trial user can transcribe and clean text.
- Trial word balance decreases by cleaned output words.
- Paid user can use unlimited personal dictation under fair-use controls.
- Trial-exhausted user receives an upgrade-required response.
- Audio and transcript text are never stored server-side.
- Backend logs contain no audio, raw transcript, cleaned text, clipboard text, or surrounding app context.

Validation by running:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Manual validation:

- Submit short test audio in local/staging.
- Confirm response contains cleaned text.
- Confirm database contains metadata and counters only.
- Confirm logs do not contain text/audio payloads.

Required tests:

- Unit tests for word counting.
- Unit tests for entitlement checks.
- Integration tests for request metadata persistence.
- Integration tests using mocked Groq responses.
- Redaction tests for logging helpers.

Security/privacy notes:

- Desktop app never receives Groq API key.
- Backend never persists text/audio.
- Context-aware cleanup may send context transiently only after user acceptance and while enabled.
- Request IDs may be used for support without exposing content.

Boundary:

- Next.js API routes/server actions.
- Supabase usage/request tables.
- Provider client abstraction.
- Logging/redaction layer.

Risks:

- Groq latency may not meet target through backend.
- Cleanup provider choice may need adjustment if Groq cleanup quality is insufficient.

### M3: Mac App Core Dictation Loop

Outcome: RubyWhisper can record, show the island, transcribe/clean through backend, insert text, and recover from insertion failure.

Required work:

- Import or fork selected macOS base after M0.
- Rebrand app surfaces to `RubyWhisper`.
- Configure bundle identifier, app metadata, and signing placeholders.
- Implement browser-based login handoff.
- Implement Terms/Privacy gate before first dictation.
- Implement microphone and Accessibility permission onboarding.
- Implement hold-to-talk and toggle modes:
  - Hold `Fn` records while held.
  - `Command+Fn` toggles recording on/off.
  - `Fn` may stop active toggle recording if the base supports it cleanly.
- Implement recording island states: idle hidden, recording, nearing limit, processing, success, error, trial exhausted, insertion failed.
- Implement live vocal visualizer.
- Implement 10-minute maximum single whisper with warning around 9:30.
- Implement backend submission and result handling.
- Implement direct insertion into active text field.
- Implement clipboard-safe fallback and previous clipboard restoration when possible under `docs/RW_069_CLIPBOARD_FALLBACK_CONTRACT.md`.
- Implement `Copy Whisper`/`Copy Transcript` recovery.
- Save failed insertions into Recent Wisprs.

Dependencies:

- M0 audit/import decision.
- M2 backend endpoint.
- Apple Developer account for signing/notarization later.

Acceptance criteria:

- User can login, accept terms, grant permissions, and complete a test whisper.
- Hold and toggle modes work.
- Island does not steal focus from the active writing surface.
- Short whispers under 30 seconds target under 1 second processing after recording ends, with 1-2 seconds as upper beta tolerance.
- Text appears in the active app when insertion succeeds.
- If no text field is focused, island shows "Click a text box first."
- User can recover text from Recent Wisprs and copy it.
- Previous clipboard restoration is best effort, skips unsupported pasteboard data types, and exposes the fallback/recovery states named in `docs/RW_069_CLIPBOARD_FALLBACK_CONTRACT.md`.

Validation by running:

```bash
xcodebuild -scheme RubyWhisper -configuration Debug build
xcodebuild test -scheme RubyWhisper
```

These are placeholders only. Exact repo-local workspace/scheme commands are blocked until RW-010 audits FreeFlow and RW-060 imports the selected macOS base.

Manual validation:

- Dictate into Notes.
- Dictate into browser text field.
- Dictate into Slack or equivalent.
- Dictate into a code editor.
- Trigger no-focused-text-field insertion failure.
- Trigger trial exhaustion in test account.
- Trigger provider error with mocked backend failure.

Required tests:

- Unit tests for local Recent Wisprs retention.
- Unit tests for settings persistence.
- Unit tests for backend response/error mapping.
- Manual QA for hotkeys and Accessibility permissions.

Security/privacy notes:

- API tokens stored in Keychain.
- Final cleaned Recent Wisprs stored locally only.
- Personal dictionary stored locally only.
- No audio/transcript server history.
- No local history sync in v0.1.

Boundary:

- macOS app source.
- Login bridge.
- Audio recording.
- Overlay/island UI.
- Insertion/clipboard recovery.
- Local persistence.

Risks:

- Global `Fn` handling can be brittle across keyboards/settings.
- Accessibility insertion varies by app.
- Overlay focus behavior can break typing flow.

### M4: Local History, Dictionary, Settings, And Account Surfaces

Outcome: users can manage privacy-relevant local behavior and account/billing state from the app.

Required work:

- Build main app/settings shell.
- Settings sections:
  - Account
  - Plan
  - Dictionary
  - Hotkeys
  - Appearance
  - Advanced
- Show word usage/trial remaining in app, not in the island except low/exhausted states.
- Implement local Recent Wisprs with 7-day retention default.
- Include failed insertions in Recent Wisprs.
- Allow user to disable or clear local Recent Wisprs.
- Follow `docs/RW_070_RECENT_WISPRS_CONTRACT.md` for the Recent Wisprs data
  model, insertion status semantics, retention cleanup, clear/disable behavior,
  no-backend-sync boundary, and metadata-only validation evidence.
- Implement local personal dictionary/custom vocabulary under
  `docs/RW_071_LOCAL_PERSONAL_DICTIONARY_CONTRACT.md`.
- Implement cleanup toggle in Advanced.
- Implement context-aware cleanup toggle, on by default after Terms/Privacy acceptance.
- Add billing management link to Stripe customer portal.

Dependencies:

- M3 core app shell.
- M1/M2 account and usage APIs.

Acceptance criteria:

- User can view account, plan, and word usage.
- User can open billing/customer portal.
- User can copy Recent Wisprs.
- Local history expires after 7 days by default.
- User can clear history.
- User can disable local history; disabled history prevents new persistent
  Recent Wisprs writes.
- Successful and failed insertions store only final text locally, and no Recent
  Wisprs content is sent to backend or Supabase.
- User can add/edit/delete dictionary terms locally; deleted or disabled terms do
  not appear in later cleanup payloads.
- User can turn cleanup/context behavior off in Advanced.
- Cleanup-disabled requests omit dictionary payloads entirely.

Validation by running:

```bash
xcodebuild test -scheme RubyWhisper
```

This is a placeholder only. Exact repo-local workspace/scheme commands are blocked until RW-010 audits FreeFlow and RW-060 imports the selected macOS base.

Manual validation:

- Add synthetic dictionary term and confirm it influences cleanup prompt when
  cleanup and dictionary support are enabled.
- Disable cleanup and confirm dictionary payload is absent, not empty.
- Delete dictionary term and confirm it is absent from local storage and later
  payloads.
- Create failed insertion and confirm it appears in Recent Wisprs.
- Clear history and confirm local store is empty.
- Open customer portal from account settings.

Required tests:

- Local retention tests.
- Settings persistence tests.
- Dictionary persistence, validation, deletion, and serialization tests.
- Dictionary cleanup payload-shaping and redaction tests.
- Account/plan API mapping tests.

Security/privacy notes:

- Local history and dictionary are not synced in v0.1.
- Dictionary terms are never persisted server-side; eligible terms may be sent
  transiently only during cleanup requests as defined in
  `docs/RW_071_LOCAL_PERSONAL_DICTIONARY_CONTRACT.md`.
- If encrypted local storage is feasible in the selected base, prefer encryption at rest.
- Settings must make local-only storage clear.

Boundary:

- Mac settings app/window.
- Local database/preferences.
- Account/usage display API.

Risks:

- Overly complex settings can make beta feel unfinished.

### M5: Website, Public Beta, Admin, And Support Path

Outcome: anyone with the link can understand RubyWhisper, sign up, pay, download the app, and get support.

Required work:

- Build light Apple-like marketing site.
- Use Superwhisper as a product clarity reference, not a clone.
- Include sections for:
  - Hero with product identity.
  - "Works anywhere you can type."
  - How it works.
  - Privacy promise.
  - Pricing.
  - Download.
  - Support/contact.
  - Terms and Privacy.
- Implement account/download page.
- Implement admin dashboard from M1.
- Implement support link to `brandon@rubyadvisory.com`.

Dependencies:

- M1 auth/billing foundation.
- Domain selection.
- App build artifact/download process.

Acceptance criteria:

- Visitor can sign up and pay.
- Visitor can download latest beta build.
- User can access billing portal after sign-in.
- Website clearly states that Recent Wisprs live locally on the user's Mac.
- Website does not overpromise universal insertion; copy says "works anywhere you can type."

Validation by running:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Manual validation:

- Complete Stripe test-mode checkout.
- Redeem Friend of Ruby promo code.
- Access admin dashboard with admin account.
- Confirm non-admin cannot access admin routes.
- Download beta build.

Required tests:

- Auth middleware tests where practical.
- Checkout/customer portal route tests.
- Admin route tests.
- Accessibility smoke test for marketing and account pages.

Security/privacy notes:

- Admin access must be server-side enforced.
- Support flows should not ask users to paste transcript/audio unless they choose to share it knowingly.

Boundary:

- Next.js marketing/account/admin pages.
- Stripe routes.
- Download page.

Risks:

- Website polish can expand scope; keep first launch focused on conversion and trust.

### M6: Signing, Notarization, Auto-Update, Observability, And Paid Beta Release

Outcome: RubyWhisper can be safely distributed to paid beta users outside the Mac App Store.

Required work:

- Configure Apple Developer signing.
- Configure notarization.
- Configure direct-download build packaging.
- Configure Sparkle or chosen updater.
- Configure crash/error reporting with privacy-safe scrubbers.
- Add release checklist.
- Add rollback path for app and backend.
- Add fair-use enforcement and rate limits.
- Run end-to-end beta readiness tests.

Dependencies:

- M3/M4 app functionality.
- M5 website/download route.
- Apple Developer account access.

Acceptance criteria:

- Downloaded app opens without Gatekeeper warnings.
- Auto-update checks work in beta channel.
- Backend can disable a broken app version or show upgrade-required where feasible.
- Crash/error reporting captures version/OS/stack metadata without text/audio/context.
- Beta support can identify user plan/usage/error codes without seeing private content.

Validation by running:

```bash
xcodebuild -scheme RubyWhisper -configuration Release archive
```

This is a placeholder only. Exact signing/export/notarization commands are blocked until RW-060 imports the selected macOS base and the Apple account setup tickets record signing constraints.

Manual validation:

- Install from website on a clean Mac profile or test machine.
- Complete login, permissions, trial dictation, paid checkout, update check, and insertion recovery.

Required tests:

- Release smoke checklist.
- Stripe live-mode checklist before public charging.
- Privacy log audit.
- Admin access audit.

Security/privacy notes:

- Human approval required before live Stripe mode, production secrets, notarized distribution, and public beta announcement.
- Production logs must be sampled/redacted and reviewed before launch.

Boundary:

- macOS release pipeline.
- Website download pipeline.
- Observability configuration.
- Production deployment.

Risks:

- Apple notarization/signing setup can take longer than expected.
- Auto-update integration may require Xcode project changes.

## Dependency Graph

```text
M0 FreeFlow audit
  -> M3 Mac app core loop
  -> M4 local app surfaces
  -> M6 signed beta release

M1 web/auth/billing/db
  -> M2 backend transcription/privacy gateway
  -> M3 Mac app core loop
  -> M5 website/admin/public beta
  -> M6 signed beta release
```

M1 and M0 can happen in parallel. M2 depends on M1. M3 depends on M0 and M2. M5 can start after M1 and finish after release artifacts exist.

## Parallelization And Dependency Waves

Wave 1:

- FreeFlow audit.
- Next.js/Clerk/Supabase/Stripe foundation.
- Website visual direction exploration.

Wave 2:

- Backend transcription/privacy gateway.
- Mac app import/rebrand/login bridge.
- Admin dashboard.

Wave 3:

- Core dictation loop.
- Insertion fallback and Recent Wisprs.
- Pricing/download/account pages.

Wave 4:

- Signing/notarization/updater.
- Privacy-safe observability.
- Paid beta release QA.

## User-Test Checkpoints

Checkpoint A: FreeFlow audit demo.

- User sees whether base app builds and records.
- Decision: continue fork or switch base.

Checkpoint B: First vertical slice.

- Login -> accept terms -> grant permissions -> dictate into Notes -> text inserted.

Checkpoint C: Failure recovery.

- Dictate with no focused text field -> see "Click a text box first" -> recover from Recent Wisprs -> copy text, following `docs/RW_069_CLIPBOARD_FALLBACK_CONTRACT.md`.

Checkpoint D: Billing and trial.

- Trial word count visible in app.
- Trial exhaustion opens checkout.
- Paid subscription unlocks usage.
- Friend of Ruby code grants one year free.

Checkpoint E: Release candidate.

- Install signed/notarized app from website.
- Auto-update check works.
- Privacy log audit passes.

## Risks And Mitigations

- Latency through backend may exceed target. Mitigate with regional hosting, streaming where feasible, short-audio optimization, request timing metrics, and provider fallback research if Groq misses targets.
- Insertion may fail in some apps. Mitigate with Accessibility APIs, clipboard fallback, previous clipboard restoration, clear island errors, and Recent Wisprs recovery.
- Provider cost can exceed `$7/month` economics for heavy users. Mitigate with fair-use terms, single-whisper cap, rate limits, metadata-only usage analytics, and abuse detection.
- Privacy expectations are high. Mitigate by never storing server-side text/audio, redacting logs, documenting transient provider flow, and keeping local history visibly local.
- FreeFlow rebrand may be bigger than expected. Mitigate with M0 audit and fallback candidates.
- Auth/billing/session handoff can be fragile. Mitigate with Clerk session-token verification and clear app login bridge tests.
- Signing/notarization can delay release. Mitigate by starting Apple Developer setup before final app polish.

## Validation Plan

Every implementation PR or agent task should include:

- Exact commands run.
- Unit/integration tests where code behavior is deterministic.
- Manual macOS validation for recording, permissions, hotkeys, insertion, and overlay focus.
- Privacy validation for any logging/storage touchpoint.
- Security review for auth, billing, admin, secrets, and production deployment.

Expected command contracts after scaffolding:

- npm is the chosen package manager.
- `apps/web` is the Next.js app and backend API route path.
- `apps/macos` is reserved for the imported macOS app after FreeFlow audit/import.
- `packages/*` is reserved for shared code only when needed.
- Web/backend commands become active after RW-020 (`RUB-31`) creates the root npm workspace and `apps/web`.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

macOS `xcodebuild` commands are blocked until RW-010 records the FreeFlow scheme/build commands and the import/ADR path records the repo-local Xcode project or workspace. Do not cite a placeholder scheme as an active command.

## Security And Privacy Checkpoints

- No private env files are printed, summarized, or committed.
- Desktop app stores auth tokens in Keychain.
- Desktop app does not store provider API keys.
- Backend stores metadata only.
- Logs never contain audio/transcripts/context/clipboard text.
- Admin pages are server-side role-checked.
- Stripe webhook signatures are verified.
- Terms/Privacy acceptance is required before trial dictation.
- Human approval is required before production secrets, live Stripe, notarized release, or public beta announcement.

## Traceability Matrix

| Goal | Requirement IDs | Milestones |
| --- | --- | --- |
| Account-gated paid product | FR-001, FR-002, FR-003, FR-004, FR-005 | M1, M5 |
| Fast dictation loop | FR-010, FR-011, FR-014, FR-015, NFR-001 | M2, M3 |
| Hotkey-driven native Mac app | FR-010, FR-011, FR-012, FR-013 | M0, M3 |
| Insertion anywhere you can type | FR-017, FR-018, FR-019 | M3, M4 |
| Privacy-forward storage | FR-014, FR-015, FR-016, FR-020, NFR-003 | M2, M3, M4 |
| Recent Wisprs recovery | FR-018, FR-019, FR-020 | M3, M4 |
| Billing and Friend of Ruby | FR-004, FR-005, FR-006, FR-030, FR-032 | M1, M5 |
| Public beta distribution | FR-040, FR-041 | M6 |
| Admin visibility | FR-031, FR-032 | M1, M5 |

Requirement IDs are defined in `TECHNICAL_SPEC.md`.

## Linear Issue Draft Map

Do not create live Linear issues until these docs are approved. Likely future issue groups:

- Audit FreeFlow and record decision.
- Scaffold Next.js app with Clerk/Supabase/Stripe.
- Create Supabase schema and migrations.
- Implement Stripe products, checkout, portal, and webhooks.
- Implement transcription/privacy gateway API.
- Import and rebrand macOS app.
- Implement desktop login bridge.
- Implement onboarding permissions flow.
- Implement recording island states.
- Implement backend dictation call and result handling.
- Implement insertion success/failure detection.
- Implement Recent Wisprs and copy recovery.
- Implement settings/account/plan/dictionary surfaces.
- Implement admin dashboard and Friend of Ruby code management.
- Implement website marketing/pricing/download pages.
- Configure signing/notarization/updater.
- Run paid beta release checklist.
