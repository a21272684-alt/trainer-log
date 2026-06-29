-- 066_attendance_status_completed_to_attended.sql
--
-- 배경:
--   043_attendance_ticket_status.sql 가 attendance.status 컬럼을 'completed' 표준으로
--   도입하고 기존 행을 모두 'completed' 로 세팅했음. 이후 063_attendance_policy.sql 가
--   표준을 'attended' 로 변경(CHECK ('attended','noshow','cancelled','late'))하면서
--   데이터 마이그레이션을 누락 → 기존 행 35개 가 'completed' 로 남음.
--
-- 증상:
--   TrainerApp 의 달력 색칠 코드가 status==='attended' 로 비교 → 'completed' 행 매치 실패
--   → 달력은 "0회 출석" 으로 보이지만 하단 출결 내역 라벨 분기는 default("출석") 로 빠져
--   "출석" 태그가 보임. 두 결과가 다른 silent mismatch.
--
-- 수정:
--   잔존 'completed' 행을 'attended' 로 일괄 UPDATE. CHECK 와도 정합.
--   멱등: 이미 'attended' 인 행 영향 없음.

UPDATE attendance SET status = 'attended' WHERE status = 'completed';
