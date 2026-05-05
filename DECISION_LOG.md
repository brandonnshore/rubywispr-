# RubyWhisper Decision Log

Status: Lightweight ADR index

This log tracks architecture decision records that future implementation work should preserve or resolve. Entries are candidates only until a follow-up ADR or explicit approved issue changes the status.

## ADR Candidates

| ADR | Status | Decision area | Current direction | Source |
| --- | --- | --- | --- | --- |
| ADR-001 | Pending Brandon acceptance | FreeFlow base | Use FreeFlow as the first macOS harness only with backend-proxy, storage/privacy reduction, insertion recovery, island-state, and attribution/rebrand constraints. | `docs/adr/ADR-001-freeflow-import-decision.md`, `docs/FREEFLOW_AUDIT_RUB_24.md`, `RESEARCH_LOG.md#FreeFlow Audit Follow-Up` |
| ADR-002 | Proposed | Backend provider proxying | Desktop app talks only to the RubyWhisper backend, never directly to Groq. | `TECHNICAL_SPEC.md#ADR Candidates`, `TECHNICAL_INFRASTRUCTURE.md#Summary` |
| ADR-003 | Proposed | Authentication | Use Clerk for auth, starting with email magic-link login. | `TECHNICAL_SPEC.md#ADR Candidates`, `TECHNICAL_INFRASTRUCTURE.md#Services And Dependencies` |
| ADR-004 | Proposed | Product database | Use Supabase for product metadata only. | `TECHNICAL_SPEC.md#ADR Candidates`, `TECHNICAL_INFRASTRUCTURE.md#Services And Dependencies` |
| ADR-005 | Proposed | Billing | Use Stripe as the billing source of truth. | `TECHNICAL_SPEC.md#ADR Candidates`, `TECHNICAL_INFRASTRUCTURE.md#Third-Party Provider Contracts` |
| ADR-006 | Proposed | Transcription and cleanup | Use Groq for transcription and cleanup, with provider abstraction kept flexible. | `TECHNICAL_SPEC.md#ADR Candidates`, `FORK_STRATEGY.md#Provider Recommendation` |
| ADR-007 | Proposed | Auto-update | Use Sparkle for direct-download auto-update after FreeFlow import fit is confirmed. | `TECHNICAL_SPEC.md#ADR Candidates`, `TECHNICAL_INFRASTRUCTURE.md#Services And Dependencies` |
| ADR-008 | Proposed | Crash reporting | Use Sentry or an equivalent privacy-safe crash reporting tool. | `TECHNICAL_SPEC.md#ADR Candidates`, `TECHNICAL_INFRASTRUCTURE.md#Services And Dependencies` |

## Privacy Boundaries For All ADRs

- The server stores product metadata only.
- The server must not persist audio, raw transcripts, cleaned transcripts, clipboard contents, surrounding app text, or local Recent Wisprs.
- Desktop builds must not contain Groq, Stripe, Supabase service-role, Clerk secret, or equivalent provider keys.
- Supabase storage must not be used for audio or transcripts.
- Crash reporting must be privacy-safe and must not include screenshots, transcripts, clipboard text, or surrounding app content.

## Human Approval Gates

Ask for explicit human approval before resolving an ADR in a way that changes any of these boundaries:

- Permanently importing FreeFlow after audit.
- Choosing a fallback base.
- Enabling live Stripe mode.
- Using production Groq, Clerk, Supabase, or other production secrets.
- Launching a production domain or public beta.
- Releasing Apple signing/notarization artifacts.
- Changing privacy posture.
- Adding server-side text/audio storage.
- Adding meeting transcription.
