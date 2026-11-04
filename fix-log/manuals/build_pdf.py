#!/usr/bin/env python3
"""
Build a print-ready PDF instruction manual from the markdown source.

Usage:
    .venv/bin/python fix-log/manuals/build_pdf.py

Output:
    fix-log/manuals/ender-3-v2-manual.pdf

Requires: reportlab, pypdf, pymupdf (see fix-log/manuals/requirements.txt)
"""

import os
import re

from reportlab.graphics.shapes import Circle, Drawing, Ellipse, Line, Polygon, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
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
OUT = os.path.join(HERE, "ender-3-v2-manual.pdf")

# ---------------------------------------------------------------- fonts
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DJ", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DJ-B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("DJ-M", os.path.join(FONT_DIR, "DejaVuSansMono.ttf")))
pdfmetrics.registerFontFamily("DJ", normal="DJ", bold="DJ-B", italic="DJ", boldItalic="DJ-B")

# ---------------------------------------------------------------- palette
BLACK = colors.black
INK = colors.HexColor("#141414")
GREY = colors.HexColor("#6b6b6b")
LGREY = colors.HexColor("#d6d6d6")
HAIR = colors.HexColor("#e8e8e8")
FILL = colors.HexColor("#f4f4f4")
DIM = colors.HexColor("#8a8a8a")
GHOST = colors.HexColor("#dcdcdc")
GHOSTER = colors.HexColor("#efefef")

PAGE_W, PAGE_H = letter
MARGIN_L = MARGIN_R = 0.85 * inch
MARGIN_T = 1.05 * inch
MARGIN_B = 0.85 * inch
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

PAGES = {}  # page number -> phase label, filled by the doc template
RENDER_STATE = {"label": ""}


# ---------------------------------------------------------------- styles
def S(name, **kw):
    base = dict(name=name, fontName="DJ", fontSize=10, leading=14.5,
                textColor=INK, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(**base)


st_body = S("body", spaceAfter=7)
st_body_tight = S("bodyt", spaceAfter=3)
st_h1 = S("h1", fontName="DJ-B", fontSize=24, leading=26, spaceAfter=2)
st_h2 = S("h2", fontName="DJ-B", fontSize=15, leading=19, spaceAfter=4)
st_h3 = S("h3", fontName="DJ-B", fontSize=10.5, leading=14, spaceAfter=3)
st_micro = S("micro", fontName="DJ-B", fontSize=8, leading=11, textColor=DIM)
st_phase_num = S("pnum", fontName="DJ-B", fontSize=11, leading=13,
                 textColor=colors.white, spaceAfter=0)
st_phase_title = S("ptitle", fontName="DJ-B", fontSize=21, leading=24,
                   textColor=colors.white, spaceAfter=0)
st_phase_sub = S("psub", fontSize=9.5, leading=13,
                 textColor=colors.HexColor("#bdbdbd"), spaceAfter=0)
st_step_num = S("snum", fontName="DJ-B", fontSize=8.5, leading=11,
                textColor=colors.white)
st_step = S("step", fontSize=10.5, leading=15)
st_write = S("write", fontName="DJ-B", fontSize=9.5, leading=14, textColor=INK)
st_note = S("note", fontSize=9, leading=13)
st_warn = S("warn", fontName="DJ-B", fontSize=9.5, leading=13.5)
st_check = S("check", fontSize=10, leading=15)
st_small = S("small", fontSize=8.5, leading=12, textColor=GREY)
st_center_small = S("cs", fontSize=8.5, leading=12, textColor=GREY, alignment=TA_CENTER)
st_tbl_h = S("tblh", fontName="DJ-B", fontSize=8.5, leading=11.5, textColor=colors.white)
st_tbl = S("tbl", fontSize=8.5, leading=11.5)
st_tbl_b = S("tblb", fontName="DJ-B", fontSize=8.5, leading=11.5)
st_figcap = S("cap", fontSize=7.6, leading=10, textColor=GREY)


# ---------------------------------------------------------------- helpers
def inline(txt):
    """Convert a limited subset of markdown inline syntax to reportlab markup."""
    txt = txt.replace("&quot;", '"').replace("&amp;", "&")
    txt = txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    txt = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", txt)
    txt = re.sub(r"`(.+?)`", r'<font name="DJ-M" size="9">\1</font>', txt)
    txt = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", txt)
    txt = re.sub(r"&lt;i&gt;(.+?)&lt;/i&gt;", r"<b>\1</b>", txt)
    txt = txt.replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")
    return txt


def rule(color=LGREY, thickness=0.7, space_before=0, space_after=8):
    t = Table([[""]], colWidths=[CONTENT_W], rowHeights=[0.1])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, -1), thickness, color),
        ("TOPPADDING", (0, 0), (-1, -1), space_before),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [t, Spacer(1, space_after)]


def kicker(text, big_text=None):
    """Small bold rule + section heading, heavy and tight."""
    out = [Paragraph(text, st_h2), Spacer(1, 1)]
    out += rule(BLACK, 2.0, 0, 12)
    return out


class StepRow(Flowable):
    """A numbered step: oversized outlined numeral in the margin, text beside it.

    Drawn as a single flowable so it can never split across a page break, and so the
    numeral can be oversized without fighting table padding.
    """

    NUM_W = 0.46 * inch

    def __init__(self, num, text):
        super().__init__()
        self.num = str(num)
        self.para = Paragraph(inline(text), st_step)

    def wrap(self, avail_w, avail_h):
        self._w = avail_w
        self._pw = avail_w - self.NUM_W - 6
        _, self._ph = self.para.wrap(self._pw, avail_h)
        self._h = max(self._ph, 17) + 7
        return avail_w, self._h

    def draw(self):
        canvas = self.canv
        base = self._h - 7 - self._ph
        # numeral: big, bold, grey — a marker, not a badge
        canvas.setFillColor(DIM)
        canvas.setFont("DJ-B", 13.5)
        canvas.drawRightString(self.NUM_W - 2, base + self._ph - 12.4, self.num)
        # hairline under each step
        canvas.setStrokeColor(HAIR)
        canvas.setLineWidth(0.5)
        canvas.line(0, 1.2, self._w, 1.2)
        self.para.drawOn(canvas, self.NUM_W + 6, base)


def step(num, text):
    F.append(StepRow(num, text))


def write_line(label):
    """A ruled blank for the reader to write in."""
    t = Table([[Paragraph(inline(label), st_write)]],
              colWidths=[CONTENT_W], rowHeights=[0.36 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (0, 0), 0.9, INK),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#fbfbfb")),
    ]))
    return t


def callout(title, body, kind="note"):
    """Boxed note or warning."""
    if kind == "warn":
        bg, bar, head = FILL, BLACK, "▲  " + title.upper()
    elif kind == "stop":
        bg, bar, head = colors.HexColor("#f0f0f0"), BLACK, "■  " + title.upper()
    else:
        bg, bar, head = colors.HexColor("#fafafa"), colors.HexColor("#a8a8a8"), "■  " + title.upper()

    inner = [Paragraph(head, st_warn if kind != "note" else
                       S("nh", fontName="DJ-B", fontSize=8.5, leading=12, textColor=INK)),
             Spacer(1, 4), Paragraph(inline(body), st_note)]
    t = Table([[inner]], colWidths=[CONTENT_W - 0.1 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3.5, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return [Spacer(1, 4), t, Spacer(1, 11)]


def decision_box(lines, header="DECISION POINT"):
    """Inverted band header plus its contents."""
    head = Table([[Paragraph(header, S("dh", fontName="DJ-B", fontSize=8, leading=10,
                                       textColor=colors.white))]],
                 colWidths=[CONTENT_W], rowHeights=[0.235 * inch])
    head.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    rows = []
    for l in lines:
        if l == "---":
            rows.append([Spacer(1, 7)])
        else:
            rows.append([Paragraph(inline(l), st_body_tight)])
    inner = Table(rows, colWidths=[CONTENT_W - 2])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FILL),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (0, 0), 10),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ]))
    t = Table([[head], [inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [Spacer(1, 5), t, Spacer(1, 12)]


def data_table(rows, widths=None, header=True, first_bold=False):
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
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIR),
        ("LINEBELOW", (0, -1), (-1, -1), 1.0, INK),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), BLACK),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ]
    t.setStyle(TableStyle(style))
    return [t, Spacer(1, 12)]


# ---------------------------------------------------------------- figures
FIG_BLACK = INK
FIG_FILL = colors.HexColor("#e9e9e9")
FIG_MID = colors.HexColor("#c4c4c4")
FIG_GHOST = colors.HexColor("#dedede")


def _label(d, x, y, text, sub=None, anchor="start", size=7.8):
    d.add(String(x, y + 4, text, fontName="DJ-B", fontSize=size, fillColor=FIG_BLACK,
                 textAnchor=anchor))
    if sub:
        d.add(String(x, y - 5.4, sub, fontName="DJ", fontSize=6.8, fillColor=GREY,
                     textAnchor=anchor))


def _leader(d, pts, width=0.5):
    d.add(PolyLine(pts, strokeColor=colors.HexColor("#9e9e9e"), strokeWidth=width))
    x, y = pts[-1]
    d.add(Circle(x, y, 1.7, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))


def schematic():
    """Front view of the Ender 3 V2, schematic, with the parts that matter."""
    BASE_W, BASE_H, SCALE = 460, 272, 0.78
    d = Drawing(BASE_W * SCALE, BASE_H * SCALE)
    d.hAlign = "CENTER"
    d.scale(SCALE, SCALE)

    # frame
    d.add(Rect(120, 12, 190, 18, fillColor=FIG_FILL, strokeColor=FIG_BLACK, strokeWidth=1.2))
    d.add(Rect(120, 30, 15, 230, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=1.2))
    d.add(Rect(295, 30, 15, 230, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=1.2))
    d.add(Rect(120, 242, 190, 16, fillColor=FIG_FILL, strokeColor=FIG_BLACK, strokeWidth=1.2))

    # z lead screw
    d.add(Rect(125, 54, 5, 188, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.7))
    for yy in range(58, 240, 7):
        d.add(Line(125, yy, 130, yy + 3, strokeColor=FIG_MID, strokeWidth=0.4))
    d.add(Rect(123, 46, 9, 8, fillColor=FIG_MID, strokeColor=FIG_BLACK, strokeWidth=0.8))

    # gantry
    d.add(Rect(135, 172, 160, 11, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
    d.add(Rect(291, 167, 7, 19, fillColor=FIG_MID, strokeColor=FIG_BLACK, strokeWidth=0.9))
    d.add(Circle(294.5, 176.5, 2.4, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.6))

    # print head + nozzle
    d.add(Rect(176, 150, 26, 20, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.9))
    d.add(Polygon(points=[182, 150, 196, 150, 189, 140],
                  fillColor=FIG_BLACK, strokeColor=FIG_BLACK))

    # bed assembly
    d.add(Rect(150, 98, 120, 6, fillColor=FIG_FILL, strokeColor=FIG_BLACK, strokeWidth=1.0))
    d.add(Rect(150, 104, 120, 2.2, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.6))
    for sx in (162, 258):
        zig, y, i = [], 84, 0
        while y <= 98:
            zig.append((sx + (3.5 if i % 2 else -3.5), y))
            y += 3.2
            i += 1
        d.add(PolyLine(zig, strokeColor=FIG_BLACK, strokeWidth=0.8))
        d.add(Rect(sx - 4.5, 75, 9, 9, fillColor=FIG_MID, strokeColor=FIG_BLACK, strokeWidth=0.8))
        d.add(Line(sx, 98, sx, 84, strokeColor=FIG_MID, strokeWidth=0.4))
    d.add(Rect(150, 72, 120, 3, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=0.8))

    # measurement lines
    for mx, n in ((108, "1"), (322, "2")):
        d.add(Line(mx, 30, mx, 242, strokeColor=colors.HexColor("#adadad"),
                   strokeWidth=0.6, strokeDashArray=[2, 2.5]))
        for yy in (30, 242):
            d.add(Line(mx - 3.5, yy, mx + 3.5, yy, strokeColor=colors.HexColor("#adadad"),
                       strokeWidth=0.8))
        d.add(Rect(mx - 5.5, 132, 11, 11, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
        d.add(String(mx, 135.2, n, fontName="DJ-B", fontSize=6.5, fillColor=colors.white,
                     textAnchor="middle"))

    # labels
    _label(d, 112, 250, "FRAME", "top extrusion", anchor="end")
    _leader(d, [(114, 250), (120, 250)])

    _label(d, 112, 204, "Z LEAD SCREW", "on the left only", anchor="end")
    _leader(d, [(114, 204), (128, 204)])

    _label(d, 112, 86, "SPRINGS + KNOBS", "adjust here — Phase 2", anchor="end")
    _leader(d, [(114, 86), (156, 78)])

    _label(d, 336, 218, "ECCENTRIC NUTS", "behind the right wheels")
    _leader(d, [(330, 211), (297, 180)])

    _label(d, 336, 178, "GANTRY", "must be level — Phase 1")
    _leader(d, [(330, 171), (296, 176)])

    _label(d, 336, 140, "PRINT HEAD", "and nozzle")
    _leader(d, [(330, 133), (203, 158)])

    return d


def bed_order_figure(scale=1.0):
    """Top view: the order to adjust the four corners."""
    W, H = 296, 196
    d = Drawing(W * scale, H * scale)

    x0, y0, side = 74, 32, 120
    d.add(Rect(x0, y0, side, side, fillColor=colors.white, strokeColor=FIG_BLACK, strokeWidth=1.3))
    d.add(Rect(x0 + 8, y0 + 8, side - 16, side - 16, fillColor=colors.HexColor("#fafafa"),
               strokeColor=FIG_GHOST, strokeWidth=0.7))
    # faint first-layer hatch
    for i in range(1, 6):
        d.add(Line(x0 + 8 + i * (side - 16) / 6, y0 + 8, x0 + 8 + i * (side - 16) / 6,
                   y0 + side - 8, strokeColor=colors.HexColor("#f2f2f2"), strokeWidth=0.5))

    corners = {1: (x0 + 13, y0 + 13), 2: (x0 + 13, y0 + side - 13),
               3: (x0 + side - 13, y0 + side - 13), 4: (x0 + side - 13, y0 + 13)}
    for n, (cx, cy) in corners.items():
        d.add(Circle(cx, cy, 7.6, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
        d.add(String(cx, cy - 2.9, str(n), fontName="DJ-B", fontSize=8.2,
                     fillColor=colors.white, textAnchor="middle"))

    def arrow(x1, y1, x2, y2):
        d.add(Line(x1, y1, x2, y2, strokeColor=FIG_BLACK, strokeWidth=1.0))
        if x1 == x2:
            dy = 5 if y2 > y1 else -5
            d.add(Polygon(points=[x2, y2, x2 - 3.2, y2 - dy, x2 + 3.2, y2 - dy],
                          fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
        else:
            dx = 5 if x2 > x1 else -5
            d.add(Polygon(points=[x2, y2, x2 - dx, y2 - 3.2, x2 - dx, y2 + 3.2],
                          fillColor=FIG_BLACK, strokeColor=FIG_BLACK))

    arrow(x0 + 13, y0 + 23, x0 + 13, y0 + side - 25)
    arrow(x0 + 23, y0 + side - 13, x0 + side - 25, y0 + side - 13)
    arrow(x0 + side - 13, y0 + side - 23, x0 + side - 13, y0 + 23)

    d.add(String(x0 + side / 2, y0 - 13, "FRONT OF THE PRINTER", fontName="DJ-B",
                 fontSize=7.2, fillColor=FIG_BLACK, textAnchor="middle"))

    r1 = x0 + side + 22
    rows = [("1 → 2 → 3 → 4", "clockwise from front-left"),
            ("PASS 1", "rough the corners in"),
            ("PASS 2", "recheck all four — this is the real one")]
    for i, (a, b) in enumerate(rows):
        yy = 128 - i * 34
        d.add(String(r1, yy, a, fontName="DJ-B", fontSize=7.8, fillColor=FIG_BLACK))
        d.add(String(r1, yy - 9, b, fontName="DJ", fontSize=6.8, fillColor=GREY))

    if scale != 1.0:
        d.scale(scale, scale)
        d.width, d.height = W * scale, H * scale
    return d



def first_layer_figure():
    """Three cross-sections: nozzle too high, correct, nozzle too low."""
    W, H = CONTENT_W, 132
    d = Drawing(W, H)
    d.hAlign = "CENTER"

    panel_w = W / 3.0
    labels = [("TOO HIGH", "gaps between the lines"),
              ("CORRECT", "squashed, lines touching"),
              ("TOO LOW", "ridged, rippled, see-through")]
    shapes = ["high", "good", "low"]

    for i, (mode, (head, sub)) in enumerate(zip(shapes, labels)):
        cx = panel_w * i + panel_w / 2
        left = panel_w * i + 14
        right = panel_w * (i + 1) - 14
        bed_y = 40

        # bed
        d.add(Rect(left, bed_y - 5, right - left, 5, fillColor=FIG_FILL,
                   strokeColor=FIG_BLACK, strokeWidth=0.9))

        # nozzle, sitting above the bed at the relevant height
        nz_gap = {"high": 26, "good": 12, "low": 5}[mode]
        nz_y = bed_y + nz_gap
        d.add(Polygon(points=[cx - 13, nz_y + 20, cx + 13, nz_y + 20, cx, nz_y],
                      fillColor=FIG_BLACK, strokeColor=FIG_BLACK))
        d.add(Rect(cx - 13, nz_y + 20, 26, 8, fillColor=FIG_BLACK, strokeColor=FIG_BLACK))

        # extruded lines in cross-section
        n = 7
        span = right - left - 6
        step = span / n
        for k in range(n):
            x = left + 3 + step * (k + 0.5)
            if mode == "high":
                r = step * 0.33
                d.add(Circle(x, bed_y + r + 3, r, fillColor=FIG_MID,
                             strokeColor=FIG_BLACK, strokeWidth=0.7))
            elif mode == "good":
                w, h = step * 0.62, 4.2
                d.add(Ellipse(x, bed_y + h, w, h, fillColor=FIG_MID,
                              strokeColor=FIG_BLACK, strokeWidth=0.7))
            else:
                w, h = step * 0.74, 2.6
                d.add(Ellipse(x, bed_y + h, w, h, fillColor=FIG_MID,
                              strokeColor=FIG_BLACK, strokeWidth=0.7))
                # ridge of plastic squeezed up and out by the nozzle
                d.add(Ellipse(x, bed_y + h * 2 + 1.4, w * 0.44, 1.9,
                              fillColor=FIG_MID, strokeColor=FIG_BLACK, strokeWidth=0.6))

        d.add(String(left, H - 12, "%d · %s" % (i + 1, head), fontName="DJ-B", fontSize=7.6,
                     fillColor=FIG_BLACK))
        d.add(String(left, H - 24, sub, fontName="DJ", fontSize=7, fillColor=GREY))

    # dividers
    for i in (1, 2):
        x = panel_w * i
        d.add(Line(x, 6, x, H - 34, strokeColor=HAIR, strokeWidth=0.7))

    return d


def fig_caption(text):
    return Paragraph(text, ParagraphStyle("cap2", fontName="DJ", fontSize=7.6, leading=10,
                                          textColor=GREY, alignment=TA_CENTER,
                                          spaceBefore=3, spaceAfter=1))


# ---------------------------------------------------------------- page furniture
def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BLACK)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    x = MARGIN_L
    top = PAGE_H - 1.55 * inch

    # top meta line
    canvas.setFillColor(DIM)
    canvas.setFont("DJ-B", 8)
    canvas.drawString(x, top, "FIX LOG  /  ENTRY 001")
    canvas.drawRightString(PAGE_W - MARGIN_R, top, "NORTHSTAR · 2026")

    # hairline under meta
    canvas.setStrokeColor(colors.HexColor("#3a3a3a"))
    canvas.setLineWidth(0.6)
    canvas.line(x, top - 10, PAGE_W - MARGIN_R, top - 10)

    # title
    t1 = top - 92
    canvas.setFillColor(colors.white)
    canvas.setFont("DJ-B", 52)
    canvas.drawString(x, t1, "FIXING YOUR")
    canvas.drawString(x, t1 - 56, "ENDER 3 V2")

    # title rule
    canvas.setLineWidth(4)
    canvas.line(x, t1 - 82, x + 1.5 * inch, t1 - 82)

    canvas.setFillColor(colors.HexColor("#c6c6c6"))
    canvas.setFont("DJ", 13)
    canvas.drawString(x, t1 - 112, "An instruction manual for humans.")
    canvas.setFont("DJ", 11.5)
    canvas.setFillColor(DIM)
    canvas.drawString(x, t1 - 134, "One action per step. Follow it in order.")

    # phase index
    cy = t1 - 192
    canvas.setFillColor(colors.HexColor("#6d6d6d"))
    canvas.setFont("DJ-B", 7.5)
    canvas.drawString(x, cy, "INSIDE")

    items = [
        ("PHASE 1", "Is the printer crooked?", "10 min · free · do this first"),
        ("PHASE 2", "Level the bed", "15 min · the part everyone does badly"),
        ("PHASE 3", "Fix the extrusion", "15 min · name the symptom first"),
        ("PHASE 4", "If it was moisture", "4–6 hrs of waiting"),
        ("PHASE 5", "If 1 and 2 failed", "the buy-a-part stage"),
    ]
    ry = cy - 26
    for num, title, sub in items:
        canvas.setFillColor(colors.HexColor("#8f8f8f"))
        canvas.setFont("DJ-B", 7.5)
        canvas.drawString(x, ry, num)
        canvas.setFillColor(colors.white)
        canvas.setFont("DJ-B", 12)
        canvas.drawString(x + 0.9 * inch, ry, title)
        canvas.setFillColor(colors.HexColor("#7d7d7d"))
        canvas.setFont("DJ", 8.5)
        canvas.drawRightString(PAGE_W - MARGIN_R, ry, sub)
        canvas.setStrokeColor(colors.HexColor("#262626"))
        canvas.setLineWidth(0.5)
        canvas.line(x, ry - 11, PAGE_W - MARGIN_R, ry - 11)
        ry -= 25

    # bottom
    canvas.setStrokeColor(colors.HexColor("#3a3a3a"))
    canvas.setLineWidth(0.7)
    canvas.line(x, 1.42 * inch, PAGE_W - MARGIN_R, 1.42 * inch)
    canvas.setFillColor(colors.HexColor("#7d7d7d"))
    canvas.setFont("DJ", 8.2)
    canvas.drawString(x, 1.14 * inch, "Northstar Fix Log  ·  compiled 2026-11-04")
    canvas.drawRightString(PAGE_W - MARGIN_R, 1.14 * inch,
                           "Print single-sided  ·  write in the blanks")
    canvas.restoreState()


def on_page(canvas, doc):
    canvas.saveState()
    label = PAGES.get(doc.page) or RENDER_STATE["label"] or ""
    # running head
    canvas.setFillColor(colors.HexColor("#9a9a9a"))
    canvas.setFont("DJ-B", 7.2)
    canvas.drawString(MARGIN_L, PAGE_H - 0.66 * inch, "FIXING YOUR ENDER 3 V2")
    if label:
        canvas.setFillColor(colors.HexColor("#8a8a8a"))
        canvas.setFont("DJ", 7.2)
        canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 0.66 * inch, label)
    canvas.setStrokeColor(HAIR)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN_L, PAGE_H - 0.72 * inch, PAGE_W - MARGIN_R, PAGE_H - 0.72 * inch)
    # footer
    canvas.setStrokeColor(HAIR)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN_L, 0.62 * inch, PAGE_W - MARGIN_R, 0.62 * inch)
    canvas.setFillColor(colors.HexColor("#9a9a9a"))
    canvas.setFont("DJ", 7.2)
    canvas.drawString(MARGIN_L, 0.45 * inch, "Northstar Fix Log / Entry 001")
    canvas.drawRightString(PAGE_W - MARGIN_R, 0.45 * inch, "%02d" % doc.page)
    canvas.restoreState()


class PhaseBanner(Flowable):
    """Full-width black band with a ghosted numeral, kicker, title and subtitle."""

    H = 1.02 * inch

    def __init__(self, num, title, sub, width=CONTENT_W):
        super().__init__()
        self.num = num
        self.title = title
        self.sub = sub
        self.width = width
        self.height = self.H

    def wrap(self, avail_w, avail_h):
        self.width = avail_w
        return avail_w, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(BLACK)
        c.rect(0, 0, self.width, self.height, stroke=0, fill=1)
        # ghosted numeral, right side, clipped by the band edges
        c.saveState()
        c.setFillColor(colors.HexColor("#333333"))
        c.setFont("DJ-B", 62)
        c.drawRightString(self.width - 16, 12, self.num)
        c.restoreState()
        # text
        c.setFillColor(colors.HexColor("#8f8f8f"))
        c.setFont("DJ-B", 8)
        c.drawString(18, self.height - 24, "PHASE " + self.num)
        c.setFillColor(colors.white)
        c.setFont("DJ-B", 20)
        c.drawString(18, self.height - 50, self.title)
        c.setFillColor(colors.HexColor("#b5b5b5"))
        c.setFont("DJ", 9.2)
        c.drawString(18, self.height - 68, self.sub)
        # hairline under the subtitle, fading to the right
        c.setStrokeColor(colors.HexColor("#4a4a4a"))
        c.setLineWidth(0.7)
        c.line(18, 16, self.width * 0.55, 16)


class Marker(Flowable):
    """Zero-size flowable that records which page it landed on, for running heads."""

    def __init__(self, label):
        super().__init__()
        self.label = label

    def wrap(self, avail_w, avail_h):
        return 0, 0

    def draw(self):
        PAGES[self.canv.getPageNumber()] = self.label
        RENDER_STATE["label"] = self.label


class SectionHead(Flowable):
    """Oversized section heading with a heavy rule under it."""

    def __init__(self, text, size=15, rule_w=2.0, space_after=12):
        super().__init__()
        self.text = text
        self.size = size
        self.rule_w = rule_w
        self.space_after = space_after

    def wrap(self, avail_w, avail_h):
        self.width = avail_w
        self.height = self.size + 4 + self.space_after
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(INK)
        c.setFont("DJ-B", self.size)
        c.drawString(0, self.space_after + 2, self.text)
        c.setFillColor(BLACK)
        c.rect(0, self.space_after - 7, self.width, self.rule_w, stroke=0, fill=1)


class StepBars(Flowable):
    """The tear-off card's left rail: 4 numbered squares."""

    def __init__(self, width, height):
        super().__init__()
        self.width, self.height = width, height

    def wrap(self, avail_w, avail_h):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(colors.HexColor("#cfcfcf"))
        c.setLineWidth(0.7)
        c.rect(0, 0, self.width, self.height, stroke=1, fill=0)
        c.setFont("DJ-B", 7.4)
        c.setFillColor(colors.HexColor("#8f8f8f"))
        c.drawString(12, self.height - 18, "THE PAPER TEST")
        n = 1
        for (yy, txt) in [(self.height - 46, "FRONT LEFT"), (self.height - 76, "BACK LEFT"),
                          (self.height - 106, "BACK RIGHT"), (self.height - 136, "FRONT RIGHT")]:
            c.setFillColor(BLACK)
            c.rect(12, yy - 2, 15, 15, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont("DJ-B", 8.4)
            c.drawCentredString(19.5, yy + 3.4, str(n))
            c.setFillColor(INK)
            c.setFont("DJ-B", 7.3)
            c.drawString(34, yy + 3.6, txt)
            n += 1


# ---------------------------------------------------------------- content
F = []


def add(x):
    if isinstance(x, (list, tuple)):
        F.extend(x)
    else:
        F.append(x)


def P(txt, style=st_body):
    F.append(Paragraph(inline(txt), style))


def gap(h=8):
    F.append(Spacer(1, h))


def write(label):
    F.append(write_line(label))
    F.append(Spacer(1, 3))


def bullets(items, style=st_check, box=True):
    for it in items:
        mark = "☐  " if box else "·  "
        F.append(Paragraph(mark + inline(it), style))
    gap(8)


def build_body():
    global F
    F = []
    # ================================================================ COVER
    F.append(NextPageTemplate("body"))
    F.append(PageBreak())

    # ================================================================ BEFORE YOU START
    add(Marker("BEFORE YOU START"))
    add(SectionHead("BEFORE YOU START"))
    gap(2)

    start_left = [
        Paragraph("TIME", st_micro),
        Paragraph("About 45 minutes.", st_body_tight),
        Spacer(1, 12),
        Paragraph("DIFFICULTY", st_micro),
        Paragraph("Moderate. The order is what matters.", st_body_tight),
        Spacer(1, 12),
        Paragraph("PAGES YOU NEED", st_micro),
        Paragraph("3–7 for the bed. 8–10 only if it also extrudes badly.", st_body_tight),
    ]
    start_right = [
        Paragraph("TOOLS", st_micro),
        Paragraph("☐  Ruler or tape measure", st_check),
        Paragraph("☐  Two identical objects — two mugs, two cans, two blocks", st_check),
        Paragraph("☐  One sheet of ordinary printer paper", st_check),
        Paragraph("☐  The hex key and wrench that came with the printer", st_check),
        Paragraph("☐  A marker or pen", st_check),
        Paragraph("☐  Phone (for photos)", st_check),
    ]
    t = Table([[start_left, start_right]], colWidths=[CONTENT_W * 0.36, CONTENT_W * 0.64])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 20),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    add(t)
    gap(18)

    add(SectionHead("FOUR RULES", size=12, rule_w=1.4, space_after=10))
    rules = [
        ("Do the phases in order.", "Phase 2 is impossible if Phase 1 is wrong."),
        ("One change at a time.", "Change two things and you won't know which one worked."),
        ("Write the number down before you change it.", "Every time."),
        ("When a step says STOP, stop.", "That's where the money gets wasted."),
    ]
    rows = [[Paragraph("%02d" % i, st_micro), Paragraph("<b>%s</b> %s" % (inline(h), inline(s)), st_body)]
            for i, (h, s) in enumerate(rules, 1)]
    t = Table(rows, colWidths=[0.42 * inch, CONTENT_W - 0.42 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIR),
    ]))
    add(t)
    gap(12)

    add(callout("this is a real fix, so log it",
                "When you finish, fill in page 12. What was actually wrong, what fixed it, and what you "
                "tried that didn't work. Then photograph the first good print. That's the proof — and "
                "it's worth as much as the repair."))

    gap(6)
    add(schematic())
    add(fig_caption("Front view, schematic, not to scale. Dashed lines &#9312; and &#9313; are the "
                    "measurements in steps 1.4 and 1.5."))

    # ================================================================ PHASE 1
    F.append(PageBreak())
    add(Marker("PHASE 1 — IS THE PRINTER CROOKED?"))
    add(PhaseBanner("1", "Is the printer crooked?", "10 minutes  ·  free  ·  do this first"))
    gap(12)

    P("If the arm that holds the nozzle is tilted, one side of the bed will never be reachable. "
      "You'd be adjusting the bed against a crooked ruler. This is the most common reason a bed "
      "&quot;can't be leveled&quot; — and it costs nothing to check.")
    gap(8)

    step("1.1", "Turn the printer **off**. Wait 5 seconds.")
    step("1.2", "Turn it back on. On the screen: **Prepare → Disable steppers.** The motors now let you move things by hand.")
    step("1.3", "Stand facing the printer. Notice the **horizontal bar** across the top that the nozzle hangs from. That's the gantry. You're checking that it's level.")
    step("1.4", "Hold the ruler upright against the **left** vertical post. Measure from the **base** up to the **bottom edge of the gantry bar**.")
    write("LEFT  =                    mm")
    step("1.5", "Do the exact same thing on the **right** side.")
    write("RIGHT  =                    mm")
    step("1.6", "Compare the two numbers.")

    gap(2)
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
    add(callout("gravity does this", "Whichever side is lower is the one that sagged. It isn't your "
                                     "fault and it isn't damage.", "note"))
    step("1.10", "Hold it in place. Tighten both eccentric nuts until the wheels grip firmly — the gantry shouldn't wobble, but the wheels should still turn.")
    step("1.11", "Measure left and right again.")

    add(decision_box([
        "**Within 1 mm?**   ✓ Phase 1 complete — go to Phase 2.",
        "---",
        "**No?** Repeat 1.8–1.11 once. Still no? Stop and photograph the wheel assembly — something "
        "else is bent. See Phase 5.",
    ]))

    # ================================================================ PHASE 2
    add(Spacer(1, 20))
    add(Marker("PHASE 2 — LEVEL THE BED"))
    add(PhaseBanner("2", "Level the bed", "15 minutes  ·  the part everyone does badly"))
    gap(12)

    P("Most people adjust one corner, then the opposite corner, and undo their own work. Use this "
      "order and **do the whole sequence twice**. The first pass always throws the others off. "
      "That's normal, not a mistake.")
    gap(8)

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

    gap(10)
    add(bed_order_figure(scale=1.30))
    add(fig_caption("Four corners, clockwise from the front left. Two passes, then leave it alone."))
    gap(14)
    add(callout("why twice",
                "Raising one corner bends the plate against the other three, so the corner you set "
                "first is always slightly off by the time you reach the fourth. The second pass is "
                "where the bed actually gets flat — skip it and you'll be back here in a week."))

    # ================================================================ PHASE 2 continued
    F.append(PageBreak())
    add(decision_box([
        "**All four corners drag the paper, and no knob is loose or wobbly:**",
        "✓ Bed is level. **Go to Phase 3.**",
        "---",
        "**One knob has to be so loose it's falling off — or is already loose:**",
        "✗ **STOP.** Do not keep turning. That is your original complaint, and it means one of the "
        "following is true.",
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
    add(Marker("PHASE 2 — KEEP THIS BY THE PRINTER"))
    add(SectionHead("KEEP THIS BY THE PRINTER", size=13, rule_w=1.6, space_after=9))

    card = Table([[
        Paragraph("<b>THE PAPER TEST</b>", S("ct2", fontName="DJ-B", fontSize=8.5,
                                              leading=11, textColor=DIM))
    ], [
        Paragraph("Four corners. Clockwise from the front left. Then the whole loop again.",
                  st_body_tight)
    ], [
        bed_order_figure(scale=1.30)
    ]], colWidths=[CONTENT_W - 2])
    card.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.2, INK),
        ("LEFTPADDING", (0, 0), (-1, -1), 18),
        ("RIGHTPADDING", (0, 0), (-1, -1), 18),
        ("TOPPADDING", (0, 0), (0, 0), 16),
        ("BOTTOMPADDING", (0, 0), (0, 0), 2),
        ("TOPPADDING", (0, 1), (0, 1), 0),
        ("BOTTOMPADDING", (0, 1), (0, 1), 10),
        ("TOPPADDING", (0, 2), (0, 2), 2),
        ("BOTTOMPADDING", (0, 2), (0, 2), 14),
    ]))
    add(card)
    gap(16)

    add(data_table([
        ["Paper does this", "Means", "Turn the knob"],
        ["Slides out with a slight drag", "Correct", "Nothing — next corner"],
        ["No contact at all", "Nozzle too high", "Tighten the spring (raise the bed)"],
        ["Pinned, can't move", "Nozzle too low", "Loosen the spring (lower the bed)"],
        ["Right at one corner, wrong at the opposite", "Gantry tilt", "Phase 1 — don't touch the knobs"],
        ["Perfect, then wrong again in ten minutes", "Weak springs or stripped knob", "Phase 5 — silicone spacers"],
    ], widths=[38, 30, 32], first_bold=True))

    P("Chasing a perfect paper feel on pass five is how people spend an hour and end up worse than pass "
      "two. If it's even and it drags, print the first-layer test. The print tells the truth; the paper "
      "is only a rough guide.", st_small)

    # ================================================================ PHASE 3
    F.append(PageBreak())
    add(Marker("PHASE 3 — FIX THE EXTRUSION"))
    add(PhaseBanner("3", "Fix the extrusion", "15 minutes  ·  name the symptom first"))
    gap(12)

    P("Nobody can fix &quot;extrusion problems.&quot; Name the symptom first. One test splits it in two.")
    gap(4)

    step("3.1", "Load a **brand-new, unopened** spool of filament.")
    step("3.2", "Print a small test cube or a benchy.")
    step("3.3", "Look at the result.")

    add(decision_box([
        "**It prints clean now**  →  it was **moisture**. Go to **Phase 4**, then come back and finish.",
        "---",
        "**It still prints badly**  →  it's **mechanical**. Moisture was a red herring. "
        "**Continue to step 3.4.**",
    ]))

    step("3.4", "Look at the nozzle. Is plastic oozing from around the **outside** of it, or curling out sideways instead of straight down? If yes, the tube isn't sealed against the nozzle — do 3.5 to 3.8.")
    step("3.5", "Heat the nozzle to printing temperature: **Prepare → Preheat → PLA**.")
    step("3.6", "Loosen the fitting that holds the white tube, by **half a turn**.")
    step("3.7", "Push the tube **firmly down** so it presses flat against the back of the nozzle. Hold it there.")
    step("3.8", "Tighten the fitting back up while still pushing down. Done.")

    gap(2)
    add(SectionHead("STILL BAD?  DO A COLD PULL.", size=11.5, rule_w=1.2, space_after=7))
    cold = ["Heat to 200 °C", "Push filament through by hand until it extrudes",
            "Set the temperature to 90 °C and wait", "Pull the filament out firmly, in one motion",
            "Look at the tip — it should have a clean point with the gunk stuck to it",
            "Cut that end off, reload, test print"]
    rows = [[Paragraph("%02d" % i, st_micro), Paragraph(inline(x), st_body)]
            for i, x in enumerate(cold, 1)]
    t = Table(rows, colWidths=[0.42 * inch, CONTENT_W - 0.42 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIR),
    ]))
    add(KeepTogether([t, Spacer(1, 2),
                      Paragraph("Repeat twice if the first pull comes out black.", st_small)]))
    gap(4)

    step("3.9", "Still bad? **Check the extruder arm** — the plastic lever on the motor that grips the filament. Remove it and look at the **underside** for a hairline crack. It cracks where you can't see it, and it fails exactly like a clog.")
    step("3.10", "Still bad? Check the brass gear on the motor for flattened or shiny worn teeth. Replace if worn.")

    # ================================================================ PHASE 4
    add(Spacer(1, 16))
    add(Marker("PHASE 4 — MOISTURE"))
    add(PhaseBanner("4", "If it was moisture", "4–6 hours of waiting  ·  5 minutes of work"))
    gap(12)

    step("4.1", "Put the spool in a food dehydrator or a filament dryer.")
    step("4.2", "Set it to **40–45 °C.**")

    add(callout("do not go above 50 °c",
                "PLA starts going soft around 60 °C. A dehydrator set to &quot;jerky&quot; will warp the "
                "spool and ruin the filament. Low and slow.", "warn"))

    step("4.3", "Leave it **4 to 6 hours**.")
    step("4.4", "Move it straight into a sealed container with desiccant packets. It reabsorbs moisture within hours if left out.")
    step("4.5", "Add a cheap hygrometer inside the container. Under 20% is good.")

    gap(4)
    add(callout("desiccant does not dry filament",
                "It only keeps dried filament dry. You need heat <b>and</b> a sealed box. Skip the heat "
                "and nothing improves; skip the box and it comes back by the weekend.", "note"))

    # ================================================================ PHASE 5
    F.append(PageBreak())
    add(Marker("PHASE 5 — THE BUY-A-PART STAGE"))
    add(PhaseBanner("5", "If phases 1 and 2 failed", "The buy-a-part stage.  Only now."))
    gap(12)

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
                "It does <b>not</b> fix a tilted gantry and it does <b>not</b> fix a corner that can't hold "
                "tension. It only compensates for a warped surface. Buying one to solve a leveling problem "
                "is the most common way people waste $35 and three weekends.", "stop"))

    # ================================================================ BUDGET / STOP
    F.append(PageBreak())
    add(Marker("BUDGET & WHEN TO STOP"))
    add(SectionHead("THE BUDGET LADDER — SPEND IN THIS ORDER", size=14, rule_w=2.0, space_after=12))
    add(data_table([
        ["Spend", "Gets you", "Stop here if..."],
        ["**$0**", "Gantry level, bed leveled twice, tube seated, cold pull, new spool test", "It prints. Most machines are fixed at $0."],
        ["**$10–15**", "Silicone spacers + nyloc nuts", "The bed holds. It usually will."],
        ["**$15**", "Metal extruder arm", "Your plastic arm is cracked."],
        ["**$35**", "ABL probe", "You have confirmed a **warped surface** and nothing else."],
    ], widths=[14, 50, 36]))

    gap(10)
    add(SectionHead("WHEN TO STOP AND TAKE IT SOMEWHERE", size=13, rule_w=1.8, space_after=10))
    P("There is a point where continuing costs more than the machine. Knowing the number is what "
      "separates a repair from a project. These three symptoms mean it's not you:")
    gap(2)
    add(data_table([
        ["Symptom", "What it usually is", "Realistic call"],
        ["Z banding on every print, or layers shifting", "Bent Z screw, or a failing stepper driver", "Board-level — worth a shop, not a weekend"],
        ["Frame out of square even with the gantry level", "Dropped or over-tightened during assembly", "Difficult but fixable — loosen everything and square it"],
        ["Bed surface warped more than about 0.3 mm", "Trammed from the factory", "Glass or a new plate — not adjustable"],
    ], widths=[36, 36, 28], first_bold=True))
    gap(4)
    P("A shop bench fee runs $80–120, and a new Ender 3 V2 is $170–200. Once you're past the $35 rung, "
      "check that number before you spend a fourth weekend. Not every machine is worth saving — and "
      "saying so out loud is the same professional judgment you'd use on anyone else's printer.", st_small)

    # ================================================================ FINAL CHECK
    F.append(PageBreak())
    add(Marker("FINAL CHECK"))
    add(SectionHead("FINAL CHECK", size=18, rule_w=2.4, space_after=14))

    add(first_layer_figure())
    add(fig_caption("Cross-section through the first layer. This is the only test that tells the truth."))
    gap(8)

    P("Print something with a large flat first layer — a one-layer square test, or a benchy.")
    gap(4)
    P("**What a good first layer looks like:** a smooth, slightly squashed ribbon. Lines touching, "
      "no gaps, no ridges you can catch a fingernail on.")
    gap(8)

    add(data_table([
        ["Looks like", "Meaning", "Do this"],
        ["Gaps between the lines", "Nozzle too high", "Raise the bed slightly at that corner"],
        ["Rough, rippled, transparent", "Nozzle too low", "Lower the bed slightly"],
        ["Good at the front, bad at the back", "Bed isn't flat", "Phase 2, second pass"],
        ["Bad on one side only", "Gantry still tilted", "Phase 1"],
    ], widths=[36, 26, 38], first_bold=True))

    gap(10)
    add(SectionHead("WHAT TO PHOTOGRAPH", size=13, rule_w=1.8, space_after=10))
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

    # ================================================================ LOG PAGE
    F.append(PageBreak())
    add(Marker("LOG ENTRY 001"))
    add(SectionHead("WHEN YOU'RE DONE", size=18, rule_w=2.4, space_after=10))
    P("ENTRY 001  ·  ENDER 3 V2  ·  BED LEVELING AND EXTRUSION", st_micro)
    gap(10)

    P("Write this down. It takes five minutes and it's the part that turns a repair into proof that you "
      "can finish a difficult thing.")
    gap(2)
    P("Matching entry in the repository: fix-log/001-ender-3-v2-bed-and-extrusion.md", st_small)
    gap(14)

    log_fields = [
        ("What was actually wrong (root cause)", 1.0),
        ("What fixed it", 1.0),
        ("Time spent   /   parts cost   /   what I'd do differently", 0.56),
        ("What I tried that didn't work (dead ends)", 1.0),
    ]
    for label, h in log_fields:
        add(KeepTogether([
            Paragraph("<b>%s</b>" % label, st_body_tight),
            Spacer(1, 2),
            Table([[""]], colWidths=[CONTENT_W], rowHeights=[h * inch - 0.22],
                  style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.9, INK),
                                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])),
            Spacer(1, 9),
        ]))

    gap(8)
    add(callout("then photograph it, then type it up",
                "The before, the after, the first good print. That's a fix with a documented cause and a "
                "documented result. Copy the same answers into fix-log/001-ender-3-v2-bed-and-extrusion.md "
                "and mark it solved — that file is the first line of a work history."))

    # ================================================================ QUICK REF
    F.append(PageBreak())
    add(Marker("QUICK REFERENCE"))
    add(SectionHead("QUICK REFERENCE", size=18, rule_w=2.4, space_after=14))

    P("START HERE IF YOU DON'T KNOW WHY", st_h3)
    gap(4)
    add(data_table([
        ["Symptom you reported", "What it means", "Phase"],
        ["Bed won't level; one screw has to be so loose it falls off", "That corner is maxed out — alignment, not adjustment", "1, then 2"],
        ["Bed won't stay level after adjusting", "Weak stock springs, or a stripped knob", "5"],
        ["Extrusion problems, suspected humidity", "Moisture — or five mechanical causes that look identical", "3, then 4"],
        ["Looks fine, prints badly", "Bed surface warp, or gantry tilt", "1, then 5"],
    ], widths=[40, 42, 18], first_bold=True))

    gap(6)
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

    gap(10)
    add(rule(HAIR, 0.6, 0, 6))
    P("Northstar Fix Log  ·  Entry 001  ·  Ender 3 V2", st_center_small)
    gap(2)
    P("Source: fix-log/manuals/ender-3-v2-manual.md", st_center_small)






    # ---------------------------------------------------------------- render
def _render(out_path, flow):
    doc = BaseDocTemplate(
        out_path,
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

    body_frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W, PAGE_H - MARGIN_T - MARGIN_B, id="body")

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[Frame(0, 0, 1, 1, id="blank")], onPage=on_cover),
        PageTemplate(id="body", frames=[body_frame], onPage=on_page),
    ])

    doc.build(flow)


# ---------------------------------------------------------------- run
import tempfile


def _clear_markers():
    for fl in F:
        if isinstance(fl, Marker):
            fl.label = fl.label  # markers are inert; nothing to reset
    return F


def render_two_pass(final_path):
    """Render once to learn pagination, then again with correct running heads."""
    global PAGES
    PAGES = {}
    build_body()
    first = _clear_markers()
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    _render(tmp.name, first)
    learned = dict(PAGES)

    PAGES = learned
    build_body()
    _render(final_path, F)
    os.unlink(tmp.name)
    return learned


render_two_pass(OUT)

# ---------------------------------------------------------------- verify
from pypdf import PdfReader

r = PdfReader(OUT)
print("pages:", len(r.pages))
print("size:", os.path.getsize(OUT), "bytes")
for i, pg in enumerate(r.pages):
    txt = (pg.extract_text() or "").replace("\n", " ")
    print("p%d: %s" % (i + 1, txt[:110].strip()))
