# RubyWhisper Release Candidate Readiness Evidence

Date: 2026-05-20.
Updated: 2026-05-21 for source-safe release-gate preflight evidence.

Status: source-side release-candidate hardening is validated, but paid beta
release remains blocked by live/manual Mac, provider, billing, production, and
Apple signing gates.

This note is source-safe evidence only. It does not approve public release,
production promotion, Apple signing, notarization, artifact upload, live billing,
or live provider traffic.

## Source State

- Validated app/package/CI source/config head for this evidence pass:
  `f241977` (`Update GitHub Actions runtime versions (#210)`).
- Landed PRs in the source/config RC stack: `#200`, `#201`, `#202`, `#203`,
  `#192`, `#204`, `#205`, `#206`, `#209`, `#210`, and `#211`.
- PR `#207` refreshed deployment/runbook evidence after the source-side Vercel
  fix and did not change app runtime source, macOS source, backend source, or
  deployment config.
- PR `#208` stabilized the evidence wording so later docs-only refreshes do not
  change the app/source validation claim.
- PR `#209` replaced the local DMG packaging helper with macOS built-in
  `hdiutil`, added automatic macOS CI coverage for macOS PRs, and added CI
  verification for the local app-plus-Applications DMG shape.
- PR `#210` updated GitHub Actions runtime versions after the macOS CI
  Node 20 action-runtime deprecation warning; web and macOS PR checks passed.
- PR `#211` refreshed docs-only Mac packaging evidence after PR `#210` merged.
- PR `#212` adds
  `npm run qa:release-gate` as a repeatable source-safe check for env
  placeholders, public deployment smoke, `/api/status`, and explicitly deferred
  live/manual beta gates.
- Check open GitHub PR state directly before release; it is intentionally not
  treated as durable evidence in this note.
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
- PR `#206` (`Test source Vercel output defaults`) adds a source-side
  `vercel.json` override that keeps `outputDirectory` at `.next` for both the
  active app-root Vercel project and the duplicate legacy repo-root project. The
  build command copies `apps/web/.next` to root `.next` only when the deployment
  runs from the repository root.
- PR `#206` check diagnosis: `npm validation`, `GitGuardian Security Checks`,
  `Vercel Preview Comments`, `Vercel - rubywhisper-web`, and the duplicate
  legacy `Vercel - rubywispr-` check all passed. The duplicate legacy Vercel
  check is no longer a remaining release gate.

## Automated Validation

Commands run against the validated source/config tree:

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
| Local DMG packaging shape | `make -C apps/macos clean dmg CODESIGN_IDENTITY=-`; `hdiutil attach`; verify `RubyWhisper.app` and `Applications` symlink; detach | Passed; local/ad hoc artifact only, not Developer ID signed, notarized, stapled, uploaded, or release-approved. |
| macOS CI PR build/package gate | PR `#209` and PR `#210` `Debug ad hoc build` checks | Passed; builds the ad hoc app, verifies bundle/signature, packages local DMG, mounts it, verifies contents/symlink, and runs `hdiutil verify`. |
| macOS CI main dispatch | `gh workflow run macos-ci.yml --ref main` at commit `90e1f30` | Passed; post-merge check after PR `#209` verified the app build and local DMG shape on GitHub-hosted macOS. |
| Release gate preflight, source-only | `npm run qa:release-gate -- --skip-network --allow-blocked` | Passed; validates release env placeholders and records live/manual release gates as deferred. |
| Release gate preflight, deployed smoke | `npm run qa:release-gate -- --allow-blocked` | Passed; validates release env placeholders, public deployed routes, `/api/status`, and records live/manual release gates as deferred. |
| Release gate preflight, blocking mode | `npm run qa:release-gate` | Exits `2` by design after source-safe checks pass because live/manual release gates remain deferred. |

## Deployed Web/Backend Smoke

Post-`#206` smoke against `https://rubywhisper-web.vercel.app`:

| Surface | Result |
| --- | --- |
| `/`, `/pricing`, `/download`, `/privacy`, `/terms`, `/support` | HTTP `200`; RubyWhisper/Next content present. |
| `/sign-in`, `/sign-up` | HTTP `200`; auth pages render with private no-store cache headers. |
| `/api/status` | HTTP `200`; JSON status payload reports `status: "ok"` and `Cache-Control: no-store`. |

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
  QA. Source-safe local DMG shape validation has passed, but release DMG
  signing/notarization/publication remains human-gated.

## Beta Readiness Conclusion

The source tree is in a validated RC-candidate state for further human/live
gates. It is not yet a shippable paid beta artifact because the manual Mac,
live service, production, and Apple distribution gates above remain unproved.
