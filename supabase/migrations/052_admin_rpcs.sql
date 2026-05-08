-- 052_admin_rpcs.sql
-- Phase B P2 (1순위 승격) — RLS strict (050/051) 적용 후 깨진 admin 화면 복원.
--
-- 배경:
--   AdminPortal 은 Supabase Auth 미사용 + anon key 만 사용. 050/051 의
--   auth.uid() 기반 strict RLS 적용 후 다음 흐름이 침묵 실패:
--     - trainers / members / logs SELECT (anon SELECT 정책 있어도 auth.uid() IS NULL → 0행)
--     - trainers UPDATE (CRM 권한 토글) — UPDATE 정책 없음
--     - trainers INSERT (사전 등록)    — INSERT 정책 없음
--   payments 는 admin 클라이언트에서 직접 access 안 하지만 후속 admin 통계용 RPC 도 같이 정의.
--
-- 해결:
--   SECURITY DEFINER RPC + 단일 토큰(VITE_ADMIN_DB_TOKEN) 으로 우회.
--   기존 admin_add_credits / admin_set_trainer_plan / app_settings_admin_*
--   도 같은 토큰 가드로 통일.
--
-- ⚠️ 적용 전 필수 작업:
--   본 파일의 '<<ADMIN_TOKEN>>' 두 군데(_admin_assert 본문 1군데 — 한 토큰값을
--   실제 랜덤 문자열로 치환한 사본을 만들어 SQL Editor 에 붙여넣을 것.
--   동일 토큰을 apps/admin/.env.local 의 VITE_ADMIN_DB_TOKEN 에 주입.
--
-- 토큰 회전 SOP: 053_admin_token_rotate.sql 발행 + .env.local 동시 갱신.
--
-- 파일 구조:
--   1. app_settings RLS 흡수 (idempotent, fix_rls_top3.sql 의 ① 섹션 발췌)
--   2. _admin_assert 공통 가드
--   3. 신규 admin RPC 6개 (list_trainers/list_members/list_logs/list_payments/update_crm/register_trainer)
--   4. 기존 RPC 패치 (app_settings_admin_upsert/delete + admin_add_credits + admin_set_trainer_plan)


-- ============================================================
-- 1. app_settings RLS — fix_rls_top3.sql 의 ① 섹션 idempotent 흡수
-- ============================================================
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_app_settings"             ON app_settings;
DROP POLICY IF EXISTS "app_settings_select_public"         ON app_settings;
DROP POLICY IF EXISTS "app_settings_block_anon_write"      ON app_settings;
DROP POLICY IF EXISTS "app_settings_write_service_role_only" ON app_settings;

-- SELECT: 누구나 (랜딩 콘텐츠 공개 데이터)
CREATE POLICY "app_settings_select_public"
  ON app_settings
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: service_role 만 직접 가능, anon/authenticated 차단
-- 실제 admin 쓰기는 app_settings_admin_upsert/delete RPC (SECURITY DEFINER) 경유
CREATE POLICY "app_settings_write_service_role_only"
  ON app_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ============================================================
-- 2. _admin_assert — 공통 토큰 가드
-- ============================================================
-- Supabase 호스팅이 GUC/Vault 차단 → 함수 본문에 리터럴 하드코딩.
-- 토큰 회전 시 본 함수 본문 + 클라이언트 .env 동시 갱신.
CREATE OR REPLACE FUNCTION _admin_assert(p_admin_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_admin_token IS NULL OR p_admin_token <> '<<ADMIN_TOKEN>>' THEN
    RAISE EXCEPTION 'admin: unauthorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION _admin_assert(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _admin_assert(text) TO anon, authenticated;

COMMENT ON FUNCTION _admin_assert(text) IS
  'AdminPortal RPC 공통 가드. 모든 admin_* RPC 가 첫 줄에 호출. 토큰 회전 시 본문 교체.';


-- ============================================================
-- 3. 신규 admin RPC — 깨진 흐름 복원
-- ============================================================

-- ── 3-A. admin_list_trainers
DROP FUNCTION IF EXISTS admin_list_trainers(text);
CREATE OR REPLACE FUNCTION admin_list_trainers(p_admin_token text)
RETURNS SETOF trainers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  RETURN QUERY
    SELECT * FROM trainers
    ORDER BY created_at DESC
    LIMIT 100;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_list_trainers(text) TO anon, authenticated;

-- ── 3-B. admin_list_members
DROP FUNCTION IF EXISTS admin_list_members(text, uuid);
CREATE OR REPLACE FUNCTION admin_list_members(
  p_admin_token text,
  p_trainer_id  uuid DEFAULT NULL
)
RETURNS SETOF members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  RETURN QUERY
    SELECT * FROM members
    WHERE p_trainer_id IS NULL OR trainer_id = p_trainer_id
    ORDER BY created_at DESC
    LIMIT 100;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_list_members(text, uuid) TO anon, authenticated;

-- ── 3-C. admin_list_logs
DROP FUNCTION IF EXISTS admin_list_logs(text, integer);
CREATE OR REPLACE FUNCTION admin_list_logs(
  p_admin_token text,
  p_limit       integer DEFAULT 100
)
RETURNS SETOF logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  RETURN QUERY
    SELECT * FROM logs
    ORDER BY created_at DESC
    LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_list_logs(text, integer) TO anon, authenticated;

-- ── 3-D. admin_list_payments
DROP FUNCTION IF EXISTS admin_list_payments(text);
CREATE OR REPLACE FUNCTION admin_list_payments(p_admin_token text)
RETURNS SETOF payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  RETURN QUERY
    SELECT * FROM payments
    ORDER BY created_at DESC
    LIMIT 100;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_list_payments(text) TO anon, authenticated;

-- ── 3-E. admin_update_trainer_crm_permissions
DROP FUNCTION IF EXISTS admin_update_trainer_crm_permissions(text, uuid, jsonb);
CREATE OR REPLACE FUNCTION admin_update_trainer_crm_permissions(
  p_admin_token text,
  p_trainer_id  uuid,
  p_permissions jsonb
)
RETURNS trainers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row trainers%ROWTYPE;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  UPDATE trainers
     SET crm_permissions = p_permissions
   WHERE id = p_trainer_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trainer_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_update_trainer_crm_permissions(text, uuid, jsonb)
  TO anon, authenticated;

-- ── 3-F. admin_register_trainer (사전 등록 / 화이트리스트)
DROP FUNCTION IF EXISTS admin_register_trainer(text, text, text);
CREATE OR REPLACE FUNCTION admin_register_trainer(
  p_admin_token text,
  p_name        text,
  p_email       text
)
RETURNS trainers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row trainers%ROWTYPE;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  INSERT INTO trainers (name, email)
  VALUES (p_name, p_email)
  RETURNING * INTO v_row;
  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_email' USING ERRCODE = '23505';
END;
$$;
GRANT EXECUTE ON FUNCTION admin_register_trainer(text, text, text)
  TO anon, authenticated;


-- ============================================================
-- 4. 기존 RPC 패치 — 토큰 검증 통일
-- ============================================================

-- ── 4-A. app_settings_admin_upsert
-- 기존: fix_rls_top3.sql 의 시그니처는 (text, jsonb, text) — 클라이언트가 'p_secret' 으로
-- 보내던 것과 불일치. DROP 은 인자 타입만 보므로 시그니처 매칭 OK.
DROP FUNCTION IF EXISTS app_settings_admin_upsert(text, jsonb, text);
DROP FUNCTION IF EXISTS app_settings_admin_upsert(text, text, text);
CREATE OR REPLACE FUNCTION app_settings_admin_upsert(
  p_key         text,
  p_value       jsonb,
  p_admin_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  INSERT INTO app_settings (key, value)
  VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RETURN jsonb_build_object('ok', true, 'key', p_key);
END;
$$;
GRANT EXECUTE ON FUNCTION app_settings_admin_upsert(text, jsonb, text)
  TO anon, authenticated;

-- ── 4-B. app_settings_admin_delete
DROP FUNCTION IF EXISTS app_settings_admin_delete(text, text);
CREATE OR REPLACE FUNCTION app_settings_admin_delete(
  p_key         text,
  p_admin_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  DELETE FROM app_settings WHERE key = p_key;
  RETURN jsonb_build_object('ok', true, 'key', p_key);
END;
$$;
GRANT EXECUTE ON FUNCTION app_settings_admin_delete(text, text)
  TO anon, authenticated;

-- ── 4-C. admin_add_credits — 토큰 검증 추가 (시그니처 변경, 클라이언트 동시 갱신 필수)
DROP FUNCTION IF EXISTS admin_add_credits(uuid, integer);
DROP FUNCTION IF EXISTS admin_add_credits(uuid, integer, text);
CREATE OR REPLACE FUNCTION admin_add_credits(
  p_trainer_id  uuid,
  p_amount      integer,
  p_admin_token text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits integer;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  UPDATE trainers
     SET credits = COALESCE(credits, 0) + p_amount
   WHERE id = p_trainer_id
   RETURNING credits INTO v_new_credits;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trainer_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_new_credits;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_add_credits(uuid, integer, text)
  TO anon, authenticated;

-- ── 4-D. admin_set_trainer_plan — 토큰 검증 추가 (현재 클라이언트 호출 없음, orphan 패치)
DROP FUNCTION IF EXISTS admin_set_trainer_plan(uuid, text, integer);
DROP FUNCTION IF EXISTS admin_set_trainer_plan(uuid, text, integer, text);
CREATE OR REPLACE FUNCTION admin_set_trainer_plan(
  p_trainer_id  uuid,
  p_plan        text,
  p_limit       integer DEFAULT NULL,
  p_admin_token text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  UPDATE trainers
     SET plan_type        = p_plan,
         ai_monthly_limit = CASE p_plan
                              WHEN 'unlimited' THEN NULL
                              WHEN 'pro'       THEN NULL
                              ELSE COALESCE(p_limit, 20)
                            END
   WHERE id = p_trainer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trainer_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_set_trainer_plan(uuid, text, integer, text)
  TO anon, authenticated;


-- ============================================================
-- 5. 검증 쿼리 (수동 실행)
-- ============================================================
-- 1) 토큰 가드 동작 확인:
--    SELECT admin_list_trainers('wrong');         -- ERROR: admin: unauthorized
--    SELECT admin_list_trainers('<<ADMIN_TOKEN>>') LIMIT 1;  -- 1행 반환
--
-- 2) 모든 admin RPC 가 SECURITY DEFINER 인지:
--    SELECT proname, prosecdef
--      FROM pg_proc
--     WHERE proname IN (
--       '_admin_assert',
--       'admin_list_trainers','admin_list_members','admin_list_logs','admin_list_payments',
--       'admin_update_trainer_crm_permissions','admin_register_trainer',
--       'admin_add_credits','admin_set_trainer_plan',
--       'app_settings_admin_upsert','app_settings_admin_delete'
--     );
--    -- prosecdef 모두 true 여야 함.
--
-- 3) app_settings RLS:
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'app_settings';
--    -- app_settings_select_public(SELECT) + app_settings_write_service_role_only(ALL)
