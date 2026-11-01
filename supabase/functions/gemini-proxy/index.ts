// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

// gemini-proxy — 중앙 Gemini API 키를 서버(엣지함수)에만 두고 대신 호출.
// 클라이언트(MemberPortal/TrainerApp/CRM)는 키를 전혀 보유하지 않음 → 키 노출 차단.
// auth: ["publishable","secret"] → 앱 키(publishable) 보유자만 호출 가능(완전 익명 차단).
//
// 2026-11-02 보안 점검 후속:
//   앱 키(publishable)는 앱 코드에 공개돼 있어 그것만으로는 아무나 호출할 수 있었음.
//   → ① 로그인한 사용자 세션(JWT)일 때만 허용  ② 앱이 실제로 쓰는 모델만 허용.
//   (앱은 supabase.functions.invoke 로 부르므로 로그인 세션 토큰이 자동으로 실림 → 정상 사용 영향 없음)
//
// ⚠️ 배포 후 시크릿 등록 필요: GEMINI_API_KEY = <Gemini API 키>

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 앱 코드에서 쓰는 모델만 (packages/shared/lib/supabase.js GEMINI_MODEL, gymReport.js)
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite-preview",
]);

// 요청의 Authorization 이 "로그인한 사용자" 세션인지 Supabase Auth 에 확인.
// 앱 공개 키(anon/publishable)만 실린 요청은 사용자 정보가 없어 거절된다.
async function isSignedInUser(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  if (!SUPABASE_URL || !authorization.startsWith("Bearer ")) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey },
    });
    if (!res.ok) return false;
    const user = await res.json();
    return Boolean(user?.id);
  } catch {
    return false;
  }
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req) => {
    if (!GEMINI_API_KEY) {
      return Response.json({ error: { message: "AI 키가 설정되지 않았습니다" } }, { status: 503 });
    }
    if (!(await isSignedInUser(req))) {
      return Response.json({ error: { message: "로그인 후 이용해 주세요" } }, { status: 401 });
    }
    try {
      const { model, contents, generationConfig } = await req.json();
      if (!model || !contents) {
        return Response.json({ error: { message: "model/contents 필요" } }, { status: 400 });
      }
      if (!ALLOWED_MODELS.has(model)) {
        return Response.json({ error: { message: "허용되지 않은 모델" } }, { status: 400 });
      }
      const body: Record<string, unknown> = { contents };
      if (generationConfig) body.generationConfig = generationConfig;

      const res = await fetch(
        `${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      return Response.json(data, { status: res.status });
    } catch (e) {
      return Response.json(
        { error: { message: String((e as Error)?.message || e) } },
        { status: 500 },
      );
    }
  }),
};
