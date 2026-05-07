-- ================================================================
-- 046: process_refund_and_cascade RPC
-- 기간권 환불 + 후속 기간권 날짜 도미노(연쇄) 당겨오기
-- ================================================================
-- [트랜잭션 보장]
--   PL/pgSQL FUNCTION 은 기본적으로 암시적 트랜잭션 블록 안에서 실행.
--   EXCEPTION 발생 시 전체 롤백 → 부분 업데이트 불가.
--
-- [인자]
--   p_payment_id       : 환불할 payments.id (UUID)
--   p_refund_date      : 환불 처리일 (DATE) — 이 날로 end_date 단축
--   p_executor_role    : 실행자 role ('owner' | 'manager') — 보안 체크용
--
-- [반환]
--   JSONB: { success, refunded_id, refund_date, cascaded_count }
--          실패 시 RAISE EXCEPTION → Supabase RPC 오류로 전달
-- ================================================================

CREATE OR REPLACE FUNCTION process_refund_and_cascade(
  p_payment_id    UUID,
  p_refund_date   DATE,
  p_executor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_target      RECORD;    -- 환불 대상 결제
  v_ticket      RECORD;    -- 루프 내 후속 기간권
  v_cur_end     DATE;      -- 도미노 체인 현재 끝 날짜
  v_duration    INTEGER;   -- 해당 티켓의 이용 일수
  v_cascaded    INTEGER := 0;
BEGIN

  -- ── 1. 권한 체크 ──────────────────────────────────────────────
  IF p_executor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: role "%" cannot process refunds. Required: owner or manager.',
      p_executor_role
    USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── 2. 환불 대상 결제 조회 (FOR UPDATE 로 동시성 잠금) ─────────
  SELECT
    p.id,
    p.member_id,
    p.start_date,
    p.end_date,
    p.status,
    gp.duration_days
  INTO v_target
  FROM  payments     p
  LEFT  JOIN gym_products gp ON gp.id = p.gym_product_id
  WHERE p.id     = p_payment_id
  FOR   UPDATE;   -- 동시 환불 요청 직렬화

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: payment id=% does not exist.', p_payment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_target.status <> 'active' THEN
    RAISE EXCEPTION 'ALREADY_REFUNDED: payment id=% is already "%".', p_payment_id, v_target.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 환불 처리일은 기간권 시작일 이후여야 함
  IF v_target.start_date IS NOT NULL AND p_refund_date < v_target.start_date THEN
    RAISE EXCEPTION 'INVALID_REFUND_DATE: refund_date(%) is before start_date(%).',
      p_refund_date, v_target.start_date
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── 3. 환불 처리: status = refunded, end_date = 환불일로 단축 ───
  UPDATE payments
     SET status   = 'refunded',
         end_date = p_refund_date
   WHERE id = p_payment_id;

  -- ── 4. 후속 기간권 도미노 계산 (체인 출발점 = 환불 처리일) ───────
  v_cur_end := p_refund_date;

  FOR v_ticket IN
    SELECT
      p.id,
      gp.duration_days AS dur
    FROM  payments     p
    JOIN  gym_products gp ON gp.id = p.gym_product_id
    WHERE p.member_id   = v_target.member_id
      AND p.status      = 'active'
      AND p.start_date  > v_target.start_date  -- 타겟보다 뒤에 시작하는 티켓만
      AND gp.duration_days > 0                 -- 기간권만 (횟수권 제외)
    ORDER BY p.start_date ASC                  -- 날짜 순서대로 체인 연결
  LOOP
    v_duration := v_ticket.dur;

    UPDATE payments
       SET start_date = v_cur_end + INTERVAL '1 day',
           end_date   = v_cur_end + INTERVAL '1 day'
                        + (v_duration - 1) * INTERVAL '1 day'
     WHERE id = v_ticket.id;

    -- 다음 체인 기준점 갱신
    v_cur_end := v_cur_end + INTERVAL '1 day'
                 + (v_duration - 1) * INTERVAL '1 day';

    v_cascaded := v_cascaded + 1;
  END LOOP;

  -- ── 5. 결과 반환 ──────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',        true,
    'refunded_id',    p_payment_id,
    'refund_date',    p_refund_date::text,
    'cascaded_count', v_cascaded
  );

END;
$$;

-- RPC 접근 권한 (authenticated 사용자 허용 — role 체크는 함수 내부에서)
GRANT EXECUTE ON FUNCTION process_refund_and_cascade(UUID, DATE, TEXT)
  TO authenticated, anon;

COMMENT ON FUNCTION process_refund_and_cascade IS
  '기간권 환불 처리 + 후속 기간권 날짜 도미노 연쇄 업데이트. '
  '트랜잭션 원자성 보장: 중간 실패 시 전체 롤백.';
