# RW-102 Performance Timing Handoff

Status: source-safe handoff only. RW-102 remains blocked until Brandon attaches
or explicitly accepts live/provider/Mac timing evidence.

This document separates completed source latency evidence from the remaining
human-run timing gates for RUB-75 / RW-102. It does not execute live Groq,
authenticated deployed endpoint, Mac recording, upload, insertion, recovery, or
paid-beta budget acceptance checks.

## Source-Safe Evidence Already Completed

| Area | Evidence | Issue / PR | Commands or checks | RW-102 meaning |
| --- | --- | --- | --- | --- |
| Source latency metadata contract | `docs/SOURCE_LATENCY_METADATA_CONTRACT.md` defines metadata-only backend latency handling and remaining live/manual gates. | RUB-218, PR #107, merge `65e90d7` | Contract audit plus regression coverage named in the contract. | Source proves allowed metadata shape, not live performance. |
| Provider latency metadata | `apps/web/src/lib/providers/groq.ts` measures provider call latency and returns `providerLatencyMs` metadata on success/failure paths. | RUB-218, PR #107 | `apps/web/test/groq-provider-client.test.mjs`; `apps/web/test/provider-client-contract.test.mjs` | Source proves provider latency can be captured in mocked/source paths. |
| Cleanup latency forwarding | `apps/web/src/lib/cleanup/conservative-cleanup.ts` forwards provider cleanup latency metadata while keeping cleanup content transient. | RUB-218, PR #107 | `apps/web/test/conservative-cleanup.test.mjs` | Source proves cleanup failures can carry metadata-only latency. |
| Desktop transcription route metadata | `apps/web/src/app/api/desktop/transcribe/route.ts` persists provider latency and separately measures total backend route latency with an injectable clock. | RUB-315, PR #186, merge `67040ee` | `npm run test --workspace @rubywhisper/web -- test/desktop-transcribe-route.test.mjs` | Source proves route-level total backend timing can be persisted without live services. |
| Supabase request metadata shape | `apps/web/src/lib/usage/supabase-transcription-requests.ts` writes finite `latency_ms` and `total_backend_latency_ms` values and omits invalid latency values. | RUB-315, PR #186, merge `67040ee` | `npm run test --workspace @rubywhisper/web -- test/supabase-transcription-requests.test.mjs test/supabase-migration-privacy.test.mjs`; `npm run test:schema-privacy --workspace @rubywhisper/web` | Source proves metadata-only rows can distinguish provider latency from total backend route latency. |
| Privacy and command validation | RUB-315 completion evidence reports `git diff --check origin/main...HEAD`, focused route/Supabase/migration privacy tests, schema/privacy tests, auth/privacy tests, typecheck, lint, full web tests, and changed-line privacy scanning. | RUB-315, PR #186 | See RUB-315 workpad and completion comment. | Source evidence is complete for backend metadata behavior, but does not accept the live budget. |

## Remaining Timing Gates

| Gate | Category | Owner | Current status | Required before RW-102 can close |
| --- | --- | --- | --- | --- |
| Live Groq latency and cost benchmark | Brandon/manual/live-only | RUB-26 / RW-015 | Backlog | Approved non-production provider setup and sanitized timing rows. |
| Live Groq provider smoke after dev key setup | Brandon/manual/live-only | RUB-140 / RW-040D | Backlog | Provider route exercised with approved credentials and metadata-only evidence. |
| Authenticated desktop transcription endpoint timing | Brandon/manual/live-only | RUB-150 / RW-041H | Backlog | Deployed or approved non-production `/api/desktop/transcribe` timing with an authenticated test account. |
| Mac recording end to upload start timing | Brandon/manual/live-only | Mac manual QA / RUB-64 harness rows | Blocked by human-controlled Mac/build/service setup | Sanitized Mac timing evidence after recorder stop/seal. |
| Mac upload, response, insertion, and recovery timing | Brandon/manual/live-only | `docs/qa/macos-manual-qa-harness.md` rows MAC-063, MAC-065 through MAC-070, MAC-080 through MAC-087 | Not Run / Blocked | Sanitized rows for successful insertion and fallback/recovery paths across approved target categories. |
| Backend metadata row presence after live/manual runs | Source-safe review of Brandon/live-only evidence | RUB-75 / RW-102 | Blocked | Confirmation that only safe metadata fields exist for the relevant request rows. |
| Final beta latency-budget acceptance | Brandon/manual/live-only | RUB-75 / RW-102, blocks RUB-80 / RW-107 | Backlog / blocked | Brandon accepts attached evidence or records blockers/mitigation tickets for misses. |

Source-only checks may verify that code/docs/tests still support these gates,
but they must leave live/manual rows as `Blocked` or `Not Run` until a human run
is completed.

## Safe Evidence Fields

Evidence for RW-102 must use only these fields:

- provider category, such as `groq_dev`, `groq_staging`, `mock`, or
  `provider_unavailable`
- route category, such as `/api/desktop/transcribe`, backend provider call,
  Mac upload, insertion, or fallback/recovery path
- status or error category, such as `success`, `provider_error`,
  `rate_limited`, `duration_limit_reached`, `service_unavailable`,
  `insertion_success`, or `fallback_copy`
- app version, build, channel, commit, or artifact identifier
- OS category, such as macOS major/minor, architecture, and test machine class
- duration bucket, provider latency bucket, backend route latency bucket, Mac
  local elapsed bucket, or numeric millisecond metadata when already approved
- metadata row presence for `transcription_requests.latency_ms` and
  `transcription_requests.total_backend_latency_ms`
- pass, fail, blocked, not-run, or accepted status

Evidence must not include audio, raw transcript, cleaned text, prompts, cleanup
context, dictionary terms, clipboard content, provider request or response
bodies, request bodies, auth values, private environment values, private URLs,
raw logs, screenshots of private content, customer data, billing/card details,
or production-only identifiers.

## Timing Buckets

Use the same bucket names across backend, provider, and Mac evidence so the
final RW-102 review can compare rows without raw artifacts.

| Bucket | Milliseconds | Short-whisper meaning |
| --- | ---: | --- |
| `not_run` | none | Evidence has not been collected. |
| `blocked` | none | A required human, build, account, credential, Mac permission, or service setup is missing. |
| `fast` | `0-499` | Within target margin. |
| `target` | `500-999` | Meets the under-1-second short-whisper target. |
| `beta_tolerance` | `1000-2000` | Acceptable only under the beta upper tolerance. |
| `miss` | `>2000` | Budget miss; requires follow-up or explicit acceptance. |

For medium, long, or near-cap whispers, record the same bucket plus the duration
bucket. Only short whispers under 30 seconds decide the sub-second RW-102 target.

Duration buckets:

| Bucket | Duration |
| --- | --- |
| `short` | `<30s` |
| `medium` | `30s-2m` |
| `long` | `2m-9m30s` |
| `near_cap` | `9m30s-10m` |
| `over_cap` | `>10m` or backend duration rejection |

## Expected Evidence Rows

Use this table shape in RUB-75 or the live/manual child issue. Leave unknown
values blank or `Blocked`; do not substitute source-test values for live/manual
timing.

| Gate | Provider category | Route category | Status/error category | App/build | OS category | Duration bucket | Provider latency bucket | Backend route latency bucket | Mac local elapsed bucket | Metadata row present | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Live Groq benchmark |  | backend provider call |  |  |  |  |  | N/A | N/A | N/A | `Blocked` |
| Authenticated endpoint timing |  | `/api/desktop/transcribe` |  |  |  |  |  |  | N/A |  | `Blocked` |
| Mac upload and insertion timing |  | Mac upload to insertion |  |  |  |  |  |  |  |  | `Blocked` |
| Mac fallback/recovery timing |  | fallback/recovery |  |  |  |  |  |  |  |  | `Blocked` |
| Final budget acceptance |  | RW-102 review |  |  |  | `short` |  |  |  |  | `Blocked` |

## Follow-Up Rules For Budget Misses

- Any `miss` bucket on a short-whisper live/provider/backend/Mac row keeps
  RW-102 blocked unless Brandon explicitly accepts it for beta.
- A provider-only miss should create or reference a provider benchmark or
  fallback-research mitigation ticket before launch readiness is claimed.
- A backend route miss with acceptable provider latency should create or
  reference a backend optimization ticket covering route overhead, hosting
  region, request parsing, cleanup, metadata writes, or response handling.
- A Mac local elapsed miss with acceptable backend/provider latency should
  create or reference a Mac upload, UI responsiveness, insertion, or fallback
  timing mitigation ticket.
- A `beta_tolerance` short-whisper row may be accepted for beta only with
  Brandon approval and a written reason in RUB-75.
- Any evidence packet containing forbidden content must be rejected and replaced
  with a sanitized metadata-only summary before it can support RUB-75 or RUB-80.

## Completion Statement

RUB-315 completed the source-side provider latency versus total backend route
latency metadata evidence. RW-102 is still blocked by live Groq timing,
authenticated endpoint timing, Mac recording/upload/insertion/recovery timing,
and final latency-budget acceptance. Do not mark RUB-75 / RW-102, RUB-80 /
RW-107, paid beta launch, live provider validation, or Mac manual QA complete
from this handoff alone.
