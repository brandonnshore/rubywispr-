# Backend To Desktop Error Contract

RubyWhisper desktop API routes must return stable, machine-readable errors that
the macOS app can map to island, onboarding, account, and recovery states. This
contract covers backend-originated responses and names the local-only macOS
errors that never need to round-trip through the backend.

Source requirements:

- `TECHNICAL_SPEC.md#API Contracts`
- `TECHNICAL_SPEC.md#Error Handling`
- `TECHNICAL_SPEC.md#Observability Rules`
- `WEB_DESIGN_SPEC.md#Component States`
- `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`
- `IMPLEMENTATION_PLAN.md` Wave 4 backend requirements

## Response Shape

Desktop-facing backend routes should use this shape for non-2xx responses:

```json
{
  "ok": false,
  "requestId": "req_0123456789",
  "error": {
    "code": "trial_exhausted",
    "message": "Upgrade to keep using RubyWhisper.",
    "retryable": false,
    "recovery": "open_checkout",
    "desktopState": "trial_exhausted"
  },
  "metadata": {
    "planState": "trial_exhausted",
    "trialWordsRemaining": 0
  }
}
```

Rules:

- `error.code` is the canonical machine code. Provisional `errorCode` fields may
  be mirrored only during migration from the initial spec examples.
- `message` is short, recoverable copy for the app to show or adapt.
- `recovery` names the primary action the desktop app should offer.
- `desktopState` maps directly to a macOS island, account, permission, or
  recovery state.
- `requestId` should be present when a request ID exists. It must be opaque and
  must not contain user IDs, session IDs, provider IDs, or timestamps that encode
  private data.
- `metadata` is optional and must use the allowlist below.
- All error responses must set `Cache-Control: no-store`.

## Metadata Allowlist

Backend error responses may include only metadata needed for recovery or support:

- `planState`
- `trialWordsRemaining`
- `trialWordsLimit`
- `monthlyWordsRemaining`
- `requestCount`
- `retryAfterSeconds`
- `windowStart`
- `windowEnd`
- `limit`
- `durationLimitMs`
- `audioDurationMs`
- `appVersion`
- `osVersion`
- `provider`
- `providerLatencyMs`
- `totalLatencyMs`

Never include audio, raw transcript, cleaned text, cleanup prompts, surrounding
context, clipboard contents, local Recent Wisprs, dictionary contents, provider
payloads, provider request bodies, provider response bodies,
Clerk/Supabase/Stripe/Groq IDs that are not already safe public or opaque
support IDs, auth tokens, session tickets, magic links, private env values, or
secrets.

## Backend Error Matrix

| Code | HTTP | Retryable | Desktop state | Recovery | User copy | Metadata-only logging allowance |
| --- | ---: | --- | --- | --- | --- | --- |
| `signed_out` | 401 | No | `signed_out` | `open_sign_in` | Sign in to use RubyWhisper. | `appVersion`, `osVersion` |
| `terms_required` | 403 | No | `signed_in_terms_required` | `open_terms_acceptance` | Accept Terms and Privacy to start dictating. | `planState` |
| `trial_exhausted` | 402 | No | `trial_exhausted` | `open_checkout` | Upgrade to keep using RubyWhisper. | `planState`, `trialWordsRemaining`, `trialWordsLimit` |
| `subscription_required` | 402 | No | `trial_exhausted` | `open_checkout` | Choose a plan to keep dictating. | `planState` |
| `payment_failed` | 402 | No | `payment_failed` | `open_billing` | Update billing to continue. | `planState` |
| `account_blocked` | 403 | No | `blocked` | `open_account` | This account cannot dictate right now. | `planState` |
| `rate_limited` | 429 | Yes, after delay | `error` | `retry_after` | Too many requests. Try again soon. | `retryAfterSeconds`, `requestCount`, `windowStart`, `windowEnd`, `limit` |
| `duration_limit_reached` | 413 | No | `duration_limit_reached` | `start_new_whisper` | Recordings are limited to 10 minutes. | `durationLimitMs`, `audioDurationMs` |
| `invalid_audio` | 422 | No | `error` | `record_again` | RubyWhisper could not read that audio. | `audioDurationMs` |
| `provider_error` | 503 | Yes, if no duplicate risk | `provider_error` | `retry` | RubyWhisper could not transcribe right now. | `provider`, `providerLatencyMs`, `totalLatencyMs` |
| `network_error` | 503 | Yes | `network_error` | `retry` | Check your internet connection and try again. | `totalLatencyMs` |
| `service_unavailable` | 503 | Yes | `error` | `retry` | RubyWhisper is temporarily unavailable. | `retryAfterSeconds`, `totalLatencyMs` |
| `internal_error` | 500 | Yes, if no duplicate risk | `error` | `retry_or_contact_support` | Something went wrong. Try again. | `totalLatencyMs` |

Status notes:

- `402` is reserved for plan, trial, subscription, and payment recovery states.
- `403` means the user is authenticated but blocked by account, Terms, or policy
  state.
- `413` is used for single-whisper duration cap failures.
- `422` is used for syntactically valid requests that cannot be processed, such
  as unsupported or unreadable audio.
- `503` covers provider, upstream network, and temporary service failures.
- Use `retryable: false` when a retry would repeat a rejected entitlement,
  duplicate a billable action, or mislead the user.

## Local-Only macOS Error Matrix

These codes are desktop-local states. They may be logged locally or mapped to
support metadata, but they should not be returned by backend routes unless a
future desktop support upload endpoint explicitly accepts sanitized diagnostics.

| Code | Desktop state | Recovery | User copy | Metadata-only logging/storage allowance |
| --- | --- | --- | --- | --- |
| `microphone_permission_denied` | `permission_denied` | `open_system_settings_microphone` | Allow microphone access in System Settings. | No audio |
| `accessibility_permission_denied` | `permission_denied` | `open_system_settings_accessibility` | Allow Accessibility so RubyWhisper can insert text. | No content |
| `no_text_field_focused` | `insertion_failed` | `focus_text_field` | Click a text box first. | Local cleaned text only |
| `insertion_failed` | `insertion_failed` | `retry_or_copy` | Click a text box first. | Local cleaned text only |
| `clipboard_unavailable` | `insertion_failed` | `manual_copy` | Copy the text manually. | Local cleaned text only |
| `desktop_offline` | `network_error` | `retry` | Check your internet connection and try again. | No server log unless request arrived |

The desktop app may keep final cleaned text in local Recent Wisprs according to
the local history policy. Backend routes must never store that content.

## Spec Coverage

Every error named in `TECHNICAL_SPEC.md#Error Handling` is covered here:

| Spec error | Canonical code | Origin |
| --- | --- | --- |
| Signed out | `signed_out` | Backend |
| Terms required | `terms_required` | Backend |
| Mic permission denied | `microphone_permission_denied` | Local-only macOS |
| Accessibility denied | `accessibility_permission_denied` | Local-only macOS |
| Trial exhausted | `trial_exhausted` | Backend |
| Payment failed | `payment_failed` | Backend |
| Provider down | `provider_error` | Backend |
| No text field focused | `no_text_field_focused` | Local-only macOS |
| Clipboard unavailable | `clipboard_unavailable` | Local-only macOS |
| Duration over cap | `duration_limit_reached` | Backend |

Additional Wave 4 backend codes from `IMPLEMENTATION_PLAN.md` are also
canonical here: `subscription_required`, `account_blocked`, `rate_limited`,
`invalid_audio`, `network_error`, `service_unavailable`, and `internal_error`.

## Desktop Mapper Notes

- The recording island must keep stable dimensions across `processing`,
  `error`, `provider_error`, `network_error`, `trial_exhausted`,
  `permission_denied`, and `insertion_failed` states.
- Provider/backend errors should show short recoverable copy and retry only when
  `retryable` is true and any retry delay has elapsed.
- `trial_exhausted` and billing states should route to checkout or account
  billing surfaces instead of repeated transcription retries.
- Insertion failures should preserve the final cleaned text only in local Recent
  Wisprs or local recovery UI; the backend must not receive that content.
- Permission failures should route to macOS System Settings and should not call
  backend routes. First-run permission recovery copy and keyboard accessibility
  requirements are defined in
  `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`.
- The island should not show transcript content. Local recovery surfaces may
  show local cleaned text only when the user explicitly opens them.

## Route Guidance

`POST /api/desktop/transcribe` should use these codes before provider work:

1. `signed_out` when Clerk auth is missing or invalid.
2. `terms_required` when `profiles.terms_accepted_at` is missing.
3. `account_blocked`, `payment_failed`, `subscription_required`, or
   `trial_exhausted` for entitlement failures.
4. `rate_limited` before accepting expensive provider work.
5. `duration_limit_reached` before accepting audio over the 10-minute cap.
6. `invalid_audio` before provider work when the body cannot be parsed.

Provider and cleanup failures should map to `provider_error`,
`network_error`, `service_unavailable`, or `internal_error` without returning or
logging provider payloads.

The desktop transcription route runs the rate-limit claim after auth, Terms,
and quota entitlement but before parsing audio or calling providers. The
production default uses the persistent per-user metadata counter store and
returns only `retryAfterSeconds`, `requestCount`, `windowStart`, `windowEnd`,
and `limit` for `rate_limited` responses. It must not store dictation content
or provider payloads.

`GET /api/desktop/account` should use `signed_out`, `service_unavailable`, or
`internal_error` for account retrieval failures. It should not return private
session, token, or provider data.

`POST /api/account/accept-terms` may keep its current account-route response
shape while RW-044B introduces the shared helper. When migrated for desktop
clients, missing acknowledgement remains a route validation error and missing
accepted Terms state elsewhere maps to `terms_required`.

## Logging And Observability

Backend logs may record:

- request ID
- user ID or opaque account ID
- plan state
- duration
- word count
- latency
- provider name
- app and OS version
- error code

Backend logs must omit text, audio, context, clipboard, prompts, provider
payloads, auth material, and private env values. User-facing support surfaces
should use `requestId` and `error.code` to investigate without exposing content.
