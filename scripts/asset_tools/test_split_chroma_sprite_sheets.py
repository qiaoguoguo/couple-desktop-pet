from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.asset_tools.split_chroma_sprite_sheets import (
    assert_all_cells_have_components,
    find_foreground_components,
    group_components_by_theoretical_cell,
    has_top_fragment_vertical_split,
    merge_component_bbox,
    validate_frame,
)


KEY = (0, 255, 0, 255)


def draw_rect(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    pixels = image.load()
    left, top, right, bottom = box
    for y in range(top, bottom):
        for x in range(left, right):
            pixels[x, y] = (
                80 + (x % 80),
                40 + (y % 80),
                20 + ((x + y) % 80),
                255,
            )


class SpriteSheetComponentTests(unittest.TestCase):
    def test_assigns_cross_boundary_component_by_center_cell(self) -> None:
        sheet = Image.new("RGBA", (300, 600), KEY)
        draw_rect(sheet, (20, 70, 80, 180))

        groups = group_components_by_theoretical_cell(
            sheet,
            columns=3,
            rows=6,
            min_component_pixels=1,
        )

        self.assertEqual(groups[0], [])
        self.assertEqual(len(groups[3]), 1)
        self.assertLessEqual(merge_component_bbox(groups[3])[1], 70)
        self.assertGreaterEqual(merge_component_bbox(groups[3])[3], 180)

    def test_merges_multiple_components_in_the_same_cell(self) -> None:
        sheet = Image.new("RGBA", (300, 600), KEY)
        draw_rect(sheet, (20, 20, 50, 70))
        draw_rect(sheet, (65, 55, 82, 82))
        draw_rect(sheet, (120, 20, 150, 70))

        groups = group_components_by_theoretical_cell(
            sheet,
            columns=3,
            rows=6,
            min_component_pixels=1,
        )

        self.assertEqual(len(groups[0]), 2)
        self.assertEqual(len(groups[1]), 1)
        self.assertEqual(merge_component_bbox(groups[0]), (20, 20, 82, 82))

    def test_reports_missing_cell_components_by_action_and_frame(self) -> None:
        groups = [["component"], [], []]

        with self.assertRaisesRegex(ValueError, "idle-look-02, idle-look-03"):
            assert_all_cells_have_components("idle-look", groups)

    def test_ignores_noisy_green_background_while_detecting_warm_subject(self) -> None:
        sheet = Image.new("RGBA", (300, 600), KEY)
        pixels = sheet.load()
        for y in range(sheet.height):
            for x in range(sheet.width):
                pixels[x, y] = (
                    (x + y) % 18,
                    224 + ((x * 3 + y * 5) % 28),
                    (x * 2 + y) % 20,
                    255,
                )
        draw_rect(sheet, (22, 24, 78, 88))

        components = find_foreground_components(
            sheet,
            min_component_pixels=1,
        )
        groups = group_components_by_theoretical_cell(
            sheet,
            columns=3,
            rows=6,
            min_component_pixels=1,
        )

        self.assertEqual(len(components), 1)
        self.assertEqual(components[0].bbox, (22, 24, 78, 88))
        self.assertEqual(len(groups[0]), 1)
        self.assertTrue(all(not group for group in groups[1:]))


class FrameValidationTests(unittest.TestCase):
    def test_detects_top_fragment_vertical_split(self) -> None:
        frame = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        draw_rect(frame, (170, 0, 345, 28))
        draw_rect(frame, (95, 150, 420, 485))

        self.assertTrue(has_top_fragment_vertical_split(frame.getchannel("A")))

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "split-frame.png"
            frame.save(path)

            with self.assertRaisesRegex(ValueError, "vertical split"):
                validate_frame(path, 512)


if __name__ == "__main__":
    unittest.main()
