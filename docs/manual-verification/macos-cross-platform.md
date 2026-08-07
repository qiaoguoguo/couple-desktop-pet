# macOS Cross-Platform Manual Verification

This checklist covers native macOS behavior that cannot be proven by static configuration or WebDriver DOM checks alone.

## Native Shell Evidence

- Launch the signed or ad-hoc `.app` from Finder and from Terminal.
- Confirm the app is an agent app: no Dock icon is visible from startup, and the menu bar tray item is available.
- Capture before/after screenshots for Dock and menu bar tray. `LSUIElement=true` and `ActivationPolicy::Accessory` are configuration evidence, not visual proof.
- Confirm transparent window composition against a light and dark desktop background.
- Confirm the window remains above ordinary app windows while always-on-top is enabled.
- Confirm close-to-hide hides the window and the tray menu can show it again.

## Input And Window Behavior

- Drag the pet and confirm position memory after quit/relaunch.
- Change scale and confirm the pet stays visible on the active work area.
- Enable automatic movement and confirm it moves only within the selected range.
- Enable click-through and confirm the tray show/settings path restores input before focusing the window.
- Open settings from tray and from right-click context menu.

## Product Flow

- Import, select, and delete a `.cdpet` package.
- Open the interaction menu, choose “我的状态”, and close the status dialog with Escape.
- Open the message composer only during a real paired-client interop test.
- Verify current four-edge interaction behavior manually; this task does not change edge trigger or snap logic.

## Evidence Boundary

- `scripts/macos/native-evidence.mjs` records environment, plist, signature, launch, process, and screenshot facts that commands can prove.
- Dock absence, transparency, z-order, tray usability, drag behavior, position memory, scaling, automatic movement, click-through recovery, and close-to-hide require this manual checklist with screenshots or screen recording.
