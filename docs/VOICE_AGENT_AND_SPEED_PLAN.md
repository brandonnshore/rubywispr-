# RubyWhisper Voice Agent And Speed Plan

Created: 2026-05-14
Status: Draft for Brandon review

## Problem Frame

RubyWhisper already has the core macOS dictation shape: menu bar app, Fn-style hotkeys, recording island, backend transcription, direct insertion, Recent Wisprs, account gates, and privacy contracts. The next product jump is to make RubyWhisper feel less like a transcription utility and more like a voice-first Mac layer:

- Dictation mode: speak text into any app.
- Agent mode: speak a command or question, then RubyWhisper acts or answers.
- Meeting mode: later, Granola-style meeting transcription and notes.

The right first build is Agent Mode MVP plus a parallel latency track. Meeting transcription should stay a follow-up, because it requires system audio capture, diarization, meeting detection, longer retention rules, and a different UI rhythm.

## External Research Snapshot

Walkie positions itself as a polished dictation app with local and fast modes, app/URL voice commands, Quick Ask with spoken answers, snippets, dictionary, text styles, translation, and Pro app connectors. See `https://walkie.b150.ai/en#features`.

No open-source project is a perfect 1:1 replacement for Walkie. The closest matches by capability are:

- OpenWhispr: closest Walkie-like open-source dictation surface overall. It is MIT licensed, cross-platform, supports local/cloud speech recognition, AI agent mode, meeting transcription, notes, custom dictionary, and an MCP/API surface. Its documented agent tools currently center on OpenWhispr notes rather than deep Mac app control. Sources: `https://openwhispr.com`, `https://docs.openwhispr.com`, `https://github.com/OpenWhispr/openwhispr`.
- Dottie: closest match for voice-to-voice Mac assistant behavior. Its public site/docs describe push-to-talk dictation, wake word, TTS, app control, email/messages/calendar/notes/reminders/music/screen tools, and a local API with deterministic tool execution. Verify source/license before borrowing implementation details. Sources: `https://www.dottie.ai`, `https://docs.dottie.ai`.
- FluidVoice: useful reference for local Mac dictation speed and command/write modes. It is GPL-3.0, so treat it as architecture inspiration, not code to copy into RubyWhisper without license review. Source: `https://github.com/altic-dev/FluidVoice`.
- HeyVox: useful reference for local STT plus local TTS, wake word, menu bar/HUD, and agent speech output. It focuses on coding agents, not general Mac control. Source: `https://heyvox.dev`.
- Muesli: strongest open-source Granola/Wispr hybrid reference for later meeting mode. It is MIT licensed and documents local dictation, mic plus system audio capture, VAD chunking, diarization, notes, and calendar integration. Source: `https://github.com/pHequals7/muesli`.
- Airakeet: useful performance reference for local-first Parakeet/ANE transcription and aggressive memory behavior. Source: `https://airakeet.com`.

## Repo Reality

Current RubyWhisper behavior:

- macOS app records 16 kHz mono PCM16 WAV and uploads a sealed artifact to `POST /api/desktop/transcribe`.
- Backend verifies auth, reads profile/subscription/usage, claims a rate limit, parses audio, calls Groq `whisper-large-v3-turbo`, runs conservative cleanup, writes metadata and usage, then returns final text.
- Direct insertion then writes into the focused field or falls back to local recovery.
- `AudioRecorder` already exposes `onPCM16Samples` with 24 kHz PCM16 chunks, but no realtime transcription provider is wired.
- App context capture can run during recording and `stopAndTranscribe` may wait for it before upload when context-aware cleanup is enabled.
- `PostProcessingService` and command transform code still exist, but the active upload path now relies on the backend response and does not call the local post-processing flow.

## Product Decision

Build a separate Agent Mode instead of overloading dictation.

Agent Mode should have its own trigger, state, routing, and safety policy:

- Dictation remains optimized for fast text insertion.
- Agent Mode can open/focus apps and URLs, answer short questions, and speak back.
- The first version should not click arbitrary screen targets, send messages/emails, run shell commands, or use private screen content without explicit approval.
- Later "computer use" work can add screen vision and click automation behind a stricter permission and confirmation model.

## Architecture

### Mode Model

Add a top-level voice session mode:

```text
dictation
  record -> transcribe -> insert

agent
  record -> transcribe command -> route intent -> execute safe tool or ask backend -> optional TTS

meeting
  long-running capture -> live transcript -> note generation
```

Agent mode should use the existing recorder and island at first. The distinction is what happens after transcription.

### Agent Mode MVP

First useful commands:

- `open Gmail` opens `https://mail.google.com`.
- `open Cursor`, `open Slack`, `open Notes`, etc. open or activate apps by allowlisted bundle/app names.
- `go to linear`, `open GitHub`, and similar open allowlisted URLs.
- `what is the weather`, `summarize this`, and other questions go through a backend text answer endpoint and return a spoken/text answer.
- Unknown or risky commands produce a short spoken refusal and visible fallback, not silent failure.

Local tool execution should be deterministic. Do not use an LLM to invent macOS actions in v1.

### TTS

Start with native macOS speech:

- Use `NSSpeechSynthesizer` or the modern AVFoundation speech API.
- Add settings for voice, rate, enable/disable spoken responses, and stop speaking.
- Pause/mute app audio only after a follow-up review. Current dictation already has audio interruption behavior, but TTS changes the audio model.

Later upgrade path:

- Local Kokoro/MLX for higher-quality voices.
- Streaming TTS.
- Voice response verbosity controls.

### Backend Quick Ask

Add a text-only route such as `POST /api/desktop/agent/respond`.

Responsibilities:

- Require desktop auth.
- Accept transcript text and safe metadata only.
- Use a server-side LLM provider key.
- Return `{ ok, text, spokenText?, requestId }`.
- No audio, screenshots, clipboard, selected text, or private target-app content in v1.

Live weather/news/search should be separate tools, not hidden model guesses. For MVP, generic questions can be answered by the model; live data tools come later.

### Latency Track

Do not guess where the delay is. Add client-side timing first:

- stop pressed -> audio sealed
- context ready or skipped
- upload starts
- backend response received
- insertion starts
- insertion completes

Likely quick wins from source review:

- Timebox or skip context capture for normal dictation while backend cleanup is conservative/rule-based.
- Use the existing binary request path when context and dictionary are absent, avoiding multipart construction/parsing.
- Move non-critical successful request metadata writes fully off the response path; keep quota/usage semantics correct.
- Consider parallelizing request parsing with account reads after auth.

Big speed track after evidence:

- Add OpenAI Realtime transcription as a separate cloud streaming provider.
  - Keep Groq `whisper-large-v3-turbo` as the current fast batch fallback.
  - Use `gpt-realtime-whisper` for live transcript deltas.
  - Stream 24 kHz mono PCM16 chunks from `AudioRecorder.onPCM16Samples`.
  - Start with manual commit on hotkey release, then test server VAD later.
- Add a local fast mode using Parakeet/FluidAudio or WhisperKit.
- Use local transcription for immediate dictation and backend only for account/quota/sync/optional cleanup.
- Wire `AudioRecorder.onPCM16Samples` to streaming local or realtime provider transcription if cloud fast mode remains important.

OpenAI Realtime references and implementation notes live in `docs/OPENAI_REALTIME_TRANSCRIPTION_PLAN.md`.

## Sequencing

### Wave 1: Measure And Remove Obvious Latency

Goal: make current dictation faster without changing the product surface.

1. Add privacy-safe client timing.
2. Timebox or disable context wait on normal dictation.
3. Add binary upload fast path.
4. Move non-critical metadata off the happy response path.
5. Add OpenAI Realtime cloud streaming transcription behind a provider flag.

### Wave 2: Agent Mode Contract

Goal: define what RubyWhisper is allowed to do by voice.

1. Add an Agent Mode safety contract.
2. Define tool categories: allowed, confirmation-required, blocked.
3. Define UI states and TTS behavior.

### Wave 3: Agent Mode MVP

Goal: "open Gmail" and "ask a question, hear an answer" work end to end.

1. Add agent hotkey/session mode.
2. Route transcribed agent commands to a local command router.
3. Add app/URL open/focus tools.
4. Add native TTS.
5. Add backend text answer endpoint.

### Wave 4: QA And Polish

Goal: make it reliable enough for daily use.

1. Manual app-command QA.
2. Non-destructive safety tests.
3. Settings/menu polish.
4. Latency budget review.
5. Sound and island UI polish pass.

### Wave 5: Meeting Mode Spike

Goal: decide whether to build Muesli-style meeting capture locally.

1. Audit system audio capture options.
2. Decide mic/system audio split and permissions.
3. Decide diarization and note generation approach.
4. Create a separate meeting-mode implementation plan.

## Open Questions

1. Agent hotkey: use a new chord like `Control+Fn`, double-tap Fn, or a menu-configured command hotkey?
2. Spoken replies: default on for Agent Mode, off for Dictation?
3. Quick Ask provider: OpenAI Realtime for spoken Agent Mode, or text-only backend first?
4. Live tools: should weather/news/web search be v1, or should v1 answer generic questions and open the browser for live info?
5. Safety stance: should "send email" create a draft only, always require confirmation, or stay out of scope until connectors exist?

## Non-Goals For This First Build

- No arbitrary screen clicking or computer-use automation.
- No sending email/messages without explicit future confirmation design.
- No shell command execution by voice.
- No meeting transcription in the Agent Mode MVP.
- No source-code copying from GPL projects into RubyWhisper.
- No desktop provider keys.

## Validation Commands

Source-safe validation for early tickets:

```bash
npm run test:auth-privacy
cd apps/macos && make test-hotkey-manager test-hotkey-recording-gate test-direct-insertion-coordinator
cd apps/macos && make all
```

Live/manual validation remains required for real latency and app-control behavior.
