/**
 * seed_food_master.mjs
 * ─────────────────────────────────────────────────────────────
 * 식품의약품안전처 식품영양성분 DB → Supabase food_master 테이블 적재
 *
 * 사전 준비:
 *   1. 공공데이터포털(data.go.kr) 회원가입 후 아래 API 신청 (무료)
 *      "식품의약품안전처_식품영양성분 데이터베이스"
 *      https://www.data.go.kr/data/15100070/openapi.do
 *   2. 발급받은 서비스키를 FOOD_API_KEY 환경변수에 설정
 *
 * 실행 방법:
 *   FOOD_API_KEY=발급키 SUPABASE_SERVICE_KEY=서비스롤키 node scripts/seed_food_master.mjs
 *
 * 옵션:
 *   --limit=5000   가져올 최대 건수 (기본: 전체 ~44,000건)
 *   --clear        기존 데이터 삭제 후 재적재
 * ─────────────────────────────────────────────────────────────
 */

const FOOD_API_BASE = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo01/getFoodNtrCpntDbInq01'
const SUPABASE_URL  = 'https://udnyilxwskgkofbvvzfy.supabase.co'
const PAGE_SIZE     = 1000   // 식약처 API 최대 1000건/요청
const BATCH_SIZE    = 500    // Supabase insert 배치 크기

const FOOD_API_KEY      = process.env.FOOD_API_KEY
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE_KEY

const args   = Object.fromEntries(process.argv.slice(2).map(a => a.replace('--','').split('=')))
const LIMIT  = args.limit ? parseInt(args.limit) : Infinity
const CLEAR  = 'clear' in args

// ── 유효성 검사 ──────────────────────────────────────────────
if (!FOOD_API_KEY) {
  console.error('❌  FOOD_API_KEY 환경변수가 없어요.')
  console.error('   export FOOD_API_KEY=여기에_발급키_입력')
  process.exit(1)
}
if (!SUPABASE_SERVICE) {
  console.error('❌  SUPABASE_SERVICE_KEY 환경변수가 없어요.')
  process.exit(1)
}

// ── 식약처 API 호출 ──────────────────────────────────────────
async function fetchPage(pageNo) {
  const params = new URLSearchParams({
    serviceKey: FOOD_API_KEY,
    pageNo:     String(pageNo),
    numOfRows:  String(PAGE_SIZE),
    type:       'json',
  })
  const res  = await fetch(`${FOOD_API_BASE}?${params}`)
  const json = await res.json()
  return json?.body ?? json?.response?.body ?? null
}

// ── 행 정규화 (100g → per_g) ─────────────────────────────────
function normalize(item) {
  const div = v => (v != null && v !== '' && !isNaN(Number(v))) ? Number(v) / 100 : null
  return {
    food_name:      item.FOOD_NM_KR?.trim() || null,
    food_category:  item.FOOD_CAT_NM?.trim() || null,
    calories_per_g: div(item.AMT_NUM1),   // 에너지(kcal/100g)
    protein_per_g:  div(item.AMT_NUM3),   // 단백질(g/100g)
    fat_per_g:      div(item.AMT_NUM4),   // 지방(g/100g)
    carbs_per_g:    div(item.AMT_NUM6),   // 탄수화물(g/100g)
    sugar_per_g:    div(item.AMT_NUM7),   // 당류(g/100g)
    fiber_per_g:    div(item.AMT_NUM8),   // 식이섬유(g/100g)
    sodium_per_g:   div(item.AMT_NUM11),  // 나트륨(mg/100g → mg/g)
    source: '식약처',
  }
}

// ── Supabase 배치 insert ──────────────────────────────────────
async function insertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/food_master`, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_SERVICE,
      'Authorization': `Bearer ${SUPABASE_SERVICE}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase insert 실패: ${err}`)
  }
}

// ── 기존 데이터 삭제 ─────────────────────────────────────────
async function clearTable() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/food_master?id=gt.0`, {
    method:  'DELETE',
    headers: {
      'apikey':        SUPABASE_SERVICE,
      'Authorization': `Bearer ${SUPABASE_SERVICE}`,
    },
  })
  if (!res.ok) throw new Error('테이블 초기화 실패')
  console.log('🗑️  기존 데이터 삭제 완료')
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  console.log('🌾  식약처 식품영양성분 DB → Supabase 적재 시작\n')

  if (CLEAR) await clearTable()

  // 1페이지로 전체 건수 파악
  const first = await fetchPage(1)
  if (!first) { console.error('❌  식약처 API 응답 오류'); process.exit(1) }

  const total     = Math.min(first.totalCount ?? 0, LIMIT)
  const totalPages = Math.ceil(total / PAGE_SIZE)
  console.log(`📊  총 ${total.toLocaleString()}건 / ${totalPages}페이지\n`)

  let inserted = 0
  let buffer   = []

  const flush = async () => {
    if (!buffer.length) return
    await insertBatch(buffer)
    inserted += buffer.length
    buffer = []
  }

  for (let page = 1; page <= totalPages; page++) {
    const body = page === 1 ? first : await fetchPage(page)
    const items = body?.items ?? []

    for (const item of items) {
      if (inserted + buffer.length >= LIMIT) break
      const row = normalize(item)
      if (row.food_name) buffer.push(row)
      if (buffer.length >= BATCH_SIZE) await flush()
    }

    const progress = Math.min(inserted + buffer.length, total)
    process.stdout.write(`\r  [${page}/${totalPages}] ${progress.toLocaleString()}건 처리 중...`)

    if (inserted + buffer.length >= LIMIT) break
  }

  await flush()
  console.log(`\n\n✅  완료: ${inserted.toLocaleString()}건 적재됨`)
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1) })
