# FreeFlow Audit For RUB-24

Audit date: 2026-05-03

Upstream source inspected: `https://github.com/zachlatta/freeflow` at commit `b91a5fb`.

Local scratch clone: `.tools/freeflow` (ignored by git).

## Summary

FreeFlow is a useful fork base, but it should not be imported unchanged. It passes the basic build and project-structure checks, has a serious hotkey implementation for `Fn` hold and `Command+Fn` toggle, and uses a non-activating overlay panel. The main blockers are privacy and product-contract mismatches:

- The desktop app sends audio, transcript, cleanup, context, and screenshots directly to the configured OpenAI-compatible provider.
- Provider API keys are stored in a local Application Support `.settings` file, not only behind RubyWhisper backend infrastructure.
- The run log stores raw transcript, cleaned transcript, prompts, context summary, selected text, screenshots, custom vocabulary, and copied audio locally.
- Insertion is clipboard-and-`Cmd+V` only. There is no positive detection that paste succeeded, no focused-field preflight, and no insertion-failed island state.

Recommendation: import only after planning a backend-proxy refactor and a storage/privacy reduction pass. FreeFlow should be treated as a harness for shortcuts, recording, provider calls, and overlay behavior, not as a privacy-complete RubyWhisper app.

## Evaluation Criteria

| Criterion from `FORK_STRATEGY.md` | Status | Evidence and notes |
| --- | --- | --- |
| Build reliability on the current Mac | Pass | `make CODESIGN_IDENTITY=-` built `build/FreeFlow Dev.app` from upstream commit `b91a5fb`. The default Makefile requires a `FreeFlow Dev` signing identity, but ad hoc signing works for local audit. |
| Clear Swift project structure | Pass | Single Swift/AppKit/SwiftUI app with source under `Sources/` and a Makefile-driven build. Key modules are easy to isolate: `HotkeyManager.swift`, `ShortcutCore/*`, `AppState.swift`, `RecordingOverlay.swift`, `TranscriptionService.swift`, `PostProcessingService.swift`, `AppContextService.swift`, `PipelineHistoryStore.swift`. |
| Hotkey implementation quality | Pass | `ShortcutBinding.defaultHold` is `Fn`; `defaultToggle` is `Fn` plus Command (`Sources/ShortcutCore/ShortcutModels.swift:338`). Global capture uses a CG session event tap for flags/key down/up (`Sources/GlobalShortcutBackend.swift:43`). The matcher tracks exact modifier state and guards against unreliable `.function` flags from arrows/F-keys (`Sources/ModifierKeyEventState.swift:17`). Toggle/hold session transitions are explicit in `DictationShortcutSessionController.swift`. Runtime QA is still required on target macOS versions and keyboard settings. |
| Paste/insertion reliability | Fail | Insertion writes final text to `NSPasteboard`, posts `Cmd+V`, and optionally restores the previous pasteboard after one second (`Sources/AppState.swift:2518`, `Sources/AppState.swift:2937`, `Sources/AppState.swift:2988`). There is no direct AX insertion path, no focused text-field preflight, and no verification that the paste landed in the target app. |
| Permissions handling | Pass | App checks Accessibility and Screen Recording, polls permission state, and opens System Settings (`Sources/AppState.swift:658`, `Sources/AppState.swift:1198`, `Sources/AppState.swift:1215`). Info.plist includes microphone, speech recognition, and accessibility usage strings. RubyWhisper should revisit whether Screen Recording is acceptable by default for context. |
| Groq configuration | Fail | Groq/OpenAI-compatible provider config lives in the desktop app. Defaults include `https://api.groq.com/openai/v1`, `whisper-large-v3`, and Groq chat models (`Sources/AppState.swift:239`, `Sources/AppState.swift:272`, `Sources/AppState.swift:780`). Settings expose API base URL, transcription URL, models, and API keys (`Sources/SettingsView.swift:947`). RubyWhisper requires desktop-to-backend, not desktop-to-Groq. |
| Cleanup pipeline | Pass | FreeFlow has a separable cleanup pipeline with `PostProcessingService`, fallback models, command-mode transforms, custom vocabulary, custom prompt, output language, and raw-transcript fallback (`Sources/PostProcessingService.swift:137`, `Sources/AppState.swift:2253`). Privacy refactor is required because prompts include context and transcripts. |
| Recording island implementation | Fail | Overlay uses a borderless `.nonactivatingPanel`, high level, `orderFrontRegardless`, and live waveform state (`Sources/RecordingOverlay.swift:24`, `Sources/RecordingOverlay.swift:130`). It does not provide RubyWhisper-required states for insertion-failed or trial-exhausted, is not draggable, and toggle-mode mouse handling is limited to a stop/update button. |
| History or run-log storage | Fail | Run log persists sensitive data in Core Data at Application Support: raw and cleaned transcripts, prompts, context, screenshots, custom vocabulary, selected/captured text, app/window metadata, and audio file names (`Sources/PipelineHistoryStore.swift:12`, `Sources/PipelineHistoryStore.swift:184`, `Sources/PipelineHistoryStore.swift:301`). Audio is copied into Application Support for retries/export (`Sources/AppState.swift:1014`, `Sources/AppState.swift:2381`). RubyWhisper v0.1 wants only final cleaned Recent Wisprs locally, default 7-day expiry, and no audio/context/prompt storage. |
| License notices and attribution requirements | Pass | Upstream is MIT. License requires preserving copyright and permission notice (`LICENSE:1`). Import should keep upstream `LICENSE`/notice and add attribution in app/about docs as appropriate. |
| Difficulty of rebranding | Unknown | Branding appears in Makefile, Info.plist, website, README, settings/setup GitHub cards, update manager URLs, os_log subsystems, bundle IDs, app support paths, and generated export names. This is tractable but touches many files; exact difficulty depends on whether RubyWhisper keeps FreeFlow updater/site surfaces. |

## API Keys And Provider Refactor

Where keys live today:

- `AppState` declares `groq_api_key`, `transcription_api_key`, and provider URL/model storage keys (`Sources/AppState.swift:200`).
- Keys are read with `AppSettingsStorage.load` and saved through `AppSettingsStorage.save` (`Sources/AppState.swift:590`, `Sources/AppState.swift:764`, `Sources/AppState.swift:771`, `Sources/AppState.swift:898`).
- `AppSettingsStorage` now writes a JSON dictionary to `~/Library/Application Support/<AppName>/.settings` with owner-only file permissions; it only uses Keychain for one-time migration out of legacy Keychain storage (`Sources/KeychainStorage.swift:7`, `Sources/KeychainStorage.swift:17`, `Sources/KeychainStorage.swift:29`, `Sources/KeychainStorage.swift:64`).
- Provider requests include `Authorization: Bearer <key>` in desktop code for transcription, realtime transcription, post-processing, and context inference (`Sources/TranscriptionService.swift:72`, `Sources/RealtimeTranscriptionService.swift:68`, `Sources/PostProcessingService.swift:350`, `Sources/AppContextService.swift:214`).

What must change for RubyWhisper:

- Remove Groq/provider keys from the desktop app and settings UI.
- Store only RubyWhisper auth/session material locally, preferably in Keychain.
- Replace direct provider clients with a RubyWhisper backend client.
- Backend verifies Clerk session, checks entitlement/quota, sends transient audio/transcript/context to Groq, returns cleaned text, and logs metadata only.
- Provider URL/model configuration becomes server-side configuration, not user-editable desktop configuration for v0.1.

## Insertion Failure Detection And Recovery

Current behavior:

- After cleanup, FreeFlow records the pipeline history entry before paste (`Sources/AppState.swift:2470`).
- It writes the cleaned transcript to the clipboard, posts `Cmd+V`, optionally presses Enter, then restores the prior clipboard after a delay if the pasteboard was not changed by another app (`Sources/AppState.swift:2518`, `Sources/AppState.swift:2937`, `Sources/AppState.swift:2988`, `Sources/AppState.swift:3008`).
- The app status says either `Pasted at cursor!` or `Copied to clipboard!` based only on the `preserveClipboard` setting, not on an insertion success signal (`Sources/AppState.swift:2486`).
- The run log gives a copy recovery path for the transcript (`Sources/SettingsView.swift:2067`, `Sources/SettingsView.swift:2308`).

Required RubyWhisper behavior:

- Before paste, detect whether a focused text target exists where feasible through Accessibility.
- After insertion, detect failure when feasible. If direct verification is impossible for a target app, fail conservatively when no focused text element was available.
- Add an explicit `insertion_failed` state to app state and island UI.
- Show "Click a text box first", preserve cleaned text locally, and provide one-click copy recovery.
- Keep clipboard fallback, but avoid claiming paste success unless insertion is known or reasonably inferred.

## Island And Focus Behavior

The overlay is mostly compatible with a non-focus-stealing island:

- It uses `.nonactivatingPanel`, is borderless, and calls `orderFrontRegardless` (`Sources/RecordingOverlay.swift:24`, `Sources/RecordingOverlay.swift:172`).
- It defaults to ignoring mouse events, except when a toggle stop button or update button is shown (`Sources/RecordingOverlay.swift:35`, `Sources/RecordingOverlay.swift:86`, `Sources/RecordingOverlay.swift:168`).
- It has live audio waveform and processing states (`Sources/RecordingOverlay.swift:130`, `Sources/RecordingOverlay.swift:508`).

Gaps:

- No insertion-failed or trial-exhausted state.
- No draggable positioning, despite RubyWhisper's product brief calling for a floating draggable island.
- No transcript privacy issue in the island itself because the overlay does not display transcript content, but settings/run-log views do.

## Privacy Risks Before Import

Call these out before importing FreeFlow:

- Direct-to-provider architecture means audio, raw transcript, cleaned text, context, selected text, and screenshots can leave the Mac for the configured provider. RubyWhisper's contract requires backend proxying and no server-side content storage.
- API keys are stored in an Application Support `.settings` file instead of being eliminated from the desktop app.
- Local run log persists more than RubyWhisper should keep by default: raw transcript, cleaned transcript, prompts, context summary, screenshot data URL, selected text, custom vocabulary, app metadata, and audio.
- Test-case export can package transcripts, prompts, screenshots, settings, and audio into a ZIP (`Sources/TestCaseExporter.swift:5`). That is useful for debugging but dangerous without explicit user consent and redaction copy.
- Error logging may include provider response bodies for failed transcription/post-processing requests (`Sources/TranscriptionService.swift:110`, `Sources/PostProcessingService.swift:423`, `Sources/AppState.swift:2299`). Treat provider error bodies as potentially sensitive and redact before RubyWhisper import.
- Context capture uses Screen Recording and screenshot upload for LLM context inference. RubyWhisper needs clear user-facing privacy controls and an off switch before enabling by default.

## Validation

- Code search used to identify hotkey, overlay, insertion, provider, context, and storage modules:
  - `rg -n "Fn|hotkey|HotKey|Shortcut|keyboard|NSEvent|CGEvent|Accessibility|paste|clipboard|NSPasteboard|insert|overlay|Groq|apiKey|transcript|history|UserDefaults|Keychain|cleanup|context|provider|storage" .`
- Build validation passed:
  - `make clean`
  - `make CODESIGN_IDENTITY=-`
  - Result: `Built build/FreeFlow Dev.app`
- Runtime smoke validation passed:
  - `open -n "build/FreeFlow Dev.app"`
  - `pgrep -fl "FreeFlow Dev"` observed the RUB-24 build process.
  - The RUB-24 process was terminated after the smoke test.
- Full manual hotkey/insertion QA not completed:
  - Meaningful hotkey/insertion QA needs installing/running the app with macOS Accessibility, Microphone, and likely Screen Recording permissions plus a provider key.
  - No RubyWhisper backend exists yet, so direct provider manual transcription would not validate the target architecture.

## Required Refactors Before RubyWhisper Import

- Add a backend transcription/cleanup API and replace desktop provider calls.
- Remove desktop Groq/custom provider API-key settings for v0.1.
- Reduce local persistence to Recent Wisprs: final cleaned text only, local-only, default 7-day expiry, clear history control.
- Make raw transcript, prompts, screenshots, and audio debug-only, opt-in, redacted where possible, and never exported without explicit user action.
- Add insertion preflight, failure state, and copy recovery UI.
- Add island states for recording, processing, success, error, insertion-failed, and trial-exhausted.
- Rework context capture controls so users can disable context and understand when screenshots/selected text may be sent transiently.
- Preserve MIT license notice and upstream attribution through import/rebrand.
