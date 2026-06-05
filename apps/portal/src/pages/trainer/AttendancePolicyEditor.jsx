// AttendancePolicyEditor.jsx
// 트레이너가 출결(노쇼/취소) 정책을 설정. 회원에게 사전 공개되어 감정 마찰 완화.
// 설계: 063_attendance_policy.sql
//   - cancel_deadline_hours: 이 시간 이전 취소 = 차감 없음
//   - noshow_deduct: 무단 노쇼 시 세션 차감(1회/0회)
//   - policy_text: 회원 앱에 노출될 정책 문구 (자동 생성 + 편집 가능)
//
// props: { trainer, onClose }

import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'

const LIME = '#c8f135'

export function defaultPolicyText(hours, deduct) {
  return [
    `· 수업 ${hours}시간 전까지 취소·변경하시면 세션이 차감되지 않습니다.`,
    deduct === 1
      ? `· 사전 연락 없는 노쇼(무단 불참)는 세션 1회가 차감됩니다.`
      : `· 노쇼 시에도 세션은 차감되지 않습니다. 다만 출결 기록에는 남습니다.`,
    `· 출결 내역은 회원 앱에서 언제든 확인하실 수 있습니다.`,
  ].join('\n')
}

export default function AttendancePolicyEditor({ trainer, onClose }) {
  const showToast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hours, setHours] = useState(24)
  const [deduct, setDeduct] = useState(1)
  const [text, setText] = useState('')
  const [textEdited, setTextEdited] = useState(false)

  useEffect(() => { if (trainer?.id) load() /* eslint-disable-next-line */ }, [trainer?.id])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('attendance_policies').select('*').eq('trainer_id', trainer.id).maybeSingle()
      if (data) {
        setHours(data.cancel_deadline_hours ?? 24)
        setDeduct(data.noshow_deduct ?? 1)
        setText(data.policy_text || defaultPolicyText(data.cancel_deadline_hours ?? 24, data.noshow_deduct ?? 1))
        setTextEdited(!!data.policy_text)
      } else {
        setText(defaultPolicyText(24, 1))
      }
    } catch (e) { console.warn('[AttendancePolicyEditor]', e.message) }
    setLoading(false)
  }

  // 설정 변경 시, 사용자가 문구를 직접 수정하지 않았다면 자동 문구 갱신
  function syncText(nextHours, nextDeduct) {
    if (!textEdited) setText(defaultPolicyText(nextHours, nextDeduct))
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const { error } = await supabase.from('attendance_policies').upsert({
        trainer_id: trainer.id,
        cancel_deadline_hours: hours,
        noshow_deduct: deduct,
        policy_text: text.trim() || defaultPolicyText(hours, deduct),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'trainer_id' })
      if (error) throw error
      showToast('✓ 출결 정책이 저장됐어요')
      if (onClose) onClose()
    } catch (e) { showToast('저장 실패: ' + (e.message || '오류')) }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중…</div>

  const lbl = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 7 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: 'rgba(200,241,53,0.08)', border: '1px solid rgba(200,241,53,0.3)', borderRadius: 12, padding: 13, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        정책을 정해두면, 노쇼·취소를 트레이너가 매번 판단하지 않고 <b style={{ color: 'var(--text)' }}>시스템이 규칙대로</b> 처리해요. 회원도 가입 시 동의하고 본인 앱에서 확인하므로 감정 마찰이 줄어듭니다.
      </div>

      {/* 취소 가능 시한 */}
      <div>
        <label style={lbl}>취소 가능 시한 — 이 시간 전까지 취소하면 차감 없음</label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {[6, 12, 24, 48].map(h => {
            const on = hours === h
            return (
              <button key={h} type="button" onClick={() => { setHours(h); syncText(h, deduct) }}
                style={{ flex: 1, minWidth: 64, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  background: on ? LIME : 'var(--surface)', color: on ? '#1a2e05' : 'var(--text-muted)', border: `1px solid ${on ? LIME : 'var(--border)'}` }}>
                {h}시간 전
              </button>
            )
          })}
        </div>
      </div>

      {/* 노쇼 차감 */}
      <div>
        <label style={lbl}>무단 노쇼 시 세션 차감</label>
        <div style={{ display: 'flex', gap: 7 }}>
          {[[1, '1회 차감'], [0, '차감 안 함']].map(([val, label]) => {
            const on = deduct === val
            return (
              <button key={val} type="button" onClick={() => { setDeduct(val); syncText(hours, val) }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  background: on ? LIME : 'var(--surface)', color: on ? '#1a2e05' : 'var(--text-muted)', border: `1px solid ${on ? LIME : 'var(--border)'}` }}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 정책 문구 (회원 노출) */}
      <div>
        <label style={lbl}>회원에게 보여줄 정책 문구 <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(자동 생성 · 직접 수정 가능)</span></label>
        <textarea value={text}
          onChange={e => { setText(e.target.value); setTextEdited(true) }}
          rows={5}
          style={{ width: '100%', fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
        {textEdited && (
          <button type="button" onClick={() => { setText(defaultPolicyText(hours, deduct)); setTextEdited(false) }}
            style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            ↺ 자동 문구로 되돌리기
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {onClose && (
          <button type="button" onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>닫기</button>
        )}
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.6 : 1 }}>
          {saving ? '저장 중…' : '정책 저장'}
        </button>
      </div>
    </div>
  )
}
