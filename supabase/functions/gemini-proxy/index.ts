// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

// gemini-proxy — 중앙 Gemini API 키를 서버(엣지함수)에만 두고 대신 호출.
// 클라이언트(MemberPortal/TrainerApp)는 키를 전혀 보유하지 않음 → 키 노출 차단.
// auth: ["publishable","secret"] → 앱 키(publishable) 보유자만 호출 가능(완전 익명 차단).
//
// 2026-11-02: 로그인한 사용자 세션일 때만 + 앱이 실제로 쓰는 모델만 허용.
// 2026-11-07 (101): AI 사용 횟수를 서버에서 확인·차감.
//   ① ai_gate_begin  — 로그인 확인 · 속도 제한 · 수업일지 규칙(유료 무제한 / 무료 월 15수업 / 같은 수업 다시 만들기 3번) · 차감
//   ② Gemini 호출
//   ③ ai_gate_finish — 성공/실패 기록, 실패면 차감 되돌림 (begin 이 준 일회용 nonce 필요)
//   두 RPC 모두 요청에 실린 사용자 세션(JWT)으로 부름 → DB 가 auth.uid() 로 본인을 판별. 서버 비밀키 불필요.
//   예전 앱은 purpose 없이 호출 → 'legacy' (속도 제한만, 차감은 예전 앱이 직접). app_settings.ai_legacy_allowed=false 로 차단 가능.
//
// ⚠️ 시크릿: GEMINI_API_KEY = <Gemini API 키> (이미 등록돼 있음)

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 앱 코드에서 쓰는 모델만 (packages/shared/lib/supabase.js GEMINI_MODEL, gymReport.js)
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite-preview",
]);
// 앱이 보내는 AI 사용 목적 (그 외/없음 = 예전 앱 → legacy)
const PURPOSES = new Set(["journal", "insight", "weekly_report", "food_vision"]);

function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: { message, ...extra } }, { status });
}

// 요청에 실린 앱 키 + 사용자 세션 그대로 DB 함수 호출
async function rpc(req: Request, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: req.headers.get("apikey") ?? "",
      Authorization: req.headers.get("Authorization") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req) => {
    if (!GEMINI_API_KEY || !SUPABASE_URL) {
      return fail(503, "AI 키가 설정되지 않았습니다");
    }

    let body: any;
    try { body = await req.json(); } catch { return fail(400, "요청 형식이 올바르지 않아요"); }
    const { model, contents, generationConfig, purpose, member_id } = body ?? {};
    if (!model || !contents) return fail(400, "model/contents 필요");
    if (!ALLOWED_MODELS.has(model)) return fail(400, "허용되지 않은 모델");

    // ① 서버에서 사용 가능 여부 확인 + 차감
    const gatePurpose = PURPOSES.has(purpose) ? purpose : "legacy";
    const gate = await rpc(req, "ai_gate_begin", {
      p_purpose: gatePurpose,
      p_member_id: typeof member_id === "string" && member_id ? member_id : null,
    });
    if (gate.status === 401 || gate.status === 403) {
      return fail(401, "로그인 후 이용해 주세요", { reason: "login_required" });
    }
    if (gate.status !== 200 || !gate.data) {
      return fail(503, "AI 사용 확인에 실패했어요. 잠시 후 다시 시도해 주세요");
    }
    if (!gate.data.ok) {
      const reason = gate.data.reason ?? "blocked";
      return fail(reason === "login_required" ? 401 : 429, gate.data.message || "지금은 AI를 사용할 수 없어요", {
        reason,
        plan: gate.data.status ?? null,
      });
    }

    const { call_id, nonce } = gate.data;
    let finished = false;
    try {
      // ② Gemini 호출
      const gBody: Record<string, unknown> = { contents };
      if (generationConfig) gBody.generationConfig = generationConfig;
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gBody),
      });
      const data: any = await res.json().catch(() => ({}));
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const ok = res.ok && !data?.error && typeof text === "string" && text.trim().length > 0;

      // ③ 결과 기록 (실패면 차감 되돌림)
      const fin = await rpc(req, "ai_gate_finish", { p_call_id: call_id, p_nonce: nonce, p_ok: ok });
      finished = true;
      const gateInfo = {
        charge: gate.data.charge ?? null,
        regen_left: gate.data.regen_left ?? null,
        plan: fin.data?.status ?? gate.data.status ?? null,
      };
      if (!ok) {
        return Response.json(
          { ...data, error: data?.error ?? { message: "AI 응답이 비어 있습니다" }, gate: gateInfo },
          { status: res.ok ? 502 : res.status },
        );
      }
      return Response.json({ ...data, gate: gateInfo }, { status: 200 });
    } catch (e) {
      if (!finished) {
        await rpc(req, "ai_gate_finish", { p_call_id: call_id, p_nonce: nonce, p_ok: false }).catch(() => null);
      }
      return fail(500, String((e as Error)?.message || e));
    }
  }),
};
