# Q-girl Animation Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rough Q-girl interaction animation pass with cleaner alpha edges, more real key poses per interaction, and low-frequency ambient interaction playback during idle.

**Architecture:** Keep the current v2 PNG frame-sequence contract unchanged. Add a focused asset-processing pipeline for Image Gen keyframe sheets, then add a small idle behavior selector that lets `App` choose either a normal idle action or an ambient interaction without firing bubbles.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vitest, Rust tests, Python 3 + Pillow for asset processing.

## Global Constraints

- Keep `formatVersion: 2`.
- Keep `renderer: "frame-sequence"`.
- Keep 12 standard actions exactly: `idle-breathe`, `idle-look`, `idle-stretch`, `walk`, `drag`, `sleep`, `act-cute`, `act-typing`, `act-wave`, `act-hug`, `act-pout`, `act-drowsy`.
- Keep every action at 30 frames, 5 fps, `durationMs: 6000`.
- Keep source frames at `768x960 RGBA PNG`.
- Do not introduce Live2D, Spine, DragonBones, APNG, WebP, or a v3 resource package format in this pass.
- Do not trigger bubbles for automatically selected ambient interactions.
- Do not let local ambient interactions send relay messages or remote visit events.
- Continue Chinese user-facing communication in the main thread.
- Main agent coordinates and reviews; fixed Codex development thread handles coding changes.

---

## File Structure

- Create `scripts/asset_tools/q_girl_keyframe_pipeline.py`
  - Converts Image Gen 3x2 keyframe sheets into `src/assets/pets/q-girl/frames/<action>/0001.png` through `0030.png`.
  - Handles chroma-key removal, despill, alpha edge cleanup, frame composition, and validation metrics.
- Create `scripts/asset_tools/q_girl_keyframe_pipeline.test.py` only if the repo already has a Python test runner configured during implementation; otherwise use the pipeline's `--self-test` command.
- Modify `src/assets/pets/q-girl/frames/act-*/*.png`
  - Replace the six interaction action sequences with cleaner, more varied 30-frame sequences.
- Create `src/pet-core/idleBehaviorSelector.ts`
  - Selects either normal idle action or ambient interaction action using deterministic weights.
- Create `src/pet-core/idleBehaviorSelector.test.ts`
  - Tests idle-only behavior, ambient weights, and repeat avoidance.
- Modify `src/pet-core/petTypes.ts`
  - Adds an `AMBIENT_INTERACTION_SELECTED` event.
- Modify `src/pet-core/petStateMachine.ts`
  - Handles ambient interaction without updating `lastInteractionAt`.
- Modify `src/pet-core/petStateMachine.test.ts`
  - Covers ambient interaction return-to-idle semantics.
- Modify `src/pet-core/petScheduler.ts`
  - Auto-move should use current idle residence time rather than total user inactivity time.
- Modify `src/pet-core/petScheduler.test.ts` and `src/pet-core/petStateMachine.test.ts`
  - Covers the changed auto-move trigger semantics.
- Modify `src/app/App.tsx`
  - Uses `selectNextIdleBehavior` when an idle animation finishes.
  - Ambient interactions enter the existing `interacting` state without creating `activeMotionScene`.
- Modify `src/app/App.test.tsx`
  - Covers automatic ambient interaction playback and no bubble cue.
- Modify `.gitignore`
  - Keep generated contact sheets and intermediate sheets ignored under `output/` if not already ignored.

---

### Task 1: Asset Pipeline With Despill And Validation

**Files:**
- Create: `scripts/asset_tools/q_girl_keyframe_pipeline.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Image Gen keyframe sheets stored under an input directory, with files named `<action>-sheet-01.png`, `<action>-sheet-02.png`, and optionally `<action>-sheet-03.png`.
- Produces:
  - `load_action_keyframes(action: str, input_dir: Path) -> list[Image.Image]`
  - `build_action_frames(action: str, keyframes: list[Image.Image]) -> list[Image.Image]`
  - `write_action_frames(action: str, frames: list[Image.Image], frame_root: Path) -> None`
  - CLI command `python scripts/asset_tools/q_girl_keyframe_pipeline.py build --input-dir output/imagegen-keyframes --frame-root src/assets/pets/q-girl/frames`
  - CLI command `python scripts/asset_tools/q_girl_keyframe_pipeline.py validate --frame-root src/assets/pets/q-girl/frames`

- [ ] **Step 1: Write the script with a self-test**

Create `scripts/asset_tools/q_girl_keyframe_pipeline.py` with these constants and public functions:

```python
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

INTERACTION_ACTIONS = [
    "act-cute",
    "act-typing",
    "act-wave",
    "act-hug",
    "act-pout",
    "act-drowsy",
]
FRAME_SIZE = (768, 960)
CELL_COLUMNS = 3
CELL_ROWS = 2
FRAME_COUNT = 30
MIN_KEYFRAME_COUNT = 10
TARGET_HEIGHT = 840
TARGET_WIDTH = 710
BASELINE_Y = 918
CONTACT_SHEET_INDICES = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 30]


@dataclass(frozen=True)
class EdgeMetrics:
    edge_pixels: int
    green_edge_pixels: int
    green_ratio: float


def remove_chroma_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            green_strength = g - max(r, b)
            if g >= 105 and green_strength >= 34:
                alpha = 0 if green_strength >= 70 else max(0, 255 - green_strength * 4)
                pixels[x, y] = (r, g, b, alpha)
    alpha = rgba.getchannel("A").filter(ImageFilter.MedianFilter(3))
    rgba.putalpha(alpha)
    return rgba


def despill_green(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            if g > r + 12 and g > b + 12:
                replacement = round((r + b) / 2)
                # Pull hard green fringes below the surrounding red/blue channel average.
                g = min(g, replacement)
                pixels[x, y] = (r, g, b, a)
    return rgba


def contract_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    contracted = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.35))
    rgba.putalpha(contracted)
    return rgba


def crop_sheet_cells(sheet: Image.Image) -> list[Image.Image]:
    cell_width = sheet.width // CELL_COLUMNS
    cell_height = sheet.height // CELL_ROWS
    cells: list[Image.Image] = []
    for row in range(CELL_ROWS):
        for col in range(CELL_COLUMNS):
            box = (
                col * cell_width,
                row * cell_height,
                (col + 1) * cell_width,
                (row + 1) * cell_height,
            )
            cell = sheet.crop(box)
            cleaned = contract_alpha(despill_green(remove_chroma_key(cell)))
            bbox = cleaned.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(f"empty keyframe cell row={row} col={col}")
            cropped = cleaned.crop(bbox)
            scale = min(TARGET_WIDTH / cropped.width, TARGET_HEIGHT / cropped.height)
            resized = cropped.resize(
                (round(cropped.width * scale), round(cropped.height * scale)),
                Image.Resampling.LANCZOS,
            )
            cells.append(resized)
    return cells


def load_action_keyframes(action: str, input_dir: Path) -> list[Image.Image]:
    sheets = sorted(input_dir.glob(f"{action}-sheet-*.png"))
    if len(sheets) < 2:
        raise ValueError(f"{action} requires at least two keyframe sheets")
    sheet_cells: list[list[Image.Image]] = []
    for sheet_path in sheets:
        sheet_cells.append(crop_sheet_cells(Image.open(sheet_path).convert("RGBA")))
    keyframes: list[Image.Image] = []
    for cell_index in range(CELL_COLUMNS * CELL_ROWS):
        for cells in sheet_cells:
            keyframes.append(cells[cell_index])
    if len(keyframes) < MIN_KEYFRAME_COUNT:
        raise ValueError(f"{action} has only {len(keyframes)} keyframes")
    return keyframes


def build_action_frames(action: str, keyframes: list[Image.Image]) -> list[Image.Image]:
    if len(keyframes) < MIN_KEYFRAME_COUNT:
        raise ValueError(f"{action} has only {len(keyframes)} keyframes")
    frames: list[Image.Image] = []
    for index in range(FRAME_COUNT):
        key_index = min(len(keyframes) - 1, round(index * (len(keyframes) - 1) / (FRAME_COUNT - 1)))
        character = keyframes[key_index]
        frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
        local_wave = math.sin((index / max(1, FRAME_COUNT - 1)) * math.tau)
        x = (FRAME_SIZE[0] - character.width) // 2
        y = BASELINE_Y - character.height + round(local_wave * 2)
        frame.alpha_composite(character, (x, y))
        frames.append(frame)
    return frames


def write_action_frames(action: str, frames: list[Image.Image], frame_root: Path) -> None:
    if len(frames) != FRAME_COUNT:
        raise ValueError(f"{action} must output {FRAME_COUNT} frames")
    action_dir = frame_root / action
    action_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames, start=1):
        if frame.size != FRAME_SIZE or frame.mode != "RGBA":
            raise ValueError(f"{action} frame {index:04} invalid: {frame.size} {frame.mode}")
        frame.save(action_dir / f"{index:04}.png", optimize=True)


def write_contact_sheet(frame_root: Path, output_path: Path) -> None:
    thumb_size = (154, 192)
    label_height = 24
    sheet = Image.new(
        "RGBA",
        (
            len(CONTACT_SHEET_INDICES) * thumb_size[0],
            len(INTERACTION_ACTIONS) * (thumb_size[1] + label_height),
        ),
        (255, 255, 255, 255),
    )
    draw = ImageDraw.Draw(sheet)
    for row, action in enumerate(INTERACTION_ACTIONS):
        row_y = row * (thumb_size[1] + label_height)
        draw.text((4, row_y + 4), action, fill=(20, 20, 20, 255))
        for col, frame_index in enumerate(CONTACT_SHEET_INDICES):
            frame_path = frame_root / action / f"{frame_index:04}.png"
            with Image.open(frame_path).convert("RGBA") as image:
                thumb = image.resize(thumb_size, Image.Resampling.LANCZOS)
            sheet.alpha_composite(thumb, (col * thumb_size[0], row_y + label_height))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path)
```

Include CLI commands:

```python
def measure_green_edges(image: Image.Image) -> EdgeMetrics:
    rgba = image.convert("RGBA")
    edge_pixels = 0
    green_edge_pixels = 0
    for r, g, b, a in rgba.getdata():
        if a == 0 or a >= 250:
            continue
        edge_pixels += 1
        if g > r + 20 and g > b + 20:
            green_edge_pixels += 1
    ratio = green_edge_pixels / edge_pixels if edge_pixels else 0.0
    return EdgeMetrics(edge_pixels, green_edge_pixels, ratio)


def validate_frames(frame_root: Path) -> None:
    failures: list[str] = []
    for action in INTERACTION_ACTIONS:
        paths = sorted((frame_root / action).glob("*.png"))
        if len(paths) != FRAME_COUNT:
            failures.append(f"{action}: expected {FRAME_COUNT} frames, got {len(paths)}")
            continue
        for path in paths:
            image = Image.open(path).convert("RGBA")
            if image.size != FRAME_SIZE:
                failures.append(f"{path}: expected {FRAME_SIZE}, got {image.size}")
            metrics = measure_green_edges(image)
            if metrics.edge_pixels > 0 and metrics.green_ratio > 0.08:
                failures.append(f"{path}: green edge ratio {metrics.green_ratio:.3f}")
    if failures:
        raise SystemExit("\\n".join(failures[:20]))


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    build = subparsers.add_parser("build")
    build.add_argument("--input-dir", type=Path, required=True)
    build.add_argument("--frame-root", type=Path, required=True)
    validate = subparsers.add_parser("validate")
    validate.add_argument("--frame-root", type=Path, required=True)
    contact = subparsers.add_parser("contact-sheet")
    contact.add_argument("--frame-root", type=Path, required=True)
    contact.add_argument("--output", type=Path, required=True)
    self_test = subparsers.add_parser("self-test")

    args = parser.parse_args()
    if args.command == "build":
        for action in INTERACTION_ACTIONS:
            keyframes = load_action_keyframes(action, args.input_dir)
            write_action_frames(action, build_action_frames(action, keyframes), args.frame_root)
    elif args.command == "validate":
        validate_frames(args.frame_root)
    elif args.command == "contact-sheet":
        write_contact_sheet(args.frame_root, args.output)
    elif args.command == "self-test":
        test_image = Image.new("RGBA", (120, 120), (0, 255, 0, 255))
        cleaned = contract_alpha(despill_green(remove_chroma_key(test_image)))
        assert cleaned.getchannel("A").getbbox() is None


if __name__ == "__main__":
    main()
```

Ensure `.gitignore` contains:

```gitignore
output/
```

- [ ] **Step 2: Run the self-test**

Run:

```bash
python scripts/asset_tools/q_girl_keyframe_pipeline.py self-test
```

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .gitignore scripts/asset_tools/q_girl_keyframe_pipeline.py
git commit -m "tool: add q girl keyframe frame pipeline"
```

---

### Task 2: Generate Additional Image Gen Keyframe Sheets

**Files:**
- Intermediate only: `output/imagegen-keyframes/<action>-sheet-01.png`
- Intermediate only: `output/imagegen-keyframes/<action>-sheet-02.png`
- Intermediate only: `output/imagegen-keyframes/<action>-sheet-03.png`

**Interfaces:**
- Consumes: reference image `docs/assets/references/q-girl-pet-reference.png`.
- Produces: at least two keyframe sheets per action for `scripts/asset_tools/q_girl_keyframe_pipeline.py`.

- [ ] **Step 1: Prepare the output directory**

Run:

```bash
New-Item -ItemType Directory -Force output/imagegen-keyframes
```

Expected: directory exists and remains untracked because `output/` is ignored.

- [ ] **Step 2: Generate or copy sheet 01 for each action**

The current six approved sheets are under `C:\Users\14567\.codex\generated_images\019fbb47-9b0e-7e71-8989-56e2bce40542`:

```text
act-typing: call_ho0pksTn7UCMEtk1GgYjX0x5.png
act-wave: call_D2PWhGnZ8vTSxZ7hrxrpUMC8.png
act-cute: call_tjc8UmIZR8AgUM0T3QgXR8pi.png
act-hug: call_H1hseR594FOQOKbRe9SnyL9Y.png
act-pout: call_oYdKkQ1vgYkGtx34XUUr5OVv.png
act-drowsy: call_ttDTdsSs3CUy5QZT7rtOZA7D.png
```

Copy them to:

```text
output/imagegen-keyframes/act-typing-sheet-01.png
output/imagegen-keyframes/act-wave-sheet-01.png
output/imagegen-keyframes/act-cute-sheet-01.png
output/imagegen-keyframes/act-hug-sheet-01.png
output/imagegen-keyframes/act-pout-sheet-01.png
output/imagegen-keyframes/act-drowsy-sheet-01.png
```

- [ ] **Step 3: Generate sheet 02 for each action with Image Gen**

Use built-in Image Gen, with `docs/assets/references/q-girl-pet-reference.png` and the action's sheet 01 as reference images. Use this shared prompt prefix:

```text
Use case: illustration-story
Asset type: desktop pet 2D animation keyframe sheet for a PNG frame-sequence resource package

Primary request:
Create a 3x2 sprite-sheet style keyframe sheet for the same cute Q-version desktop pet girl. This is sheet 02 for the action, continuing the same action with six additional in-between or follow-through poses. The action must show clear body, arm, head, hair, and facial movement across six cells.

Input images:
Image 1 is the character identity reference. Image 2 is sheet 01 for the same action and is the style and identity consistency reference. Preserve the same Q-version character identity, clothing, face, hair, glasses, proportions, and polished anime-chibi style. Do not copy exact pixels.

Style/medium:
Polished anime chibi illustration, soft clean line art, warm expressive face, lightweight desktop pet asset, readable at 128px height.

Composition/framing:
A single image containing exactly 6 equal cells arranged 3 columns by 2 rows. Each cell contains one full-body character centered with generous padding. Same camera angle, same scale, same foot baseline in each cell. No borders between cells if possible, but keep enough spacing so the cells can be cropped cleanly.

Scene/backdrop:
Perfectly flat solid #00ff00 chroma-key background filling the whole sheet for later background removal.

Text:
No text anywhere.

Constraints:
No watermark. No extra characters. No readable text. No floor plane. No cast shadow. No contact shadow. No background texture. No green color in the character. Keep every full body completely inside its cell.

Avoid:
Photorealism, static repeated pose, copied pixels from references, tiny unreadable character, white background, transparent checkerboard, gradients, shadows, cropped body.
```

Append one action-specific subject block:

```text
Action act-cute:
Across the six keyframes: 1) hands clasped and leaning forward, 2) tiny bouncing pleading pose, 3) one hand near cheek with shy smile, 4) both hands making paw pose with bigger eyes, 5) playful wink with small hearts near the face, 6) relaxed sweet smile returning to neutral.
```

```text
Action act-typing:
Across the six keyframes: 1) laptop held steady, 2) left hand reaches to keyboard, 3) right hand reaches to keyboard, 4) both hands typing with focused eyes, 5) shoulders bounce and hair sways while typing fast, 6) satisfied smile with laptop still visible.
```

```text
Action act-wave:
Across the six keyframes: 1) hand half raised, 2) hand high to the left, 3) hand high to the right with happy mouth open, 4) head tilts while waving, 5) eyes closed and energetic wave, 6) hand lowers with warm smile.
```

```text
Action act-hug:
Across the six keyframes: 1) hands near chest, 2) arms opening, 3) arms wide, 4) arms reaching toward viewer, 5) arms wrap inward as if hugging, 6) relaxed smile after hug.
```

```text
Action act-pout:
Across the six keyframes: 1) frown with hands on hips, 2) arms crossed and cheeks puffed, 3) body turns away, 4) small stomp with one foot lifted, 5) peeking back with watery eyes, 6) reluctant soft smile.
```

```text
Action act-drowsy:
Across the six keyframes: 1) half-closed sleepy eyes, 2) rubs one eye, 3) yawns with hand covering mouth, 4) sways sideways, 5) nods off with head down, 6) wakes slightly with embarrassed smile.
```

Save generated outputs as:

```text
output/imagegen-keyframes/<action>-sheet-02.png
```

- [ ] **Step 4: Generate sheet 03 only for weak actions**

After sheet 02, visually inspect each action. Generate sheet 03 only for actions that still have fewer than 12 usable poses or obvious identity drift. Use the same prefix and action block, but replace "sheet 02" with "sheet 03" and ask for "six additional follow-through poses that do not duplicate sheet 01 or sheet 02".

- [ ] **Step 5: Visual gate**

Create a temporary contact sheet from the source sheets, inspect it, and discard any sheet with:

```text
cropped body
missing glasses
wrong clothing
green clothing or laptop
readable text
different character identity
```

Do not commit generated source sheets; they are intermediate inputs under ignored `output/`.

---

### Task 3: Rebuild Q-girl Interaction Frames With Cleaner Edges

**Files:**
- Modify: `src/assets/pets/q-girl/frames/act-cute/*.png`
- Modify: `src/assets/pets/q-girl/frames/act-typing/*.png`
- Modify: `src/assets/pets/q-girl/frames/act-wave/*.png`
- Modify: `src/assets/pets/q-girl/frames/act-hug/*.png`
- Modify: `src/assets/pets/q-girl/frames/act-pout/*.png`
- Modify: `src/assets/pets/q-girl/frames/act-drowsy/*.png`

**Interfaces:**
- Consumes: Task 1 CLI and Task 2 source sheets.
- Produces: cleaned 30-frame interaction PNG sequences, keeping the v2 package contract.

- [ ] **Step 1: Run the frame builder**

Run:

```bash
python scripts/asset_tools/q_girl_keyframe_pipeline.py build --input-dir output/imagegen-keyframes --frame-root src/assets/pets/q-girl/frames
```

Expected: six interaction action directories each contain exactly 30 PNG files.

- [ ] **Step 2: Run resource validation**

Run:

```bash
python scripts/asset_tools/q_girl_keyframe_pipeline.py validate --frame-root src/assets/pets/q-girl/frames
```

Expected: exit code 0. If a frame exceeds the green-edge threshold, fix the script thresholds or regenerate the source sheet; do not weaken the threshold just to pass.

- [ ] **Step 3: Confirm dimensions and alpha**

Run:

```bash
python - <<'PY'
from pathlib import Path
from PIL import Image
root = Path("src/assets/pets/q-girl/frames")
errors = []
for path in sorted(root.glob("*/*.png")):
    with Image.open(path) as image:
        if image.size != (768, 960) or image.mode != "RGBA":
            errors.append((str(path), image.size, image.mode))
print(f"checked={sum(1 for _ in root.glob('*/*.png'))}")
if errors:
    raise SystemExit(errors[:10])
PY
```

Expected:

```text
checked=360
```

- [ ] **Step 4: Produce a visual contact sheet for human review**

Run:

```bash
python scripts/asset_tools/q_girl_keyframe_pipeline.py contact-sheet --frame-root src/assets/pets/q-girl/frames --output output/q-girl-interaction-quality-pass-contact-sheet.png
```

Expected: file exists at:

```text
output/q-girl-interaction-quality-pass-contact-sheet.png
```

Expected visual criteria:

```text
No cut-in-half frames.
No visible green fringe at normal inspection size.
Each action has at least 10 visibly distinct poses.
Character identity remains close to Q-girl reference.
```

- [ ] **Step 5: Commit**

```bash
git add src/assets/pets/q-girl/frames/act-cute src/assets/pets/q-girl/frames/act-typing src/assets/pets/q-girl/frames/act-wave src/assets/pets/q-girl/frames/act-hug src/assets/pets/q-girl/frames/act-pout src/assets/pets/q-girl/frames/act-drowsy
git commit -m "feat: improve q girl interaction frame quality"
```

---

### Task 4: Idle Behavior Selector

**Files:**
- Create: `src/pet-core/idleBehaviorSelector.ts`
- Create: `src/pet-core/idleBehaviorSelector.test.ts`

**Interfaces:**
- Consumes: `idleActionNames`, `interactionActionNames`, `IdleActionName`, `InteractionActionName`, `PetActionName`.
- Produces:
  - `type IdleBehaviorSource = "idle" | "ambient-interaction"`
  - `interface IdleBehaviorSelection { action: PetActionName; source: IdleBehaviorSource }`
  - `function selectNextIdleBehavior(options: SelectNextIdleBehaviorOptions): IdleBehaviorSelection`

- [ ] **Step 1: Write failing selector tests**

Create `src/pet-core/idleBehaviorSelector.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { idleActionNames } from "../assets/petActionNames";
import { selectNextIdleBehavior } from "./idleBehaviorSelector";

describe("selectNextIdleBehavior", () => {
  it("returns only idle actions when ambient interactions are disabled", () => {
    expect(
      selectNextIdleBehavior({
        history: [],
        idleActions: idleActionNames,
        ambientEnabled: false,
        random: () => 0,
      }),
    ).toEqual({ action: "idle-breathe", source: "idle" });
  });

  it("returns an ambient interaction when the ambient gate is hit", () => {
    const values = [0.01, 0.01];
    expect(
      selectNextIdleBehavior({
        history: [],
        idleActions: idleActionNames,
        ambientEnabled: true,
        random: () => values.shift() ?? 0,
      }),
    ).toEqual({ action: "act-cute", source: "ambient-interaction" });
  });

  it("returns idle when the ambient gate is missed", () => {
    expect(
      selectNextIdleBehavior({
        history: [],
        idleActions: idleActionNames,
        ambientEnabled: true,
        random: () => 0.95,
      }).source,
    ).toBe("idle");
  });

  it("avoids immediately repeating the most recent ambient action", () => {
    const values = [0.01, 0.01];
    const selection = selectNextIdleBehavior({
      history: ["act-cute"],
      idleActions: idleActionNames,
      ambientEnabled: true,
      random: () => values.shift() ?? 0,
    });

    expect(selection.source).toBe("ambient-interaction");
    expect(selection.action).not.toBe("act-cute");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- src/pet-core/idleBehaviorSelector.test.ts
```

Expected: FAIL because `./idleBehaviorSelector` does not exist.

- [ ] **Step 3: Implement selector**

Create `src/pet-core/idleBehaviorSelector.ts`:

```ts
import {
  type IdleActionName,
  type InteractionActionName,
  type PetActionName,
} from "../assets/petActionNames";
import { selectNextIdleAction } from "./idleActionSelector";

export type IdleBehaviorSource = "idle" | "ambient-interaction";

export interface IdleBehaviorSelection {
  action: PetActionName;
  source: IdleBehaviorSource;
}

export interface SelectNextIdleBehaviorOptions {
  history: readonly PetActionName[];
  idleActions: readonly IdleActionName[];
  ambientEnabled: boolean;
  random?: () => number;
}

const ambientChance = 0.3;
const weightedAmbientActions: Array<{
  action: InteractionActionName;
  weight: number;
}> = [
  { action: "act-cute", weight: 6 },
  { action: "act-wave", weight: 6 },
  { action: "act-drowsy", weight: 5 },
  { action: "act-typing", weight: 3 },
  { action: "act-hug", weight: 3 },
  { action: "act-pout", weight: 1 },
];

export function selectNextIdleBehavior({
  history,
  idleActions,
  ambientEnabled,
  random = Math.random,
}: SelectNextIdleBehaviorOptions): IdleBehaviorSelection {
  if (ambientEnabled && random() < ambientChance) {
    return {
      action: selectWeightedAmbientAction(history, random),
      source: "ambient-interaction",
    };
  }

  return {
    action: selectNextIdleAction(
      history.filter(isIdleActionName),
      idleActions,
      random,
    ),
    source: "idle",
  };
}

function selectWeightedAmbientAction(
  history: readonly PetActionName[],
  random: () => number,
): InteractionActionName {
  const lastAction = history.at(-1);
  const candidates = weightedAmbientActions.filter(
    (candidate) => candidate.action !== lastAction,
  );
  const pool = candidates.length > 0 ? candidates : weightedAmbientActions;
  const totalWeight = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = random() * totalWeight;

  for (const candidate of pool) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      return candidate.action;
    }
  }

  return pool[pool.length - 1].action;
}

function isIdleActionName(action: PetActionName): action is IdleActionName {
  return (
    action === "idle-breathe" ||
    action === "idle-look" ||
    action === "idle-stretch"
  );
}
```

- [ ] **Step 4: Run selector tests**

Run:

```bash
pnpm test -- src/pet-core/idleBehaviorSelector.test.ts src/pet-core/idleActionSelector.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pet-core/idleBehaviorSelector.ts src/pet-core/idleBehaviorSelector.test.ts
git commit -m "feat: add ambient idle behavior selector"
```

---

### Task 5: State Machine And Scheduler Integration

**Files:**
- Modify: `src/pet-core/petTypes.ts`
- Modify: `src/pet-core/petStateMachine.ts`
- Modify: `src/pet-core/petStateMachine.test.ts`
- Modify: `src/pet-core/petScheduler.ts`
- Modify: `src/pet-core/petScheduler.test.ts`

**Interfaces:**
- Consumes: `InteractionActionName`, `IdleActionName`.
- Produces:
  - `PetEvent` union member `{ type: "AMBIENT_INTERACTION_SELECTED"; action: InteractionActionName; returnTo?: IdleActionName; at: number }`.
  - `transitionPetState` support for ambient interaction.
  - `getNextScheduledEvent` auto-move based on `state.enteredAt` while `state.name === "idle"`.

- [ ] **Step 1: Write failing state machine tests**

Add to `src/pet-core/petStateMachine.test.ts`:

```ts
it("plays ambient interactions without updating the last user interaction time", () => {
  const idle = createInitialPetState(1000);
  const ambient = transitionPetState(idle, {
    type: "AMBIENT_INTERACTION_SELECTED",
    action: "act-wave",
    returnTo: "idle-look",
    at: 7000,
  });
  const returnedIdle = transitionPetState(ambient, {
    type: "ANIMATION_FINISHED",
    at: 13000,
  });

  expect(ambient).toMatchObject({
    name: "interacting",
    action: "act-wave",
    lastInteractionAt: 1000,
    returnTo: "idle-look",
  });
  expect(returnedIdle).toMatchObject({
    name: "idle",
    action: "idle-look",
    lastInteractionAt: 1000,
  });
});
```

Add or update scheduler tests in `src/pet-core/petScheduler.test.ts`:

```ts
it("schedules auto move from current idle residence time, not stale user interaction time", () => {
  const idle = {
    ...createInitialPetState(1000),
    enteredAt: 20_000,
    lastInteractionAt: 1000,
  };

  expect(getNextScheduledEvent(idle, 20_250, true, 6000)).toBeNull();
  expect(getNextScheduledEvent(idle, 26_000, true, 6000)).toEqual({
    type: "IDLE_ANIMATION_FINISHED",
    action: "idle-breathe",
    at: 26_000,
  });
  expect(getNextScheduledEvent(idle, 28_000, true, 10_000)).toEqual({
    type: "AUTO_MOVE_TICK",
    at: 28_000,
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test -- src/pet-core/petStateMachine.test.ts src/pet-core/petScheduler.test.ts
```

Expected: FAIL because event type and scheduler semantics are not implemented.

- [ ] **Step 3: Update event type**

Modify `src/pet-core/petTypes.ts`:

```ts
import type {
  IdleActionName,
  InteractionActionName,
  PetActionName,
} from "../assets/petActionNames";
```

Add to `PetEvent`:

```ts
  | {
      type: "AMBIENT_INTERACTION_SELECTED";
      action: InteractionActionName;
      returnTo?: IdleActionName;
      at: number;
    }
```

- [ ] **Step 4: Update state transition**

Modify `transitionPetState` in `src/pet-core/petStateMachine.ts`:

```ts
    case "AMBIENT_INTERACTION_SELECTED":
      return enterState(
        state,
        "interacting",
        event.action,
        event.at,
        state.lastInteractionAt,
        event.returnTo,
      );
```

Do not update `lastInteractionAt` for ambient interactions.

- [ ] **Step 5: Update scheduler semantics**

Modify `src/pet-core/petScheduler.ts`:

```ts
  if (
    autoMoveEnabled &&
    state.name === "idle" &&
    now - state.enteredAt >= AUTO_MOVE_IDLE_MS
  ) {
    return { type: "AUTO_MOVE_TICK", at: now };
  }
```

Keep idle timeout based on `lastInteractionAt`.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- src/pet-core/petStateMachine.test.ts src/pet-core/petScheduler.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pet-core/petTypes.ts src/pet-core/petStateMachine.ts src/pet-core/petStateMachine.test.ts src/pet-core/petScheduler.ts src/pet-core/petScheduler.test.ts
git commit -m "feat: support ambient pet interactions"
```

---

### Task 6: App Scheduler Integration Without Bubbles

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `selectNextIdleBehavior` from Task 4.
- Consumes: `AMBIENT_INTERACTION_SELECTED` event from Task 5.
- Produces: idle animation completion may start ambient interaction; ambient interaction does not create `activeMotionScene`.

- [ ] **Step 1: Write failing App test**

Add to `src/app/App.test.tsx`:

```ts
it("can play an ambient interaction during idle without showing a bubble", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const randomSpy = vi.spyOn(Math, "random");
  randomSpy
    .mockReturnValueOnce(0.01)
    .mockReturnValueOnce(0.01);

  render(<App />);
  const petStage = await screen.findByRole("img", { name: "Q 版小人" });

  act(() => {
    vi.advanceTimersByTime(6250);
  });

  expect(petStage.closest("[data-action]")?.getAttribute("data-action")).toBe(
    "act-cute",
  );
  expect(screen.queryByText("陪我一会儿嘛。")).toBeNull();

  act(() => {
    vi.advanceTimersByTime(6250);
  });

  expect(
    screen.getByRole("img", { name: "Q 版小人" }).closest("[data-action]")?.getAttribute("data-action"),
  ).toBe("idle-breathe");

  randomSpy.mockRestore();
});
```

If the test is flaky because other code uses `Math.random`, inject a deterministic random function into `selectNextIdleBehavior` through a small wrapper inside `App` tests instead of broadening timing waits.

- [ ] **Step 2: Run App test to verify failure**

Run:

```bash
pnpm test -- src/app/App.test.tsx
```

Expected: FAIL because App still calls `selectNextIdleAction` directly.

- [ ] **Step 3: Integrate selector in `App.tsx`**

Replace imports:

```ts
import { idleActionNames, type InteractionActionName, type PetActionName } from "../assets/petActionNames";
import { selectNextIdleBehavior } from "../pet-core/idleBehaviorSelector";
```

Remove the `selectNextIdleAction` import from `App.tsx`.

Update the `IDLE_ANIMATION_FINISHED` block:

```ts
        if (event.type === "IDLE_ANIMATION_FINISHED") {
          const nextBehavior = selectNextIdleBehavior({
            history: currentState.idleHistory,
            idleActions: idleActionNames,
            ambientEnabled: true,
          });

          if (nextBehavior.source === "ambient-interaction") {
            return transitionPetState(currentState, {
              type: "AMBIENT_INTERACTION_SELECTED",
              action: nextBehavior.action as InteractionActionName,
              returnTo: "idle-breathe",
              at: event.at,
            });
          }

          return transitionPetState(currentState, {
            ...event,
            action: nextBehavior.action as (typeof idleActionNames)[number],
          });
        }
```

Do not call `setActiveMotionScene` for ambient interactions.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm test -- src/app/App.test.tsx src/pet-core/idleBehaviorSelector.test.ts src/pet-core/petStateMachine.test.ts src/pet-core/petScheduler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: play ambient interactions during idle"
```

---

### Task 7: Final Verification And Debug Build

**Files:**
- No source files should be changed unless verification reveals a defect.

**Interfaces:**
- Consumes: all previous task commits.
- Produces: verified debug executable at `src-tauri/target/debug/couple-desktop-pet.exe`.

- [ ] **Step 1: Run frontend test suite**

```bash
pnpm test
```

Expected: all Vitest test files pass.

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run frontend production build**

```bash
pnpm build
```

Expected: exit code 0.

- [ ] **Step 4: Run Rust tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass.

- [ ] **Step 5: Ensure the debug exe is not locked**

```powershell
Get-Process | Where-Object { $_.ProcessName -eq 'couple-desktop-pet' } | Select-Object Id,ProcessName,Path
```

If the path is `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe`, close that running app before building.

- [ ] **Step 6: Build debug executable**

```bash
pnpm tauri build --debug
```

Expected:

```text
Built application at: C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe
```

- [ ] **Step 7: Report remaining risks**

Report these explicitly:

```text
PNG package size remains large.
12-15 key poses are smoother than 6, but not equivalent to true 30 independent hand-drawn frames.
Hair despill target is "not obvious at desktop pet size", not perfect professional cutout.
```
