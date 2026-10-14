-- 084_crm_create_gym_rpc.sql
-- CRM 로그인 시 기존 대표도 "내 센터 개설하기" 로 빠지고, 개설도 RLS 로 실패하던 문제 복구.
--
-- 문제 1 (로그인):
--   073 이 gyms 의 open 정책(016 gyms_read: select using(true))을 제거한 뒤 SELECT 정책이 0개.
--   GymPortal 이 trainers.gym_id 로 gyms 를 조회하면 항상 빈 결과 → 기존 대표도 온보딩 화면으로 감.
--   → 본인이 소속된 센터만 읽을 수 있는 SELECT 정책 추가.
--
-- 문제 2 (개설):
--   GymPortal OnboardingSetup 이 클라이언트에서 gyms 를 직접 INSERT 함.
--   073 이 gyms 의 open 정책(016 gyms_write: for all using(true))을 제거한 뒤
--   INSERT 정책이 없어 "new row violates row-level security policy for table gyms" 로 실패.
--   (open 정책을 되살리면 anon 키로 아무 센터나 수정 가능 → 되살리지 않음)
--
-- 수정:
--   센터 생성 + 대표 계정 연결을 SECURITY DEFINER RPC 하나로 원자 처리.
--   - 로그인 필수(auth.uid)
--   - 트레이너 행 매칭: auth_id = 본인, 없으면 "인증된 본인 이메일 AND auth_id IS NULL" (078 패턴)
--   - 이미 센터에 소속된 계정은 거부(남의 센터 이탈·중복 개설 방지)
--   - 대표 행 갱신/생성 시 auth_id 를 본인으로 고정 → 이후 RLS(auth_id = auth.uid()) 와 정합
--   반환: { gym, trainer } (클라이언트가 gyms SELECT 정책에 의존하지 않도록 행을 그대로 반환)

CREATE OR REPLACE FUNCTION crm_create_gym(p_gym_name text, p_owner_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_gym_name  text := btrim(coalesce(p_gym_name, ''));
  v_owner     text := btrim(coalesce(p_owner_name, ''));
  v_gym       gyms%ROWTYPE;
  v_t         trainers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;
  IF v_gym_name = '' OR char_length(v_gym_name) > 60 THEN
    RAISE EXCEPTION 'INVALID_GYM_NAME';
  END IF;
  IF v_owner = '' OR char_length(v_owner) > 40 THEN
    RAISE EXCEPTION 'INVALID_OWNER_NAME';
  END IF;

  SELECT email, email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users WHERE id = v_uid;

  -- (a) 이미 연결된 트레이너 행
  SELECT * INTO v_t FROM trainers WHERE auth_id = v_uid LIMIT 1 FOR UPDATE;
  -- (b) 인증된 본인 이메일의 미연결 행
  IF NOT FOUND AND v_email IS NOT NULL AND v_email <> '' AND v_confirmed IS NOT NULL THEN
    SELECT * INTO v_t FROM trainers
      WHERE lower(email) = lower(v_email) AND auth_id IS NULL
      LIMIT 1 FOR UPDATE;
  END IF;

  IF v_t.id IS NOT NULL AND v_t.gym_id IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_IN_GYM: this account already belongs to a gym';
  END IF;

  INSERT INTO gyms (name) VALUES (v_gym_name) RETURNING * INTO v_gym;

  IF v_t.id IS NOT NULL THEN
    UPDATE trainers
       SET gym_id = v_gym.id, name = v_owner, role = 'owner',
           approval_status = 'approved', auth_id = v_uid
     WHERE id = v_t.id
     RETURNING * INTO v_t;
  ELSE
    INSERT INTO trainers (name, email, auth_id, gym_id, role, approval_status)
    VALUES (v_owner, v_email, v_uid, v_gym.id, 'owner', 'approved')
    RETURNING * INTO v_t;
  END IF;

  RETURN jsonb_build_object('gym', to_jsonb(v_gym), 'trainer', to_jsonb(v_t));
END;
$$;

REVOKE ALL ON FUNCTION crm_create_gym(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_create_gym(text, text) TO authenticated;

-- ── 본인 소속 센터 SELECT ──────────────────────────────────────
DROP POLICY IF EXISTS "gyms_select_own_trainer" ON gyms;
CREATE POLICY "gyms_select_own_trainer" ON gyms
  FOR SELECT TO authenticated
  USING (id IN (SELECT gym_id FROM trainers WHERE auth_id = auth.uid()));
