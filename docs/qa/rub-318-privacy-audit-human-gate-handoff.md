# RUB-318 Privacy Audit Human-Gate Handoff

Date: 2026-05-06
Scope: source-safe handoff for RUB-73 / RW-100 privacy storage and log audit.

This document separates completed source evidence from remaining Brandon-owned,
manual, and live-only privacy inspection gates. It intentionally does not
inspect or include live Supabase rows, production or staging logs, provider
dashboards, private local app data, private environment files, customer data,
audio, transcripts, clipboard contents, screenshots with private text, provider
payloads, or raw log snippets.

RW-100 remains blocked until the remaining live/manual evidence is attached to
the relevant Linear issues or explicitly accepted by Brandon. This handoff is
not legal approval, launch acceptance, production approval, or paid beta
acceptance.

## Source References

- RUB-73 / RW-100: parent privacy storage and log audit.
- RUB-216 / RW-100A: web/backend source privacy audit; PR #105; merge commit
  `9dfd457981370082620bedcd7a3ca10446608e78`.
- RUB-306 / RW-100B: Mac local storage source privacy audit; PR #177; merge
  commit `677bcdf3b465c822c8dc1c8caae69a54da06046f`.
- RUB-307 / RW-100C: Mac provider-secret settings removal; PR #178; merge
  commit `4c5cf0342737de1243baa47feddff083cc09a4dc`.
- RUB-308 / RW-100D: Mac pipeline history hardening; PR #180; merge commit
  `d1411c1cc1de6bcdddcf4dd422decf7e171414bb`.
- RUB-309 / RW-100E: Mac local log redaction; PR #179; merge commit
  `d4c1d1d61157c71a60166f1072c9600c824aa6a7`.
- `docs/qa/rub-306-mac-local-storage-source-privacy-audit.md`.
- `docs/RW_070_RECENT_WISPRS_CONTRACT.md`.
- `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`.
- `docs/MAC_BETA_RELEASE_RUNBOOK.md`.
- `docs/qa/macos-manual-qa-harness.md`.
- `TECHNICAL_SPEC.md`.
- `TECHNICAL_INFRASTRUCTURE.md`.

## Completed Source Evidence

| Area | Source-safe status | Evidence | What can be trusted from source | What source evidence does not prove |
| --- | --- | --- | --- | --- |
| Web/backend storage and logging | Complete for source paths | RUB-216, PR #105, `TECHNICAL_SPEC.md`, `TECHNICAL_INFRASTRUCTURE.md` | Source audit covered transcription, cleanup, provider, usage/rate limits, billing, admin/support/legal, observability, and Supabase migrations. Tests and scans reported no web/backend source path that stores or logs audio, raw transcripts, cleaned text, context, clipboard contents, dictionary terms, provider payloads, or private support content. | Does not prove live Supabase rows, hosted logs, provider dashboard events, or production/staging crash sink captures are clean after real requests. |
| Backend metadata model | Complete for source contract | RUB-216, `TECHNICAL_INFRASTRUCTURE.md`, `docs/RW_070_RECENT_WISPRS_CONTRACT.md` | Server storage is product/request metadata only: account, plan, request, status, provider, duration, word count, latency, app/OS version, and safe error metadata. Recent Wisprs and dictionary content remain outside Supabase/backend storage for v0.1. | Does not prove an actual staging or production database contains only expected rows after live sample flows. |
| Backend privacy logging guardrails | Complete for source paths | RUB-216, RUB-41/RW-030, RUB-121, RUB-122, PRs #29-#32 and #105, `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md` | Checked-in logging and error-reporting adapters are metadata-only by contract. Source tests cover sanitizer primitives, request lifecycle builders, no-body logging policy, and privacy logging guardrail scans. | Does not prove a configured log/crash provider is scrubbed or that captured events omit request bodies, screenshots, replay, audio, transcripts, clipboard contents, provider payloads, auth material, and private environment values. |
| Mac local storage source map | Complete for source audit | RUB-306, PR #177, `docs/qa/rub-306-mac-local-storage-source-privacy-audit.md` | Source evidence maps Recent Wisprs, dictionary, transient audio, preferences, Keychain/session, clipboard fallback, diagnostics/export, pipeline history, and local logs to allowed and forbidden content classes. | Does not prove real user Application Support, caches, temp directories, Keychain items, local stores, or Console logs are clean. |
| Recent Wisprs source contract | Source contract and source audit complete; manual retention checks remain | RUB-306, RUB-61/RW-070, RUB-284/RW-070F, `docs/RW_070_RECENT_WISPRS_CONTRACT.md` | Contract allows local final text plus metadata only, 7-day default expiry, clear/disable controls, no backend sync, and metadata-only evidence. Source audit found current local store behavior aligned with the contract. | Does not replace human/manual validation of real retention cleanup, clear/disable behavior, insertion-failure recovery, or local store contents on an approved Mac build. |
| Provider-secret settings boundary | Complete for source remediation | RUB-307, PR #178, `docs/qa/rub-306-mac-local-storage-source-privacy-audit.md` | Mac source no longer persists provider/API secret values in Application Support settings, no longer presents provider-key setup/settings UI for paid beta desktop transcription, and keeps desktop transcription backend-only by source contract. | Does not clean or inspect pre-existing local user files. Any live/manual cleanup or inspection of existing local settings remains human-run only. |
| Pipeline history and exports | Complete for source remediation | RUB-308, PR #180, `docs/qa/rub-306-mac-local-storage-source-privacy-audit.md` | Pipeline history write, load, UI, sanitizer, and export paths are metadata-only by construction from source evidence. Legacy content-bearing columns are forced to metadata-only values or ignored by hardened paths. | Does not inspect real existing local SQLite stores or prove old local stores have already been cleaned on user machines. |
| Mac local log redaction | Complete for source remediation | RUB-309, PR #179, `docs/qa/rub-306-mac-local-storage-source-privacy-audit.md` | Source logs now avoid public user-authored strings, device names/UIDs, selected/focused text, clipboard content, transcripts, prompts, dictionary terms, provider payloads, auth material, private environment values, and local store paths in the reviewed high-risk surfaces. | Does not prove live Console output, crash reports, or third-party captured events are clean after manual app use. |
| Direct insertion privacy source checks | Partial source evidence; manual QA remains | RUB-294 done; RUB-295 and RUB-296 remain Backlog under RUB-73 | Source-level direct insertion privacy/regression tests are done where referenced by RUB-73. | Multi-app insertion manual QA and final completion evidence remain blocked/manual. |

## Remaining Live And Manual Gates

| Gate | Owner | Status for RW-100 | Evidence expectation | Forbidden evidence |
| --- | --- | --- | --- | --- |
| Live Supabase rows after approved sample flows | Brandon/manual/live-only | Blocked/not run | Table names, row counts, request IDs if opaque and support-safe, allowed metadata categories present, forbidden content categories absent. Include environment category only, not private project values. | Raw rows, URLs with private identifiers, service-role output, transcript/audio/context/clipboard/dictionary/prompt/provider payload content, screenshots with private values. |
| Hosted backend logs after approved sample flows | Brandon/manual/live-only | Blocked/not run | Route names, request IDs if support-safe, status/error codes, duration/latency buckets, provider category, app/OS version category, and a reviewer statement that body/content fields were absent. | Raw log lines, request or response bodies, auth headers, cookies, magic links, token values, audio, transcript, clipboard, provider payloads, stack traces containing private content. |
| Crash/log provider captured-event review | Brandon/manual/live-only; related to RUB-123 | Blocked/not run | Provider name/category, event type, enabled/disabled capture features, metadata field categories reviewed, and confirmation that request bodies, screenshots, session replay, attachments, audio, transcripts, clipboard contents, provider payloads, auth material, and private env values are disabled or absent. | Provider dashboard screenshots with private data, event JSON payloads, attachments, crash dumps containing sensitive data, DSNs, auth tokens, or raw stack traces with private content. |
| Mac manual QA matrix | Brandon/manual; `docs/qa/macos-manual-qa-harness.md` | Blocked/not run | Row IDs, status values, app version/build/channel, macOS major/minor, architecture, state/error codes, target app category, cleanup booleans, local store counts, retention timestamps, and sanitized reviewer notes. | Real dictated text, transcripts, clipboard contents, focused/selected text, private app screenshots, audio, auth material, provider payloads, private file paths, or raw logs. |
| Recent Wisprs retention and recovery manual checks | Brandon/manual | Blocked/not run | MAC-100 through MAC-104 style evidence: counts, insertion status, created/expires timestamps, cleanup count, clear/disable setting category, and backend-call category. | Recent Wispr content, raw or cleaned text, screenshots of real history entries, clipboard contents, local file dumps, or backend payloads. |
| Personal dictionary manual checks | Brandon/manual | Blocked/not run | MAC-105 and MAC-106 style evidence: count changes, validation outcome categories, dictionary enabled/disabled state, cleanup enabled/disabled state, and payload-shape category from redacted instrumentation. | Dictionary terms, cleanup request bodies, prompts, transcripts, context, provider payloads, or screenshots showing terms. |
| Direct insertion and fallback manual evidence | Brandon/manual; RUB-295/RUB-296 remain Backlog | Blocked/not run | Target app category, insertion status, fallback state, recovery action, retry/no-retry category, backend-call category, and local history count where relevant. | Destination app content, document/window titles with private text, selected/focused text, clipboard contents, screenshots with private apps, or dictated text. |
| Existing local store cleanup or migration proof | Brandon/manual/live-only | Blocked/not run | Store category, app version/build, cleanup/migration boolean, item counts before/after if approved, and confirmation that no forbidden content remains outside approved local stores. | Real Application Support paths containing user names, local database dumps, Keychain values, provider keys, transcript/audio/context/clipboard/dictionary content, or raw local log output. |
| Legal Privacy policy approval | Brandon/legal/manual | Blocked/not run | Approval reference, reviewer role/category, policy version/date, and explicit note that approval is legal/product acceptance, not source evidence. | Legal advice authored by the agent, private reviewer notes, customer data, or policy screenshots containing private annotations. |
| Final launch acceptance | Brandon/manual/live-only; RUB-80/RW-107 | Blocked/not run | Links to source evidence, live/manual evidence packets, accepted blockers or follow-up issues, exact release commit/artifact category, and launch owner acceptance. | Claims that RW-100, RW-107, live provider validation, clean-Mac validation, legal approval, or paid beta launch acceptance is complete unless the corresponding evidence exists. |

## Evidence Packet Checklist

Use this checklist for each live/manual gate before attaching evidence to
Linear, a PR, release notes, or a launch checklist:

- Evidence names the gate, environment category, app/backend version or commit,
  date, reviewer role/category, and issue ID.
- Evidence uses metadata only: counts, categories, statuses, timestamps,
  request IDs only when opaque and support-safe, latency/duration buckets,
  version/build/channel, and pass/fail summaries.
- Evidence states which forbidden content classes were checked and absent.
- Evidence does not copy raw logs, raw rows, request/response bodies, provider
  payloads, screenshots with private text, private file paths, secret values,
  customer data, audio, transcripts, clipboard contents, dictionary terms,
  prompts, auth material, billing/card details, or local store dumps.
- Evidence leaves RW-100 blocked unless every required manual/live gate is
  attached or Brandon explicitly accepts the remaining risk in the launch gate.

## RW-100 Handoff Summary

Source-side evidence is strong enough to trust the checked-in web/backend and Mac
source contracts listed above. It is not enough to close RUB-73/RW-100. The
remaining work is live/manual inspection: hosted database and log review,
crash/log provider captured-event review, approved Mac manual QA, Recent
Wisprs/manual retention checks, direct insertion evidence, legal approval, and
final launch acceptance.
