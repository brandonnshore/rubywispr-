# Source Latency Metadata Contract

RUB-218 audited the source-side backend paths that can be checked without live
Groq, Mac recording, or staging traffic.

## Covered Source Paths

- `apps/web/src/lib/desktop-transcribe/request.ts` parses request metadata only:
  duration, MIME type, cleanup booleans, app version, and OS version. Over-limit
  failures return numeric duration metadata only.
- `apps/web/src/lib/rate-limit/transcription.ts` and
  `apps/web/src/lib/rate-limit/supabase-transcription-rate-limits.ts` evaluate
  quota window metadata only: limit, request count, retry seconds, and window
  timestamps.
- `apps/web/src/lib/providers/groq.ts` measures provider latency with `nowMs`
  around the Groq transcription call. Provider failures may include
  `providerLatencyMs` and `totalLatencyMs`; in this source path they are the same
  provider-call envelope because live end-to-end benchmarking is out of scope.
- `apps/web/src/lib/cleanup/conservative-cleanup.ts` forwards provider cleanup
  latency metadata and never persists transcript, cleaned text, context, or
  dictionary payloads.
- `apps/web/src/app/api/desktop/transcribe/route.ts` persists provider latency
  as `latencyMs` for transcription request metadata on success, provider
  failure, and cleanup failure. It only forwards finite nonnegative latency
  numbers.
- `apps/web/src/lib/usage/supabase-transcription-requests.ts` inserts
  `transcription_requests.latency_ms` as finite numeric metadata only and omits
  invalid latency values.

## Privacy Boundary

Latency/performance metadata must stay metadata-only. The backend must not
serialize or persist private audio, raw transcript, cleaned transcript, cleanup
context, dictionary terms, clipboard contents, provider request bodies, or
provider response bodies in latency metadata, request metadata, error metadata,
or Supabase rows.

Current regression coverage for this contract lives in:

- `apps/web/test/desktop-transcribe-request.test.mjs`
- `apps/web/test/provider-client-contract.test.mjs`
- `apps/web/test/groq-provider-client.test.mjs`
- `apps/web/test/conservative-cleanup.test.mjs`
- `apps/web/test/desktop-transcribe-route.test.mjs`
- `apps/web/test/supabase-transcription-requests.test.mjs`
- `apps/web/test/transcription-rate-limit.test.mjs`
- `apps/web/test/supabase-transcription-rate-limits.test.mjs`

## Remaining Live And Manual Timing Work

Full RW-102 completion remains blocked by work outside this source audit:

- RUB-26 / RW-015: live Groq latency and cost benchmark.
- RUB-64 / RW-073: macOS multi-app manual QA harness for recording, upload, and
  insertion timing.
- RUB-140 / RW-040D: live Groq provider smoke after dev key setup.
- RUB-150 / RW-041H: live authenticated transcription endpoint smoke after
  service setup.
- RUB-75 / RW-102: final end-to-end latency budget validation and mitigation
  tickets for any misses.

## Follow-Up Gap

The source currently persists provider latency in `transcription_requests.latency_ms`.
It does not persist a separate total backend request latency column covering
auth, profile/subscription/usage reads, rate-limit claim, parsing, provider,
cleanup, metadata insert, and usage counter update. Add a separate schema and
route timing change if RW-102 needs stored total backend latency distinct from
provider latency.
