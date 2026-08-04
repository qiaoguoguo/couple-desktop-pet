from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "docs" / "assets" / "references" / "q-girl-pet-reference.png"
OUTPUT = ROOT / "src" / "assets" / "pets" / "q-girl"

ACTIONS = [
    "idle-breathe",
    "idle-look",
    "idle-stretch",
    "walk",
    "drag",
    "sleep",
    "act-cute",
    "act-typing",
    "act-wave",
    "act-hug",
    "act-pout",
    "act-drowsy",
]

FRAME_SIZE = (768, 960)
FRAME_COUNT = 30


def main() -> None:
    base = prepare_base_character(REFERENCE)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    for action in ACTIONS:
        action_dir = OUTPUT / "frames" / action
        action_dir.mkdir(parents=True, exist_ok=True)

        for index in range(1, FRAME_COUNT + 1):
            frame = render_frame(base, action, index)
            frame.save(action_dir / f"{index:04}.png")

    (OUTPUT / "preview.png").write_bytes(
        (OUTPUT / "frames" / "idle-breathe" / "0001.png").read_bytes(),
    )


def prepare_base_character(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()

    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0 or (g >= 120 and g - r >= 45 and g - b >= 45):
                pixels[x, y] = (r, g, b, 0)

    alpha = image.getchannel("A").filter(ImageFilter.MedianFilter(3))
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError(f"reference image has no foreground: {path}")

    character = image.crop(bbox)
    character.thumbnail((560, 840), Image.Resampling.LANCZOS)
    return character


def render_frame(base: Image.Image, action: str, index: int) -> Image.Image:
    progress = (index - 1) / (FRAME_COUNT - 1)
    wave = math.sin(progress * math.tau)
    half_wave = math.sin(progress * math.pi)
    angle = 0.0
    x = 0
    y = 0
    scale_x = 1.0
    scale_y = 1.0

    if action == "idle-breathe":
        scale_y = 1.0 + wave * 0.012
        y = round(-wave * 4)
    elif action == "idle-look":
        angle = -4 + 8 * half_wave
        x = round(-18 + 36 * half_wave)
    elif action == "idle-stretch":
        scale_y = 1.0 + half_wave * 0.06
        scale_x = 1.0 - half_wave * 0.025
        y = round(-24 * half_wave)
    elif action == "walk":
        x = round(math.sin(progress * math.tau * 2) * 20)
        y = round(-abs(math.sin(progress * math.tau * 2)) * 12)
        angle = math.sin(progress * math.tau * 2) * 3
    elif action == "drag":
        y = -54 + round(math.sin(progress * math.tau * 2) * 12)
        angle = math.sin(progress * math.tau * 2) * 8
    elif action == "sleep":
        y = round(18 + half_wave * 16)
        angle = -2 + half_wave * 5
        scale_y = 0.98 - half_wave * 0.03
    elif action == "act-cute":
        scale_x = 1.0 + half_wave * 0.035
        scale_y = 1.0 + half_wave * 0.035
        angle = -5 * half_wave
        y = round(-10 * half_wave)
    elif action == "act-typing":
        y = round(5 * math.sin(progress * math.tau * 4))
    elif action == "act-wave":
        angle = math.sin(progress * math.tau * 3) * 5
        x = round(8 * half_wave)
    elif action == "act-hug":
        scale_x = 1.0 + half_wave * 0.06
        scale_y = 1.0 + half_wave * 0.025
        y = round(-20 * half_wave)
    elif action == "act-pout":
        angle = -3
        x = round(math.sin(progress * math.tau * 4) * 6)
    elif action == "act-drowsy":
        y = round(10 + half_wave * 22)
        angle = 2 + half_wave * 6

    transformed = transform(base, scale_x, scale_y, angle)
    frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    paste_centered(frame, transformed, x, y)
    draw_action_hint(frame, action, progress)
    return frame


def transform(image: Image.Image, scale_x: float, scale_y: float, angle: float) -> Image.Image:
    width = max(1, round(image.width * scale_x))
    height = max(1, round(image.height * scale_y))
    scaled = image.resize((width, height), Image.Resampling.LANCZOS)
    return scaled.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)


def paste_centered(frame: Image.Image, character: Image.Image, offset_x: int, offset_y: int) -> None:
    x = (frame.width - character.width) // 2 + offset_x
    y = frame.height - character.height - 42 + offset_y
    frame.alpha_composite(character, (x, y))


def draw_action_hint(frame: Image.Image, action: str, progress: float) -> None:
    draw = ImageDraw.Draw(frame, "RGBA")
    if action == "act-typing":
        draw.rounded_rectangle((254, 675, 514, 760), radius=22, fill=(99, 84, 104, 210))
        draw.rounded_rectangle((276, 690, 492, 730), radius=12, fill=(238, 232, 246, 235))
        for i in range(8):
            x = 292 + i * 22
            draw.line((x, 746, x + 12, 746), fill=(255, 255, 255, 190), width=3)
    elif action == "act-wave":
        alpha = round(90 + 80 * abs(math.sin(progress * math.tau * 3)))
        draw.arc((560, 220, 700, 360), 300, 45, fill=(153, 94, 65, alpha), width=8)
        draw.arc((590, 260, 720, 390), 300, 45, fill=(153, 94, 65, alpha), width=6)
    elif action == "act-cute":
        alpha = round(120 + 60 * math.sin(progress * math.pi))
        draw.ellipse((208, 350, 246, 388), fill=(255, 137, 154, alpha))
        draw.ellipse((522, 350, 560, 388), fill=(255, 137, 154, alpha))
    elif action == "sleep" or action == "act-drowsy":
        alpha = round(90 + 80 * math.sin(progress * math.pi))
        draw.arc((540, 180, 620, 240), 15, 320, fill=(88, 75, 105, alpha), width=7)
        draw.arc((600, 130, 700, 220), 15, 320, fill=(88, 75, 105, alpha), width=7)
    elif action == "act-pout":
        draw.ellipse((525, 360, 563, 398), fill=(255, 150, 135, 155))
        draw.ellipse((205, 360, 243, 398), fill=(255, 150, 135, 155))


if __name__ == "__main__":
    main()
