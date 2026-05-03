# RubyWhisper Linear Issue Draft

Status: Imported into Linear; keep this file as the creation/import policy reference
Generated: 2026-04-30
Project: RubyWhisper Paid Beta Launch
Recommended creation policy: first-wave Todo, all later work Backlog or blocked with labels

## Source Corpus Reviewed

- `AGENTS.md`: repo startup, secret handling, worktree rules.
- `PRODUCT_BRIEF.md`: original product principles, Mac dictation flow, island, Recent Wisprs, cleanup.
- `FORK_STRATEGY.md`: FreeFlow-first fork decision, fallback candidates, risks, import plan.
- `IMPLEMENTATION_PLAN.md`: milestones M0-M6, dependency waves, validation strategy, release plan.
- `TECHNICAL_INFRASTRUCTURE.md`: Next.js, Clerk, Supabase, Stripe, Groq, Sparkle, observability, privacy controls.
- `TECHNICAL_SPEC.md`: FR/NFR requirements, flows, state machines, API contracts, privacy/security/test plan.
- `WEB_DESIGN_SPEC.md`: website, app, island, settings, admin, design states, QA scripts.
- `RESEARCH_LOG.md`: FreeFlow, Wispr Flow, Superwhisper, Groq, Stripe, Clerk, Sparkle, Sentry references.
- `scripts/setup-chat-env.sh`, `scripts/new-worktree.sh`, `scripts/codex-settings-setup.sh`: setup/worktree/env behavior.

## Recommended Linear Project Setup

- Team: `RubyAdvisory` (`RUB`)
- Project name: `RubyWhisper Paid Beta Launch`
- Project slug ID for Symphony: `rubywhisper-paid-beta-launch-caaab48c6aa9`
- Current Linear project state: `planned`
- Project summary: `Ship RubyWhisper as a paid macOS dictation beta with website, auth, billing, backend transcription, local history, admin, signing, and updater.`
- Milestones:
  - `Wave 1 - Project Harness`
  - `Wave 2 - Discovery And Audit`
  - `Wave 3 - Web Foundation`
  - `Wave 4 - Transcription Gateway`
  - `Wave 5 - Mac App`
  - `Wave 6 - Website Admin Design`
  - `Wave 7 - Quality Release`
- Milestone creation order: create milestones in wave order from Wave 1 through Wave 7 before importing issues, then assign every issue to exactly one wave milestone.
- Current Linear statuses:
  - `Backlog`
  - `Todo`
  - `In Progress`
  - `In Review`
  - `Done`
  - `Canceled`
  - `Duplicate`
- Status concepts not present in the current workflow:
  - `Blocked`: use `Backlog` plus the `blocked` label for blocked future work.
  - `Rework`: only configure Symphony to poll `Rework` if that status is added later; until then, operator-driven fixes should move issues from `In Review` back to `Todo` or `In Progress` with a workpad note.
  - `Human Review`: use `In Review` for handoff in the current RubyWhisper workflow.
- Labels:
  - Areas: `macos`, `backend`, `frontend`, `infra`, `data`, `api`, `design`, `docs`, `qa`, `security`, `billing`, `admin`, `performance`
  - Types: `Feature`, `Improvement`, `Bug`, `spike`, `chore`, `test`, `release`
  - Agent: `execute-now`, `agent-ready`, `needs-breakdown`, `needs-human`, `blocked`, `symphony`
  - Validation: `unit`, `integration`, `e2e`, `manual-qa`, `build`, `visual`
  - Risk: `privacy`, `high-risk`, `external-dependency`, `migration`

## Queue Policy

- Symphony dispatch signal: issue is in `Todo` and has `execute-now`, `agent-ready`, and `symphony`.
- Active worker states: Symphony may continue tracking `Todo` and `In Progress`; include `Rework` only if that state is added to the team workflow.
- `Todo`: only unblocked current-wave tickets with one clear outcome, acceptance criteria, validation, and no unresolved human decision.
- `In Progress`: exactly the tickets currently owned by active workers.
- `In Review`: PR/artifact handoff for operator or human review; Symphony should not start new implementation work from this state.
- `Backlog`: future work, split-later candidates, and blocked work that is not ready for dispatch.
- `Blocked`: not a current Linear status; represent blocked work as `Backlog` plus `blocked`, and add `needs-human`, `external-dependency`, or `high-risk` when the blocker type is known.
- First-wave import policy: first-wave unblocked tickets start in `Todo`; first-wave blocked tickets start in `Backlog` with `blocked` and should not carry `execute-now`.
- Later-wave import policy: later work starts in `Backlog`; add `needs-breakdown` to broad implementation tickets until preceding decisions and repo source shape are known.
- Review policy: decisions involving production secrets, live billing, signing/notarization, privacy posture, or public launch stay in `In Review` for handoff or `Backlog` with `needs-human` until the decision is recorded.

## Issue Shape And Creation Order

- Prefer flat issues in one project over parent/sub-issue trees for the imported RW queue.
- Use project milestones for wave grouping and explicit issue relations for blockers instead of parent containers.
- Create in this order:
  1. Team labels.
  2. Project `RubyWhisper Paid Beta Launch`.
  3. Wave milestones from Wave 1 through Wave 7.
  4. Issues in ticket-index order, with milestone, status, labels, and dependency relations.
  5. First dispatch labels only after the operator confirms the wave is intentionally ready.
- Do not create additional implementation tickets outside the approved queue from this file; record follow-up discoveries as separate Backlog issues only after operator approval.

## Ticket Index

Status values in this index are queue concepts from the original draft. In the current Linear workflow, every `Blocked` entry maps to `Backlog` plus the `blocked` label.

| ID | Title | Milestone | Status |
| --- | --- | --- | --- |
| RW-001 | Establish repo command contract and scaffold decision | Wave 1 | Todo |
| RW-002 | Create ADR log and implementation agent guide | Wave 1 | Todo |
| RW-003 | Create service, secret, and environment setup checklist | Wave 1 | Todo |
| RW-004 | Prepare Linear project metadata and import policy | Wave 1 | Todo |
| RW-005 | Define CI and validation contract for web and macOS | Wave 1 | Blocked |
| RW-010 | Audit FreeFlow build reliability | Wave 2 | Todo |
| RW-011 | Audit FreeFlow hotkeys, insertion, island, and privacy behavior | Wave 2 | Todo |
| RW-012 | Audit FreeFlow license, attribution, and rebrand scope | Wave 2 | Todo |
| RW-013 | Record FreeFlow import decision ADR | Wave 2 | Blocked |
| RW-014 | Compare fallback macOS bases if FreeFlow fails | Wave 2 | Blocked |
| RW-015 | Benchmark Groq latency and cost assumptions | Wave 2 | Todo |
| RW-016 | Spike Apple signing, notarization, and updater path | Wave 2 | Todo |
| RW-017 | Resolve domain, legal, and public policy content ownership | Wave 2 | Human Review |
| RW-020 | Scaffold the Next.js web/backend app | Wave 3 | Backlog |
| RW-021 | Create Supabase product schema and migrations | Wave 3 | Backlog |
| RW-022 | Implement Clerk email magic-link authentication | Wave 3 | Backlog |
| RW-023 | Implement Terms and Privacy acceptance gate | Wave 3 | Backlog |
| RW-024 | Implement Stripe products, checkout, and customer portal | Wave 3 | Backlog |
| RW-025 | Implement Stripe webhooks and subscription cache | Wave 3 | Backlog |
| RW-026 | Implement desktop account and plan API | Wave 3 | Backlog |
| RW-027 | Implement usage and trial quota service | Wave 3 | Backlog |
| RW-028 | Implement admin roles and bootstrap allowlist | Wave 3 | Backlog |
| RW-029 | Implement Friend of Ruby promo data model | Wave 3 | Backlog |
| RW-030 | Implement privacy-safe logging and redaction guardrails | Wave 3 | Backlog |
| RW-031 | Implement rate limits and fair-use controls | Wave 3 | Backlog |
| RW-040 | Implement Groq provider client | Wave 4 | Backlog |
| RW-041 | Implement authenticated transcription endpoint | Wave 4 | Backlog |
| RW-042 | Implement conservative cleanup pipeline | Wave 4 | Backlog |
| RW-043 | Implement transient context and dictionary payload handling | Wave 4 | Backlog |
| RW-044 | Define backend-to-desktop error contract | Wave 4 | Backlog |
| RW-045 | Store metadata-only request observability | Wave 4 | Backlog |
| RW-046 | Add backend integration tests with mocked providers | Wave 4 | Backlog |
| RW-047 | Implement provider/network failure behavior | Wave 4 | Backlog |
| RW-060 | Import and rebrand the selected macOS base | Wave 5 | Blocked |
| RW-061 | Implement desktop browser login bridge | Wave 5 | Backlog |
| RW-062 | Implement first-run onboarding and permissions | Wave 5 | Backlog |
| RW-063 | Implement Keychain session storage and backend API client | Wave 5 | Backlog |
| RW-064 | Implement hold-to-talk and toggle hotkeys | Wave 5 | Backlog |
| RW-065 | Implement audio recording upload flow | Wave 5 | Backlog |
| RW-066 | Implement recording island states and visualizer | Wave 5 | Backlog |
| RW-067 | Implement 10-minute recording cap and warning | Wave 5 | Backlog |
| RW-068 | Implement direct text insertion | Wave 5 | Backlog |
| RW-069 | Implement clipboard-safe fallback and recovery | Wave 5 | Backlog |
| RW-070 | Implement local Recent Wisprs history | Wave 5 | Backlog |
| RW-071 | Implement local personal dictionary | Wave 5 | Backlog |
| RW-072 | Implement Mac settings, account, plan, and usage surfaces | Wave 5 | Backlog |
| RW-073 | Build macOS multi-app manual QA harness | Wave 5 | Backlog |
| RW-080 | Define light Apple-like design system and tokens | Wave 6 | Backlog |
| RW-081 | Build marketing home page and product proof | Wave 6 | Backlog |
| RW-082 | Build pricing, checkout, account, and download pages | Wave 6 | Backlog |
| RW-083 | Build Terms, Privacy, and beta support pages | Wave 6 | Backlog |
| RW-084 | Build admin dashboard for users, plans, usage, and errors | Wave 6 | Backlog |
| RW-085 | Build Friend of Ruby admin code workflow | Wave 6 | Backlog |
| RW-086 | Run website responsive, accessibility, and visual QA | Wave 6 | Backlog |
| RW-087 | Add web E2E coverage for auth, checkout, account, and admin | Wave 6 | Backlog |
| RW-100 | Run privacy storage and log audit | Wave 7 | Backlog |
| RW-101 | Run auth, billing, admin, and API security audit | Wave 7 | Backlog |
| RW-102 | Validate latency and performance budget | Wave 7 | Backlog |
| RW-103 | Configure privacy-safe crash and error reporting | Wave 7 | Backlog |
| RW-104 | Implement direct-download auto-update | Wave 7 | Backlog |
| RW-105 | Configure signing, notarization, and release packaging | Wave 7 | Backlog |
| RW-106 | Configure production deployment and rollback runbook | Wave 7 | Backlog |
| RW-107 | Execute paid beta launch checklist | Wave 7 | Blocked |

---

# Wave 1 - Project Harness

## RW-001: Establish repo command contract and scaffold decision

Status: Todo
Priority: High
Labels: `docs`, `chore`, `agent-ready`, `build`

## Goal
Define the repo's initial command contract and implementation scaffold choices before agents start adding product code.

## Context
The specs define provisional commands for Next.js and Xcode, but the repo currently contains docs/scripts only. Future tickets need exact package manager, app paths, and validation commands.

## Scope
- Decide package manager and monorepo folder shape.
- Document initial commands for web, backend, and macOS work.
- Mark unknown commands as blocked by FreeFlow import or web scaffold.
- Update specs if the command contract changes.

## Out of Scope
- Scaffolding the Next.js app.
- Importing FreeFlow.
- Configuring CI.

## Acceptance Criteria
- [ ] Done means a short command-contract section exists in `TECHNICAL_INFRASTRUCTURE.md`.
- [ ] The chosen package manager and expected app paths are documented.
- [ ] Unknown Xcode commands are explicitly tied to the FreeFlow audit/import.
- [ ] Future tickets can cite exact commands or the exact blocker ticket.

## Validation
- [ ] Run `rg -n "npm run|pnpm|xcodebuild|command contract" *.md docs`.
- [ ] Verify no ticket relies on an undocumented command.
- [ ] Attach the updated doc path in the Linear issue.

## Dependencies
- Blocked by: None.
- Blocks: RW-005, RW-020, RW-046, RW-087.
- Related: RW-010, RW-060.

## Agent Notes
- Likely files/areas: `TECHNICAL_INFRASTRUCTURE.md`, `IMPLEMENTATION_PLAN.md`, optional `AGENT_GUIDE.md`.
- Risk level: Low.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Build, Test, Lint, Typecheck Commands`, `IMPLEMENTATION_PLAN.md#Validation Plan`.

## RW-002: Create ADR log and implementation agent guide

Status: Todo
Priority: Normal
Labels: `docs`, `chore`, `agent-ready`

## Goal
Create lightweight decision and agent guidance artifacts so future implementation agents preserve product/security boundaries.

## Context
The specs list ADR candidates for FreeFlow, Clerk, Supabase, Stripe, Groq, Sparkle, backend proxying, and crash reporting. The repo also has startup rules in `AGENTS.md`.

## Scope
- Create `DECISION_LOG.md` or `docs/adr/README.md`.
- Create `AGENT_GUIDE.md` with repo-specific implementation rules.
- Include Always / Ask first / Never lists.
- Include privacy rules and validation expectations.

## Out of Scope
- Making final architecture decisions.
- Creating live Linear issues.

## Acceptance Criteria
- [ ] Done means future agents can find project rules without rereading every spec.
- [ ] ADR candidates are listed with status `Proposed`.
- [ ] The guide repeats that `.env.local` and private env sources must not be inspected, printed, or committed.
- [ ] The guide requires acceptance criteria, validation, and security/privacy notes for implementation PRs.

## Validation
- [ ] Run `rg -n "Always|Ask first|Never|ADR|privacy|\\.env.local" AGENT_GUIDE.md DECISION_LOG.md docs`.
- [ ] Verify generated docs do not include secret values.
- [ ] Manual review against `AGENTS.md`.

## Dependencies
- Blocked by: None.
- Blocks: RW-013, RW-017, RW-107.
- Related: RW-001.

## Agent Notes
- Likely files/areas: `AGENT_GUIDE.md`, `DECISION_LOG.md`, `docs/adr/`.
- Risk level: Low.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#ADR Candidates`, `TECHNICAL_INFRASTRUCTURE.md#Standards And Project Conventions`.

## RW-003: Create service, secret, and environment setup checklist

Status: Todo
Priority: High
Labels: `infra`, `security`, `docs`, `agent-ready`, `privacy`

## Goal
Produce a setup checklist for Clerk, Supabase, Stripe, Groq, Vercel, Apple Developer, Sparkle, and crash reporting without exposing secrets.

## Context
The infrastructure spec names required services and environment variables. The repo setup scripts intentionally avoid printing private `.env.local` content.

## Scope
- Create a checklist for required accounts/projects and env var names.
- Separate dev, staging, and production setup.
- Mark human approval gates for production secrets and live Stripe.
- Include secret storage rules and source-of-truth locations.

## Out of Scope
- Creating provider accounts.
- Adding real env values.
- Inspecting `.env.local`.

## Acceptance Criteria
- [ ] Done means a human can provision services from the checklist.
- [ ] Every env var named in `TECHNICAL_INFRASTRUCTURE.md` is accounted for.
- [ ] Production secret and live billing steps are marked human approval.
- [ ] The checklist explicitly forbids committing or printing secret values.

## Validation
- [ ] Run `rg -n "CLERK_|SUPABASE_|STRIPE_|GROQ_|SENTRY_|APPLE|Sparkle|human approval" *.md docs`.
- [ ] Verify no secret values are present.
- [ ] Manual review against `scripts/setup-chat-env.sh`.

## Dependencies
- Blocked by: None.
- Blocks: RW-020, RW-021, RW-022, RW-024, RW-040, RW-105.
- Related: RW-017.

## Agent Notes
- Likely files/areas: `docs/setup.md`, `TECHNICAL_INFRASTRUCTURE.md`.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Secrets Management`, `AGENTS.md`.

## RW-004: Prepare Linear project metadata and import policy

Status: Todo
Priority: Normal
Labels: `docs`, `chore`, `agent-ready`

## Goal
Prepare the exact Linear project, milestone, label, and queue policy for live issue creation.

## Context
The RW queue is now live in Linear. This ticket records the exact team, project, milestone, label, status, issue-shape, and queue policy that future Symphony operation should follow.

## Scope
- Confirm recommended project name, milestones, labels, statuses, and creation order.
- Document whether to create flat issues or parent/sub-issues.
- Document first-wave Todo and later Backlog/Blocked policy.
- Prepare a creation report template.

## Out of Scope
- Creating more implementation tickets beyond the approved queue.
- Editing product scope.

## Acceptance Criteria
- [ ] Live creation policy is documented.
- [ ] First-wave unblocked tickets are Todo and future work is Backlog/Blocked.
- [ ] Team/project/status names are recorded.
- [ ] Parent/sub-issue preference is documented.

## Validation
- [ ] Run `rg -n "Recommended Linear Project Setup|Queue Policy|Todo|Backlog|Blocked" LINEAR_ISSUE_DRAFT.md docs`.
- [ ] Manual review against current Linear project.

## Dependencies
- Blocked by: None.
- Blocks: Live Linear/Symphony setup.
- Related: All tickets.

## Agent Notes
- Likely files/areas: `LINEAR_ISSUE_DRAFT.md`.
- Risk level: Low.
- Handoff expectation: decision needed.
- Source references: `LINEAR_ISSUE_DRAFT.md`, `IMPLEMENTATION_PLAN.md#Linear Issue Draft Map`.

## RW-005: Define CI and validation contract for web and macOS

Status: Blocked
Priority: Normal
Labels: `infra`, `qa`, `chore`, `build`, `blocked`

## Goal
Define and implement the first CI checks once the web scaffold and macOS project exist.

## Context
The specs require lint, typecheck, tests, builds, and Xcode validation, but commands are provisional until scaffolding/import.
RW-001 sets npm, `apps/web`, and `apps/macos` as the command-contract baseline. Mac CI remains blocked until FreeFlow audit/import records the exact Xcode project/workspace and scheme.

## Scope
- Add CI workflow for web commands after RW-020.
- Add macOS build/test workflow if runner support is practical after RW-060.
- Document checks agents must run locally.
- Keep release signing separate from CI.

## Out of Scope
- Signing/notarization.
- Full release packaging.
- Provider integration secrets in CI.

## Acceptance Criteria
- [ ] Done means PRs run at least web lint/typecheck/test/build once the web app exists.
- [ ] Mac CI is either implemented or explicitly documented as manual-only with reason.
- [ ] CI never exposes provider or production secrets.
- [ ] README or agent guide lists the checks.

## Validation
- [ ] Run the configured CI locally where possible.
- [ ] Verify CI passes on a branch.
- [ ] Inspect workflow files for secret-safe usage.

## Dependencies
- Blocked by: RW-001, RW-020, RW-060.
- Blocks: RW-087, RW-100, RW-107.
- Related: RW-046, RW-073.

## Agent Notes
- Likely files/areas: `.github/workflows/`, package scripts, Xcode project.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#CI/CD`.

---

# Wave 2 - Discovery And Audit

## RW-010: Audit FreeFlow build reliability

Status: Todo
Priority: High
Labels: `macos`, `spike`, `agent-ready`, `external-dependency`, `build`

## Goal
Determine whether FreeFlow builds and runs reliably enough to be RubyWhisper's macOS base.

## Context
The fork strategy recommends `zachlatta/freeflow` unless a short technical audit finds blockers.

## Scope
- Clone or inspect FreeFlow in a temporary location.
- Identify Xcode workspace/project, schemes, dependencies, and build commands.
- Build Debug locally.
- Launch the app if safe and document setup friction.
- Record exact commands and results.

## Out of Scope
- Importing FreeFlow into this repo.
- Rebranding.
- Fixing FreeFlow bugs.

## Acceptance Criteria
- [ ] Done means the audit says build passed, failed, or needs prerequisites with exact evidence.
- [ ] Exact `xcodebuild` commands and scheme names are recorded.
- [ ] Any blockers are specific and actionable.
- [ ] The audit does not use real production API keys.

## Validation
- [ ] Run `xcodebuild -list` in the FreeFlow checkout.
- [ ] Run the discovered Debug build command.
- [ ] Attach build output summary and local environment notes.

## Dependencies
- Blocked by: None.
- Blocks: RW-013, RW-060.
- Related: RW-011, RW-012.

## Agent Notes
- Likely files/areas: temporary FreeFlow checkout, `RESEARCH_LOG.md`, `DECISION_LOG.md`.
- Risk level: Medium.
- Handoff expectation: investigation report.
- Source references: `FORK_STRATEGY.md#Evaluation Criteria`, `IMPLEMENTATION_PLAN.md#M0`.

## RW-011: Audit FreeFlow hotkeys, insertion, island, and privacy behavior

Status: Todo
Priority: High
Labels: `macos`, `spike`, `agent-ready`, `privacy`, `manual-qa`

## Goal
Verify whether FreeFlow's core product behavior can support RubyWhisper's hotkeys, insertion, island, context, and privacy requirements.

## Context
RubyWhisper needs `Fn` hold, `Command+Fn` toggle, non-focus-stealing island, insertion recovery, Groq-backed processing, and no server-side content storage.

## Scope
- Inspect FreeFlow hotkey implementation.
- Inspect insertion and clipboard fallback behavior.
- Inspect island/overlay focus behavior.
- Inspect provider and cleanup/context flow.
- Inspect local history/storage behavior.
- Document required refactors for RubyWhisper backend proxying.

## Out of Scope
- Rewriting FreeFlow behavior.
- Provider benchmarking.
- UI redesign.

## Acceptance Criteria
- [ ] Done means each evaluation criterion from `FORK_STRATEGY.md` has pass/fail/unknown status.
- [ ] The report identifies where API keys live today and what must change for backend proxying.
- [ ] The report describes whether insertion failures can be detected/recovered.
- [ ] The report calls out any privacy risk before import.

## Validation
- [ ] Run relevant manual app tests if FreeFlow builds.
- [ ] Use code search to identify hotkey, overlay, insertion, provider, and storage modules.
- [ ] Attach file/module paths and risk notes.

## Dependencies
- Blocked by: None.
- Blocks: RW-013, RW-064, RW-068, RW-069.
- Related: RW-010, RW-012.

## Agent Notes
- Likely files/areas: FreeFlow source modules, `RESEARCH_LOG.md`.
- Risk level: High.
- Handoff expectation: investigation report.
- Source references: `FORK_STRATEGY.md#Evaluation Criteria`, `TECHNICAL_SPEC.md#Mac App And Dictation`.

## RW-012: Audit FreeFlow license, attribution, and rebrand scope

Status: Todo
Priority: High
Labels: `macos`, `docs`, `spike`, `agent-ready`, `external-dependency`

## Goal
Confirm FreeFlow's license obligations and estimate how much rebranding/import work is required.

## Context
FreeFlow is expected to be MIT licensed, but RubyWhisper needs clean attribution, bundle metadata, app name, and signing identity.

## Scope
- Confirm license file and attribution requirements.
- Identify app name, bundle ID, icons, assets, settings strings, and metadata to rebrand.
- Identify any third-party dependencies and their licenses.
- Document required notices for RubyWhisper.

## Out of Scope
- Legal advice beyond engineering license review.
- Performing the rebrand.

## Acceptance Criteria
- [ ] Done means license obligations are summarized and linked.
- [ ] Required attribution files/notices are listed.
- [ ] Rebrand touchpoints are listed by file/module where possible.
- [ ] Any license blocker is escalated before import.

## Validation
- [ ] Inspect FreeFlow `LICENSE`, package manifests, and project metadata.
- [ ] Run code search for `FreeFlow`, bundle IDs, and app display names.
- [ ] Update `RESEARCH_LOG.md` or `DECISION_LOG.md` with findings.

## Dependencies
- Blocked by: None.
- Blocks: RW-013, RW-060.
- Related: RW-010, RW-011.

## Agent Notes
- Likely files/areas: FreeFlow checkout, `RESEARCH_LOG.md`, `DECISION_LOG.md`.
- Risk level: Medium.
- Handoff expectation: investigation report.
- Source references: `FORK_STRATEGY.md#Decision`, `IMPLEMENTATION_PLAN.md#M0`.

## RW-013: Record FreeFlow import decision ADR

Status: Blocked
Priority: High
Labels: `docs`, `macos`, `needs-human`, `blocked`

## Goal
Record the formal decision to use FreeFlow, choose a fallback, or build custom.

## Context
The specs require audit before import. This decision controls most macOS tickets and should be explicit before code lands.

## Scope
- Write an ADR with context, options, decision, consequences, and follow-up tasks.
- Use RW-010, RW-011, and RW-012 findings.
- Mark fallback work blocked or active based on decision.

## Out of Scope
- Importing app code.
- Performing fallback comparison unless FreeFlow fails.

## Acceptance Criteria
- [ ] Done means an ADR is accepted by Brandon or marked pending human approval.
- [ ] The ADR names the selected base and why.
- [ ] Consequences for backend proxying, rebrand, and release are listed.
- [ ] Downstream ticket statuses can be updated from the decision.

## Validation
- [ ] Review ADR against FreeFlow audit outputs.
- [ ] Confirm with user before moving RW-060 to Todo.
- [ ] Run `rg -n "FreeFlow|Decision|Accepted|Superseded" DECISION_LOG.md docs`.

## Dependencies
- Blocked by: RW-010, RW-011, RW-012.
- Blocks: RW-014, RW-060.
- Related: `FORK_STRATEGY.md`.

## Agent Notes
- Likely files/areas: `DECISION_LOG.md` or `docs/adr/`.
- Risk level: High.
- Handoff expectation: decision needed.
- Source references: `FORK_STRATEGY.md`, `RESEARCH_LOG.md#Candidate Base Apps`.

## RW-014: Compare fallback macOS bases if FreeFlow fails

Status: Blocked
Priority: Normal
Labels: `macos`, `spike`, `blocked`, `external-dependency`

## Goal
Choose the best fallback macOS base only if FreeFlow has a blocking issue.

## Context
Fallbacks include Dictate Anywhere, Handy, Steno, CustomWispr, and Murmur. They should not distract from FreeFlow unless needed.

## Scope
- Compare build reliability, architecture, hotkeys, insertion, transcription model, history, license, and rebrand difficulty.
- Recommend one fallback or custom build.
- Record decision in ADR.

## Out of Scope
- Running this comparison if FreeFlow is accepted.
- Importing fallback code.

## Acceptance Criteria
- [ ] Done means each fallback candidate has a concise scorecard.
- [ ] The recommendation is tied to RubyWhisper v0.1 requirements.
- [ ] License and provider tradeoffs are explicit.
- [ ] User approves fallback before implementation.

## Validation
- [ ] Run build/readme/license checks for finalists.
- [ ] Update `RESEARCH_LOG.md`.
- [ ] Create or update ADR with the selected fallback.

## Dependencies
- Blocked by: RW-013 rejection of FreeFlow.
- Blocks: RW-060 if FreeFlow fails.
- Related: RW-010, RW-011, RW-012.

## Agent Notes
- Likely files/areas: temporary checkouts, `RESEARCH_LOG.md`, ADR docs.
- Risk level: Medium.
- Handoff expectation: investigation report.
- Source references: `FORK_STRATEGY.md#Fallback Candidates`.

## RW-015: Benchmark Groq latency and cost assumptions

Status: Todo
Priority: High
Labels: `backend`, `spike`, `agent-ready`, `performance`, `external-dependency`

## Goal
Validate whether Groq can support RubyWhisper's speed and unit economics assumptions.

## Context
RubyWhisper targets under 1 second for short whispers, with 1-2 seconds acceptable in beta. The paid plan includes provider costs and advertises unlimited personal dictation under fair use.

## Scope
- Benchmark short audio requests against Groq in a safe dev setup.
- Estimate cost for normal and heavy personal dictation.
- Identify cleanup model/options if Groq handles cleanup.
- Record latency, minimum billing behavior, and risk.

## Out of Scope
- Building production transcription endpoint.
- Storing user audio or transcripts.

## Acceptance Criteria
- [ ] Done means benchmark results include at least short, medium, and longer sample durations.
- [ ] Cost notes include normal, heavy, and abuse scenarios.
- [ ] The report recommends whether Groq remains v0.1 default.
- [ ] No real user content is used in samples.

## Validation
- [ ] Run benchmark script or documented manual API calls with synthetic/sample audio.
- [ ] Record p50/p95-style rough timings where possible.
- [ ] Update `RESEARCH_LOG.md` and ADR candidate notes.

## Dependencies
- Blocked by: Groq dev key availability from RW-003.
- Blocks: RW-040, RW-102.
- Related: RW-031.

## Agent Notes
- Likely files/areas: `scripts/benchmarks/`, `RESEARCH_LOG.md`, ADR docs.
- Risk level: Medium.
- Handoff expectation: investigation report.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Cost Model`, `TECHNICAL_SPEC.md#Performance Budgets`.

## RW-016: Spike Apple signing, notarization, and updater path

Status: Todo
Priority: Normal
Labels: `macos`, `release`, `spike`, `agent-ready`, `external-dependency`

## Goal
Confirm the release path for direct-download macOS distribution before release work begins.

## Context
RubyWhisper will ship outside the Mac App Store first. It needs Apple signing/notarization and likely Sparkle for auto-update.

## Scope
- Identify Apple Developer signing requirements.
- Confirm notarization steps and required credentials.
- Confirm whether Sparkle fits the selected macOS base.
- Document release artifact shape and appcast/update needs.

## Out of Scope
- Using production signing credentials.
- Shipping a release build.
- Implementing Sparkle.

## Acceptance Criteria
- [ ] Done means release prerequisites and credentials are listed without exposing secrets.
- [ ] The spike recommends Sparkle or a specific alternative.
- [ ] Human approval gates for signing/notarization are documented.
- [ ] The Mac App Store is explicitly marked future/later.

## Validation
- [ ] Review selected base project structure if available.
- [ ] Update `TECHNICAL_INFRASTRUCTURE.md` or ADR notes.
- [ ] Verify no signing secrets are added to repo.

## Dependencies
- Blocked by: None; deeper validation may depend on RW-060.
- Blocks: RW-104, RW-105.
- Related: RW-013.

## Agent Notes
- Likely files/areas: release docs, ADR docs, future Xcode project.
- Risk level: Medium.
- Handoff expectation: investigation report.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Deployment And Packaging`.

## RW-017: Resolve domain, legal, and public policy content ownership

Status: Human Review
Priority: High
Labels: `docs`, `security`, `privacy`, `needs-human`

## Goal
Resolve human-owned launch decisions for domain, Terms, Privacy, support, and public claims.

## Context
The domain is TBD, support is `brandon@rubyadvisory.com`, and privacy copy must match the no-server-content-storage architecture.

## Scope
- Decide whether to purchase `rubywhisper.com` or another domain.
- Identify who drafts/reviews Terms and Privacy.
- Define fair-use language for unlimited personal dictation.
- Confirm support address and beta positioning.

## Out of Scope
- Providing legal advice.
- Implementing website pages.
- Launching production.

## Acceptance Criteria
- [ ] Done means domain decision is recorded.
- [ ] Terms/Privacy owner and review path are recorded.
- [ ] Fair-use exclusions mention meeting transcription, batch transcription, resale, automation abuse, account sharing abuse, and non-personal high-volume use.
- [ ] Website claims use "works anywhere you can type," not "every text box."

## Validation
- [ ] Manual human approval.
- [ ] Update relevant docs with chosen domain/support/legal owner.
- [ ] Verify no public copy contradicts privacy architecture.

## Dependencies
- Blocked by: Human decision.
- Blocks: RW-083, RW-107.
- Related: RW-100, RW-101.

## Agent Notes
- Likely files/areas: `WEB_DESIGN_SPEC.md`, website content docs, legal docs.
- Risk level: High.
- Handoff expectation: decision needed.
- Source references: `WEB_DESIGN_SPEC.md#Website Home`, `TECHNICAL_SPEC.md#Privacy Requirements`.

---

# Wave 3 - Web Foundation

## RW-020: Scaffold the Next.js web/backend app

Status: Backlog
Priority: High
Labels: `frontend`, `backend`, `infra`, `feature`, `build`

## Goal
Create the initial Next.js application that will host marketing pages, auth/account pages, admin, and backend API routes.

## Context
The infrastructure spec recommends one Next.js app for speed. The repo currently has no app scaffold.
RW-001 chooses npm and `apps/web`, with backend API routes living in the same Next.js app.

## Scope
- Add Next.js with TypeScript in the chosen repo layout.
- Add lint, typecheck, test, build, and dev scripts.
- Add base routing structure for marketing, account, admin, and API.
- Add placeholder env validation without real secrets.

## Out of Scope
- Implementing real auth, billing, or transcription.
- Creating production deployment.

## Acceptance Criteria
- [ ] Done means `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` exist and pass or have documented intentional placeholders.
- [ ] The app has a clear route structure for public, account, admin, and API code.
- [ ] Env examples use placeholders only.
- [ ] Docs are updated with exact commands.

## Validation
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.

## Dependencies
- Blocked by: RW-001.
- Blocks: RW-021, RW-022, RW-024, RW-080, RW-081.
- Related: RW-005.

## Agent Notes
- Likely files/areas: `apps/web/`, `package.json`, `tsconfig.json`, env example, docs.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Architecture Overview`, `IMPLEMENTATION_PLAN.md#M1`.

## RW-021: Create Supabase product schema and migrations

Status: Backlog
Priority: High
Labels: `backend`, `data`, `migration`, `feature`, `privacy`

## Goal
Create the Supabase/Postgres schema for product metadata without storing user content.

## Context
Supabase stores profile, subscription cache, usage counters, request metadata, admin roles, and Friend of Ruby batches. It must not store audio, raw transcripts, cleaned text, context, clipboard contents, Recent Wisprs, or dictionary terms in v0.1.

## Scope
- Add migration(s) for required product metadata tables.
- Add indexes/constraints for Clerk user IDs, Stripe IDs, request IDs, and admin roles.
- Add typed data access helpers if the stack supports it.
- Document prohibited columns/content types.

## Out of Scope
- Supabase Auth.
- Transcript/audio storage.
- Admin UI.

## Acceptance Criteria
- [ ] Done means schema supports profiles, admin roles, subscriptions, usage counters, transcription request metadata, and Friend of Ruby batches.
- [ ] No table stores transcript/audio/context/clipboard/local history content.
- [ ] Migrations can be applied locally/staging.
- [ ] Data access helpers enforce server-only service role usage where relevant.

## Validation
- [ ] Run migration apply/dry-run command once defined.
- [ ] Run tests for schema/data helpers.
- [ ] Inspect schema for forbidden content columns.

## Dependencies
- Blocked by: RW-020, RW-003.
- Blocks: RW-023, RW-025, RW-027, RW-028, RW-029, RW-045.
- Related: RW-100.

## Agent Notes
- Likely files/areas: Supabase migrations, database client, types.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Data Storage`.

## RW-022: Implement Clerk email magic-link authentication

Status: Backlog
Priority: High
Labels: `backend`, `frontend`, `security`, `feature`, `integration`

## Goal
Implement browser-based email magic-link authentication for the web app.

## Context
RubyWhisper requires account sign-in before first dictation. Launch auth is email magic link only through Clerk.

## Scope
- Configure Clerk provider and middleware.
- Build sign-in/sign-up routes using email magic link only.
- Add session-protected account/admin route structure.
- Create or sync Supabase profile records for Clerk users.

## Out of Scope
- Google/Apple sign-in.
- Desktop login bridge.
- Billing.

## Acceptance Criteria
- [ ] Done means a user can sign in with an email magic link in development.
- [ ] Protected web routes require Clerk auth.
- [ ] A Supabase profile is created or updated for signed-in users.
- [ ] Magic links/tokens are never logged.

## Validation
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run auth middleware tests if available.
- [ ] Manually complete magic-link sign-in in dev.

## Dependencies
- Blocked by: RW-020, RW-021, RW-003.
- Blocks: RW-023, RW-026, RW-028, RW-061.
- Related: RW-101.

## Agent Notes
- Likely files/areas: Clerk config, middleware, auth routes, profile sync.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#FR-001 Auth`, `TECHNICAL_SPEC.md#FR-002 Magic link`.

## RW-023: Implement Terms and Privacy acceptance gate

Status: Backlog
Priority: High
Labels: `backend`, `frontend`, `privacy`, `feature`

## Goal
Require Terms/Privacy acceptance before trial dictation or transcription API usage.

## Context
The user explicitly requires first launch acceptance before the 5,000-word trial begins.

## Scope
- Add acceptance timestamp and optional document version to profile state.
- Add web/account acceptance UI.
- Add backend entitlement guard for desktop APIs.
- Return a structured `terms_required` error to the desktop app.

## Out of Scope
- Legal drafting.
- Full onboarding UI in macOS app.

## Acceptance Criteria
- [ ] Done means signed-in users without acceptance are blocked from transcription.
- [ ] Acceptance timestamp is stored per account.
- [ ] Desktop API receives a clear error when acceptance is missing.
- [ ] Acceptance copy does not overpromise privacy beyond the architecture.

## Validation
- [ ] Run entitlement helper tests.
- [ ] Manually test signed-in/no-acceptance state.
- [ ] Verify Supabase profile updates only acceptance metadata.

## Dependencies
- Blocked by: RW-021, RW-022, RW-017 for final legal text.
- Blocks: RW-041, RW-062.
- Related: RW-083, RW-100.

## Agent Notes
- Likely files/areas: profile schema, account route, API guard, shared entitlement helper.
- Risk level: High.
- Handoff expectation: PR ready with placeholder copy if legal text is not final.
- Source references: `TECHNICAL_SPEC.md#FR-003 Terms/Privacy`.

## RW-024: Implement Stripe products, checkout, and customer portal

Status: Backlog
Priority: High
Labels: `backend`, `frontend`, `billing`, `feature`, `integration`

## Goal
Let users start paid monthly or annual subscriptions through Stripe and manage billing through the customer portal.

## Context
RubyWhisper has one plan: `$7/month` or `$60/year`, displayed as `$5/month billed annually`.

## Scope
- Configure Stripe product/price IDs through env.
- Add checkout session route for monthly and annual.
- Add customer portal route.
- Add account UI actions for upgrade/manage billing.
- Support promotion code entry if Stripe Checkout handles it.

## Out of Scope
- Stripe webhook state syncing.
- Friend of Ruby admin creation.
- Live mode activation.

## Acceptance Criteria
- [ ] Done means test-mode checkout can be started for monthly and annual plans.
- [ ] Account UI can open Stripe customer portal for an existing customer.
- [ ] Prices match `$7/month` and `$60/year`.
- [ ] No card data is stored by RubyWhisper.

## Validation
- [ ] Run route/unit tests.
- [ ] Complete Stripe test-mode checkout manually.
- [ ] Verify env vars are placeholders in repo.

## Dependencies
- Blocked by: RW-020, RW-022, RW-003.
- Blocks: RW-025, RW-082.
- Related: RW-029, RW-101.

## Agent Notes
- Likely files/areas: Stripe server helpers, checkout route, portal route, account UI.
- Risk level: High.
- Handoff expectation: PR ready in test mode only.
- Source references: `TECHNICAL_SPEC.md#FR-005 Paid plan`, `TECHNICAL_INFRASTRUCTURE.md#Stripe`.

## RW-025: Implement Stripe webhooks and subscription cache

Status: Backlog
Priority: High
Labels: `backend`, `billing`, `data`, `security`, `integration`

## Goal
Sync Stripe subscription state into Supabase so RubyWhisper can enforce plan entitlements.

## Context
Stripe is billing source of truth; Supabase stores a product-facing cache for app behavior.

## Scope
- Implement webhook route with signature verification.
- Map Stripe customers/subscriptions to Clerk users.
- Update subscription status, plan, current period, and Friend of Ruby fields as needed.
- Add replay/idempotency behavior where practical.

## Out of Scope
- Creating checkout sessions.
- Admin dashboard UI.
- Live Stripe setup.

## Acceptance Criteria
- [ ] Done means Stripe test webhooks update Supabase subscription state.
- [ ] Invalid webhook signatures are rejected.
- [ ] Replayed events do not corrupt subscription state.
- [ ] Logs do not include sensitive payment data or webhook secrets.

## Validation
- [ ] Run webhook unit/integration tests.
- [ ] Run `stripe listen --forward-to localhost:<port>/api/stripe/webhook` once local app exists.
- [ ] Verify Supabase subscription cache after test events.

## Dependencies
- Blocked by: RW-021, RW-024.
- Blocks: RW-026, RW-041, RW-082.
- Related: RW-101.

## Agent Notes
- Likely files/areas: `/api/stripe/webhook`, subscription service, tests.
- Risk level: High.
- Handoff expectation: PR ready in test mode.
- Source references: `TECHNICAL_SPEC.md#Stripe Webhook`, `TECHNICAL_INFRASTRUCTURE.md#Billing Notes`.

## RW-026: Implement desktop account and plan API

Status: Backlog
Priority: High
Labels: `backend`, `api`, `feature`, `integration`

## Goal
Expose a secure account endpoint for the desktop app to read plan, trial, usage, billing, and terms state.

## Context
The Mac app needs to show trial/usage word count in Account/Plan surfaces and block dictation for missing terms or inactive plans.

## Scope
- Implement `GET /api/desktop/account` or equivalent.
- Verify Clerk session token.
- Return email, plan state, trial words used/limit, monthly words, and portal URL when available.
- Return no transcript/audio/content data.

## Out of Scope
- Desktop UI implementation.
- Checkout creation.
- Admin-only user data.

## Acceptance Criteria
- [ ] Done means authenticated desktop clients can fetch account state.
- [ ] Unauthenticated requests are rejected.
- [ ] Response includes usage and plan state needed by the Mac app.
- [ ] Response contains no private transcript/audio/context data.

## Validation
- [ ] Run API route tests.
- [ ] Manually call endpoint with valid and invalid session tokens.
- [ ] Verify response shape matches `TECHNICAL_SPEC.md`.

## Dependencies
- Blocked by: RW-022, RW-025, RW-027.
- Blocks: RW-063, RW-072.
- Related: RW-041.

## Agent Notes
- Likely files/areas: desktop API routes, account service, tests.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#GET /api/desktop/account`.

## RW-027: Implement usage and trial quota service

Status: Backlog
Priority: High
Labels: `backend`, `data`, `feature`, `unit`, `privacy`

## Goal
Track 5,000 trial words and paid/fair-use usage using cleaned output word counts.

## Context
Trial users get 5,000 words per account. Paid users get unlimited personal dictation under fair-use terms.

## Scope
- Implement word counting helper.
- Implement trial usage increment and exhaustion checks.
- Implement paid/friend access entitlement checks.
- Support monthly/lifetime usage counters.
- Keep counters metadata-only.

## Out of Scope
- Provider calls.
- UI usage display.
- Legal fair-use text.

## Acceptance Criteria
- [ ] Done means cleaned output words decrement trial balance.
- [ ] Exhausted trial users are blocked with a structured error.
- [ ] Paid and Friend of Ruby users pass entitlement checks.
- [ ] Counters store only metadata.

## Validation
- [ ] Run word count unit tests.
- [ ] Run entitlement helper tests for trial, paid, friend, exhausted, blocked, and payment-failed states.
- [ ] Inspect database writes for content-free metadata only.

## Dependencies
- Blocked by: RW-021, RW-025.
- Blocks: RW-041, RW-072, RW-084.
- Related: RW-031, RW-102.

## Agent Notes
- Likely files/areas: quota service, usage table access, tests.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#FR-004 Trial`, `TECHNICAL_SPEC.md#NFR-007 Cost`.

## RW-028: Implement admin roles and bootstrap allowlist

Status: Backlog
Priority: High
Labels: `backend`, `security`, `data`, `feature`

## Goal
Create a server-side admin authorization model with an initial bootstrap path for Brandon.

## Context
Admin access should be role-based in Supabase, initially bootstrapped for `brandon@rubyadvisory.com`, with no client-only checks.

## Scope
- Implement admin role lookup.
- Add bootstrap allowlist or seed mechanism.
- Protect admin routes server-side.
- Add tests for admin and non-admin access.

## Out of Scope
- Admin dashboard UI.
- Broad team/organization roles.

## Acceptance Criteria
- [ ] Done means only admin users can access admin APIs/pages.
- [ ] Non-admin users receive 403 or redirect.
- [ ] Admin status is checked server-side on every request.
- [ ] Bootstrap method is documented and does not expose secrets.

## Validation
- [ ] Run admin authorization tests.
- [ ] Manually test admin and non-admin accounts.
- [ ] Inspect client bundle to confirm no secret admin logic is exposed.

## Dependencies
- Blocked by: RW-021, RW-022.
- Blocks: RW-084, RW-085.
- Related: RW-101.

## Agent Notes
- Likely files/areas: admin middleware/helpers, Supabase role table, tests.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Admin Access`, `IMPLEMENTATION_PLAN.md#M5`.

## RW-029: Implement Friend of Ruby promo data model

Status: Backlog
Priority: Normal
Labels: `backend`, `billing`, `data`, `feature`

## Goal
Model Friend of Ruby one-year free access using Stripe coupons/promotion codes and Supabase metadata.

## Context
Admin should be able to create reusable codes for small groups, such as one code with 10 redemptions.

## Scope
- Define how Stripe promotion codes map to Supabase batches.
- Store max redemptions, expiration, created_by, and Stripe IDs.
- Track redeemed Friend of Ruby status on subscription/profile state.
- Add service methods for admin UI later.

## Out of Scope
- Admin UI.
- Manual comping outside Stripe unless Stripe cannot support the required flow.

## Acceptance Criteria
- [ ] Done means backend can represent Friend of Ruby batches and redemption status.
- [ ] A redeemed user receives one year free access.
- [ ] Redemption limits are enforced by Stripe or backend logic.
- [ ] Non-admin users cannot create codes.

## Validation
- [ ] Run model/service tests.
- [ ] Exercise Stripe test-mode coupon/promotion code if available.
- [ ] Verify subscription cache reflects Friend of Ruby access.

## Dependencies
- Blocked by: RW-021, RW-024, RW-025, RW-028.
- Blocks: RW-085.
- Related: RW-006.

## Agent Notes
- Likely files/areas: Stripe promo helpers, Supabase tables, admin service.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#FR-006 Friend of Ruby`, `TECHNICAL_SPEC.md#FR-032 Friend of Ruby admin`.

## RW-030: Implement privacy-safe logging and redaction guardrails

Status: Backlog
Priority: High
Labels: `backend`, `security`, `privacy`, `feature`, `high-risk`

## Goal
Create logging utilities and rules that prevent audio, transcript, context, clipboard, prompt, and token data from being logged.

## Context
RubyWhisper's privacy promise depends on metadata-only storage and logs. This should be enforced before transcription endpoints exist.

## Scope
- Add structured logging helper with redaction rules.
- Disable request-body logging for sensitive API routes.
- Add tests that representative sensitive fields are redacted.
- Document allowed and forbidden log fields.

## Out of Scope
- Full observability provider setup.
- Crash reporting integration.

## Acceptance Criteria
- [ ] Done means backend logging has a clear allowed-field model.
- [ ] Sensitive payload fields are dropped or redacted by default.
- [ ] Tests cover audio, transcript, cleaned text, context, clipboard, prompt, token, and webhook secret fields.
- [ ] Docs list allowed metadata fields.

## Validation
- [ ] Run logging/redaction tests.
- [ ] Manually inspect local logs from a mocked transcription request.
- [ ] Verify no sensitive sample strings appear in logs.

## Dependencies
- Blocked by: RW-020.
- Blocks: RW-041, RW-045, RW-100, RW-103.
- Related: RW-003.

## Agent Notes
- Likely files/areas: logger utility, API middleware, tests, docs.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Observability And Logging`, `TECHNICAL_SPEC.md#Observability Rules`.

## RW-031: Implement rate limits and fair-use controls

Status: Backlog
Priority: Normal
Labels: `backend`, `security`, `feature`, `privacy`, `high-risk`

## Goal
Add abuse protection for trial and paid usage without storing private content.

## Context
RubyWhisper can market unlimited personal dictation only if meeting transcription, batch abuse, resale, automation abuse, account sharing abuse, and extreme non-personal use are controlled.

## Scope
- Add rate limits for transcription API requests.
- Enforce 10-minute single-whisper cap server-side.
- Add coarse fair-use metadata checks.
- Return structured rate-limit/fair-use errors.
- Keep enforcement metadata content-free.

## Out of Scope
- Legal fair-use copy.
- Meeting transcription feature.
- Device activation limits.

## Acceptance Criteria
- [ ] Done means abusive request patterns can be blocked or throttled.
- [ ] Single-whisper duration over 10 minutes is rejected.
- [ ] Paid users are not blocked during normal personal use.
- [ ] Enforcement stores metadata only.

## Validation
- [ ] Run rate-limit tests.
- [ ] Run duration-cap API tests.
- [ ] Verify logs and database writes contain no content.

## Dependencies
- Blocked by: RW-027, RW-030.
- Blocks: RW-041, RW-102.
- Related: RW-017.

## Agent Notes
- Likely files/areas: API middleware, quota service, transcription route.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Cost Model`, `TECHNICAL_SPEC.md#NFR-007 Cost`.

---

# Wave 4 - Transcription Gateway

## RW-040: Implement Groq provider client

Status: Backlog
Priority: High
Labels: `backend`, `api`, `feature`, `external-dependency`

## Goal
Create a server-only Groq client for transcription and cleanup provider calls.

## Context
The desktop app must never call Groq directly or contain a Groq API key. The backend should use Groq first for both transcription and cleanup where feasible.

## Scope
- Implement a server-only provider client.
- Support `whisper-large-v3-turbo` transcription configuration.
- Add typed provider responses and errors.
- Ensure API key is read only from server env.

## Out of Scope
- Public API route implementation.
- Provider fallback to OpenAI or local models.
- Prompt design beyond minimal client support.

## Acceptance Criteria
- [ ] Done means backend code can call Groq through a single internal client.
- [ ] The Groq API key is never exposed to client bundles or desktop app code.
- [ ] Provider errors are normalized for route-level handling.
- [ ] Tests can mock the provider client.

## Validation
- [ ] Run provider client unit tests.
- [ ] Run `npm run build` and inspect that server-only code is not bundled client-side.
- [ ] Manually call the client in a dev-safe script if credentials are available.

## Dependencies
- Blocked by: RW-003, RW-015, RW-020, RW-030.
- Blocks: RW-041, RW-042, RW-046.
- Related: RW-102.

## Agent Notes
- Likely files/areas: provider client module, env validation, tests.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Groq`, `TECHNICAL_SPEC.md#FR-014 Transcription`.

## RW-041: Implement authenticated transcription endpoint

Status: Backlog
Priority: High
Labels: `backend`, `api`, `feature`, `privacy`, `integration`

## Goal
Implement the desktop transcription API endpoint that accepts authenticated audio and returns cleaned text.

## Context
This is the backend half of the core dictation loop. It must enforce auth, Terms/Privacy, trial/payment entitlement, duration cap, and no server-side content storage.

## Scope
- Add `POST /api/desktop/transcribe` or equivalent.
- Verify Clerk session token.
- Enforce terms acceptance, plan/trial entitlement, rate limits, and duration cap.
- Accept audio payload and pass it to provider processing.
- Return cleaned text, word count, request ID, and plan/trial state.

## Out of Scope
- Desktop upload implementation.
- Local Recent Wisprs.
- Admin UI.

## Acceptance Criteria
- [ ] Done means an authenticated eligible user can submit audio and receive cleaned text.
- [ ] Signed-out, terms-required, trial-exhausted, blocked, over-duration, and rate-limited users receive structured errors.
- [ ] The endpoint persists metadata only.
- [ ] No audio/transcript/cleaned text/context is stored or logged.

## Validation
- [ ] Run API integration tests with mocked provider responses.
- [ ] Manually submit a short test request in local/staging.
- [ ] Inspect database/logs for content-free metadata only.

## Dependencies
- Blocked by: RW-022, RW-023, RW-027, RW-030, RW-031, RW-040, RW-042.
- Blocks: RW-063, RW-065, RW-100.
- Related: RW-044, RW-045.

## Agent Notes
- Likely files/areas: desktop API route, auth guard, quota service, provider client.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#POST /api/desktop/transcribe`, `TECHNICAL_SPEC.md#Transcription Request`.

## RW-042: Implement conservative cleanup pipeline

Status: Backlog
Priority: High
Labels: `backend`, `api`, `feature`, `privacy`, `unit`

## Goal
Implement the cleanup step that lightly improves transcript text while preserving meaning and voice.

## Context
Cleanup should add punctuation/capitalization, remove filler words, fix obvious mistakes, preserve names/terms, avoid adding ideas, and return original text if cleanup fails.

## Scope
- Create cleanup prompt/service.
- Support cleanup enabled/disabled behavior.
- Support fallback to raw transcript when cleanup fails.
- Add tests with synthetic non-sensitive examples.

## Out of Scope
- Complex voice command mode.
- Prompt marketplace.
- Heavy rewriting.

## Acceptance Criteria
- [ ] Done means cleanup returns conservative final text for sample transcripts.
- [ ] Cleanup-disabled mode returns raw transcription as final text.
- [ ] Cleanup failure returns original transcript without blocking insertion.
- [ ] Tests do not use private user content.

## Validation
- [ ] Run cleanup service unit tests.
- [ ] Run mocked provider tests for success and failure.
- [ ] Manually review sample outputs for over-rewriting.

## Dependencies
- Blocked by: RW-040.
- Blocks: RW-041, RW-043, RW-071.
- Related: `PRODUCT_BRIEF.md#Cleanup Strategy`.

## Agent Notes
- Likely files/areas: cleanup service, prompt builder, provider client tests.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#FR-015 Cleanup`, `PRODUCT_BRIEF.md#Cleanup Strategy`.

## RW-043: Implement transient context and dictionary payload handling

Status: Backlog
Priority: High
Labels: `backend`, `api`, `privacy`, `feature`, `high-risk`

## Goal
Allow context-aware cleanup and local dictionary terms without storing or logging that content server-side.

## Context
Context-aware cleanup is on by default after Terms/Privacy acceptance and can be disabled. Personal dictionary is local-only in v0.1 but may be sent transiently in provider prompts.

## Scope
- Accept context and dictionary fields only when settings allow.
- Include them in cleanup prompt transiently.
- Ensure redaction/logging guardrails omit these fields.
- Add tests that context/dictionary are not persisted.

## Out of Scope
- Syncing dictionary terms.
- Server-side user vocabulary storage.
- Reading arbitrary app content on the backend.

## Acceptance Criteria
- [ ] Done means context is omitted when the user disables context-aware cleanup.
- [ ] Dictionary terms can influence cleanup prompt transiently.
- [ ] Context and dictionary payloads are never stored in Supabase or logs.
- [ ] Tests prove persistence/logging boundaries.

## Validation
- [ ] Run persistence boundary tests.
- [ ] Run logging redaction tests.
- [ ] Inspect request metadata rows after mocked context requests.

## Dependencies
- Blocked by: RW-030, RW-042.
- Blocks: RW-041, RW-071.
- Related: RW-100.

## Agent Notes
- Likely files/areas: cleanup prompt builder, transcription route, logging tests.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#FR-016 Context-aware cleanup`, `TECHNICAL_SPEC.md#Privacy Requirements`.

## RW-044: Define backend-to-desktop error contract

Status: Backlog
Priority: High
Labels: `backend`, `api`, `macos`, `feature`

## Goal
Define the structured error codes and response shapes that the Mac app will map to user-facing island/account states.

## Context
The Mac app must show clear errors for signed out, terms required, permissions, trial exhausted, provider down, network failure, no text field, duration cap, and payment states.

## Scope
- Define error enum and response shape.
- Add route helpers for API errors.
- Document desktop behavior expected for each code.
- Add tests for representative error responses.

## Out of Scope
- Implementing Mac UI.
- Implementing all backend routes.

## Acceptance Criteria
- [ ] Done means every error in `TECHNICAL_SPEC.md#Error Handling` has a code and expected desktop behavior.
- [ ] API errors return stable machine-readable codes.
- [ ] User-facing copy is short and recoverable where possible.
- [ ] The contract is documented for Mac app agents.

## Validation
- [ ] Run API error helper tests.
- [ ] Run `rg -n "trial_exhausted|terms_required|provider_error|duration"`.
- [ ] Manual review against the Mac island states.

## Dependencies
- Blocked by: RW-020.
- Blocks: RW-041, RW-066, RW-072.
- Related: RW-047.

## Agent Notes
- Likely files/areas: shared API types, error helpers, docs.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Error Handling`, `WEB_DESIGN_SPEC.md#Component States`.

## RW-045: Store metadata-only request observability

Status: Backlog
Priority: High
Labels: `backend`, `data`, `privacy`, `feature`

## Goal
Persist content-free transcription request metadata for usage, debugging, admin, and latency monitoring.

## Context
Allowed metadata includes request ID, user ID, plan state, provider, duration, cleaned word count, latency, app/OS version, status, and coarse error code.

## Scope
- Write request metadata rows from transcription flow.
- Include latency measurements.
- Include app and OS version when provided.
- Exclude text/audio/context/clipboard fields by design.

## Out of Scope
- Full crash reporting.
- Admin UI charts.
- Transcript storage.

## Acceptance Criteria
- [ ] Done means successful and failed requests write metadata rows.
- [ ] Rows include request ID, status, provider, duration, word count, latency, app version, OS version, and error code where applicable.
- [ ] Rows never include transcript/audio/context/clipboard content.
- [ ] Admin can later query these rows.

## Validation
- [ ] Run metadata persistence tests.
- [ ] Submit mocked success and failure requests.
- [ ] Inspect rows and logs for forbidden content.

## Dependencies
- Blocked by: RW-021, RW-030, RW-041.
- Blocks: RW-084, RW-100, RW-102.
- Related: RW-103.

## Agent Notes
- Likely files/areas: request metadata service, transcription route, Supabase access.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Observability And Logging`.

## RW-046: Add backend integration tests with mocked providers

Status: Backlog
Priority: Normal
Labels: `backend`, `test`, `integration`, `agent-ready`

## Goal
Cover auth, quota, provider, cleanup, metadata, and error behavior with integration tests that do not call real providers.

## Context
The backend handles high-risk auth, billing, quota, and privacy boundaries. Tests should verify these boundaries without using real audio or secrets.

## Scope
- Mock Clerk session verification where practical.
- Mock Groq provider client.
- Mock Supabase writes or use test database.
- Cover success, trial exhausted, terms required, over-duration, provider failure, and redaction.

## Out of Scope
- Browser E2E tests.
- Real provider benchmarks.
- Mac app tests.

## Acceptance Criteria
- [ ] Done means core transcription API paths are covered with mocked dependencies.
- [ ] Tests verify no forbidden content is persisted/logged.
- [ ] Tests can run in CI without provider secrets.
- [ ] Failure cases verify stable error codes.

## Validation
- [ ] Run `npm run test`.
- [ ] Run `npm run typecheck`.
- [ ] Confirm test env uses dummy secrets only.

## Dependencies
- Blocked by: RW-020, RW-030, RW-041, RW-042, RW-045.
- Blocks: RW-005, RW-100, RW-101.
- Related: RW-087.

## Agent Notes
- Likely files/areas: backend test suite, mocks, route tests.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Test Plan`.

## RW-047: Implement provider and network failure behavior

Status: Backlog
Priority: Normal
Labels: `backend`, `api`, `feature`, `reliability`

## Goal
Return clear, recoverable failures when Groq, network, quota, or backend dependencies fail.

## Context
The app must not silently fail. Users should see a clear error when backend/provider is down, and no whisper should be lost after cleaned text exists.

## Scope
- Normalize provider/network exceptions.
- Add timeout and retry policy where safe.
- Return structured provider/network error codes.
- Ensure partial failures do not store content.

## Out of Scope
- Multi-provider fallback.
- Offline dictation.
- Desktop local retry queue.

## Acceptance Criteria
- [ ] Done means provider/network failures return stable error codes.
- [ ] Backend timeouts do not leave partial content in storage.
- [ ] Desktop clients can distinguish retryable and non-retryable errors.
- [ ] Logs include coarse error metadata only.

## Validation
- [ ] Run provider failure tests.
- [ ] Manually simulate provider timeout or mocked exception.
- [ ] Inspect logs for metadata-only output.

## Dependencies
- Blocked by: RW-030, RW-040, RW-044.
- Blocks: RW-066, RW-073.
- Related: RW-103.

## Agent Notes
- Likely files/areas: provider client, API error handling, tests.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Error Handling`, `TECHNICAL_INFRASTRUCTURE.md#Reliability And Recovery`.

---

# Wave 5 - Mac App

## RW-060: Import and rebrand the selected macOS base

Status: Blocked
Priority: High
Labels: `macos`, `feature`, `blocked`, `external-dependency`, `build`

## Goal
Import the selected macOS app base into the RubyWhisper repo and rebrand top-level app identity.

## Context
FreeFlow is the preferred base only after audit approval. RubyWhisper must become the app name, with clean bundle metadata and preserved attribution.
RW-001 reserves `apps/macos` for this import. Exact `xcodebuild` commands remain blocked until FreeFlow audit/import discovers the repo-local project/workspace and scheme.

## Scope
- Import selected app source into chosen repo path.
- Rename visible app surfaces to RubyWhisper.
- Update bundle identifier placeholders.
- Preserve required license/attribution notices.
- Document exact build/test commands.

## Out of Scope
- Deep UI redesign.
- Backend integration.
- Signing/notarization release setup.

## Acceptance Criteria
- [ ] Done means the app builds locally under RubyWhisper naming.
- [ ] Required upstream attribution is preserved.
- [ ] Build/test commands are documented.
- [ ] No production secrets or provider keys are added.

## Validation
- [ ] Run `xcodebuild -list`.
- [ ] Run the documented Debug build command.
- [ ] Launch app locally if safe.
- [ ] Run `rg -n "FreeFlow"` and document intentional remaining attribution-only matches.

## Dependencies
- Blocked by: RW-013.
- Blocks: RW-061, RW-062, RW-064, RW-066, RW-105.
- Related: RW-010, RW-011, RW-012.

## Agent Notes
- Likely files/areas: imported Xcode project, app metadata, license files.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `FORK_STRATEGY.md#Proposed Import Plan`, `IMPLEMENTATION_PLAN.md#M3`.

## RW-061: Implement desktop browser login bridge

Status: Backlog
Priority: High
Labels: `macos`, `backend`, `security`, `feature`, `integration`

## Goal
Let the Mac app initiate browser-based Clerk magic-link login and receive authenticated session state.

## Context
Users must sign in before first dictation. Login happens on the website/browser, not directly inside the app.

## Scope
- Add app login entry point.
- Open browser login flow.
- Handle secure callback/deep link/session exchange.
- Store resulting session token through RW-063.
- Show signed-in/signed-out states.

## Out of Scope
- Google/Apple sign-in.
- Billing UI.
- Full onboarding permissions flow.

## Acceptance Criteria
- [ ] Done means a user can start login from the Mac app and return signed in.
- [ ] Signed-out users cannot dictate.
- [ ] Tokens are not logged or shown.
- [ ] Failure/cancel states are clear and recoverable.

## Validation
- [ ] Run macOS build.
- [ ] Manually complete login in dev.
- [ ] Verify token storage path uses Keychain work from RW-063.

## Dependencies
- Blocked by: RW-022, RW-026, RW-060, RW-063.
- Blocks: RW-062, RW-065.
- Related: `TECHNICAL_SPEC.md#First Run`.

## Agent Notes
- Likely files/areas: Mac auth coordinator, URL scheme/deep link handler, account state.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#FR-002 Magic link`.

## RW-062: Implement first-run onboarding and permissions

Status: Backlog
Priority: High
Labels: `macos`, `design`, `feature`, `manual-qa`

## Goal
Guide users through sign-in, Terms/Privacy, microphone permission, Accessibility permission, and a test whisper.

## Context
Onboarding is required before first use. Accessibility permission is needed for reliable insertion into other apps.

## Scope
- Build native onboarding stepper/window.
- Include Terms/Privacy acceptance state from backend.
- Request/explain microphone permission.
- Request/explain Accessibility permission.
- Include first test whisper entry point.

## Out of Scope
- Website legal page implementation.
- Full settings app.
- Production notarization.

## Acceptance Criteria
- [ ] Done means a new user can reach a ready-to-dictate state through onboarding.
- [ ] Permission denied states explain how to fix System Settings.
- [ ] Terms/Privacy acceptance is required before test whisper.
- [ ] Onboarding is keyboard accessible enough for beta.

## Validation
- [ ] Run macOS build.
- [ ] Manual first-run test on a clean app state.
- [ ] Test mic denied and Accessibility denied flows.

## Dependencies
- Blocked by: RW-023, RW-060, RW-061.
- Blocks: RW-065, RW-073, RW-100.
- Related: `WEB_DESIGN_SPEC.md#Onboarding`.

## Agent Notes
- Likely files/areas: onboarding UI, permission manager, account state.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `WEB_DESIGN_SPEC.md#First-Run Test`, `TECHNICAL_SPEC.md#First Run`.

## RW-063: Implement Keychain session storage and backend API client

Status: Backlog
Priority: High
Labels: `macos`, `api`, `security`, `feature`

## Goal
Store desktop auth/session credentials securely and create a typed API client for RubyWhisper backend calls.

## Context
The desktop app should store tokens in Keychain and call RubyWhisper backend only, never Groq directly.

## Scope
- Add Keychain-backed token storage.
- Add backend API client for account and transcription endpoints.
- Add app/OS version metadata headers.
- Add session refresh/logout behavior where supported.

## Out of Scope
- Login bridge UI.
- Transcription provider code.
- Local history storage.

## Acceptance Criteria
- [ ] Done means tokens are stored in Keychain, not plain preferences.
- [ ] API client attaches auth safely and handles 401/403 states.
- [ ] App contains no Groq, Stripe, Supabase service, or Clerk secret keys.
- [ ] Logout clears local auth state.

## Validation
- [ ] Run macOS unit tests if available.
- [ ] Manually inspect app config for provider secret absence.
- [ ] Test account endpoint call with valid/invalid auth.

## Dependencies
- Blocked by: RW-026, RW-060.
- Blocks: RW-061, RW-065, RW-072.
- Related: RW-101.

## Agent Notes
- Likely files/areas: Mac API client, Keychain helper, account/session store.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Security Requirements`.

## RW-064: Implement hold-to-talk and toggle hotkeys

Status: Backlog
Priority: High
Labels: `macos`, `feature`, `manual-qa`

## Goal
Implement RubyWhisper's default global hotkey behavior.

## Context
Both modes are always available: hold `Fn` to record, and `Command+Fn` to toggle recording on/off. `Fn` may stop active toggle recording if the base supports it cleanly.

## Scope
- Preserve/adapt selected base hotkey implementation.
- Ensure hold-to-talk starts/stops recording correctly.
- Ensure toggle starts/stops recording correctly.
- Add conflict/error states if macOS cannot capture expected keys.

## Out of Scope
- Hotkey customization UI.
- Voice commands.

## Acceptance Criteria
- [ ] Done means hold `Fn` records only while held.
- [ ] Done means `Command+Fn` toggles recording.
- [ ] Both modes remain available without settings changes.
- [ ] Failure to register hotkeys is visible and recoverable.

## Validation
- [ ] Run macOS build.
- [ ] Manual hotkey QA with built app.
- [ ] Test common keyboard/system settings where available.

## Dependencies
- Blocked by: RW-011, RW-060.
- Blocks: RW-065, RW-066.
- Related: `TECHNICAL_SPEC.md#FR-010 Hotkeys`.

## Agent Notes
- Likely files/areas: hotkey manager, recording controller.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `PRODUCT_BRIEF.md#V0.1 Core Flow`.

## RW-065: Implement audio recording upload flow

Status: Backlog
Priority: High
Labels: `macos`, `api`, `feature`, `integration`

## Goal
Record audio from the Mac app and submit it to the RubyWhisper backend for transcription.

## Context
The Mac app records audio locally but provider processing happens through the backend. Audio should not be retained longer than needed for the request.

## Scope
- Capture audio in backend-compatible format.
- Attach auth, duration, app version, OS version, cleanup/context settings.
- Submit to transcription endpoint.
- Handle success and structured error responses.
- Delete transient audio after flow completes where feasible.

## Out of Scope
- Local transcription.
- Meeting/file upload transcription.
- Direct Groq calls.

## Acceptance Criteria
- [ ] Done means a signed-in eligible user can submit recorded audio to backend.
- [ ] App never includes provider API keys.
- [ ] Transient audio is not saved as history.
- [ ] API errors map to app state using RW-044.

## Validation
- [ ] Run macOS build.
- [ ] Manually record and submit short test audio.
- [ ] Verify backend receives metadata and no local audio history remains.

## Dependencies
- Blocked by: RW-041, RW-060, RW-062, RW-063, RW-064.
- Blocks: RW-066, RW-068, RW-070.
- Related: RW-100.

## Agent Notes
- Likely files/areas: recording controller, upload client, temporary file handling.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Transcription Request`.

## RW-066: Implement recording island states and visualizer

Status: Backlog
Priority: High
Labels: `macos`, `design`, `feature`, `visual`, `manual-qa`

## Goal
Build the floating recording island with live voice pickup and all required states.

## Context
The island is the signature UI. It should be compact, draggable, not steal focus, and show recording, nearing limit, processing, success, error, trial exhausted, insertion failed, and permission states.

## Scope
- Implement stable island state machine.
- Add live vocal visualizer.
- Add reduced-motion behavior where feasible.
- Add user-facing copy for trial exhausted and insertion failed.
- Ensure island does not steal focus.

## Out of Scope
- Main app/settings UI.
- Website design.
- Local history list.

## Acceptance Criteria
- [ ] Done means every required island state can be triggered in dev/test.
- [ ] Visualizer responds to microphone input.
- [ ] Island remains compact and stable across states.
- [ ] Island does not take focus from the active typing target.

## Validation
- [ ] Run macOS build.
- [ ] Manual island state QA.
- [ ] Record screenshot/video proof for key states.
- [ ] Test reduced-motion setting if implemented.

## Dependencies
- Blocked by: RW-044, RW-060, RW-064, RW-065.
- Blocks: RW-067, RW-068, RW-073.
- Related: `WEB_DESIGN_SPEC.md#Recording Island`.

## Agent Notes
- Likely files/areas: island/overlay UI, recording state store, audio meter.
- Risk level: High.
- Handoff expectation: PR ready with visual proof.
- Source references: `PRODUCT_BRIEF.md#Recording Island`, `WEB_DESIGN_SPEC.md#Component States`.

## RW-067: Implement 10-minute recording cap and warning

Status: Backlog
Priority: Normal
Labels: `macos`, `backend`, `feature`, `unit`, `manual-qa`

## Goal
Prevent v0.1 from becoming meeting transcription by enforcing a 10-minute single-whisper cap.

## Context
The app should warn around 9:30 and stop/block recording at 10:00. The backend should also reject over-duration requests.

## Scope
- Add local timer and warning state.
- Stop or block recording at 10 minutes.
- Ensure duration metadata is sent to backend.
- Align with backend server-side cap.

## Out of Scope
- Meeting transcription.
- File upload transcription.
- Paid tier variations.

## Acceptance Criteria
- [ ] Done means warning appears around 9:30.
- [ ] Done means recording cannot exceed 10:00 for one whisper.
- [ ] Backend rejects over-duration submissions.
- [ ] Duration cap behavior is testable with shortened timers.

## Validation
- [ ] Run timer unit tests if architecture supports it.
- [ ] Run backend duration-cap tests from RW-031.
- [ ] Manually test with shortened cap in dev or a long recording QA pass.

## Dependencies
- Blocked by: RW-031, RW-066.
- Blocks: RW-073, RW-102.
- Related: `TECHNICAL_SPEC.md#FR-013 Duration cap`.

## Agent Notes
- Likely files/areas: recording state, timer logic, backend validation.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Duration cap`.

## RW-068: Implement direct text insertion

Status: Backlog
Priority: High
Labels: `macos`, `feature`, `manual-qa`, `high-risk`

## Goal
Insert cleaned text into the active text field when possible.

## Context
RubyWhisper's core promise is text appearing where the user was already working. macOS Accessibility and app differences make this high risk.

## Scope
- Adapt selected base insertion logic.
- Insert cleaned text into focused text fields.
- Detect likely insertion success/failure where possible.
- Avoid reading more context than needed.

## Out of Scope
- Clipboard fallback recovery.
- Perfect support for every possible macOS app.
- Server-side insertion handling.

## Acceptance Criteria
- [ ] Done means successful dictation places text in focused Notes/browser/editor fields during manual QA.
- [ ] Insertion failures surface to recovery path instead of being silent.
- [ ] The app does not store destination app content server-side.
- [ ] The product copy remains "works anywhere you can type."

## Validation
- [ ] Run macOS build.
- [ ] Manual insertion QA in Notes, browser text field, Slack/equivalent, and code editor.
- [ ] Trigger no-focused-text-field state.

## Dependencies
- Blocked by: RW-011, RW-065, RW-066.
- Blocks: RW-069, RW-070, RW-073.
- Related: `TECHNICAL_SPEC.md#FR-017 Insertion`.

## Agent Notes
- Likely files/areas: insertion manager, Accessibility helper, recording completion handler.
- Risk level: High.
- Handoff expectation: PR ready with manual QA evidence.
- Source references: `TECHNICAL_SPEC.md#Insertion Failure`, `WEB_DESIGN_SPEC.md#Failure Recovery Test`.

## RW-069: Implement clipboard-safe fallback and recovery

Status: Backlog
Priority: High
Labels: `macos`, `feature`, `privacy`, `manual-qa`

## Goal
Recover user text when direct insertion fails by copying cleaned text safely and restoring the previous clipboard when possible.

## Context
If the cursor was not in a text box, RubyWhisper should show "Click a text box first" and preserve the whisper. Users need a simple `Copy Whisper`/`Copy Transcript` recovery action.

## Scope
- Implement clipboard fallback logic.
- Preserve/restore previous clipboard where technically possible.
- Add copy action for last/failed whisper.
- Ensure clipboard contents are never sent to backend.

## Out of Scope
- Server-side clipboard history.
- Guaranteed clipboard restoration for all clipboard data types.

## Acceptance Criteria
- [ ] Done means failed insertion does not lose cleaned text.
- [ ] User sees "Click a text box first" when no focused field is available.
- [ ] User can copy the cleaned whisper from recovery UI.
- [ ] Previous clipboard is restored when technically possible.

## Validation
- [ ] Run clipboard manager tests if available.
- [ ] Manual QA no-focused-field flow.
- [ ] Verify backend receives no clipboard content.

## Dependencies
- Blocked by: RW-068, RW-070.
- Blocks: RW-073.
- Related: `TECHNICAL_SPEC.md#FR-019 Clipboard fallback`.

## Agent Notes
- Likely files/areas: clipboard manager, insertion recovery UI, Recent Wisprs store.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Insertion Failure`, `WEB_DESIGN_SPEC.md#Recent Wisprs`.

## RW-070: Implement local Recent Wisprs history

Status: Backlog
Priority: High
Labels: `macos`, `feature`, `privacy`, `data`, `unit`

## Goal
Store final cleaned Recent Wisprs locally for 7 days, including failed insertions.

## Context
Recent Wisprs is required on day one. Only final cleaned text is stored locally on the Mac; no server-side transcript history exists.

## Scope
- Add local storage for final cleaned text, timestamp, insertion status, and optional destination app if safe.
- Include successful and failed insertions.
- Add 7-day retention cleanup.
- Add clear history and disable local history setting if supported by settings UI.

## Out of Scope
- Raw transcript storage.
- Audio storage.
- Cloud sync.

## Acceptance Criteria
- [ ] Done means recent successful and failed wisprs appear locally.
- [ ] Items expire after 7 days by default.
- [ ] Clearing history removes local items.
- [ ] No Recent Wisprs data is sent to Supabase/backend.

## Validation
- [ ] Run local retention tests.
- [ ] Manual successful and failed insertion history test.
- [ ] Inspect backend calls to confirm history is not synced.

## Dependencies
- Blocked by: RW-065, RW-068.
- Blocks: RW-069, RW-072, RW-100.
- Related: `TECHNICAL_SPEC.md#FR-020 Recent Wisprs`.

## Agent Notes
- Likely files/areas: local persistence, history view, retention job.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `WEB_DESIGN_SPEC.md#Recent Wisprs`, `TECHNICAL_SPEC.md#Privacy Requirements`.

## RW-071: Implement local personal dictionary

Status: Backlog
Priority: Normal
Labels: `macos`, `feature`, `privacy`, `data`, `unit`

## Goal
Let users maintain local terms RubyWhisper should preserve during cleanup.

## Context
Personal dictionary is desired for names/terms and should be local-only in v0.1. Terms may be sent transiently during cleanup when enabled.

## Scope
- Add local dictionary storage.
- Add add/edit/delete behavior.
- Include terms in backend cleanup payload only when cleanup settings allow.
- Ensure terms are never synced or persisted server-side.

## Out of Scope
- Cloud sync.
- Team vocabulary.
- Server-side vocabulary profiles.

## Acceptance Criteria
- [ ] Done means user can add, edit, and delete dictionary terms.
- [ ] Dictionary persists locally across app launches.
- [ ] Terms can influence cleanup payload transiently.
- [ ] Terms are not stored in Supabase/backend logs.

## Validation
- [ ] Run dictionary persistence tests.
- [ ] Manual add/edit/delete QA.
- [ ] Inspect mocked backend request and logs for expected transient/no-persistence behavior.

## Dependencies
- Blocked by: RW-043, RW-060.
- Blocks: RW-072.
- Related: `TECHNICAL_SPEC.md#FR-021 Personal dictionary`.

## Agent Notes
- Likely files/areas: dictionary store, settings UI, API payload builder.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `WEB_DESIGN_SPEC.md#Main App / Settings`.

## RW-072: Implement Mac settings, account, plan, and usage surfaces

Status: Backlog
Priority: High
Labels: `macos`, `design`, `feature`, `integration`

## Goal
Build the main Mac app/settings surfaces for Account, Plan, Dictionary, Hotkeys, Appearance, and Advanced.

## Context
The user wants word count visible in the app, not the normal island. Settings also control cleanup, context-aware cleanup, and local history.

## Scope
- Build settings shell with required sections.
- Show account email and sign-out.
- Show plan/trial word usage and billing portal link.
- Include dictionary, hotkeys, appearance, cleanup/context toggles, local history controls.
- Connect to desktop account API.

## Out of Scope
- Website account page.
- Hotkey customization if not already supported.
- Server-side dictionary sync.

## Acceptance Criteria
- [ ] Done means all required settings sections exist.
- [ ] Plan view shows trial words used/remaining and paid/Friend state.
- [ ] Advanced settings can disable cleanup/context-aware cleanup/local history.
- [ ] Billing management opens Stripe customer portal.

## Validation
- [ ] Run macOS build.
- [ ] Manual settings walkthrough.
- [ ] Test account API loading, sign-out, and billing portal open.

## Dependencies
- Blocked by: RW-026, RW-027, RW-044, RW-063, RW-070, RW-071.
- Blocks: RW-073.
- Related: `WEB_DESIGN_SPEC.md#Main App / Settings`.

## Agent Notes
- Likely files/areas: settings UI, account view, usage view, billing link handler.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#FR-022 Settings`, `TECHNICAL_SPEC.md#FR-023 Usage display`.

## RW-073: Build macOS multi-app manual QA harness

Status: Backlog
Priority: Normal
Labels: `macos`, `qa`, `test`, `manual-qa`

## Goal
Create a repeatable manual QA checklist for core macOS dictation, insertion, permissions, failures, and privacy behavior.

## Context
Many Mac behaviors are difficult to automate because they depend on global hotkeys, Accessibility permissions, focus, and other apps.

## Scope
- Document manual QA matrix for Notes, browser text field, Slack/equivalent, code editor, no focused text field, denied permissions, trial exhausted, provider error.
- Add evidence requirements such as screenshots/videos where useful.
- Include privacy checks for local/server storage.

## Out of Scope
- Fully automated UI tests for every app.
- Release signing QA.

## Acceptance Criteria
- [ ] Done means an agent or human can rerun the same manual QA flow.
- [ ] The matrix includes success, failure, and recovery states.
- [ ] The matrix includes privacy verification steps.
- [ ] QA outcomes can be attached to future release tickets.

## Validation
- [ ] Run the manual checklist against a dev build.
- [ ] Attach notes/screenshots for key states.
- [ ] Verify failures create recoverable Recent Wisprs.

## Dependencies
- Blocked by: RW-062, RW-066, RW-067, RW-068, RW-069, RW-070, RW-072.
- Blocks: RW-100, RW-102, RW-107.
- Related: `WEB_DESIGN_SPEC.md#User-Test Scripts`.

## Agent Notes
- Likely files/areas: `docs/qa/macos-manual-qa.md`, app QA notes.
- Risk level: Medium.
- Handoff expectation: investigation report / QA artifact.
- Source references: `IMPLEMENTATION_PLAN.md#User-Test Checkpoints`, `WEB_DESIGN_SPEC.md#User-Test Scripts`.

---

# Wave 6 - Website Admin Design

## RW-080: Define light Apple-like design system and tokens

Status: Backlog
Priority: Normal
Labels: `design`, `frontend`, `chore`, `visual`

## Goal
Define the launch visual system for the website and shared product surfaces.

## Context
The website should be light, Apple-like, Superwhisper-inspired but not cloned, and avoid overpromising. UI should use product visuals, not abstract decoration.

## Scope
- Define color, typography, spacing, radius, button, form, and state tokens.
- Include accessibility and reduced-motion guidance.
- Establish visual rules for marketing, account, and admin pages.
- Document what not to do.

## Out of Scope
- Full website implementation.
- Native macOS component implementation.

## Acceptance Criteria
- [ ] Done means frontend agents have reusable tokens/styles.
- [ ] The palette is light and not a dark Superwhisper clone.
- [ ] Components include focus, loading, disabled, error, and success states.
- [ ] Admin pages are utilitarian, not marketing-styled.

## Validation
- [ ] Run design/style lint if available.
- [ ] Manual visual review against `WEB_DESIGN_SPEC.md`.
- [ ] Verify contrast targets are documented.

## Dependencies
- Blocked by: RW-020.
- Blocks: RW-081, RW-082, RW-084, RW-086.
- Related: `WEB_DESIGN_SPEC.md#Design Tokens`.

## Agent Notes
- Likely files/areas: CSS/theme files, component primitives, design docs.
- Risk level: Medium.
- Handoff expectation: PR ready with screenshots.
- Source references: `WEB_DESIGN_SPEC.md#Color System`, `WEB_DESIGN_SPEC.md#Typography`.

## RW-081: Build marketing home page and product proof

Status: Backlog
Priority: High
Labels: `frontend`, `design`, `feature`, `visual`

## Goal
Build the public home page that explains RubyWhisper and drives sign-up/download.

## Context
The first viewport should identify RubyWhisper and the literal offer: fast Mac dictation that works anywhere you can type.

## Scope
- Build hero, how-it-works, island/product proof, privacy promise, pricing teaser, and support/download CTAs.
- Use real or high-fidelity product visuals.
- Use "works anywhere you can type" language.
- Include privacy promise that Recent Wisprs live locally.

## Out of Scope
- Checkout implementation.
- Admin dashboard.
- Literal Superwhisper clone.

## Acceptance Criteria
- [ ] Done means visitors can understand the product in the first viewport.
- [ ] Page includes clear signup/download and pricing entry points.
- [ ] Privacy copy does not imply server-side transcript storage.
- [ ] Visual design matches the light Apple-like direction.

## Validation
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Capture desktop and mobile screenshots.

## Dependencies
- Blocked by: RW-020, RW-080.
- Blocks: RW-086.
- Related: `WEB_DESIGN_SPEC.md#Website Home`.

## Agent Notes
- Likely files/areas: public home route, marketing components, assets.
- Risk level: Medium.
- Handoff expectation: PR ready with screenshots.
- Source references: `WEB_DESIGN_SPEC.md#Website Home`, `RESEARCH_LOG.md#Design References`.

## RW-082: Build pricing, checkout, account, and download pages

Status: Backlog
Priority: High
Labels: `frontend`, `backend`, `billing`, `feature`, `integration`

## Goal
Build the customer-facing pages for pricing, paid checkout, account plan state, billing portal, and app download.

## Context
Anyone with the link can sign up and pay. Users need clear plan state and a direct download path.

## Scope
- Build pricing page/section with `$7/month` and `$60/year`.
- Connect checkout actions to Stripe routes.
- Build account page with plan, usage, billing portal, and download link.
- Handle signed-out and signed-in states.

## Out of Scope
- Admin dashboard.
- Public changelog.
- Live production app artifact hosting.

## Acceptance Criteria
- [ ] Done means users can reach checkout from pricing.
- [ ] Account page shows plan and trial/usage data.
- [ ] Billing portal opens for eligible users.
- [ ] Download page has a placeholder or real latest app link depending on release state.

## Validation
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Complete Stripe test-mode checkout manually.
- [ ] Verify account states for trial, paid, and Friend of Ruby users.

## Dependencies
- Blocked by: RW-024, RW-025, RW-026, RW-027, RW-080.
- Blocks: RW-087, RW-107.
- Related: `WEB_DESIGN_SPEC.md#Pricing`, `WEB_DESIGN_SPEC.md#Account`.

## Agent Notes
- Likely files/areas: pricing route/components, account route, download route, Stripe actions.
- Risk level: High.
- Handoff expectation: PR ready in test mode.
- Source references: `TECHNICAL_SPEC.md#FR-030 Website`, `WEB_DESIGN_SPEC.md#Checkout`.

## RW-083: Build Terms, Privacy, and beta support pages

Status: Backlog
Priority: High
Labels: `frontend`, `docs`, `privacy`, `feature`

## Goal
Publish launch-supporting Terms, Privacy, and beta support pages that match RubyWhisper's actual data behavior.

## Context
The product requires acceptance before trial dictation and routes beta support to `brandon@rubyadvisory.com`.

## Scope
- Add Terms page.
- Add Privacy page.
- Add support/contact page or section.
- Link these pages from onboarding/account/marketing where needed.
- Keep copy aligned with no server-side audio/transcript storage.

## Out of Scope
- Legal advice.
- Public changelog.
- Support ticketing system.

## Acceptance Criteria
- [ ] Done means pages exist and are linked from relevant flows.
- [ ] Privacy page states Recent Wisprs are local-only and server stores metadata only.
- [ ] Support path uses `brandon@rubyadvisory.com` for beta.
- [ ] Fair-use exclusions are included if approved.

## Validation
- [ ] Run `npm run build`.
- [ ] Manual copy review against `TECHNICAL_SPEC.md#Privacy Requirements`.
- [ ] Human review legal/policy copy before production.

## Dependencies
- Blocked by: RW-017, RW-020.
- Blocks: RW-023 final copy, RW-107.
- Related: RW-100.

## Agent Notes
- Likely files/areas: legal/support routes, footer links, onboarding/account links.
- Risk level: High.
- Handoff expectation: PR ready pending human legal review.
- Source references: `TECHNICAL_SPEC.md#Privacy Requirements`, `WEB_DESIGN_SPEC.md#Support/contact`.

## RW-084: Build admin dashboard for users, plans, usage, and errors

Status: Backlog
Priority: High
Labels: `frontend`, `backend`, `admin`, `security`, `feature`

## Goal
Build the beta admin dashboard for monitoring users, plans, word usage, errors, and Friend of Ruby status without exposing content.

## Context
Admin visibility is required for beta operations. It must be server-side role protected and must never show transcript/audio content.

## Scope
- Build admin user list.
- Show plan/subscription status, usage counters, error counts/codes, request metadata summaries, and Friend of Ruby status.
- Add filters/search if simple.
- Enforce server-side admin auth.

## Out of Scope
- Showing transcript/audio/context content.
- Full analytics warehouse.
- Customer support impersonation.

## Acceptance Criteria
- [ ] Done means admin can inspect beta health by user and status.
- [ ] Non-admin users cannot access admin pages or APIs.
- [ ] Admin UI shows request metadata and errors without private content.
- [ ] Data matches Supabase metadata tables.

## Validation
- [ ] Run admin authorization tests.
- [ ] Manually test admin and non-admin accounts.
- [ ] Inspect rendered admin UI for absence of transcript/audio text.

## Dependencies
- Blocked by: RW-028, RW-045, RW-080.
- Blocks: RW-085, RW-100, RW-107.
- Related: `TECHNICAL_SPEC.md#FR-031 Admin dashboard`.

## Agent Notes
- Likely files/areas: admin routes, admin components, server data loaders.
- Risk level: High.
- Handoff expectation: PR ready.
- Source references: `WEB_DESIGN_SPEC.md#Admin`, `TECHNICAL_SPEC.md#Admin Access`.

## RW-085: Build Friend of Ruby admin code workflow

Status: Backlog
Priority: Normal
Labels: `frontend`, `backend`, `billing`, `admin`, `feature`

## Goal
Let an admin create and view Friend of Ruby one-year free code batches for small groups.

## Context
The user wants to create a reusable code for a group, such as 10 people for a given day.

## Scope
- Add admin form for code, max redemptions, expiration, and notes if useful.
- Create Stripe coupon/promotion code or backend equivalent.
- Store batch metadata.
- Display redemption status and remaining uses.

## Out of Scope
- Public invite-only gate.
- Manual customer support comping outside the chosen flow.

## Acceptance Criteria
- [ ] Done means admin can create a code with limited redemptions.
- [ ] Redeemed users receive one year free access.
- [ ] Admin can see redemption count/status.
- [ ] Non-admin users cannot create or inspect codes.

## Validation
- [ ] Run admin and promo service tests.
- [ ] Redeem a test code in Stripe/test flow.
- [ ] Verify subscription/Friend status in account and admin.

## Dependencies
- Blocked by: RW-029, RW-084.
- Blocks: RW-087, RW-107.
- Related: RW-006.

## Agent Notes
- Likely files/areas: admin promo UI, Stripe promo helpers, Supabase batch table.
- Risk level: Medium.
- Handoff expectation: PR ready in test mode.
- Source references: `TECHNICAL_SPEC.md#FR-032 Friend of Ruby admin`.

## RW-086: Run website responsive, accessibility, and visual QA

Status: Backlog
Priority: Normal
Labels: `frontend`, `design`, `qa`, `visual`, `manual-qa`

## Goal
Verify the public and account/admin web surfaces work across desktop/mobile and meet accessibility expectations.

## Context
The design spec requires keyboard navigation, visible focus, WCAG AA contrast, responsive layout, and no overlapping text.

## Scope
- QA marketing, pricing, account, legal/support, and admin pages.
- Check desktop and mobile viewports.
- Check keyboard navigation and focus states.
- Check color contrast and reduced motion where applicable.

## Out of Scope
- Mac app QA.
- Full external accessibility audit.

## Acceptance Criteria
- [ ] Done means critical web pages are usable on mobile and desktop.
- [ ] Keyboard navigation reaches primary controls.
- [ ] Text does not overflow or overlap.
- [ ] Any accessibility gaps are fixed or ticketed.

## Validation
- [ ] Run `npm run build`.
- [ ] Capture screenshots for desktop and mobile.
- [ ] Run automated accessibility checks if available.
- [ ] Manual keyboard navigation pass.

## Dependencies
- Blocked by: RW-080, RW-081, RW-082, RW-083, RW-084.
- Blocks: RW-107.
- Related: `WEB_DESIGN_SPEC.md#Design QA Checklist`.

## Agent Notes
- Likely files/areas: web pages/components, CSS/theme, QA notes.
- Risk level: Medium.
- Handoff expectation: PR ready with QA evidence.
- Source references: `WEB_DESIGN_SPEC.md#Accessibility`, `WEB_DESIGN_SPEC.md#Responsive And Platform Behavior`.

## RW-087: Add web E2E coverage for auth, checkout, account, and admin

Status: Backlog
Priority: Normal
Labels: `frontend`, `backend`, `test`, `e2e`, `integration`

## Goal
Add end-to-end or integration coverage for the high-risk web flows.

## Context
Auth, checkout, account state, and admin authorization are critical for a paid beta and should not depend only on manual testing.

## Scope
- Add E2E tests or route-level integration tests for auth gating.
- Test checkout route creation in mocked/test mode.
- Test account page plan/usage rendering.
- Test admin allow/deny behavior.

## Out of Scope
- Real live Stripe charges.
- Mac app automation.
- Full browser matrix.

## Acceptance Criteria
- [ ] Done means tests cover signed-out, trial, paid, admin, and non-admin states.
- [ ] Tests can run without production secrets.
- [ ] Critical auth/billing/admin regressions fail CI.
- [ ] Test docs explain how to run locally.

## Validation
- [ ] Run `npm run test`.
- [ ] Run E2E command if separate.
- [ ] Verify CI includes these tests once RW-005 lands.

## Dependencies
- Blocked by: RW-005, RW-022, RW-024, RW-026, RW-028, RW-082, RW-085.
- Blocks: RW-101, RW-107.
- Related: RW-046.

## Agent Notes
- Likely files/areas: web tests, mocks, CI config.
- Risk level: Medium.
- Handoff expectation: PR ready.
- Source references: `TECHNICAL_SPEC.md#Test Plan`, `WEB_DESIGN_SPEC.md#Billing Test`.

---

# Wave 7 - Quality Release

## RW-100: Run privacy storage and log audit

Status: Backlog
Priority: High
Labels: `security`, `privacy`, `qa`, `high-risk`, `manual-qa`

## Goal
Verify RubyWhisper honors the core privacy promise before paid beta.

## Context
The server must not store audio, raw transcript, cleaned text, context, clipboard text, local Recent Wisprs, or dictionary terms. Admin/support must not expose private content.

## Scope
- Audit Supabase schema and rows.
- Audit backend logs for transcription flows.
- Audit crash/error reporting config.
- Audit Mac local storage boundaries.
- Audit admin dashboard for content absence.

## Out of Scope
- Legal review of Privacy policy.
- Third-party provider data retention guarantees beyond documented configuration.

## Acceptance Criteria
- [ ] Done means no server storage/logging path contains forbidden content.
- [ ] Local Recent Wisprs store final cleaned text only.
- [ ] Personal dictionary remains local-only in v0.1.
- [ ] Any privacy gap is fixed or blocks launch.

## Validation
- [ ] Run privacy-focused tests from backend/Mac suites.
- [ ] Manually inspect test database rows and logs after sample dictations.
- [ ] Review admin UI and support workflows.
- [ ] Attach audit notes to the ticket.

## Dependencies
- Blocked by: RW-030, RW-041, RW-043, RW-045, RW-070, RW-073, RW-084.
- Blocks: RW-107.
- Related: RW-017, RW-083.

## Agent Notes
- Likely files/areas: Supabase schema, logs, Mac storage, admin pages, observability config.
- Risk level: High.
- Handoff expectation: investigation report / blocking fixes.
- Source references: `TECHNICAL_SPEC.md#Privacy Requirements`, `TECHNICAL_INFRASTRUCTURE.md#Privacy Controls`.

## RW-101: Run auth, billing, admin, and API security audit

Status: Backlog
Priority: High
Labels: `security`, `backend`, `qa`, `high-risk`

## Goal
Audit security-critical flows before accepting paid beta users.

## Context
RubyWhisper has Clerk auth, Stripe billing, Supabase data, admin pages, desktop API tokens, and transcription endpoints.

## Scope
- Audit Clerk session verification.
- Audit admin role checks.
- Audit Stripe webhook signature validation.
- Audit desktop API authorization.
- Audit service-role key usage.
- Audit rate limiting and abuse controls.

## Out of Scope
- Full third-party penetration test.
- Privacy content audit covered by RW-100.

## Acceptance Criteria
- [ ] Done means protected routes reject unauthenticated users.
- [ ] Non-admin users cannot access admin data.
- [ ] Webhooks reject invalid signatures.
- [ ] Desktop app contains no server/provider secrets.
- [ ] High-risk findings block launch until fixed.

## Validation
- [ ] Run auth/admin/webhook/API tests.
- [ ] Manually test unauthorized access paths.
- [ ] Inspect env usage and client bundles for secret exposure.

## Dependencies
- Blocked by: RW-022, RW-025, RW-028, RW-031, RW-046, RW-087.
- Blocks: RW-107.
- Related: RW-003.

## Agent Notes
- Likely files/areas: auth middleware, admin routes, Stripe webhook, desktop API, env config.
- Risk level: High.
- Handoff expectation: investigation report / blocking fixes.
- Source references: `TECHNICAL_SPEC.md#Security Requirements`.

## RW-102: Validate latency and performance budget

Status: Backlog
Priority: High
Labels: `backend`, `macos`, `qa`, `performance`, `manual-qa`

## Goal
Verify RubyWhisper meets the beta performance target for short whispers and records useful latency metadata.

## Context
Short whispers under 30 seconds should target under 1 second from recording end to insertion, with 1-2 seconds acceptable in beta.

## Scope
- Measure local/staging end-to-end latency.
- Break down upload, provider, cleanup, response, and insertion timing where feasible.
- Test short, medium, and long whispers.
- Identify bottlenecks and create follow-up tickets if needed.

## Out of Scope
- Full production load testing.
- Meeting transcription performance.

## Acceptance Criteria
- [ ] Done means short-whisper latency is measured with evidence.
- [ ] Backend records latency metadata without content.
- [ ] Any performance misses have mitigation tickets.
- [ ] Results inform paid beta readiness.

## Validation
- [ ] Run benchmark or QA script from RW-015/RW-073.
- [ ] Manual timing test with dev/staging app.
- [ ] Inspect metadata rows for latency values only.

## Dependencies
- Blocked by: RW-015, RW-031, RW-045, RW-067, RW-073.
- Blocks: RW-107.
- Related: `TECHNICAL_SPEC.md#Performance Budgets`.

## Agent Notes
- Likely files/areas: benchmark scripts, backend timing, Mac QA notes.
- Risk level: High.
- Handoff expectation: investigation report / blocking fixes.
- Source references: `IMPLEMENTATION_PLAN.md#Risks And Mitigations`, `TECHNICAL_INFRASTRUCTURE.md#Performance Requirements`.

## RW-103: Configure privacy-safe crash and error reporting

Status: Backlog
Priority: Normal
Labels: `infra`, `security`, `privacy`, `feature`

## Goal
Add crash/error reporting configured to capture operational failures without private content.

## Context
The specs recommend Sentry or equivalent with data scrubbing, no screenshots/session replay, and no request bodies containing user content.

## Scope
- Configure web/backend error reporting.
- Configure Mac crash reporting if suitable for selected base.
- Add scrubbers/denylist for sensitive fields.
- Document allowed metadata.

## Out of Scope
- Product analytics dashboards.
- Session replay.
- Screenshots containing user content.

## Acceptance Criteria
- [ ] Done means errors include stack/version/OS/request metadata where allowed.
- [ ] Request bodies and sensitive fields are not captured.
- [ ] Crash reporting can be disabled or environment-gated.
- [ ] Privacy configuration is documented.

## Validation
- [ ] Trigger test error in dev/staging.
- [ ] Inspect captured event for absence of text/audio/context/clipboard/token data.
- [ ] Run redaction tests where practical.

## Dependencies
- Blocked by: RW-030, RW-045.
- Blocks: RW-100, RW-107.
- Related: `TECHNICAL_INFRASTRUCTURE.md#Observability And Logging`.

## Agent Notes
- Likely files/areas: Sentry/error reporting config, logging utilities, docs.
- Risk level: High.
- Handoff expectation: PR ready with captured-event proof.
- Source references: `RESEARCH_LOG.md#Privacy And Security Concerns`.

## RW-104: Implement direct-download auto-update

Status: Backlog
Priority: Normal
Labels: `macos`, `release`, `feature`, `external-dependency`

## Goal
Add auto-update support for the direct-download Mac app.

## Context
RubyWhisper is direct download first and should auto-update itself. Sparkle is the recommended default unless the selected base already has a suitable updater.

## Scope
- Integrate Sparkle or approved updater.
- Configure beta update channel/appcast.
- Ensure update artifacts are signed.
- Add user-visible update behavior appropriate for beta.

## Out of Scope
- Mac App Store updates.
- Release notarization itself.

## Acceptance Criteria
- [ ] Done means a beta build can check for an update.
- [ ] Update artifacts are signed.
- [ ] Update channel/config is documented.
- [ ] Failure to update is recoverable and does not break app launch.

## Validation
- [ ] Run macOS build.
- [ ] Manual update check between two beta builds or mocked appcast.
- [ ] Verify no update signing secrets are committed.

## Dependencies
- Blocked by: RW-016, RW-060.
- Blocks: RW-105, RW-107.
- Related: `TECHNICAL_INFRASTRUCTURE.md#Deployment And Packaging`.

## Agent Notes
- Likely files/areas: Xcode project, updater config, appcast/release scripts.
- Risk level: Medium.
- Handoff expectation: PR ready / release artifact.
- Source references: `TECHNICAL_SPEC.md#FR-041 Auto-update`.

## RW-105: Configure signing, notarization, and release packaging

Status: Backlog
Priority: High
Labels: `macos`, `release`, `security`, `high-risk`, `manual-qa`

## Goal
Create a signed/notarized direct-download release package for RubyWhisper.

## Context
Public paid beta users should be able to open the app without Gatekeeper warnings. Apple Developer account is ready, but production credentials require human approval.

## Scope
- Configure release build settings.
- Configure signing and notarization workflow.
- Produce downloadable beta artifact.
- Preserve license/attribution notices.
- Document exact release commands.

## Out of Scope
- Mac App Store packaging.
- Auto-update implementation beyond consuming RW-104.
- Live public launch announcement.

## Acceptance Criteria
- [ ] Done means a release build is signed and notarized.
- [ ] Downloaded app opens on a clean Mac/test profile without Gatekeeper warnings.
- [ ] Release artifact includes required attribution.
- [ ] Signing credentials are not committed or printed.

## Validation
- [ ] Run documented Release archive/export commands.
- [ ] Verify notarization success.
- [ ] Install on a clean Mac/profile and open app.
- [ ] Attach release artifact checksum/version notes.

## Dependencies
- Blocked by: RW-016, RW-060, RW-104.
- Blocks: RW-107.
- Related: RW-106.

## Agent Notes
- Likely files/areas: Xcode signing settings, release scripts, docs.
- Risk level: High.
- Handoff expectation: release artifact.
- Source references: `TECHNICAL_SPEC.md#FR-040 Signing/notarization`.

## RW-106: Configure production deployment and rollback runbook

Status: Backlog
Priority: High
Labels: `infra`, `release`, `backend`, `docs`

## Goal
Prepare production web/backend deployment and rollback procedures.

## Context
The Next.js app will likely deploy on Vercel with Clerk, Supabase, Stripe, Groq, and error reporting integrations. Production secrets and live billing require human approval.

## Scope
- Configure production deployment target.
- Document env var setup and approval gates.
- Add rollback instructions for web/backend.
- Document Stripe webhook live-mode switch.
- Document how to disable bad app versions or transcription endpoint if needed.

## Out of Scope
- Running live launch without approval.
- Signing/notarization.
- Legal review.

## Acceptance Criteria
- [ ] Done means production deployment can be performed from documented steps.
- [ ] Rollback path is documented and tested where possible.
- [ ] Production secret setup is human-approved.
- [ ] Live Stripe/Groq activation is gated.

## Validation
- [ ] Deploy staging/preview successfully.
- [ ] Run smoke tests against deployed environment.
- [ ] Dry-run rollback or document exact rollback command/path.

## Dependencies
- Blocked by: RW-003, RW-020, RW-041, RW-082, RW-083.
- Blocks: RW-107.
- Related: RW-105.

## Agent Notes
- Likely files/areas: deployment docs, Vercel config, env docs, release checklist.
- Risk level: High.
- Handoff expectation: release artifact / runbook.
- Source references: `TECHNICAL_INFRASTRUCTURE.md#Deployment And Packaging`, `TECHNICAL_INFRASTRUCTURE.md#Rollback And Recovery`.

## RW-107: Execute paid beta launch checklist

Status: Blocked
Priority: Urgent
Labels: `release`, `qa`, `needs-human`, `blocked`, `high-risk`

## Goal
Complete the final paid beta readiness checklist and launch only after all blocking privacy, security, performance, billing, and release gates pass.

## Context
RubyWhisper is a paid public beta. Launch requires real users, real payments, provider costs, signed app distribution, and privacy trust.

## Scope
- Run end-to-end first-run flow.
- Run paid checkout and Friend of Ruby redemption.
- Run Mac dictation and recovery QA.
- Run privacy/security audits.
- Confirm signed/notarized download and updater.
- Confirm support path and rollback plan.
- Get human approval for public beta.

## Out of Scope
- New feature work.
- Mac App Store launch.
- Meeting transcription.

## Acceptance Criteria
- [ ] Done means a fresh user can sign up, accept privacy, grant permissions, dictate, recover failed insertion, upgrade/pay, and manage billing.
- [ ] Friend of Ruby code grants one-year free access in the approved flow.
- [ ] Privacy, security, latency, and release audits pass.
- [ ] Brandon explicitly approves launch.

## Validation
- [ ] Run final web build/tests.
- [ ] Run final macOS release install smoke test.
- [ ] Execute `WEB_DESIGN_SPEC.md` user-test scripts.
- [ ] Attach launch checklist evidence and approval.

## Dependencies
- Blocked by: RW-017, RW-073, RW-086, RW-087, RW-100, RW-101, RW-102, RW-103, RW-105, RW-106.
- Blocks: Public paid beta launch.
- Related: All milestones.

## Agent Notes
- Likely files/areas: release checklist, QA evidence, deployment/release artifacts.
- Risk level: High.
- Handoff expectation: human approval / release artifact.
- Source references: `IMPLEMENTATION_PLAN.md#User-Test Checkpoints`, `TECHNICAL_SPEC.md#Acceptance Criteria For V0.1 Paid Beta`.

## Creation Report

- Total imported tickets: 63.
- Wave 1 Project Harness: 5 tickets.
- Wave 2 Discovery And Audit: 8 tickets.
- Wave 3 Web Foundation: 12 tickets.
- Wave 4 Transcription Gateway: 8 tickets.
- Wave 5 Mac App: 14 tickets.
- Wave 6 Website Admin Design: 8 tickets.
- Wave 7 Quality Release: 8 tickets.
- Initial dispatch tickets: RW-001, RW-002, RW-003, RW-004, RW-010, RW-011, RW-012, RW-015, RW-016.
- Human-decision ticket: RW-017.
- Blocked-at-import tickets: RW-005, RW-013, RW-014, RW-060, RW-107 and downstream work as dependency relations indicate.

## Resolved Linear Creation Decisions

- Linear team: `RubyAdvisory` (`RUB`).
- Linear project: `RubyWhisper Paid Beta Launch`.
- Linear project slug ID: `rubywhisper-paid-beta-launch-caaab48c6aa9`.
- Statuses available in the workspace: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`.
- Blocked policy: no `Blocked` state exists; use `Backlog` plus `blocked`.
- Review policy: no `Human Review` state exists; use `In Review`.
- Rework policy: no `Rework` state exists; only add it to Symphony polling after adding that Linear status.
- Issue shape: flat issues with milestone grouping and explicit dependency relations, not parent/sub-issue containers.
- Queue import policy: first-wave unblocked tickets can be `Todo`; future and blocked work stays `Backlog` with blocker/breakdown labels.
- Assignment policy: leave issues unassigned unless the operator explicitly assigns ownership during dispatch.
