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

// ── 프롬프트 생성 + API 호출 → ai_templates.js 로 위임 ────────
// 하위 호환을 위해 re-export
export {
  buildGymWeeklyReportPrompt as buildWeeklyReportPrompt,
  callGemini as callGeminiReport,
} from './ai_templates'

// ── 전체 파이프라인 ──────────────────────────────────────────

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

    // ③ 프롬프트 생성 (ai_templates.buildGymWeeklyReportPrompt)
    onStatus('✍️ 리포트 프롬프트 생성 중...')
    const prompt = buildWeeklyReportPrompt(stats)

    // ④ Gemini 호출 (ai_templates.callGemini)
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
