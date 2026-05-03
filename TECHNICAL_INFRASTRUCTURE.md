# RubyWhisper Technical Infrastructure

Status: Draft for approval
Last updated: 2026-04-30

## Summary

RubyWhisper will run as a native macOS app plus one Next.js web/backend application. The desktop app captures audio and user intent, but all provider calls go through RubyWhisper backend services so API keys remain secret and account/trial/subscription rules can be enforced.

The server stores product metadata only. It must never persist audio, raw transcripts, cleaned transcripts, clipboard contents, surrounding app text, or local Recent Wisprs.

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

Current repo:

```text
/Users/brandonshore/.codex/worktrees/a2e3/rubywispr-
```

Target repo contents:

- `apps/web` or equivalent Next.js app path.
- `apps/macos` or imported Xcode project path after FreeFlow audit.
- `docs` or root-level planning/spec files.
- `scripts` for setup and release support.

Exact monorepo structure is TBD after choosing package manager and importing the macOS project.

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
- Desktop app receives/validates auth through a secure app login bridge.

### Supabase

Used as product database only. Do not use Supabase storage for audio or transcripts.

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

Expected web setup after scaffold:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected macOS setup after import:

```bash
xcodebuild -list
xcodebuild -scheme RubyWhisper -configuration Debug build
xcodebuild test -scheme RubyWhisper
```

Exact commands are provisional until project scaffold/import.

## Build, Test, Lint, Typecheck Commands

Target command contract:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
xcodebuild test -scheme RubyWhisper
```

If a package manager other than npm is chosen, update this doc and all future issues.

## CI/CD

Web/backend:

- Pull request checks: lint, typecheck, tests, build.
- Preview deployments for branches.
- Production deploy only from approved branch/tag.
- Stripe webhook tests should run with mocked signatures.

Mac app:

- PR/build checks if CI runner supports Xcode.
- Release builds gated by manual approval.
- Signing/notarization gated by Apple credential availability.
- Release artifacts published only through approved release workflow.

## Deployment And Packaging

Website/backend:

- Deploy Next.js app to Vercel.
- Use production env vars only in Vercel project settings.

Mac app:

- Direct-download distribution first.
- Signed and notarized through Apple Developer account.
- Auto-update through Sparkle or chosen updater.
- Mac App Store is future/later.

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
