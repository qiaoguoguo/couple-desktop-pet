# Built-In Pet Assets

The `star-sleeper` frames are project-generated raster assets for this repository.

The user-provided reference image was used only as character and style direction. The committed frames should not be treated as copied pixels from the reference, and no third-party web assets, downloaded asset packs, fonts, models, or audio are included here.

Generation boundary:
- Generated with Codex built-in Image Gen from project prompts.
- Converted locally to transparent PNG frames.
- No watermark.
- No readable text on clothing.
- Keep future replacement assets first-party, clearly licensed, or explicitly documented.

Current built-in package:
- `pets/star-sleeper/`: transparent 512x512 PNG animation frames referenced by `builtInPetManifest.ts`.
- The current manifest uses twelve long actions with eighteen real frames per action: three idle loops, three movement/sleep actions, and six single-click interaction actions.

## Built-In Package Contract

Built-in pets are declared in `builtInPetManifest.ts`.

The manifest defines:
- `id`: stable pet package id.
- `baseSize`: target render canvas size used by the renderer.
- `actions`: named animation groups.
- `fps`: playback speed for each action.
- `loop`: whether an action repeats.
- `frames`: repository-relative frame paths under `src/assets/`.

The current loader resolves the `star-sleeper` built-in package from `src/assets/pets/star-sleeper/`.

## External Resource Packages

External pet packages are documented in `docs/pet-resource-pack-format.md`.

The app imports `.cdpet` files into the app data directory under `pet-packages/` and never reads imported runtime frames from `src/assets`. Imported packages use the runtime id format `imported:<manifest-id>`, while the built-in fallback remains `builtin:star-sleeper`.

The first version only supports PNG sequence frames using the same manifest contract: `id`, `baseSize`, fixed `actions`, `fps`, `loop`, and frame files named `<action>-01.png` through `<action>-18.png`. The relay does not transfer package files in this version.
