# Q Girl Built-In Pet Assets

This directory contains PNG sequence frames for the built-in Q 版长发眼镜女生 desktop pet runtime path.

Reference identity image:

`docs/assets/references/q-girl-pet-reference.png`

Runtime contract:

- `formatVersion: 2`
- `renderer: frame-sequence`
- 12 actions
- 30 PNG frames per action
- 5 fps
- 6000 ms per action
- frame path pattern: `frames/<action>/0001.png` to `0030.png`

## Main Action Frames

Current status:

- The checked-in frames are temporary local verification assets generated from the project reference image with chroma-key removal and lightweight transforms.
- They are only meant to keep the q-girl code path, build, import contract, and playback tests verifiable.
- They are not final action-quality animation resources and should be replaced with project-owned ImageGen-rendered action frames before user-facing release.

The final assets must not contain third-party logos, readable clothing text, watermarks, unrelated props, visible green fringe, half-body splits, missing glasses, missing feet, or character drift.

## Edge Interaction Frames

`edge-interaction/` contains project-owned, purpose-made RGBA PNG sequences for desktop edge interaction V2. These are separate from the temporary main action placeholders above and are not derived by clipping or transforming `preview.png`.

Each direction uses a 640x720 transparent canvas for the 320x360 desktop window:

- `left/enter`: 6 frames, 8 fps, 750 ms.
- `left/idle`: 22 frames, 4 fps, 5500 ms loop.
- `left/react`: 6 frames, 6 fps, 1000 ms.
- `right/enter`: 6 frames, 8 fps, 750 ms.
- `right/idle`: 22 frames, 4 fps, 5500 ms loop.
- `right/react`: 6 frames, 6 fps, 1000 ms.
- `top/enter`: 6 frames, 8 fps, 750 ms.
- `top/idle`: 22 frames, 4 fps, 5500 ms loop.
- `top/react`: 6 frames, 6 fps, 1000 ms.
- `bottom/enter`: 6 frames, 8 fps, 750 ms.
- `bottom/idle`: 22 frames, 4 fps, 5500 ms loop.
- `bottom/react`: 6 frames, 6 fps, 1000 ms.

The edge registry uses these normalized contact anchors:

- left: x `0.275`
- right: x `0.725`
- top: y `0.05`
- bottom: y `0.367`

All edge frames must stay 640x720 RGBA with transparent corners and must remain aligned to their direction's contact anchor.
