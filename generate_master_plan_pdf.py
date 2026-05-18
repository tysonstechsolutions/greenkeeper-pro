"""
Generate MASTER_PLAN.pdf — clean military-style report, no decorative elements.
"""
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak,
)

# ─── Colors ───────────────────────────────────────────────────────────────────
NAVY     = colors.HexColor("#1C2E4A")
MID_GRAY = colors.HexColor("#CCCCCC")
LIGHT_BG = colors.HexColor("#F5F5F5")
BLACK    = colors.HexColor("#111111")
DK_GRAY  = colors.HexColor("#444444")
MED_GRAY = colors.HexColor("#888888")
WHITE    = colors.white

# ─── Page events ──────────────────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    w, h = letter

    if doc.page > 1:
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MED_GRAY)
        canvas.drawString(0.75 * inch, h - 0.45 * inch,
                          "Golf Course Master Plan — For Official Use")
        canvas.drawRightString(w - 0.75 * inch, h - 0.45 * inch,
                               f"Page {doc.page}")
        canvas.setStrokeColor(MID_GRAY)
        canvas.setLineWidth(0.5)
        canvas.line(0.75 * inch, h - 0.52 * inch,
                    w - 0.75 * inch, h - 0.52 * inch)

    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MED_GRAY)
    canvas.drawCentredString(w / 2, 0.4 * inch,
        "Navy / Marine Corps MWR  ·  Golf Course Superintendent  ·  May 2026")
    canvas.setStrokeColor(MID_GRAY)
    canvas.setLineWidth(0.5)
    canvas.line(0.75 * inch, 0.55 * inch, w - 0.75 * inch, 0.55 * inch)

    canvas.restoreState()


# ─── Styles ───────────────────────────────────────────────────────────────────
def styles():
    s = {}

    # Cover / title block
    s["cover_to"] = ParagraphStyle("cover_to",
        fontName="Helvetica", fontSize=10, textColor=DK_GRAY,
        leading=16, spaceAfter=2)
    s["cover_rule"] = ParagraphStyle("cover_rule",
        fontName="Helvetica", fontSize=10, textColor=DK_GRAY,
        leading=16, spaceAfter=2)
    s["cover_title"] = ParagraphStyle("cover_title",
        fontName="Helvetica-Bold", fontSize=22, textColor=NAVY,
        alignment=TA_CENTER, spaceBefore=24, spaceAfter=8, leading=28)
    s["cover_sub"] = ParagraphStyle("cover_sub",
        fontName="Helvetica", fontSize=11, textColor=DK_GRAY,
        alignment=TA_CENTER, spaceAfter=4, leading=16)

    # Section headings
    s["h1"] = ParagraphStyle("h1",
        fontName="Helvetica-Bold", fontSize=13, textColor=NAVY,
        spaceBefore=18, spaceAfter=6, leading=17,
        borderPad=0)
    s["h2"] = ParagraphStyle("h2",
        fontName="Helvetica-Bold", fontSize=11, textColor=NAVY,
        spaceBefore=14, spaceAfter=4, leading=15)
    s["h3"] = ParagraphStyle("h3",
        fontName="Helvetica-Bold", fontSize=10.5, textColor=BLACK,
        spaceBefore=10, spaceAfter=3, leading=14)

    # Body
    s["body"] = ParagraphStyle("body",
        fontName="Helvetica", fontSize=10, textColor=BLACK,
        spaceAfter=6, leading=15, alignment=TA_JUSTIFY)
    s["bullet"] = ParagraphStyle("bullet",
        fontName="Helvetica", fontSize=10, textColor=BLACK,
        spaceAfter=4, leading=14, leftIndent=16, firstLineIndent=-10)
    s["numbered"] = ParagraphStyle("numbered",
        fontName="Helvetica", fontSize=10, textColor=BLACK,
        spaceAfter=4, leading=14, leftIndent=22, firstLineIndent=-14)
    s["italic_line"] = ParagraphStyle("italic_line",
        fontName="Helvetica-Oblique", fontSize=9.5, textColor=DK_GRAY,
        spaceAfter=5, leading=13)
    s["footer_italic"] = ParagraphStyle("footer_italic",
        fontName="Helvetica-Oblique", fontSize=9, textColor=MED_GRAY,
        alignment=TA_CENTER, spaceAfter=4, leading=12)
    s["bold_inline"] = ParagraphStyle("bold_inline",
        fontName="Helvetica-Bold", fontSize=10.5, textColor=NAVY,
        spaceAfter=4, spaceBefore=8, leading=14)
    s["phase_label"] = ParagraphStyle("phase_label",
        fontName="Helvetica-Oblique", fontSize=10, textColor=DK_GRAY,
        spaceAfter=5, leading=13)
    s["memo_header"] = ParagraphStyle("memo_header",
        fontName="Courier", fontSize=10, textColor=BLACK,
        leading=16, spaceAfter=2)

    return s


# ─── Inline markdown ───────────────────────────────────────────────────────────
def fmt(text):
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'<b><i>\1</i></b>', text)
    text = re.sub(r'\*\*(.+?)\*\*',     r'<b>\1</b>',         text)
    text = re.sub(r'\*(.+?)\*',         r'<i>\1</i>',         text)
    text = re.sub(r'`(.+?)`', r'<font name="Courier">\1</font>', text)
    # safe ampersand
    text = text.replace('&', '&amp;')
    # restore tags we just inserted
    for tag in ['b', 'i', '/b', '/i', 'font', '/font']:
        text = text.replace(f'&amp;lt;{tag}&amp;gt;', f'<{tag}>')
    return text


# ─── Table parser ─────────────────────────────────────────────────────────────
def parse_md_table(lines):
    rows = []
    for line in lines:
        if re.match(r'^\s*\|[-| :]+\|\s*$', line):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows.append(cells)
    return rows


def build_table(rows, sty):
    if not rows:
        return None
    usable = letter[0] - 1.5 * inch
    n = len(rows[0])

    if n == 2:
        cw = [usable * 0.32, usable * 0.68]
    elif n == 3:
        cw = [usable * 0.30, usable * 0.35, usable * 0.35]
    elif n == 4:
        cw = [usable * 0.18, usable * 0.30, usable * 0.26, usable * 0.26]
    else:
        # 5-column tables (PR# | Vendor | Description | Amount | Justification/Status)
        cw = [usable * 0.07, usable * 0.19, usable * 0.37, usable * 0.13, usable * 0.24]

    # Use slightly smaller font for wide tables so content fits
    font_size = 8 if n >= 5 else 9
    lead_hdr  = font_size + 3
    lead_cel  = font_size + 4

    hdr_s = ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=font_size,
                            textColor=WHITE, leading=lead_hdr)
    cel_s = ParagraphStyle("td", fontName="Helvetica", fontSize=font_size,
                            textColor=BLACK, leading=lead_cel)

    def cell(t, st): return Paragraph(fmt(t), st)

    data = [[cell(c, hdr_s) for c in rows[0]]]
    for row in rows[1:]:
        while len(row) < n: row.append("")
        data.append([cell(c, cel_s) for c in row])

    ts = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
        ("GRID",          (0, 0), (-1, -1), 0.4, MID_GRAY),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 7),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ])
    return Table(data, colWidths=cw, style=ts, repeatRows=1)


# ─── Markdown → flowables ─────────────────────────────────────────────────────
def parse(md, sty):
    els = []
    lines = md.splitlines()
    i = 0

    def hr(color=MID_GRAY, thick=0.5):
        els.append(Spacer(1, 4))
        els.append(HRFlowable(width="100%", thickness=thick,
                               color=color, spaceAfter=6))

    # ── Cover block ───────────────────────────────────────────────────────────
    # Detect memo header lines (TO: / FROM: / DATE: / SUBJ:)
    while i < len(lines) and re.match(r'^(TO|FROM|DATE|SUBJ):', lines[i]):
        els.append(Paragraph(lines[i], sty["memo_header"]))
        i += 1
    if i < len(lines) and lines[i].strip() == "---":
        hr(NAVY, 1.5)
        i += 1

    while i < len(lines):
        line = lines[i]

        # HR
        if re.match(r'^---+\s*$', line):
            hr()
            i += 1
            continue

        # Document title (single #)
        if line.startswith("# ") and not line.startswith("## "):
            text = line[2:].strip()
            els.append(Spacer(1, 8))
            els.append(Paragraph(text, sty["cover_title"]))
            els.append(HRFlowable(width="100%", thickness=1.5,
                                   color=NAVY, spaceAfter=10))
            i += 1
            continue

        # ## Section heading
        if line.startswith("## "):
            text = line[3:].strip()
            els.append(Spacer(1, 8))
            els.append(Paragraph(text, sty["h1"]))
            els.append(HRFlowable(width="100%", thickness=1,
                                   color=NAVY, spaceAfter=4))
            i += 1
            continue

        # ### Sub-heading
        if line.startswith("### "):
            text = line[4:].strip()
            els.append(Paragraph(text, sty["h2"]))
            i += 1
            continue

        # #### Sub-sub-heading
        if line.startswith("#### "):
            text = line[5:].strip()
            els.append(Paragraph(text, sty["h3"]))
            i += 1
            continue

        # Markdown table
        if line.startswith("|"):
            tlines = []
            while i < len(lines) and lines[i].startswith("|"):
                tlines.append(lines[i])
                i += 1
            t = build_table(parse_md_table(tlines), sty)
            if t:
                els.append(Spacer(1, 6))
                els.append(t)
                els.append(Spacer(1, 8))
            continue

        # Numbered list
        m = re.match(r'^(\d+)\.\s+(.*)', line)
        if m:
            els.append(Paragraph(f"{m.group(1)}.  {fmt(m.group(2))}", sty["numbered"]))
            i += 1
            continue

        # Bullet list
        if re.match(r'^[-*]\s+', line):
            text = re.sub(r'^[-*]\s+', '', line)
            els.append(Paragraph(
                f'<bullet>–</bullet> {fmt(text)}', sty["bullet"]))
            i += 1
            continue

        # Italic-only line
        if re.match(r'^\*[^*].+[^*]\*$', line.strip()):
            els.append(Paragraph(
                f'<i>{fmt(line.strip("*"))}</i>', sty["italic_line"]))
            i += 1
            continue

        # Bold-only line used as sub-header
        if re.match(r'^\*\*[^*].+[^*]\*\*$', line.strip()):
            text = line.strip().strip("*")
            els.append(Paragraph(f'<b>{fmt(text)}</b>', sty["bold_inline"]))
            i += 1
            continue

        # Footer italic (single * wrapping)
        if line.startswith("*") and line.endswith("*") and not line.startswith("**"):
            els.append(Paragraph(
                f'<i>{fmt(line.strip("*"))}</i>', sty["footer_italic"]))
            i += 1
            continue

        # Blank line
        if line.strip() == "":
            els.append(Spacer(1, 4))
            i += 1
            continue

        # Normal paragraph
        els.append(Paragraph(fmt(line), sty["body"]))
        i += 1

    return els


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    with open("MASTER_PLAN.md", encoding="utf-8") as f:
        md = f.read()

    sty = styles()

    doc = SimpleDocTemplate(
        "MASTER_PLAN_v6.pdf",
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title="Golf Course Master Plan",
        author="Golf Course Superintendent",
        subject="Navy/Marine Corps MWR Golf Course Master Plan — May 2026",
    )

    story = parse(md, sty)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print("PDF created: MASTER_PLAN_v6.pdf")


if __name__ == "__main__":
    main()
