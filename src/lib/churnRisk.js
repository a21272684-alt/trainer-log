/**
 * churnRisk.js
 * 회원 이탈 징후 분석 — 클라이언트 사이드 Risk Score 계산 모듈
 *
 * 3가지 신호를 종합하여 0~100점의 위험 점수 산출:
 *   A. 출석 위험도   (0~40점): 최근 2주 출석 하락 + 마지막 출석 경과일
 *   B. 건강기록 중단 (0~30점): 체중·수면 기록 중단 및 수면 품질 저하
 *   C. 수업 평점 저하 (0~30점): 최근 3회 vs 이전 3회 session_rating 비교
 *
 * 위험 등급:
 *    0~29 : safe     🟢 안전
 *   30~49 : watch    🟡 관찰
 *   50~74 : risk     🟠 위험
 *   75~100: critical 🔴 이탈 임박
 */

// ── 상수 ────────────────────────────────────────────────────

export const RISK_LEVELS = {
  safe:     { label: '안전',      color: '#22c55e', bg: '#22c55e18', emoji: '🟢', score: [0,  29] },
  watch:    { label: '관찰',      color: '#eab308', bg: '#eab30818', emoji: '🟡', score: [30, 49] },
  risk:     { label: '위험',      color: '#f97316', bg: '#f9731618', emoji: '🟠', score: [50, 74] },
  critical: { label: '이탈 임박', color: '#ef4444', bg: '#ef444418', emoji: '🔴', score: [75, 100] },
}

/**
 * 위험 등급 객체 반환
 * @param {number} score 0~100
 */
export function getRiskLevel(score) {
  if (score >= 75) return RISK_LEVELS.critical
  if (score >= 50) return RISK_LEVELS.risk
  if (score >= 30) return RISK_LEVELS.watch
  return RISK_LEVELS.safe
}

// ── 핵심 계산 함수 ──────────────────────────────────────────

/**
 * 회원 이탈 위험 점수 계산 (순수 함수 — DB 없이 동작)
 *
 * @param {Object} member     - members row
 * @param {Array}  logs       - logs rows (session_rating 포함)
 * @param {Array}  health     - health_records rows
 * @param {Array}  attendance - attendance rows
 * @returns {{
 *   attendScore: number,   // 0~40
 *   healthScore: number,   // 0~30
 *   ratingScore: number,   // 0~30
 *   riskScore: number,     // 0~100
 *   riskLevel: string,     // 'safe'|'watch'|'risk'|'critical'
 *   flags: string[],       // 위험 사유 목록
 *   detail: Object         // 세부 진단 데이터
 * }}
 */
export function computeRiskScore(member, logs, health, attendance) {
  const now       = new Date()
  const MS_DAY    = 1000 * 60 * 60 * 24
  const today     = new Date(now.toISOString().split('T')[0] + 'T00:00:00')
  const twoWeeks  = new Date(today.getTime() - 14 * MS_DAY)
  const fourWeeks = new Date(today.getTime() - 28 * MS_DAY)

  const flags = []

  // ──────────────────────────────────────────────────────────
  // A. 출석 위험도 (0~40점)
  // ──────────────────────────────────────────────────────────

  const toDate = str => new Date(str + 'T00:00:00')

  const recentAttend = attendance.filter(a => toDate(a.attended_date) > twoWeeks)
  const prevAttend   = attendance.filter(a => {
    const d = toDate(a.attended_date)
    return d > fourWeeks && d <= twoWeeks
  })

  const lastDate = attendance.length
    ? [...attendance].sort((a, b) => b.attended_date.localeCompare(a.attended_date))[0].attended_date
    : null
  const daysSince = lastDate
    ? Math.floor((today - toDate(lastDate)) / MS_DAY)
    : 999

  let attendScore = 0

  // 마지막 출석 경과일
  if (daysSince >= 21) {
    attendScore += 20
    flags.push(`마지막 출석 ${daysSince}일 경과`)
  } else if (daysSince >= 14) {
    attendScore += 13
    flags.push(`마지막 출석 ${daysSince}일 경과`)
  } else if (daysSince >= 7) {
    attendScore += 6
  }

  // 출석 빈도 하락
  const rA = recentAttend.length
  const pA = prevAttend.length
  if (rA === 0 && pA > 0) {
    attendScore += 20
    flags.push(`최근 2주 출석 0회 (이전 ${pA}회)`)
  } else if (pA > 0 && rA / pA < 0.5) {
    attendScore += 12
    flags.push(`출석 빈도 50% 이상 감소 (${pA}→${rA}회)`)
  } else if (rA < pA) {
    attendScore += 5
  }

  attendScore = Math.min(attendScore, 40)

  // ──────────────────────────────────────────────────────────
  // B. 건강기록 중단 (0~30점)
  // ──────────────────────────────────────────────────────────

  const recentHealth = health.filter(r => toDate(r.record_date) > twoWeeks)
  const prevHealth   = health.filter(r => {
    const d = toDate(r.record_date)
    return d > fourWeeks && d <= twoWeeks
  })
  const totalHealth = health.length

  // 기록 중단 여부
  let healthScore = 0
  const rH = recentHealth.length
  const pH = prevHealth.length

  if (rH === 0 && totalHealth >= 3) {
    healthScore += 20
    flags.push('최근 2주 건강 기록 중단')
  } else if (pH > 0 && rH / pH < 0.5) {
    healthScore += 10
    flags.push(`건강 기록 빈도 감소 (${pH}→${rH}건)`)
  }

  // 수면 품질 하락
  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const recentSleeps = recentHealth.filter(r => r.sleep_level != null).map(r => r.sleep_level)
  const prevSleeps   = prevHealth.filter(r => r.sleep_level != null).map(r => r.sleep_level)
  const rSleep = avg(recentSleeps)
  const pSleep = avg(prevSleeps)

  if (rSleep !== null && rSleep <= 2) {
    healthScore += 10
    flags.push(`수면 품질 저하 (평균 ${rSleep.toFixed(1)}/10)`)
  } else if (rSleep !== null && pSleep !== null && pSleep - rSleep >= 2) {
    healthScore += 6
    flags.push(`수면 품질 감소 (${pSleep.toFixed(1)}→${rSleep.toFixed(1)})`)
  }

  healthScore = Math.min(healthScore, 30)

  // ──────────────────────────────────────────────────────────
  // C. 수업 평점 저하 (0~30점)
  // ──────────────────────────────────────────────────────────

  const ratedLogs = [...logs]
    .filter(l => l.session_rating != null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const recent3 = ratedLogs.slice(0, 3).map(l => l.session_rating)
  const prev3   = ratedLogs.slice(3, 6).map(l => l.session_rating)

  const rRating = avg(recent3)
  const pRating = avg(prev3)

  let ratingScore = 0

  if (rRating !== null) {
    if (rRating <= 2) {
      ratingScore += 20
      flags.push(`수업 평점 매우 낮음 (${rRating.toFixed(1)}/5)`)
    } else if (rRating <= 3) {
      ratingScore += 10
      flags.push(`수업 평점 저조 (${rRating.toFixed(1)}/5)`)
    }

    if (pRating !== null) {
      const drop = pRating - rRating
      if (drop >= 1.5) {
        ratingScore += 10
        flags.push(`수업 평점 급락 (${pRating.toFixed(1)}→${rRating.toFixed(1)})`)
      } else if (drop >= 1.0) {
        ratingScore += 5
      }
    }
  }

  ratingScore = Math.min(ratingScore, 30)

  // ──────────────────────────────────────────────────────────
  // 합산
  // ──────────────────────────────────────────────────────────

  const riskScore = attendScore + healthScore + ratingScore
  const level     = riskScore >= 75 ? 'critical'
    : riskScore >= 50 ? 'risk'
    : riskScore >= 30 ? 'watch'
    : 'safe'

  return {
    attendScore,
    healthScore,
    ratingScore,
    riskScore,
    riskLevel: level,
    flags,
    detail: {
      // 출석
      recentAttend: rA,
      prevAttend: pA,
      daysSinceLast: daysSince === 999 ? null : daysSince,
      // 건강
      recentHealthCount: rH,
      prevHealthCount: pH,
      recentSleepAvg: rSleep,
      prevSleepAvg: pSleep,
      // 평점
      recentRatingAvg: rRating,
      prevRatingAvg: pRating,
      ratedCount: ratedLogs.length,
    },
  }
}

// ── Supabase RPC 버전 (DB에서 직접 계산) ───────────────────

/**
 * Supabase RPC로 단일 회원 리스크 점수 계산 + 저장
 * @param {object} supabase - supabase client
 * @param {string} memberId
 */
export async function fetchRiskScore(supabase, memberId) {
  const { data, error } = await supabase.rpc('compute_member_risk', {
    p_member_id: memberId,
  })
  if (error) throw error
  return data?.[0] ?? null
}

/**
 * 트레이너 전 회원 위험 점수 일괄 조회 (저장된 점수)
 * @param {object} supabase
 * @param {string} trainerId
 */
export async function fetchTrainerRiskScores(supabase, trainerId) {
  const { data, error } = await supabase.rpc('get_trainer_risk_scores', {
    p_trainer_id: trainerId,
  })
  if (error) throw error
  return data ?? []
}

/**
 * 트레이너 전 회원 점수 일괄 갱신
 * @param {object} supabase
 * @param {string} trainerId
 * @returns {number} 갱신된 회원 수
 */
export async function refreshAllRiskScores(supabase, trainerId) {
  const { data, error } = await supabase.rpc('refresh_risk_scores', {
    p_trainer_id: trainerId,
  })
  if (error) throw error
  return data
}
