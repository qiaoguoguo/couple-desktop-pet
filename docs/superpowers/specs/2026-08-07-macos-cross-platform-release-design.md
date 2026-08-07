# macOS Cross-Platform Release Design

Date: 2026-08-07

## Objective And Success Criteria

Build a macOS release of the current desktop pet client with the same product behavior as the current Windows client and full interoperability with Windows clients through the existing Relay.

Success requires:

- Supported OS: macOS 12 Monterey and later.
- CPU support: Intel x86_64 and Apple Silicon arm64 in one Universal Binary.
- Delivery artifact: an off-store `.dmg` installer containing the `.app`.
- Product scope: feature baseline is strictly equal to the current Windows client. The macOS work must not add new business features, change product semantics, or use the port as a redesign pass.
- Interop: Windows and macOS clients connect to the same production Relay and complete binding, presence, activity status, message, acknowledgement, animation, reconnect, and unbind flows.
- Evidence: release is accepted only when every required matrix item has direct logs, screenshots, command output, and artifact hashes under `.superpowers/sdd/2026-08-07-macos-cross-platform/`.

## Feature Parity Matrix

| Area | Required macOS behavior | Acceptance evidence |
| --- | --- | --- |
| Window shell | Transparent, borderless, always-on-top main pet window matching Windows behavior. | `screencapture` screenshots over light and dark backgrounds plus process/window listing. |
| Menu bar tray | App runs as a menu bar accessory with no Dock icon during normal operation. Tray/menu entry exposes show, settings, hide, and quit flows. | Screenshot of menu bar item, Dock absence evidence, menu action logs. |
| Drag, position, scale | Dragging, saved window position, scale setting, and auto-move behave like Windows. Hidden edge positions are never persisted as launch positions. | Settings file before/after, window bounds logs, restart check. |
| Click-through | Click-through mode can be enabled and disabled; tray or equivalent recovery path remains reachable so the app cannot become unreachable. | Click-through toggle log, tray restore log, recovery screenshot. |
| Pointer actions | Left click, right click, radial menu, and context menu behaviors match Windows. | UI screenshots and interaction logs. |
| Message composer | Message input panel opens and closes correctly without corrupting pet window geometry. | Screenshot, command log, geometry before/after. |
| Peer status card | Connection, offline, online, slacking, dazing, and overtime card behavior matches Windows priority and hiding rules. | Screenshot set and state transition log. |
| Pet packages | Import, select, and delete `.cdpet` packages with the same v2/v3 format and asset semantics. | Import/delete logs, package list before/after, selected pet screenshot. |
| Pairing | Generate binding code, accept binding, unbind, and reconnect through the same Relay APIs. | Sanitized HTTP/WS event log with no device secrets. |
| Presence and activity | Online/offline and `slacking`/`dazing`/`overtime`/`null` sync with capability negotiation. | Bidirectional event log between Windows and macOS clients. |
| Messaging | A-to-B and B-to-A messages, typewriter bubble, acknowledgement disappearance, and message interaction animation match Windows. | Screenshots and sanitized message event log. |
| Edge interaction | Current edge interaction behavior remains cross-platform consistent, including current package capability rules. | Four-side edge screenshots and drag/release logs on macOS. |

## Architecture

- Keep one codebase. React, TypeScript, role package rendering, settings model, `shared/syncProtocol`, Relay HTTP APIs, and Relay WebSocket protocol do not fork by platform.
- Rust/Tauri code may add `cfg(target_os = "macos")` branches only inside platform shell behavior: activation policy, menu bar tray, window transparency, work-area calculation, click-through, and bundle configuration.
- Do not create a separate macOS application project. The macOS app is built from the same Tauri workspace and the same frontend bundle.
- Do not duplicate protocol schemas, runtime stores, or pet package import logic. Any platform divergence must sit behind existing desktop/window command boundaries or a narrowly named platform adapter.
- Preserve the existing behavior that `imported:q-girl-complete-v3` does not receive built-in edge animation. Fixing that is outside this macOS release design.

## macOS Shell Layer

Required Tauri/macOS behavior:

- Set `app.macOSPrivateApi=true` or the Tauri v2 equivalent needed for transparent windows on macOS.
- Set the runtime activation policy to `ActivationPolicy::Accessory` so the normal app has a menu bar item but no Dock icon.
- Provide complete menu bar tray actions: show, hide, settings, and explicit quit.
- Closing the main window hides it. Explicit quit exits. System shutdown and user logout are not blocked.
- Work-area calculations must respect menu bar, Dock, multiple displays, negative display origins, and HiDPI scale factors.
- Transparent and borderless window placement must preserve click targets and not introduce opaque fallback backgrounds.
- Click-through must be reversible from the tray/menu path. If the window ignores input, the menu bar entry remains the safety path.
- Always-on-top semantics should map to the nearest macOS behavior available through Tauri and Cocoa, with manual evidence for z-order over ordinary app windows.
- Edge placement must calculate physical contact points from the actual window size, matching the Windows edge interaction contract.

## Networking And ATS

- Continue using `DEFAULT_RELAY_URL` as `http://159.75.175.47:8787`.
- Continue using the same HTTP and WebSocket protocol fields. Do not change auth, pair, status, message, capability, or unpair payloads for macOS.
- Because the current Relay endpoint is IP-based cleartext HTTP/WS and the app minimum is macOS 12, ATS must include `NSAllowsArbitraryLoadsInWebContent=true` so the WKWebView/Tauri webview can reach `159.75.175.47` on macOS 12 and 13. This does not allow arbitrary loads outside web content and must not be replaced by global `NSAllowsArbitraryLoads`.
- Keep the `159.75.175.47` `NSExceptionDomains` entry as the explicit Relay-IP exception for macOS 14 and later, where IP-address exception matching is supported. After the Relay moves to HTTPS/WSS, remove both the WebView-only temporary exception and the Relay IP exception in the same release line that changes the default URL.
- No device secret, auth token, pair code secret, or message body should be printed in public logs or committed evidence. Evidence logs use anonymized suffixes and event names.

## Data And Storage

- Use Tauri `app_data_dir` on macOS for settings, window position, imported packages, and runtime data.
- Preserve settings semantics: appearance, package selection, scale, click-through, auto-move, sync device identity, pair state, activity status, and window position mean the same thing on Windows and macOS.
- Windows user data does not need direct file migration to macOS.
- `.cdpet` package format and imported asset layout are cross-platform. A package imported on Windows must be importable on macOS and vice versa.
- Imported package deletion must remove only that package's app-data files and must not touch other packages or user settings.

## Build And Release

Required build design:

- Use a macOS-specific Tauri overlay config or an equivalent isolated build configuration. Shared config stays common; macOS-only bundle fields live in the overlay.
- Bundle targets: `app` and `dmg`.
- Minimum system version: `12.0`.
- App icon: `icon.icns` included in the macOS bundle.
- Binary target: `universal-apple-darwin`, producing one Universal `.app` inside one DMG.
- This release is off-store. Transparent private API use means the app is not targeting the Mac App Store.

Two release paths are defined:

- Engineering verification path: ad-hoc signed Universal DMG. This is valid for local QA and CI artifact verification but may show Gatekeeper warnings.
- Formal release path: Developer ID signed and notarized DMG, followed by stapling. This is required before claiming a normal no-warning macOS installer.

Required commands or equivalent CI steps:

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm tauri build --target universal-apple-darwin --bundles app,dmg`
- `hdiutil verify <dmg>`
- `hdiutil attach <dmg> -nobrowse -readonly`
- `file <app binary>`
- `lipo -info <app binary>`
- `codesign --verify --deep --strict --verbose=2 <app>`
- Formal path only: `spctl --assess --type execute --verbose <app>`, `xcrun notarytool submit`, `xcrun stapler staple`, and post-staple `spctl --assess`.

## Real macOS Environment

- The current Windows machine cannot prove macOS runtime behavior.
- Verification must run on a real macOS host or a real macOS CI runner with Intel and Apple Silicon coverage. If only one CPU family is available for runtime tests, `file` and `lipo` still prove both slices, while launch and UI checks record the actual tested host architecture.
- The current repository has no git remote or CI configured, and the GitHub connector is not connected. That is a build infrastructure gap for implementation. The implementation phase should add reusable CI definitions, but executing them requires connecting a real Mac service and repository remote.
- Local Windows tests remain required because the macOS port must not regress Windows.

## End-To-End Acceptance Matrix

All rows must have evidence under `.superpowers/sdd/2026-08-07-macos-cross-platform/`.

| Gate | Required evidence |
| --- | --- |
| Windows unit and type checks | Raw command logs and summary for `pnpm test`, `pnpm typecheck`, `pnpm build`, Rust tests, and Rust check on Windows. |
| macOS unit and type checks | Same command logs and summaries on macOS. |
| macOS compilation | Successful Universal `app,dmg` build log. |
| DMG integrity | `hdiutil verify` and attach output. |
| Universal binary | `file` and `lipo -info` showing `x86_64` and `arm64`. |
| Signing | `codesign --verify --deep --strict --verbose=2` output. |
| Formal release signing | Developer ID `spctl --assess`, notarization, stapling, and post-staple assessment output. |
| Actual launch | Process list, app logs, and screenshot after launching the installed `.app`. |
| Transparent shell | Desktop screenshots proving transparent borderless window, topmost behavior, menu bar item, no Dock icon, and close-to-hide. |
| Interaction shell | Drag, position persistence, scale, auto-move, click-through recovery, settings, package import/select/delete. |
| Relay interop | Windows and macOS clients simultaneously connect to `http://159.75.175.47:8787`, generate and accept a pair code, show both peers online, sync activity status both ways, send A-to-B and B-to-A messages, acknowledge bubbles, unbind, reconnect, and confirm pair invalidation. |
| Edge interaction | Four-direction edge behavior screenshots and logs on macOS, preserving current package capability semantics. |

Protocol unit tests do not replace the Windows-to-macOS interop run. The interop run must use two real clients and the same Relay.

## Automation And Evidence

- Prefer WebdriverIO with the Tauri embedded provider for DOM-visible app flows.
- Use macOS-native evidence for system behavior that WebDriver cannot reliably prove: `screencapture`, `osascript`, `ps`, `pgrep`, `lsappinfo`, `mdls`, `log show`, `defaults read`, `codesign`, `spctl`, `hdiutil`, `file`, `lipo`, and `notarytool`.
- Evidence directory: `.superpowers/sdd/2026-08-07-macos-cross-platform/`.
- Required contents:
  - Environment inventory: macOS version, CPU architecture, Xcode version, Rust toolchains, Node/pnpm versions, Tauri CLI version.
  - Raw command logs for all test, build, signing, notarization, and DMG commands.
  - JUnit or equivalent test summaries where available.
  - Screenshots for transparent window, tray/menu bar, no Dock icon, settings, imported package, message composer, status card, edge interaction, and message acknowledgement.
  - Sanitized interop event log with device IDs shortened and no secrets.
  - DMG SHA256 and app binary SHA256.
  - Final acceptance matrix with pass/fail per row and evidence path per row.

## Failure Recovery Requirements

| Failure area | Observable error | Required recovery |
| --- | --- | --- |
| ATS or Relay connectivity | Webview request failure, WebSocket close, or HTTP timeout to the Relay IP. | Show existing disconnected state, keep settings intact, retry through existing reconnect flow, and record ATS config in evidence. |
| Menu bar tray failure | No menu bar item or tray actions unavailable. | Keep main window visible and provide explicit quit; fix activation/tray config before release. |
| Click-through lockout | Window ignores clicks and tray cannot restore. | Use native safe reset or settings edit recovery; release cannot pass until menu recovery is reliable. |
| Window off-screen or wrong work area | Window appears under menu bar, behind Dock, or on an unreachable display area. | Clamp restored positions into visible work area and avoid saving hidden edge positions. |
| Resource import failure | `.cdpet` import rejects valid package or corrupts package list. | Surface existing import error, leave previous package selection untouched, and keep package directory cleanup scoped. |
| WebSocket reconnect failure | Peer remains disconnected after network interruption. | Existing reconnect state must recover without losing device identity or activity status selection. |
| Missing signing credentials | `codesign`, `spctl`, notarization, or stapling cannot complete formal path. | Produce ad-hoc QA artifact only, label it as not a formal no-warning installer, and keep final release incomplete unless the user accepts that limitation. |

## Completion Gate

The macOS release is complete only when:

- A DMG exists from the shared codebase.
- The DMG contains a Universal `.app`.
- The app launches on real macOS 12+.
- Every feature parity matrix item has direct evidence.
- Windows-to-macOS Relay interop is captured with real clients.
- Formal release has Developer ID signing, notarization, and stapling evidence.

If Apple Developer credentials are unavailable, the team may deliver an ad-hoc verification DMG for testing, but it must not be described as a normal no-warning installer. The release target remains incomplete until signing and notarization are completed or the user explicitly accepts the ad-hoc limitation.

## Non-Goals

- No Mac App Store distribution.
- No Relay business logic changes.
- No new account, payment, voice, store, or public matching features.
- No animation redesign or pet asset regeneration.
- No change to the current behavior where imported Q-girl packages do not automatically receive built-in edge animation.
- No protocol field changes and no migration of Windows app-data files to macOS.
