# RubyWhisper Ship Readiness Audit

Date: 2026-05-20

Scope: local macOS app in `apps/macos/build/RubyWhisper.app`, backend/web test suite, Run Log diagnostics, settings tabs, hotkey behavior, realtime transcription fallback, duration cap behavior, and privacy guardrails. This audit does not include private transcripts, audio, API keys, or private environment values.

## Summary

RubyWhisper is materially closer to a shippable beta after this pass. The app launches, reopens Settings without repeating onboarding, exposes a working menu bar Quit path, shows provider status in Run Log, and preserves privacy defaults by not storing transcript/audio content in the local Run Log.

Two high-impact reliability fixes were made:

- Recordings that auto-stop at the 10 minute cap now continue into transcription instead of being discarded as "duration limit reached" at the exact moment the cap fires.
- OpenAI realtime finalization now has bounded connection, commit, and transcript-completion waits, so a stuck realtime socket can fall back to the existing RubyWhisper/Groq upload path instead of leaving the app stuck on "Finalizing live transcription".
- Previously completed setup now stays completed on relaunch even if older onboarding metadata did not store the newer test-whisper completion flag.

One settings reliability polish fix was made:

- A saved microphone ID for a disconnected device now normalizes back to System Default when devices refresh, so Settings always shows a selected microphone and the recorder behavior matches the UI.

## Manual App Audit

### Launch, relaunch, settings, and quit

Result: Pass

- Launched the rebuilt app at `apps/macos/build/RubyWhisper.app`.
- Settings opened directly after relaunch; the full setup workflow did not repeat.
- Closing Settings returned the app to menu-bar idle state instead of showing the `Complete setup` prompt.
- The local build stays visible in the Dock and keeps the menu bar icon enabled.
- Menu bar contained `Settings`, `Re-run Setup...`, `Start Dictating`, `History`, microphone and shortcut menus, and `Quit RubyWhisper`.
- Invoked `Quit RubyWhisper` from the menu bar and confirmed the RubyWhisper process exited.

### Settings tabs

Result: Pass with follow-up polish

- Inspected Account, Appearance, General, Advanced, Prompts, Voice Macros, and Run Log with Computer Use.
- General now shows a selected System Default microphone after stale-device normalization.
- Advanced exposes the live OpenAI transcription flag and privacy controls.
- Prompts uses large editable text areas and scrolls correctly.
- Voice Macros empty state is clear.
- Account showed an active signed-in state and accepted terms. The local trial quota was low, which can affect further manual transcription testing.

Follow-up polish:

- The Account and Diagnostics sections are dense and should get a focused UI pass before a public build.
- The live transcription toggle appears in both General and Advanced; this is useful for now, but the final IA should make the canonical location obvious.

### Hotkeys and insertion

Result: Pass with automation caveat

- Temporarily switched tap-to-toggle to F5 for automation, then restored it to `Fn + Cmd`.
- Confirmed F5 could start/stop recording via the global shortcut path once account refresh finished.
- A synthetic TextEdit insertion run completed and inserted into TextEdit. The synthetic machine-voice audio produced low-quality text, so it is evidence for flow completion, not quality.
- Starting dictation while RubyWhisper Settings was frontmost produced `direct_insertion_skipped_unsafe`, which confirms the unsafe-target guard avoids pasting into the app.

### Run Log and diagnostics

Result: Pass

- Run Log clearly distinguishes provider paths:
  - Prior live success entries showed `context=openai_realtime` and `OpenAI live transcription succeeded`.
  - A fallback validation entry showed `OpenAI live failed; RubyWhisper upload succeeded`.
- Timing includes `stop_to_audio_ms`, `upload_response_ms`, `response_to_insert_ms`, `insertion_ms`, and terminal insertion status.
- Transcript and audio storage were disabled in the inspected entries, showing `(transcript not stored)` and `Audio not stored`.

Follow-up polish:

- The timing line is useful for debugging but hard for normal users. The next UI pass should translate it into a compact "Provider: OpenAI Live / Fallback Upload" badge and a readable latency summary.

### Realtime and fallback behavior

Result: Pass for fallback, previously verified for live success

- Live success was visible in existing Run Log evidence from the current app history.
- During this audit, a synthetic shortcut test hit the fallback path. The app recovered through RubyWhisper upload and returned to Active instead of staying stuck.
- New realtime guardrails bound connection, commit, and final transcript waits before fallback.

Remaining risk:

- This audit did not prove current live success with a clean real microphone recording after the guardrail patch, because the automated synthetic speech source was unreliable. A final human voice smoke test should confirm one fresh `context=openai_realtime` success before release.

### Long dictation

Result: Pass by simulated/boundary tests, manual long-run still recommended

- The prior behavior could discard recordings at the exact 10 minute cap because the UI auto-stop and upload gate both treated `durationMs >= limitMs` as terminal.
- The app now auto-stops at the cap and proceeds to transcription.
- Upload rejection now allows a 5 second grace window for capture-timer drift and still rejects clearly over-limit artifacts.
- OpenAI realtime completion wait now scales with recording duration up to the 10 minute cap.

Remaining risk:

- A real 10 minute human dictation was not run in this audit. Before shipping, run one real long-form recording with live enabled and one with fallback forced, then confirm no transcript is lost and the Run Log result is actionable.

### Rambling cleanup quality

Result: Needs follow-up

- Batch upload cleanup still uses the existing cleanup prompt and dictionary/context controls.
- OpenAI realtime v1 currently inserts the raw final transcript for conservative latency and privacy behavior.
- That means long rambling live dictation can be fast but may not get the same paragraphing and cleanup quality as batch mode.

Recommended follow-up:

- Add an optional post-realtime cleanup step that runs only after a final transcript is available, keeps provider metadata content-free, and preserves fallback behavior.

### Alert sounds

Result: Diagnosed

- The "beep beep" perception is consistent with intentional alert sounds: the app plays the same `Bottle` sound when recording becomes ready and again when stopping/transcribing starts. Errors use `Basso`.
- This is not necessarily a crash, but it can feel like a glitch because start and stop use the same tone.

Recommended follow-up:

- Split start, stop, success, and error sounds into distinct choices or make stop/start sounds independently configurable.
- Add a visible status message when a sound means "fallback started" or "recording failed" so the sound is not the only feedback.

## Bugs Fixed

### 10 minute cap discarded recordings

Files:

- `apps/macos/Sources/AppState.swift`
- `apps/macos/Sources/RecordingDurationUploadGate.swift`
- `apps/macos/Tests/RecordingDurationUploadGateTests.swift`

Fix:

- Auto-stop now calls the normal stop-and-transcribe path instead of deleting the artifact and showing a duration-limit error.
- The upload gate allows a 5 second grace window beyond the cap to account for timer/capture drift.
- Tests cover under-limit, exactly-at-limit, and clearly-over-limit cleanup behavior.

### Realtime finalization could hang before fallback

Files:

- `apps/macos/Sources/OpenAIRealtimeTranscriptionSession.swift`
- `apps/macos/Tests/OpenAIRealtimeTranscriptionSessionTests.swift`

Fix:

- Added bounded waits for connection, commit, and completed transcript.
- Added cancellation handling for the transcript wait continuation.
- Added a duration-scaled completion timeout and a bounded finalization budget test.

### Completed users were prompted to complete setup again

Files:

- `apps/macos/Sources/AppState.swift`
- `apps/macos/Sources/FirstRunOnboardingCoordinator.swift`
- `apps/macos/Tests/FirstRunOnboardingCoordinatorTests.swift`

Fix:

- Existing `hasCompletedSetup` state now counts as a completed first-run test whisper when resolving onboarding readiness.
- This prevents older installs from being sent back to setup only because they completed setup before the newer onboarding metadata fields existed.
- Focused tests cover completed setup, stored onboarding metadata, and explicit in-progress setup test status.

### Disconnected saved microphone looked unselected

Files:

- `apps/macos/Sources/MicrophoneSelection.swift`
- `apps/macos/Sources/AppState.swift`
- `apps/macos/Sources/MenuBarView.swift`
- `apps/macos/Sources/SettingsView.swift`
- `apps/macos/Tests/MicrophoneSelectionTests.swift`

Fix:

- Refreshing microphones now resets stale saved device IDs to System Default.
- Settings and menu bar use the shared default microphone constant.
- Tests cover blank, default, available, and disconnected-device selections.

## Verification

Automated verification passed:

- `make all` in `apps/macos`
- `make test` in `apps/macos`
- `npm run typecheck` in `apps/web`
- `npm test` in `apps/web` (`414` tests passed)

Focused tests added or updated:

- `OpenAIRealtimeTranscriptionSessionTests`
- `RecordingDurationUploadGateTests`
- `MicrophoneSelectionTests`
- `FirstRunOnboardingCoordinatorTests`

Manual verification with Computer Use:

- Opened the actual rebuilt macOS app.
- Inspected Settings tabs and Run Log.
- Closed Settings and confirmed the app returned to Active menu-bar state without reopening setup.
- Confirmed Run Log provider/fallback labels.
- Confirmed unsafe insertion protection for RubyWhisper Settings.
- Confirmed menu bar Quit exits the process.
- Confirmed Settings reopens without first-run setup repeating.

## Remaining Blockers Before Shipping

- Run one fresh human voice test proving current OpenAI live success after this patch, not only fallback and earlier Run Log history.
- Run one real 10 minute dictation in live mode and one forced fallback long dictation to validate end-to-end retention outside synthetic tests.
- Add cleanup/paragraphing for realtime transcripts or clearly label live mode as raw/low-latency in the UI.
- Improve Run Log provider/timing readability for non-developer users.
- Separate alert sounds or add clearer visible status so intentional beeps do not feel like failures.
- Resolve the low trial quota state for release/test accounts so beta testers do not hit quota during normal validation.

## Recommended Next UI/UX Pass

- Replace raw timing text with provider badges, latency summary, and fallback reason.
- Consolidate or clarify the live transcription toggle location.
- Tune start/stop/error sounds and add sound-specific labels.
- Give Account and Diagnostics a cleaner layout for beta users.
- Add a guided "Test Dictation" flow that records a short phrase, shows provider used, confirms insertion target, and gives a clear next step on failure.
