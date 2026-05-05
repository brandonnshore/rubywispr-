# RW-064 Global Hotkey Contract

Status: Proposed contract for RW-064A. Swift/macOS implementation, imported
source changes, unit tests, and live manual hotkey QA remain downstream work in
RUB-55 and its implementation leaves.

This contract defines RubyWhisper v0.1 global hotkey behavior before native
implementation changes. It extends:

- `TECHNICAL_SPEC.md#FR-010 Hotkeys`
- `WEB_DESIGN_SPEC.md#Main App / Settings`
- `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`
- `docs/RW_067_DURATION_CAP_CONTRACT.md`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`
- `docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/FREEFLOW_AUDIT_RUB_24.md`

## Product Contract

RubyWhisper v0.1 has two default recording entry points:

- Hold-to-talk: hold `Fn` to record, release `Fn` to stop.
- Toggle recording: press `Command+Fn` to start recording, press
  `Command+Fn` again to stop.

Both entry points must be available in v0.1 unless a documented macOS,
hardware, keyboard-layout, or selected-base limitation prevents reliable capture
of `Fn` or `Command+Fn`. If capture is blocked, the app must expose a visible
recoverable state and must not silently fall back to an undocumented shortcut.

Hotkey customization is out of scope for v0.1. Settings may display the default
bindings and recovery status, but they must not imply that users can change the
bindings until a later customization contract exists.

## Ownership Boundary

The macOS app owns global registration, local key event interpretation,
recording state transitions, local permission checks, visible recovery states,
and metadata-only local logging.

The RubyWhisper backend owns session verification, Terms/account/quota checks,
provider work, and backend error mapping. Hotkeys must never call provider,
Stripe, Clerk secret, Supabase service-role, or other server-side credential
surfaces directly.

The hotkey layer must not capture, store, log, upload, or expose private
application/window titles, focused text, selected text, typed text, clipboard
content, screenshots, audio payloads, raw transcripts, cleaned text, context, or
dictionary terms. It may record only categorical/numeric metadata defined in
this document.

## Registration Lifecycle

Global hotkey registration should be explicit and observable:

```text
unregistered
  -> registering
  -> registered
  -> degraded
  -> disabled
  -> registering
```

Registration may move to `registered` only after the app can detect both the
hold binding and toggle binding in the selected implementation path. A
documented platform limitation may move the app to `degraded`, but the app must
name the affected binding category and show a recovery action.

The app should attempt registration:

- On launch after the app has initialized local settings and account cache
  reading.
- After relevant macOS permission changes or explicit retry from recovery UI.
- After keyboard/input-source changes when the platform exposes a reliable
  signal.
- After app update or selected-base hotkey backend replacement.

The app should release or disable registration:

- During app quit.
- During logout or session replacement if the implementation cannot guarantee
  that blocked hotkeys remain inert.
- While applying a hotkey backend migration.
- When the hotkey backend reports a non-recoverable capture failure.

Registration availability is separate from recording eligibility. The app may
register the global listener while onboarding is incomplete so it can refocus
onboarding on activation, but a registered listener must still run the gating
rules below before starting any capture.

## Gating Rules

Every hotkey activation is a recording preflight. A hotkey must not start
recording, upload audio, transcribe, insert text, or advance usage unless all
required gates pass.

Required gates:

1. Desktop session exists under the Keychain/session contract.
2. Latest account refresh confirms Terms/Privacy acceptance.
3. Latest account refresh confirms account eligibility and `canTranscribe:
   true`.
4. First-run onboarding is in `ready`.
5. Microphone permission is granted and a usable input device is available.
6. Accessibility is trusted for insertion.
7. No active recording, processing, upload, insertion, or recovery state blocks
   a new recording.
8. The previous recording has no unsafe retry or duplicate-upload ambiguity.
9. The duration cap allows the recording to start or continue.

If a gate fails before audio capture starts, the app must not open the recorder.
It should show or refocus the first actionable recovery state:

| Failed gate | Required behavior | Logging allowance |
| --- | --- | --- |
| Signed out or stale session | Open/refocus sign-in flow | `gate: signed_out` |
| Terms required | Open/refocus Terms acceptance | `gate: terms_required` |
| Account ineligible, trial exhausted, payment failed, or blocked | Open/refocus account, checkout, billing, or blocked state | `gate`, `planState` |
| Onboarding not `ready` | Refocus onboarding at first unsatisfied state | `gate: onboarding_not_ready`, onboarding state category |
| Microphone denied/restricted/unavailable | Show microphone recovery | `gate: microphone_unavailable`, permission category |
| Accessibility denied/unavailable | Show Accessibility recovery | `gate: accessibility_unavailable`, trust category |
| Recording/upload/processing busy | Keep current island state; optionally pulse it | `gate: recorder_busy`, busy state category |
| Unsafe retry or upload ambiguity | Require a new recording after cleanup | `gate: upload_ambiguous` |
| Duration cap reached | Stop or block and show cap recovery | `gate: duration_limit_reached`, duration bucket |

These rules apply to normal dictation and to the first-run test whisper. The
test whisper remains the only recording path available before normal onboarding
`ready`, and it may start only under the onboarding contract's test-whisper
gate.

## Recording Semantics

The hotkey state machine should be deterministic:

```text
idle
  -> hold_recording
  -> stopping
  -> processing
  -> idle

idle
  -> toggle_recording
  -> stopping
  -> processing
  -> idle
```

### Hold `Fn`

- `Fn` down starts `hold_recording` only from `idle` and only after all gates
  pass.
- Repeated `Fn` down events while already in `hold_recording` are ignored.
- `Fn` up stops `hold_recording`.
- If the app misses `Fn` up, it must use bounded recovery such as foreground
  state reconciliation, timeout, explicit island stop, or the duration cap.
- A hold shorter than the recorder can safely seal may be canceled locally
  without upload, with metadata-only cancellation state.

### Toggle `Command+Fn`

- A recognized `Command+Fn` activation starts `toggle_recording` only from
  `idle` and only after all gates pass.
- A second recognized `Command+Fn` activation stops the active toggle
  recording.
- Repeated key-repeat activations must not flip toggle state multiple times for
  one physical press.
- The island must provide an explicit stop control for active toggle recordings
  when the selected UI base can do so without stealing focus.
- Toggle recordings must warn near the 10-minute cap and stop at the cap.

### `Fn` Stops Active Toggle

Where feasible, pressing `Fn` while `toggle_recording` is active should stop the
toggle recording. This behavior is preferred because it gives the user a fast
escape hatch when they reach for the hold key out of habit.

If the selected macOS hotkey backend cannot distinguish the `Fn` press from the
existing toggle chord reliably, the implementation leaf must document the
limitation and keep the explicit `Command+Fn` stop and island stop control. It
must not add an undocumented alternate stop chord.

## Recording Island Interaction

The recording island is the user-visible recording authority:

- It appears immediately when recording starts and does not steal focus.
- It distinguishes hold and toggle mode through state, iconography, or compact
  status copy.
- It shows live microphone activity during recording.
- It shows processing immediately after stop.
- It shows recoverable errors for permission, account, network, provider,
  insertion, duration, and hotkey capture states.
- It must not display private transcript content during recording or processing.

State names, stable compact dimensions, recovery actions, visualizer behavior,
and privacy-safe visual proof rules live in
`docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`.

When a hotkey activation is blocked, the island or onboarding/account surface
should show the recovery state instead of failing silently. If the island is not
already visible, the app may show the smallest relevant surface that explains
the blocked state and action.

## Upload And Duration Boundaries

Hotkeys only control local recording start/stop. Once a recording stops, upload
and cleanup follow `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`.

Hotkey code must not:

- Upload before the recorder has stopped and sealed the transient artifact.
- Retry the same audio after upload acceptance becomes ambiguous.
- Retain audio for a later hotkey retry.
- Include key event data, application/window titles, selected text, clipboard
  content, transcript text, or cleaned text in upload metadata.

The duration cap applies to both hold and toggle recordings. The canonical
constants, local warning/stop behavior, same-audio retry prohibition, backend
`duration_limit_reached` fallback, and shortened-timer test seam are defined in
`docs/RW_067_DURATION_CAP_CONTRACT.md`.

## Conflict And Failure States

Hotkey capture failures are desktop-local states. They are visible, recoverable
where possible, and safe to log only as categorical metadata.

| State | Meaning | User-facing recovery | Safe metadata |
| --- | --- | --- | --- |
| `hotkey_registered` | Both bindings are available | None | backend type, app version, OS major/minor |
| `hotkey_hold_unavailable` | `Fn` hold cannot be captured reliably | Show Hotkeys settings recovery; explain the Mac/keyboard limitation and offer retry | binding category, reason category, OS major/minor, keyboard category if non-identifying |
| `hotkey_toggle_unavailable` | `Command+Fn` cannot be captured reliably | Show Hotkeys settings recovery; explain the Mac/keyboard limitation and offer retry | binding category, reason category, OS major/minor |
| `hotkey_backend_degraded` | Backend can capture only part of the required contract | Keep available binding visible; disable unavailable binding with recovery | backend type, affected binding category, reason category |
| `hotkey_permission_blocked` | macOS permission/trust blocks capture or insertion-related hotkey flow | Route to microphone or Accessibility recovery as applicable | permission category only |
| `hotkey_conflict_detected` | macOS or another app appears to consume the binding before RubyWhisper can use it | Explain conflict category and offer retry after system/app settings change | conflict category only |
| `hotkey_event_inconsistent` | Key up/down or modifier sequence is incomplete | Reconcile to safe stopped/idle state; require new activation | previous recording mode, reconciliation category |
| `hotkey_disabled_by_policy` | Device management or OS policy prevents capture | Explain admin/policy limitation; keep recording disabled | policy category only |

Allowed reason categories include `fn_not_reported`, `modifier_not_reported`,
`event_tap_unavailable`, `permission_denied`, `system_reserved`,
`keyboard_layout_unsupported`, `hardware_key_absent`, `backend_not_supported`,
`policy_restricted`, and `unknown`.

Forbidden diagnostics include raw key event logs, full key sequences, HID usage
streams, app/window names, process lists, typed text, selected text, clipboard
content, screenshots, audio, transcripts, cleaned text, and provider payloads.

Current macOS implementation note: RubyWhisper uses a local `CGEventTap` for
global shortcut capture. The framework exposes categorical startup failures
(`event_tap_unavailable`, `event_tap_run_loop_source_unavailable`) and runtime
capture interruptions (`event_tap_disabled_by_timeout`,
`event_tap_disabled_by_user_input`). macOS does not expose a privacy-safe name
for the other app, setting, or device policy involved in a conflict, so v0.1
must show only the categorical reason and affected binding category.

## Settings Contract

The Hotkeys settings section must show:

- Hold binding: `Fn`.
- Toggle binding: `Command+Fn`.
- Availability status for each binding.
- Recovery action when a binding is unavailable or degraded.
- A clear note that customization is not available in v0.1.

Settings may include a retry registration action. Retry must re-run registration
and update availability status, but it must not request unrelated permissions,
start recording, upload audio, or send content diagnostics.

## Manual Validation Matrix

Live built-app hotkey QA is out of scope for RUB-253/RW-064A. RUB-55 remains
open for implementation and manual QA. Implementation leaves should validate at
least this matrix after Mac source import:

| Area | Scenario | Expected result |
| --- | --- | --- |
| Registration | Fresh launch on supported Mac | Hold and toggle report available or visible recovery names a platform limitation |
| Hold mode | Hold `Fn`, speak, release | Recording starts on down, stops on up, then follows upload contract |
| Toggle mode | Press `Command+Fn`, speak, press again | Recording starts, remains active hands-free, stops on second activation |
| Toggle escape | Press `Fn` during active toggle | Stops toggle where feasible; documented limitation otherwise |
| Repeat handling | Hold keys long enough for repeat | State does not flap or create multiple recordings |
| Busy state | Press hotkey during processing/upload | Existing island state remains authoritative; no second recording starts |
| Onboarding gate | Press hotkey before `ready` | Onboarding refocuses; no audio capture starts |
| Auth/Terms/account gates | Press hotkey while signed out, Terms required, or ineligible | Correct recovery opens; no audio capture/upload starts |
| Permission gates | Press hotkey with microphone or Accessibility denied | Permission recovery opens; no audio/content upload starts |
| Duration cap | Keep toggle active through cap | Warning appears near 9:30 and recording stops at 10:00 |
| Conflict/degraded | Simulate unavailable `Fn` or backend failure | Hotkeys settings shows recoverable categorical state |
| Privacy | Enable debug logs around hotkey use | Logs contain only allowed categorical/numeric metadata |

## Implementation Handoff

RUB-253/RW-064A is docs-only. It does not claim native source import, Swift
registration code, working global hotkeys, or live manual QA.

RUB-55/RW-064 remains open for implementation and manual QA after this contract
lands. Downstream leaves should reference this document when implementing:

- Global registration lifecycle.
- Hold `Fn` mode.
- `Command+Fn` toggle mode.
- `Fn` stopping active toggle where feasible.
- Hotkey gating through onboarding, account, permissions, recording state,
  upload state, and duration cap.
- Conflict/degraded recovery states and metadata-only diagnostics.
