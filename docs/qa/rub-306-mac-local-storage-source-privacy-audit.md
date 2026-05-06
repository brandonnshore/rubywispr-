# RUB-306 Mac Local Storage Source Privacy Audit

Date: 2026-05-06
Scope: source-only Mac local storage/logging audit for RUB-306.

This report intentionally does not inspect real Application Support data, real
Keychain items, real clipboard contents, screenshots, audio, transcripts,
dictionary terms, private environment files, provider dashboards, Supabase rows,
or production/staging logs.

## Source Contracts

- `TECHNICAL_SPEC.md` requires desktop transcription through the RubyWhisper
  backend only, no server-side audio/transcript/context/clipboard storage, local
  Recent Wisprs final text only, local personal dictionary storage, and desktop
  session tokens in Keychain.
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md` allows one transient audio
  artifact for the active recording, requires deletion/release at terminal
  states, and forbids provider secrets in app settings.
- `docs/RW_070_RECENT_WISPRS_CONTRACT.md` allows local `finalText` plus
  metadata only and forbids raw transcripts, audio, prompts, context,
  clipboard, dictionary terms, auth material, provider payloads, and
  server-side history identifiers in Recent Wisprs.
- `docs/RW_071_LOCAL_PERSONAL_DICTIONARY_CONTRACT.md` allows local structured
  dictionary terms only and permits transient cleanup payload use only when the
  privacy gates are enabled.
- `docs/RW_069_CLIPBOARD_FALLBACK_CONTRACT.md` allows cleaned text on the local
  pasteboard for recovery and requires previous clipboard snapshots to stay
  memory-only.
- `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md` requires session material only
  in Keychain and forbids plaintext token storage in preferences, Application
  Support files, local databases, diagnostics, logs, PRs, and Linear evidence.

## Source Store Map

| Surface | Source path | Persistence | Allowed local content | Forbidden content | Audit result |
| --- | --- | --- | --- | --- | --- |
| Recent Wisprs | `apps/macos/Sources/RecentWisprStore.swift` | `UserDefaults` key `recent_wisprs` as JSON data | Local `finalText`, local id, created/expires timestamps, insertion status, `dictation` source, broad destination category, copied timestamp | Raw transcript, audio, prompts, context, screenshots, selected/focused text, clipboard, dictionary terms, auth material, provider payloads, server history IDs | Source-safe for current contract. Store trims text, expires after 7 days, clears/disables locally, and rewrites decoded snapshots using the Codable shape. Tests cover retention, clear/disable, reload, copy metadata, corrupted state, and forbidden-field scrubbing. |
| Recent Wisprs menu/recovery | `apps/macos/Sources/RecentWisprsHistoryMenuState.swift`, `apps/macos/Sources/RecentWisprRecoveryController.swift`, `apps/macos/Sources/AppState.swift` | Reads RecentWisprStore; copy goes to pasteboard by user action | Stored final text may be shown/copied from the approved local recovery/history surface | Previous clipboard contents, retranscription, backend sync | Source-safe. Copy recovery uses stored final text and clipboard fallback without backend calls. |
| Personal dictionary | `apps/macos/Sources/PersonalDictionaryStore.swift` | `UserDefaults` key `personal_dictionary` as JSON data; legacy `custom_vocabulary` migration | Local id, normalized term, created/updated timestamps, global enabled flag | Auth/session material, provider IDs, transcripts, clipboard text, destination app content, server profile IDs, sync state | Source-safe for local-only term storage. Terms are validated, deduped, capped, deleted locally, and only exposed through the cleanup payload seam when enabled. |
| Pipeline/run-log history | `apps/macos/Sources/PipelineHistoryStore.swift`, `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/TestCaseExporter.swift` | Core Data SQLite under Application Support plus metadata-only ZIP export | Current AppState writes lifecycle metadata only: intent, timestamp, screenshot status, post-processing status, debug status | Raw/cleaned transcript, selected/captured text, prompts, context text/screenshot data, dictionary terms, audio filenames, app/window metadata, provider payloads | Needs follow-up hardening: current AppState writes sanitized entries and startup sanitizer removes legacy content, but the Core Data model and store insert/update APIs still contain fields that can persist forbidden content if a future caller passes it. Follow-up: RUB-308. |
| Transient audio artifact | `apps/macos/Sources/TransientRecordingArtifact.swift`, `apps/macos/Sources/AudioRecorder.swift`, `apps/macos/Sources/AppState.swift` | Temporary directory `rubywhisper-transient-recordings`; in-memory PCM callback for realtime path | Active recording temp WAV with UUID filename; metadata duration/format/byte count; request body in memory during upload | Audio in Application Support history, caches, exports, logs, screenshots, Linear/PR/docs evidence, content-derived filenames, ambiguous-retry retention | Source-safe for temp artifact lifecycle. The store creates UUID `.wav` temp files, excludes directory from backup, deletes explicit/deinit/stale artifacts, and AppState deletes artifacts on cancel, duration limit, signed-out gate, shutdown, and terminal upload handling. |
| Preferences/UserDefaults | `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/AppearanceSettingsPresentation.swift`, `apps/macos/Sources/FirstRunOnboardingCoordinator.swift` | `UserDefaults` and AppStorage | Non-secret preferences: setup completion, models, cleanup/context toggles, shortcuts, language, audio interruption toggle, clipboard preservation toggle, appearance, first-run metadata, microphone ID | Auth/session tokens, provider secrets, private env values, transcript/audio/context/clipboard payloads unless explicitly approved as a local user preference | Partially source-safe. Non-secret preferences are allowed. User-authored prompt/macro preferences remain local and need live/manual evidence if inspected. Provider/API secret settings are not allowed in Application Support and are tracked in RUB-307. |
| Provider/API settings | `apps/macos/Sources/KeychainStorage.swift`, `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/SettingsView.swift` | Application Support `.settings` with owner-only permissions | None for provider secrets under current v0.1 backend-only contract | Provider API keys, provider base URLs that imply direct desktop-to-provider use, private env values | Needs follow-up. AppState still defines `groq_api_key`, `transcription_api_key`, `api_base_url`, and default Groq-compatible base URL paths through AppSettingsStorage. Follow-up: RUB-307. |
| Keychain/session | `apps/macos/Sources/DesktopSessionStore.swift`, `apps/macos/Sources/DesktopAuthStateOwner.swift`, `apps/macos/Sources/RubyWhisperBackendAPIClient.swift` | macOS Keychain service `com.rubywhisper.desktop.session`, account `primary` | Access token, optional refresh token, optional expiry, optional account id; redacted descriptions only | Plaintext auth/session in UserDefaults, Application Support, local history, diagnostics, logs, support evidence | Source-safe. Keychain add/update/delete paths are typed, malformed values are deleted, blank tokens fail encoding, and diagnostics descriptions redact token values. |
| Clipboard fallback | `apps/macos/Sources/ClipboardFallbackManager.swift`, `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/SettingsView.swift` | Pasteboard only; previous snapshot in memory only | Cleaned text copied for fallback/manual recovery; previous string snapshot in memory for best-effort restore; categorical event states | Persisted previous clipboard contents, backend upload, logs with payload text, unsupported data capture, diagnostics with pasteboard payloads | Source-safe for fallback manager. Event sink logs state/reason/snapshot/skip categories only. Diagnostics copy writes only app/build/system metadata. |
| Diagnostics/support copy | `apps/macos/Sources/AdvancedSettingsPresentation.swift`, `apps/macos/Sources/SettingsView.swift`, `apps/macos/Sources/TestCaseExporter.swift` | Clipboard for diagnostics copy; user-selected ZIP export for test case metadata | App name/version/build, macOS version, architecture, run UUID/timestamp, lifecycle statuses, boolean payload-presence flags | Transcript text, clipboard content, dictionary terms, prompts, context, screenshots, provider payloads, secrets, env values, private app/window data | Source-safe for diagnostics copy and current exporter shape. Export metadata can include app name/bundle identifier if present, but current AppState sanitizes pipeline rows before persistence. Pipeline hardening remains RUB-308. |
| Local debug logs | `apps/macos/Sources/AudioRecorder.swift`, `apps/macos/Sources/AppState.swift`, other OSLog sources | OSLog/standard output | Categories, enums, counts, durations, booleans, non-content statuses | User/device-derived strings, selected/focused text, clipboard, transcripts, prompts, dictionary terms, provider payloads, auth material, private env values | Needs follow-up. Clipboard/direct insertion/session logs are mostly categorical, but AudioRecorder logs microphone names/UIDs and AppState logs voice macro command strings as public values. Follow-up: RUB-309. |

## Follow-Up Tickets

- RUB-307: Remove Mac provider-secret settings storage.
- RUB-308: Harden Mac pipeline history store against content persistence.
- RUB-309: Redact Mac local logs for user and device-derived strings.

## Manual/Live Gaps For RUB-73

These remain blocked for approved human/live inspection and were not run in this
source-only audit:

- Real Application Support inspection for existing `.settings`, pipeline SQLite,
  Recent Wisprs, dictionary, caches, and transient directories.
- Real Keychain item inspection to verify only session material exists.
- Real clipboard fallback and restore behavior with live pasteboard contents.
- Live dictation/transcription/provider request inspection.
- Production/staging backend logs, provider dashboards, Supabase rows, crash
  reporting, analytics, and support tooling.
- Manual QA rows MAC-100 through MAC-109 and MAC-120 through MAC-122 in
  `docs/qa/macos-manual-qa-harness.md`.

## Source Search Evidence

All searches excluded private env files, `.tools`, build outputs, xcresults, and
runtime artifacts. No private data values were opened or copied.

- Provider-secret name/value scan over `apps/macos/Sources`, `apps/macos/Tests`,
  and `apps/macos/Resources`: no matches for provider secret names or
  secret-shaped values.
- Provider/API settings scan found the remaining `AppSettingsStorage` paths in
  `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/KeychainStorage.swift`,
  `apps/macos/Sources/SettingsView.swift`, and prior source-audit notes in
  `docs/FREEFLOW_AUDIT_RUB_24.md`.
- Pipeline content-field scan confirmed current AppState write calls pass empty
  or nil content fields, while `PipelineHistoryStore` still has content-bearing
  model fields and insert/update assignments.
- Log scan found mostly categorical OSLog/print surfaces, with follow-up findings
  for public microphone name/UID logs and voice macro command logs.
- Runtime artifact scan found only `.env.local` as a private local file at the
  workspace root; it was not opened, printed, summarized, or committed.

## Validation

Focused privacy/source test targets run from the repository root:

```bash
make -C apps/macos test-recent-wispr-store test-recent-wisprs-history-menu-state test-recent-wispr-recovery-controller test-personal-dictionary-store test-personal-dictionary-settings-flow test-transient-recording-artifact test-recording-duration-upload-gate test-pipeline-history-privacy test-privacy-settings-presentation test-clipboard-fallback-manager test-session-store test-backend-client test-auth-state-owner test-login-bridge test-secret-guardrails CODESIGN_IDENTITY=-
```

Result: passed.

Full `make -C apps/macos test CODESIGN_IDENTITY=-` is not required for this docs
report because no Mac source/test behavior changes are made. The focused targets
cover storage/history/dictionary/privacy/source guardrails and adjacent session,
clipboard, transient audio, and API privacy seams.
