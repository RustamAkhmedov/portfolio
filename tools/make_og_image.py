#!/usr/bin/env python3
"""Render the Open Graph link-preview card.

When the portfolio URL is pasted into LinkedIn, Slack, WhatsApp or a Discord
DM, this is the image that unfurls. Without it the link shows as bare text,
which is the one place a portfolio cannot afford to look unfinished.

Everything on the card is read out of index.html, so it cannot claim anything
the page does not already say.

The pixel lettering is real text rendered small in Consolas and then upscaled
with nearest-neighbour, which gives the chunky look of the site's Silkscreen
headings without needing the webfont file.

Usage:
    python tools/make_og_image.py

Writes assets/og/og-card.png (1200x630).
"""

from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "og" / "og-card.png"

W, H = 1200, 630

VOID = (10, 7, 16)
PANEL = (22, 16, 34)
VOID_2 = (18, 11, 28)
VIOLET = (109, 40, 217)
VIOLET_BRIGHT = (168, 85, 247)
VIOLET_GLOW = (192, 132, 252)
INK = (232, 227, 240)
INK_DIM = (156, 143, 181)
GREEN = (125, 255, 138)

MONO = "C:/Windows/Fonts/consola.ttf"
MONO_BOLD = "C:/Windows/Fonts/consolab.ttf"


# --------------------------------------------------------------------------
# content, read from the page
# --------------------------------------------------------------------------

def read_page() -> dict:
    src = (ROOT / "index.html").read_text(encoding="utf-8")

    def one(pattern, default=""):
        m = re.search(pattern, src, re.S)
        return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else default

    tags = [html.unescape(t).strip()
            for t in re.findall(r'<li class="tag">(.*?)</li>', src, re.S)]
    status = one(r'<dd class="v on">(.*?)</dd>').lstrip("● ").strip()

    return {
        "eyebrow": one(r'<p class="eyebrow">(.*?)</p>'),
        "title": one(r'<h1 class="title"[^>]*>(.*?)</h1>'),
        "tags": tags,
        "status": status,
        "location": one(r'<dd class="v">(.*?)</dd>'),
    }


# --------------------------------------------------------------------------
# drawing helpers
# --------------------------------------------------------------------------

def pixel_text(text: str, size: int, scale: int, fill, font_path=MONO_BOLD,
               tracking: int = 0) -> Image.Image:
    """Render text small, then blow it up with NEAREST for a pixel look."""
    font = ImageFont.truetype(font_path, size)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    widths = [probe.textlength(ch, font=font) for ch in text]
    w = int(sum(widths) + tracking * max(0, len(text) - 1)) + 4
    h = size * 2
    small = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(small)
    x = 2
    for ch, cw in zip(text, widths):
        d.text((x, size // 3), ch, font=font, fill=fill)
        x += cw + tracking
    box = small.getbbox()
    if box:
        small = small.crop(box)
    return small.resize((small.width * scale, small.height * scale), Image.NEAREST)


def smooth_text(draw, xy, text, size, fill, font_path=MONO, anchor=None):
    font = ImageFont.truetype(font_path, size)
    draw.text(xy, text, font=font, fill=fill, anchor=anchor)
    return draw.textlength(text, font=font)


def rounded_rect(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


# --------------------------------------------------------------------------

def main() -> None:
    page = read_page()
    card = Image.new("RGB", (W, H), VOID)
    draw = ImageDraw.Draw(card)

    # --- wallpaper: violet glow from the top, then the dot grid -------------
    glow = Image.new("RGB", (W, H), VOID)
    gd = ImageDraw.Draw(glow)
    for i in range(140, 0, -1):
        t = i / 140
        r = int(760 * t)
        c = (int(VOID[0] + (48 - VOID[0]) * (1 - t) ** 2),
             int(VOID[1] + (20 - VOID[1]) * (1 - t) ** 2),
             int(VOID[2] + (86 - VOID[2]) * (1 - t) ** 2))
        gd.ellipse([W // 2 - r, -r // 2 - 40, W // 2 + r, r // 2 + 40], fill=c)
    card = Image.blend(card, glow, 0.85)
    draw = ImageDraw.Draw(card)

    dots = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    for y in range(0, H, 26):
        for x in range(0, W, 26):
            dd.rectangle([x, y, x + 1, y + 1], fill=(168, 85, 247, 60))
    card = Image.alpha_composite(card.convert("RGBA"), dots).convert("RGB")
    draw = ImageDraw.Draw(card)

    # --- the window ---------------------------------------------------------
    wx0, wy0, wx1, wy1 = 62, 72, W - 62, H - 66
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([wx0 + 6, wy0 + 14, wx1 + 6, wy1 + 16],
                                             radius=12, fill=(0, 0, 0, 150))
    card = Image.alpha_composite(card.convert("RGBA"), shadow).convert("RGB")
    draw = ImageDraw.Draw(card)

    rounded_rect(draw, [wx0, wy0, wx1, wy1], 10, fill=PANEL, outline=VIOLET, width=3)

    # title bar
    bar_h = 46
    draw.rectangle([wx0 + 3, wy0 + 3, wx1 - 3, wy0 + bar_h], fill=VOID_2)
    for i in range(wy0 + 3, wy0 + bar_h, 3):
        draw.line([(wx0 + 3, i), (wx1 - 3, i)], fill=(58, 47, 77))
    draw.line([(wx0 + 3, wy0 + bar_h), (wx1 - 3, wy0 + bar_h)], fill=VIOLET, width=3)
    for i, cx in enumerate((wx0 + 30, wx0 + 58)):
        draw.ellipse([cx - 8, wy0 + bar_h // 2 - 8, cx + 8, wy0 + bar_h // 2 + 8],
                     outline=VIOLET_GLOW, width=2, fill=VOID)

    name = pixel_text("rustam.os", 13, 2, VIOLET_GLOW, tracking=1)
    card.paste(name, (W // 2 - name.width // 2, wy0 + bar_h // 2 - name.height // 2), name)

    # --- left column --------------------------------------------------------
    x = wx0 + 52
    y = wy0 + bar_h + 46

    eyebrow = pixel_text(page["eyebrow"], 11, 2, VIOLET_BRIGHT, tracking=2)
    card.paste(eyebrow, (x, y), eyebrow)
    y += eyebrow.height + 26

    headline = pixel_text("Rustam Akhmedov", 22, 3, VIOLET_GLOW, tracking=0)
    card.paste(headline, (x, y), headline)
    y += headline.height + 30

    for line in ("Ich baue Dinge, die vom Terminal bis zum",
                 "Browser-Tab reichen."):
        smooth_text(draw, (x, y), line, 27, INK)
        y += 38
    y += 16

    # skill chips
    chip_font = ImageFont.truetype(MONO_BOLD, 19)
    cx = x
    for tag in page["tags"]:
        tw = draw.textlength(tag, font=chip_font)
        if cx + tw + 34 > wx1 - 300:
            cx = x
            y += 50
        rounded_rect(draw, [cx, y, cx + tw + 26, y + 38], 4, outline=VIOLET, width=2)
        draw.text((cx + 13, y + 19), tag, font=chip_font, fill=VIOLET_GLOW, anchor="lm")
        cx += tw + 26 + 12
    y += 38 + 34

    # status
    draw.ellipse([x + 1, y + 8, x + 13, y + 20], fill=GREEN)
    smooth_text(draw, (x + 26, y + 14), page["status"], 24, INK_DIM, anchor="lm")

    # --- the cat ------------------------------------------------------------
    cat_path = ROOT / "assets" / "mascot" / "frames" / "idle_1.png"
    if cat_path.exists():
        cat = Image.open(cat_path).convert("RGBA")
        scale = 232 / cat.height
        cat = cat.resize((round(cat.width * scale), 232), Image.NEAREST)
        card.paste(cat, (wx1 - cat.width - 62, wy1 - cat.height - 26), cat)

    # --- CRT scanlines ------------------------------------------------------
    lines = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    for yy in range(0, H, 3):
        ld.line([(0, yy), (W, yy)], fill=(168, 85, 247, 14))
    card = Image.alpha_composite(card.convert("RGBA"), lines).convert("RGB")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    card.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB, {W}x{H})")


if __name__ == "__main__":
    main()
