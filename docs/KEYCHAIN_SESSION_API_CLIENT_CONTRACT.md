# Keychain Session And Desktop API Client Contract

Status: Proposed contract for RW-063A. Mac implementation, repo-local Xcode
validation, and live authenticated endpoint smoke remain downstream work.

This contract defines the macOS session storage boundary and the desktop client
contract for RubyWhisper backend routes before RW-063 implementation begins. It
extends:

- `TECHNICAL_SPEC.md#NFR-004 Security`
- `TECHNICAL_SPEC.md#POST /api/desktop/transcribe`
- `TECHNICAL_SPEC.md#GET /api/desktop/account`
- `TECHNICAL_INFRASTRUCTURE.md#Local Mac Storage`
- `docs/DESKTOP_LOGIN_BRIDGE_CONTRACT.md`
- `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`
- `docs/USAGE_QUOTA_CONTRACT.md`

## Ownership Boundary

The macOS app owns only local session persistence and request attachment. The
RubyWhisper backend owns Clerk verification, account state, entitlement checks,
provider calls, usage metadata, billing state, and all provider credentials.

The desktop client must call RubyWhisper backend routes only. It must never call
Groq, Stripe, Supabase service-role APIs, Clerk secret APIs, or equivalent
provider-secret surfaces directly, and it must never embed those keys in the app
bundle, preferences, fixtures, docs, logs, PR text, Linear comments, crash
reports, or support payloads.

## Keychain Item Contract

Session material from the desktop login bridge must be stored only in macOS
Keychain. Plaintext token storage is forbidden in `UserDefaults`, preferences,
Application Support files, caches, local databases, local history, Recent
Wisprs, screenshots, docs, PRs, Linear, fixtures, logs, telemetry, crash
reports, and support metadata.

Auth material includes Clerk session values, desktop session tokens, JWTs,
cookies, one-time exchange codes, nonce verifiers, magic links, authorization
headers, refresh material if introduced later, private env values, and any
equivalent credential-bearing value.

Implementation leaves should use these placeholders until the imported Mac
source records final bundle identifiers and account naming:

| Field | Placeholder | Rule |
| --- | --- | --- |
| Keychain service | `com.rubywhisper.desktop.session` | Stable per desktop app environment. Add a suffix such as `.dev` only when development and production builds can coexist. |
| Keychain account | `primary` | Single signed-in account for v0.1. Multi-account support requires a later migration contract. |
| Access group | TBD after signing/import | Do not invent a shared access group before Apple Team ID and entitlements are known. |
| Accessible class | after-first-unlock, this-device-only equivalent | Prefer non-syncing, device-local storage unless a later security review explicitly approves iCloud Keychain sync. |

Access behavior:

- Read session material only to attach authenticated requests or derive the
  local signed-in/signed-out state.
- Keep in-memory copies short-lived. Do not mirror Keychain contents into app
  settings, diagnostics, or support state.
- Treat missing, unreadable, malformed, expired, or revoked session material as
  `signed_out`; delete malformed local material when safe and start a new login
  flow.
- Keychain reads and writes must return local-only errors that map to
  recoverable signed-out or retry states. They must not send raw Keychain error
  payloads to the backend.

Update behavior:

- Write or replace the Keychain item only after the login bridge exchange
  succeeds and before enabling dictation.
- Use an atomic add-or-update path so a partial write cannot leave old and new
  session material active at the same time.
- If the backend later rotates desktop session material, replace the existing
  item and immediately retry account refresh once with the new material.
- Never persist failed exchange payloads, rejected callbacks, expired exchange
  codes, or authorization headers.

Delete and logout behavior:

- User logout must delete the Keychain item, clear in-memory auth material,
  cancel in-flight authenticated requests where feasible, and set desktop auth
  state to `signed_out`.
- Backend `signed_out` from account refresh means the client must clear local
  session material unless a concurrent login attempt is already replacing it.
- Logout must not delete local Recent Wisprs, dictionary terms, or non-secret
  settings unless the user selects a separate data-clearing action.
- Support, crash, and analytics events for logout may record only category
  metadata such as `logout_requested`, `keychain_delete_succeeded`, or
  `keychain_delete_failed`.

Migration boundaries:

- v0.1 supports one current desktop account per app environment.
- Migration from temporary in-memory auth, alternate account names, iCloud
  Keychain sync, app group sharing, multiple accounts, token refresh storage, or
  changed service names requires a separate migration leaf and privacy review.
- No migration may copy tokens through plaintext files, fixtures, debug prints,
  workpads, screenshots, or support bundles.
- RUB-54 remains open until the Mac implementation and validation leaves prove
  Keychain storage, logout clearing, endpoint wiring, and secret absence.

## Desktop API Client Contract

The client should expose a small RubyWhisper backend API wrapper rather than
letting feature code build arbitrary network calls. The wrapper owns base URL
selection, auth attachment, app/OS metadata, response decoding, error mapping,
retry policy, and redaction.

Request rules:

- Base URL must point to the RubyWhisper web/backend origin for the current app
  environment.
- Attach auth only as the approved Clerk-authenticated desktop session context,
  currently an `Authorization: Bearer <redacted>` style header unless the login
  bridge implementation records a narrower server-issued format.
- Attach metadata needed by backend contracts: app version, build/channel when
  available, OS name/version, and platform `macos`.
- For cache-sensitive requests, send client no-store hints where the networking
  stack supports them and require backend success and error responses to include
  `Cache-Control: no-store`.
- Redact request headers, query strings, bodies, multipart filenames, response
  bodies, cookies, and redirect URLs before logging.
- Do not expose generic HTTP clients to recording, account, settings, or
  onboarding code paths when a typed RubyWhisper client method exists.

First-run onboarding, including the test whisper, must use this typed client for
account refresh and transcription requests. It must not build alternate network
calls or persist auth/account material outside this contract.

Forbidden request behavior:

- No direct provider calls from the desktop app.
- No Groq, Stripe, Supabase service-role, Clerk secret, Sentry auth, signing, or
  equivalent provider key in desktop source, config, fixtures, tests, logs, or
  bundled resources.
- No audio, transcript, cleaned text, context, clipboard text, dictionary terms,
  local history, or auth material in URLs, support metadata, crash reports, or
  network logs.

## `GET /api/desktop/account`

Purpose: refresh the desktop account and entitlement snapshot after login,
startup session restore, settings/account open, and selected recovery actions.

Request:

- Method: `GET`
- Auth: required desktop session context from Keychain.
- Metadata: app version, build/channel when available, OS version, and platform.
- Body: none.
- Cache: response must be treated as private and non-cacheable; backend success
  and error responses must set `Cache-Control: no-store`.

Success mapping:

| Backend signal | Desktop state | Dictation | Recovery |
| --- | --- | --- | --- |
| `accountStatus: "active"`, `planState: "trial_active"`, `canTranscribe: true` | `trial_active` | Enabled | Show trial metadata in account/settings. |
| `accountStatus: "active"`, `planState: "paid_active"`, `canTranscribe: true` | `paid_active` | Enabled | Show account/billing surface. |
| `accountStatus: "active"`, `planState: "friend_of_ruby_active"`, `canTranscribe: true` | `friend_of_ruby_active` | Enabled | Show account surface. |
| `accountStatus: "terms_required"` or `failureCode: "terms_required"` | `signed_in_terms_required` | Disabled | `open_terms_acceptance` |
| `failureCode: "trial_exhausted"` or `planState: "trial_exhausted"` | `trial_exhausted` | Disabled | `open_checkout` |
| `failureCode: "payment_failed"` or `planState: "payment_failed"` | `payment_failed` | Disabled | `open_billing` |
| `failureCode: "subscription_required"` | `trial_exhausted` | Disabled | `open_checkout` |
| `failureCode: "account_blocked"` or `planState: "blocked"` | `blocked` | Disabled | `open_account` |

Error mapping:

| Backend error | Desktop state | Session action | Retry boundary |
| --- | --- | --- | --- |
| `signed_out` | `signed_out` | Clear Keychain item and in-memory auth. | Do not retry without new login. |
| `service_unavailable` | `signed_out` until refresh succeeds | Keep existing Keychain item unless auth is explicitly rejected. | User-initiated or bounded background retry with backoff. |
| `internal_error` | `signed_out` until refresh succeeds | Keep existing Keychain item unless auth is explicitly rejected. | Bounded retry; avoid loops on app launch. |
| Transport offline before response | `network_error` or signed-out recovery UI | Keep Keychain item. | Retry only after network path changes or user action. |

The account response must never include private session, token, provider,
cookie, or env data. Billing portal links remain owned by a later account route;
the desktop account snapshot currently treats `billingPortalAvailable: false`
and `billingPortalUrl: null` as expected.

## `POST /api/desktop/transcribe`

Purpose: submit one authenticated desktop recording for entitlement checks,
provider transcription/cleanup through the RubyWhisper backend, usage metadata
updates, and final cleaned text return.

Recording artifact lifecycle, request assembly, retry, and duplicate-billing
rules are defined in `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`.

Request:

- Method: `POST`
- Auth: required desktop session context from Keychain.
- Body: audio as the backend-approved binary or multipart payload plus
  metadata. The client must not place audio or text in URL parameters.
- Metadata: `audioDurationMs`, app version, build/channel when available, OS
  version, platform, cleanup flags, and context/dictionary data only when the
  user has enabled those local settings.
- Cache: backend success and error responses must set
  `Cache-Control: no-store`.

Success mapping:

| Backend success field | Desktop handling |
| --- | --- |
| `requestId` | Opaque support handle only; never derive user/session/provider data from it. |
| `cleanedText` | Insert into focused field. If insertion fails, store locally only under the Recent Wisprs/recovery policy. |
| `cleanedWordCount` | Update usage display metadata only. |
| `trialWordsRemaining`, `planState` | Refresh island/account trial state without inventing parallel plan states. |

Error mapping:

| Backend error | Desktop state | Recovery | Retry boundary |
| --- | --- | --- | --- |
| `signed_out` | `signed_out` | `open_sign_in` | Clear local session; no retry without new login. |
| `terms_required` | `signed_in_terms_required` | `open_terms_acceptance` | Retry only after accepted Terms and account refresh. |
| `trial_exhausted` or `subscription_required` | `trial_exhausted` | `open_checkout` | No transcription retry until account state changes. |
| `payment_failed` | `payment_failed` | `open_billing` | No transcription retry until billing state changes. |
| `account_blocked` | `blocked` | `open_account` | No retry unless account state changes. |
| `rate_limited` | `error` | `retry_after` | Retry only after `retryAfterSeconds` or user action after delay. |
| `duration_limit_reached` | `duration_limit_reached` | `start_new_whisper` | No retry for the same over-limit audio. |
| `invalid_audio` | `error` | `record_again` | No retry for the same payload. |
| `provider_error`, `network_error`, `service_unavailable` | `provider_error` or `network_error` | `retry` | Retry only if no duplicate billable action was accepted; otherwise start a new recording. |
| `internal_error` | `error` | `retry_or_contact_support` | Bounded retry only when the backend indicates it is safe. |

The transcription route must remain a privacy gateway. The backend may process
audio, context, raw transcript, and cleaned text transiently, but it must not
persist those bodies. Desktop logs and support metadata may record only allowed
categorical/numeric metadata such as request ID, error code, duration, word
count, latency, provider category, app version, and OS version.

## Retry And Concurrency Boundaries

- Account refresh retries are safe only while they do not create user-visible
  account flicker or infinite launch loops.
- Transcription retries are allowed only for retryable backend errors and only
  when replaying the request cannot duplicate usage accounting or provider work.
- If a request times out after the backend may have accepted audio, prefer
  surfacing recovery and starting a new whisper over blind replay.
- Logout cancels or ignores responses from in-flight authenticated requests.
- A newer login attempt invalidates stale account refresh or transcription
  responses tied to the previous session.

## Sensitive-Data Rules

The following are forbidden in logs, support metadata, crash reporting,
analytics, tests, fixtures, screenshots, docs, PRs, Linear, local storage, and
temporary debug output:

- Plaintext tokens, auth headers, session tickets, cookies, JWTs, exchange
  codes, magic links, nonce verifiers, private env values, and provider keys.
- Groq, Stripe, Supabase service-role, Clerk secret, signing, Sentry auth, or
  equivalent provider credentials.
- Audio payloads, audio filenames containing user content, raw transcripts,
  cleaned text, cleanup prompts, surrounding context, clipboard text, local
  Recent Wisprs, and dictionary terms.
- Provider request bodies, provider response bodies, and provider-specific IDs
  unless a separate support contract has marked them safe and opaque.

Tests and fixtures must use synthetic placeholders such as
`session_placeholder_redacted`, `req_test_123`, and `user@example.test`. They
must not use real tokens, customer emails, private env values, recorded audio,
or production provider payloads.

## Downstream Leaves

This contract unblocks the RW-063 implementation leaves:

- RW-063B / RUB-234: implement Keychain-backed desktop session store.
- RW-063C / RUB-235: implement RubyWhisper backend API client shell.
- RW-063D / RUB-236: wire desktop account endpoint client and state mapping.
- RW-063E / RUB-237: wire transcription endpoint client boundary.
- RW-063F / RUB-238: add logout/session clearing and secret absence guardrails.
- RW-063G / RUB-239: record completion and downstream blockers.

Still blocked by Mac source import:

- Repo-local Xcode project path, bundle ID, Team ID, access group, schemes, and
  concrete Swift storage/client files.
- Runtime validation of Keychain reads/writes, logout clearing, endpoint wiring,
  app signing entitlements, and live authenticated desktop smoke.

RUB-54 must remain open until those Mac implementation and validation leaves
are complete. This document defines the contract only; it does not claim that
Mac storage or endpoint wiring exists.
