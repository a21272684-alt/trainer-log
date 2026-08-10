-- 070_self_service_signup.sql
-- 트레이너 가입을 admin 승인제(053) → 자율가입(자동 승인) 으로 전환.
--
-- 배경:
--   053 은 신규 가입을 signup_requests 대기열에 넣고 admin 이 승인해야 trainers
--   행이 생기는 화이트리스트 방식. 베타 유입 확대를 위해 승인 단계 제거 —
--   가입 화면(이름·약관동의)은 유지하되, 제출 즉시 trainers 행 생성.
--
-- 핵심:
--   - trainer_create_signup_request 를 "대기 요청 생성" → "trainers 직접 생성
--     (free tier, admin_approve 와 동일 기본값)" 으로 교체. 반환 status='approved'.
--   - 기존 트레이너/사전등록(email 행) 은 그대로 (auth_id 만 채움).
--   - 거부(rejected) 요청 목록 초기화 → 재가입 가능.
--   - trainer_resolve_or_create 는 그대로 NULL 반환(신규는 여전히 등록 화면 경유
--     = 약관 동의 수집). 즉 (c) 자동 INSERT 부활 아님.

-- ============================================================
-- 1. trainer_create_signup_request — 자율가입(자동 생성)
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

  -- 이미 트레이너면 그대로 (email 사전등록 행이면 auth_id 채움)
  SELECT * INTO v_t FROM trainers
    WHERE auth_id = v_uid OR email = p_email
    LIMIT 1;
  IF FOUND THEN
    IF v_t.auth_id IS NULL THEN
      UPDATE trainers SET auth_id = v_uid WHERE id = v_t.id RETURNING * INTO v_t;
    END IF;
    -- 이 이메일의 잔여 요청 정리
    DELETE FROM trainer_signup_requests WHERE email = p_email OR auth_id = v_uid;
    RETURN jsonb_build_object('status', 'already_trainer', 'trainer_id', v_t.id);
  END IF;

  -- 자율가입: 트레이너 직접 생성 (free tier — 028/053 기본값과 동일)
  INSERT INTO trainers (name, email, auth_id, plan_type, ai_monthly_limit)
    VALUES (p_name, p_email, v_uid, 'free', 20)
    RETURNING * INTO v_t;

  -- 대기열에 남은 이 이메일의 요청 행 정리(있으면)
  DELETE FROM trainer_signup_requests WHERE email = p_email OR auth_id = v_uid;

  RETURN jsonb_build_object('status', 'approved', 'trainer_id', v_t.id);
END;
$$;

GRANT EXECUTE ON FUNCTION trainer_create_signup_request(text, text)
  TO authenticated, anon;

-- ============================================================
-- 2. 거부(rejected) 요청 목록 초기화 → 재가입 허용
-- ============================================================
DELETE FROM trainer_signup_requests WHERE status = 'rejected';

-- 참고: pending 행은 남겨둠. 해당 사용자는 재로그인 시 클라이언트가 등록 화면으로
-- 라우팅 → 위 RPC 가 트레이너 생성하며 잔여 요청 행을 정리함.
