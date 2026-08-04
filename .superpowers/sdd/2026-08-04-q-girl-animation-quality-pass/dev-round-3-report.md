# Q-girl Animation Quality Pass Dev Round 3 Report

## Status

DONE

## Commit

- 本提交：`fix: avoid pillow deprecation warning`

## Changes

- `scripts/asset_tools/q_girl_keyframe_pipeline.py`
  - `measure_green_edges()` now uses `Image.get_flattened_data()` when available.
  - Falls back to `Image.getdata()` for older Pillow versions.

## Verification

- `python scripts/asset_tools/q_girl_keyframe_pipeline.py self-test`：通过。
- `python scripts/asset_tools/q_girl_keyframe_pipeline.py validate --frame-root src/assets/pets/q-girl/frames`：通过，无 Pillow 14 deprecation warning。
