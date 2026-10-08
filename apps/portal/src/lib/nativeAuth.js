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
    const { Browser } = await import('@capacitor/browser')
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
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
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
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token,
    nonce: rawNonce,
  })
  if (error) throw error
}

let _listenerBound = false

/**
 * 앱 시작 시 1회 호출 — OAuth 딥링크 복귀를 처리한다.
 * 웹에서는 no-op. (중복 등록 방지 플래그 포함)
 */
export async function initNativeAuthListener() {
  if (!isNativeApp() || _listenerBound) return
  _listenerBound = true
  const { App } = await import('@capacitor/app')
  const { Browser } = await import('@capacitor/browser')

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
