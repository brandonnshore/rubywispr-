# RubyWhisper Product Brief

## Summary

RubyWhisper is Ruby Advisory's Mac-only voice dictation app. It should feel like a native Apple utility: fast, quiet, beautiful, and always available.

The core experience:

```text
Put cursor anywhere -> hold or toggle hotkey -> speak -> see live voice pickup -> RubyWhisper transcribes and lightly cleans the text -> text appears in the active app.
```

RubyWhisper is inspired by tools like Wispr Flow and Superwhisper, but the first version is an internal company tool, not a public SaaS product.

## Product Principles

- Speed is the product. The app should feel real only if dictation returns quickly enough to stay in the writing flow.
- The UI should feel Apple-made: native, calm, precise, and visually polished.
- The recording state must be obvious. Users should always know when RubyWhisper is listening, processing, or idle.
- Text should land where the user was already working.
- Cleanup should improve rough dictation without changing the speaker's meaning or voice.
- Privacy should be clear. Local history and provider behavior should be understandable from settings.

## Target Platform

- macOS only for v0.1.
- Native Mac app behavior is more important than cross-platform reach.
- The app should live primarily in the menu bar and appear only when needed.

## V0.1 Core Flow

1. User focuses a text field in an app where typing is available.
2. User holds `Fn` to record, or presses `Command + Fn` to toggle recording.
3. A floating, draggable recording island appears without stealing focus.
4. The island shows a live vocal visualizer so the user can see that audio is being picked up.
5. User releases the hotkey or toggles recording off.
6. RubyWhisper transcribes the audio.
7. RubyWhisper lightly cleans the transcript.
8. RubyWhisper inserts the final text into the active text field.
9. If direct insertion fails, RubyWhisper uses a clipboard-safe fallback.
10. The transcript is saved locally in Recent Wisprs.

## Required V0.1 Features

- Mac menu bar app.
- Hold-to-talk hotkey: `Fn`.
- Toggle recording hotkey: `Command + Fn`.
- Floating draggable recording island.
- Live waveform or vocal meter.
- Direct insertion into the active text field.
- Clipboard-safe fallback insertion.
- Groq transcription by default.
- OpenAI-compatible provider support if the base app already supports it cleanly.
- Light cleanup/rewrite pass.
- Recent Wisprs history view.
- Settings for API key, provider, hotkeys, cleanup behavior, history retention, and privacy.

## Design Direction

RubyWhisper should look and feel like a premium macOS utility made by Apple.

The interface should be:

- Minimal but not empty.
- Native-feeling rather than web-app-like.
- Quiet, with high precision in spacing, typography, and motion.
- Focused on the recording island as the signature interaction.
- Motion-light for hotkey actions, because repeated dictation must feel instant.
- Alive only where it matters: the voice visualizer, processing state, and successful insertion feedback.

## Recording Island

The recording island is the most important UI surface.

It should:

- Float above other apps.
- Be draggable.
- Never steal focus from the active writing surface.
- Show recording, processing, success, and error states.
- Display a live vocal visualizer that moves with input volume.
- Stay compact enough to feel like a system control, not a window.
- Respect reduced motion.

## Recent Wisprs

The app should include a history view for recent dictations.

Each recent Wispr should include:

- Final cleaned output only, per `docs/RW_070_RECENT_WISPRS_CONTRACT.md`.
- Timestamp.
- Destination app if available without storing document, window, URL, selected,
  focused-field, or clipboard content.
- Copy action.
- Retry insertion or copy recovery action if feasible, without retranscribing.
- Local-only storage behavior with 7-day default expiry, clear history, and
  disable history controls.

Recent Wisprs must not store raw transcripts, audio, cleanup prompts, app
context, clipboard content, screenshots, or server-side history.

## Transcription Strategy

Default for v0.1:

- Groq Whisper Large v3 Turbo.

Reason:

- It is very cheap, currently listed by Groq at about `$0.04/hour` transcribed.
- It is built for speed.
- FreeFlow already uses Groq, which lowers integration risk.

Potential later options:

- Groq Whisper Large v3 for higher quality.
- OpenAI `gpt-4o-mini-transcribe` or `gpt-4o-transcribe`.
- Local transcription using `whisper.cpp`, Parakeet, or another on-device model.

Local transcription should be planned, but not required for v0.1 unless the forked base already makes it easy.

## Cleanup Strategy

Cleanup should be conservative.

It should:

- Add punctuation and capitalization.
- Remove obvious filler words.
- Fix clear transcription mistakes.
- Preserve names, jargon, and Ruby Advisory terms when known.
- Preserve the speaker's intent and tone.
- Avoid adding new ideas.
- Return the original transcript if cleanup fails.

## Non-Goals For V0.1

- Windows support.
- iOS support.
- Team accounts.
- Billing.
- Public launch.
- Heavy agent commands.
- Full voice command mode.
- Complex prompt marketplace.
- Fully local transcription as the default.
- Exact visual cloning of Wispr Flow.

## Definition Of Real

RubyWhisper v0.1 feels real when:

- Dictation is fast enough to use during real work.
- The recording island feels beautiful and trustworthy.
- The vocal visualizer proves the app is listening.
- Text appears in the active app with minimal friction.
- The app feels native, not like a wrapped website.
- Brandon can use it repeatedly in daily writing without fighting the tool.

## Planning Rule

Linear tasks should not be created until this brief and the fork strategy are approved.
