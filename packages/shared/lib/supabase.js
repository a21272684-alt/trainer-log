import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    '[supabase] 환경변수가 설정되지 않았습니다.\n' +
    '.env 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 입력하세요.'
  )
}

// flowType 'pkce' — 네이티브 앱(Capacitor) 딥링크 OAuth 에서 exchangeCodeForSession 에 필요.
// 웹에서도 detectSessionInUrl 이 ?code= 를 자동 교환하므로 기존 로그인 흐름과 호환된다.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})
export const GEMINI_MODEL = 'gemini-2.5-flash-lite'
