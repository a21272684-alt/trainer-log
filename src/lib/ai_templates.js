/**
 * ai_templates.js
 * ─────────────────────────────────────────────────────────────
 * 수치 데이터 → 자연어 인사이트 변환 프롬프트 템플릿 모음
 *
 * 설계 원칙:
 *   · 템플릿 함수는 순수 함수 (data → string). 부작용 없음.
 *   · callGemini / callGeminiMultipart 로 Gemini 호출 일원화.
 *   · 포맷 유틸리티는 이 파일 안에서만 관리.
 *   · 새 템플릿 추가 시 하단 "확장 가이드" 참조.
 *
 * 현재 템플릿 목록:
 *   1. buildSessionLogPrompt      — 수업일지 자동 생성
 *   2. buildMemberInsightPrompt   — 회원 이탈·성과 AI 분석
 *   3. buildGymWeeklyReportPrompt — 센터 주간 운영 리포트
 *   4. buildChurnInterventionPrompt — 이탈 위험 회원 개입 메시지
 *   5. buildRenewalPrompt         — 만료 회원 재등록 유도 메시지
 *
 * ─────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════
// 0. 공통 Gemini API 호출
// ══════════════════════════════════════════════════════════════

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * 텍스트 전용 Gemini 호출
 * @param {string}  apiKey
 * @param {string}  model     - ex. 'gemini-2.5-flash-lite'
 * @param {string}  prompt
 * @param {object}  [opts]
 * @param {number}  [opts.timeoutMs=30000]
 * @param {object}  [opts.generationConfig]  - temperature, maxOutputTokens 등
 * @returns {Promise<string>} AI 응답 텍스트
 */
export async function callGemini(apiKey, model, prompt, opts = {}) {
  const { timeoutMs = 30000, generationConfig } = opts
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const body = { contents: [{ parts: [{ text: prompt }] }] }
    if (generationConfig) body.generationConfig = generationConfig

    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error?.message || 'Gemini API 오류')
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text?.trim()) throw new Error('AI 응답이 비어 있습니다')
    return text
  } finally {
    clearTimeout(tid)
  }
}

/**
 * 멀티파트(오디오 + 텍스트) Gemini 호출 — 수업 녹음 분석용
 * @param {string}  apiKey
 * @param {string}  model
 * @param {Array}   parts   - [{ inline_data: { mime_type, data } }, { text }] 형태
 * @param {object}  [opts]
 * @returns {Promise<string>}
 */
export async function callGeminiMultipart(apiKey, model, parts, opts = {}) {
  const { timeoutMs = 45000 } = opts
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts }] }),
      signal:  controller.signal,
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error?.message || 'Gemini API 오류')
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text?.trim()) throw new Error('AI 응답이 비어 있습니다')
    return text
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('AI 응답이 지연되어 요청을 종료했습니다. 다시 시도해주세요')
    throw e
  } finally {
    clearTimeout(tid)
  }
}

// ══════════════════════════════════════════════════════════════
// 공통 포맷 유틸리티
// ══════════════════════════════════════════════════════════════

/** 숫자 → 한국 원화 (1,234,000원) */
const krw = n => Number(n || 0).toLocaleString('ko-KR') + '원'

/** 숫자 → 만원 단위 (123만) */
const man = n => (Number(n || 0) / 10000).toFixed(0) + '만원'

/** 전주 대비 화살표 텍스트 */
const arrow = n => n > 0 ? `▲${Math.abs(n)}` : n < 0 ? `▼${Math.abs(n)}` : '→ 동일'

/** 전주 대비 증감률 (%) */
const pct = (curr, prev) =>
  prev === 0 ? '-' : `${curr >= prev ? '+' : ''}${Math.round((curr - prev) / prev * 100)}%`

/** null-safe 소수점 */
const fix = (n, d = 1) => n != null ? Number(n).toFixed(d) : '—'

// ══════════════════════════════════════════════════════════════
// 1. 수업일지 자동 생성 템플릿
// ══════════════════════════════════════════════════════════════

/**
 * 수업 기록 데이터 → 수업일지 생성 프롬프트
 *
 * @param {object} p
 * @param {object} p.trainer          - { name }
 * @param {object} p.member           - { name, done_sessions, total_sessions }
 * @param {Array}  p.exercises        - [{ name, sets:[{ reps, rir, feel }] }]
 * @param {string} [p.rawInput]       - 트레이너 메모 (자유 텍스트)
 * @param {boolean} [p.hasAudio]      - 오디오 파일 포함 여부 (멀티파트 시 true)
 * @returns {string} Gemini 프롬프트
 */
export function buildSessionLogPrompt({ trainer, member, exercises = [], rawInput = '', hasAudio = false }) {
  const remain  = Math.max(0, member.total_sessions - member.done_sessions - 1)
  const session = member.done_sessions + 1
  const today   = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  const exStr = exercises.length
    ? exercises.map(ex => {
        const setsStr = ex.sets.map((s, i) =>
          `  ${i + 1}세트 ${s.reps}회` +
          (s.rir !== '' && s.rir != null ? ` (RIR ${s.rir})` : '') +
          (s.feel ? ` → ${s.feel}` : '')
        ).join('\n')
        return `- ${ex.name}:\n${setsStr}`
      }).join('\n')
    : ''

  const audioInstruction = hasAudio
    ? '위 음성에서 운동·수업 관련 내용만 추출하세요. 사적 대화·잡담은 완전히 무시.\n\n'
    : ''

  return `${audioInstruction}당신은 전문 퍼스널 트레이너의 수업일지 작성 도우미입니다.

⚠️ 작성 규칙:
1. 음성에 수업과 무관한 사적 대화가 포함될 수 있습니다 — 완전히 무시하세요.
2. 세트별 RIR과 감각 피드백을 반드시 포함하세요.
3. 중복 내용 제거, 운동별 분류, 친근하고 전문적인 톤, 이모지 사용.

[트레이너]: ${trainer.name}
[회원]: ${member.name}
[세션]: ${session}회차 (전체 ${member.total_sessions}회 · 잔여 ${remain}회)
${exStr ? `\n[운동 기록]:\n${exStr}` : ''}
${rawInput ? `\n[추가 메모]:\n${rawInput}` : ''}

아래 형식으로 수업일지를 작성해주세요:

📋 수업일지 - ${member.name} 회원님
📅 ${today} | ${session}/${member.total_sessions}회차

🏋️ 오늘의 운동
[운동별 세트 기록 — RIR·감각 포함]

💬 트레이너 코멘트
[오늘 수업 전반 피드백, 잘한 점·보완점]

🎯 다음 수업 목표
[구체적인 목표 2~3가지]

📌 세션 현황: ${session}/${member.total_sessions}회 완료 · 남은 ${remain}회
— ${trainer.name} 드림`
}

// ══════════════════════════════════════════════════════════════
// 2. 회원 AI 인사이트 템플릿
// ══════════════════════════════════════════════════════════════

/**
 * 회원 통계 → AI 인사이트 프롬프트
 * computeStats()의 반환값을 그대로 넣으면 됩니다.
 *
 * @param {object} member - members row
 * @param {object} stats  - memberInsights.computeStats() 반환값
 * @returns {string}
 */
export function buildMemberInsightPrompt(member, stats) {
  const remain = Math.max(0, (member.total_sessions || 0) - (member.done_sessions || 0))

  // ── 체중/건강 섹션 ──────────────────────────────────────
  const weightLines = stats.latestWeight ? [
    `현재 체중: ${stats.latestWeight}kg`,
    member.start_weight
      ? `시작 체중: ${member.start_weight}kg → 변화: ${fix(stats.latestWeight - member.start_weight)}kg`
      : null,
    member.target_weight
      ? `목표 체중: ${member.target_weight}kg (남은 거리: ${fix(stats.latestWeight - member.target_weight)}kg)`
      : null,
    stats.trend4w != null
      ? `최근 4주 추세: 주당 ${stats.trend4w}kg (${parseFloat(stats.trend4w) < 0 ? '감량 중' : '증량 중'})`
      : null,
    stats.avgSleep4w ? `평균 수면 품질: ${stats.avgSleep4w}/10점` : null,
    stats.dietNoteCount ? `식단 기록: ${stats.dietNoteCount}회` : null,
  ].filter(Boolean).map(s => `- ${s}`).join('\n') : '- 체중 기록 없음'

  // ── 주요 운동 종목 ───────────────────────────────────────
  const exerciseStr = stats.topExercises?.length
    ? stats.topExercises.map(e => `${e.name}(${e.cnt}회)`).join(', ')
    : '없음'

  // ── 최근 수업 요약 ───────────────────────────────────────
  const recentLogsStr = stats.recentLogSummaries?.length
    ? stats.recentLogSummaries.map(l =>
        `  · ${l.date}${l.session ? ` (${l.session}회차)` : ''}: ${
          l.exercises?.length ? l.exercises.join(', ') : ''
        }${l.excerpt ? ' — ' + l.excerpt.slice(0, 60) : ''}`
      ).join('\n')
    : '  없음'

  // ── 출석 추세 텍스트 ─────────────────────────────────────
  const attendTrendStr = stats.attendTrend > 0
    ? `전월 대비 +${stats.attendTrend}회 증가`
    : stats.attendTrend < 0
      ? `전월 대비 ${stats.attendTrend}회 감소`
      : '전월과 동일'

  // ── 경보 플래그 ──────────────────────────────────────────
  const alertFlags = [
    stats.daysSinceLast >= 7               && `마지막 출석 ${stats.daysSinceLast}일 경과`,
    stats.attendTrend < -1                 && '출석 빈도 하락세',
    stats.avgSleep4w && parseFloat(stats.avgSleep4w) <= 2 && `수면 품질 낮음 (${stats.avgSleep4w}/10)`,
    remain <= 3 && remain > 0             && `잔여 세션 ${remain}회 — 재등록 필요`,
  ].filter(Boolean)

  return `당신은 퍼스널 트레이너를 돕는 AI 분석 어시스턴트입니다.
아래 회원 데이터를 분석하여 트레이너에게 실용적인 인사이트를 제공해주세요.

[회원 기본 정보]
이름: ${member.name}
운동 목적: ${member.lesson_purpose || '미설정'}
세션 현황: ${member.done_sessions || 0}회 완료 / 전체 ${member.total_sessions || 0}회 (잔여 ${remain}회)
${member.age ? `나이: ${member.age}세` : ''}${member.height ? ` / 키: ${member.height}cm` : ''}

[출석 분석 (총 ${stats.totalAttend}회)]
- 최근 4주: ${stats.recent4wAttend}회 (주 ${stats.weeklyAvg}회 평균, ${attendTrendStr})
- 마지막 출석: ${stats.daysSinceLast != null ? `${stats.daysSinceLast}일 전` : '기록 없음'}
- 선호 요일: ${stats.topDow ? `${stats.topDow}요일 (${stats.byDow[stats.topDow]}회)` : '데이터 부족'}
- 최대 연속 출석: ${stats.maxStreak}회

[체중/건강]
${weightLines}

[수업 기록 (총 ${stats.totalLogs}회)]
- 최근 4주: ${stats.recent4wLogs}회 (평균 수업 간격 ${stats.avgGapDays ? `${stats.avgGapDays}일` : '데이터 부족'})
- 주요 운동 종목: ${exerciseStr}
${stats.avgVolume ? `- 평균 운동 볼륨: ${stats.avgVolume.toLocaleString()}kg` : ''}
- 최근 수업 요약:
${recentLogsStr}
${alertFlags.length ? `\n[⚠️ 주의 신호]\n${alertFlags.map(f => `- ${f}`).join('\n')}` : ''}

위 데이터를 바탕으로 다음 4가지를 간결하게 작성해주세요.
각 항목은 2~3문장 이내, 구체적 수치 포함, 한국어로 작성:

✅ 긍정적 변화 (2가지)
⚠️ 주의사항 (1~2가지)
💡 다음 수업 제안 (구체적 운동/방향 포함)
💪 회원 동기부여 한마디 (회원에게 직접 전달 가능한 짧은 문장)`
}

// ══════════════════════════════════════════════════════════════
// 3. 센터 주간 운영 리포트 템플릿
// ══════════════════════════════════════════════════════════════

/**
 * 센터 주간 통계 → 운영 리포트 프롬프트
 * get_gym_weekly_stats() RPC 반환값을 그대로 넣으면 됩니다.
 *
 * @param {object} stats - get_gym_weekly_stats() 반환값
 * @returns {string}
 */
export function buildGymWeeklyReportPrompt(stats) {
  const weekLabel = `${stats.week_start} ~ ${stats.week_end}`

  const trainerSection = (stats.trainers || []).map(t =>
    `  · ${t.trainer_name}(${t.rank || '미설정'}): 회원 ${t.member_count}명, ` +
    `이번 주 수업 ${t.sessions_week}회, 매출 ${krw(t.revenue_week)}`
  ).join('\n') || '  없음'

  const riskSection = (stats.risk_members || []).map(m =>
    `  · ${m.name} — 위험점수 ${m.risk_score}/100 (${(m.flags || []).slice(0, 2).join(', ')})`
  ).join('\n') || '  없음'

  const expiringSection = (stats.expiring_members || []).map(m =>
    `  · ${m.name} — 잔여 ${m.remain}회 (담당: ${m.trainer || '미배정'})`
  ).join('\n') || '  없음'

  const att = stats.attendance || {}
  const ses = stats.sessions   || {}
  const rev = stats.revenue    || {}
  const mem = stats.members    || {}

  const revTrend = rev.trend >= 0
    ? `전주 대비 +${krw(rev.trend)} 증가`
    : `전주 대비 ${krw(Math.abs(rev.trend))} 감소`

  return `당신은 헬스센터 운영을 분석하는 AI 어시스턴트입니다.
아래 데이터를 바탕으로 센터 대표에게 전달할 주간 운영 요약 리포트를 작성해주세요.

[센터 정보]
센터명: ${stats.gym_name}
기준 기간: ${weekLabel}
소속 트레이너: ${stats.trainer_count}명

[출석 현황]
- 이번 주 총 출석: ${att.this_week}회 (전주 ${att.prev_week}회, ${arrow(att.trend)})

[회원 현황]
- 활성 회원: ${mem.total}명
- 이번 주 신규 등록: ${mem.new_this_week}명
- 만료 예정 (잔여 3회 이하): ${mem.expiring}명
- 세션 소진: ${mem.expired}명
- 이탈 위험 (위험점수 50+): ${mem.at_risk}명

[수업 완료]
- 이번 주: ${ses.this_week}회 (전주 ${ses.prev_week}회, ${arrow(ses.trend)})

[매출]
- 이번 주: ${krw(rev.this_week)}
- 전주: ${krw(rev.prev_week)} (${revTrend}, ${pct(rev.this_week, rev.prev_week)})

[트레이너별 현황]
${trainerSection}

[⚠️ 이탈 위험 회원 (즉시 케어 필요)]
${riskSection}

[만료 예정 회원 (재등록 유도 필요)]
${expiringSection}

아래 형식에 맞게 리포트를 한국어로 작성해주세요.
각 항목은 구체적인 수치 포함, 간결하고 실용적으로:

📊 이번 주 핵심 지표 요약 (3줄 이내)
✅ 긍정적 운영 성과 (2가지)
⚠️ 운영 주의사항 (2가지, 이탈 위험·만료 회원 포함)
💡 다음 주 운영 제안 (트레이너 관리 + 회원 케어, 2가지)
💬 센터 대표에게 한마디 (동기부여 한 문장)`
}

// ══════════════════════════════════════════════════════════════
// 4. 이탈 위험 회원 개입 메시지 템플릿
// ══════════════════════════════════════════════════════════════

/**
 * 이탈 위험 회원 → 트레이너가 보낼 개입 메시지 초안 생성
 *
 * @param {object} member     - members row
 * @param {object} riskResult - churnRisk.computeRiskScore() 반환값
 * @returns {string}
 */
export function buildChurnInterventionPrompt(member, riskResult) {
  const level = riskResult.riskLevel   // safe | watch | risk | critical
  const score = riskResult.riskScore
  const flags = riskResult.flags || []
  const detail = riskResult.detail || {}

  const urgency = {
    critical: '매우 긴급 — 즉시 연락이 필요합니다',
    risk:     '긴급 — 이번 주 안에 연락이 필요합니다',
    watch:    '주의 — 소극적 관심 표현이 필요합니다',
    safe:     '안전',
  }[level]

  return `당신은 퍼스널 트레이너를 돕는 AI 커뮤니케이션 도우미입니다.
아래 이탈 위험 분석 결과를 바탕으로, 트레이너가 회원에게 보낼 개입 메시지를 작성해주세요.

[회원 정보]
이름: ${member.name}
운동 목적: ${member.lesson_purpose || '미설정'}
잔여 세션: ${Math.max(0, (member.total_sessions || 0) - (member.done_sessions || 0))}회

[이탈 위험 분석]
위험 점수: ${score}/100점 (${level.toUpperCase()})
긴급도: ${urgency}
감지된 신호:
${flags.length ? flags.map(f => `  · ${f}`).join('\n') : '  없음'}

[세부 지표]
- 최근 2주 출석: ${detail.recentAttend ?? '—'}회 (이전 ${detail.prevAttend ?? '—'}회)
- 마지막 출석: ${detail.daysSinceLast != null ? `${detail.daysSinceLast}일 전` : '기록 없음'}
- 최근 수업 평점: ${detail.recentRatingAvg != null ? fix(detail.recentRatingAvg) + '/5' : '미입력'}

아래 3가지를 작성해주세요:

📱 카카오톡 메시지 (100자 이내, 친근하고 자연스럽게 — 이탈 징후 언급 없이)
📞 전화 스크립트 (오프닝 멘트 2~3문장)
🎁 재방문 유도 제안 (회원 맞춤 혜택 or 동기부여 아이디어 1가지)`
}

// ══════════════════════════════════════════════════════════════
// 5. 만료 회원 재등록 유도 메시지 템플릿
// ══════════════════════════════════════════════════════════════

/**
 * 만료 임박/만료 회원 → 재등록 유도 메시지 초안
 *
 * @param {object} member    - members row
 * @param {object} [stats]   - 선택: memberInsights.computeStats() 반환값
 * @returns {string}
 */
export function buildRenewalPrompt(member, stats = null) {
  const remain  = Math.max(0, (member.total_sessions || 0) - (member.done_sessions || 0))
  const isExpired = remain <= 0
  const period = isExpired ? '만료' : `잔여 ${remain}회`

  const progressLines = stats ? [
    stats.latestWeight && member.start_weight
      ? `체중 변화: ${member.start_weight}kg → ${stats.latestWeight}kg (${fix(stats.latestWeight - member.start_weight)}kg)`
      : null,
    `총 수업 완료: ${member.done_sessions}회`,
    stats.totalAttend ? `총 출석: ${stats.totalAttend}회` : null,
    member.target_weight && stats.latestWeight
      ? `목표까지 남은 거리: ${fix(stats.latestWeight - member.target_weight)}kg`
      : null,
  ].filter(Boolean).join('\n') : `총 수업 완료: ${member.done_sessions}회`

  return `당신은 퍼스널 트레이너의 고객 관리를 돕는 AI입니다.
아래 회원의 운동 성과를 기반으로, 재등록을 자연스럽게 유도하는 메시지를 작성해주세요.

[회원 정보]
이름: ${member.name}
세션 현황: ${period}
운동 목적: ${member.lesson_purpose || '미설정'}
${member.target_weight ? `목표 체중: ${member.target_weight}kg` : ''}

[그동안의 성과]
${progressLines}

⚠️ 작성 규칙:
- 회원의 노력과 성과를 구체적 수치로 칭찬하세요.
- 재등록을 강요하지 말고, 자연스럽게 다음 단계를 제안하세요.
- 목표 달성까지 남은 여정을 동기부여로 활용하세요.

아래 3가지를 작성해주세요:

💌 재등록 제안 카카오톡 메시지 (150자 이내)
🏆 이번 등록 기간 성과 요약 멘트 (수업 중 직접 전달용, 2~3문장)
📋 다음 등록 기간 추천 목표 (구체적 운동 목표 2가지)`
}

// ══════════════════════════════════════════════════════════════
// Template 6. buildRoutineAnalysisPrompt — 루틴 밸런스·볼륨 분석
// ══════════════════════════════════════════════════════════════

/**
 * educator 가 제작한 루틴 템플릿의 구조를 분석하고
 * 밸런스·볼륨·강도 피드백을 생성하는 프롬프트.
 *
 * @param {object} params
 * @param {string}  params.title
 * @param {string}  params.goal       — 'strength'|'hypertrophy'|'fat_loss'|'endurance'|'rehab'
 * @param {string}  params.level      — 'beginner'|'intermediate'|'advanced'
 * @param {number}  params.durationWeeks
 * @param {number}  params.daysPerWeek
 * @param {Array}   params.weeksData  — weeks_data JSONB 배열
 * @param {string}  [params.lang='ko']
 */
export function buildRoutineAnalysisPrompt({
  title,
  goal,
  level,
  durationWeeks,
  daysPerWeek,
  weeksData,
  lang = 'ko',
}) {
  const GOAL_KR = { strength:'근력 향상', hypertrophy:'근비대', fat_loss:'다이어트·체지방 감소', endurance:'체력·지구력', rehab:'재활·교정' }
  const LEVEL_KR = { beginner:'초급', intermediate:'중급', advanced:'고급' }

  // 근육 그룹별 세트 수 집계
  const muscleSetMap = {}
  let totalSets = 0

  weeksData.forEach(week => {
    week.days?.forEach(day => {
      day.exercises?.forEach(ex => {
        const sets = ex.sets?.length || 0
        totalSets += sets
        const muscles = ex.primary_muscles || []
        muscles.forEach(m => {
          muscleSetMap[m] = (muscleSetMap[m] || 0) + sets
        })
      })
    })
  })

  // 주당 평균으로 환산
  const weeklyMuscleMap = {}
  Object.entries(muscleSetMap).forEach(([m, s]) => {
    weeklyMuscleMap[m] = (s / (durationWeeks || 1)).toFixed(1)
  })

  // 종목 목록
  const exerciseNames = new Set()
  weeksData.forEach(week =>
    week.days?.forEach(day =>
      day.exercises?.forEach(ex => ex.name && exerciseNames.add(ex.name))
    )
  )

  // 1주차 요약
  const week1 = weeksData[0]
  const week1Summary = (week1?.days || []).map(d =>
    `  · ${d.label}: ${(d.exercises || []).map(e => `${e.name}(${e.sets?.length || 0}세트)`).join(', ')}`
  ).join('\n')

  return `당신은 퍼스널 트레이닝 전문가이자 운동 프로그래밍 코치입니다.
아래 루틴 템플릿을 분석하고 전문적인 피드백을 제공해주세요.

──────────────────────────────────────
📋 루틴 정보
──────────────────────────────────────
제목: ${title}
목표: ${GOAL_KR[goal] || goal}
레벨: ${LEVEL_KR[level] || level}
기간: ${durationWeeks}주 / 주 ${daysPerWeek}일
총 종목 수: ${exerciseNames.size}가지
주당 평균 총 세트: ${(totalSets / (durationWeeks || 1)).toFixed(0)}세트

──────────────────────────────────────
💪 근육 그룹별 주당 평균 세트
──────────────────────────────────────
${Object.entries(weeklyMuscleMap).map(([m, s]) => `${m}: ${s}세트`).join('\n') || '데이터 없음'}

──────────────────────────────────────
📅 1주차 구성
──────────────────────────────────────
${week1Summary || '1주차 데이터 없음'}

──────────────────────────────────────
🎯 사용 종목
──────────────────────────────────────
${[...exerciseNames].join(', ') || '없음'}

⚠️ 분석 지침:
- 목표(${GOAL_KR[goal] || goal})와 레벨(${LEVEL_KR[level] || level})에 맞는 프로그래밍인지 검토하세요.
- 근육 그룹 간 밸런스 (전면/후면, 상체/하체, 밀기/당기기)를 평가하세요.
- 볼륨이 너무 적거나 많은 근육 그룹을 지적하세요.
- 구체적인 개선 제안을 2~3가지 제시하세요.
- 긍정적인 강점도 반드시 언급하세요.
- 한국 피트니스 현장 용어를 사용하세요.

아래 형식으로 작성해주세요:

✅ 강점 분석 (2~3가지)
[루틴의 잘된 점, 목표 달성에 적합한 요소]

⚖️ 밸런스 평가
[근육 그룹별 볼륨 밸런스, 전면/후면 비율 등]

⚠️ 개선 포인트 (2~3가지)
[부족한 부분, 조정이 필요한 세트/반복 수 등]

💡 개선 제안
[구체적인 종목 추가·교체·세트 조정 방안]

📊 종합 평가
[한 문장으로 이 루틴의 전반적인 퀄리티 평가]`
}

// ══════════════════════════════════════════════════════════════
// 7. 음식 사진 인식 → 영양소 분석 (비전 멀티파트)
// ══════════════════════════════════════════════════════════════

/**
 * 음식 사진 → 영양소 JSON 추출 프롬프트 (이미지 + 텍스트 멀티파트 사용)
 * callGeminiMultipart(apiKey, model, parts) 의 parts 배열을 반환합니다.
 *
 * @param {string} base64Data  - 이미지 base64 (data: 접두사 제외)
 * @param {string} mimeType    - 'image/jpeg' | 'image/png' | 'image/webp'
 * @returns {Array} Gemini multipart parts
 */
export function buildFoodVisionParts(base64Data, mimeType) {
  return [
    { inline_data: { mime_type: mimeType, data: base64Data } },
    {
      text: `당신은 식품 영양학 전문가 AI입니다. 이 음식 사진을 분석하여 아래 JSON 형식으로만 응답해주세요. 다른 텍스트는 절대 포함하지 마세요.

음식이 여러 가지라면 가장 대표적인 주요 음식 하나만 분석하세요.
모든 영양소 값은 반드시 "100g당" 기준으로 환산해서 작성하세요.
추정이 어려울 경우 일반적인 한국 음식 데이터베이스 기준 평균값을 사용하세요.

{
  "food_name": "음식 이름 (한국어)",
  "estimated_amount_g": 추정 섭취량(숫자, 단위 없음),
  "per_100g": {
    "calories": 칼로리(kcal),
    "protein": 단백질(g),
    "carbs": 탄수화물(g),
    "fat": 지방(g),
    "fiber": 식이섬유(g),
    "sodium": 나트륨(mg),
    "sugar": 당류(g)
  },
  "confidence": "high" | "medium" | "low"
}`,
    },
  ]
}

/**
 * Gemini 응답 텍스트 → 영양소 객체 파싱
 * per_100g 값을 per_g(g당)로 정규화합니다.
 *
 * @param {string} text - callGeminiMultipart 응답 텍스트
 * @returns {{ food_name, estimated_amount_g, calories_per_g, protein_per_g, carbs_per_g, fat_per_g, fiber_per_g, sodium_per_g, sugar_per_g, confidence }}
 */
export function parseFoodVisionResult(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다')
  const raw = JSON.parse(jsonMatch[0])
  const p = raw.per_100g || {}
  const div = (v) => (v != null ? Number(v) / 100 : null)
  return {
    food_name:        raw.food_name || '알 수 없는 음식',
    estimated_amount_g: Number(raw.estimated_amount_g) || 100,
    calories_per_g:   div(p.calories),
    protein_per_g:    div(p.protein),
    carbs_per_g:      div(p.carbs),
    fat_per_g:        div(p.fat),
    fiber_per_g:      div(p.fiber),
    sodium_per_g:     div(p.sodium),  // mg/g (나트륨은 mg 단위 유지)
    sugar_per_g:      div(p.sugar),
    confidence:       raw.confidence || 'medium',
  }
}

// ══════════════════════════════════════════════════════════════
// 확장 가이드
// ══════════════════════════════════════════════════════════════
//
// 새 템플릿 추가 방법:
//
// 1. 순수 함수로 작성: (data: object) => string
// 2. 함수명은 build[Target][Type]Prompt 패턴 사용
//    ex. buildMealPlanPrompt, buildInjuryReportPrompt
// 3. 포맷 유틸(krw, arrow, fix 등)은 이 파일의 것을 재사용
// 4. JSDoc에 @param 타입 명시 (어떤 데이터를 받는지)
// 5. 프롬프트 마지막에 출력 형식 지정 (섹션 이모지 포함 권장)
//
// 호출 예시:
//   import { callGemini, buildMemberInsightPrompt } from './ai_templates'
//   const prompt = buildMemberInsightPrompt(member, stats)
//   const result = await callGemini(apiKey, GEMINI_MODEL, prompt)
