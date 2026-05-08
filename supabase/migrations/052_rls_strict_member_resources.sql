-- 052_rls_strict_member_resources.sql
-- Phase B-1.3 — 회원 자원 RLS 강화 (마지막 단계, S-001 완전 해결).
--
-- 050: trainers/members
-- 051: logs/payments/attendance
-- 052: health_records/diet_logs/workout_sessions/workout_routines/member_holds
--
-- 정책 원칙:
--   각 테이블 = trainer (자기 회원 자원) 또는 member 본인 access
--   trainer_id 또는 member_id 컬럼 매개로 권한 결정
--
-- 클라이언트 호출 영향: 거의 없음.
--   기존 .eq('member_id', X) / .eq('trainer_id', X) 호출이 RLS 통과.
--
-- 적용:
--   1. SQL Editor 에서 본 SQL 적용
--   2. PR 머지

-- ============================================================
-- 1. health_records — trainer + member 본인
-- ============================================================
DROP POLICY IF EXISTS "health_read"   ON health_records;
DROP POLICY IF EXISTS "health_insert" ON health_records;
DROP POLICY IF EXISTS "health_update" ON health_records;
DROP POLICY IF EXISTS "health_records_select" ON health_records;
DROP POLICY IF EXISTS "health_records_insert" ON health_records;
DROP POLICY IF EXISTS "health_records_update" ON health_records;
DROP POLICY IF EXISTS "health_records_delete" ON health_records;

CREATE POLICY "health_records_select" ON health_records
  FOR SELECT TO authenticated, anon
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR member_id IN (
      SELECT id FROM members WHERE trainer_id IN (
        SELECT id FROM trainers WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "health_records_insert" ON health_records
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR member_id IN (
      SELECT id FROM members WHERE trainer_id IN (
        SELECT id FROM trainers WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "health_records_update" ON health_records
  FOR UPDATE TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR member_id IN (
      SELECT id FROM members WHERE trainer_id IN (
        SELECT id FROM trainers WHERE auth_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR member_id IN (
      SELECT id FROM members WHERE trainer_id IN (
        SELECT id FROM trainers WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "health_records_delete" ON health_records
  FOR DELETE TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR member_id IN (
      SELECT id FROM members WHERE trainer_id IN (
        SELECT id FROM trainers WHERE auth_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 2. diet_logs — member 본인 (트레이너 측 read 도 허용)
-- ============================================================
DROP POLICY IF EXISTS "allow_all_diet_logs" ON diet_logs;
DROP POLICY IF EXISTS "diet_logs_select"    ON diet_logs;
DROP POLICY IF EXISTS "diet_logs_insert"    ON diet_logs;
DROP POLICY IF EXISTS "diet_logs_update"    ON diet_logs;
DROP POLICY IF EXISTS "diet_logs_delete"    ON diet_logs;

CREATE POLICY "diet_logs_select" ON diet_logs
  FOR SELECT TO authenticated, anon
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR member_id IN (
      SELECT id FROM members WHERE trainer_id IN (
        SELECT id FROM trainers WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "diet_logs_insert" ON diet_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "diet_logs_update" ON diet_logs
  FOR UPDATE TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "diet_logs_delete" ON diet_logs
  FOR DELETE TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

-- ============================================================
-- 3. workout_sessions — trainer + member 둘 다 (각자 본인 자원)
-- ============================================================
DROP POLICY IF EXISTS "allow_all_workout_sessions" ON workout_sessions;
DROP POLICY IF EXISTS "workout_sessions_select" ON workout_sessions;
DROP POLICY IF EXISTS "workout_sessions_insert" ON workout_sessions;
DROP POLICY IF EXISTS "workout_sessions_update" ON workout_sessions;
DROP POLICY IF EXISTS "workout_sessions_delete" ON workout_sessions;

CREATE POLICY "workout_sessions_select" ON workout_sessions
  FOR SELECT TO authenticated, anon
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "workout_sessions_insert" ON workout_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "workout_sessions_update" ON workout_sessions
  FOR UPDATE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "workout_sessions_delete" ON workout_sessions
  FOR DELETE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

-- ============================================================
-- 4. workout_routines — trainer 자기 라이브러리 + member 자기 루틴
-- ============================================================
DROP POLICY IF EXISTS "allow_all_workout_routines" ON workout_routines;
DROP POLICY IF EXISTS "workout_routines_select" ON workout_routines;
DROP POLICY IF EXISTS "workout_routines_insert" ON workout_routines;
DROP POLICY IF EXISTS "workout_routines_update" ON workout_routines;
DROP POLICY IF EXISTS "workout_routines_delete" ON workout_routines;

CREATE POLICY "workout_routines_select" ON workout_routines
  FOR SELECT TO authenticated, anon
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "workout_routines_insert" ON workout_routines
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "workout_routines_update" ON workout_routines
  FOR UPDATE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "workout_routines_delete" ON workout_routines
  FOR DELETE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

-- ============================================================
-- 5. member_holds — trainer 가 자기 회원 hold 관리, member 본인은 read
-- ============================================================
DROP POLICY IF EXISTS "trainer_holds"             ON member_holds;
DROP POLICY IF EXISTS "allow_all_member_holds"    ON member_holds;
DROP POLICY IF EXISTS "member_holds_select"       ON member_holds;
DROP POLICY IF EXISTS "member_holds_insert"       ON member_holds;
DROP POLICY IF EXISTS "member_holds_update"       ON member_holds;
DROP POLICY IF EXISTS "member_holds_delete"       ON member_holds;

CREATE POLICY "member_holds_select" ON member_holds
  FOR SELECT TO authenticated, anon
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "member_holds_insert" ON member_holds
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

CREATE POLICY "member_holds_update" ON member_holds
  FOR UPDATE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

CREATE POLICY "member_holds_delete" ON member_holds
  FOR DELETE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

-- ============================================================
-- 6. 성능 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_health_records_member  ON health_records  (member_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_trainer ON workout_sessions (trainer_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_member  ON workout_sessions (member_id);
CREATE INDEX IF NOT EXISTS idx_workout_routines_trainer ON workout_routines (trainer_id);
CREATE INDEX IF NOT EXISTS idx_workout_routines_member  ON workout_routines (member_id);
CREATE INDEX IF NOT EXISTS idx_member_holds_trainer     ON member_holds    (trainer_id);
CREATE INDEX IF NOT EXISTS idx_member_holds_member      ON member_holds    (member_id);
