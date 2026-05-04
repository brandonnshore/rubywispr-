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
- Future provider gateway routes and clients are not part of the scaffold. Groq/provider client work belongs to RW-040, transcription/cleanup gateway behavior belongs to Wave 4 backend tickets, backend-to-desktop error shapes belong to RW-044, and mocked provider integration coverage belongs to RW-046.

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

## Auth Privacy Validation Contract

Run the focused guardrails from the repository root when changing Clerk auth, route protection, profile sync, auth config, or auth tests:

```bash
npm run test:auth-privacy
```

The command is also covered by `npm run test` because it uses Node's test runner. It verifies:

- Clerk server secret names stay out of `src/config/client.ts`, browser-bound source, and `.next/static` public bundle artifacts when a build exists.
- `src/lib/auth/clerk.ts` and `src/lib/auth/profile-sync.ts` remain `server-only`; Client Components and Clerk browser-bound files cannot import those helpers.
- Authorization decisions stay server-side. Browser-bound files may render Clerk sign-in/sign-up UI, but must not use `useAuth`, `useUser`, `SignedIn`, `SignedOut`, `Protect`, or redirect helpers to gate protected product/admin access.
- Auth-sensitive source avoids console/logger output and obvious storage of magic links, session tickets, JWTs, or tokens.
- Auth test fixtures use only synthetic IDs and placeholder email domains such as `example.com` or `.test`; do not add real magic links, session tokens, JWTs, private env values, or customer email addresses.

After `npm run build`, rerun `npm run test:auth-privacy` or the focused changed-file scan so the public bundle artifact check covers the latest `.next/static` output.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
