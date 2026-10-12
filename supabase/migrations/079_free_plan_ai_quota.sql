-- 079_free_plan_ai_quota.sql
-- 무료 플랜 AI 수업일지 월 15회 (신규 가입자부터) + 무료 매출관리 탭 임시 개방.
--
-- 배경:
--   AI 일지는 trainers.credits(관리자 수동 충전, 기본 0) 가 있어야만 생성됨 → 신규 가입자는 AI 사용 불가.
--   월 한도(ai_monthly_limit/ai_usage, 028)는 카운트 증가 함수(consume_ai_credit)가 어디서도
--   호출되지 않아 실제로는 동작하지 않음.
--
-- 정책 (2026-10-12 결정):
--   - 신규 가입 트레이너에게 "AI 일지 변환" 월 15회 제공. 발송 기준이 아니라 변환 1회 = 1회 차감.
--   - 초기화는 달력 월이 아니라 지급일(가입 시점) 기준 매월. 예) 10/12 가입 → 11/12, 12/12 리셋.
--   - 기존 트레이너는 적용 안 함(free_ai_quota NULL) → 지금처럼 크레딧으로만 사용.
--   - 15회 소진 후 크레딧이 있으면 크레딧에서 차감.
--   - 음식 사진 AI 인식·AI 인사이트는 이 횟수에 포함하지 않음(기존 크레딧 방식 유지).

-- ============================================================
-- 1. trainers 컬럼
-- ============================================================
ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS free_ai_quota        integer,      -- NULL = 미적용(기존 트레이너)
  ADD COLUMN IF NOT EXISTS free_ai_used         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_ai_anchor       timestamptz,  -- 지급 기준 시각(가입 시점, 고정)
  ADD COLUMN IF NOT EXISTS free_ai_period_start timestamptz;  -- free_ai_used 가 속한 기간 시작

COMMENT ON COLUMN trainers.free_ai_quota IS '무료 AI 일지 월 제공 횟수. NULL=미적용';
COMMENT ON COLUMN trainers.free_ai_anchor IS '무료 횟수 초기화 기준(지급일). 매월 이 날짜에 리셋';

-- ============================================================
-- 2. 현재 기간 계산 (anchor 기준 n개월째 구간). 고정 anchor 에서 매번 계산해 말일 드리프트 방지.
-- ============================================================
CREATE OR REPLACE FUNCTION _free_ai_period(
  p_anchor timestamptz,
  OUT period_start timestamptz,
  OUT resets_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF p_anchor IS NULL THEN RETURN; END IF;
  WHILE p_anchor + make_interval(months => n + 1) <= now() LOOP
    n := n + 1;
  END LOOP;
  period_start := p_anchor + make_interval(months => n);
  resets_at    := p_anchor + make_interval(months => n + 1);
END;
$$;

REVOKE ALL ON FUNCTION _free_ai_period(timestamptz) FROM PUBLIC;

-- ============================================================
-- 3. ai_journal_status — 남은 횟수 조회 (변경 없음)
-- ============================================================
CREATE OR REPLACE FUNCTION ai_journal_status(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t    trainers%ROWTYPE;
  p    record;
  used integer;
BEGIN
  SELECT * INTO t FROM trainers WHERE id = p_trainer_id;
  IF NOT FOUND OR t.auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF t.free_ai_quota IS NULL THEN
    RETURN jsonb_build_object('mode', 'credits', 'credits', t.credits);
  END IF;

  SELECT * INTO p FROM _free_ai_period(t.free_ai_anchor);
  used := CASE WHEN t.free_ai_period_start IS DISTINCT FROM p.period_start THEN 0 ELSE t.free_ai_used END;

  RETURN jsonb_build_object(
    'mode',      'quota',
    'quota',     t.free_ai_quota,
    'used',      used,
    'remaining', GREATEST(0, t.free_ai_quota - used),
    'resets_at', p.resets_at,
    'credits',   t.credits
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ai_journal_status(uuid) TO authenticated;

-- ============================================================
-- 4. ai_journal_consume — AI 일지 변환 1회 차감 (무료 횟수 → 크레딧 순)
-- ============================================================
CREATE OR REPLACE FUNCTION ai_journal_consume(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t trainers%ROWTYPE;
  p record;
BEGIN
  SELECT * INTO t FROM trainers WHERE id = p_trainer_id FOR UPDATE;
  IF NOT FOUND OR t.auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- anchor 가 NULL(기존 트레이너)이면 period_start/resets_at 모두 NULL
  SELECT * INTO p FROM _free_ai_period(t.free_ai_anchor);

  -- 무료 횟수 적용 트레이너: 기간이 넘어갔으면 리셋 후 차감
  IF t.free_ai_quota IS NOT NULL THEN
    IF t.free_ai_period_start IS DISTINCT FROM p.period_start THEN
      t.free_ai_used := 0;
      t.free_ai_period_start := p.period_start;
    END IF;

    IF t.free_ai_used < t.free_ai_quota THEN
      UPDATE trainers
         SET free_ai_used = t.free_ai_used + 1,
             free_ai_period_start = t.free_ai_period_start
       WHERE id = t.id;
      RETURN jsonb_build_object(
        'success',   true,
        'source',    'quota',
        'mode',      'quota',
        'quota',     t.free_ai_quota,
        'used',      t.free_ai_used + 1,
        'remaining', t.free_ai_quota - (t.free_ai_used + 1),
        'resets_at', p.resets_at,
        'credits',   t.credits
      );
    END IF;

    -- 기간 리셋만 반영해 둠
    UPDATE trainers
       SET free_ai_used = t.free_ai_used,
           free_ai_period_start = t.free_ai_period_start
     WHERE id = t.id;
  END IF;

  -- 크레딧 차감
  IF COALESCE(t.credits, 0) > 0 THEN
    UPDATE trainers SET credits = credits - 1 WHERE id = t.id;
    RETURN jsonb_build_object(
      'success',   true,
      'source',    'credits',
      'mode',      CASE WHEN t.free_ai_quota IS NULL THEN 'credits' ELSE 'quota' END,
      'quota',     t.free_ai_quota,
      'used',      t.free_ai_used,
      'remaining', 0,
      'resets_at', p.resets_at,
      'credits',   t.credits - 1
    );
  END IF;

  RETURN jsonb_build_object(
    'success',   false,
    'reason',    'limit',
    'mode',      CASE WHEN t.free_ai_quota IS NULL THEN 'credits' ELSE 'quota' END,
    'quota',     t.free_ai_quota,
    'used',      t.free_ai_used,
    'remaining', 0,
    'resets_at', p.resets_at,
    'credits',   COALESCE(t.credits, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ai_journal_consume(uuid) TO authenticated;

-- ============================================================
-- 5. trainer_create_signup_request — 078 본문 + 신규 가입 시 무료 15회 지급
-- ============================================================
CREATE OR REPLACE FUNCTION trainer_create_signup_request(
  p_email text,  -- IGNORED (078 부터 auth.users 이메일 사용)
  p_name  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_t         trainers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required (auth.uid is null)';
  END IF;

  SELECT email, email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  SELECT * INTO v_t FROM trainers WHERE auth_id = v_uid LIMIT 1;
  IF NOT FOUND AND v_confirmed IS NOT NULL THEN
    UPDATE trainers SET auth_id = v_uid
      WHERE id = (
        SELECT id FROM trainers
          WHERE lower(email) = lower(v_email) AND auth_id IS NULL
          LIMIT 1
      )
      RETURNING * INTO v_t;
  END IF;

  IF FOUND THEN
    DELETE FROM trainer_signup_requests WHERE lower(email) = lower(v_email) OR auth_id = v_uid;
    RETURN jsonb_build_object('status', 'already_trainer', 'trainer_id', v_t.id);
  END IF;

  -- 자율가입: 무료 플랜 + AI 일지 월 15회(가입 시점 기준 매월 리셋)
  INSERT INTO trainers (
    name, email, auth_id, plan_type, ai_monthly_limit,
    free_ai_quota, free_ai_used, free_ai_anchor, free_ai_period_start
  ) VALUES (
    p_name, v_email, v_uid, 'free', 15,
    15, 0, now(), now()
  )
  RETURNING * INTO v_t;

  DELETE FROM trainer_signup_requests WHERE lower(email) = lower(v_email) OR auth_id = v_uid;

  RETURN jsonb_build_object('status', 'approved', 'trainer_id', v_t.id);
END;
$$;

GRANT EXECUTE ON FUNCTION trainer_create_signup_request(text, text) TO authenticated, anon;

-- ============================================================
-- 6. 무료 플랜 매출관리 탭 임시 개방 (추후 재조정 예정)
-- ============================================================
UPDATE app_settings
   SET value = jsonb_set(value, '{free,revenue_tab}', 'true'::jsonb)
 WHERE key = 'feature_gates';
