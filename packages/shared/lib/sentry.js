// packages/shared/lib/sentry.js
// Phase D-1 — Sentry 에러 트래킹 공용 init 헬퍼.
//
// 사용법 (각 앱 main.jsx 최상단):
//   import { initSentry } from '@trainer-log/shared/lib/sentry'
//   initSentry('portal')   // 또는 'admin' / 'crm'
//
// 정책:
//   - DSN 미설정 시 warning 만 찍고 no-op (앱 동작엔 영향 0)
//   - sendDefaultPii=false   → IP/UA 등 자동 PII 수집 차단 (한국 PIPA 친화)
//   - tracesSampleRate=0     → 트레이싱 비활성. 5K 무료 이벤트 한도를 에러에만 사용.
//   - replays 둘 다 0        → 세션 리플레이 OFF (개인정보·비용)
//   - beforeSend 에서 user/breadcrumb 의 잔여 PII 정리
//   - tag.app 으로 앱 구분 (Sentry 대시보드에서 portal/admin/crm 필터)

import * as Sentry from '@sentry/react'

const KNOWN_NOISE = [
  // 브라우저 ResizeObserver 의 잘 알려진 false-positive
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  // 비-Error 객체로 reject 된 Promise — Sentry 에 노이즈만 발생
  'Non-Error promise rejection captured',
  // OAuth 후 일시적 네트워크 끊김 등 사용자 환경 문제
  'NetworkError when attempting to fetch resource',
  'Load failed',
]

export function initSentry(appName) {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    console.warn(`[Sentry] VITE_SENTRY_DSN not set — skipping init for "${appName}"`)
    return
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'development' or 'production'
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    initialScope: {
      tags: { app: appName },
    },
    ignoreErrors: KNOWN_NOISE,
    beforeSend(event) {
      // 추가 안전망: user 필드에서 이름·이메일·IP 제거
      if (event.user) {
        delete event.user.email
        delete event.user.username
        delete event.user.ip_address
      }
      // breadcrumb 의 form input value 도 잠재 PII 라 절단
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map(crumb => {
          if (crumb.category === 'ui.input' && crumb.message) {
            return { ...crumb, message: '[redacted]' }
          }
          return crumb
        })
      }
      return event
    },
  })
}
