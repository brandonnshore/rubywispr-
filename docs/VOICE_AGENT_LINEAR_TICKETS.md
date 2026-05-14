# RubyWhisper Voice Agent Linear Ticket Draft

Generated: 2026-05-14
Mode: Draft, not imported into Linear
Project suggestion: `RubyWhisper Voice Agent And Speed`

## Queue Policy

Put only VA-001 and VA-002 into `Todo` for Symphony at first. Keep later tickets in `Backlog` until the latency evidence and Agent Mode contract land.

Recommended labels:

- Areas: `macos`, `backend`, `api`, `docs`, `qa`, `performance`, `privacy`
- Types: `feature`, `spike`, `test`, `chore`
- Agent: `agent-ready`, `symphony`, `blocked`, `needs-human`
- Validation: `unit`, `integration`, `manual-qa`, `build`
- Risk: `privacy`, `high-risk`, `external-dependency`

## Ticket Index

| ID | Title | Wave | Starting status |
| --- | --- | --- | --- |
| VA-001 | Add privacy-safe desktop dictation timing markers | Wave 1 - Speed Baseline | Todo |
| VA-002 | Timebox or skip context capture on normal dictation | Wave 1 - Speed Baseline | Todo |
| VA-003 | Add binary upload fast path for simple dictation | Wave 1 - Speed Baseline | Backlog |
| VA-004 | Move non-critical success metadata off the response path | Wave 1 - Speed Baseline | Backlog |
| VA-004A | Add OpenAI Realtime cloud streaming transcription provider | Wave 1 - Speed Baseline | Backlog |
| VA-004B | Add streaming latency and fallback QA harness | Wave 1 - Speed Baseline | Backlog |
| VA-005 | Write the Agent Mode safety and product contract | Wave 2 - Agent Foundation | Backlog |
| VA-006 | Add Agent Mode session and hotkey plumbing | Wave 3 - Agent MVP | Backlog |
| VA-007 | Implement safe local app and URL command routing | Wave 3 - Agent MVP | Backlog |
| VA-008 | Add backend Quick Ask text response endpoint | Wave 3 - Agent MVP | Backlog |
| VA-009 | Add local text-to-speech playback for Agent Mode | Wave 3 - Agent MVP | Backlog |
| VA-010 | Add Agent Mode UI states, settings, and manual QA harness | Wave 4 - QA And Polish | Backlog |
| VA-011 | Spike Granola-style meeting transcription architecture | Wave 5 - Meeting Spike | Backlog |

## VA-001: Add privacy-safe desktop dictation timing markers

Status: Todo
Priority: High
Labels: `macos`, `performance`, `privacy`, `test`, `agent-ready`, `symphony`

## Goal

Measure current end-to-end dictation latency from recording stop through insertion without logging private content.

## Context

RubyWhisper already records backend provider latency and total backend route latency, but the desktop side still needs local timing for audio seal, context wait, upload, response, insertion, and fallback. Without this, speed work will be guessy.

## Scope

- Add a small desktop timing model for one dictation run.
- Record timing buckets or numeric milliseconds for safe lifecycle stages only.
- Surface the latest timings in the existing Debug or Run Log area without audio, transcript, context, clipboard, app names, or window titles.
- Keep timings local-only.

## Out of Scope

- Provider benchmarking.
- Backend schema changes.
- Optimizing latency.
- Persisting user content.

## Acceptance Criteria

- [ ] A short whisper records local timings for stop-to-artifact, context-wait, upload-to-response, response-to-insertion, and insertion outcome.
- [ ] Timing fields contain only numbers/categories and request IDs already approved for support.
- [ ] Cancel, failure, and fallback paths do not leave stale timing state attached to the next run.
- [ ] No raw transcript, cleaned text, audio path, context, screenshot, selected text, clipboard content, app name, or window title appears in timing logs or UI.

## Validation

- [ ] Run `cd apps/macos && make all`.
- [ ] Run relevant macOS tests for any touched stores/view models.
- [ ] Run a changed-file privacy scan for forbidden content terms.
- [ ] Manual QA: perform one successful dictation and one insertion fallback, then inspect timing display.

## Dependencies

- Blocked by: None.
- Blocks: VA-002, VA-003, VA-004.
- Related: `docs/qa/rw-102-performance-timing-handoff.md`.

## Agent Notes

- Likely files/areas: `apps/macos/Sources/AppState.swift`, `PipelineHistoryItem.swift`, `PipelineHistoryStore.swift`, `SettingsView.swift` or `PipelineDebugPanelView.swift`.
- Risk level: Medium because performance diagnostics must stay privacy-safe.
- Handoff expectation: PR with screenshots or text description of sanitized timing UI.
- Source references: `docs/SOURCE_LATENCY_METADATA_CONTRACT.md`, `docs/qa/rw-102-performance-timing-handoff.md`.

## VA-002: Timebox or skip context capture on normal dictation

Status: Todo
Priority: High
Labels: `macos`, `performance`, `privacy`, `agent-ready`, `symphony`

## Goal

Prevent context capture from delaying normal dictation upload when it is not needed for the current backend cleanup path.

## Context

The active upload path waits for `uploadContext(...)` before calling `/api/desktop/transcribe`. Context capture can include screenshot work and currently does not power a true LLM cleanup step on the backend. This is a likely latency tax.

## Scope

- Add a bounded context wait for normal dictation, or skip context entirely when cleanup is conservative/rule-only.
- Preserve command/edit mode requirements if selected text transformation still depends on context.
- Record a safe timing/category such as `context_skipped`, `context_ready`, or `context_timeout`.
- Update tests or add unit seams where practical.

## Out of Scope

- Removing context-aware cleanup settings.
- Reworking screen recording onboarding.
- Adding a new cleanup model.

## Acceptance Criteria

- [ ] Normal dictation upload can start without waiting indefinitely for screenshot/context capture.
- [ ] Context timeout/skipped behavior is visible only as safe metadata.
- [ ] Existing privacy controls still omit context when disabled.
- [ ] Command/edit behavior is not silently broken.

## Validation

- [ ] Run `cd apps/macos && make all`.
- [ ] Run touched macOS unit tests.
- [ ] Manual QA with context-aware cleanup enabled: short dictation should upload promptly even if screen capture permission is missing or slow.
- [ ] Manual QA with context disabled: no context capture task should run.

## Dependencies

- Blocked by: VA-001 for best evidence, but can be implemented first if latency is visibly bad.
- Blocks: VA-003.
- Related: `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/AppContextService.swift`.

## Agent Notes

- Likely files/areas: `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/AppContextService.swift`, relevant tests if seams exist.
- Risk level: Medium.
- Handoff expectation: PR plus before/after local timing evidence if VA-001 has landed.
- Source references: `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`, `docs/FREEFLOW_AUDIT_RUB_24.md`.

## VA-003: Add binary upload fast path for simple dictation

Status: Backlog
Priority: Normal
Labels: `macos`, `backend`, `api`, `performance`, `agent-ready`, `symphony`

## Goal

Use the existing binary request support for simple dictation requests that do not include context or dictionary terms.

## Context

The backend can parse binary `audio/*` requests with metadata headers, and the desktop API client already has a `.binary(Data)` body shape. The active desktop path always builds multipart, even when context and dictionary payloads are empty.

## Scope

- Add a desktop request constructor for binary dictation.
- Route simple dictation through binary upload when cleanup payloads are absent.
- Preserve multipart for context and dictionary payloads.
- Add tests around request content type, headers, and redacted diagnostic summary.

## Out of Scope

- Removing multipart support.
- Changing backend provider behavior.
- Sending context or dictionary in headers.

## Acceptance Criteria

- [ ] Simple dictation uses an `audio/wav` request body plus approved metadata headers.
- [ ] Requests with context or dictionary terms still use multipart body fields.
- [ ] Backend tests continue to pass for both binary and multipart paths.
- [ ] Diagnostics remain redacted.

## Validation

- [ ] Run `npm run test:auth-privacy`.
- [ ] Run `cd apps/macos && make all`.
- [ ] Add or update macOS API-client tests if this constructor has test coverage.

## Dependencies

- Blocked by: VA-001, VA-002.
- Blocks: None.
- Related: `apps/macos/Sources/RubyWhisperBackendAPIClient.swift`, `apps/web/src/lib/desktop-transcribe/request.ts`.

## Agent Notes

- Likely files/areas: `RubyWhisperBackendAPIClient.swift`, `RubyWhisperBackendAPIClientTests.swift`, `AppState.swift`.
- Risk level: Medium.
- Handoff expectation: PR with tests showing binary and multipart selection.
- Source references: `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`.

## VA-004: Move non-critical success metadata off the response path

Status: Backlog
Priority: Normal
Labels: `backend`, `performance`, `privacy`, `agent-ready`, `symphony`

## Goal

Reduce successful transcription response latency by moving non-critical request metadata writes into `after()` while keeping quota usage writes authoritative.

## Context

The current success path waits for both request metadata and usage counter writes before responding. Usage must remain correct; request observability metadata can likely be deferred if failure behavior and request ID semantics remain intact.

## Scope

- Review which success writes must block the response.
- Keep usage counter mutation on the response path if required by quota semantics.
- Move safe request metadata write/update into `after()` where possible.
- Preserve existing privacy guarantees and tests.

## Out of Scope

- Changing Supabase schema.
- Changing billing/quota rules.
- Dropping request metadata entirely.

## Acceptance Criteria

- [ ] Successful transcription can return after provider, cleanup, and required quota writes.
- [ ] Request metadata is still written eventually with safe fields.
- [ ] Failure metadata behavior remains safe and useful.
- [ ] Existing route tests cover success, metadata failure, and usage failure semantics.

## Validation

- [ ] Run `npm run test:auth-privacy`.
- [ ] Run focused route and Supabase transcription request tests.
- [ ] Confirm no test fixture includes private transcript/audio/context payloads.

## Dependencies

- Blocked by: VA-001 for before/after evidence.
- Blocks: None.
- Related: `apps/web/src/app/api/desktop/transcribe/route.ts`.

## Agent Notes

- Likely files/areas: `apps/web/src/app/api/desktop/transcribe/route.ts`, `apps/web/test/desktop-transcribe-route.test.mjs`, `apps/web/test/supabase-transcription-requests.test.mjs`.
- Risk level: Medium.
- Handoff expectation: PR with route tests and privacy-safe latency rationale.
- Source references: `docs/SOURCE_LATENCY_METADATA_CONTRACT.md`.

## VA-004A: Add OpenAI Realtime cloud streaming transcription provider

Status: Backlog
Priority: High
Labels: `macos`, `backend`, `api`, `performance`, `privacy`, `agent-ready`, `symphony`

## Goal

Add a cloud streaming transcription path that can produce a final transcript immediately after hotkey release, while preserving the current Groq batch upload path as fallback.

## Context

RubyWhisper already emits 24 kHz mono PCM16 chunks through `AudioRecorder.onPCM16Samples`. OpenAI Realtime transcription accepts 24 kHz `audio/pcm` chunks and returns transcript delta/completed events. The current Groq `whisper-large-v3-turbo` upload path remains useful as a reliable batch fallback.

## Scope

- Add a backend-owned OpenAI Realtime transcription connection using `gpt-realtime-whisper`.
- Keep `OPENAI_API_KEY` on the trusted backend only.
- Add a macOS cloud streaming provider abstraction behind a setting or feature flag.
- Forward PCM16 chunks during recording.
- Commit the audio buffer on hotkey release.
- Insert the streaming final transcript when available.
- Fall back to current Groq batch upload if streaming setup, transcript completion, or provider connection fails.

## Out of Scope

- Voice Agent spoken replies.
- Tool calling.
- WebRTC/browser UI work.
- Sending OpenAI API keys to the macOS app.
- Replacing Groq batch transcription.

## Acceptance Criteria

- [ ] Streaming provider can connect, send 24 kHz PCM16 chunks, and receive transcript completion.
- [ ] No provider key is stored in the desktop app or printed in logs.
- [ ] On provider failure, existing batch upload path still completes dictation.
- [ ] The selected transcription path is visible only as safe metadata.
- [ ] Provider events do not persist transcript/audio/context payloads in Run Log.

## Validation

- [ ] Run backend route/socket tests.
- [ ] Run `cd apps/macos && make all`.
- [ ] Manual QA: successful streaming dictation.
- [ ] Manual QA: force streaming failure and confirm Groq batch fallback.
- [ ] Manual QA: confirm timing shows stream/fallback categories without private content.

## Dependencies

- Blocked by: VA-001 for baseline timing.
- Related: `docs/OPENAI_REALTIME_TRANSCRIPTION_PLAN.md`, `apps/macos/Sources/AudioRecorder.swift`.

## Agent Notes

- Likely files/areas: `apps/macos/Sources/AppState.swift`, `AudioRecorder.swift`, `RubyWhisperBackendAPIClient.swift`, backend desktop auth/route layer, new streaming client/server module.
- Risk level: High because this adds a live provider connection and fallback logic.
- Handoff expectation: feature-flagged PR, no production default flip until manual QA.
- Source references: `docs/OPENAI_REALTIME_TRANSCRIPTION_PLAN.md`, OpenAI Realtime transcription and WebSocket docs.

## VA-004B: Add streaming latency and fallback QA harness

Status: Backlog
Priority: Normal
Labels: `macos`, `backend`, `performance`, `qa`, `privacy`, `agent-ready`

## Goal

Make streaming-vs-batch behavior measurable before turning OpenAI Realtime on by default.

## Context

The first speed pass added local timing buckets. Streaming needs additional fields for session connect, first audio sent, first delta, final transcript, and fallback reason.

## Scope

- Add safe timing fields for streaming lifecycle.
- Add provider path labels such as `batch_groq`, `stream_openai`, and `stream_fallback_batch_groq`.
- Add a manual QA checklist for short, medium, and failure-path dictations.
- Add a debug toggle or development setting to force streaming failure.

## Out of Scope

- Product UI for live partial transcript editing.
- Provider pricing dashboards.
- Full automated end-to-end mic tests.

## Acceptance Criteria

- [ ] Run Log can show stream timing without private transcript/audio content.
- [ ] Fallback reason is visible as a bounded category.
- [ ] Manual QA can compare stop-to-final and stop-to-insert for Groq batch vs OpenAI Realtime.
- [ ] Forced fallback does not change final insertion behavior.

## Validation

- [ ] Run `cd apps/macos && make test-dictation-timing-run test-pipeline-history-privacy`.
- [ ] Run `cd apps/macos && make all`.
- [ ] Capture manual timing examples in a QA note.

## Dependencies

- Blocked by: VA-004A.
- Related: `apps/macos/Sources/DictationTimingRun.swift`, `docs/OPENAI_REALTIME_TRANSCRIPTION_PLAN.md`.

## Agent Notes

- Likely files/areas: timing model, Run Log UI, backend stream route tests.
- Risk level: Medium.
- Handoff expectation: PR or follow-up commit after VA-004A with manual QA notes.

## VA-005: Write the Agent Mode safety and product contract

Status: Backlog
Priority: High
Labels: `docs`, `privacy`, `high-risk`, `needs-human`

## Goal

Define Agent Mode behavior, safety boundaries, tool categories, confirmation rules, and privacy constraints before implementation.

## Context

The user wants voice commands like `open Gmail`, spoken answers, and eventually computer control. This requires a stricter contract than dictation because commands can act outside the text field.

## Scope

- Create `docs/RW_072_AGENT_MODE_CONTRACT.md` or similar.
- Define allowed v1 tools: open/focus app, open allowlisted URL, answer generic question, speak response.
- Define confirmation-required future tools: send email/message, calendar modification, shell command, file operation, destructive action.
- Define blocked v1 behavior: arbitrary clicking, production admin changes, credential handling, sending messages without confirmation.
- Define TTS privacy and interruption behavior.
- Define logging allowlist.

## Out of Scope

- Implementing Agent Mode.
- Implementing meeting transcription.
- Selecting a final wake word.

## Acceptance Criteria

- [ ] Contract identifies v1 scope and explicit non-goals.
- [ ] Every tool category has allowed/blocked/confirmation behavior.
- [ ] Logs and diagnostics are metadata-only.
- [ ] Contract names required UI states and recovery states.
- [ ] Human review decision is recorded for send-message/send-email behavior.

## Validation

- [ ] Run `rg -n "Agent Mode|agent_mode|voice command|TTS|confirmation" docs TECHNICAL_SPEC.md`.
- [ ] Manual review by Brandon before implementation tickets move to `Todo`.

## Dependencies

- Blocked by: Brandon review for high-risk action policy.
- Blocks: VA-006, VA-007, VA-008, VA-009, VA-010.
- Related: `docs/RW_064_GLOBAL_HOTKEY_CONTRACT.md`, `docs/RW_068_DIRECT_INSERTION_CONTRACT.md`.

## Agent Notes

- Likely files/areas: `docs/`, `TECHNICAL_SPEC.md`.
- Risk level: High because voice commands can take external actions.
- Handoff expectation: Contract PR only, no app behavior change.
- Source references: `docs/VOICE_AGENT_AND_SPEED_PLAN.md`.

## VA-006: Add Agent Mode session and hotkey plumbing

Status: Backlog
Priority: High
Labels: `macos`, `feature`, `agent-ready`, `symphony`, `blocked`

## Goal

Add a distinct Agent Mode recording session that can reuse the recorder but route the transcript to agent handling instead of direct insertion.

## Context

RubyWhisper already has dictation hotkeys and session intent for edit/command transforms. Agent Mode needs a clearer top-level mode so normal dictation stays fast and predictable.

## Scope

- Add an `agent` session mode or equivalent state.
- Add a configurable or fixed initial agent hotkey behind the contract.
- Ensure agent recording follows existing auth, onboarding, mic, accessibility, and duration gates.
- After transcription, route to agent handler rather than insertion.
- Keep current dictation behavior unchanged.

## Out of Scope

- Implementing real tools.
- TTS.
- Backend Quick Ask.

## Acceptance Criteria

- [ ] Agent Mode can start and stop independently from dictation mode.
- [ ] Dictation hotkeys still insert text as before.
- [ ] Agent transcripts do not automatically insert into the focused text field.
- [ ] Blocked gates show appropriate recovery.
- [ ] State resets correctly on cancel, logout, failure, and app quit.

## Validation

- [ ] Run `cd apps/macos && make test-hotkey-manager test-hotkey-recording-gate`.
- [ ] Run `cd apps/macos && make all`.
- [ ] Manual QA: dictation and agent hotkeys do not conflict.

## Dependencies

- Blocked by: VA-005.
- Blocks: VA-007, VA-009, VA-010.
- Related: `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/HotkeyManager.swift`.

## Agent Notes

- Likely files/areas: `AppState.swift`, `HotkeyManager.swift`, `ShortcutBinding.swift`, `RecordingIslandStateMachine.swift`.
- Risk level: High.
- Handoff expectation: PR with no tool execution yet.
- Source references: `docs/RW_064_GLOBAL_HOTKEY_CONTRACT.md`.

## VA-007: Implement safe local app and URL command routing

Status: Backlog
Priority: High
Labels: `macos`, `feature`, `privacy`, `agent-ready`, `symphony`, `blocked`

## Goal

Support deterministic voice commands such as `open Gmail`, `open Cursor`, and `open Notes` without using an LLM to invent Mac actions.

## Context

Walkie advertises app/URL voice commands. RubyWhisper can deliver the highest-value version with a local allowlist and `NSWorkspace`/URL opening.

## Scope

- Add a local `AgentCommandRouter`.
- Normalize command transcripts.
- Add allowlisted app aliases and URL aliases.
- Execute open/focus app and open URL actions.
- Return a display/spoken result string.
- Refuse unknown or unsafe commands with a clear result.

## Out of Scope

- Clicking UI.
- Sending email/messages.
- Shell commands.
- Reading screen content.
- LLM-generated tools.

## Acceptance Criteria

- [ ] `open Gmail` opens `https://mail.google.com`.
- [ ] `open Cursor` opens or activates Cursor when installed, with a graceful not-found result otherwise.
- [ ] Unknown commands do not execute arbitrary code or shell.
- [ ] Tool results are logged only as safe categories.
- [ ] Unit tests cover alias matching, unknown commands, unsafe phrases, and URL allowlist behavior.

## Validation

- [ ] Run new macOS unit tests for the router.
- [ ] Run `cd apps/macos && make all`.
- [ ] Manual QA for Gmail, Notes, Cursor, and an unknown app.

## Dependencies

- Blocked by: VA-005, VA-006.
- Blocks: VA-010.
- Related: `AppState.swift`, new router file under `apps/macos/Sources/`.

## Agent Notes

- Likely files/areas: new `AgentCommandRouter.swift`, `AppState.swift`, tests.
- Risk level: Medium.
- Handoff expectation: PR with deterministic local commands only.
- Source references: `docs/VOICE_AGENT_AND_SPEED_PLAN.md`.

## VA-008: Add backend Quick Ask text response endpoint

Status: Backlog
Priority: Normal
Labels: `backend`, `api`, `feature`, `privacy`, `agent-ready`, `symphony`, `blocked`

## Goal

Provide a server-side text answer route for Agent Mode questions that should speak or display an answer instead of inserting text.

## Context

Quick Ask needs server-side model credentials. The desktop app must not bundle provider keys. This route should accept text only for v1.

## Scope

- Add `POST /api/desktop/agent/respond`.
- Reuse desktop auth.
- Accept a transcript string and safe metadata.
- Call a server-side text model provider.
- Return text suitable for display and TTS.
- Add privacy and route tests.

## Out of Scope

- Live weather/news/search tools.
- App connectors.
- Email or calendar actions.
- Audio upload or TTS generation.

## Acceptance Criteria

- [ ] Signed-out requests return `signed_out`.
- [ ] Valid requests return a concise text answer with `Cache-Control: no-store`.
- [ ] The route rejects empty or oversized prompts.
- [ ] Request/response logs do not include prompt text or answer text.
- [ ] Provider failures map to canonical API errors.

## Validation

- [ ] Run focused route tests.
- [ ] Run `npm run test:auth-privacy`.
- [ ] Confirm changed-file privacy scan passes.

## Dependencies

- Blocked by: VA-005.
- Blocks: VA-009, VA-010.
- Related: `apps/web/src/app/api/desktop/transcribe/route.ts`, `apps/web/src/lib/providers/`.

## Agent Notes

- Likely files/areas: new API route under `apps/web/src/app/api/desktop/agent/respond/route.ts`, provider client tests.
- Risk level: Medium.
- Handoff expectation: PR with mocked provider tests.
- Source references: `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md` for auth/privacy style.

## VA-009: Add local text-to-speech playback for Agent Mode

Status: Backlog
Priority: Normal
Labels: `macos`, `feature`, `agent-ready`, `symphony`, `blocked`

## Goal

Let RubyWhisper speak Agent Mode results back to the user using native macOS speech.

## Context

Walkie Quick Ask includes spoken answers. RubyWhisper can start with native macOS voices before taking on local neural TTS complexity.

## Scope

- Add a `SpeechResponseService` wrapper.
- Speak local command results and Quick Ask answers when enabled.
- Add stop/cancel behavior.
- Add settings for spoken responses enabled/disabled and speech rate if small enough.
- Ensure dictation mode does not speak inserted text.

## Out of Scope

- Kokoro/MLX neural TTS.
- Voice cloning.
- Streaming TTS.
- Wake word.

## Acceptance Criteria

- [ ] Agent Mode can speak a short result.
- [ ] User can stop active speech.
- [ ] Dictation mode remains silent except existing alert sounds.
- [ ] TTS state does not block future dictation after completion/cancel.
- [ ] Tests cover service state transitions where feasible.

## Validation

- [ ] Run `cd apps/macos && make all`.
- [ ] Manual QA: ask a short question and stop speech mid-response.
- [ ] Manual QA: dictate normally and confirm no spoken transcript.

## Dependencies

- Blocked by: VA-005, VA-006.
- Blocks: VA-010.
- Related: `apps/macos/Sources/AppState.swift`, `apps/macos/Sources/SettingsView.swift`.

## Agent Notes

- Likely files/areas: new speech service, settings, recording island/menu state.
- Risk level: Medium.
- Handoff expectation: PR with native TTS only.
- Source references: `https://heyvox.dev` as product inspiration, not code source.

## VA-010: Add Agent Mode UI states, settings, and manual QA harness

Status: Backlog
Priority: Normal
Labels: `macos`, `qa`, `design`, `manual-qa`, `blocked`

## Goal

Make Agent Mode visible, understandable, and testable in the menu bar/settings/island surfaces.

## Context

Agent Mode will otherwise feel like hidden magic. The app should show when it is listening for an agent command, executing a safe tool, answering, speaking, or blocked.

## Scope

- Add Agent Mode labels/states to the island or menu where appropriate.
- Add settings for hotkey visibility, spoken responses, and allowed command list.
- Add a manual QA checklist for app/URL commands, unknown command refusal, Quick Ask, TTS stop, and blocked action behavior.
- Keep transcript content out of the island.

## Out of Scope

- Full onboarding redesign.
- Meeting UI.
- Arbitrary computer-use UI.

## Acceptance Criteria

- [ ] User can tell whether RubyWhisper is in dictation or agent mode.
- [ ] Agent Mode success/failure states are recoverable.
- [ ] Settings explain available commands without exposing private content.
- [ ] QA doc covers safe commands and refusal cases.

## Validation

- [ ] Run `cd apps/macos && make all`.
- [ ] Run affected state-machine/view tests.
- [ ] Manual QA from the new checklist.

## Dependencies

- Blocked by: VA-007, VA-008, VA-009.
- Blocks: None.
- Related: `RecordingOverlay.swift`, `RecordingIslandStateMachine.swift`, `SettingsView.swift`, `docs/qa/`.

## Agent Notes

- Likely files/areas: macOS UI files and `docs/qa/`.
- Risk level: Medium.
- Handoff expectation: PR with screenshots or manual QA evidence.
- Source references: `docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`.

## VA-011: Spike Granola-style meeting transcription architecture

Status: Backlog
Priority: Normal
Labels: `macos`, `spike`, `privacy`, `external-dependency`, `blocked`

## Goal

Decide how RubyWhisper should implement meeting transcription after Agent Mode MVP.

## Context

Meeting transcription is a different product surface from short dictation. It needs mic/system audio capture, long-running state, diarization, notes, storage, export, and likely calendar integration. Muesli is the strongest open-source architecture reference.

## Scope

- Audit local system audio capture options: CoreAudio process tap, ScreenCaptureKit fallback, and permission impact.
- Compare local ASR and diarization options: FluidAudio/Parakeet/Qwen3/WhisperKit/pyannote.
- Define privacy policy for meeting audio/transcripts/notes.
- Propose a separate meeting mode MVP and ticket queue.

## Out of Scope

- Implementing meeting recording.
- Calendar OAuth.
- Cloud sync.
- Production release.

## Acceptance Criteria

- [ ] Spike doc recommends a meeting architecture and names rejected options.
- [ ] Permission and privacy implications are explicit.
- [ ] Storage and retention model is proposed.
- [ ] Follow-up tickets are drafted only after Brandon review.

## Validation

- [ ] Source links and license notes are included.
- [ ] Manual review by Brandon.

## Dependencies

- Blocked by: Agent Mode MVP direction or explicit Brandon approval to start meeting work earlier.
- Blocks: Future meeting transcription project.
- Related: `https://github.com/pHequals7/muesli`, `docs/VOICE_AGENT_AND_SPEED_PLAN.md`.

## Agent Notes

- Likely files/areas: new planning doc under `docs/`.
- Risk level: High.
- Handoff expectation: Spike report only.
- Source references: Muesli, OpenWhispr meeting docs, RubyWhisper privacy contracts.
