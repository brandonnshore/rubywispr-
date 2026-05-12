# RubyWhisper — Architecture Snapshot

**Last updated:** 2026-05-11 (post-deploy of `25735c3`, `ab81efc`, `57a63c6`)
**Purpose:** Fast on-ramp for anyone (human or agent) picking up this codebase. Skips beta-launch trivia; focuses on the wiring that matters for current and near-future work.

Companion: [`PLAN.md`](PLAN.md), [`adr/ADR-002-reliability-and-ui-refresh.md`](adr/ADR-002-reliability-and-ui-refresh.md).

---

## Repo layout

```
rubywispr-/
├── apps/
│   ├── macos/           ← Swift + SwiftUI + AppKit Mac app (54 files, ~6,800 LOC)
│   │   ├── Sources/      ← all Swift
│   │   ├── Info.plist    ← bundle metadata (Makefile overrides CFBundleName/ID at build)
│   │   ├── RubyWhisper.entitlements
│   │   └── Makefile      ← swiftc invocation; supports APP_NAME="RubyWhisper Dev"
│   └── web/             ← Next.js 16 + React 19 + Tailwind v4 (mostly unused) + Clerk + Supabase + Stripe
│       ├── src/
│       │   ├── app/      ← App Router
│       │   ├── lib/      ← providers, cleanup, auth, billing, etc.
│       │   └── config/
│       └── test/         ← node:test suites (no jest)
├── docs/                 ← contracts + plan docs
└── package.json          ← npm workspaces, declares apps/web
```

The Mac app is **not** an npm workspace — it's a sibling Swift package compiled via Makefile. The two apps share visual tokens through manual mirroring between `apps/macos/Sources/Theme.swift` and `apps/web/src/app/globals.css` (no shared package).

---

## Web pipeline: `/api/desktop/transcribe`

Entry: `apps/web/src/app/api/desktop/transcribe/route.ts`
Runtime config: `runtime = "nodejs"`, `preferredRegion = ["iad1"]`, `maxDuration = 30`, `dynamic = "force-dynamic"`.

### Request flow (success path)

```
[Mac app] POST multipart/form-data with audio/wav blob + duration + metadata
   │
   ▼
requireDesktopUserId(request.headers)              ← reads bearer token
   │
   ▼ (signed in?)
readProfile(clerkUserId)                            ← Supabase round-trip #1
   │
   ▼ (terms accepted?)
Promise.all([readSubscription, readUsageCounters]) ← Supabase round-trip #2 (parallel)
   │
   ▼ (entitled? per evaluateRubyWhisperQuotaEntitlement)
evaluateRateLimit                                   ← Supabase round-trip #3
   │
   ▼ (under limit?)
parseDesktopTranscribeRequest                       ← apps/web/src/lib/desktop-transcribe/request.ts
  ├── content-type sniff (multipart vs binary audio/*)
  ├── audio MIME + WAV RIFF/WAVE magic-byte sniff
  └── duration normalize (positive integer, ≤ 600_000ms)
   │
   ▼
groqProviderClient.transcribe(input)                ← apps/web/src/lib/providers/groq.ts
  ├── AbortController, 12s/attempt timeout
  ├── retry once on 5xx / 408 / network / AbortError, 1.5s backoff
  └── never retries on 4xx / 401 / 403 / 429 (those won't get better)
   │
   ▼
runRubyWhisperConservativeCleanup                   ← apps/web/src/lib/cleanup/conservative-cleanup.ts
  └── rule-based; LLM cleanup is a no-op since commit d0d521d
   │
   ▼
Promise.all([writeRequestMetadata, writeUsageCounterIncrement])  ← Supabase, on response path
after(() => updateRequestTotalBackendLatencyMetadata)             ← Supabase, OFF response path (Next.js after())
   │
   ▼
Response.json({ ok: true, cleanedText, trialWordsRemaining, ... })
```

### Failure paths (all return shared `rubyWhisperApiErrorResponse`)

- 401 `signed_out` — pre-parse; no DB work
- 403 `terms_required` — after profile read only
- 503 `service_unavailable` — any Supabase failure
- 4xx entitlement errors (`account_blocked`, `payment_failed`, `subscription_required`, `trial_exhausted`)
- 429 `rate_limited`
- 422 `invalid_audio` — with `traceReason` metadata (`audio_not_blob`, `audio_empty`, `wav_header_invalid`, `duration_le_zero`, `mime_unsupported_*`, `formdata_parse_*`, `unsupported_top_ct_*`)
- 4xx `duration_limit_reached`
- 4xx/5xx Groq passthroughs (`provider_*`, `network_error`, `provider_timeout`)
- Failure-path `writeRequestMetadata` goes to `after()` so it doesn't block the error response.

### Dependency injection

The route handler is constructed via `createDesktopTranscribeRouteHandler(dependencies)`. Production wires `defaultDesktopTranscribeRouteDependencies` (real Supabase, real Groq, `nextServerAfter` from `next/server`). Tests inject mocks via `createRouteDependencies({...})` in `apps/web/src/lib/__tests__/desktop-transcribe-route.test.mjs`. The DI pattern is the reason the test suite is robust.

### Key trace strings in production logs

Search Vercel runtime logs for:
- `GROQ_SENTINEL_2026_05_11_v2` — entry breadcrumb on every Groq call
- `groq_transcription_failed` — Groq returned non-2xx
- `groq_transcription_threw` — exception (network/abort)
- `groq_retry_scheduled` — about to retry
- `groq_retry_succeeded` — second attempt succeeded
- `INVALID_AUDIO_TRACE` — parser rejected the request, includes `traceReason`
- `desktop_transcribe_entry` — request received

---

## Mac app surfaces

Entry: `apps/macos/Sources/App.swift` declares an `App` with `MenuBarExtra` + the recording overlay window.

### Four main surfaces

1. **Menu bar dropdown** — `MenuBarView.swift`. Permission banners, auth state, settings link, quit.
2. **Recording island (the pill)** — `RecordingOverlay.swift` (923 LOC) + `RecordingIslandStateMachine.swift` (621 LOC).
   - Today: Dock-anchored 200×40 pill, ruby-graphite gradient. Spring-eased entrance from below screen edge.
   - State machine drives presentation: `RecordingIslandPresentation` has 20+ cases, condensed into 4 `OverlayPhase`s (initializing / recording / transcribing / feedback).
3. **First-run onboarding** — `SetupView.swift` (1,417 LOC) + `FirstRunOnboardingCoordinator.swift` (540 LOC). Currently 12 sequential steps.
4. **Settings window** — `SettingsView.swift` (2,486 LOC). 8 tabs (Account, Appearance, General, Advanced, Prompts, Voice Macros, Run Log, Debug).

Surfaces 3 and 4 are stock SwiftUI today — they're the next major UI lift (M3.1 / M3.2).

### Audio capture

`AudioRecorder.swift`:
- Recording target format: 16 kHz mono PCM16 WAV, hard-coded in `recordingTargetFormat`.
- Writes via `AVAudioFile`; tracks `recordedFrameCount` for accurate duration.
- Optional `onPCM16Samples` tap at 24 kHz mono for future realtime streaming (not currently wired to a provider).

### Hotkey backend

`GlobalShortcutBackend.swift` installs a `CGEvent.tapCreate(.cgSessionEventTap, .headInsertEventTap, .defaultTap, ...)`. Requires **Accessibility** permission. With ad-hoc-signed dev builds + hardened runtime, every rebuild has a new cdhash, which can invalidate the TCC grant. See [ADR-002 §Dev-loop pain](adr/ADR-002-reliability-and-ui-refresh.md) for the workaround (`APP_NAME="RubyWhisper Dev" make all`).

### Backend client

`RubyWhisperBackendAPIClient.swift` (1,400+ LOC). Talks to `apps/web` via:
- `POST /api/desktop/transcribe` — multipart, audio + metadata
- `POST /api/desktop/login/exchange` — PKCE-style auth handoff
- `GET /api/desktop/account` — account snapshot
- Standardised error codes via `RubyWhisperBackendErrorCode` enum (mirrors web's `RubyWhisperApiErrorCode`).

---

## Design tokens

Two manually-synced sources of truth:

- **Web:** `apps/web/src/app/globals.css:3-93`. CSS custom properties under `--rw-*`. Dark palette, motion easings, shadows.
- **Mac:** `apps/macos/Sources/Theme.swift`. SwiftUI `Color`, `CGFloat`, `Animation` constants under `Theme.Color`, `Theme.Radius`, `Theme.Space`, `Theme.Pill`, `Theme.Motion`.

**Brand color:** ruby `#d2546b` (lifted from the web app's older `#a73e4c` for better contrast on the new dark canvas).

**When updating tokens:** change both files. There's no automated check yet — that'd be a future M0.1 follow-up (real `packages/design-tokens/` with codegen).

---

## Build + deploy

### Web
- `cd apps/web && npm install` (deps live at `apps/web/node_modules` — Next.js doesn't hoist out of the box here).
- `npm run build` — Next.js 16, validates types + bundles.
- Deploy: Vercel auto-deploy on push to `main`. Project `rubywhisper-web` under org `ruby-advisory`. Vercel root directory is `apps/web` (set up in commit `4063938`).
- Runtime URL: `https://rubywhisper-web.vercel.app`.

### Mac
- `cd apps/macos && make all` — single swiftc invocation, all sources at once.
- Output: `build/RubyWhisper.app`.
- Build with distinct bundle name to avoid Accessibility ambiguity: `APP_NAME="RubyWhisper Dev" make all` → `build/RubyWhisper Dev.app`. See [ADR-002](adr/ADR-002-reliability-and-ui-refresh.md).
- Code signing: ad-hoc (`CODESIGN_IDENTITY ?= -`). Hardened runtime enabled.
- No notarization yet; not shipping outside dev machines.

### Tests
Web: `cd apps/web && npm run test:auth-privacy` runs the relevant suites. Key files: `test/groq-provider-client.test.mjs`, `test/desktop-transcribe-route.test.mjs`, `test/desktop-transcribe-request.test.mjs`. Tests transpile TypeScript inline (no shared build); they validate route behaviour + privacy guardrails.

Mac: tests live in `apps/macos/Tests/`, run via the `make test-*` targets in the Makefile. The recording island has its own visual test harness (`RecordingIslandVisualTestHarness.swift`).

---

## What's NOT here yet

- No streaming/realtime transcription (the PCM16 tap exists but isn't wired to OpenAI Realtime or similar).
- No automatic shared design-tokens package — web and Mac tokens are kept in sync by hand.
- No tail-latency monitoring dashboard — Vercel runtime logs are the current source of truth for p50/p95.
- No client-side telemetry beyond the existing diagnostic console.error breadcrumbs in `groq.ts` and `request.ts`.
- LLM cleanup is intentionally a no-op (rule-based conservative cleanup runs).
- No light-mode for the web app (dark is canonical; `theme-light` class hook exists as scaffolding).
