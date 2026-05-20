# RubyWhisper Direct-Download Mac Beta Release Runbook

This runbook is the source checklist for a future human-owned RubyWhisper Mac
beta release. It bounds the sequence from a reviewed source commit through a
signed, notarized, attributed artifact and clean-Mac validation.

It is intentionally placeholder-only. Do not paste Apple account values,
certificate private keys, notary tokens, Sparkle private keys, keychain
passwords, appcast signing keys, or private environment values into this file,
Linear, PRs, release notes, or command output.

## Scope

- Target distribution: direct download from the RubyWhisper website.
- Target artifact: Developer ID signed and notarized `.dmg` containing
  `RubyWhisper.app` and an `Applications` symlink to `/Applications`.
- Update channel: RUB-104A source-level direct-download feed config first;
  Sparkle 2 appcast metadata remains a future release-channel option until a
  later ticket replaces or extends the current contract.
- Future/later: Mac App Store packaging, TestFlight, and production appcast
  publication automation.

This runbook does not authorize autonomous release actions. A human release
owner must perform or approve every step marked `Human gate`.

## Source References

- `TECHNICAL_SPEC.md`: `FR-040 Signing/notarization` and `FR-041 Auto-update`.
- `TECHNICAL_INFRASTRUCTURE.md`: `Deployment And Packaging` and
  `Direct-Download macOS Release Spike`.
- `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`: production web/backend gates,
  public Mac download URL, and appcast/update-channel gates.
- `docs/setup.md`: secret storage rules and service setup checklist.
- `docs/FREEFLOW_AUDIT_RUB_24.md` and `RESEARCH_LOG.md`: selected-base audit,
  FreeFlow MIT attribution requirements, current ad hoc signing evidence, and
  import/rebrand notes.
- RUB-27 / RW-016: Apple signing, notarization, and updater spike.
- RUB-310 / RW-104A: source-level update channel configuration.
- RUB-78 / RW-105: future signed/notarized release artifact ticket.

## Remaining Blockers

- Public direct-download update channel is not configured yet.
- Apple Developer credentials and certificate private keys are human-held.
- Notarization submission and stapling have not been run for RubyWhisper.
- Release artifact checksum and version notes cannot be finalized until a
  human-approved, Developer ID signed and notarized artifact exists. The local
  `make -C apps/macos dmg CODESIGN_IDENTITY=-` helper can validate the DMG
  shape without producing a release artifact.
- Clean-Mac install/open QA remains manual and cannot be completed from this
  docs-only ticket.

## RUB-104A Source-Level Update Channel Contract

The imported macOS app currently has a source-safe direct-download updater
contract. It is not a public release channel by itself.

Source config:

- `RubyWhisperUpdateChannelEnabled`: non-secret `Info.plist` boolean. Default:
  `false`.
- `RubyWhisperUpdateReleasesURL`: non-secret `Info.plist` HTTPS JSON release
  feed URL. Default: empty string.
- `UPDATE_CHANNEL_ENABLED`: non-secret Makefile override that writes
  `RubyWhisperUpdateChannelEnabled` into the built bundle.
- `UPDATE_RELEASES_URL`: non-secret Makefile override that writes
  `RubyWhisperUpdateReleasesURL` into the built bundle.

Runtime contract:

- The update channel is enabled only when
  `RubyWhisperUpdateChannelEnabled=true` and `RubyWhisperUpdateReleasesURL`
  parses as HTTPS.
- A URL alone does not enable update checks.
- Development builds with no `RubyWhisperBuildTag` skip automatic checks, but a
  user-initiated check may fetch the configured feed.
- The current feed reader accepts a GitHub releases-style JSON array with
  semantic `tag_name` values and `.dmg` assets whose `browser_download_url`
  points at the direct-download artifact.
- `https://updates.example.test/releases.json` is documentation and test
  fixture syntax only. Do not treat it as a live RubyWhisper channel.

Public/non-secret values:

- The two `Info.plist` keys, the two Makefile override names, semantic app
  version/build identifiers, and an approved public HTTPS feed URL after human
  release approval.

Human-gated secret or production values:

- Apple Developer signing identities and certificate private keys.
- App Store Connect notarization key IDs, issuer IDs, `.p8` files, passwords,
  and keychain profile details.
- Sparkle private keys or any appcast/update signing credential if Sparkle is
  added later.
- Release upload tokens, appcast publication credentials, and any private
  release machine paths.
- The first approved public feed URL, public artifact URL, and first live
  update check.

Agents may document and validate the source-safe contract. Agents must not set
the public feed URL, publish releases, upload artifacts, run live public update
checks, or handle release credentials.

## Roles And Human Gates

Required Apple access:

- Apple Developer Program Account Holder: required to create Developer ID
  certificates through the Apple Developer account.
- Apple Developer or App Store Connect Admin with approved certificate access:
  may help manage signing assets according to the team's Apple access policy.
- App Store Connect Admin: required to create a team App Store Connect API key
  for `notarytool` automation.
- Release owner: approved RubyWhisper human who controls the release machine,
  signing keychain, notary credentials, Sparkle private key, checksum notes, and
  clean-Mac QA evidence.

Human gate: do not create, export, rotate, revoke, import, or use Apple
certificates, notary credentials, keychain profiles, Sparkle private keys, or
production appcast publication credentials without explicit release-owner
approval.

Human gate: do not produce, upload, publish, replace, or announce a public Mac
artifact without explicit release-owner approval.

## Placeholder Inventory

Use these names in scripts, CI settings, or operator checklists only as
placeholders. Store real values only in the approved release machine Keychain,
Apple Developer/App Store Connect, or the approved release secret manager. Keep
`.env.example` blank or placeholder-only. Do not store release secrets in git.

| Placeholder | Purpose | Storage rule |
| --- | --- | --- |
| `<APPLE_TEAM_ID>` | Apple Developer Team ID for signing and notarization | Non-secret release config if needed |
| `<APPLE_BUNDLE_ID>` | Stable RubyWhisper bundle identifier | Non-secret release config |
| `<DEVELOPER_ID_APPLICATION_IDENTITY>` | Developer ID Application signing identity | Release machine Keychain or approved CI signing secret |
| `<DEVELOPER_ID_INSTALLER_IDENTITY>` | Developer ID Installer identity, only if a `.pkg` is added later | Release machine Keychain or approved CI signing secret |
| `<NOTARY_KEY_ID>` | App Store Connect API key ID for notarization | Approved release secret manager |
| `<NOTARY_ISSUER_ID>` | App Store Connect issuer ID | Approved release secret manager |
| `<NOTARY_KEY_PATH>` | Local path to the `.p8` API key on the release machine | Release machine only; never repo-relative |
| `<NOTARY_KEYCHAIN_PROFILE>` | `notarytool` keychain profile name | Release machine Keychain |
| `<SPARKLE_PUBLIC_ED_KEY>` | Public Sparkle EdDSA key embedded in app metadata | Source-safe app config after updater implementation |
| `<SPARKLE_PRIVATE_ED_KEY>` | Private Sparkle EdDSA key for appcast/update signing | Release machine Keychain or approved release secret manager |
| `<APPCAST_URL>` | HTTPS beta appcast URL | Non-secret release config after update channel approval |
| `<DOWNLOAD_URL>` | HTTPS artifact download URL | Public web config after artifact approval |
| `<UPDATE_RELEASES_URL>` | RUB-104A HTTPS JSON release feed URL for `RubyWhisperUpdateReleasesURL` | Non-secret release config only after update channel approval |
| `<APP_VERSION>` | Marketing version, for example `CFBundleShortVersionString` | Source or release config |
| `<BUILD_NUMBER>` | Monotonic build number, for example `CFBundleVersion` | Source or release config |
| `<ARTIFACT_SHA256>` | Published checksum for the approved artifact | Release notes after artifact exists |

`APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN` in `docs/setup.md` and
`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` remains a generic server-only release
or appcast publication secret placeholder. Prefer narrower names in future
release automation once the macOS source and update channel exist.

## Prerequisites

- The target source commit is reviewed, merged or intentionally selected, and
  clean in git.
- The macOS import/rebrand ticket has produced a repo-local app build entry
  point, final app name, bundle identifier, icon, entitlements, version keys,
  and release build command.
- The RUB-104A update feed contract is either disabled for the release or
  configured through an approved public `RubyWhisperUpdateReleasesURL`; Sparkle
  remains future/later unless a later ticket adds it.
- `TECHNICAL_SPEC.md`, `TECHNICAL_INFRASTRUCTURE.md`, `docs/setup.md`, and this
  runbook agree on the release path.
- FreeFlow MIT attribution and any other third-party notices are present in
  source and copied into the distributed app.
- The release owner has an approved release machine or CI environment with
  Xcode command line tools, signing assets, notary credentials, packaging tools,
  update-feed tooling, optional Sparkle tools if Sparkle is later added, and
  HTTPS upload access.

Human gate: confirm the release owner has approved every credential and upload
target before continuing.

## Release Sequence

### 1. Select Source Commit

Human gate: select the exact source commit. Record the commit SHA, branch, date,
release owner, and intended beta channel in private release notes or the release
tracking ticket.

Placeholder-only commands:

```bash
git fetch origin
git checkout <RELEASE_BRANCH_OR_TAG>
git status --short --branch
git rev-parse HEAD
```

Stop if the worktree is dirty, the selected commit is not approved, or the
macOS source import/rebrand blockers remain unresolved.

### 2. Confirm Version And Attribution

Confirm version metadata before building:

- `CFBundleShortVersionString` equals `<APP_VERSION>`.
- `CFBundleVersion` equals `<BUILD_NUMBER>` and is monotonically increasing for
  Sparkle.
- Bundle identifier equals `<APPLE_BUNDLE_ID>`.
- App display name, executable name, icons, update URLs, support URLs, OSLog
  labels, app support paths, and visible FreeFlow strings have been intentionally
  rebranded or retained with attribution.

Attribution checklist:

- Preserve the upstream FreeFlow MIT license notice in source.
- Include third-party notices in the distributed app, such as
  `RubyWhisper.app/Contents/Resources/ThirdPartyNotices.md`, an
  About/Acknowledgments surface, or both.
- Verify the bundled notice was copied from
  `apps/macos/Resources/ThirdPartyNotices.md` for the exact build under review.
- Confirm release notes and website copy do not imply FreeFlow maintainer
  endorsement.
- Re-check imported dependencies and build tools for any added license notices.
- Confirm FreeFlow demo media, website assets, GitHub release URLs, update URLs,
  and public workflow names are not shipped accidentally.

Human gate: release owner signs off on attribution before building a public beta
artifact.

### 3. Prepare Signing And Notary Credentials

Human gate: release owner prepares the release keychain and notary profile.
Agents must not run these commands with real values.

Placeholder-only commands:

```bash
security find-identity -v -p codesigning <RELEASE_KEYCHAIN>
xcrun notarytool store-credentials "<NOTARY_KEYCHAIN_PROFILE>" \
  --key "<NOTARY_KEY_PATH>" \
  --key-id "<NOTARY_KEY_ID>" \
  --issuer "<NOTARY_ISSUER_ID>"
```

Expected prerequisites:

- Developer ID Application certificate and private key are available in the
  release keychain.
- Developer ID Installer certificate exists only if the artifact changes to a
  signed `.pkg`.
- Hardened Runtime and required entitlements are configured for release builds.
- Notary credentials are stored in Keychain or the approved release secret
  manager, not in repository files.
- Sparkle private key is stored outside git; only `<SPARKLE_PUBLIC_ED_KEY>`
  belongs in source/app metadata.

### 4. Build And Sign

Human gate: the release owner runs the final release build command only after a
release-packaging ticket defines that path. The current repo-local macOS
development command is Makefile-based:

```bash
make -C apps/macos clean all CODESIGN_IDENTITY=-
```

That command creates an ad hoc local app bundle for development only; it is not
a signed release, notarized artifact, or DMG.

The Makefile also exposes a local/ad hoc DMG helper:

```bash
make -C apps/macos dmg CODESIGN_IDENTITY=-
```

That helper is for source-side drag-install shape checks only. It preflights
the non-secret `create-dmg` and `fileicon` tools, packages an ad hoc app, and
must not be treated as a release artifact.

Placeholder-only Xcode-style release flow, not a current local development
command:

```bash
xcodebuild archive \
  -workspace <RUBYWHISPER_WORKSPACE> \
  -scheme <RUBYWHISPER_SCHEME> \
  -configuration Release \
  -archivePath <ARCHIVE_PATH> \
  DEVELOPMENT_TEAM="<APPLE_TEAM_ID>" \
  CODE_SIGN_IDENTITY="<DEVELOPER_ID_APPLICATION_IDENTITY>"

xcodebuild -exportArchive \
  -archivePath <ARCHIVE_PATH> \
  -exportPath <EXPORT_DIR> \
  -exportOptionsPlist <EXPORT_OPTIONS_PLIST>
```

Placeholder-only Makefile-style flow, if the imported base keeps that path:

```bash
make release \
  APP_NAME="RubyWhisper" \
  BUNDLE_ID="<APPLE_BUNDLE_ID>" \
  VERSION="<APP_VERSION>" \
  BUILD_NUMBER="<BUILD_NUMBER>" \
  CODESIGN_IDENTITY="<DEVELOPER_ID_APPLICATION_IDENTITY>"
```

Stop if signing falls back to ad hoc signing, Hardened Runtime is missing, or
the signed app fails local signature verification.

The repo Makefile `codesign-dmg` target is also guarded: it must fail when
`CODESIGN_IDENTITY` is empty, ad hoc (`-`), placeholder-like, not a
`Developer ID Application` identity, or not installed in the active keychain
search list. Agents may validate those source-safe failure paths, but must not
provide or use real Developer ID identities.

Placeholder-only verification:

```bash
codesign --verify --deep --strict --verbose=2 "<EXPORT_DIR>/RubyWhisper.app"
spctl --assess --type execute --verbose=4 "<EXPORT_DIR>/RubyWhisper.app"
```

### 5. Package Artifact

Human gate: create the production artifact only on the approved release machine
or approved CI release environment.

Do not substitute `make -C apps/macos dmg CODESIGN_IDENTITY=-` for this step.
That Makefile target creates a local/ad hoc testing DMG only and intentionally
does not Developer ID sign, notarize, staple, upload, publish, configure public
URLs, or satisfy clean-Mac release QA.

Expected `.dmg` shape:

- Contains exactly `RubyWhisper.app` plus an `/Applications` symlink unless a
  future release ticket approves extra files.
- Uses RubyWhisper branding and versioned artifact naming.
- Preserves third-party notices inside the `.app`.
- Is created from a Developer ID signed app, not an ad hoc local build.

Placeholder-only command:

```bash
create-dmg \
  --volname "RubyWhisper <APP_VERSION>" \
  --app-drop-link 500 185 \
  "<ARTIFACT_DIR>/RubyWhisper-<APP_VERSION>-<BUILD_NUMBER>.dmg" \
  "<EXPORT_DIR>/RubyWhisper.app"
```

If the release process uses another packager, document the exact command in the
future release ticket and preserve the artifact shape above.

### 6. Notarize, Staple, And Validate

Human gate: submit the artifact to Apple's notary service. This cannot be done
by an autonomous agent without explicit credential approval.

Placeholder-only commands:

```bash
xcrun notarytool submit \
  "<ARTIFACT_DIR>/RubyWhisper-<APP_VERSION>-<BUILD_NUMBER>.dmg" \
  --keychain-profile "<NOTARY_KEYCHAIN_PROFILE>" \
  --wait

xcrun stapler staple \
  "<ARTIFACT_DIR>/RubyWhisper-<APP_VERSION>-<BUILD_NUMBER>.dmg"

xcrun stapler validate \
  "<ARTIFACT_DIR>/RubyWhisper-<APP_VERSION>-<BUILD_NUMBER>.dmg"

spctl --assess --type open --verbose=4 \
  "<ARTIFACT_DIR>/RubyWhisper-<APP_VERSION>-<BUILD_NUMBER>.dmg"
```

Record the sanitized notary status and submission ID in private release notes or
the release tracking ticket. Do not paste credential material or full logs if
they contain local paths, account identifiers, or private details.

The repo Makefile `notarize` target must fail fast when `NOTARIZE_PROFILE` is
missing or placeholder-like, when local `notarytool`/`stapler` are unavailable,
or when the expected DMG path is absent. A passing preflight still does not
authorize autonomous notarization; release-owner approval and credentials remain
the controlling human gate.

### 7. Sparkle Appcast Preparation

Human gate: public feed/appcast signing and publication require release-owner
approval.

### 7A. Mock/Staging Update Feed Validation

This path validates the RUB-104A source contract without publishing a public
channel and without running a live public update check.

Repo-local validation:

```bash
make -C apps/macos test-update-manager
make -C apps/macos clean all \
  CODESIGN_IDENTITY=- \
  UPDATE_CHANNEL_ENABLED=true \
  UPDATE_RELEASES_URL=https://updates.example.test/releases.json
plutil -p apps/macos/build/RubyWhisper.app/Contents/Info.plist | \
  rg "RubyWhisperUpdate(ChannelEnabled|ReleasesURL)"
```

Expected evidence:

- `test-update-manager` passes using synthetic fixture data and injected feed
  loading.
- The built bundle contains `RubyWhisperUpdateChannelEnabled => true`.
- The built bundle contains
  `RubyWhisperUpdateReleasesURL => "https://updates.example.test/releases.json"`.
- No real RubyWhisper public URL, release token, signing identity, notary
  credential, Sparkle private key, or private environment value appears in the
  output, commit, PR text, or Linear workpad.

Optional staging-only validation, if a future issue provides an approved
non-public HTTPS feed:

- Use only an approved staging URL in `UPDATE_RELEASES_URL`.
- The staging feed must be GitHub releases-style JSON with semantic tags and a
  `.dmg` asset URL that points to a staging-only artifact.
- Record only sanitized metadata: feed host classification, app version/build,
  artifact filename, expected update version, pass/fail result, and the fact
  that no public channel was used.
- Do not run a live check against a public production feed from this ticket.

### 7B. Live/Manual Update Feed Path

This path is separate from mock/staging validation and remains human-gated.

Before live feed work:

- Release owner approves the public feed URL for `RubyWhisperUpdateReleasesURL`
  and the public artifact URL used by the release feed.
- Release owner confirms signing, notarization, checksum, attribution, and
  clean-Mac QA evidence are complete for the artifact referenced by the feed.
- The selected app build has an approved `RubyWhisperBuildTag` matching the
  release tag so automatic checks can identify the current build.
- A human performs the first live manual update check and records sanitized
  evidence before RUB-77 is accepted.

For a future Sparkle appcast implementation, before appcast work:

- App metadata includes `SUFeedURL`, `SUPublicEDKey`, and an increasing
  `CFBundleVersion`.
- `<APPCAST_URL>` is HTTPS and approved for the beta channel.
- `<SPARKLE_PRIVATE_ED_KEY>` is available only to the release owner or approved
  release automation.
- Download archive URL, length, version, short version, EdDSA signature, release
  notes URL, and minimum macOS version are correct.

Placeholder-only commands:

```bash
./path/to/Sparkle/bin/generate_appcast <UPDATES_DIR>
./path/to/Sparkle/bin/sign_update \
  "<ARTIFACT_DIR>/RubyWhisper-<APP_VERSION>-<BUILD_NUMBER>.dmg"
```

Do not publish `appcast.xml`, rotate Sparkle keys, change public update URLs, or
replace update archives without human approval. Keep older update archives long
enough to test update-forward recovery.

### 8. Checksum, Notes, And Upload

Human gate: upload and public URL changes require release-owner approval.

Placeholder-only commands:

```bash
shasum -a 256 "<ARTIFACT_DIR>/RubyWhisper-<APP_VERSION>-<BUILD_NUMBER>.dmg"
```

Release notes should record:

- Source commit SHA.
- `<APP_VERSION>` and `<BUILD_NUMBER>`.
- Artifact filename and approved `<DOWNLOAD_URL>`.
- `<ARTIFACT_SHA256>`.
- Notary result and stapling validation status, sanitized.
- Attribution checklist status.
- Update feed/appcast status, or a clear note that auto-update is deferred.
- Known blockers or beta limitations.

Do not upload until attribution, signing, notarization, stapling, checksum, and
clean-Mac QA gates are all accounted for.

### 9. Clean-Mac Validation

Human gate: clean-Mac QA must be performed by a human on a machine or profile
that preserves download quarantine.

Minimum clean-Mac checklist:

- Download from `<DOWNLOAD_URL>` through a browser or `curl` path that preserves
  quarantine behavior for the chosen test.
- Confirm quarantine attribute is present before opening, if the test path is
  expected to preserve it.
- Open the `.dmg`, drag `RubyWhisper.app` to `/Applications`, and launch from
  `/Applications`.
- Confirm no Gatekeeper malware, unidentified developer, damaged app, or
  notarization warning appears.
- Confirm first-launch permission prompts are expected and branded.
- Confirm app version/build match the release notes.
- Confirm third-party notices or About/Acknowledgments are present.
- If the update channel is enabled, verify update check behavior against the
  approved beta feed/appcast without publishing an unintended newer update.
- Record macOS version, architecture, test account type, download URL,
  artifact checksum, and pass/fail notes in the release tracking ticket.

Stop the release if Gatekeeper blocks the app, notarization is not stapled or
online-verifiable, attribution is missing, or the update feed/appcast points at
the wrong artifact.

## Evidence Required Before RUB-77 Acceptance

RUB-77 can accept the direct-download update channel only after sanitized
evidence shows both the source-safe path and the human-gated live path are
covered.

Required source/mock evidence:

- `make -C apps/macos test-update-manager` passes.
- A configured mock build writes `RubyWhisperUpdateChannelEnabled=true` and a
  non-production HTTPS `RubyWhisperUpdateReleasesURL` into the bundle.
- The release feed parser selects a newer semantic release from synthetic or
  approved staging JSON without touching a public channel.
- Default builds leave updates disabled.

Required human/live evidence:

- Release owner approval for the public update feed URL and public artifact
  URL.
- Developer ID signing, notarization submission, stapling, checksum,
  attribution, and clean-Mac launch evidence for the artifact referenced by the
  feed.
- Sanitized first-live-update evidence that records macOS version,
  architecture, app version/build, update feed classification, offered update
  version, artifact filename, checksum match, and pass/fail result.
- Confirmation that no signing/notarization credentials, release tokens,
  private keys, private env values, private release notes, or unapproved
  production URLs were written to repo files, PR text, Linear comments, or
  command output.

## Autonomous Agent Boundaries

Agents may:

- Update docs, placeholder scripts, and source-safe release checklists.
- Verify file references and run docs-only validation.
- Search changed docs for secret-looking values and record sanitized results.

Agents must not:

- Inspect `.env.local` or private environment sources.
- Read, print, or summarize Apple credentials, private keys, keychains,
  profiles, notary tokens, Sparkle private keys, appcast signing secrets, or
  private release notes.
- Run release archive/export, production signing, notarization submission,
  stapling, Sparkle signing, appcast publication, upload, or clean-Mac install
  checks unless a future issue explicitly provides a safe, approved, non-secret
  path.
- Produce or upload a downloadable beta artifact.
- Mark RUB-78 / RW-105 fully done from this docs-only runbook.
