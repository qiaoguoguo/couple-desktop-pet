**Findings**
- No actionable P0/P1/P2 mismatches remain for this implementation pass.

**Source Visual**
- Path: `C:\Users\14567\AppData\Local\Temp\codex-clipboard-d342dcdd-1ef9-4699-bc95-ddacb3c09d7f.png`
- Normalized size: `1492 x 1246`

**Implementation Evidence**
- Local URL: `http://127.0.0.1:19083/`
- Desktop screenshot: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\tmp\screenshots\platform-home-final-desktop.png`
- Mobile screenshot: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\tmp\screenshots\platform-home-final-mobile.png`
- Side-by-side comparison: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\tmp\screenshots\platform-home-final-design-comparison.png`
- Viewports: desktop `1492 x 1246`, mobile `390 x 844`
- Density normalization: captured at `deviceScaleFactor: 1`; source and implementation compared at `1492 x 1246`
- State: public homepage, logged out
- Console: no page exceptions; only Vite and React development info messages

**Required Fidelity Surfaces**
- Fonts and typography: Hero title now uses a warmer Chinese serif/calligraphic fallback stack and reduced visual weight, closer to the reference than the earlier heavy sans-serif version. Body and navigation remain readable and consistent with the product shell.
- Spacing and layout rhythm: Header, hero, right-side streak card, CTA group, message bubbles, feature strip, and workshop preview are aligned to the reference composition. The bottom of the first viewport now reveals the next workshop section, matching the reference rhythm.
- Colors and visual tokens: Warm cream, coral, brown, and translucent white surfaces match the render direction. Contrast remains acceptable for primary copy and CTAs.
- Image quality and asset fidelity: The homepage uses the generated raster assets directly: hero scene, brand mascots, four feature icons, and workshop illustration. No placeholder illustration or CSS-drawn image replacement remains.
- Copy and content: Public homepage copy matches the intended product story: desktop download, mutual pet import, messages, visits, streaks, feature steps, and workshop preview.

**Comparison History**
- Iteration 1 finding: bottom of `1492 x 1246` viewport only showed workshop background, while the source revealed the next section heading. Fix: reduced feature strip and workshop top spacing. Evidence: final desktop screenshot now shows the workshop heading start.
- Iteration 2 finding: hero title was too heavy and black-sans-like compared with the warmer source title. Fix: changed title font stack to `STKaiti`, `KaiTi`, `Kaiti SC`, `Songti SC`, `FangSong`, `SimSun`, `serif`; reduced desktop size cap and weight. Evidence: final desktop screenshot shows a softer, more source-aligned heading.

**Open Questions**
- The generated hero image is not pixel-identical to the source render, but it follows the same scene direction and is the intended project-owned asset.
- CTA icons from the source render are not recreated in this pass; current buttons remain text-first to avoid introducing unrelated icon dependencies.

**Implementation Checklist**
- Final result: `passed`

---

## Peer Presence Tag Fidelity Pass

**Source Visual**
- Visual truth: `C:\Users\14567\AppData\Local\Temp\codex-clipboard-648b6a19-e14a-4f21-8e0d-6b5b4764dd3f.png`
- Source pixels: `1145 x 1374`; normalized full-view comparison: `320 x 384`
- State: offline peer, normal pet scale, black desktop background

**Implementation Evidence**
- Normal scale: `C:\Users\14567\AppData\Local\Temp\codex-peer-status-qa-v2\peer-status-final-normal.png`
- Maximum checked scale (`1.45x`): `C:\Users\14567\AppData\Local\Temp\codex-peer-status-qa-v2\peer-status-final-scaled-145.png`
- Full-view comparison: `C:\Users\14567\AppData\Local\Temp\codex-peer-status-qa-v2\peer-status-final-full-comparison.png`
- Focused component comparison: `C:\Users\14567\AppData\Local\Temp\codex-peer-status-qa-v2\peer-status-final-focused-comparison.png`
- Implementation capture: in-app browser at `deviceScaleFactor: 1`, clipped to the app-owned `320 x 360` pet surface
- Primary interaction: not applicable; the presence tag is intentionally non-interactive
- Console: no warnings or errors in normal or `1.45x` states

**Required Fidelity Surfaces**
- Fonts and typography: `Microsoft YaHei UI` first, `10px`, `500` weight, `#b9bdc4`, one-line `TA离线`; the previous bold `700` treatment is removed.
- Spacing and layout rhythm: `96 x 24` content frame with a `100 x 28` material surface; avatar, neutral dot, moon, and label follow the reference order. The material edge remains inside the `320 x 360` app surface at `1.45x`.
- Colors and visual tokens: neutral gray offline dot, pale blue moon, smoky black glass surface, silver rim, and restrained cool glow match the reference direction.
- Image quality and asset fidelity: the shell and peer avatar are project-owned raster assets; the moon is a dedicated resource. No text glyph, emoji, or placeholder is used for visible imagery.
- Copy and content: compact one-line `TA离线` matches the selected render.

**Comparison History**
- Iteration 1, P1: the previous implementation used a `136 x 34` generic dark tag, bold text, a circular avatar treatment, and an unreadable offline icon. Fix: introduced dedicated shell/avatar resources and the reference content sequence.
- Iteration 2, P1: the shell resource was displayed at `122 x 42`, making it too heavy, and the complex SVG moon path disappeared at runtime. Fix: reduced the shell to `100 x 30` and replaced the icon geometry.
- Iteration 3, P2: the moon remained unreliable through SVG masks/filters and the shell was still slightly tall. Fix: switched to a simple filled crescent resource, increased the visible icon slot to `15px`, reduced the shell to `100 x 28`, and shifted the tag two pixels left to keep the maximum-scale glow in bounds.
- Final evidence: the focused side-by-side comparison shows all four content marks and the high-lighted glass shell; normal and `1.45x` screenshots show no clipping or overlap.

**Remaining P3**
- The reference is a high-resolution generated render, while the runtime label and tiny avatar are rasterized at native desktop-pet size; minor antialiasing differences remain when both are enlarged for inspection.

final result: passed

---

## 2026-08-12 Heart Surprise And New-Tea Menu

**Scope**
- Dedicated `外卖到啦` interaction entry, structured surprise composer, receiver reveal card, and new-tea-inspired raster icon treatment for all six radial controls.
- `发消息` replaces the old `敲电脑` label; `生气鼓脸` is removed from the visible radial menu.

**Production Evidence**
- Tauri Debug EXE: `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\src-tauri\target-phase-e-product\debug\couple-desktop-pet.exe`
- Browser menu focus: `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\.superpowers\sdd\2026-08-12-heart-surprise-message-implementation\visual-menu-focus-full.png`
- Browser composer: `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\.superpowers\sdd\2026-08-12-heart-surprise-message-implementation\visual-composer-full.png`
- Browser collapsed card: `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\.superpowers\sdd\2026-08-12-heart-surprise-message-implementation\visual-card-collapsed-full.png`
- Browser revealed card: `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\.superpowers\sdd\2026-08-12-heart-surprise-message-implementation\visual-card-revealed-full.png`
- Native scale screenshots: `native-scale2-0-6-menu.png`, `native-scale2-1-menu.png`, and `native-scale2-1-45-menu.png` in the same evidence directory.

**Visual Findings**
- All six buttons use project-owned PNG resources; no emoji, text glyph, SVG, yellow block, or brand logo substitutes remain.
- Buttons measure `68 x 62`, with near-white fill, black linework, `7px` corners, and coral keyboard focus. Labels remain complete at all tested pet scales.
- Pet size changes at `0.6x`, `1.0x`, and `1.45x` while the interaction controls remain fixed and readable.
- The `440 x 460` surprise composer has no clipped fields or actions.
- The collapsed receiver card is `248 x 84` and leaks neither secret nor note into the DOM. The revealed card is `284 x 251.77`, remains in bounds, and exposes the secret only after activation.
- Receiver-facing copy contains none of: `外卖`, `订单`, `配送`, `取件码`, or `取餐`.
- Browser console contains no application warning or exception.

**Functional Evidence**
- Frontend tests: `533/533` passed.
- Relay tests: `27/27` passed.
- Rust tests: `51/51` passed.
- Two real authenticated WebSockets exchanged text and structured surprise messages in both directions with matching `message.received` and `message.delivered` evidence.
- Native Debug process loaded the embedded frontend, remained responsive, and was stopped by exact QA PID only.

**Review**
- Final independent read-only review found no Critical or Important source-code issue. Its Phase E evidence finding was closed by the Tauri rebuild, browser screenshots, native multi-scale screenshots, and bidirectional Relay smoke.

Final result: passed

---

## 2026-08-19 Spark Relay Final Deployment

**Local Gate**
- Fresh `pnpm --dir server test`: `13` files / `244` tests passed.
- Fresh `pnpm --dir server typecheck` and `pnpm --dir server build`: exit `0`.
- The immediately preceding Round 3 `pnpm test` passed `89` files / `951`
  tests; root typecheck and production build passed with `2,432` modules.
- `git diff --check` exited `0` with only existing Windows line-ending
  warnings; the Git index was empty.

**Backup And Incremental Deployment**
- A root-only backup was created at
  `/opt/couple-pet-relay-backups/20260819T092535Z`: directory mode `700`,
  source archive and preserved env copy mode `600`.
- The upload archive contained only current `server`, `shared`, root pnpm
  manifests, deployment files, and `.dockerignore`. It contained zero
  `node_modules`, `dist`, `.data`, target, temp, agent-workspace, or `.env`
  entries. Archive SHA-256:
  `291A4EA7C3D295E2CDA142C31ECB4E252BFFF7372C1D8E1A3DEAA0CF56725F47`.
- The remote `.env` hash matched before and after source sync, the
  `couple-pet-relay_relay-data` volume remained present, and neither value nor
  volume content was printed or replaced.
- Deployment command category: `docker compose --env-file ... -f ... up -d
  --build`. Docker loaded the root `.dockerignore`; build context was
  `407.18 kB`. Image build, TypeScript build, container recreate, and start all
  exited `0`.

**Health And Migration**
- Before deployment the volume database existed with `33` devices and `18`
  pairs; the Spark tables/index did not yet exist.
- After startup, both counts remained `33` and `18`. Tables
  `pair_spark_activity_days`, `pair_spark_streaks`, and index
  `idx_pair_spark_active_ranking` all existed.
- Public `http://159.75.175.47:8787/health` returned HTTP `200`, `ok=true`, and
  `weatherConfigured=true`. The container remained `running`, restart count
  was `0`, and the bounded startup-log scan found no startup error category.

**Authenticated Remote Spark Smoke**
- The final smoke used runtime-random credentials and printed no credential,
  message text, or raw pair/device ID.
- Two `/ws` clients negotiated `spark-v1`; initial HTTP/socket snapshots were
  `0/unlit`. One plain message reached the peer, produced sender delivery
  acknowledgement, and pushed `spark.updated` with `1/glimmer` to both peers.
- A same-day surprise delivered normally and left the snapshot at `1`, proving
  daily dedupe. Leaderboard `top20` was structurally valid and self rank was
  present. After unpair, snapshot and leaderboard both returned
  `pair_not_found`.
- Three temporary pairs were created across harness preflight/final runs; all
  three are disabled and zero remain active. Post-smoke database counts were
  `39` devices / `21` historical pairs with one activity and one streak row.
- Stable result:
  `.superpowers/sdd/2026-08-19-couple-spark-streak-leaderboard/final-delivery-evidence/remote-spark-smoke-result.json`.
  Harness SHA-256:
  `9024CD00FFD81284EC8985E8BACC2A1FF03437D3B21015BB73BF5928C08868EB`.

**Isolated Windows Debug EXE**
- Command: `$env:CARGO_TARGET_DIR = (Join-Path (Resolve-Path
  'src-tauri').Path 'target-spark-debug'); pnpm tauri build --debug
  --no-bundle`.
- The Tauri before-build gate reran root TypeScript and Vite production build;
  `2,432` modules transformed. The isolated Rust dev-profile build completed in
  `2m 48s` without touching another target directory.
- Artifact:
  `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\src-tauri\target-spark-debug\debug\couple-desktop-pet.exe`.
- Size: `208,670,208` bytes. Last write time:
  `2026-08-19T17:37:09.7432496+08:00`. SHA-256:
  `33D7B46A1D6C04AB6B70D18FFDC2CFFE414ADD9AA1E9F53B86A06EEC2B2101F9`.
- Static read verified both MZ and PE signatures. The artifact was not launched;
  no desktop-pet process was stopped or replaced.
- Machine-readable evidence:
  `.superpowers/sdd/2026-08-19-couple-spark-streak-leaderboard/final-delivery-evidence/debug-exe.json`.

**Limits**
- This shipping pass does not invent Windows 125%/150% or macOS/Linux native
  visual evidence. Those scale/platform gates remain exactly as recorded in
  the phase-one section.

---

## 2026-08-19 Spark Streak Leaderboard - Phase One

**Reference And Native Evidence**
- Approved reference: `docs/assets/spark-leaderboard-selected-v1.png`, SHA-256 `AA8336B7F58A1F498D6C99168FBF04B4CD5811E378C25AC7FBBC13B2E866682E`.
- Native Windows suite: `pnpm exec wdio run e2e/interop/wdio.windows.conf.ts --suite spark`; `1/1` spec passed at verified scale factor `1`.
- Evidence directory: `.superpowers/visual-qa/spark-leaderboard/native/`.
- Loaded 28-day/rank-27: `spark-loaded-28-day-rank-27-win32-100.png`, `460 x 638`, SHA-256 `13E7EAE6824BCB2DBAB03B26B9B4EEF85CC28CF91A86369F4FD51D514E820653`.
- Loading: `spark-loading-win32-100.png`, `460 x 638`, SHA-256 `6C4DDDCB153BCE9D7C95A207D79DC6AE14C4CD8F2B412431C2DFB2972E03A507`.
- Weekend: `spark-weekend-win32-100.png`, `460 x 638`, SHA-256 `498D25FCE61DFFE0FA658B3B8BC2EF73CA28C9044F175DB90A279864E68734DA`.
- Zero-day: `spark-zero-day-win32-100.png`, `460 x 638`, SHA-256 `04639D03F8192171170322A0B6ADA5353C9B2D188812D1A3D4682A911D1A2653`.
- Server unavailable: `spark-server-unavailable-win32-100.png`, `460 x 638`, SHA-256 `161A63A6840F7B5189AF0AD9B02604688E3C6B801E6E9DE47776FC5DA1EFA0FD`.

**Visual Findings**
- The outer window is transparent with alpha-zero corners; the inner panel is `424 x 600` within the `460 x 638` surface.
- The approved black/off-white/red hierarchy is preserved: flat differentiated top three, one continuous rank list, one near-black self strip, red tier treatment, no yellow or opaque outer backdrop.
- Long/masked identity, city, day, rank-27, zero-day unranked, weekend, loading, and retry content remains contained without clipping. A real WebView loading-header crop was corrected and recaptured.
- Close input is restricted to the visible panel region and restores the original pet geometry. Transparent gutters remain outside that interactive region.

**Verification**
- Focused client: `12` files / `258` tests passed.
- Two-client Relay behavior: `4` files / `73` tests passed.
- Full client: `89` files / `936` tests passed; typecheck and production build passed (`2,432` modules transformed).
- Full Relay: `13` files / `242` tests passed; typecheck and build passed.
- Rust: `81/81` tests passed.

**Phase-One Gate**
- Real Windows 125% and 150% screenshots and click-through/overlap checks are still mandatory; only verified 100% native evidence exists from this host. Automated logical/physical geometry tests cover `1.0`, `1.25`, and `1.5`, but do not replace native-scale evidence.
- Relay deployment, migration/smoke checks, deployment README update, and the isolated final Debug EXE are intentionally deferred until coordinating-agent review. No release sign-off is claimed.

Phase-one result: passed with explicit native-scale and shipping gates.

---

## 2026-08-18 Couple Weather Task 12 QA

**Deterministic Contract And Build Guard**
- E2E profiles/weather use the shared profile and pair-weather readers and are reachable only when `VITE_TAURI_E2E === "1"`.
- The E2E fixture contains Hangzhou/partly-cloudy (`26°`, `31°/22°`, `20%`) and Shenzhen/rain (`23°`, `27°/20°`, `80%`). Production builds retain the Relay path and do not expose a query-parameter or local-storage shortcut.
- Focused verification: `src/sync/e2eRealtimeOverride.test.ts` passed `5/5`; `src/weather/usePairWeather.test.tsx` plus `src/desktop/interopE2eConfig.test.ts` passed `14/14`.

**Complete Verification Matrix**
- `pnpm test`: `84` files, `839/839` tests passed in `68.62s`.
- `pnpm typecheck`: exit `0`.
- `pnpm build`: exit `0`; `2421` modules transformed; built in `1.07s`.
- `pnpm server:test`: `9` files, `171/171` tests passed in `4.07s`.
- `pnpm server:typecheck`: exit `0`.
- `pnpm server:build`: exit `0`.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`: exit `0`.
- `cargo test --manifest-path src-tauri/Cargo.toml`: `76/76` tests passed.
- Full command output is stored under `.superpowers/sdd/2026-08-18-couple-weather-profile/task-12-verify-*.txt`.

**Real Windows Tauri QA At 100%**
- Command: `$env:INTEROP_USE_HOST_PROFILE='1'; pnpm exec wdio run e2e/interop/wdio.windows.conf.ts --suite weather`.
- Result: `1/1` native WDIO spec passed. The embedded WebDriver provider ran successfully; its startup diagnostics still report that external `tauri-driver` is not installed.
- The explicit host-profile mode was required because Windows `SHGetKnownFolderPath` rejects the temporary `USERPROFILE` redirect. The binary uses the separate `com.couple.desktoppet.e2e` identifier, and the spec restores the prior E2E settings afterward; production settings were not read or mutated.
- Native window: scale factor `1`, `460 x 504` physical/logical pixels, undecorated, non-resizable, always on top. Content panel: `424 x 466` at `(18, 19)` with transparent outer gutters.
- Exact computed values: `#fffefa` panel, `#171717` text/border, `1px` border, `7px` radius, `#dad6cf` dividers, `#f2f0eb` care band, `3px #d52820` care rule, `21px` heading, `30px` temperatures, and two `34 x 34 #d52820` Lucide line icons. WebView2 serializes authored `letter-spacing: 0` as computed `normal`.
- Pointer contract: `.composer-surface` computed `pointer-events: none`; `.weather-composer-region` computed `pointer-events: auto`. The real close button received input. The screenshot visibly preserves all outer gutters; delivery of a gutter click to an unrelated desktop application remains a manual OS-level check.
- Functional assertions: six radial entries with `双方天气` first; both weather rows and all fields; care copy and `WeatherAPI.com`; exact pet geometry restoration after close; settings local profile; updated peer nickname/city projection.
- Native screenshot: `.superpowers/sdd/2026-08-18-couple-weather-profile/task-12-evidence/native/weather-panel-100.png`, `460 x 504`, `23,776` bytes, SHA-256 `4E33A8951FF41F04FC2538C7C3F6D3C4A2A83B8AD0A9B4BCAF4E10B4F7DCB97C`.
- Native metrics: `.superpowers/sdd/2026-08-18-couple-weather-profile/task-12-evidence/native/weather-panel-100-metrics.json`, SHA-256 `FFD8D406E5D050B78BCA8BD30AB8308727E403DB0E8516BDDFA530BA68FCDC85`.

**Browser QA**
- A local ignored harness rendered the production `WeatherPanel` and production CSS from the same deterministic shared-contract fixture at a `460 x 504` viewport.
- Measurements matched native QA: `424 x 466` panel at `(18, 19)`, exact palette/borders/radius, two `34px` red icons, no body overflow, and the same pointer-event contract. The close control removed the panel after a semantic browser click. A fresh browser run reported no console warning or error.
- Browser screenshot: `.superpowers/sdd/2026-08-18-couple-weather-profile/task-12-evidence/browser/weather-panel-browser-100.png`, `24,056` bytes, SHA-256 `A1D41B0FD98ED5582EB58A31FCFA2392200B76CC6BA94C1B4315603532B79221`.
- Browser metrics: `.superpowers/sdd/2026-08-18-couple-weather-profile/task-12-evidence/browser/weather-panel-browser-100-metrics.json`, SHA-256 `EED0612D83813AB779772D6D9C0FCA19D8E84509200516581BFD7263A38737F2`.

**Debug EXE**
- Required canonical command: `pnpm tauri build --debug --no-bundle` reached the linker after `37.716s` and failed with `os error 5` because pre-existing PID `16524` has `src-tauri/target/debug/couple-desktop-pet.exe` open. That process was not stopped.
- The same command with isolated `CARGO_TARGET_DIR=.tmp/task-12-cargo-target` completed in `182.505s`.
- Fresh Task 12 artifact: `.tmp/task-12-cargo-target/debug/couple-desktop-pet.exe`, `203,373,568` bytes, SHA-256 `9FF13B6BA590994F9FE5CD5BD1E73CB30C03E4B24791B337E93938E9A8D72FE3`.
- The locked canonical file is older (`2026-08-18T10:38:44+08:00`), `203,654,144` bytes, SHA-256 `A5065C32E94427A1613BA62D80B6A595043C2C04C070AD2BE876647B5F5D38FB`; it is not claimed as the Task 12 build.

**Release Gate**
- Automated Windows `weather-panel-100.png` is complete and verified at `AppliedDPI=96` / scale factor `1`.
- Mandatory real Windows `weather-panel-125.png` and `weather-panel-150.png` were not captured because changing host display scaling was outside this unattended run. Release sign-off remains blocked until those two captures and their overlap/gutter checks are completed using `docs/manual-verification/couple-weather.md`.
- macOS native WDIO and Linux GTK/Wayland native runs were not available on this Windows host.

Task 12 implementation result: passed with explicit release-gate and canonical-debug-path concerns.

### Task 12 Fix Round 1

**Safety And Native Assertions**
- Commit `565e2b41aeb02fc2016feea812a3b0270d1bc67d` adds a fail-closed runtime guard before every weather E2E settings write. Each call first invokes `e2e_app_data_paths`, requires the absolute app-data leaf to be exactly `com.couple.desktoppet.e2e`, and requires `settings.json` to be directly inside it. This applies independently of `INTEROP_APP_BINARY`; a custom production-identifier binary cannot reach `write_settings`.
- Native weather checks now assert nickname, city, condition, current temperature, high/low range, and rain chance separately inside `weather-row-self` and `weather-row-peer`.
- Native evidence filenames include platform and verified scale. Windows scale factor `1` writes `weather-panel-windows-100.*`; macOS output cannot overwrite or be labeled as the Windows baseline.
- Direct hook tests verify guarded E2E with no fixture falls through to Relay, reopen replaces the fixture listener, unmount removes it, and stale/removed listeners cannot update current state.

**TDD And Verification**
- RED: focused config/hook run produced `4` expected contract failures and `16` passes before the guard, naming, row-scope, and gate changes (`task-12-fix-round-1-red.txt`).
- GREEN: focused config/hook run passed `20/20`; final full client run passed `84` files and `845/845` tests. Root typecheck, E2E typecheck, and production build passed; build transformed `2421` modules.
- Real Windows WDIO weather suite passed `1/1` with the runtime app-data guard active. A second isolated-evidence run also passed while performing the OS-level gutter probe.

**100% Real Windows Evidence**
- Weather panel: `.superpowers/sdd/2026-08-18-couple-weather-profile/task-12-evidence/native/weather-panel-windows-100.png`, `23,776` bytes, SHA-256 `4E33A8951FF41F04FC2538C7C3F6D3C4A2A83B8AD0A9B4BCAF4E10B4F7DCB97C`.
- Weather metrics: `weather-panel-windows-100-metrics.json`, `1,120` bytes, SHA-256 `FFD8D406E5D050B78BCA8BD30AB8308727E403DB0E8516BDDFA530BA68FCDC85`.
- Basic information: `basic-information-settings-windows-100.png`, `18,627` bytes, SHA-256 `276000B615355D195A6E4BBAB7B21B4028F8BEB6905F7BCA954E138B63EE357A`. It is a real Tauri capture showing the populated nickname/city form.
- OS gutter click: `weather-gutter-click-windows-100.json`, `836` bytes, SHA-256 `69768B362D949526A8FB3EDBD7679A94C234FADD9352A940DFE0D6AA5896DBDE`. A dedicated borderless Win32 target was placed immediately behind the real `460 x 504` Tauri window at `(730,268)`. An injected click at screen `(738,276)` reached target-client `(8,8)`, inside the transparent gutter. No user display or input setting was changed.
- Probe script: `task-12-windows-gutter-probe.ps1`, SHA-256 `905C993AB79E1ACEF8514BA41BA8C23A8BF5C549FA8844C9358ACC218F6456E6`.

**Release Gate After Fix**
- 100% Windows weather capture, settings capture, and OS-level gutter delivery are complete.
- `weather-panel-windows-125.png` plus a real 125% OS-level gutter click/overlap check remain missing.
- `weather-panel-windows-150.png` plus a real 150% OS-level gutter click/overlap check remain missing.
- Release sign-off remains blocked until every missing 125% and 150% item is captured on the corresponding real Windows display scale. Browser or renamed macOS evidence cannot satisfy this gate.

---

## 2026-08-12 Composer Style Unification

**Source Visuals**
- Surprise composer style reference: `C:\Users\14567\AppData\Local\Temp\codex-clipboard-fbce5ea7-6e95-4967-8902-6a2a3a7263b1.png`
- Previous message composer: `C:\Users\14567\AppData\Local\Temp\codex-clipboard-63b35fa7-d3a2-4493-a918-1645ea1f9dec.png`
- Target direction: preserve the surprise composer's black, off-white, and coral system and apply it to both composers.

**Implementation Evidence**
- Message composer: `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\.superpowers\visual-qa\composer-message-unified-final.png`
- Surprise composer: `C:\Users\14567\.codex\worktrees\2fbe\情侣桌宠\.superpowers\visual-qa\composer-surprise-unified-final.png`
- Message viewport: `440 x 260` CSS pixels at device scale factor `1`.
- Surprise viewport: `440 x 460` CSS pixels at device scale factor `1`.
- Full component views were sufficient for fidelity inspection; no focused crop was required.

**Required Fidelity Surfaces**
- Typography and controls: both composers use the same compact title hierarchy, `7px` control corners, black primary action, white secondary action, and coral focus/selected treatment.
- Background behavior: `.composer-surface` and `.composer-panel` both compute to transparent; the black QA desktop is visible everywhere outside the off-white card, with no rectangular window backing.
- Hit testing: only `.composer-card-shell` publishes `data-desktop-interactive-region`; the outer surface remains `pointer-events: none` and the card is `pointer-events: auto`.
- Geometry: the message card is fully contained at `396 x 239.21875`; the surprise card is fully contained at `396 x 398.75`. The surprise submit button is inside the card at `92 x 30`.
- DPI behavior: native composer dimensions are expressed in logical pixels and tested at `1.0`, `1.25`, and `1.5` scale factors.

**Interaction Evidence**
- Surprise `取消` clicked successfully.
- `惊喜暗号` accepted `A562`, and `送出这份心意` clicked successfully.
- The submit handler returned the preview status `视觉验收预览`, confirming that the footer action receives pointer input.
- Browser console contained no warning or error entries.

**Comparison History**
- P1: the two composers previously used unrelated cream/orange and black/white/red themes. Fix: introduced shared card, field, footer, choice, and action classes based on the surprise composer.
- P1: both wrappers previously painted an opaque full-window rectangle. Fix: moved the composer surface outside the fixed pet surface and made both outer layers transparent.
- P0: the surprise footer overflowed the native interactive rectangle, so its actions were visible but not clickable. Fix: moved the desktop interactive marker to the complete visible card and sized the native window in logical pixels.
- P2: disabled controls could still show hover/focus treatment. Fix: limited hover/focus selectors to `:not(:disabled)` and disabled cancellation while a message send is pending.

Final result: passed
