# Star Sleeper Image Gen Prompts

Reference image:

User-provided reference image from the conversation; not committed to the repository.

Final asset directory:

`src/assets/pets/star-sleeper/`

Generation order:

1. Generate `idle-01.png` with Image 1 as the only reference.
2. If `idle-01.png` is visually acceptable, use both references for every later frame:
   - Image 1: original user reference image, style and character direction.
   - Image 2: approved `idle-01.png`, consistency reference.
3. Generate one image per file, not a sprite sheet.
4. Use a flat `#00ff00` chroma-key background. After generation, remove the chroma key locally and save a transparent PNG.

Recommended output size before chroma removal: square, at least `1024x1024`. Final installed assets are 512x512 transparent PNGs.

## Shared Prompt

Use this shared prompt for every frame, replacing only the file name and `Action frame`.

```text
Use case: illustration-story
Asset type: desktop pet 2D animation frame
Output file name: <FILE_NAME>

Primary request:
Generate one transparent-ready animation frame for a cute "star sleeper little person" desktop pet based on the provided reference image.

Input images:
Image 1 is a style and character reference only. Do not copy exact pixels.
If Image 2 is provided, Image 2 is the approved identity and proportion reference for consistency across frames.

Subject:
A single full-body desktop pet character, front-facing with a slight cute tilt. Yellow star-shaped pajama hood and body, orange round face, large oval dark eyes with tiny star highlights, red round cheeks, gentle small smile, tiny star ornament on the hat tip.

Style/medium:
Hand-drawn crayon children's illustration, soft uneven pencil outline, warm wax-crayon texture, slightly imperfect strokes, cute and lightweight.

Composition/framing:
Full body centered, generous padding, character readable at 128px desktop size. Keep the same camera angle, same proportions, same colors, and same approximate character size across all frames.

Scene/backdrop:
Perfectly flat solid #00ff00 chroma-key background for background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.

Action frame:
<ACTION>

Text:
No text.

Constraints:
No watermark. No unrelated props. No extra characters. No readable text on clothing. No floor plane. No cast shadow. No contact shadow. Keep the whole character inside frame. Preserve consistent identity across all frames. Do not use #00ff00 anywhere in the subject.

Avoid:
Photorealism, vector-clean flat icon style, hard shadows, gradients in background, white background, transparent-looking checkerboard, extra stars floating everywhere, copied pixels from the reference.
```

## Frame Prompts

### idle-01.png

```text
Output file name: idle-01.png
Action frame:
Neutral standing pose, slight smile, relaxed star pajama body.
```

### idle-02.png

```text
Output file name: idle-02.png
Action frame:
Very slight breathing squash downward, hat tip bends left, face still calm.
```

### idle-03.png

```text
Output file name: idle-03.png
Action frame:
Body rises slightly from breathing, cheeks lift a little, eyes bright.
```

### idle-04.png

```text
Output file name: idle-04.png
Action frame:
Returning toward neutral pose, hat tip bends right gently.
```

### walk-01.png

```text
Output file name: walk-01.png
Action frame:
Left lean, soft step starting, lower body/base shifts left-forward.
```

### walk-02.png

```text
Output file name: walk-02.png
Action frame:
Center low step, face looking forward, body slightly squashed.
```

### walk-03.png

```text
Output file name: walk-03.png
Action frame:
Right lean, soft step to the other side, lower body/base shifts right-forward.
```

### walk-04.png

```text
Output file name: walk-04.png
Action frame:
Center high step, tiny bounce upward, hat trailing behind.
```

### walk-05.png

```text
Output file name: walk-05.png
Action frame:
Left lean with small playful bounce, cheeks lifted.
```

### walk-06.png

```text
Output file name: walk-06.png
Action frame:
Right lean with small playful bounce, returns smoothly toward loop.
```

### drag-01.png

```text
Output file name: drag-01.png
Action frame:
Body tilted left as if being picked up by the top of the hat, slightly dangling.
```

### drag-02.png

```text
Output file name: drag-02.png
Action frame:
Body tilted right as if dangling, hat stretched gently upward.
```

### happy-01.png

```text
Output file name: happy-01.png
Action frame:
Smile widens, eyes bright, cheeks slightly larger.
```

### happy-02.png

```text
Output file name: happy-02.png
Action frame:
Cheeks larger and redder, joyful expression, one tiny sparkle near face.
```

### happy-03.png

```text
Output file name: happy-03.png
Action frame:
Body bounces upward, hat star lively, very cheerful.
```

### happy-04.png

```text
Output file name: happy-04.png
Action frame:
Returning to normal happy smile, still cheerful and stable.
```

### sleep-01.png

```text
Output file name: sleep-01.png
Action frame:
Eyes closed, relaxed sleeping expression, body calm.
```

### sleep-02.png

```text
Output file name: sleep-02.png
Action frame:
Eyes closed, slight breathing squash downward, peaceful.
```

### sleep-03.png

```text
Output file name: sleep-03.png
Action frame:
Sleepy expression, hat droops softly, body relaxed.
```

### sleep-04.png

```text
Output file name: sleep-04.png
Action frame:
Calm sleeping pose with a tiny subtle star accent, ready to loop.
```

## Chroma-Key Removal

After each generated frame is saved locally, remove the green background:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" `
  --input "generated.png" `
  --out "final.png" `
  --auto-key border `
  --soft-matte `
  --transparent-threshold 12 `
  --opaque-threshold 220 `
  --despill
```

Validation checklist for every final PNG:

- Transparent corners.
- Alpha channel exists.
- No visible green fringe.
- Full body remains inside the canvas.
- Still readable at 128px height.
- No clothing text or watermark.

## Final Installed Assets

Final files are installed in:

`src/assets/pets/star-sleeper/`

Local validation result on 2026-08-02:

- Manifest references 20 unique `pets/star-sleeper/*.png` files.
- All 20 referenced PNG files exist.
- All 20 PNG files are 512x512 `RGBA` images with transparent corners.
- No opaque green-like chroma-key pixels were detected by the local Pillow validation script.
