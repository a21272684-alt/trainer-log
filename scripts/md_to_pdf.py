"""
docs/베타-사용가이드.md → docs/베타-사용가이드.pdf 변환 스크립트.

- 맑은 고딕 폰트 (Windows 기본) 로 한국어 렌더링
- 마크다운 헤딩/표/리스트/인용/굵게/링크 지원
- ReportLab Platypus 기반 (외부 의존 0 추가, 이미 설치된 reportlab 사용)
"""

import os
import re
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── 폰트 등록 ──────────────────────────────────────────────────
pdfmetrics.registerFont(TTFont("Malgun", r"C:\Windows\Fonts\malgun.ttf"))
pdfmetrics.registerFont(TTFont("MalgunBold", r"C:\Windows\Fonts\malgunbd.ttf"))

# ── 입출력 경로 ───────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MD_PATH = os.path.join(ROOT, "docs", "베타-사용가이드.md")
OUT_PATH = os.path.join(ROOT, "docs", "베타-사용가이드.pdf")

with open(MD_PATH, "r", encoding="utf-8") as f:
    md_content = f.read()


# ── 스타일 정의 ───────────────────────────────────────────────
styles = getSampleStyleSheet()

h1 = ParagraphStyle(
    "h1_kr",
    parent=styles["Heading1"],
    fontName="MalgunBold",
    fontSize=20,
    leading=26,
    textColor=colors.HexColor("#111"),
    spaceBefore=16,
    spaceAfter=10,
)
h2 = ParagraphStyle(
    "h2_kr",
    parent=styles["Heading2"],
    fontName="MalgunBold",
    fontSize=15,
    leading=20,
    textColor=colors.HexColor("#1f2937"),
    spaceBefore=14,
    spaceAfter=7,
)
h3 = ParagraphStyle(
    "h3_kr",
    parent=styles["Heading3"],
    fontName="MalgunBold",
    fontSize=12.5,
    leading=18,
    textColor=colors.HexColor("#374151"),
    spaceBefore=10,
    spaceAfter=5,
)
body = ParagraphStyle(
    "body_kr",
    parent=styles["BodyText"],
    fontName="Malgun",
    fontSize=10.5,
    leading=16,
    textColor=colors.HexColor("#1f2937"),
    spaceAfter=4,
)
bullet = ParagraphStyle(
    "bullet_kr",
    parent=styles["BodyText"],
    fontName="Malgun",
    fontSize=10.5,
    leading=15,
    textColor=colors.HexColor("#1f2937"),
    spaceAfter=2,
    leftIndent=14,
    firstLineIndent=0,
)
quote = ParagraphStyle(
    "quote_kr",
    parent=styles["BodyText"],
    fontName="Malgun",
    fontSize=10,
    leading=15,
    textColor=colors.HexColor("#4d7c0f"),
    backColor=colors.HexColor("#f6fce3"),
    borderColor=colors.HexColor("#c8f135"),
    borderWidth=0.6,
    borderPadding=6,
    leftIndent=4,
    rightIndent=4,
    spaceBefore=6,
    spaceAfter=8,
)
italic_caption = ParagraphStyle(
    "caption_kr",
    parent=styles["BodyText"],
    fontName="Malgun",
    fontSize=9,
    leading=13,
    textColor=colors.HexColor("#9ca3af"),
    alignment=1,  # center
    spaceBefore=10,
)
table_header = ParagraphStyle(
    "th_kr",
    parent=body,
    fontName="MalgunBold",
    fontSize=10,
    leading=14,
    textColor=colors.HexColor("#111"),
)
table_cell = ParagraphStyle(
    "td_kr",
    parent=body,
    fontName="Malgun",
    fontSize=9.5,
    leading=13,
    textColor=colors.HexColor("#1f2937"),
    spaceAfter=0,
)


# ── Markdown inline → ReportLab markup ────────────────────────
def md_inline(text: str) -> str:
    # Escape XML special chars first (but preserve already-escaped ones)
    # ReportLab Paragraph uses XML so we need to escape < > & not in our tags
    text = text.replace("&", "&amp;")
    # Bold
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Italic (단일 *, 양쪽이 ** 가 아닌 경우만)
    text = re.sub(r"(?<!\*)\*([^\*\n]+?)\*(?!\*)", r"<i>\1</i>", text)
    # Inline code `code`
    text = re.sub(r"`([^`]+)`", r"<font name=\"Courier\" color=\"#be185d\">\1</font>", text)
    # Link [text](url)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        r'<link href="\2" color="#2563eb"><u>\1</u></link>',
        text,
    )
    return text


# ── Markdown 라인 단위 파싱 → flowables ──────────────────────
lines = md_content.split("\n")
flowables = []
i = 0

while i < len(lines):
    raw = lines[i]
    line = raw.rstrip()

    # 빈 줄
    if not line.strip():
        flowables.append(Spacer(1, 3))
        i += 1
        continue

    # HR
    if re.match(r"^[\-*_]{3,}\s*$", line):
        flowables.append(Spacer(1, 4))
        flowables.append(
            HRFlowable(
                width="100%",
                thickness=0.5,
                color=colors.HexColor("#d1d5db"),
                spaceBefore=4,
                spaceAfter=4,
            )
        )
        i += 1
        continue

    # Headings
    if line.startswith("# "):
        flowables.append(Paragraph(md_inline(line[2:]), h1))
        i += 1
        continue
    if line.startswith("## "):
        flowables.append(Paragraph(md_inline(line[3:]), h2))
        i += 1
        continue
    if line.startswith("### "):
        flowables.append(Paragraph(md_inline(line[4:]), h3))
        i += 1
        continue

    # Block quote (multi-line)
    if line.startswith("> "):
        q_lines = []
        while i < len(lines) and lines[i].startswith("> "):
            q_lines.append(lines[i][2:].strip())
            i += 1
        # 연속된 빈 인용 라인은 단락 구분으로
        joined = "<br/>".join(q_lines)
        flowables.append(Paragraph(md_inline(joined), quote))
        continue

    # Table (lines starting with |)
    if line.startswith("|"):
        t_lines = []
        while i < len(lines) and lines[i].startswith("|"):
            t_lines.append(lines[i])
            i += 1
        if len(t_lines) >= 2:
            rows = []
            for tl in t_lines:
                if re.match(r"^\|[\s\-:|]+\|\s*$", tl):
                    continue
                cells = [c.strip() for c in tl.split("|")[1:-1]]
                rows.append(cells)
            if rows:
                ncols = max(len(r) for r in rows)
                # pad rows
                for r in rows:
                    while len(r) < ncols:
                        r.append("")

                table_data = []
                for r_idx, row in enumerate(rows):
                    style_for_row = table_header if r_idx == 0 else table_cell
                    new_row = [Paragraph(md_inline(cell), style_for_row) for cell in row]
                    table_data.append(new_row)

                # column widths — A4 폭 약 174mm. 균등 분할.
                page_w = 174 * mm
                col_w = [page_w / ncols] * ncols

                tbl = Table(table_data, hAlign="LEFT", colWidths=col_w)
                tbl.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                flowables.append(Spacer(1, 4))
                flowables.append(tbl)
                flowables.append(Spacer(1, 6))
        continue

    # Bullet list
    if line.startswith("- ") or line.startswith("* "):
        text = "•&nbsp;&nbsp;" + line[2:]
        flowables.append(Paragraph(md_inline(text), bullet))
        i += 1
        continue

    # Numbered list (1. xxx, 2. xxx)
    m_num = re.match(r"^(\d+)\.\s+(.*)$", line)
    if m_num:
        text = f"{m_num.group(1)}.&nbsp;&nbsp;{m_num.group(2)}"
        flowables.append(Paragraph(md_inline(text), bullet))
        i += 1
        continue

    # italic-caption (e.g., last line *마지막 업데이트*)
    if line.startswith("*") and line.endswith("*") and len(line) > 2 and "**" not in line:
        flowables.append(Paragraph(md_inline(line[1:-1]), italic_caption))
        i += 1
        continue

    # 일반 문단
    flowables.append(Paragraph(md_inline(line), body))
    i += 1


# ── PDF 빌드 ──────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUT_PATH,
    pagesize=A4,
    topMargin=15 * mm,
    bottomMargin=15 * mm,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    title="오운(ownapp) 베타 사용 가이드",
    author="ownapp",
)

doc.build(flowables)

# 결과 확인
size_kb = os.path.getsize(OUT_PATH) / 1024
print(f"OK PDF created: {OUT_PATH}")
print(f"   size: {size_kb:.1f} KB")
