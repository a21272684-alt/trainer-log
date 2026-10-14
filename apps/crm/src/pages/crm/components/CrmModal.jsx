import { useState, useEffect, useRef } from 'react'

const EXIT_MS = 180

// CRM 공용 서브창.
// - 열고 닫을 때 애니메이션 (닫힘 애니메이션 동안은 마지막 내용을 그대로 보여줌)
// - 입력 중(입력칸을 한 번이라도 수정)이면 바깥 클릭·Esc 로 닫히지 않음 → 창이 흔들리며 안내
//   닫으려면 ✕ / 취소 버튼처럼 명시적으로 닫아야 함
// - 바깥에서 시작한 클릭만 "바깥 클릭" 으로 인정 (입력칸에서 드래그하다 바깥에서 놓아도 안 닫힘)
export default function Modal({ open, onClose, title, children, maxWidth = '520px', headerAction }) {
  const [mounted, setMounted] = useState(open)
  const [shown,   setShown]   = useState(false)
  const [shake,   setShake]   = useState(false)
  const [hint,    setHint]    = useState(false)
  const dirtyRef     = useRef(false)
  const downOnBackdrop = useRef(false)
  // 부모가 닫으면서 children 을 null 로 바꿔도 닫힘 애니메이션 동안 내용 유지
  const lastContent  = useRef({ title, children, headerAction })
  if (open) lastContent.current = { title, children, headerAction }

  useEffect(() => {
    if (open) {
      dirtyRef.current = false
      setHint(false)
      setMounted(true)
      // 다음 프레임에 shown → 진입 전환이 실제로 일어나도록
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(t)
  }, [open])

  function requestClose() {
    if (dirtyRef.current) {
      setShake(false)
      requestAnimationFrame(() => setShake(true))
      setHint(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }) // 매 렌더 최신 onClose 사용

  if (!mounted) return null
  const { title: t, children: c, headerAction: ha } = open ? { title, children, headerAction } : lastContent.current

  return (
    <div
      className={`crm-modal-backdrop ${shown ? 'shown' : ''}`}
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) requestClose()
        downOnBackdrop.current = false
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof t === 'string' ? t : undefined}
        className={`crm-modal ${shown ? 'shown' : ''} ${shake ? 'shake' : ''}`}
        style={{ maxWidth }}
        onAnimationEnd={(e) => { if (e.animationName === 'crm-modal-shake') setShake(false) }}
        onInputCapture={() => { dirtyRef.current = true }}
        onChangeCapture={() => { dirtyRef.current = true }}
      >
        <div className="crm-modal-header">
          <div style={{ fontSize: '15px', fontWeight: 700, minWidth: 0 }}>{t}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {ha}
            <button className="crm-modal-close" aria-label="닫기" onClick={onClose}>✕</button>
          </div>
        </div>
        {hint && (
          <div className="crm-modal-hint" role="status">
            작성 중인 내용이 있어 바깥을 눌러도 닫히지 않아요. 닫으려면 ✕ 를 눌러주세요.
          </div>
        )}
        <div style={{ overflow: 'auto', padding: '20px', flex: 1 }}>
          {c}
        </div>
      </div>
    </div>
  )
}
