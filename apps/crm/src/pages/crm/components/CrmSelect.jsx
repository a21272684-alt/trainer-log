import { useState, useRef, useEffect, useId } from 'react'

// 네이티브 <select> 대체 — 목록이 부드럽게 펼쳐지는 CRM 드롭다운.
// options: [[value, label], ...]. 키보드: ↑↓ 이동, Enter/Space 선택, Esc 닫기, 첫 글자 없음(옵션 수 적음)
export default function CrmSelect({ value, onChange, options, ariaLabel, id }) {
  const [open,   setOpen]   = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const autoId  = useId()
  const listId  = `${id || autoId}-list`

  const selectedIdx = Math.max(0, options.findIndex(([v]) => v === value))
  const label = options[selectedIdx]?.[1] ?? ''

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 열릴 때 현재 선택 항목을 활성화하고 보이게
  useEffect(() => {
    if (!open) return
    setActive(selectedIdx)
    listRef.current?.children[selectedIdx]?.scrollIntoView({ block: 'nearest' })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function pick(i) {
    onChange(options[i][0])
    setOpen(false)
  }

  function onKeyDown(e) {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault(); setOpen(true); return
    }
    if (!open) return
    if (e.key === 'Escape')    { e.preventDefault(); setOpen(false) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active) }
    if (e.key === 'Tab') setOpen(false)
  }

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  return (
    <div className={`crm-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className="input crm-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="crm-select-value">{label}</span>
        <span className={`crm-chevron ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
      </button>
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        className="crm-select-list"
        aria-label={ariaLabel}
      >
        {options.map(([v, l], i) => (
          <li
            key={v}
            role="option"
            aria-selected={v === value}
            className={`crm-select-option ${i === active ? 'active' : ''} ${v === value ? 'selected' : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => { e.preventDefault(); pick(i) }}
          >
            {l}
            {v === value && <span aria-hidden="true" className="crm-select-check">✓</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
