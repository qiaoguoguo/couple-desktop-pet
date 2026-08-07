# Edge Interaction V2 Manual Verification

Date: 2026-08-07

Scope: built-in `builtin:q-girl` edge interaction, native edge placement, sequence playback, exit orchestration, and fallback behavior for packages without edge assets.

## Preconditions

- Use the full Tauri debug bundle built by `pnpm tauri build --debug`, not a plain `cargo build` development shell.
- Restore the user's normal settings and window position after any QA run.
- Use `builtin:q-girl` for visual edge verification.
- Disable ordinary auto-move during visual capture so the native edge placement remains stable.
- Do not use mouse or keyboard automation while the user is using the desktop.

## Visual Sequence Checks

For each direction, drag/release or invoke the QA-only runtime during the temporary verification run, wait until the phase is stable, and capture the desktop edge with OS clipping visible.

| Direction | Enter | Idle | React | Exit |
| --- | --- | --- | --- | --- |
| Left | Plays from partly hidden to full edge pose; hand contact is at the physical left screen edge. | Character extends from the left screen edge into the desktop; no internal fake edge line. | React keeps the same physical contact edge and shows a distinct pose/expression. | Reverse of enter; window restores before normal click/right-click/drag behavior runs. |
| Right | Plays from partly hidden to full edge pose; hand contact is at the physical right screen edge. | Character extends from the right screen edge into the desktop; no internal fake edge line. | React keeps the same physical contact edge and shows a distinct pose/expression. | Reverse of enter; window restores before normal click/right-click/drag behavior runs. |
| Top | Enter frames remain full-scale and do not collapse into a thin line. | Character hangs from the top edge with the contact point at the physical top border. | React keeps contact alignment and has no magenta residue or broken clothing. | Reverse of enter and returns to the normal pet window. |
| Bottom | Enter may begin as separated hands, then grows into the full bottom pose. | Character rises from the bottom edge with the expected bottom contact. | React keeps contact alignment and has no magenta residue or broken clothing. | Reverse of enter and returns to the normal pet window. |

Verified screenshot evidence is stored under:

- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/left-idle.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/left-react.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/right-idle.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/right-react.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/top-idle.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/top-react.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/bottom-idle.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/bottom-react.png`

Additional enter evidence:

- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/edge-enter-contact-sheet-black.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/top-enter-runtime-start.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/top-enter-runtime-end.png`
- `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/top-enter-runtime-idle.png`

## Interaction Checks

- Left click while in edge mode requests exit first. The click action runs only after the exit animation and native restore complete.
- Right click while in edge mode requests exit first. The context menu opens after restore and remains usable.
- Drag while in edge mode requests exit first. Native drag starts only if the pointer is still pressed after restore; an early pointer release does not trigger delayed drag.
- Hover/react returns to idle after the non-looping react animation completes.
- Hover during exit does not interrupt the exit sequence.
- Bubble layer, remote message layer, peer status card, and menus remain hidden during edge mode; existing message data is not discarded and can reappear after exit.

## Fallback Checks

- Imported packages without an edge interaction profile return `null` from `getBuiltInEdgeProfile`.
- When no profile exists, the app does not call native edge snap and does not display `builtin:q-girl` edge assets as a fallback.
- The ordinary pet remains visible and interactive for packages without edge resources.

## Tray, Restart, And Window Lifecycle Checks

- Closing the main window hides it instead of destroying the tray app.
- Tray show restores the hidden main window.
- Tray quit and the `quit_app` command still terminate the process.
- Restart after a hidden edge position does not persist the off-screen edge location; only the restored safe position is saved.

## Result

The 8 idle/react desktop screenshots were reviewed after the resource cleanup and left/right geometry correction. They show real Tauri desktop clipping, clean transparent edges, correct contact alignment on all four sides, and no sensitive desktop content. The enter contact sheet and top-enter runtime screenshots cover the previously missed enter sequence.
