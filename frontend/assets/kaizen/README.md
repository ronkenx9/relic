# Kaizenverse Asset Pack

This folder holds game-ready art sources for RELIC x KAIZENVERSE.

The current shipped game is a Three.js voxel runner with procedural fighters. The files here
start the parallel 2D asset system requested for the full Kaizenverse web game, beginning with
Batch 1: Base Kaizen / The Wanderer.

## Batch 1

Source files:

- `base/base-kaizen-spritesheet.png` - alpha PNG, 8 poses in a 4x2 layout.
- `base/base-kaizen-spritesheet-key.png` - raw chroma-key source used to produce the alpha.
- `base/base-kaizen-spritesheet-preview.png` - first visual style-lock preview with checkerboard baked in.
- `base/frames/*.png` - normalized 512x512 alpha frame exports.
- `base/portrait.png` - 768x768 UI portrait derived from the idle pose.
- `base/small_icon.png` - 256x256 UI icon derived from the idle pose.

Runtime usage:

- `base/base-kaizen-spritesheet.png` is used for the Wanderer playable fighter.
- `base/small_icon.png` is shown on the forge gate.
- `base/portrait.png` is shown on the run-complete card for Wanderer runs.

Frame order:

```text
idle      run_01    run_02    jump
fall      hit       ability   victory
```

Exported files:

```text
base/frames/idle.png
base/frames/run_01.png
base/frames/run_02.png
base/frames/jump.png
base/frames/fall.png
base/frames/hit.png
base/frames/ability.png
base/frames/victory.png
base/portrait.png
base/small_icon.png
```

The manifest in `asset-manifest.json` records the intended frame rectangles and future batch
plan. If the sheet is revised, update the manifest and rerun:

```bash
python3 scripts/export-kaizen-batch1.py
```
