// ── 회원 관리 고급 필터 ─────────────────────────────────────────
// 원장/직원이 직접 고른 조건으로 회원 목록을 좁히는 순수 함수 모음.
// stat = crm_member_stats RPC 결과 행 { total_paid, payment_count, last_paid_at, last_attended, membership_end }

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

// 오늘부터 남은 날 (오늘 = 0, 지난 날 = 음수)
export function daysUntil(dateLike, today = new Date()) {
  const d = daysSince(dateLike, today)
  return d == null ? null : -d
}

// 만료 임박 기준 — 횟수 3회 이하 또는 이용권이 14일 안에 끝남
export const EXPIRING_SESSIONS = 3
export const EXPIRING_DAYS     = 14
// 오래 안 온 회원 기준 (대시보드 · 출석 관리 공통)
export const LONG_ABSENT_DAYS  = 14

// 결제 이력도 세션도 없으면 미등록.
// 남은 횟수도 없고 오늘 이후 끝나는 이용권(stat.membership_end)도 없으면 마감.
// 횟수가 3회 이하로 남았거나 이용권이 14일 안에 끝나면 만료 임박.
export function memberStatus(m, stat, today = new Date()) {
  const remain  = remainOf(m)
  const endLeft = daysUntil(stat?.membership_end, today)
  const hasPass = endLeft != null && endLeft >= 0
  if (!(stat?.payment_count > 0) && !(m.total_sessions > 0)) return 'none'
  if (remain === 0 && !hasPass) return 'expired'
  const fewLeft = m.total_sessions > 0 && remain > 0 && remain <= EXPIRING_SESSIONS
  const endSoon = hasPass && endLeft <= EXPIRING_DAYS
  if (fewLeft || endSoon) return 'expiring'
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

// ── 화면 표시 공통 ──────────────────────────────────────────────
// 상태 꼬리표 색 (회원 목록 · 상세 패널 · 알림 대상)
export const STATUS_TAG = {
  active:   { label: '이용 중',   bg: '#ECFCCB', color: '#3F6212' },
  expiring: { label: '만료 임박', bg: '#FEF3C7', color: '#92400E' },
  expired:  { label: '마감',      bg: '#FFE4E6', color: '#BE123C' },
  none:     { label: '미등록',    bg: '#F2F3EF', color: '#374151' },
}

export const fmtDot = d => (d ? String(d).slice(0, 10).replace(/-/g, '.') : '')

// 누적 결제 등 큰 금액 — 1만원 이상은 'N만원'
export const fmtMan = n => {
  const v = Number(n || 0)
  return Math.abs(v) >= 10000 ? `${Math.round(v / 10000).toLocaleString()}만원` : `${v.toLocaleString()}원`
}

const clamp01 = v => Math.max(0, Math.min(1, v))

// 회원 한 명의 회원권 요약 — 목록의 잔여 막대 · 만료 칸, 상세 패널 카드가 같은 값을 쓴다.
// 횟수가 남았으면 횟수권 기준, 아니면 기간권 기준으로 보여 준다.
export function passSummary(m, stat, today = new Date()) {
  const status  = memberStatus(m, stat, today)
  const total   = m.total_sessions || 0
  const remain  = remainOf(m)
  const msLeft  = daysUntil(stat?.membership_end, today)
  const hasPass = msLeft != null && msLeft >= 0
  const useSessions = total > 0 && (remain > 0 || !hasPass)

  let ratio = 0, left = '—', level = 'none'
  if (status === 'none') {
    // 결제 전 — 기본값 그대로
  } else if (useSessions) {
    ratio = clamp01(remain / total)
    left  = `${remain} / ${total}회`
    level = remain === 0 ? 'closed' : remain <= EXPIRING_SESSIONS ? 'low' : 'ok'
  } else if (hasPass) {
    const span = stat?.pass_start && stat?.pass_end === stat?.membership_end
      ? daysSince(stat.pass_start, new Date(stat.pass_end + 'T00:00:00'))
      : 0
    ratio = clamp01(span > 0 ? msLeft / span : msLeft / 30)
    left  = '기간권'
    level = msLeft <= EXPIRING_DAYS ? 'low' : 'ok'
  } else {
    ratio = 1
    left  = '만료'
    level = 'closed'
  }

  // 만료 칸 — 유효한 기간이 있거나, 이용이 끝난 회원만 날짜를 보여 준다
  const endDate = hasPass ? stat.membership_end : (status === 'expired' ? (stat?.last_end || null) : null)
  const endLeft = daysUntil(endDate, today)
  const dLabel  = endLeft == null ? '' : endLeft < 0 ? '만료' : endLeft === 0 ? '오늘까지' : `D-${endLeft}`
  const dLevel  = endLeft == null ? 'ok' : endLeft < 0 ? 'closed' : endLeft <= EXPIRING_DAYS ? 'low' : 'ok'

  return { status, total, remain, hasPass, useSessions, ratio, left, level, endDate, endLeft, dLabel, dLevel, passName: stat?.pass_name || '' }
}
