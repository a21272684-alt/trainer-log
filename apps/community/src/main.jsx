import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@trainer-log/shared/components/common/Toast'
import CommunityPortal from './pages/CommunityPortal'
import ComingSoon from './pages/ComingSoon'
import { initSentry } from '@trainer-log/shared/lib/sentry'
import { initAnalytics } from '@trainer-log/shared/lib/analytics'
import '@trainer-log/shared/styles/global.css'

initSentry('community')
initAnalytics('community')

// 공개 게이트 — 운영(prod)에선 VITE_COMMUNITY_OPEN=true 일 때만 실제 커뮤니티 노출.
// 공개 시점은 Vercel 환경변수 하나로 통제 (코드 수정·재배포 PR 불필요, Redeploy 만).
const isOpen = import.meta.env.DEV || import.meta.env.VITE_COMMUNITY_OPEN === 'true'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        {isOpen ? <CommunityPortal /> : <ComingSoon />}
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
