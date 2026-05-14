# OpenAI Realtime Transcription Plan

Created: 2026-05-14
Status: Draft implementation handoff

## Decision

Keep Groq `whisper-large-v3-turbo` as RubyWhisper's current fast batch fallback. Add OpenAI Realtime transcription as a separate cloud streaming provider for the "instant when I release the hotkey" experience.

RubyWhisper should not replace the existing upload path immediately. The streaming path should be provider-gated and fall back to batch upload whenever session startup, socket connection, provider errors, or final transcript assembly fail.

## Current Official References

- OpenAI Realtime transcription guide: `https://developers.openai.com/api/docs/guides/realtime-transcription`
- OpenAI Realtime WebSocket guide: `https://developers.openai.com/api/docs/guides/realtime-websocket`
- OpenAI Realtime WebRTC guide: `https://developers.openai.com/api/docs/guides/realtime-webrtc`
- OpenAI reference repo, Realtime Console: `https://github.com/openai/openai-realtime-console`
- OpenAI reference repo, Realtime Agents: `https://github.com/openai/openai-realtime-agents`

The Realtime Console repo is the better reference for session mechanics and event logging. The Realtime Agents repo is useful later for Agent Mode and spoken assistant behavior, but it is more than RubyWhisper needs for dictation speed.

## API Key Requirement

Use a normal OpenAI Platform project API key on the trusted backend, conventionally `OPENAI_API_KEY`. It does not need to be a special "Realtime key"; the account/project needs access to the Realtime models and billing/rate limits that support the feature.

Do not put OpenAI API keys in the macOS app bundle or user defaults. For local development, use the existing private env workflow from this repo's agent instructions. For production, configure the backend host's secret environment.

When implementation starts, run the secure OpenAI API key setup flow if no usable key exists. Do not paste or print plaintext keys in chat, logs, docs, or git.

## Model Choice

Use `gpt-realtime-whisper` for live transcription. Official docs position it as the low-latency streaming transcription model with transcript deltas.

Keep these as alternatives, not the first streaming target:

- `gpt-4o-transcribe`: better for high-accuracy request-response transcription where streaming deltas are not required.
- `gpt-4o-mini-transcribe`: lower-cost request-response transcription.
- `whisper-1`: compatibility path; not the same native streaming behavior.

## RubyWhisper Fit

RubyWhisper already has the right audio shape:

- `AudioRecorder.onPCM16Samples` emits 24 kHz mono PCM16 chunks.
- OpenAI realtime transcription expects `audio/pcm` at 24 kHz mono for PCM input.
- The current recorder still writes the 16 kHz WAV artifact for batch fallback.

This means the first implementation can stream the same recording session while preserving the current upload artifact as backup.

## Recommended Architecture

Use backend WebSocket proxy first, not direct Mac-to-OpenAI with a long-lived key.

```text
macOS app
  records mic
  emits 24 kHz PCM16 chunks
  opens RubyWhisper backend streaming session
  sends base64 PCM frames / receives transcript deltas

RubyWhisper backend
  authenticates desktop user
  owns OPENAI_API_KEY
  opens OpenAI Realtime WebSocket transcription session
  sends session.update with type=transcription and model=gpt-realtime-whisper
  forwards input_audio_buffer.append events
  commits on stop when needed
  returns partial/final transcript events to Mac

fallback
  if streaming final transcript is unavailable, use existing Groq batch upload path
```

Reasons:

- Keeps provider secrets off-device.
- Reuses desktop auth, quotas, account gates, request IDs, and privacy controls.
- Lets the backend normalize provider events and switch providers later.
- Keeps Groq batch mode available when streaming is degraded.

## Realtime Session Shape

The backend should create or update a realtime transcription session with:

```json
{
  "type": "session.update",
  "session": {
    "type": "transcription",
    "audio": {
      "input": {
        "format": {
          "type": "audio/pcm",
          "rate": 24000
        },
        "transcription": {
          "model": "gpt-realtime-whisper",
          "language": "en"
        },
        "turn_detection": null
      }
    }
  }
}
```

For RubyWhisper push-to-talk, start with `turn_detection: null` and commit explicitly on hotkey release. Server VAD can be tested later for partial turn handling, but manual commit maps cleanly to the existing user model.

Audio chunks are sent as:

```json
{
  "type": "input_audio_buffer.append",
  "audio": "<base64 pcm16>"
}
```

On stop, send:

```json
{ "type": "input_audio_buffer.commit" }
```

Handle:

- `conversation.item.input_audio_transcription.delta`
- `conversation.item.input_audio_transcription.completed`
- provider/session error events

## Desktop Behavior

1. User presses/holds dictation hotkey.
2. App starts local recording as it does today.
3. If Cloud Streaming is enabled and account allows it, app opens a RubyWhisper streaming session.
4. `AudioRecorder.onPCM16Samples` forwards chunks while recording.
5. UI may show partial transcript later, but v1 can keep the current island and only use the final transcript.
6. On release, app commits the stream and waits a short budget for completed transcript.
7. If final transcript arrives, run current insertion path.
8. If it does not arrive, use current batch upload path with the transient WAV artifact.

## Timing Targets

Track these additional safe fields:

- `stream_session_connect_ms`
- `first_audio_sent_ms`
- `first_delta_ms`
- `stop_to_stream_final_ms`
- `stream_final_to_insert_ms`
- `stream_fallback_reason`

No transcript, audio bytes, app names, window titles, selected text, or screenshots should be logged.

## Cosmetic Work

Keep sound/UI polish in a separate small pass from streaming provider work:

- Sound: choose softer start/stop/complete sounds, or add a setting to disable/preview them.
- Island copy: make states feel clearer: `Listening`, `Transcribing`, `Inserting`, `Ready`.
- Run Log copy: keep privacy-redacted wording like `Audio not stored` and `transcript not stored`.
- Optional later: show live partial text only after streaming is stable.

Do not mix cosmetic changes into the first streaming provider PR unless they are required to represent new states.
