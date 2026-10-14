import { REASON_LABEL, SANCTION_LABEL, isSuspended, suspendedUntil } from '../../lib/moderation'

// 제재 안내 배너 — 정지 중이면 계속 표시, 경고는 '확인했어요' 누를 때까지 표시.
export default function SanctionBanner({ status, onAck }) {
  if (!status) return null
  const suspended = isSuspended(status)
  if (!suspended && status.last_seen) return null

  const until  = suspendedUntil(status)
  const reason = REASON_LABEL[status.last_reason] || '운영정책 위반'
  const nth    = status.strikes > 0 ? ` (${status.strikes}번째 위반)` : ''

  let title
  if (suspended && until === Infinity) title = '커뮤니티 글쓰기가 영구 제한된 계정이에요.'
  else if (suspended) {
    const d = new Date(until)
    title = `${d.getMonth() + 1}월 ${d.getDate()}일까지 글쓰기가 제한된 계정이에요.`
  } else title = '운영정책 위반으로 글이 삭제됐어요.'

  const next = suspended && until === Infinity ? ''
    : status.strikes >= 2 ? '다시 위반하면 영구 정지됩니다.'
    : status.strikes === 1 ? '다시 위반하면 7일 동안 글쓰기가 제한됩니다.' : ''

  return (
    <div style={{
      background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E',
      borderRadius: 12, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.7, margin: '12px 16px 0',
    }}>
      <b>{title}</b><br />
      조치: {SANCTION_LABEL[status.last_action] || '-'} · 사유: {reason}{nth}<br />
      {suspended ? '글 읽기는 계속할 수 있어요. ' : ''}{next}
      {' '}문의는 카카오톡 채널 @ownapp 으로 보내주세요.
      {!suspended && !status.last_seen && (
        <div style={{ marginTop: 8 }}>
          <button onClick={onAck} style={{
            background: '#92400E', color: '#fff', border: 'none', borderRadius: 8,
            padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>확인했어요</button>
        </div>
      )}
    </div>
  )
}
