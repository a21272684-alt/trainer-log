// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

// gemini-proxy — 중앙 Gemini API 키를 서버(엣지함수)에만 두고 대신 호출.
// 클라이언트(MemberPortal/TrainerApp)는 키를 전혀 보유하지 않음 → 키 노출 차단.
// auth: ["publishable","secret"] → 앱 키(publishable) 보유자만 호출 가능(완전 익명 차단).
//
// ⚠️ 배포 후 시크릿 등록 필요: GEMINI_API_KEY = <Gemini API 키>

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req) => {
    if (!GEMINI_API_KEY) {
      return Response.json({ error: { message: "AI 키가 설정되지 않았습니다" } }, { status: 503 });
    }
    try {
      const { model, contents, generationConfig } = await req.json();
      if (!model || !contents) {
        return Response.json({ error: { message: "model/contents 필요" } }, { status: 400 });
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
