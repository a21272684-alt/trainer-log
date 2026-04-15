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

// ── 2. Gemini 프롬프트 생성 ────────────────────────────────────

/**
 * 회원 정보 + 통계를 바탕으로 Gemini 프롬프트 생성
 */
export function buildInsightPrompt(member, stats) {
  const weightSection = stats.latestWeight ? [
    `현재 체중: ${stats.latestWeight}kg`,
    member.start_weight
      ? `시작 체중: ${member.start_weight}kg → 변화: ${(stats.latestWeight - member.start_weight).toFixed(1)}kg`
      : null,
    member.target_weight
      ? `목표 체중: ${member.target_weight}kg (남은 거리: ${(stats.latestWeight - member.target_weight).toFixed(1)}kg)`
      : null,
    stats.trend4w !== null
      ? `최근 4주 추세: 주당 ${stats.trend4w}kg (${parseFloat(stats.trend4w) < 0 ? '감량 중' : '증량 중'})`
      : null,
    stats.avgSleep4w ? `평균 수면 품질: ${stats.avgSleep4w}/5점` : null,
    stats.dietNoteCount ? `식단 기록: ${stats.dietNoteCount}회` : null,
  ].filter(Boolean).map(s => `- ${s}`).join('\n')
    : '- 체중 기록 없음'

  const exerciseSection = stats.topExercises.length
    ? stats.topExercises.map(e => `${e.name}(${e.cnt}회)`).join(', ')
    : '없음'

  const recentLogsSection = stats.recentLogSummaries.length
    ? stats.recentLogSummaries.map(l =>
        `  · ${l.date}${l.session ? ` (${l.session}회차)` : ''}: ${
          l.exercises.length ? l.exercises.join(', ') : ''
        }${l.excerpt ? ' — ' + l.excerpt.slice(0, 60) : ''}`
      ).join('\n')
    : '  없음'

  const attendTrendStr = stats.attendTrend > 0
    ? `전월 대비 +${stats.attendTrend}회 증가`
    : stats.attendTrend < 0
      ? `전월 대비 ${stats.attendTrend}회 감소`
      : '전월과 동일'

  const alertFlags = []
  if (stats.daysSinceLast !== null && stats.daysSinceLast >= 7) alertFlags.push(`마지막 출석 ${stats.daysSinceLast}일 경과`)
  if (stats.attendTrend < -1) alertFlags.push('출석 빈도 하락세')
  if (stats.avgSleep4w && parseFloat(stats.avgSleep4w) <= 2) alertFlags.push(`수면 품질 낮음 (${stats.avgSleep4w}/5)`)
  const remain = Math.max(0, (member.total_sessions || 0) - (member.done_sessions || 0))
  if (remain <= 3 && remain > 0) alertFlags.push(`잔여 세션 ${remain}회 — 재등록 필요`)

  return `당신은 퍼스널 트레이너를 돕는 AI 분석 어시스턴트입니다.
아래 회원 데이터를 분석하여 트레이너에게 실용적인 인사이트를 제공해주세요.

[회원 기본 정보]
이름: ${member.name}
운동 목적: ${member.lesson_purpose || '미설정'}
세션 현황: ${member.done_sessions || 0}회 완료 / 전체 ${member.total_sessions || 0}회 (잔여 ${remain}회)
${member.age ? `나이: ${member.age}세` : ''}${member.height ? ` / 키: ${member.height}cm` : ''}

[출석 분석 (총 ${stats.totalAttend}회)]
- 최근 4주: ${stats.recent4wAttend}회 (주 ${stats.weeklyAvg}회 평균, ${attendTrendStr})
- 마지막 출석: ${stats.daysSinceLast !== null ? `${stats.daysSinceLast}일 전` : '기록 없음'}
- 선호 요일: ${stats.topDow ? `${stats.topDow}요일 (${stats.byDow[stats.topDow]}회)` : '데이터 부족'}
- 최대 연속 출석: ${stats.maxStreak}회

[체중/건강]
${weightSection}

[수업 기록 (총 ${stats.totalLogs}회)]
- 최근 4주: ${stats.recent4wLogs}회 (평균 수업 간격 ${stats.avgGapDays ? `${stats.avgGapDays}일` : '데이터 부족'})
- 주요 운동 종목: ${exerciseSection}
${stats.avgVolume ? `- 평균 운동 볼륨: ${stats.avgVolume.toLocaleString()}kg` : ''}
- 최근 수업 요약:
${recentLogsSection}
${alertFlags.length ? `\n[⚠️ 주의 신호]\n${alertFlags.map(f => `- ${f}`).join('\n')}` : ''}

위 데이터를 바탕으로 다음 4가지를 간결하게 작성해주세요.
각 항목은 2~3문장 이내, 구체적 수치 포함, 한국어로 작성:

✅ 긍정적 변화 (2가지)
⚠️ 주의사항 (1~2가지)
💡 다음 수업 제안 (구체적 운동/방향 포함)
💪 회원 동기부여 한마디 (회원에게 직접 전달 가능한 짧은 문장)`
}

// ── 3. Gemini API 호출 ────────────────────────────────────────

/**
 * Gemini API를 호출하여 인사이트 텍스트를 반환
 * @param {string} apiKey      - Gemini API 키
 * @param {string} model       - 모델명 (GEMINI_MODEL)
 * @param {string} prompt      - buildInsightPrompt() 결과
 * @returns {Promise<string>}  - AI 응답 텍스트
 */
export async function callGeminiInsight(apiKey, model, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  )
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Gemini API 요청 실패')
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text?.trim()) throw new Error('AI 응답이 비어 있습니다')
  return text
}
