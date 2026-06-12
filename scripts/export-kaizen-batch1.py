#!/usr/bin/env python3
"""Export Base Kaizen frame assets from the manifest-defined sprite sheet."""

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


def export_frames() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text())
    character = manifest["characters"]["base_kaizen"]
    sheet_meta = character["sheet"]
    sheet_path = PACK_DIR / sheet_meta["alpha"]
    sheet = Image.open(sheet_path).convert("RGBA")
    out_dir = PACK_DIR / "base" / "frames"
    out_dir.mkdir(parents=True, exist_ok=True)

    exported: dict[str, str] = {}
    cells: dict[str, Image.Image] = {}
    for name in sheet_meta["frameOrder"]:
        rect = sheet_meta["frames"][name]
        cell = sheet.crop((rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"]))
        cells[name] = cell
        frame = fit_on_square(cell, FRAME_SIZE, 470, 485, 500)
        if name == "jump":
            frame = remove_small_alpha_components(frame, min_area=800)
        dest = out_dir / f"{name}.png"
        frame.save(dest)
        exported[name] = f"base/frames/{name}.png"

    # Portrait/icon are derived from idle so they keep the same character identity.
    idle = cells["idle"]
    bbox = alpha_bbox(idle)
    idle_crop = idle.crop(bbox)
    portrait_crop = idle_crop.crop((0, 0, idle_crop.width, round(idle_crop.height * 0.64)))
    portrait = center_on_square(portrait_crop, PORTRAIT_SIZE, 650, 700)
    portrait_path = PACK_DIR / "base" / "portrait.png"
    portrait.save(portrait_path)

    icon = center_on_square(portrait_crop, ICON_SIZE, 220, 230)
    icon_path = PACK_DIR / "base" / "small_icon.png"
    icon.save(icon_path)

    print(json.dumps({
        "frames": exported,
        "portrait": "base/portrait.png",
        "small_icon": "base/small_icon.png",
        "frameSize": FRAME_SIZE,
        "portraitSize": PORTRAIT_SIZE,
        "iconSize": ICON_SIZE,
    }, indent=2))


if __name__ == "__main__":
    export_frames()
