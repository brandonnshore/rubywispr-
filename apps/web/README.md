# RubyWhisper Web

This is the RubyWhisper Next.js App Router shell. Run commands from the repository root so npm uses the workspace lockfile.

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Command Contract

Run the web/backend contract from the repository root so npm uses the root workspace lockfile and delegates to `@rubywhisper/web`:

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:auth-privacy
npm run build
```

Those root scripts map to the workspace scripts in this package:

- `dev`: `next dev`
- `lint`: `eslint`
- `typecheck`: `tsc --project tsconfig.typecheck.json --noEmit`
- `test`: `node --test`
- `test:auth-privacy`: focused auth privacy/security regression checks
- `build`: `next build`

Backend validation uses the same root commands because RubyWhisper backend routes live in this Next.js app.

## App Layout And Ownership

- `src/app/layout.tsx` and `src/app/globals.css` own the shared App Router shell and global styles. Future visual system work belongs to RW-080 before broad page polish.
- `src/app/(public)/page.tsx` is the public entry route scaffolded by RUB-82. Marketing and product-proof work belongs to RW-081; pricing, download, and customer-facing account flows belong to RW-082; legal/support pages belong to RW-083.
- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` and `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` are the email-link Clerk route shell. They render email-only launch copy with blank env placeholders and enable Clerk components only when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is configured.
- `src/app/account/page.tsx` is the authenticated customer account placeholder scaffolded by RUB-82. Clerk auth belongs to RW-022, subscription/account data belongs to RW-024/RW-025/RW-026, and the production account UI belongs to RW-082.
- `src/app/admin/page.tsx` is the admin placeholder scaffolded by RUB-82. Server-side admin roles belong to RW-028, the beta health dashboard belongs to RW-084, Friend of Ruby code workflows belong to RW-085, and later auth/admin security audit belongs to RW-101.
- `src/app/api/status/route.ts` is the current smoke API. Future API routes stay under `src/app/api/*` and must keep provider, billing, Supabase service-role, webhook, and signing logic server-only.
- Future provider gateway routes and clients are not part of the scaffold. Groq/provider client work belongs to RW-040, transcription/cleanup gateway behavior belongs to Wave 4 backend tickets, desktop-facing backend routes must follow `../../docs/BACKEND_DESKTOP_ERROR_CONTRACT.md` for RW-044, and mocked provider integration coverage belongs to RW-046.
- `src/lib/api/errors.ts` exposes the server-only RW-044 backend error contract helper. Future desktop API route handlers should use `rubyWhisperApiErrorResponse` so non-2xx responses keep stable codes, `Cache-Control: no-store`, and metadata-only payloads.

## Usage And Trial Quota Contract

The shared usage policy lives in `../../docs/USAGE_QUOTA_CONTRACT.md`. Use it
before changing account APIs, desktop transcription routes, Mac account/settings
surfaces, billing/admin views, usage tests, or launch audit docs.

Current server-only helper surfaces:

- `src/lib/usage/quota.ts` owns word counting, the 5,000-word trial default, and
  normalized quota state.
- `src/lib/usage/supabase-usage-counters.ts` owns metadata-only
  `usage_counters` reads and prepared increments.
- `src/lib/usage/quota-service.ts` owns entitlement decisions and post-success
  usage increments.
- `src/lib/account/profile-metadata.ts` reads metadata-only profile state for a
  server-verified Clerk user.
- `src/lib/account/subscription-cache.ts` reads normalized subscription cache
  metadata for account and quota decisions.
- `src/lib/account/desktop-account-snapshot.ts` composes the desktop-facing
  account state from profile, subscription, and usage metadata.

Trial words are spent from the final cleaned output word count by default. The
preflight policy is `allow_if_started_under_limit`: a trial user who starts with
remaining words may finish the request, and the successful final output can mark
the trial exhausted for the next request. Paid and Friend of Ruby active users
do not spend trial words, but successful usage still increments lifetime/monthly
metadata counters.

Do not store audio, raw transcripts, cleaned text, prompts, context,
screenshots, clipboard contents, local Recent Wisprs, dictionary terms, provider
payloads, auth material, private env values, or secrets in usage counters,
request metadata, logs, tests, PR bodies, or Linear comments.

### Desktop Account Route

`src/app/api/desktop/account/route.ts` returns the metadata-only account
snapshot for the signed-in desktop user. The success payload is `{ ok: true,
...snapshot }` with `email`, `termsAccepted`, `accountStatus`,
`canTranscribe`, `planState`, `preflightPolicy`, trial/monthly/lifetime usage
counters, and billing portal fields. `failureCode` is present only for
non-active account states.

The route uses the shared `rubyWhisperApiErrorResponse` helper for non-2xx
responses, keeps all responses `Cache-Control: no-store`, and must not return
or log private dictation content, auth material, provider payloads, or private
env values. Stripe billing portal URL generation belongs to a later portal
route, so the account snapshot currently returns `billingPortalAvailable: false`
and `billingPortalUrl: null`.

## Environment Placeholders

`apps/web/.env.example` contains blank placeholder names only. Copy names into a private env file or provider secret store when an integration ticket requires real values.

- Server config lives in `src/config/server.ts` and may read server-only names such as `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `GROQ_API_KEY`, `SENTRY_AUTH_TOKEN`, and release-signing secrets.
- Client config lives in `src/config/client.ts` and may read only `NEXT_PUBLIC_*` names. For Clerk, only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` belongs there; keep `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` server-only.
- Blank placeholders are intentional so `lint`, `typecheck`, `test`, and `build` can run before live services exist.
- `@clerk/nextjs` is installed for server-side middleware/auth helpers, and `@clerk/react` renders the browser sign-in/sign-up UI without bundling Next server env constants. The sign-in/sign-up route shell wraps only the auth segment with `<ClerkProvider>` when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` exists. `clerkMiddleware()`/`proxy.ts` protects account/admin pages, and `auth()` is wrapped by server-only helpers under `src/lib/auth`.
- RubyWhisper launch auth is email-link only. Live Clerk Dashboard settings must keep password, SSO, Google, Apple, and social connections disabled for this app; Clerk's prebuilt component renders the methods enabled in the Clerk instance.
- Never print, inspect, summarize, commit, paste, or attach `.env.local` or any private env source file in workpads, PRs, docs, comments, logs, or chat. Only placeholder names belong in this repo.

## Supabase Server-Only Helpers

`src/lib/supabase/server.ts` is the only helper surface for future Supabase service-role access. It is marked with `server-only`, reads credentials only through `src/config/server.ts`, and currently exposes metadata table names plus a factory wrapper for a future `@supabase/supabase-js` client.

Future workers must follow these rules:

- Import `@/lib/supabase/server` only from server-only modules, route handlers, server actions, jobs, or scripts. Never import it from Client Components, app pages/layouts, or `src/config/client.ts`.
- Keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` out of `NEXT_PUBLIC_*` names and browser bundles. Add browser Supabase access only in a future ticket that defines RLS and a client-safe publishable or anon key.
- Do not add live Supabase writes here until the owning Clerk, Stripe, usage, admin, or request-metadata ticket defines the access rules and tests.
- Do not store audio payloads, transcripts, cleaned text, clipboard contents, local history, app context, or dictionary content in Supabase.

`src/lib/auth/profile-sync.ts` prepares and upserts the metadata-only `profiles` row for Clerk users. Future auth routes should call `syncClerkUserSupabaseProfile` only after server-side Clerk session verification and primary-email lookup, passing `{ clerkUserId, primaryEmail }`; the helper writes only `clerk_user_id` and `email` through the server-only Supabase service-role factory.

`src/lib/auth/terms-acceptance.ts` reads and records only the metadata timestamp in `profiles.terms_accepted_at` for an existing Clerk-backed profile. It requires a server-verified Clerk user ID and must not store policy copy, audio, transcripts, cleaned text, clipboard contents, local history, app context, or other private dictation content.

## Auth Privacy Validation Contract

Run the focused guardrails from the repository root when changing Clerk auth, route protection, profile sync, auth config, or auth tests:

```bash
npm run test:auth-privacy
```

The command is also covered by `npm run test` because it uses Node's test runner. It verifies:

- Clerk server secret names stay out of `src/config/client.ts`, browser-bound source, and `.next/static` public bundle artifacts when a build exists.
- `src/lib/auth/clerk.ts`, `src/lib/auth/profile-sync.ts`, and `src/lib/auth/terms-acceptance.ts` remain `server-only`; Client Components and Clerk browser-bound files cannot import those helpers.
- Account helpers such as `src/lib/account/desktop-account-snapshot.ts`,
  `src/lib/account/profile-metadata.ts`, and
  `src/lib/account/subscription-cache.ts` remain server-only, and
  `/api/desktop` source stays covered by the same privacy scans.
- Authorization decisions stay server-side. Browser-bound files may render Clerk sign-in/sign-up UI, but must not use `useAuth`, `useUser`, `SignedIn`, `SignedOut`, `Protect`, or redirect helpers to gate protected product/admin access.
- Auth-sensitive source avoids console/logger output and obvious storage of magic links, session tickets, JWTs, or tokens.
- Auth test fixtures use only synthetic IDs and placeholder email domains such as `example.com` or `.test`; do not add real magic links, session tokens, JWTs, private env values, or customer email addresses.
- Backend privacy logging guardrails reject ad hoc logging, direct capture SDK calls, and sensitive `JSON.stringify` usage in auth/API/provider/observability source. They also verify the approved privacy logger remains server-only and side-effect free.

After `npm run build`, rerun `npm run test:auth-privacy` or the focused changed-file scan so the public bundle artifact check covers the latest `.next/static` output.

## Backend Integration Test Harness

Future mocked backend route tests should import from `test/support/backend-integration.mjs`. The helper exports synthetic Clerk/Supabase/provider fixtures plus `invokeRouteHandler`, `invokeServerFunction`, `createSyntheticBackendRequest`, and `createMockBackendProviders`.

Keep these tests offline-only. Do not pass live Clerk, Stripe, Supabase, Groq, Sentry, auth, billing, or private env values into the helper; it rejects live-looking hosts, credential-like strings, private env source references, and guarded server secret names.

## Backend No-Body Logging Contract

`src/lib/observability/privacy-logger.ts` is the server-only RW-030 helper for privacy-safe backend log metadata. Future backend, account, provider, cleanup, transcription, support, and admin code should use `sanitizeRubyWhisperPrivacyLogMetadata`, `createRubyWhisperPrivacyLogEvent`, or the `createRubyWhisperBackendRequest*LogEvent` helpers before handing data to any future log sink.

Allowed metadata is limited to request/account/plan/duration/word-count/latency/provider/app/version/status/error-code fields. This matches the RW-044 logging guidance in `../../docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#logging-and-observability`, where support workflows should investigate through `requestId` and `error.code` rather than private content.

Never log request or response bodies, multipart audio, raw transcripts, cleaned text, context, clipboard contents, dictionary terms, prompts, provider request or response bodies, headers, cookies, auth/session material, private env values, secrets, or local Recent Wisprs. Do not add ad hoc `console` or logger calls in sensitive backend source; extend the approved helpers and tests instead.

Live log sinks, Sentry/crash reporting, production sampling, and provider dashboard configuration remain human-gated setup work. Agents may add provider-neutral helpers and tests, but production/staging observability providers must not be configured with live credentials without explicit approval.

## Shared API Error Contract

`src/lib/api/errors.ts` is the server-only, framework-neutral RW-044 helper for desktop-facing backend errors. Future desktop-facing routes should use `rubyWhisperApiErrorResponse` so non-2xx responses keep the canonical code matrix, short safe messages, retryability, metadata allowlist, and `Cache-Control: no-store`.

Existing account web routes can keep their route-specific validation shape until their owning migration tickets require desktop compatibility. In particular, POST `/api/account/accept-terms` still returns `terms_acknowledgement_required` for missing form acknowledgement and `clerk_session_required` for the current Clerk session guard; missing accepted Terms state for dictation routes maps to `terms_required` through the shared helper.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
