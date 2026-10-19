// 네이티브 앱(Capacitor iOS/Android)용 OAuth 로그인 헬퍼.
//
// 배경: 구글은 보안정책상 "앱 내장 웹뷰(WKWebView 등)"에서의 OAuth 로그인을
// 차단한다(disallowed_useragent). 그래서 네이티브 앱에서는 로그인 URL을
// 앱 웹뷰가 아니라 "시스템 브라우저(SFSafariViewController/Chrome Custom Tabs)"로
// 열고, 인증이 끝나면 커스텀 스킴 딥링크(kr.ownapp.app://oauth-callback)로
// 앱에 복귀해 세션을 설정한다. 카카오도 동일 경로(Supabase OAuth)라 같은 코드로 커버됨.
//
// 웹(일반 브라우저)에서는 isNativeApp()===false → 전부 기존 web 흐름 그대로 동작한다.
import { Capacitor } from '@capacitor/core'
// 플러그인은 정적 import — 예전엔 await import() 로 지연 로딩해서 별도 청크(index-<hash>.js)가 됐는데,
// 배포로 해시가 바뀐 뒤 옛 화면을 띄워둔 앱이 없어진 청크를 요청 → Vercel SPA rewrite 가 index.html(text/html)
// 을 돌려줘 "'text/html' is not a valid JavaScript MIME type" 로 로그인이 실패했음(2026-10-19).
// 로그인은 핵심 경로라 본체 번들에 포함. (웹에선 플러그인 프록시만 등록되고 네이티브 호출은 하지 않음)
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { SignInWithApple } from '@capacitor-community/apple-sign-in'
import { supabase } from '@trainer-log/shared/lib/supabase'

const APP_SCHEME = 'kr.ownapp.app'
const OAUTH_REDIRECT = `${APP_SCHEME}://oauth-callback`

/** Capacitor 네이티브 앱(iOS/Android) 안에서 실행 중인가? 웹이면 false. */
export function isNativeApp() {
  try {
    return Capacitor?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

/**
 * 구글/카카오 OAuth 로그인 시작.
 *  - 웹: 기존처럼 현재 origin + webRedirectPath 로 redirect.
 *  - 네이티브: 시스템 브라우저로 열고 딥링크로 복귀(구글 웹뷰 차단 회피).
 * 실패 시 throw → 호출부에서 toast 처리.
 */
export async function signInWithProvider(provider, webRedirectPath = '/') {
  if (isNativeApp()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
    })
    if (error) throw error
    if (data?.url) await Browser.open({ url: data.url })
    return
  }
  // 웹
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + webRedirectPath },
  })
  if (error) throw error
}

/* ── Apple 로그인 (네이티브 전용) ──────────────────────────────
   애플 심사 가이드 4.8: 구글/카카오 같은 소셜 로그인을 제공하면 "Apple 로그인"도
   반드시 함께 제공해야 함. iOS 네이티브 Sign in with Apple → Supabase signInWithIdToken.
   웹에선 호출하지 않음(버튼도 isNativeApp() 일 때만 노출). */
function randomNonce(len = 32) {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}
async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

export async function signInWithApple() {
  // Apple 에는 '해시된' nonce 를, Supabase 에는 '원본' nonce 를 전달해 토큰 변조를 막는다.
  const rawNonce = randomNonce()
  const hashedNonce = await sha256hex(rawNonce)
  const res = await SignInWithApple.authorize({
    clientId: 'kr.ownapp.app',        // iOS 네이티브는 앱 Bundle ID 를 식별자로 사용
    redirectURI: 'https://ownapp.kr', // 네이티브에선 미사용이나 옵션 타입상 필요
    scopes: 'name email',
    nonce: hashedNonce,
  })
  const token = res?.response?.identityToken
  if (!token) throw new Error('Apple 인증 토큰을 받지 못했습니다.')

  // Apple 은 이름을 '최초 승인 때만' 앱에 넘겨주고 ID 토큰엔 넣지 않음.
  // 로그인(signInWithIdToken) 직후 SIGNED_IN 이벤트로 가입 화면이 먼저 뜨므로, 그 전에 이름을 보관해 둔다.
  // (App Store 4 반려 2026-10-18: Apple 로그인 후 이름을 다시 입력시키면 안 됨 → 가입 화면이 이 값을 사용)
  const given = res?.response?.givenName || ''
  const family = res?.response?.familyName || ''
  let fullName = ''
  if (given || family) {
    const korean = /[가-힣]/.test(given + family)
    fullName = korean ? `${family}${given}` : [given, family].filter(Boolean).join(' ')
    try { localStorage.setItem(APPLE_NAME_KEY, fullName) } catch { /* 저장 불가 환경 무시 */ }
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token,
    nonce: rawNonce,
  })
  if (error) throw error

  // 계정 메타데이터에도 저장 (다른 기기·재설치 시에도 이름 유지)
  if (fullName) {
    try {
      await supabase.auth.updateUser({ data: { full_name: fullName } })
    } catch (e) {
      console.warn('[signInWithApple] 이름 저장 실패:', e?.message || e)
    }
  }
}

/** Apple 최초 승인 때 받은 이름 (가입 화면 프리필용). 없으면 '' */
export const APPLE_NAME_KEY = 'ownapp_apple_name'
export function getStashedAppleName() {
  try { return localStorage.getItem(APPLE_NAME_KEY) || '' } catch { return '' }
}
export function clearStashedAppleName() {
  try { localStorage.removeItem(APPLE_NAME_KEY) } catch { /* noop */ }
}

/** 현재 로그인 사용자가 Apple 로그인으로 들어왔는가 */
export function isAppleAuthUser(u) {
  if (!u) return false
  if (u.app_metadata?.provider === 'apple') return true
  return Array.isArray(u.identities) && u.identities.some(i => i?.provider === 'apple')
}

let _listenerBound = false

/**
 * 앱 시작 시 1회 호출 — OAuth 딥링크 복귀를 처리한다.
 * 웹에서는 no-op. (중복 등록 방지 플래그 포함)
 */
export async function initNativeAuthListener() {
  if (!isNativeApp() || _listenerBound) return
  _listenerBound = true

  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || url.indexOf(`${APP_SCHEME}://`) !== 0) return
    try {
      const u = new URL(url)
      const code = u.searchParams.get('code')
      if (code) {
        // PKCE 플로우: code → 세션 교환 (code_verifier 는 로그인 시작 때 localStorage 저장됨)
        await supabase.auth.exchangeCodeForSession(code)
      } else {
        // implicit fallback: #access_token=...&refresh_token=...
        const frag = new URLSearchParams((u.hash || '').replace(/^#/, ''))
        const access_token = frag.get('access_token')
        const refresh_token = frag.get('refresh_token')
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
        }
      }
    } catch (e) {
      console.error('[nativeAuth] OAuth 콜백 처리 실패:', e?.message || e)
    } finally {
      try {
        await Browser.close()
      } catch {
        /* 이미 닫혔으면 무시 */
      }
    }
  })
}
