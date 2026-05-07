# RubyWhisper macOS Source Import

This directory contains the selected macOS harness source imported for RUB-220 / RW-060A.

## Upstream Source

- Upstream repository: `https://github.com/zachlatta/freeflow`
- Imported commit: `b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c`
- Upstream license: MIT, preserved in `LICENSE`
- ADR: `docs/adr/ADR-001-freeflow-import-decision.md`

## Import Method

The import was made from a fresh clone of the pinned upstream commit in ignored `tmp/freeflow-rub-220`, then copied into `apps/macos`.

Imported app source and build inputs:

- `Sources/**`
- `Makefile`
- `Info.plist`
- `FreeFlow.entitlements`, renamed to `RubyWhisper.entitlements` during the
  RUB-222 metadata rebrand
- `Resources/AppIcon-*.png`
- `Resources/AppIcon*.icns`
- `Resources/ThirdPartyNotices.md`
- `.gitignore`
- `LICENSE`

Excluded upstream surfaces and local/runtime content:

- `.git/**`
- `.github/**`
- `.agents/**`
- `website/**`
- upstream `README.md`
- upstream `CHANGELOG.md`
- `Resources/demo.gif`
- build products such as `build/**`
- private env files, logs, `.tools/**`, and local scratch/runtime files

## Build Status

RUB-221 / RW-060B established the repo-local macOS build command contract after
the RUB-220 import.

Authoritative local Debug/ad hoc build command from the repository root:

```bash
make -C apps/macos clean all CODESIGN_IDENTITY=-
```

The Makefile is the local development build entrypoint. It uses direct `swiftc`
compilation, copies `Info.plist`, icons, and `Resources/ThirdPartyNotices.md`
into the app bundle, and signs with the provided `CODESIGN_IDENTITY`. Passing
`CODESIGN_IDENTITY=-` selects ad hoc signing, which is the repeatable local
developer path.

Ad hoc signatures can change after each rebuild, so macOS may keep a stale
Accessibility or Input Monitoring grant for an older local app binary. If
System Settings shows RubyWhisper enabled but the app still reports missing
Accessibility/global shortcut access, reset the local entries and re-add the
current app bundle:

```bash
tccutil reset Accessibility com.rubyadvisory.rubywhisper.dev
tccutil reset ListenEvent com.rubyadvisory.rubywhisper.dev
tccutil reset ScreenCapture com.rubyadvisory.rubywhisper.dev
```

Then open `apps/macos/build/RubyWhisper.app` and grant Accessibility/Input
Monitoring/Screen Recording again. Remove older local `RubyWhisper.app` build
artifacts from other worktrees before adding the app in System Settings, so the
permission picker shows only the current build. For stable permission behavior
across repeated builds, sign with an installed Apple Development or Developer ID
identity instead of `-`.

Build output:

```text
apps/macos/build/RubyWhisper.app
```

The bundled notice path is:

```text
apps/macos/build/RubyWhisper.app/Contents/Resources/ThirdPartyNotices.md
```

The output name, bundle identifier, entitlements filename, and resources use
RubyWhisper development placeholders until later release-packaging tickets set
approved production values.

## Local DMG Packaging

The `dmg` target is a local/ad hoc packaging helper for developer testing only:

```bash
make -C apps/macos dmg CODESIGN_IDENTITY=-
```

It builds the same ad hoc app bundle, stages `RubyWhisper.app` with an
`Applications` alias, and writes:

```text
apps/macos/build/RubyWhisper.dmg
```

This artifact is not Developer ID signed, notarized, stapled, uploaded,
published, or suitable for paid beta distribution. It exists only to inspect
the local drag-install DMG shape.

The target checks for the non-secret local tools it needs before building:

- `create-dmg`
- `fileicon`

If either tool is missing, the Makefile stops with a sanitized prerequisite
message and does not print local private values.

## Release Signing And Notarization Guardrails

`codesign-dmg` and `notarize` are release-sensitive targets. They are guarded
so they cannot run with the default ad hoc identity or obvious placeholder
values.

- `codesign-dmg` requires `CODESIGN_IDENTITY` to name an installed
  `Developer ID Application` identity in the active keychain search list.
- `notarize` requires a non-placeholder `NOTARIZE_PROFILE`, local
  `notarytool`/`stapler` availability, and an existing DMG path before it
  submits anything.
- Autonomous agent work must not provide real Apple identities, notary
  profiles, private key paths, tokens, or release upload destinations.

The paid beta release artifact remains human-gated by
`docs/MAC_BETA_RELEASE_RUNBOOK.md`.

## Update Channel Configuration

Development builds are update-disabled by default. The app reads these
non-secret `Info.plist` keys after the Makefile copies metadata into the bundle:

- `RubyWhisperUpdateChannelEnabled`: boolean, defaults to `false`.
- `RubyWhisperUpdateReleasesURL`: HTTPS JSON release feed URL, defaults to empty.

The Makefile exposes matching overrides for synthetic or approved configured
builds:

```bash
make -C apps/macos clean all \
  CODESIGN_IDENTITY=- \
  UPDATE_CHANNEL_ENABLED=true \
  UPDATE_RELEASES_URL=https://updates.example.test/releases.json
```

The channel is considered enabled only when the boolean is explicit and the feed
URL is valid HTTPS. A URL by itself does not enable update checks. Tests use
synthetic fixtures and an injected feed loader; default local builds do not call
any update service.

`xcodebuild` is not authoritative for this imported source. There is no Xcode
project, workspace, Swift package, or scheme under `apps/macos`; `xcodebuild -list`
exits 66 in this directory.

## CI Validation

`.github/workflows/macos-ci.yml` runs the same Debug/ad hoc command on
GitHub-hosted `macos-latest` for macOS source changes:

```bash
make -C apps/macos clean all CODESIGN_IDENTITY=-
```

The workflow verifies that `apps/macos/build/RubyWhisper.app` exists, keeps the
development bundle identifier `com.rubyadvisory.rubywhisper.dev`, and is signed
with an ad hoc signature. It is only a non-release build gate.

Release packaging, DMG creation, Apple Developer ID signing, notarization,
provider keys, production secrets, and private env files are intentionally out
of this CI path.

The imported upstream source is still a FreeFlow harness. It includes direct provider, updater, local settings, and local history behavior that must be refactored before RubyWhisper beta use.
