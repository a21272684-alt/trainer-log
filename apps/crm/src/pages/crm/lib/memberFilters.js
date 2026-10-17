// ── 회원 관리 고급 필터 ─────────────────────────────────────────
// 원장/직원이 직접 고른 조건으로 회원 목록을 좁히는 순수 함수 모음.
// stat = crm_member_stats RPC 결과 행 { total_paid, payment_count, last_paid_at, last_attended }

export const EMPTY_FILTERS = {
  trainerId:  '',
  joinedFrom: '',
  joinedTo:   '',
  remainMin:  '',
  remainMax:  '',
  risk:       '',   // '' | watch | risk | critical  (점수 하한)
  lastPay:    '',   // '' | within30 | over90 | never
  paidMin:    '',
  paidMax:    '',
  lastAtt:    '',   // '' | within7 | over14 | over30
  purpose:    '',
}

export const STATUS_CHIPS = [
  ['all',      '전체'],
  ['active',   '이용 중'],
  ['expiring', '만료 임박'],
  ['expired',  '마감'],
  ['none',     '미등록'],
]

export const RISK_OPTIONS = [
  ['',         '전체'],
  ['watch',    '관찰 이상'],
  ['risk',     '위험 이상'],
  ['critical', '심각'],
]
const RISK_MIN = { watch: 30, risk: 50, critical: 75 }

export const LAST_PAY_OPTIONS = [
  ['',         '전체'],
  ['within30', '30일 이내'],
  ['over90',   '90일 이상 지남'],
  ['never',    '결제 이력 없음'],
]

export const LAST_ATT_OPTIONS = [
  ['',         '전체'],
  ['within7',  '7일 이내'],
  ['over14',   '14일 이상 없음'],
  ['over30',   '30일 이상 없음'],
]

const label = (opts, v) => opts.find(([k]) => k === v)?.[1] ?? v
const num   = v => (v === '' || v == null ? null : Number(v))

export function remainOf(m) {
  return Math.max(0, (m.total_sessions || 0) - (m.done_sessions || 0))
}

export function daysSince(dateLike, today = new Date()) {
  if (!dateLike) return null
  const d = new Date(String(dateLike).slice(0, 10) + 'T00:00:00')
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((t - d) / 86400000)
}

// 결제 이력도 세션도 없으면 미등록, 잔여 0 = 마감, 1~3 = 만료 임박
export function memberStatus(m, stat) {
  const remain = remainOf(m)
  if (!(stat?.payment_count > 0) && !(m.total_sessions > 0)) return 'none'
  if (remain === 0) return 'expired'
  if (remain <= 3)  return 'expiring'
  return 'active'
}

export function matchStatus(status, key) {
  if (key === 'all')    return true
  if (key === 'active') return status === 'active' || status === 'expiring'
  return status === key
}

export function matchFilters(m, stat, riskRow, f, today = new Date()) {
  if (f.trainerId && m.trainer_id !== f.trainerId) return false

  const joined = (m.created_at || '').slice(0, 10)
  if (f.joinedFrom && (!joined || joined < f.joinedFrom)) return false
  if (f.joinedTo   && (!joined || joined > f.joinedTo))   return false

  const remain = remainOf(m)
  if (num(f.remainMin) != null && remain < num(f.remainMin)) return false
  if (num(f.remainMax) != null && remain > num(f.remainMax)) return false

  if (f.risk) {
    const score = riskRow?.risk_score
    if (score == null || score < RISK_MIN[f.risk]) return false
  }

  const paid = Number(stat?.total_paid || 0)
  if (num(f.paidMin) != null && paid < num(f.paidMin)) return false
  if (num(f.paidMax) != null && paid > num(f.paidMax)) return false

  if (f.lastPay) {
    const d = daysSince(stat?.last_paid_at, today)
    if (f.lastPay === 'never'    && d != null) return false
    if (f.lastPay === 'within30' && (d == null || d > 30)) return false
    if (f.lastPay === 'over90'   && (d == null || d < 90)) return false
  }

  if (f.lastAtt) {
    const d = daysSince(stat?.last_attended, today)
    // 출석 기록이 아예 없으면 "N일 이상 없음" 에 포함
    if (f.lastAtt === 'within7' && (d == null || d > 7))  return false
    if (f.lastAtt === 'over14'  && d != null && d < 14)   return false
    if (f.lastAtt === 'over30'  && d != null && d < 30)   return false
  }

  if (f.purpose && m.lesson_purpose !== f.purpose) return false
  return true
}

// 적용 중인 조건을 사람이 읽는 태그로 — [{ key, text }]
export function filterTags(f, trainers) {
  const tags = []
  const won = v => Number(v).toLocaleString() + '원'
  if (f.trainerId) tags.push({ keys: ['trainerId'], text: `담당 ${trainers.find(t => t.id === f.trainerId)?.name ?? '트레이너'}` })
  if (f.joinedFrom || f.joinedTo) tags.push({ keys: ['joinedFrom', 'joinedTo'], text: `등록 ${f.joinedFrom || '처음'} ~ ${f.joinedTo || '오늘'}` })
  if (f.remainMin !== '' || f.remainMax !== '') tags.push({ keys: ['remainMin', 'remainMax'], text: `잔여 ${f.remainMin || 0}~${f.remainMax || '∞'}회` })
  if (f.risk)    tags.push({ keys: ['risk'],    text: `위험도 ${label(RISK_OPTIONS, f.risk)}` })
  if (f.lastPay) tags.push({ keys: ['lastPay'], text: `결제 ${label(LAST_PAY_OPTIONS, f.lastPay)}` })
  if (f.paidMin !== '' || f.paidMax !== '') tags.push({ keys: ['paidMin', 'paidMax'], text: `누적 ${f.paidMin ? won(f.paidMin) : '0원'} ~ ${f.paidMax ? won(f.paidMax) : '제한 없음'}` })
  if (f.lastAtt) tags.push({ keys: ['lastAtt'], text: `출석 ${label(LAST_ATT_OPTIONS, f.lastAtt)}` })
  if (f.purpose) tags.push({ keys: ['purpose'], text: `목적 ${f.purpose}` })
  return tags
}
