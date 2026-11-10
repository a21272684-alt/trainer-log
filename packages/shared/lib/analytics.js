// packages/shared/lib/analytics.js
// Phase D-2 — Google Analytics 4 (GA4) 사용자 분석 공용 헬퍼.
//
// 사용법 (각 앱 main.jsx 최상단):
//   import { initAnalytics } from '@trainer-log/shared/lib/analytics'
//   initAnalytics('portal')   // 또는 'admin' / 'crm'
//
// 이벤트 추적 (도메인 코드에서):
//   import { trackEvent } from '@trainer-log/shared/lib/analytics'
//   trackEvent('journal_sent', { has_media: true })
//
// 정책:
//   - VITE_GA4_MEASUREMENT_ID 미설정 시 init 이 no-op (앱 동작엔 영향 0)
//   - 광고/오디언스 시그널 OFF (allow_google_signals=false, allow_ad_personalization_signals=false)
//     → 한국 PIPA 친화. 단순 사용 패턴 분석 용도로만.
//   - GA4 는 기본적으로 IP 익명화. 별도 설정 불필요.
//   - 개인정보처리방침이 GA4 를 '익명 사용자 분석 · 회원 식별 정보 전송 안 함'으로 안내한다.
//     → user_id(계정 식별자) · 이름 · 이메일 · 금액 같은 값은 이벤트에 넣지 않는다.
//       역할 · 요금제 · 플랫폼처럼 여러 사람이 같은 값을 갖는 속성만 보낸다.
//   - SPA(React) 라 자동 page_view 가 첫 로드만 잡힘 → 주소가 바뀌지 않는 앱 안 탭 이동은 trackScreen 으로 기록
//   - 애플리케이션 이름은 app_name parameter 로 구분 (portal/admin/crm — 같은 GA 속성에서 분리 분석)
//
// 플랫폼 구분 (2026-11):
//   웹 · 안드로이드 앱(TWA, 크롬) · iOS 앱(Capacitor 웹뷰)이 모두 같은 웹 코드라 GA4 웹 스트림 하나에 모인다.
//   그래서 Firebase 앱 스트림은 만들지 않고, 사용자 속성 app_platform 으로 나눈다.
//   (web | pwa | android_app | ios_app — GA4 관리 > 맞춤 정의에 '사용자 범위'로 등록해야 보고서에 보임)

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'
const PLATFORM_KEY = 'ownapp_platform'
const LAST_TIER_KEY = 'ownapp_last_tier'
const TIER_RANK = { free: 0, pro: 1, premium: 2 }

let initialized = false

const hasGtag = () => typeof window !== 'undefined' && typeof window.gtag === 'function'

/**
 * 지금 어디서 열렸는지: iOS 앱 · 안드로이드 앱(TWA) · 홈 화면에 설치한 웹앱 · 일반 웹.
 * 안드로이드 TWA 는 첫 실행 때만 referrer 가 android-app://kr.ownapp.twa 로 오므로
 * 같은 탭 안에서 로그인 리다이렉트 등으로 새로고침돼도 유지되게 sessionStorage 에 적어 둔다.
 */
export function detectPlatform() {
  if (typeof window === 'undefined') return 'web'
  try {
    const cap = window.Capacitor
    if (cap?.isNativePlatform?.()) return cap.getPlatform?.() === 'android' ? 'android_app' : 'ios_app'
  } catch { /* 무시 */ }
  let saved = null
  try { saved = window.sessionStorage.getItem(PLATFORM_KEY) } catch { /* 저장소 막힘 */ }
  if (saved) return saved
  let platform = 'web'
  if (String(document.referrer || '').startsWith('android-app://kr.ownapp.twa')) platform = 'android_app'
  else if (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone) platform = 'pwa'
  try { if (platform !== 'web') window.sessionStorage.setItem(PLATFORM_KEY, platform) } catch { /* 저장소 막힘 */ }
  return platform
}

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
  // 첫 page_view 에도 실리도록 config 전에 사용자 속성을 넣는다
  window.gtag('set', 'user_properties', { app_platform: detectPlatform() })
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
 * 파라미터에는 이름 · 이메일 · 계정 ID · 금액을 넣지 않는다 (위 정책).
 * @param {string} eventName - 예: 'journal_sent', 'member_added'
 * @param {object} [params] - 이벤트 파라미터 (영문 키, 단순 값)
 */
export function trackEvent(eventName, params = {}) {
  if (!hasGtag()) return
  window.gtag('event', eventName, params)
}

/**
 * 주소가 바뀌지 않는 앱 안 화면 이동 (트레이너 앱 · 회원 앱의 하단 탭).
 * GA4 예약 이벤트 screen_view 대신 tab_view 를 쓴다.
 * @param {string} name - 예: 'trainer_revenue', 'member_logs'
 */
export function trackScreen(name) {
  trackEvent('tab_view', { tab_name: name })
}

/**
 * 로그인 뒤 역할 · 요금제를 사용자 속성으로 남긴다 (계정 식별자는 보내지 않음).
 * @param {{ role?: 'trainer'|'member', plan?: 'free'|'pro'|'premium' }} props
 */
export function setAnalyticsUser({ role, plan } = {}) {
  if (!hasGtag()) return
  const props = {}
  if (role) props.user_role = role
  if (plan) props.plan_tier = plan
  if (Object.keys(props).length) window.gtag('set', 'user_properties', props)
}

/**
 * 트레이너 요금제를 기록하고, 이 기기에서 마지막으로 본 요금제보다 올라갔으면 plan_upgraded 를 보낸다.
 * (결제가 앱 밖 · 관리자 화면에서 일어나므로 앱이 다음에 열릴 때 감지)
 */
export function noteTier(tier) {
  setAnalyticsUser({ role: 'trainer', plan: tier })
  let prev = null
  try { prev = window.localStorage.getItem(LAST_TIER_KEY) } catch { /* 저장소 막힘 */ }
  if (prev && (TIER_RANK[tier] ?? 0) > (TIER_RANK[prev] ?? 0)) {
    trackEvent('plan_upgraded', { from_tier: prev, to_tier: tier })
  }
  try { window.localStorage.setItem(LAST_TIER_KEY, tier) } catch { /* 저장소 막힘 */ }
}

/**
 * SPA 라우팅 시 호출. React Router 등에서 path 변경 감지해서 호출.
 * @param {string} path - 예: '/trainer', '/member'
 */
export function trackPageView(path) {
  if (!hasGtag()) return
  window.gtag('event', 'page_view', { page_path: path })
}
