import { supabase } from '@trainer-log/shared/lib/supabase'

// 관리자 RPC 공통 호출. 모든 admin_* 함수는 _admin_assert(토큰 sha256 비교, 095)로 보호된다.
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_DB_TOKEN || ''

export async function adminRpc(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, { p_admin_token: ADMIN_TOKEN, ...params })
  if (error) throw error
  return data
}

// ── 날짜 (구독 만료일은 'YYYY-MM-DD', 기준은 서울) ─────────────
export function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

const ymdToUtc = (ymd) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function daysBetween(fromYmd, toYmd) {
  return Math.round((ymdToUtc(toYmd) - ymdToUtc(fromYmd)) / 86400000)
}

// 'YYYY-MM-DD' + n개월 (말일 보정: 1/31 + 1개월 → 2/28)
export function addMonths(ymd, n) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, last))
  return first.toISOString().slice(0, 10)
}

export function fmtDate(v) {
  if (!v) return '-'
  return String(v).slice(0, 10).replace(/-/g, '.')
}

export function fmtShort(v) {
  if (!v) return '-'
  const s = String(v).slice(5, 10).split('-')
  return `${Number(s[0])}/${Number(s[1])}`
}

export const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`

// ── 구독 상태 (날짜로 자동 계산) ────────────────────────────
export const PLAN_LABEL = { pro: 'Pro', premium: 'Premium' }
export const planLabel = (p) => PLAN_LABEL[String(p || '').toLowerCase()] || (p ? String(p) : '무료')

export function subStatus(sub, today = seoulToday()) {
  if (!sub) return { key: 'none', label: '구독 없음', tone: 'gray' }
  if (sub.voided_at) return { key: 'voided', label: '무효', tone: 'muted' }
  if (sub.stopped_at) return { key: 'stopped', label: '중지', tone: 'gray' }
  if (!sub.valid_until) return { key: 'expired', label: '만료', tone: 'red' }
  const days = daysBetween(today, sub.valid_until)
  if (days < 0) return { key: 'expired', label: '만료', tone: 'red', days }
  if (days <= 30) return { key: 'soon', label: days === 0 ? '오늘 만료' : `D-${days} · 곧 만료`, tone: 'amber', days }
  return { key: 'active', label: '활성', tone: 'lime', days }
}

// 이용 기간 진행률 (0~100)
export function subProgress(sub, today = seoulToday()) {
  if (!sub?.paid_at || !sub?.valid_until) return 0
  const total = daysBetween(String(sub.paid_at).slice(0, 10), sub.valid_until)
  if (total <= 0) return 100
  const used = daysBetween(String(sub.paid_at).slice(0, 10), today)
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)))
}

export const PAYMENT_METHODS = ['카카오페이', '카드', '계좌이체', '현금']

// ── 화면 안 검색 (자음만 입력하면 초성 비교: 'ㅇㅈㅎ' → 윤준현) ─────
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
export const chosung = (s) => Array.from(String(s || '')).map(c => {
  const k = c.charCodeAt(0) - 0xAC00
  return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c.toLowerCase()
}).join('')
export function textMatch(text, q) {
  const term = String(q || '').trim()
  if (!term) return true
  return /^[ㄱ-ㅎ]+$/.test(term) ? chosung(text).includes(term) : String(text || '').toLowerCase().includes(term.toLowerCase())
}
