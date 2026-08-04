from __future__ import annotations

import argparse
import math
import tempfile
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
                pixels[x, y] = (r, min(g, replacement), b, a)

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
        with Image.open(sheet_path) as sheet:
            sheet_cells.append(crop_sheet_cells(sheet.convert("RGBA")))

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
        key_index = min(
            len(keyframes) - 1,
            round(index * (len(keyframes) - 1) / (FRAME_COUNT - 1)),
        )
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
            with Image.open(path) as image:
                rgba = image.convert("RGBA")

            if rgba.size != FRAME_SIZE:
                failures.append(f"{path}: expected {FRAME_SIZE}, got {rgba.size}")

            metrics = measure_green_edges(rgba)
            if metrics.edge_pixels > 0 and metrics.green_ratio > 0.08:
                failures.append(f"{path}: green edge ratio {metrics.green_ratio:.3f}")

    if failures:
        raise SystemExit("\n".join(failures[:20]))


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
            with Image.open(frame_path) as image:
                thumb = image.convert("RGBA").resize(thumb_size, Image.Resampling.LANCZOS)

            sheet.alpha_composite(thumb, (col * thumb_size[0], row_y + label_height))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path)


def run_self_test() -> None:
    test_image = Image.new("RGBA", (120, 120), (0, 255, 0, 255))
    cleaned = contract_alpha(despill_green(remove_chroma_key(test_image)))
    assert cleaned.getchannel("A").getbbox() is None

    with tempfile.TemporaryDirectory() as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        sheet_width = CELL_COLUMNS * 12
        sheet_height = CELL_ROWS * 12
        sheet_colors = [
            [
                (220, 20, 40, 255),
                (220, 90, 40, 255),
                (220, 160, 40, 255),
                (90, 40, 220, 255),
                (160, 40, 220, 255),
                (220, 40, 160, 255),
            ],
            [
                (40, 80, 220, 255),
                (40, 140, 220, 255),
                (40, 200, 220, 255),
                (220, 40, 90, 255),
                (220, 40, 140, 255),
                (220, 40, 200, 255),
            ],
        ]

        for sheet_index, colors in enumerate(sheet_colors, start=1):
            sheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 255, 0, 255))
            draw = ImageDraw.Draw(sheet)
            for cell_index, color in enumerate(colors):
                col = cell_index % CELL_COLUMNS
                row = cell_index // CELL_COLUMNS
                draw.rectangle(
                    (col * 12 + 2, row * 12 + 2, col * 12 + 9, row * 12 + 9),
                    fill=color,
                )
            sheet.save(temp_dir / f"act-cute-sheet-{sheet_index:02}.png")

        keyframes = load_action_keyframes("act-cute", temp_dir)
        observed = [frame.getpixel((frame.width // 2, frame.height // 2)) for frame in keyframes[:4]]
        expected = [
            sheet_colors[0][0],
            sheet_colors[1][0],
            sheet_colors[0][1],
            sheet_colors[1][1],
        ]
        for actual, target in zip(observed, expected, strict=True):
            assert actual[3] >= 240, observed
            assert all(abs(actual[channel] - target[channel]) <= 3 for channel in range(3)), observed


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

    subparsers.add_parser("self-test")

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
        run_self_test()


if __name__ == "__main__":
    main()
