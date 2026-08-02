from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


DEFAULT_ACTIONS = (
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
)


Color = tuple[int, int, int]
BBox = tuple[int, int, int, int]


@dataclass(frozen=True)
class ForegroundComponent:
    pixels: tuple[int, ...]
    bbox: BBox

    @property
    def center(self) -> tuple[float, float]:
        left, top, right, bottom = self.bbox
        return ((left + right) / 2, (top + bottom) / 2)


def split_bounds(total: int, parts: int) -> list[tuple[int, int]]:
    return [
        (round(total * index / parts), round(total * (index + 1) / parts))
        for index in range(parts)
    ]


def is_chroma_key_background_pixel(
    pixel: tuple[int, int, int, int],
    min_green: int = 120,
    green_dominance: int = 24,
) -> bool:
    red, green, blue, alpha = pixel
    if alpha == 0:
        return True

    return (
        green >= min_green
        and green - red >= green_dominance
        and green - blue >= green_dominance
    )


def is_foreground_pixel(
    pixel: tuple[int, int, int, int],
    key_color: Color = (0, 255, 0),
    tolerance: int = 24,
) -> bool:
    if pixel[3] == 0:
        return False

    min_green = max(80, key_color[1] - 135)
    return not is_chroma_key_background_pixel(
        pixel,
        min_green=min_green,
        green_dominance=tolerance,
    )


def create_foreground_mask(
    image: Image.Image,
    key_color: Color = (0, 255, 0),
    tolerance: int = 24,
) -> list[bytearray]:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    mask: list[bytearray] = []

    for y in range(height):
        row = bytearray(width)
        for x in range(width):
            if is_foreground_pixel(pixels[x, y], key_color, tolerance):
                row[x] = 1
        mask.append(row)

    return mask


def find_foreground_components(
    image: Image.Image,
    key_color: Color = (0, 255, 0),
    tolerance: int = 24,
    min_component_pixels: int = 32,
) -> list[ForegroundComponent]:
    width, height = image.size
    mask = create_foreground_mask(image, key_color, tolerance)
    components: list[ForegroundComponent] = []

    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y][start_x]:
                continue

            stack = [start_y * width + start_x]
            mask[start_y][start_x] = 0
            pixels: list[int] = []
            left = right = start_x
            top = bottom = start_y

            while stack:
                offset = stack.pop()
                y, x = divmod(offset, width)
                pixels.append(offset)
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)

                for next_y in range(max(0, y - 1), min(height, y + 2)):
                    next_row = mask[next_y]
                    for next_x in range(max(0, x - 1), min(width, x + 2)):
                        if next_row[next_x]:
                            next_row[next_x] = 0
                            stack.append(next_y * width + next_x)

            if len(pixels) >= min_component_pixels:
                components.append(
                    ForegroundComponent(
                        pixels=tuple(pixels),
                        bbox=(left, top, right + 1, bottom + 1),
                    ),
                )

    return components


def axis_index_for_coordinate(
    coordinate: float,
    bounds: list[tuple[int, int]],
) -> int:
    for index, (_, end) in enumerate(bounds):
        if coordinate < end or index == len(bounds) - 1:
            return index

    return len(bounds) - 1


def group_components_by_theoretical_cell(
    image: Image.Image,
    columns: int,
    rows: int,
    key_color: Color = (0, 255, 0),
    tolerance: int = 24,
    min_component_pixels: int = 32,
) -> list[list[ForegroundComponent]]:
    x_bounds = split_bounds(image.width, columns)
    y_bounds = split_bounds(image.height, rows)
    groups: list[list[ForegroundComponent]] = [[] for _ in range(columns * rows)]

    for component in find_foreground_components(
        image,
        key_color=key_color,
        tolerance=tolerance,
        min_component_pixels=min_component_pixels,
    ):
        center_x, center_y = component.center
        column = axis_index_for_coordinate(center_x, x_bounds)
        row = axis_index_for_coordinate(center_y, y_bounds)
        groups[row * columns + column].append(component)

    return groups


def merge_component_bbox(components: list[ForegroundComponent]) -> BBox:
    if not components:
        raise ValueError("Cannot merge an empty component list")

    return (
        min(component.bbox[0] for component in components),
        min(component.bbox[1] for component in components),
        max(component.bbox[2] for component in components),
        max(component.bbox[3] for component in components),
    )


def assert_all_cells_have_components(
    action: str,
    component_groups: list[list[ForegroundComponent]],
) -> None:
    missing_frames = [
        f"{action}-{index + 1:02d}"
        for index, components in enumerate(component_groups)
        if not components
    ]
    if missing_frames:
        raise ValueError(
            f"{action} has no detected foreground components for frames: "
            + ", ".join(missing_frames),
        )


def expand_bbox(bbox: BBox, padding: int, width: int, height: int) -> BBox:
    left, top, right, bottom = bbox
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(width, right + padding),
        min(height, bottom + padding),
    )


def render_component_crop(
    source: Image.Image,
    components: list[ForegroundComponent],
    bbox: BBox,
    key_color: Color = (0, 255, 0),
) -> Image.Image:
    left, top, right, bottom = bbox
    crop = Image.new(
        "RGBA",
        (right - left, bottom - top),
        (key_color[0], key_color[1], key_color[2], 255),
    )
    source_pixels = source.load()
    crop_pixels = crop.load()

    for component in components:
        for offset in component.pixels:
            y, x = divmod(offset, source.width)
            if left <= x < right and top <= y < bottom:
                crop_pixels[x - left, y - top] = source_pixels[x, y]

    return crop


def normalize_square(input_path: Path, output_path: Path, output_size: int) -> None:
    with Image.open(input_path).convert("RGBA") as image:
        side = max(image.width, image.height)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(
            image,
            ((side - image.width) // 2, (side - image.height) // 2),
            image,
        )
        resized = square.resize((output_size, output_size), Image.Resampling.LANCZOS)
        resized.save(output_path)


def alpha_row_bands(
    alpha: Image.Image,
    alpha_threshold: int = 18,
    min_row_pixels: int | None = None,
) -> list[tuple[int, int]]:
    width, height = alpha.size
    pixels = alpha.load()
    row_threshold = min_row_pixels if min_row_pixels is not None else max(8, width // 64)
    active_rows: list[int] = []

    for y in range(height):
        active_pixels = 0
        for x in range(width):
            if pixels[x, y] > alpha_threshold:
                active_pixels += 1
        if active_pixels >= row_threshold:
            active_rows.append(y)

    if not active_rows:
        return []

    bands: list[tuple[int, int]] = []
    start = previous = active_rows[0]
    for y in active_rows[1:]:
        if y > previous + 1:
            bands.append((start, previous))
            start = y
        previous = y
    bands.append((start, previous))

    return bands


def has_top_fragment_vertical_split(alpha: Image.Image) -> bool:
    _, height = alpha.size
    bands = alpha_row_bands(alpha)
    if len(bands) < 2:
        return False

    top_band = bands[0]
    top_starts_at_edge = top_band[0] <= max(4, height // 128)
    top_band_height = top_band[1] - top_band[0] + 1
    if not top_starts_at_edge or top_band_height > height * 0.18:
        return False

    for lower_band in bands[1:]:
        gap = lower_band[0] - top_band[1] - 1
        lower_band_height = lower_band[1] - lower_band[0] + 1
        if gap >= max(44, height // 10) and lower_band_height >= height * 0.35:
            return True

    return False


def validate_frame(path: Path, output_size: int) -> None:
    with Image.open(path) as opened:
        if "A" not in opened.getbands():
            raise ValueError(f"{path} does not have an alpha channel")

        image = opened.convert("RGBA")
        if image.size != (output_size, output_size):
            raise ValueError(f"{path} has size {image.size}, expected {output_size}x{output_size}")

        corner_alpha = [
            image.getpixel((0, 0))[3],
            image.getpixel((image.width - 1, 0))[3],
            image.getpixel((0, image.height - 1))[3],
            image.getpixel((image.width - 1, image.height - 1))[3],
        ]
        if any(alpha != 0 for alpha in corner_alpha):
            raise ValueError(f"{path} has non-transparent corners: {corner_alpha}")

        alpha = image.getchannel("A")
        if alpha.getbbox() is None:
            raise ValueError(f"{path} is fully transparent")
        if has_top_fragment_vertical_split(alpha):
            raise ValueError(f"{path} has vertical split foreground bands")

    if path.stat().st_size < 1024:
        raise ValueError(f"{path} is suspiciously small")


def run_chroma_key(chroma_script: Path, input_path: Path, output_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            str(chroma_script),
            "--input",
            str(input_path),
            "--out",
            str(output_path),
            "--key-color",
            "#00ff00",
            "--soft-matte",
            "--transparent-threshold",
            "12",
            "--opaque-threshold",
            "220",
            "--despill",
            "--force",
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def split_action_sheet(
    action: str,
    input_dir: Path,
    output_dir: Path,
    temp_dir: Path,
    chroma_script: Path,
    columns: int,
    rows: int,
    output_size: int,
    padding: int,
    min_component_pixels: int,
) -> int:
    sheet_path = input_dir / f"{action}-sheet.png"
    if not sheet_path.exists():
        raise FileNotFoundError(f"Missing sheet: {sheet_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    frame_count = columns * rows
    with Image.open(sheet_path).convert("RGBA") as sheet:
        component_groups = group_components_by_theoretical_cell(
            sheet,
            columns=columns,
            rows=rows,
            min_component_pixels=min_component_pixels,
        )
        assert_all_cells_have_components(action, component_groups)

        for row in range(rows):
            for column in range(columns):
                index = row * columns + column + 1
                stem = f"{action}-{index:02d}"
                cropped_path = temp_dir / f"{stem}-source.png"
                keyed_path = temp_dir / f"{stem}-keyed.png"
                final_path = output_dir / f"{stem}.png"
                components = component_groups[index - 1]

                bbox = expand_bbox(
                    merge_component_bbox(components),
                    padding=padding,
                    width=sheet.width,
                    height=sheet.height,
                )
                render_component_crop(sheet, components, bbox).save(cropped_path)
                run_chroma_key(chroma_script, cropped_path, keyed_path)
                normalize_square(keyed_path, final_path, output_size)
                validate_frame(final_path, output_size)

    return frame_count


def preflight_action_sheet(
    action: str,
    input_dir: Path,
    columns: int,
    rows: int,
    min_component_pixels: int,
) -> None:
    sheet_path = input_dir / f"{action}-sheet.png"
    if not sheet_path.exists():
        raise FileNotFoundError(f"Missing sheet: {sheet_path}")

    with Image.open(sheet_path).convert("RGBA") as sheet:
        component_groups = group_components_by_theoretical_cell(
            sheet,
            columns=columns,
            rows=rows,
            min_component_pixels=min_component_pixels,
        )
        assert_all_cells_have_components(action, component_groups)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split 3x6 chroma-key sprite sheets into transparent PNG frames.",
    )
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--chroma-script",
        default=Path.home()
        / ".codex"
        / "skills"
        / ".system"
        / "imagegen"
        / "scripts"
        / "remove_chroma_key.py",
        type=Path,
    )
    parser.add_argument("--temp-dir", default=Path("tmp/asset-processing/star-sleeper-long"), type=Path)
    parser.add_argument("--columns", default=3, type=int)
    parser.add_argument("--rows", default=6, type=int)
    parser.add_argument("--output-size", default=512, type=int)
    parser.add_argument("--padding", default=28, type=int)
    parser.add_argument("--component-min-pixels", default=32, type=int)
    parser.add_argument("--actions", nargs="*", default=list(DEFAULT_ACTIONS))
    parser.add_argument("--keep-temp", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.chroma_script.exists():
        raise FileNotFoundError(f"Missing chroma-key script: {args.chroma_script}")

    for action in args.actions:
        preflight_action_sheet(
            action=action,
            input_dir=args.input_dir,
            columns=args.columns,
            rows=args.rows,
            min_component_pixels=args.component_min_pixels,
        )

    total = 0
    for action in args.actions:
        action_temp_dir = args.temp_dir / action
        if action_temp_dir.exists():
            shutil.rmtree(action_temp_dir)

        total += split_action_sheet(
            action=action,
            input_dir=args.input_dir,
            output_dir=args.output_dir,
            temp_dir=action_temp_dir,
            chroma_script=args.chroma_script,
            columns=args.columns,
            rows=args.rows,
            output_size=args.output_size,
            padding=args.padding,
            min_component_pixels=args.component_min_pixels,
        )
        print(f"{action}: {args.columns}x{args.rows} -> {args.columns * args.rows} frames")

    if not args.keep_temp and args.temp_dir.exists():
        shutil.rmtree(args.temp_dir)

    print(f"validated {total} transparent {args.output_size}x{args.output_size} PNG frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
