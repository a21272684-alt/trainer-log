// gemini-proxy — 중앙 Gemini API 키를 서버(엣지함수)에만 두고 대신 호출.
// 클라이언트(MemberPortal/TrainerApp)는 키를 전혀 보유하지 않음 → 키 노출 차단.
// 로그인 사용자(JWT role=authenticated)만 호출 가능.
//
// 배포 후 시크릿 등록 필요: GEMINI_API_KEY = <Google AI Studio Gemini 키>

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // 로그인 사용자만 (verify_jwt 로 서명 검증됨 → payload.role 확인)
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    let role = ''
    try { role = JSON.parse(atob(token.split('.')[1] || '')).role || '' } catch { /* ignore */ }
    if (role !== 'authenticated') return jsonRes({ error: { message: '로그인이 필요합니다' } }, 401)

    if (!GEMINI_API_KEY) return jsonRes({ error: { message: 'AI 키가 설정되지 않았습니다' } }, 503)

    const { model, contents, generationConfig } = await req.json()
    if (!model || !contents) return jsonRes({ error: { message: 'model/contents 필요' } }, 400)

    const body: Record<string, unknown> = { contents }
    if (generationConfig) body.generationConfig = generationConfig

    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return jsonRes(data, res.status)
  } catch (e) {
    return jsonRes({ error: { message: String((e as Error)?.message || e) } }, 500)
  }
})
