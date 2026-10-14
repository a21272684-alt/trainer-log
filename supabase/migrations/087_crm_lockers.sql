-- 087_crm_lockers.sql
-- CRM 락커 관리.
--
-- 규칙 (사용자 결정 2026-10-14):
--   - 락커는 번호만 (구역 없음). 센터별 번호 유일
--   - 결제 창에서 대여권 결제와 함께 배정(또는 나중에 배정)
--   - 만료돼도 자동으로 비우지 않음 → 직원이 "회수"를 눌러야 빈 칸
--   - 회원권 정지 시 락커 기간은 늘리지 않음 (086 정지 RPC 에서 대여권 결제 제외)
--   - 운동복은 관리하지 않음
--
-- 쓰기는 전부 SECURITY DEFINER RPC (같은 센터 소속 트레이너만). 테이블은 센터 직원 SELECT 만 허용.

CREATE TABLE IF NOT EXISTS lockers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  number      integer NOT NULL CHECK (number BETWEEN 1 AND 9999),
  status      text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'disabled')),
  memo        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, number)
);

CREATE TABLE IF NOT EXISTS locker_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  locker_id   uuid NOT NULL REFERENCES lockers(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  returned_at timestamptz,
  created_by  uuid REFERENCES trainers(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- 한 칸에 사용 중(미회수) 배정은 하나만
CREATE UNIQUE INDEX IF NOT EXISTS locker_assignments_one_active
  ON locker_assignments(locker_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS locker_assignments_member_idx ON locker_assignments(member_id);

ALTER TABLE lockers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE locker_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lockers_gym_select" ON lockers;
CREATE POLICY "lockers_gym_select" ON lockers FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM trainers WHERE auth_id = auth.uid()));
DROP POLICY IF EXISTS "locker_assignments_gym_select" ON locker_assignments;
CREATE POLICY "locker_assignments_gym_select" ON locker_assignments FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM trainers WHERE auth_id = auth.uid()));

-- ── 내부 헬퍼: 호출자가 센터 소속인지 → 호출자 trainer id ─────────
CREATE OR REPLACE FUNCTION crm_assert_gym_staff(p_gym_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tid uuid;
BEGIN
  SELECT id INTO v_tid FROM trainers WHERE gym_id = p_gym_id AND auth_id = auth.uid() LIMIT 1;
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_tid;
END;
$$;
REVOKE ALL ON FUNCTION crm_assert_gym_staff(uuid) FROM PUBLIC, anon, authenticated;

-- ── 현황판 ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_locker_board(p_gym_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'number', l.number, 'status', l.status, 'memo', l.memo,
      'assignment', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', a.id, 'member_id', a.member_id, 'member_name', m.name, 'member_phone', m.phone,
        'start_date', a.start_date, 'end_date', a.end_date, 'payment_id', a.payment_id,
        'product_name', p.product_name, 'amount', p.amount) END
    ) ORDER BY l.number)
    FROM lockers l
    LEFT JOIN locker_assignments a ON a.locker_id = l.id AND a.returned_at IS NULL
    LEFT JOIN members  m ON m.id = a.member_id
    LEFT JOIN payments p ON p.id = a.payment_id
    WHERE l.gym_id = p_gym_id
  ), '[]'::jsonb);
END;
$$;

-- ── 회원별 락커 이력 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_member_lockers(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_member_gym(p_member_id);   -- 086
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'number', l.number, 'start_date', a.start_date, 'end_date', a.end_date,
      'returned_at', a.returned_at, 'product_name', p.product_name)
      ORDER BY (a.returned_at IS NULL) DESC, a.start_date DESC)
    FROM locker_assignments a
    JOIN lockers l ON l.id = a.locker_id
    LEFT JOIN payments p ON p.id = a.payment_id
    WHERE a.member_id = p_member_id
  ), '[]'::jsonb);
END;
$$;

-- ── 락커 추가 (번호 범위) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_add_lockers(p_gym_id uuid, p_from integer, p_to integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_added integer;
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  IF p_from IS NULL OR p_to IS NULL OR p_from < 1 OR p_to > 9999 OR p_to < p_from OR p_to - p_from >= 500 THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  INSERT INTO lockers (gym_id, number)
  SELECT p_gym_id, n FROM generate_series(p_from, p_to) n
  ON CONFLICT (gym_id, number) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

-- ── 사용 가능 / 사용 불가 ─────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_set_locker_status(p_locker_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_gym uuid;
BEGIN
  SELECT gym_id INTO v_gym FROM lockers WHERE id = p_locker_id;
  IF v_gym IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM crm_assert_gym_staff(v_gym);
  IF p_status NOT IN ('available', 'disabled') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF p_status = 'disabled' AND EXISTS (
    SELECT 1 FROM locker_assignments WHERE locker_id = p_locker_id AND returned_at IS NULL) THEN
    RAISE EXCEPTION 'IN_USE';
  END IF;
  UPDATE lockers SET status = p_status WHERE id = p_locker_id;
END;
$$;

-- ── 배정 ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_assign_locker(
  p_locker_id uuid, p_member_id uuid, p_start date, p_end date, p_payment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_l lockers%ROWTYPE; v_tid uuid; v_id uuid;
BEGIN
  SELECT * INTO v_l FROM lockers WHERE id = p_locker_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_tid := crm_assert_gym_staff(v_l.gym_id);
  IF crm_assert_member_gym(p_member_id) <> v_l.gym_id THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF v_l.status <> 'available' THEN RAISE EXCEPTION 'DISABLED'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
  IF EXISTS (SELECT 1 FROM locker_assignments WHERE locker_id = p_locker_id AND returned_at IS NULL) THEN
    RAISE EXCEPTION 'IN_USE';
  END IF;
  INSERT INTO locker_assignments (gym_id, locker_id, member_id, payment_id, start_date, end_date, created_by)
  VALUES (v_l.gym_id, p_locker_id, p_member_id, p_payment_id, p_start, p_end, v_tid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 연장 (연장 결제 후) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_extend_locker(p_assignment_id uuid, p_new_end date, p_payment_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_a locker_assignments%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM locker_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_a.returned_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_ACTIVE'; END IF;
  PERFORM crm_assert_gym_staff(v_a.gym_id);
  IF p_new_end IS NULL OR p_new_end <= v_a.end_date THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
  UPDATE locker_assignments
     SET end_date = p_new_end, payment_id = COALESCE(p_payment_id, payment_id)
   WHERE id = p_assignment_id;
END;
$$;

-- ── 다른 칸으로 이동 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_move_locker(p_assignment_id uuid, p_new_locker_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_a locker_assignments%ROWTYPE; v_l lockers%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM locker_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_a.returned_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_ACTIVE'; END IF;
  PERFORM crm_assert_gym_staff(v_a.gym_id);
  SELECT * INTO v_l FROM lockers WHERE id = p_new_locker_id FOR UPDATE;
  IF NOT FOUND OR v_l.gym_id <> v_a.gym_id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_l.status <> 'available' THEN RAISE EXCEPTION 'DISABLED'; END IF;
  IF EXISTS (SELECT 1 FROM locker_assignments WHERE locker_id = p_new_locker_id AND returned_at IS NULL) THEN
    RAISE EXCEPTION 'IN_USE';
  END IF;
  UPDATE locker_assignments SET locker_id = p_new_locker_id WHERE id = p_assignment_id;
END;
$$;

-- ── 회수 (빈 칸으로) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_return_locker(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_a locker_assignments%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM locker_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_a.returned_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_ACTIVE'; END IF;
  PERFORM crm_assert_gym_staff(v_a.gym_id);
  UPDATE locker_assignments SET returned_at = now() WHERE id = p_assignment_id;
END;
$$;

-- ── 086 회원권 정지: 대여권(락커) 결제는 날짜를 옮기지 않음 ────────
CREATE OR REPLACE FUNCTION crm_pause_membership(
  p_member_id uuid, p_start date, p_end date, p_reason text DEFAULT NULL
)
RETURNS member_holds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days    integer;
  v_shifts  jsonb := '[]'::jsonb;
  v_names   text[] := '{}';
  v_p       record;
  v_ns      date;
  v_ne      date;
  v_trainer uuid;
  v_row     member_holds%ROWTYPE;
BEGIN
  PERFORM crm_assert_member_gym(p_member_id);

  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  v_days := p_end - p_start + 1;
  IF v_days > 366 THEN RAISE EXCEPTION 'TOO_LONG'; END IF;

  PERFORM 1 FROM members WHERE id = p_member_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM member_holds
              WHERE member_id = p_member_id
                AND start_date <= p_end AND end_date >= p_start) THEN
    RAISE EXCEPTION 'OVERLAP';
  END IF;

  FOR v_p IN
    SELECT p.id, p.product_name, p.start_date, p.end_date
      FROM payments p
      LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
     WHERE p.member_id = p_member_id
       AND COALESCE(p.status, 'active') = 'active'
       AND p.start_date IS NOT NULL AND p.end_date IS NOT NULL
       AND p.end_date >= p_start
       AND COALESCE(gp.category, '') <> '대여권'
     ORDER BY p.start_date
     FOR UPDATE OF p
  LOOP
    v_ns := CASE WHEN v_p.start_date >= p_start THEN v_p.start_date + v_days ELSE v_p.start_date END;
    v_ne := v_p.end_date + v_days;
    UPDATE payments SET start_date = v_ns, end_date = v_ne WHERE id = v_p.id;
    v_shifts := v_shifts || jsonb_build_object(
      'payment_id', v_p.id, 'name', v_p.product_name,
      'old_start', v_p.start_date, 'old_end', v_p.end_date,
      'new_start', v_ns, 'new_end', v_ne);
    v_names := v_names || COALESCE(v_p.product_name, '회원권');
  END LOOP;

  SELECT trainer_id INTO v_trainer FROM members WHERE id = p_member_id;

  INSERT INTO member_holds (member_id, trainer_id, product_name, start_date, end_date, reason, shifts)
  VALUES (p_member_id, v_trainer, NULLIF(array_to_string(v_names, ', '), ''),
          p_start, p_end, NULLIF(btrim(COALESCE(p_reason, '')), ''), v_shifts)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION crm_locker_board(uuid)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_member_lockers(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_add_lockers(uuid, integer, integer)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_set_locker_status(uuid, text)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_assign_locker(uuid, uuid, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_extend_locker(uuid, date, uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_move_locker(uuid, uuid)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_return_locker(uuid)                        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_locker_board(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION crm_member_lockers(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION crm_add_lockers(uuid, integer, integer)        TO authenticated;
GRANT EXECUTE ON FUNCTION crm_set_locker_status(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION crm_assign_locker(uuid, uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_extend_locker(uuid, date, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION crm_move_locker(uuid, uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION crm_return_locker(uuid)                        TO authenticated;
