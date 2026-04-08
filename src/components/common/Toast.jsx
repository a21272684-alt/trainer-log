import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)

  const showToast = useCallback((msg) => {
    setMessage(msg)
    setVisible(true)
    setTimeout(() => setVisible(false), 2800)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        style={{
          position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
          background:'var(--accent)', color:'#0a0a0a', padding:'10px 20px',
          borderRadius:'100px', fontSize:'13px', fontWeight:'700',
          opacity: visible ? 1 : 0, transition:'opacity 0.3s', zIndex:999,
          pointerEvents:'none', whiteSpace:'nowrap'
        }}
      >
        {message}
      </div>
    </ToastContext.Provider>
  )
}
