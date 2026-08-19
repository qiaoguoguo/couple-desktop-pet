# Composer Style Unification Design

## Goal

Unify the message composer with the existing surprise composer visual language, remove the opaque square backdrop behind both cards, and make every surprise composer control reliably clickable.

## Approved Visual Direction

- Treat the existing surprise composer as the visual source of truth.
- Use the same off-white card surface, black 1.5px outline, 7px radius, black primary action, white secondary action, and red focus/selection accent for both composers.
- Keep each composer's existing information architecture and copy.
- Keep letter spacing at zero and use the existing local Chinese font stack.
- The native window outside the card remains transparent. There is no modal scrim or opaque rectangular panel.

## Layout Architecture

- `.pet-surface` remains the fixed `320x360` coordinate space for the desktop pet only.
- A new `.composer-surface` is rendered as a sibling of `.pet-surface` under `.app-shell` whenever a composer is open.
- `.composer-surface` fills the complete native window and centers the active card.
- The interactive-region marker is applied to the visible card, not the full transparent surface.
- Both cards share a common composer shell class; feature-specific classes only control their internal layout.

## Native Window Geometry

- Composer design sizes are logical pixels: message `440x260`, surprise `440x460`.
- Tauri must set composer windows using logical dimensions so CSS viewport size remains stable at 100%, 125%, and 150% Windows scaling.
- Closing either composer restores the saved pet geometry exactly as before.

## Interaction Requirements

- Message textarea, Cancel, and Send remain keyboard and pointer operable.
- Surprise themes, secret input, note textarea, Cancel, and Send remain keyboard and pointer operable.
- The surprise card interactive rectangle must include both footer buttons.
- Transparent pixels outside the card continue to pass pointer events to the desktop.

## Verification

- Add failing tests for composer placement outside `.pet-surface`, shared shell classes, card-scoped interactive regions, and logical Tauri sizes.
- Capture message and surprise states at their native viewport sizes.
- Confirm no opaque square backdrop, no clipped content, and consistent visual tokens.
- Click both surprise footer buttons in a rendered/native build.
- Run frontend tests, typecheck, build, Rust tests/check/format, and build the debug EXE at the path used by the user.
