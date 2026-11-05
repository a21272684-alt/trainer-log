-- 098_admin_redesign_phase1.sql
-- 관리자 페이지 개편 1차 (2026-11-05)
--
-- 1) 서버 검색·페이지 — 기존 admin_list_trainers/members 는 LIMIT 100 고정이라 100명이 넘으면
--    목록에서 사라짐. 검색·필터·정렬·페이지를 DB 에서 처리해 인원과 무관하게 찾게 한다.
-- 2) 통합 검색 — 트레이너·회원, 한글 초성('ㅇㅈㅎ')·전화번호 뒷자리 검색
-- 3) 트레이너 상세 패널 — 회원 전체·구독·일지 통계를 한 번에
-- 4) 구독 수정·연장·중지·무효 + 변경 이력 (기록은 지우지 않음)
--
-- 무효(voided_at) 구독은 트레이너 앱 권한 계산(TrainerApp loadFeatureGates)과
-- 운영 스냅샷(ops_snapshot)에서 제외한다.

-- ─────────────────────────────────────────────
-- 0. 공통 헬퍼
-- ─────────────────────────────────────────────
-- 한글 → 초성 ('윤준현' → 'ㅇㅈㅎ'). 한글 외 글자는 소문자로 그대로.
CREATE OR REPLACE FUNCTION _ko_chosung(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  cho  text[] := ARRAY['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  r    text := '';
  ch   text;
  code int;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  FOREACH ch IN ARRAY regexp_split_to_array(p, '') LOOP
    code := ascii(ch);
    IF code BETWEEN 44032 AND 55203 THEN
      r := r || cho[(code - 44032) / 588 + 1];
    ELSE
      r := r || lower(ch);
    END IF;
  END LOOP;
  RETURN r;
END;
$$;

-- 검색어 일치 (빈 검색어 = 전체). 자음만 입력하면 초성 비교, 아니면 이름·보조값(이메일 등) 부분 일치.
CREATE OR REPLACE FUNCTION _admin_text_match(p_q text, p_name text, p_extra text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := btrim(COALESCE(p_q, ''));
BEGIN
  IF v = '' THEN RETURN true; END IF;
  IF v ~ '^[ㄱ-ㅎ]+$' THEN
    RETURN position(v IN _ko_chosung(COALESCE(p_name, ''))) > 0;
  END IF;
  v := lower(v);
  RETURN position(v IN lower(COALESCE(p_name, ''))) > 0
      OR position(v IN lower(COALESCE(p_extra, ''))) > 0;
END;
$$;

-- ─────────────────────────────────────────────
-- 1. 구독 상태 컬럼 + 변경 이력
-- ─────────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stopped_at    timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at     timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_trainer ON subscriptions (trainer_id, valid_until DESC);

CREATE TABLE IF NOT EXISTS subscription_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  trainer_id      uuid REFERENCES trainers(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN ('created','updated','extended','stopped','voided')),
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_events_trainer ON subscription_events (trainer_id, created_at DESC);
-- 정책 없음 = 앱(anon/authenticated)에서 직접 접근 불가. 관리자 RPC(SECURITY DEFINER)로만 읽고 쓴다.
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- 2. 트레이너 목록 — 서버 검색 · 필터 · 정렬 · 페이지
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_search_trainers(
  p_admin_token text,
  p_query  text    DEFAULT NULL,
  p_filter text    DEFAULT 'all',     -- all | subscribed | free | no_members | no_credits | crm
  p_sort   text    DEFAULT 'recent',  -- recent | members | logs | name
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_lim   int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_off   int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_out   jsonb;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  WITH base AS (
    SELECT t.id, t.name, t.email, t.created_at, t.approval_status,
           COALESCE(t.credits, 0) AS credits,
           COALESCE((t.crm_permissions->>'crm_access')::boolean, (t.crm_permissions->>'enabled')::boolean, false) AS crm,
           (SELECT count(*) FROM members m WHERE m.trainer_id = t.id)       AS member_count,
           (SELECT count(*) FROM logs l WHERE l.trainer_id = t.id)          AS log_count,
           (SELECT max(l.created_at) FROM logs l WHERE l.trainer_id = t.id) AS last_log_at,
           s.plan AS sub_plan, s.valid_until AS sub_valid_until
      FROM trainers t
      LEFT JOIN LATERAL (
        SELECT x.plan, x.valid_until
          FROM subscriptions x
         WHERE x.trainer_id = t.id AND x.voided_at IS NULL
         ORDER BY x.valid_until DESC NULLS LAST, x.paid_at DESC NULLS LAST
         LIMIT 1
      ) s ON true
     WHERE _admin_text_match(p_query, t.name, t.email)
  ), flagged AS (
    SELECT b.*, (b.sub_valid_until IS NOT NULL AND b.sub_valid_until >= v_today) AS subscribed
      FROM base b
  ), filtered AS (
    SELECT f.* FROM flagged f
     WHERE CASE COALESCE(p_filter, 'all')
             WHEN 'subscribed' THEN f.subscribed
             WHEN 'free'       THEN NOT f.subscribed
             WHEN 'no_members' THEN f.member_count = 0
             WHEN 'no_credits' THEN f.credits <= 0
             WHEN 'crm'        THEN f.crm
             ELSE true END
  ), ordered AS (
    SELECT f.*, row_number() OVER (ORDER BY
             CASE WHEN p_sort = 'members' THEN f.member_count END DESC NULLS LAST,
             CASE WHEN p_sort = 'logs'    THEN f.log_count    END DESC NULLS LAST,
             CASE WHEN p_sort = 'name'    THEN f.name         END ASC  NULLS LAST,
             f.created_at DESC) AS ord
      FROM filtered f
  )
  SELECT jsonb_build_object(
    'total',  (SELECT count(*) FROM filtered),
    'counts', (SELECT jsonb_build_object(
                 'all',        count(*),
                 'subscribed', count(*) FILTER (WHERE subscribed),
                 'free',       count(*) FILTER (WHERE NOT subscribed),
                 'no_members', count(*) FILTER (WHERE member_count = 0),
                 'no_credits', count(*) FILTER (WHERE credits <= 0),
                 'crm',        count(*) FILTER (WHERE crm))
               FROM flagged),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'email', o.email, 'created_at', o.created_at,
               'approval_status', o.approval_status, 'credits', o.credits, 'crm', o.crm,
               'member_count', o.member_count, 'log_count', o.log_count, 'last_log_at', o.last_log_at,
               'subscribed', o.subscribed,
               'plan', CASE WHEN o.subscribed THEN o.sub_plan END,
               'valid_until', o.sub_valid_until)
             ORDER BY o.ord)
        FROM ordered o
       WHERE o.ord > v_off AND o.ord <= v_off + v_lim), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;

-- ─────────────────────────────────────────────
-- 3. 통합 검색 (트레이너 · 회원)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_global_search(p_admin_token text, p_query text, p_limit integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q      text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_lim    int  := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 30);
  v_today  date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_digits text;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF v_q IS NULL THEN
    RETURN jsonb_build_object('trainers', '[]'::jsonb, 'trainer_total', 0, 'members', '[]'::jsonb, 'member_total', 0);
  END IF;
  -- 숫자 4자리 이상이면 회원 전화번호로도 찾는다 (응답에는 뒷 4자리만)
  v_digits := CASE WHEN v_q ~ '^[0-9-]{4,}$' THEN replace(v_q, '-', '') END;

  RETURN jsonb_build_object(
    'trainer_total', (SELECT count(*) FROM trainers t WHERE _admin_text_match(v_q, t.name, t.email)),
    'trainers', COALESCE((
      SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT t.id, t.name, t.email, t.created_at,
               (SELECT count(*) FROM members m WHERE m.trainer_id = t.id) AS member_count,
               (SELECT s.plan FROM subscriptions s
                 WHERE s.trainer_id = t.id AND s.voided_at IS NULL AND s.valid_until >= v_today
                 ORDER BY s.valid_until DESC LIMIT 1) AS plan
          FROM trainers t
         WHERE _admin_text_match(v_q, t.name, t.email)
         ORDER BY (lower(t.name) = lower(v_q)) DESC, t.created_at DESC
         LIMIT v_lim) x), '[]'::jsonb),
    'member_total', (
      SELECT count(*) FROM members m
       WHERE _admin_text_match(v_q, m.name, m.email)
          OR (v_digits IS NOT NULL AND position(v_digits IN regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g')) > 0)),
    'members', COALESCE((
      SELECT jsonb_agg(to_jsonb(y)) FROM (
        SELECT m.id, m.name, m.trainer_id, t.name AS trainer_name,
               COALESCE(m.done_sessions, 0) AS done_sessions, COALESCE(m.total_sessions, 0) AS total_sessions,
               right(regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g'), 4) AS phone_tail
          FROM members m
          LEFT JOIN trainers t ON t.id = m.trainer_id
         WHERE _admin_text_match(v_q, m.name, m.email)
            OR (v_digits IS NOT NULL AND position(v_digits IN regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g')) > 0)
         ORDER BY (lower(m.name) = lower(v_q)) DESC, m.created_at DESC
         LIMIT v_lim) y), '[]'::jsonb)
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 4. 트레이너 상세
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_trainer_detail(p_admin_token text, p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t trainers%ROWTYPE;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  SELECT * INTO v_t FROM trainers WHERE id = p_trainer_id;
  IF NOT FOUND THEN RAISE EXCEPTION '트레이너를 찾을 수 없어요'; END IF;

  RETURN jsonb_build_object(
    'trainer', jsonb_build_object(
      'id', v_t.id, 'name', v_t.name, 'email', v_t.email, 'created_at', v_t.created_at,
      'credits', COALESCE(v_t.credits, 0), 'crm_permissions', COALESCE(v_t.crm_permissions, '{}'::jsonb),
      'approval_status', v_t.approval_status),
    'stats', jsonb_build_object(
      'member_count', (SELECT count(*) FROM members WHERE trainer_id = v_t.id),
      'log_count',    (SELECT count(*) FROM logs WHERE trainer_id = v_t.id),
      'logs_30d',     (SELECT count(*) FROM logs WHERE trainer_id = v_t.id AND created_at > now() - interval '30 days'),
      'last_log_at',  (SELECT max(created_at) FROM logs WHERE trainer_id = v_t.id)),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.name, 'lesson_purpose', m.lesson_purpose,
               'done_sessions', COALESCE(m.done_sessions, 0), 'total_sessions', COALESCE(m.total_sessions, 0),
               'phone_tail', right(regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g'), 4),
               'created_at', m.created_at)
             ORDER BY m.created_at DESC)
        FROM members m WHERE m.trainer_id = v_t.id), '[]'::jsonb),
    'subscriptions', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.paid_at DESC NULLS LAST)
        FROM subscriptions s WHERE s.trainer_id = v_t.id), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC)
        FROM (SELECT * FROM subscription_events WHERE trainer_id = v_t.id ORDER BY created_at DESC LIMIT 30) e), '[]'::jsonb)
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 5. 구독 개요 — 구독 이력이 있는 트레이너당 1줄 (현재 구독 기준)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_subscription_overview(p_admin_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today       date      := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_month_start timestamp := date_trunc('month', now() AT TIME ZONE 'Asia/Seoul');
BEGIN
  PERFORM _admin_assert(p_admin_token);
  RETURN jsonb_build_object(
    'today', v_today,
    'month_total', (SELECT COALESCE(sum(amount), 0) FROM subscriptions
                     WHERE voided_at IS NULL AND paid_at >= v_month_start),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'trainer_id', t.id, 'trainer_name', t.name,
               'payment_count', c.n, 'sub', to_jsonb(s))
             ORDER BY s.valid_until ASC NULLS LAST)
        FROM (SELECT trainer_id, count(*) AS n FROM subscriptions GROUP BY trainer_id) c
        JOIN trainers t ON t.id = c.trainer_id
        JOIN LATERAL (
          SELECT * FROM subscriptions x
           WHERE x.trainer_id = c.trainer_id
           ORDER BY (x.voided_at IS NULL) DESC, x.valid_until DESC NULLS LAST, x.paid_at DESC NULLS LAST
           LIMIT 1) s ON true), '[]'::jsonb)
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 6. 구독 변경 — 모두 subscription_events 에 기록
-- ─────────────────────────────────────────────
-- 6-A. 추가 (077 대체 — 같은 시그니처, 만료일 필수 + 이력 기록)
CREATE OR REPLACE FUNCTION admin_add_subscription(
  p_admin_token text, p_trainer_id uuid, p_plan text, p_payment_method text,
  p_amount integer, p_paid_at timestamp, p_valid_until date, p_memo text
) RETURNS subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row subscriptions;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF NOT EXISTS (SELECT 1 FROM trainers WHERE id = p_trainer_id) THEN RAISE EXCEPTION '트레이너를 찾을 수 없어요'; END IF;
  IF p_valid_until IS NULL THEN RAISE EXCEPTION '만료일을 입력해 주세요'; END IF;

  INSERT INTO subscriptions (trainer_id, plan, payment_method, amount, paid_at, valid_until, memo)
  VALUES (p_trainer_id, COALESCE(NULLIF(p_plan, ''), 'pro'),
          COALESCE(NULLIF(p_payment_method, ''), '카카오페이'), COALESCE(p_amount, 0),
          COALESCE(p_paid_at, now()), p_valid_until, NULLIF(btrim(COALESCE(p_memo, '')), ''))
  RETURNING * INTO v_row;

  INSERT INTO subscription_events (subscription_id, trainer_id, action, detail)
  VALUES (v_row.id, v_row.trainer_id, 'created', jsonb_build_object(
    'plan', v_row.plan, 'valid_until', v_row.valid_until, 'amount', v_row.amount, 'payment_method', v_row.payment_method));
  RETURN v_row;
END;
$$;

-- 6-B. 수정 (바뀐 항목만 이력에 before/after 로)
CREATE OR REPLACE FUNCTION admin_update_subscription(
  p_admin_token text, p_id uuid, p_plan text, p_payment_method text,
  p_amount integer, p_paid_at timestamp, p_valid_until date, p_memo text
) RETURNS subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_old   subscriptions;
  v_new   subscriptions;
  v_diff  jsonb := '{}'::jsonb;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  SELECT * INTO v_old FROM subscriptions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '구독을 찾을 수 없어요'; END IF;
  IF v_old.voided_at IS NOT NULL THEN RAISE EXCEPTION '무효 처리된 구독은 수정할 수 없어요'; END IF;
  IF p_valid_until IS NULL THEN RAISE EXCEPTION '만료일을 입력해 주세요'; END IF;

  UPDATE subscriptions SET
    plan           = COALESCE(NULLIF(p_plan, ''), plan),
    payment_method = COALESCE(NULLIF(p_payment_method, ''), payment_method),
    amount         = COALESCE(p_amount, amount),
    paid_at        = COALESCE(p_paid_at, paid_at),
    valid_until    = p_valid_until,
    memo           = CASE WHEN p_memo IS NULL THEN memo ELSE NULLIF(btrim(p_memo), '') END,
    -- 중지된 구독의 만료일을 미래로 바꾸면 다시 활성
    stopped_at     = CASE WHEN p_valid_until > v_today THEN NULL ELSE stopped_at END,
    status_reason  = CASE WHEN p_valid_until > v_today THEN NULL ELSE status_reason END
  WHERE id = p_id
  RETURNING * INTO v_new;

  IF v_old.plan IS DISTINCT FROM v_new.plan THEN v_diff := v_diff || jsonb_build_object('plan', jsonb_build_array(v_old.plan, v_new.plan)); END IF;
  IF v_old.valid_until IS DISTINCT FROM v_new.valid_until THEN v_diff := v_diff || jsonb_build_object('valid_until', jsonb_build_array(v_old.valid_until, v_new.valid_until)); END IF;
  IF v_old.amount IS DISTINCT FROM v_new.amount THEN v_diff := v_diff || jsonb_build_object('amount', jsonb_build_array(v_old.amount, v_new.amount)); END IF;
  IF v_old.payment_method IS DISTINCT FROM v_new.payment_method THEN v_diff := v_diff || jsonb_build_object('payment_method', jsonb_build_array(v_old.payment_method, v_new.payment_method)); END IF;
  IF v_old.paid_at IS DISTINCT FROM v_new.paid_at THEN v_diff := v_diff || jsonb_build_object('paid_at', jsonb_build_array(v_old.paid_at, v_new.paid_at)); END IF;
  IF v_old.memo IS DISTINCT FROM v_new.memo THEN v_diff := v_diff || jsonb_build_object('memo', jsonb_build_array(v_old.memo, v_new.memo)); END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO subscription_events (subscription_id, trainer_id, action, detail)
    VALUES (v_new.id, v_new.trainer_id, 'updated', v_diff);
  END IF;
  RETURN v_new;
END;
$$;

-- 6-C. 기간 연장 (지난 구독은 오늘부터)
CREATE OR REPLACE FUNCTION admin_extend_subscription(p_admin_token text, p_id uuid, p_months integer)
RETURNS subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_old   subscriptions;
  v_new   subscriptions;
  v_to    date;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN RAISE EXCEPTION '연장 기간을 확인해 주세요'; END IF;
  SELECT * INTO v_old FROM subscriptions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '구독을 찾을 수 없어요'; END IF;
  IF v_old.voided_at IS NOT NULL THEN RAISE EXCEPTION '무효 처리된 구독은 연장할 수 없어요'; END IF;

  v_to := (GREATEST(COALESCE(v_old.valid_until, v_today), v_today) + make_interval(months => p_months))::date;
  UPDATE subscriptions SET valid_until = v_to, stopped_at = NULL, status_reason = NULL
   WHERE id = p_id RETURNING * INTO v_new;

  INSERT INTO subscription_events (subscription_id, trainer_id, action, detail)
  VALUES (v_new.id, v_new.trainer_id, 'extended',
          jsonb_build_object('from', v_old.valid_until, 'to', v_to, 'months', p_months));
  RETURN v_new;
END;
$$;

-- 6-D. 오늘로 중지 (만료일을 오늘로 → 바로 무료 플랜, 결제 기록·매출은 유지)
CREATE OR REPLACE FUNCTION admin_stop_subscription(p_admin_token text, p_id uuid, p_reason text)
RETURNS subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_old    subscriptions;
  v_new    subscriptions;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF v_reason IS NULL THEN RAISE EXCEPTION '사유를 입력해 주세요'; END IF;
  SELECT * INTO v_old FROM subscriptions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '구독을 찾을 수 없어요'; END IF;
  IF v_old.voided_at IS NOT NULL THEN RAISE EXCEPTION '무효 처리된 구독이에요'; END IF;
  IF v_old.stopped_at IS NOT NULL THEN RAISE EXCEPTION '이미 중지된 구독이에요'; END IF;

  UPDATE subscriptions
     SET valid_until = LEAST(COALESCE(valid_until, v_today), v_today), stopped_at = now(), status_reason = v_reason
   WHERE id = p_id RETURNING * INTO v_new;

  INSERT INTO subscription_events (subscription_id, trainer_id, action, detail, reason)
  VALUES (v_new.id, v_new.trainer_id, 'stopped', jsonb_build_object('valid_until_before', v_old.valid_until), v_reason);
  RETURN v_new;
END;
$$;

-- 6-E. 무효 처리 (없던 결제로 — 권한 즉시 해제, 매출 합계 제외, 기록은 남김)
CREATE OR REPLACE FUNCTION admin_void_subscription(p_admin_token text, p_id uuid, p_reason text)
RETURNS subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_old    subscriptions;
  v_new    subscriptions;
BEGIN
  PERFORM _admin_assert(p_admin_token);
  IF v_reason IS NULL THEN RAISE EXCEPTION '사유를 입력해 주세요'; END IF;
  SELECT * INTO v_old FROM subscriptions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '구독을 찾을 수 없어요'; END IF;
  IF v_old.voided_at IS NOT NULL THEN RAISE EXCEPTION '이미 무효 처리된 구독이에요'; END IF;

  UPDATE subscriptions SET voided_at = now(), status_reason = v_reason
   WHERE id = p_id RETURNING * INTO v_new;

  INSERT INTO subscription_events (subscription_id, trainer_id, action, detail, reason)
  VALUES (v_new.id, v_new.trainer_id, 'voided',
          jsonb_build_object('plan', v_old.plan, 'amount', v_old.amount, 'valid_until', v_old.valid_until), v_reason);
  RETURN v_new;
END;
$$;

-- ─────────────────────────────────────────────
-- 7. 운영 스냅샷 — 무효 구독은 활성 구독 수에서 제외 (기존 함수 본문은 그대로 두고 조건만 추가)
-- ─────────────────────────────────────────────
DO $patch$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('ops_snapshot(text)'::regprocedure) INTO d;
  IF position('voided_at IS NULL' IN d) = 0 THEN
    d := replace(d, 'WHERE valid_until >= v_today', 'WHERE valid_until >= v_today AND voided_at IS NULL');
    EXECUTE d;
  END IF;
END $patch$;

-- ─────────────────────────────────────────────
-- 8. 실행 권한 — 관리자 앱은 anon 키 + 관리자 토큰(_admin_assert)으로 호출
-- ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION admin_search_trainers(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_global_search(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_trainer_detail(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_subscription_overview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_add_subscription(text, uuid, text, text, integer, timestamp, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_update_subscription(text, uuid, text, text, integer, timestamp, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_extend_subscription(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_stop_subscription(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_void_subscription(text, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_search_trainers(text, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_global_search(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_trainer_detail(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_subscription_overview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_add_subscription(text, uuid, text, text, integer, timestamp, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_update_subscription(text, uuid, text, text, integer, timestamp, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_extend_subscription(text, uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_stop_subscription(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_void_subscription(text, uuid, text) TO anon, authenticated;
