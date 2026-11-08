-- 103_crm_redesign_phase2.sql
-- CRM 개편 2차 (회원 관리 · 매출 분석 · 출석 관리 · 알림 발송) 에 필요한 읽기 함수.
-- 모두 읽기 전용 — 데이터는 바꾸지 않는다.
--
-- 1) crm_member_pass(p_member_id, p_date)  : 화면에 보여 줄 회원권 한 건 (내부용)
-- 2) crm_member_stats(p_gym_id)            : 회원권 이름 · 시작일 · 마지막 끝나는 날 열 추가 (반환 열 변경이라 DROP 후 CREATE)
-- 3) crm_member_attendance(회원, 시작, 끝) : 회원 상세 출석 달력
-- 4) crm_attendance_day(p_gym_id, p_date)  : 입장 기록에 회원권 이름 · 끝나는 날 · 남은 횟수 추가
-- 5) crm_long_absent(p_gym_id, p_days)     : 회원권 이름 · 남은 횟수 추가
-- 6) crm_revenue_report(p_gym_id, 시작, 끝): 상품 종류별 · 월별 추이 · 신규/재등록 추가,
--                                            1일부터 시작한 달은 '지난달 같은 날까지' 와 비교

-- ── 1. 화면에 보여 줄 회원권 (내부용) ────────────────────────
-- 횟수가 남았으면 횟수권을, 아니면 아직 안 끝난 기간권을 먼저 고르고 그중 가장 최근 결제.
CREATE OR REPLACE FUNCTION crm_member_pass(p_member_id uuid, p_date date)
RETURNS TABLE (product_name text, start_date date, end_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.product_name, p.start_date, p.end_date
    FROM payments p
    JOIN members m ON m.id = p.member_id
    LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
   WHERE p.member_id = p_member_id
     AND COALESCE(p.status, 'active') = 'active'
     AND COALESCE(gp.category, '') <> '대여권'
   ORDER BY CASE WHEN COALESCE(m.total_sessions, 0) - COALESCE(m.done_sessions, 0) > 0
                 THEN COALESCE(p.session_count, 0) > 0
                 ELSE p.end_date IS NOT NULL AND p.end_date >= p_date END DESC,
            p.paid_at DESC NULLS LAST
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION crm_member_pass(uuid, date) FROM PUBLIC, anon, authenticated;

-- ── 2. 회원 통계 (열 추가) ────────────────────────────────────
DROP FUNCTION IF EXISTS crm_member_stats(uuid);

CREATE FUNCTION crm_member_stats(p_gym_id uuid)
RETURNS TABLE (
  member_id      uuid,
  total_paid     bigint,
  payment_count  integer,
  last_paid_at   timestamp,
  last_attended  date,
  membership_end date,
  pass_name      text,
  pass_start     date,
  pass_end       date,
  last_end       date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_today date := crm_today_kst();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trainers t
    WHERE t.gym_id = p_gym_id AND t.auth_id::text = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: not a member of gym %', p_gym_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH gym_members AS (
    SELECT m.id
    FROM members m
    JOIN trainers t ON t.id = m.trainer_id
    WHERE t.gym_id = p_gym_id
  ),
  pay AS (
    SELECT p.member_id,
           COALESCE(SUM(p.amount), 0)::bigint AS total_paid,
           COUNT(*)::integer                  AS payment_count,
           MAX(p.paid_at)                     AS last_paid_at
    FROM payments p
    WHERE p.member_id IN (SELECT id FROM gym_members)
      AND COALESCE(p.status, 'active') <> 'refunded'
    GROUP BY p.member_id
  ),
  pass AS (
    SELECT p.member_id,
           MAX(p.end_date) FILTER (WHERE p.end_date >= v_today) AS membership_end,
           MAX(p.end_date)                                      AS last_end
    FROM payments p
    LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
    WHERE p.member_id IN (SELECT id FROM gym_members)
      AND COALESCE(p.status, 'active') = 'active'
      AND COALESCE(gp.category, '') <> '대여권'
    GROUP BY p.member_id
  ),
  att AS (
    SELECT a.member_id, MAX(a.attended_date) AS last_at
    FROM attendance a
    WHERE a.member_id IN (SELECT id FROM gym_members)
      AND COALESCE(a.status, 'attended') IN ('attended', 'late')
    GROUP BY a.member_id
  ),
  ck AS (
    SELECT c.member_id, MAX((c.checked_at AT TIME ZONE 'Asia/Seoul')::date) AS last_ck
    FROM gym_checkins c
    WHERE c.gym_id = p_gym_id AND c.result = 'ok' AND c.canceled_at IS NULL
    GROUP BY c.member_id
  )
  SELECT gm.id,
         COALESCE(pay.total_paid, 0)::bigint,
         COALESCE(pay.payment_count, 0)::integer,
         pay.last_paid_at,
         GREATEST(att.last_at, ck.last_ck),
         pass.membership_end,
         cur.product_name,
         cur.start_date,
         cur.end_date,
         pass.last_end
  FROM gym_members gm
  LEFT JOIN pay  ON pay.member_id  = gm.id
  LEFT JOIN pass ON pass.member_id = gm.id
  LEFT JOIN att  ON att.member_id  = gm.id
  LEFT JOIN ck   ON ck.member_id   = gm.id
  LEFT JOIN LATERAL crm_member_pass(gm.id, v_today) cur ON true;
END;
$$;

REVOKE ALL ON FUNCTION crm_member_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_member_stats(uuid) TO authenticated;

-- ── 3. 회원 상세 출석 달력 ────────────────────────────────────
-- 출석 = PT 출석(attendance) 또는 센터 입장(gym_checkins). 하루 한 칸.
CREATE OR REPLACE FUNCTION crm_member_attendance(p_member_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_member_gym(p_member_id);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('day', d.day, 'pt', d.pt, 'checkin', d.ck) ORDER BY d.day)
      FROM (
        SELECT x.day, bool_or(x.pt) AS pt, bool_or(x.ck) AS ck
          FROM (
            SELECT a.attended_date AS day, true AS pt, false AS ck
              FROM attendance a
             WHERE a.member_id = p_member_id
               AND COALESCE(a.status, 'attended') IN ('attended', 'late')
               AND a.attended_date BETWEEN p_from AND p_to
            UNION ALL
            SELECT (c.checked_at AT TIME ZONE 'Asia/Seoul')::date, false, true
              FROM gym_checkins c
             WHERE c.member_id = p_member_id
               AND c.result = 'ok' AND c.canceled_at IS NULL
               AND (c.checked_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
          ) x
         GROUP BY x.day
      ) d
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION crm_member_attendance(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_member_attendance(uuid, date, date) TO authenticated;

-- ── 4. 입장 기록 (회원권 표시 열 추가) ────────────────────────
CREATE OR REPLACE FUNCTION crm_attendance_day(p_gym_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'at', c.checked_at, 'member_id', m.id, 'name', m.name,
        'result', c.result, 'source', c.source, 'by', pb.name,
        'canceled', c.canceled_at IS NOT NULL, 'canceled_by', cb.name,
        'membership', (
          SELECT p.product_name || ' ~' || to_char(p.end_date, 'MM/DD')
            FROM payments p LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
           WHERE p.member_id = m.id AND COALESCE(p.status, 'active') = 'active'
             AND p.end_date IS NOT NULL AND p.start_date <= p_date AND COALESCE(gp.category, '') <> '대여권'
           ORDER BY p.end_date DESC LIMIT 1),
        'pass', cur.product_name,
        'pass_end', cur.end_date,
        'remain', GREATEST(COALESCE(m.total_sessions, 0) - COALESCE(m.done_sessions, 0), 0)
      ) ORDER BY c.checked_at DESC)
      FROM gym_checkins c
      JOIN members m ON m.id = c.member_id
      LEFT JOIN trainers pb ON pb.id = c.processed_by
      LEFT JOIN trainers cb ON cb.id = c.canceled_by
      LEFT JOIN LATERAL crm_member_pass(m.id, p_date) cur ON true
      WHERE c.gym_id = p_gym_id AND (c.checked_at AT TIME ZONE 'Asia/Seoul')::date = p_date
    ), '[]'::jsonb),
    'ok_count', (SELECT COUNT(*) FROM gym_checkins WHERE gym_id = p_gym_id AND result = 'ok' AND canceled_at IS NULL
                   AND (checked_at AT TIME ZONE 'Asia/Seoul')::date = p_date),
    'rejected_count', (SELECT COUNT(DISTINCT member_id) FROM gym_checkins WHERE gym_id = p_gym_id AND result = 'rejected_expired' AND canceled_at IS NULL
                   AND (checked_at AT TIME ZONE 'Asia/Seoul')::date = p_date),
    'last_week_ok', (SELECT COUNT(*) FROM gym_checkins WHERE gym_id = p_gym_id AND result = 'ok' AND canceled_at IS NULL
                   AND (checked_at AT TIME ZONE 'Asia/Seoul')::date = p_date - 7),
    'hourly', (SELECT jsonb_agg(COALESCE(cnt, 0) ORDER BY h) FROM generate_series(0, 23) h
                 LEFT JOIN (SELECT extract(hour FROM checked_at AT TIME ZONE 'Asia/Seoul')::int AS hr, COUNT(*) AS cnt
                              FROM gym_checkins WHERE gym_id = p_gym_id AND result = 'ok' AND canceled_at IS NULL
                               AND (checked_at AT TIME ZONE 'Asia/Seoul')::date = p_date GROUP BY 1) x ON x.hr = h)
  );
END;
$$;

-- ── 5. 오래 안 온 회원 (회원권 표시 열 추가) ──────────────────
CREATE OR REPLACE FUNCTION crm_long_absent(p_gym_id uuid, p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_today date := crm_today_kst();
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('member_id', id, 'name', name, 'last_visit', last_visit,
                                        'membership_end', ms_end, 'days', days,
                                        'pass', pass, 'remain', remain) ORDER BY days DESC NULLS FIRST)
    FROM (
      SELECT m.id, m.name, ms.ms_end,
             GREATEST(ck.last_ck, ac.last_at) AS last_visit,
             v_today - GREATEST(ck.last_ck, ac.last_at) AS days,
             cur.product_name AS pass,
             GREATEST(COALESCE(m.total_sessions, 0) - COALESCE(m.done_sessions, 0), 0) AS remain
        FROM members m
        JOIN trainers t ON t.id = m.trainer_id AND t.gym_id = p_gym_id
        LEFT JOIN LATERAL (
          SELECT MAX(p.end_date) AS ms_end FROM payments p LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
           WHERE p.member_id = m.id AND COALESCE(p.status, 'active') = 'active'
             AND p.start_date <= v_today AND p.end_date >= v_today AND COALESCE(gp.category, '') <> '대여권'
        ) ms ON true
        LEFT JOIN LATERAL (
          SELECT MAX((c.checked_at AT TIME ZONE 'Asia/Seoul')::date) AS last_ck FROM gym_checkins c
           WHERE c.member_id = m.id AND c.result = 'ok' AND c.canceled_at IS NULL
        ) ck ON true
        LEFT JOIN LATERAL (
          SELECT MAX(a.attended_date) AS last_at FROM attendance a
           WHERE a.member_id = m.id AND COALESCE(a.status, 'attended') IN ('attended', 'late')
        ) ac ON true
        LEFT JOIN LATERAL crm_member_pass(m.id, v_today) cur ON true
       WHERE (ms.ms_end IS NOT NULL OR COALESCE(m.total_sessions, 0) - COALESCE(m.done_sessions, 0) > 0)
         AND NOT EXISTS (SELECT 1 FROM member_holds h WHERE h.member_id = m.id AND h.start_date <= v_today AND h.end_date >= v_today)
    ) q
    WHERE last_visit IS NULL OR days >= p_days
  ), '[]'::jsonb);
END;
$$;

-- ── 6. 매출 분석 ─────────────────────────────────────────────
-- 추가: by_category(상품 종류별), monthly(최근 6개월 순매출), current.new_count · re_count(첫 결제 / 다시 결제),
--       compare(비교 기간). 1일부터 시작해 같은 달 안에서 끝나면 지난달 같은 날까지와 비교한다.
CREATE OR REPLACE FUNCTION crm_revenue_report(p_gym_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        trainers%ROWTYPE;
  v_scope     uuid[];
  v_is_owner  boolean;
  v_days      integer;
  v_prev_from date;
  v_prev_to   date;
  v_result    jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  SELECT * INTO v_me FROM trainers
   WHERE gym_id = p_gym_id AND auth_id = auth.uid()
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: not a member of gym %', p_gym_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_owner := v_me.role = 'owner';
  IF v_is_owner THEN
    SELECT array_agg(id) INTO v_scope FROM trainers WHERE gym_id = p_gym_id;
  ELSE
    v_scope := ARRAY[v_me.id];
  END IF;

  v_days := p_to - p_from + 1;
  IF p_from = date_trunc('month', p_from::timestamp)::date
     AND date_trunc('month', p_to::timestamp) = date_trunc('month', p_from::timestamp) THEN
    -- 이번 달 · 지난 달처럼 1일부터 시작한 달: 지난달 같은 날까지 (말일까지면 지난달 말일까지)
    v_prev_from := (p_from::timestamp - interval '1 month')::date;
    IF p_to = (date_trunc('month', p_to::timestamp) + interval '1 month - 1 day')::date THEN
      v_prev_to := p_from - 1;
    ELSE
      v_prev_to := LEAST((p_to::timestamp - interval '1 month')::date, p_from - 1);
    END IF;
  ELSE
    v_prev_to   := p_from - 1;
    v_prev_from := p_from - v_days;
  END IF;

  WITH pay AS (
    SELECT p.*,
           (p.paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date AS paid_day,
           COALESCE(p.status, 'active') AS st
      FROM payments p
     WHERE p.trainer_id = ANY(v_scope)
  ),
  sales AS (      -- 이번 기간 결제
    SELECT s.*,
           (s.member_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM payments e WHERE e.member_id = s.member_id AND e.paid_at < s.paid_at
           )) AS is_new
      FROM pay s WHERE s.paid_day BETWEEN p_from AND p_to
  ),
  refunds AS (    -- 이번 기간 환불 처리
    SELECT * FROM pay WHERE st = 'refunded' AND end_date BETWEEN p_from AND p_to
  ),
  daily AS (
    SELECT d::date AS day,
           COALESCE((SELECT SUM(amount) FROM sales  s WHERE s.paid_day = d::date), 0)
         - COALESCE((SELECT SUM(amount) FROM refunds r WHERE r.end_date = d::date), 0) AS net,
           (SELECT COUNT(*) FROM sales s WHERE s.paid_day = d::date) AS cnt
      FROM generate_series(p_from, p_to, interval '1 day') d
  )
  SELECT jsonb_build_object(
    'scope', CASE WHEN v_is_owner THEN 'gym' ELSE 'self' END,
    'from', p_from, 'to', p_to,
    'compare', jsonb_build_object('from', v_prev_from, 'to', v_prev_to),
    'current', jsonb_build_object(
      'sales',        (SELECT COALESCE(SUM(amount), 0) FROM sales),
      'count',        (SELECT COUNT(*) FROM sales),
      'refund',       (SELECT COALESCE(SUM(amount), 0) FROM refunds),
      'refund_count', (SELECT COUNT(*) FROM refunds),
      'new_count',    (SELECT COUNT(*) FROM sales WHERE is_new),
      're_count',     (SELECT COUNT(*) FROM sales WHERE NOT is_new)
    ),
    'previous', (
      SELECT jsonb_build_object(
        'sales',        COALESCE(SUM(amount) FILTER (WHERE paid_day BETWEEN v_prev_from AND v_prev_to), 0),
        'count',        COUNT(*) FILTER (WHERE paid_day BETWEEN v_prev_from AND v_prev_to),
        'refund',       COALESCE(SUM(amount) FILTER (WHERE st = 'refunded' AND end_date BETWEEN v_prev_from AND v_prev_to), 0),
        'refund_count', COUNT(*) FILTER (WHERE st = 'refunded' AND end_date BETWEEN v_prev_from AND v_prev_to)
      ) FROM pay
    ),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'net', net, 'count', cnt) ORDER BY day), '[]') FROM daily),
    'monthly', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'month', to_char(mm, 'YYYY-MM'),
               'net',   COALESCE(s.amt, 0) - COALESCE(r.amt, 0),
               'count', COALESCE(s.cnt, 0)
             ) ORDER BY mm), '[]')
        FROM generate_series(date_trunc('month', p_to::timestamp) - interval '5 months',
                             date_trunc('month', p_to::timestamp), interval '1 month') mm
        LEFT JOIN LATERAL (
          SELECT SUM(amount) AS amt, COUNT(*) AS cnt FROM pay
           WHERE paid_day >= mm::date AND paid_day < (mm + interval '1 month')::date AND paid_day <= p_to
        ) s ON true
        LEFT JOIN LATERAL (
          SELECT SUM(amount) AS amt FROM pay
           WHERE st = 'refunded' AND end_date >= mm::date AND end_date < (mm + interval '1 month')::date AND end_date <= p_to
        ) r ON true
    ),
    'by_product', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]')
        FROM (SELECT COALESCE(NULLIF(btrim(product_name), ''), '기타') AS name, SUM(amount) AS amt, COUNT(*) AS cnt
                FROM sales GROUP BY 1) x
    ),
    'by_category', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('category', cat, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]')
        FROM (SELECT COALESCE(gp.category, CASE WHEN COALESCE(s.session_count, 0) > 0 THEN '레슨' ELSE '일반' END) AS cat,
                     SUM(s.amount) AS amt, COUNT(*) AS cnt
                FROM sales s LEFT JOIN gym_products gp ON gp.id = s.gym_product_id
               GROUP BY 1) x
    ),
    'by_trainer', CASE WHEN v_is_owner THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.name, 'amount', x.amt, 'count', x.cnt) ORDER BY x.amt DESC), '[]')
        FROM (SELECT trainer_id, SUM(amount) AS amt, COUNT(*) AS cnt FROM sales GROUP BY trainer_id) x
        JOIN trainers t ON t.id = x.trainer_id
    ) ELSE NULL END,
    'by_method', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('method', m, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]')
        FROM (SELECT COALESCE(payment_method, 'card') AS m, SUM(amount) AS amt, COUNT(*) AS cnt FROM sales GROUP BY 1) x
    ),
    'refund_list', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'date', r.end_date, 'member', m.name, 'product', r.product_name, 'amount', r.amount
             ) ORDER BY r.end_date DESC), '[]')
        FROM refunds r LEFT JOIN members m ON m.id = r.member_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION crm_revenue_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_revenue_report(uuid, date, date) TO authenticated;
