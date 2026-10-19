import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initSentry } from '@trainer-log/shared/lib/sentry'
import { initAnalytics } from '@trainer-log/shared/lib/analytics'
import '@trainer-log/shared/styles/global.css'

// Phase D-1 — 에러 트래킹. DSN 미설정 환경에선 자동 no-op.
initSentry('portal')
// Phase D-2 — GA4 사용자 분석. Measurement ID 미설정 환경에선 자동 no-op.
initAnalytics('portal')

// 배포 후 옛 화면에서 없어진 지연 로딩 파일(청크)을 요청하면 Vercel 이 index.html 을 돌려줘 로딩이 실패함.
// 이때 한 번만 새로고침해 새 배포본을 받는다. (무한 새로고침 방지: 10초 안에 반복되면 중단)
window.addEventListener('vite:preloadError', (event) => {
  try {
    const KEY = 'ownapp_chunk_reload_at'
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 10000) return
    sessionStorage.setItem(KEY, String(Date.now()))
    event.preventDefault()
    window.location.reload()
  } catch { /* sessionStorage 불가 환경이면 기본 동작(에러) 유지 */ }
})

// Service Worker 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
