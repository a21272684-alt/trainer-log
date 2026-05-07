-- ============================================================================
-- supabase_cleanup_cron.sql
-- 데이터 스노우볼 자동 청소 + SoT 참조 컬럼 추가
--
-- 실행 위치: Supabase Dashboard → SQL Editor (한 번 실행)
-- 사전 조건: Database → Extensions → pg_cron 활성화 (Pro 플랜 필요)
--
-- 청소 정책 요약:
--   logs                  : created_at < now() - 180 days  → DELETE
--   diet_logs             : record_date < current_date - 180 days → DELETE
--   workout_sessions      : created_at < now() - 180 days  → DELETE
--   gym_weekly_reports    : week_start < current_date - 84 days (12주) → DELETE (status='done')
--   scheduled_notifications: scheduled_at < now() - 7 days AND sent = true → DELETE
-- ============================================================================

-- ── 0. SoT 통합용: logs.session_id 컬럼 추가 -------------------------------
-- workout_sessions 가 운동 데이터의 단일 진실원. logs 는 session_id 참조만 보유.
-- 기존 logs.exercises_data 컬럼은 호환을 위해 유지하되, 신규 저장은 더 이상 사용하지 않음.

ALTER TABLE logs
  ADD COLUMN IF NOT EXISTS session_id uuid
  REFERENCES workout_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS logs_session_id_idx
  ON logs (session_id);

COMMENT ON COLUMN logs.session_id IS
  '운동 데이터의 단일 진실원(SoT) workout_sessions.id 참조. 신규 저장 시 logs.exercises_data 대신 이 컬럼만 채운다.';

-- ── 1. pg_cron 확장 활성화 (Supabase Pro 플랜 이상) ------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 2. 청소 함수 정의 -------------------------------------------------------

CREATE OR REPLACE FUNCTION cleanup_logs_older_than_180d()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM logs
   WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'cleanup_logs_older_than_180d: deleted % rows', v_deleted;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_diet_logs_older_than_180d()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM diet_logs
   WHERE record_date < current_date - interval '180 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'cleanup_diet_logs_older_than_180d: deleted % rows', v_deleted;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_workout_sessions_older_than_180d()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM workout_sessions
   WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'cleanup_workout_sessions_older_than_180d: deleted % rows', v_deleted;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_gym_weekly_reports_older_than_12w()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM gym_weekly_reports
   WHERE week_start < current_date - interval '84 days'
     AND status IN ('done','error');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'cleanup_gym_weekly_reports_older_than_12w: deleted % rows', v_deleted;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_scheduled_notifications_sent_older_than_7d()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM scheduled_notifications
   WHERE sent = true
     AND scheduled_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'cleanup_scheduled_notifications_sent_older_than_7d: deleted % rows', v_deleted;
  RETURN v_deleted;
END;
$$;

-- ── 3. pg_cron 스케줄 등록 --------------------------------------------------
-- 시간대: UTC. 한국 새벽 03:00~04:00 KST = 18:00~19:00 UTC (전일).
-- 동일 작업이 여러 번 등록되지 않도록 기존 작업 unschedule 후 재등록.

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  -- 기존 작업 제거 (있으면)
  FOR v_jobid IN
    SELECT jobid FROM cron.job
     WHERE jobname IN (
       'oun_cleanup_logs_180d',
       'oun_cleanup_diet_logs_180d',
       'oun_cleanup_workout_sessions_180d',
       'oun_cleanup_weekly_reports_12w',
       'oun_cleanup_scheduled_notif_7d'
     )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

-- 매일 18:00 UTC (≈ 03:00 KST) — logs / diet_logs / workout_sessions 180일 청소
SELECT cron.schedule(
  'oun_cleanup_logs_180d',
  '0 18 * * *',
  $$ SELECT cleanup_logs_older_than_180d(); $$
);

SELECT cron.schedule(
  'oun_cleanup_diet_logs_180d',
  '10 18 * * *',
  $$ SELECT cleanup_diet_logs_older_than_180d(); $$
);

SELECT cron.schedule(
  'oun_cleanup_workout_sessions_180d',
  '20 18 * * *',
  $$ SELECT cleanup_workout_sessions_older_than_180d(); $$
);

-- 매주 월요일 18:30 UTC — gym_weekly_reports 12주 초과 청소
SELECT cron.schedule(
  'oun_cleanup_weekly_reports_12w',
  '30 18 * * 1',
  $$ SELECT cleanup_gym_weekly_reports_older_than_12w(); $$
);

-- 매일 18:40 UTC — 발송 완료 7일 초과 알림 청소
SELECT cron.schedule(
  'oun_cleanup_scheduled_notif_7d',
  '40 18 * * *',
  $$ SELECT cleanup_scheduled_notifications_sent_older_than_7d(); $$
);

-- ── 4. 검증 쿼리 (수동 실행) -------------------------------------------------
-- SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname LIKE 'oun_%';
-- SELECT * FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'oun_%') ORDER BY start_time DESC LIMIT 20;
