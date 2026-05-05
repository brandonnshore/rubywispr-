# Recording Island Visual Proof Matrix

Status: synthetic dev/test harness and screenshot guidance only. This document
does not claim live microphone QA, production billing QA, real account QA,
provider smoke, or final manual visual QA completion.

## Privacy Rules

Capture only RubyWhisper-owned UI chrome or a neutral blank target surface. Do
not capture, attach, transcribe, quote, or summarize private app content,
dictated audio, raw transcripts, cleaned text, selected text, focused-field
text, clipboard content, account email, auth links, billing details, provider
payloads, request bodies, private URLs, local paths, or private env values.

Use only synthetic island states and synthetic meter levels from the dev
harness. Do not use live microphone input for proof artifacts attached to PRs
or Linear.

Store local captures under ignored local paths such as
`tmp/rw-066-island-proof/`. Inspect every artifact before attaching it anywhere.

## Run The Dev Harness

1. Validate the synthetic matrix:

   ```bash
   make -C apps/macos test-recording-island-visual-harness
   ```

2. Build the dev bundle:

   ```bash
   make -C apps/macos all APP_NAME='RubyWhisper Dev' CODESIGN_IDENTITY=-
   ```

3. Launch `apps/macos/build/RubyWhisper Dev.app`.
4. Open `Settings > Debug > Island Visual Harness`.
5. Click one scenario ID at a time.
6. Capture only the island or a neutral blank fixture.
7. Record the scenario ID, state, build commit, macOS version, and whether the
   capture was screenshot, video, or written proof.

The Debug tab is hidden unless the bundle name is `RubyWhisper Dev`, and
scenario triggering is also guarded by `AppBuild.isDevBundle`.

## Screenshot Matrix

| ID | State | Harness trigger | Evidence allowed | Manual-only notes |
| --- | --- | --- | --- | --- |
| ISLAND-000 | `hidden_idle` | Written proof only | Note that the island is dismissed. | No RubyWhisper UI exists to capture. |
| ISLAND-010 | `recording_hold` | Debug harness button | Cropped island with synthetic meter level only. | Repeat in manual QA with real hold-to-talk and neutral audio. |
| ISLAND-011 | `recording_toggle` | Debug harness button | Cropped island with synthetic meter level only. | Repeat in manual QA with real toggle stop behavior. |
| ISLAND-012 | `nearing_duration_limit` | Debug harness button | Cropped island warning state with synthetic duration metadata. | Real threshold timing remains manual QA. |
| ISLAND-013 | `duration_limit_reached` | Debug harness button | Cropped recovery state and action only. | Real cleanup after cap remains manual QA. |
| ISLAND-020 | `account_refreshing` | Debug harness button | Cropped loading state only. | Real auth refresh remains manual QA. |
| ISLAND-021 | `processing_uploading` | Debug harness button | Cropped processing state only. | Real upload/provider path remains manual QA. |
| ISLAND-022 | `inserting` | Debug harness button | Cropped inserting state over neutral blank target. | Real insertion target behavior remains manual QA. |
| ISLAND-023 | `success` | Debug harness button | Cropped acknowledgement only. | Real inserted text is not proof-safe. |
| ISLAND-030 | `onboarding_blocked` | Debug harness button | Cropped setup recovery only. | Real gate order remains manual QA. |
| ISLAND-031 | `signed_out` | Debug harness button | Cropped sign-in recovery only. | Browser/auth handoff remains manual QA. |
| ISLAND-032 | `terms_required` | Debug harness button | Cropped Terms recovery only. | Web Terms flow remains manual QA. |
| ISLAND-033 | `trial_exhausted` | Debug harness button | Cropped upgrade recovery only. | Checkout route remains manual QA. |
| ISLAND-034 | `payment_failed` | Debug harness button | Cropped billing recovery only. | Billing portal remains manual QA. |
| ISLAND-035 | `account_blocked` | Debug harness button | Cropped account recovery only. | Real account status remains manual QA. |
| ISLAND-036 | `microphone_recovery` | Debug harness button | Cropped microphone recovery only. | System permission prompt remains manual QA. |
| ISLAND-037 | `accessibility_recovery` | Debug harness button | Cropped Accessibility recovery only. | System Settings trust flow remains manual QA. |
| ISLAND-038 | `hotkey_unavailable` | Debug harness button | Cropped categorical hotkey state only. | Real keyboard/Fn availability remains manual QA. |
| ISLAND-039 | `hotkey_conflict` | Debug harness button | Cropped categorical conflict state only. | Do not identify conflicting apps in evidence. |
| ISLAND-040 | `recorder_busy` | Debug harness button | Cropped busy state only. | Duplicate recording prevention remains manual QA. |
| ISLAND-041 | `insertion_failed` | Debug harness button | Cropped Copy/Retry actions only. | Do not show cleaned text or clipboard contents. |
| ISLAND-042 | `rate_limited` | Debug harness button | Cropped rate-limit recovery only. | Real account quota behavior remains manual QA. |
| ISLAND-043 | `network_error` | Debug harness button | Cropped network recovery only. | Real offline/timeout path remains manual QA. |
| ISLAND-044 | `provider_error` | Debug harness button | Cropped provider recovery only. | Real provider failure remains manual QA. |
| ISLAND-045 | `invalid_audio` | Debug harness button | Cropped record-again recovery only. | Real invalid audio cleanup remains manual QA. |
| ISLAND-046 | `service_error` | Debug harness button | Cropped generic service recovery only. | Real support metadata remains manual QA. |
| ISLAND-047 | `unsafe_retry_required` | Debug harness button | Cropped new-whisper recovery only. | Same-audio retry prevention remains manual QA. |

## Video Matrix

Use short cropped clips only when motion is the behavior being proved:

| Area | Scenario IDs | Evidence allowed | Manual-only notes |
| --- | --- | --- | --- |
| Stable shell | ISLAND-010, ISLAND-012, ISLAND-021, ISLAND-022, ISLAND-023 | Synthetic clip cropped to island while switching states. | Real drag placement and focus retention remain manual QA. |
| Visualizer | ISLAND-010, ISLAND-011, ISLAND-012 | Synthetic meter animation only; no microphone input or persisted meter trace. | Live mic responsiveness remains manual QA. |
| Reduced motion | ISLAND-010, ISLAND-011, ISLAND-012, ISLAND-021 | Enable macOS Reduce Motion, then use the same synthetic states. | System accessibility setting must be human-verified. |
| Recovery actions | ISLAND-031 through ISLAND-047 | Optional cropped clip of state/action visibility only. | Do not click actions that open auth, billing, browser, or System Settings surfaces in attached proof. |

## Required Manual-Only Validation

These checks cannot be proven by the synthetic harness alone and should remain
open for RUB-266/manual QA:

- Non-focus-stealing behavior while another neutral text field keeps focus.
- Drag placement and anchor persistence across real state transitions.
- Real hold-to-talk and toggle keyboard lifecycle.
- Real microphone permission prompt and live visualizer responsiveness.
- Real Accessibility trust, direct insertion, and insertion failure handling.
- Real account, Terms, checkout, billing, quota, provider, and network paths.
- Real transient audio cleanup after success, failure, cancel, and duration cap.
- Reduced-motion behavior on a Mac with the setting enabled.

## Artifact Review Checklist

- [ ] Capture shows only RubyWhisper UI or neutral blank target content.
- [ ] No audio, transcript, cleaned text, selected text, focused-field text, or
      clipboard content appears.
- [ ] No auth links, account email, billing details, provider payloads, request
      bodies, local paths, private URLs, or private env values appear.
- [ ] Capture filename uses the scenario ID and state only.
- [ ] Evidence notes use categorical state/action names only.
- [ ] Any not-run or manual-only row is explicitly marked as not completed.
