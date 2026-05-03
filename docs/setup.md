# RubyWhisper Service And Secret Setup Checklist

This checklist tracks provider setup for local development, staging, and production without recording secret values. It names required services, projects, environment variable names, approval gates, and storage rules.

## Secret Storage Rules

- Do not commit, print, paste, screenshot, summarize, or log secret values.
- Do not inspect `.env.local` or any private env source file while working tickets.
- Store local private values outside git, with `~/.config/rubywhisper/rubywhisper.env` as the default private source and `.env.local` as the local generated file.
- Use `.env.example` only for placeholder names, never real credentials.
- Store staging and production values in the relevant provider secret store, such as Vercel project environment settings or the approved release-signing secret manager.
- Keep server-only values off the desktop app. The desktop app must not contain Groq, Stripe, Supabase service-role, or Clerk secret keys.
- Production secrets require human approval before first deployment.
- Live billing, production Groq access, production Clerk/Supabase projects, Apple signing/notarization, and public Sparkle release channels require human approval.
- Crash reporting must be privacy-safe: disable automatic request-body capture, screenshots, session replay, transcript capture, and audio capture unless explicitly approved later.

## Required Services

- [ ] Clerk: create separate development, staging, and production applications for email magic-link auth.
- [ ] Supabase: create separate development, staging, and production projects for product metadata only. Do not use Supabase Storage for audio or transcripts.
- [ ] Stripe: use test mode for development and staging; production live mode requires human approval.
- [ ] Groq: provision development and staging/restricted keys first; production key requires human approval.
- [ ] Vercel: create preview/staging and production projects or environments for the Next.js app and backend routes.
- [ ] APPLE Developer: prepare signing and notarization access for direct-download macOS releases; production signing requires human approval.
- [ ] Sparkle: prepare appcast/update channels after the macOS app import confirms the updater choice; public production channel requires human approval.
- [ ] Sentry or equivalent crash reporting: configure privacy-safe error reporting with scrubbing enabled and screenshots/session replay disabled.

## Environment Variables

Every variable named in `TECHNICAL_INFRASTRUCTURE.md` is accounted for here. Record values only in approved secret stores, never in docs, comments, tickets, PR descriptions, or terminal output.

| Env var | Service | Environments | Handling |
| --- | --- | --- | --- |
| `CLERK_SECRET_KEY` | Clerk | dev, staging, production | Server-only secret. Production requires human approval. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | dev, staging, production | Public client identifier. Keep environment-specific. |
| `CLERK_WEBHOOK_SECRET` | Clerk | dev, staging, production | Server-only webhook secret. Production requires human approval. |
| `SUPABASE_URL` | Supabase | dev, staging, production | Environment-specific project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | dev, staging, production | Server-only admin key. Production requires human approval. |
| `SUPABASE_ANON_KEY` | Supabase | dev, staging, production | Client-safe anon key. Keep environment-specific. |
| `STRIPE_SECRET_KEY` | Stripe | dev, staging, production | Use test keys outside production. Live key requires human approval. |
| `STRIPE_WEBHOOK_SECRET` | Stripe | dev, staging, production | Use Stripe CLI forwarding locally and test webhook secrets for non-production. Live webhook secret requires human approval. |
| `STRIPE_MONTHLY_PRICE_ID` | Stripe | dev, staging, production | Use test price IDs outside production. Live price IDs require human approval. |
| `STRIPE_ANNUAL_PRICE_ID` | Stripe | dev, staging, production | Use test price IDs outside production. Live price IDs require human approval. |
| `GROQ_API_KEY` | Groq | dev, staging, production | Server-only provider key. Production requires human approval. |
| `SENTRY_DSN` | Sentry or equivalent | dev, staging, production | Environment-specific crash reporting DSN; configure privacy scrubbing. |
| `SENTRY_AUTH_TOKEN` | Sentry or equivalent | dev, staging, production | Build/release token if needed. Production requires human approval. |
| `APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN` | Apple Developer/Sparkle release pipeline | staging, production | Release-signing or appcast publication secret. Production signing and public appcast publication require human approval. |

## Local Development

- [ ] Run `scripts/setup-chat-env.sh` when opening a new chat or worktree.
- [ ] Keep private local values in the approved private env source; do not paste values into repository files.
- [ ] Use a Clerk development application.
- [ ] Use a Supabase local instance or hosted development project.
- [ ] Use Stripe test mode and Stripe CLI webhook forwarding.
- [ ] Use a Groq development or restricted API key.
- [ ] Use a development Sentry/crash-reporting project only if needed.
- [ ] Do not configure Apple Developer production signing or public Sparkle channels for local development.
- [ ] Confirm commands do not print `.env.local` or private env source content.

## Staging

- [ ] Create or identify the Vercel preview/staging environment.
- [ ] Configure staging env vars in Vercel or the approved staging secret store.
- [ ] Use a Clerk staging application and staging webhook secret.
- [ ] Use a Supabase staging project with no audio/transcript storage.
- [ ] Use Stripe test mode products, prices, checkout, portal, and webhook endpoint.
- [ ] Use a Groq staging or restricted key if available.
- [ ] Configure staging crash reporting with privacy scrubbing enabled.
- [ ] Use Apple Developer and Sparkle staging/test release paths only after the macOS import confirms the release workflow.
- [ ] Verify staging values are isolated from production values.

## Production

- [ ] human approval required: create or confirm the Vercel production environment before adding production secrets.
- [ ] human approval required: create or confirm the Clerk production application and production webhook endpoint.
- [ ] human approval required: create or confirm the Supabase production project and service-role handling.
- [ ] human approval required: enable Stripe live mode, live products, live prices, checkout, customer portal, and webhook endpoint.
- [ ] human approval required: provision the production Groq key.
- [ ] human approval required: configure production Sentry/crash-reporting release token or DSN.
- [ ] human approval required: configure Apple Developer signing and notarization credentials.
- [ ] human approval required: configure the Sparkle public appcast/update channel.
- [ ] Confirm production secrets live only in approved production secret stores.
- [ ] Confirm production launch does not change the documented privacy posture.

## Final Review Before PR Or Release

- [ ] Run the required setup-doc search:

```bash
rg -n "CLERK_|SUPABASE_|STRIPE_|GROQ_|SENTRY_|APPLE|Sparkle|human approval" *.md docs
```

- [ ] Confirm each env var from `TECHNICAL_INFRASTRUCTURE.md` appears in this checklist.
- [ ] Confirm no real secret values are present in docs, commits, PR text, Linear comments, or command output.
- [ ] Confirm production secret and live billing steps are labeled `human approval required`.
