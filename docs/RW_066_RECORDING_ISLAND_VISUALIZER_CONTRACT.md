# RW-066 Recording Island And Visualizer Contract

Status: Proposed contract for RW-066A. Swift/macOS implementation, app source
changes, generated screenshots/videos, live microphone QA, and manual visual QA
remain downstream work in RUB-57 and its implementation leaves.

This contract defines the v0.1 recording island state names, interaction rules,
visualizer behavior, recovery actions, and privacy boundaries before native UI
implementation. It extends:

- `TECHNICAL_SPEC.md#FR-011 Recording island`
- `TECHNICAL_SPEC.md#FR-012 Visualizer`
- `TECHNICAL_SPEC.md#State Machines`
- `WEB_DESIGN_SPEC.md#Recording Island`
- `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`
- `docs/RW_064_GLOBAL_HOTKEY_CONTRACT.md`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`

## Ownership Boundary

The macOS app owns island visibility, island state mapping, drag placement,
non-focus-stealing behavior, local meter rendering, recovery actions, and
privacy-safe visual proof.

The RubyWhisper backend owns account eligibility, Terms state, quota/billing
state, provider work, canonical backend error codes, request IDs, usage
metadata, and server-side privacy boundaries.

The island must never call provider, Stripe, Clerk secret, Supabase service-role,
or other server-side credential surfaces directly. It must consume only local
recording state, local permission state, hotkey gate results, and typed
RubyWhisper API responses.

## Interaction And Layout Contract

The island is the user-visible recording authority during active dictation and
recoverable dictation failures.

Required interaction behavior:

- Appear immediately when a recording starts or when a blocked hotkey needs a
  compact recovery surface.
- Remain floating, draggable, and keyboard/VoiceOver reachable where native
  macOS affordances allow.
- Never steal focus from the user's current app, focused field, browser auth
  flow, System Settings pane, or onboarding surface.
- Keep hotkey handling local; island buttons may stop/cancel/retry/open
  recovery surfaces, but they must not synthesize hidden hotkey events.
- Hide after the success acknowledgement expires, after a terminal cancellation
  returns to idle, or after recovery is handed to onboarding/account/settings.

Stable compact UI requirements:

- Normal dictation states use one compact island size. Implementation leaves may
  choose exact pixels/points, but state changes between `recording_*`,
  `nearing_duration_limit`, `processing_uploading`, `inserting`, and `success`
  must not resize, jump, or re-anchor the island.
- Recovery states may expand only to fit one short line of recovery copy plus
  one primary action and, where needed, one secondary action. Expansion must
  keep the drag anchor stable and must not cover the focused insertion target
  more than the user-placed island already does.
- The default copy budget is concise status text, not explanatory paragraphs.
  Longer education belongs in onboarding, settings, account, or support
  surfaces.
- The island must not show normal word count. It may show only low-limit,
  exhausted, duration, or retry-delay metadata when that metadata is the active
  recovery context.
- The island must not rely on color alone. State must also be represented by
  iconography, visible copy, or shape/motion changes.

## State Table

Every implementation leaf must map source state to one of these island states
or add a reviewed extension to this contract before shipping.

| Island state | Trigger/source state | Visible behavior | Primary action | Privacy rule |
| --- | --- | --- | --- | --- |
| `hidden_idle` | No active recording, processing, insertion, or recovery state. | Island is hidden; menu/settings may still show account status. | None. | No audio, transcript, context, focused text, or clipboard data is shown or retained by the island. |
| `onboarding_blocked` | Hotkey/test whisper attempted before onboarding `ready`, including `sign_in_required`, `terms_required`, `test_whisper_required`, or earlier first-run gates. | Compact recovery points to the first unsatisfied onboarding step; onboarding may refocus. | `open_onboarding_step`. | No recording starts, no upload starts, and no local permission details beyond category are exposed. |
| `account_refreshing` | Account refresh is pending or bounded retry is active. | Compact neutral progress state; no recording controls. | `wait_or_cancel`. | Account state is metadata only; no content diagnostics. |
| `signed_out` | Backend/API client returns `signed_out` or local session is missing/revoked. | Recovery says sign-in is required. | `open_sign_in`. | Clear local session per Keychain contract; do not include tokens, magic links, or auth material in island logs. |
| `terms_required` | Backend/account state requires Terms/Privacy acceptance. | Recovery says Terms/Privacy must be accepted before dictation. | `open_terms_acceptance`. | Do not invent legal copy in the island; no recording/upload. |
| `trial_exhausted` | Account refresh or upload returns `trial_exhausted` or `subscription_required`. | Upgrade recovery; may show exhausted/limit metadata. | `open_checkout`. | Usage metadata only; no transcript or cleaned text in billing/upgrade proof. |
| `payment_failed` | Account refresh or upload returns `payment_failed`. | Billing recovery says billing must be updated. | `open_billing`. | Stripe remains source of truth; no card/payment details are displayed in the island. |
| `account_blocked` | Account refresh or upload returns `account_blocked`/`blocked`. | Account recovery says dictation is unavailable. | `open_account`. | Show only categorical blocked state and support-safe request/account metadata. |
| `microphone_recovery` | Microphone denied, restricted, unavailable, or unusable. | Permission recovery with microphone settings action. | `open_system_settings_microphone`. | No audio capture, upload, transcript, retry loop, or live meter data. |
| `accessibility_recovery` | Accessibility is not trusted, denied, unavailable, or policy-blocked. | Permission recovery with Accessibility settings action. | `open_system_settings_accessibility`. | No insertion attempt, focused-field text inspection, clipboard read, or backend call. |
| `hotkey_unavailable` | Required hotkey backend/binding cannot register or capture reliably. | Hotkey recovery names the binding category and platform limitation. | `open_hotkey_settings` or `retry_hotkey_registration`. | Do not log key event streams, app/window titles, typed text, selected text, or clipboard content. |
| `hotkey_conflict` | macOS or another app appears to consume the binding. | Conflict recovery explains the hotkey is unavailable. | `retry_hotkey_registration`. | Conflict metadata is categorical only; do not identify other apps unless a future privacy review approves it. |
| `recorder_busy` | Hotkey activation occurs while recording, upload, processing, insertion, or unsafe retry recovery is active. | Existing island state remains authoritative; optional compact pulse. | Continue current state action. | No second recording starts and no duplicate upload is created. |
| `recording_hold` | `Fn` hold starts after all gates pass. | Compact active recording state; shows hold mode, elapsed time, stop affordance if available, and live visualizer. | Release `Fn` or `stop_recording`. | Meter data is ephemeral; do not show or log speech content. |
| `recording_toggle` | `Command+Fn` starts after all gates pass. | Compact active recording state; shows toggle mode, elapsed time, stop control, and live visualizer. | `stop_recording`. | Same as `recording_hold`; no content in state labels, logs, filenames, or analytics. |
| `nearing_duration_limit` | Recording reaches the warning threshold around 9:30 for the 10-minute cap. | Same compact size as recording, with visible warning not based on color alone. | `stop_recording`. | Duration bucket/elapsed metadata only; no transcript or audio diagnostics. |
| `duration_limit_reached` | Local cap stops recording or backend returns `duration_limit_reached`. | Recovery says recordings are limited to 10 minutes. | `start_new_whisper`. | Delete over-limit transient audio per upload contract; same audio is not retried. |
| `processing_uploading` | Recording stopped and upload/transcription is in progress. | Compact processing state appears immediately after stop. | `cancel_if_safe` only before request acceptance ambiguity; otherwise wait. | Do not show transcript, partial transcript, provider payloads, request body, or filenames. |
| `inserting` | Backend success returned `cleanedText` and the app is inserting into the focused field. | Compact insertion progress state. | Wait. | Cleaned text is used only for insertion/local recovery; it is not displayed in the island. |
| `success` | Text inserted successfully or test whisper completed successfully. | Brief subtle acknowledgement, then hide or return to onboarding ready state. | None, or `open_recent_wisprs` only outside compact acknowledgement. | No transcript/cleaned text in success copy, screenshots, analytics, or support evidence. |
| `insertion_failed` | Backend success returned cleaned text but direct insertion failed or no text field was focused. | Recovery says `Click a text box first.` and offers copy/retry insertion where safe. | `copy_cleaned_text` or `retry_insertion`. | The island itself does not display cleaned text. Cleaned text may exist only in approved local recovery/Recent Wisprs policy. Clipboard contents are never sent backend. |
| `rate_limited` | Backend returns `rate_limited`. | Recovery shows retry availability using a delay bucket or countdown. | `retry_after`. | Retry only if duplicate-risk rules allow; no request payload details. |
| `network_error` | Local network failure or backend-compatible network error. | Recoverable network state. | `retry` when safe, otherwise `start_new_whisper`. | Same-audio retry only before bytes left the app; otherwise delete audio and require a new recording. |
| `provider_error` | Backend returns `provider_error`. | Recoverable provider state. | `retry` when backend/upload contract says duplicate risk is impossible. | Provider category/latency metadata only; no provider request or response bodies. |
| `invalid_audio` | Local validation or backend returns invalid audio. | Recovery asks user to record again. | `record_again`. | Delete invalid audio; do not persist samples for debugging. |
| `service_error` | Backend returns `service_unavailable`, `internal_error`, or unknown recoverable `error`. | Generic recoverable state; may include support-safe request ID if returned. | `retry_or_contact_support`. | Support metadata only; no audio, transcript, cleaned text, context, dictionary terms, clipboard content, screenshots with user content, or private env values. |
| `unsafe_retry_required` | Upload acceptance is ambiguous, logout/cancel occurred in flight, or replay could duplicate provider/quota work. | Recovery asks user to start a new whisper. | `start_new_whisper`. | Delete transient audio and do not replay the same artifact. |

## Transition Rules

Allowed normal path:

```text
hidden_idle
  -> recording_hold | recording_toggle
  -> nearing_duration_limit
  -> processing_uploading
  -> inserting
  -> success
  -> hidden_idle
```

`nearing_duration_limit` is optional when the user stops before the warning
threshold. `inserting` may be brief or skipped visually if insertion completes
inside one UI frame, but state tests should still model it when architecture
allows.

Gate failures before audio capture:

```text
hidden_idle
  -> onboarding_blocked | signed_out | terms_required | trial_exhausted
  -> payment_failed | account_blocked | microphone_recovery
  -> accessibility_recovery | hotkey_unavailable | hotkey_conflict
```

Gate failures must not open the recorder, create audio, upload, transcribe,
insert, or advance quota.

Upload/recovery failures after audio capture:

```text
processing_uploading
  -> rate_limited | network_error | provider_error | invalid_audio
  -> service_error | duration_limit_reached | unsafe_retry_required
  -> signed_out | terms_required | trial_exhausted | payment_failed
  -> account_blocked
```

Insertion failure:

```text
inserting -> insertion_failed -> hidden_idle
```

`insertion_failed` may lead to `copy_cleaned_text`, `retry_insertion`, or opening
Recent Wisprs/recovery UI, but it must not call transcription again with cleaned
text and must not upload audio again.

## Visualizer Contract

The visualizer exists only in `recording_hold`, `recording_toggle`, and
`nearing_duration_limit`.

Required behavior:

- Render local microphone pickup as abstract meter movement, not as waveform
  history that implies stored audio.
- Use only short-lived level samples from the active recorder/meter pipeline.
- Decay smoothly when input falls silent and stop immediately when recording
  stops, permission is lost, or the island leaves a recording state.
- Keep all meter data in memory only. Do not persist, upload, log, snapshot,
  analytics-track, or attach meter series to support diagnostics.
- Tests may use synthetic numeric meter values. Test fixtures must not contain
  recorded audio, real speech, transcripts, or customer-derived meter traces.

Reduced-motion behavior:

- When macOS Reduce Motion is enabled, replace continuous animated bars/waves
  with a static microphone-active indicator plus slow, bounded level changes or
  discrete ticks.
- Disable decorative entrance/exit movement and avoid looping shimmer/pulse
  effects.
- Preserve non-color state cues so recording, warning, processing, and errors
  remain distinguishable.
- Reduced motion must not disable the functional elapsed-time/duration warning
  or stop controls.

## Recovery Action Boundaries

Allowed compact island actions:

- `stop_recording`
- `cancel_if_safe`
- `open_onboarding_step`
- `open_sign_in`
- `open_terms_acceptance`
- `open_checkout`
- `open_billing`
- `open_account`
- `open_system_settings_microphone`
- `open_system_settings_accessibility`
- `open_hotkey_settings`
- `retry_hotkey_registration`
- `retry_after`
- `retry`
- `retry_insertion`
- `copy_cleaned_text`
- `record_again`
- `start_new_whisper`
- `retry_or_contact_support`

Forbidden island actions:

- Showing private transcript, cleaned text, selected text, focused-field text,
  clipboard content, dictionary terms, or app/window titles in compact island
  copy.
- Retrying the same audio after upload acceptance is ambiguous.
- Uploading, logging, exporting, screenshotting, or attaching recorded audio.
- Sending clipboard content backend.
- Asking users to upload screenshots/videos that include private app content.
- Opening production billing changes outside the approved checkout/billing
  portal flows.

Copy recovery rule:

`copy_cleaned_text` may copy only final cleaned text that already exists under
the approved local Recent Wisprs/recovery policy. The island may expose the copy
action, but the compact island must not render the cleaned text itself.

## Visual Proof And Manual QA Rules

RUB-260/RW-066A is docs-only and must not include generated screenshots/videos,
live microphone proof, live visualizer QA, app code, or private sample content.

Downstream visual proof for RUB-57 and RW-066 implementation leaves must use
privacy-safe fixtures:

- Synthetic island states with placeholder labels and no real transcript,
  cleaned text, selected text, focused-field text, clipboard content, audio
  filenames, customer app content, account email, billing details, or private
  env values.
- Synthetic meter values only; no live microphone recording, real waveform, or
  persisted meter trace in PR artifacts.
- Cropped screenshots or videos that show only RubyWhisper-owned UI chrome and
  neutral placeholder insertion targets.
- Manual QA notes that describe state names, timing, and recovery outcomes
  without quoting dictated content or attaching user/private material.

Minimum downstream visual matrix after Mac source import:

| Area | Scenario | Evidence allowed |
| --- | --- | --- |
| Stable shell | State changes between recording, nearing limit, processing, inserting, success. | Synthetic screenshots/video of RubyWhisper UI only; note dimensions remain stable. |
| Non-focus-stealing | Start/stop while another neutral text field keeps focus. | Written manual result or cropped neutral fixture. |
| Drag placement | Drag island and trigger state transitions. | Synthetic screenshot/video showing anchor remains stable. |
| Visualizer | Synthetic meter values animate only during recording states. | Synthetic harness capture; no live mic. |
| Reduced motion | Enable reduced-motion mode and repeat recording states. | Synthetic capture or written proof of static/discrete behavior. |
| Recovery states | Permission, hotkey, account, backend, duration, insertion failures. | Synthetic state matrix with placeholder copy only. |
| Privacy | Inspect logs/artifacts for forbidden content. | Written grep/check results; no private screenshots or payloads. |

## Implementation Handoff

RUB-57/RW-066 remains open for native implementation and manual QA after this
contract lands. Implementation leaves should reference this document when
building:

- Compact draggable non-focus-stealing island shell.
- State machine mapping across onboarding, hotkeys, account, upload, duration,
  insertion, and backend errors.
- Live visualizer and reduced-motion behavior.
- Recovery copy/actions and privacy-safe proof states.
- Visual test harness and final manual QA evidence.
