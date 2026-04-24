-- ══════════════════════════════════════════════════════════════
-- 028_ai_usage_limit.sql
-- AI 수업일지 생성 횟수 제한 시스템
-- ══════════════════════════════════════════════════════════════

-- ── trainers 에 플랜 설정 컬럼 추가 ──────────────────────────
ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS plan_type       text    NOT NULL DEFAULT 'free'
    CHECK (plan_type IN ('free','pro','unlimited')),
  ADD COLUMN IF NOT EXISTS ai_monthly_limit integer         DEFAULT 20;
  -- NULL = 무제한 (pro/unlimited 플랜)
  -- 20   = 무료 플랜 기본값

COMMENT ON COLUMN trainers.plan_type        IS 'free|pro|unlimited';
COMMENT ON COLUMN trainers.ai_monthly_limit IS '월 AI 사용 한도. NULL=무제한';

-- ── 월별 AI 사용량 추적 테이블 ───────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id  uuid    NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  used_year   integer NOT NULL,
  used_month  integer NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  updated_at  timestamp DEFAULT now(),
  UNIQUE (trainer_id, used_year, used_month)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage' AND policyname = 'ai_usage_all'
  ) THEN
    CREATE POLICY "ai_usage_all" ON ai_usage FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── RPC: 사용량 조회 (카운트 증가 없음) ──────────────────────
CREATE OR REPLACE FUNCTION get_ai_usage(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit  integer;
  v_plan   text;
  v_count  integer;
  v_year   integer := EXTRACT(YEAR  FROM now())::integer;
  v_month  integer := EXTRACT(MONTH FROM now())::integer;
BEGIN
  SELECT plan_type, ai_monthly_limit
    INTO v_plan, v_limit
    FROM trainers WHERE id = p_trainer_id;

  SELECT COALESCE(count, 0) INTO v_count
    FROM ai_usage
   WHERE trainer_id = p_trainer_id
     AND used_year  = v_year
     AND used_month = v_month;

  RETURN jsonb_build_object(
    'plan',      v_plan,
    'limit',     v_limit,          -- NULL = 무제한
    'used',      v_count,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL
                      ELSE GREATEST(0, v_limit - v_count) END,
    'blocked',   CASE WHEN v_limit IS NULL THEN false
                      ELSE v_count >= v_limit END,
    'year',      v_year,
    'month',     v_month
  );
END;
$$;

-- ── RPC: AI 사용 성공 후 카운트 +1 ──────────────────────────
CREATE OR REPLACE FUNCTION consume_ai_credit(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit  integer;
  v_count  integer;
  v_year   integer := EXTRACT(YEAR  FROM now())::integer;
  v_month  integer := EXTRACT(MONTH FROM now())::integer;
BEGIN
  SELECT ai_monthly_limit INTO v_limit FROM trainers WHERE id = p_trainer_id;

  -- 무제한 플랜은 기록만 (참고용)
  INSERT INTO ai_usage (trainer_id, used_year, used_month, count)
  VALUES (p_trainer_id, v_year, v_month, 1)
  ON CONFLICT (trainer_id, used_year, used_month)
  DO UPDATE SET count = ai_usage.count + 1, updated_at = now();

  SELECT count INTO v_count FROM ai_usage
   WHERE trainer_id = p_trainer_id AND used_year = v_year AND used_month = v_month;

  RETURN jsonb_build_object(
    'used',      v_count,
    'limit',     v_limit,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL
                      ELSE GREATEST(0, v_limit - v_count) END
  );
END;
$$;

-- ── RPC: 어드민용 플랜 변경 ──────────────────────────────────
CREATE OR REPLACE FUNCTION admin_set_trainer_plan(
  p_trainer_id uuid,
  p_plan       text,
  p_limit      integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE trainers
     SET plan_type        = p_plan,
         ai_monthly_limit = CASE p_plan
                              WHEN 'unlimited' THEN NULL
                              WHEN 'pro'       THEN NULL
                              ELSE COALESCE(p_limit, 20)
                            END
   WHERE id = p_trainer_id;
END;
$$;
