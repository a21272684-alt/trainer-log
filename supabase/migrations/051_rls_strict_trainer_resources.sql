-- 051_rls_strict_trainer_resources.sql
-- Phase B-1.2 — 트레이너 핵심 자원 (logs / payments / attendance) RLS 강화.
--
-- 050 에서 trainers/members 강화 완료. 이번엔 트레이너의 가장 빈번하고 가치
-- 있는 자원 3개 — 수업일지, 결제, 출석부 — 의 RLS 를 auth.uid() 기반으로.
--
-- 정책 원칙:
--   logs       — trainer 본인 자원 + member 본인의 logs (회원이 평점/읽음 update)
--   payments   — trainer 본인 자원만 (회원 측 access X)
--   attendance — trainer + member 본인 둘 다 SELECT, 변경은 trainer 만
--
-- 클라이언트 호출 영향: 거의 없음.
--   TrainerApp 의 .from(...).eq('trainer_id', trainer.id) 패턴은 RLS 통과.
--   MemberPortal 의 .from('logs').eq('member_id', member.id) 도 통과.
--   회원의 logs UPDATE (평점·읽음) 도 정책에 포함됨.
--
-- ⚠️ admin 영역:
--   AdminPortal 의 logs select (admin 통계용) 가 RLS 차단됨. admin 작업은
--   당분간 SQL Editor 우회 또는 후속 admin RPC PR 에서 복구.
--
-- 적용 순서:
--   1. SQL Editor 에서 본 파일 적용
--   2. PR 머지 (코드 변경 거의 없음 — 마이그레이션만)
--   3. 트레이너 앱 동작 검증 (회원 일지·결제·출석)

-- ============================================================
-- 1. logs — 트레이너 자원 + 회원 본인 access
-- ============================================================
DROP POLICY IF EXISTS "logs_read"   ON logs;
DROP POLICY IF EXISTS "logs_insert" ON logs;
DROP POLICY IF EXISTS "logs_trainer_or_member_select" ON logs;
DROP POLICY IF EXISTS "logs_trainer_insert"           ON logs;
DROP POLICY IF EXISTS "logs_trainer_or_member_update" ON logs;
DROP POLICY IF EXISTS "logs_trainer_delete"           ON logs;

CREATE POLICY "logs_trainer_or_member_select" ON logs
  FOR SELECT TO authenticated, anon
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

-- INSERT 는 트레이너만 (자기 회원에게 일지 작성)
CREATE POLICY "logs_trainer_insert" ON logs
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

-- UPDATE 는 트레이너(자기 자원) 또는 회원(본인 일지의 평점·읽음)
CREATE POLICY "logs_trainer_or_member_update" ON logs
  FOR UPDATE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

-- DELETE 는 트레이너만
CREATE POLICY "logs_trainer_delete" ON logs
  FOR DELETE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

-- ============================================================
-- 2. payments — 트레이너 자원만 (S-005 critical 해결)
-- ============================================================
DROP POLICY IF EXISTS "payments_read"   ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_delete" ON payments;
DROP POLICY IF EXISTS "payments_trainer_select" ON payments;
DROP POLICY IF EXISTS "payments_trainer_insert" ON payments;
DROP POLICY IF EXISTS "payments_trainer_update" ON payments;
DROP POLICY IF EXISTS "payments_trainer_delete" ON payments;

CREATE POLICY "payments_trainer_select" ON payments
  FOR SELECT TO authenticated, anon
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

CREATE POLICY "payments_trainer_insert" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

CREATE POLICY "payments_trainer_update" ON payments
  FOR UPDATE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

CREATE POLICY "payments_trainer_delete" ON payments
  FOR DELETE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

-- ============================================================
-- 3. attendance — 트레이너 + 회원 본인 SELECT, 변경은 트레이너만
-- ============================================================
DROP POLICY IF EXISTS "attendance_read"   ON attendance;
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
DROP POLICY IF EXISTS "attendance_delete" ON attendance;
DROP POLICY IF EXISTS "attendance_trainer_or_member_select" ON attendance;
DROP POLICY IF EXISTS "attendance_trainer_insert" ON attendance;
DROP POLICY IF EXISTS "attendance_trainer_update" ON attendance;
DROP POLICY IF EXISTS "attendance_trainer_delete" ON attendance;

CREATE POLICY "attendance_trainer_or_member_select" ON attendance
  FOR SELECT TO authenticated, anon
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

CREATE POLICY "attendance_trainer_insert" ON attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

CREATE POLICY "attendance_trainer_update" ON attendance
  FOR UPDATE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

CREATE POLICY "attendance_trainer_delete" ON attendance
  FOR DELETE TO authenticated
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
  );

-- ============================================================
-- 4. 성능 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_logs_trainer    ON logs (trainer_id);
CREATE INDEX IF NOT EXISTS idx_logs_member     ON logs (member_id);
CREATE INDEX IF NOT EXISTS idx_payments_trainer ON payments (trainer_id);
CREATE INDEX IF NOT EXISTS idx_attendance_trainer ON attendance (trainer_id);
CREATE INDEX IF NOT EXISTS idx_attendance_member  ON attendance (member_id);
