import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from './CrmModal'

// ── 출석 모드 시작 창 ─────────────────────────────────────────────
// 직원 PIN 상태(대표만 설정·변경), 출석 모드 시작. (기록은 출석 관리 탭)

export default function KioskLauncher({ open, gymId, isOwner, onClose, onStart }) {
  const [hasPin,  setHasPin]  = useState(null)
  const [editing, setEditing] = useState(false)
  const [pin1,    setPin1]    = useState('')
  const [pin2,    setPin2]    = useState('')
  const [msg,     setMsg]     = useState('')
  const [busy,    setBusy]    = useState(false)

  useEffect(() => {
    if (!open) return
    setEditing(false); setPin1(''); setPin2(''); setMsg('')
    supabase.rpc('crm_kiosk_has_pin', { p_gym_id: gymId }).then(({ data }) => setHasPin(!!data))
  }, [open, gymId])

  async function savePin() {
    if (!/^\d{4}$/.test(pin1)) { setMsg('숫자 4자리를 입력해주세요.'); return }
    if (pin1 !== pin2)        { setMsg('두 번 입력한 PIN 이 달라요.'); return }
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('crm_set_kiosk_pin', { p_gym_id: gymId, p_pin: pin1 })
    setBusy(false)
    if (error) { setMsg(error.message.includes('OWNER_ONLY') ? '대표만 PIN 을 정할 수 있어요.' : '저장 실패: ' + error.message); return }
    setHasPin(true); setEditing(false); setPin1(''); setPin2('')
  }

  const showForm = isOwner && (editing || hasPin === false)

  return (
    <Modal open={open} onClose={onClose} title="출석 모드" maxWidth="460px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          태블릿을 회원용 출석 화면으로 바꿔요. 회원은 전화번호 뒤 4자리로 입장하고,
          화면을 나가려면 <b>직원 PIN</b> 이 필요해요.
        </div>

        {hasPin === false && !isOwner && (
          <div className="pause-error">아직 직원 PIN 이 없어요. 대표가 먼저 PIN 을 정해야 출석 모드를 켤 수 있어요.</div>
        )}

        {showForm ? (
          <div className="pause-form">
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{hasPin ? '직원 PIN 변경' : '직원 PIN 정하기'}</div>
            <div className="crm-range">
              <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="PIN 4자리"
                aria-label="PIN 4자리" value={pin1} onChange={e => setPin1(e.target.value.replace(/\D/g, ''))} />
              <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="한 번 더"
                aria-label="PIN 확인" value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} />
            </div>
            {msg && <div style={{ fontSize: '12px', color: '#B42318' }}>{msg}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {hasPin && <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={() => setEditing(false)}>취소</button>}
              <button className="btn btn-primary" style={{ fontSize: '12px' }} disabled={busy} onClick={savePin}>저장</button>
            </div>
          </div>
        ) : hasPin && (
          <div className="pause-current" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: '13px' }}>직원 PIN <b>설정됨</b></span>
            {isOwner && <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '11px' }} onClick={() => setEditing(true)}>변경</button>}
          </div>
        )}

        <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '12px', fontSize: '14px' }}
          disabled={!hasPin} onClick={onStart}>출석 모드 시작</button>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>입장 기록과 직원 근태는 <b>출석 관리</b> 탭에서 볼 수 있어요.</div>
      </div>
    </Modal>
  )
}
