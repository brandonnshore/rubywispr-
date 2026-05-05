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
compilation, copies `Info.plist` and resources into an app bundle, and signs
with the provided `CODESIGN_IDENTITY`. Passing `CODESIGN_IDENTITY=-` selects ad
hoc signing, which is the repeatable local developer path.

Build output:

```text
apps/macos/build/RubyWhisper.app
```

The output name, bundle identifier, entitlements filename, and resources use
RubyWhisper development placeholders until later release-packaging tickets set
approved production values.

`xcodebuild` is not authoritative for this imported source. There is no Xcode
project, workspace, Swift package, or scheme under `apps/macos`; `xcodebuild -list`
exits 66 in this directory.

The imported upstream source is still a FreeFlow harness. It includes direct provider, updater, local settings, and local history behavior that must be refactored before RubyWhisper beta use.
