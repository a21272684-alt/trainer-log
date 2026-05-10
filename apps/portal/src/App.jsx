import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@trainer-log/shared/components/common/Toast'
import Landing from './pages/Landing'
import TrainerApp from './pages/TrainerApp'
import MemberPortal from './pages/MemberPortal'
import Report from './pages/Report'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import ComingSoon from './pages/ComingSoon'

// ⚠️ Phase D-4 베타 출시 정책 (Path B):
// CRM / Community 는 코드는 완성 상태이나 베타 첫 출시엔 미공개.
// 라우트는 ComingSoon placeholder 로 대체. 정식 출시 시점에 원래 컴포넌트로 복원하면 됨.
// 원래 imports (참조용 — 활성화 시 주석 해제):
//   import CommunityPortal from './pages/CommunityPortal'
// import 만 빠지면 빌드 size 도 감소 (dead-code elimination).

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/trainer" element={<TrainerApp />} />
          <Route path="/member" element={<MemberPortal />} />
          <Route path="/report" element={<Report />} />
          {/* 베타 placeholder — 정식 출시 시 <CommunityPortal /> 로 복원 */}
          <Route path="/community" element={
            <ComingSoon
              title="커뮤니티 곧 출시 예정"
              emoji="💬"
              description={'트레이너·헬스장·교육강사가 함께하는\n피트니스 커뮤니티를 준비 중이에요.\n\n오픈 알림은 카카오톡 채널 @ownapp 으로 전해드릴게요.'}
            />
          } />
          {/* 베타 placeholder — 정식 출시 시 CrmRedirect 로 복원 */}
          <Route path="/crm" element={
            <ComingSoon
              title="CRM 포털 곧 출시 예정"
              emoji="🏢"
              description={'헬스장 운영자를 위한 회원 관리 ·\n트레이너 정산 · 매출 분석 도구를 준비 중이에요.\n\n사전 도입 문의는 카카오톡 채널 @ownapp 으로.'}
            />
          } />
          <Route path="/gym" element={
            <ComingSoon
              title="CRM 포털 곧 출시 예정"
              emoji="🏢"
              description={'헬스장 운영자를 위한 회원 관리 ·\n트레이너 정산 · 매출 분석 도구를 준비 중이에요.\n\n사전 도입 문의는 카카오톡 채널 @ownapp 으로.'}
            />
          } />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/refund" element={<Refund />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
