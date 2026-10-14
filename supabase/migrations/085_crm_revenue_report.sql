-- 085_crm_revenue_report.sql
-- CRM 매출 분석 탭용 집계 RPC.
--
-- 범위(권한):
--   - 대표(role='owner')  → 센터 전체 트레이너의 결제
--   - 그 외 직원          → 본인(trainer_id = 호출자) 결제만
--   (직급별 세부 권한은 추후 별도 작업)
--
-- 기준:
--   - 날짜는 한국 시간(KST). paid_at 은 클라이언트가 toISOString()(UTC) 으로 저장하므로 변환.
--   - 매출 = 기간 내 결제 금액 합(환불 여부와 무관하게 결제 시점에 잡음)
--   - 환불 = 기간 내 환불 처리된 결제(status='refunded', 환불일 = end_date) 금액 합
--   - 순매출 = 매출 - 환불
--   - 비교 = 같은 길이의 직전 기간
-- 결제 데이터는 읽기만 함. 정산 계산과 무관.

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

  v_days      := p_to - p_from + 1;
  v_prev_to   := p_from - 1;
  v_prev_from := p_from - v_days;

  WITH pay AS (
    SELECT p.*,
           (p.paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date AS paid_day,
           COALESCE(p.status, 'active') AS st
      FROM payments p
     WHERE p.trainer_id = ANY(v_scope)
  ),
  sales AS (      -- 이번 기간 결제
    SELECT * FROM pay WHERE paid_day BETWEEN p_from AND p_to
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
    'current', jsonb_build_object(
      'sales',        (SELECT COALESCE(SUM(amount), 0) FROM sales),
      'count',        (SELECT COUNT(*) FROM sales),
      'refund',       (SELECT COALESCE(SUM(amount), 0) FROM refunds),
      'refund_count', (SELECT COUNT(*) FROM refunds)
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
    'by_product', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'amount', amt, 'count', cnt) ORDER BY amt DESC), '[]')
        FROM (SELECT COALESCE(NULLIF(btrim(product_name), ''), '기타') AS name, SUM(amount) AS amt, COUNT(*) AS cnt
                FROM sales GROUP BY 1) x
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
