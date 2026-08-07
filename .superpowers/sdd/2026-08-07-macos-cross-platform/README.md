# macOS Cross-Platform Evidence

This directory is the evidence manifest for the macOS 12+ cross-platform release. All evidence must be raw, reproducible, and tied to the git commit under test.

Do not store tokens, binding codes, device secrets, message body text, message bodies, Apple credentials, GitHub credentials, pair secrets, or unredacted WebSocket payloads in this directory.

## Environment

Record the exact execution environment for every real run:

- `macos/sw-vers.log`, `macos/uname-machine.log`, and runner label for GitHub-hosted macOS QA.
- `native/sw-vers.log`, `native/uname-machine.log`, and `native/system-profiler.log` from the native evidence collector.
- Windows runner or local host details under `windows/` when Windows regression evidence is collected.
- Git commit, Node 22 version, pnpm version, Rust toolchain, installed macOS Rust targets, Tauri CLI version, Xcode version, and architecture under the matching platform directory.

## Raw Logs

Store exact command output from automated checks and build verification. Current script and workflow outputs include:

- `macos/pnpm-test.log`
- `macos/pnpm-typecheck.log`
- `macos/pnpm-build.log`
- `macos/cargo-test.log`
- `macos/cargo-check.log`
- `macos/cargo-fmt-check.log`
- `macos/production-permission-scan.log`
- `macos/cargo-tree-production.log`
- `macos/e2e-macos-build.log`
- `macos/e2e-macos.log`
- `build/plutil-source-info-plist.log`
- `build/hdiutil-verify-dmg.log`
- `build/hdiutil-attach-dmg.log`
- `build/plutil-generated-info-plist.log`
- `build/file-app-binary.log`
- `build/lipo-verify-universal.log`
- `build/codesign-verify-app.log`
- `build/codesign-describe-app.log`
- `build/hdiutil-detach-dmg.log`
- `native/source-info-plist.log`
- `native/generated-info-plist.log`
- `native/codesign-display.log`
- `native/codesign-verify.log`
- `native/spctl-assess.log`
- `native/launch-app.log`
- `native/process-exists.log`
- `native/quit-app.log`

`native/manual-checklist.log` must contain one `<id>=PASS` row for each manually verified native behavior:

- `no-dock=PASS`
- `menu-bar-tray=PASS`
- `transparent-window=PASS`
- `always-on-top=PASS`
- `drag-position-memory=PASS`
- `scale-auto-move=PASS`
- `click-through-recovery=PASS`
- `close-to-hide=PASS`
- `settings-package-status-composer=PASS`
- `four-edge-current-behavior=PASS`

Formal Developer ID workflow evidence is written under `build/` and includes:

- `build/pnpm-test.log`
- `build/pnpm-typecheck.log`
- `build/pnpm-build.log`
- `build/cargo-test.log`
- `build/cargo-check.log`
- `build/cargo-fmt-check.log`
- `build/codesign-verify-app-final.log`
- `build/codesign-describe-app-final.log`
- `build/notarytool-history.log`
- `build/stapler-validate-app.log`
- `build/stapler-validate-dmg.log`
- `build/spctl-assess-app.log`
- `build/spctl-assess-dmg.log`
- `build/hdiutil-verify-formal-dmg.log`

## Screenshots

Store screenshots only when they do not contain secrets, binding codes, device secrets, or message bodies.

Required screenshot evidence includes:

- `native/app-window.png` from the native evidence collector.
- Manual or semi-automated native screenshots under `native/` for transparent window compositing, no Dock icon, menu bar tray, always-on-top behavior, drag, position memory, scale, auto-move, click-through recovery, close-to-hide, settings, package import, status card, message composer, and current four-edge behavior.
- Safe interop screenshots under `interop/windows/screenshots/` and `interop/macos/screenshots/`. Required files are `windows-paired.png`, `windows-peer-status-slacking.png`, `windows-message-animation.png`, `windows-unpaired.png`, `macos-paired.png`, `macos-peer-status-slacking.png`, `macos-message-animation.png`, and `macos-unpaired.png`. These screenshots must not include binding codes, tokens, device secrets, or message text.

## Interop

Windows-to-macOS evidence is split by real runner role:

- `interop/windows/events.jsonl`
- `interop/windows/screenshots/`
- `interop/macos/events.jsonl`
- `interop/macos/screenshots/`
- `interop/validator/validator.log`

Each JSONL row must be sanitized and may include only allowed event names, role, platform, UTC timestamp, and non-sensitive assertion details. Pair codes, device secrets, message bodies, dynamic error summaries, stdout, stderr, stacks, tokens, and credentials must remain encrypted in transit and absent from evidence logs. `interop/validator/validator.log` must include a JSON summary with `ok: true` and an empty `missing` array.

## DMG Hashes

Store SHA-256 evidence for both QA and formal artifacts:

- `build/sha256-dmg.log`
- `build/sha256-app-binary.log`
- `build/sha256-dmg-final.log`
- `build/sha256-app-binary-final.log`

The QA hashes come from `scripts/macos/qa-build.mjs`. The `*-final.log` hashes come from the Developer ID release workflow after signing, notarization, and stapling checks.

## Signing And Notarization

Ad-hoc QA evidence is useful for engineering verification but is not formal release evidence. QA logs such as `build/codesign-verify-app.log`, `build/codesign-describe-app.log`, and `native/spctl-assess.log` must be marked QA-only when the app is ad-hoc signed.

Only the formal Developer ID workflow can mark signing and notarization gates as passed. Required formal evidence includes:

- `build/codesign-verify-app-final.log`
- `build/codesign-describe-app-final.log`
- `build/notarytool-history.log`
- `build/stapler-validate-app.log`
- `build/stapler-validate-dmg.log`
- `build/spctl-assess-app.log`
- `build/spctl-assess-dmg.log`

## Final Matrix

Use `final-acceptance-matrix.md` as the external evidence checklist. It starts with every row as `Pending` or `Not run`; update a row only after direct evidence exists at the listed path.

`release-decision.md` is generated after the final gate validates external evidence. It is not itself an input to the final matrix.
