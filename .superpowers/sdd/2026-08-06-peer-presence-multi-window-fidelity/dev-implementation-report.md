# Peer Presence Multi-Window Fidelity Dev Implementation Report

## Superseded

This multi-window peer presence implementation is superseded by `docs/superpowers/plans/2026-08-06-embedded-peer-activity-status.md`. Task 7 removed the `peer-presence`, `peer-link`, and `offline-nest` satellite runtime, and Task 8 verified the embedded main-window status card path instead.

## Status

DONE_WITH_CONCERNS

## Commits

- `ebe38bc feat: add presence portraits to pet packages`
- `e0d5aed feat: add companion scene desktop facade`
- `c47a970 feat: calculate companion window layout`
- `f1a3f96 fix: prevent compact companion overlap`
- `5c6c045 feat: coordinate companion satellite windows`
- `4f29c81 fix: account for monitor dpi in companion layout`
- `e84211d feat: add companion satellite React surfaces`
- `758184c feat: add companion presence motion assets`
- `3cf332d refactor: move peer presence out of the pet window`
- `8e427ab feat: package dedicated peer presence portraits`
- `25f711c fix: load companion surfaces with stable hash routes`
- `fa8d419 fix: show companion windows from visible creation`
- `fdc39ac fix: render companion surfaces from window labels`
- `0e80839 fix: stabilize companion scene startup`

## Implementation Summary

- Added dedicated online/offline companion portraits to built-in pet package metadata and registry summaries.
- Added companion scene front-end facade and Rust commands for `read_companion_scene`, `update_companion_scene`, and dynamic satellite window coordination.
- Added layout calculation for `peer-presence`, `peer-link`, and `offline-nest` satellite windows while keeping the main pet window at 320x360.
- Fixed compact layout so fallback satellite placement does not overlap the main pet; if no safe area exists, companion presence is hidden instead of covering the pet.
- Fixed high-DPI geometry: runtime reads `monitor.scale_factor()`, uses physical layout scale as `monitor_scale_factor * sceneScale`, and keeps front-end `sceneScale` as user scale only.
- Added companion React surfaces and visual assets for online/offline presence, heart line, badge, and offline nest.
- Removed the old embedded peer presence layer from the main pet window; App now projects state to satellite windows and handles satellite message composer events through the main window.
- Stabilized runtime loading: satellite surfaces now resolve by Tauri window label and hash, create/show from visible windows, listen before reading state, catch read/listen failures, retry initial read once, and App retries scene update once after a transient command failure.
- Added fallback portrait selection: when no peer package mapping exists, the satellite scene uses built-in Q-girl portrait assets before falling back to the selected local package.

## RED/GREEN Evidence

- Compact overlap review: added `Rect::overlaps` and compact no-overlap tests; initial right-clamp behavior overlapped the main rect, then passed after top/bottom/hidden fallback.
- DPI review: added tests for DPI 1.25 with user scale 1 and 1.1; implementation now returns physical 210x220 from a 168x176 CSS surface at 125%.
- Surface startup review:
  - RED: `CompanionSurfaceRoot` subscribed after read and missed startup events; read rejection produced unhandled failure.
  - GREEN: listen happens before read, read/listen are caught, one retry covers transient startup failure.
  - RED: App projected online scene without portrait when peer mapping was absent.
  - GREEN: App projects built-in Q-girl online/offline portraits as fallback.

## Verification

- `pnpm vitest run src/app/App.test.tsx src/sync/companion/CompanionSurfaceRoot.test.tsx` -> pass, 2 files / 69 tests.
- `pnpm test` -> pass, 38 files / 259 tests.
- `pnpm typecheck` -> pass.
- `pnpm build` -> pass.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` -> pass.
- `cargo test --manifest-path src-tauri/Cargo.toml` -> pass, 53 tests.
- `cargo check --manifest-path src-tauri/Cargo.toml` -> pass.
- `pnpm --dir server test` -> pass, 3 files / 17 tests.
- `pnpm --dir server build` -> pass.
- `pnpm tauri build --debug` -> pass.

Debug exe:

- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe`

## Runtime Visual QA

- Started the debug exe with WebView2 remote debugging and local relay/fake peer.
- Win32 enumeration showed visible `main`, `peer-presence`, and `peer-link` windows at 100% DPI.
- CDP inspection confirmed:
  - `peer-presence` mounted with label `peer-presence`, online scene revision 5, `portraitUrl` loaded.
  - `peer-link` mounted with label `peer-link`.
  - `read_companion_scene` was invokable from satellite windows.
- Stopped only the QA fake peer process to verify offline transition:
  - `peer-presence` changed to `TA 离线 / 等TA回来`.
  - `offline-nest` window mounted.
  - `peer-link` cleared.

Screenshot paths:

- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-peer-presence.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-peer-link.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-main.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-offline-peer-presence.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-offline-offline-nest.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\peer-presence-left-mirror.png`

## Remaining Risks

- Real display DPI is currently 100% (`GetDpiForWindow` returned 96), so a true Windows 125% DPI screenshot was not captured in this environment. The 125% behavior is covered by Rust layout unit tests, but manual 125% DPI visual QA remains pending.
- System-level `CopyFromScreen` did not capture transparent WebView content reliably under the current desktop/game foreground state; CDP screenshots from the live debug exe were used for visual content evidence.
- Main relay/server semantics were not changed in this task.

## Final Review Fix Update

Commit:

- `82b0904 fix: harden companion presence surfaces`

Fix summary:

- Changed companion satellite hiding from `hide()` to best-effort close/destroy for all three satellite labels, so restored scenes rebuild fresh WebViews instead of reusing unreliable hidden transparent windows.
- Kept offline peer-link visible with blue-gray dotted moonlight arc and no online heart particle.
- Added strict normalization for companion scene read/listen payloads; malformed payloads are discarded rather than silently becoming offline.
- Added one bounded listener startup retry and cleanup for read/listen timers.
- Added portrait fallback chain: online `portrait -> preview -> motion fallback -> text`; offline `offline portrait -> portrait -> preview -> motion fallback -> text`.
- Set OS click-through on every companion show/reuse: online presence is clickable, offline presence/link/nest are click-through.
- Suspends companion scene during local interaction animation as required.
- Replaced the multi-ring/multi-shadow presence styling with single-layer borders and solid chips to avoid transparent WebView2 compositing artifacts.
- Reduced link decoration from three 38-44px hearts to one 12px moving heart over a thin dotted coral arc.
- Removed invalid cross-window press acceleration selectors; this version only has local presence press feedback.
- Regenerated `offline-nest.png` as a cleaner envelope + moon-lamp transparent asset.

Visual verification:

- Static CDP with all CSS animations disabled:
  - Online right presence: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-static-online-right-retry-presence-A3C98C.png`
  - Online right link: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-static-online-right-retry-link-2B2055.png`
  - Offline presence: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-static-clean-presence-AC2E7E.png`
  - Offline link: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-static-clean-link-B046F8.png`
  - Offline nest: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-static-clean-nest-59D93F.png`
  - Online left mirror presence: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-static-online-left-presence-91D112.png`
  - Online left mirror link: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\cdp-static-online-left-link-5E62AB.png`
- Real Windows layered capture path:
  - Virtual screen capture: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\windows-virtual-offline-presence.png`
  - CAPTUREBLT offline presence crop: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\windows-captureblt-offline-presence.png`
  - CAPTUREBLT offline link crop: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\windows-captureblt-offline-link.png`
  - CAPTUREBLT offline nest crop: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\output\qa\windows-captureblt-offline-nest.png`
- Image-coordinate check confirmed left mirror direction changes: right link lower red pixels average x ~= 24, left mirror lower red pixels average x ~= 171.

Latest verification:

- `pnpm vitest run src/sync/companion/CompanionSurfaceRoot.test.tsx src/app/App.test.tsx src/desktop/companionWindowCommands.test.ts src/sync/companion/companionSceneState.test.ts` -> pass, 4 files / 85 tests.
- `cargo test --manifest-path src-tauri/Cargo.toml companion_windows -- --nocapture` -> pass, 20 tests.
- `pnpm test` -> pass, 38 files / 267 tests.
- `pnpm typecheck` -> pass.
- `pnpm build` -> pass.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` -> pass.
- `cargo test --manifest-path src-tauri/Cargo.toml` -> pass, 56 tests.
- `cargo check --manifest-path src-tauri/Cargo.toml` -> pass.
- `pnpm tauri build --debug` -> pass.

Debug exe:

- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe`

Remaining risks:

- True 125% DPI physical screenshot is still not captured because the current desktop DPI is 100%; DPI handling remains covered by Rust unit tests.
- `output/qa` screenshots are local QA artifacts and intentionally not committed.
