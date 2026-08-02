# Windows MVP Manual Verification

- [ ] `pnpm install` exits 0.
- [x] `pnpm typecheck` exits 0.
- [x] `pnpm test` exits 0.
- [x] `pnpm build` exits 0.
- [ ] `pnpm tauri dev` opens a transparent undecorated desktop pet window.
- [ ] Running `src-tauri\target\debug\couple-desktop-pet.exe` directly does not open a background console window.
- [ ] Desktop pet window has no visible 1px square border or shadow around the transparent pet area.
- [ ] Settings button is not shown as a persistent on-window control by default; settings can still be opened from the pet right-click menu or tray menu.
- [ ] Desktop pet is always on top by default.
- [ ] Desktop pet can be dragged and keeps a safe visible position.
- [ ] Clicking the pet shows a happy action and bubble.
- [ ] Pet performs simple automatic movement when enabled.
- [ ] Settings panel changes scale, auto move, movement range, bubbles, always-on-top, and click-through.
- [ ] Settings persist after closing and reopening.
- [ ] Tray menu can show, hide, open settings, and exit.
- [ ] No networking, account, AI, voice, resource import, packaging, signing, or auto-update UI exists.

## Notes

- `pnpm tauri dev` is a long-running interactive process, so GUI verification was not run in this automated coding pass.
- `pnpm tauri --version` exits 0 with `tauri-cli 2.11.4`.
- `cargo check` exits 0 when run through VsDevCmd with Cargo on PATH.
- `cargo test` exits 0 for the Rust settings persistence, window position, and auto-move helpers: 8 passed.
- `pnpm tauri build --debug` exits 0 when run through VsDevCmd with Cargo on PATH.
- Task 5 generated and installed 20 transparent PNG action frames; `pnpm build` bundles those assets.
