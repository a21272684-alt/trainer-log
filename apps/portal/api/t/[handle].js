// /t/{handle} 요청에 대해 트레이너 프로필 데이터로 OG 메타를 동적 주입한 HTML 반환.
// 카톡/인스타/페북 크롤러는 JS 미실행이라 SPA 클라이언트 사이드 OG 변경을 인식 못 함.
// → Edge Function 이 빌드된 index.html 의 OG 메타만 트레이너 데이터로 치환해 반환.
// 일반 브라우저도 같은 HTML 받아 React 가 정상 hydrate (SPA 동작 그대로).
//
// vercel.json 의 rewrite 가 /t/:handle → /api/t/:handle 로 우선 매칭.
// 공개 프로필 없거나 비공개면 기본 index.html (공통 OG) 그대로 반환 = A 의 fallback.
//
// 환경변수: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (이미 portal 빌드용으로 등록됨)

export const config = { runtime: 'edge' }

const FALLBACK_IMAGE = 'https://ownapp.kr/og-cover.png'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default async function handler(req) {
  const url = new URL(req.url)
  const handle = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
  const origin = url.origin

  // 1) 빌드된 index.html 가져오기 (같은 도메인 정적 자산)
  let indexHtml = ''
  try {
    indexHtml = await fetch(`${origin}/index.html`, { cf: { cacheTtl: 60 } }).then(r => r.text())
  } catch (e) {
    return new Response('index.html fetch failed', { status: 500 })
  }

  // 2) Supabase 에서 공개 프로필 조회 (REST, anon key, 공개 RLS 통과)
  let profile = null
  try {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL
    const ANON = process.env.VITE_SUPABASE_ANON_KEY
    if (SUPABASE_URL && ANON && handle) {
      const q = `${SUPABASE_URL}/rest/v1/trainer_profiles` +
        `?handle=eq.${encodeURIComponent(handle)}` +
        `&is_public=eq.true` +
        `&select=display_name,tagline,photo_url,location`
      const r = await fetch(q, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
      if (r.ok) {
        const arr = await r.json()
        if (Array.isArray(arr) && arr.length > 0) profile = arr[0]
      }
    }
  } catch (e) { /* 실패해도 fallback HTML 반환 */ }

  // 3) 프로필 없으면 기본 index.html (A 공통 카드) — fallback
  if (!profile) {
    return new Response(indexHtml, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 's-maxage=60, stale-while-revalidate=300',
      },
    })
  }

  // 4) 트레이너별 OG 메타 생성
  const title = `${profile.display_name} — 오운 트레이너 공개 프로필`
  const desc = [profile.tagline, profile.location].filter(Boolean).join(' · ')
    || `${profile.display_name} 트레이너 — 오운에서 만나보세요`
  const ogImage = profile.photo_url || FALLBACK_IMAGE
  const ogUrl = `${origin}/t/${encodeURIComponent(handle)}`

  // 5) index.html 의 OG 메타 치환 (정규식 — 빌드된 HTML 의 정적 메타를 덮어씀)
  const html = indexHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta\s+property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta\s+property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta\s+property="og:url"[^>]*>/i,
      `<meta property="og:url" content="${esc(ogUrl)}">`)
    .replace(/<meta\s+property="og:image"[^>]*>/i,
      `<meta property="og:image" content="${esc(ogImage)}">`)
    .replace(/<meta\s+property="og:type"[^>]*>/i,
      `<meta property="og:type" content="profile">`)
    .replace(/<meta\s+name="twitter:title"[^>]*>/i,
      `<meta name="twitter:title" content="${esc(title)}">`)
    .replace(/<meta\s+name="twitter:description"[^>]*>/i,
      `<meta name="twitter:description" content="${esc(desc)}">`)
    .replace(/<meta\s+name="twitter:image"[^>]*>/i,
      `<meta name="twitter:image" content="${esc(ogImage)}">`)

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 's-maxage=300, stale-while-revalidate=900',
    },
  })
}
