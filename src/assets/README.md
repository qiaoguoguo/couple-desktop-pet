# Built-In Pet Assets

The runtime ships two built-in packages: `builtin:q-girl` (Taotao, the default)
and `builtin:q-boy` (Qinghe). Imported packages are loaded from app data and do
not add directories beneath this runtime asset root.

The user-provided Q-girl reference image is used only as character and style direction. Committed frames must not be treated as copied pixels from third-party art, and no third-party web assets, downloaded asset packs, fonts, models, or audio are included here.

`ui/interaction-buttons/new-tea-weather.png` is project-generated paired-weather
radial-menu artwork with a transparent background.

`ui/spark/*.png` contains seven project-generated transparent spark-tier images,
from unlit through stellar. They are first-party artwork with no text, logos, or
third-party source assets.

Generation boundary:
- The Q-girl 12 x 30 main-action frames and 48-frame paired-message motion are
  the product-approved complete Taotao built-in release assets.
- They are project-created from the approved character reference through the
  documented local asset workflow, including chroma-key cleanup and lightweight
  transforms.
- No watermark.
- No readable text on clothing.
- Keep any future additions first-party, clearly licensed, or explicitly documented.

Current built-in packages:
- `pets/q-girl/`: transparent PNG frame-sequence assets referenced by `builtInPetManifest.ts`.
- `pets/q-boy/`: the complete Qinghe motion-pool package referenced by
  `builtInBoyManifest.ts`.
- `pets/q-girl/portrait.png` and `pets/q-girl/portrait-offline.png`: first-party
  Codex Image Gen presence portraits, processed locally with chroma-key alpha.
- `ui/interaction-buttons/new-tea-*.png`: the four retained first-party radial
  command icons for focus, message, status, and weather.
- `ui/surprise/heart-surprise.png`: first-party transparent PNG surprise-heart
  artwork copied byte-for-byte from `docs/assets/references/heart-surprise-new-tea-icon.png`.
- `pets/q-girl/edge-companion/`: static side and bottom micro-companion sprites
  for edge-hidden notices. Animated blink variants are intentionally absent.
- `pets/q-girl/edge-interaction/top/idle/0001.png`: the only retained hanging
  edge sprite. The former directional and phase animation sequences are not
  part of the runtime package.
- The current Taotao manifest uses twelve actions with thirty frames per action:
  three idle loops, three movement/sleep actions, and six single-click
  interaction actions, plus the complete 48-frame paired-message motion.

Radial menu and surprise artwork must stay brand-neutral: no platform names, no
product logos, no emoji, no CSS-drawn fallback icons, no SVG placeholders, and no
text-only icon replacements.

## Built-In Package Contract

Taotao is declared in `builtInPetManifest.ts`, and Qinghe is declared in
`builtInBoyManifest.ts`.

The two manifests expose shared runtime package metadata:
- `id`, `name`: stable pet package identity and display name.
- `preview`, `portrait`, `offlinePortrait`: repository-relative package preview and
  embedded peer status portrait paths.
- `baseSize`: target render canvas size used by the renderer.
- `frameSize`: source frame size.
- `actions` or `motions`: renderer-specific named animation collections.
- `fps`, `loop`, `frames`: playback data within each action or motion.
- `scenes`: animation director metadata, including action, bubble cues, return idle action, and optional acknowledgement behavior.

The current loader resolves only `q-girl` and `q-boy` beneath `src/assets/pets/`.

## External Resource Packages

External pet packages are documented in `docs/pet-resource-pack-format.md`.

The app imports `.cdpet` files into the app data directory under `pet-packages/` and never reads imported runtime frames from `src/assets`. Imported packages use the runtime id format `imported:<manifest-id>`, while the built-in fallback remains `builtin:q-girl`.

New external package generation should target `formatVersion: 3` with `renderer: "motion-pool"`. A v3 package needs at least one motion and may contain multiple motions under `motions/<motion-id>/`; runtime idle and ambient behavior selects from that motion pool instead of requiring fixed action names.

The six radial entries are product commands, not external package action
requirements. A v3 package does not need matching command action folders.

`formatVersion: 2` PNG frame-sequence packages remain importable as transitional compatibility for fixed-action assets, but they are no longer recommended for new generation. Legacy `formatVersion: 1` packages are rejected and should be regenerated with the v3 motion-pool package format. The relay does not transfer package files in this version.
