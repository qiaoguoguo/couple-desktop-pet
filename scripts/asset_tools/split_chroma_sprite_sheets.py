from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
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


def split_bounds(total: int, parts: int) -> list[tuple[int, int]]:
    return [
        (round(total * index / parts), round(total * (index + 1) / parts))
        for index in range(parts)
    ]


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


def validate_frame(path: Path, output_size: int) -> None:
    with Image.open(path).convert("RGBA") as image:
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
) -> int:
    sheet_path = input_dir / f"{action}-sheet.png"
    if not sheet_path.exists():
        raise FileNotFoundError(f"Missing sheet: {sheet_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    frame_count = columns * rows
    with Image.open(sheet_path).convert("RGBA") as sheet:
        x_bounds = split_bounds(sheet.width, columns)
        y_bounds = split_bounds(sheet.height, rows)

        for row, (top, bottom) in enumerate(y_bounds):
            for column, (left, right) in enumerate(x_bounds):
                index = row * columns + column + 1
                stem = f"{action}-{index:02d}"
                cropped_path = temp_dir / f"{stem}-source.png"
                keyed_path = temp_dir / f"{stem}-keyed.png"
                final_path = output_dir / f"{stem}.png"

                sheet.crop((left, top, right, bottom)).save(cropped_path)
                run_chroma_key(chroma_script, cropped_path, keyed_path)
                normalize_square(keyed_path, final_path, output_size)
                validate_frame(final_path, output_size)

    return frame_count


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
    parser.add_argument("--actions", nargs="*", default=list(DEFAULT_ACTIONS))
    parser.add_argument("--keep-temp", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.chroma_script.exists():
        raise FileNotFoundError(f"Missing chroma-key script: {args.chroma_script}")

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
        )
        print(f"{action}: {args.columns}x{args.rows} -> {args.columns * args.rows} frames")

    if not args.keep_temp and args.temp_dir.exists():
        shutil.rmtree(args.temp_dir)

    print(f"validated {total} transparent {args.output_size}x{args.output_size} PNG frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
