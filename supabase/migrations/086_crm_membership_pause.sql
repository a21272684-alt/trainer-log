-- 086_crm_membership_pause.sql
-- CRM "회원권 정지" — 정지 기간만큼 기간권 날짜를 자동으로 뒤로 미룸.
--
-- 규칙 (사용자 결정 2026-10-14):
--   - 정지 N일 → 정지 시작일 이후에도 유효한 활성 기간권을 N일 뒤로
--       · 진행 중(시작일 < 정지 시작일): 만료일만 +N
--       · 정지 시작일 이후 시작(대기 중): 시작일·만료일 모두 +N
--   - 횟수권(start/end_date 없음)은 날짜 영향 없음
--   - 횟수·일수 제한 없음 (최대 1회 366일만 안전장치)
--   - 기존 정지와 기간이 겹치면 거부
--   - 취소 시 저장해둔 이동 내역(shifts)대로 정확히 되돌림.
--     그 사이 해당 결제 날짜가 다른 이유로 바뀌었으면 되돌리지 않고 거부(수동 확인)
--   - 트레이너 앱의 정지는 기존대로 기록만(shifts = NULL). CRM 에서 취소 시 기록만 삭제.
--
-- 권한: 해당 회원의 담당 트레이너와 같은 센터 소속 트레이너(대표·직원). SECURITY DEFINER.

ALTER TABLE member_holds ADD COLUMN IF NOT EXISTS shifts jsonb;
COMMENT ON COLUMN member_holds.shifts IS
  'CRM 회원권 정지가 옮긴 결제 날짜 [{payment_id, name, old_start, old_end, new_start, new_end}]. NULL = 기록만(트레이너 앱)';

-- 호출자가 이 회원의 센터 소속인지 → 센터 id 반환
CREATE OR REPLACE FUNCTION crm_assert_member_gym(p_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_gym uuid;
BEGIN
  SELECT t.gym_id INTO v_gym
    FROM members m JOIN trainers t ON t.id = m.trainer_id
   WHERE m.id = p_member_id;
  IF v_gym IS NULL OR NOT EXISTS (
    SELECT 1 FROM trainers WHERE gym_id = v_gym AND auth_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION crm_assert_member_gym(uuid) FROM PUBLIC, anon, authenticated;

-- ── 목록 ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_member_pauses(p_member_id uuid)
RETURNS SETOF member_holds
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM crm_assert_member_gym(p_member_id);
  RETURN QUERY SELECT * FROM member_holds WHERE member_id = p_member_id ORDER BY start_date DESC;
END;
$$;

-- ── 등록 ──────────────────────────────────────────────────────
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

  -- 같은 회원 동시 처리 직렬화
  PERFORM 1 FROM members WHERE id = p_member_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM member_holds
              WHERE member_id = p_member_id
                AND start_date <= p_end AND end_date >= p_start) THEN
    RAISE EXCEPTION 'OVERLAP';
  END IF;

  FOR v_p IN
    SELECT id, product_name, start_date, end_date
      FROM payments
     WHERE member_id = p_member_id
       AND COALESCE(status, 'active') = 'active'
       AND start_date IS NOT NULL AND end_date IS NOT NULL
       AND end_date >= p_start
     ORDER BY start_date
     FOR UPDATE
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

-- ── 취소 ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_cancel_pause(p_hold_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_h        member_holds%ROWTYPE;
  v_s        jsonb;
  v_reverted integer := 0;
BEGIN
  SELECT * INTO v_h FROM member_holds WHERE id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM crm_assert_member_gym(v_h.member_id);

  IF v_h.shifts IS NOT NULL THEN
    -- 먼저 전부 검사: 하나라도 그 사이 바뀌었으면 아무것도 되돌리지 않음
    FOR v_s IN SELECT * FROM jsonb_array_elements(v_h.shifts) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM payments
         WHERE id = (v_s->>'payment_id')::uuid
           AND start_date = (v_s->>'new_start')::date
           AND end_date   = (v_s->>'new_end')::date
      ) THEN
        RAISE EXCEPTION 'CHANGED_SINCE: %', COALESCE(v_s->>'name', '회원권');
      END IF;
    END LOOP;

    FOR v_s IN SELECT * FROM jsonb_array_elements(v_h.shifts) LOOP
      UPDATE payments
         SET start_date = (v_s->>'old_start')::date,
             end_date   = (v_s->>'old_end')::date
       WHERE id = (v_s->>'payment_id')::uuid;
      v_reverted := v_reverted + 1;
    END LOOP;
  END IF;

  DELETE FROM member_holds WHERE id = p_hold_id;
  RETURN jsonb_build_object('reverted', v_reverted);
END;
$$;

REVOKE ALL ON FUNCTION crm_member_pauses(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_pause_membership(uuid, date, date, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_cancel_pause(uuid)                        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_member_pauses(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION crm_pause_membership(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_cancel_pause(uuid)                       TO authenticated;
