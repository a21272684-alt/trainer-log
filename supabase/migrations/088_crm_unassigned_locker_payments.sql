-- 088_crm_unassigned_locker_payments.sql
-- "칸은 나중에 배정" 으로 결제만 된 대여권(락커) 결제 목록 — 락커 관리에서 빈 칸에 배정할 때 사용.
-- 조건: 대여권 상품 · 활성 · 아직 만료 전 · 어떤 락커 배정에도 연결되지 않음.

CREATE OR REPLACE FUNCTION crm_unassigned_locker_payments(p_gym_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'payment_id', p.id, 'member_id', m.id, 'member_name', m.name,
      'product_name', p.product_name, 'start_date', p.start_date, 'end_date', p.end_date
    ) ORDER BY p.paid_at)
    FROM payments p
    JOIN gym_products gp ON gp.id = p.gym_product_id AND gp.category = '대여권'
    JOIN members m       ON m.id = p.member_id
    JOIN trainers t      ON t.id = m.trainer_id AND t.gym_id = p_gym_id
    WHERE COALESCE(p.status, 'active') = 'active'
      AND p.start_date IS NOT NULL AND p.end_date >= (now() AT TIME ZONE 'Asia/Seoul')::date
      AND NOT EXISTS (SELECT 1 FROM locker_assignments a WHERE a.payment_id = p.id)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION crm_unassigned_locker_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_unassigned_locker_payments(uuid) TO authenticated;
