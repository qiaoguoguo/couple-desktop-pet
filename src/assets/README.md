# Built-In Pet Assets

The current built-in package is `builtin:q-girl`. It is a first-party PNG frame-sequence resource package for the desktop pet MVP.

The user-provided Q-girl reference image is used only as character and style direction. Committed frames must not be treated as copied pixels from third-party art, and no third-party web assets, downloaded asset packs, fonts, models, or audio are included here.

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
- The current manifest uses twelve actions with thirty frames per action: three idle loops, three movement/sleep actions, and six single-click interaction actions.
- The committed Q-girl frames are temporary verification assets until the final Image Gen 12 action x 30 frame set passes visual QA.

## Built-In Package Contract

Built-in pets are declared in `builtInPetManifest.ts`.

The manifest defines:
- `id`: stable pet package id.
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

The current version supports `formatVersion: 2` PNG sequence frames using the same manifest contract: `renderer: "frame-sequence"`, `id`, `baseSize`, `frameSize`, fixed `actions`, `fps`, `loop`, `durationMs`, `scenes`, and frame files named `frames/<action>/0001.png` through `frames/<action>/0030.png`. The relay does not transfer package files in this version.

Legacy `formatVersion: 1` packages are rejected and should be regenerated with the v2 package format.
