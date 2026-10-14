import { useState } from 'react'
import { REPORT_REASONS, reportPost } from '../../lib/moderation'
import { useToast } from '@trainer-log/shared/components/common/Toast'

// 글 신고 바텀시트. 한 사람은 같은 글 1번만, 3건 쌓이면 서버에서 자동 숨김.
export default function ReportSheet({ post, onClose }) {
  const showToast = useToast()
  const [reason, setReason]   = useState('')
  const [memo, setMemo]       = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    if (!reason || sending) return
    if (reason === 'etc' && !memo.trim()) { showToast('기타 사유는 내용을 적어주세요'); return }
    setSending(true)
    try {
      await reportPost(post.id, reason, memo.trim())
      showToast('신고가 접수됐어요. 운영자가 확인할게요')
      onClose()
    } catch (e) {
      showToast(e?.message || '신고하지 못했어요')
    } finally {
      setSending(false)
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(17,24,39,0.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div role="dialog" aria-label="신고하기" style={{
        background: '#fff', width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto',
        borderRadius: '20px 20px 0 0', padding: '20px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>이 글을 신고할까요?</div>
        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
          신고한 사람은 작성자에게 공개되지 않아요. 신고가 3건 쌓이면 운영자 확인 전까지 글이 숨겨집니다.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {REPORT_REASONS.map(r => {
            const on = reason === r.key
            return (
              <label key={r.key} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                border: `1px solid ${on ? '#EF4444' : '#E5E7EB'}`, background: on ? '#FEF2F2' : '#fff',
                borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#111827',
              }}>
                <input type="radio" name="report-reason" value={r.key} checked={on}
                  onChange={() => setReason(r.key)} style={{ accentColor: '#EF4444', marginTop: 3 }} />
                <span>
                  {r.label}
                  {r.hint && <span style={{ display: 'block', fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>{r.hint}</span>}
                </span>
              </label>
            )
          })}
        </div>

        <textarea value={memo} onChange={e => setMemo(e.target.value.slice(0, 500))} rows={3}
          placeholder={reason === 'etc' ? '신고 내용을 적어주세요 (필수)' : '자세한 내용 (선택)'}
          aria-label="신고 내용" style={{
            width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7EB', borderRadius: 10,
            padding: 10, fontFamily: 'inherit', fontSize: 13, resize: 'none', color: '#111827',
          }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#F3F4F6',
            color: '#111827', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>취소</button>
          <button onClick={submit} disabled={!reason || sending} style={{
            flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#EF4444',
            color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
            cursor: !reason || sending ? 'not-allowed' : 'pointer', opacity: !reason || sending ? 0.4 : 1,
          }}>{sending ? '접수 중…' : '신고하기'}</button>
        </div>
      </div>
    </div>
  )
}
