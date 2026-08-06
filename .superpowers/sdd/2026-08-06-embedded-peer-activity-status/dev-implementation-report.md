# Embedded Peer Activity Status Dev Implementation Report

## Status

LOCAL_AND_CONTAINER_VERIFIED_WITH_REMOTE_SMOKE_BLOCKED

Task 8 local verification, final debug EXE build, real Tauri/WebView2 CDP visual QA, user settings restore, and report assets are complete. Cross-host remote smoke is explicitly blocked because Tencent Cloud public security group access for TCP 8787 is not enabled today; it is not claimed as passed.

## Commits Covered

- `a2b2566 feat: define realtime activity status protocol`
- `956f2a8 feat: relay paired activity statuses`
- `c98a687 feat: persist local activity status`
- `adb5420 feat: sync peer activity status in realtime`
- `8b6038b fix: negotiate activity status capability`
- `6dc421d feat: present peer activity status card`
- `81a4d5c feat: add local activity status picker`
- `5ec8139 fix: harden status UI interactions`
- `33e0ad5 refactor: move peer status into the main pet window`
- `0b5acd0 fix: resolve embedded status UI review issues`
- `0b980ab fix: refine status context menu focus`

This report commit also includes the audited Relay deployment fix: `RELAY_DATABASE_PATH` in compose/env example, compose config coverage, and an Alpine/pnpm Dockerfile that avoids the remote apt/apk BuildKit hang while preserving pnpm lockfile verification.

## Local Verification Matrix

- `pnpm test` -> exit 0, 37 files / 272 tests.
- `pnpm typecheck` -> exit 0.
- `pnpm build` -> exit 0.
- `pnpm --dir server test` -> exit 0, 3 files / 22 tests.
- `pnpm --dir server build` -> exit 0.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` -> exit 0.
- `cargo test --manifest-path src-tauri/Cargo.toml` -> exit 0, 36 tests.
- `cargo check --manifest-path src-tauri/Cargo.toml` -> exit 0.
- `pnpm tauri build --debug` -> exit 0.
- `git diff --check` -> exit 0.
- `pnpm vitest run deploy/couple-pet-relay/composeConfig.test.ts` RED/GREEN:
  - RED: expected `RELAY_DATABASE_PATH`, compose still used `RELAY_DB_PATH`.
  - GREEN: compose/env example now use `RELAY_DATABASE_PATH`.

Debug EXE:

- Path: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe`
- Size: `172851712` bytes.
- CreationTime: `2026-08-06T23:18:31.7352507+08:00`
- LastWriteTime: `2026-08-06T23:18:34.2089211+08:00`

## Source Boundary Review

- `rg -n "peer-presence|peer-link|offline-nest|companionWindowCommands|CompanionSurfaceRoot" src src-tauri/src` -> no matches.
- `rg -n "companion_windows|update_companion_scene|read_companion_scene|hide_companion_scene|request_open_message_composer" src-tauri/src` -> no matches.
- `rg -n "activityStatus|console\.|logger|log\(" server/src` -> only Relay implementation/tests; no activity status logging.

## Remote Relay

SSH used only the dedicated key and BatchMode options. No cloud console or security group operation was performed.

- Backup path recorded: `/opt/couple-pet-relay-backup-20260806220213`.
- Backup note: that directory contained only `README.source-absent.txt`, so there was no old source tree to restore from that backup.
- Docker volume safety: no relay-data volume deletion or SQLite clearing was performed.
- Diagnostic plain build log that timed out on the old route: `/opt/couple-pet-relay/build-plain-20260806224231.log`.
- Successful audited build log after minimal Dockerfile fix: `/opt/couple-pet-relay/build-plain-pnpm-20260806224823.log`.
- Remote compose state:
  - `couple-pet-relay-relay-1`
  - Image `couple-pet-relay-relay`
  - Status `Up`
  - Ports `0.0.0.0:8787->8787/tcp, :::8787->8787/tcp`
- Remote local health:
  - `curl -i http://127.0.0.1:8787/health` -> `HTTP/1.1 200 OK`, body `{"ok":true}`.
- Public health from this machine:
  - `curl.exe --noproxy "*" -i -m 10 http://159.75.175.47:8787/health` -> `curl: (52) Empty reply from server`.
  - Concurrent remote tcpdump on port 8787 did not show usable HTTP traffic reaching the VM.

Remote smoke status: BLOCKED. Cross-host WebSocket status smoke and old-client compatibility smoke were not run because public TCP 8787 is not reachable today. This is attributed to Tencent Cloud security group access not being opened yet, per user direction.

## Visual QA

Final visual QA used the rebuilt debug EXE with process-only environment variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<free port>`. No production source or persisted setting was changed to enable CDP. CDP target was the real Tauri WebView URL `http://tauri.localhost/`.

QA evidence directory:

- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-06-embedded-peer-activity-status\qa`

Screenshots:

- `01-offline-card.png`
- `02-online-card.png`
- `03-slacking-card.png`
- `04-dazing-card.png`
- `05-overtime-card.png`
- `06-radial-menu-card-hidden.png` — final corrected screenshot; six radial buttons visible and no peer status card.
- `07-activity-status-picker.png`
- `08-message-composer-card-hidden.png`
- `09-settings-card-hidden.png`
- `10-edge-peek-card-hidden.png`
- `context-menu-picker-right-click-cdp.png`
- `transparency-alpha-proof-cdp.png`

CDP DOM evidence:

- `cdp-qa-evidence.json`
- Radial menu: six labels `撒娇卖萌`, `敲电脑`, `打招呼`, `求抱抱`, `生气鼓脸`, `我的状态`; `statusCard: false`.
- Picker: four labels `在线`, `摸鱼中`, `发呆中`, `加班中`; `statusCard: false`.
- Composer/settings/edge-peek: each had the expected panel/state visible and `statusCard: false`.
- Picker to right-click context menu: picker closed, menu labels `设置`, `重置位置`, `隐藏`, `退出`, focused active text `设置`.
- Final quit: clicked `退出` from the real context menu; process exited.

Window enumeration:

- `window-enumeration-final.json`
- Visible main window: title `情侣桌宠`, class `Tauri Window`, size `320 x 360`.
- `SatelliteMatches: 0` for `peer-presence`, `peer-link`, `offline-nest`.

Transparency note:

- The black background in PrintWindow screenshots is PrintWindow compositing transparent pixels as opaque black. Pixel evidence records `06-radial-menu-card-hidden.png` corner pixels as `A=255,R=0,G=0,B=0`.
- `transparency-alpha-proof-cdp.png` was captured from the same Tauri WebView after CDP transparent background override; matching corner pixels are `A=0,R=0,G=0,B=0`.
- Tauri config keeps the main window `transparent: true`, `decorations: false`, `shadow: false`; CSS body/app shell backgrounds are transparent.

## User Data Restore

- Restored from `C:\Users\14567\AppData\Roaming\com.couple.desktoppet\codex-qa-backup\task8-20260806-221504`.
- Restored `settings.json` and `window-position.json`.
- Verified `codexQaSurface` absent after restore.
- Stopped only QA helper processes:
  - four `couple-pet-task8-peer-driver.cjs` node processes.
  - current worktree local relay dev processes on port 8787.

## Known Risks

- Remote cross-host smoke remains blocked until public TCP 8787 is allowed by Tencent Cloud security group policy.
- PrintWindow remains useful for Tauri window content proof but not transparency proof; CDP alpha evidence is included for transparency.
- Visual drag/tray interactions were not manually mouse-driven in the locked session; CDP/Win32 evidence covers DOM state, window enumeration, edge-peek transition, and real context-menu quit.
