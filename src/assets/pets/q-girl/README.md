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

Current status:

- The checked-in frames are temporary local verification assets generated from the project reference image with chroma-key removal and lightweight transforms.
- They are only meant to keep the q-girl code path, build, import contract, and playback tests verifiable.
- They are not final action-quality animation resources and should be replaced with project-owned ImageGen-rendered action frames before user-facing release.

The final assets must not contain third-party logos, readable clothing text, watermarks, unrelated props, visible green fringe, half-body splits, missing glasses, missing feet, or character drift.
