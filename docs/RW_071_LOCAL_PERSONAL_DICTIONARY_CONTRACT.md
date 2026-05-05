# RW-071 Local Personal Dictionary Contract

Status: Proposed contract for RW-071A. macOS storage, settings UI, cleanup
payload wiring, privacy-audit tests, and manual QA remain downstream work in
RW-071B through RW-071F.

This contract defines RubyWhisper v0.1 personal dictionary behavior for local
term storage, add/edit/delete flows, validation, cleanup payload shaping, and
privacy evidence. It is the source-safe contract for:

- `TECHNICAL_SPEC.md#FR-021 Personal dictionary`
- `TECHNICAL_SPEC.md#POST /api/desktop/transcribe`
- `IMPLEMENTATION_PLAN.md#M4: Local History, Dictionary, Settings, And Account Surfaces`
- `WEB_DESIGN_SPEC.md#Settings`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md#Request Payload Boundary`
- `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md#POST /api/desktop/transcribe`

## Product Boundary

RubyWhisper v0.1 personal dictionary terms are local-only user preferences. They
exist to help conservative cleanup preserve names, jargon, and Ruby Advisory
terms when cleanup is enabled.

Out of scope for v0.1:

- Cloud sync, team vocabulary, shared organization glossaries, and server-side
  vocabulary profiles.
- Backend mutation APIs for dictionary storage.
- Support/admin views that expose dictionary contents.
- Real customer names, transcripts, prompts, clipboard contents, or provider
  payload examples in docs, tests, fixtures, Linear comments, PRs, logs, or
  screenshots.

## Data Shape

The macOS app must persist dictionary terms as structured local records, not as a
server-backed profile.

Required fields:

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `id` | String | Yes | Locally generated stable identifier. It must not encode user content. |
| `term` | String | Yes | User-entered display term after validation and whitespace normalization. |
| `createdAt` | Date/time | Yes | Local timestamp. |
| `updatedAt` | Date/time | Yes | Local timestamp, updated on edit. |

Optional local-only fields:

| Field | Type | Rule |
| --- | --- | --- |
| `pronunciationHint` | String | May be added only after a downstream UI contract defines validation and payload rules. Omit in v0.1 unless explicitly implemented by a later leaf. |
| `isEnabled` | Boolean | May support per-term disable. Disabled terms must be excluded from cleanup payloads. |

No field may contain auth tokens, provider IDs, source transcript snippets,
clipboard text, destination app content, customer data, server profile IDs, or
remote sync state.

## Local Persistence

The macOS app owns dictionary persistence. v0.1 storage must be local to the Mac
and must not sync through RubyWhisper services.

Persistence rules:

- Store dictionary records only in the approved local app settings/preferences
  store chosen by the macOS implementation leaf.
- Never store dictionary terms in Keychain; Keychain is reserved for session
  material and other approved secrets.
- Never write dictionary terms to backend databases, server sessions, analytics,
  crash reporting, support exports, request logs, response logs, Linear, PR
  bodies, or screenshots.
- Logout must not upload or delete dictionary terms. It may leave local
  dictionary settings in place alongside other non-secret local preferences.
- If encrypted local storage is feasible in the selected macOS base, prefer
  encryption at rest. Lack of local encryption is not a reason to add server
  persistence.

## Add, Edit, Delete

Settings must support add, edit, and delete as local operations.

Add:

- Create a new local record after validation passes.
- Normalize leading/trailing whitespace and repeated internal whitespace before
  duplicate checks.
- Reject empty, duplicate, and over-limit terms.
- Do not call the backend.

Edit:

- Preserve `id` and `createdAt`.
- Update `term` and `updatedAt` after validation passes.
- Re-run duplicate checks against all other active terms.
- Do not keep stale copies of the old term outside the local store.

Delete:

- Remove the local record so it cannot appear in future cleanup payloads.
- Do not use tombstones that retain the deleted term text unless a future local
  migration contract requires them.
- Do not call the backend.

Disable:

- A global dictionary setting may disable dictionary use without deleting local
  records.
- Per-term disable is optional. If present, disabled terms remain local but must
  be excluded from cleanup payloads.

## Validation Limits

Downstream implementation leaves may choose stricter limits, but they must not
exceed these v0.1 maximums without a new privacy/product contract:

| Limit | Maximum |
| --- | --- |
| Active terms | 250 |
| Normalized term length | 80 Unicode scalar values |
| Cleanup payload terms | 100 active terms per request |
| Cleanup payload serialized dictionary bytes | 8 KiB |

Validation rules:

- Trim leading and trailing whitespace.
- Collapse repeated internal whitespace to a single space.
- Reject control characters and null bytes.
- Reject terms that are only punctuation, symbols, or whitespace.
- Deduplicate case-insensitively after normalization.
- Preserve user casing for display and cleanup payloads after validation.
- Do not auto-import names, app text, clipboard text, transcripts, prompts, or
  support messages into the dictionary.

If the local store contains more valid active terms than the cleanup payload
limit, request shaping must choose a deterministic subset and record only
content-free metadata such as `dictionaryTermCountSent`.

## Cleanup Payload Boundary

Dictionary terms may be sent only as transient request body content for a single
cleanup/transcription request, and only when all of these conditions are true:

- The user has accepted the required Terms/Privacy gate.
- Cleanup is enabled.
- Dictionary support is enabled globally.
- At least one valid, active term remains after validation and payload limits.
- The request path is the approved desktop transcription/cleanup route.

The desktop client must omit `dictionaryTerms` entirely when:

- Cleanup is disabled.
- Dictionary support is disabled.
- No valid active terms are available.
- Terms/Privacy acceptance is missing or ambiguous.
- The request is a local recovery, copy, retry-display, diagnostics, support,
  history, billing, auth, or account request.

Context-aware cleanup and dictionary support are separate controls. Disabling
context-aware cleanup requires omitting `context`; it does not by itself require
omitting valid dictionary terms. Disabling cleanup requires omitting both cleanup
context and dictionary terms because no cleanup pass should consume them.

Backend and provider rules:

- The backend may process `dictionaryTerms` transiently for the single
  transcription/cleanup request.
- The backend must not persist, log, echo in errors, include in support payloads,
  or expose dictionary terms to admin views.
- Provider request bodies and cleanup prompts that contain dictionary terms are
  transient only and must not be stored in fixtures, logs, or diagnostics.
- Responses must not return dictionary terms except as part of the cleaned text
  if the user dictated the term in the audio.

## Disabled Cleanup Behavior

When cleanup is disabled, the final output is the raw transcription result under
the existing no-server-storage boundary. Dictionary terms must not be sent to the
backend or provider, and cleanup prompt construction must not run.

Manual validation for downstream leaves must include a cleanup-disabled request
that proves `dictionaryTerms` is absent, not empty, from the request body.

## Privacy Evidence

Every downstream implementation leaf that touches dictionary storage, request
payloads, logging, diagnostics, or tests must provide privacy evidence:

- Search changed files for `dictionary`, `dictionaryTerms`, `vocabulary`,
  `context`, `prompt`, `transcript`, `clipboard`, and provider payload terms.
- Confirm any matches containing sensitive words are policy references,
  synthetic placeholders, or code paths with explicit redaction.
- Confirm no `.env.local`, private env source, customer text, real customer
  names, recorded audio, transcripts, prompts, context, clipboard contents, or
  provider payloads were added.
- Confirm no server schema, migration, route, logger, fixture, or test persists
  dictionary term content.

Synthetic fixture rules:

- Use placeholders such as `term_placeholder_alpha`,
  `term_placeholder_beta`, and `req_test_123`.
- Do not use real person names, customer names, private project names, real
  transcripts, production prompts, clipboard examples, or provider responses.
- Screenshots and videos must show empty states or synthetic placeholders only.

## Required Test Coverage

Downstream leaves must add tests at the layer they implement:

- Local persistence: add, edit, delete, global disable, duplicate rejection,
  whitespace normalization, and app relaunch/reload of local-only records.
- Payload shaping: include valid active terms only when cleanup and dictionary
  support are enabled; omit `dictionaryTerms` entirely when disabled, empty,
  invalid, Terms/Privacy gated, or cleanup disabled.
- Deletion: deleted terms are removed from local storage and never appear in
  subsequent payloads.
- Redaction: request logs, error logs, analytics, support exports, crash reports,
  and auth/privacy tests never include dictionary term content.
- Server persistence: backend tests or schema/privacy tests prove dictionary
  terms are not written to database tables, sessions, logs, fixtures, or durable
  metadata.
- Synthetic fixtures: tests reject or scan for real private payload examples
  where the repo has an existing privacy-test seam.

Required validation commands for any leaf that changes web/backend auth,
logging, schema, privacy, or request handling:

```bash
npm run test:auth-privacy
npm run test:schema-privacy
```

Required validation commands for any leaf that changes docs or scripts:

```bash
git diff --check
```

The first macOS implementation leaf must document its concrete Xcode command
after the app import defines the workspace/scheme. Until then, the expected seam
is a settings/storage abstraction that can be exercised without real customer
data.

## Downstream Leaf Acceptance Criteria

RW-071B local storage leaf:

- Implements the structured local record shape and validation limits.
- Provides local persistence tests for add, edit, delete, duplicates,
  normalization, reload, and global disable.
- Does not add any server storage, sync, Keychain term storage, or real payload
  fixtures.

RW-071C settings UI leaf:

- Shows add, edit, delete, empty, validation error, disabled, and over-limit
  states using synthetic terms only in tests and screenshots.
- Makes local-only storage clear in settings copy.
- Does not display dictionary terms in the recording island or support export.

RW-071D cleanup payload leaf:

- Sends `dictionaryTerms` only under the approved cleanup payload conditions.
- Omits `dictionaryTerms` entirely for cleanup-disabled, dictionary-disabled,
  empty, invalid, Terms/Privacy-gated, and non-cleanup requests.
- Adds payload-shaping tests with synthetic placeholders.

RW-071E privacy/logging leaf:

- Proves server logs, error paths, analytics, support metadata, provider payload
  fixtures, and schema writes do not persist dictionary term content.
- Runs `npm run test:auth-privacy` and `npm run test:schema-privacy` when web or
  backend privacy code changes.

RW-071F manual QA leaf:

- Records manual proof with synthetic terms only.
- Covers add/edit/delete, cleanup enabled, cleanup disabled, dictionary disabled,
  and deleted-term omission.
- Records the privacy scan result and confirms no server-side audio, transcript,
  context, clipboard, prompt, or dictionary storage was introduced.
