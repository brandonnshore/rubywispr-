# RW-070 Recent Wisprs Local Storage And Privacy Contract

Status: Proposed contract for RW-070A. Mac local persistence, settings UI,
manual QA, and audit completion remain downstream work in RW-070B through
RW-070F. This document is the source-safe contract for Recent Wisprs storage,
retention, recovery, and no-sync privacy boundaries.

This contract extends:

- `TECHNICAL_SPEC.md#FR-018 Insertion failure recovery`
- `TECHNICAL_SPEC.md#FR-019 Clipboard fallback`
- `TECHNICAL_SPEC.md#FR-020 Recent Wisprs`
- `WEB_DESIGN_SPEC.md#Recent Wisprs`
- `IMPLEMENTATION_PLAN.md#M4 Settings, history, dictionary, and billing portal`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`
- `docs/USAGE_QUOTA_CONTRACT.md`

It also defines the shared boundary for RW-069 clipboard-safe recovery, RW-072
settings/history controls, and RW-100 privacy storage/log audit.

## Scope Boundary

Recent Wisprs is a local macOS recovery and history surface. It exists so users
can recover or copy their final text after successful dictation, including when
insertion into the active app fails.

The v0.1 contract is:

- Store Recent Wisprs only on the user's Mac.
- Store only the final user-visible text returned for insertion.
- Expire entries after 7 days by default.
- Include both successful insertions and failed insertions after final text
  exists.
- Let the user clear history and disable future local history.
- Never sync Recent Wisprs to Supabase, RubyWhisper backend storage, provider
  storage, admin/support tools, analytics, crash reports, PR evidence, Linear
  comments, or exported diagnostics.

Out of scope for RW-070A:

- Mac persistence implementation.
- UI implementation.
- Cloud sync or multi-device history.
- Encryption-at-rest selection.
- Real dictated-text fixtures, clipboard text, app text, screenshots, or audio
  evidence.

## Data Model

Implementation leaves may choose Swift type and storage names that fit the
imported Mac app, but they must preserve this logical model:

| Field | Required | Allowed value | Privacy note |
| --- | --- | --- | --- |
| `id` | Yes | Local random identifier. | Local only; never backend-visible. |
| `finalText` | Yes | The final text returned for insertion/copy. | The only transcript-like content allowed in Recent Wisprs. |
| `createdAt` | Yes | Local creation timestamp. | Metadata only. |
| `expiresAt` | Yes | `createdAt + 7 days` by default. | Metadata only. |
| `insertionStatus` | Yes | `inserted` or `insertion_failed`. | Metadata only. |
| `source` | Yes | `dictation`. | Metadata only; do not store provider names unless needed for local debug and approved separately. |
| `destinationAppCategory` | Optional | Broad local category or app display name if available without reading document content. | Must not include document titles, window titles, URLs, selected text, or field content. |
| `copiedAt` | Optional | Timestamp of user copy action. | Metadata only. |

`finalText` must be populated from the successful desktop transcription response
field used for insertion. In normal mode this is final cleaned text. When cleanup
is disabled, the backend still returns a single final output for insertion; the
app may store that output in `finalText`, but it must not add a separate raw
transcript field.

Recent Wisprs must explicitly exclude:

- Raw transcript fields.
- Audio files, audio samples, audio metadata beyond unrelated request metadata.
- Cleanup prompts, provider request bodies, provider response bodies, or model
  reasoning.
- Surrounding app context, selected text, focused-field text, destination
  document text, URLs, or screenshots.
- Clipboard contents, previous clipboard contents, pasteboard item metadata, or
  clipboard restoration evidence.
- Personal dictionary terms or custom vocabulary.
- Auth/session material, API keys, private env values, or support tokens.
- Server-side history identifiers.

## Insertion Status Semantics

Create a Recent Wispr only after the app has final text eligible for insertion
or copy recovery.

`inserted` means the app inserted the final text into the active field and the
insertion path considers the result successful or reasonably inferred as
successful.

`insertion_failed` means final text exists, but direct insertion did not happen,
no text field was focused, the clipboard fallback was unavailable, or the app
cannot confidently claim insertion success. The user must be able to copy the
same `finalText` from local recovery or Recent Wisprs without a second backend
transcription request.

Do not create a Recent Wispr for:

- Signed-out, Terms-required, trial-exhausted, permission-denied, duration-cap,
  network, provider, invalid-audio, or service failures where no final text
  exists.
- Canceled recordings.
- Debug/test-case exports.
- Clipboard-only data that did not originate from a successful RubyWhisper
  transcription response.

Copying or retrying insertion from Recent Wisprs must not mutate `finalText`,
call transcription again, upload audio again, or send clipboard contents
backend. A copy action may update metadata such as `copiedAt`.

## Retention Policy

The default retention period is exactly 7 days.

For each entry:

```text
expiresAt = createdAt + 7 * 24 * 60 * 60 seconds
```

Retention cleanup must run through an injectable clock seam and must be
testable without wall-clock sleeps. Cleanup must remove entries whose
`expiresAt` is at or before the cleanup time.

Required cleanup triggers:

- App launch or store initialization.
- Opening the Recent Wisprs view.
- Creating a new Recent Wispr.
- Manual clear-history action.

The app may also run opportunistic background cleanup, but background cleanup
does not replace deterministic cleanup at the required triggers.

If a future settings surface allows a shorter retention period, it must never
extend the v0.1 default beyond 7 days without a reviewed product/privacy
decision.

## Clear And Disable Behavior

Clear history:

- Deletes all local Recent Wisprs immediately.
- Leaves current auth/session, preferences, dictionary terms, and in-flight
  recording state untouched.
- Must not call the backend.
- Must not export deleted text to support evidence, logs, crash reports, or
  analytics.
- Must be idempotent: clearing an already empty store succeeds.

Disable local history:

- Prevents creation of new Recent Wisprs from the next completed whisper onward.
- Must be checked before every write path, including successful insertion,
  insertion failure, retry insertion, copy recovery, app restart, and imported
  base-app run-log migration paths.
- Does not require a backend call and must not update Supabase.
- May leave existing entries until expiry unless the user also chooses clear
  history. The settings UI must make clear and disable separate controls or
  offer an explicit combined "disable and clear" action.

When disabled, the app can still keep final text in transient memory long enough
for the active insertion/recovery flow, but it must not persist that text into
Recent Wisprs or any replacement local history store.

## No-Sync Backend Boundary

Recent Wisprs content is never server data.

RubyWhisper backend, Supabase, admin/support pages, analytics, crash reporting,
billing systems, Linear comments, PR descriptions, and test fixtures must never
store or echo:

- `finalText`
- raw transcripts
- cleaned transcripts
- audio payloads or files
- cleanup prompts
- surrounding context
- clipboard contents
- destination app content
- Recent Wisprs rows or exports

Allowed backend/request metadata remains limited to privacy-safe fields already
covered by backend contracts, such as request ID, user ID, account/entitlement
state, duration bucket, word count, latency, app version, OS version, error code,
and coarse insertion/recovery category. Metadata must not include content
hashes of user text unless a later reviewed privacy decision explicitly
approves that change.

No Supabase schema, seed, fixture, migration, storage bucket, Edge Function, or
admin view may add a Recent Wisprs table, local-history table, transcript text
column, cleaned-text column, audio bucket, clipboard-content column, or
dictionary-content column for v0.1.

## Metadata-Only Evidence Rules

Validation evidence for Recent Wisprs work must be metadata-only.

Allowed evidence:

- Command names and pass/fail summaries.
- Counts, enum states, retention timestamps, and redacted IDs.
- Synthetic placeholder labels that are not user-derived.
- Screenshots only when the Recent Wisprs text area is empty, redacted, or
  populated with non-user placeholder text created for the test.
- Logs showing metadata-only request IDs, status codes, durations, and enum
  states.

Forbidden evidence:

- Dictated text.
- Raw transcripts.
- Cleaned text from a real user recording.
- Clipboard contents or previous clipboard contents.
- Focused-field text, selected text, app document text, URLs, or screenshots
  containing user content.
- Audio files, waveform captures derived from real speech, provider payloads,
  cleanup prompts, private env values, tokens, or secrets.

If a test needs text, use short synthetic strings that are plainly fixtures,
such as `SYNTHETIC_RECENT_WISPR_TEXT`, and keep them out of screenshots and
Linear/PR bodies unless needed to explain the test seam.

## Required Test Seams

RW-070 implementation leaves must expose these seams:

- Store adapter seam: in-memory adapter for tests and the real local Mac store
  for runtime.
- Clock seam: deterministic `now` injection for expiry and cleanup tests.
- Settings seam: local history enabled/disabled state injectable without UI.
- Backend client spy: proves Recent Wisprs writes do not call backend routes.
- Supabase/API spy: proves clear/disable/history operations do not write or
  sync server-side.
- Clipboard seam: copy action can be tested without reading or logging previous
  clipboard contents.
- Migration/import seam: imported FreeFlow run-log data is ignored or reduced
  to allowed `finalText` only, with no raw transcript, prompt, context,
  screenshot, selected text, or audio carryover.

Minimum automated coverage:

- Creates `inserted` Recent Wispr after successful insertion.
- Creates `insertion_failed` Recent Wispr after final text exists but insertion
  fails.
- Does not create a Recent Wispr for backend/provider/network failures without
  final text.
- Expires entries at 7 days by default using the clock seam.
- Clear history deletes all local entries and is idempotent.
- Disabled local history prevents every persistent write path.
- Copy from Recent Wisprs uses only the stored `finalText` and does not read,
  store, or sync previous clipboard contents.
- No backend/Supabase call occurs for create, cleanup, clear, disable, copy, or
  retry-insertion-from-history operations.
- Privacy scan/assertion rejects raw transcript, audio, prompt, context,
  clipboard, app text, screenshot, provider payload, and server-history fields.

## Downstream Acceptance And Validation

RW-070B local store:

- Acceptance: implements the data model, 7-day expiry, retention cleanup,
  clear, disable, successful insertion writes, failed insertion writes, and
  no-write failure cases.
- Validation seam: store adapter, clock, settings, backend/API spies.
- Suggested commands after Mac source import:
  `swift test --filter RecentWisprs` or
  `xcodebuild test -scheme RubyWhisper -only-testing:RubyWhisperTests/RecentWisprsStoreTests`.

RW-070C history UI:

- Acceptance: shows final text only, timestamp, insertion status/recovery
  affordance, copy action, empty state, clear action, and disabled state.
- Validation seam: UI state fixtures must use synthetic placeholder text or
  redacted/empty content.
- Suggested commands:
  `swift test --filter RecentWisprsView` or the matching Xcode UI/unit target
  selected by the imported Mac app.

RW-070D privacy tests:

- Acceptance: proves Recent Wisprs never writes to backend/Supabase and never
  stores forbidden fields.
- Validation commands:
  `npm run test:auth-privacy` for backend no-body/no-history guardrails, plus
  the Mac privacy/store tests added by RW-070B.

RW-070E manual QA:

- Acceptance: records metadata-only evidence for successful insertion history,
  failed insertion recovery, copy action, clear history, disabled history, and
  7-day expiry behavior using synthetic text only.
- Validation: no screenshots or notes with dictated text, clipboard text, app
  content, or audio.

RW-070F completion/audit:

- Acceptance: confirms RW-069, RW-072, and RW-100 reference this contract and
  records that Recent Wisprs remains local-only with no backend sync.
- Validation: changed-file scan plus backend/auth privacy tests; any matches for
  transcript/audio/clipboard/history terms must be policy references only.

RW-069 clipboard-safe recovery:

- Acceptance: failed insertion with final text creates or uses an
  `insertion_failed` Recent Wispr, copy recovery does not read/store previous
  clipboard contents, and retry insertion does not call transcription again.
- Validation seam: clipboard abstraction and backend client spy.

RW-072 settings/account surfaces:

- Acceptance: settings expose clear history and disable local history controls,
  keep the controls local-only, and avoid account/Supabase writes for Recent
  Wisprs settings unless a future reviewed contract changes that posture.
- Validation seam: settings store injection and API spy.

RW-100 privacy audit:

- Acceptance: audit confirms no Supabase/backend storage for Recent Wisprs,
  audio, raw transcript, cleaned text, context, clipboard content, app text, or
  provider payloads.
- Validation command: `npm run test:auth-privacy` plus repository scans for
  forbidden server-side fields and local-history sync paths.
