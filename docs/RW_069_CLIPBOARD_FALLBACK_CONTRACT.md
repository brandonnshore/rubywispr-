# RW-069 Clipboard Fallback And Recovery Contract

Status: Proposed contract for RW-069A. Swift/macOS clipboard implementation,
live app import, Accessibility integration, and manual QA remain downstream work
in RW-069B through RW-069F.

This contract defines RubyWhisper's v0.1 clipboard-safe fallback behavior after
the backend has returned cleaned text and the macOS app cannot confidently insert
that text into the active target.

It extends:

- `TECHNICAL_SPEC.md#FR-018 Insertion failure recovery`
- `TECHNICAL_SPEC.md#FR-019 Clipboard fallback`
- `TECHNICAL_SPEC.md#State Machines`
- `WEB_DESIGN_SPEC.md#Recording Island`
- `docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/FREEFLOW_AUDIT_RUB_24.md#Insertion Failure Detection And Recovery`

## Ownership Boundary

The macOS app owns focused-field detection, insertion attempts, clipboard
fallback, previous clipboard snapshotting, previous clipboard restoration,
one-click local recovery, and Recent Wisprs storage.

The RubyWhisper backend owns auth, Terms, entitlement, quota, provider work, and
the transcription/cleanup response that produced the cleaned text. Clipboard
fallback handling must not call the backend, retry transcription, upload audio,
or send local recovery content to any backend service.

## User-Visible States

Downstream implementations must use these stable state names for app state,
state tests, and sanitized support metadata. UI copy may be adapted for native
layout, but the recovery meaning must remain stable.

| State | Trigger | Required user-visible behavior | Primary action | Privacy boundary |
| --- | --- | --- | --- | --- |
| `insertion_unavailable` | No focused text target is available before insertion, or insertion verification fails conservatively. | Island/recovery surface says `Click a text box first.` Cleaned text is preserved locally for recovery. | `focus_text_field` or `copy_cleaned_text` | Local cleaned text only; do not read focused-field contents. |
| `fallback_copied` | Direct insertion is unavailable or failed, and the app successfully writes the cleaned text to the pasteboard for user paste recovery. | Show that the whisper was copied and can be pasted by the user. Do not claim target insertion succeeded. | `paste_manually` or `open_recent_wisprs` | Clipboard payload stays local and in pasteboard only. |
| `clipboard_restored` | The app restores its supported snapshot of the previous pasteboard after fallback and confirms ownership rules still allow restore. | Optional brief status may say the previous clipboard was restored. | None | Previous clipboard snapshot was memory-only and discarded after restore. |
| `clipboard_restore_skipped` | The previous pasteboard cannot be restored, the previous data type is unsupported, the pasteboard changed after fallback, restore timed out, or pasteboard access failed. | Optional status may say previous clipboard could not be restored. Do not promise restoration. | `open_recent_wisprs` if recovery is needed | Do not inspect, log, upload, or persist skipped clipboard contents. |
| `manual_copy_recovery` | User clicks `Copy Whisper` or `Copy Transcript` from Recent Wisprs or another approved local recovery surface. | Copy action succeeds or shows local clipboard-unavailable recovery. | `copy_cleaned_text` | Local cleaned text may be copied; no backend call is allowed. |

`insertion_failed` remains the broader island desktop state from
`docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`. It may map to
`insertion_unavailable`, `fallback_copied`, or `manual_copy_recovery` internally
when the UI needs a more specific recovery step.

## State Machine

Normal insertion path:

```text
processing_uploading
  -> inserting
  -> success
  -> hidden_idle
```

Fallback path when direct insertion is unavailable or fails:

```text
processing_uploading
  -> inserting
  -> insertion_unavailable
  -> fallback_copied
  -> clipboard_restored | clipboard_restore_skipped
  -> hidden_idle
```

Manual recovery path:

```text
insertion_unavailable | clipboard_restore_skipped | hidden_idle
  -> manual_copy_recovery
  -> fallback_copied
  -> clipboard_restored | clipboard_restore_skipped
```

Rules:

- `success` is allowed only when insertion is known or reasonably inferred by an
  approved insertion implementation. A fallback copy alone is not insertion
  success.
- If no focused text target was available before insertion, fail conservatively
  into `insertion_unavailable` and do not claim paste success.
- Local recovery must not re-run transcription or cleanup with already cleaned
  text.
- The island itself must not display transcript or cleaned text content.
- Recent Wisprs may store final cleaned text locally under the approved local
  history policy.

## Pasteboard Ownership Rules

The app may temporarily own the pasteboard only to make recovery possible after
insertion failure.

Required behavior:

- Capture the pasteboard change count before writing RubyWhisper recovery
  content.
- Snapshot only supported pasteboard data types that the implementation can
  faithfully read, hold in memory, and write back. The implementation must keep a
  typed allowlist for supported restoration data.
- Do not promise restoration for unsupported pasteboard data types, unreadable
  pasteboard items, very large payloads, stale change counts, or pasteboards that
  another app changes after RubyWhisper writes fallback content.
- Keep previous pasteboard snapshots in memory only and discard them after
  restore, skip, timeout, cancellation, app quit, or recovery completion.
- Never include previous clipboard contents in logs, analytics, crash reports,
  support diagnostics, Linear comments, PR bodies, tests, screenshots, or docs.

Restoration is best effort. `clipboard_restore_skipped` is correct when
restoration would be lossy, unsafe, unsupported, or misleading.

## Restoration Timing

The implementation must use explicit restore scheduling instead of ad hoc sleeps
inside insertion code.

Required behavior:

- Schedule one bounded restoration attempt after fallback copy with a documented
  delay chosen by the macOS implementation leaf.
- Restore only if RubyWhisper still owns the pasteboard entry it wrote for
  fallback, as determined by change count, owner token, or equivalent pasteboard
  seam.
- Skip restore if the user or another app changed the pasteboard after fallback.
- Skip restore if the app cannot prove the snapshot can be restored without
  dropping unsupported data.
- Expose restoration timing through an injectable scheduler or clock so unit
  tests do not wait on real timers.

## Recovery Copy Action

`Copy Whisper` or `Copy Transcript` is a local action over the locally retained
final cleaned text.

Required behavior:

- The action must work from approved recovery UI even after the original
  insertion attempt is complete.
- The action may overwrite the current pasteboard intentionally because the user
  requested copy.
- If previous clipboard restoration is offered after manual copy, it must follow
  the same best-effort ownership and supported-type rules as automatic fallback.
- If the pasteboard is unavailable, show local recovery without uploading or
  logging the cleaned text.

## Privacy Requirements

Fallback handling is local-only.

Must not be sent to backend services, provider services, analytics, support
uploads, or server logs as part of fallback handling:

- clipboard contents
- previous pasteboard snapshots
- audio
- raw transcript
- context
- selected text or focused-field text
- cleaned text
- Recent Wisprs content

Allowed fallback diagnostics are categorical metadata only, such as:

- state name
- restoration result category
- supported or unsupported data-type category
- bounded timing bucket
- app version and OS version

Diagnostics must not include actual pasteboard type payloads, text snippets,
audio filenames derived from user content, provider request or response bodies,
private env values, auth material, or customer-derived examples.

## Test Seams

Downstream RW-069 implementation leaves should be testable without importing or
launching the live macOS app. Use protocols, small interfaces, or equivalent
test seams for:

- `PasteboardPort`: exposes current change count, supported-type snapshot,
  fallback write, ownership check, restore, and unavailable/error outcomes.
- `InsertionTargetPort`: reports whether a focused text target is available and
  performs or verifies insertion without exposing target text content.
- `ClipboardFallbackClock` or `RestorationScheduler`: schedules bounded restore
  attempts with deterministic test advancement.
- `RecoveryStore`: saves and retrieves final cleaned text locally under Recent
  Wisprs retention policy without backend calls.
- `FallbackEventSink`: accepts categorical state transitions only and rejects
  content-bearing payloads.

Unit tests must use synthetic placeholders and must not include real clipboard
contents, recorded audio, raw transcript, cleaned text examples, surrounding
context, selected text, focused-field text, env values, or secrets.

Minimum test coverage for downstream leaves:

- no focused target maps to `insertion_unavailable` and local recovery is
  available
- fallback copy maps to `fallback_copied` without claiming insertion success
- supported previous pasteboard snapshot restores to `clipboard_restored`
- unsupported previous pasteboard data maps to `clipboard_restore_skipped`
- changed pasteboard ownership skips restoration
- manual copy recovery maps to `manual_copy_recovery`
- fallback event/log sink rejects or omits all content-bearing fields

## Acceptance Criteria For Implementation Leaves

- The app exposes the stable states named in this contract and maps
  user-visible copy/actions to those states.
- Clipboard fallback never claims insertion success unless insertion is known or
  reasonably inferred by the insertion implementation.
- Previous clipboard restoration is best effort and explicitly skips unsupported
  data types or unsafe restore conditions.
- Previous clipboard snapshots are memory-only and discarded after restore/skip.
- Manual copy recovery works from approved local recovery surfaces.
- Fallback handling does not send clipboard content, audio, raw transcript,
  context, selected/focused-field text, cleaned text, or Recent Wisprs content to
  backend services.
- Tests cover the pasteboard, insertion target, restore scheduler, recovery
  store, and privacy event seams without requiring a live Mac app import.

## Validation

Run from the repository root after changing this contract or downstream
clipboard fallback implementation:

```bash
git diff --check
npm run test:auth-privacy
```

If dependencies are absent in a Symphony workspace, run `npm ci` first, then
rerun `npm run test:auth-privacy`.

For contract discoverability:

```bash
rg -n "RW_069_CLIPBOARD_FALLBACK_CONTRACT|clipboard_restored|clipboard_restore_skipped|manual_copy_recovery|fallback_copied|insertion_unavailable" TECHNICAL_SPEC.md IMPLEMENTATION_PLAN.md WEB_DESIGN_SPEC.md docs
```

Before PR handoff, inspect changed files for forbidden private payload examples
or env values:

```bash
git diff --cached --name-only --diff-filter=ACM | xargs rg -n "sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE)|[A]PI_KEY=|[S]ECRET=|[T]OKEN=|[P]ASSWORD=|example.*(clip[b]oard|trans[c]ript|au[d]io|cleaned[ -]text)|real.*(clip[b]oard|trans[c]ript|au[d]io|cleaned[ -]text)"
```

Expected result for the final command is no real private payloads. Mentions of
forbidden categories as policy text are allowed only when they do not include
example content.
