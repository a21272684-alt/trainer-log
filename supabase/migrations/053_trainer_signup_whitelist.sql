-- 053_trainer_signup_whitelist.sql
-- Phase D-4.1 — 트레이너 신규 가입을 admin 화이트리스트(승인) 방식으로 전환.
--
-- 배경:
--   050 에서 trainer_resolve_or_create RPC 가 OAuth 후 신규 사용자도 자동
--   INSERT 했음 (분기 (c)). 베타 운영 중 품질 관리·남용 방지를 위해
--   admin 승인을 거친 사람만 trainers 행이 생기도록 흐름 변경.
--
-- 핵심 원칙 (기존 생태계 무손상):
--   - 이미 trainers 행이 있는 사용자: 영향 0 (분기 (a)/(b) 그대로 작동)
--   - admin 사전등록 (admin_register_trainer) 도 영향 0 (auth_id NULL → email 매칭 분기 (b))
--   - 변경 범위: 분기 (c) "신규 INSERT" → 별도 signup_requests 테이블에 pending row 생성하는 RPC 로 분리
--
-- 흐름:
--   1) OAuth 로그인 → 클라이언트가 trainer_resolve_or_create 호출
--      - (a) auth_id 매칭 → trainers row 반환 → 로그인 성공
--      - (b) email 매칭 (admin 사전등록) → auth_id 채움 → 로그인 성공
--      - 둘 다 실패 → NULL 반환 (이전엔 자동 INSERT 했음, 지금은 NO-OP)
--   2) 클라이언트가 trainer_get_signup_status 호출 → 'none' / 'pending' / 'rejected' / 'already_trainer'
--   3) 'none' 이면 등록 화면 → 사용자가 이름·동의 입력 → trainer_create_signup_request 호출 → pending row 생성
--   4) admin 이 admin_approve_signup_request 호출 → trainers INSERT (plan_type='free', ai_monthly_limit=20) + signup_request status='approved'
--   5) 트레이너가 재로그인 → 분기 (a) 매칭 → 정상 진입
--
-- 남용 방지 (간단):
--   - email UNIQUE → 같은 이메일 1 요청만
--   - rejected 상태에선 같은 이메일로 재요청 시 'rejected' 상태 그대로 반환 (재시도 차단)
--   - OAuth 강제 → 익명 가입 불가 (이미 인프라 보장)
--
-- ============================================================
-- 1. trainer_signup_requests 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS trainer_signup_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id          uuid NOT NULL,                 -- supabase auth user id (OAuth)
  email            text NOT NULL,
  name             text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  CONSTRAINT trainer_signup_requests_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status_requested
  ON trainer_signup_requests (status, requested_at DESC);

COMMENT ON TABLE trainer_signup_requests IS
  '트레이너 신규 가입 요청 (화이트리스트). admin 승인 후 trainers 테이블에 INSERT.';

-- ============================================================
-- 2. RLS — 사용자 본인 요청만 SELECT 가능. 쓰기는 모두 RPC 경유.
-- ============================================================
ALTER TABLE trainer_signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signup_req_self_select" ON trainer_signup_requests;
CREATE POLICY "signup_req_self_select" ON trainer_signup_requests
  FOR SELECT TO authenticated, anon
  USING (auth.uid() = auth_id);

-- INSERT/UPDATE/DELETE 정책 없음 → 모두 SECURITY DEFINER RPC 경유 강제

-- ============================================================
-- 3. trainer_resolve_or_create — 분기 (c) INSERT 제거
-- ----------------------------------------------------------------
--   기존 050 의 함수를 REPLACE. 시그니처 동일 (p_email, p_name, p_phone).
--   p_name / p_phone 은 호환을 위해 유지하되 본 함수에선 무시됨.
--   신규 가입은 trainer_create_signup_request 가 담당.
-- ============================================================
CREATE OR REPLACE FUNCTION trainer_resolve_or_create(
  p_email text DEFAULT NULL,
  p_name  text DEFAULT NULL,  -- IGNORED (호환용)
  p_phone text DEFAULT NULL   -- IGNORED (호환용)
) RETURNS trainers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row trainers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;

  -- (a) auth_id 매칭 → 재로그인
  SELECT * INTO v_row FROM trainers WHERE auth_id = v_uid LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  -- (b) email 매칭 → 기존 트레이너 첫 OAuth (admin 사전등록 포함)
  IF p_email IS NOT NULL AND p_email <> '' THEN
    UPDATE trainers SET auth_id = v_uid
      WHERE email = p_email AND auth_id IS NULL
      RETURNING * INTO v_row;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  -- (c) INSERT 분기 제거됨 → NULL (클라이언트가 가입 요청 흐름으로 분기)
  RETURN NULL;
END;
$$;

-- 시그니처 동일하므로 GRANT 그대로 유지 (REPLACE 라 권한 보존됨)
-- 명시적으로 한 번 더 적용
GRANT EXECUTE ON FUNCTION trainer_resolve_or_create(text, text, text)
  TO authenticated, anon;

-- ============================================================
-- 4. trainer_get_signup_status — 사용자 본인의 가입 요청 상태 조회
-- ============================================================
CREATE OR REPLACE FUNCTION trainer_get_signup_status(p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req trainer_signup_requests%ROWTYPE;
  v_t   trainers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;

  -- 이미 trainers 에 있으면 즉시 already_trainer 반환 (이중 가드)
  SELECT * INTO v_t FROM trainers
    WHERE auth_id = v_uid
       OR (p_email IS NOT NULL AND p_email <> '' AND email = p_email)
    LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_trainer');
  END IF;

  -- signup_requests 조회
  SELECT * INTO v_req FROM trainer_signup_requests
    WHERE auth_id = v_uid
       OR (p_email IS NOT NULL AND p_email <> '' AND email = p_email)
    ORDER BY requested_at DESC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  RETURN jsonb_build_object(
    'status',       v_req.status,
    'reason',       v_req.rejection_reason,
    'requested_at', v_req.requested_at,
    'name',         v_req.name,
    'email',        v_req.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION trainer_get_signup_status(text) TO authenticated, anon;

-- ============================================================
-- 5. trainer_create_signup_request — 신규 가입 요청 생성
-- ----------------------------------------------------------------
--   기존 요청이 있으면 그 상태 반환 (재요청 차단).
--   trainers 에 이미 있으면 already_trainer 반환.
-- ============================================================
CREATE OR REPLACE FUNCTION trainer_create_signup_request(
  p_email text,
  p_name  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req trainer_signup_requests%ROWTYPE;
  v_t   trainers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;
  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  -- 이미 trainers 행이 있으면 요청 불필요
  SELECT * INTO v_t FROM trainers
    WHERE auth_id = v_uid OR email = p_email
    LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_trainer');
  END IF;

  -- 기존 요청 확인
  SELECT * INTO v_req FROM trainer_signup_requests
    WHERE auth_id = v_uid OR email = p_email
    LIMIT 1;
  IF FOUND THEN
    -- 어떤 상태든 그대로 반환 (pending/approved/rejected)
    -- rejected 상태에선 재요청 차단 효과 (남용 방지)
    RETURN jsonb_build_object(
      'status', v_req.status,
      'reason', v_req.rejection_reason
    );
  END IF;

  -- 신규 요청 INSERT
  INSERT INTO trainer_signup_requests (auth_id, email, name)
    VALUES (v_uid, p_email, p_name);

  RETURN jsonb_build_object('status', 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION trainer_create_signup_request(text, text)
  TO authenticated, anon;

-- ============================================================
-- 6. admin_list_signup_requests — admin 가입 승인 대기열 조회
-- ============================================================
DROP FUNCTION IF EXISTS admin_list_signup_requests(text, text);
CREATE OR REPLACE FUNCTION admin_list_signup_requests(
  p_admin_token text,
  p_status      text DEFAULT 'pending'
)
RETURNS SETOF trainer_signup_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  RETURN QUERY
    SELECT * FROM trainer_signup_requests
    WHERE p_status IS NULL OR status = p_status
    ORDER BY requested_at DESC
    LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_signup_requests(text, text)
  TO anon, authenticated;

-- ============================================================
-- 7. admin_approve_signup_request — 승인 → trainers INSERT (free tier)
-- ----------------------------------------------------------------
--   plan_type='free' / ai_monthly_limit=20 자동 부여 (028 의 기본값과 동일).
--   기존 trainers 행이 같은 email 로 이미 있으면 (race / admin 사전등록) auth_id 만 채움.
-- ============================================================
DROP FUNCTION IF EXISTS admin_approve_signup_request(text, uuid);
CREATE OR REPLACE FUNCTION admin_approve_signup_request(
  p_admin_token text,
  p_request_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req trainer_signup_requests%ROWTYPE;
  v_t   trainers%ROWTYPE;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  SELECT * INTO v_req FROM trainer_signup_requests
    WHERE id = p_request_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending (current: %)', v_req.status
      USING ERRCODE = '22023';
  END IF;

  -- 기존 trainer 행 race-check
  SELECT * INTO v_t FROM trainers WHERE email = v_req.email LIMIT 1;
  IF FOUND THEN
    -- 기존 행에 auth_id 만 채움 (이미 채워져 있으면 그대로)
    UPDATE trainers
      SET auth_id = COALESCE(auth_id, v_req.auth_id)
      WHERE id = v_t.id
      RETURNING * INTO v_t;
  ELSE
    -- 신규 트레이너 INSERT — free tier 자동 부여
    INSERT INTO trainers (name, email, auth_id, plan_type, ai_monthly_limit)
      VALUES (v_req.name, v_req.email, v_req.auth_id, 'free', 20)
      RETURNING * INTO v_t;
  END IF;

  -- 요청 상태 업데이트
  UPDATE trainer_signup_requests
    SET status      = 'approved',
        reviewed_at = now()
    WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'trainer_id', v_t.id,
    'email',      v_t.email,
    'name',       v_t.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_signup_request(text, uuid)
  TO anon, authenticated;

-- ============================================================
-- 8. admin_reject_signup_request — 거부 (재요청 차단 효과)
-- ============================================================
DROP FUNCTION IF EXISTS admin_reject_signup_request(text, uuid, text);
CREATE OR REPLACE FUNCTION admin_reject_signup_request(
  p_admin_token text,
  p_request_id  uuid,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req trainer_signup_requests%ROWTYPE;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  UPDATE trainer_signup_requests
    SET status           = 'rejected',
        rejection_reason = p_reason,
        reviewed_at      = now()
    WHERE id = p_request_id AND status = 'pending'
    RETURNING * INTO v_req;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found_or_not_pending'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_signup_request(text, uuid, text)
  TO anon, authenticated;

-- ============================================================
-- 9. admin_delete_signup_request — 거부된 요청 삭제 (재요청 허용용)
-- ----------------------------------------------------------------
--   rejected 상태인 요청만 삭제 가능. admin 이 "한 번 더 기회 주자"
--   판단 시 사용. pending/approved 행은 삭제 X (안전성).
-- ============================================================
DROP FUNCTION IF EXISTS admin_delete_signup_request(text, uuid);
CREATE OR REPLACE FUNCTION admin_delete_signup_request(
  p_admin_token text,
  p_request_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);

  DELETE FROM trainer_signup_requests
    WHERE id = p_request_id AND status = 'rejected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found_or_not_rejected'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_signup_request(text, uuid)
  TO anon, authenticated;

-- ============================================================
-- 10. 검증 쿼리 (수동 실행)
-- ============================================================
-- 1) 테이블 생성 확인:
--    SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name = 'trainer_signup_requests' ORDER BY ordinal_position;
--
-- 2) RPC 등록 확인:
--    SELECT proname, prosecdef FROM pg_proc
--     WHERE proname IN (
--       'trainer_resolve_or_create','trainer_get_signup_status',
--       'trainer_create_signup_request',
--       'admin_list_signup_requests','admin_approve_signup_request',
--       'admin_reject_signup_request','admin_delete_signup_request'
--     );
--    -- prosecdef 모두 true 여야 함.
--
-- 3) (c) 분기 제거 확인 (수동):
--    임의 auth.uid() 로 trainer_resolve_or_create 호출 시 NULL 반환 확인.
--
-- 4) 화이트리스트 전체 흐름 (admin 토큰 필요):
--    -- 사용자: trainer_create_signup_request('test@example.com','홍길동') → pending
--    -- admin: SELECT * FROM admin_list_signup_requests('<<ADMIN_TOKEN>>','pending');
--    -- admin: SELECT admin_approve_signup_request('<<ADMIN_TOKEN>>','<<request_id>>');
--    -- 사용자: trainer_resolve_or_create('test@example.com') → trainers row 반환
