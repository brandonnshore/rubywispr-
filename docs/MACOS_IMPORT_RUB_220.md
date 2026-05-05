# macOS Source Import For RUB-220

RUB-220 / RW-060A imported the approved FreeFlow macOS harness source into `apps/macos`.

## Source

- Upstream repository: `https://github.com/zachlatta/freeflow`
- Upstream commit: `b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c`
- Import decision: `docs/adr/ADR-001-freeflow-import-decision.md`
- Audit evidence: `docs/FREEFLOW_AUDIT_RUB_24.md`
- Upstream license: MIT, preserved at `apps/macos/LICENSE`
- Distribution notice: `apps/macos/Resources/ThirdPartyNotices.md`, copied to
  `RubyWhisper.app/Contents/Resources/ThirdPartyNotices.md` by the macOS
  Makefile

## Method

The source was imported from a fresh clone of the pinned upstream commit in ignored `tmp/freeflow-rub-220`. Selected app source and build inputs were copied into `apps/macos`.

Included:

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

Before any beta or release workflow, preserve MIT attribution in distributed
artifacts by verifying `Contents/Resources/ThirdPartyNotices.md`, and complete
the ADR-required backend proxy, privacy/storage, insertion recovery, island
state, updater, icon/media, and release-surface refactors.

## RW-060 Completion Gate

RUB-225 / RW-060F records the import/rebrand gate for RUB-51. This gate means
the selected macOS base is imported, buildable, and safe to hand to downstream
implementation tickets as a RubyWhisper development harness. It is not a paid
beta readiness claim.

Evidence:

- RW-060A / RUB-220: selected source imported under `apps/macos` from
  `https://github.com/zachlatta/freeflow` at
  `b91a5fb01a6fa46853b2a718a3dc6f43cff1f56c`.
- RW-060B / RUB-221: authoritative local Debug/ad hoc build command is:

  ```bash
  make -C apps/macos clean all CODESIGN_IDENTITY=-
  ```

  It produces `apps/macos/build/RubyWhisper.app` through the Makefile, not
  `xcodebuild`.
- RW-060C / RUB-222: app name, display name, executable, bundle identifier,
  entitlements filename, app output, permission copy, and icons use
  RubyWhisper development placeholders.
- RW-060D / RUB-223: active runtime identity strings, logs, keychain fallback
  names, temp/export prefixes, and updater placeholders use RubyWhisper-safe
  values or fail closed. The upstream release/update channel is disabled until
  RUB-77.
- RW-060E / RUB-224: FreeFlow MIT attribution is preserved in
  `apps/macos/LICENSE` and `apps/macos/Resources/ThirdPartyNotices.md`, and the
  notice is copied into the app bundle at build time. Upstream website, demo,
  and release assets remain excluded from tracked RubyWhisper launch surfaces.

Remaining `FreeFlow` matches under `apps/macos` are intentional attribution or
source-provenance references:

- `apps/macos/Resources/ThirdPartyNotices.md`
- `apps/macos/README.md`
- `apps/macos/Sources/SetupView.swift` attribution URL, label, and copy
- `apps/macos/Sources/SettingsView.swift` attribution URL, label, and copy

Known follow-up blockers after the import gate:

- Replace direct desktop provider calls and provider-key settings with the
  RubyWhisper backend API client and Keychain-backed desktop session.
- Reduce imported local storage so Recent Wisprs keeps only approved local
  final text with the documented retention controls.
- Add first-run auth, Terms, account, permission, and test-whisper gates.
- Implement the RubyWhisper hotkey lifecycle, recording upload flow, direct
  insertion recovery, clipboard fallback, island states, duration cap, settings,
  personal dictionary, and manual QA paths.
- Keep updater, signing, notarization, packaging, appcast, and release work in
  Backlog/high-risk lanes until human credentials and release approval exist.

Recommended downstream handling:

- Close RUB-51 only after this gate evidence is linked on the parent issue.
- After RUB-51 is closed or explicitly accepted, RUB-86 can be unblocked first
  to define the macOS CI/manual validation contract for the imported Makefile
  app.
- RUB-55 can be split or unblocked next because its remaining hard import
  blocker is RUB-51 and the FreeFlow hotkey audit is Done; keep manual QA work
  as explicit follow-up blockers.
- RUB-52, RUB-53, RUB-54, RUB-56, and RUB-57 should remain blocked until their
  current cross-feature blockers are resolved or split into leaf tickets.
- RUB-62 needs breakdown/human privacy direction before implementation.
- RUB-77 and RUB-78 remain release/high-risk work and should stay in Backlog
  until updater, signing, notarization, and release credentials are approved.
