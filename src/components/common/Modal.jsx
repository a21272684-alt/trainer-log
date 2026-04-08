export default function Modal({ id, open, onClose, title, children, maxWidth }) {
  return (
    <div
      className={`modal-overlay${open ? ' open' : ''}`}
      id={id}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal" style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-title">
          {title}
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
