# ADR-006: Groq v0.1 Provider Default

Status: Proposed by RUB-26 benchmark on 2026-05-10; provider facts rechecked on 2026-05-20

Date: 2026-05-10

Related issues: RUB-26 / RW-015, RUB-43 / RW-040, RUB-75 / RW-102, RUB-140 / RW-040D

## Decision

Use Groq as RubyWhisper's v0.1 default transcription provider, with `whisper-large-v3-turbo` as the default transcription model.

This remains a proposed ADR until Brandon explicitly accepts it for launch. It does not approve production Groq credentials, provider-limit changes, live billing behavior, or public-beta launch.

## Context

RubyWhisper targets short whispers under 1 second after recording ends, with 1-2 seconds acceptable in beta. Paid plans include provider costs and may advertise unlimited personal dictation only under fair-use limits.

RUB-26 ran a safe dev-key benchmark with temporary synthetic speech only. No real user content, private env values, raw provider payloads, audio files, transcripts, cleaned text, prompts, or customer data were printed or committed.

Provider facts checked on 2026-05-10 and rechecked against official Groq
pricing/docs on 2026-05-20:

- Groq lists `Whisper Large v3 Turbo` at `$0.04/hour` of transcribed audio.
- Groq lists a 10-second minimum billed length for speech-to-text requests.
- Groq lists `wav` as a supported upload type and recommends 16 kHz mono preprocessing for lower latency.
- Groq currently shows different public speed-factor figures across official pages: the pricing page lists 228x, while the speech-to-text and model docs list 216x. This ADR relies on the pricing and minimum-billing facts, not the exact speed-factor marketing number.

Sources:

- `RESEARCH_LOG.md#rw-015-groq-latency-and-cost-benchmark`
- https://groq.com/pricing
- https://console.groq.com/docs/speech-to-text
- https://console.groq.com/docs/model/whisper-large-v3-turbo

## Benchmark Evidence

Single-run provider-only timings from the RUB-26 benchmark:

| Bucket | Synthetic audio duration | Estimated billed duration | Provider latency | Status |
| --- | ---: | ---: | ---: | --- |
| Short | 4.91s | 10.00s | 228ms | ok |
| Medium | 20.23s | 20.23s | 636ms | ok |
| Longer | 61.10s | 61.10s | 1,935ms | ok |

The short and medium provider-only timings are below the short-whisper processing target before app upload, backend, cleanup, and insertion overhead. The longer timing is acceptable for beta expectations where longer whispers are not held to the sub-second budget.

## Cost Notes

At `$0.04/hour` and 10-second minimum billing, normal personal dictation looks viable inside a `$7/month` plan:

- 1,000 personal whispers/month at 15 seconds average billed audio: about `$0.17/month`.
- 10,000 personal whispers/month at 30 seconds average billed audio: about `$3.33/month`.

Abuse can break unit economics:

- 100,000 sub-10-second requests/month: about `$11.11/month`.
- Continuous 24-hour/day automation for 30 days: about `$28.80/month`.

## Required Constraints

- Desktop app continues to call only RubyWhisper backend services, never Groq directly.
- Provider keys remain server-side.
- Server logs and metadata must omit audio, raw transcripts, cleaned transcripts, prompts, context, clipboard text, dictionary terms, provider request bodies, and provider response bodies.
- Enforce the 10-minute single-whisper cap.
- Add per-account request and audio-duration limits before marketing unlimited personal dictation.
- Keep fair-use terms that exclude meeting transcription, batch transcription, resale, automation abuse, account sharing abuse, and non-personal high-volume use.
- Keep a fast disable or cutoff path for provider-cost abuse.

## Cleanup Notes

Groq remains viable as the provider family for cleanup, but this ADR does not choose a cleanup model or prompt.

Cleanup should remain a separate backend operation behind the provider abstraction. It can use a Groq chat-completion model only after a cleanup-specific benchmark validates latency, quality, and token cost. Cleanup must stay conservative, respect user toggles, and omit context or dictionary terms whenever disabled.

## Consequences

- Groq remains the v0.1 transcription default.
- Provider abstraction stays in place so RubyWhisper can add fallback providers or swap cleanup models later.
- Launch planning must include rate limits, fair-use enforcement, metadata-only usage tracking, and a pre-launch pricing recheck.
