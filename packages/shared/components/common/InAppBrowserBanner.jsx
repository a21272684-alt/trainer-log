import { useMemo, useState } from 'react'

/**
 * 카카오톡 / 페이스북 / 인스타그램 등 SNS 앱 안의 인앱 브라우저 (Embedded WebView)
 * 에서 ownapp.kr 이 열렸을 때 Google OAuth 가 disallowed_useragent 로 차단됨을
 * 사전 안내하는 배너 컴포넌트.
 *
 * 원인:
 *   Google 의 보안 정책 — 비표준 임베디드 웹뷰에서 OAuth 로그인 차단.
 *   카카오톡으로 받은 링크를 그냥 클릭하면 카카오톡 인앱 브라우저에서 열림 → 403.
 *
 * 해결:
 *   사용자에게 Chrome/Safari 같은 외부 브라우저로 열도록 안내.
 *   Android 는 intent:// 우회로 Chrome 자동 실행 가능. iOS 는 수동 안내만.
 *
 * 사용처: TrainerApp.jsx / MemberPortal.jsx 의 로그인 화면 상단.
 */

function detectInAppBrowser() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  const lc = ua.toLowerCase()
  if (lc.includes('kakaotalk')) return 'kakaotalk'
  if (/fbav|fban|fb_iab/i.test(ua)) return 'facebook'
  if (lc.includes('instagram')) return 'instagram'
  if (lc.includes('line/')) return 'line'
  if (lc.includes('naver')) return 'naver'
  if (lc.includes('daum')) return 'daum'
  // Whale 등 일부 브라우저도 OAuth 막힐 수 있음
  return null
}

const BROWSER_LABEL = {
  kakaotalk: '카카오톡',
  facebook: '페이스북',
  instagram: '인스타그램',
  line: '라인',
  naver: '네이버 앱',
  daum: '다음 앱',
}

export default function InAppBrowserBanner() {
  const browser = useMemo(() => detectInAppBrowser(), [])
  const [copied, setCopied] = useState(false)
  if (!browser) return null

  const label = BROWSER_LABEL[browser] || '인앱'
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || ''
  const isAndroid = /android/i.test(ua)
  const isIOS = /iphone|ipad|ipod/i.test(ua)

  function copyUrl() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 3000) },
        () => { alert('주소를 직접 입력해주세요:\n' + url) }
      )
    } else {
      // fallback — textarea 로 복사
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true); setTimeout(() => setCopied(false), 3000)
      } catch {
        alert('주소를 직접 입력해주세요:\n' + url)
      }
    }
  }

  function openInChrome() {
    // Android intent URL — Chrome 앱 강제 실행
    const url = window.location.href.replace(/^https?:\/\//, '')
    window.location.href = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`
  }

  return (
    <div style={{
      background: '#fffbeb',
      border: '2px solid #f59e0b',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '20px',
      fontSize: '13px',
      color: '#78350f',
      lineHeight: 1.6,
    }}>
      <div style={{ fontWeight: 800, marginBottom: '8px', fontSize: '14px', color: '#92400e' }}>
        ⚠️ {label} 안에서는 Google 로그인이 불가능해요
      </div>
      <div style={{ marginBottom: '14px', fontSize: '12px' }}>
        Google의 보안 정책으로 {label} 인앱 브라우저에서는 로그인이 차단됩니다.
        아래 방법으로 외부 브라우저(Chrome / Safari)에서 다시 열어주세요.
      </div>

      {isAndroid && (
        <button
          type="button"
          onClick={openInChrome}
          style={{
            width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
            background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: '13px',
            cursor: 'pointer', marginBottom: '8px', fontFamily: 'inherit',
          }}
        >
          🌐 Chrome으로 열기
        </button>
      )}

      <button
        type="button"
        onClick={copyUrl}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px',
          border: '1.5px solid #f59e0b', background: '#fff',
          color: '#92400e', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {copied ? '✓ 주소 복사됨 — Chrome/Safari 주소창에 붙여넣기' : '📋 주소 복사 후 외부 브라우저에서 열기'}
      </button>

      <div style={{ marginTop: '12px', fontSize: '11px', color: '#92400e', lineHeight: 1.75 }}>
        {isIOS && (
          <>💡 <strong>iPhone:</strong> {label} 화면 우하단 메뉴 → <strong>"Safari로 열기"</strong> 도 가능해요.</>
        )}
        {isAndroid && (
          <>💡 <strong>Android:</strong> 위 <strong>Chrome으로 열기</strong> 또는 {label} 우상단 메뉴 → <strong>"다른 브라우저로 열기"</strong>.</>
        )}
        {!isAndroid && !isIOS && (
          <>💡 외부 브라우저 (Chrome, Safari, Firefox, Edge 등) 에서 ownapp.kr 을 직접 입력해주세요.</>
        )}
      </div>
    </div>
  )
}
