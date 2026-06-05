-- 063_attendance_policy.sql
-- 노쇼/결석 "정책 기반" 처리 — 감정 마찰 완화 (시스템이 정책대로 처리).
-- 설계: 트레이너가 정책 설정 → 회원 사전 동의 → 노쇼 시 정책대로 기록/차감 →
--       회원이 본인 앱에서 투명하게 확인. (트레이너 개인 판단 → 시스템 규칙)
--
-- 성격: 전부 추가/완화 → 기존 출석 흐름 영향 0.
--   기존 attendance 행은 status='attended'(기본값)로 현재 의미 그대로 유지.
--   051 에서 attendance 는 이미 strict RLS (트레이너+회원 본인 SELECT, 변경은 트레이너).

-- ============================================================
-- 1. attendance 에 출결 상태 컬럼 추가
-- ============================================================
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'attended';
-- 기존 제약 없으면 추가 (attended/noshow/cancelled/late)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'attendance' AND constraint_name = 'attendance_status_check'
  ) THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
      CHECK (status IN ('attended','noshow','cancelled','late'));
  END IF;
END $$;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS session_deducted boolean NOT NULL DEFAULT false;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS note text;

-- ============================================================
-- 2. attendance_policies — 트레이너별 출결 정책
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_policies (
  trainer_id           uuid PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
  cancel_deadline_hours integer NOT NULL DEFAULT 24,  -- 이 시간 이전 취소 = 차감 없음
  noshow_deduct        integer NOT NULL DEFAULT 1 CHECK (noshow_deduct IN (0,1)), -- 무단 노쇼 시 차감 횟수
  policy_text          text,                          -- 회원에게 보여줄 정책 문구
  updated_at           timestamptz DEFAULT now()
);
ALTER TABLE attendance_policies ENABLE ROW LEVEL SECURITY;

-- SELECT: 트레이너 본인 OR 그 트레이너의 회원 (회원이 정책 열람)
DROP POLICY IF EXISTS "ap_select" ON attendance_policies;
CREATE POLICY "ap_select" ON attendance_policies
  FOR SELECT TO authenticated, anon
  USING (
    trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    OR trainer_id IN (SELECT trainer_id FROM members WHERE auth_id = auth.uid())
  );

-- INSERT/UPDATE: 트레이너 본인만
DROP POLICY IF EXISTS "ap_write" ON attendance_policies;
CREATE POLICY "ap_write" ON attendance_policies
  FOR ALL TO authenticated
  USING      (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- ============================================================
-- 3. members 에 정책 동의 시각 (회원 본인이 기록 — members self update RLS 활용)
-- ============================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS attendance_policy_agreed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_attendance_member_status ON attendance (member_id, status);
