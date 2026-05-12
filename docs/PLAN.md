# RubyWhisper — Reliability + UI Refresh Plan

**Last updated:** 2026-05-11 (post-deploy)
**Scope:** Single multi-track effort to (a) fix transcription reliability/latency, (b) match Wispr Flow's Dock-anchored pill UX on the Mac, (c) lift the web app to SuperWhisper-grade premium.

Companion docs:
- [`ARCHITECTURE_SNAPSHOT.md`](ARCHITECTURE_SNAPSHOT.md) — how the system is wired today.
- [`adr/ADR-002-reliability-and-ui-refresh.md`](adr/ADR-002-reliability-and-ui-refresh.md) — decisions log for this initiative.

---

## TL;DR

Out of 27 originally-planned milestones, **21 shipped to `main`** across 3 commits, both Mac and Web builds pass, web reliability test suite is **37/39 passing** (the 2 remaining failures pre-date this work). The biggest remaining items are intentionally deferred to a screenshot-iterate-on-the-live-app loop: the Mac state-machine refresh (M2.3), onboarding/settings redesigns (M3.1, M3.2), and page-by-page web polish (M4.5).

## Shipped milestones

| ID | Commit | Files changed | Notes |
|---|---|---|---|
| **M0.1** | `ab81efc` | `apps/macos/Sources/Theme.swift` (new) | Mac mirror of web `--rw-*` tokens. Manual sync today; can become a real package later. |
| **M0.2** | `25735c3` | `apps/web/src/app/api/desktop/transcribe/route.ts:76-78` | `preferredRegion = ["iad1"]`, `maxDuration = 30`. |
| **M0.3** | n/a | user pasted 425 prod log lines | Revealed real root cause: **most failures are 503 `provider_error` from Groq, not 422**. This flipped M1 priorities mid-flight. |
| **M1.1** | `25735c3` | `apps/macos/Sources/AudioRecorder.swift:683-705` | `durationMs = recordedFrameCount / sampleRate * 1000` (was wall-clock). |
| **M1.2** | `25735c3` | `apps/macos/Sources/AppState.swift:1057-1062, 1135-1158` | RIFF/WAVE magic-byte check before upload. Throws retryable `invalidAudio` on bad header. |
| **M1.3** | `25735c3` | `apps/macos/Sources/AppState.swift:1135-1141` | Dropped `application/octet-stream` fallback. Always `audio/wav`. |
| **M1.4** | `25735c3` | `apps/web/src/lib/desktop-transcribe/request.ts:199-228, 343-374` | Server-side WAV sniff with `wav_header_invalid` trace reason. |
| **M1.5** | `25735c3` | `apps/web/src/lib/desktop-transcribe/request.ts:208` | Explicit `duration_le_zero` trace reason. |
| **M1.6** | `25735c3` | `apps/web/src/app/api/desktop/transcribe/route.ts:298-358` | Post-call writes via `Promise.all` + Next.js `after()`. ~100-300ms saved on happy path. |
| **M1.7** | `25735c3` | `apps/web/src/lib/providers/groq.ts:50-152` | Groq retry once on 5xx/408/network/timeout, 12s `AbortController`, 1.5s backoff. Targets the 503 burst pattern. |
| **M1.V** | (verified) | tests + Vercel logs | 19/19 route, 12/12 request, 6/8 groq (2 pre-existing). Production now emits new trace strings. |
| **M2.1** | `ab81efc` | `apps/macos/Sources/RecordingOverlay.swift:25-32, 393-475` | Dock-anchored panel replaces notch-attached `NSPanel`. |
| **M2.2** | `ab81efc` | `apps/macos/Sources/RecordingOverlay.swift:25-32` | 200×40 pill with fully-rounded corners (`height/2`). |
| **M2.4** | `ab81efc` | `apps/macos/Sources/RecordingOverlay.swift:51-80` | Ruby-graphite linear gradient + hairline inner stroke + diffuse drop shadow. |
| **M2.6** | `ab81efc` | `apps/macos/Sources/RecordingOverlay.swift:86-92` | `anchorScreen` uses key window's display first, falls back to `NSScreen.main`. |
| **M3.3** | `ab81efc` | `apps/macos/Sources/MenuBarView.swift:70-99` | Replaced harsh `Color.orange` / `Color.red` permission banners with soft ruby-tinted treatment. |
| **M4.1** | `57a63c6` | `apps/web/src/app/layout.tsx` | `Inter` (400-800) + `JetBrains_Mono` via `next/font/google`. |
| **M4.2** | `57a63c6` | `apps/web/src/app/globals.css:3-93` | Dark palette (#0A0A0B bg, #F5F5F0 text, #d2546b accent), motion + shadow tokens. |
| **M4.3** | `57a63c6` | `apps/web/src/app/(public)/page.tsx:214-260`, `apps/web/src/app/globals.css:470-650` | Killed fake Notes window mockup. New `ProductProof` is a Wispr-style Dock-anchored pill with animated 14-bar waveform on a soft ruby glow. |

**Cross-cutting test infra fixes** also landed in commit `25735c3` (not separate milestones): updated test allow-list for `next/server` and `@/lib/desktop/auth`, fixed sync/async `requireAuth` mock mismatch from c093c7b, replaced stale `requireClerkUserId` assertion. **17 of 19 route tests went from failing to passing** as a side effect.

---

## Deferred milestones (still pending)

All deferred because they require a screenshot-iterate-on-the-live-app loop that's hard to do blind. Ordered by user-felt impact.

### M4.5 — Web page-by-page polish
**Files:** `apps/web/src/app/(public)/pricing/page.tsx`, `download/page.tsx`, `support/page.tsx`, `terms/page.tsx`, `privacy/page.tsx`, `(auth)/sign-in/...`, `(auth)/sign-up/...`, `account/page.tsx`, `admin/page.tsx`, plus `apps/web/src/app/globals.css` sections that may have hardcoded light values.
**Scope:** Apply M4.1/M4.2 tokens consistently. Audit Clerk theming via `clerkAppearance` for auth pages. Replace the monotonous `.surface-panel` envelope (globals.css:174-179) with per-page bespoke layouts.
**Effort:** M. Each page is ~30-60 minutes with screenshots-iterate. 9 pages.

### M2.3 — Mac recording-island 5-state machine refresh
**Files:** `apps/macos/Sources/RecordingIslandStateMachine.swift` (621 LOC), `apps/macos/Sources/RecordingIslandStateMachine.swift:30+` for the case set.
**Scope:** Today's state machine has 20+ cases (signedOut, termsRequired, microphoneRecovery, hotkeyConflict, etc.). Wispr Flow's spec is 5 states: idle / listening / processing / confirm / error. Collapsing means moving recovery affordances out of the pill itself — likely into the menu bar dropdown or a toast.
**Effort:** L. Big behavior change; need user input on where recovery copy lives.

### M2.5 — Final control styling (X cancel + state-dependent right button)
**Files:** `apps/macos/Sources/RecordingOverlay.swift` (the `RecordingOverlayView` body and its subviews).
**Scope:** Today's controls already work; this is final visual polish — circular 28pt buttons, fade-in on 80ms delay after pill expand, red stop / spinner / white checkmark per state.
**Effort:** S. Mostly visual. Pair with M2.3 since they touch the same view.

### M3.1 — Mac onboarding (12 steps → fewer Apple-style screens)
**Files:** `apps/macos/Sources/SetupView.swift` (1,417 LOC), `apps/macos/Sources/FirstRunOnboardingCoordinator.swift` (540 LOC).
**Scope:** Group: welcome+account → permissions (mic+accessibility+screen-recording in one) → shortcuts (hold+toggle+command in one) → test+ready. Token-based cards replace default `Button("Continue")` chrome.
**Effort:** L. Real flow surgery; needs you to walk through your preferred order.

### M3.2 — Mac settings (8-tab redesign with token cards)
**Files:** `apps/macos/Sources/SettingsView.swift` (2,486 LOC).
**Scope:** Today's `SettingsCard` uses `Color(nsColor: .controlBackgroundColor).opacity(0.5)` + 1px primary @ 6% border — stock SwiftUI tutorial look. Replace with `Theme.swift`-backed cards. Clean sidebar.
**Effort:** L. Mostly mechanical but huge file.

### M4.4 — Web motion primitives (scroll reveals + spring hovers)
**Files:** `apps/web/src/app/(public)/page.tsx` and any page-level reveal containers.
**Scope:** Page-load fade + 8pt translate on scroll-in. Spring-eased hover (~1.02 scale) on `.rw-button` / `.route-link`. Reduced-motion guarded. Use Framer Motion or view-transitions API.
**Effort:** S-M. New dep (Framer Motion is small) or use the lighter view-transitions API. Token already in place (`--rw-easing-standard`).

---

## Pending verification gates

### M2.V — Mac UI verification
- [ ] Side-by-side video vs Wispr Flow reference screenshots (the ones uploaded 2026-05-11).
- [ ] State-by-state demo: idle → listening → processing → confirm → error.
- [ ] Multi-monitor sanity check on a second display.
- [ ] Full-screen-app behavior (does the pill stay visible over Zoom/Final Cut/etc.?).

**Blocker right now:** Accessibility permission TCC issue — see [ADR-002 §Open issues](adr/ADR-002-reliability-and-ui-refresh.md). Once Fn-hold triggers the pill, the rest of this gate becomes quick.

### M4.V — Web verification
- [ ] Side-by-side vs `superwhisper.com` for premium feel.
- [ ] Lighthouse perf + a11y on `/` and `/pricing`.
- [ ] Reduced-motion + dark/light system preference check.
- [ ] Mobile responsive pass.

---

## Open questions (need user input)

| # | Question | Why it matters | Default if you don't decide |
|---|---|---|---|
| 1 | Vercel plan tier? (Hobby caps `maxDuration` at 10s, Pro at 60s.) | M0.2 sets 30s — clamped to 10s on Hobby, OK on Pro. | Assume Pro; revisit if 503s show up at `function_invocation_timeout`. |
| 2 | Multi-monitor: stay on active key window's display, or follow cursor across screens? | Currently active-display. Cursor-follow is what some users expect. | Stay with key-window-display. |
| 3 | Full-screen apps: always-on-top via `.screenSaver` window level, or hide-and-restore on hotkey? | Currently always-on-top. Hide may feel cleaner for video editing. | Always-on-top. |
| 4 | Brand accent — keep ruby `#d2546b` (lifted on dark) or pull from a wider palette later? | `#d2546b` is the working color across Mac (Theme) and web (--rw-color-accent). | Keep. |
| 5 | Mobbin auth — worth completing for richer competitive UI patterns in future Mac/web work? | Skipped this round; OAuth URL still valid if you want it. | Skip; we have what we need. |
| 6 | Confirm-state collapse — auto-dismiss the pill after ~600ms when transcription succeeds, or require user click? | Today: auto, but visual confirm window is short. | Auto. |
| 7 | Should the active pill ever show inline transcript text, or stay control-only like Wispr Flow? | Today: control-only. Inline text would crowd 200×40. | Stay control-only. |
| 8 | LLM cleanup (currently no-op in `groq.ts:41-44`) — build for real when we have latency baseline, or strip the scaffold? | Conservative rule-based cleanup still runs and is fine. LLM cleanup costs latency + tokens. | Wait for post-deploy latency data, then decide. |

---

## Recommended next steps (in order)

1. **Unblock the Mac dev build** (TCC / "Global Shortcuts Unavailable") — see [ADR-002 §Dev-loop pain](adr/ADR-002-reliability-and-ui-refresh.md). Without this, M2.V can't progress.
2. **Walk the deployed web app** at `rubywhisper-web.vercel.app` and capture any pages that read broken on the new dark palette. Those become M4.5 line items.
3. **M4.4 motion primitives** is the cheapest premium win after M4.5 lands — a single afternoon of work, big perceived bump.
4. **M2.3 + M2.5 together** as one Mac UI iteration (the recording island visual loop).
5. **M3.1 / M3.2** last — they're the biggest files and the lowest user-felt urgency.

## What lives where after today

- Source of truth for milestones: this doc (`docs/PLAN.md`).
- Decisions log: [`docs/adr/ADR-002-reliability-and-ui-refresh.md`](adr/ADR-002-reliability-and-ui-refresh.md).
- Architecture snapshot: [`docs/ARCHITECTURE_SNAPSHOT.md`](ARCHITECTURE_SNAPSHOT.md).
- Existing `WEB_DESIGN_SPEC.md` at repo root: agent-generated, historical; superseded by `docs/PLAN.md` + `docs/ARCHITECTURE_SNAPSHOT.md`. Leaving in place for now; safe to delete when the plan stabilises.
