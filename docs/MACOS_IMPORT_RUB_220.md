# macOS Source Import For RUB-220

RUB-220 / RW-060A imported the approved FreeFlow macOS harness source into `apps/macos`.

## Source

- Upstream repository: `https://github.com/zachlatta/freeflow`
- Upstream commit: `b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c`
- Import decision: `docs/adr/ADR-001-freeflow-import-decision.md`
- Audit evidence: `docs/FREEFLOW_AUDIT_RUB_24.md`
- Upstream license: MIT, preserved at `apps/macos/LICENSE`

## Method

The source was imported from a fresh clone of the pinned upstream commit in ignored `tmp/freeflow-rub-220`. Selected app source and build inputs were copied into `apps/macos`.

Included:

- `Sources/**`
- `Makefile`
- `Info.plist`
- `FreeFlow.entitlements`
- `Resources/AppIcon-*.png`
- `Resources/AppIcon*.icns`
- `.gitignore`
- `LICENSE`

Excluded:

- upstream `.git/**`
- upstream `.github/**` release workflows and scripts
- upstream `.agents/**`
- upstream `website/**`
- upstream `README.md` and `CHANGELOG.md`
- upstream `Resources/demo.gif`
- generated build products
- private env files, logs, `.tools/**`, and local runtime files

## Follow-Up Boundaries

RUB-220 is source import only. It does not rebrand FreeFlow surfaces, replace
direct provider calls, reduce local persistence, add RubyWhisper island states,
or sign/notarize/package the app.

RUB-221 / RW-060B established the local development build contract as:

```bash
make -C apps/macos clean all CODESIGN_IDENTITY=-
```

The imported source is Makefile-based, with no upstream Xcode project,
workspace, package, or schemes.

Before any beta or release workflow, preserve MIT attribution in distributed artifacts and complete the ADR-required backend proxy, privacy/storage, insertion recovery, island state, updater, icon/media, and release-surface refactors.
