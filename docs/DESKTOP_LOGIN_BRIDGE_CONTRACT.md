# Desktop Browser Login Bridge Contract

Status: Proposed contract for RW-061A. Mac implementation, durable Keychain
storage, and live Clerk smoke validation remain downstream work.

This contract defines how the macOS app starts browser-based Clerk magic-link
login and returns to a desktop signed-in state without exposing auth material.
It extends:

- `TECHNICAL_SPEC.md#FR-002 Magic link`
- `TECHNICAL_SPEC.md#GET /api/desktop/account`
- `TECHNICAL_INFRASTRUCTURE.md#Clerk`
- `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/USAGE_QUOTA_CONTRACT.md`
- `apps/web/README.md#Auth Privacy Validation Contract`

## State Machine

The desktop auth coordinator should model login as explicit states:

```text
signed_out
  -> login_launching
  -> browser_pending
  -> handoff_pending
  -> session_exchanging
  -> account_refreshing
  -> signed_in_terms_required
  -> trial_active
  -> trial_exhausted
  -> paid_active
  -> friend_of_ruby_active
  -> payment_failed
  -> blocked
```

Failure, timeout, user cancel, nonce mismatch, invalid callback, exchange
failure, and account refresh failure return to `signed_out` with a recoverable
local error. The app must not allow recording or transcription while it is in
`signed_out`, `login_launching`, `browser_pending`, `handoff_pending`,
`session_exchanging`, or `account_refreshing`.

## Handoff Sequence

1. Signed-out action: when a user selects sign in or attempts first dictation,
   the app enters `login_launching` and creates a local login attempt with an
   opaque `state`, a nonce verifier, an expiry timestamp, and a local attempt
   ID. These values are not user IDs and must be unguessable.
2. Browser login entry: the app opens the web sign-in entry owned by the Next.js
   app, currently the Clerk email-link route shell under `/sign-in`. The launch
   request may include only non-secret correlation metadata such as `state`,
   platform, app version, and a declared handoff mode.
3. Nonce/state handling: the web side must bind the browser session attempt to
   the desktop `state`. The desktop app must reject any callback, deep link,
   polling completion, or exchange response whose `state` does not match the
   current pending attempt or whose attempt is expired.
4. Browser auth: the user completes Clerk email magic-link login in the
   browser. Magic-link URLs, Clerk session cookies, JWTs, and equivalent auth
   material stay in the browser and server-side Clerk flow; the desktop app must
   not receive or parse the magic link itself.
5. Callback or polling handoff: after browser auth succeeds, the web side may
   complete the attempt through either approved handoff:
   - Preferred callback: open a custom scheme or universal link such as
     `rubywhisper://auth/callback` with `state` plus a short-lived single-use
     exchange code.
   - Fallback polling: the desktop app polls a desktop-login status endpoint
     using the pending `state` and nonce proof until it receives pending,
     completed, expired, canceled, or failed status.
6. Session exchange: the desktop app sends `state`, nonce proof, and the
   single-use exchange code or completed polling proof to the server over HTTPS.
   The exchange response may return only the desktop session material required
   for Clerk-authenticated desktop API requests plus metadata needed for
   recovery. It must set `Cache-Control: no-store`.
7. Account refresh: immediately after exchange, the desktop app calls
   `GET /api/desktop/account` with the resulting authenticated request context.
   It maps the account snapshot or error response through the tables below
   before enabling any dictation entry point.
8. Completion: the app enters the mapped signed-in desktop auth state. Durable
   storage of session material belongs to RW-063 Keychain work. Until that work
   lands, Mac implementation leaves may keep session material only in memory or
   behind a temporary test seam that cannot persist to `UserDefaults`,
   Application Support files, logs, screenshots, workpads, PR text, or docs.
9. Cancel and expiry: closing the browser, ignoring the magic link, receiving
   an expired callback, or timing out polling leaves the user `signed_out`.
   Recovery is to open sign-in again with a new `state` and nonce.

## Token Handling Rules

Auth material includes magic links, Clerk tickets, Clerk session IDs, JWTs,
session tokens, cookies, authorization headers, one-time exchange codes, nonce
verifiers, private env values, and any equivalent credential-bearing value.

Rules:

- Never log, print, summarize, paste, screenshot, attach, or document auth
  material in Linear, PR bodies, commit messages, workpads, test fixtures, docs,
  telemetry, crash reports, support payloads, or terminal output.
- Never place auth material in local history, Recent Wisprs, dictionary storage,
  app preferences, `UserDefaults`, or non-Keychain files.
- Never include auth material in request IDs, user-facing errors, account
  snapshots, support metadata, or backend error metadata.
- Redact request and response bodies, headers, cookies, query strings, and deep
  link URLs before logging. Prefer logging only attempt lifecycle categories:
  started, browser_opened, callback_received, exchange_succeeded,
  account_refresh_succeeded, canceled, expired, failed.
- Use synthetic placeholders only in tests and docs. Do not use real customer
  email addresses, real Clerk IDs beyond approved opaque support metadata, live
  magic links, live session values, or private env values.
- Session persistence is not part of RW-061A. Durable desktop storage is
  delegated to RW-063 Keychain work; desktop workers must not invent alternate
  storage.

## Account State Mapping

`GET /api/desktop/account` is the post-login source of truth for desktop account
state. Its response shape is defined in `TECHNICAL_SPEC.md#GET
/api/desktop/account`, and its backend errors are defined in
`docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`.

| Backend/account signal | Desktop auth state | Dictation | Primary recovery |
| --- | --- | --- | --- |
| Missing, invalid, or revoked auth; backend error `signed_out` | `signed_out` | Disabled | `open_sign_in` |
| `accountStatus: "terms_required"` or `failureCode: "terms_required"` | `signed_in_terms_required` | Disabled | `open_terms_acceptance` |
| `accountStatus: "active"`, `planState: "trial_active"`, `canTranscribe: true` | `trial_active` | Enabled | Show trial metadata in account/settings |
| `failureCode: "trial_exhausted"` or `planState: "trial_exhausted"` | `trial_exhausted` | Disabled | `open_checkout` |
| `accountStatus: "active"`, `planState: "paid_active"`, `canTranscribe: true` | `paid_active` | Enabled | Account/billing view |
| `accountStatus: "active"`, `planState: "friend_of_ruby_active"`, `canTranscribe: true` | `friend_of_ruby_active` | Enabled | Account view |
| `failureCode: "payment_failed"` or `planState: "payment_failed"` | `payment_failed` | Disabled | `open_billing` |
| `failureCode: "account_blocked"` or `planState: "blocked"` | `blocked` | Disabled | `open_account` |
| `failureCode: "subscription_required"` | `trial_exhausted` | Disabled | `open_checkout` |
| Backend error `service_unavailable` or `internal_error` during refresh | `signed_out` until refresh succeeds | Disabled | retry refresh or sign in again |

The backend error contract remains canonical for stable machine codes,
retryability, `desktopState`, and `recovery` values. The usage quota contract
remains canonical for `trial_active`, `trial_exhausted`, `paid_active`,
`friend_of_ruby_active`, `payment_failed`, `blocked`, and
`subscription_required` entitlement semantics. First-run onboarding must consume
these auth/account states through
`docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md` before requesting microphone
or Accessibility permissions.

## Source-Contract Readiness

Ready in this repo:

- Browser sign-in and sign-up route shell exists under `apps/web/src/app/(auth)`.
- Server-side Clerk auth helper and account/session checks exist under
  `apps/web/src/lib/auth`.
- `GET /api/desktop/account` already maps Clerk-verified users to account,
  subscription, usage, Terms, and failure metadata with `Cache-Control:
  no-store`.
- Desktop API errors use `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md` and must omit
  private session, token, provider, and env data.
- Auth privacy guardrails are documented in `apps/web/README.md#Auth Privacy
  Validation Contract`.

Blocked or downstream:

- Mac source import and auth coordinator implementation are blocked until the
  macOS app import path lands.
- RW-061B owns the signed-out Mac auth coordinator and local state model.
- RW-061C owns browser launch plus callback/deep-link or polling handling.
- RW-061D owns exchange integration, account refresh wiring, and Keychain
  session storage handoff with RW-063.
- RW-061E owns dictation gating on signed-in account state.
- RW-061F owns completion notes and live validation blocker recording.
- Live Clerk manual smoke and real magic-link QA remain out of scope for this
  contract and keep RUB-52 open until Mac implementation and validation finish.

## Validation Expectations

Implementation leaves should add tests at their layer:

- Web/backend leaves: mocked auth-start, callback/polling, exchange, account
  refresh, no-store headers, and auth privacy guardrails.
- Mac leaves: state-machine unit tests for success, cancel, timeout, nonce
  mismatch, invalid callback, exchange failure, account refresh failure, and
  all account state mappings above.
- Manual validation leaves: approved Clerk development or staging magic-link
  smoke with sanitized evidence only. Do not capture magic-link URLs, session
  values, cookies, tokens, private env values, or customer data.

RUB-52 must remain open until the Mac implementation and live validation leaves
complete. This document only defines the bridge contract.
