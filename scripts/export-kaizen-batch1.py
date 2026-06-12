#!/usr/bin/env python3
"""Export Kaizenverse frame assets from manifest-defined sprite sheets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "frontend" / "assets" / "kaizen"
MANIFEST_PATH = PACK_DIR / "asset-manifest.json"
FRAME_SIZE = 512
PORTRAIT_SIZE = 768
ICON_SIZE = 256
FRAME_ORDER = ["idle", "run_01", "run_02", "jump", "fall", "hit", "ability", "victory"]

CHARACTER_SPECS = {
    "base_kaizen": {
        "dir": "base",
        "archetypeId": "wanderer",
        "displayName": "Base Kaizen / The Wanderer",
        "sourcePrompt": "Kaizenverse playable 2D side-scroller sprite sheet, Base Kaizen, pink varsity jacket with gray sleeves, black shirt, loose black cargo pants, crossbody bag, katana on back, red pendant tag, clean readable silhouette, painterly anime sprite style, strong ink outline, simplified game-ready details, transparent background, consistent proportions, side-facing poses.",
        "sheet": "base/base-kaizen-spritesheet.png",
        "key": "base/base-kaizen-spritesheet-key.png",
        "preview": "base/base-kaizen-spritesheet-preview.png",
    },
    "trickster": {
        "dir": "trickster",
        "archetypeId": "trickster",
        "displayName": "The Trickster",
        "sourcePrompt": "White-haired grinning Kaizenverse Trickster with goggles, violet street jacket, NFT/mint pouch details, painterly anime side-scroller sprite sheet.",
        "sheet": "trickster/trickster-spritesheet.png",
        "key": "trickster/trickster-spritesheet-key.png",
    },
    "duelist": {
        "dir": "duelist",
        "archetypeId": "duelist",
        "displayName": "The Duelist",
        "sourcePrompt": "Red-hood Kaizenverse Duelist, aggressive trader-fighter silhouette, black tactical streetwear, painterly anime side-scroller sprite sheet.",
        "sheet": "duelist/duelist-spritesheet.png",
        "key": "duelist/duelist-spritesheet-key.png",
    },
    "baron": {
        "dir": "baron",
        "archetypeId": "baron",
        "displayName": "The Baron",
        "sourcePrompt": "Gold-accented Kaizenverse Baron, whale/yield street boss with jewelry and ledger satchel, painterly anime side-scroller sprite sheet.",
        "sheet": "baron/baron-spritesheet.png",
        "key": "baron/baron-spritesheet-key.png",
    },
    "oracle": {
        "dir": "oracle",
        "archetypeId": "oracle",
        "displayName": "The Oracle",
        "sourcePrompt": "Blindfolded Kaizenverse Oracle with silver hair, deep blue coat, talisman/data charm, painterly anime side-scroller sprite sheet.",
        "sheet": "oracle/oracle-spritesheet.png",
        "key": "oracle/oracle-spritesheet-key.png",
    },
    "machine": {
        "dir": "machine",
        "archetypeId": "machine",
        "displayName": "The Machine",
        "sourcePrompt": "Red mecha-helmet Kaizenverse Machine with black tactical armor and sharp red glow accents, painterly anime side-scroller sprite sheet.",
        "sheet": "machine/machine-spritesheet.png",
        "key": "machine/machine-spritesheet-key.png",
    },
    "unwritten": {
        "dir": "unwritten",
        "archetypeId": "unwritten",
        "displayName": "The Unwritten",
        "sourcePrompt": "Faceless hooded Kaizenverse Unwritten silhouette, blank parchment tag, charcoal and bone-white glow accents, painterly anime side-scroller sprite sheet.",
        "sheet": "unwritten/unwritten-spritesheet.png",
        "key": "unwritten/unwritten-spritesheet-key.png",
    },
}


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Frame has no non-transparent pixels")
    return bbox


def fit_on_square(image: Image.Image, size: int, max_w: int, max_h: int, baseline: int) -> Image.Image:
    bbox = alpha_bbox(image)
    trimmed = image.crop(bbox)
    scale = min(max_w / trimmed.width, max_h / trimmed.height, 1.0)
    out_w = max(1, round(trimmed.width * scale))
    out_h = max(1, round(trimmed.height * scale))
    resized = trimmed.resize((out_w, out_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - out_w) // 2
    y = max(0, min(size - out_h, baseline - out_h))
    canvas.alpha_composite(resized, (x, y))
    return canvas


def center_on_square(image: Image.Image, size: int, max_w: int, max_h: int) -> Image.Image:
    bbox = alpha_bbox(image)
    trimmed = image.crop(bbox)
    scale = min(max_w / trimmed.width, max_h / trimmed.height)
    out_w = max(1, round(trimmed.width * scale))
    out_h = max(1, round(trimmed.height * scale))
    resized = trimmed.resize((out_w, out_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - out_w) // 2
    y = (size - out_h) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def remove_small_alpha_components(image: Image.Image, min_area: int) -> Image.Image:
    """Remove isolated alpha fragments below min_area. Used only for known sheet bleed."""
    out = image.copy()
    alpha = out.getchannel("A")
    pixels = alpha.load()
    width, height = alpha.size
    seen: set[tuple[int, int]] = set()

    for y in range(height):
        for x in range(width):
            if pixels[x, y] <= 8 or (x, y) in seen:
                continue
            queue = [(x, y)]
            seen.add((x, y))
            for cx, cy in queue:
                for nx in (cx - 1, cx, cx + 1):
                    for ny in (cy - 1, cy, cy + 1):
                        if nx < 0 or ny < 0 or nx >= width or ny >= height:
                            continue
                        if (nx, ny) in seen or pixels[nx, ny] <= 8:
                            continue
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            if len(queue) < min_area:
                for px, py in queue:
                    pixels[px, py] = 0

    out.putalpha(alpha)
    return out


def sheet_frames(width: int, height: int) -> dict[str, dict[str, int]]:
    frames: dict[str, dict[str, int]] = {}
    for idx, name in enumerate(FRAME_ORDER):
        col = idx % 4
        row = idx // 4
        x0 = round(width * col / 4)
        x1 = round(width * (col + 1) / 4)
        y0 = round(height * row / 2)
        y1 = round(height * (row + 1) / 2)
        frames[name] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
    return frames


def inset_rect(rect: dict[str, int], amount: int) -> tuple[int, int, int, int]:
    x0 = rect["x"] + amount
    y0 = rect["y"] + amount
    x1 = rect["x"] + rect["w"] - amount
    y1 = rect["y"] + rect["h"] - amount
    return x0, y0, x1, y1


def export_character(char_key: str, spec: dict[str, str]) -> dict[str, object]:
    sheet_path = PACK_DIR / spec["sheet"]
    if not sheet_path.exists():
        raise FileNotFoundError(sheet_path)
    sheet = Image.open(sheet_path).convert("RGBA")
    frames_meta = sheet_frames(sheet.width, sheet.height)
    out_dir = PACK_DIR / spec["dir"] / "frames"
    out_dir.mkdir(parents=True, exist_ok=True)

    exported: dict[str, str] = {}
    cells: dict[str, Image.Image] = {}
    inset = 0 if char_key == "base_kaizen" else 5
    for name in FRAME_ORDER:
        rect = frames_meta[name]
        cell = sheet.crop(inset_rect(rect, inset))
        cells[name] = cell
        frame = fit_on_square(cell, FRAME_SIZE, 470, 485, 500)
        if name == "jump":
            frame = remove_small_alpha_components(frame, min_area=800)
        dest = out_dir / f"{name}.png"
        frame.save(dest)
        exported[name] = f"{spec['dir']}/frames/{name}.png"

    # Portrait/icon are derived from idle so they keep the same character identity.
    idle = cells["idle"]
    bbox = alpha_bbox(idle)
    idle_crop = idle.crop(bbox)
    portrait_crop = idle_crop.crop((0, 0, idle_crop.width, round(idle_crop.height * 0.64)))
    portrait = center_on_square(portrait_crop, PORTRAIT_SIZE, 650, 700)
    portrait_path = PACK_DIR / spec["dir"] / "portrait.png"
    portrait.save(portrait_path)

    icon = center_on_square(portrait_crop, ICON_SIZE, 220, 230)
    icon_path = PACK_DIR / spec["dir"] / "small_icon.png"
    icon.save(icon_path)

    return {
        "displayName": spec["displayName"],
        "archetypeId": spec["archetypeId"],
        "sourcePrompt": spec["sourcePrompt"],
        "sheet": {
            "alpha": spec["sheet"],
            "chromaKeySource": spec["key"],
            **({"previewSource": spec["preview"]} if "preview" in spec else {}),
            "width": sheet.width,
            "height": sheet.height,
            "grid": {
                "columns": 4,
                "rows": 2,
                "cellWidth": sheet.width / 4,
                "cellHeight": sheet.height / 2,
                "cropInset": inset,
            },
            "frameOrder": FRAME_ORDER,
            "frames": frames_meta,
        },
        "exports": {
            "generatedBy": "scripts/export-kaizen-batch1.py",
            "frameSize": FRAME_SIZE,
            "portraitSize": PORTRAIT_SIZE,
            "iconSize": ICON_SIZE,
            "frames": exported,
            "portrait": f"{spec['dir']}/portrait.png",
            "smallIcon": f"{spec['dir']}/small_icon.png",
        },
    }


def export_frames() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text())
    manifest["version"] = 2
    manifest["pipeline"] = "generated-sprite-source"
    manifest["characters"] = {
        key: export_character(key, spec)
        for key, spec in CHARACTER_SPECS.items()
        if (PACK_DIR / spec["sheet"]).exists()
    }

    # Batch 2 is now concrete; keep later batches as future work.
    manifest["futureBatches"] = [b for b in manifest.get("futureBatches", []) if b.get("id") != "batch_2_archetypes"]
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")

    print(json.dumps({
        "exportedCharacters": list(manifest["characters"].keys()),
        "frameSize": FRAME_SIZE,
        "portraitSize": PORTRAIT_SIZE,
        "iconSize": ICON_SIZE,
    }, indent=2))


if __name__ == "__main__":
    export_frames()
