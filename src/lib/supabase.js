import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    '[supabase] 환경변수가 설정되지 않았습니다.\n' +
    '.env 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 입력하세요.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
export const GEMINI_MODEL = 'gemini-2.5-flash-lite'
