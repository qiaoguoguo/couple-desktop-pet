# macOS Cross-Platform Final Acceptance Matrix

Initial results are `Pending` or `Not run`. Do not mark a gate as passed until direct evidence exists at the listed path. Formal signing and notarization rows can only pass from the Developer ID workflow; ad-hoc QA evidence cannot satisfy those gates.

| Gate | Required Evidence Path | Result |
| --- | --- | --- |
| Windows full regression | `windows/pnpm-test.log`, `windows/pnpm-typecheck.log`, `windows/pnpm-build.log`, `windows/cargo-test.log`, `windows/cargo-check.log` | Not run |
| macOS full regression | `macos/pnpm-test.log`, `macos/pnpm-typecheck.log`, `macos/pnpm-build.log`, `macos/cargo-test.log`, `macos/cargo-check.log`, `macos/cargo-fmt-check.log` | Not run |
| Universal app binary has Intel and Apple Silicon slices | `build/file-app-binary.log`, `build/lipo-verify-universal.log` | Pending |
| DMG verify attach detach | `build/hdiutil-verify-dmg.log`, `build/hdiutil-attach-dmg.log`, `build/hdiutil-detach-dmg.log` | Pending |
| Generated Info.plist ATS content | `build/plutil-generated-info-plist.log`, `native/generated-info-plist.log` | Pending |
| macOS HTTP and WebSocket Relay connection | `network/macos-http-ws-relay.log` | Not run |
| Production build excludes E2E plugins and permissions | `macos/production-permission-scan.log`, `macos/cargo-tree-production.log` | Pending |
| Real macOS app launch | `native/launch-app.log`, `native/process-exists.log`, `native/app-window.png` | Not run |
| No Dock icon from startup | `native/no-dock-before.png`, `native/no-dock-after.png`, `native/manual-checklist.log` | Pending |
| Menu bar tray actions | `native/menu-bar-tray.png`, `native/tray-show.log`, `native/tray-settings.log`, `native/tray-quit.log` | Pending |
| Transparent borderless window | `native/transparent-light.png`, `native/transparent-dark.png`, `native/app-window.png` | Pending |
| Always-on-top behavior | `native/always-on-top-before.png`, `native/always-on-top-after.png`, `native/manual-checklist.log` | Pending |
| Drag and position memory | `native/drag-position-before.log`, `native/drag-position-after.log`, `native/restart-position.log` | Pending |
| Scale and auto-move behavior | `native/scale-auto-move.log`, `native/scale-auto-move.png` | Pending |
| Click-through recovery | `native/click-through-enabled.log`, `native/click-through-recovered.log`, `native/click-through-recovered.png` | Pending |
| Close hides and explicit quit exits | `native/close-to-hide.log`, `native/quit-app.log` | Pending |
| Settings, package import, status card, and composer parity | `native/settings.png`, `native/package-import.png`, `native/status-card.png`, `native/message-composer.png` | Pending |
| Current four-edge behavior parity | `native/edge-left.png`, `native/edge-right.png`, `native/edge-top.png`, `native/edge-bottom.png` | Pending |
| Windows macOS pairing and online state | `interop/windows/events.jsonl`, `interop/macos/events.jsonl`, `interop/validator/validator.log` | Not run |
| Activity status sync both directions | `interop/windows/events.jsonl`, `interop/macos/events.jsonl`, `interop/windows/screenshots/`, `interop/macos/screenshots/` | Not run |
| Bidirectional messages, animation, and bubble acknowledgement | `interop/windows/events.jsonl`, `interop/macos/events.jsonl`, `interop/windows/screenshots/`, `interop/macos/screenshots/` | Not run |
| Unbind and restart show unpaired | `interop/windows/events.jsonl`, `interop/macos/events.jsonl`, `interop/validator/validator.log` | Not run |
| QA DMG and app binary SHA256 | `build/sha256-dmg.log`, `build/sha256-app-binary.log` | Pending |
| Formal DMG and app binary SHA256 | `build/sha256-dmg-final.log`, `build/sha256-app-binary-final.log` | Pending |
| Formal DMG verification | `build/hdiutil-verify-formal-dmg.log` | Pending |
| Formal Developer ID codesign | `build/codesign-verify-app-final.log`, `build/codesign-describe-app-final.log` | Pending |
| Formal Apple notarization | `build/notarytool-history.log` | Pending |
| Formal stapler validation | `build/stapler-validate-app.log`, `build/stapler-validate-dmg.log` | Pending |
| Formal Gatekeeper assessment | `build/spctl-assess-app.log`, `build/spctl-assess-dmg.log` | Pending |
| Final QA-only boundary | `build/codesign-verify-app.log`, `build/codesign-describe-app.log`, `native/spctl-assess.log` prove only ad-hoc QA status, not formal release status | Pending |
| Final release gate decision output | Generated after scanning all external evidence; never used as input evidence | Pending |
