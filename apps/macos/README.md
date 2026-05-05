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
- `FreeFlow.entitlements`
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

No build was run as part of RUB-220. Build-command validation is deferred to RUB-221 / RW-060B because this import intentionally preserves the selected source base while leaving the RubyWhisper macOS build contract, rebrand, signing, notarization, and release packaging work to follow-up tickets.

The imported upstream source is still a FreeFlow harness. It includes direct provider, updater, local settings, and local history behavior that must be refactored before RubyWhisper beta use.
