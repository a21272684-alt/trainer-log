-- 078_rpc_verified_email_binding.sql
-- 이메일로 계정을 연결하는 RPC 3개가 클라이언트가 보낸 p_email 을 그대로 믿던 문제 수정.
--
-- 문제:
--   member_resolve_self(050) / trainer_resolve_or_create(053) / trainer_create_signup_request(070)
--   이 p_email 로 `auth_id IS NULL` 인 행을 찾아 호출자 auth_id 를 채움.
--   로그인만 한 아무나 남의 이메일을 넣어 호출하면 아직 연결 안 된 회원·트레이너 행을
--   자기 계정에 연결 → 열람 + delete_my_account(076) 로 삭제까지 가능.
--   070 은 `auth_id = v_uid OR email = p_email` 이라 이미 다른 사람에게 연결된 행도 매칭됨.
--
-- 수정:
--   - p_email 은 무시. 이메일은 auth.users 의 본인 행(email, email_confirmed_at)에서 읽음.
--   - email_confirmed_at 이 있는(인증된) 이메일일 때만 미연결 행(auth_id IS NULL)에 연결.
--   - 070 매칭을 "auth_id = 본인" 또는 "인증 이메일 일치 AND auth_id IS NULL" 로 좁힘.
--   - 이메일 비교는 대소문자 무시(lower).
--   - 시그니처·반환 타입 동일 → 클라이언트 수정 불필요(클라는 원래 세션 이메일을 넘겨왔음).

-- ============================================================
-- 1. member_resolve_self
-- ============================================================
CREATE OR REPLACE FUNCTION member_resolve_self(p_email text DEFAULT NULL)
RETURNS members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_row       members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;

  -- (a) auth_id 매칭
  SELECT * INTO v_row FROM members WHERE auth_id = v_uid LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  -- (b) 인증된 본인 이메일로만 미연결 행 연결 (p_email 무시)
  SELECT email, email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users WHERE id = v_uid;
  IF v_email IS NOT NULL AND v_email <> '' AND v_confirmed IS NOT NULL THEN
    UPDATE members SET auth_id = v_uid
      WHERE lower(email) = lower(v_email) AND auth_id IS NULL
      RETURNING * INTO v_row;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  -- (c) 매칭 없음 → NULL (회원 자동 생성 X)
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION member_resolve_self(text) TO authenticated, anon;

-- ============================================================
-- 2. trainer_resolve_or_create
-- ============================================================
CREATE OR REPLACE FUNCTION trainer_resolve_or_create(
  p_email text DEFAULT NULL,  -- IGNORED (호환용, 078 부터 auth.users 이메일 사용)
  p_name  text DEFAULT NULL,  -- IGNORED (호환용)
  p_phone text DEFAULT NULL   -- IGNORED (호환용)
) RETURNS trainers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_row       trainers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;

  -- (a) auth_id 매칭 → 재로그인
  SELECT * INTO v_row FROM trainers WHERE auth_id = v_uid LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  -- (b) 인증된 본인 이메일로만 미연결 행 연결 (admin 사전등록 포함)
  SELECT email, email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users WHERE id = v_uid;
  IF v_email IS NOT NULL AND v_email <> '' AND v_confirmed IS NOT NULL THEN
    UPDATE trainers SET auth_id = v_uid
      WHERE lower(email) = lower(v_email) AND auth_id IS NULL
      RETURNING * INTO v_row;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  -- (c) 신규는 NULL → 클라이언트가 가입 화면으로 분기
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION trainer_resolve_or_create(text, text, text)
  TO authenticated, anon;

-- ============================================================
-- 3. trainer_create_signup_request (070 자율가입)
-- ============================================================
CREATE OR REPLACE FUNCTION trainer_create_signup_request(
  p_email text,  -- IGNORED (호환용, 078 부터 auth.users 이메일 사용)
  p_name  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_t         trainers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;

  SELECT email, email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  -- (a) 이미 본인 트레이너 행
  SELECT * INTO v_t FROM trainers WHERE auth_id = v_uid LIMIT 1;

  -- (b) 인증된 이메일이면 미연결 사전등록 행에 연결
  IF NOT FOUND AND v_confirmed IS NOT NULL THEN
    UPDATE trainers SET auth_id = v_uid
      WHERE id = (
        SELECT id FROM trainers
          WHERE lower(email) = lower(v_email) AND auth_id IS NULL
          LIMIT 1
      )
      RETURNING * INTO v_t;
  END IF;

  IF FOUND THEN
    DELETE FROM trainer_signup_requests WHERE lower(email) = lower(v_email) OR auth_id = v_uid;
    RETURN jsonb_build_object('status', 'already_trainer', 'trainer_id', v_t.id);
  END IF;

  -- (c) 자율가입: 트레이너 직접 생성 (free tier — 028/053/070 기본값과 동일)
  INSERT INTO trainers (name, email, auth_id, plan_type, ai_monthly_limit)
    VALUES (p_name, v_email, v_uid, 'free', 20)
    RETURNING * INTO v_t;

  DELETE FROM trainer_signup_requests WHERE lower(email) = lower(v_email) OR auth_id = v_uid;

  RETURN jsonb_build_object('status', 'approved', 'trainer_id', v_t.id);
END;
$$;

GRANT EXECUTE ON FUNCTION trainer_create_signup_request(text, text)
  TO authenticated, anon;
