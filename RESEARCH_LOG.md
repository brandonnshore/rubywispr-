# RubyWhisper Research Log

Status: Draft
Last updated: 2026-05-03

## Research Questions

- Can RubyWhisper safely start from an open-source macOS dictation app?
- What do comparable dictation products charge and promise?
- Can RubyWhisper offer "unlimited personal dictation" at the planned price?
- Which auth/billing/database providers best fit a fast paid beta?
- What distribution/update tools are appropriate for a direct-download macOS app?
- What privacy controls must be explicit because the product handles voice and text?

## Sources Checked

| Source | Link | Used for |
| --- | --- | --- |
| FreeFlow GitHub | https://github.com/zachlatta/freeflow | Candidate fork base, license, hotkeys, Groq/context behavior. |
| Wispr Flow pricing | https://wisprflow.ai/pricing | Competitive pricing and usage limits. |
| Wispr Flow setup docs | https://docs.wisprflow.ai/articles/3152211871-setup-guide | Browser sign-in/setup expectation. |
| Wispr Flow account docs | https://docs.wisprflow.ai/articles/7339517111-manage-your-flow-account | Account requirement and local history behavior reference. |
| Superwhisper | https://superwhisper.com/ | Website/product positioning reference. |
| Groq pricing | https://groq.com/pricing | Transcription cost basis. |
| Stripe Billing pricing | https://stripe.com/billing/pricing | Subscription billing cost consideration. |
| Clerk pricing | https://clerk.com/pricing | Auth provider cost/free-tier consideration. |
| Clerk session token docs | https://clerk.com/docs/how-to/validate-session-tokens | Backend session validation direction. |
| Supabase passwordless auth docs | https://supabase.com/docs/guides/auth/auth-email-passwordless | Auth alternative reference. |
| Auth.js email provider docs | https://authjs.dev/getting-started/authentication/email | Auth alternative reference. |
| Sparkle | https://sparkle-project.org/ | Direct-download macOS auto-update. |
| Sentry sensitive data docs | https://docs.sentry.dev/platforms/javascript/guides/nextjs/data-management/sensitive-data/ | Privacy-safe crash/error reporting constraints. |

## Candidate Base Apps

### FreeFlow

Recommendation: first audit target.

Reasons:

- Native macOS/Swift direction.
- Already aligned with `Fn` hold-to-talk and `Command+Fn` toggle pattern.
- Existing Groq integration.
- Existing cleanup/context concepts.
- MIT license.
- Active project signals.

Risks:

- May assume user-provided provider key in desktop app.
- Backend-proxy architecture may require meaningful refactor.
- Rebranding may touch many Xcode/signing files.
- Need to verify insertion reliability and focus behavior.

#### RW-010 FreeFlow Build Reliability Audit

Audit target:

- Repository: `https://github.com/zachlatta/freeflow`
- Checkout: upstream `main` at `b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c`
- Local path: `tmp/freeflow-rub-23` in this workspace
- Local environment: `Brandons-MacBook-Pro`, macOS 26.2 `25C56`, arm64, Xcode 26.3 `17C519`, Swift 6.2.4

Project shape:

- No `.xcodeproj`, `.xcworkspace`, `Package.swift`, `Podfile`, `Cartfile`, `project.yml`, or `.xcconfig` files were present.
- There are no Xcode schemes. `xcodebuild` cannot be the current FreeFlow build entrypoint.
- The app is built by `Makefile` with direct `swiftc -parse-as-library`, `Info.plist`, `FreeFlow.entitlements`, resources, and `codesign`.
- Runtime source is under `Sources/`. No third-party Swift package manager dependencies were identified.
- The Makefile defaults to `APP_NAME="FreeFlow Dev"`, `BUNDLE_ID=com.zachlatta.freeflow.dev`, `ARCH=$(uname -m)`, and `CODESIGN_IDENTITY="FreeFlow Dev"`.
- Optional DMG/release dependencies are `create-dmg` and `fileicon`; GitHub release workflows install them with Homebrew and import a Developer ID certificate before running `make`.

Commands and evidence:

```bash
git clone https://github.com/zachlatta/freeflow.git tmp/freeflow-rub-23
cd tmp/freeflow-rub-23
git rev-parse HEAD
# b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c
```

```bash
xcodebuild -list
# exit 66
# xcodebuild: error: The directory .../tmp/freeflow-rub-23 does not contain an Xcode project, workspace or package.
```

```bash
make clean && make
# swiftc compile started successfully.
# failed at codesign: FreeFlow Dev: no identity found
```

```bash
make clean && make CODESIGN_IDENTITY=-
# Built build/FreeFlow Dev.app
```

```bash
codesign -dv "build/FreeFlow Dev.app"
# Signature=adhoc
# Identifier=com.zachlatta.freeflow.dev
# TeamIdentifier=not set
```

```bash
open -n "build/FreeFlow Dev.app"
pgrep -fl "FreeFlow Dev"
# process observed at build/FreeFlow Dev.app/Contents/MacOS/FreeFlow Dev
osascript -e 'tell application "FreeFlow Dev" to quit'
```

Build result:

- Passed for a local developer build when using ad-hoc signing: `make CODESIGN_IDENTITY=-`.
- Failed with default Makefile settings on this machine because the expected local code signing identity `FreeFlow Dev` was not installed.
- `xcodebuild` validation failed because the repo has no Xcode project, workspace, package, or schemes. Exact Xcode scheme names: none.

Actionable blockers and follow-up:

- If RubyWhisper requires Xcode/CI commands, the import should add or generate an Xcode project/workspace or SwiftPM package; FreeFlow currently cannot satisfy `xcodebuild -scheme ... -configuration Debug build`.
- Local setup docs should tell developers to run `make CODESIGN_IDENTITY=-` for ad-hoc Debug-style builds or install/configure the expected signing identity.
- Release/notarized builds need Apple Developer ID credentials plus `create-dmg` and `fileicon`, matching upstream GitHub Actions.
- No real production API keys were used. The smoke test only launched and quit the app; no provider validation, transcription, or cleanup API calls were made.

Recommendation from build audit:

- FreeFlow is buildable enough to remain the preferred macOS base for the next audit/import step, with a clear caveat: its current build system is Makefile/direct-`swiftc`, not Xcode. Treat Xcode project creation or documented Makefile-based CI as part of the import plan.

#### RW-012 FreeFlow License, Attribution, And Rebrand Audit

Audit target:

- Repository: `https://github.com/zachlatta/freeflow`
- Checkout: upstream `main` at `b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c`
- Local path: `tmp/freeflow-rub-25` in this workspace

License and attribution:

- Root `LICENSE` is MIT with copyright `Copyright (c) 2026 Zach Latta`.
- Engineering obligation: preserve the upstream copyright notice and MIT permission notice in all RubyWhisper source copies and in any distributed app/release package that includes substantial FreeFlow code or assets.
- Recommended RubyWhisper notices:
  - Keep an upstream notice file, for example `THIRD_PARTY_NOTICES.md` or `NOTICE`, with the full FreeFlow MIT license text and source URL.
  - Include the same notice in the signed app distribution, for example `RubyWhisper.app/Contents/Resources/ThirdPartyNotices.md`, an About/Acknowledgments settings panel, or both.
  - Keep release/website copy clear that RubyWhisper is derived from FreeFlow where attribution is shown, without implying Zach Latta or FreeFlow maintainers endorse RubyWhisper.
- No copyleft, source-disclosure, patent-field, network-use, or paid-product blocker was identified from the FreeFlow license. This is an engineering license review, not legal advice.

Third-party dependency and license inventory:

- No `Package.swift`, `Package.resolved`, `Podfile`, `Cartfile`, `.xcodeproj`, `.xcworkspace`, `project.yml`, `Gemfile`, `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, or submodules were present.
- App code imports Apple platform frameworks only: SwiftUI/AppKit/Cocoa, Foundation/Combine, AVFoundation/CoreMedia/CoreAudio, ApplicationServices/Carbon, ScreenCaptureKit, Security, CoreData, UniformTypeIdentifiers, and `os.log`.
- Optional build/release tooling is not bundled into the app but should be re-evaluated for RubyWhisper CI: Homebrew `create-dmg` and `fileicon`, GitHub Actions `actions/checkout@v4`, `softprops/action-gh-release` pinned to `a06a81a03ee405af7f2048a818ed3f03bbf83c7b`, and `codelytv/pr-size-labeler@v1`.
- Runtime external services/brand strings are not vendored dependencies but must be reworked for RubyWhisper product policy: Groq/OpenAI-compatible provider URLs, GitHub release/update URLs, and GitHub star/contributor metadata.

Rebrand touchpoints found by search:

- Build and bundle identity:
  - `Makefile`: defaults `APP_NAME=FreeFlow Dev`, `BUNDLE_ID=com.zachlatta.freeflow.dev`, `CODESIGN_IDENTITY=FreeFlow Dev`; release builds pass `APP_NAME=FreeFlow` and `BUNDLE_ID=com.zachlatta.freeflow`.
  - `Info.plist`: `CFBundleName`, `CFBundleDisplayName`, `CFBundleExecutable`, `CFBundleIdentifier`, version keys, icon file, and microphone/speech/accessibility usage strings.
  - `FreeFlow.entitlements`: file name should be renamed even though the current entitlement payload is generic audio input only.
  - `.github/workflows/release.yml` and `.github/workflows/dev-release.yml`: `FreeFlowBuildTag`, DMG names, GitHub release names/body, bundle ID, signing/notarization flow, and artifact names.
  - `.agents/skills/freeflow-release/**`: release skill name, prompts, helper script paths, and FreeFlow-specific release language.
- App source identity:
  - `Sources/App.swift`: app type is `FreeFlowApp`.
  - `Sources/AppName.swift`: fallback display name is `FreeFlow`.
  - `Sources/AppState.swift`: dev-bundle check for `FreeFlow Dev`, recording flag comments/path defaults, dispatch label `com.zachlatta.freeflow.recording-state-flag`, and automatic-termination reason text.
  - `Sources/AudioRecorder.swift`, `Sources/GlobalShortcutBackend.swift`, `Sources/RealtimeTranscriptionService.swift`, `Sources/TranscriptionService.swift`: OSLog subsystems and dispatch queue labels under `com.zachlatta.freeflow`.
  - `Sources/KeychainStorage.swift`: fallback keychain service `com.zachlatta.freeflow`; import should plan migration from any FreeFlow dev data only if intentionally needed.
  - `Sources/UpdateManager.swift`: update checks use `https://api.github.com/repos/zachlatta/freeflow/releases`, `FreeFlowBuildTag`, `FreeFlow.dmg`, and temporary `freeflow-*` directories. RubyWhisper needs its own update channel or Sparkle plan before release.
  - `Sources/SettingsView.swift` and `Sources/SetupView.swift`: visible `zachlatta/freeflow` star/contributor cards, GitHub API calls, avatar URL, support links, `FreeFlowBuildTag`, settings copy, and a test context bundle ID of `com.zachlatta.freeflow`.
  - `Sources/TestCaseExporter.swift`: exported ZIP names and temp directories use `freeflow-case-*`.
- Assets and docs:
  - `Resources/AppIcon-Source.png`, `Resources/AppIcon.icns`, `Resources/AppIcon-Dev-Source.png`, `Resources/AppIcon-Dev.icns`: FreeFlow app icons should be replaced for RubyWhisper identity.
  - `Resources/demo.gif`, `website/assets/demo.gif`, `website/assets/app-icon.png`: FreeFlow demo/website assets should not ship as RubyWhisper product media unless deliberately retained with attribution.
  - `README.md`, `CHANGELOG.md`, `website/**`: FreeFlow product, website, sitemap, download, license, privacy, and domain copy. RubyWhisper already has separate product docs, so upstream website files should likely be excluded from import or archived only as attribution/source reference.

Recommended import stance:

- No license blocker was identified before import.
- Treat attribution as a release checklist item: RubyWhisper must preserve the FreeFlow MIT notice in source and distributed app artifacts before any external beta build.
- Treat rebrand as medium scope. The build system supports `APP_NAME`/`BUNDLE_ID` overrides, but the source still has hardcoded OSLog labels, update URLs, GitHub attribution/star UI, app icon/demo assets, release workflow names, and support docs that should be cleaned during RW-060.
- Do not carry over FreeFlow's update channel, website, or public release workflows as-is; they point at `zachlatta/freeflow` and publish `FreeFlow.dmg`.

Validation commands and evidence:

```bash
git clone https://github.com/zachlatta/freeflow.git tmp/freeflow-rub-25
cd tmp/freeflow-rub-25
git rev-parse HEAD
# b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c
```

```bash
sed -n '1,220p' LICENSE
# MIT License; Copyright (c) 2026 Zach Latta
```

```bash
find . -maxdepth 3 \( -name 'Package.swift' -o -name 'Package.resolved' -o -name 'Podfile' -o -name 'Cartfile' -o -name 'project.yml' -o -name '*.xcodeproj' -o -name '*.xcworkspace' -o -name 'Gemfile' -o -name 'package.json' -o -name 'Cargo.toml' -o -name 'go.mod' -o -name 'requirements.txt' -o -name 'pyproject.toml' -o -name 'LICENSE*' -o -name 'NOTICE*' -o -name 'COPYING*' \) -print
# ./LICENSE only
```

```bash
git submodule status --recursive
# no submodules
```

```bash
rg -n "FreeFlow|freeflow|com\.zachlatta|FreeFlowBuildTag|zachlatta/freeflow|FreeFlow Dev" Sources Makefile Info.plist README.md CHANGELOG.md .github website .agents
# branding/release/update references found in files listed above
```

### Fallback Candidates

Keep as references if FreeFlow fails audit:

- Dictate Anywhere: local-first macOS dictation reference.
- Handy: mature local transcription/model management reference.
- Steno: Swift/macOS, app-aware insertion and history reference.
- CustomWispr: simpler Swift baseline.
- Murmur: offline native capsule/history reference.

Do not switch without a specific FreeFlow audit failure.

## Competitive Pricing Notes

Wispr Flow currently presents:

- Free Basic with a weekly word limit.
- Pro trial.
- Pro unlimited words at a higher monthly price than RubyWhisper's planned launch price.

RubyWhisper pricing decision:

- `$7/month`.
- `$60/year`, displayed as `$5/month billed annually`.
- 5,000-word trial.
- One plan at launch.
- Friend of Ruby one-year free codes for small groups.

Implication:

- RubyWhisper can advertise unlimited personal dictation, but needs fair-use language and abuse controls because the monthly price is lower than the closest obvious competitor's unlimited plan.

## Provider Cost Notes

Groq currently lists `whisper-large-v3-turbo` around `$0.04/hour` of transcription. This makes normal personal dictation plausible inside a `$7/month` plan, but heavy/automated usage can still break unit economics.

Cost controls:

- 10-minute single-whisper cap.
- No meeting transcription in v0.1.
- No file upload transcription in v0.1.
- Rate limits and abuse detection.
- Fair-use terms.
- Usage metadata without transcript content.
- Annual plan emphasis.

## RW-015 Groq Latency And Cost Benchmark

Date: 2026-05-10

Validation command:

```bash
set -a
source .env.local
set +a
scripts/benchmarks/groq-latency-cost.mjs
```

Privacy posture:

- Used temporary synthetic speech generated locally with macOS `say`.
- No real user content was used.
- The benchmark deleted temporary audio files after each request.
- The benchmark printed only bucket, audio duration, estimated billed duration, latency, normalized status, model, and estimated cost.
- No private env values, raw provider payloads, audio files, transcripts, cleaned text, prompts, or customer data were printed or committed.

Provider facts checked on 2026-05-10 and rechecked against official Groq
pricing/docs on 2026-05-20:

- Groq pricing page lists Automatic Speech Recognition billing at a minimum of 10 seconds per request and lists `Whisper Large v3 Turbo` at `$0.04` per hour transcribed, with a current pricing-page speed factor of 228x: https://groq.com/pricing
- Groq speech-to-text docs list `whisper-large-v3-turbo` at `$0.04` per hour, with 10-second minimum billed length, `wav` upload support, and 25 MB free-tier / 100 MB dev-tier file limits: https://console.groq.com/docs/speech-to-text
- Groq model docs describe `whisper-large-v3-turbo` as optimized for real-time transcription and list a 216x model-doc speed factor: https://console.groq.com/docs/model/whisper-large-v3-turbo

Single-run live results with `whisper-large-v3-turbo`:

| Bucket | Synthetic audio duration | Estimated billed duration | Provider latency | Status | Estimated transcription cost |
| --- | ---: | ---: | ---: | --- | ---: |
| Short | 4.91s | 10.00s | 228ms | ok | `$0.000111` |
| Medium | 20.23s | 20.23s | 636ms | ok | `$0.000225` |
| Longer | 61.10s | 61.10s | 1,935ms | ok | `$0.000679` |

Latency notes:

- The short sample cleared RubyWhisper's under-1-second short-whisper target before app upload, backend, cleanup, and insertion overhead.
- The medium sample also cleared the 1-second target in provider-only timing.
- The longer sample took about 1.9 seconds for 61 seconds of synthetic speech; longer whispers are not held to the sub-second budget, but the result is consistent with a fast beta experience.
- These are rough dev-key timings from one machine and one run on 2026-05-10. Re-run before beta launch and whenever provider tier, region, request format, or cleanup model changes.

Cost scenarios at `$0.04/hour` transcription and 10-second minimum billing:

| Scenario | Assumption | Estimated monthly transcription cost | Risk |
| --- | --- | ---: | --- |
| Normal | 1,000 personal whispers/month at 15s average billed audio | `$0.17` | Plausible inside a `$7/month` plan before cleanup, hosting, auth, billing, and support costs. |
| Heavy | 10,000 personal whispers/month at 30s average billed audio | `$3.33` | Still possible to cover on monthly plans, but leaves less margin after non-provider costs and annual discounts. |
| Short-request spam | 100,000 sub-10s requests/month billed at the 10s minimum | `$11.11` | Loss-making for one paid account; needs request-level rate limits and fair-use enforcement. |
| Continuous automation abuse | 24 hours/day for 30 days | `$28.80` | Clearly loss-making; 10-minute cap helps only per request, not against automated repetition. |

Cleanup options if Groq handles cleanup:

- Keep transcription on `whisper-large-v3-turbo` and add a separate backend Groq chat-completion cleanup pass with the existing conservative cleanup contract. This preserves the provider abstraction but adds another latency and token-cost component that still needs a cleanup-specific benchmark.
- Use cleanup only when enabled by user settings and Terms/Privacy gates; omit context and dictionary terms whenever those toggles are disabled.
- Keep a cleanup-disabled/raw-transcript path for latency-sensitive or privacy-sensitive users.
- Treat cleanup model choice and prompt as a separate human-owned launch decision; do not block the transcription default on it.

Recommendation:

- Keep Groq as the v0.1 default provider for transcription.
- Keep the provider abstraction flexible and keep backend-only provider access.
- Do not market unlimited personal dictation without fair-use terms, per-account request/audio limits, metadata-only usage tracking, and an abuse cutoff path.
- Run a separate cleanup benchmark before committing to Groq as the cleanup model default.

## Auth Provider Notes

Decision: Clerk for launch auth.

Why:

- Fast Next.js integration.
- Good browser-based auth UX.
- Email magic-link support.
- Session/JWT validation path for backend APIs.
- Reduces need to build custom auth flows during beta.

Alternatives:

- Supabase Auth: viable, especially if minimizing vendors matters later.
- Auth.js: flexible and open-source, but more implementation/security ownership.

Launch auth mode:

- Email magic link only.
- No Google/Apple sign-in for v0.1.

## Database Notes

Decision: Supabase Postgres for product metadata.

Needed for:

- User profile mapping from Clerk user to product state.
- Stripe customer/subscription cache.
- Trial/usage counters.
- Request metadata.
- Admin roles.
- Friend of Ruby code/batch tracking.

Not used for:

- Audio.
- Raw transcripts.
- Cleaned transcripts.
- Clipboard contents.
- Context.
- Recent Wisprs.
- Personal dictionary in v0.1.

## Billing Notes

Decision: Stripe.

Use:

- Checkout.
- Monthly/annual subscriptions.
- Customer portal.
- Promotion/coupon code flow for Friend of Ruby.
- Webhooks as billing state source.

Stripe remains source of truth. Supabase stores a product-facing cache.

## Distribution Notes

Direct download first.

Required:

- Apple Developer signing.
- Notarization.
- Download page.
- Auto-update.

Recommended updater:

- Sparkle, unless FreeFlow already includes a better suitable mechanism.

Mac App Store:

- Future/later, not v0.1.

## Privacy And Security Concerns

Sensitive data:

- Audio.
- Raw transcript.
- Cleaned text.
- Surrounding context.
- Clipboard contents.
- Auth tokens.
- Payment/customer metadata.

Rules:

- Server never stores audio/transcript/context/clipboard content.
- Server logs metadata only.
- Recent Wisprs are local-only.
- Personal dictionary is local-only in v0.1.
- Context-aware cleanup is on by default after Terms/Privacy acceptance but can be disabled.
- Support/admin tooling cannot view private text content.

## Tradeoffs

Backend proxy vs desktop direct-to-Groq:

- Backend proxy wins because it protects API keys, enforces quota/subscription, enables usage tracking, and supports abuse controls.
- Tradeoff is extra latency. Mitigate with regional hosting and careful request path.

Account required vs no-signup trial:

- Account required wins because it avoids anonymous quota abuse and simplifies Clerk/Stripe state.
- Tradeoff is more friction before first dictation.

Unlimited personal dictation vs hard monthly cap:

- Unlimited personal dictation wins for product simplicity and competitive positioning.
- Tradeoff is cost exposure. Mitigate with fair-use terms and abuse controls.

Local-only history vs synced history:

- Local-only wins for privacy and v0.1 simplicity.
- Tradeoff is no cross-Mac history sync.

## Recommendation

Proceed with:

- Requirements-first specification.
- FreeFlow audit before import.
- One Next.js app for website/backend.
- Clerk auth.
- Supabase product database.
- Stripe billing.
- Groq provider path.
- Direct-download signed/notarized macOS app.
- Sparkle updater if compatible.
- Privacy-safe logging/observability.

Do not create Linear issues or start implementation until these specs are approved.

## FreeFlow Audit Follow-Up

See `docs/FREEFLOW_AUDIT_RUB_24.md` for the RUB-24 source audit against the `FORK_STRATEGY.md` evaluation criteria.

Audit result:

- FreeFlow is a viable harness for build, Swift structure, hotkeys, cleanup pipeline, permissions, license, and a non-activating overlay.
- FreeFlow should not be imported unchanged because direct provider calls, desktop provider key storage, broad local run-log storage, and insertion success assumptions conflict with RubyWhisper privacy and recovery requirements.
- Required pre-import plan: backend proxy, no desktop Groq keys, reduced local history, insertion failure recovery, expanded island states, and privacy-safe context controls.
