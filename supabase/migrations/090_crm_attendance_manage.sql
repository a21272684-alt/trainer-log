-- 090_crm_attendance_manage.sql
-- CRM "출석 관리" 탭: 회원 출석 기록 조회·수동 출석·취소, 장기 미출석, 직원 근태(출퇴근).
--
-- 규칙 (사용자 결정 2026-10-15):
--   - 장기 미출석 = 유효 회원권(또는 PT 잔여)이 있는데 14일 이상 입장 없음
--     (입장 기록 gym_checkins 와 PT 출석 attendance 중 더 최근 날짜 기준)
--   - 회원 입장 기록 취소 = 센터 직원 누구나 (취소자 기록, 실제 삭제 아님)
--   - 직원 근태 = 태블릿에서 회원과 똑같이 본인 전화번호 뒤 4자리 → 출근 / 다시 누르면 퇴근
--   - 근태 조회·수정 = 대표 또는 crm_permissions.manage_attendance = true
--   - 근태는 기록·조회만 (급여 정산 미연결)

-- ── 회원 입장 기록: 처리 방식 · 취소 ─────────────────────────────
ALTER TABLE gym_checkins ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'kiosk';
ALTER TABLE gym_checkins ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE gym_checkins ADD COLUMN IF NOT EXISTS canceled_at  timestamptz;
ALTER TABLE gym_checkins ADD COLUMN IF NOT EXISTS canceled_by  uuid REFERENCES trainers(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE gym_checkins ADD CONSTRAINT gym_checkins_source_check CHECK (source IN ('kiosk', 'staff'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 직원 근태 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  trainer_id  uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  clock_in    timestamptz NOT NULL,
  clock_out   timestamptz,
  source      text NOT NULL DEFAULT 'kiosk' CHECK (source IN ('kiosk', 'manual')),
  edited_by   uuid REFERENCES trainers(id) ON DELETE SET NULL,
  edited_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (clock_out IS NULL OR clock_out > clock_in)
);
CREATE INDEX IF NOT EXISTS staff_attendance_gym_time_idx ON staff_attendance(gym_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS staff_attendance_trainer_idx  ON staff_attendance(trainer_id, clock_in DESC);
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;   -- 직접 접근 없음, RPC 로만

-- 근태 관리 권한: 대표 또는 manage_attendance
CREATE OR REPLACE FUNCTION crm_can_manage_attendance(p_gym_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trainers
     WHERE gym_id = p_gym_id AND auth_id = auth.uid()
       AND (role = 'owner' OR COALESCE((crm_permissions->>'manage_attendance')::boolean, false))
  )
$$;

-- ── 번호 조회: 회원 + 직원 ─────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_kiosk_lookup(p_gym_id uuid, p_last4 text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  IF p_last4 IS NULL OR p_last4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'kind' DESC, x->>'masked_name') FROM (
      SELECT jsonb_build_object('kind', 'member', 'member_id', m.id, 'masked_name', crm_mask_name(m.name)) AS x
        FROM members m JOIN trainers t ON t.id = m.trainer_id
       WHERE t.gym_id = p_gym_id
         AND right(regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g'), 4) = p_last4
      UNION ALL
      SELECT jsonb_build_object('kind', 'staff', 'trainer_id', s.id, 'masked_name', crm_mask_name(s.name))
        FROM trainers s
       WHERE s.gym_id = p_gym_id AND COALESCE(s.employment_status, 'active') = 'active'
         AND right(regexp_replace(COALESCE(s.phone, ''), '[^0-9]', '', 'g'), 4) = p_last4
    ) q
  ), '[]'::jsonb);
END;
$$;

-- ── 회원 입장: 처리 방식(태블릿/직원) 기록, 취소된 기록 제외 ──────────
DROP FUNCTION IF EXISTS crm_kiosk_checkin(uuid, uuid);
CREATE OR REPLACE FUNCTION crm_kiosk_checkin(p_gym_id uuid, p_member_id uuid, p_source text DEFAULT 'kiosk')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today   date := crm_today_kst();
  v_me      uuid;
  v_m       members%ROWTYPE;
  v_hold    member_holds%ROWTYPE;
  v_ms      record;
  v_last    record;
  v_pt      integer;
  v_trainer text;
  v_locker  record;
  v_prev    timestamptz;
BEGIN
  v_me := crm_assert_gym_staff(p_gym_id);
  IF p_source NOT IN ('kiosk', 'staff') THEN RAISE EXCEPTION 'INVALID_SOURCE'; END IF;
  SELECT m.* INTO v_m FROM members m JOIN trainers t ON t.id = m.trainer_id
   WHERE m.id = p_member_id AND t.gym_id = p_gym_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT * INTO v_hold FROM member_holds
   WHERE member_id = p_member_id AND start_date <= v_today AND end_date >= v_today
   ORDER BY start_date DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'paused', 'name', v_m.name,
      'hold', jsonb_build_object('id', v_hold.id, 'start_date', v_hold.start_date, 'end_date', v_hold.end_date,
                                 'elapsed_days', v_today - v_hold.start_date));
  END IF;

  SELECT p.product_name, p.end_date INTO v_ms
    FROM payments p LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
   WHERE p.member_id = p_member_id AND COALESCE(p.status, 'active') = 'active'
     AND p.start_date <= v_today AND p.end_date >= v_today
     AND COALESCE(gp.category, '') <> '대여권'
   ORDER BY p.end_date DESC LIMIT 1;
  v_pt := GREATEST(0, COALESCE(v_m.total_sessions, 0) - COALESCE(v_m.done_sessions, 0));

  IF v_ms IS NULL AND v_pt = 0 THEN
    SELECT p.product_name, p.end_date INTO v_last
      FROM payments p LEFT JOIN gym_products gp ON gp.id = p.gym_product_id
     WHERE p.member_id = p_member_id AND p.end_date IS NOT NULL AND COALESCE(gp.category, '') <> '대여권'
     ORDER BY p.end_date DESC LIMIT 1;
    INSERT INTO gym_checkins (gym_id, member_id, result, source, processed_by)
    VALUES (p_gym_id, p_member_id, 'rejected_expired', p_source, v_me);
    RETURN jsonb_build_object('status', 'expired', 'name', v_m.name,
      'last', CASE WHEN v_last IS NULL THEN NULL ELSE jsonb_build_object('product_name', v_last.product_name, 'end_date', v_last.end_date) END);
  END IF;

  SELECT name INTO v_trainer FROM trainers WHERE id = v_m.trainer_id;
  SELECT l.number, a.end_date INTO v_locker
    FROM locker_assignments a JOIN lockers l ON l.id = a.locker_id
   WHERE a.member_id = p_member_id AND a.returned_at IS NULL
   ORDER BY a.end_date DESC LIMIT 1;

  SELECT checked_at INTO v_prev FROM gym_checkins
   WHERE member_id = p_member_id AND result = 'ok' AND canceled_at IS NULL
     AND (checked_at AT TIME ZONE 'Asia/Seoul')::date = v_today
   ORDER BY checked_at LIMIT 1;
  IF v_prev IS NULL THEN
    INSERT INTO gym_checkins (gym_id, member_id, result, source, processed_by)
    VALUES (p_gym_id, p_member_id, 'ok', p_source, v_me);
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_prev IS NULL THEN 'ok' ELSE 'already' END,
    'first_at', v_prev,
    'name', v_m.name,
    'membership', CASE WHEN v_ms IS NULL THEN NULL ELSE jsonb_build_object(
      'product_name', v_ms.product_name, 'end_date', v_ms.end_date, 'days_left', v_ms.end_date - v_today) END,
    'pt_remaining', v_pt,
    'trainer_name', v_trainer,
    'locker', CASE WHEN v_locker IS NULL THEN NULL ELSE jsonb_build_object('number', v_locker.number, 'end_date', v_locker.end_date) END
  );
END;
$$;

-- ── 직원 출근/퇴근 (태블릿) ─────────────────────────────────────
-- 오늘 출근 후 퇴근 안 한 기록이 있으면 퇴근, 없으면 새 출근.
CREATE OR REPLACE FUNCTION crm_kiosk_staff_punch(p_gym_id uuid, p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today date := crm_today_kst();
  v_name  text;
  v_open  staff_attendance%ROWTYPE;
  v_now   timestamptz := now();
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  SELECT name INTO v_name FROM trainers
   WHERE id = p_trainer_id AND gym_id = p_gym_id AND COALESCE(employment_status, 'active') = 'active';
  IF v_name IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT * INTO v_open FROM staff_attendance
   WHERE trainer_id = p_trainer_id AND clock_out IS NULL
     AND (clock_in AT TIME ZONE 'Asia/Seoul')::date = v_today
   ORDER BY clock_in DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE staff_attendance SET clock_out = v_now WHERE id = v_open.id;
    RETURN jsonb_build_object('status', 'clock_out', 'name', v_name,
      'clock_in', v_open.clock_in, 'clock_out', v_now,
      'minutes', floor(extract(epoch FROM v_now - v_open.clock_in) / 60)::int);
  END IF;

  INSERT INTO staff_attendance (gym_id, trainer_id, clock_in, source) VALUES (p_gym_id, p_trainer_id, v_now, 'kiosk');
  RETURN jsonb_build_object('status', 'clock_in', 'name', v_name, 'clock_in', v_now);
END;
$$;

-- ── 회원 입장 기록 취소 (직원 누구나) ─────────────────────────────
CREATE OR REPLACE FUNCTION crm_cancel_checkin(p_checkin_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_gym uuid; v_me uuid;
BEGIN
  SELECT gym_id INTO v_gym FROM gym_checkins WHERE id = p_checkin_id AND canceled_at IS NULL;
  IF v_gym IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_me := crm_assert_gym_staff(v_gym);
  UPDATE gym_checkins SET canceled_at = now(), canceled_by = v_me WHERE id = p_checkin_id;
END;
$$;

-- ── 하루치 회원 입장 기록 + 요약 + 시간대별 ───────────────────────
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
           ORDER BY p.end_date DESC LIMIT 1)
      ) ORDER BY c.checked_at DESC)
      FROM gym_checkins c
      JOIN members m ON m.id = c.member_id
      LEFT JOIN trainers pb ON pb.id = c.processed_by
      LEFT JOIN trainers cb ON cb.id = c.canceled_by
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

-- ── 장기 미출석 ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_long_absent(p_gym_id uuid, p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_today date := crm_today_kst();
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('member_id', id, 'name', name, 'last_visit', last_visit,
                                        'membership_end', ms_end, 'days', days) ORDER BY days DESC NULLS FIRST)
    FROM (
      SELECT m.id, m.name, ms.ms_end,
             GREATEST(ck.last_ck, ac.last_at) AS last_visit,
             v_today - GREATEST(ck.last_ck, ac.last_at) AS days
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
       WHERE (ms.ms_end IS NOT NULL OR COALESCE(m.total_sessions, 0) - COALESCE(m.done_sessions, 0) > 0)
         AND NOT EXISTS (SELECT 1 FROM member_holds h WHERE h.member_id = m.id AND h.start_date <= v_today AND h.end_date >= v_today)
    ) q
    WHERE last_visit IS NULL OR days >= p_days
  ), '[]'::jsonb);
END;
$$;

-- ── 직원 근태 조회 (권한자만) ───────────────────────────────────
CREATE OR REPLACE FUNCTION crm_staff_attendance(p_gym_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_today date := crm_today_kst();
BEGIN
  IF NOT crm_can_manage_attendance(p_gym_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'trainer_id', s.trainer_id, 'name', t.name,
        'clock_in', s.clock_in, 'clock_out', s.clock_out, 'source', s.source,
        'edited_by', e.name,
        'missing_out', s.clock_out IS NULL AND (s.clock_in AT TIME ZONE 'Asia/Seoul')::date < v_today
      ) ORDER BY s.clock_in DESC)
      FROM staff_attendance s
      JOIN trainers t ON t.id = s.trainer_id
      LEFT JOIN trainers e ON e.id = s.edited_by
      WHERE s.gym_id = p_gym_id AND (s.clock_in AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
    ), '[]'::jsonb),
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'trainer_id', t.id, 'name', t.name, 'has_phone', COALESCE(t.phone, '') <> '',
        'working', EXISTS (SELECT 1 FROM staff_attendance s WHERE s.trainer_id = t.id AND s.clock_out IS NULL
                             AND (s.clock_in AT TIME ZONE 'Asia/Seoul')::date = v_today),
        'minutes', COALESCE((SELECT SUM(floor(extract(epoch FROM s.clock_out - s.clock_in) / 60))::int FROM staff_attendance s
                              WHERE s.trainer_id = t.id AND s.clock_out IS NOT NULL
                                AND (s.clock_in AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to), 0),
        'days', (SELECT COUNT(DISTINCT (s.clock_in AT TIME ZONE 'Asia/Seoul')::date) FROM staff_attendance s
                  WHERE s.trainer_id = t.id AND (s.clock_in AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to)
      ) ORDER BY t.name)
      FROM trainers t
      WHERE t.gym_id = p_gym_id AND COALESCE(t.employment_status, 'active') = 'active'
    ), '[]'::jsonb)
  );
END;
$$;

-- ── 직원 근태 입력·수정 / 삭제 (권한자만) ─────────────────────────
CREATE OR REPLACE FUNCTION crm_staff_attendance_save(
  p_gym_id uuid, p_id uuid, p_trainer_id uuid, p_clock_in timestamptz, p_clock_out timestamptz
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me uuid; v_id uuid;
BEGIN
  IF NOT crm_can_manage_attendance(p_gym_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_me := crm_assert_gym_staff(p_gym_id);
  IF NOT EXISTS (SELECT 1 FROM trainers WHERE id = p_trainer_id AND gym_id = p_gym_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p_clock_in IS NULL OR (p_clock_out IS NOT NULL AND p_clock_out <= p_clock_in) THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO staff_attendance (gym_id, trainer_id, clock_in, clock_out, source, edited_by, edited_at)
    VALUES (p_gym_id, p_trainer_id, p_clock_in, p_clock_out, 'manual', v_me, now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE staff_attendance
       SET trainer_id = p_trainer_id, clock_in = p_clock_in, clock_out = p_clock_out, edited_by = v_me, edited_at = now()
     WHERE id = p_id AND gym_id = p_gym_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION crm_staff_attendance_delete(p_gym_id uuid, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT crm_can_manage_attendance(p_gym_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM staff_attendance WHERE id = p_id AND gym_id = p_gym_id;
END;
$$;

REVOKE ALL ON FUNCTION crm_can_manage_attendance(uuid)                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_kiosk_checkin(uuid, uuid, text)                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_kiosk_staff_punch(uuid, uuid)                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_cancel_checkin(uuid)                                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_attendance_day(uuid, date)                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_long_absent(uuid, integer)                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_staff_attendance(uuid, date, date)                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_staff_attendance_save(uuid, uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_staff_attendance_delete(uuid, uuid)                            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_can_manage_attendance(uuid)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION crm_kiosk_checkin(uuid, uuid, text)                                TO authenticated;
GRANT EXECUTE ON FUNCTION crm_kiosk_staff_punch(uuid, uuid)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION crm_cancel_checkin(uuid)                                           TO authenticated;
GRANT EXECUTE ON FUNCTION crm_attendance_day(uuid, date)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION crm_long_absent(uuid, integer)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION crm_staff_attendance(uuid, date, date)                             TO authenticated;
GRANT EXECUTE ON FUNCTION crm_staff_attendance_save(uuid, uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_staff_attendance_delete(uuid, uuid)                            TO authenticated;
