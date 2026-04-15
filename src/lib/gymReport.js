/**
 * gymReport.js
 * 센터 운영 주간 리포트 자동 생성 모듈
 *
 * 사용 모델: GEMINI_MODEL (gemini-2.5-flash-lite)
 * ※ 'gemini-3.1-flash-lite-preview'는 존재하지 않는 모델명.
 *    Gemini 최신 릴리즈 목록: https://ai.google.dev/gemini-api/docs/models
 *
 * 실행 흐름:
 *   1. pg_cron (월요일 00:00 UTC) → gym_weekly_reports 에 pending 행 생성
 *   2. 앱 로드 시 checkMondayReport() 호출
 *   3. pending 레코드 발견 → get_gym_weekly_stats() RPC 호출
 *   4. buildWeeklyReportPrompt() 로 프롬프트 조합
 *   5. Gemini API 호출 → report_text 생성
 *   6. save_weekly_report() RPC 로 DB 저장
 */

// ── 1. 데이터 수집 ──────────────────────────────────────────

/**
 * Supabase RPC로 주간 운영 통계를 수집
 * @param {object} supabase
 * @param {string} gymId
 * @param {Date|string} weekStart - 해당 주 월요일 (생략 시 직전 주 자동 계산)
 */
export async function collectWeeklyStats(supabase, gymId, weekStart = null) {
  const ws = weekStart
    ? (weekStart instanceof Date ? weekStart.toISOString().split('T')[0] : weekStart)
    : getPrevMondayStr()

  const { data, error } = await supabase.rpc('get_gym_weekly_stats', {
    p_gym_id:     gymId,
    p_week_start: ws,
  })
  if (error) throw new Error(`통계 수집 실패: ${error.message}`)
  return data   // JSONB → JS object
}

/** 직전 주 월요일 날짜 문자열 (YYYY-MM-DD) */
export function getPrevMondayStr() {
  const d = new Date()
  const day = d.getDay()               // 0=일, 1=월 ...
  const diffToLastMonday = ((day + 6) % 7) + 7  // 최소 7일 전 월요일
  d.setDate(d.getDate() - diffToLastMonday)
  return d.toISOString().split('T')[0]
}

/** 이번 주 월요일 날짜 문자열 */
export function getThisMondayStr() {
  const d = new Date()
  const day = d.getDay()
  const diff = (day + 6) % 7           // 월=0, 화=1 ...
  d.setDate(d.getDate() - diff)
  return d.toISOString().split('T')[0]
}

/** 오늘이 월요일인지 확인 */
export function isMonday() {
  return new Date().getDay() === 1
}

// ── 2. Gemini 프롬프트 생성 ─────────────────────────────────

/**
 * 주간 통계 JSON → 센터 운영 요약 리포트 Gemini 프롬프트
 * @param {object} stats - collectWeeklyStats() 반환값
 */
export function buildWeeklyReportPrompt(stats) {
  const fmt = n => Number(n).toLocaleString('ko-KR')
  const pct = (a, b) => b === 0 ? '-' : `${a >= b ? '+' : ''}${Math.round((a-b)/b*100)}%`
  const arrow = n => n > 0 ? `▲${Math.abs(n)}` : n < 0 ? `▼${Math.abs(n)}` : '→0'

  const weekLabel = `${stats.week_start} ~ ${stats.week_end}`

  // 트레이너별 현황 섹션
  const trainerSection = (stats.trainers || []).map(t =>
    `  · ${t.trainer_name}(${t.rank || '미설정'}): 회원 ${t.member_count}명, ` +
    `이번 주 수업 ${t.sessions_week}회, 매출 ${fmt(t.revenue_week)}원`
  ).join('\n') || '  없음'

  // 이탈 위험 회원
  const riskSection = (stats.risk_members || []).map(m =>
    `  · ${m.name} — 위험점수 ${m.risk_score}/100 (${
      (m.flags || []).slice(0, 2).join(', ')
    })`
  ).join('\n') || '  없음'

  // 만료 예정 회원
  const expiringSection = (stats.expiring_members || []).map(m =>
    `  · ${m.name} — 잔여 ${m.remain}회 (담당: ${m.trainer || '미배정'})`
  ).join('\n') || '  없음'

  // 매출 트렌드
  const revTrend = stats.revenue.trend >= 0
    ? `전주 대비 +${fmt(stats.revenue.trend)}원 증가`
    : `전주 대비 ${fmt(Math.abs(stats.revenue.trend))}원 감소`

  return `당신은 헬스센터 운영을 분석하는 AI 어시스턴트입니다.
아래 데이터를 바탕으로 센터 대표(gym_owner)에게 전달할 주간 운영 요약 리포트를 작성해주세요.

[센터 정보]
센터명: ${stats.gym_name}
기준 기간: ${weekLabel}
소속 트레이너: ${stats.trainer_count}명

[출석 현황]
- 이번 주 총 출석: ${stats.attendance.this_week}회 (전주 ${stats.attendance.prev_week}회, ${arrow(stats.attendance.trend)})

[회원 현황]
- 활성 회원: ${stats.members.total}명
- 이번 주 신규 등록: ${stats.members.new_this_week}명
- 만료 예정 (잔여 3회 이하): ${stats.members.expiring}명
- 세션 소진: ${stats.members.expired}명
- 이탈 위험 (위험점수 50+): ${stats.members.at_risk}명

[수업 완료]
- 이번 주: ${stats.sessions.this_week}회 (전주 ${stats.sessions.prev_week}회, ${arrow(stats.sessions.trend)})

[매출]
- 이번 주: ${fmt(stats.revenue.this_week)}원
- 전주: ${fmt(stats.revenue.prev_week)}원 (${revTrend}, ${pct(stats.revenue.this_week, stats.revenue.prev_week)})

[트레이너별 현황]
${trainerSection}

[⚠️ 이탈 위험 회원 (즉시 케어 필요)]
${riskSection}

[만료 예정 회원 (재등록 유도 필요)]
${expiringSection}

위 데이터를 바탕으로 아래 형식에 맞게 센터 운영 요약 리포트를 한국어로 작성해주세요.
각 항목은 구체적인 수치 포함, 간결하고 실용적으로 작성:

📊 이번 주 핵심 지표 요약 (3줄 이내)
✅ 긍정적 운영 성과 (2가지)
⚠️ 운영 주의사항 (2가지, 이탈 위험·만료 회원 관련 포함)
💡 다음 주 운영 제안 (트레이너 관리 + 회원 케어 관점, 2가지)
💬 센터 대표에게 한마디 (동기부여 한 문장)`
}

// ── 3. Gemini API 호출 ──────────────────────────────────────

/**
 * Gemini API를 호출하여 리포트 텍스트 반환
 * @param {string} apiKey
 * @param {string} model       - GEMINI_MODEL 상수 사용
 * @param {string} prompt
 */
export async function callGeminiReport(apiKey, model, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  )
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Gemini API 오류')
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text?.trim()) throw new Error('AI 응답이 비어 있습니다')
  return text
}

// ── 4. 전체 파이프라인 ──────────────────────────────────────

/**
 * 주간 리포트 생성 전체 파이프라인
 * @param {object}   supabase
 * @param {string}   apiKey    - Gemini API 키
 * @param {string}   model     - GEMINI_MODEL
 * @param {string}   gymId
 * @param {string}   reportId  - gym_weekly_reports.id (pending 레코드)
 * @param {string}   weekStart - YYYY-MM-DD
 * @param {function} onStatus  - (msg: string) => void  진행 상태 콜백
 * @returns {Promise<{reportText: string, stats: object}>}
 */
export async function generateWeeklyReport({
  supabase,
  apiKey,
  model,
  gymId,
  reportId,
  weekStart,
  onStatus = () => {},
}) {
  // ① generating 상태로 변경 (중복 실행 방지)
  await supabase
    .from('gym_weekly_reports')
    .update({ status: 'generating' })
    .eq('id', reportId)

  try {
    // ② 통계 수집
    onStatus('📊 운영 데이터 수집 중...')
    const stats = await collectWeeklyStats(supabase, gymId, weekStart)

    // ③ 프롬프트 생성
    onStatus('✍️ 리포트 프롬프트 생성 중...')
    const prompt = buildWeeklyReportPrompt(stats)

    // ④ Gemini 호출
    onStatus('🤖 AI 리포트 생성 중...')
    const reportText = await callGeminiReport(apiKey, model, prompt)

    // ⑤ 결과 저장
    onStatus('💾 리포트 저장 중...')
    await supabase.rpc('save_weekly_report', {
      p_report_id:   reportId,
      p_report_text: reportText,
      p_stats:       stats,
    })

    onStatus('✅ 완료')
    return { reportText, stats }

  } catch (err) {
    // 실패 시 에러 기록
    await supabase.rpc('fail_weekly_report', {
      p_report_id: reportId,
      p_error:     err.message,
    })
    throw err
  }
}

// ── 5. 월요일 자동 감지 + pending 생성 ─────────────────────

/**
 * 앱 로드 시 호출: 월요일이면 pending 리포트를 생성/반환
 * pg_cron 미사용 환경(Free 플랜)에서 클라이언트가 직접 생성
 *
 * @param {object} supabase
 * @param {string} gymId
 * @returns {Promise<object|null>} pending/error 레코드 또는 null
 */
export async function checkAndEnsurePendingReport(supabase, gymId) {
  if (!gymId) return null

  // 기존 pending / generating / error 레코드 조회
  const { data: existing } = await supabase
    .from('gym_weekly_reports')
    .select('*')
    .eq('gym_id', gymId)
    .in('status', ['pending', 'generating', 'error'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return existing

  // 월요일이면 이번 주 pending 생성
  if (isMonday()) {
    const { data } = await supabase.rpc('create_pending_weekly_report', {
      p_gym_id: gymId,
    })
    // 새로 생성된 레코드 조회
    if (data) {
      const { data: row } = await supabase
        .from('gym_weekly_reports')
        .select('*')
        .eq('id', data)
        .single()
      return row
    }
  }

  return null
}

/**
 * 최근 리포트 목록 조회 (최대 8주)
 * @param {object} supabase
 * @param {string} gymId
 */
export async function fetchRecentReports(supabase, gymId) {
  const { data, error } = await supabase
    .from('gym_weekly_reports')
    .select('*')
    .eq('gym_id', gymId)
    .order('week_start', { ascending: false })
    .limit(8)
  if (error) throw error
  return data || []
}

// ── 6. 리포트 텍스트 파서 ───────────────────────────────────

const SECTION_MAP = {
  '📊': { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
  '✅': { color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)' },
  '⚠️': { color: '#facc15', bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.2)' },
  '💡': { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
  '💬': { color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.2)'  },
}

/**
 * AI 응답 텍스트를 섹션 배열로 파싱
 * @param {string} text
 * @returns {{ emoji: string, style: object, body: string }[]}
 */
export function parseReportSections(text) {
  const EMOJIS = Object.keys(SECTION_MAP)
  const sections = []
  let current = null

  text.split('\n').forEach(line => {
    const emoji = EMOJIS.find(e => line.startsWith(e))
    if (emoji) {
      if (current) sections.push(current)
      current = { emoji, style: SECTION_MAP[emoji], lines: [line] }
    } else if (current) {
      current.lines.push(line)
    } else {
      sections.push({ emoji: null, style: null, lines: [line] })
    }
  })
  if (current) sections.push(current)

  return sections
    .map(s => ({ ...s, body: s.lines.join('\n').trim() }))
    .filter(s => s.body)
}
