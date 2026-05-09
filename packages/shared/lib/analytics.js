// packages/shared/lib/analytics.js
// Phase D-2 — Google Analytics 4 (GA4) 사용자 분석 공용 헬퍼.
//
// 사용법 (각 앱 main.jsx 최상단):
//   import { initAnalytics } from '@trainer-log/shared/lib/analytics'
//   initAnalytics('portal')   // 또는 'admin' / 'crm'
//
// 이벤트 추적 (선택, 도메인 코드에서):
//   import { trackEvent } from '@trainer-log/shared/lib/analytics'
//   trackEvent('trainer_signup_completed', { plan: 'free' })
//   trackEvent('log_sent', { method: 'ai' })
//
// 정책:
//   - VITE_GA4_MEASUREMENT_ID 미설정 시 init 이 no-op (앱 동작엔 영향 0)
//   - 광고/오디언스 시그널 OFF (allow_google_signals=false, allow_ad_personalization_signals=false)
//     → 한국 PIPA 친화. 단순 사용 패턴 분석 용도로만.
//   - GA4 는 기본적으로 IP 익명화. 별도 설정 불필요.
//   - SPA(React) 라 자동 page_view 가 첫 로드만 잡힘 → 라우팅 라이브러리 사용 시 path 변경마다 trackPageView 호출 권장
//   - 애플리케이션 이름은 app_name parameter 로 구분 (portal/admin/crm — 같은 GA 속성에서 분리 분석)

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'

let initialized = false

export function initAnalytics(appName) {
  if (initialized) {
    console.warn(`[GA4] already initialized — second init for "${appName}" ignored`)
    return
  }
  const measurementId = import.meta.env.VITE_GA4_MEASUREMENT_ID
  if (!measurementId) {
    console.warn(`[GA4] VITE_GA4_MEASUREMENT_ID not set — skipping init for "${appName}"`)
    return
  }

  // gtag.js script 동적 로드
  const script = document.createElement('script')
  script.async = true
  script.src = `${GTAG_SRC}?id=${encodeURIComponent(measurementId)}`
  script.dataset.gaApp = appName
  document.head.appendChild(script)

  // dataLayer + gtag stub (script 로드 전에 호출되어도 큐잉되도록)
  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function gtag() { window.dataLayer.push(arguments) }

  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    app_name: appName,
    // 광고/타겟팅 시그널 차단 (한국 PIPA 친화)
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // 기본 send_page_view=true 유지 (첫 로드 자동 추적)
  })

  initialized = true
}

/**
 * 도메인 이벤트 추적. GA4 이벤트는 영문 snake_case 권장.
 * @param {string} eventName - 예: 'trainer_signup_completed', 'log_sent'
 * @param {object} [params] - 이벤트 파라미터 (영문 키, 단순 값)
 */
export function trackEvent(eventName, params = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, params)
}

/**
 * SPA 라우팅 시 호출. React Router 등에서 path 변경 감지해서 호출.
 * @param {string} path - 예: '/trainer', '/member'
 */
export function trackPageView(path) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', { page_path: path })
}
