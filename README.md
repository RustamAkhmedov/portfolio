# Portfolio — rustam.os

My personal portfolio, built as a retro desktop OS: a menu bar, draggable-looking
windows, a boot splash, a CRT scanline overlay, and a pixel cat that wanders
around the corner of the screen.

Static HTML, CSS and JavaScript. No framework and no runtime dependencies — the
deployed site is exactly what is in this repository.

**German:** `index.html` · **English:** `index_en.html` — both are **generated** from
`src/` by a small dependency-free Node script, so the two languages share one set of
markup. Never edit them by hand.

---

## Editing it

```bash
npm install      # once — only jsdom, for the tests
npm run build    # regenerate index.html + index_en.html from src/
npm test         # pages up to date? translations complete? both pages load cleanly in jsdom?
```

| To change … | edit … |
|---|---|
| any text, in both languages | `src/strings.json` (`{ "de": …, "en": … }` side by side) |
| the project cards | `src/projects.json` |
| the live demos | `src/demos.json` |
| a section's markup | `src/sections/<section>.html` |
| page skeleton, `<head>` | `src/page.html` |

The template syntax is a small subset of Mustache, documented at the top of
`tools/build.mjs`. An unknown key or a missing translation fails the build instead of
leaving a blank on the page.

## Running it

It is a static site, so anything that serves files works:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from the file
manager also works — that is why the JavaScript is a plain script rather than
ES modules, and why the mascot frame table is a `.js` file instead of JSON that
would need `fetch()`.

---

## Layout

```
index.html          German page   — GENERATED, do not edit
index_en.html       English page  — GENERATED, do not edit
src/                Sources for both pages (markup, strings, project/demo data)
tools/build.mjs     Builds the pages from src/ (`--check` verifies they are current)
tests/              node --test suites (data checks + both pages in jsdom)
css/styles.css      One stylesheet, sectioned, with design tokens at the top
js/main.js          All behaviour: boot, clock, menus, scroll effects,
                    previews, typewriters, cat mascot
js/mascot-manifest.js   Generated frame table — do not edit by hand
assets/
  cursors/          The custom pixel pointers
  icons/            Favicon and the HolyC badge
  mascot/src/       Original cat frames as they came out of the art tool
  mascot/frames/    Normalised frames the page actually loads
  projects/         Project screenshots
  arkanoid/         Pygame build, compiled to WebAssembly
  drawingtool/      raylib build, compiled to WebAssembly
tools/*.py          Asset pipeline (see below)
```

Both language pages come from the same markup, and a test checks that their
structure is identical.

---

## Asset pipeline

Two small Python scripts, run by hand when the source assets change. Both need
`pillow` and `numpy`.

### `tools/normalize_mascot.py`

The cat frames arrived with three problems that made the animation jitter:
every frame had its own canvas size, so `background-size: contain` scaled each
one differently and the cat visibly grew and shrank; the `purr` frames were
drawn at roughly twice the art scale of the others; and two frames had a stray
black "ground line" baked in that no other frame had.

The script measures the art scale, normalises all 20 frames onto one canvas
with the feet on a shared baseline, strips the artefact, and rebuilds the white
keyline on the one frame that shipped without it. It writes the frames and the
manifest the page animates from.

```bash
python tools/normalize_mascot.py
```

### `tools/optimize_images.py`

Re-encodes the screenshots at the size the page actually renders them. The
originals were 2880×1620 captures being painted into 256px cards.

```bash
python tools/optimize_images.py
```

---

## Notes

- Animation respects `prefers-reduced-motion`: the typewriters settle on their
  first line and the cat sits still.
- Content is visible by default and only starts hidden once JavaScript takes
  over the scroll reveal, so a blocked script cannot leave a blank page.
- The try-out previews load their iframes on first open rather than up front.
- The cat's frame loop parks itself while the tab is in the background.
