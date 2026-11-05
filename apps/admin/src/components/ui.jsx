import { useEffect } from 'react'
import AdminIcon from './AdminIcon'

// 관리자 개편 공통 부품 — 스타일은 admin.css 의 .adm-* 클래스

// tone: lime | amber | red | blue | rose | gray | muted
export function Badge({ tone = 'gray', children, title }) {
  return <span className={`adm-badge adm-badge--${tone}`} title={title}>{children}</span>
}

export function Chip({ active, tone, onClick, children }) {
  return (
    <button type="button" aria-pressed={!!active} onClick={onClick}
      className={`adm-chip${active ? ' is-active' : ''}${tone && !active ? ` adm-chip--${tone}` : ''}`}>
      {children}
    </button>
  )
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled}
      className={`adm-switch${checked ? ' is-on' : ''}`} onClick={() => !disabled && onChange(!checked)}>
      <span className="adm-switch-knob" />
    </button>
  )
}

export function SearchInput({ value, onChange, placeholder, autoFocus, width }) {
  return (
    <label className="adm-search" style={width ? { width } : undefined}>
      <AdminIcon name="search" size={15} strokeWidth={2.2} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        aria-label={placeholder} autoFocus={autoFocus} />
      {value && (
        <button type="button" className="adm-search-clear" aria-label="검색어 지우기" onClick={() => onChange('')}>
          <AdminIcon name="x" size={14} />
        </button>
      )}
    </label>
  )
}

// 오른쪽에서 열리는 패널 (목록 위치는 그대로). Esc 로 닫기.
export function SidePanel({ open, onClose, children, width = 540, label }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="adm-panel-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="adm-panel" role="dialog" aria-label={label} style={{ width }}>
        {children}
      </section>
    </div>
  )
}

export function EmptyState({ title, desc }) {
  return (
    <div className="adm-empty">
      <div className="adm-empty-title">{title}</div>
      {desc && <div className="adm-empty-desc">{desc}</div>}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(total, page * pageSize)
  // 현재 페이지 주변 5개만
  const start = Math.max(1, Math.min(page - 2, pages - 4))
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i)
  return (
    <div className="adm-pager">
      <span className="adm-pager-info"><b>{from}–{to}</b> / {total}명</span>
      <nav aria-label="페이지" className="adm-pager-nav">
        <button type="button" aria-label="이전 페이지" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        {nums.map(n => (
          <button key={n} type="button" aria-current={n === page ? 'page' : undefined}
            className={n === page ? 'is-current' : ''} onClick={() => onPage(n)}>{n}</button>
        ))}
        <button type="button" aria-label="다음 페이지" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </nav>
      <select aria-label="한 페이지에 보이는 수" value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
        {[10, 20, 50].map(n => <option key={n} value={n}>{n}개씩</option>)}
      </select>
    </div>
  )
}

export function Avatar({ name, strong }) {
  return <span className={`adm-avatar${strong ? ' is-strong' : ''}`} aria-hidden="true">{(name || '?').trim()[0]?.toUpperCase()}</span>
}
