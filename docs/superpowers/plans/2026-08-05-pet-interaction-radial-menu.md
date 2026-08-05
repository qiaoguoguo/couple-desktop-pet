# Pet Interaction Radial Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one left-click reliably open the interaction menu, remove hover settings exposure, and replace the plain interaction grid with a Q-style radial pop menu.

**Architecture:** Keep the behavior local to the desktop pet shell. `FramePetStage` owns pointer threshold detection, `App` owns menu open/close orchestration, and `InteractionMenu` owns radial presentation and button asset mapping. Generated button icons are static project assets under `src/assets/ui/interaction-buttons/`.

**Tech Stack:** Tauri 2, React, TypeScript, Vitest, Testing Library, CSS keyframes, PNG UI assets.

## Global Constraints

- Work in `C:\Users\14567\.codex\worktrees\6515\情侣桌宠`.
- Communicate implementation reports in Chinese.
- Do not touch sync, relay, backend, website, resource-pack format, or pet frame animation files.
- Do not add a new UI framework or animation library.
- Settings must be reachable through right-click context menu, not through hover.
- Left-click on the pet must open the interaction menu with one click.
- Real drag must still call `startWindowDrag()` and must suppress the following click.
- Keep `dragClickThresholdPx = 4`.
- Keep existing 6 interaction actions and labels: `act-cute`, `act-typing`, `act-wave`, `act-hug`, `act-pout`, `act-drowsy`.
- Interaction menu keeps `role="menu"` and each action keeps `role="menuitem"`.
- Q button images must be project-owned PNG assets with no text or watermark.
- Validate with focused tests, full frontend tests, typecheck, frontend build, Rust tests, and debug Tauri build before final delivery.

---

## File Structure

- `src/assets/ui/interaction-buttons/act-cute.png`: Q icon for "撒娇卖萌".
- `src/assets/ui/interaction-buttons/act-typing.png`: Q icon for "敲电脑".
- `src/assets/ui/interaction-buttons/act-wave.png`: Q icon for "打招呼".
- `src/assets/ui/interaction-buttons/act-hug.png`: Q icon for "求抱抱".
- `src/assets/ui/interaction-buttons/act-pout.png`: Q icon for "生气鼓脸".
- `src/assets/ui/interaction-buttons/act-drowsy.png`: Q icon for "困困打盹".
- `src/renderer/FramePetStage.tsx`: change pointer handling from immediate drag to delayed drag threshold.
- `src/renderer/FramePetStage.test.tsx`: update pointer tests for click/drag split.
- `src/interaction/InteractionMenu.tsx`: import button icons and render radial Q-style buttons.
- `src/interaction/InteractionMenu.test.tsx`: verify radial menu structure, style variables, icons, and callbacks.
- `src/app/App.tsx`: adjust interaction menu anchor dimensions if needed and ensure right-click closes interaction menu.
- `src/app/App.test.tsx`: update click/drag/settings expectations.
- `src/app/app.css`: remove hover/focus settings reveal and add radial menu/Q button styling.
- `.superpowers/sdd/2026-08-05-pet-interaction-radial-menu/dev-round-1-report.md`: implementation report from the fixed development task.

---

### Task 1: Generate Q Interaction Button Assets

**Files:**
- Create: `src/assets/ui/interaction-buttons/act-cute.png`
- Create: `src/assets/ui/interaction-buttons/act-typing.png`
- Create: `src/assets/ui/interaction-buttons/act-wave.png`
- Create: `src/assets/ui/interaction-buttons/act-hug.png`
- Create: `src/assets/ui/interaction-buttons/act-pout.png`
- Create: `src/assets/ui/interaction-buttons/act-drowsy.png`
- Create optional preview: `output/interaction-button-icons-source.png`
- Create optional preview: `output/interaction-button-icons-contact-sheet.png`

**Interfaces:**
- Produces image URLs imported by `InteractionMenu.tsx` as:
  - `actCuteIconUrl`
  - `actTypingIconUrl`
  - `actWaveIconUrl`
  - `actHugIconUrl`
  - `actPoutIconUrl`
  - `actDrowsyIconUrl`

- [ ] **Step 1: Generate the icon sheet**

Use the built-in image generation tool, not Codex CLI. Generate one 3 by 2 sheet with a flat chroma-key background.

Prompt:

```text
Use case: illustration-story
Asset type: desktop pet radial menu sticker icon sheet

Primary request:
Generate a single 3 columns by 2 rows icon sheet for six Q-style desktop pet interaction buttons. The sheet will be cropped into six separate 256x256 icons.

Subject:
Exactly six separate sticker-style icons, one centered in each equal cell, in this order from left to right, top row then bottom row:
1. shy cute gesture with a small heart, for "cute"
2. mini laptop and keyboard with a tiny hand tap, for "typing"
3. waving hand with soft motion curve, for "wave"
4. open arms hugging a heart, for "hug"
5. puffed cheeks chibi face expression, for "pout"
6. sleepy crescent moon and small sleep bubble, for "drowsy"

Style/medium:
Polished Q-version kawaii sticker UI icons, soft anime chibi feeling, warm hand-drawn outline, creamy sticker highlights, rounded shapes, cute and lightweight. Match a warm desktop pet app for a Q-version girl character, but do not draw the full girl character.

Composition/framing:
Square sheet, 3 equal columns and 2 equal rows. Each icon is centered in its cell, with generous padding and no overlap between cells. Icons must stay readable at 32px and 48px UI sizes.

Scene/backdrop:
Perfectly flat solid #00ff00 chroma-key background for background removal. Background must be one uniform color, no shadows, no gradients, no texture, no floor plane.

Text:
No text.

Constraints:
No watermark. No readable text. No extra characters. No background decorations. Do not use #00ff00 inside any icon. Crisp separated edges for chroma-key removal.

Avoid:
Photorealism, vector-flat sterile icons, dark shadows, UI screenshots, labels, words, letters, numbers, transparent checkerboard, white background, green color inside icons.
```

- [ ] **Step 2: Copy the generated source sheet into the project**

Copy the selected built-in generated image to:

```powershell
New-Item -ItemType Directory -Force 'output' | Out-Null
Copy-Item -LiteralPath '<generated-image-path>' -Destination 'output\interaction-button-icons-source.png' -Force
```

- [ ] **Step 3: Crop and remove chroma-key**

Run a local Pillow script that crops the sheet into six equal cells and removes the flat `#00ff00` background. The final image size for each icon must be `256x256`.

```powershell
@'
from pathlib import Path
from PIL import Image, ImageChops

root = Path.cwd()
source = root / "output" / "interaction-button-icons-source.png"
out_dir = root / "src" / "assets" / "ui" / "interaction-buttons"
out_dir.mkdir(parents=True, exist_ok=True)
names = [
    "act-cute.png",
    "act-typing.png",
    "act-wave.png",
    "act-hug.png",
    "act-pout.png",
    "act-drowsy.png",
]

sheet = Image.open(source).convert("RGBA")
w, h = sheet.size
cell_w = w // 3
cell_h = h // 2
key = (0, 255, 0)

def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            distance = abs(r - key[0]) + abs(g - key[1]) + abs(b - key[2])
            if distance < 54:
                pixels[x, y] = (r, g, b, 0)
            elif g > 170 and r < 120 and b < 120:
                pixels[x, y] = (r, min(g, 110), b, a)
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    canvas = Image.new("RGBA", (256, 256), (255, 255, 255, 0))
    rgba.thumbnail((214, 214), Image.Resampling.LANCZOS)
    canvas.alpha_composite(rgba, ((256 - rgba.width) // 2, (256 - rgba.height) // 2))
    return canvas

for index, name in enumerate(names):
    col = index % 3
    row = index // 3
    crop = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
    remove_key(crop).save(out_dir / name)

contact = Image.new("RGBA", (3 * 256, 2 * 256), (255, 255, 255, 255))
for index, name in enumerate(names):
    icon = Image.open(out_dir / name).convert("RGBA")
    contact.alpha_composite(icon, ((index % 3) * 256, (index // 3) * 256))
contact.save(root / "output" / "interaction-button-icons-contact-sheet.png")
'@ | python -
```

- [ ] **Step 4: Validate the final assets**

Run:

```powershell
@'
from pathlib import Path
from PIL import Image

paths = sorted((Path("src/assets/ui/interaction-buttons")).glob("act-*.png"))
assert len(paths) == 6, paths
for path in paths:
    image = Image.open(path)
    assert image.size == (256, 256), (path, image.size)
    assert image.mode == "RGBA", (path, image.mode)
    assert image.getpixel((0, 0))[3] == 0, (path, image.getpixel((0, 0)))
print("validated", len(paths), "interaction button icons")
'@ | python -
```

Expected: `validated 6 interaction button icons`.

- [ ] **Step 5: Commit**

```powershell
git add src/assets/ui/interaction-buttons output/interaction-button-icons-source.png output/interaction-button-icons-contact-sheet.png
git commit -m "feat: add q interaction button assets"
```

---

### Task 2: Delayed Drag Threshold In FramePetStage

**Files:**
- Modify: `src/renderer/FramePetStage.tsx`
- Modify: `src/renderer/FramePetStage.test.tsx`

**Interfaces:**
- Consumes props already defined by `FramePetStageProps`:
  - `onPetClick(): void`
  - `onDragStart(): void`
  - `onDragEnd(): void`
- Produces the same public component signature; no caller props change.

- [ ] **Step 1: Write the failing click test**

Add this test to `FramePetStage pointer interactions`:

```tsx
it("opens pet click without starting or ending drag on a simple click", () => {
  const { props, stage } = renderStage();

  fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(stage, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.click(stage);

  expect(props.onDragStart).not.toHaveBeenCalled();
  expect(props.onDragEnd).not.toHaveBeenCalled();
  expect(props.onPetClick).toHaveBeenCalledTimes(1);
});
```

Replace the existing "ends dragging on leave only after pointer down" test with:

```tsx
it("does not start or end dragging when pointer leaves before crossing the drag threshold", () => {
  const { props, stage } = renderStage();

  fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerLeave(stage, { pointerId: 1, clientX: 11, clientY: 11 });

  expect(props.onDragStart).not.toHaveBeenCalled();
  expect(props.onDragEnd).not.toHaveBeenCalled();
});
```

Add this threshold test:

```tsx
it("starts dragging only after pointer movement crosses the threshold", () => {
  const { props, stage } = renderStage();

  fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(stage, { pointerId: 1, clientX: 12, clientY: 10 });
  expect(props.onDragStart).not.toHaveBeenCalled();

  fireEvent.pointerMove(stage, { pointerId: 1, clientX: 18, clientY: 10 });
  expect(props.onDragStart).toHaveBeenCalledTimes(1);

  fireEvent.pointerMove(stage, { pointerId: 1, clientX: 22, clientY: 10 });
  expect(props.onDragStart).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run:

```powershell
pnpm test -- src/renderer/FramePetStage.test.tsx
```

Expected before implementation: the simple-click test fails because `onDragStart` and `onDragEnd` are called for a click.

- [ ] **Step 3: Implement delayed drag**

Change `FramePetStage.tsx` as follows:

- Keep `pointerStartRef`, `dragMovedRef`, and `suppressNextClickRef`.
- Add `draggingRef`:

```tsx
const draggingRef = useRef(false);
```

- `handlePointerDown` must only record pointer state and capture the pointer. It must not call `onDragStart()`.
- `handlePointerMove` must call `onDragStart()` once only after movement exceeds `dragClickThresholdPx`.
- `finishDrag` must call `onDragEnd()` only when `draggingRef.current` is true for the active pointer.
- Clear `activePointerIdRef`, `pointerStartRef`, `dragMovedRef`, and `draggingRef` at the end of `finishDrag`.

The core branch inside `handlePointerMove` should be:

```tsx
if (Math.hypot(deltaX, deltaY) > dragClickThresholdPx) {
  dragMovedRef.current = true;

  if (!draggingRef.current) {
    draggingRef.current = true;
    onDragStart();
  }
}
```

Update `finishDrag` so it follows this shape:

```tsx
const wasDragging = draggingRef.current;

if (wasDragging) {
  suppressNextClickRef.current = true;
}

activePointerIdRef.current = null;
pointerStartRef.current = null;
dragMovedRef.current = false;
draggingRef.current = false;

if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
  event.currentTarget.releasePointerCapture(event.pointerId);
}

if (wasDragging) {
  onDragEnd();
}
```

- [ ] **Step 4: Run the focused test to verify pass**

Run:

```powershell
pnpm test -- src/renderer/FramePetStage.test.tsx
```

Expected: all `FramePetStage` tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/FramePetStage.tsx src/renderer/FramePetStage.test.tsx
git commit -m "fix: delay pet drag until movement threshold"
```

---

### Task 3: Q-Style Radial InteractionMenu

**Files:**
- Modify: `src/interaction/InteractionMenu.tsx`
- Modify: `src/interaction/InteractionMenu.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes `PetInteractionOption` with `id`, `label`, and `bubble`.
- Produces no new exported component props.
- Produces DOM:
  - `.pet-interaction-menu[role="menu"]`
  - `.pet-interaction-button[role="menuitem"]`
  - `.pet-interaction-icon > img`
  - `.pet-interaction-label`

- [ ] **Step 1: Write failing InteractionMenu tests**

Update `src/interaction/InteractionMenu.test.tsx`.

Add an assertion that the open menu has all six items:

```tsx
expect(screen.getAllByRole("menuitem")).toHaveLength(6);
```

Add this test:

```tsx
it("renders Q sticker buttons with icon containers and stagger variables", () => {
  render(
    <InteractionMenu
      open
      x={10}
      y={20}
      options={interactionOptions}
      onSelect={vi.fn()}
    />,
  );

  const firstButton = screen.getByRole("menuitem", { name: "撒娇卖萌" });

  expect(firstButton.classList.contains("pet-interaction-button")).toBe(true);
  expect(firstButton.getAttribute("style")).toContain("--menu-x");
  expect(firstButton.getAttribute("style")).toContain("--menu-y");
  expect(firstButton.getAttribute("style")).toContain("--menu-delay");
  expect(firstButton.querySelector(".pet-interaction-icon img")).toBeTruthy();
  expect(firstButton.querySelector(".pet-interaction-label")?.textContent).toBe(
    "撒娇卖萌",
  );
});
```

- [ ] **Step 2: Run InteractionMenu tests to verify failure**

Run:

```powershell
pnpm test -- src/interaction/InteractionMenu.test.tsx
```

Expected before implementation: Q sticker class, icon, and style variable assertions fail.

- [ ] **Step 3: Import icons and define radial layout**

At the top of `InteractionMenu.tsx`, add static asset imports:

```tsx
import actCuteIconUrl from "../assets/ui/interaction-buttons/act-cute.png";
import actDrowsyIconUrl from "../assets/ui/interaction-buttons/act-drowsy.png";
import actHugIconUrl from "../assets/ui/interaction-buttons/act-hug.png";
import actPoutIconUrl from "../assets/ui/interaction-buttons/act-pout.png";
import actTypingIconUrl from "../assets/ui/interaction-buttons/act-typing.png";
import actWaveIconUrl from "../assets/ui/interaction-buttons/act-wave.png";
```

Add local maps:

```tsx
const optionIcons: Record<InteractionActionName, string> = {
  "act-cute": actCuteIconUrl,
  "act-typing": actTypingIconUrl,
  "act-wave": actWaveIconUrl,
  "act-hug": actHugIconUrl,
  "act-pout": actPoutIconUrl,
  "act-drowsy": actDrowsyIconUrl,
};

const optionPositions: Record<
  InteractionActionName,
  { x: number; y: number }
> = {
  "act-cute": { x: -76, y: -88 },
  "act-typing": { x: 0, y: -112 },
  "act-wave": { x: 76, y: -88 },
  "act-hug": { x: -92, y: -12 },
  "act-pout": { x: 92, y: -12 },
  "act-drowsy": { x: 0, y: 62 },
};
```

- [ ] **Step 4: Render radial Q buttons**

Change the option render loop to:

```tsx
{options.map((option, index) => {
  const position = optionPositions[option.id];

  return (
    <button
      key={option.id}
      type="button"
      className="pet-interaction-button"
      role="menuitem"
      style={
        {
          "--menu-x": `${position.x}px`,
          "--menu-y": `${position.y}px`,
          "--menu-delay": `${index * 24}ms`,
        } as React.CSSProperties
      }
      onClick={() => onSelect(option.id)}
    >
      <span className="pet-interaction-icon" aria-hidden="true">
        <img src={optionIcons[option.id]} alt="" />
      </span>
      <span className="pet-interaction-label">{option.label}</span>
    </button>
  );
})}
```

If `React.CSSProperties` is not imported as a namespace, import `type CSSProperties` from React and use `as CSSProperties`.

- [ ] **Step 5: Replace menu CSS**

Replace the current `.pet-interaction-menu` grid/card CSS and current `.pet-interaction-menu button` rules in `src/app/app.css`.

Use this CSS as the baseline:

```css
.pet-interaction-menu {
  position: absolute;
  z-index: 9;
  width: 1px;
  height: 1px;
  overflow: visible;
  pointer-events: none;
}

.pet-interaction-button {
  position: absolute;
  left: 0;
  top: 0;
  width: 68px;
  height: 62px;
  display: grid;
  grid-template-rows: 36px 1fr;
  place-items: center;
  gap: 2px;
  padding: 4px 5px 5px;
  border: 2px solid rgb(75 43 26 / 0.62);
  border-radius: 18px 16px 19px 15px;
  background:
    linear-gradient(180deg, rgb(255 252 244 / 0.98), rgb(255 229 214 / 0.96));
  box-shadow:
    0 8px 16px rgb(75 43 26 / 0.14),
    inset 0 -2px 0 rgb(255 163 129 / 0.24);
  color: #3b271c;
  font: inherit;
  font-size: 11px;
  line-height: 1.1;
  text-align: center;
  transform: translate(-50%, -50%) translate(var(--menu-x), var(--menu-y))
    scale(1);
  transform-origin: center;
  animation: pet-interaction-pop 230ms cubic-bezier(0.2, 1.45, 0.34, 1) both;
  animation-delay: var(--menu-delay);
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
}

.pet-interaction-button:nth-child(2n) {
  background:
    linear-gradient(180deg, rgb(255 253 247 / 0.98), rgb(234 242 255 / 0.96));
}

.pet-interaction-button:nth-child(3n) {
  background:
    linear-gradient(180deg, rgb(255 253 246 / 0.98), rgb(244 235 255 / 0.96));
}

.pet-interaction-button:hover,
.pet-interaction-button:focus-visible {
  outline: none;
  transform: translate(-50%, -50%) translate(var(--menu-x), calc(var(--menu-y) - 4px))
    scale(1.05);
  box-shadow:
    0 12px 20px rgb(75 43 26 / 0.18),
    inset 0 -2px 0 rgb(255 163 129 / 0.26);
}

.pet-interaction-button:active {
  transform: translate(-50%, -50%) translate(var(--menu-x), calc(var(--menu-y) + 1px))
    scale(0.97);
}

.pet-interaction-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.pet-interaction-icon img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.pet-interaction-label {
  max-width: 58px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes pet-interaction-pop {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) translate(
        calc(var(--menu-x) * 0.22),
        calc(var(--menu-y) * 0.22)
      )
      scale(0.72);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) translate(var(--menu-x), var(--menu-y))
      scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pet-interaction-button {
    animation: none;
  }
}
```

- [ ] **Step 6: Run InteractionMenu tests**

Run:

```powershell
pnpm test -- src/interaction/InteractionMenu.test.tsx
```

Expected: all `InteractionMenu` tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/interaction/InteractionMenu.tsx src/interaction/InteractionMenu.test.tsx src/app/app.css
git commit -m "feat: add q radial interaction menu"
```

---

### Task 4: App Settings Entry And One-Click Interaction Integration

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes `FramePetStage` delayed drag behavior from Task 2.
- Consumes `InteractionMenu` radial menu behavior from Task 3.
- Produces same public `App` component.

- [ ] **Step 1: Update App tests for delayed drag**

Replace the existing test named `starts desktop window dragging when pet drag begins` with this:

```tsx
it("starts desktop window dragging only after pet movement crosses the drag threshold", () => {
  const { container } = render(<App />);
  const petStage = container.querySelector(".pet-frame-stage");

  if (!petStage) {
    throw new Error("pet stage missing");
  }

  fireEvent.pointerDown(petStage, { pointerId: 1, clientX: 10, clientY: 10 });
  expect(windowCommandsMock.startWindowDrag).not.toHaveBeenCalled();

  fireEvent.pointerMove(petStage, { pointerId: 1, clientX: 18, clientY: 10 });
  expect(windowCommandsMock.startWindowDrag).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Add App test for one left-click opening**

Add this test near the existing interaction menu tests:

```tsx
it("opens interaction options with one left click on the pet stage", async () => {
  const { container } = render(<App />);
  await screen.findByRole("img", { name: "Q 版小人" });
  const petStage = container.querySelector(".pet-frame-stage");

  if (!petStage) {
    throw new Error("pet stage missing");
  }

  fireEvent.pointerDown(petStage, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(petStage, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.click(petStage);

  expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
  expect(windowCommandsMock.startWindowDrag).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Add App test for hover not revealing settings**

Add this test after `keeps the settings button visually hidden by default`:

```tsx
it("does not reveal the settings button through shell hover or focus", async () => {
  const { container } = render(<App />);

  const settingsButton = await screen.findByRole("button", { name: "设置" });
  const shell = container.querySelector(".app-shell");

  if (!shell) {
    throw new Error("app shell missing");
  }

  fireEvent.mouseOver(shell);
  fireEvent.focus(settingsButton);

  expect(settingsButton.className).toBe("settings-toggle is-hidden");
});
```

- [ ] **Step 4: Remove hover/focus CSS settings reveal**

In `src/app/app.css`, replace:

```css
.app-shell:hover .settings-toggle.is-hidden,
.app-shell:focus-within .settings-toggle.is-hidden,
.settings-toggle.is-visible {
  opacity: 1;
  pointer-events: auto;
}
```

with:

```css
.settings-toggle.is-visible {
  opacity: 1;
  pointer-events: auto;
}
```

- [ ] **Step 5: Adjust radial menu anchor**

In `App.tsx`, replace:

```tsx
const interactionMenuWidth = 164;
const interactionMenuHeight = 112;
```

with:

```tsx
const interactionMenuWidth = 232;
const interactionMenuHeight = 210;
```

Update `getInteractionMenuPosition()` to anchor near the visual center of the pet instead of the old grid's top-left. Use this shape:

```tsx
function getInteractionMenuPosition() {
  return {
    x: clampMenuAxis(
      window.innerWidth / 2,
      window.innerWidth,
      interactionMenuWidth,
    ),
    y: clampMenuAxis(
      window.innerHeight / 2 + 28,
      window.innerHeight,
      interactionMenuHeight,
    ),
  };
}
```

If manual desktop testing shows the bottom button is clipped at default scale, reduce `+ 28` to `+ 16`, but keep the menu centered around the pet.

- [ ] **Step 6: Run focused App tests**

Run:

```powershell
pnpm test -- src/app/App.test.tsx
```

Expected: all `App` tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/app/App.tsx src/app/App.test.tsx src/app/app.css
git commit -m "fix: route settings through context menu"
```

---

### Task 5: Final Verification And Debug Build

**Files:**
- Create or modify: `.superpowers/sdd/2026-08-05-pet-interaction-radial-menu/dev-round-1-report.md`

**Interfaces:**
- Consumes all tasks above.
- Produces final debug executable:
  - `src-tauri/target/debug/couple-desktop-pet.exe`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
pnpm test -- src/renderer/FramePetStage.test.tsx src/interaction/InteractionMenu.test.tsx src/app/App.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full frontend tests**

Run:

```powershell
pnpm test
```

Expected: all frontend tests pass.

- [ ] **Step 3: Run TypeScript typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: command exits 0.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
pnpm build
```

Expected: command exits 0.

- [ ] **Step 5: Run Rust tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass.

- [ ] **Step 6: Build debug Tauri executable**

If the debug exe is currently running, stop only that process path before rebuilding:

```powershell
Get-Process couple-desktop-pet -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -like '*\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe'
} | Stop-Process
```

Then run:

```powershell
pnpm tauri build --debug
```

Expected: build succeeds and refreshes:

```text
C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe
```

- [ ] **Step 7: Write implementation report**

Write `.superpowers/sdd/2026-08-05-pet-interaction-radial-menu/dev-round-1-report.md` with:

```markdown
# Dev Round 1 Report

## Summary

- ...

## Commits

- ...

## Tests

- `pnpm test -- src/renderer/FramePetStage.test.tsx src/interaction/InteractionMenu.test.tsx src/app/App.test.tsx`: ...
- `pnpm test`: ...
- `pnpm typecheck`: ...
- `pnpm build`: ...
- `cargo test --manifest-path src-tauri/Cargo.toml`: ...
- `pnpm tauri build --debug`: ...

## Manual Checks

- Hovering the pet window does not show the settings button.
- Right-click menu opens settings.
- One left-click opens the radial interaction menu.
- Dragging moves the pet and does not open the interaction menu.

## Risks

- ...
```

- [ ] **Step 8: Commit report if it is not git-ignored**

Run:

```powershell
git status --short .superpowers
```

If the report is trackable, commit it:

```powershell
git add .superpowers/sdd/2026-08-05-pet-interaction-radial-menu/dev-round-1-report.md
git commit -m "docs: report radial menu implementation"
```

If `.superpowers` is git-ignored, leave the report uncommitted.

---

## Self-Review

**Spec coverage:** The plan covers hover settings removal, right-click settings access, one-click interaction opening, delayed drag threshold, drag click suppression, radial Q menu layout, generated button assets, CSS animation, accessibility roles, and verification.

**Placeholder scan:** No task uses TBD/TODO/fill-later placeholders. All code-facing steps include exact snippets, paths, commands, or expected outcomes.

**Type consistency:** `InteractionActionName`, `PetInteractionOption`, `FramePetStageProps`, and the CSS custom properties are named consistently across tasks.

**Execution mode:** The repository's `AGENTS.md` requires the fixed background development task for coding. Task 1 assets can be generated by the controller using built-in image generation. Tasks 2 through 5 should be handed to fixed task `019fc0d5-21c1-7a52-b8c5-897829450edb` with model `gpt-5.5` and `xhigh` reasoning.
