-- 083_crm_member_filters.sql
-- CRM 회원 관리 — 고급 필터 + 세그먼트 저장
--
-- 1) crm_member_stats(p_gym_id) : 회원별 결제/출석 집계 RPC
--    payments/attendance RLS 는 "본인 트레이너 행"만 허용(051) → 대표/직원이
--    센터 전체 회원의 결제·출석을 직접 SELECT 하면 본인 담당분만 보임.
--    SECURITY DEFINER 로 집계만 반환하고, 호출자가 해당 센터 소속 트레이너인지 검사.
-- 2) crm_segments : 센터별 저장 필터(세그먼트). 같은 센터 소속 트레이너만 읽기/쓰기.
--
-- 멱등: CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS.

-- ── 1. 회원별 집계 RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_member_stats(p_gym_id uuid)
RETURNS TABLE (
  member_id      uuid,
  total_paid     bigint,
  payment_count  integer,
  last_paid_at   timestamp,
  last_attended  date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  att AS (
    SELECT a.member_id, MAX(a.attended_date) AS last_attended
    FROM attendance a
    WHERE a.member_id IN (SELECT id FROM gym_members)
      AND COALESCE(a.status, 'attended') IN ('attended', 'late')
    GROUP BY a.member_id
  )
  SELECT gm.id,
         COALESCE(pay.total_paid, 0)::bigint,
         COALESCE(pay.payment_count, 0)::integer,
         pay.last_paid_at,
         att.last_attended
  FROM gym_members gm
  LEFT JOIN pay ON pay.member_id = gm.id
  LEFT JOIN att ON att.member_id = gm.id;
END;
$$;

REVOKE ALL ON FUNCTION crm_member_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_member_stats(uuid) TO authenticated;

-- ── 2. 세그먼트 테이블 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_segments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES trainers(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_segments_gym_idx ON crm_segments(gym_id);

ALTER TABLE crm_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_segments_gym_select" ON crm_segments;
DROP POLICY IF EXISTS "crm_segments_gym_insert" ON crm_segments;
DROP POLICY IF EXISTS "crm_segments_gym_delete" ON crm_segments;

CREATE POLICY "crm_segments_gym_select" ON crm_segments
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM trainers WHERE auth_id::text = auth.uid()::text));

CREATE POLICY "crm_segments_gym_insert" ON crm_segments
  FOR INSERT TO authenticated
  WITH CHECK (gym_id IN (SELECT gym_id FROM trainers WHERE auth_id::text = auth.uid()::text));

CREATE POLICY "crm_segments_gym_delete" ON crm_segments
  FOR DELETE TO authenticated
  USING (gym_id IN (SELECT gym_id FROM trainers WHERE auth_id::text = auth.uid()::text));
