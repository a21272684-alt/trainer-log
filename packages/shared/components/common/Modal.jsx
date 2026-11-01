// sheet: 모바일에서 화면 아래에서 올라오는 시트 모양 (기본은 가운데 팝업)
export default function Modal({ id, open, onClose, title, children, maxWidth, zIndex, sheet = false }) {
  return (
    <div
      className={`modal-overlay${open ? ' open' : ''}${sheet ? ' sheet' : ''}`}
      id={id}
      style={zIndex ? { zIndex } : undefined}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`modal${sheet ? ' sheet' : ''}`} style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-title">
          {title}
          <button className="close-btn" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
