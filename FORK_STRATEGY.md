# RubyWhisper Fork Strategy

## Decision

Use an existing open-source macOS dictation app as the starting harness instead of building RubyWhisper from scratch.

Recommended base:

- `zachlatta/freeflow`
- GitHub: https://github.com/zachlatta/freeflow
- License: MIT

RubyWhisper should use FreeFlow as the first implementation base unless a short technical audit finds a blocking issue.

## Why FreeFlow First

FreeFlow already matches the core RubyWhisper product shape:

- Swift/macOS app.
- Hold `Fn` to talk.
- Toggle `Command + Fn` to start and stop dictation.
- Groq API key flow.
- Text pasted into the current field.
- Context-aware cleanup.
- Custom vocabulary.
- OpenAI-compatible provider configuration.
- MIT license.
- Active project with meaningful adoption.

This gives RubyWhisper a working system harness quickly, so most effort can go into product polish, UI quality, provider defaults, and company-specific behavior.

## Destination Repo

Use the current repo:

```text
/Users/brandonshore/rubywispr-
```

Remote:

```text
https://github.com/brandonnshore/rubywispr-.git
```

The app name should be:

```text
RubyWhisper
```

The repo name may stay `rubywispr-` unless Brandon decides to rename it later.

## Evaluation Criteria

Before committing fully to FreeFlow, audit it for:

- Build reliability on the current Mac.
- Clear Swift project structure.
- Hotkey implementation quality.
- Paste/insertion reliability.
- Permissions handling.
- Groq configuration.
- Cleanup pipeline.
- Recording island implementation.
- History or run-log storage.
- License notices and attribution requirements.
- Difficulty of rebranding.

If FreeFlow fails the audit, compare the fallback options below.

## Fallback Candidates

### Dictate Anywhere

Repository:

```text
https://github.com/hoomanaskari/mac-dictate-anywhere
```

Strengths:

- Native macOS.
- On-device Parakeet transcription.
- Live waveform.
- Hands-free mode.
- Optional cleanup with Apple Intelligence, Ollama, or OpenRouter.
- Strong reference for local-first transcription and cleanup settings.

Use if:

- FreeFlow is hard to rebrand or unstable.
- Local-first transcription becomes a hard v0.1 requirement.

### Handy

Repository:

```text
https://github.com/cjpais/Handy
```

Strengths:

- Very mature and widely adopted.
- Tauri/Rust architecture.
- Fully local speech-to-text.
- VAD support.
- Cross-platform.
- Good reference for model management and robust audio processing.

Use if:

- RubyWhisper later needs a stronger local model engine.
- Cross-platform support becomes important.

Tradeoff:

- Less native-Mac feeling than a Swift/AppKit or SwiftUI app.

### Steno

Repository:

```text
https://github.com/Ankit-Cherian/steno
```

Strengths:

- Swift/macOS.
- App-aware insertion.
- Local `whisper.cpp`.
- Transcript history.
- Personal lexicon and style profiles.

Use if:

- App-aware insertion becomes the hardest problem.
- RubyWhisper needs stronger behavior for terminals, editors, and accessibility fallback.

### CustomWispr

Repository:

```text
https://github.com/beausterling/CustomWispr
```

Strengths:

- Simple Swift baseline.
- `Fn` hold-to-talk.
- Floating overlay.
- OpenAI Whisper plus GPT cleanup.
- Clipboard-safe paste.

Use if:

- We want the simplest possible Swift codebase to customize.

Tradeoff:

- Smaller and less mature than FreeFlow.

### Murmur

Repository:

```text
https://github.com/hssstg/murmur
```

Strengths:

- Swift/AppKit.
- Offline model.
- Capsule overlay.
- History.
- Hotwords.
- Optional OpenAI-compatible cleanup.

Use if:

- Offline transcription and native capsule UI become more important than Groq speed.

## Proposed Import Plan

1. Audit FreeFlow without editing RubyWhisper.
2. Confirm license and attribution requirements.
3. Import or fork FreeFlow into the RubyWhisper repo.
4. Confirm the app builds locally.
5. Rename app surfaces from FreeFlow to RubyWhisper.
6. Update bundle identifiers and app metadata.
7. Preserve upstream license notices.
8. Set Groq Whisper Large v3 Turbo as the default provider.
9. Polish the recording island and macOS settings UI.
10. Add or refine Recent Wisprs.
11. Package a first local build.

## Risk Areas

- macOS accessibility permissions can make paste/insertion brittle.
- Capturing `Fn` may require specific system keyboard settings.
- Floating overlays can accidentally steal focus if implemented incorrectly.
- Local model pipelines may be slower or heavier than expected.
- Provider APIs and pricing can change.
- Rebranding a fork can touch many project files.
- Notarization and signing may become a separate packaging task.

## Provider Recommendation

Use Groq first:

```text
whisper-large-v3-turbo
```

Reasons:

- Very low cost.
- Fast inference.
- FreeFlow already points in this direction.
- Good enough to validate the product feel.

Keep provider abstraction flexible so OpenAI, local models, or other OpenAI-compatible endpoints can be added later.

## UI Recommendation

Do not merely reskin FreeFlow.

RubyWhisper's differentiator should be the feel:

- A better recording island.
- More Apple-native settings.
- Clearer provider and privacy controls.
- A recent Wisprs view that is useful without feeling busy.
- Tighter microcopy.
- Faster perceived state changes.

## Linear Rule

Do not create Linear issues from this strategy until Brandon approves the task list in chat.

The correct workflow is:

```text
Plan in chat -> write planning docs -> draft Linear tasks in chat -> get approval -> create Linear project/issues -> connect Codex/Symphony later.
```
