-- 067_attendance_check_constraint_fix.sql
--
-- 배경:
--   063_attendance_policy.sql 이 attendance.status CHECK 를
--   ('attended','noshow','cancelled','late') 로 갱신하려 했으나,
--   IF NOT EXISTS 분기에서 skip 되어 실제로는 043 의 옛 CHECK
--   ('scheduled','completed','noshow','cancelled') 가 그대로 남아 있었음.
--
--   결과: 066 의 UPDATE attendance SET status='attended' WHERE status='completed'
--   가 CHECK 위반(23514)으로 실패. 새 INSERT (status:'attended') 도 같은
--   이유로 silent fail 이었음 (트레이너 앱 출석부 달력 색칠 안 되는 증상의
--   진짜 원인).
--
-- 수정:
--   옛 CHECK 제거 → 잔존 'completed' 행을 'attended' 로 정정 → 새 표준 CHECK 추가.
--   사용자가 SQL Editor 에 이미 적용한 명령과 동일 — 이 파일은 영구 기록 +
--   향후 다른 환경 setup 시 동일 mismatch 재발 방지 목적.
--
--   멱등: DROP IF EXISTS / UPDATE 조건절 / ADD 가 새 환경에서 안전하게 동작.

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
UPDATE attendance SET status = 'attended' WHERE status = 'completed';
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('attended','noshow','cancelled','late'));
