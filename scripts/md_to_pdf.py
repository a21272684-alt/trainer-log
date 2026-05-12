"""
docs/베타-사용가이드.md → docs/베타-사용가이드.pdf 변환 스크립트 (v2).

전략: Markdown → HTML (CSS 임베드) → Edge 헤드리스 → PDF
  - Edge/Chromium 이 컬러 이모지 + 한국어 + 모든 CSS 완벽 렌더링
  - 외부 의존 0 추가 (Edge 는 Windows 기본 설치)
  - GitHub-like 다채로운 스타일 + 화이트 배경
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

import markdown

# ── 입출력 경로 ───────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MD_PATH = os.path.join(ROOT, "docs", "베타-사용가이드.md")
OUT_PATH = os.path.join(ROOT, "docs", "베타-사용가이드.pdf")

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not os.path.exists(EDGE_PATH):
    EDGE_PATH = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not os.path.exists(EDGE_PATH):
    EDGE_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(EDGE_PATH):
    sys.exit("Edge / Chrome 둘 다 못 찾았어요. PDF 생성 불가.")


# ── Markdown → HTML 변환 ──────────────────────────────────────
with open(MD_PATH, "r", encoding="utf-8") as f:
    md_content = f.read()

md = markdown.Markdown(
    extensions=[
        "tables",          # | --- | --- | 표 지원
        "fenced_code",     # ``` 코드블록
        "sane_lists",      # 일관된 list 처리
        "nl2br",           # 줄바꿈 → <br/>
    ],
    output_format="html5",
)
html_body = md.convert(md_content)


# ── HTML 템플릿 (GitHub-like 다채로운 스타일, 화이트 배경) ─────
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>오운(ownapp) 베타 사용 가이드</title>
<style>
  @page {
    size: A4;
    margin: 14mm 14mm 14mm 14mm;
  }
  html, body {
    background: #ffffff;
    color: #1f2328;
    font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji',
                 'Malgun Gothic', '맑은 고딕', 'Noto Sans KR', sans-serif;
    font-size: 11pt;
    line-height: 1.65;
    margin: 0;
    padding: 0;
    word-break: keep-all;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* 헤딩 */
  h1, h2, h3, h4 {
    font-weight: 800;
    line-height: 1.3;
    margin: 1.4em 0 0.5em;
    color: #111;
  }
  h1 {
    font-size: 24pt;
    border-bottom: 3px solid #c8f135;
    padding-bottom: 8px;
    margin-top: 0.6em;
    color: #0f0f0f;
  }
  h1:first-of-type {
    margin-top: 0;
  }
  h2 {
    font-size: 17pt;
    color: #1f2937;
    border-bottom: 1.5px solid #e5e7eb;
    padding-bottom: 5px;
    margin-top: 1.6em;
  }
  h3 {
    font-size: 13pt;
    color: #374151;
    margin-top: 1.2em;
  }
  h3::before {
    content: "";
    display: inline-block;
    width: 5px;
    height: 16px;
    background: #c8f135;
    margin-right: 8px;
    vertical-align: -3px;
    border-radius: 2px;
  }

  /* 단락 */
  p {
    margin: 0.4em 0 0.6em;
  }

  /* 리스트 */
  ul, ol {
    margin: 0.3em 0 0.8em;
    padding-left: 1.6em;
  }
  ul li, ol li {
    margin: 0.25em 0;
  }
  ul {
    list-style-type: none;
    padding-left: 1.2em;
  }
  ul li::before {
    content: "•";
    color: #4d7c0f;
    font-weight: 700;
    display: inline-block;
    width: 1em;
    margin-left: -1em;
  }
  ol li::marker {
    color: #4d7c0f;
    font-weight: 700;
  }
  /* 중첩 리스트 */
  ul ul, ol ul, ul ol, ol ol {
    margin: 0.2em 0;
  }
  ul ul li::before {
    content: "◦";
    color: #9ca3af;
  }

  /* 굵게 / 기울임 / 코드 */
  strong, b {
    color: #0f0f0f;
    font-weight: 700;
  }
  em, i {
    color: #4b5563;
  }
  code {
    background: #f6f8fa;
    color: #be185d;
    padding: 1.5px 6px;
    border-radius: 4px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 0.92em;
    border: 1px solid #e5e7eb;
  }
  pre {
    background: #f6f8fa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 14px;
    overflow-x: auto;
    font-size: 9.5pt;
  }
  pre code {
    background: transparent;
    color: #1f2328;
    padding: 0;
    border: none;
  }

  /* 링크 */
  a {
    color: #2563eb;
    text-decoration: underline;
  }

  /* 인용 (>) */
  blockquote {
    background: #fffbeb;
    border-left: 4px solid #facc15;
    border-radius: 0 8px 8px 0;
    padding: 10px 16px;
    margin: 0.8em 0;
    color: #78350f;
    font-size: 10.5pt;
  }
  blockquote p {
    margin: 0.2em 0;
  }
  blockquote strong {
    color: #92400e;
  }

  /* 표 */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.7em 0 1em;
    font-size: 10pt;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  thead {
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  }
  th, td {
    border: 1px solid #e5e7eb;
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-weight: 700;
    color: #0f0f0f;
    background: #f8fafc;
  }
  tbody tr:nth-child(even) {
    background: #fafbfc;
  }
  tbody tr:hover {
    background: #f6fce3;
  }

  /* 가로선 */
  hr {
    border: none;
    border-top: 1.5px solid #e5e7eb;
    margin: 1.5em 0;
  }

  /* 강조 박스 (인용문 첫 줄 이모지 활용) */
  blockquote:has(strong:first-child) {
    background: #ecfdf5;
    border-left-color: #10b981;
    color: #064e3b;
  }

  /* 페이지 단위 분리 (각 h1 시작 시 새 페이지) */
  h1 {
    page-break-before: auto;
  }
  h1:not(:first-of-type) {
    page-break-before: always;
  }
  h2, h3 {
    page-break-after: avoid;
  }
  table, blockquote, pre {
    page-break-inside: avoid;
  }

  /* 페이지 끝 marker / 최상위 카피 */
  body > p:last-of-type em {
    display: block;
    text-align: center;
    color: #9ca3af;
    font-size: 9.5pt;
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid #e5e7eb;
  }

  /* 표 안의 이모지 살짝 더 큼직 */
  td, th {
    font-size: 10pt;
  }

  /* 헤딩 안 이모지 크기 균일 */
  h1, h2, h3 {
    font-size-adjust: 0.5;
  }
</style>
</head>
<body>
__BODY__
</body>
</html>
"""

html_full = HTML_TEMPLATE.replace("__BODY__", html_body)


# ── 임시 HTML 저장 ────────────────────────────────────────────
tmp_dir = tempfile.mkdtemp(prefix="md2pdf_")
tmp_html = os.path.join(tmp_dir, "guide.html")
with open(tmp_html, "w", encoding="utf-8") as f:
    f.write(html_full)


# ── Edge 헤드리스로 PDF 생성 ──────────────────────────────────
# file:// URL 로 로드. Windows 경로 → file:/// 정규화
file_url = "file:///" + tmp_html.replace("\\", "/").replace(" ", "%20")

cmd = [
    EDGE_PATH,
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",  # 페이지 번호/URL 푸터 제거
    f"--print-to-pdf={OUT_PATH}",
    file_url,
]

print(f"Running: {' '.join(cmd[:1])} ... --print-to-pdf=... {file_url[:60]}...")
result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

if result.returncode != 0:
    print("STDOUT:", result.stdout[:500])
    print("STDERR:", result.stderr[:500])
    sys.exit(f"Edge 실행 실패 (return code {result.returncode})")

# ── 정리 ──────────────────────────────────────────────────────
shutil.rmtree(tmp_dir, ignore_errors=True)

if not os.path.exists(OUT_PATH):
    sys.exit("PDF 파일이 생성되지 않았어요.")

size_kb = os.path.getsize(OUT_PATH) / 1024
print(f"OK PDF created: {OUT_PATH}")
print(f"   size: {size_kb:.1f} KB")
