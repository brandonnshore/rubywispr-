# RubyWhisper Technical Infrastructure

Status: Draft for approval
Last updated: 2026-04-30

## Summary

RubyWhisper will run as a native macOS app plus one Next.js web/backend application. The desktop app captures audio and user intent, but all provider calls go through RubyWhisper backend services so API keys remain secret and account/trial/subscription rules can be enforced.

The server stores product metadata only. It must never persist audio, raw transcripts, cleaned transcripts, clipboard contents, surrounding app text, or local Recent Wisprs.

The desktop Keychain session boundary and typed RubyWhisper backend API client
contract live in `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`.

## Architecture Overview

```text
macOS app
  - hotkeys, recording, island, permissions, insertion
  - local Recent Wisprs and dictionary
  - Keychain session storage
  |
  | Clerk-authenticated API requests
  v
Next.js app
  - marketing, login entry, account, checkout, admin
  - transcription/privacy gateway API
  - Stripe webhooks
  - Supabase metadata persistence
  |
  +--> Clerk: identity and sessions
  +--> Stripe: subscriptions, checkout, customer portal, coupons
  +--> Supabase: product database
  +--> Groq: transcription and cleanup
  +--> Sentry or equivalent: privacy-safe errors/crashes
```

## Repositories

Current repo contents:

- Root npm workspace with `apps/web`. Use npm, not pnpm/yarn/bun, unless a future ADR changes the repo contract.
- `apps/web` for the Next.js App Router app. This app also owns backend API routes, auth/account/admin routes, Stripe webhooks, and provider gateway endpoints.
- `apps/macos` for the imported macOS app harness. RUB-220 imported selected source from `https://github.com/zachlatta/freeflow` at `b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c`; see `docs/MACOS_IMPORT_RUB_220.md`.
- `packages/*` only when shared code is justified by real duplication.
- `docs` or root-level planning/spec files.
- `scripts` for setup and release support.

`apps/web` layout and ownership:

- `src/app/(public)/page.tsx`: public shell from RUB-82. RW-080 owns visual tokens, RW-081 owns the marketing home/product proof, RW-082 owns pricing/download surfaces, and RW-083 owns legal/support pages.
- `src/app/account/page.tsx`: account shell from RUB-82. RW-022 owns Clerk auth, RW-024/RW-025/RW-026 own billing/subscription/account data, and RW-082 owns the customer-facing account page.
- `src/app/admin/page.tsx`: admin shell from RUB-82. RW-028 owns server-side admin roles, RW-084 owns the beta health dashboard, RW-085 owns Friend of Ruby admin code workflows, and RW-101 owns later auth/admin/API security audit.
- `src/app/api/status/route.ts`: smoke API from RUB-82. Future `src/app/api/*` routes must keep billing, webhooks, service-role database access, signing, and provider calls server-only.
- Future provider gateway routes/clients are owned by Wave 4 backend work: RW-040 for the Groq provider client, RW-044 for backend-to-desktop error contracts, and RW-046 for mocked provider integration coverage.

## Runtime Environments

Local development:

- Next.js local dev server.
- Supabase local or hosted development project.
- Stripe test mode and Stripe CLI webhook forwarding.
- Clerk development instance.
- Groq test/dev API key.
- Xcode for macOS app.

Staging:

- Vercel preview or staging deployment.
- Clerk staging app.
- Supabase staging project.
- Stripe test mode.
- Groq staging/restricted key if available.

Production:

- Vercel production deployment.
- Clerk production app.
- Supabase production project.
- Stripe live mode.
- Groq production key.
- Signed/notarized macOS build.
- Sparkle appcast/update channel.

## Services And Dependencies

| Service | Purpose | Notes |
| --- | --- | --- |
| Clerk | Email magic-link auth and session management | Magic link only at launch. |
| Stripe | Subscriptions, annual/monthly pricing, coupons, customer portal | Billing source of truth. |
| Supabase Postgres | Product metadata, usage, admin roles, request metadata | No text/audio storage. |
| Groq | Transcription and cleanup provider | Use one provider first for simplicity. |
| Vercel | Next.js hosting and serverless/edge runtime where suitable | Region should be chosen for latency. |
| Apple Developer | Signing and notarization | Required for public direct download. |
| Sparkle | Direct-download auto-update | Confirm fit after FreeFlow import. |
| Sentry or equivalent | Privacy-safe crash/error reporting | Disable screenshots/text payloads. |

## Data Storage

### Supabase Tables

Proposed tables:

```text
profiles
  id uuid primary key
  clerk_user_id text unique not null
  email text not null
  created_at timestamptz not null
  terms_accepted_at timestamptz null
  is_blocked boolean default false

admin_roles
  id uuid primary key
  clerk_user_id text unique not null
  role text not null
  created_at timestamptz not null

subscriptions
  id uuid primary key
  clerk_user_id text not null
  stripe_customer_id text unique
  stripe_subscription_id text unique
  status text not null
  plan text not null
  current_period_end timestamptz null
  friend_of_ruby_until timestamptz null
  updated_at timestamptz not null

usage_counters
  id uuid primary key
  clerk_user_id text not null
  trial_words_used integer not null default 0
  lifetime_words_used bigint not null default 0
  monthly_words_used integer not null default 0
  monthly_period_start date not null
  updated_at timestamptz not null

transcription_requests
  id uuid primary key
  clerk_user_id text not null
  request_id text unique not null
  status text not null
  provider text not null
  audio_duration_ms integer null
  cleaned_word_count integer null
  latency_ms integer null
  error_code text null
  app_version text null
  os_version text null
  created_at timestamptz not null

friend_of_ruby_batches
  id uuid primary key
  created_by_clerk_user_id text not null
  stripe_promotion_code_id text null
  code text not null
  max_redemptions integer not null
  expires_at timestamptz null
  created_at timestamptz not null
```

Exact schema should be refined during M1.

### Never Store Server-Side

- Audio recordings.
- Raw transcript text.
- Cleaned transcript text.
- Surrounding app context.
- Clipboard text.
- Destination app document text.
- Local Recent Wisprs.
- Personal dictionary entries in v0.1.

### Local Mac Storage

Local only:

- Final cleaned Recent Wisprs.
- Failed insertion cleaned text.
- Local personal dictionary.
- Settings/preferences.
- App auth/session token in Keychain.

Retention:

- Recent Wisprs default retention is 7 days.
- User can clear local history.
- User can disable local history.
- Recent Wisprs data model, retention cleanup, insertion status semantics,
  clear/disable behavior, and no-sync boundary are defined in
  `docs/RW_070_RECENT_WISPRS_CONTRACT.md`.

## Secrets Management

Private env files must never be printed, summarized, or committed.

Expected environment variables, names subject to implementation:

```text
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_WEBHOOK_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_MONTHLY_PRICE_ID
STRIPE_ANNUAL_PRICE_ID
GROQ_API_KEY
SENTRY_DSN
SENTRY_AUTH_TOKEN
APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN
```

Rules:

- Desktop app must not contain Groq, Stripe, Supabase service-role, or Clerk secret keys.
- Desktop app stores session credentials in Keychain.
- Desktop Keychain access, logout clearing, sensitive-data rules, and backend
  API retry boundaries are defined in
  `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`.
- Production secrets require human approval before first deployment.
- `.env.local` and private env source files must never be inspected or committed.

## Permissions

macOS app needs:

- Microphone permission for recording.
- Accessibility permission for reliable insertion into other apps.
- Optional clipboard access during fallback insertion.
- Network access for auth/backend requests.

Onboarding should guide users through these permissions before the first test whisper.

## Third-Party Provider Contracts

### Groq

Used for:

- Speech-to-text transcription.
- Cleanup/rewrite where feasible.

Default transcription model:

```text
whisper-large-v3-turbo
```

Cleanup should be conservative:

- Add punctuation/capitalization.
- Remove filler words.
- Fix obvious transcription mistakes.
- Preserve speaker meaning and voice.
- Preserve names and dictionary terms.
- Do not add new ideas.

### Stripe

Launch prices:

- Monthly: `$7/month`.
- Annual: `$60/year`, displayed as `$5/month billed annually`.
- Friend of Ruby: one-year free access through coupon/promotion code flow.

Stripe is source of truth for subscription status. Supabase stores a cache for app behavior.

### Clerk

Auth mode:

- Email magic link only at launch.
- Browser-based login.
- Desktop app receives/validates auth through the secure app login bridge
  defined in `docs/DESKTOP_LOGIN_BRIDGE_CONTRACT.md`.
- Desktop session persistence and RubyWhisper backend API request attachment are
  defined in `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`.

### Supabase

Used as product database only. Do not use Supabase storage for audio or transcripts.

Local migration harness:

- Use the repo-local `supabase/` scaffold for Supabase CLI migration files.
- Start from `supabase --help` and `supabase migration --help` before choosing flags.
- Create migration files with `supabase migration new <descriptive_name>`.
- After the local Supabase stack is running with `supabase start`, list and apply migrations locally with `supabase migration list --local` and `supabase migration up --local`.
- Production or staging linking, config pushes, database pushes, and migration applies require explicit human approval. This harness does not create or apply live migrations.
- Keep project refs, access tokens, service-role keys, live database URLs, audio, raw transcript text, cleaned transcript text, context, clipboard text, Recent Wisprs, and dictionary terms out of Supabase migrations and docs.

## Local Development Setup

Required startup in this repo:

```bash
scripts/setup-chat-env.sh
```

If a command needs env vars in the current shell:

```bash
set -a
source .env.local
set +a
```

Do not print or inspect `.env.local`.

Current web/backend setup:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

Backend validation uses the same commands because backend routes live inside the Next.js app. If a future ticket adds a narrower backend-only script, it must update this command contract before other tickets cite it.

RUB-221 / RW-060B macOS command discovery after the RUB-220 source import:

```bash
make -C apps/macos clean all CODESIGN_IDENTITY=-
```

This is the authoritative repo-local macOS Debug/ad hoc build command. It uses
the imported Makefile, direct `swiftc`, and ad hoc codesigning to produce
`apps/macos/build/RubyWhisper.app` with the development bundle identifier
`com.rubyadvisory.rubywhisper.dev`.

`xcodebuild` is not an authoritative local development command for the imported
macOS source. `apps/macos` has no Xcode project, workspace, Swift package, or
schemes, and `xcodebuild -list` exits 66 in that directory.

## Build, Test, Lint, Typecheck Commands

Repo command contract:

- Package manager: npm.
- Workspace shape: root npm workspace with `apps/web`, imported `apps/macos`, and optional `packages/*`.
- Current runnable app commands: root npm scripts delegate to the `@rubywhisper/web` workspace.
- Exact web/backend command contract:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

- Exact macOS local Debug/ad hoc build command:

  ```bash
  make -C apps/macos clean all CODESIGN_IDENTITY=-
  ```

  The authoritative build entrypoint is the Makefile in `apps/macos`, not
  `xcodebuild`. The command builds `apps/macos/build/RubyWhisper.app` with an
  ad hoc signature (`Signature=adhoc`) and the development bundle identifier
  `com.rubyadvisory.rubywhisper.dev`. It does not create a signed release,
  notarized artifact, DMG, CI runner, or test target. Downstream Mac
  implementation tickets should cite this command unless they explicitly add a
  new Xcode or SwiftPM project contract.
- CI command selection is blocked on RW-005 after the web scaffold and macOS import decisions exist.

If a package manager other than npm is chosen, update this doc and all future issues before implementation work cites the new command.

## RW-020 Completion Gate

The operator can mark RW-020 (`RUB-31`) complete only when all of these are true:

- RUB-81, RUB-82, RUB-83, and RUB-84 are Done or explicitly accepted in Linear.
- The root `package.json` defines the `dev`, `lint`, `typecheck`, `test`, and `build` scripts and each script delegates to `@rubywhisper/web`.
- `apps/web` contains the App Router shell for public, account, admin, and API areas, with no real auth, billing, provider, or production deploy implementation hidden inside the scaffold.
- `apps/web/.env.example` contains placeholder names only, and the app can lint, typecheck, test, and build without live service credentials.
- Latest RW-020 validation evidence records passing `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and `git diff --check`.
- Workpads, PRs, docs, and comments contain no secrets, private env values, logs, audio, transcript text, or customer content.

## CI/CD

Web/backend:

- Local command contract: agents must run `npm ci`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build` from the root npm
  workspace for web/backend changes.
- Pull request checks: `.github/workflows/web-ci.yml` enforces the same root
  npm workspace contract on PRs to `main`.
- Preview deployments for branches.
- Production deploy only from approved branch/tag.
- Stripe webhook tests should run with mocked signatures.

Mac app:

- Local command contract: agents must run the repo-local Debug/ad hoc build
  command for macOS app changes:

  ```bash
  make -C apps/macos clean all CODESIGN_IDENTITY=-
  ```

- Pull request checks: `.github/workflows/macos-ci.yml` runs on GitHub-hosted
  `macos-latest` for macOS app changes and executes the repo-local Debug/ad hoc
  build command.

  The workflow verifies `apps/macos/build/RubyWhisper.app`, the development
  bundle identifier `com.rubyadvisory.rubywhisper.dev`, and an ad hoc code
  signature (`Signature=adhoc`). This is a non-release validation gate only.
- CI must not run `dmg`, `codesign-dmg`, `notarize`, or any command that needs
  provider secrets, production secrets, Apple signing/notarization credentials,
  billing secrets, database secrets, release packaging secrets, or private env
  files.
- Release builds gated by manual approval.
- Signing/notarization gated by Apple credential availability.
- Release artifacts published only through approved release workflow.

## Deployment And Packaging

Website/backend:

- Deploy Next.js app to Vercel.
- Use production env vars only in Vercel project settings.
- Use `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` for the production deployment,
  preview/staging smoke, rollback, Stripe webhook switch, and emergency-disable
  checklist.

Mac app:

- Direct-download distribution first.
- Signed and notarized through Apple Developer account.
- Auto-update through Sparkle or chosen updater.
- Mac App Store is future/later.
- Use `docs/MAC_BETA_RELEASE_RUNBOOK.md` as the placeholder-only human release
  checklist for signing, notarization, packaging, attribution, checksum notes,
  appcast preparation, and clean-Mac validation.

### Direct-Download macOS Release Spike

Status: recommendation for the future repo-local macOS app. The selected base has
not been imported into this repo yet; `docs/FREEFLOW_AUDIT_RUB_24.md` confirms
FreeFlow is a Swift/AppKit/SwiftUI Makefile-based candidate and that its local
audit build used ad hoc signing only.

Recommendation:

- Use Sparkle 2 for direct-download auto-updates once the macOS app is imported.
- Keep Mac App Store distribution future/later. The first release path should be
  Developer ID direct download from the RubyWhisper website.
- Revisit the updater only if RW-060 imports a base that cannot support Sparkle
  2's macOS floor or if product direction changes to Mac App Store first.

Release prerequisites and credentials:

- Active Apple Developer Program membership for the RubyWhisper legal entity or
  approved developer account.
- Stable bundle identifier and Team ID recorded in non-secret release config.
- Developer ID Application certificate with its private key available only in a
  release maintainer keychain or CI signing secret.
- Developer ID Installer certificate only if the release artifact becomes a
  signed `.pkg`; it is not required for a plain `.app` inside a `.dmg`.
- Hardened Runtime enabled for release builds, with only required entitlements.
- Notarization credentials stored outside git: prefer an App Store Connect Team
  API key for automation, or an Apple ID plus app-specific password for manual
  `notarytool` use. Store key IDs, issuer IDs, passwords, `.p8` files, and
  keychain profile names outside the repo.
- Sparkle EdDSA private key stored outside git, ideally in Keychain or a release
  secret store. Only the Sparkle public key belongs in the app's `Info.plist`.
- HTTPS hosting for downloads, appcasts, release notes, and any delta archives.

Release artifact shape:

- Build archive from the repo-local macOS project after RW-060 imports it.
- Export a Developer ID-signed `.app` with Hardened Runtime.
- Package the signed app in a `.dmg` with an `/Applications` symlink for website
  distribution and Sparkle updates. A `.zip` can be used for Sparkle if needed,
  but the website download should prefer a notarized/stapled `.dmg`.
- Submit the distributable container to Apple's notary service with `xcrun
  notarytool submit --wait` or Xcode Organizer, then staple and validate with
  `xcrun stapler validate`.
- Verify Gatekeeper launch behavior on a clean, quarantine-preserving download
  path before publishing.

Sparkle appcast and update needs:

- Add Sparkle through the native app's dependency mechanism after import.
- Add `SUFeedURL`, `SUPublicEDKey`, and a monotonically increasing
  `CFBundleVersion` to the app metadata.
- Publish `appcast.xml` over HTTPS with release notes and EdDSA signatures for
  each update archive.
- Use separate beta/stable appcast URLs only if product rollout needs channels;
  otherwise keep one public beta channel for the first release.
- Keep old update archives long enough to test update paths and rollback-forward
  recovery; Sparkle should move users to a newer fixed build rather than
  downgrade them.

Human approval gates:

- Approval before creating, exporting, rotating, or revoking Apple Developer ID
  certificates.
- Approval before storing Apple notarization credentials in any CI or release
  machine.
- Approval before generating or rotating Sparkle EdDSA keys.
- Approval before the first notarized public build.
- Approval before publishing or changing the public download URL or appcast.
- Approval before any Mac App Store packaging or entitlement work.

References:

- Apple Xcode Help,
  [Distribute outside the Mac App Store (macOS)](https://help.apple.com/xcode/mac/current/en.lproj/dev033e997ca.html).
- Apple Xcode Help,
  [Upload a macOS app to be notarized](https://help.apple.com/xcode/mac/current/en.lproj/dev88332a81e.html).
- `xcrun notarytool` and `xcrun stapler` command help from the local Xcode
  command line tools.
- Sparkle
  [documentation](https://sparkle-project.org/documentation/) and
  [upgrade notes](https://sparkle-project.github.io/documentation/upgrading/)
  for EdDSA signing, appcasts, supported update archive formats, and macOS
  version floor.

Release gating:

- Human approval before live Stripe mode.
- Human approval before production Groq key.
- Human approval before notarized public build.

## Observability And Logging

Allowed:

- Request ID.
- Clerk user ID.
- Plan status.
- Trial/subscription status.
- Provider name.
- Audio duration in milliseconds.
- Cleaned output word count.
- Latency in milliseconds.
- Success/failure status.
- Coarse error code.
- App version.
- OS version.
- Stack traces without content.

Forbidden:

- Audio.
- Raw transcript.
- Cleaned transcript.
- Clipboard contents.
- Surrounding app context.
- Prompt text containing user content.
- Screenshots containing user content.
- Full provider payloads.
- Magic links or tokens.

Crash/error reporting:

- Configure data scrubbing.
- Disable automatic capture of request bodies.
- Disable screenshots/session replay unless explicitly approved later.

## Rollback And Recovery

Backend:

- Roll back Vercel deployment.
- Disable problematic feature via flag where possible.
- Temporarily disable transcription endpoint if provider abuse/cost spike occurs.
- Follow `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` for the human-gated rollback,
  emergency-disable, and sanitized incident evidence steps.

Mac app:

- Sparkle can move users forward to a fixed version.
- Download page can replace latest build.
- Backend can reject known-bad app versions or show upgrade-required if needed.

Billing:

- Stripe remains source of truth.
- Webhook replay should recover subscription state.
- Admin dashboard should show stale webhook state warnings if detected.

## Feature Flags And Staged Rollout

Recommended flags:

- Context-aware cleanup enabled.
- Raw transcript mode / cleanup disabled.
- Friend of Ruby code redemption.
- Admin dashboard access.
- Auto-update channel.
- Provider fallback.
- Fair-use enforcement threshold.

Flags may be implemented as environment config or a Supabase table depending on complexity.

## Security Controls

- Clerk session verification on all protected API routes.
- Server-side admin role checks.
- Stripe webhook signature verification.
- Rate limiting on transcription endpoint.
- Abuse checks on trial usage and Friend of Ruby code redemption.
- Service-role Supabase key used only server-side.
- Provider API key used only server-side.
- Secret scanning in CI if practical.
- Human approval before production secrets.

## Privacy Controls

- Terms/Privacy acceptance before first dictation.
- Plain-language privacy copy in onboarding and website.
- Server stores metadata only.
- Recent Wisprs local-only with 7-day retention default.
- Personal dictionary local-only in v0.1.
- Context-aware cleanup on by default after acceptance, with setting to disable.
- User can clear local history.
- Support workflows must not ask users to share private transcript content by default.

## Cost Model

Revenue:

- `$7/month` monthly.
- `$60/year` annual.

Known costs to model:

- Stripe card processing and Billing fees.
- Groq transcription and cleanup usage.
- Vercel hosting.
- Supabase.
- Clerk.
- Sentry or equivalent.
- Apple Developer Program.

Groq transcription price basis from research:

- `whisper-large-v3-turbo` is currently listed at about `$0.04/hour` of transcription.
- Provider pricing can change; verify before launch.

Policy:

- Paid plan may be marketed as unlimited personal dictation.
- Terms must exclude meeting transcription, batch transcription, resale, automation abuse, account sharing abuse, and non-personal high-volume use.
- Enforce a 10-minute single-whisper cap in v0.1.

## Reliability And Recovery

Requirements:

- If backend/provider fails, the island must show a clear error.
- Failed insertions must preserve cleaned text locally.
- Trial/subscription errors must show upgrade or account action.
- Network-required behavior must be clear.
- Offline dictation is not supported in v0.1.

Fallbacks:

- Clipboard fallback for insertion.
- Copy action from Recent Wisprs.
- Retry where safe after provider/network errors.

## Performance Requirements

- Normal short whispers under 30 seconds should target under 1 second from recording end to insertion.
- 1-2 seconds is acceptable as beta upper tolerance.
- Longer whispers should still feel quick but are not held to sub-second processing.
- 10-minute single-whisper cap.
- Warning around 9:30 during recording.
- Backend should record latency metadata without content.

## Standards And Project Conventions

- Run `scripts/setup-chat-env.sh` at the start of every new Codex chat/worktree.
- Never inspect or print private env files.
- Prefer current repo patterns once scaffolded.
- Keep privacy-sensitive behavior explicit in code review.
- New implementation tasks should include:
  - Acceptance criteria.
  - Validation by running.
  - Required tests.
  - Security/privacy notes.
  - File/module boundaries.

## Human Approval Gates

Human approval required before:

- Importing FreeFlow permanently after audit.
- Choosing a fallback base.
- Live Stripe mode.
- Production Groq key.
- Production Clerk/Supabase projects.
- Production domain launch.
- Apple signing/notarization release.
- Public beta announcement.
- Changing privacy posture.
- Adding server-side text/audio storage.
- Adding meeting transcription.
