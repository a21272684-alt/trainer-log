# scripts/plan_to_pdf.py
# Convert markdown plan file to PDF with Korean font support.
# Usage: python scripts/plan_to_pdf.py <input.md> <output.pdf>

import re
import sys
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, ListFlowable, ListItem, Preformatted, KeepTogether
)
from reportlab.lib.enums import TA_LEFT


# ── Korean font registration ──────────────────────────────────
FONT_CANDIDATES = [
    ("Malgun", r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\malgunbd.ttf"),
    ("Gulim",  r"C:\Windows\Fonts\gulim.ttc", r"C:\Windows\Fonts\gulim.ttc"),
    ("Batang", r"C:\Windows\Fonts\batang.ttc", r"C:\Windows\Fonts\batang.ttc"),
]

def register_korean_font():
    for name, regular, bold in FONT_CANDIDATES:
        if Path(regular).exists():
            try:
                pdfmetrics.registerFont(TTFont(name, regular))
                if Path(bold).exists() and bold != regular:
                    pdfmetrics.registerFont(TTFont(name + '-Bold', bold))
                else:
                    pdfmetrics.registerFont(TTFont(name + '-Bold', regular))
                return name
            except Exception as e:
                print(f"failed {name}: {e}", file=sys.stderr)
                continue
    raise RuntimeError("No Korean font found")


# ── Markdown to flowables ─────────────────────────────────────
def make_styles(font_name):
    styles = getSampleStyleSheet()
    # Override defaults with Korean font
    base = ParagraphStyle(
        'KoreanBase',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=10,
        leading=15,
        spaceAfter=6,
    )
    h1 = ParagraphStyle('H1', parent=base, fontName=font_name+'-Bold', fontSize=20, leading=26, spaceBefore=18, spaceAfter=12, textColor=colors.HexColor('#0f172a'))
    h2 = ParagraphStyle('H2', parent=base, fontName=font_name+'-Bold', fontSize=15, leading=20, spaceBefore=14, spaceAfter=8, textColor=colors.HexColor('#1e293b'))
    h3 = ParagraphStyle('H3', parent=base, fontName=font_name+'-Bold', fontSize=12, leading=17, spaceBefore=10, spaceAfter=6, textColor=colors.HexColor('#334155'))
    h4 = ParagraphStyle('H4', parent=base, fontName=font_name+'-Bold', fontSize=11, leading=15, spaceBefore=8, spaceAfter=4, textColor=colors.HexColor('#475569'))
    body = base
    li = ParagraphStyle('LI', parent=base, leftIndent=14, bulletIndent=2, spaceAfter=3)
    code = ParagraphStyle('Code', parent=base, fontName='Courier', fontSize=9, leading=12, leftIndent=10, backColor=colors.HexColor('#f1f5f9'), borderPadding=4, spaceAfter=8)
    quote = ParagraphStyle('Quote', parent=base, leftIndent=14, fontName=font_name, textColor=colors.HexColor('#475569'), spaceAfter=6)
    return {'h1': h1, 'h2': h2, 'h3': h3, 'h4': h4, 'body': body, 'li': li, 'code': code, 'quote': quote}


def md_inline_to_rl(text):
    """Convert inline markdown (bold, italic, code, links) to reportlab paragraph markup."""
    # Escape XML-special characters first
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # **bold**
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    # *italic*
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    # `code`
    text = re.sub(r'`(.+?)`', r'<font name="Courier" backColor="#f1f5f9">\1</font>', text)
    # [text](url) — keep text only (for PDF), discard URL or append
    text = re.sub(r'\[(.+?)\]\((.+?)\)', r'\1 (\2)', text)
    return text


def parse_table(lines, idx):
    """Parse markdown table starting at lines[idx]. Returns (table_data, next_idx)."""
    rows = []
    while idx < len(lines) and lines[idx].strip().startswith('|'):
        line = lines[idx].strip()
        # Skip separator row (|---|---|)
        if re.match(r'^\|[\s:|-]+\|$', line):
            idx += 1
            continue
        # Parse cells
        cells = [c.strip() for c in line.strip('|').split('|')]
        rows.append(cells)
        idx += 1
    return rows, idx


def md_to_flowables(md_text, styles, font_name):
    flow = []
    lines = md_text.split('\n')
    i = 0
    in_code_block = False
    code_buffer = []

    while i < len(lines):
        line = lines[i]

        # Code block fence
        if line.startswith('```'):
            if in_code_block:
                # End — emit code block
                flow.append(Preformatted('\n'.join(code_buffer), styles['code']))
                flow.append(Spacer(1, 6))
                code_buffer = []
                in_code_block = False
            else:
                in_code_block = True
            i += 1
            continue
        if in_code_block:
            code_buffer.append(line)
            i += 1
            continue

        stripped = line.strip()
        if not stripped:
            flow.append(Spacer(1, 4))
            i += 1
            continue

        # Headings
        if stripped.startswith('#### '):
            flow.append(Paragraph(md_inline_to_rl(stripped[5:]), styles['h4']))
            i += 1
            continue
        if stripped.startswith('### '):
            flow.append(Paragraph(md_inline_to_rl(stripped[4:]), styles['h3']))
            i += 1
            continue
        if stripped.startswith('## '):
            flow.append(Paragraph(md_inline_to_rl(stripped[3:]), styles['h2']))
            i += 1
            continue
        if stripped.startswith('# '):
            flow.append(Paragraph(md_inline_to_rl(stripped[2:]), styles['h1']))
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^-{3,}$', stripped) or re.match(r'^_{3,}$', stripped):
            flow.append(Spacer(1, 8))
            tbl = Table([['']], colWidths=[170*mm], rowHeights=[1])
            tbl.setStyle(TableStyle([('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1'))]))
            flow.append(tbl)
            flow.append(Spacer(1, 8))
            i += 1
            continue

        # Table
        if stripped.startswith('|') and stripped.endswith('|') and i+1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i+1].strip()):
            rows, i = parse_table(lines, i)
            if rows:
                # Header row + body rows
                # Convert each cell with inline markdown
                processed = []
                for r_idx, row in enumerate(rows):
                    new_row = []
                    for cell in row:
                        cell_para = Paragraph(md_inline_to_rl(cell), styles['body'] if r_idx > 0 else ParagraphStyle('th', parent=styles['body'], fontName=font_name+'-Bold'))
                        new_row.append(cell_para)
                    processed.append(new_row)
                # Calc column widths — equal split
                ncols = len(processed[0])
                col_w = (170*mm) / ncols
                tbl = Table(processed, colWidths=[col_w]*ncols, repeatRows=1)
                tbl.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
                    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
                    ('VALIGN', (0,0), (-1,-1), 'TOP'),
                    ('LEFTPADDING', (0,0), (-1,-1), 6),
                    ('RIGHTPADDING', (0,0), (-1,-1), 6),
                    ('TOPPADDING', (0,0), (-1,-1), 4),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ]))
                flow.append(tbl)
                flow.append(Spacer(1, 8))
            continue

        # Bullet list
        if re.match(r'^[\-\*]\s+', stripped):
            # Collect consecutive bullets (and indented sub-bullets)
            items = []
            while i < len(lines):
                l = lines[i]
                s = l.strip()
                if not s:
                    break
                m = re.match(r'^(\s*)[\-\*]\s+(.+)$', l)
                if not m:
                    break
                indent = len(m.group(1))
                content = m.group(2)
                # Just emit as indented paragraph for simplicity
                bullet = '◦' if indent >= 2 else '•'
                left_pad = 14 + indent * 8
                p_style = ParagraphStyle('BL', parent=styles['li'], leftIndent=left_pad, bulletIndent=left_pad-12)
                items.append(Paragraph(f'<bullet>{bullet}</bullet> {md_inline_to_rl(content)}', p_style))
                i += 1
            flow.extend(items)
            flow.append(Spacer(1, 4))
            continue

        # Numbered list
        if re.match(r'^\d+\.\s+', stripped):
            while i < len(lines):
                l = lines[i].strip()
                m = re.match(r'^(\d+)\.\s+(.+)$', l)
                if not m:
                    break
                num = m.group(1)
                content = m.group(2)
                p_style = ParagraphStyle('NL', parent=styles['li'], leftIndent=18, bulletIndent=2)
                flow.append(Paragraph(f'<bullet>{num}.</bullet> {md_inline_to_rl(content)}', p_style))
                i += 1
            flow.append(Spacer(1, 4))
            continue

        # Blockquote
        if stripped.startswith('> '):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith('> '):
                quote_lines.append(lines[i].strip()[2:])
                i += 1
            flow.append(Paragraph(md_inline_to_rl(' '.join(quote_lines)), styles['quote']))
            flow.append(Spacer(1, 4))
            continue

        # Paragraph (collect consecutive non-empty non-special lines)
        para_lines = []
        while i < len(lines):
            l = lines[i]
            s = l.strip()
            if not s:
                break
            if s.startswith('#') or s.startswith('|') or s.startswith('```') or re.match(r'^[\-\*]\s+', s) or re.match(r'^\d+\.\s+', s) or s.startswith('> ') or re.match(r'^-{3,}$', s):
                break
            para_lines.append(s)
            i += 1
        if para_lines:
            text = ' '.join(para_lines)
            flow.append(Paragraph(md_inline_to_rl(text), styles['body']))

    return flow


# ── Header / footer ───────────────────────────────────────────
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont('Malgun', 8)
    canvas.setFillColor(colors.HexColor('#94a3b8'))
    canvas.drawCentredString(A4[0] / 2, 12*mm, f"- {doc.page} -")
    canvas.restoreState()


def main():
    if len(sys.argv) < 3:
        print("Usage: plan_to_pdf.py <input.md> <output.pdf>", file=sys.stderr)
        sys.exit(1)

    inp = Path(sys.argv[1])
    out = Path(sys.argv[2])

    if not inp.exists():
        print(f"Input not found: {inp}", file=sys.stderr)
        sys.exit(1)

    out.parent.mkdir(parents=True, exist_ok=True)

    font_name = register_korean_font()
    print(f"Using font: {font_name}", file=sys.stderr)

    md_text = inp.read_text(encoding='utf-8')
    styles = make_styles(font_name)
    flow = md_to_flowables(md_text, styles, font_name)

    doc = SimpleDocTemplate(
        str(out),
        pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=18*mm, bottomMargin=18*mm,
        title="trainer-log — CRM/Community 고도화 전략 분석",
        author="이루스케일즈 / 오운",
    )
    doc.build(flow, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"PDF written: {out}", file=sys.stderr)


if __name__ == '__main__':
    main()
