-- ============================================================
-- 077_admin_add_subscription.sql
-- AdminPortal 구독(결제) 추가 복원.
--
-- 배경: AdminPortal 은 anon key 만 사용. subscriptions 직접 INSERT 가
--   RLS(anon 쓰기 차단)로 막혀 "new row violates row-level security policy
--   for table subscriptions" 발생. 052 의 admin_* 패턴과 동일하게
--   _admin_assert 토큰 가드 SECURITY DEFINER RPC 로 우회한다.
--
-- ⚠️ 전제: 052_admin_rpcs.sql 의 _admin_assert(text) 가 이미 생성되어 있고,
--   본문의 '<<ADMIN_TOKEN>>' 가 실제 토큰으로 치환돼 있어야 함(기존과 동일).
--   본 마이그는 토큰을 포함하지 않으며 _admin_assert 를 호출만 한다.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_add_subscription(
  p_admin_token    text,
  p_trainer_id     uuid,
  p_plan           text,
  p_payment_method text,
  p_amount         integer,
  p_paid_at        timestamp,
  p_valid_until    date,
  p_memo           text
)
RETURNS subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row subscriptions;
BEGIN
  PERFORM _admin_assert(p_admin_token);

  INSERT INTO subscriptions (trainer_id, plan, payment_method, amount, paid_at, valid_until, memo)
  VALUES (
    p_trainer_id,
    p_plan,
    COALESCE(NULLIF(p_payment_method, ''), '카카오페이'),
    COALESCE(p_amount, 0),
    COALESCE(p_paid_at, now()),
    p_valid_until,
    NULLIF(p_memo, '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION admin_add_subscription(text, uuid, text, text, integer, timestamp, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_add_subscription(text, uuid, text, text, integer, timestamp, date, text) TO anon, authenticated;

COMMENT ON FUNCTION admin_add_subscription(text, uuid, text, text, integer, timestamp, date, text) IS
  'AdminPortal 구독 추가. _admin_assert 토큰 가드 후 subscriptions INSERT (RLS 우회).';
