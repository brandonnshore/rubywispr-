# RW-068 Direct Insertion Contract

Status: Proposed contract for RW-068A. Swift/macOS implementation,
Accessibility automation, live target-app QA, screenshots/videos, and manual
completion remain downstream work in RW-068B through RW-068F.

This contract defines how RubyWhisper v0.1 decides whether direct insertion is
eligible, classifies insertion outcomes, times out conservatively, and preserves
the privacy boundary around target applications.

It extends:

- `TECHNICAL_SPEC.md#FR-017 Insertion`
- `TECHNICAL_SPEC.md#FR-018 Insertion failure recovery`
- `TECHNICAL_SPEC.md#Edge Cases`
- `WEB_DESIGN_SPEC.md#Recording Island`
- `docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`
- `docs/RW_069_CLIPBOARD_FALLBACK_CONTRACT.md`
- `docs/RW_070_RECENT_WISPRS_CONTRACT.md`
- `docs/qa/macos-manual-qa-harness.md#5-insertion-clipboard-fallback-and-target-apps`

## Ownership Boundary

The macOS app owns direct insertion eligibility, target category classification,
bounded insertion attempts, non-content success/failure signals, and handoff to
clipboard-safe recovery.

The backend owns auth, Terms, entitlement, quota, provider work, and the
transcription/cleanup response that produced final cleaned text. Direct
insertion must not call the backend, retry transcription, upload audio, or send
target-app data to any backend service.

RW-068 stops at deciding whether direct insertion can be trusted. Once direct
insertion is unavailable, failed, or ambiguous after final cleaned text exists,
RW-069 owns clipboard-safe fallback and local recovery.

## Eligibility Gates

The app may attempt direct insertion only when all gates pass:

| Gate | Required condition | Conservative failure |
| --- | --- | --- |
| Final text gate | Backend or local test-whisper flow has produced final cleaned text eligible for insertion. | If no final text exists, do not create insertion or fallback recovery. |
| Island state gate | The authoritative island/app state is `inserting` and no recording, upload, or unsafe retry recovery is active. | Stay in the current authoritative state; do not start a second attempt. |
| Permission gate | Required local insertion permission is trusted and usable. For Accessibility-based insertion this means Accessibility is trusted at the time of attempt. | `accessibility_recovery` before insertion; no target probing, clipboard read, or backend call. |
| Focus gate | A focused editable target is available through a non-content API or equivalent implementation seam. | `insertion_unavailable`; hand off to RW-069 recovery. |
| Target safety gate | The target category is allowed and is not secure, read-only, destructive, or otherwise unsafe. | `direct_insertion_skipped_unsafe`; hand off to RW-069 recovery. |
| Timeout gate | Classification and insertion complete within the bounded timeouts in this contract. | `direct_insertion_ambiguous`; hand off to RW-069 recovery. |

Eligibility checks must not read focused-field text, selected text, surrounding
document content, window titles, URLs, clipboard contents, screenshots, or
private target-app data.

## Target Categories

Allowed direct-insertion target categories for v0.1:

| Category | Examples for neutral QA setup | Direct insertion rule |
| --- | --- | --- |
| `plain_text_editor` | Empty TextEdit plain-text document or equivalent neutral editor. | Allowed when editable and non-secure. |
| `rich_text_editor` | Empty local Notes/Pages document or equivalent neutral editor. | Allowed when editable and non-secure; otherwise fall back. |
| `browser_text_field` | Local or staging test page with an empty text area/input. | Allowed when the focused element is editable and non-secure; do not inspect URL, page text, or form contents. |
| `messaging_draft_field` | Draft-only neutral message composer, not a real conversation. | Allowed only when no send action is invoked and insertion can be attempted without inspecting conversation content. |
| `email_draft_field` | Draft-only neutral email composer addressed to no one or a safe placeholder account. | Allowed only when no send action is invoked and insertion can be attempted without inspecting message content. |
| `code_editor` | Empty local scratch file in a code editor. | Allowed when editable and non-terminal. |

Unsafe targets for v0.1:

| Category | Examples | Required behavior |
| --- | --- | --- |
| `secure_input` | Password fields, secure text entry, hidden-entry fields. | Do not insert; do not read; hand off to recovery. |
| `read_only_or_disabled` | Read-only fields, disabled controls, rendered documents, previews. | Do not insert; hand off to recovery. |
| `no_focused_target` | Desktop, menu bar, unfocused app, unsupported focus owner. | `insertion_unavailable`; hand off to recovery. |
| `terminal_or_shell` | Local terminal, remote shell, console, REPL. | Do not insert by default because inserted text could execute commands. |
| `production_or_admin_surface` | Production admin pages, live billing, customer-data tools. | Do not use for QA or evidence; if detected or uncertain, fail conservatively. |
| `private_conversation_or_real_email` | Real messages, private notes, real email drafts. | Do not use for QA or evidence; do not inspect content to decide. |
| `unknown_or_unclassified` | Any target the implementation cannot classify safely. | Treat as unsafe; hand off to recovery. |

Target category is support-safe metadata. App names, bundle identifiers, window
titles, document names, URLs, recipient names, conversation names, selected text,
focused-field text, and clipboard contents are not support-safe metadata.

## Outcome States

Downstream implementations must classify every direct insertion attempt into one
terminal outcome before updating Recent Wisprs or recovery UI.

| Outcome | Trigger | User-visible mapping | Recent Wisprs mapping | Recovery mapping |
| --- | --- | --- | --- | --- |
| `direct_insertion_succeeded` | A non-content insertion API reports success, or the approved implementation can reasonably infer success without reading target content. | `success` then hide/idle per island contract. | `inserted` | No fallback. |
| `insertion_unavailable` | No focused editable target, permission unavailable before attempt, or preflight cannot establish an allowed target. | `insertion_failed` with `Click a text box first.` or permission recovery if permission failed before final text. | `insertion_failed` only if final text exists. | RW-069 `insertion_unavailable`. |
| `direct_insertion_failed` | The insertion attempt returns a deterministic failure or target rejection without inserting text. | `insertion_failed`. | `insertion_failed` | RW-069 fallback copy or manual copy recovery. |
| `direct_insertion_skipped_unsafe` | Target is secure, read-only, terminal/shell, production/admin, private, or unknown. | `insertion_failed` or the more specific local recovery copy allowed by the island contract. | `insertion_failed` | RW-069 recovery; no automatic retry into same target. |
| `direct_insertion_ambiguous` | Timeout, target changes during attempt, non-content signals conflict, app is canceled mid-attempt, or the implementation cannot prove success/failure without reading content. | `insertion_failed`; do not show success. | `insertion_failed` | RW-069 recovery; no automatic retry unless a later implementation proves duplicate insertion is impossible. |

`direct_insertion_succeeded` is the only outcome that may produce island
`success` or Recent Wisprs `inserted`. Fallback copy, manual copy, or pasteboard
handoff must never be labeled as direct insertion success.

## Success And Failure Detection

Allowed success signals:

- A platform insertion API or target adapter returns a success result for the
  write operation without exposing existing target content.
- An implementation-specific non-content acknowledgement says the edit command
  was accepted by the focused editable target.
- A target adapter designed for tests reports success through a synthetic seam
  that contains no user content.

Allowed failure signals:

- Permission trust is absent before the attempt.
- No focused editable target is exposed by non-content focus APIs.
- The target role/category is secure, read-only, unsupported, or unknown.
- The insertion API returns a deterministic failure or target rejection.
- Target focus or category changes before the attempt reaches a trusted terminal
  signal.

Forbidden verification:

- Reading field value before or after insertion.
- Reading selected text or surrounding document text.
- Reading clipboard contents to infer paste success.
- Taking screenshots or using OCR of the target app.
- Logging target app names, private window/document titles, URLs, recipients, or
  conversation identifiers.

## Timeout Behavior

Direct insertion must be bounded. Implementation leaves may choose smaller
timeouts, but v0.1 must not exceed these limits without a reviewed contract
change:

| Timeout | Maximum | Applies to |
| --- | ---: | --- |
| `targetPreflightTimeoutMs` | `250` | Permission/focus/category checks before writing final text. |
| `directInsertionAttemptTimeoutMs` | `1500` | The write operation from attempt start to terminal outcome. |
| `postInsertSignalTimeoutMs` | `500` | Optional non-content acknowledgement after the write operation returns. |

If any timeout expires after final cleaned text exists, the outcome is
`direct_insertion_ambiguous`. The app must preserve local recovery and hand off
to RW-069. It must not keep polling target content, retry the same write in the
background, or show success after an ambiguous timeout.

## Privacy Requirements

Direct insertion is local-only and metadata-only.

Must not be read, logged, persisted outside approved local recovery, included in
analytics/support diagnostics, posted to Linear/GitHub, or sent to backend or
provider services as part of insertion:

- target text before insertion
- target text after insertion
- selected text
- surrounding document or conversation text
- clipboard contents or previous pasteboard snapshots
- screenshots or OCR output from target apps
- private app names, bundle identifiers, window titles, document names, URLs,
  recipients, channels, or conversation identifiers
- audio, raw transcript, provider payloads, cleanup prompts, or final cleaned
  text in insertion telemetry
- private env values, auth material, or customer-derived examples

Allowed direct-insertion diagnostics are categorical or numeric metadata only:

- outcome state
- target category
- unsafe category
- permission category
- timeout bucket
- duration/latency bucket
- app version and OS version
- support-safe request ID from the backend response, if already returned

The app may use final cleaned text locally to perform insertion and to create
approved local recovery under `docs/RW_070_RECENT_WISPRS_CONTRACT.md`. That text
must not be displayed in the island and must not be sent as insertion telemetry.

## Test Seams

Downstream RW-068 implementation leaves should be testable without launching or
inspecting real target apps. Use protocols, small interfaces, or equivalent
seams for:

- `InsertionTargetClassifier`: returns allowed/unsafe target category without
  exposing target content or private app/window data.
- `InsertionPermissionPort`: reports trusted, denied, unavailable, or
  policy-blocked insertion permission.
- `DirectInsertionPort`: attempts the write and returns only terminal outcome
  categories.
- `InsertionClock` or scheduler: enforces bounded preflight, attempt, and
  acknowledgement timeouts without real sleeps in unit tests.
- `InsertionEventSink`: accepts categorical metadata only and rejects
  content-bearing payloads.
- `RecoveryHandoff`: passes final text to the approved RW-069/RW-070 local
  recovery path without backend calls.

Unit tests must use synthetic placeholders and must not include real target
text, selected text, clipboard contents, screenshots, URLs, document/window
titles, recipient names, recorded audio, raw transcripts, cleaned text examples,
env values, or secrets.

Minimum downstream coverage:

- allowed target categories can reach `direct_insertion_succeeded` through
  non-content success seams
- secure, read-only, terminal/shell, unknown, and no-focused-target categories
  do not attempt unsafe insertion
- deterministic insertion failure maps to `direct_insertion_failed`
- timeout and target-change paths map to `direct_insertion_ambiguous`
- only `direct_insertion_succeeded` maps to Recent Wisprs `inserted`
- all other final-text outcomes hand off to RW-069 and Recent Wisprs
  `insertion_failed`
- event/log sinks omit target text, selected text, clipboard contents, app/window
  identifiers, final text, audio, transcripts, and provider payloads

## Acceptance Criteria For Implementation Leaves

- Direct insertion is attempted only after all eligibility gates pass.
- Allowed and unsafe target categories are implemented as explicit categories,
  with unknown targets treated as unsafe.
- Success, failure, unavailable, unsafe-skipped, and ambiguous outcomes are
  terminal and map to island, Recent Wisprs, and RW-069 recovery states.
- Direct insertion attempts are bounded by documented timeouts.
- No target text, selected text, clipboard content, screenshot/OCR content,
  private app/window data, or final cleaned text is read for verification or
  emitted in insertion diagnostics.
- Tests cover target classification, permission gating, success/failure,
  timeout/ambiguous handling, recovery handoff, and privacy event seams without
  live Accessibility automation.

## Validation

Run from the repository root after changing this contract or downstream direct
insertion implementation:

```bash
git diff --check
npm run test:auth-privacy
```

If dependencies are absent in a Symphony workspace, run `npm ci` first, then
rerun `npm run test:auth-privacy`.

For contract discoverability:

```bash
rg -n "RW_068_DIRECT_INSERTION_CONTRACT|direct_insertion_succeeded|direct_insertion_failed|direct_insertion_ambiguous|direct_insertion_skipped_unsafe|targetPreflightTimeoutMs|directInsertionAttemptTimeoutMs" TECHNICAL_SPEC.md WEB_DESIGN_SPEC.md docs
```

Before PR handoff, inspect changed files for forbidden private payload examples
or env values:

```bash
git diff --cached --name-only --diff-filter=ACM | xargs rg -n "sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE)|[A]PI_KEY=|[S]ECRET=|[T]OKEN=|[P]ASSWORD=|example.*(clip[b]oard|trans[c]ript|au[d]io|cleaned[ -]text|focused[ -]field|selected[ -]text)|real.*(clip[b]oard|trans[c]ript|au[d]io|cleaned[ -]text|focused[ -]field|selected[ -]text)"
```

Expected result for the final command is no real private payloads. Mentions of
forbidden categories as policy text are allowed only when they do not include
example content.
