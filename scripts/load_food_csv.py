"""
load_food_csv.py — 식약처 '전국통합식품영양성분정보(음식) 표준데이터' CSV → Supabase food_master 적재.
API 불필요(파일 직접 로드). 표준 라이브러리만 사용(csv, urllib).

사용법 (PowerShell, SUPABASE_SERVICE_KEY 세팅된 창에서):
    $env:SUPABASE_SERVICE_KEY='sb_secret_...'   # 이미 세팅돼 있으면 생략
    python scripts/load_food_csv.py --clear
옵션:
    첫 인자로 CSV 경로 지정 가능 (기본: 바탕화면의 그 파일)
    --clear  기존 food_master 전체 삭제 후 적재
"""
import csv, os, sys, json, urllib.request, urllib.error

DEFAULT_CSV = r"C:\Users\pc\OneDrive\바탕 화면\전국통합식품영양성분정보_음식_표준데이터.csv"
SUPABASE_URL = "https://udnyilxwskgkofbvvzfy.supabase.co"
KEY = os.environ.get("SUPABASE_SERVICE_KEY")

pos_args = [a for a in sys.argv[1:] if not a.startswith("--")]
CSV_PATH = pos_args[0] if pos_args else DEFAULT_CSV
CLEAR = "--clear" in sys.argv

if not KEY:
    sys.exit("❌ SUPABASE_SERVICE_KEY 환경변수가 없어요. PowerShell에서 $env:SUPABASE_SERVICE_KEY='sb_secret_...' 세팅 후 실행하세요.")
if not os.path.exists(CSV_PATH):
    sys.exit(f"❌ CSV 파일을 못 찾았어요: {CSV_PATH}")

def num(v):
    v = (v or "").strip()
    if v == "": return None
    try: return float(v)
    except ValueError: return None

def ref_amount(s):
    d = "".join(ch for ch in (s or "") if ch.isdigit())
    return float(d) if d else 100.0

def per_g(v, ref):
    n = num(v)
    return round(n / ref, 6) if (n is not None and ref) else None

# ── CSV 파싱 (컬럼 인덱스는 표준데이터 스펙 기준) ──
rows = []
with open(CSV_PATH, encoding="cp949", newline="") as f:
    r = csv.reader(f)
    next(r, None)  # 헤더 스킵
    for c in r:
        if len(c) < 30: continue
        name = c[1].strip()
        if not name: continue
        ref = ref_amount(c[16])          # 영양성분함량기준량 (보통 100g)
        rows.append({
            "food_name":      name,       # 식품명
            "food_category":  c[7].strip() or None,   # 식품대분류명
            "calories_per_g": per_g(c[17], ref),  # 에너지(kcal)
            "protein_per_g":  per_g(c[19], ref),  # 단백질(g)
            "fat_per_g":      per_g(c[20], ref),  # 지방(g)
            "carbs_per_g":    per_g(c[22], ref),  # 탄수화물(g)
            "sugar_per_g":    per_g(c[23], ref),  # 당류(g)
            "fiber_per_g":    per_g(c[24], ref),  # 식이섬유(g)
            "sodium_per_g":   per_g(c[29], ref),  # 나트륨(mg)
            "source":         "식약처",
        })
print(f"📄 CSV 파싱 완료: {len(rows):,}건")

def api(method, path, body=None, prefer="return=minimal"):
    data = json.dumps(body).encode() if body is not None else None
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
         "Content-Type": "application/json", "Prefer": prefer}
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status

if CLEAR:
    try:
        api("DELETE", "food_master?id=gt.0")
        print("🗑️  기존 데이터 삭제 완료")
    except urllib.error.HTTPError as e:
        print("⚠️  삭제 경고:", e.code, e.read().decode()[:200])

BATCH = 500
done = 0
for i in range(0, len(rows), BATCH):
    batch = rows[i:i + BATCH]
    try:
        api("POST", "food_master", body=batch)
        done += len(batch)
        print(f"\r  {done:,}/{len(rows):,} 적재중...", end="", flush=True)
    except urllib.error.HTTPError as e:
        sys.exit(f"\n❌ insert 실패: {e.code} {e.read().decode()[:300]}")
print(f"\n✅ 완료: {done:,}건 적재됨")
