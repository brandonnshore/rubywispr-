# ADR-001: FreeFlow Import Decision

Status: Proposed; pending Brandon acceptance

Date: 2026-05-05

Related issues: RUB-28 / RW-013, RUB-226 / RW-013A, RUB-220 through RUB-225 / RW-060A through RW-060F

## Decision

Recommend using `zachlatta/freeflow` as the first RubyWhisper macOS harness, but only as a constrained import path. This is not an accepted decision until Brandon explicitly accepts it through the RUB-28 / RW-013 human gate.

The selected path is:

- Import FreeFlow as the first harness because the audits found no blocking build, license, hotkey, permissions, or project-structure issue.
- Do not import FreeFlow unchanged.
- Require backend proxying before provider-backed transcription is considered RubyWhisper-compliant.
- Require storage and privacy reduction before beta release.
- Require insertion preflight, insertion failure state, and copy recovery.
- Require RubyWhisper island states beyond FreeFlow's current recording and processing overlay.
- Require FreeFlow MIT attribution and rebrand constraints before any external distribution.

## Context

`FORK_STRATEGY.md` recommends FreeFlow as the first candidate base unless audit work finds a blocking issue. The audit prerequisites are complete:

- RW-010 / RUB-23: build reliability audit in `RESEARCH_LOG.md#rw-010-freeflow-build-reliability-audit`.
- RW-011 / RUB-24: hotkey, insertion, island, provider, privacy, and storage audit in `docs/FREEFLOW_AUDIT_RUB_24.md`.
- RW-012 / RUB-25: license, attribution, and rebrand audit in `RESEARCH_LOG.md#rw-012-freeflow-license-attribution-and-rebrand-audit`.

The product and infrastructure constraints are stricter than upstream FreeFlow:

- The desktop app must talk to RubyWhisper backend services, not directly to Groq or another provider (`TECHNICAL_INFRASTRUCTURE.md#Summary`, `TECHNICAL_SPEC.md#functional-requirements`).
- The server must not persist audio, raw transcripts, cleaned transcripts, clipboard contents, surrounding app text, or local Recent Wisprs (`DECISION_LOG.md#privacy-boundaries-for-all-adrs`).
- Local Recent Wisprs are local-only, default to 7-day retention, and should keep only the final cleaned text unless a later accepted decision changes that posture (`TECHNICAL_SPEC.md#functional-requirements`).

## Audit Evidence

### Build Reliability

RW-010 found FreeFlow buildable enough to remain the preferred macOS base. The upstream repo has no Xcode project, workspace, package, or schemes, so `xcodebuild` is not the current entrypoint. A local developer build succeeded with `make CODESIGN_IDENTITY=-`; the default `make` path failed only because the expected local `FreeFlow Dev` signing identity was not installed.

Consequence: RW-060 import work must either preserve and document a Makefile-based build contract or add a RubyWhisper Xcode/SwiftPM build entrypoint. Release packaging still needs separate Apple signing, notarization, artifact checksum, update-channel, and clean-Mac QA gates.

Sources: `RESEARCH_LOG.md#rw-010-freeflow-build-reliability-audit`, `docs/MAC_BETA_RELEASE_RUNBOOK.md#remaining-blockers`.

### Hotkey, Insertion, Island, Provider, Privacy, And Storage

RW-011 / RUB-24 found useful harness behavior:

- `Fn` hold and `Command+Fn` toggle are implemented through serious shortcut/session handling.
- The overlay is a non-activating panel and does not display transcript content.
- Permissions checks exist for Accessibility, Screen Recording, microphone, and speech recognition.
- Cleanup and transcription service boundaries are separable enough to refactor.

The same audit found blocking product mismatches if imported unchanged:

- Desktop code sends audio, transcripts, cleanup prompts, context, selected text, and screenshots directly to a configured provider.
- Provider API keys live in local Application Support settings.
- The run log persists raw transcript, cleaned transcript, prompts, context, screenshots, selected text, custom vocabulary, app metadata, and copied audio locally.
- Insertion is clipboard plus `Cmd+V` without focused-field preflight, direct AX insertion, positive success detection, or an insertion-failed island state.
- The overlay lacks required RubyWhisper states such as insertion-failed and trial-exhausted and is not yet draggable.

Consequence: the import can use FreeFlow's shortcuts, recording, service boundaries, and overlay as a harness, but RubyWhisper must replace direct provider calls with backend APIs, remove desktop provider-key settings, reduce local persistence, add insertion recovery states, and keep transcript content out of the island.

Source: `docs/FREEFLOW_AUDIT_RUB_24.md`.

### License, Attribution, Rebrand, And Release Surfaces

RW-012 found no license blocker. FreeFlow is MIT licensed. RubyWhisper must preserve the upstream copyright and MIT permission notice in source copies and distributed artifacts containing substantial FreeFlow code or assets.

Rebrand scope is medium and should be treated as part of RW-060, not a post-release cleanup. Search evidence found FreeFlow identity in build metadata, bundle IDs, entitlements filename, release workflows, app type names, OSLog subsystems, keychain service fallback, updater URLs, settings/setup GitHub cards, app icons, demo media, website assets, README, CHANGELOG, and generated export names.

Consequence: RubyWhisper must keep attribution, avoid implying upstream maintainer endorsement, exclude or quarantine upstream website/release surfaces, replace FreeFlow icons/media, and avoid carrying over `zachlatta/freeflow` update channels or `FreeFlow.dmg` release naming.

Sources: `RESEARCH_LOG.md#rw-012-freeflow-license-attribution-and-rebrand-audit`, `docs/MAC_BETA_RELEASE_RUNBOOK.md#2-confirm-version-and-attribution`.

## Alternatives Considered

### Import FreeFlow Unchanged

Rejected. It conflicts with RubyWhisper's backend-proxy, provider-secret, local-storage, insertion-recovery, island-state, and privacy requirements.

### Use FreeFlow As The First Harness With Required Refactors

Selected recommendation, pending Brandon acceptance. This path preserves the useful macOS harness while forcing the architecture and privacy changes before beta release.

### Build RubyWhisper From Scratch

Deferred. It would avoid rebrand and upstream privacy mismatches, but it loses FreeFlow's working Swift/macOS shortcut, recording, cleanup, and overlay harness. No audit evidence shows that the extra schedule cost is justified for v0.1.

### Choose A Fallback Candidate Instead

Deferred. `FORK_STRATEGY.md` names Dictate Anywhere, Handy, Steno, CustomWispr, and Murmur as fallback candidates. The completed audits did not find a FreeFlow blocker that requires switching. These remain fallback references if Brandon rejects this recommendation or if RW-060 import work uncovers a blocking issue.

## Consequences And Required Constraints

Backend proxying:

- Desktop provider clients and provider-key settings must be replaced with RubyWhisper backend clients.
- Backend routes must verify session, entitlement, quota, and request limits before provider work.
- Provider keys remain server-side.
- Backend logging and metadata must omit audio, transcripts, cleaned text, context, clipboard contents, prompts, provider request bodies, and provider response bodies.

Privacy and storage:

- Do not carry over FreeFlow's broad pipeline history as a default RubyWhisper feature.
- Local Recent Wisprs should keep final cleaned text only, local-only, with default 7-day retention unless a later human-approved decision changes that posture.
- Raw transcripts, prompts, screenshots, context, and audio must be transient or debug-only, opt-in, redacted where possible, and never exported without explicit user action.

Insertion recovery:

- Add focused text-target preflight where feasible.
- Avoid claiming paste success when success is unknown.
- Add an explicit `insertion_failed` state and island UI.
- Preserve cleaned text locally and provide one-click copy recovery.

Island behavior:

- Keep the non-focus-stealing overlay approach.
- Add RubyWhisper-required states for recording, processing, success, error, insertion-failed, and trial-exhausted.
- Add draggable positioning and reduced-motion behavior.
- Do not display transcript content in the island.

Rebrand and attribution:

- Preserve FreeFlow MIT notices in source and distributed app artifacts.
- Add or preserve third-party notices before external beta packaging.
- Rebrand app metadata, bundle IDs, app support paths, keychain service names, OSLog subsystems, updater URLs, icons, demo media, website references, support links, and release artifact names.
- Do not ship FreeFlow public release workflows, update URLs, website assets, or `FreeFlow.dmg` naming as RubyWhisper release surfaces.

Release packaging:

- Local audit evidence does not replace release signing/notarization QA.
- Public beta packaging remains gated by Apple Developer credentials, notarization, update-channel approval, third-party notices, artifact checksum, and clean-Mac install/open QA.

## Downstream Unblock Condition

RUB-220 through RUB-225 remain prepared import/rebrand leaves, not active import approval. They should be unblocked only after Brandon explicitly accepts the FreeFlow import recommendation through RUB-28 / RW-013 or an equivalent repo decision-log update that changes this ADR from `Proposed; pending Brandon acceptance` to an accepted state.

Prepared sequence after acceptance:

1. RUB-220 / RW-060A: Import selected macOS source into `apps/macos`.
2. RUB-221 / RW-060B: Establish RubyWhisper macOS build command contract.
3. RUB-222 / RW-060C: Rebrand macOS app metadata and user-visible identity.
4. RUB-223 / RW-060D: Rebrand macOS source namespaces and updater placeholders.
5. RUB-224 / RW-060E: Preserve FreeFlow attribution and exclude upstream release surfaces.
6. RUB-225 / RW-060F: Record macOS import completion gate and downstream blockers.

Until that human acceptance exists, agents must not import macOS source, move RUB-28 or RUB-220 through RUB-225 to Done, or claim the FreeFlow decision has been accepted.
