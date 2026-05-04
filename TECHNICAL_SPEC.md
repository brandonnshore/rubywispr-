# RubyWhisper Technical Spec

Status: Draft for approval
Last updated: 2026-04-30

## Summary

RubyWhisper is a macOS dictation app and paid web product. Users sign in with email magic link, accept Terms/Privacy, grant macOS permissions, and dictate text anywhere they can type. The app records audio, sends it through RubyWhisper backend to Groq, receives lightly cleaned text, and inserts it into the active app. If insertion fails, RubyWhisper preserves the cleaned text locally and offers a fast copy recovery path.

## Actors

- Visitor: unauthenticated website visitor.
- Trial user: authenticated user with 5,000 trial words.
- Paid user: authenticated user with active subscription.
- Friend of Ruby user: authenticated user with one-year free access via promo code.
- Admin: approved RubyWhisper operator, initially Brandon.
- Desktop app: native macOS client.
- Backend: Next.js API routes/server handlers.
- Provider: Groq.

## Functional Requirements

### Account, Trial, Billing

FR-001 Auth: The system must require account sign-in before first dictation.

- Acceptance criteria: unauthenticated desktop users can open login, but cannot record/transcribe.
- Validate by running: auth route tests and manual desktop first-run flow.
- Required tests: protected API route tests.
- Security/privacy: use Clerk session verification server-side.

FR-002 Magic link: The system must support email magic-link sign-in through the browser.

- Acceptance criteria: user enters email, receives link, completes auth, desktop app becomes signed in.
- Validate by running: Clerk dev/test flow.
- Required tests: login callback/session handoff tests where feasible.
- Security/privacy: do not log magic links or tokens.

FR-003 Terms/Privacy: The system must require Terms/Privacy acceptance before trial dictation.

- Acceptance criteria: signed-in user without acceptance is blocked from transcription and guided to accept.
- Validate by running: API entitlement test and desktop onboarding test.
- Required tests: entitlement helper tests.
- Security/privacy: store acceptance timestamp, not consent text beyond document version if added later.

FR-004 Trial: The system must grant 5,000 trial words per account.

- Acceptance criteria: trial balance decreases by cleaned output word count; exhausted users cannot transcribe.
- Validate by running: quota unit tests and manual exhaustion test.
- Required tests: word counting and threshold tests.
- Security/privacy: counters only; no transcript storage.
- Implementation contract: `docs/USAGE_QUOTA_CONTRACT.md`.

FR-005 Paid plan: The system must support one paid plan with monthly and annual billing.

- Monthly price: `$7/month`.
- Annual price: `$60/year`, displayed as `$5/month billed annually`.
- Acceptance criteria: Stripe Checkout creates subscriptions and webhooks update Supabase state.
- Validate by running: Stripe test-mode checkout and webhook forwarding.
- Required tests: webhook signature and state transition tests.
- Security/privacy: Stripe is billing source of truth; do not store card data.

FR-006 Friend of Ruby: The system must support one-year free access codes for small groups.

- Acceptance criteria: admin can create or configure a code with limited redemptions; redeemed users get one year free.
- Validate by running: Stripe test coupon/promotion code redemption.
- Required tests: redemption limit and status tests.
- Security/privacy: admin-only creation.

### Mac App And Dictation

FR-010 Hotkeys: The app must support hold-to-talk and toggle recording.

- Hold-to-talk: hold `Fn`.
- Toggle: `Command+Fn` toggles recording on/off.
- If feasible, pressing `Fn` stops an active toggle recording.
- Acceptance criteria: both modes are always available.
- Validate by running: manual hotkey QA.
- Required tests: manual only if global hotkey framework is not unit-testable.
- Security/privacy: no extra permission beyond required macOS input monitoring/accessibility if needed.

FR-011 Recording island: The app must show a floating, draggable recording island while recording/processing/errors need attention.

- Acceptance criteria: island shows recording, processing, success, error, insertion-failed, and trial-exhausted states.
- Validate by running: manual app QA.
- Required tests: state mapping tests where UI architecture allows.
- Security/privacy: island must not display private transcript content unless user explicitly opens recovery/history UI.

FR-012 Visualizer: The island must show live voice pickup while recording.

- Acceptance criteria: visualizer responds to microphone volume.
- Validate by running: manual microphone test.
- Required tests: audio-meter logic tests if separated.
- Security/privacy: meter data is ephemeral.

FR-013 Duration cap: A single whisper must be capped at 10 minutes.

- Acceptance criteria: app warns around 9:30 and stops or blocks recording at 10:00.
- Validate by running: shortened timer test and manual long-session test.
- Required tests: timer/cap unit tests.
- Security/privacy: cap reduces meeting-transcription abuse.

FR-014 Transcription: The desktop app must send recorded audio only to RubyWhisper backend, never directly to Groq.

- Acceptance criteria: app contains no Groq key; backend receives authenticated request and returns cleaned text.
- Validate by running: code inspection, app build, backend integration test.
- Required tests: mocked backend response handling.
- Security/privacy: provider key remains server-side.

FR-015 Cleanup: The system must lightly clean transcripts by default.

- Cleanup should add punctuation/capitalization, remove filler words, fix obvious mistakes, and preserve meaning.
- Acceptance criteria: cleanup is on by default and can be disabled in Advanced settings.
- Validate by running: mocked provider tests and manual samples.
- Required tests: prompt construction tests without sensitive fixtures.
- Security/privacy: raw transcript is transient and not stored.

FR-016 Context-aware cleanup: The system should support context-aware cleanup where feasible and privacy-safe.

- Acceptance criteria: context-aware cleanup is on by default after Terms/Privacy acceptance and can be disabled.
- Validate by running: settings and backend payload tests.
- Required tests: ensure logging redacts context payloads.
- Security/privacy: context may be sent transiently for processing; never logged or stored.

FR-017 Insertion: The app must insert cleaned text into the active text field when possible.

- Acceptance criteria: successful dictation places text where the user's cursor was active.
- Validate by running: manual tests in Notes, browser, Slack/equivalent, and code editor.
- Required tests: manual app-integration tests.
- Security/privacy: do not read more app content than needed for insertion/context.

FR-018 Insertion failure recovery: The app must never silently discard a whisper when insertion fails.

- Acceptance criteria: if no focused text box is available, island shows "Click a text box first"; cleaned text is saved locally; user can copy it.
- Validate by running: manual no-focused-field test.
- Required tests: failure-state mapping and local history tests.
- Security/privacy: final cleaned text stored locally only.

FR-019 Clipboard fallback: The app should use a clipboard-safe fallback when direct insertion fails or is unavailable.

- Acceptance criteria: cleaned text can be copied/pasted and previous clipboard is restored when technically possible.
- Validate by running: manual clipboard fallback test.
- Required tests: clipboard manager tests if abstraction exists.
- Security/privacy: clipboard contents must not be sent to backend.

FR-020 Recent Wisprs: The app must store final cleaned Recent Wisprs locally for 7 days by default.

- Acceptance criteria: successful and failed insertions appear in Recent Wisprs; old items expire.
- Validate by running: local storage tests and manual history test.
- Required tests: retention and clear-history tests.
- Security/privacy: local only; no server sync in v0.1.

FR-021 Personal dictionary: The app must support local personal dictionary terms.

- Acceptance criteria: user can add/edit/delete local terms and cleanup honors them where feasible.
- Validate by running: settings test and manual cleanup sample.
- Required tests: dictionary persistence tests.
- Security/privacy: local only in v0.1.

FR-022 Settings: The app must include settings sections for Account, Plan, Dictionary, Hotkeys, Appearance, and Advanced.

- Acceptance criteria: users can access account/plan/usage, dictionary, hotkey info, appearance choices, cleanup/context toggles, and billing portal.
- Validate by running: manual settings walkthrough.
- Required tests: settings persistence tests.
- Security/privacy: settings must clearly distinguish local-only data.

FR-023 Usage display: The app must show trial/usage word count in the app, not in the island except low/exhausted states.

- Acceptance criteria: account/plan view shows word usage; island remains focused during normal dictation.
- Validate by running: manual UI test.
- Required tests: account API mapping tests.
- Security/privacy: usage is metadata only.

FR-024 Multiple Macs: The system must allow users to sign in on multiple Macs under fair-use policy.

- Acceptance criteria: no v0.1 device activation limit blocks normal use.
- Validate by running: sign in on two development devices/profiles if available.
- Required tests: server does not enforce single-device lock.
- Security/privacy: sessions can be revoked through Clerk/admin if needed.

### Website, Admin, Distribution

FR-030 Website: The website must support marketing, pricing, signup, checkout, download, account/billing, Terms/Privacy, and lightweight support.

- Acceptance criteria: visitor can learn, sign up, pay, and download.
- Validate by running: Next.js build and manual checkout/download flow.
- Required tests: routing and checkout tests.
- Security/privacy: privacy copy must match actual architecture.

FR-031 Admin dashboard: The beta must include an admin page.

- Admin can see users, plans, word usage, errors, Friend of Ruby status, and user status.
- Acceptance criteria: admin can inspect beta health without seeing transcript/audio content.
- Validate by running: admin manual test.
- Required tests: admin authorization tests.
- Security/privacy: role checked server-side.

FR-032 Friend of Ruby admin: Admin must be able to create Friend of Ruby code batches.

- Acceptance criteria: admin can create a reusable code with limited redemptions, such as 10 people.
- Validate by running: Stripe test redemption.
- Required tests: admin creation and redemption-state tests.
- Security/privacy: avoid exposing unrestricted coupon creation to non-admin users.

FR-040 Signing/notarization: Public beta app builds must be signed and notarized.

- Acceptance criteria: downloaded app opens without Gatekeeper warnings on supported macOS.
- Validate by running: clean-machine install test.
- Required tests: release checklist.
- Security/privacy: signing credentials protected.

FR-041 Auto-update: Direct-download app should auto-update.

- Acceptance criteria: app can check for and apply beta updates.
- Validate by running: Sparkle/update-channel test.
- Required tests: release smoke test.
- Security/privacy: updates must be signed.

FR-042 Support: Beta support should route to `brandon@rubyadvisory.com`.

- Acceptance criteria: website/app support link opens email or contact path.
- Validate by running: manual link test.
- Required tests: route/link test.
- Security/privacy: support copy should discourage sending sensitive transcript content unless necessary.

## Non-Functional Requirements

NFR-001 Performance:

- Short whispers under 30 seconds should target under 1 second from recording end to insertion.
- 1-2 seconds is acceptable as beta upper tolerance.
- Longer whispers should feel quick but are not held to sub-second processing.

NFR-002 Availability:

- If backend/provider is unavailable, app shows a clear error.
- Offline dictation is not supported in v0.1.

NFR-003 Privacy:

- Server must not store audio, raw transcript, cleaned text, context, clipboard text, or local history.
- Logs must be redacted.
- Usage counters must remain aggregate metadata only; see `docs/USAGE_QUOTA_CONTRACT.md`.

NFR-004 Security:

- Desktop app stores tokens in Keychain.
- Backend verifies Clerk sessions.
- Admin is role-restricted.
- Stripe webhooks are signature-verified.

NFR-005 Accessibility:

- Onboarding and settings must be keyboard accessible.
- Island should have reduced-motion behavior.
- Text contrast must meet WCAG AA where applicable.

NFR-006 Compatibility:

- macOS current plus recent versions.
- Exact minimum version TBD after FreeFlow audit.

NFR-007 Cost:

- Product may advertise unlimited personal dictation, but fair-use terms and abuse controls must protect provider cost.

## User Flows

### First Run

1. User downloads RubyWhisper.
2. User opens app.
3. App asks user to sign in through browser magic link.
4. User completes Clerk login.
5. App shows Terms/Privacy acceptance.
6. User grants microphone permission.
7. User grants Accessibility permission.
8. User completes a test whisper.
9. App shows trial word balance and basic account state.

### Trial Dictation

1. User focuses any text field.
2. User holds `Fn` or toggles `Command+Fn`.
3. Island appears and visualizer responds.
4. User stops recording.
5. Island shows processing.
6. Backend checks entitlement and transcribes/cleans.
7. App inserts cleaned text.
8. Recent Wisprs stores final cleaned text locally.
9. Trial word count updates by cleaned output words.

### Insertion Failure

1. User records without focused text field.
2. Backend returns cleaned text.
3. App cannot insert.
4. Island shows "Click a text box first."
5. App saves cleaned text locally in Recent Wisprs.
6. User opens app and clicks `Copy Whisper`/`Copy Transcript`.
7. App restores previous clipboard when possible.

### Trial Exhaustion

1. User hits hotkey after using 5,000 trial words.
2. App checks entitlement or backend rejects request.
3. Island shows upgrade prompt.
4. User clicks upgrade.
5. Website opens Stripe Checkout.
6. After successful payment, app refreshes plan and resumes dictation.

### Friend Of Ruby

1. Admin creates a code with limited redemptions.
2. User signs up.
3. User applies code at checkout or account flow.
4. Stripe/Supabase marks one-year free access.
5. App shows active plan.

## System Flows

### Transcription Request

```text
Desktop app -> backend /api/transcribe
  includes auth token, audio, app version, OS version, settings flags

Backend:
  verify Clerk session
  verify terms accepted
  verify plan/trial/fair-use
  reject if too long or invalid
  send audio to Groq
  clean transcript through Groq
  count cleaned words
  update usage metadata
  return cleaned text and request metadata

Desktop app:
  insert text
  save local Recent Wispr
  update usage display
```

### Stripe Webhook

```text
Stripe -> /api/stripe/webhook
  verify signature
  map customer/subscription to Clerk user
  update Supabase subscription cache
  update Friend of Ruby status if applicable
```

### Admin Access

```text
Admin page request
  verify Clerk session
  lookup admin_roles in Supabase server-side
  render admin data if allowed
  return 403 otherwise
```

## State Machines

### Desktop Recording State

```text
idle
  -> recording
  -> nearing_limit
  -> processing
  -> inserting
  -> success
  -> idle

processing
  -> provider_error
  -> trial_exhausted
  -> insertion_failed
  -> success

recording
  -> permission_error
  -> duration_limit_reached
```

### Account State

```text
signed_out
  -> signed_in_terms_required
  -> trial_active
  -> trial_exhausted
  -> paid_active
  -> friend_of_ruby_active
  -> payment_failed
  -> blocked
```

## API Contracts

Exact endpoints are provisional.

### `POST /api/desktop/transcribe`

Auth:

- Clerk session token required.

Request:

```json
{
  "audio": "<multipart file or binary body>",
  "audioDurationMs": 12345,
  "appVersion": "0.1.0",
  "osVersion": "macOS 15.x",
  "cleanupEnabled": true,
  "contextAwareCleanupEnabled": true,
  "dictionaryTerms": ["local", "terms"],
  "context": "<optional transient context>"
}
```

Response success:

```json
{
  "requestId": "req_...",
  "cleanedText": "Cleaned text.",
  "cleanedWordCount": 2,
  "trialWordsRemaining": 4998,
  "planState": "trial_active"
}
```

Response error:

```json
{
  "requestId": "req_...",
  "errorCode": "trial_exhausted",
  "message": "Upgrade to keep using RubyWhisper."
}
```

Server must not persist request `audio`, `context`, raw transcript, or `cleanedText`.

### `GET /api/desktop/account`

Returns:

```json
{
  "email": "user@example.com",
  "planState": "trial_active",
  "trialWordsUsed": 1000,
  "trialWordsLimit": 5000,
  "monthlyWordsUsed": 1000,
  "billingPortalUrl": "https://..."
}
```

### `POST /api/account/accept-terms`

Records acceptance timestamp for the current Clerk user.

### `POST /api/stripe/checkout`

Creates Stripe Checkout session for monthly or annual plan.

### `POST /api/stripe/webhook`

Handles Stripe events and updates Supabase.

## Error Handling

The canonical backend-to-desktop error contract lives in
`docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`. Backend routes must use those stable
machine codes and keep responses/logs metadata-only.

| Error | User-facing behavior | Storage/logging |
| --- | --- | --- |
| Signed out | Open sign-in flow | Metadata only |
| Terms required | Open Terms/Privacy acceptance | Metadata only |
| Mic permission denied | Guide user to System Settings | No audio |
| Accessibility denied | Guide user to System Settings | No content |
| Trial exhausted | Island upgrade prompt | Usage metadata |
| Payment failed | Account/Plan prompt | Stripe status |
| Provider down | Island error, retry option if safe | Error code/latency |
| No text field focused | "Click a text box first"; save local whisper | Local cleaned text only |
| Clipboard unavailable | Show copy/manual recovery path | Local cleaned text only |
| Duration over cap | Stop/block at 10 minutes | Duration metadata |

## Edge Cases

- User starts toggle recording and walks away: stop at 10 minutes.
- User changes active app during recording: insertion should target active field at insertion time where feasible; if uncertain, fail safely and save local.
- User loses network after recording: show network error; local audio should not be retained indefinitely unless explicitly needed for immediate retry and deleted after flow ends.
- User hits trial limit during a request: allow request if started under limit or reject by preflight policy; choose one during implementation and document it.
- Provider returns low-quality transcript: cleanup should not invent content.
- User disables cleanup: return raw transcription as final text, still not stored server-side.
- User disables context-aware cleanup: backend request must omit context.
- User has multiple Macs: usage counters update account-wide.
- Admin is removed: admin page must deny access on next request.

## EARS Requirements

WHEN a signed-out user attempts to dictate, THE SYSTEM SHALL block dictation and open browser sign-in.

WHEN a signed-in user has not accepted Terms/Privacy, THE SYSTEM SHALL block transcription until acceptance is recorded.

WHEN a trial user submits audio, THE SYSTEM SHALL count cleaned output words against the 5,000-word trial.

WHEN a user reaches the trial limit, THE SYSTEM SHALL show an upgrade prompt and link to checkout.

WHEN a paid user dictates within fair-use constraints, THE SYSTEM SHALL process the dictation without per-use payment prompts.

WHEN recording begins, THE SYSTEM SHALL show the recording island without stealing focus.

WHEN microphone input changes while recording, THE SYSTEM SHALL update the vocal visualizer.

WHEN recording reaches approximately 9:30, THE SYSTEM SHALL warn the user that the 10-minute cap is approaching.

WHEN recording reaches 10:00, THE SYSTEM SHALL stop or prevent additional recording for that whisper.

WHEN transcription succeeds and a text field is focused, THE SYSTEM SHALL insert cleaned text into that field.

WHEN insertion fails because no text field is focused, THE SYSTEM SHALL show "Click a text box first" and save the cleaned text locally.

WHEN a whisper is completed, THE SYSTEM SHALL store the final cleaned text locally for Recent Wisprs unless local history is disabled.

WHEN cleanup is disabled, THE SYSTEM SHALL return transcription without cleanup as the final text.

WHEN context-aware cleanup is disabled, THE SYSTEM SHALL omit surrounding context from the backend request.

WHEN the backend logs a transcription request, THE SYSTEM SHALL log metadata only and omit text/audio/context payloads.

WHEN an admin page is requested, THE SYSTEM SHALL verify admin role server-side before returning data.

## Security Requirements

- Clerk session verification on all protected API routes.
- Auth tokens stored in Keychain on macOS.
- Stripe webhook signature verification.
- Server-side admin role checks.
- Rate limiting and abuse detection on transcription.
- No provider API keys in desktop app.
- No secrets in git.
- Human approval before live billing and production release.

## Privacy Requirements

- No server-side audio storage.
- No server-side transcript storage.
- No server-side cleaned text storage.
- No server-side context storage.
- No clipboard storage.
- No support/admin access to transcript content.
- Local Recent Wisprs store final cleaned text only.
- Local Recent Wisprs expire after 7 days by default.
- Personal dictionary local-only in v0.1.
- Terms/Privacy acceptance before first dictation.

## Accessibility Requirements

- Onboarding and settings keyboard accessible.
- Clear permission instructions.
- Recording island must not rely on color alone.
- Reduced-motion support for visualizer/motion.
- Website and account pages should meet WCAG AA contrast.

## Performance Budgets

- Short whisper target: under 1 second after recording ends.
- Beta tolerance: 1-2 seconds.
- Backend should report provider latency and total latency.
- App should show processing state immediately.
- Avoid blocking UI during upload/processing.

## Observability Rules

Store:

- Request ID.
- User ID.
- Plan state.
- Duration.
- Word count.
- Latency.
- Provider.
- App/OS version.
- Error code.

Never store:

- Text/audio/context/clipboard/prompt payloads.

## Test Plan

Automated:

- Auth guard tests.
- Terms/trial entitlement tests.
- Word count tests.
- Stripe webhook tests.
- Admin authorization tests.
- Logging redaction tests.
- Settings/history/dictionary local persistence tests.
- Backend provider mock tests.

Manual:

- First-run onboarding.
- Mic and Accessibility permissions.
- Hold and toggle hotkeys.
- Island states.
- Dictation into multiple apps.
- Failed insertion recovery.
- Trial exhaustion checkout.
- Friend of Ruby redemption.
- Signed/notarized install.
- Auto-update.

## Acceptance Criteria For V0.1 Paid Beta

- New user can sign up, accept privacy terms, grant permissions, and complete a test whisper.
- Trial and paid plan states work.
- Short dictations feel fast enough for daily use.
- Insertion failures are recoverable.
- Recent Wisprs works locally and expires after 7 days.
- Admin can monitor beta health without seeing private content.
- Website can sell and distribute the app.
- App is signed/notarized and direct-downloadable.
- Privacy log audit passes.

## ADR Candidates

- Use FreeFlow as base after audit.
- Desktop app talks only to backend, never Groq directly.
- Clerk for auth.
- Supabase for product metadata.
- Stripe as billing source of truth.
- Groq for transcription and cleanup.
- Sparkle for auto-update.
- Sentry or equivalent for privacy-safe crash reporting.

## Open Questions

- Final domain name.
- Exact macOS minimum version.
- Exact Next.js monorepo structure and package manager.
- Exact FreeFlow import strategy.
- Exact provider cleanup model/prompt after Groq quality testing.
- Whether local Recent Wisprs should be encrypted at rest.
- Whether cleanup-disabled mode should still count words by raw transcript or final output; default is final output.
