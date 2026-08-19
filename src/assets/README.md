# Built-In Pet Assets

The current built-in package is `builtin:q-girl`. It is a first-party PNG frame-sequence resource package for the desktop pet MVP.

The user-provided Q-girl reference image is used only as character and style direction. Committed frames must not be treated as copied pixels from third-party art, and no third-party web assets, downloaded asset packs, fonts, models, or audio are included here.

`ui/interaction-buttons/new-tea-weather.png` is project-generated paired-weather
radial-menu artwork with a transparent background.

`ui/spark/*.png` contains seven project-generated transparent spark-tier images,
from unlit through stellar. They are first-party artwork with no text, logos, or
third-party source assets.

Generation boundary:
- Current Q-girl frames are temporary local verification assets derived from
  the project reference image by `scripts/asset_tools/generate_q_girl_temp_frames.py`
  with chroma-key cleanup and lightweight transforms.
- They are not final Codex Image Gen original action frames, and should be
  replaced before public release with visually reviewed first-party animation
  frames.
- No watermark.
- No readable text on clothing.
- Keep future replacement assets first-party, clearly licensed, or explicitly documented.

Current built-in package:
- `pets/q-girl/`: transparent PNG frame-sequence assets referenced by `builtInPetManifest.ts`.
- `pets/q-girl/portrait.png` and `pets/q-girl/portrait-offline.png`: first-party
  Codex Image Gen presence portraits, processed locally with chroma-key alpha.
- `ui/interaction-buttons/new-tea-*.png`: first-party transparent PNG radial menu
  icons. `new-tea-focus.png` is the project-generated focus timer artwork; the
  remaining approved icons are copied byte-for-byte from
  `docs/assets/references/radial-menu-new-tea/`.
- `ui/surprise/heart-surprise.png`: first-party transparent PNG surprise-heart
  artwork copied byte-for-byte from `docs/assets/references/heart-surprise-new-tea-icon.png`.
- `pets/q-girl/edge-companion/`: project-generated original transparent PNG
  micro companion sprites for edge-hidden notices, produced from the approved
  design references `docs/assets/edge-hidden-micro-mascot-approved.png` and
  `docs/assets/edge-hidden-micro-mascot-directions-approved.png`.
- The current manifest uses twelve actions with thirty frames per action: three idle loops, three movement/sleep actions, and six single-click interaction actions.
- The committed Q-girl frames are temporary verification assets until the final Image Gen 12 action x 30 frame set passes visual QA.

Radial menu and surprise artwork must stay brand-neutral: no platform names, no
product logos, no emoji, no CSS-drawn fallback icons, no SVG placeholders, and no
text-only icon replacements.

## Built-In Package Contract

Built-in pets are declared in `builtInPetManifest.ts`.

The manifest defines:
- `id`: stable pet package id.
- `preview`, `portrait`, `offlinePortrait`: repository-relative package preview and
  embedded peer status portrait paths.
- `baseSize`: target render canvas size used by the renderer.
- `frameSize`: source frame size.
- `actions`: named animation groups.
- `fps`: playback speed for each action.
- `loop`: whether an action repeats.
- `frames`: repository-relative frame paths under `src/assets/`.
- `scenes`: animation director metadata, including action, bubble cues, return idle action, and optional acknowledgement behavior.

The current loader resolves the `q-girl` built-in package from `src/assets/pets/q-girl/`.

## External Resource Packages

External pet packages are documented in `docs/pet-resource-pack-format.md`.

The app imports `.cdpet` files into the app data directory under `pet-packages/` and never reads imported runtime frames from `src/assets`. Imported packages use the runtime id format `imported:<manifest-id>`, while the built-in fallback remains `builtin:q-girl`.

New external package generation should target `formatVersion: 3` with `renderer: "motion-pool"`. A v3 package needs at least one motion and may contain multiple motions under `motions/<motion-id>/`; runtime idle and ambient behavior selects from that motion pool instead of requiring fixed action names.

The six radial interaction buttons are product commands, not external package action requirements. The `act-typing` / "敲电脑" button is reused as the message composer entry in the current product flow, so a v3 package does not need a dedicated `act-typing` action folder.

`formatVersion: 2` PNG frame-sequence packages remain importable as transitional compatibility for fixed-action assets, but they are no longer recommended for new generation. Legacy `formatVersion: 1` packages are rejected and should be regenerated with the v3 motion-pool package format. The relay does not transfer package files in this version.
