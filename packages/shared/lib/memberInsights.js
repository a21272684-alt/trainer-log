/**
 * memberInsights.js
 * logs / health_records / attendance 데이터를 분석해서
 * 통계를 계산하고 Gemini AI 인사이트 프롬프트를 생성하는 모듈
 */

// ── 1. 통계 계산 ──────────────────────────────────────────────

const DOW_KR = ['일','월','화','수','목','금','토']

/**
 * 세 테이블의 raw 데이터를 받아 구조화된 통계 객체를 반환
 * @param {Object}   member     - members row
 * @param {Array}    logs       - logs rows (exercises_data JSONB 포함)
 * @param {Array}    health     - health_records rows
 * @param {Array}    attendance - attendance rows
 */
export function computeStats(member, logs, health, attendance) {
  const now          = new Date()
  const MS_DAY       = 1000 * 60 * 60 * 24
  const fourWeeksAgo = new Date(now.getTime() - 28 * MS_DAY)
  const eightWeeksAgo= new Date(now.getTime() - 56 * MS_DAY)

  // ── 출석 통계 ────────────────────────────────────────────────
  const sortedAttend = [...attendance].sort((a, b) =>
    a.attended_date.localeCompare(b.attended_date))

  const recent4wAttend  = attendance.filter(a => new Date(a.attended_date + 'T00:00:00') >= fourWeeksAgo)
  const prev4wAttend    = attendance.filter(a => {
    const d = new Date(a.attended_date + 'T00:00:00')
    return d >= eightWeeksAgo && d < fourWeeksAgo
  })

  // 요일별 집계
  const byDow = {}
  attendance.forEach(a => {
    const dow = DOW_KR[new Date(a.attended_date + 'T00:00:00').getDay()]
    byDow[dow] = (byDow[dow] || 0) + 1
  })
  const topDow = Object.entries(byDow).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // 최대 연속 출석 (3일 이내 gap 허용 → 주 2-3회 패턴 고려)
  let maxStreak = 0, curStreak = 1
  for (let i = 1; i < sortedAttend.length; i++) {
    const prev = new Date(sortedAttend[i - 1].attended_date + 'T00:00:00')
    const curr = new Date(sortedAttend[i].attended_date     + 'T00:00:00')
    const gap  = Math.round((curr - prev) / MS_DAY)
    if (gap <= 4) { curStreak++ } else { curStreak = 1 }
    maxStreak = Math.max(maxStreak, curStreak)
  }
  if (sortedAttend.length === 1) maxStreak = 1

  const lastAttendDate  = attendance.length
    ? [...attendance].sort((a, b) => b.attended_date.localeCompare(a.attended_date))[0].attended_date
    : null
  const daysSinceLast   = lastAttendDate
    ? Math.floor((now - new Date(lastAttendDate + 'T00:00:00')) / MS_DAY)
    : null

  // 출석 빈도 전월 대비
  const attendTrend = recent4wAttend.length - prev4wAttend.length  // +면 증가

  // ── 체중 / 건강 통계 ─────────────────────────────────────────
  const weightRecords = health
    .filter(r => r.morning_weight)
    .sort((a, b) => a.record_date.localeCompare(b.record_date))

  const latestWeight   = weightRecords.length ? weightRecords[weightRecords.length - 1].morning_weight : null
  const oldestWeight   = weightRecords.length ? weightRecords[0].morning_weight : null

  // 최근 4주 체중 추세 (주당 평균 변화)
  const recent4wWeight = weightRecords.filter(r => new Date(r.record_date + 'T00:00:00') >= fourWeeksAgo)
  let trend4w = null
  if (recent4wWeight.length >= 2) {
    const first  = recent4wWeight[0].morning_weight
    const last   = recent4wWeight[recent4wWeight.length - 1].morning_weight
    const days   = Math.max(1,
      (new Date(recent4wWeight[recent4wWeight.length-1].record_date) -
       new Date(recent4wWeight[0].record_date)) / MS_DAY)
    trend4w = ((last - first) / days * 7).toFixed(2)  // 주당 kg
  }

  const sleepRecords = health.filter(r => r.sleep_level != null)
  const avgSleep     = sleepRecords.length
    ? (sleepRecords.reduce((s, r) => s + r.sleep_level, 0) / sleepRecords.length).toFixed(1)
    : null

  const recent4wSleep = health
    .filter(r => r.sleep_level != null && new Date(r.record_date + 'T00:00:00') >= fourWeeksAgo)
  const avgSleep4w    = recent4wSleep.length
    ? (recent4wSleep.reduce((s, r) => s + r.sleep_level, 0) / recent4wSleep.length).toFixed(1)
    : null

  const dietNoteCount = health.filter(r => r.diet_note?.trim()).length

  // ── 수업 통계 ────────────────────────────────────────────────
  const sortedLogs    = [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const recent4wLogs  = logs.filter(l => new Date(l.created_at) >= fourWeeksAgo)
  const prev4wLogs    = logs.filter(l => {
    const d = new Date(l.created_at)
    return d >= eightWeeksAgo && d < fourWeeksAgo
  })

  // 운동 종목 빈도 집계 (exercises_data JSONB)
  const exCount = {}
  logs.forEach(l => {
    ;(l.exercises_data || []).forEach(ex => {
      if (ex.name?.trim()) exCount[ex.name] = (exCount[ex.name] || 0) + 1
    })
  })
  const topExercises = Object.entries(exCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, cnt]) => ({ name, cnt }))

  // 볼륨 추세 (sets weight×reps)
  function calcVolume(log) {
    return (log.exercises_data || []).reduce((total, ex) =>
      total + (ex.sets || []).reduce((s, set) =>
        s + (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0), 0), 0)
  }
  const recentVolumes = sortedLogs.slice(0, 8).map(l => ({ date: l.created_at?.slice(0,10), vol: calcVolume(l) }))
    .filter(v => v.vol > 0)
  const avgVolume = recentVolumes.length
    ? Math.round(recentVolumes.reduce((s, v) => s + v.vol, 0) / recentVolumes.length)
    : 0

  // 수업 간격 평균
  const logDates = sortedLogs.map(l => new Date(l.created_at))
  let avgGapDays = null
  if (logDates.length >= 2) {
    const gaps = []
    for (let i = 0; i < Math.min(logDates.length - 1, 8); i++) {
      gaps.push(Math.abs(logDates[i] - logDates[i + 1]) / MS_DAY)
    }
    avgGapDays = (gaps.reduce((s, g) => s + g, 0) / gaps.length).toFixed(1)
  }

  // 최근 수업 내용 요약 (last 3 logs)
  const recentLogSummaries = sortedLogs.slice(0, 3).map(l => ({
    date:    l.created_at?.slice(0, 10),
    session: l.session_number,
    excerpt: l.content
      ? l.content.replace(/\n+/g, ' ').slice(0, 100) + (l.content.length > 100 ? '...' : '')
      : null,
    exercises: (l.exercises_data || []).map(e => e.name).filter(Boolean).slice(0, 4),
  })).filter(l => l.excerpt || l.exercises.length)

  return {
    // 출석
    totalAttend:   attendance.length,
    recent4wAttend: recent4wAttend.length,
    prev4wAttend:  prev4wAttend.length,
    attendTrend,
    weeklyAvg:     (recent4wAttend.length / 4).toFixed(1),
    byDow,
    topDow,
    maxStreak,
    daysSinceLast,
    lastAttendDate,

    // 체중/건강
    latestWeight,
    oldestWeight,
    trend4w,
    avgSleep,
    avgSleep4w,
    dietNoteCount,
    weightCount:   weightRecords.length,
    healthCount:   health.length,

    // 수업
    totalLogs:     logs.length,
    recent4wLogs:  recent4wLogs.length,
    prev4wLogs:    prev4wLogs.length,
    logTrend:      recent4wLogs.length - prev4wLogs.length,
    topExercises,
    avgVolume,
    recentVolumes,
    avgGapDays,
    recentLogSummaries,
  }
}

// ── 2 & 3. 프롬프트 생성 + API 호출 → ai_templates.js 로 위임 ─
// 하위 호환을 위해 re-export (기존 import 문 변경 불필요)

export { buildMemberInsightPrompt as buildInsightPrompt, callGemini as callGeminiInsight } from './ai_templates'
