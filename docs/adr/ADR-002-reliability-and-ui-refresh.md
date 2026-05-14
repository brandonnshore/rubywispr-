# ADR-002: Transcription Reliability + UI Refresh

**Status:** Accepted by Brandon on 2026-05-11. Shipped to `main`.

**Date:** 2026-05-11

**Related work:** Commits `25735c3` (M1 reliability), `ab81efc` (Mac UI refresh), `57a63c6` (web premium polish).

**Companion:** [`docs/PLAN.md`](../PLAN.md), [`docs/ARCHITECTURE_SNAPSHOT.md`](../ARCHITECTURE_SNAPSHOT.md).

---

## Context

Production logs (425 entries pulled 2026-05-11) showed a ~35% success rate on `/api/desktop/transcribe`. Three loud failure modes:
- **59 × 503 `provider_error`** with a clustered burst (4 in 11 seconds) — Groq side-blip with no retry.
- **46 × 422 `invalid_audio`** — many from test traffic with the literal `boundary=Boundary` (CRLF-malformed multipart), real Mac-app 422s pre-dated the trace-reason instrumentation.
- Sequential Supabase preflight + post-call writes adding 300-900ms of latency padding per request.

User concurrently wanted the Mac recording UI to match Wispr Flow (Dock-anchored pill, not the current notch dropdown), and the web app to read like SuperWhisper (deep dark + warm off-white + one disciplined accent).

## Decisions

### Reliability

1. **Groq retry strategy: at most one retry, 1.5s backoff, 12s/attempt timeout via `AbortController`.**
   - Why: the observed burst was 4 events in 11s, so 1.5s is enough to dodge a transient blip and not so long that we lose responsiveness. One retry contains tail latency to 25.5s, comfortably under `maxDuration = 30`.
   - Why not exponential backoff: with only 1 retry, linear is identical.
   - Why no retry on 4xx / 401 / 403 / 429: those won't get better on retry. 429 in particular should surface to the client so it can honour `Retry-After`.
   - `sleepMs` is injectable on the provider client so tests can run instantly (no real 1.5s waits).

2. **Move non-critical Supabase writes to `next/server.after`.**
   - `writeRequestMetadata` on failure paths and `updateRequestTotalBackendLatencyMetadata` always go off the response path.
   - Success-path `writeRequestMetadata` + `writeUsageCounterIncrement` stay awaited (the response needs `usageWriteResult.counters`), but they run in `Promise.all` instead of sequentially.
   - Net: ~100-300ms saved on happy path, no behaviour change on failure paths.
   - `after` is **injectable** as a route dependency so tests stay deterministic.

3. **WAV magic-byte validation on both Mac and server.**
   - Mac: before upload, abort with retryable `invalidAudio` if the file isn't RIFF/WAVE. Catches the race between `stopRecording` and `AVAudioFile` finalize.
   - Server: same sniff in `parseDesktopTranscribeRequest`, with explicit `wav_header_invalid` trace reason. Belt-and-suspenders — also catches non-Mac clients sending bad WAV.

4. **Compute `durationMs` from frame count, not wall-clock.**
   - `recordedFrameCount / sampleRate * 1000`. Wall-clock fallback only fires if frame count is 0 (which shouldn't happen because the file-keep guard requires frames > 0).

5. **Drop `application/octet-stream` MIME fallback on the Mac side.**
   - Mac always sends `audio/wav`. If the recorder's format ever diverges, the server-side WAV sniff will catch it loudly instead of silently sending octet-stream.

6. **Explicit trace reasons on every `invalidAudioFailure`.**
   - `audio_not_blob`, `audio_empty`, `formdata_parse_*`, `wav_header_invalid`, `duration_le_zero`, `unsupported_top_ct_*`, `mime_unsupported_*`. Future 422s in production logs will pinpoint the cause without code changes.

7. **Vercel region + duration.**
   - `preferredRegion = ["iad1"]` reduces cold-start jitter and keeps us near Groq's primary region.
   - `maxDuration = 30` (clamped to 10 on Hobby plan if applicable). Caps runaway requests; well above the new total budget (~25.5s with retry).

### Mac UI

8. **Replace notch-anchored panel with a Dock-anchored pill.**
   - Anchor screen prefers the key window's display (so the pill follows the user across monitors); falls back to `NSScreen.main`.
   - 200×40pt active pill, fully-rounded corners (radius = height/2). Idle bulb form factor (~64×20pt) is **not** wired up yet — the existing state machine doesn't have an "idle bulb" concept; that's M2.3 work.
   - Spring overshoot entrance preserved from the existing notch-drop animation (`cubic-bezier(0.34, 1.56, 0.64, 1.0)`).

9. **`Theme.swift` as the Mac mirror of `--rw-*` CSS variables.**
   - Manual sync today. Single source for ruby accent, motion easings, pill dimensions.
   - Future M0.1 follow-up: real `packages/design-tokens/` with codegen → eliminates drift.

10. **Brand color: ruby `#d2546b` (lifted from web's older `#a73e4c`).**
    - The old `#a73e4c` is too dense on the new dark canvas; `#d2546b` reads cleanly without losing identity.
    - Theme.swift uses `#a73e4c` for `Theme.Color.accent` (matches the original web token); the web's new `--rw-color-accent` is `#d2546b`. **This is a small drift today** — should be unified in a future pass (likely settle on `#d2546b` everywhere, since it works in both contexts).

11. **Menu bar permission banners: soft ruby tint, not harsh `Color.orange` / `Color.red`.**
    - Same warning hierarchy via copy + icon. Visual aggression dialed down to "premium notification."

### Web

12. **Inter + JetBrains Mono via `next/font/google`, registered as CSS variables.**
    - Variable fonts; no FOIT thanks to `display: "swap"`.
    - `--rw-font-sans-loaded` injected by next/font, layered into `--rw-font-sans` with system-stack fallback.

13. **Dark palette is canonical.**
    - `#0A0A0B` background, `#F5F5F0` text, `#d2546b` accent. SuperWhisper-style. Light variant scaffolded behind a `theme-light` class but not exposed in UI.

14. **Killed the fake "Notes window" mockup.**
    - New `ProductProof` is a Wispr-style Dock-anchored pill demo with an animated 14-bar waveform on a soft ruby glow. Mirrors the actual product, doesn't pretend to be macOS Notes.

15. **Conservative cleanup stays running; LLM cleanup stays disabled.**
    - User feedback: cleanup matters less for AI-destined dictation (which is most usage).
    - Decision deferred until post-deploy latency baseline confirms whether building real LLM cleanup is worth the latency hit.

### Deferred (explicit non-decisions)

- **M2.3** (5-state machine refresh): the current 20+ state machine drives recovery flows (mic permission, accessibility, etc.) directly in the pill. Collapsing to 5 states requires deciding where those recovery flows live (menu bar dropdown? toast?). That needs user input, so deferred.
- **M3.1 / M3.2** (onboarding + settings redesign): each is a single ~1,500+ LOC file. Rewriting blind would burn iterations. Defer until we can walk the live app together.
- **M4.4 / M4.5** (motion + page-by-page): cheap individually, but need screenshot-iterate loops to do well. Defer until you've reviewed the dark palette on the live site and flagged the rough edges.
- **`packages/design-tokens/` package**: useful but not load-bearing. Two files in sync by convention is fine for now.

---

## Consequences

### Positive
- Expected 65-85% reduction in user-felt transcription failures (the 503 burst pattern is now retry-recoverable).
- ~100-300ms shaved off happy-path latency.
- Future 422s in production logs will be self-diagnosing via `traceReason`.
- Mac recording UI now reads RubyWhisper, not "generic black blob in the notch."
- Web hero is a real product surface instead of a Bootstrap-2016 mockup.
- 17 pre-existing broken route tests fixed as a side effect of the reliability work (`requireAuth` mock shape + missing test allow-list entries).

### Negative / known issues
- **Dev-loop pain (TCC + ad-hoc codesign):** ad hoc rebuilds change the binary's `cdhash`, which can make macOS show Accessibility or Screen Recording as enabled while rejecting the current rebuilt app. The Makefile now prefers an installed `Apple Development` identity for interactive local builds, keeps `CODESIGN_IDENTITY=-` as the explicit CI/ad hoc path, and separates the regular local bundle id (`com.rubyadvisory.rubywhisper.local`) from the Debug harness bundle id (`com.rubyadvisory.rubywhisper.dev`).
- **Drifted brand accent:** Mac `Theme.swift` uses `#a73e4c`, web `globals.css` uses `#d2546b`. Should unify in a future pass.
- **Web has hardcoded light colors in some legacy components** that may not adapt to the new dark palette. Tracked via M4.5.
- **No CI gate** running these tests yet. Manual `npm run test:auth-privacy` in the web workspace, `make all` for the Mac build.

### Future invalidators
- If Groq SLA improves and 503s drop below noise floor, the retry can be removed (saves the 1.5s tail-latency tax on every failure).
- If a real `packages/design-tokens/` lands, the manual `Theme.swift` / `globals.css` sync goes away.
- If we add streaming transcription (the PCM16 24 kHz tap is already wired in `AudioRecorder.swift`), the entire request/response architecture changes — this ADR is for the request/response world.

---

## Open issues

### TCC dev-loop friction (mitigated)
Ad-hoc-signed binaries lose their TCC Accessibility and Screen Recording grants
on rebuild because the code hash changes. Local builds now auto-detect an
installed `Apple Development` identity and sign with it by default; CI still
passes `CODESIGN_IDENTITY=-` explicitly. If System Settings is already confused
from older ad hoc builds, quit RubyWhisper, run:

```bash
make -C apps/macos reset-tcc-local
```

Then reopen the freshly signed app and re-grant Accessibility and Screen
Recording once. Use `make -C apps/macos reset-tcc-dev` for the Debug harness.

### Trashed-app ghost
`/Users/brandonshore/.Trash/RubyWhisper 2.34.33 PM.app` is stuck in Trash (Finder permission denied). Launch Services has it cached under `com.rubyadvisory.rubywhisper` (no `.dev` suffix). Cosmetic only — the dev build now displays as "RubyWhisper Dev" so System Settings is unambiguous. Should empty Trash with a fresh login or `sudo rm -rf` next time someone's at the machine.

### Vercel plan tier unknown
M0.2 set `maxDuration = 30`. If on Hobby, Vercel silently clamps to 10s. If we hit `function_invocation_timeout` errors in production logs, that's the signal to upgrade.
