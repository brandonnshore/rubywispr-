# RW-067 Duration Cap And Warning Contract

Status: Proposed contract for RW-067A. Swift/macOS implementation, backend code
changes, live long-recording QA, real audio fixtures, screenshots/videos, and
manual completion remain downstream work. RUB-58 / RW-067 remains open for
implementation and manual QA after this contract lands.

This contract defines the v0.1 duration cap for one RubyWhisper recording. It
extends:

- `TECHNICAL_SPEC.md#FR-013 Duration cap`
- `TECHNICAL_SPEC.md#POST /api/desktop/transcribe`
- `docs/RW_064_GLOBAL_HOTKEY_CONTRACT.md`
- `docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md#post-apidesktoptranscribe`

## Constants

The canonical v0.1 limits for one whisper are:

| Name | Value | Meaning |
| --- | ---: | --- |
| `recordingDurationLimitMs` | `600000` | Ten-minute hard cap for one recording. |
| `durationWarningThresholdMs` | `570000` | Warning threshold around 9:30. |
| `durationWarningRemainingMs` | `30000` | Time remaining when the warning threshold is reached. |
| `durationLimitCode` | `duration_limit_reached` | Canonical local/backend recovery code. |

Implementation leaves may choose local constant names that fit the imported Mac
or backend source, but they must preserve these values and units unless a later
reviewed product contract changes the cap.

The cap is per recording, not per day, per session, per user, or per app launch.
A new recording gets a new timer only after the previous recording reaches a
terminal cleanup or recovery state.

## Authority Boundary

The macOS app is the local timer and user-experience authority:

- Start the duration timer when the recorder actually begins capturing audio,
  after hotkey, onboarding, account, microphone, and Accessibility gates pass.
- Use a monotonic clock or recorder-owned elapsed-time source for warning and
  cap transitions. Wall-clock time changes must not extend the recording.
- Show `nearing_duration_limit` once the active recording reaches
  `durationWarningThresholdMs`.
- Stop capture at the first reliable local tick at or after
  `recordingDurationLimitMs`.
- Treat any continued hold key, repeated toggle chord, island stop race, or
  missed key-up event after the cap as already stopped for that whisper.
- Compute `audioDurationMs` from trusted local recorder elapsed time or sealed
  media duration metadata for uploads that are still eligible to upload.

The RubyWhisper backend is the final request authority:

- `POST /api/desktop/transcribe` must reject over-duration payloads before
  provider work when the parsed or declared duration exceeds
  `recordingDurationLimitMs`.
- Backend over-duration rejection uses HTTP `413`, code
  `duration_limit_reached`, recovery `start_new_whisper`, and metadata
  `durationLimitMs` plus `audioDurationMs`.
- Backend duration handling is a safety net for clock drift, missing local
  timing, media-duration disagreement, imported-source bugs, and malicious or
  stale clients. It does not replace the local warning and stop behavior.

## Local Recording States

Every local recording mode follows the same cap state sequence:

```text
recording_hold | recording_toggle
  -> nearing_duration_limit
  -> duration_limit_reached
```

`nearing_duration_limit` is optional only when the user stops before
`durationWarningThresholdMs`. It is required for recordings that continue past
the warning threshold and must be visible without relying on color alone.

`duration_limit_reached` is terminal for the current audio artifact. The app
must stop or block additional capture, surface the recovery state, and require a
new whisper instead of retrying or resuming the same audio.

## Hold And Toggle Behavior

Hold-to-talk behavior:

- Holding `Fn` starts `recording_hold` only after all gates pass.
- At approximately 9:30, the island moves to `nearing_duration_limit` while
  recording continues.
- At 10:00, the app stops capture even if `Fn` is still held.
- Releasing `Fn` after the cap must not restart, upload, or otherwise mutate the
  stopped recording. The user must start a new whisper after recovery.

Toggle behavior:

- `Command+Fn` starts `recording_toggle` only after all gates pass.
- At approximately 9:30, the island moves to `nearing_duration_limit` while the
  toggle remains active.
- At 10:00, the app stops capture and turns the active toggle off.
- A later `Command+Fn` activation may start a new whisper only after the capped
  recording has reached terminal cleanup or recovery. It must not resume or
  retry the capped audio.
- If `Fn` is supported as a toggle escape hatch, pressing it before 10:00 stops
  normally; pressing it after the cap is a no-op against the already stopped
  recording.

## Island And Hotkey Mapping

The recording island is the visible duration-cap surface:

| Source | Island state | Required action | Safe metadata |
| --- | --- | --- | --- |
| Active recording below warning threshold | `recording_hold` or `recording_toggle` | Continue recording. | mode, elapsed-duration bucket. |
| Active recording reaches 9:30 threshold | `nearing_duration_limit` | Keep recording and offer `stop_recording`. | mode, elapsed-duration bucket, warning threshold. |
| Local timer reaches 10:00 | `duration_limit_reached` | Stop capture, disable current toggle/hold capture, require `start_new_whisper`. | mode, duration limit, elapsed duration, cleanup flags. |
| Hotkey tries to continue or restart same capped audio | `duration_limit_reached` or existing recovery | Block current artifact; do not create a second upload. | gate `duration_limit_reached`, busy/recovery category. |
| Backend returns `duration_limit_reached` | `duration_limit_reached` | Delete transient audio/request buffers and require `start_new_whisper`. | request ID if returned, duration metadata, cleanup flags. |

The island may show short recovery copy equivalent to "Recordings are limited
to 10 minutes." Longer education belongs in settings, support, or docs.

The hotkey gate named "duration cap allows the recording to start or continue"
means:

- Before capture starts, there must be no capped artifact awaiting cleanup or
  recovery.
- During capture, hold and toggle modes may continue only while elapsed time is
  below `recordingDurationLimitMs`.
- After the cap, the active recording is stopped and the same artifact cannot be
  resumed, retried, or uploaded again.

## Upload And Cleanup Contract

The desktop upload path must include `audioDurationMs` for every recording that
is eligible to upload. Duration metadata is numeric only and must not be derived
from transcript text, provider output, clipboard content, or destination app
state.

Local handling:

- If the user stops before the hard cap, seal the transient audio artifact,
  attach `audioDurationMs`, and follow
  `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`.
- If the local cap itself stops or blocks the recording, treat the artifact as
  capped, surface `duration_limit_reached`, delete transient audio/request
  buffers, and do not upload that same artifact.
- If local media-duration validation finds a sealed artifact over
  `recordingDurationLimitMs`, reject it locally, delete it, and require a new
  whisper.
- Cleanup flags such as `temporaryAudioDeleted`, `uploadStarted`,
  `acceptedStateAmbiguous`, and `cleanupSucceeded` may be recorded only as
  booleans without paths, filenames, or user content.

Backend handling:

- If an over-duration artifact reaches the backend, return
  `duration_limit_reached` before provider work, cleanup, usage advancement, or
  retryable processing.
- The same over-duration audio is never retryable. The desktop must delete the
  transient artifact and ask the user to start a new whisper.
- Backend success, backend error, local cancellation, logout, app termination,
  and unsafe upload ambiguity all end with transient audio/request-buffer
  cleanup as defined by the upload flow contract.

## Testability

Implementation leaves must support shortened-timer tests. Tests must not wait
for a real 9:30 warning or 10:00 cap.

Required seams:

- A duration policy or equivalent dependency that supplies cap and warning
  thresholds in milliseconds.
- A monotonic clock, scheduler, recorder elapsed-time source, or virtual timer
  that tests can advance deterministically.
- A state observer or reducer test path that can assert
  `recording_* -> nearing_duration_limit -> duration_limit_reached`.
- Separate tests for hold and toggle recordings.
- Tests for local cleanup/no-upload when the local cap is reached.
- Tests for backend `duration_limit_reached` mapping, non-retryability, and
  cleanup when an over-duration response is returned.

Shortened test profiles are allowed only in test/debug harnesses. They must not
be exposed as user settings, production feature flags, support toggles, or
customer-facing bypasses.

Recommended synthetic examples:

| Test profile | Warning | Cap |
| --- | ---: | ---: |
| Unit timer profile | `700` ms | `1000` ms |
| Integration timer profile | `3000` ms | `5000` ms |

The exact shortened values may vary by test harness, but the warning must occur
before the cap and must preserve the same state, cleanup, and retry behavior as
the production policy.

## Privacy And Evidence

Allowed metadata for logs, support, tests, and manual QA evidence:

- `requestId` when returned by the backend as an opaque support handle.
- `errorCode` / `desktopState` / `islandState`.
- `recordingMode`: `hold` or `toggle`.
- `timerSource`: local timer, media duration validation, or backend.
- `durationLimitMs`, `durationWarningThresholdMs`, `audioDurationMs`, and
  elapsed-duration buckets such as `under_warning`, `warning_window`, or
  `over_limit`.
- `appVersion`, `build` or `channel` when supported, `platform`, and macOS
  major/minor version.
- Cleanup booleans with no paths or filenames.
- Test profile category such as `production_policy`, `shortened_unit_timer`, or
  `shortened_integration_timer`.

Forbidden in logs, support, tests, docs, PRs, Linear comments, screenshots,
videos, fixtures, analytics, crash reports, and manual QA evidence:

- Recorded audio, real audio fixtures, audio filenames containing user content,
  waveform histories, or persisted meter traces.
- Raw transcript, cleaned text, cleanup prompts, context, dictionary terms,
  selected text, focused-field text, destination app text, or clipboard content.
- App/window titles, process lists, account email, billing details, auth
  material, private env values, provider payloads, request bodies, response
  bodies, multipart boundaries, local file paths, or filenames.
- Screenshots/videos that include private app content or real dictated content.

Manual QA for this contract may use written evidence from shortened timers,
synthetic state harnesses, and metadata-only logs. Long live recording QA is a
downstream RUB-58/RW-067 implementation/manual QA concern and is not completed
by this docs-only ticket.

## Downstream Handoff

This contract unblocks RW-067 implementation leaves for local warning timers,
local stop/block enforcement, backend alignment audits, island state wiring, and
QA closure.

RUB-58 / RW-067 remains open for implementation and manual QA. This document
does not claim that imported Mac source, Swift timer code, backend route
changes, live provider calls, real audio capture, long live recordings, or
manual visual QA have been completed.
