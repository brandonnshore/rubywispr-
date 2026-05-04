# RubyWhisper Web

This is the RubyWhisper Next.js App Router shell. Run commands from the repository root so npm uses the workspace lockfile.

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Placeholders

`apps/web/.env.example` contains blank placeholder names only. Copy names into a private env file or provider secret store when an integration ticket requires real values.

- Server config lives in `src/config/server.ts` and may read server-only names such as `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `GROQ_API_KEY`, `SENTRY_AUTH_TOKEN`, and release-signing secrets.
- Client config lives in `src/config/client.ts` and may read only `NEXT_PUBLIC_*` names. Do not add secret, webhook, service-role, provider API, or signing key names to client config.
- Blank placeholders are intentional so `lint`, `typecheck`, `test`, and `build` can run before live services exist.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
