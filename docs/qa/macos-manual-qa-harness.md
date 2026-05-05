# RubyWhisper macOS Manual QA Harness

Status: manual QA harness only. No live macOS QA, provider smoke, clean-Mac
validation, or paid-beta launch approval has been executed by this document.

Use this checklist for the first human-run paid-beta macOS pass after the Mac
app source, signed or runnable build, approved test account, and approved
non-production service credentials are available. Until then, every manual row
below remains `Not Run` or `Blocked`.

## Source Contracts

- `PRODUCT_BRIEF.md`
- `docs/setup.md`
- `docs/MAC_BETA_RELEASE_RUNBOOK.md`
- `docs/DESKTOP_LOGIN_BRIDGE_CONTRACT.md`
- `docs/KEYCHAIN_SESSION_API_CLIENT_CONTRACT.md`
- `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`
- `docs/BACKEND_DESKTOP_ERROR_CONTRACT.md`
- `docs/DESKTOP_RECORDING_UPLOAD_FLOW_CONTRACT.md`
- `docs/RW_064_GLOBAL_HOTKEY_CONTRACT.md`
- `docs/RW_066_RECORDING_ISLAND_VISUALIZER_CONTRACT.md`
- `docs/RW_067_DURATION_CAP_CONTRACT.md`
- `docs/RW_068_DIRECT_INSERTION_CONTRACT.md`
- `docs/RW_069_CLIPBOARD_FALLBACK_CONTRACT.md`
- `docs/RW_070_RECENT_WISPRS_CONTRACT.md`
- `docs/RW_071_LOCAL_PERSONAL_DICTIONARY_CONTRACT.md`
- `docs/USAGE_QUOTA_CONTRACT.md`
- `docs/SOURCE_LATENCY_METADATA_CONTRACT.md`
- `docs/qa/recording-island-visual-proof-matrix.md`

## Status Values

Use only these status values in the matrix and evidence:

| Status | Meaning |
| --- | --- |
| `Not Run` | The check has not been executed. This is the default for this harness. |
| `Blocked` | The check could not run because a required human, build, Mac source, account, permission, or service input is missing. |
| `Pass` | A human executed the check and the actual result matched the expected result. |
| `Fail` | A human executed the check and the actual result did not match the expected result. |
| `N/A` | The check does not apply to the selected build or environment, with a written reason. |

Do not mark any row `Pass` based on this document, source-contract review,
synthetic examples, or agent-run repo validation.

## Manual Run Prerequisites

Record each prerequisite as `Pass`, `Fail`, `Blocked`, or `N/A` before starting
the matrix. Do not paste secrets, token values, magic links, auth headers,
provider payloads, private URLs, private app content, audio, transcripts,
clipboard text, or screenshots containing sensitive content.

| ID | Prerequisite | Required evidence | Current status |
| --- | --- | --- | --- |
| PRE-01 | Mac app source is present and the tester can identify the runnable app or build artifact. | Source/build identifier, app version, build/channel. | `Blocked` |
| PRE-02 | Tester has an approved non-production RubyWhisper account for auth, Terms, quota, and billing-gate checks. | Account category only, such as `trial_active_test` or `paid_active_test`. | `Blocked` |
| PRE-03 | Approved non-production backend/provider path is configured. | Environment label, provider category, and route availability only. | `Blocked` |
| PRE-04 | Tester has a macOS machine or clean profile with microphone and Accessibility permission control. | macOS major/minor version, architecture, permission reset method. | `Blocked` |
| PRE-05 | Tester has neutral target surfaces with no private content visible. | Target app names and fixture category only. | `Blocked` |
| PRE-06 | Evidence storage location is approved for sanitized metadata only. | Link or ticket reference; no screenshots unless sanitized. | `Blocked` |

Current prerequisite blocker reasons:

- PRE-01: Mac source/build is not present in this repo.
- PRE-02: Approved non-production test account is human-held.
- PRE-03: Approved backend/provider service setup is human-held.
- PRE-04: Microphone and Accessibility checks require a human-controlled Mac.
- PRE-05: Neutral target surfaces require human target setup.
- PRE-06: Sanitized evidence storage location must be selected by the human run owner.

## Safe Target Apps

Run against at least five target surfaces when the build is ready. Use empty or
neutral documents only, with no customer data, private notes, private browser
tabs, private messages, production admin pages, real emails, or live billing
screens visible.

| Target category | Suggested app or surface | Required coverage |
| --- | --- | --- |
| Plain text editor | TextEdit or another empty plain-text editor | Direct insertion success, no focus stealing, multi-line output. |
| Rich text editor | Notes or Pages in a neutral local note/document | Direct insertion or documented fallback. |
| Browser text field | Local or staging test page with a neutral empty text area | Direct insertion, clipboard fallback, auth-safe route behavior. |
| Messaging-style field | A draft-only neutral field, not a real conversation | Focus retention, insertion failure recovery if the app blocks automation. |
| Email-style field | A draft-only neutral composer addressed to no one or a safe placeholder account | Focus retention, direct insertion or fallback, no accidental send. |
| Restricted target | Password field, secure input, read-only field, or unfocused desktop | Conservative failure state; no content inspection and no false success. |

Do not include private app/window titles, document names, URLs with sensitive
query strings, selected text, focused-field text, clipboard contents, or
screenshots of private applications in evidence.

## Manual QA Matrix

All rows are intentionally initialized to `Not Run`. Replace that status only
after a human executes the row against an approved build and records sanitized
evidence.

### 1. Install, Launch, And Account Gates

| ID | Scenario | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MAC-001 | First launch with no prior session | Launch RubyWhisper from the approved build on the test Mac/profile. | App opens as a menu bar utility, starts signed out or onboarding as appropriate, and does not enable dictation. | App version/build/channel, macOS version, initial state category. | `Not Run` |
| MAC-002 | Browser sign-in launch | Start sign-in from the app. | Browser sign-in opens through the approved web entry; app stays in login/onboarding state; no recording starts. | Auth state categories only: `login_launching`, `browser_pending`, or equivalent. | `Not Run` |
| MAC-003 | Successful sign-in handoff | Complete approved test-account sign-in. | App exchanges session, refreshes account, and maps to Terms, trial, paid, Friend, or blocked state without exposing auth material. | Account state category, request ID if returned, no tokens or links. | `Not Run` |
| MAC-004 | Sign-in cancel or timeout | Start sign-in, then cancel or let it expire. | App returns to signed-out recovery; dictation remains disabled; a fresh sign-in can be started. | State categories and timeout/cancel category. | `Not Run` |
| MAC-005 | Terms required gate | Use or simulate an account requiring Terms/Privacy acceptance. | Dictation remains disabled; recovery opens Terms/Privacy acceptance; no recording/upload occurs. | `terms_required` state category and recovery action. | `Not Run` |
| MAC-006 | Trial or subscription gate | Use or simulate trial exhausted or subscription required. | Dictation remains disabled; recovery routes to checkout/account; no provider work starts. | Plan-state category and recovery action only. | `Not Run` |
| MAC-007 | Payment failed or account blocked gate | Use or simulate payment failed and blocked account states. | Dictation remains disabled; recovery routes to billing/account; no audio capture or upload starts. | Plan-state category and recovery action only. | `Not Run` |
| MAC-008 | Logout | Sign out from settings/account surface. | Keychain session material is cleared; app returns to signed out; local non-secret preferences remain unless explicitly cleared. | Logout lifecycle categories only. | `Not Run` |

### 2. Microphone, Accessibility, And Onboarding

| ID | Scenario | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MAC-020 | Gate order | Start onboarding on a fresh profile. | App resolves sign-in/account/Terms before microphone, then microphone before Accessibility, then test whisper before `ready`. | Ordered state categories. | `Not Run` |
| MAC-021 | Microphone prompt accepted | Request microphone permission from onboarding. | System prompt appears at the right gate; accepting advances to Accessibility gate; no upload occurs during the prompt. | Permission category and check timestamp bucket. | `Not Run` |
| MAC-022 | Microphone denied or unavailable | Deny microphone or use an unavailable input path. | App shows microphone recovery with System Settings action; no audio capture, upload, transcript, or meter data persists. | Permission category and recovery action. | `Not Run` |
| MAC-023 | Accessibility trust accepted | Request or open Accessibility trust and grant RubyWhisper. | App detects trusted state through bounded polling or activation; proceeds to test whisper gate. | Trust category and check timestamp bucket. | `Not Run` |
| MAC-024 | Accessibility denied or policy blocked | Leave Accessibility untrusted or policy-blocked. | App shows Accessibility recovery; no insertion attempt, clipboard read, focused text read, or backend call occurs. | Trust category and recovery action. | `Not Run` |
| MAC-025 | Hotkey before onboarding ready | Press `Fn` and `Command+Fn` before onboarding reaches `ready`. | Onboarding or island refocuses the first unsatisfied gate; no recording starts and no upload occurs. | Gate category and recovery state. | `Not Run` |
| MAC-026 | Test whisper gate | Complete test whisper after all prior gates pass, using a neutral RubyWhisper-owned target. | Test whisper follows normal recording/upload/insertion/error mapping and enters `ready` only after success. | State path, duration bucket, request ID if returned. | `Not Run` |
| MAC-027 | Startup revalidation | Relaunch after prior onboarding completion. | App revalidates session, account, microphone, and Accessibility before enabling normal dictation. | Startup state categories and final readiness category. | `Not Run` |

### 3. Hotkeys And Recording Island

| ID | Scenario | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MAC-040 | Hotkey registration | Launch on a supported keyboard and inspect Hotkeys settings/status. | Hold `Fn` and toggle `Command+Fn` are available, or a visible degraded state names the affected binding category. | Binding availability categories and OS major/minor. | `Not Run` |
| MAC-041 | Hold-to-talk path | Focus a neutral text field, hold `Fn`, speak neutral test audio, release `Fn`. | Recording starts on key down, stops on key up, then proceeds to processing and insertion/recovery. | State path, target category, duration bucket. | `Not Run` |
| MAC-042 | Toggle path | Focus a neutral text field, press `Command+Fn`, speak neutral test audio, press `Command+Fn` again. | Recording starts, remains active hands-free, stops on second activation, then processes once. | State path, target category, duration bucket. | `Not Run` |
| MAC-043 | Toggle escape | While toggle recording is active, press `Fn` if the backend supports it. | Toggle stops where feasible; otherwise a documented limitation keeps `Command+Fn` and island stop as the stop controls. | Stop behavior category or limitation category. | `Not Run` |
| MAC-044 | Repeat handling | Hold or repeat the hotkey long enough to trigger key-repeat behavior. | State does not flap, create duplicate recordings, or upload multiple artifacts. | Recording count and state categories only. | `Not Run` |
| MAC-045 | Busy state | Press hotkeys while processing, uploading, inserting, or in unsafe retry recovery. | Existing island state remains authoritative; no second recording starts and no duplicate upload occurs. | Busy state category and upload count category. | `Not Run` |
| MAC-046 | Hotkey unavailable or conflict | Simulate or observe unavailable `Fn`, unavailable `Command+Fn`, or capture conflict. | App shows recoverable categorical state in island/settings; it does not silently choose an undocumented shortcut. | Binding category and reason category only. | `Not Run` |
| MAC-047 | Island visibility and focus | Start and stop recording over each target app. | Island appears immediately, remains floating/draggable, does not steal focus, and hides after success or recovery handoff. | Target category, focus-retained category, island state path. | `Not Run` |
| MAC-048 | Island state stability | Exercise recording, nearing limit, processing, inserting, success, and recovery states. | Compact states do not jump, resize unexpectedly, or cover more than user-placed island position. | Written result or cropped RubyWhisper-only UI capture. | `Not Run` |
| MAC-049 | Visualizer behavior | Record with live microphone input, then silence, stop, and permission loss if feasible. | Visualizer shows ephemeral input only while recording; it stops immediately outside recording states. | State categories and meter-present category only; no audio/waveform evidence. | `Not Run` |
| MAC-050 | Reduced motion | Enable macOS Reduce Motion and repeat a recording path. | Functional state cues remain visible; decorative motion is reduced; duration warning and stop controls still work. | Accessibility setting category and state path. | `Not Run` |

### 4. Duration Cap, Upload, Provider, And Recovery Failures

| ID | Scenario | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MAC-060 | Duration warning | Use a shortened approved test seam, or a human-approved long run, to pass the warning threshold. | Island enters `nearing_duration_limit` around the configured warning threshold and does not rely on color alone. | Timer profile category, warning threshold, state path. | `Not Run` |
| MAC-061 | Duration cap stop | Continue through the configured cap. | App stops capture, shows `duration_limit_reached`, deletes transient audio/request buffers, and requires a new whisper. | Timer profile category, duration limit, cleanup booleans. | `Not Run` |
| MAC-062 | Backend duration rejection | Submit or simulate an over-duration backend response through the approved path. | Desktop maps `duration_limit_reached` to start-new-whisper recovery and does not retry same audio. | Error code, desktop state, request ID if returned. | `Not Run` |
| MAC-063 | Upload success cleanup | Complete one normal recording and upload. | Upload starts only after recorder stop/seal; transient audio and request buffers are cleaned after terminal state. | Duration bucket, cleanup booleans, request ID if returned. | `Not Run` |
| MAC-064 | Signed-out during upload | Invalidate session or log out while upload is in flight if safely testable. | App cancels or ignores stale response, clears auth state, deletes audio buffers, and requires sign-in. | State path and cleanup booleans only. | `Not Run` |
| MAC-065 | Provider error | Simulate or trigger approved provider error. | App shows provider recovery; retry is offered only when duplicate provider/quota work is impossible. | Error code, retryable category, provider category, latency bucket. | `Not Run` |
| MAC-066 | Network error before bytes sent | Trigger local offline/failure before upload body starts. | App may allow one explicit retry if transient artifact remains in active memory/temp scope and no acceptance ambiguity exists. | Error code, acceptance category, retry availability. | `Not Run` |
| MAC-067 | Network timeout after bytes sent | Trigger timeout or disconnect after body transmission starts if safely testable. | App treats acceptance as ambiguous, deletes audio, and asks for a new whisper instead of replaying blindly. | Acceptance category and cleanup booleans. | `Not Run` |
| MAC-068 | Rate limit | Simulate or use approved test account to hit `rate_limited`. | App shows retry-after recovery and waits for delay/user action; no content diagnostics are logged. | Error code, retryAfter bucket, request count bucket. | `Not Run` |
| MAC-069 | Invalid audio | Simulate invalid or unreadable audio response. | App asks user to record again, deletes invalid artifact, and does not retry same payload. | Error code, duration bucket, cleanup booleans. | `Not Run` |
| MAC-070 | Service/internal error | Simulate `service_unavailable` and `internal_error`. | App shows generic recoverable state, uses support-safe request ID if available, and retries only within duplicate-risk rules. | Error code, retryable category, request ID if returned. | `Not Run` |

### 5. Insertion, Clipboard Fallback, And Target Apps

| ID | Scenario | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MAC-080 | Direct insertion across target apps | Complete one successful recording per safe target app. | Final text lands in the focused target where supported; app records success only when insertion is known or reasonably inferred. | Target category, insertion status, duration/latency bucket. | `Not Run` |
| MAC-081 | No focused text field | Start a recording with no acceptable text target, if allowed by gates. | App fails conservatively into `insertion_unavailable`; no focused-field contents are read; local recovery is available. | Target category and insertion state only. | `Not Run` |
| MAC-082 | Secure or read-only target | Attempt insertion into a secure, read-only, or unsupported neutral target. | App does not inspect content and does not claim insertion success; fallback or recovery is shown. | Target category and recovery state. | `Not Run` |
| MAC-083 | Clipboard fallback copy | Force direct insertion failure after final text exists. | App copies final text to pasteboard for user paste recovery and labels it as copied, not inserted. | Fallback state and pasteboard ownership category only. | `Not Run` |
| MAC-084 | Clipboard restore success | Use supported previous pasteboard data, then fallback copy. | Previous pasteboard is restored only if RubyWhisper still owns its fallback pasteboard entry. | Restoration result category and timing bucket. | `Not Run` |
| MAC-085 | Clipboard restore skipped | Change pasteboard after fallback or use unsupported pasteboard data. | App skips restoration without inspecting, logging, or persisting previous clipboard contents. | Restoration skipped category. | `Not Run` |
| MAC-086 | Manual copy recovery | Copy from an approved local recovery surface or Recent Wisprs. | User-requested copy works locally and does not call transcription or backend again. | Recovery action category and backend-call category. | `Not Run` |
| MAC-087 | Fallback privacy | Inspect logs or diagnostics after fallback paths. | Logs contain only categorical/numeric metadata and no clipboard contents, prior clipboard snapshot, target text, or final text. | Search command/result summary or logger assertion. | `Not Run` |

### 6. Recent Wisprs, Dictionary, Settings, And Account Surfaces

| ID | Scenario | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MAC-100 | Recent Wispr after insertion | Complete a successful dictation with local history enabled. | A local Recent Wispr is created only after final text exists, with status `inserted` and 7-day default expiry. | Count, insertion status, created/expires timestamps. | `Not Run` |
| MAC-101 | Recent Wispr after insertion failure | Force insertion failure after final text exists. | A local Recent Wispr or recovery item is available with `insertion_failed`; no retranscription is required. | Count and insertion status only. | `Not Run` |
| MAC-102 | No Recent Wispr for no-final-text failures | Trigger signed-out, permission, duration, provider, invalid-audio, and canceled paths. | No Recent Wispr is created when final text does not exist. | Failure category and local history count. | `Not Run` |
| MAC-103 | Recent Wisprs retention | Use an approved clock/test seam or manual inspection to verify expiry. | Entries expire after 7 days by default and cleanup runs at required triggers. | Timestamp metadata and cleanup count. | `Not Run` |
| MAC-104 | Clear and disable history | Clear history, then disable local history and complete another dictation. | Clear deletes local entries; disabled history prevents future persistent writes; no backend call occurs. | Counts, setting category, backend-call category. | `Not Run` |
| MAC-105 | Dictionary add/edit/delete | Add, edit, duplicate-reject, disable, and delete synthetic terms. | Terms are local-only, validated, never Keychain/server-backed, and deletion removes them from future payloads. | Counts and validation outcome categories only. | `Not Run` |
| MAC-106 | Dictionary payload gating | Dictate with cleanup enabled/disabled and dictionary support enabled/disabled. | `dictionaryTerms` is sent only when Terms accepted, cleanup enabled, dictionary enabled, and valid active terms exist; otherwise omitted. | Payload-shape category from redacted instrumentation. | `Not Run` |
| MAC-107 | Settings surfaces | Open settings for account, hotkeys, cleanup, history, dictionary, provider/privacy. | Settings show current metadata/status without exposing secrets, transcript content, clipboard content, or unsupported customization. | Surface names and status categories. | `Not Run` |
| MAC-108 | Account surface | Open account or billing-related surface for trial, paid, Friend, exhausted, payment failed, and blocked states where available. | Account state maps to canonical plan states and recovery actions; no card details or auth material appear in evidence. | Plan-state category and recovery action. | `Not Run` |
| MAC-109 | Provider/settings secrets boundary | Inspect app bundle/settings/logs for provider-secret exposure where the implementation provides a safe check. | Desktop app does not contain Groq, Stripe, Supabase service-role, Clerk secret, signing, or private env values. | Search/check summary only; no values. | `Not Run` |

### 7. Privacy Storage, Logging, And Evidence Review

| ID | Scenario | Steps | Expected result | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MAC-120 | Server-side content storage check | Inspect approved backend metadata/log/storage after test requests. | Backend stores metadata only; no audio, raw transcript, cleaned text, context, clipboard, dictionary terms, prompts, or provider payloads persist. | Table/log names, row counts, allowed metadata categories. | `Not Run` |
| MAC-121 | Local audio cleanup check | Inspect approved local temp/app storage after terminal success, failure, cancel, logout, and relaunch. | Transient audio/request buffers are deleted or released; no audio history or content-derived filenames remain. | Cleanup booleans and storage category only. | `Not Run` |
| MAC-122 | Local content storage check | Inspect Keychain, preferences, Application Support, caches, and local history boundaries with approved tooling. | Keychain contains only session material; Recent Wisprs contains final text only; dictionary remains local; no forbidden content appears outside approved local stores. | Store categories and counts only. | `Not Run` |
| MAC-123 | Log and crash-reporting privacy | Exercise success and failure paths with debug/crash logging configured as approved. | Logs and events contain only allowed metadata: request ID, state/error code, plan state, duration, word count, latency, provider category, app/OS version. | Logger search summary and event category list. | `Not Run` |
| MAC-124 | Evidence packet review | Review all notes, attachments, screenshots, recordings, and command output before posting. | Evidence contains only allowed metadata and sanitized UI; forbidden content is removed before Linear/PR handoff. | Reviewer initials or owner category, evidence packet status. | `Not Run` |

## Runnable-Now Documentation Checks

These checks can run before the Mac source exists. They validate the harness
document only and do not execute manual QA.

| ID | Check | Command or method | Expected result | Status |
| --- | --- | --- | --- | --- |
| DOC-001 | Markdown diff whitespace | `git diff --check` | No whitespace errors. | `Not Run` |
| DOC-002 | Secret/private-content search | Targeted `rg` over changed docs for forbidden tokens and content categories. | Matches are only policy references or placeholder names, not values/private content. | `Not Run` |
| DOC-003 | False-pass search | Search changed docs for `Pass` usage and manual result claims. | No manual QA row is marked `Pass`; all default manual rows are `Not Run` or `Blocked`. | `Not Run` |
| DOC-004 | Source/test scope confirmation | `git diff --name-only` | Docs-only change; no source/test command required. | `Not Run` |

## Blocked Manual Checks

Safe Linear handoff language:

```text
RUB-64/RW-073 produced the repo-owned macOS manual QA harness and sanitized
evidence template only. Manual macOS QA was not executed. Remaining blockers:
Mac app source/build is not present in this repo, approved test accounts and
non-production service credentials are human-held, microphone and Accessibility
permission checks require a human-controlled Mac, and live provider/backend
validation requires approved service setup. Downstream RW-100, RW-102, RW-107,
and paid-beta launch gates remain blocked/not-run until a human completes the
manual matrix and records sanitized evidence.
```

## Sanitized Evidence Template

Copy this template into the manual QA ticket or PR after a human run. Leave rows
as `Not Run` or `Blocked` when they were not executed.

```text
## macOS Manual QA Evidence

Run owner:
Run date:
Issue:
Build/app version:
Build/channel:
Git commit or artifact ID:
macOS version:
Architecture:
Test machine category:
Backend environment category:
Provider category:
Account category:
Target app categories:

### Scope
- Executed rows:
- Not-run rows:
- Blocked rows:
- Out-of-scope rows:

### Results Summary
- Pass:
- Fail:
- Blocked:
- Not Run:
- N/A:

### Row Evidence
| Row ID | Status | Target category | State/error categories | Recovery action | Allowed metadata | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| MAC-___ | Not Run |  |  |  |  |  |

### Privacy Review
- [ ] No audio files, audio snippets, waveform histories, or real speech
      artifacts are attached.
- [ ] No raw transcript, cleaned text, dictated text, prompt, context,
      dictionary term, Recent Wispr content, clipboard content, focused-field
      text, selected text, destination app text, URLs with private data, or
      private screenshots are included.
- [ ] No auth material, magic links, session values, tokens, cookies,
      authorization headers, private env values, provider keys, billing/card
      details, provider payloads, request bodies, response bodies, or multipart
      boundaries are included.
- [ ] Any screenshots or videos are cropped to RubyWhisper-owned UI and neutral
      placeholder surfaces only, or omitted.
- [ ] Logs and command outputs are summarized as pass/fail plus allowed
      categorical/numeric metadata only.

### Allowed Metadata Captured
- requestId values, if opaque and support-safe:
- errorCode / desktopState / islandState:
- recordingMode:
- target app category:
- insertionStatus / fallback state:
- duration bucket or numeric duration metadata:
- warning/cap timer profile:
- retryable / retryAfter bucket:
- provider category:
- providerLatencyMs / totalLatencyMs buckets:
- planState and usage counters:
- app version/build/channel:
- macOS major/minor and architecture:
- cleanup booleans:
- local store counts and retention timestamps:

### Forbidden Content Confirmation
- Audio/transcripts/clipboard/auth/private env/provider payloads checked:
- Screenshots/videos reviewed:
- Logs reviewed:
- Local storage reviewed:
- Backend storage/logs reviewed:

### Failures Or Follow-Ups
| Row ID | Finding | Classification | Follow-up issue | Launch impact |
| --- | --- | --- | --- | --- |
|  |  | broken existing behavior / missing parity / new scope / launch blocker / beta limitation |  |  |

### Remaining Blockers
- None recorded yet.
```

## Allowed And Forbidden Evidence

Allowed:

- Row IDs, status values, state names, recovery actions, and error codes.
- Opaque request IDs returned by RubyWhisper.
- App version, build, channel, platform, macOS major/minor, and architecture.
- Target app category, not private document/window/title/content.
- Recording mode, duration metadata, timer profile category, and latency
  buckets or numeric latency values.
- Plan-state category, usage counters, retry-delay buckets, and cleanup
  booleans.
- Local store counts, retention timestamps, insertion status, fallback state,
  permission category, and trust category.
- Cropped screenshots/videos only when they show RubyWhisper-owned UI and
  neutral placeholder surfaces with no private content.

Forbidden:

- Recorded audio, real speech artifacts, waveform histories, persisted meter
  traces, audio filenames containing user content, or audio fixtures.
- Raw transcript, cleaned text, dictated text, cleanup prompts, provider
  request/response bodies, context, dictionary terms, Recent Wisprs content,
  clipboard contents, previous clipboard snapshots, selected text, focused-field
  text, destination app content, URLs containing private data, or screenshots of
  private apps.
- Auth material, magic links, session tokens, cookies, authorization headers,
  exchange codes, nonce verifiers, private env values, provider keys, signing
  material, billing/card details, request bodies, response bodies, multipart
  boundaries, crash dumps containing sensitive data, or logs with body content.
- Claims that RUB-64/RW-073, RW-100, RW-102, RW-107, paid beta launch, live
  provider validation, clean-Mac validation, or manual privacy audit is complete
  unless the relevant human-run evidence exists.
