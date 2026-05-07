-- ================================================================
-- 043: attendance 테이블에 ticket_id(수강권 FK) + status 컬럼 추가
-- ================================================================

-- 1. ticket_id: 해당 수업 1회가 차감한 수강권(payments.id) FK
--    NULL 허용 — 기존 레코드·신규 레코드가 수강권 없이도 기록 가능
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS ticket_id uuid
    REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_ticket_id
  ON attendance (ticket_id);

-- 2. status: 수업 진행 상태
--    기본값 'completed' — 기존 레코드는 모두 완료 처리
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('scheduled', 'completed', 'noshow', 'cancelled'));

-- 기존 데이터 일괄 completed 처리 (DEFAULT만으로는 기존 row 미적용)
UPDATE attendance
  SET status = 'completed'
  WHERE status IS DISTINCT FROM 'completed';

CREATE INDEX IF NOT EXISTS idx_attendance_member_status
  ON attendance (member_id, status);

CREATE INDEX IF NOT EXISTS idx_attendance_trainer_status
  ON attendance (trainer_id, status, attended_date);
