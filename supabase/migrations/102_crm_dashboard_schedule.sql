-- 102_crm_dashboard_schedule.sql
-- CRM 개편 1차 — 대시보드 · 센터 시간표에 필요한 읽기 전용 함수
--
-- 1) crm_gym_schedule(p_gym_id, p_from, p_to)
--    트레이너 앱 시간표(trainer_schedules.blocks)를 센터 직원이 읽기만 한다.
--    trainer_schedules 는 RLS 가 본인 행만 허용 → 센터 전체는 이 함수로만 본다.
--    · 수업(type = 'lesson') 만 내보낸다. 개인 일정의 제목 · 메모는 내보내지 않는다.
--    · 회원 이름은 그 트레이너 담당 회원일 때만 붙인다.
--
-- 2) crm_member_stats(p_gym_id) 다시 만들기 (반환 열 추가라 DROP 후 CREATE)
--    · membership_end : 오늘 이후 끝나는 이용권(대여권 제외) 중 가장 늦은 끝나는 날
--                       → 기간 회원권만 있는 회원이 '마감' 으로 잘못 보이던 문제 해결
--    · last_attended  : PT 출석(attendance) 과 입장 기록(gym_checkins) 중 최근 날짜

-- ── 1. 센터 시간표 ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_gym_schedule(p_gym_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id',          b->>'id',
             'trainer_id',  t.id,
             'date',        b->>'date',
             'start',       b->>'start',
             'end',         b->>'end',
             'cancelled',   COALESCE(b->'cancelled' = 'true'::jsonb, false),
             'member_id',   m.id,
             'member_name', m.name,
             'remain',      CASE WHEN m.id IS NULL THEN NULL
                                 ELSE GREATEST(COALESCE(m.total_sessions, 0) - COALESCE(m.done_sessions, 0), 0) END,
             'product',     (SELECT p.product_name FROM payments p
                              WHERE m.id IS NOT NULL AND p.member_id = m.id
                                AND COALESCE(p.status, 'active') = 'active'
                              ORDER BY p.paid_at DESC NULLS LAST LIMIT 1)
           ) ORDER BY b->>'date', b->>'start')
      FROM trainers t
      JOIN trainer_schedules ts ON ts.trainer_id = t.id
     CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(ts.blocks) = 'array' THEN ts.blocks ELSE '[]'::jsonb END) b
      LEFT JOIN members m ON m.id::text = b->>'memberId' AND m.trainer_id = t.id
     WHERE t.gym_id = p_gym_id
       AND b->>'type' = 'lesson'
       AND b->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
       AND (b->>'date')::date BETWEEN p_from AND p_to
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION crm_gym_schedule(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_gym_schedule(uuid, date, date) TO authenticated;

-- ── 2. 회원 통계 (열 추가) ────────────────────────────────────
DROP FUNCTION IF EXISTS crm_member_stats(uuid);

CREATE FUNCTION crm_member_stats(p_gym_id uuid)
RETURNS TABLE (
  member_id      uuid,
  total_paid     bigint,
  payment_count  integer,
  last_paid_at   timestamp,
  last_attended  date,
  membership_end date
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
    SELECT p.member_id, MAX(p.end_date) AS membership_end
    FROM payments p
    LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
    WHERE p.member_id IN (SELECT id FROM gym_members)
      AND COALESCE(p.status, 'active') = 'active'
      AND p.end_date >= v_today
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
         pass.membership_end
  FROM gym_members gm
  LEFT JOIN pay  ON pay.member_id  = gm.id
  LEFT JOIN pass ON pass.member_id = gm.id
  LEFT JOIN att  ON att.member_id  = gm.id
  LEFT JOIN ck   ON ck.member_id   = gm.id;
END;
$$;

REVOKE ALL ON FUNCTION crm_member_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_member_stats(uuid) TO authenticated;
