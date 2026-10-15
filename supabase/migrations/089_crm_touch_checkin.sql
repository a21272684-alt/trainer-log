-- 089_crm_touch_checkin.sql
-- CRM 태블릿 터치 출석 (센터 입장).
--
-- 규칙 (사용자 결정 2026-10-15):
--   - 전화번호 뒤 4자리 → 같은 번호 여러 명이면 이름(가운데 가림) 선택
--   - 입장 가능 = 오늘 유효한 기간권(대여권 제외) 또는 PT 잔여 회차 > 0
--   - 만료 회원: 입장 막고 안내, 거부 기록은 남김(직원 확인용)
--   - 정지 중 회원: "정지 풀고 이용" 누르면 정지를 어제까지로 단축(실제 쉰 일수만 정지로 남김)하고
--     회원권 연장분도 그만큼 줄인 뒤 입장. 정지 시작 당일이면 정지 자체를 취소(원래 날짜로 복구)
--   - 출석 화면 나가기 = 직원 PIN 4자리 (대표가 설정, bcrypt 해시 저장)
--   - PT 출석(attendance, 회원당 하루 1건·회차 차감)과 섞지 않도록 별도 테이블 gym_checkins 사용
--   - 자동문 제어는 추후 연결 (door_opened 컬럼만 마련)
--
-- 태블릿은 직원 계정으로 로그인한 CRM 에서 동작 → 모든 RPC 는 센터 소속 직원만 호출 가능.

CREATE TABLE IF NOT EXISTS gym_checkins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  result      text NOT NULL CHECK (result IN ('ok', 'rejected_expired')),
  note        text,
  door_opened boolean      -- 자동문 연동 시 사용 (현재 NULL)
);
CREATE INDEX IF NOT EXISTS gym_checkins_gym_time_idx   ON gym_checkins(gym_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS gym_checkins_member_time_idx ON gym_checkins(member_id, checked_at DESC);

ALTER TABLE gym_checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gym_checkins_gym_select" ON gym_checkins;
CREATE POLICY "gym_checkins_gym_select" ON gym_checkins FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM trainers WHERE auth_id = auth.uid()));

ALTER TABLE gyms ADD COLUMN IF NOT EXISTS kiosk_pin_hash text;

-- 한국 날짜
CREATE OR REPLACE FUNCTION crm_today_kst() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Seoul')::date $$;

-- 이름 가운데 가림: 홍길동 → 홍*동, 김수 → 김*, 남궁민수 → 남**수
CREATE OR REPLACE FUNCTION crm_mask_name(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_name IS NULL OR char_length(p_name) <= 1 THEN p_name
    WHEN char_length(p_name) = 2 THEN left(p_name, 1) || '*'
    ELSE left(p_name, 1) || repeat('*', char_length(p_name) - 2) || right(p_name, 1)
  END
$$;

-- ── PIN ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_set_kiosk_pin(p_gym_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trainers WHERE gym_id = p_gym_id AND auth_id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;
  UPDATE gyms SET kiosk_pin_hash = crypt(p_pin, gen_salt('bf')) WHERE id = p_gym_id;
END;
$$;

CREATE OR REPLACE FUNCTION crm_kiosk_has_pin(p_gym_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN (SELECT kiosk_pin_hash IS NOT NULL FROM gyms WHERE id = p_gym_id);
END;
$$;

CREATE OR REPLACE FUNCTION crm_verify_kiosk_pin(p_gym_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_hash text;
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  SELECT kiosk_pin_hash INTO v_hash FROM gyms WHERE id = p_gym_id;
  RETURN v_hash IS NOT NULL AND p_pin ~ '^[0-9]{4}$' AND crypt(p_pin, v_hash) = v_hash;
END;
$$;

-- ── 번호 조회: 뒤 4자리 → 후보 ───────────────────────────────────
CREATE OR REPLACE FUNCTION crm_kiosk_lookup(p_gym_id uuid, p_last4 text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  IF p_last4 IS NULL OR p_last4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'masked_name', crm_mask_name(m.name)) ORDER BY m.name)
    FROM members m JOIN trainers t ON t.id = m.trainer_id
    WHERE t.gym_id = p_gym_id
      AND right(regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g'), 4) = p_last4
  ), '[]'::jsonb);
END;
$$;

-- ── 입장 처리 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_kiosk_checkin(p_gym_id uuid, p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today   date := crm_today_kst();
  v_m       members%ROWTYPE;
  v_hold    member_holds%ROWTYPE;
  v_ms      record;           -- 오늘 유효 회원권
  v_last    record;           -- 마지막 회원권 (만료 안내용)
  v_pt      integer;
  v_trainer text;
  v_locker  record;
  v_prev    timestamptz;
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  SELECT m.* INTO v_m FROM members m JOIN trainers t ON t.id = m.trainer_id
   WHERE m.id = p_member_id AND t.gym_id = p_gym_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- 정지 중
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
    INSERT INTO gym_checkins (gym_id, member_id, result) VALUES (p_gym_id, p_member_id, 'rejected_expired');
    RETURN jsonb_build_object('status', 'expired', 'name', v_m.name,
      'last', CASE WHEN v_last IS NULL THEN NULL ELSE jsonb_build_object('product_name', v_last.product_name, 'end_date', v_last.end_date) END);
  END IF;

  SELECT name INTO v_trainer FROM trainers WHERE id = v_m.trainer_id;
  SELECT l.number, a.end_date INTO v_locker
    FROM locker_assignments a JOIN lockers l ON l.id = a.locker_id
   WHERE a.member_id = p_member_id AND a.returned_at IS NULL
   ORDER BY a.end_date DESC LIMIT 1;

  -- 오늘 이미 입장했으면 기록 중복 없이 안내
  SELECT checked_at INTO v_prev FROM gym_checkins
   WHERE member_id = p_member_id AND result = 'ok'
     AND (checked_at AT TIME ZONE 'Asia/Seoul')::date = v_today
   ORDER BY checked_at LIMIT 1;
  IF v_prev IS NULL THEN
    INSERT INTO gym_checkins (gym_id, member_id, result) VALUES (p_gym_id, p_member_id, 'ok');
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

-- ── 정지 조기 종료 후 입장 ─────────────────────────────────────
-- 정지를 어제까지로 단축. 정지 시작 당일이면 정지 자체를 취소(원래 날짜 복구).
-- 연장했던 회원권 날짜는 줄어든 일수만큼 되돌림 (그 사이 따로 바뀐 결제가 있으면 거부).
CREATE OR REPLACE FUNCTION crm_kiosk_end_pause(p_gym_id uuid, p_hold_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today   date := crm_today_kst();
  v_h       member_holds%ROWTYPE;
  v_new_end date;
  v_reduce  integer;
  v_s       jsonb;
  v_new     jsonb := '[]'::jsonb;
  v_ns      date;
  v_ne      date;
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  SELECT * INTO v_h FROM member_holds WHERE id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF crm_assert_member_gym(v_h.member_id) <> p_gym_id THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF NOT (v_h.start_date <= v_today AND v_h.end_date >= v_today) THEN RAISE EXCEPTION 'NOT_PAUSED_NOW'; END IF;

  v_new_end := v_today - 1;
  v_reduce  := v_h.end_date - v_new_end;     -- 줄어드는 정지 일수

  IF v_h.shifts IS NOT NULL THEN
    -- 그 사이 바뀐 결제가 있으면 손대지 않음
    FOR v_s IN SELECT * FROM jsonb_array_elements(v_h.shifts) LOOP
      IF NOT EXISTS (SELECT 1 FROM payments WHERE id = (v_s->>'payment_id')::uuid
                       AND start_date = (v_s->>'new_start')::date AND end_date = (v_s->>'new_end')::date) THEN
        RAISE EXCEPTION 'CHANGED_SINCE: %', COALESCE(v_s->>'name', '회원권');
      END IF;
    END LOOP;
    FOR v_s IN SELECT * FROM jsonb_array_elements(v_h.shifts) LOOP
      v_ne := (v_s->>'new_end')::date - v_reduce;
      v_ns := CASE WHEN (v_s->>'new_start') <> (v_s->>'old_start')
                   THEN (v_s->>'new_start')::date - v_reduce ELSE (v_s->>'new_start')::date END;
      UPDATE payments SET start_date = v_ns, end_date = v_ne WHERE id = (v_s->>'payment_id')::uuid;
      v_new := v_new || (v_s || jsonb_build_object('new_start', v_ns, 'new_end', v_ne));
    END LOOP;
  END IF;

  IF v_new_end < v_h.start_date THEN
    DELETE FROM member_holds WHERE id = p_hold_id;          -- 시작 당일 → 정지 취소
  ELSE
    UPDATE member_holds
       SET end_date = v_new_end,
           shifts   = CASE WHEN shifts IS NULL THEN NULL ELSE v_new END,
           reason   = concat_ws(' · ', NULLIF(reason, ''), '출석으로 조기 종료')
     WHERE id = p_hold_id;
  END IF;

  RETURN crm_kiosk_checkin(p_gym_id, v_h.member_id) || jsonb_build_object('pause_ended', true, 'paused_days', GREATEST(0, v_new_end - v_h.start_date + 1));
END;
$$;

-- ── 오늘 입장 기록 (직원 확인용) ──────────────────────────────
CREATE OR REPLACE FUNCTION crm_today_checkins(p_gym_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('at', c.checked_at, 'name', m.name, 'result', c.result) ORDER BY c.checked_at DESC)
    FROM gym_checkins c JOIN members m ON m.id = c.member_id
    WHERE c.gym_id = p_gym_id AND (c.checked_at AT TIME ZONE 'Asia/Seoul')::date = crm_today_kst()
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION crm_set_kiosk_pin(uuid, text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_kiosk_has_pin(uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_verify_kiosk_pin(uuid, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_kiosk_lookup(uuid, text)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_kiosk_checkin(uuid, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_kiosk_end_pause(uuid, uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_today_checkins(uuid)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_set_kiosk_pin(uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION crm_kiosk_has_pin(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION crm_verify_kiosk_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_kiosk_lookup(uuid, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION crm_kiosk_checkin(uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION crm_kiosk_end_pause(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION crm_today_checkins(uuid)         TO authenticated;
