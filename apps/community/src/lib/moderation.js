import { supabase } from '@trainer-log/shared/lib/supabase'

// 신고 사유 — DB community_reports.reason CHECK 와 같은 키 (082 마이그레이션)
export const REPORT_REASONS = [
  { key: 'fake_job',  label: '허위·과장 채용',     hint: '급여 부풀림, 다단계·영업 유도' },
  { key: 'scam',      label: '사기·먹튀 의심',     hint: '돈만 받고 상품 미제공, 선입금 요구' },
  { key: 'copyright', label: '저작권 침해(도용)',  hint: '남의 강의·자료를 베껴 판매' },
  { key: 'spam',      label: '스팸·광고',          hint: '보충제·업체 홍보 도배' },
  { key: 'abuse',     label: '욕설·혐오·괴롭힘',   hint: '' },
  { key: 'offtopic',  label: '주제와 무관한 글',   hint: '정치·종교 등 채용·PT·마켓과 관계없는 글' },
  { key: 'etc',       label: '기타',               hint: '아래에 내용을 적어주세요' },
]

export const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map(r => [r.key, r.label]))

export const SANCTION_LABEL = { warn: '경고', d7: '7일 정지', perm: '영구 정지' }

// 내 제재 상태 (없으면 null)
export async function fetchMyStatus(userId) {
  const { data, error } = await supabase.from('community_user_status')
    .select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

// Postgres 'infinity' 는 문자열로 옴 → 영구 정지로 취급
export function suspendedUntil(status) {
  const v = status?.suspended_until
  if (!v) return null
  if (v === 'infinity') return Infinity
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

export function isSuspended(status) {
  const t = suspendedUntil(status)
  return t != null && t > Date.now()
}

export async function reportPost(postId, reason, memo) {
  const { data, error } = await supabase.rpc('community_report_post', {
    p_post_id: postId, p_reason: reason, p_memo: memo || null,
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || '신고하지 못했어요')
  return data
}

export async function ackSanction() {
  const { error } = await supabase.rpc('community_ack_sanction')
  if (error) throw error
}
