# Q Girl Built-In Pet Assets

This directory contains PNG sequence frames for the built-in Q 版长发眼镜女生 desktop pet runtime path.

Reference identity image:

`docs/assets/references/q-girl-pet-reference.png`

Runtime contract:

- `formatVersion: 2`
- `renderer: frame-sequence`
- 12 main actions, each with 30 PNG frames at 5 FPS for 6000 ms
- main-action frame path pattern: `frames/<action>/0001.png` to
  `frames/<action>/0030.png`
- `motion-message-pair` with 48 PNG frames at 8 FPS for 6000 ms
- paired-message frame path pattern: `frames/motion-message-pair/0001.png` to
  `frames/motion-message-pair/0048.png`

## Main Action Frames

Current status:

- The checked-in 12 x 30 main-action frames and 48-frame paired-message motion
  are the product-approved complete built-in Taotao release resource.
- They are project-created from the approved character reference with the
  documented local generation workflow, chroma-key removal, and lightweight
  transforms.
- The manifest, build, import contract, and playback tests consume these exact
  committed files.

The release assets must not contain third-party logos, readable clothing text,
watermarks, unrelated props, visible green fringe, half-body splits, missing
glasses, missing feet, or character drift.

## Static Edge Assets

`edge-interaction/top/idle/0001.png` is the only retained hanging sprite. It is
a project-owned 640x720 transparent RGBA image frozen on its first frame while
the pet is docked at the top edge.

Left, right, and bottom docking use the static transparent sprites in
`edge-companion/side/idle.png` and `edge-companion/bottom/idle.png`. Message and
surprise notice cards remain separate UI surfaces. Animated phase sequences and
blink variants are intentionally absent from the runtime package.

The edge registry uses these normalized contact anchors:

- left: x `0.2203125`
- right: x `0.778125`
- top: y `0.05`
- bottom: y `0.367`

All retained edge assets must remain RGBA PNGs with transparent corners and
stay aligned to their direction's contact anchor.
