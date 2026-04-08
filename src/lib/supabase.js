import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://udnyilxwskgkofbvvzfy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_FXnRJ_Hsb4TdPiQ8DNpolw_A9sOcatE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
export const GEMINI_MODEL = 'gemini-2.0-flash-lite'
