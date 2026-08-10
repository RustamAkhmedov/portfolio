#!/usr/bin/env python3
"""Re-encode the site imagery at the size the page actually renders it.

The project screenshots were committed straight out of a 2880x1620 capture,
about 2.5K wide, but the page never shows them larger than roughly 320 CSS
pixels: 256px in a finder card and ~313px in a try-out preview, the latter
behind a dark scrim. That was 2.2MB of images to paint a few thumbnails.

Screenshots of user interfaces palette-quantise extremely well -- flat fills,
few colours, and text that stays crisp because there is no chroma subsampling
the way there would be with JPEG. At the size these are displayed the result
is visually indistinguishable from the original.

The full-resolution originals remain in git history if they are ever needed.

Usage:
    python tools/optimize_images.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# Widest the asset is ever painted, doubled for high-DPI screens.
SCREENSHOT_WIDTH = 800
PORTRAIT_WIDTH = 400


def optimise_screenshot(path: Path) -> tuple[int, int]:
    before = path.stat().st_size
    im = Image.open(path)
    has_alpha = im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 255
    im = im.convert("RGBA" if has_alpha else "RGB")

    if im.width > SCREENSHOT_WIDTH:
        height = round(im.height * SCREENSHOT_WIDTH / im.width)
        im = im.resize((SCREENSHOT_WIDTH, height), Image.LANCZOS)

    if not has_alpha:
        im = im.quantize(colors=256, method=Image.MEDIANCUT)
    im.save(path, optimize=True)
    return before, path.stat().st_size


def optimise_portrait(path: Path) -> tuple[int, int]:
    before = path.stat().st_size
    im = Image.open(path).convert("RGB")
    if im.width > PORTRAIT_WIDTH:
        height = round(im.height * PORTRAIT_WIDTH / im.width)
        im = im.resize((PORTRAIT_WIDTH, height), Image.LANCZOS)
    im.save(path, quality=86, optimize=True, progressive=True)
    return before, path.stat().st_size


def main() -> None:
    jobs = [(p, optimise_screenshot) for p in sorted((ROOT / "assets/projects").glob("*.png"))]
    jobs += [(p, optimise_portrait) for p in sorted((ROOT / "assets/profile").glob("*.jpg"))]

    total_before = total_after = 0
    for path, fn in jobs:
        before, after = fn(path)
        total_before += before
        total_after += after
        print("%-38s %8.1f KB -> %7.1f KB  (-%2.0f%%)  %s"
              % (path.relative_to(ROOT).as_posix(), before / 1024, after / 1024,
                 100 * (1 - after / before), "%dx%d" % Image.open(path).size))

    print("\n%-38s %8.1f KB -> %7.1f KB  (-%2.0f%%)"
          % ("TOTAL", total_before / 1024, total_after / 1024,
             100 * (1 - total_after / total_before)))


if __name__ == "__main__":
    main()
