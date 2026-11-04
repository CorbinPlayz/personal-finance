#!/usr/bin/env python3
"""
Build a print-ready PDF instruction manual from the markdown source.

Usage:
    .venv/bin/python fix-log/manuals/build_pdf.py

Output:
    fix-log/manuals/ender-3-v2-manual.pdf

Requires: reportlab, pypdf (see fix-log/manuals/requirements.txt)
"""

import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, PolyLine, Rect, String
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.dirname(HERE)  # fix-log/
OUT = os.path.join(HERE, "ender-3-v2-manual.pdf")

# ---------------------------------------------------------------- fonts
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DJ", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DJ-B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("DJ-M", os.path.join(FONT_DIR, "DejaVuSansMono.ttf")))
pdfmetrics.registerFontFamily("DJ", normal="DJ", bold="DJ-B", italic="DJ", boldItalic="DJ-B")

# ---------------------------------------------------------------- palette
BLACK = colors.black
INK = colors.HexColor("#1a1a1a")
GREY = colors.HexColor("#6b6b6b")
LGREY = colors.HexColor("#d4d4d4")
FILL = colors.HexColor("#f4f4f4")
DARKFILL = colors.HexColor("#1a1a1a")

PAGE_W, PAGE_H = letter
MARGIN_L = MARGIN_R = 0.85 * inch
MARGIN_T = 0.95 * inch
MARGIN_B = 0.8 * inch
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

# ---------------------------------------------------------------- styles
def S(name, **kw):
    base = dict(name=name, fontName="DJ", fontSize=10, leading=14.5,
                textColor=INK, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(**base)

st_body = S("body", spaceAfter=7)
st_body_tight = S("bodyt", spaceAfter=3)
st_h1 = S("h1", fontName="DJ-B", fontSize=21, leading=24, spaceAfter=2)
st_h2 = S("h2", fontName="DJ-B", fontSize=14.5, leading=18, spaceAfter=4)
st_h3 = S("h3", fontName="DJ-B", fontSize=10.5, leading=14, spaceAfter=3)
st_phase_num = S("pnum", fontName="DJ-B", fontSize=8.5, leading=11,
                 textColor=colors.white, spaceAfter=0)
st_phase_title = S("ptitle", fontName="DJ-B", fontSize=17, leading=20,
                   textColor=colors.white, spaceAfter=0)
st_phase_sub = S("psub", fontSize=9.5, leading=13,
                 textColor=colors.HexColor("#c8c8c8"), spaceAfter=0)
st_step_num = S("snum", fontName="DJ-B", fontSize=8.5, leading=11,
                textColor=colors.white)
st_step = S("step", fontSize=10.5, leading=15)
st_write = S("write", fontName="DJ-B", fontSize=10, leading=15)
st_note = S("note", fontSize=9, leading=13)
st_warn = S("warn", fontName="DJ-B", fontSize=9.5, leading=13.5)
st_check = S("check", fontSize=10, leading=15)
st_quote = S("quote", fontSize=10.5, leading=15, textColor=GREY)
st_small = S("small", fontSize=8.5, leading=12, textColor=GREY)
st_center_small = S("cs", fontSize=8.5, leading=12, textColor=GREY, alignment=TA_CENTER)
st_tbl_h = S("tblh", fontName="DJ-B", fontSize=8.5, leading=11.5, textColor=colors.white)
st_tbl = S("tbl", fontSize=8.5, leading=11.5)
st_tbl_b = S("tblb", fontName="DJ-B", fontSize=8.5, leading=11.5)
st_cover_title = S("ct", fontName="DJ-B", fontSize=34, leading=37, spaceAfter=0)
st_cover_kicker = S("ck", fontName="DJ-B", fontSize=9, leading=12,
                    textColor=colors.HexColor("#9a9a9a"), spaceAfter=10)
st_cover_sub = S("csub", fontSize=12, leading=17, textColor=colors.HexColor("#c8c8c8"))
st_toc = S("toc", fontSize=10, leading=17)
st_toc_b = S("tocb", fontName="DJ-B", fontSize=10, leading=17)


# ---------------------------------------------------------------- helpers
def inline(txt):
    """Convert a limited subset of markdown inline syntax to reportlab markup."""
    txt = txt.replace("&quot;", '"').replace("&amp;", "&")
    txt = txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # bold
    txt = re.sub(r"\*\*(.+?)\*\*", r'<b>\1</b>', txt)
    # inline code
    txt = re.sub(r"`(.+?)`", r'<font name="DJ-M" size="9">\1</font>', txt)
    # links [text](url) -> text
    txt = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", txt)
    # italics: no italic face registered, so emphasise instead
    txt = re.sub(r"&lt;i&gt;(.+?)&lt;/i&gt;", r"<b>\1</b>", txt)
    # allow explicit <b> in source text
    txt = txt.replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")
    return txt


def rule(color=LGREY, thickness=0.7, space_before=2, space_after=8, width="100%"):
    t = Table([[""]], colWidths=[CONTENT_W], rowHeights=[0.1])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, -1), thickness, color),
        ("TOPPADDING", (0, 0), (-1, -1), space_before),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [t, Spacer(1, space_after)]


def step_box(num, text):
    """Numbered step: dark number chip + text, side by side, never split."""
    chip = Table([[Paragraph(str(num), st_step_num)]], colWidths=[0.44 * inch],
                 rowHeights=[0.24 * inch])
    chip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    t = Table([[chip, Paragraph(inline(text), st_step)]],
              colWidths=[0.6 * inch, CONTENT_W - 0.6 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return KeepTogether([t])


def write_line(label):
    """A ruled blank for the reader to write in."""
    t = Table([[Paragraph(inline(label), st_write)]],
              colWidths=[CONTENT_W], rowHeights=[0.34 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (0, 0), 0.8, INK),
    ]))
    return t


def callout(title, body, kind="note"):
    """Boxed note or warning."""
    if kind == "warn":
        bg, bar, style = FILL, BLACK, st_warn
        head = Paragraph("⚠ " + title.upper(), st_warn)
    else:
        bg, bar, style = colors.HexColor("#fafafa"), LGREY, st_note
        head = Paragraph("NOTE — " + title.upper(), st_warn)

    inner = [head, Spacer(1, 4), Paragraph(inline(body), st_note)]
    t = Table([[inner]], colWidths=[CONTENT_W - 0.12 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return [Spacer(1, 3), t, Spacer(1, 9)]


def decision_box(lines):
    """The black DECISION POINT header plus its contents."""
    head = Table([[Paragraph("DECISION POINT", st_phase_num)]],
                 colWidths=[1.55 * inch], rowHeights=[0.2 * inch])
    head.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    body_rows = []
    for l in lines:
        if l == "---":
            body_rows.append([Spacer(1, 7)])
        else:
            body_rows.append([Paragraph(inline(l), st_body_tight)])
    inner = Table(body_rows, colWidths=[CONTENT_W - 0.3 * inch])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FILL),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (0, 0), 9),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
    ]))
    t = Table([[head], [inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
    ]))
    return [Spacer(1, 4), t, Spacer(1, 10)]


def data_table(rows, widths=None, header=True, first_bold=False):
    """Standard rules-table."""
    ncols = len(rows[0])
    if widths is None:
        widths = [CONTENT_W / ncols] * ncols
    else:
        total = sum(widths)
        widths = [CONTENT_W * (w / total) for w in widths]
    out = []
    for r_i, row in enumerate(rows):
        cells = []
        for c_i, cell in enumerate(row):
            if r_i == 0 and header:
                cells.append(Paragraph(cell, st_tbl_h))
            elif first_bold and c_i == 0:
                cells.append(Paragraph(cell, st_tbl_b))
            else:
                cells.append(Paragraph(inline(cell), st_tbl))
        out.append(cells)
    t = Table(out, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LGREY),
        ("LINEBELOW", (0, -1), (-1, -1), 0.7, INK),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), BLACK),
            ("TOPPADDING", (0, 0), (-1, 0), 7),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ]
    t.setStyle(TableStyle(style))
    return [t, Spacer(1, 11)]


# ---------------------------------------------------------------- figures
FIG_BLACK = colors.HexColor("#1a1a1a")
FIG_FILL = colors.HexColor("#ececec")
FIG_MID = colors.HexColor("#c9c9c9")


def _badge(d, x, y, n, size=12, fs=7):
    d.add(Rect(x, y, size, size, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
    d.add(String(x + size / 2, y + 3.4, str(n), fontName="DJ-B", fontSize=fs,
                 fillColor=colors.white, textAnchor="middle"))


def _label(d, x, y, text, sub=None, anchor="start"):
    d.add(String(x, y + 4, text, fontName="DJ-B", fontSize=7.6, fillColor=FIG_BLACK,
                 textAnchor=anchor))
    if sub:
        d.add(String(x, y - 5, sub, fontName="DJ", fontSize=6.8, fillColor=GREY,
                     textAnchor=anchor))


def _leader(d, pts, dot=True):
    d.add(PolyLine(pts, strokeColor=colors.HexColor("#8f8f8f"), strokeWidth=0.6))
    if dot:
        x, y = pts[-1]
        d.add(Circle(x, y, 1.6, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))


def schematic():
    """Front view of the Ender 3 V2, schematic, with the parts that matter."""
    BASE_W, BASE_H, SCALE = 460, 268, 0.76
    d = Drawing(BASE_W * SCALE, BASE_H * SCALE)
    d.hAlign = "CENTER"
    d.scale(SCALE, SCALE)

    # --- frame
    d.add(Rect(120, 12, 190, 18, fillColor=FIG_FILL, strokeColor=FIG_BLACK, strokeWidth=1.1))
    d.add(Rect(120, 30, 15, 226, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=1.1))
    d.add(Rect(295, 30, 15, 226, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=1.1))
    d.add(Rect(120, 238, 190, 16, fillColor=FIG_FILL, strokeColor=FIG_BLACK, strokeWidth=1.1))

    # --- z lead screw in the left post
    d.add(Rect(125, 52, 5, 186, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.7))
    d.add(Rect(123, 44, 9, 8, fillColor=FIG_MID, strokeColor=FIG_BLACK, strokeWidth=0.7))

    # --- gantry
    d.add(Rect(135, 168, 160, 10, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
    d.add(Rect(291, 164, 7, 18, fillColor=FIG_MID, strokeColor=FIG_BLACK, strokeWidth=0.8))

    # --- print head + nozzle
    d.add(Rect(176, 148, 26, 20, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.9))
    d.add(Polygon(points=[182, 148, 196, 148, 189, 139],
                  fillColor=FIG_BLACK, strokeColor=FIG_BLACK))

    # --- bed assembly
    d.add(Rect(150, 96, 120, 6, fillColor=FIG_FILL, strokeColor=FIG_BLACK, strokeWidth=1.0))
    d.add(Rect(150, 102, 120, 2.2, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.6))

    for sx in (162, 258):
        zig, y, i = [], 82, 0
        while y <= 96:
            zig.append((sx + (3.5 if i % 2 else -3.5), y))
            y += 3.2
            i += 1
        d.add(PolyLine(zig, strokeColor=FIG_BLACK, strokeWidth=0.8))
        d.add(Rect(sx - 4.5, 73, 9, 9, fillColor=FIG_MID, strokeColor=FIG_BLACK, strokeWidth=0.8))
        d.add(Line(sx, 96, sx, 82, strokeColor=FIG_MID, strokeWidth=0.4))

    d.add(Rect(150, 70, 120, 3, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.8))

    # --- measurement lines (steps 1.4 / 1.5)
    for mx, n in ((108, "1"), (322, "2")):
        d.add(Line(mx, 30, mx, 238, strokeColor=colors.HexColor("#9a9a9a"),
                   strokeWidth=0.6, strokeDashArray=[2, 2.5]))
        for yy in (30, 238):
            d.add(Line(mx - 3.5, yy, mx + 3.5, yy, strokeColor=colors.HexColor("#9a9a9a"), strokeWidth=0.8))
        _badge(d, mx - 5.5, 130, n, size=11, fs=6.5)

    # --- labels
    _label(d, 112, 246, "FRAME", "top extrusion", anchor="end")
    _leader(d, [(114, 246), (120, 246)])

    _label(d, 112, 200, "Z LEAD SCREW", "on the left only", anchor="end")
    _leader(d, [(114, 200), (128, 200)])

    _label(d, 112, 82, "SPRINGS + KNOBS", "adjust here — Phase 2", anchor="end")
    _leader(d, [(114, 82), (156, 76)])

    _label(d, 336, 214, "ECCENTRIC NUTS", "behind the right wheels")
    _leader(d, [(330, 207), (300, 180)])

    _label(d, 336, 176, "GANTRY", "must be level — Phase 1")
    _leader(d, [(330, 169), (296, 172)])

    _label(d, 336, 138, "PRINT HEAD", "and nozzle")
    _leader(d, [(330, 131), (203, 144)])

    return d


def bed_order_figure(scale=1.0):
    """Top view: the order to adjust the four corners."""
    W, H = 300, 195
    d = Drawing(W * scale, H * scale)
    d.hAlign = "CENTER"
    ox = 78
    x0, y0, side = ox, 34, 118

    d.add(Rect(x0, y0, side, side, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=1.2))
    # glass inset
    d.add(Rect(x0 + 7, y0 + 7, side - 14, side - 14, fillColor=colors.HexColor("#fafafa"),
               strokeColor=FIG_MID, strokeWidth=0.6))

    corners = {
        1: (x0 + 12, y0 + 12),
        2: (x0 + 12, y0 + side - 12),
        3: (x0 + side - 12, y0 + side - 12),
        4: (x0 + side - 12, y0 + 12),
    }
    for n, (cx, cy) in corners.items():
        _badge(d, cx - 6, cy - 6, n, size=12)

    def arrow(x1, y1, x2, y2):
        d.add(Line(x1, y1, x2, y2, strokeColor=FIG_BLACK, strokeWidth=0.9))
        if x1 == x2:
            dy = 4 if y2 > y1 else -4
            d.add(Polygon(points=[x2, y2, x2 - 3, y2 - dy, x2 + 3, y2 - dy],
                          fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
        else:
            dx = 4 if x2 > x1 else -4
            d.add(Polygon(points=[x2, y2, x2 - dx, y2 - 3, x2 - dx, y2 + 3],
                          fillColor=FIG_BLACK, strokeColor=FIG_BLACK))

    arrow(x0 + 12, y0 + 22, x0 + 12, y0 + side - 24)
    arrow(x0 + 22, y0 + side - 12, x0 + side - 24, y0 + side - 12)
    arrow(x0 + side - 12, y0 + side - 22, x0 + side - 12, y0 + 22)

    d.add(String(ox + side / 2, y0 - 14, "FRONT OF THE PRINTER", fontName="DJ-B",
                 fontSize=7, fillColor=FIG_BLACK, textAnchor="middle"))

    for seg, sub in (("1 — FRONT LEFT", "then 2, 3, 4 clockwise"),
                     ("REPEAT THE WHOLE PASS", "the first pass always moves the others")):
        pass

    r1 = ox + side + 14
    for i, (a, b) in enumerate([("1 → 2 → 3 → 4", "clockwise, starting front-left"),
                                ("Pass 1", "rough the corners in"),
                                ("Pass 2", "recheck all four — this is the real one")]):
        d.add(String(r1, 132 - i * 34, a, fontName="DJ-B", fontSize=7.6, fillColor=FIG_BLACK))
        d.add(String(r1, 123 - i * 34, b, fontName="DJ", fontSize=6.8, fillColor=GREY))

    if scale != 1.0:
        d.scale(scale, scale)
        d.width, d.height = W * scale, H * scale
    return d


def fig_caption(text):
    return Paragraph(text, ParagraphStyle("cap", fontName="DJ", fontSize=7.6, leading=10,
                                          textColor=GREY, alignment=TA_CENTER,
                                          spaceBefore=3, spaceAfter=2))

# ---------------------------------------------------------------- page furniture
def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BLACK)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    x = MARGIN_L
    y = PAGE_H - 1.9 * inch

    canvas.setFillColor(colors.white)
    canvas.setFont("DJ-B", 9)
    canvas.drawString(x, y, "FIX LOG  /  ENTRY 001")

    canvas.setFont("DJ-B", 40)
    canvas.drawString(x, y - 0.62 * inch, "FIXING YOUR")
    canvas.drawString(x, y - 1.12 * inch, "ENDER 3 V2")

    canvas.setStrokeColor(colors.white)
    canvas.setLineWidth(2)
    canvas.line(x, y - 1.42 * inch, x + 1.2 * inch, y - 1.42 * inch)

    canvas.setFillColor(colors.HexColor("#c8c8c8"))
    canvas.setFont("DJ", 12.5)
    body = [
        "An instruction manual for humans.",
        "One action per step. Follow it in order.",
    ]
    for i, line in enumerate(body):
        canvas.drawString(x, y - 1.75 * inch - i * 0.25 * inch, line)

    # contents block
    cy = y - 2.85 * inch
    canvas.setFillColor(colors.HexColor("#8a8a8a"))
    canvas.setFont("DJ-B", 8)
    canvas.drawString(x, cy, "INSIDE")

    items = [
        ("PHASE 1", "Is the printer crooked?", "10 min · free · do this first"),
        ("PHASE 2", "Level the bed", "15 min · the part everyone does badly"),
        ("PHASE 3", "Fix the extrusion", "15 min · name the symptom first"),
        ("PHASE 4", "If it was moisture", "4–6 hrs of waiting"),
        ("PHASE 5", "If 1 and 2 failed", "the buy-a-part stage"),
    ]
    ry = cy - 0.34 * inch
    for num, title, sub in items:
        canvas.setFillColor(colors.white)
        canvas.setFont("DJ-B", 8)
        canvas.drawString(x, ry, num)
        canvas.setFillColor(colors.white)
        canvas.setFont("DJ-B", 11)
        canvas.drawString(x + 0.95 * inch, ry, title)
        canvas.setFillColor(colors.HexColor("#8a8a8a"))
        canvas.setFont("DJ", 9)
        canvas.drawString(x + 3.35 * inch, ry, sub)
        ry -= 0.28 * inch

    canvas.setStrokeColor(colors.HexColor("#3a3a3a"))
    canvas.setLineWidth(0.7)
    canvas.line(x, 1.5 * inch, PAGE_W - MARGIN_R, 1.5 * inch)

    canvas.setFillColor(colors.HexColor("#8a8a8a"))
    canvas.setFont("DJ", 8.5)
    canvas.drawString(x, 1.2 * inch, "Northstar Fix Log  ·  Compiled 2026-11-04")
    canvas.drawRightString(PAGE_W - MARGIN_R, 1.2 * inch,
                           "Print single-sided · write in the blanks")

    canvas.restoreState()


def on_page(canvas, doc):
    canvas.saveState()
    # running header
    canvas.setStrokeColor(LGREY)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN_L, PAGE_H - 0.62 * inch, PAGE_W - MARGIN_R, PAGE_H - 0.62 * inch)
    canvas.setFillColor(GREY)
    canvas.setFont("DJ", 7.5)
    canvas.drawString(MARGIN_L, PAGE_H - 0.55 * inch, "FIXING YOUR ENDER 3 V2")
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 0.55 * inch,
                           "FIX LOG / ENTRY 001")
    # footer
    canvas.setFillColor(GREY)
    canvas.setFont("DJ", 7.5)
    canvas.drawString(MARGIN_L, 0.5 * inch, "Northstar Fix Log")
    canvas.drawRightString(PAGE_W - MARGIN_R, 0.5 * inch, str(doc.page))
    canvas.restoreState()


def phase_header(num, title, sub):
    """Black full-width band."""
    inner = [
        Paragraph(num, st_phase_num),
        Spacer(1, 3),
        Paragraph(title, st_phase_title),
        Spacer(1, 3),
        Paragraph(sub, st_phase_sub),
    ]
    t = Table([[inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLACK),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 13),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ]))
    return t


# ---------------------------------------------------------------- content
F = []  # flowables

def add(x):
    if isinstance(x, (list, tuple)):
        F.extend(x)
    else:
        F.append(x)

def P(txt, style=st_body):
    F.append(Paragraph(inline(txt), style))

def gap(h=8):
    F.append(Spacer(1, h))

def step(num, txt):
    add(step_box(num, txt))

def write(label):
    F.append(write_line(label))
    F.append(Spacer(1, 7))

def bullets(items, style=st_check, box=True):
    for it in items:
        mark = "☐  " if box else "•  "
        F.append(Paragraph(mark + inline(it), style))
    gap(8)


# ================================================================ COVER
F.append(NextPageTemplate("body"))
F.append(PageBreak())

# ================================================================ BEFORE YOU START
P("BEFORE YOU START")
gap(2)
add(rule(BLACK, 1.4, 0, 12))

start_left = [
    Paragraph("<b>TIME</b>", st_h3),
    Paragraph("About 45 minutes.", st_body_tight),
    Spacer(1, 6),
    Paragraph("<b>DIFFICULTY</b>", st_h3),
    Paragraph("Moderate. Nothing here is hard. The order is what matters.", st_body_tight),
]
start_right = [
    Paragraph("<b>TOOLS</b>", st_h3),
    Paragraph("☐  Ruler or tape measure", st_check),
    Paragraph("☐  Two identical objects — two mugs, two cans, two blocks", st_check),
    Paragraph("☐  One sheet of ordinary printer paper", st_check),
    Paragraph("☐  The hex key and wrench that came with the printer", st_check),
    Paragraph("☐  A marker or pen", st_check),
    Paragraph("☐  Phone (for photos)", st_check),
]
t = Table([[start_left, start_right]], colWidths=[CONTENT_W * 0.34, CONTENT_W * 0.66])
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (0, 0), 18),
    ("RIGHTPADDING", (1, 0), (1, 0), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
]))
add(t)
gap(14)

P("FOUR RULES")
gap(2)
add(rule(BLACK, 1.4, 0, 10))
rules = [
    ("Do the phases in order.", "Phase 2 is impossible if Phase 1 is wrong."),
    ("One change at a time.", "Change two things and you won't know which one worked."),
    ("Write the number down before you change it.", "Every time."),
    ("When a step says STOP, stop.", "That's where the money gets wasted."),
]
rows = []
for i, (h, s) in enumerate(rules, 1):
    rows.append([
        Paragraph(str(i), st_tbl_b),
        Paragraph("<b>%s</b> %s" % (inline(h), inline(s)), st_body),
    ])
t = Table(rows, colWidths=[0.3 * inch, CONTENT_W - 0.3 * inch])
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LGREY),
]))
add(t)
gap(12)

add(callout("This is a real fix, so log it",
            "When you finish, fill in the last page. What was actually wrong, what fixed it, "
            "and what you tried that didn't work. Then photograph the first good print. "
            "That's the proof — and it's worth as much as the repair."))

F.append(Spacer(1, 14))
add(schematic())
add(fig_caption("Front view, schematic, not to scale. Dashed lines &#9312; and &#9313; are the "
                "measurements in steps 1.4 and 1.5."))

# ================================================================ PHASE 1
F.append(PageBreak())
add(phase_header("PHASE 1", "Is the printer crooked?", "10 minutes · free · do this first"))
gap(10)

P("If the arm that holds the nozzle is tilted, one side of the bed will never be reachable. "
  "You'd be adjusting the bed against a crooked ruler. This is the most common reason a bed "
  "&quot;can't be leveled&quot; — and it costs nothing to check.")

gap(6)

step("1.1", "Turn the printer **off**. Wait 5 seconds.")
step("1.2", "Turn it back on. On the screen: **Prepare → Disable steppers.** The motors now let you move things by hand.")
step("1.3", "Stand facing the printer. Notice the **horizontal bar** across the top that the nozzle hangs from. That's the gantry. You're checking that it's level.")
step("1.4", "Hold the ruler upright against the **left** vertical post. Measure from the **base** up to the **bottom edge of the gantry bar**.")
write("LEFT  =                    mm")
step("1.5", "Do the exact same thing on the **right** side.")
write("RIGHT  =                    mm")
step("1.6", "Compare the two numbers.")

gap(4)
add(decision_box([
    "**If LEFT and RIGHT are within 1 mm of each other:**",
    "✓ Your gantry is fine. **Skip to Phase 2.**",
    "---",
    "**If they differ by more than 1 mm:**",
    "✗ Your gantry is tilted. That is the actual cause of your bed problem. **Continue to step 1.7.**",
]))

step("1.7", "Find the **two eccentric nuts** on the right side of the gantry — the odd nuts behind the wheels that ride the right post. They have a flat side and turn with the wrench to loosen or tighten the wheel grip.")
step("1.8", "Loosen both eccentric nuts a **quarter turn**. The right side of the gantry should now move slightly.")
step("1.9", "Grip the **right end** of the gantry bar with one hand and move it **up or down** until the right measurement matches the left.")
add(callout("gravity does this", "Whichever side is lower is the one that sagged. It isn't your fault and it isn't damage.", "note"))
step("1.10", "Hold it in place. Tighten both eccentric nuts until the wheels grip firmly — the gantry shouldn't wobble, but the wheels should still turn.")
step("1.11", "Measure left and right again.")

add(decision_box([
    "**Within 1 mm?**  ✓ Phase 1 complete — go to Phase 2.",
    "---",
    "**No?** Repeat 1.8–1.11 once. Still no? Stop and photograph the wheel assembly — something else is bent. See Phase 5.",
]))

# ================================================================ PHASE 2
add(Spacer(1, 24))
add(phase_header("PHASE 2", "Level the bed", "15 minutes · the part everyone does badly"))
gap(10)

P("Most people adjust one corner, then the opposite corner, and undo their own work. "
  "Use this order and **do the whole sequence twice**. The first pass always throws the others off. "
  "That's normal, not a mistake.")


step("2.1", "Turn the four knobs under the bed until the springs are about **half squashed** — roughly 10 mm of spring showing. Do all four by eye. Don't level yet.")
step("2.2", "On the screen: **Prepare → Auto Home.** Wait for it to finish.")
step("2.3", "**Prepare → Disable steppers** again.")
step("2.4", "Slide the print head by hand so the nozzle sits over the **front-left** corner, about 2 cm in from the edge.")
step("2.5", "Slide the paper under the nozzle.")
step("2.6", "Turn the knob under that corner **slowly** until the paper slides out with a **slight drag** — like a fingernail on a table. Not gripped, not loose.")
step("2.7", "Move to the **back-left** corner. Repeat 2.5 and 2.6.")
step("2.8", "Move to the **back-right** corner.")
step("2.9", "Move to the **front-right** corner.")
step("2.10", "**SECOND PASS — now do 2.4 through 2.9 again.** The first pass always throws the others off. This is normal, not a mistake.")

add(decision_box([
    "**All four corners drag the paper, and no knob is loose or wobbly:**",
    "✓ Bed is level. **Go to Phase 3.**",
    "---",
    "**One knob has to be so loose it's falling off — or is already loose:**",
    "✗ **STOP.** Do not keep turning. That is your original complaint, and it means one of the following is true.",
]))

add(data_table([
    ["Check", "How", "Fix"],
    ["Screw head not seated", "Look at the top of the bed. All four heads sunk flat?", "Push it down; check it's the same length as the rest"],
    ["Spring missing or wrong", "All four springs the same length?", "Match them, or replace all four"],
    ["Knob threads stripped", "Does the loose knob spin without gripping?", "Replace the knob"],
    ["Bed plate warped", "Straightedge across the bed, corner to corner", "Silicone spacers, or an ABL probe"],
    ["Y carriage bent", "Remove the bed; straightedge across the plate underneath", "Replace the carriage plate"],
], widths=[24, 40, 36], first_bold=True))

add(callout("check phase 1 again before blaming a bent part",
            "A tilted gantry mimics a bent carriage almost perfectly, and it's free to fix. "
            "Most people buy parts for a problem that was alignment all along."))

F.append(PageBreak())
F.append(KeepTogether([
    Paragraph("KEEP THIS BY THE PRINTER", st_h2),
    rule(BLACK, 1.4, 0, 8)[0],
    Spacer(1, 14),
    Paragraph("The paper test, and what it's telling you", st_body_tight),
    Spacer(1, 6),
    bed_order_figure(scale=1.25),
    Spacer(1, 10),
]))
add(data_table([
    ["Paper does this", "Means", "Turn the knob"],
    ["Slides out with a slight drag", "Correct", "Nothing — move to the next corner"],
    ["Slides out with no contact at all", "Nozzle too high", "Tighten the spring (raise the bed)"],
    ["Paper is pinned, can't move", "Nozzle too low", "Loosen the spring (lower the bed)"],
    ["Right at one corner, wrong at the opposite one", "Gantry tilt", "Back to Phase 1 — don't touch the knobs"],
    ["Perfect, then wrong again ten minutes later", "Weak springs or a stripped knob", "Phase 5 — silicone spacers"],
], widths=[38, 34, 28], first_bold=True))

P("Chasing a perfect paper feel on pass five is how people spend an hour and end up worse than pass "
  "two. If it's even and it drags, print the first-layer test. The print tells the truth; the paper "
  "is only a rough guide.", st_small)

# ================================================================ PHASE 3
F.append(PageBreak())
add(phase_header("PHASE 3", "Fix the extrusion", "15 minutes · name the symptom first"))
gap(10)

P("Nobody can fix &quot;extrusion problems.&quot; You have to name the symptom before you can fix it. "
  "One test splits it in two.")

gap(6)

step("3.1", "Load a **brand-new, unopened** spool of filament.")
step("3.2", "Print a small test cube or a benchy.")
step("3.3", "Look at the result.")

add(decision_box([
    "**It prints clean now**  →  it was **moisture**. Go to **Phase 4**, then come back and finish.",
    "---",
    "**It still prints badly**  →  it's **mechanical**. Moisture was a red herring. **Continue to step 3.4.**",
]))

step("3.4", "Look at the nozzle. Is plastic oozing from around the **outside** of it, or curling out sideways instead of straight down? If yes, the tube isn't sealed against the nozzle — do 3.5 to 3.8.")
step("3.5", "Heat the nozzle to printing temperature: **Prepare → Preheat → PLA**.")
step("3.6", "Loosen the fitting that holds the white tube, by **half a turn**.")
step("3.7", "Push the tube **firmly down** so it presses flat against the back of the nozzle. Hold it there.")
step("3.8", "Tighten the fitting back up while still pushing down. Done.")

gap(4)
P("**Still bad? Do a cold pull.**", st_h2)
gap(2)

cold = [
    "Heat to 200 °C",
    "Push filament through by hand until it extrudes",
    "Set the temperature to 90 °C and wait",
    "Pull the filament out firmly, in one motion",
    "Look at the tip — it should have a clean point with the gunk stuck to it",
    "Cut that end off, reload, test print",
]
rows = [[Paragraph("%d" % i, st_tbl_b), Paragraph(inline(x), st_body)]
        for i, x in enumerate(cold, 1)]
t = Table(rows, colWidths=[0.3 * inch, CONTENT_W - 0.3 * inch])
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LGREY),
]))
add(t)
gap(4)
P("Repeat twice if the first pull comes out black.", st_small)
gap(10)

step("3.9", "Still bad? **Check the extruder arm** — the plastic lever on the motor that grips the filament. Remove it and look at the **underside** for a hairline crack. It cracks where you can't see it, and it fails exactly like a clog.")
P("If it's cracked, replace it with a metal one (about $15). That's a real upgrade, not a waste.", st_body)
step("3.10", "Still bad? Check the brass gear on the motor for flattened or shiny worn teeth. Replace if worn.")

# ================================================================ PHASE 4
add(Spacer(1, 26))
add(phase_header("PHASE 4", "If it was moisture", "4–6 hours of waiting · 5 minutes of work"))
gap(10)

step("4.1", "Put the spool in a food dehydrator or a filament dryer.")
step("4.2", "Set it to **40–45 °C.**")

add(callout("do not go above 50 °c",
            "PLA starts going soft around 60 °C. A dehydrator set to &quot;jerky&quot; will warp the spool "
            "and ruin the filament. Low and slow.", "warn"))

step("4.3", "Leave it **4 to 6 hours**.")
step("4.4", "Move it straight into a sealed container with desiccant packets. It reabsorbs moisture within hours if left out.")
step("4.5", "Add a cheap hygrometer inside the container. Under 20% is good.")

gap(6)
add(callout("desiccant does not dry filament",
            "It only keeps dried filament dry. You need heat <i>and</i> a sealed box. "
            "Skip the heat and nothing improves; skip the box and it comes back by the weekend."))

# ================================================================ PHASE 5
add(PageBreak())
add(phase_header("PHASE 5", "If phases 1 and 2 failed", "The buy-a-part stage. Only now."))
gap(10)

step("5.1", "Re-check Phase 1. Be honest about the measurement.")
step("5.2", "Remove the bed. Lay a straightedge across the metal plate underneath, in both directions. Bent means replace.")
step("5.3", "Lay the straightedge across the bed plate itself, corner to corner. A dish in the **middle** is normal. A raised or sunken **corner** is a warp.")
step("5.4", "Order accordingly:")

add(data_table([
    ["Part", "~Price", "Fixes"],
    ["Silicone bed spacers + nyloc nuts", "$10–15", "Springs that hold tension; knobs that stop walking loose"],
    ["Metal extruder arm", "$15", "Cracks in the stock plastic arm"],
    ["Spare nozzles (pack)", "$5", "Clogs"],
    ["Bed carriage plate", "$15", "Bent Y carriage"],
    ["ABL probe (CR Touch)", "$35", "A warped bed surface"],
], widths=[40, 16, 44], first_bold=True))

add(callout("an abl probe will not fix your problem",
            "It does <b>not</b> fix a tilted gantry and it does <b>not</b> fix a corner that can't hold tension. "
            "It only compensates for a warped surface. Buying one to solve a leveling problem is the most "
            "common way people waste $35 and three weekends.", "warn"))

add(Spacer(1, 22))
add(rule(BLACK, 1.4, 0, 10))
ladder = data_table([
    ["Spend", "Gets you", "Stop here if..."],
    ["**$0**", "Gantry level, bed leveled twice, tube seated, cold pull, new spool test", "It prints. Most machines are fixed at $0."],
    ["**$10–15**", "Silicone spacers + nyloc nuts", "The bed holds. It usually will."],
    ["**$15**", "Metal extruder arm", "Your plastic arm is cracked."],
    ["**$35**", "ABL probe", "You have confirmed a **warped surface** and nothing else."],
], widths=[14, 50, 36], first_bold=False)
F.append(KeepTogether([
    Paragraph("THE BUDGET LADDER — spend in this order", st_h3),
    Spacer(1, 4),
] + ladder))

add(Spacer(1, 14))
add(rule(BLACK, 1.4, 0, 10))
P("WHEN TO STOP AND TAKE IT SOMEWHERE", st_h3)
gap(4)
P("There is a point where continuing costs more than the machine. Knowing the number is what "
  "separates a repair from a project. These three symptoms mean it's not you:")
gap(2)
add(data_table([
    ["Symptom", "What it usually is", "Realistic call"],
    ["Z banding on every print, or layers shifting", "Bent Z screw, or a failing stepper driver", "Board-level — worth a shop, not a weekend"],
    ["Frame out of square even with the gantry level", "Dropped or over-tightened during assembly", "Difficult but fixable — loosen everything and square it"],
    ["Bed surface warped more than about 0.3 mm", "Trammed from the factory", "Glass or a new plate — not adjustable"],
], widths=[36, 36, 28], first_bold=True))
gap(6)
P("A shop bench fee runs $80–120, and a new Ender 3 V2 is $170–200. Once you're past the $35 rung, "
  "check that number before you spend a fourth weekend. Not every machine is worth saving — and "
  "saying so out loud is the same professional judgment you'd use on anyone else's printer.", st_small)

# ================================================================ FINAL CHECK
F.append(PageBreak())
P("FINAL CHECK")
gap(2)
add(rule(BLACK, 1.4, 0, 12))

P("Print something with a large flat first layer — a one-layer square test, or a benchy.")
gap(4)
P("**What a good first layer looks like:** a smooth, slightly squashed ribbon. Lines touching, "
  "no gaps, no ridges you can catch a fingernail on.")
gap(6)

add(data_table([
    ["Looks like", "Meaning", "Do this"],
    ["Gaps between the lines", "Nozzle too high", "Raise the bed slightly at that corner"],
    ["Rough, rippled, transparent", "Nozzle too low", "Lower the bed slightly"],
    ["Good at the front, bad at the back", "Bed isn't flat", "Phase 2, second pass"],
    ["Bad on one side only", "Gantry still tilted", "Phase 1"],
], widths=[36, 26, 38], first_bold=True))


add(Spacer(1, 18))
add(rule(BLACK, 1.4, 0, 10))
P("WHAT TO PHOTOGRAPH", st_h3)
gap(3)
P("The log entry is only worth what you can show. Four shots, taken with the phone you already have:",
  st_body_tight)
gap(4)
bullets([
    "The problem, before you touch it — the loose knob, the stringy print, the error on screen",
    "The part that turned out to be at fault, out of the machine and in your hand",
    "The fix, halfway through",
    "The first good print, straight on",
], box=True)
P("Four photos and five minutes of writing turn a fix you did for yourself into the first line of "
  "a work history.", st_small)

F.append(PageBreak())
P("WHEN YOU'RE DONE")
gap(2)
add(rule(BLACK, 1.4, 0, 12))

P("Write this down in the fix log. It takes five minutes and it's the part that turns a repair "
  "into proof that you can finish a difficult thing.")
gap(2)
P("Matching entry in the repository: fix-log/001-ender-3-v2-bed-and-extrusion.md", st_small)
gap(10)

log_fields = [
    ("What was actually wrong (root cause)", 1.05),
    ("What fixed it", 1.05),
    ("Time spent   /   parts cost   /   what I'd do differently", 0.62),
    ("What I tried that didn't work (dead ends)", 0.92),
]

add(callout("then photograph it",
            "The before, the after, the first good print. That's a fix with a documented cause and a "
            "documented result — worth as much as the repair itself, because it's the only proof that "
            "exists that you finish hard things."))

for label, h in log_fields:
    add(KeepTogether([
        Paragraph("<b>%s</b>" % label, st_body_tight),
        Spacer(1, 2),
        Table([[""]], colWidths=[CONTENT_W], rowHeights=[h * inch - 0.22],
              style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.8, INK),
                                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                ("TOPPADDING", (0, 0), (-1, -1), 0),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])),
        Spacer(1, 6),
    ]))

# ================================================================ QUICK REF
F.append(PageBreak())
P("QUICK REFERENCE")
gap(2)
add(rule(BLACK, 1.4, 0, 12))

P("START HERE IF YOU DON'T KNOW WHY", st_h3)
gap(4)
add(data_table([
    ["Symptom you reported", "What it means", "Phase"],
    ["Bed won't level; one screw has to be so loose it falls off", "That corner is maxed out — alignment, not adjustment", "1, then 2"],
    ["Bed won't stay level after adjusting", "Weak stock springs, or a stripped knob", "5"],
    ["Extrusion problems, suspected humidity", "Moisture — or five mechanical causes that look identical", "3, then 4"],
    ["Looks fine, prints badly", "Bed surface warp, or gantry tilt", "1, then 5"],
], widths=[40, 42, 18], first_bold=True))

gap(8)
P("BY SYMPTOM", st_h3)
gap(4)
add(data_table([
    ["Situation", "Go to"],
    ["Bed won't level, one corner maxed out", "**Phase 1** — almost always the gantry"],
    ["Bed won't stay level", "Phase 5 — silicone spacers"],
    ["Under-extruding, clicking, gaps", "Phase 3"],
    ["Popping, crackling, rough surface", "Phase 4 — moisture"],
    ["Poor layer quality, one side worse", "Phase 1"],
    ["Tried everything", "Phase 5"],
    ["Don't know", "Step 3.1 — a new spool splits it in two"],
], widths=[52, 48]))

gap(14)
add(rule(LGREY, 0.6, 0, 10))
P("Northstar Fix Log · Entry 001 · Ender 3 V2", st_center_small)
gap(3)
P("Source: fix-log/manuals/ender-3-v2-manual.md", st_center_small)

# ---------------------------------------------------------------- build
doc = BaseDocTemplate(
    OUT,
    pagesize=letter,
    leftMargin=MARGIN_L,
    rightMargin=MARGIN_R,
    topMargin=MARGIN_T,
    bottomMargin=MARGIN_B,
    title="Fixing Your Ender 3 V2 — An Instruction Manual for Humans",
    author="Northstar Fix Log",
    subject="Entry 001: bed leveling, crooked gantry, and extrusion problems",
    creator="Northstar Fix Log build_pdf.py",
)

cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover")  # unused; cover drawn on canvas
body_frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W, PAGE_H - MARGIN_T - MARGIN_B, id="body")

doc.addPageTemplates([
    PageTemplate(id="cover", frames=[Frame(0, 0, 1, 1, id="blank")], onPage=on_cover),
    PageTemplate(id="body", frames=[body_frame], onPage=on_page),
])

doc.build(F)

# ---------------------------------------------------------------- verify
from pypdf import PdfReader

r = PdfReader(OUT)
print("pages:", len(r.pages))
print("size:", os.path.getsize(OUT), "bytes")
for i, p in enumerate(r.pages):
    txt = (p.extract_text() or "").replace("\n", " ")
    print("p%d: %s" % (i + 1, txt[:110].strip()))
