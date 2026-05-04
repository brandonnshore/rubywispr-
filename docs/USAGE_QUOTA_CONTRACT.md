# Usage And Trial Quota Contract

This contract is the shared source for RubyWhisper account APIs, desktop
transcription routes, Mac account/settings surfaces, billing/admin work, and
launch audit tickets that touch usage or trial entitlement.

## Canonical Surfaces

- Trial/usage primitives live in `apps/web/src/lib/usage/quota.ts`.
- Supabase counter access lives in
  `apps/web/src/lib/usage/supabase-usage-counters.ts`.
- Entitlement and post-success increment preparation lives in
  `apps/web/src/lib/usage/quota-service.ts`.
- The metadata schema lives in
  `supabase/migrations/20260504005703_product_metadata_schema.sql`.
- Desktop-facing quota failures must use
  `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`.
- Backend logs must follow the no-body logging contract in
  `apps/web/README.md#backend-no-body-logging-contract` and the helper in
  `apps/web/src/lib/observability/privacy-logger.ts`.

## Trial Policy

- New trial accounts receive `5,000` trial words by default.
- Trial usage is counted from the final cleaned output returned by the backend,
  not from raw transcript words, audio duration, prompt tokens, or surrounding
  context.
- Word counting uses `countRubyWhisperBillableOutputWords`, which treats
  whitespace-separated output tokens as billable words after trimming empty
  input.
- Preflight policy is `allow_if_started_under_limit`: if a trial user has at
  least one word remaining when the request starts, the backend may process the
  request.
- The post-success increment records the final output word count. A request that
  starts at `4,999` words used and returns `8` output words records
  `5,007` stored trial words used, while client-facing quota metadata reports
  `trialWordsRemaining: 0` and `trialWordsUsed: 5,000`.
- Users at or above `5,000` trial words before a request are rejected before
  provider work with `trial_exhausted`.
- Paid active users and Friend of Ruby active users are allowed without spending
  trial words. Their successful usage still increments lifetime and monthly
  metadata counters for admin, fair-use, and support workflows.
- Blocked accounts, payment failures, subscription-required states, and
  exhausted trials fail closed before provider work.

## Metadata Allowlist

Usage counters may store only aggregate metadata:

- `clerk_user_id`
- `trial_words_used`
- `lifetime_words_used`
- `monthly_words_used`
- `monthly_period_start`
- `updated_at`

Client or desktop account responses may expose only recovery/display metadata
derived from those counters and entitlement state:

- `planState`
- `trialWordsUsed`
- `trialWordsRemaining`
- `trialWordsLimit`
- `isTrialLow`
- `isTrialExhausted`
- `lifetimeWordsUsed`
- `monthlyWordsUsed`
- `monthlyPeriodStart`

Desktop-facing error metadata must stay within
`docs/BACKEND_DESKTOP_ERROR_CONTRACT.md#metadata-allowlist`. The normal
recording island should not show full usage counters except low or exhausted
states; account/settings surfaces own detailed usage display.

## Forbidden Content

Usage, entitlement, request metadata, Supabase rows, logs, Linear comments, PR
bodies, and test fixtures must not store or echo:

- audio payloads, audio files, or recording contents
- raw transcripts
- cleaned text or cleaned transcripts
- cleanup prompts or provider request/response bodies
- surrounding app context or screenshots
- clipboard contents
- local Recent Wisprs
- personal dictionary terms
- auth/session tokens, magic links, private env values, or secrets

Allowed request metadata such as `audioDurationMs`, `cleanedWordCount`,
provider name, latency, app version, OS version, and error code is numeric or
categorical metadata only. It must never contain the underlying dictation
content.

## Downstream Integration Rules

- Desktop transcription endpoints should evaluate auth, Terms acceptance,
  account block/payment/subscription state, rate limits, duration limits, and
  quota before provider work.
- Quota increments happen only after a successful final cleaned output exists.
  Provider failures, invalid audio, signed-out, Terms-required, and exhausted
  requests must not spend trial words.
- Account and Mac settings APIs should use the same quota metadata names listed
  above so desktop surfaces do not invent parallel plan states.
- Admin views may show counters, plan state, provider/error metadata, and
  request IDs, but not content.
- Future Stripe webhook work remains the billing source of truth for paid plan
  state; Supabase stores app behavior metadata and cache state only.

## Accepted Limitations

- Live quota exhaustion QA has not run yet. It waits for the Clerk project,
  Supabase project, real auth sessions, and the desktop transcription endpoint.
- Live Supabase project validation is human-gated. Autonomous work should keep
  using mocked/offline tests until the required environment is provided.
- The current service prepares metadata and counter writes; final endpoint
  wiring belongs to the authenticated transcription work.
- Product/legal fair-use copy for paid users is separate from this engineering
  contract.

If an agent reaches a live setup requirement, create or update a Linear blocker
with the exact environment/account/manual QA ask, keep placeholder metadata in
code, and continue with non-blocked mocked work.

## Validation

Run these commands from the repository root after changing usage/quota code or
docs:

```bash
npm run test --workspace @rubywhisper/web
npm run test:auth-privacy --workspace @rubywhisper/web
npm run lint --workspace @rubywhisper/web
npm run typecheck --workspace @rubywhisper/web
```

For docs-only changes, also verify the contract is discoverable:

```bash
rg -n "trial|quota|usage|word count|usage_counters|trial_exhausted" docs apps/web/README.md TECHNICAL_SPEC.md IMPLEMENTATION_PLAN.md
git diff --check
```
