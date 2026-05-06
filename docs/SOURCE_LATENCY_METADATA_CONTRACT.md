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
  failure, and cleanup failure. It separately measures source-side total backend
  route latency with an injectable millisecond clock and persists it as
  `totalBackendLatencyMs` metadata when finite and nonnegative.
- `apps/web/src/lib/usage/supabase-transcription-requests.ts` inserts
  `transcription_requests.latency_ms` as finite provider latency metadata and
  `transcription_requests.total_backend_latency_ms` as finite backend route
  latency metadata. It omits invalid values for both fields.

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

## Stored Latency Fields

`transcription_requests.latency_ms` is provider latency metadata. On
transcription success it comes from the provider transcription result. On
provider failure and cleanup failure it comes from provider failure metadata.

`transcription_requests.total_backend_latency_ms` is backend route latency
metadata. The desktop transcription route starts the source-side clock at route
entry and records elapsed backend time when request metadata is written for
success, provider failure, or cleanup failure. On successful transcriptions, the
route then refreshes this metadata after the usage counter write so the stored
total can include parsing, entitlement/quota checks, provider work, cleanup,
the metadata insert, and the usage counter update while preserving the existing
quota write order. Synthetic tests inject this clock so RW-102 can validate
finite and non-finite handling without live Groq, live Supabase, production
logs, or real user data.

## Remaining Live And Manual Timing Work

Full RW-102 completion remains blocked by work outside this source audit:

- RUB-26 / RW-015: live Groq latency and cost benchmark.
- Live authenticated endpoint timing against the deployed backend after service
  setup.
- RUB-64 / RW-073: macOS multi-app manual QA harness for recording, upload, and
  insertion timing.
- RUB-140 / RW-040D: live Groq provider smoke after dev key setup.
- RUB-150 / RW-041H: live authenticated transcription endpoint smoke after
  service setup.
- RUB-75 / RW-102: final latency budget acceptance and mitigation tickets for
  any misses.
