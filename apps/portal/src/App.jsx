import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '@trainer-log/shared/components/common/Toast'
import Landing from './pages/Landing'
import TrainerApp from './pages/TrainerApp'
import MemberPortal from './pages/MemberPortal'
import Report from './pages/Report'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import AccountDeletion from './pages/AccountDeletion'
import ComingSoon from './pages/ComingSoon'
import NativeStart from './pages/NativeStart'
import { initNativeAuthListener, isNativeApp } from './lib/nativeAuth'

// ⚠️ Phase D-4 베타 출시 정책 (Path B):
// CRM / Community 는 코드는 완성 상태이나 운영(prod) 배포엔 미공개.
// Community 는 별도 앱(apps/community, community.ownapp.kr)으로 분리됨 — iOS/안드로이드 앱이
// 이 portal 을 띄우므로, 광고·결제 수익화가 앱 심사에 걸리지 않게 웹 전용으로 떼어냄.
// /community: dev 는 커뮤니티 dev 서버(3040)로 이동, prod 는 계속 ComingSoon.
// 공개 시점에 prod 도 community.ownapp.kr 로 보내기 (네이티브 앱에선 외부 브라우저로).
function CommunityDevRedirect() {
  useEffect(() => { window.location.replace('http://localhost:3040') }, [])
  return null
}
// dev 전용 — 트레이너 공개 프로필 /t/{handle} (배포엔 미노출, 공개 시점 사용자 통제)
const PublicProfile = lazy(() => import('./pages/trainer/PublicProfile'))

export default function App() {
  // 네이티브 앱(Capacitor)에서만 OAuth 딥링크 복귀 리스너를 1회 등록. 웹에선 no-op.
  useEffect(() => { initNativeAuthListener() }, [])

  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* iOS 앱은 역할 선택 화면으로 시작(심사 4.2·2.1), 웹·안드로이드는 마케팅 랜딩 */}
          <Route path="/" element={isNativeApp() ? <NativeStart /> : <Landing />} />
          <Route path="/intro" element={<Landing />} />
          <Route path="/trainer" element={<TrainerApp />} />
          <Route path="/member" element={<MemberPortal />} />
          <Route path="/report" element={<Report />} />
          {/* dev: 커뮤니티 앱(3040)으로 이동 / prod: ComingSoon 으로 가림 */}
          <Route path="/community" element={
            import.meta.env.DEV ? (
              <CommunityDevRedirect />
            ) : (
              <ComingSoon
                title="커뮤니티 곧 출시 예정"
                emoji="💬"
                description={'트레이너·헬스장·교육강사가 함께하는\n피트니스 커뮤니티를 준비 중이에요.\n\n오픈 알림은 카카오톡 채널 @ownapp 으로 전해드릴게요.'}
              />
            )
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
          {/* dev: 트레이너 공개 프로필 / prod: 미공개라 홈으로 */}
          <Route path="/t/:handle" element={
            import.meta.env.DEV
              ? <Suspense fallback={null}><PublicProfile /></Suspense>
              : <Navigate to="/" replace />
          } />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/refund" element={<Refund />} />
          <Route path="/account-deletion" element={<AccountDeletion />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
