import { useState, useMemo, useRef, useEffect } from 'react'
import CrmIcon from './CrmIcon'
import Modal from './CrmModal'
import PaymentDialog from './PaymentDialog'

// 대시보드 상단 — 회원 찾기(이름 · 전화번호 뒷자리) · 결제 등록(회원 고르기 → 결제 창)

const digits = s => String(s || '').replace(/\D/g, '')
const phoneTail = p => { const d = digits(p); return d.length >= 4 ? `···${d.slice(-4)}` : '' }

function matchMembers(members, q, limit) {
  const t = q.trim()
  if (!t) return []
  const d = digits(t)
  return members
    .filter(m => (m.name || '').includes(t) || (d.length >= 2 && digits(m.phone).includes(d)))
    .slice(0, limit)
}

export default function QuickActions({ members, trainers, gymId, currentTrainer, onOpenMember, onPaid }) {
  const [q, setQ]           = useState('')
  const [open, setOpen]     = useState(false)
  const [hi, setHi]         = useState(0)
  const [picking, setPicking] = useState(false)
  const [pq, setPq]         = useState('')
  const [payMember, setPayMember] = useState(null)
  const boxRef = useRef(null)

  const trainerName = id => trainers.find(t => t.id === id)?.name
  const results = useMemo(() => matchMembers(members, q, 8), [members, q])
  const sorted  = useMemo(() => [...members].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')), [members])
  const pickList = useMemo(() => (pq.trim() ? matchMembers(sorted, pq, 40) : sorted.slice(0, 40)), [sorted, pq])

  useEffect(() => { setHi(0) }, [q])
  useEffect(() => {
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function choose(m) {
    setQ(''); setOpen(false)
    onOpenMember(m)
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(i => Math.min(i + 1, Math.max(results.length - 1, 0))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && results[hi]) { e.preventDefault(); choose(results[hi]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const showList = open && q.trim().length > 0

  return (
    <>
      <div className="qa-search" ref={boxRef}>
        <label className="qa-field">
          <CrmIcon name="search" size={16} stroke={2.2} />
          <input type="search" value={q} placeholder="회원 이름 · 전화번호 뒷자리"
            role="combobox" aria-label="회원 찾기" aria-expanded={showList} aria-controls="qa-results"
            aria-activedescendant={showList && results[hi] ? `qa-opt-${results[hi].id}` : undefined}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)} onKeyDown={onKey} />
        </label>
        {showList && (
          <ul className="qa-list" id="qa-results" role="listbox" aria-label="찾은 회원">
            {results.length === 0 && <li className="qa-empty">맞는 회원이 없어요</li>}
            {results.map((m, i) => (
              <li key={m.id} id={`qa-opt-${m.id}`} role="option" aria-selected={i === hi}
                className={`qa-opt${i === hi ? ' on' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={e => { e.preventDefault(); choose(m) }}>
                <b>{m.name}</b><small>{[trainerName(m.trainer_id), phoneTail(m.phone)].filter(Boolean).join(' · ')}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-lg" onClick={() => { setPq(''); setPicking(true) }}>
        <CrmIcon name="plus" size={16} stroke={2.4} />결제 등록
      </button>

      <Modal open={picking} onClose={() => setPicking(false)} title="결제할 회원 고르기" maxWidth="440px">
        <label className="qa-field">
          <CrmIcon name="search" size={16} stroke={2.2} />
          <input type="search" value={pq} placeholder="회원 이름 · 전화번호 뒷자리" aria-label="결제할 회원 찾기"
            autoFocus onChange={e => setPq(e.target.value)} />
        </label>
        <div className="pick-list" role="list">
          {pickList.length === 0 && <div className="qa-empty">맞는 회원이 없어요</div>}
          {pickList.map(m => (
            <button key={m.id} type="button" className="pick-row" role="listitem"
              onClick={() => { setPicking(false); setPayMember(m) }}>
              <b>{m.name}</b><small>{[trainerName(m.trainer_id), phoneTail(m.phone)].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          {!pq.trim() && members.length > pickList.length && (
            <div className="qa-empty">회원 {members.length}명 중 {pickList.length}명만 보여요. 이름으로 찾아 주세요.</div>
          )}
        </div>
      </Modal>

      <PaymentDialog
        open={!!payMember}
        member={payMember}
        gymId={gymId}
        trainers={trainers}
        currentTrainer={currentTrainer}
        onClose={() => setPayMember(null)}
        onPaid={() => onPaid?.()}
      />
    </>
  )
}
