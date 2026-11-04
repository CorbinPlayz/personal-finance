# Manuals

Print-ready instruction manuals. One per problem type. Written to be followed with a pen in hand, not read like an article.

| Manual | Source | Standard PDF | Print-friendly PDF |
|---|---|---|---|
| Fixing Your Ender 3 V2 — 14 pages | [`ender-3-v2-manual.md`](ender-3-v2-manual.md) | [`ender-3-v2-manual.pdf`](ender-3-v2-manual.pdf) | [`ender-3-v2-manual-print-friendly.pdf`](ender-3-v2-manual-print-friendly.pdf) |

### Two editions

- **Standard** — solid black phase banners and table headers. Best on a laser printer or screen.
- **Print-friendly** — same content, no solid black fills anywhere. Banners become heavy
  rules with big numerals, table headers become rules. About **80% less toner** by ink
  coverage than the standard edition, and it won't curl cheap paper.

Both are built from the same source in one run. The switch is the `LOW_INK` flag, set per
edition in `build_edition()`.

## Why PDF

The PDF is the copy you print and take to the machine. It has the checkboxes, the blank
lines for your measurements, the decision points, and a log page at the back. A phone
screen is a bad thing to consult with both hands inside a printer.

It's also the version you can send someone. "Here's the manual" lands differently than
"here's a link," and a PDF that solves their exact problem is the most portable form of
proof that you know what you're doing.

## Rebuilding

The PDF is generated from the markdown source. Design changes happen in the script, content
changes in the markdown.

```bash
python3 -m venv .venv
.venv/bin/pip install -r fix-log/manuals/requirements.txt
.venv/bin/python fix-log/manuals/build_pdf.py
```

Output overwrites both PDFs in one run. The script prints a page count and the first
line of text on each page so you can sanity-check pagination without opening a viewer.

Fonts: DejaVu Sans (standard on most Linux installs, at `/usr/share/fonts/truetype/dejavu`).
Change `FONT_DIR` in the script if yours lives elsewhere. The font needs the ☐ ✓ → ⚠ glyphs.

## House style

- **One action per step.** If a step needs a comma and an "and then," it's two steps.
- **Decision points, not prose.** Every branch is `if X → do Y`, never "depending on the
  situation, you may want to consider."
- **Write-in lines wherever a number matters.** The reader measures and records, so they can
  tell whether the value changed.
- **Warnings where money is wasted**, not where it's merely interesting. The ABL warning is
  loud because it's the $35 mistake almost everyone makes.
- **Never say "easy."** Say "moderate, and the order is what matters." It's honest, and it
  keeps people following the steps instead of improvising.
- **No ink where it isn't doing work.** A full-bleed black cover looks great on screen and
  is a bad thing to hand someone with a $40 inkjet. The print-friendly edition is the
  default recommendation, not the compromise.
