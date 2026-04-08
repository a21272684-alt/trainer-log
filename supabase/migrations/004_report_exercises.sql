-- ============================================================
-- 004_report_exercises.sql
-- 수업일지에 공개 리포트 ID + 운동 데이터 컬럼 추가
-- ============================================================

alter table logs add column if not exists report_id text;
alter table logs add column if not exists exercises_data jsonb;

-- 리포트 공개 조회 정책
create policy "logs_public_read" on logs for select using (true);
