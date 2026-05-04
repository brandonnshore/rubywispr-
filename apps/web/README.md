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
npm run build
```

Those root scripts map to the workspace scripts in this package:

- `dev`: `next dev`
- `lint`: `eslint`
- `typecheck`: `tsc --project tsconfig.typecheck.json --noEmit`
- `test`: `node --test`
- `build`: `next build`

Backend validation uses the same root commands because RubyWhisper backend routes live in this Next.js app.

## App Layout And Ownership

- `src/app/layout.tsx` and `src/app/globals.css` own the shared App Router shell and global styles. Future visual system work belongs to RW-080 before broad page polish.
- `src/app/(public)/page.tsx` is the public entry route scaffolded by RUB-82. Marketing and product-proof work belongs to RW-081; pricing, download, and customer-facing account flows belong to RW-082; legal/support pages belong to RW-083.
- `src/app/account/page.tsx` is the authenticated customer account placeholder scaffolded by RUB-82. Clerk auth belongs to RW-022, subscription/account data belongs to RW-024/RW-025/RW-026, and the production account UI belongs to RW-082.
- `src/app/admin/page.tsx` is the admin placeholder scaffolded by RUB-82. Server-side admin roles belong to RW-028, the beta health dashboard belongs to RW-084, Friend of Ruby code workflows belong to RW-085, and later auth/admin security audit belongs to RW-101.
- `src/app/api/status/route.ts` is the current smoke API. Future API routes stay under `src/app/api/*` and must keep provider, billing, Supabase service-role, webhook, and signing logic server-only.
- Future provider gateway routes and clients are not part of the scaffold. Groq/provider client work belongs to RW-040, transcription/cleanup gateway behavior belongs to Wave 4 backend tickets, backend-to-desktop error shapes belong to RW-044, and mocked provider integration coverage belongs to RW-046.

## Environment Placeholders

`apps/web/.env.example` contains blank placeholder names only. Copy names into a private env file or provider secret store when an integration ticket requires real values.

- Server config lives in `src/config/server.ts` and may read server-only names such as `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `GROQ_API_KEY`, `SENTRY_AUTH_TOKEN`, and release-signing secrets.
- Client config lives in `src/config/client.ts` and may read only `NEXT_PUBLIC_*` names. Do not add secret, webhook, service-role, provider API, or signing key names to client config.
- Blank placeholders are intentional so `lint`, `typecheck`, `test`, and `build` can run before live services exist.
- Never print, inspect, summarize, commit, paste, or attach `.env.local` or any private env source file in workpads, PRs, docs, comments, logs, or chat. Only placeholder names belong in this repo.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
