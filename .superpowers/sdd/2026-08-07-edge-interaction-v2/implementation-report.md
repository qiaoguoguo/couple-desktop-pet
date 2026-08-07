# Edge Interaction V2 Implementation Report

Date: 2026-08-07

## Scope

Implemented and verified Edge Interaction V2 for the built-in Q-girl package:

- Pure edge interaction state machine and per-frame contact anchor contract.
- Native out-of-bounds edge placement and safe restore.
- Built-in Q-girl edge asset registry.
- Dedicated edge sequence renderer.
- App orchestration for click, right-click, drag, hover/react, fallback, and hidden overlays.
- Asset cleanup and final contact alignment for all 136 edge PNG frames.

Relay, pairing, message protocol, account, website, deployment, imported package format, and `rig-demo` were not changed.

## Commits

Existing implementation commits:

- `56c15f4` `feat: define edge interaction state machine`
- `30d8bb7` `fix: position edge pets across screen bounds`
- `d12ab56` `fix: align left edge interaction anchors`
- `af554db` `feat: add q girl edge interaction assets`
- `4c07bde` `feat: animate edge pet frame sequences`
- `0acd8da` `feat: orchestrate edge pet interactions`
- `71c7c18` `fix: harden edge interaction lifecycle`
- `c7a2322` `fix: pause scheduling during edge interaction`
- `eff2c12` `fix: keep tray app alive on window close`

Final commits:

- `96799b3` `fix: clean and align edge interaction assets`
- `docs: verify edge interaction v2` is the documentation/evidence commit that contains this report and the final screenshot evidence.

## RED/GREEN Evidence

- Task 1 RED: added state-machine tests for `enter -> idle -> react -> idle -> exit` and side/contact anchor semantics before implementation.
- Task 1 GREEN: `src/pet/edgeInteraction.test.ts` passed after the pure state machine and frame anchor contract were implemented.
- Task 3 RED: Rust edge placement tests initially expected native windows to move beyond the work area instead of staying fully clamped inside it.
- Task 3 GREEN: edge placement passed for left/right/top/bottom, nearest-edge corner resolution, negative-origin work areas, HiDPI window sizes, and hidden-position persistence behavior.
- Task 2 RED: registry tests required 136 bundled PNGs, continuous frame numbering, phase durations, and imported-package fallback.
- Task 2 GREEN: built-in registry returned profiles only for `builtin:q-girl`, used eager bundled URLs, and exposed the required frame counts and phase timing.
- Task 4 RED: renderer tests required RAF-driven frame playback, phase reset, non-looping completion exactly once, callback freshness without replay reset, and fallback on load errors.
- Task 4 GREEN: `EdgePetStage` passed renderer playback and error-path tests; `FramePetStage` kept existing behavior.
- Task 5 RED: App/hook tests required preload before native snap, restore-on-load-error, click/right-click/drag exit sequencing, overlay hiding, fallback for imported packages, StrictMode remount safety, and scheduler pause during edge mode.
- Task 5 GREEN: App, hook, and native safety tests passed after preload, restore, and scheduling changes.
- Final asset RED: visual review found alpha holes, magenta residue, collapsed `top/enter` frames, and reversed side enter playback.
- Final asset GREEN: PNG quality gates passed for 136 frames; enter contact sheet and runtime top-enter screenshots passed review; 8 real desktop idle/react screenshots passed review.

## Verification Commands

Fresh final verification before commit:

- `pnpm test` - exit 0; 42 test files passed; 312 tests passed.
- `pnpm typecheck` - exit 0.
- `pnpm build` - exit 0; Vite built 619 modules.
- `cargo test --manifest-path src-tauri/Cargo.toml` - exit 0; 42 Rust tests passed.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml` - exit 0.
- `cargo check --manifest-path src-tauri/Cargo.toml` - exit 0.
- `git diff --check` - exit 0; CRLF normalization warnings only.
- `pnpm tauri build --debug` - exit 0; final debug bundle built.

## Screenshot Evidence

Absolute paths:

- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\left-idle.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\left-react.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\right-idle.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\right-react.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\top-idle.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\top-react.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\bottom-idle.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\bottom-react.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\edge-enter-contact-sheet-black.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\top-enter-runtime-start.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\top-enter-runtime-end.png`
- `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\.superpowers\sdd\2026-08-07-edge-interaction-v2\screenshots\top-enter-runtime-idle.png`

Visual result:

- Alpha cleanup passed for clothing, skin, hair edges, and transparent corners.
- Left and right geometry passed with hand contact on the physical screen edge and body extending inward.
- Top and bottom geometry passed with correct direction and stable contact.
- Enter playback passed the contact sheet review; `top/enter` no longer collapses into a thin line.

## Final Debug EXE

This is the delivery artifact from the main agent's independent rebuild at 2026-08-07 20:01:19. Debug build hashes can change if the bundle is rebuilt again.

- Path: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe`
- Size: 194,864,128 bytes
- LastWriteTime: 2026-08-07 20:01:19
- SHA256: `F0A1536359BB2D9229D19EDEFED32997EBA70318FCAC8AC5518628AED79DE1D7`

## Cleanup

- Temporary QA bridge and debug-only commands removed from source.
- Temporary capture/regeneration scripts removed.
- Project EXE process stopped after QA.
- User settings and window position restored to their backup hashes.
- `.superpowers/brainstorm/` intentionally left untouched and untracked.

## Residual Risks

- Manual screenshot evidence covers representative idle/react states and top-enter runtime; it is not a full 136-frame video capture.
- Asset quality gates are intentionally conservative around large artifacts and chroma residue; very small edge antialiasing differences still rely on visual review.
- Imported third-party packages without edge profiles degrade to ordinary pet behavior; they do not receive synthesized edge animation.
