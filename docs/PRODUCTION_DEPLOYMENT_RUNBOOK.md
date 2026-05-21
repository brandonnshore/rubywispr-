# RubyWhisper Production Deployment And Rollback Runbook

This is a review-ready runbook for the RubyWhisper Next.js web/backend app. It
does not authorize an autonomous production deployment. Live credentials,
production project setup, DNS changes, live billing, provider activation, and
production promotion remain human-gated.

## Scope And Target

Deployment target:

- Platform: Vercel.
- App: `apps/web`, the Next.js App Router web/backend app.
- Runtime surfaces: public website, Clerk auth routes, account page, admin page,
  Stripe checkout/portal/webhook routes, desktop account API, desktop
  transcription API, and `/api/status`.
- Package manager: npm with the repository root workspace lockfile.
- CI baseline: `.github/workflows/web-ci.yml` runs `npm ci`, `npm run lint`,
  `npm run typecheck`, `npm run test`, `npm run docs:check`, and
  `npm run build`.

The active `rubywhisper-web` Vercel project currently uses `apps/web` as its
Root Directory. The repository also has a root `vercel.json` so a repo-root
Vercel import can build the same app without failing output-directory
validation: it pins the framework to Next.js, keeps `outputDirectory` at
`.next`, and copies `apps/web/.next` to root `.next` only when the deployment
is running from the repository root.

Future Vercel imports should prefer the active `apps/web` Root Directory unless
the release owner intentionally chooses a repo-root import. Do not change live
Vercel Root Directory, build command, output directory, production env vars,
domains, or DNS without the human gates below.

## Hard Gates

These steps require Brandon or another approved human release owner:

| Gate | Covered by |
| --- | --- |
| Create or modify live Vercel production project settings, production env vars, production domains, or DNS | RUB-79 / RW-106 and RUB-80 / RW-107 |
| Promote a production deployment or approve a rollback during an incident | RUB-79 / RW-106 and RUB-80 / RW-107 |
| Create or rotate Clerk production application keys or webhook secrets | RUB-79 / RW-106, with security review in RW-101 |
| Create, link, migrate, or repair the Supabase production project | RUB-79 / RW-106, with data/security review in RW-101 |
| Enable Stripe live mode, live products/prices, checkout, portal, or webhook endpoint | RUB-79 / RW-106, RUB-161 for manual Stripe smoke, and RUB-80 / RW-107 for launch acceptance |
| Provision or rotate the production Groq key, approve live transcription smoke, or raise provider limits | RUB-140 and RUB-79 / RW-106 |
| Configure production Sentry or equivalent crash/error reporting | RUB-123 |
| Publish or change the public Mac download URL, signing secrets, or appcast/update channel | RW-105 and RUB-80 / RW-107 |

The source checklist for the human-owned Mac beta signing, notarization,
packaging, attribution, checksum, appcast, and clean-Mac QA sequence lives in
`docs/MAC_BETA_RELEASE_RUNBOOK.md`.

Agents may prepare docs, source-safe config, synthetic tests, and PRs. Agents
must not perform live provider setup, deploy production, change DNS, read
private env files, or paste credential values into Linear, PRs, docs, logs, or
commits.

## Environment Placeholders

Store real values only in Vercel environment settings or another approved
secret store. Keep `.env.example` and `apps/web/.env.example` blank and
placeholder-only.

### Clerk

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: public, environment-specific Clerk
  browser identifier.
- `CLERK_SECRET_KEY`: server-only Clerk secret.
- `CLERK_WEBHOOK_SECRET`: server-only Clerk webhook signing secret.

Human gate: production Clerk app settings, email-link configuration, disabled
password/social auth, webhook endpoint, and secret values require approval.

### Supabase

- `SUPABASE_URL`: server runtime Supabase project URL in the current scaffold.
- `SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key, kept out of browser
  config until a future ticket defines client access and row-level security.
- `SUPABASE_SECRET_KEY`: server-only Supabase secret key. The app still accepts
  legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names as fallback
  aliases for older local environments.

Human gate: production project creation, production service-role handling,
linking, config pushes, database pushes, and migrations require approval.
Supabase must remain metadata-only: no audio, transcripts, clipboard contents,
context, prompts, provider payloads, or dictionary terms.

### Desktop Auth

- `DESKTOP_TOKEN_SECRET`: server-only signing secret for desktop account tokens.

Human gate: production token signing secret generation and rotation require
approval.

### Stripe

- `STRIPE_SECRET_KEY`: server-only Stripe API key.
- `STRIPE_WEBHOOK_SECRET`: server-only webhook signing secret.
- `STRIPE_MONTHLY_PRICE_ID`: server runtime monthly price ID.
- `STRIPE_ANNUAL_PRICE_ID`: server runtime annual price ID.

Human gate: live mode, live products, live prices, checkout, portal, webhook
endpoint, webhook secret, webhook replay, and dashboard changes require
approval.

### Groq

- `GROQ_API_KEY`: server-only Groq API key.

Human gate: production key provisioning, quota/limit changes, provider dashboard
changes, and live transcription smoke require approval.

### Error Reporting

- `SENTRY_DSN`: non-public server runtime DSN in the current scaffold.
- `SENTRY_AUTH_TOKEN`: build/release token if the approved provider requires
  one.

Human gate: provider dashboard setup, production credentials, release upload,
sampling, captured-event review, and any screenshots/session replay require
RUB-123 approval. Request bodies, screenshots, session replay, audio,
transcripts, clipboard contents, provider payloads, auth material, and private
env values must not be captured.

### Admin Bootstrap

- `RUBYWHISPER_ADMIN_BOOTSTRAP_EMAILS`: server-only bootstrap allowlist for
  verified admin emails.

Human gate: choose the production admin emails, verify the accounts, and remove
or rotate bootstrap access after the production admin role rows are confirmed.

### App URLs And Release Config

- `NEXT_PUBLIC_RUBYWHISPER_APP_ENV`: public environment label such as
  `<production>` or `<staging>`.
- `NEXT_PUBLIC_RUBYWHISPER_APP_URL`: public canonical web app URL for that
  environment.
- `NEXT_PUBLIC_RUBYWHISPER_LATEST_APP_DOWNLOAD_URL`: public HTTPS URL for the
  latest approved Mac beta artifact.
- `APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN`: server-only release/download signing or
  appcast publication secret, if the release pipeline needs one.

Human gate: production domains, DNS, public download URL, Apple signing,
notarization, Sparkle appcast, and release signing credentials require approval.

## Local Validation

Run from the repository root:

```bash
scripts/setup-chat-env.sh
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:auth-privacy
npm run qa:release-gate -- --allow-blocked
npm run qa:browser-smoke
npm run qa:macos-package
npm run qa:macos-manual-harness
npm run docs:check
npm run build
git diff --check
```

Do not source, print, inspect, summarize, or attach `.env.local` or any private
env source while collecting validation evidence.

`npm run qa:release-gate` is a source-safe preflight for release evidence. By
default it verifies that `.env.example` and `apps/web/.env.example` include the
required placeholder env names with blank values, smokes the public web
deployment and `/api/status`, and then exits blocked while live/manual gates
remain deferred. Use
`--allow-blocked` only when intentionally recording source-safe evidence that
does not approve release. Use `--skip-network` for offline source-only checks.
Use `--include-live` only after an approved human has explicitly loaded the
needed env names into the shell and set `RUBYWHISPER_ALLOW_LIVE_RELEASE_SMOKES=1`;
the script checks presence only and never prints secret values.

`npm run qa:browser-smoke` is a source-safe deployed browser render smoke. It
requires local Chrome or Chromium, renders public and auth entry routes at
desktop and mobile viewport sizes, and records sanitized route, viewport, PNG
dimension, and byte-size evidence only. It does not source private env files,
click live auth/billing/provider flows, or approve release. Set `CHROME_BIN` or
pass `-- --chrome-bin <path>` if Chrome is not in a known system location.

`npm run qa:macos-package` is a source-safe local macOS package smoke. It uses
the local/ad hoc Makefile build and DMG helper, verifies app bundle metadata,
bundled notices, ad hoc signatures, mounted DMG contents, the `/Applications`
symlink, and `hdiutil verify`. It does not Developer ID sign, notarize, staple,
upload, publish, or approve a release artifact.

`npm run qa:macos-release-guardrails` verifies the source-safe fail-closed paths
for release-sensitive macOS Makefile targets. It checks ad hoc, blank,
placeholder, missing-identity, missing-profile, unavailable-tool, and
missing-artifact categories without reading private env files, using Apple
credentials, submitting to notary service, stapling, uploading, or publishing.

For docs-only runbook changes, run `npm run docs:check`. It validates local
Markdown links and the macOS manual QA harness guardrails; external URLs,
mailto links, web app routes, and heading anchors still need reviewer judgment
when those surfaces change.

`npm run qa:macos-manual-harness` validates the source-owned manual QA template
without executing manual QA. It keeps prerequisite rows blocked, keeps manual
MAC rows at `Not Run`, and confirms MAC-100 through MAC-108 name `real_mac`,
`test_seam`, or both as allowed Recent Wisprs evidence sources.

## Preview Or Staging Validation

Use preview/staging before production. Production credentials must not be used
in preview deployments.

1. Confirm Vercel preview/staging uses non-production env values only.
2. Confirm CI passed: lint, typecheck, tests, and build.
3. Open the preview deployment.
4. Smoke public routes:
   - `/`
   - `/pricing`
   - `/download`
   - `/privacy`
   - `/terms`
   - `/support`
   - `/sign-in`
   - `/sign-up`
5. Smoke backend status:
   - `GET /api/status` returns the RubyWhisper status payload with `status:
     "ok"` and `Cache-Control: no-store`.
6. Smoke gated routes with synthetic or approved test accounts only:
   - `/account`
   - `/admin`
   - `GET /api/admin/status`
7. Smoke Stripe in non-production mode only:
   - `POST /api/stripe/checkout` with an authenticated test user and test price
     IDs.
   - `POST /api/stripe/portal` with an authenticated test user when customer
     portal config is ready.
   - `POST /api/stripe/webhook` with mocked or Stripe CLI-forwarded test
     signatures only.
8. Smoke transcription with approved non-production provider setup only:
   - `POST /api/desktop/transcribe` using synthetic audio and a test account
     that has accepted Terms/Privacy.
   - Verify Supabase writes are metadata-only and contain no transcript, audio,
     clipboard, prompt, context, dictionary, or provider payload content.
9. Inspect logs and error reporting evidence for metadata-only events.
10. Record sanitized smoke evidence in the Linear workpad and PR. Do not include
    screenshots or logs that show private content, credential values, audio, or
    transcripts.

## Production Promotion

Production promotion is manual.

1. Confirm the exact commit SHA, branch, and PR are approved.
2. Confirm RUB-79 / RW-106 and RUB-80 / RW-107 release gates are accepted for
   production promotion.
3. Confirm no blocking security/privacy findings remain in RW-101 or related
   auth, billing, admin, transcription, or provider audits.
4. Confirm production Vercel env vars are present in the approved secret store,
   using only the names listed in this runbook.
5. Confirm production env values are scoped correctly:
   - server-only secrets are not `NEXT_PUBLIC_*`;
   - public values contain no secrets;
   - staging/test provider values are not copied into production;
   - production provider values are not copied into preview/staging.
6. Confirm Clerk production settings are approved.
7. Confirm Supabase production project, migrations, and service-role handling
   are approved.
8. Confirm Stripe live products, prices, portal, checkout, webhook endpoint, and
   webhook secret are approved.
9. Confirm Groq production key and usage limits are approved.
10. Confirm error reporting is privacy-scrubbed or intentionally disabled.
11. Confirm the public app URL and, when applicable, download URL are approved.
12. Promote through the approved Vercel workflow from the approved branch/tag or
    redeploy the approved commit in the production environment.
13. Run the production smoke path:
    - `GET /api/status`;
    - public routes listed in preview validation;
    - sign-in/sign-up page render without completing a real customer auth flow;
    - account/admin denial behavior using approved test accounts only;
    - Stripe checkout and webhook live-mode smoke only after explicit live
      billing approval;
    - transcription live smoke only after explicit Groq approval.
14. Record sanitized evidence and the production deployment ID in the workpad,
    PR, or release notes. Do not include credential values, private env output,
    customer data, audio, transcripts, provider payloads, or sensitive logs.

## Stripe Webhook Live-Mode Switch

This section is descriptive only; the switch is human-gated.

1. In Stripe live mode, create or confirm the production webhook endpoint for
   the production RubyWhisper app URL.
2. Subscribe only to the events required by the implemented billing routes.
3. Store the live webhook signing secret as `STRIPE_WEBHOOK_SECRET` in the
   production Vercel environment.
4. Store live price IDs as `STRIPE_MONTHLY_PRICE_ID` and
   `STRIPE_ANNUAL_PRICE_ID`.
5. Store the live server API key as `STRIPE_SECRET_KEY`.
6. Redeploy or restart the production environment so the server reads the
   updated secret store.
7. Send a live-mode test event only after approval. Confirm the route verifies
   the signature, writes metadata-only subscription/cache state, and does not
   log billing payloads or customer-sensitive values.
8. If webhook handling is wrong, roll back the deployment or disable billing
   entry points before replaying events.

## Rollback Path

Use the fastest path that stops user harm while preserving auditability.

1. Freeze new production changes and identify the suspected bad deployment ID,
   commit SHA, and first affected time.
2. Preserve sanitized operational metadata only: deployment ID, request IDs,
   route names, status codes, safe error codes, provider name, latency, and
   timestamps.
3. In Vercel, use the approved rollback or redeploy workflow to promote the last
   known-good production deployment.
4. Run rollback smoke checks:
   - `GET /api/status`;
   - public routes;
   - sign-in/sign-up render;
   - account/admin deny paths;
   - impacted provider route with approved synthetic/test input only.
5. If data migrations or provider dashboard changes are involved, stop and use
   the human-owned recovery procedure. Agents must not roll back production
   Supabase state, Stripe live mode, Clerk settings, Groq keys, or DNS.
6. Update Linear with sanitized incident notes and follow-up tickets.

## Emergency Disable Notes

Feature flags may be implemented as environment config or a Supabase table in a
future ticket. Until a source-level kill switch exists for a surface, use Vercel
rollback or an approved emergency patch that fails the route closed with a safe
`service_unavailable` response.

Checkout:

- Fastest safe disable: remove checkout entry points from the public/account UI
  through an emergency patch, or roll back to a deployment before checkout was
  enabled.
- Server-side fallback: remove or withhold Stripe billing config in the affected
  environment so checkout returns `service_unavailable`; this requires human
  approval for production env changes.
- Stripe dashboard fallback: disable or pause live checkout/products only by
  human approval.
- Recovery: restore the known-good deployment and replay webhook events only
  after billing state is understood.

Transcription:

- Fastest safe disable: roll back to a deployment where the desktop
  transcription route is disabled or fails closed.
- Provider-cost fallback: remove or rotate the Groq production key only by
  human approval; missing provider config should make provider calls fail closed.
- Abuse fallback: tighten rate-limit or account-blocking metadata only through
  an approved patch or human-run Supabase operation.
- Recovery: verify Terms/Privacy, quota, rate-limit, provider, and
  metadata-only Supabase writes with synthetic audio before restoring traffic.

Admin:

- Fastest safe disable: remove production admin bootstrap access or roll back to
  a deployment with admin surfaces closed.
- Server-side fallback: ensure all admin pages and APIs continue to require
  server-side admin authorization; never rely on browser-only checks.
- Human-only fallback: update production admin role rows or bootstrap email
  config only with approval.
- Recovery: verify non-admin denial on `/admin` and `/api/admin/status`, then
  verify approved admin access with metadata-only evidence.

Provider failures:

- Clerk failure: keep protected routes closed; do not bypass auth. Communicate
  sign-in/account impact and wait for provider recovery or approved rollback.
- Supabase failure: fail account, admin, transcription metadata, quota, and
  webhook-cache paths closed. Do not store fallback audio/transcript content.
- Stripe failure: stop new checkout if needed; keep Stripe as the billing source
  of truth; recover by replaying webhooks or syncing metadata after approval.
- Groq failure: fail transcription closed or return provider error codes; do not
  route audio to an unapproved provider.
- Error-reporting failure: disable the sink or keep the no-op adapter; do not
  capture broader payloads to compensate.

## Privacy And Evidence Rules

- Never commit or post private env values, live credentials, customer data,
  audio, raw transcripts, cleaned transcripts, clipboard contents, app context,
  dictionary terms, provider payloads, auth tokens, magic links, request bodies,
  or sensitive screenshots.
- Logs and release evidence may include only metadata approved in
  `TECHNICAL_INFRASTRUCTURE.md#Observability And Logging`.
- Support and incident notes should refer to `requestId`, route, deployment ID,
  safe error code, provider name, status, timestamp, and latency.
- Any new production action outside this runbook needs a follow-up Linear issue
  or explicit human approval before execution.
