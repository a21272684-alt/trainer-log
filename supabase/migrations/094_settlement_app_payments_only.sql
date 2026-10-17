-- 094_settlement_app_payments_only.sql
-- 트레이너 앱 정산(인센티브)은 트레이너 앱에서 등록한 결제만 반영 (사용자 결정 2026-10-17).
-- CRM 결제(gym_product_id 있음)는 CRM 에서만 집계 — 트레이너 앱 매출 목록(PR #156)과 기준을 맞춤.
--   1) 결제 스냅샷 트리거: CRM 결제는 스냅샷을 만들지 않음
--   2) calculate_settlement: 스냅샷이 없을 때 결제에서 직접 합산하는 경로도 CRM 결제 제외
--   3) 이미 만들어진 CRM 결제 스냅샷 중 확정 전(미연결·draft) 것은 삭제. 확정·지급된 정산은 건드리지 않음

-- 1) 스냅샷 트리거 — 함수 맨 앞에 한 줄 삽입
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.snap_on_payment_insert()'::regprocedure);
  IF position('gym_product_id' IN d) = 0 THEN
    d := regexp_replace(d, E'\nbegin\n',
      E'\nbegin\n  -- CRM 결제는 트레이너 앱 정산 대상 아님 (094)\n  if new.gym_product_id is not null then return new; end if;\n');
    EXECUTE d;
  END IF;
END $$;

-- 2) calculate_settlement — 결제 직접 합산 경로 두 곳에 조건 추가
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.calculate_settlement(uuid,integer,integer)'::regprocedure);
  IF position('gym_product_id' IN d) = 0 THEN
    d := replace(d, E'from payments\n    where trainer_id = p_trainer_id\n',
                    E'from payments\n    where trainer_id = p_trainer_id\n      and gym_product_id is null\n');
    d := replace(d, E'where p.trainer_id = p_trainer_id\n',
                    E'where p.trainer_id = p_trainer_id\n      and p.gym_product_id is null\n');
    IF (length(d) - length(replace(d, 'gym_product_id is null', ''))) / length('gym_product_id is null') <> 2 THEN
      RAISE EXCEPTION 'calculate_settlement 본문이 예상과 달라 수정하지 않았습니다';
    END IF;
    EXECUTE d;
  END IF;
END $$;

-- 3) 기존 CRM 결제 스냅샷 정리 (확정 전 것만)
DELETE FROM settlement_snapshots ss
 USING payments p
 WHERE p.id = ss.payment_id
   AND ss.snapshot_type = 'payment'
   AND p.gym_product_id IS NOT NULL
   AND (ss.settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM settlements st WHERE st.id = ss.settlement_id AND st.status = 'draft'));
