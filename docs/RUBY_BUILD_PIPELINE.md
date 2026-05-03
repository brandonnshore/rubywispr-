# Ruby Advisory Build Pipeline

This is the reusable Ruby pipeline for turning a client call, rough idea, or internal product into shipped software with specs, Linear, Symphony, review, security, and deployment gates.

## Pipeline Overview

```text
Idea or client call
  -> Ruby Scope when a proposal is needed
  -> Ruby Spec for implementation-ready planning
  -> Linear Tickets for the execution board
  -> Harness Setup for repo and commands
  -> Symphony Operator for dispatch/review loops
  -> Implementation workers
  -> QA, design, security, and launch gates
  -> shipped product and handoff
```

## Skill Map

### Business Intake

- `ruby-scope`: proposal, scope, pricing, phased delivery plan, client-ready PDF/HTML.
- `ruby-scope-presentation`: pitch deck or client call deck from scope.
- `ruby-interview`: deeper requirements interview and research-backed gap analysis.

### Build Specification

- `ruby-spec`: canonical deep build planning; outputs implementation, infrastructure, technical, and UI/design specs.
- `linear-tickets`: converts approved specs into dependency-aware, agent-ready Linear issues.
- `setup-script`: creates safe per-chat/worktree setup scripts and env bootstrap.

### Execution And Orchestration

- `codex`: local Codex CLI workflows.
- `github:github`, `github:yeet`, `github:gh-fix-ci`, `github:gh-address-comments`: repo, PR, CI, and review workflows when available.
- `linear:linear`: Linear issue/project workflows.
- `playwright-skill` or browser skills: browser validation for web flows.
- `vercel:*`, `supabase:*`, `stripe:*`: deployment, database, and billing integration guidance/tools when available.

### Design And Product Quality

- `frontend-design`, `design-taste-frontend`, `ui-ux-cracked`: initial high-quality interface work.
- `arrange`, `typeset`, `colorize`, `clarify`, `onboard`, `adapt`: targeted UX improvements.
- `harden`, `normalize`, `polish`, `audit`, `optimize`: final resilience and quality passes.
- `critique`: design review before or after implementation.

### Security And Release

- `ruby-security`: production security audit.
- `cost-estimate`: estimate product costs.
- `audit`: accessibility/performance/technical quality checks.
- `content-research-writer`, `twitter`: research and market/social validation when needed.

## Phase 0: Intake

Use when the project is still an idea, client call, or messy transcript.

Output:

- client/problem summary
- target users
- business goal
- scope boundary
- proposal decision: sell first or spec first

Default:

- External client: run `ruby-scope` first.
- Internal product or already-approved client: run `ruby-spec` first.

## Phase 1: Proposal

Use `ruby-scope` when price, scope, or client approval is needed.

Output:

- internal Proposal Spec Lite
- client-facing scope/proposal
- optional pitch deck with `ruby-scope-presentation`

Gate:

- Brandon approves scope/price/timeline before implementation spec.

## Phase 2: Deep Spec

Use `ruby-spec`.

Required docs:

- `IMPLEMENTATION_PLAN.md`
- `TECHNICAL_INFRASTRUCTURE.md`
- `TECHNICAL_SPEC.md`
- `WEB_DESIGN_SPEC.md`

Optional docs:

- `RESEARCH_LOG.md`
- `DECISION_LOG.md` or `docs/adr/`
- `AGENT_GUIDE.md`

Gate:

- Specs include acceptance criteria, validation, non-goals, risk, privacy/security, and command contract.

## Phase 3: Linear Board

Use `linear-tickets`.

Board policy:

- Project = one launch/outcome.
- Milestones = dependency waves.
- Issues = one coherent outcome and one proof path.
- `Todo` = only current dispatch wave.
- `Backlog` = future work.
- `needs-breakdown` = later split into leaves.
- `execute-now` = current safe wave.
- `agent-ready` = sufficiently specified for a worker.
- `symphony` = can be picked up by Symphony.

Every issue must include:

- goal
- context
- scope
- out of scope
- acceptance criteria
- validation
- dependencies
- agent notes

## Phase 4: Harness Setup

Before workers write product code, the repo needs:

- `AGENTS.md`
- `WORKFLOW.md`
- setup scripts
- env strategy
- build/test/lint/typecheck commands
- PR template
- validation scripts
- privacy/security rules
- docs map
- Linear labels/states

Symphony should only run the harness wave first.

## Phase 5: Symphony Execution

Use Symphony for routine implementation, audits, refactors, tests, docs, and verification tickets.

The operator should:

- dispatch a small wave
- monitor active workers
- review workpads and PRs
- move issues through review/rework
- update the harness when failures repeat
- split future backlog after each milestone

Do not dispatch:

- vague ideas
- tickets missing validation
- live production changes without explicit approval
- high-risk privacy/security/billing tasks without human gate
- giant epics that need leaf splitting

## Phase 6: QA And Taste

Use targeted skills after implementation:

- `critique` for design review
- `adapt` for responsive behavior
- `onboard` for first-run flows
- `clarify` for UI copy/error text
- `harden` for errors/loading/empty states
- `polish` for final alignment and interaction quality
- `audit` for accessibility/performance/technical checks

For web apps:

- run browser validation across affected routes
- check console/errors
- test forms, buttons, modals, menus, auth, billing, and responsive states

For macOS apps:

- validate permissions
- validate hotkeys
- validate recording/island behavior
- validate transcription/cleanup
- validate insertion and clipboard fallback
- validate recent/local storage behavior

## Phase 7: Security And Release

Run `ruby-security` before production or beta launch.

Release gates:

- secrets safe
- auth configured
- database policies/migrations reviewed
- Stripe test mode verified before live
- web deployment verified
- macOS signing/notarization verified
- update path verified
- privacy policy/terms accepted in product
- logging excludes sensitive data
- rollback path exists

Production/life-business gates require Brandon approval:

- live Stripe activation
- DNS/domain changes
- production deploy
- production Supabase migrations
- Apple signing/notarization credentials
- public launch communications

## Phase 8: Handoff And Maintenance

After launch:

- document known limitations
- create follow-up backlog
- schedule cleanup/garbage-collection issues
- run regular `ruby-security --daily` or equivalent
- update docs when product decisions change
- keep Linear as the truth for active work

## Reusable Project Rule

For every Ruby project, the goal is not just "agents wrote code." The goal is:

```text
clear spec -> clean board -> safe workers -> reviewed PRs -> verified product -> documented handoff
```

When output quality drops, fix the harness before adding more workers.
