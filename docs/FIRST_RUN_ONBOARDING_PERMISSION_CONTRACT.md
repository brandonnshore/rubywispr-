# First-Run Onboarding And Permission Contract

Status: Proposed contract for RW-062A. Swift/macOS implementation, live Clerk
login, live microphone/Accessibility permission checks, and manual test-whisper
QA remain downstream work.

This contract defines the first-run onboarding coordinator that takes a new
RubyWhisper desktop user from signed out to ready for dictation. It extends:

- `TECHNICAL_SPEC.md#User Flows`
- `TECHNICAL_SPEC.md#POST /api/account/accept-terms`
- `WEB_DESIGN_SPEC.md#Onboarding`
- `docs/DESKTOP_LOGIN_BRIDGE_CONTRACT.md`
- `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`

## Ownership Boundary

The onboarding coordinator owns local step order, local permission checks,
permission recovery UI, keyboard accessibility, test-whisper gating, and local
completion metadata. It must consume the existing auth/account/API contracts; it
must not invent alternate auth storage, direct provider calls, backend states, or
permission error codes.

The RubyWhisper backend owns Clerk session verification, Terms acceptance,
account eligibility, entitlement/quota state, usage metadata, and provider work.
The macOS app must call only RubyWhisper backend routes through the typed client
defined in `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`.

## State Machine

The coordinator should model first run as explicit ordered states:

```text
not_started
  -> sign_in_required
  -> sign_in_in_progress
  -> account_refreshing
  -> terms_required
  -> account_ineligible
  -> microphone_required
  -> microphone_requesting
  -> microphone_recovery
  -> accessibility_required
  -> accessibility_requesting
  -> accessibility_recovery
  -> test_whisper_required
  -> test_whisper_recording
  -> test_whisper_processing
  -> ready
```

Only `ready` enables normal dictation entry points. `test_whisper_recording` is
the only recording state reachable before `ready`, and it is allowed only after
sign-in, Terms acceptance, account eligibility, microphone grant, and
Accessibility trust are satisfied.

The app must not allow recording, upload, transcription, insertion, hotkey
activation, or background dictation from these states:

- `not_started`
- `sign_in_required`
- `sign_in_in_progress`
- `account_refreshing`
- `terms_required`
- `account_ineligible`
- `microphone_required`
- `microphone_requesting`
- `microphone_recovery`
- `accessibility_required`
- `accessibility_requesting`
- `accessibility_recovery`
- `test_whisper_required`
- `test_whisper_processing`

Hotkey activation before `ready` may open or refocus onboarding at the first
unsatisfied state, but it must not start capture.

## Gate Order

The coordinator must resolve gates in this order:

1. Sign in through the desktop login bridge.
2. Refresh `GET /api/desktop/account`.
3. Accept Terms/Privacy if required.
4. Refresh `GET /api/desktop/account` again after Terms acceptance.
5. Confirm account eligibility.
6. Request/confirm microphone permission.
7. Request/confirm Accessibility trust.
8. Complete a test whisper.
9. Enter `ready`.

Do not ask for microphone or Accessibility permission before the user has a
valid signed-in account state. Do not run a test whisper before all prior gates
are satisfied.

## Auth, Terms, And Account Mapping

The sign-in step delegates to `docs/DESKTOP_LOGIN_BRIDGE_CONTRACT.md`. While the
login bridge is in `signed_out`, `login_launching`, `browser_pending`,
`handoff_pending`, `session_exchanging`, or `account_refreshing`, onboarding
stays in `sign_in_required`, `sign_in_in_progress`, or `account_refreshing`, and
dictation remains disabled.

After login exchange, the app must call `GET /api/desktop/account` through the
typed API client. Account signals map as follows:

| Backend/account signal | Onboarding state | Dictation/test whisper | Recovery |
| --- | --- | --- | --- |
| Missing, invalid, revoked auth, or backend `signed_out` | `sign_in_required` | Disabled | `open_sign_in`; clear local session per Keychain contract |
| Refresh pending | `account_refreshing` | Disabled | Wait, cancel, or bounded retry |
| `accountStatus: "terms_required"` or `failureCode: "terms_required"` | `terms_required` | Disabled | `open_terms_acceptance` |
| `accountStatus: "active"`, `canTranscribe: true`, `planState: "trial_active"` | Continue to permission gates | Test whisper allowed after permissions | Show trial metadata in ready state |
| `accountStatus: "active"`, `canTranscribe: true`, `planState: "paid_active"` | Continue to permission gates | Test whisper allowed after permissions | Show account/billing surface |
| `accountStatus: "active"`, `canTranscribe: true`, `planState: "friend_of_ruby_active"` | Continue to permission gates | Test whisper allowed after permissions | Show account surface |
| `failureCode: "trial_exhausted"` or `planState: "trial_exhausted"` | `account_ineligible` | Disabled | `open_checkout` |
| `failureCode: "subscription_required"` | `account_ineligible` | Disabled | `open_checkout` |
| `failureCode: "payment_failed"` or `planState: "payment_failed"` | `account_ineligible` | Disabled | `open_billing` |
| `failureCode: "account_blocked"` or `planState: "blocked"` | `account_ineligible` | Disabled | `open_account` |
| `service_unavailable`, `internal_error`, or transport offline during refresh | `account_refreshing` or local recovery | Disabled | Bounded retry or sign in again per API client contract |

Terms acceptance must use the existing `POST /api/account/accept-terms`
contract. The app may show product-owned Terms/Privacy links and an
acknowledgement control, but it must not invent legal copy or mark onboarding
complete until the backend account refresh confirms accepted Terms.

## Permission States

Microphone and Accessibility are local-only macOS gates. They must never call
backend routes, upload audio, or send local permission details beyond sanitized
category metadata.

### Microphone

| Local signal | Onboarding state | Recovery/action | Privacy rule |
| --- | --- | --- | --- |
| Unknown/not determined | `microphone_required` | Explain why RubyWhisper needs the microphone; primary action requests permission | No recording starts before the user acts |
| Prompt open | `microphone_requesting` | Wait for system response; preserve focus and progress | No audio capture beyond the OS permission prompt |
| Granted | Continue to Accessibility gate | None | Store only granted status/check timestamp if needed |
| Denied | `microphone_recovery` | Offer `open_system_settings_microphone`; guide to System Settings > Privacy & Security > Microphone > RubyWhisper | No audio capture, upload, transcript, or retry loop |
| Restricted/unavailable/no input device | `microphone_recovery` | Explain the device cannot be used; offer retry after hardware/settings change | No audio capture or backend call |

Denied/restricted microphone states map to the local-only
`microphone_permission_denied` code from
`docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#local-only-macos-error-matrix`.

### Accessibility

| Local signal | Onboarding state | Recovery/action | Privacy rule |
| --- | --- | --- | --- |
| Not trusted/unknown | `accessibility_required` | Explain RubyWhisper needs Accessibility to insert text where the cursor is; primary action requests trust or opens settings | No insertion attempt |
| Prompt/settings open | `accessibility_requesting` | Poll only on app activation, explicit retry, or short bounded intervals | No content inspection |
| Trusted | Continue to test whisper gate | None | Store only trusted status/check timestamp if needed |
| Denied/not enabled after prompt | `accessibility_recovery` | Offer `open_system_settings_accessibility`; guide to System Settings > Privacy & Security > Accessibility > RubyWhisper | No content, clipboard, focused-field text, or backend call |
| Unavailable due to policy/profile | `accessibility_recovery` | Explain the Mac policy blocks the permission; offer retry after admin/settings change | No content inspection or backend call |

Denied/unavailable Accessibility states map to the local-only
`accessibility_permission_denied` code from
`docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#local-only-macos-error-matrix`.

## Test Whisper Contract

The test whisper is a real dictation-path smoke within onboarding, not a bypass
around auth or permissions. It may start only when all of these are true:

- Desktop session exists under the Keychain/session contract.
- Latest account refresh confirms Terms accepted.
- Latest account refresh confirms `canTranscribe: true` and an eligible plan
  state.
- Microphone permission is granted.
- Accessibility is trusted.

The test whisper should use the same upload, transient audio lifecycle,
backend-error mapping, insertion, and duplicate-risk rules as
`docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`. It must not store test audio,
raw transcript, cleaned text, context, dictionary terms, clipboard contents, or
provider payloads outside the approved local Recent Wisprs/recovery policy.

Recommended beta behavior:

- Use a RubyWhisper-owned test text field or explicit user-selected destination
  so the user can verify insertion without exposing private app content.
- Keep the island/onboarding UI stable through recording, processing, success,
  and recoverable error states.
- If insertion fails, preserve only final cleaned text in local recovery UI or
  Recent Wisprs and keep the user in `test_whisper_required`.
- If the backend returns `signed_out`, `terms_required`, `trial_exhausted`,
  `subscription_required`, `payment_failed`, or `account_blocked`, return to the
  corresponding earlier gate and require account refresh before another test.
- If provider/network errors are retryable, allow retry only within the retry
  and duplicate-risk boundaries in the upload contract.

## Ready State

`ready` means:

- The user has a valid desktop session.
- Terms/Privacy acceptance is confirmed by account refresh.
- Account eligibility currently allows transcription.
- Microphone permission is granted.
- Accessibility is trusted.
- Test whisper completed successfully in the current onboarding version.

Entering `ready` may enable normal hotkey dictation, menu bar status, account
summary, and trial word balance. Startup after a prior completion may skip
completed explanatory screens only after it revalidates session/account state
and local permissions. If any required gate regresses, the app must leave
`ready`, block dictation, and show the first unsatisfied recovery state.

## Local Completion Metadata

Local onboarding metadata may be stored in preferences or app settings because
it is non-secret state. Allowed fields:

- Onboarding schema/version.
- Highest completed step or per-step booleans.
- `onboardingCompletedAt` timestamp.
- Last app version/build that completed onboarding.
- Last non-secret account state category such as `trial_active`,
  `paid_active`, or `friend_of_ruby_active`.
- Last known microphone status category and check timestamp.
- Last known Accessibility trust category and check timestamp.
- Test-whisper completion flag, timestamp, and non-content outcome category.
- Whether the user dismissed optional explanatory copy.

This metadata is only a skip/resume hint. It must not override live session,
account, microphone, or Accessibility checks.

Never store or log in onboarding metadata:

- Audio payloads, audio filenames containing user content, raw transcripts,
  cleaned text, test-whisper text, context, clipboard text, selected text,
  dictionary terms, prompts, provider request/response bodies, local Recent
  Wisprs, or screenshots.
- Auth material, Keychain contents, magic links, exchange codes, nonce
  verifiers, session tickets, cookies, JWTs, authorization headers, private env
  values, provider keys, signing material, or payment credentials.
- Real customer emails, private account identifiers, Clerk/Supabase/Stripe/Groq
  IDs not explicitly approved as opaque support metadata, or device serials.

## Keyboard Accessibility And Guidance

Beta onboarding must be usable without a mouse:

- Every step, link, primary action, secondary action, retry action, and cancel
  action must be reachable by keyboard.
- Focus order must follow the visible step order and land on the next actionable
  control after each transition.
- `Return` or `Space` should activate the focused primary control where native
  macOS conventions allow it; `Escape` may cancel transient prompts without
  losing completed progress.
- Permission recovery screens must keep a retry/check-again control reachable
  after returning from System Settings.
- VoiceOver labels must name each step, current status, primary recovery action,
  and trial/account summary where shown.
- Permission states must not rely on color alone and must respect reduced-motion
  settings for progress and island animation.

System Settings guidance must be specific enough for beta users to recover
without support:

- Microphone: System Settings > Privacy & Security > Microphone > RubyWhisper.
- Accessibility: System Settings > Privacy & Security > Accessibility >
  RubyWhisper.
- When macOS provides a direct settings URL for the pane, the app may open it.
  If the URL fails or the OS version changes the pane, show the written path and
  a retry/check-again action.
- Guidance must not ask users to paste terminal commands, reveal private data,
  upload screenshots with customer data, or send diagnostic bundles containing
  audio/transcripts/clipboard/context.

## Downstream Leaves

This contract unblocks RW-062 implementation leaves for the onboarding
coordinator, sign-in/Terms/account gates, microphone permission, Accessibility
permission, test whisper, and completion metadata.

RUB-53 remains open for native implementation and manual validation. This
document is docs-only and does not claim that Swift onboarding, live permission
checks, live Clerk login, or live test-whisper QA have been performed.
