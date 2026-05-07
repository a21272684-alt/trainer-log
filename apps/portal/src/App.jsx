import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@trainer-log/shared/components/common/Toast'
import Landing from './pages/Landing'
import TrainerApp from './pages/TrainerApp'
import MemberPortal from './pages/MemberPortal'
import Report from './pages/Report'
import CommunityPortal from './pages/CommunityPortal'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'

// CRM 은 별도 앱(@trainer-log/crm)으로 분리됨.
// dev 시: http://localhost:3020, prod 시: crm.example.com (배포 시 도메인 반영)
const CRM_URL = import.meta.env.PROD
  ? 'https://crm.example.com/'
  : 'http://localhost:3020/'

function CrmRedirect() {
  useEffect(() => { window.location.replace(CRM_URL) }, [])
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Noto Sans KR', sans-serif", color: '#94a3b8', background: '#0a0f1a',
    }}>
      CRM 포털로 이동 중...&nbsp;<a href={CRM_URL} style={{ color: '#c8f135' }}>{CRM_URL}</a>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/trainer" element={<TrainerApp />} />
          <Route path="/member" element={<MemberPortal />} />
          <Route path="/report" element={<Report />} />
          <Route path="/community" element={<CommunityPortal />} />
          <Route path="/crm" element={<CrmRedirect />} />
          <Route path="/gym" element={<CrmRedirect />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/refund" element={<Refund />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
