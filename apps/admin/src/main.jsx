import React from 'react'
import ReactDOM from 'react-dom/client'
import AdminPortal from './pages/AdminPortal'
import { initSentry } from '@trainer-log/shared/lib/sentry'
import '@trainer-log/shared/styles/global.css'

// Phase D-1 — 에러 트래킹. DSN 미설정 환경에선 자동 no-op.
initSentry('admin')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminPortal />
  </React.StrictMode>
)
