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
- `src/app/admin/page.tsx` is the admin placeholder scaffolded by RUB-82.
  Server-side admin roles belong to RW-028, the beta health dashboard belongs
  to RW-084, Friend of Ruby code workflows belong to RW-085, and later
  auth/admin security audit belongs to RW-101. Admin authorization must be
  verified on the server for every admin page render and every admin API
  request; browser code may never decide admin access from Clerk client hooks,
  public metadata, local state, or client-bundled allowlists.
- `src/app/api/status/route.ts` is the current smoke API. Future API routes stay under `src/app/api/*` and must keep provider, billing, Supabase service-role, webhook, and signing logic server-only.
- `src/lib/api/errors.ts` exposes the server-only RW-044 backend error contract helper. Future desktop API route handlers should use `rubyWhisperApiErrorResponse` so non-2xx responses keep stable codes, `Cache-Control: no-store`, and metadata-only payloads.
- `src/lib/providers/client.ts` exposes the server-only RW-040A provider
  contract and mockable provider surface. `src/lib/providers/groq.ts` exposes
  the server-only RW-040B Groq transcription adapter shell using the
  OpenAI-compatible audio transcription endpoint. Live Groq smoke validation
  remains blocked by RUB-140, transcription/cleanup gateway behavior belongs to
  Wave 4 backend tickets, desktop-facing backend routes must follow
  `../../docs/BACKEND_DESKTOP_ERROR_CONTRACT.md` for RW-044, and mocked
  provider integration coverage belongs to RW-046.
- `src/lib/cleanup/conservative-cleanup.ts` owns the server-only RW-042
  conservative cleanup prompt and transient cleanup runner. It returns the raw
  transcript when cleanup is disabled or the cleanup provider fails, and it must
  never persist or log transcript, context, dictionary, prompt, or provider
  payload content.
- `src/lib/desktop-transcribe/request.ts` exposes the server-only RW-041A
  parser for desktop transcription request bodies. It validates synthetic
  multipart or binary audio inputs, returns provider input, cleanup settings,
  and metadata for downstream route work, enforces the 600,000ms duration cap,
  and returns route-safe `invalid_audio` / `duration_limit_reached` failures
  before provider work.
- `src/app/api/desktop/transcribe/route.ts` owns the RW-041B/RW-041C/RW-041D desktop
  transcription route shell. It authenticates Clerk users, checks Terms/Privacy,
  reads subscription and usage metadata, enforces quota entitlement, maps parser
  failures to shared desktop API errors, executes mocked provider transcription
  for cleanup-disabled requests, records metadata-only request rows, increments
  metadata-only usage counters after successful provider output, and keeps
  cleanup-enabled requests failed closed until RW-042 lands.

## Web Design System Contract

Use this section as the short implementation contract for future public,
auth/account, pricing/checkout/download, and admin web work. The source design
direction remains `../../WEB_DESIGN_SPEC.md`; review its
[`Typography`](../../WEB_DESIGN_SPEC.md#typography),
[`Color System`](../../WEB_DESIGN_SPEC.md#color-system),
[`Accessibility`](../../WEB_DESIGN_SPEC.md#accessibility),
[`Responsive And Platform Behavior`](../../WEB_DESIGN_SPEC.md#responsive-and-platform-behavior),
[`Design Tokens`](../../WEB_DESIGN_SPEC.md#design-tokens),
[`Developer Handoff Notes`](../../WEB_DESIGN_SPEC.md#developer-handoff-notes),
and [`Design QA Checklist`](../../WEB_DESIGN_SPEC.md#design-qa-checklist)
sections before broad visual changes. Do not copy large spec blocks into app
docs or PRs.

Current tokenized routes are `/`, `/sign-in`, `/sign-up`, `/account`, and
`/admin`. New pricing, checkout, download, account, or admin work should extend
these route families with the same token and validation contract.

### Token And Primitive Usage

`src/app/globals.css` is the source of truth for implemented web tokens and
shared primitives. Prefer these tokens and classes before adding one-off CSS:

- Color tokens: `--rw-color-background`, `--rw-color-surface`,
  `--rw-color-surface-muted`, `--rw-color-surface-subtle`,
  `--rw-color-text-primary`, `--rw-color-text-secondary`,
  `--rw-color-text-muted`, `--rw-color-border`,
  `--rw-color-border-strong`, `--rw-color-accent`,
  `--rw-color-accent-hover`, `--rw-color-accent-soft`,
  `--rw-color-accent-border`, `--rw-color-accent-contrast`,
  `--rw-color-success`, `--rw-color-success-soft`,
  `--rw-color-success-border`, `--rw-color-warning`,
  `--rw-color-warning-soft`, `--rw-color-warning-border`,
  `--rw-color-error`, `--rw-color-error-soft`, and
  `--rw-color-error-border`.
- Shape, spacing, and motion tokens: `--rw-radius-small`,
  `--rw-radius-medium`, `--rw-space-1`, `--rw-space-2`, `--rw-space-3`,
  `--rw-space-4`, `--rw-space-6`, `--rw-space-8`,
  `--rw-duration-fast`, `--rw-duration-normal`, and
  `--rw-easing-standard`.
- Compatibility aliases exist for Tailwind/theme consumers:
  `--color-background`, `--color-surface`, `--color-text-primary`,
  `--color-text-secondary`, `--color-accent`, `--color-success`,
  `--color-warning`, `--color-error`, `--radius-small`,
  `--radius-medium`, `--space-1`, `--space-2`, `--space-3`,
  `--space-4`, `--space-6`, `--space-8`, `--duration-fast`,
  `--duration-normal`, and `--easing-standard`.
- Shared layout and UI primitives: `surface-shell`, `surface-panel`,
  `surface-kicker`, `surface-copy`, `rw-page-shell`, `rw-container`,
  `rw-stack`, `rw-cluster`, `rw-panel`, `rw-button`,
  `rw-button-secondary`, `rw-field`, `rw-label`, `rw-status`,
  `rw-status-success`, `rw-status-warning`, and `rw-status-error`.

Public pages should keep the light, product-led website direction, with
full-width sections and constrained content instead of nested cards. Account,
auth, pricing, checkout, and download pages should reuse the tokenized shell,
buttons, fields, labels, and status treatments unless a ticket introduces a
specific new primitive. Admin pages are utilitarian and dense: optimize for
scanning tables, filters, statuses, and repeated operations rather than
marketing composition, oversized hero text, or decorative framing.

### Interaction And State Expectations

- Interactive elements need visible `:focus-visible` states using the global
  focus style or a token-equivalent treatment. Hover, pressed, disabled,
  loading, success, warning, and error states must not rely on color alone.
- Buttons and fields use at least the existing 48px minimum control height on
  public/account flows. Dense admin controls may be more compact when the
  surrounding table or filter UI remains keyboard reachable and legible.
- Text must fit its container on mobile and desktop. Keep `letter-spacing: 0`
  unless a future design-system ticket changes the typography contract; do not
  use negative letter spacing.
- Respect `prefers-reduced-motion`. Any added animation should shorten or
  disable through the global reduced-motion rule or an equivalent local media
  query.
- Keep contrast aligned with WCAG AA intent for text, controls, focus states,
  and status messages. Use state color plus labels, icons, borders, or copy so
  success/warning/error meaning survives grayscale or color-vision differences.
- Do not add nested cards, decorative blobs/orbs, bokeh backgrounds, abstract
  SVG decoration, or dark Superwhisper-style surfaces. Use product screenshots
  or high-fidelity app visuals when a page needs media.

### Privacy And Admin Guardrails

Web UI must preserve the backend privacy contract. Do not expose or store audio,
raw transcripts, cleaned text, prompts, clipboard contents, local Recent Wisprs,
dictionary terms, provider payloads, auth material, private env values, or
secrets in pages, admin tables, tests, logs, screenshots, PR descriptions, or
Linear comments.

Admin pages and admin APIs must stay server-authorized. Admin UI may show
metadata needed for operations, such as user IDs, emails, plan state, usage
counters, request IDs, timestamps, latency, provider names, status, and safe
error codes. It must not expose transcript, audio, clipboard, prompt, context,
dictionary, provider request/response, or other private dictation content.

### Frontend PR Validation

For user-facing web PRs, record the commands run and attach or link browser
evidence in the PR and Linear workpad. Minimum expectations:

- Run `npm run lint --workspace @rubywhisper/web` after CSS, TS, TSX, route,
  or app-doc examples change. The root fallback `npm run lint` maps to the same
  workspace command.
- Run `npm run typecheck --workspace @rubywhisper/web` after TS/TSX,
  route-handler, server-action, or typed example changes. The root fallback
  `npm run typecheck` maps to the same workspace command.
- For docs-only changes, run a targeted Markdown/style sanity check if one is
  added later. Until then, verify referenced paths and commands with shell
  checks and manually review the rendered Markdown or changed diff.
- For user-visible UI changes, run the app locally with `npm run dev
  --workspace @rubywhisper/web`, then capture desktop and mobile-width browser
  evidence for touched routes. Include route URLs, viewport sizes, screenshots
  or a short video, and notes for focus state, responsive text fit, reduced
  motion, and any status states exercised.
- For public/account/admin surfaces, spot-check keyboard tab order, visible
  focus, no horizontal overflow at mobile width, contrast intent, and that admin
  evidence contains metadata only. Keep browser proof out of `.env.local`,
  private env sources, live customer data, transcript/audio content, and
  provider payloads.

## Usage And Trial Quota Contract

The shared usage policy lives in `../../docs/USAGE_QUOTA_CONTRACT.md`. Use it
before changing account APIs, desktop transcription routes, Mac account/settings
surfaces, billing/admin views, usage tests, or launch audit docs.

Current server-only helper surfaces:

- `src/lib/usage/quota.ts` owns word counting, the 5,000-word trial default, and
  normalized quota state.
- `src/lib/usage/supabase-usage-counters.ts` owns metadata-only
  `usage_counters` reads and prepared increments.
- `src/lib/usage/supabase-transcription-requests.ts` owns metadata-only
  `transcription_requests` writes for request id, status, provider, plan state,
  duration, word count, latency, app version, OS version, and error code fields
  only.
- `src/lib/usage/quota-service.ts` owns entitlement decisions and post-success
  usage increments.
- `src/lib/account/profile-metadata.ts` reads metadata-only profile state for a
  server-verified Clerk user.
- `src/lib/account/subscription-cache.ts` reads normalized subscription cache
  metadata for account and quota decisions.
- `src/lib/account/desktop-account-snapshot.ts` composes the desktop-facing
  account state from profile, subscription, and usage metadata.
- `src/lib/rate-limit/transcription.ts` owns the local/mockable RW-031A
  transcription request-window decision primitive. It accepts Clerk user ID,
  timestamps, request counts, and plan-state policy metadata only, returns
  `allowed`, `rate_limited`, or `invalid_user`, and has no persistence,
  network, Supabase, logging, provider, or payload side effects.
- `src/lib/rate-limit/supabase-transcription-rate-limits.ts` owns the
  server-only Supabase metadata store helpers. The production desktop
  transcription route uses the atomic claim helper so cross-request counters are
  read and updated before parsing audio or calling providers.

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

### Desktop Transcription Route

`src/app/api/desktop/transcribe/route.ts` checks Clerk auth, Terms acceptance,
quota entitlement, and the persistent transcription rate-limit claim before
parsing audio or calling providers. The default claim uses per-user Supabase
metadata only and must not store audio, transcripts, cleanup context,
dictionary terms, provider payloads, auth material, or private env values.

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
- Provider helpers such as `src/lib/providers/client.ts` and
  `src/lib/providers/groq.ts` remain server-only, mockable, and free of
  persisted provider payloads. Tests must inject fake fetch implementations and
  synthetic endpoints; live Groq calls stay in blocked/manual QA tickets.
- Desktop transcription parser helpers such as
  `src/lib/desktop-transcribe/request.ts` remain server-only and parse request
  content only in memory. Tests use synthetic audio bytes and must not persist
  or log audio, transcripts, cleaned text, context, dictionary terms, or
  provider payloads.
- Transcription rate-limit primitives such as
  `src/lib/rate-limit/transcription.ts` remain server-only and evaluate only
  metadata counters and timestamps. Tests must not add audio, transcripts,
  cleaned text, context, dictionary terms, prompts, provider payloads, auth
  material, private env values, network calls, or storage side effects.
- The desktop transcription route shell is covered by
  `test/desktop-transcribe-route.test.mjs` and `test:auth-privacy`. Preflight
  and provider failures must return `rubyWhisperApiErrorResponse` payloads with
  `no-store`, cleanup-disabled provider success uses synthetic/mocked
  transcription output in tests, cleanup-enabled requests fail closed pending
  RW-042, and live provider calls remain out of autonomous validation.
- Admin API route handlers must call `requireRubyWhisperAdminForApi` from
  `src/lib/admin/api.ts` on every request before returning protected data.
  Denials return shared `rubyWhisperApiErrorResponse` payloads, and backend
  role lookup failures fail closed with privacy-safe metadata only.
- Admin page handlers must call `requireRubyWhisperAdminForPage` from
  `src/lib/admin/auth.ts` during server rendering. Client Components and
  browser-bound files must not import `src/lib/admin/*`,
  `src/config/server.ts`, or `src/lib/supabase/server.ts`, and must not read
  `RUBYWHISPER_ADMIN_BOOTSTRAP_EMAILS` or Supabase service-role env names.
  Admin payloads stay metadata-only; do not expose transcript, audio,
  clipboard, context, dictionary, prompt, provider payload, or private user
  content fields from admin pages or APIs.
- Authorization decisions stay server-side. Browser-bound files may render Clerk sign-in/sign-up UI, but must not use `useAuth`, `useUser`, `SignedIn`, `SignedOut`, `Protect`, or redirect helpers to gate protected product/admin access.
- Auth-sensitive source avoids console/logger output and obvious storage of magic links, session tickets, JWTs, or tokens.
- Auth test fixtures use only synthetic IDs and placeholder email domains such as `example.com` or `.test`; do not add real magic links, session tokens, JWTs, private env values, or customer email addresses.
- Backend privacy logging guardrails reject ad hoc logging, direct capture SDK calls, and sensitive `JSON.stringify` usage in auth/API/provider/observability source. They also verify the approved privacy logger remains server-only and side-effect free.

After `npm run build`, rerun `npm run test:auth-privacy` or the focused changed-file scan so the public bundle artifact check covers the latest `.next/static` output.

## Backend Integration Test Harness

Future mocked backend route tests should import from `test/support/backend-integration.mjs`. The helper exports synthetic Clerk/Supabase/provider fixtures plus `invokeRouteHandler`, `invokeServerFunction`, `createSyntheticBackendRequest`, `createMockBackendProviders`, `createMockProviderClient`, `createSyntheticProviderTranscriptionSuccess`, `createSyntheticProviderFailure`, and `assertNoPrivateProviderFixtureInput`.

Keep these tests offline-only. Do not pass live Clerk, Stripe, Supabase, Groq, Sentry, auth, billing, or private env values into the helper; it rejects live-looking hosts, credential-like strings, private env source references, and guarded server secret names. Provider fixture helpers also reject private payload fields such as raw audio, transcripts, cleaned text, app context, dictionary terms, prompts, headers, cookies, and provider request/response bodies; use fixed synthetic provider output and metadata-only overrides instead.

Stripe checkout and customer portal integration coverage is synthetic-only. `test/stripe-account-billing-integration.test.mjs` composes account billing server actions with mocked checkout and portal route handlers, but the remaining manual Stripe test-mode smoke is tracked by RUB-161 and stays blocked until Brandon provides or approves the test-mode setup. Do not add live Stripe credentials, dashboard configuration, webhook forwarding, or real billing payloads to this suite.

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
