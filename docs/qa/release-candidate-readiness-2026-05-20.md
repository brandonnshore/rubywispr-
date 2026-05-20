# RubyWhisper Release Candidate Readiness Evidence

Date: 2026-05-20.

Status: source-side release-candidate hardening is validated, but paid beta
release remains blocked by live/manual Mac, provider, billing, production, and
Apple signing gates.

This note is source-safe evidence only. It does not approve public release,
production promotion, Apple signing, notarization, artifact upload, live billing,
or live provider traffic.

## Source State

- `origin/main`: `d21ffd1` (`Fix RC readiness source head (#205)`).
- Landed PRs in the RC stack: `#200`, `#201`, `#202`, `#203`, `#192`, `#204`,
  and `#205`.
- Remaining open GitHub PRs checked during this pass: none.
- PR `#191` (`Use Supabase modern API key env names`) was closed as
  superseded. Current `main` already uses `SUPABASE_SECRET_KEY` and
  `SUPABASE_PUBLISHABLE_KEY` in templates/server config, with legacy Supabase
  env names retained only as fallbacks/guardrail labels.
- PR `#192` (`RUB-26 Benchmark Groq latency and cost assumptions`) was
  refreshed onto current `main`, revalidated, and merged. It records
  source-safe Groq benchmark evidence and updates ADR-006 with official Groq
  pricing/docs rechecked on 2026-05-20.
- Pre-`#206` check diagnosis: the real
  `Vercel - rubywhisper-web` deployment passed; the duplicate legacy
  `Vercel - rubywispr-` project built Next successfully and then failed because
  its project setting expects an output directory named `public`.
- PR `#206` is testing a source-side `vercel.json` override for the duplicate
  legacy project. The first `framework: nextjs` / default-output attempt reached
  the legacy project but still looked for root `.next`; the current attempt pins
  `outputDirectory` to `apps/web/.next`, where the workspace build writes Next
  output.

## Automated Validation

Commands run against the current source tree:

| Surface | Command | Result |
| --- | --- | --- |
| Repo startup | `scripts/setup-chat-env.sh` | Passed; private env left unchanged. |
| Dependency install | `npm ci` | Passed; installed locked dependency graph. |
| Web/backend lint | `npm run lint` | Passed. |
| Web/backend typecheck | `npm run typecheck` | Passed. |
| Web/backend tests | `npm test` | Passed, `414/414`. |
| Auth/privacy tests | `npm run test:auth-privacy` | Passed, `178/178`. |
| Web/backend build | `npm run build` | Passed with `next@16.2.6`. |
| Dependency audit | `npm audit` | Passed, `0` vulnerabilities. |
| Groq benchmark script syntax | `node --check scripts/benchmarks/groq-latency-cost.mjs` | Passed. |
| macOS tests | `make -C apps/macos test CODESIGN_IDENTITY=-` | Passed. |
| macOS clean build | `make -C apps/macos clean all CODESIGN_IDENTITY=-` | Passed. |
| macOS ad hoc signature | `codesign --verify --deep --strict --verbose=2 apps/macos/build/RubyWhisper.app` | Passed. |

## Local App Runtime Evidence

Ad hoc local app validation, not a release artifact:

- Built bundle identifier: `com.rubyadvisory.rubywhisper.local`.
- Built `LSUIElement`: `false`, so the local build is expected to stay reachable
  during desktop validation.
- `rubywhisper://run-log` opened a RubyWhisper window from the built app.
- CoreGraphics reported one onscreen RubyWhisper window with layer `0`, alpha
  `1`, and bounds `780x572`.

Computer Use blocker:

- `mcp__computer_use__.list_apps` can see the running RubyWhisper process.
- `mcp__computer_use__.get_app_state` for the exact built bundle still fails
  with `cgWindowNotFound`.
- CoreGraphics reports the RubyWhisper window with sharing state `0`, so current
  automation evidence is not strong enough to claim a clicked-through settings,
  run log, onboarding, or recording-island pass.

## Remaining Release Gates

These are not proved by the automated checks above:

- Full Mac manual QA from `docs/qa/macos-manual-qa-harness.md`, including real
  hotkey, microphone, recording island, no-audio/quick-tap, long-dictation,
  TextEdit/Notes/browser insertion, recovery paths, and unsafe-target behavior.
- Live OpenAI realtime and Groq fallback validation on the post-merge build with
  approved synthetic audio and approved private credentials.
- The RUB-26 Groq benchmark evidence is source-safe and useful for planning,
  but the original live timings were collected on 2026-05-10; rerun the
  benchmark before public beta launch or after provider tier/region/model
  changes.
- Live Clerk magic-link, Terms acceptance, authenticated desktop transcription,
  trial/quota, Stripe checkout, portal, webhook, and Friend of Ruby smokes.
- Production privacy/log/crash provider configuration and metadata-only
  inspection.
- Apple Developer ID signing, DMG packaging, notarization, stapling, checksum,
  public download/update feed, and clean-Mac quarantine-preserving install/open
  QA.
- Cleanup or disconnection of the duplicate legacy Vercel `rubywispr-` project
  check, which is configured for the wrong output directory and should not be a
  release signal for the active `rubywhisper-web` project. A source-side
  `vercel.json` framework/workspace-output override is being tested in PR
  `#206`; if both Vercel projects pass there, this gate can be removed.

## Beta Readiness Conclusion

The source tree is in a validated RC-candidate state for further human/live
gates. It is not yet a shippable paid beta artifact because the manual Mac,
live service, production, and Apple distribution gates above remain unproved.
