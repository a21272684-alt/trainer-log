-- 101 AI 사용 서버 제한 + 플랜 판정 일원화
--
-- 정책 (2026-11-07 대표 결정)
--   · 유료(활성 구독)        : AI 수업일지 무제한. 같은 수업(회원 + 회차)은 '다시 만들기' 3번까지 (수업당 최대 4번 생성).
--   · 무료 플랜(신규 가입자) : AI 수업일지 월 15'수업' (free_ai_quota). 같은 수업 다시 만들기는 차감 없음(3번까지). 회원 5명.
--   · 기존 트레이너          : (free_ai_quota 없음 + 구독 없음) 지금처럼 크레딧으로 사용(수업당 1개). 회원 수 제한 없음.
--   · 공통                   : 사람이 낼 수 없는 속도(1분 6번 등)만 차단 — 사용량 상한이 아니라 계정 도용·자동화 방지.
--
-- 구조
--   gemini-proxy(엣지함수)가 Gemini 를 부르기 전에 ai_gate_begin 으로 확인·차감하고,
--   끝나면 ai_gate_finish 로 성공/실패를 기록한다(실패면 차감 되돌림). 둘 다 사용자 세션(JWT)으로 호출 → auth.uid() 로 본인 판별.
--   finish 는 begin 이 엣지함수에만 돌려준 일회용 nonce 가 있어야 해서, 사용자가 성공한 생성을 '실패'로 바꿔 환불받을 수 없다.
--   예전 앱(목적 정보 없이 호출)은 'legacy' 로 받아 속도 제한만 걸고, 차감은 예전 방식(앱이 ai_journal_consume 호출)에 맡긴다.
--   새 앱이 배포되면 app_settings.ai_legacy_allowed = false 로 legacy 호출을 막는다.
--   ai_journal_status / ai_journal_consume (079) 는 예전 앱 호환용으로 그대로 둔다.

-- ─────────────────────────────────────────────
-- 1. AI 호출 기록 (본인 포함 누구도 앱에서 직접 읽기·쓰기 불가 — RLS 정책 없음)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_call_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid    uuid NOT NULL,
  trainer_id  uuid REFERENCES trainers(id) ON DELETE SET NULL,
  member_id   uuid REFERENCES members(id) ON DELETE SET NULL,
  caller      text NOT NULL,                     -- trainer | member
  purpose     text NOT NULL,                     -- journal | insight | weekly_report | food_vision | legacy
  session_key text,                              -- journal: '회원id:회차'
  charge      text NOT NULL DEFAULT 'none',      -- quota | credits | unlimited | regen | none
  status      text NOT NULL DEFAULT 'pending',   -- pending | ok | failed | rejected
  reason      text,                              -- 거절 사유
  nonce       uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_uid_time ON ai_call_log (auth_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_session ON ai_call_log (trainer_id, session_key) WHERE session_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_call_log_time ON ai_call_log (created_at DESC);
ALTER TABLE ai_call_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_call_log FROM anon, authenticated;

-- ─────────────────────────────────────────────
-- 2. 플랜 판정 도우미
-- ─────────────────────────────────────────────
-- 활성 구독이면 'pro' | 'premium' (그 외 옛 유료 이름은 premium 으로 — 앱과 같은 규칙), 아니면 NULL
CREATE OR REPLACE FUNCTION _trainer_paid_tier(p_trainer_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN lower(s.plan) = 'pro' THEN 'pro' ELSE 'premium' END
    FROM subscriptions s
   WHERE s.trainer_id = p_trainer_id
     AND s.voided_at IS NULL
     AND s.valid_until >= (now() AT TIME ZONE 'Asia/Seoul')::date
   ORDER BY s.valid_until DESC
   LIMIT 1
$$;

-- app_settings.feature_gates 는 JSON 문자열로 저장돼 있음 → 객체로 풀어서 돌려줌
CREATE OR REPLACE FUNCTION _feature_gates()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT value INTO v FROM app_settings WHERE key = 'feature_gates';
  IF v IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(v) = 'string' THEN
    BEGIN
      v := (v #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      RETURN '{}'::jsonb;
    END;
  END IF;
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;

-- 회원 수 상한 (NULL = 제한 없음). 무료 플랜(신규 가입자)만 feature_gates.free.member_limit, 기존 트레이너는 제한 없음.
CREATE OR REPLACE FUNCTION _trainer_member_limit(p_trainer_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier  text := _trainer_paid_tier(p_trainer_id);
  v_quota integer;
  g       jsonb := _feature_gates();
  v_limit integer;
BEGIN
  IF v_tier IS NULL THEN
    SELECT free_ai_quota INTO v_quota FROM trainers WHERE id = p_trainer_id;
    IF v_quota IS NULL THEN RETURN NULL; END IF;
    v_limit := COALESCE(NULLIF(g #>> '{free,member_limit}', '')::integer, 5);
  ELSE
    v_limit := COALESCE(NULLIF(g #>> ARRAY[v_tier, 'member_limit'], '')::integer,
                        NULLIF(g #>> '{paid,member_limit}', '')::integer,
                        9999);
  END IF;
  RETURN CASE WHEN v_limit >= 9999 THEN NULL ELSE v_limit END;
END;
$$;

-- 트레이너 앱에 보여줄 AI·회원 한도 상태
CREATE OR REPLACE FUNCTION _ai_plan_status(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t      trainers%ROWTYPE;
  v_tier text;
  p      record;
  v_used integer;
BEGIN
  SELECT * INTO t FROM trainers WHERE id = p_trainer_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_tier := _trainer_paid_tier(t.id);

  IF v_tier IS NOT NULL THEN
    RETURN jsonb_build_object('plan', v_tier, 'mode', 'unlimited', 'credits', COALESCE(t.credits, 0),
                              'member_limit', _trainer_member_limit(t.id), 'regen_max', 3);
  END IF;
  IF t.free_ai_quota IS NULL THEN
    RETURN jsonb_build_object('plan', 'legacy', 'mode', 'credits', 'credits', COALESCE(t.credits, 0),
                              'member_limit', NULL, 'regen_max', 3);
  END IF;

  SELECT * INTO p FROM _free_ai_period(t.free_ai_anchor);
  v_used := CASE WHEN t.free_ai_period_start IS DISTINCT FROM p.period_start THEN 0 ELSE t.free_ai_used END;
  RETURN jsonb_build_object('plan', 'free', 'mode', 'quota',
                            'quota', t.free_ai_quota, 'used', v_used,
                            'remaining', GREATEST(0, t.free_ai_quota - v_used),
                            'resets_at', p.resets_at, 'credits', COALESCE(t.credits, 0),
                            'member_limit', _trainer_member_limit(t.id), 'regen_max', 3);
END;
$$;

-- 앱용: 로그인한 트레이너 본인의 상태
CREATE OR REPLACE FUNCTION ai_plan_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM trainers WHERE auth_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  RETURN _ai_plan_status(v_id);
END;
$$;

-- ─────────────────────────────────────────────
-- 3. AI 호출 확인·차감 (엣지함수가 Gemini 호출 전에 사용자 세션으로 부름)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ai_gate_begin(p_purpose text, p_member_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_rate_minute  constant integer := 6;   -- 모든 AI: 1분에 6번째부터 차단 (사람 속도 아님)
  c_rate_hour    constant integer := 60;  -- 수업일지: 1시간에 60번째부터 차단
  c_daily_other  constant integer := 30;  -- 인사이트 · 주간 리포트 · 음식 사진: 하루 30번
  c_daily_legacy constant integer := 60;  -- 예전 앱(목적 정보 없음): 24시간 60번
  c_regen_max    constant integer := 3;   -- 같은 수업 다시 만들기
  v_uid     uuid := auth.uid();
  v_purpose text := lower(COALESCE(NULLIF(btrim(p_purpose), ''), 'legacy'));
  v_caller  text;
  v_tid     uuid;
  v_mid     uuid;
  v_member  members%ROWTYPE;
  t         trainers%ROWTYPE;
  v_session text;
  v_prior   integer := 0;
  v_charge  text := 'none';
  v_tier    text;
  v_n       integer;
  p         record;
  v_used    integer;
  v_flag    jsonb;
  v_row     ai_call_log%ROWTYPE;
  v_reason  text;
  v_msg     text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'login_required', 'message', '로그인 후 이용해 주세요');
  END IF;

  -- 같은 사람이 동시에 여러 번 보내 제한을 피하지 못하게 한 줄로 세움
  PERFORM pg_advisory_xact_lock(hashtext('ai_gate:' || v_uid::text));

  SELECT * INTO t FROM trainers WHERE auth_id = v_uid LIMIT 1;
  IF FOUND THEN
    v_caller := 'trainer'; v_tid := t.id;
  ELSE
    SELECT * INTO v_member FROM members WHERE auth_id = v_uid LIMIT 1;
    IF FOUND THEN
      v_caller := 'member'; v_mid := v_member.id; v_tid := v_member.trainer_id;
    ELSE
      RETURN jsonb_build_object('ok', false, 'reason', 'no_profile', 'message', '트레이너·회원 계정에서만 AI를 사용할 수 있어요');
    END IF;
  END IF;

  IF NOT ((v_caller = 'trainer' AND v_purpose IN ('journal', 'insight', 'weekly_report', 'legacy'))
       OR (v_caller = 'member'  AND v_purpose IN ('food_vision', 'legacy'))) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_purpose', 'message', '지원하지 않는 AI 요청이에요');
  END IF;

  -- 예전 앱 호출 허용 여부 (새 앱 배포 뒤 false 로)
  IF v_purpose = 'legacy' THEN
    SELECT value INTO v_flag FROM app_settings WHERE key = 'ai_legacy_allowed';
    IF v_flag IS NOT NULL AND (v_flag = 'false'::jsonb OR v_flag = '"false"'::jsonb) THEN
      v_reason := 'app_update';
      v_msg := '앱이 업데이트됐어요. 앱을 완전히 닫았다가 다시 열어 주세요';
    END IF;
  END IF;

  -- ① 속도 제한 — 1분 안에 너무 많은 요청은 기록도 남기지 않고 바로 거절 (기록이 쌓이는 것 방지)
  IF v_reason IS NULL THEN
    SELECT count(*) INTO v_n FROM ai_call_log
     WHERE auth_uid = v_uid AND status <> 'rejected' AND created_at > now() - interval '1 minute';
    IF v_n >= c_rate_minute THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_fast', 'message', '요청이 너무 빨라요. 잠시 후 다시 시도해 주세요');
    END IF;
  END IF;

  IF v_reason IS NULL AND v_purpose = 'journal' THEN
    SELECT count(*) INTO v_n FROM ai_call_log
     WHERE auth_uid = v_uid AND purpose = 'journal' AND status <> 'rejected' AND created_at > now() - interval '1 hour';
    IF v_n >= c_rate_hour THEN
      v_reason := 'too_fast'; v_msg := '짧은 시간에 요청이 너무 많아요. 잠시 후 다시 시도해 주세요';
    END IF;
  ELSIF v_reason IS NULL AND v_purpose = 'legacy' THEN
    SELECT count(*) INTO v_n FROM ai_call_log
     WHERE auth_uid = v_uid AND purpose = 'legacy' AND status <> 'rejected' AND created_at > now() - interval '1 day';
    IF v_n >= c_daily_legacy THEN
      v_reason := 'daily_limit'; v_msg := '오늘 쓸 수 있는 AI 횟수를 모두 썼어요. 내일 다시 시도해 주세요';
    END IF;
  ELSIF v_reason IS NULL THEN
    SELECT count(*) INTO v_n FROM ai_call_log
     WHERE auth_uid = v_uid AND purpose = v_purpose AND status <> 'rejected'
       AND created_at >= (((now() AT TIME ZONE 'Asia/Seoul')::date)::timestamp AT TIME ZONE 'Asia/Seoul');
    IF v_n >= c_daily_other THEN
      v_reason := 'daily_limit'; v_msg := '오늘 쓸 수 있는 횟수를 모두 썼어요. 내일 다시 시도해 주세요';
    END IF;
  END IF;

  -- ② 수업일지: 같은 수업(회원 + 다음 회차) 기준으로 판단
  IF v_reason IS NULL AND v_purpose = 'journal' THEN
    IF p_member_id IS NULL THEN
      v_reason := 'member_required'; v_msg := '회원을 먼저 골라 주세요';
    ELSE
      SELECT * INTO v_member FROM members WHERE id = p_member_id AND trainer_id = t.id;
      IF NOT FOUND THEN
        v_reason := 'member_not_found'; v_msg := '회원 정보를 찾을 수 없어요';
      ELSE
        v_mid := v_member.id;
        v_session := v_member.id::text || ':' || (COALESCE(v_member.done_sessions, 0) + 1)::text;
        SELECT count(*) INTO v_prior FROM ai_call_log
         WHERE trainer_id = t.id AND purpose = 'journal' AND session_key = v_session AND status IN ('pending', 'ok');

        IF v_prior > c_regen_max THEN
          v_reason := 'regen_limit';
          v_msg := '같은 수업은 다시 만들기 ' || c_regen_max || '번까지 할 수 있어요. 직접 수정하기로 다듬어 주세요';
        ELSIF v_prior >= 1 THEN
          v_charge := 'regen';                              -- 다시 만들기: 차감 없음
        ELSE
          v_tier := _trainer_paid_tier(t.id);
          IF v_tier IS NOT NULL THEN
            v_charge := 'unlimited';                        -- 유료: 차감 없음
          ELSE
            SELECT * INTO t FROM trainers WHERE id = t.id FOR UPDATE;
            IF t.free_ai_quota IS NOT NULL THEN             -- 무료 플랜: 월 횟수 먼저
              SELECT * INTO p FROM _free_ai_period(t.free_ai_anchor);
              v_used := CASE WHEN t.free_ai_period_start IS DISTINCT FROM p.period_start THEN 0 ELSE t.free_ai_used END;
              IF v_used < t.free_ai_quota THEN
                UPDATE trainers SET free_ai_used = v_used + 1, free_ai_period_start = p.period_start WHERE id = t.id;
                v_charge := 'quota';
              END IF;
            END IF;
            IF v_charge = 'none' AND COALESCE(t.credits, 0) > 0 THEN   -- 그다음 크레딧
              UPDATE trainers SET credits = credits - 1 WHERE id = t.id;
              v_charge := 'credits';
            END IF;
            IF v_charge = 'none' THEN
              v_reason := 'limit';
              v_msg := CASE WHEN t.free_ai_quota IS NOT NULL
                            THEN '이번 달 AI 수업일지 ' || t.free_ai_quota || '회를 모두 사용했어요'
                            ELSE '사용할 수 있는 AI 수업일지 횟수가 없어요' END;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO ai_call_log (auth_uid, trainer_id, member_id, caller, purpose, session_key, charge, status, reason, finished_at)
    VALUES (v_uid, v_tid, v_mid, v_caller, v_purpose, v_session, 'none', 'rejected', v_reason, now());
    RETURN jsonb_build_object('ok', false, 'reason', v_reason, 'message', v_msg,
                              'status', CASE WHEN v_caller = 'trainer' THEN _ai_plan_status(v_tid) END);
  END IF;

  INSERT INTO ai_call_log (auth_uid, trainer_id, member_id, caller, purpose, session_key, charge, status)
  VALUES (v_uid, v_tid, v_mid, v_caller, v_purpose, v_session, v_charge, 'pending')
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'call_id', v_row.id, 'nonce', v_row.nonce, 'charge', v_charge,
                            'regen_left', CASE WHEN v_purpose = 'journal' THEN c_regen_max - v_prior END,
                            'status', CASE WHEN v_caller = 'trainer' THEN _ai_plan_status(v_tid) END);
END;
$$;

-- 생성 결과 기록. 실패면 차감 되돌림. nonce 는 begin 이 엣지함수에만 돌려준 값.
CREATE OR REPLACE FUNCTION ai_gate_finish(p_call_id uuid, p_nonce uuid, p_ok boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v ai_call_log%ROWTYPE;
BEGIN
  SELECT * INTO v FROM ai_call_log
   WHERE id = p_call_id AND nonce = p_nonce AND auth_uid = auth.uid() AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  IF COALESCE(p_ok, false) THEN
    UPDATE ai_call_log SET status = 'ok', finished_at = now() WHERE id = v.id;
  ELSE
    UPDATE ai_call_log SET status = 'failed', finished_at = now() WHERE id = v.id;
    IF v.charge = 'quota' THEN
      UPDATE trainers SET free_ai_used = GREATEST(0, free_ai_used - 1) WHERE id = v.trainer_id;
    ELSIF v.charge = 'credits' THEN
      UPDATE trainers SET credits = COALESCE(credits, 0) + 1 WHERE id = v.trainer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true,
                            'status', CASE WHEN v.caller = 'trainer' THEN _ai_plan_status(v.trainer_id) END);
END;
$$;

-- ─────────────────────────────────────────────
-- 4. 회원 수 상한 — 앱 화면 확인을 우회해도 서버에서 막음 (트레이너 개인 레슨 회원만 셈, CRM 센터 회원 제외)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _members_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit integer;
  v_n     integer;
BEGIN
  IF NEW.trainer_id IS NULL OR NOT COALESCE(NEW.is_personal, true) THEN RETURN NEW; END IF;
  v_limit := _trainer_member_limit(NEW.trainer_id);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  PERFORM 1 FROM trainers WHERE id = NEW.trainer_id FOR UPDATE;   -- 동시에 추가해 상한을 넘는 것 방지
  SELECT count(*) INTO v_n FROM members WHERE trainer_id = NEW.trainer_id AND is_personal;
  IF v_n >= v_limit THEN
    RAISE EXCEPTION '회원은 최대 %명까지 등록할 수 있어요', v_limit USING ERRCODE = 'P0001', HINT = 'member_limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members_enforce_limit ON members;
CREATE TRIGGER trg_members_enforce_limit
  BEFORE INSERT ON members
  FOR EACH ROW EXECUTE FUNCTION _members_enforce_limit();

-- ─────────────────────────────────────────────
-- 5. 실행 권한 — Supabase 는 새 함수에 anon/authenticated 실행 권한을 기본으로 주므로 명시적으로 회수
-- ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION _trainer_paid_tier(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _feature_gates()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _trainer_member_limit(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _ai_plan_status(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _members_enforce_limit()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_plan_status()                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION ai_gate_begin(text, uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION ai_gate_finish(uuid, uuid, boolean)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ai_plan_status()                    TO authenticated;
GRANT EXECUTE ON FUNCTION ai_gate_begin(text, uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION ai_gate_finish(uuid, uuid, boolean) TO authenticated;
