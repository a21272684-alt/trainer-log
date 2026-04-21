-- 032_log_read_at.sql
-- 회원이 수업일지를 확인한 시각 기록

ALTER TABLE logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS report_id TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS exercises_data JSONB;

-- update 정책 추가 (회원이 read_at 갱신할 수 있도록)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'logs' AND policyname = 'logs_update'
  ) THEN
    EXECUTE 'CREATE POLICY "logs_update" ON logs FOR UPDATE USING (true)';
  END IF;
END $$;
