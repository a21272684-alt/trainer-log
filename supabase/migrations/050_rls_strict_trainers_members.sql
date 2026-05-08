-- 050_rls_strict_trainers_members.sql
-- Phase B-1.1 — Trainer/Member 측 RLS 강화 (auth.uid() 기반)
--
-- 배경:
--   001_init.sql 의 RLS 정책이 모두 `using (true)` 라 anon key 만으로
--   누구나 모든 트레이너의 회원·일지·결제 등 데이터 read/write 가능.
--   Trainer/Member 가 OAuth(Google/Kakao)-only 로 통일되어 있음을 확인했고
--   (037_oauth_auth.sql 에서 auth_id 컬럼 추가됨), 이번 마이그레이션부터
--   auth.uid() 기반 strict RLS 적용 시작.
--
-- ⚠️ 컬럼 타입:
--   037 마이그레이션 SQL 본문은 `auth_id TEXT` 로 적혀있지만, 실제 운영
--   DB 의 컬럼 타입은 `uuid` 임이 확인됨 (information_schema 조회로 검증).
--   따라서 본 마이그레이션은 auth_id 가 uuid 라는 전제로 작성:
--     · auth.uid() = auth_id (둘 다 uuid → 직접 비교)
--     · RPC 안의 v_uid 도 uuid 변수
--
-- 범위:
--   1. trainers / members 테이블 정책 재작성
--   2. 매핑 RPC (SECURITY DEFINER) 추가 — auth_id NULL 인 기존 행과 OAuth
--      uid 를 안전하게 매핑/생성. RLS 우회 필수.
--
-- 후속 마이그레이션 (별도 PR):
--   051 — logs / payments / attendance
--   052 — health_records / diet_logs / workout_*
--
-- ⚠️ admin 영역 임시 영향:
--   AdminPortal 의 trainers/members 직접 read 가 RLS 차단됨. admin 작업은
--   당분간 SQL Editor 에서 직접 실행하거나 별도 admin RPC 도입 후 복구.

-- ============================================================
-- 1. 기존 약한 정책 제거 (이전 시도된 정책도 모두 idempotent 하게)
-- ============================================================
DROP POLICY IF EXISTS "trainers_read"             ON trainers;
DROP POLICY IF EXISTS "trainers_insert"           ON trainers;
DROP POLICY IF EXISTS "trainers_update"           ON trainers;
DROP POLICY IF EXISTS "trainers_self_select"      ON trainers;
DROP POLICY IF EXISTS "trainers_self_update"      ON trainers;
DROP POLICY IF EXISTS "members_read"              ON members;
DROP POLICY IF EXISTS "members_insert"            ON members;
DROP POLICY IF EXISTS "members_update"            ON members;
DROP POLICY IF EXISTS "members_self_or_trainer_select" ON members;
DROP POLICY IF EXISTS "members_trainer_insert"    ON members;
DROP POLICY IF EXISTS "members_self_or_trainer_update" ON members;
DROP POLICY IF EXISTS "members_trainer_delete"    ON members;

-- ============================================================
-- 2. trainers — 본인 행만 access. INSERT/DELETE 는 RPC 경유 강제.
-- ============================================================
CREATE POLICY "trainers_self_select" ON trainers
  FOR SELECT TO authenticated, anon
  USING (auth.uid() = auth_id);

CREATE POLICY "trainers_self_update" ON trainers
  FOR UPDATE TO authenticated
  USING      (auth.uid() = auth_id)
  WITH CHECK (auth.uid() = auth_id);

-- INSERT 정책 부여하지 않음 → 직접 INSERT 차단.
-- 신규 트레이너 등록은 trainer_resolve_or_create RPC 경유.
-- DELETE 도 부여 안 함 → admin 영역에서 처리.

-- ============================================================
-- 3. members — 회원 본인 또는 담당 트레이너만 access.
-- ============================================================
CREATE POLICY "members_self_or_trainer_select" ON members
  FOR SELECT TO authenticated, anon
  USING (
    auth.uid() = auth_id
    OR trainer_id IN (
      SELECT id FROM trainers WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "members_trainer_insert" ON members
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id IN (
      SELECT id FROM trainers WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "members_self_or_trainer_update" ON members
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = auth_id
    OR trainer_id IN (
      SELECT id FROM trainers WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = auth_id
    OR trainer_id IN (
      SELECT id FROM trainers WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "members_trainer_delete" ON members
  FOR DELETE TO authenticated
  USING (
    trainer_id IN (
      SELECT id FROM trainers WHERE auth_id = auth.uid()
    )
  );

-- ============================================================
-- 4. 매핑 RPC — trainer_resolve_or_create
-- ----------------------------------------------------------------
--   호출 흐름:
--     · OAuth 로그인 후 클라이언트가 호출
--     · auth.uid() 가 가리키는 trainer 행 찾기:
--         (a) auth_id 매칭   → 그대로 반환 (재로그인)
--         (b) email 매칭     → auth_id 채우고 반환 (기존 트레이너 첫 OAuth)
--         (c) 매칭 X + p_name 제공 → 신규 INSERT (등록 화면 완료 후)
--         (d) 매칭 X + 정보 부족 → NULL 반환 (등록 화면으로 안내)
--   SECURITY DEFINER 라 RLS 우회 가능 → auth_id NULL 행도 매칭.
-- ============================================================
CREATE OR REPLACE FUNCTION trainer_resolve_or_create(
  p_email text DEFAULT NULL,
  p_name  text DEFAULT NULL,
  p_phone text DEFAULT NULL
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

  -- (a) auth_id 매칭
  SELECT * INTO v_row FROM trainers WHERE auth_id = v_uid LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  -- (b) email 매칭 → auth_id 채움
  IF p_email IS NOT NULL AND p_email <> '' THEN
    UPDATE trainers SET auth_id = v_uid
      WHERE email = p_email AND auth_id IS NULL
      RETURNING * INTO v_row;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  -- (c) 신규 INSERT (등록 화면에서 호출)
  IF p_name IS NOT NULL AND p_name <> '' THEN
    INSERT INTO trainers (name, phone, email, auth_id)
      VALUES (p_name, COALESCE(p_phone, ''), p_email, v_uid)
      RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  -- (d) 매칭 없고 정보 부족 → NULL 반환
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION trainer_resolve_or_create(text, text, text)
  TO authenticated, anon;

-- ============================================================
-- 5. 매핑 RPC — member_resolve_self
-- ----------------------------------------------------------------
--   회원은 트레이너가 사전 등록(email 포함)해 놓아야 OAuth 로 매핑됨.
--   이 RPC 가 NULL 반환하면 클라이언트는 "등록된 회원 정보 없음" 안내.
--   회원 자체 신규 INSERT 는 허용하지 않음 (트레이너만 추가 가능).
-- ============================================================
CREATE OR REPLACE FUNCTION member_resolve_self(p_email text DEFAULT NULL)
RETURNS members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;

  -- (a) auth_id 매칭
  SELECT * INTO v_row FROM members WHERE auth_id = v_uid LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  -- (b) email 매칭 → auth_id 채움
  IF p_email IS NOT NULL AND p_email <> '' THEN
    UPDATE members SET auth_id = v_uid
      WHERE email = p_email AND auth_id IS NULL
      RETURNING * INTO v_row;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  -- (c) 매칭 없음 → NULL (회원 자동 생성 X)
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION member_resolve_self(text) TO authenticated, anon;

-- ============================================================
-- 6. trainers / members 의 auth_id 인덱스 (성능)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_trainers_auth_id    ON trainers (auth_id);
CREATE INDEX IF NOT EXISTS idx_members_auth_id     ON members  (auth_id);
CREATE INDEX IF NOT EXISTS idx_members_trainer_auth ON members (trainer_id);
