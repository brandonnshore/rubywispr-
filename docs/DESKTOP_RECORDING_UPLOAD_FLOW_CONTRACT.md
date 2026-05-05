# Desktop Recording Upload Flow Contract

Status: Proposed contract for RW-065A. Swift/macOS implementation, backend
endpoint changes, live provider calls, and manual/live validation remain
downstream work.

This contract defines how one completed local recording becomes one authenticated
`POST /api/desktop/transcribe` request, how the desktop app handles the backend
response, and where privacy and duplicate-billing boundaries sit.

It extends:

- `TECHNICAL_SPEC.md#POST /api/desktop/transcribe`
- `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md#post-apidesktoptranscribe`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/USAGE_QUOTA_CONTRACT.md`

## Authority And Ownership

The desktop app owns recording capture, short-lived local audio handling,
request assembly, authenticated upload through the RubyWhisper API client,
response-to-state mapping, insertion, local recovery UI, and local cleanup.

The RubyWhisper backend owns Clerk session verification, Terms/account/quota
checks, rate limiting, provider calls, cleanup, word counting, usage metadata,
and all provider credentials.

The desktop app must call only the RubyWhisper backend for transcription. It
must never call Groq, OpenAI-compatible provider endpoints, Stripe, Supabase
service-role APIs, Clerk secret APIs, or equivalent provider-secret surfaces
directly, and it must never include those keys in the app bundle, settings,
fixtures, docs, logs, crash reports, support payloads, PR text, or Linear
comments.

If older product or fork notes mention desktop provider/API-key settings, this
contract supersedes those notes for v0.1 authenticated RubyWhisper uploads.
Provider selection and provider secrets are server-side only unless a later
approved privacy/security contract changes that boundary.

## Flow Summary

```text
recording
  -> local stop completes
  -> transient audio artifact sealed
  -> request metadata assembled
  -> RubyWhisper API client attaches Keychain session
  -> POST /api/desktop/transcribe
  -> backend returns cleaned text or canonical error
  -> desktop maps response to state
  -> transient audio and request body are destroyed
```

Required sequence:

1. Stop recording and close the local recorder handle before upload begins.
2. Compute `audioDurationMs` from trusted local recording timing or media
   duration metadata; do not derive duration from transcript or provider output.
3. Reject or stop over-limit recordings locally when possible. The backend still
   remains the authority for `duration_limit_reached`.
4. Assemble one typed RubyWhisper transcription request through the API client
   from `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`; feature code must not
   construct arbitrary network calls.
5. Attach auth from Keychain only as the approved desktop session context.
6. Send audio only in the backend-approved binary or multipart body. Do not put
   audio, text, context, dictionary terms, filenames with user content, auth
   material, or metadata containing user content in URLs.
7. Treat backend success and error responses as `Cache-Control: no-store`.
8. On success, insert `cleanedText` into the focused field. If insertion fails,
   preserve cleaned text only under the approved local Recent Wisprs/recovery
   policy.
9. On any terminal success, failure, cancel, logout, or app shutdown path,
   delete or release the transient audio artifact and any in-memory request body
   buffers.

## Audio Artifact Lifecycle

Allowed audio artifact:

- One in-memory buffer or one temporary file produced by the active recording.
- The artifact exists only from recording start until the active upload attempt
  reaches a terminal local state.
- If a temporary file is required by the recorder or networking stack, it must
  live in a private app-controlled temporary location, be excluded from backup
  where the platform supports that flag, and use a content-free generated name.

Forbidden audio handling:

- No recorded audio in Application Support history, Recent Wisprs, caches,
  user-selected export locations, fixtures, screenshots, logs, crash reports,
  support bundles, analytics, PRs, docs, Linear comments, or debug output.
- No audio retention for later retry after the upload request has an ambiguous
  acceptance state.
- No user speech, destination app text, transcript snippets, dictionary terms,
  or clipboard text in audio filenames, multipart filenames, or log labels.

Cleanup points:

| Point | Required cleanup |
| --- | --- |
| User cancels before upload starts | Stop recorder, delete temporary audio, clear upload buffers, return to `idle` or local recovery state. |
| Local validation rejects duration/format | Delete temporary audio after local state is set; do not upload the same artifact. |
| Upload fails before any bytes leave the app | Delete or keep only long enough for one explicit user retry; never write to durable storage. |
| Upload starts and then times out, disconnects, or is canceled | Treat backend acceptance as ambiguous; delete audio and require a new recording instead of blind replay. |
| Backend returns success or canonical error | Map state, then delete audio and request buffers immediately. |
| Logout or session replacement occurs | Cancel or ignore in-flight upload, delete audio and buffers, clear auth-derived request state. |
| App termination/crash recovery starts | Best-effort scan and deletion of RubyWhisper-owned transient recording files before enabling a new recording. |

The desktop app may record only sanitized lifecycle flags such as
`temporaryAudioDeleted: true`, `uploadStarted: true`,
`acceptedStateAmbiguous: true`, or `cleanupSucceeded: false`. These flags must
not include file paths, filenames, transcript text, or user content.

## Request Assembly

The desktop request body must contain only the fields accepted by
`TECHNICAL_SPEC.md#POST /api/desktop/transcribe` and the API client contract.

| Field | Source | Redaction and privacy rule |
| --- | --- | --- |
| `audio` | The sealed transient recording artifact. | Body only. Never URL, log, fixture, support payload, or durable storage. |
| `audioDurationMs` | Integer milliseconds from local recorder elapsed time or media duration. | Numeric only. Round or clamp to an integer; no audio-derived content. |
| `appVersion` | App bundle version. | Safe metadata. Omit if unavailable rather than inventing a value. |
| `build` / `channel` when supported | App bundle or release channel config. | Safe metadata only; no signing, CI, env, or credential values. |
| `osVersion` | macOS version from system APIs. | Safe metadata. Do not include username, hostname, device name, or serials. |
| `platform` | Constant `macos`. | Safe metadata. |
| `cleanupEnabled` | User cleanup setting, default enabled. | Boolean only. |
| `contextAwareCleanupEnabled` | User context-aware cleanup setting after Terms/Privacy acceptance. | Boolean only. If false, omit `context`. |
| `context` | Optional transient context collected under approved local setting. | Body only, never log/store. Omit if disabled, unavailable, too large, or unsafe to collect. |
| `dictionaryTerms` | Optional local user dictionary/custom vocabulary when enabled. | Body only, never log/store. Omit if disabled or empty. |

Redaction rules:

- Request logs may include only categorical/numeric metadata from
  `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#metadata-allowlist`, plus local
  cleanup flags that contain no content.
- Headers, auth, request bodies, multipart boundaries, multipart filenames,
  response bodies, redirect URLs, cookies, query strings, context, dictionary
  terms, and cleaned text must be redacted from logs and diagnostics.
- Dictionary data and context are user content. They may be sent transiently to
  the backend only when the user-enabled local settings allow it; otherwise omit
  the fields entirely.
- Clipboard content must not be sent in the upload request unless a future
  approved contract explicitly defines a context source and user control for it.

## Response And State Mapping

The backend success response is authoritative for insertion and usage display:

| Backend success field | Desktop handling |
| --- | --- |
| `requestId` | Opaque support handle only. Safe to show/copy in support surfaces; never parse for user, session, provider, or timestamp data. |
| `cleanedText` | Insert into the focused field. If insertion fails, keep only under the local Recent Wisprs/recovery policy. |
| `cleanedWordCount` | Update usage display metadata only. |
| `trialWordsRemaining` | Refresh trial/account display without storing transcript content. |
| `planState` | Map to the existing account state machine; do not invent parallel plan states. |

Backend errors must map through
`docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#backend-error-matrix` and the API client
contract:

| Backend code | Desktop state | Recovery | Same-audio retry |
| --- | --- | --- | --- |
| `signed_out` | `signed_out` | `open_sign_in`; clear Keychain and in-memory auth. | No. New login required. |
| `terms_required` | `signed_in_terms_required` | `open_terms_acceptance`. | No. Retry only after Terms and account refresh. |
| `trial_exhausted` | `trial_exhausted` | `open_checkout`. | No. Account state must change. |
| `subscription_required` | `trial_exhausted` | `open_checkout`. | No. Account state must change. |
| `payment_failed` | `payment_failed` | `open_billing`. | No. Billing state must change. |
| `account_blocked` | `blocked` | `open_account`. | No. Account state must change. |
| `rate_limited` | `error` | `retry_after`. | Only after `retryAfterSeconds`, and only if the client still has a pre-upload artifact with no acceptance ambiguity. |
| `duration_limit_reached` | `duration_limit_reached` | `start_new_whisper`. | No. Same audio is over limit. |
| `invalid_audio` | `error` | `record_again`. | No. Same payload is invalid. |
| `provider_error` | `provider_error` | `retry`. | Only when backend returned a retryable response before accepting billable/usage work or otherwise made duplicate risk impossible. |
| `network_error` | `network_error` | `retry`. | Only for local failures before bytes were sent. If request acceptance is ambiguous, start a new recording. |
| `service_unavailable` | `error` | `retry`. | Only when no request acceptance ambiguity exists and any retry delay has elapsed. |
| `internal_error` | `error` | `retry_or_contact_support`. | Only when backend indicates retry is safe and no duplicate risk exists. |

Local-only macOS errors from
`docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#local-only-macos-error-matrix` stay
local. Microphone and accessibility permission failures must not upload audio.
Insertion failures must not call the backend again with cleaned text.

The recording island must not show transcript content. It may show short
recoverable state copy and actions. Local recovery surfaces may show cleaned
text only under the approved Recent Wisprs/recovery policy.

## Retry And Duplicate-Billing Boundary

One completed recording creates at most one backend upload attempt unless the
client can prove no bytes left the app.

Safe retry cases:

- Local network stack failure before request body upload starts.
- Backend returns a canonical retryable error with no accepted-request ambiguity
  and any `retryAfterSeconds` delay has elapsed.
- User explicitly retries while the original transient artifact still exists
  only in active memory/temp scope and before any upload acceptance ambiguity.

Unsafe retry cases:

- Timeout after upload body transmission started.
- Network disconnect after any bytes were sent.
- App cancellation or logout while a request may be in flight.
- No HTTP response after the backend may have accepted the request.
- Backend returns a non-retryable entitlement, duration, or invalid-audio error.
- Any case where replaying the same audio could duplicate provider work, quota
  deduction, or paid provider cost.

For unsafe retry cases, delete the transient audio and ask the user to start a
new whisper. The UI may show a support-safe `requestId` only if the backend
returned one.

## Storage, Logging, And Privacy Rules

Forbidden outside approved local policies:

- Audio payloads and audio filenames containing user content.
- Raw transcripts.
- Cleaned text.
- Cleanup prompts.
- Context and clipboard content.
- Dictionary terms/custom vocabulary.
- Provider request bodies, response bodies, IDs not approved as opaque support
  IDs, and provider error payloads.
- Auth material, private env values, session tokens, magic links, cookies, and
  provider keys.

Approved local policies for v0.1:

- Keychain may store only session material as defined in
  `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`.
- Recent Wisprs/recovery may store final cleaned text only under its local
  retention and user-control policy. It must not store audio or backend/provider
  payloads.
- App settings may store booleans and local preferences such as cleanup enabled,
  context-aware cleanup enabled, and whether dictionary support is enabled. They
  must not store provider secrets.
- Support and analytics may record only metadata categories/numbers allowed by
  `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#metadata-allowlist` plus local
  cleanup lifecycle flags without paths or user content.

Backend privacy:

- The backend may process audio, optional context, dictionary data, raw
  transcript, and cleaned text transiently for a single request.
- The backend must not persist audio, raw transcript, cleaned text, context,
  clipboard content, dictionary terms, provider request bodies, or provider
  response bodies.
- Usage, billing, observability, and support state may store metadata only:
  request ID, account/user reference, plan state, word count, duration, latency,
  provider category, app/OS version, and canonical error code.

## Downstream Leaves

This contract unblocks RW-065 implementation leaves for transient audio
lifecycle, backend-compatible request assembly, API client upload wiring,
success/error state mapping, and completion-gate documentation.

RUB-56 / RW-065 remains open for implementation and live/manual validation after
this contract lands. This document does not claim that Mac source import,
runtime upload wiring, repo-local Xcode validation, authenticated endpoint
smoke, or live Groq validation has been completed.
