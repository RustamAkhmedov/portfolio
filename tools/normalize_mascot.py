#!/usr/bin/env python3
"""Normalise the cat mascot sprite frames into one consistent sprite set.

Why this exists
---------------
The original frames in ``assets/mascot/src/`` came out of the art tool with
three problems that made the on-page animation jitter:

1. Every frame had a different canvas size (163x180, 192x123, 243x196,
   200x155, ...). The CSS drew them with ``background-size: contain`` inside a
   fixed box, so *each frame got a different scale factor* and the cat visibly
   grew and shrank on every single frame.
2. The ``purr`` frames are drawn at roughly twice the art scale of the other
   states (measured below), so hovering made the cat balloon.
3. Two frames (``run_5``, ``bite_4``) have a stray black "ground line" baked
   into the artwork that no other frame has, so it flickered in and out.

This script fixes all three offline, once, so the runtime can stay dumb: every
output frame is the same size, at the same scale, with the cat's feet on the
same baseline. The browser then only has to swap ``background-image``.

Usage
-----
    python tools/normalize_mascot.py

Reads  ``assets/mascot/src/{state}_{n}.png``
Writes ``assets/mascot/frames/{state}_{n}.png`` and ``frames/manifest.json``
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "mascot" / "src"
OUT = ROOT / "assets" / "mascot" / "frames"

# Frames per state, in playback order.
STATES = {
    "idle": 6,
    "run": 5,
    "purr": 4,
    "bite": 5,
}

# Milliseconds per frame, and whether the state loops or plays once.
TIMING = {
    "idle": {"frameMs": 400, "loop": True},
    "run": {"frameMs": 110, "loop": True},
    "purr": {"frameMs": 300, "loop": True},
    "bite": {"frameMs": 110, "loop": False},
}

# Art-scale correction, i.e. how much larger this state was drawn than `idle`.
#
# Measured three independent ways on the source art (see `report_art_scale`):
#   - ear-tip-to-ear-tip span, frontal frames : purr/idle = 126/67  = 1.88
#   - pink ear pixel area (linear = sqrt)     : purr/idle = sqrt(845/227) = 1.93
#   - white outline stroke width              : purr/idle = 2.07/0.93 = 2.23
# The two direct measurements of the same feature agree closely, so 1.9 it is.
ART_SCALE = {"idle": 1.0, "run": 1.0, "purr": 1.9, "bite": 1.0}

# Which edge of the sprite stays put from frame to frame. The cat runs and
# bites facing right, so pinning the head (run) or the rear (bite, where a hand
# enters from the right on frames 3-4) keeps the body from sliding around.
ANCHOR_X = {"idle": "center", "run": "right", "purr": "center", "bite": "left"}

PAD = 6  # transparent margin around the largest frame, in output pixels


# --------------------------------------------------------------------------
# artefact removal
# --------------------------------------------------------------------------

def strip_ground_line(rgba: np.ndarray) -> tuple[np.ndarray, int]:
    """Erase the stray black baseline baked into some frames.

    A ground line is a long, near-black horizontal run close to the bottom of
    the sprite that has no body above it -- the cat's own paws always do. Once
    such a run is found we clear the whole bar, including its anti-aliased top
    edge, but only in the columns where there is genuinely nothing above it, so
    the stretch that passes behind a paw is left alone.
    """
    rgba = rgba.copy()
    opaque = rgba[..., 3] > 40
    dark = opaque & (rgba[..., :3].max(axis=2) < 70)
    rows = np.nonzero(opaque.any(axis=1))[0]
    cols = np.nonzero(opaque.any(axis=0))[0]
    if not len(rows) or not len(cols):
        return rgba, 0
    body_w = cols.max() - cols.min() + 1
    bottom = rows.max()
    removed = 0

    for y in range(bottom, max(bottom - 8, rows.min()), -1):
        x = 0
        row = dark[y]
        while x < len(row):
            if not row[x]:
                x += 1
                continue
            start = x
            while x < len(row) and row[x]:
                x += 1
            if (x - start) < 0.2 * body_w:
                continue
            above = opaque[max(y - 5, 0):y - 1, start:x]
            if (above.any(axis=0).mean() if above.size else 0.0) >= 0.2:
                continue

            # Walk up past the bar's anti-aliased edge to find its true top.
            top = y
            while top - 1 >= 0 and opaque[top - 1, start:x].mean() > 0.6:
                top -= 1

            # Clear only the columns with nothing just above the bar; the rest
            # is a paw resting on it. The window is deliberately local -- the
            # tail sweeps high over these same columns and must not count.
            for c in range(start, x):
                if opaque[max(top - 6, 0):top, c].any():
                    continue
                removed += int(opaque[top:bottom + 1, c].sum())
                rgba[top:bottom + 1, c, 3] = 0
    return rgba, removed


# The white sticker keyline is what keeps the cat readable on the dark page.
# Every source frame has one except `bite_3`, which we rebuild below.
OUTLINE_RGB = (250, 250, 250)   # sampled from the other frames
OUTLINE_PX = 3                  # rings sampled when testing whether one exists
OUTLINE_DRAW_PX = 2             # matches the weight of the hand-drawn keylines


def has_outline(rgba: np.ndarray) -> float:
    """Fraction of the sprite's outer 3px shell that is the white keyline."""
    opaque = rgba[..., 3] > 40
    whiteish = opaque & (rgba[..., :3].min(axis=2) > 200)
    mask = opaque.copy()
    shell = np.zeros_like(mask)
    for _ in range(OUTLINE_PX):
        eroded = mask.copy()
        eroded[1:-1, 1:-1] = (mask[1:-1, 1:-1] & mask[:-2, 1:-1] & mask[2:, 1:-1]
                              & mask[1:-1, :-2] & mask[1:-1, 2:])
        shell |= mask & ~eroded
        mask = eroded
    return float(whiteish[shell].mean()) if shell.any() else 0.0


def add_outline(rgba: np.ndarray, width: int = OUTLINE_DRAW_PX) -> np.ndarray:
    """Draw the missing white keyline behind the artwork.

    Every frame but one ships with a sticker-style white outline, which is what
    keeps the cat readable against the dark page. `bite_3` was exported without
    it, so we rebuild it: dilate the alpha mask, paint the new ring in the same
    white the other frames use, and put the original art back on top.
    """
    pad = width + 1
    padded = np.pad(rgba, ((pad, pad), (pad, pad), (0, 0)))
    mask = padded[..., 3] > 40

    grown = mask.copy()
    for step in range(width):
        prev = grown.copy()
        grown[1:-1, 1:-1] |= prev[:-2, 1:-1] | prev[2:, 1:-1] | prev[1:-1, :-2] | prev[1:-1, 2:]
        if step < width - 1:  # octagonal halo rather than a blocky square one
            grown[1:-1, 1:-1] |= prev[:-2, :-2] | prev[:-2, 2:] | prev[2:, :-2] | prev[2:, 2:]

    out = np.zeros_like(padded)
    ring = grown & ~mask
    out[ring] = (*OUTLINE_RGB, 255)

    src = Image.fromarray(padded.astype(np.uint8), "RGBA")
    dst = Image.fromarray(out.astype(np.uint8), "RGBA")
    dst.alpha_composite(src)
    return np.array(dst)


def largest_blob_bbox(alpha: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of all sizeable connected blobs (keeps hearts, drops dust)."""
    mask = alpha > 40
    h, w = mask.shape
    seen = np.zeros_like(mask)
    blobs = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            pts = []
            while q:
                y, x = q.popleft()
                pts.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
            blobs.append(pts)
    if not blobs:
        return 0, 0, 0, 0
    biggest = max(len(b) for b in blobs)
    keep = [p for b in blobs if len(b) >= biggest * 0.01 for p in b]
    ys = [y for y, _ in keep]
    xs = [x for _, x in keep]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


# --------------------------------------------------------------------------
# diagnostics
# --------------------------------------------------------------------------

def report_art_scale() -> None:
    """Print the outline-stroke estimate that ART_SCALE is calibrated against."""
    print("art-scale check (outline stroke width, relative to idle):")
    base = None
    for state in STATES:
        vals = []
        for path in sorted(SRC.glob(f"{state}_*.png")):
            im = np.array(Image.open(path).convert("RGBA")).astype(int)
            opaque = im[..., 3] > 128
            white = opaque & (im[..., :3].min(axis=2) > 235)
            edge = np.zeros_like(opaque)
            edge[1:-1, 1:-1] = opaque[1:-1, 1:-1] & ~(
                opaque[:-2, 1:-1] & opaque[2:, 1:-1] & opaque[1:-1, :-2] & opaque[1:-1, 2:]
            )
            if edge.sum():
                vals.append(white.sum() / edge.sum())
        stroke = sum(vals) / len(vals)
        base = base or stroke
        print(f"  {state:<5} stroke={stroke:.2f}  measured={stroke / base:.2f}x  "
              f"configured={ART_SCALE[state]:.2f}x")


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> None:
    report_art_scale()
    print()

    # Pass 1: clean, scale and crop every frame; remember the largest result.
    prepared: dict[str, list[Image.Image]] = {}
    for state, count in STATES.items():
        frames = []
        for n in range(1, count + 1):
            path = SRC / f"{state}_{n}.png"
            rgba = np.array(Image.open(path).convert("RGBA"))

            rgba, removed = strip_ground_line(rgba)
            if removed:
                print(f"  {state}_{n}: removed {removed}px ground-line artefact")

            coverage = has_outline(rgba)
            if coverage < 0.25:
                rgba = add_outline(rgba)
                print(f"  {state}_{n}: keyline missing ({coverage:.0%} coverage) "
                      f"-> rebuilt {OUTLINE_DRAW_PX}px white outline "
                      f"({has_outline(rgba):.0%} coverage)")

            im = Image.fromarray(rgba, "RGBA")
            im = im.crop(largest_blob_bbox(rgba[..., 3]))

            scale = ART_SCALE[state]
            if scale != 1.0:
                im = im.resize((max(1, round(im.width / scale)),
                                max(1, round(im.height / scale))), Image.LANCZOS)
            frames.append(im)
        prepared[state] = frames

    canvas_w = max(f.width for fs in prepared.values() for f in fs) + PAD * 2
    canvas_h = max(f.height for fs in prepared.values() for f in fs) + PAD * 2
    print(f"\nuniform canvas: {canvas_w}x{canvas_h}")

    # Pass 2: place every frame on the shared canvas, feet on the same baseline.
    OUT.mkdir(parents=True, exist_ok=True)
    for state, frames in prepared.items():
        anchor = ANCHOR_X[state]
        for n, im in enumerate(frames, start=1):
            sheet = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
            if anchor == "left":
                x = PAD
            elif anchor == "right":
                x = canvas_w - PAD - im.width
            else:
                x = (canvas_w - im.width) // 2
            sheet.alpha_composite(im, (x, canvas_h - PAD - im.height))
            sheet.save(OUT / f"{state}_{n}.png", optimize=True)
        print(f"  {state}: {len(frames)} frames, anchor-x={anchor}")

    manifest = {
        "canvas": {"width": canvas_w, "height": canvas_h},
        "states": {
            state: {
                "frames": [f"{state}_{n}.png" for n in range(1, count + 1)],
                **TIMING[state],
            }
            for state, count in STATES.items()
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)}/manifest.json")


if __name__ == "__main__":
    main()
