# Static Edge Hidden Manual Verification

Date: 2026-08-17

Current scope: built-in `builtin:q-girl` static edge hiding, native edge
placement, persistent remote cards, drag recovery, precise transparent input, and
fallback behavior for packages without edge assets.

## Preconditions

- Use the isolated Tauri debug executable at
  `src-tauri/target-static-edge-debug/debug/couple-desktop-pet.exe`, not a plain
  browser or `cargo build` development shell.
- Restore the user's normal settings and window position after any QA run.
- Use `builtin:q-girl` for visual edge verification.
- Disable ordinary auto-move during visual capture so the native edge placement remains stable.
- Do not use mouse or keyboard automation while the user is using the desktop.

## Current Static Acceptance Matrix

For each direction, drag/release or invoke the isolated QA runtime, then capture the
stable edge state with the physical work-area edge visible.

| Direction | Static frame and placement | Forbidden visual state | Drag recovery |
| --- | --- | --- | --- |
| Left | One static micro mascot extends inward from the physical left edge; only the resolved alpha foreground is interactive. | No blink frame, hover motion, presence dot, marker, colored square, clipping, or card overlap. | A simple click and right-click are inert. A threshold-crossing drag restores the normal window and movement continues. |
| Right | One mirrored static micro mascot extends inward from the physical right edge with the same visible scale as left. | No blink frame, hover motion, presence dot, marker, colored square, clipping, or card overlap. | A simple click and right-click are inert. A threshold-crossing drag restores the normal window and movement continues. |
| Top | The first legacy idle frame hangs statically from the real top work-area edge; hands retain the approved contact point. | No RAF playback, alternate idle frame, presence dot, marker, colored square, clipping, or notice overlap. | A threshold-crossing drag restores the normal window and movement continues. |
| Bottom | One static micro mascot rises inward from the physical bottom work-area edge. | No blink frame, hover motion, presence dot, marker, colored square, clipping, or card overlap. | A threshold-crossing drag restores the normal window and movement continues. |

## Current Interaction Checks

- The static mascot does not restore on left click, right click, hover, or waiting.
- Dragging the resolved alpha foreground beyond the threshold restores from each of
  the four edges and continues moving the normal pet without a square outline.
- An active text message renders one permanently expanded edge card. Hover and
  waiting do not collapse it. Clicking it restores first, then shows the existing
  full `RemoteMessageLayer` content without acknowledging the FIFO early.
- An active surprise renders one permanently expanded generic edge card. It contains
  no secret, note, logistics text, pickup code, or passphrase. Clicking it restores
  first, then shows the existing collapsed full surprise.
- Acknowledging the full message or revealing/dismissing the full surprise advances
  the existing FIFO and never docks or automatically returns to an edge.
- Presence changes render no edge surface, dot, badge, or marker.
- Transparent stage/surface/corners remain click-through. Only resolved mascot alpha
  and concrete card controls are desktop interactive regions.
- Bubble, full remote message, peer status, and menus stay hidden while edge mode is
  active; their underlying data is preserved for normal mode.

## Fallback Checks

- Imported packages without an edge interaction profile return `null` from `getBuiltInEdgeProfile`.
- When no profile exists, the app does not call native edge snap and does not display `builtin:q-girl` edge assets as a fallback.
- The ordinary pet remains visible and interactive for packages without edge resources.

## Tray, Restart, And Window Lifecycle Checks

- Closing the main window hides it instead of destroying the tray app.
- Tray show restores the hidden main window.
- Tray quit and the `quit_app` command still terminate the process.
- Restart after a hidden edge position does not persist the off-screen edge location; only the restored safe position is saved.

## Historical 2026-08-07 Dynamic Verification

The 8 idle/react desktop screenshots were reviewed after the resource cleanup and left/right geometry correction. They show real Tauri desktop clipping, clean transparent edges, correct contact alignment on all four sides, and no sensitive desktop content. The enter contact sheet and top-enter runtime screenshots cover the previously missed enter sequence.

## Historical 2026-08-14 Edge Hidden Companion Verification

This verification used a Windows Tauri debug client built in the isolated
`src-tauri/target-edge-hidden-debug` target. WDIO controlled the embedded Tauri
provider without reloading the WebView. The run covered 0.6x, 1.0x and 1.45x states,
all four edges, black/white/mixed QA backgrounds, real blink playback, notice timing,
remote FIFO behavior, automatic same-edge return, drag, and tray recovery.

Automated gates:

```text
Focused feature tests: 187/187 passed
pnpm test: 69 files, 675 tests passed
pnpm typecheck: exit 0
pnpm build: exit 0; normal dist contains no E2E marker
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check: exit 0
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture: 66/66 passed
cargo check --manifest-path src-tauri/Cargo.toml: exit 0
WDIO native matrix: 1/1 passed, 19 screenshots
```

Measured runtime evidence from `task-7-native-qa.json`:

- blink observed after `7843ms`; unit coverage fixes the allowed delay at 8-14s and
  the closed-eye frame at 140ms
- presence/message/surprise collapse at `3055ms`, `8089ms`, and `12024ms`
- bottom dock window bottom and work-area bottom both equal `1040`
- top marker/card gaps from the resolved character alpha bounds are `48.5px` and
  `18.5px`; top idle/react still use the legacy hanging stage
- message hover did not advance the FIFO; surprise persisted until activation; full
  message/surprise appeared only after edge exit and returned to the original edge
- tray Settings restored window interaction while persisted click-through remained
  enabled; QA then explicitly cleared the checked preference

Evidence is under
`.superpowers/sdd/2026-08-14-edge-hidden-companion/screenshots/`; the combined index is
`task-7-contact-sheet.png` and structured measurements are in
`task-7-native-qa.json`.

The independent review fixes changed behavior and lifecycle handling without changing
the approved rendering. The 19-image matrix was therefore retained rather than
recaptured after the review fixes.

The tested monitor was the primary Windows work area at `1920x1040`, scale factor 1.
Negative-origin/taskbar and HiDPI work-area math is covered by Rust tests, but no
second physical monitor was available for this manual run. macOS and Linux remain
compile-safe code paths but were not run on those operating systems.

Computer Use could not capture the transparent Tauri window against the real desktop:
Windows returned `SetIsBorderRequired` / `0x80004002`. Therefore this verification does
not claim a desktop-behind click screenshot. Transparent-area behavior is supported by
native region tests, DOM evidence that only resolved character alpha and concrete
card/marker controls are interactive, and the successful real drag and tray recovery
flows. The 19 visual screenshots use QA backgrounds injected inside the WebView and
must not be described as real desktop-background captures.
