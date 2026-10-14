import { useState, useEffect } from 'react'
import CrmSelect from './CrmSelect'
import {
  EMPTY_FILTERS, RISK_OPTIONS, LAST_PAY_OPTIONS, LAST_ATT_OPTIONS,
} from '../lib/memberFilters'

const fieldLabel = { fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }

// 고급 필터 패널 — 입력은 draft 로 들고 있다가 [적용] 시 부모로 커밋
export default function MemberFilterPanel({ open, filters, trainers, purposes, onApply, onSaveSegment }) {
  const [draft,     setDraft]     = useState(filters)
  const [saveName,  setSaveName]  = useState('')
  const [savingSeg, setSavingSeg] = useState(false)
  // 펼침 전환이 끝난 뒤에만 잘림 해제 (전환 중엔 overflow:hidden 필요)
  const [revealed,  setRevealed]  = useState(false)
  useEffect(() => {
    if (!open) { setRevealed(false); return }
    // transitionend 가 안 오는 경우(동작 줄이기 설정 등) 대비
    const t = setTimeout(() => setRevealed(true), 450)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => { setDraft(filters) }, [filters])

  const set  = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }))
  const setV = (k) => (v) => setDraft(d => ({ ...d, [k]: v }))

  async function handleSave() {
    const name = saveName.trim()
    if (!name) return
    setSavingSeg(true)
    const ok = await onSaveSegment(name, draft)
    setSavingSeg(false)
    if (ok) setSaveName('')
  }

  // 닫혀 있어도 마운트 유지 → 펼침 애니메이션 + 입력 중이던 값 보존. inert 로 포커스/스크린리더 차단
  return (
    <div className={`crm-collapse ${open ? 'open' : ''} ${revealed ? 'revealed' : ''}`} inert={!open} aria-hidden={!open}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && open) setRevealed(true) }}>
    <div className="crm-collapse-inner">
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="crm-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px 16px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>담당 트레이너</div>
          <CrmSelect ariaLabel="담당 트레이너" value={draft.trainerId} onChange={setV('trainerId')}
            options={[['', '전체'], ...trainers.map(t => [t.id, t.name])]} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>등록일</div>
          <div className="crm-range">
            <input className="input" type="date" value={draft.joinedFrom} onChange={set('joinedFrom')} aria-label="등록일 시작" />
            <span>~</span>
            <input className="input" type="date" value={draft.joinedTo} onChange={set('joinedTo')} aria-label="등록일 끝" />
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>잔여 세션 (회)</div>
          <div className="crm-range">
            <input className="input" type="number" min="0" placeholder="0" value={draft.remainMin} onChange={set('remainMin')} aria-label="잔여 세션 최소" />
            <span>~</span>
            <input className="input" type="number" min="0" placeholder="제한 없음" value={draft.remainMax} onChange={set('remainMax')} aria-label="잔여 세션 최대" />
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>이탈 위험도</div>
          <CrmSelect ariaLabel="이탈 위험도" value={draft.risk} onChange={setV('risk')} options={RISK_OPTIONS} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>마지막 결제</div>
          <CrmSelect ariaLabel="마지막 결제" value={draft.lastPay} onChange={setV('lastPay')} options={LAST_PAY_OPTIONS} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>누적 결제액 (원)</div>
          <div className="crm-range">
            <input className="input" type="number" min="0" step="10000" placeholder="0" value={draft.paidMin} onChange={set('paidMin')} aria-label="누적 결제액 최소" />
            <span>~</span>
            <input className="input" type="number" min="0" step="10000" placeholder="제한 없음" value={draft.paidMax} onChange={set('paidMax')} aria-label="누적 결제액 최대" />
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>마지막 출석</div>
          <CrmSelect ariaLabel="마지막 출석" value={draft.lastAtt} onChange={setV('lastAtt')} options={LAST_ATT_OPTIONS} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={fieldLabel}>운동 목적</div>
          <CrmSelect ariaLabel="운동 목적" value={draft.purpose} onChange={setV('purpose')}
            options={[['', '전체'], ...purposes.map(p => [p, p])]} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
        borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <input className="input" style={{ maxWidth: '200px' }} maxLength={40}
          placeholder="세그먼트 이름 (예: 재등록 대상)"
          value={saveName} onChange={e => setSaveName(e.target.value)} />
        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}
          disabled={!saveName.trim() || savingSeg} onClick={handleSave}>
          {savingSeg ? '저장 중…' : '세그먼트로 저장'}
        </button>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}
          onClick={() => { setDraft(EMPTY_FILTERS); onApply(EMPTY_FILTERS) }}>
          초기화
        </button>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }}
          onClick={() => onApply(draft)}>
          적용
        </button>
      </div>
    </div>
    </div>
    </div>
  )
}
