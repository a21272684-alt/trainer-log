-- 096_schedule_requests.sql
-- 회원 수업 신청 → 트레이너 승인 (스케줄 자동화, 2026-11-02)
--
-- 흐름:
--   1) 트레이너가 "매주 수업 가능한 시간"(요일별 시간대)과 "잠금"(요청 못 하게 닫은 시간)을 저장
--      → trainer_booking_settings (트레이너 1행, 본인만 읽기/쓰기)
--   2) 회원은 get_open_slots 로 "빈 시간"만 받는다 (다른 회원 이름·일정은 절대 내려가지 않음)
--   3) 회원이 request_schedule 로 신청 (한 번 / 매주 N주) → schedule_requests + 트레이너 푸시 예약
--   4) 트레이너가 앱에서 승인 → 앱이 시간표(trainer_schedules.blocks)에 수업을 넣고
--      trainer_decide_request 로 상태 변경. (시간표 저장은 기존처럼 앱이 담당 — 덮어쓰기 충돌 방지)
--
-- 시간 표기: 'HH:MM' 문자열(기존 blocks 와 동일), 날짜·현재시각 기준은 Asia/Seoul.
-- 요일: ISO (1=월 … 7=일).

-- ─────────────────────────────────────────────
-- 1. 트레이너 예약 받기 설정
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trainer_booking_settings (
  trainer_id   uuid PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
  enabled      boolean NOT NULL DEFAULT false,
  slot_minutes integer NOT NULL DEFAULT 50 CHECK (slot_minutes BETWEEN 20 AND 180),
  -- {"1":[["10:00","12:00"],["14:00","21:00"]], "2":[...], ...}
  weekly       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  -- [{"id":"..","weekday":1|null,"date":"YYYY-MM-DD"|null,"start":"12:00","end":"13:00","label":"점심"}]
  locks        jsonb   NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trainer_booking_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tbs_owner_all" ON trainer_booking_settings;
CREATE POLICY "tbs_owner_all" ON trainer_booking_settings
  FOR ALL TO authenticated
  USING      (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- ─────────────────────────────────────────────
-- 2. 수업 신청
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  start_date  date NOT NULL,
  start_time  text NOT NULL CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time    text NOT NULL CHECK (end_time   ~ '^[0-2][0-9]:[0-5][0-9]$'),
  weeks       integer NOT NULL DEFAULT 1 CHECK (weeks BETWEEN 1 AND 12),
  note        text CHECK (note IS NULL OR char_length(note) <= 200),
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','approved','declined','cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sched_req_trainer ON schedule_requests (trainer_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_sched_req_member  ON schedule_requests (member_id, created_at DESC);

ALTER TABLE schedule_requests ENABLE ROW LEVEL SECURITY;

-- 트레이너: 자기 요청 읽기만 (상태 변경은 RPC). 회원: 직접 접근 없음(RPC 로만).
DROP POLICY IF EXISTS "sr_trainer_select" ON schedule_requests;
CREATE POLICY "sr_trainer_select" ON schedule_requests
  FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- ─────────────────────────────────────────────
-- 3. 내부 헬퍼
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _sched_add_min(p_time text, p_min integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(('2000-01-01 ' || p_time)::timestamp + make_interval(mins => p_min), 'HH24:MI')
$$;

-- 해당 날짜·시간대가 비어 있는지 (시간표 수업/일정, 잠금, 대기·승인된 신청과 겹치면 false)
CREATE OR REPLACE FUNCTION _sched_slot_free(
  p_trainer uuid, p_date date, p_start text, p_end text, p_exclude uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocks jsonb;
  v_locks  jsonb;
BEGIN
  SELECT blocks INTO v_blocks FROM trainer_schedules WHERE trainer_id = p_trainer;
  IF v_blocks IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_blocks) b
    WHERE b->>'date' = to_char(p_date, 'YYYY-MM-DD')
      AND COALESCE((b->>'cancelled')::boolean, false) = false
      AND (b->>'start') < p_end AND (b->>'end') > p_start
  ) THEN RETURN false; END IF;

  SELECT locks INTO v_locks FROM trainer_booking_settings WHERE trainer_id = p_trainer;
  IF v_locks IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_locks) l
    WHERE ( (l->>'date') = to_char(p_date, 'YYYY-MM-DD')
         OR ((l->>'date') IS NULL AND (l->>'weekday')::int = extract(isodow FROM p_date)::int) )
      AND (l->>'start') < p_end AND (l->>'end') > p_start
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM schedule_requests r, generate_series(0, r.weeks - 1) k
    WHERE r.trainer_id = p_trainer
      -- 승인된 신청은 시간표 저장(앱 자동 저장)이 반영될 때까지만 잠깐 막는다.
      -- 이후엔 시간표 블록이 기준 → 트레이너가 수업을 지우면 다시 열린다.
      AND (r.status = 'pending' OR (r.status = 'approved' AND r.decided_at > now() - interval '10 minutes'))
      AND (p_exclude IS NULL OR r.id <> p_exclude)
      AND r.start_date + (k * 7) = p_date
      AND r.start_time < p_end AND r.end_time > p_start
  ) THEN RETURN false; END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION _sched_slot_free(uuid, date, text, text, uuid) FROM PUBLIC;

-- 로그인한 회원 행
CREATE OR REPLACE FUNCTION _sched_me()
RETURNS members LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v FROM members WHERE auth_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'member not found'; END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION _sched_me() FROM PUBLIC;

-- ─────────────────────────────────────────────
-- 4. 회원용 RPC
-- ─────────────────────────────────────────────
-- 예약 받기 여부·트레이너 이름·남은 횟수
CREATE OR REPLACE FUNCTION get_booking_info()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m members%ROWTYPE := _sched_me();
  s trainer_booking_settings%ROWTYPE;
  v_name text;
BEGIN
  SELECT * INTO s FROM trainer_booking_settings WHERE trainer_id = m.trainer_id;
  SELECT name INTO v_name FROM trainers WHERE id = m.trainer_id;
  RETURN jsonb_build_object(
    'enabled',      COALESCE(s.enabled, false),
    'slot_minutes', COALESCE(s.slot_minutes, 50),
    'trainer_name', v_name,
    'remaining',    GREATEST(0, COALESCE(m.total_sessions, 0) - COALESCE(m.done_sessions, 0))
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_booking_info() TO authenticated;

-- 한 주(월요일 시작)의 빈 시간 목록 — 이름·일정 내용 없이 시간만
CREATE OR REPLACE FUNCTION get_open_slots(p_week_start date)
RETURNS TABLE (slot_date date, start_time text, end_time text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m      members%ROWTYPE := _sched_me();
  s      trainer_booking_settings%ROWTYPE;
  v_now  timestamp := (now() AT TIME ZONE 'Asia/Seoul');
  d      integer;
  v_date date;
  rng    jsonb;
  v_t    text;
  v_e    text;
BEGIN
  SELECT * INTO s FROM trainer_booking_settings WHERE trainer_id = m.trainer_id;
  IF NOT FOUND OR NOT s.enabled THEN RETURN; END IF;

  FOR d IN 0..6 LOOP
    v_date := p_week_start + d;
    IF v_date > (v_now::date + 60) THEN CONTINUE; END IF;   -- 두 달 이후는 안 보여줌
    FOR rng IN SELECT * FROM jsonb_array_elements(COALESCE(s.weekly -> extract(isodow FROM v_date)::int::text, '[]'::jsonb)) LOOP
      v_t := rng->>0;
      LOOP
        v_e := _sched_add_min(v_t, s.slot_minutes);
        EXIT WHEN v_e > (rng->>1) OR v_e <= v_t;            -- 범위 끝 / 자정 넘김 방지
        IF (v_date + v_t::time) > v_now
           AND _sched_slot_free(m.trainer_id, v_date, v_t, v_e) THEN
          slot_date := v_date; start_time := v_t; end_time := v_e;
          RETURN NEXT;
        END IF;
        v_t := v_e;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION get_open_slots(date) TO authenticated;

-- 신청 (한 번 = weeks 1, 매주 = weeks N)
CREATE OR REPLACE FUNCTION request_schedule(
  p_date date, p_start text, p_weeks integer DEFAULT 1, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m       members%ROWTYPE := _sched_me();
  s       trainer_booking_settings%ROWTYPE;
  v_end   text;
  v_ok    boolean := false;
  rng     jsonb;
  v_rem   integer := GREATEST(0, COALESCE(m.total_sessions,0) - COALESCE(m.done_sessions,0));
  v_id    uuid;
  v_label text;
  k       integer;
BEGIN
  SELECT * INTO s FROM trainer_booking_settings WHERE trainer_id = m.trainer_id;
  IF NOT FOUND OR NOT s.enabled THEN RAISE EXCEPTION '트레이너가 지금은 신청을 받지 않아요'; END IF;
  IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 12 THEN RAISE EXCEPTION '신청 기간을 확인해 주세요'; END IF;
  IF p_weeks > v_rem THEN RAISE EXCEPTION '남은 수업 횟수(%회)보다 많이 신청할 수 없어요', v_rem; END IF;
  IF (p_date + p_start::time) <= (now() AT TIME ZONE 'Asia/Seoul') THEN RAISE EXCEPTION '지난 시간은 신청할 수 없어요'; END IF;
  IF (SELECT count(*) FROM schedule_requests WHERE member_id = m.id AND status = 'pending') >= 5 THEN
    RAISE EXCEPTION '승인 대기 중인 신청이 많아요. 트레이너 확인 후 다시 신청해 주세요';
  END IF;

  v_end := _sched_add_min(p_start, s.slot_minutes);
  -- 열린 시간 범위 안인지
  FOR rng IN SELECT * FROM jsonb_array_elements(COALESCE(s.weekly -> extract(isodow FROM p_date)::int::text, '[]'::jsonb)) LOOP
    IF p_start >= (rng->>0) AND v_end <= (rng->>1) THEN v_ok := true; END IF;
  END LOOP;
  IF NOT v_ok THEN RAISE EXCEPTION '열려 있지 않은 시간이에요'; END IF;
  IF NOT _sched_slot_free(m.trainer_id, p_date, p_start, v_end) THEN
    RAISE EXCEPTION '방금 다른 일정이 생겼어요. 다른 시간을 골라 주세요';
  END IF;
  -- 매주 반복이면 이후 주차도 모두 비어 있어야 함
  FOR k IN 1..p_weeks - 1 LOOP
    IF NOT _sched_slot_free(m.trainer_id, p_date + k * 7, p_start, v_end) THEN
      RAISE EXCEPTION '%은 이미 일정이 있어요. 반복 횟수를 줄이거나 다른 시간을 골라 주세요', to_char(p_date + k * 7, 'FMMM/FMDD');
    END IF;
  END LOOP;

  INSERT INTO schedule_requests (trainer_id, member_id, start_date, start_time, end_time, weeks, note)
  VALUES (m.trainer_id, m.id, p_date, p_start, v_end, p_weeks, NULLIF(trim(COALESCE(p_note,'')), ''))
  RETURNING id INTO v_id;

  -- 트레이너 푸시 (send-push 크론이 1분 안에 발송. 구독 없으면 그냥 남음)
  v_label := CASE WHEN p_weeks > 1
    THEN '매주 ' || (ARRAY['월','화','수','목','금','토','일'])[extract(isodow FROM p_date)::int] || ' ' || p_start || ' · ' || p_weeks || '회'
    ELSE to_char(p_date, 'FMMM/FMDD') || ' ' || p_start END;
  INSERT INTO scheduled_notifications (trainer_id, block_id, scheduled_at, title, body)
  VALUES (m.trainer_id, 'req_' || v_id::text, now(), '오운 · 수업 신청', COALESCE(m.name,'회원') || ' 님이 ' || v_label || ' 수업을 신청했어요');

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION request_schedule(date, text, integer, text) TO authenticated;

-- 내 신청 목록 (최근 60일)
CREATE OR REPLACE FUNCTION my_schedule_requests()
RETURNS SETOF schedule_requests
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m members%ROWTYPE := _sched_me();
BEGIN
  RETURN QUERY
    SELECT * FROM schedule_requests
    WHERE member_id = m.id AND created_at > now() - interval '60 days'
    ORDER BY created_at DESC LIMIT 30;
END;
$$;
GRANT EXECUTE ON FUNCTION my_schedule_requests() TO authenticated;

-- 대기 중 신청 취소 (회원)
CREATE OR REPLACE FUNCTION cancel_schedule_request(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m members%ROWTYPE := _sched_me();
BEGIN
  UPDATE schedule_requests SET status = 'cancelled', decided_at = now()
   WHERE id = p_id AND member_id = m.id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION '취소할 수 없는 신청이에요'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_schedule_request(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- 5. 트레이너용 RPC — 승인/거절 (시간표 반영은 앱이 같이 처리)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trainer_decide_request(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('approved','declined') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE schedule_requests SET status = p_status, decided_at = now()
   WHERE id = p_id AND status = 'pending'
     AND trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION '처리할 수 없는 신청이에요 (이미 처리됐거나 취소됨)'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION trainer_decide_request(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- 6. 실행 권한 정리 — Supabase 는 함수 생성 시 PUBLIC/anon/authenticated 에 실행 권한이 붙음
--    내부 헬퍼는 SECURITY DEFINER RPC 안에서만, 공개 RPC 는 로그인 사용자만.
-- ─────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION _sched_slot_free(uuid, date, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION _sched_me() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_booking_info(), get_open_slots(date), request_schedule(date, text, integer, text),
  my_schedule_requests(), cancel_schedule_request(uuid), trainer_decide_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_booking_info(), get_open_slots(date), request_schedule(date, text, integer, text),
  my_schedule_requests(), cancel_schedule_request(uuid), trainer_decide_request(uuid, text) TO authenticated;
