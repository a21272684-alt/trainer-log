-- 093_ops_snapshot.sql
-- AI 운영 직원(Claude 예약 작업)용 읽기 전용 운영 지표 RPC.
--
-- 배경:
--   ownapp-ops 폴더의 예약 작업(아침 브리핑·주간 운영 리포트)이 매일 운영 지표를 읽어야 함.
--   기존 admin 토큰(_admin_assert)은 admin_add_credits·admin_set_trainer_plan 같은 쓰기 RPC 도
--   통과하는 열쇠라, 사람 없이 도는 작업에 주기엔 범위가 너무 넓음.
--
-- 해결:
--   집계 숫자만 돌려주는 ops_snapshot(p_token) 1개 + 전용 토큰 가드 _ops_assert.
--   이름·연락처·이메일·일지 본문 같은 개인정보는 반환하지 않음. 쓰기 없음.
--
-- ⚠️ 적용 전 필수 작업:
--   본 파일의 '<<OPS_TOKEN_SHA256>>' 1군데를 실제 토큰의 sha256 hex(소문자 64자)로 치환한
--   사본을 SQL Editor 에 붙여넣을 것. 토큰 원문은 ownapp-ops/.env 의 OPS_TOKEN 에만 둔다
--   (저장소·DB 어디에도 원문 없음).
--
-- 토큰 회전: 새 토큰 발급 → _ops_assert 본문의 해시 교체 + ownapp-ops/.env 갱신.
--
-- 시간 기준: 한국 날짜(Asia/Seoul). trainers/members/logs/payments/health_records 의
--   created_at 은 timestamp(UTC 벽시계) 라 경계값을 AT TIME ZONE 'UTC' 로 맞춰 비교.
--
-- 파일 구조:
--   1. _ops_assert  — 토큰 해시 비교 가드 (내부용)
--   2. _ops_window  — 기간 [p_from, p_to) 집계 (내부용)
--   3. ops_snapshot — 어제 / 최근 7일 / 그 전 7일 / 14일 일별 / 누적 / 대기열 / 구독 / Storage
--      (AI 사용량은 제외: ai_usage 는 079 이후 기록되지 않는 테이블이라 항상 0)


-- ============================================================
-- 1. _ops_assert — 운영 지표 전용 토큰 가드
-- ============================================================
CREATE OR REPLACE FUNCTION _ops_assert(p_token text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL
     OR encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> '<<OPS_TOKEN_SHA256>>' THEN
    RAISE EXCEPTION 'ops: unauthorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ops_snapshot(SECURITY DEFINER) 안에서만 호출 → 외부 직접 실행 차단
REVOKE ALL ON FUNCTION _ops_assert(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION _ops_assert(text) IS
  'ops_snapshot 전용 토큰 가드. 토큰 원문 대신 sha256 해시 비교. 회전 시 본문 해시 교체.';


-- ============================================================
-- 2. _ops_window — 기간 [p_from, p_to) 집계 (내부용)
-- ============================================================
CREATE OR REPLACE FUNCTION _ops_window(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH b AS (
    -- timestamp(UTC 벽시계) 컬럼 비교용 경계값
    SELECT p_from AT TIME ZONE 'UTC' AS f, p_to AT TIME ZONE 'UTC' AS t
  )
  SELECT jsonb_build_object(
    'new_trainers',        (SELECT count(*) FROM trainers, b WHERE created_at >= b.f AND created_at < b.t),
    'new_members',         (SELECT count(*) FROM members,  b WHERE created_at >= b.f AND created_at < b.t),
    'logs_sent',           (SELECT count(*) FROM logs,     b WHERE created_at >= b.f AND created_at < b.t),
    'logs_read',           (SELECT count(*) FROM logs,     b WHERE created_at >= b.f AND created_at < b.t
                                                             AND read_at IS NOT NULL),
    'active_trainers',     (SELECT count(DISTINCT trainer_id) FROM logs, b
                             WHERE created_at >= b.f AND created_at < b.t),
    -- 회원 앱을 실제로 쓴 회원: 일지 열람 · 식단 기록 · 개인운동 기록 · 체중/건강 기록 중 하나라도
    'app_active_members',  (SELECT count(DISTINCT a.member_id) FROM (
                               SELECT member_id FROM logs
                                WHERE read_at >= p_from AND read_at < p_to
                               UNION
                               SELECT member_id FROM diet_logs
                                WHERE created_at >= p_from AND created_at < p_to
                               UNION
                               SELECT member_id FROM workout_sessions
                                WHERE source = 'member' AND created_at >= p_from AND created_at < p_to
                               UNION
                               SELECT h.member_id FROM health_records h, b
                                WHERE h.created_at >= b.f AND h.created_at < b.t
                             ) a),
    'member_workouts',     (SELECT count(*) FROM workout_sessions
                             WHERE source = 'member' AND created_at >= p_from AND created_at < p_to),
    'diet_logs',           (SELECT count(*) FROM diet_logs WHERE created_at >= p_from AND created_at < p_to),
    'payments_registered', (SELECT count(*) FROM payments, b WHERE created_at >= b.f AND created_at < b.t),
    'signup_requests',     (SELECT count(*) FROM trainer_signup_requests
                             WHERE requested_at >= p_from AND requested_at < p_to),
    'new_gyms',            (SELECT count(*) FROM gyms WHERE created_at >= p_from AND created_at < p_to),
    'checkins',            (SELECT count(*) FROM gym_checkins
                             WHERE checked_at >= p_from AND checked_at < p_to AND result = 'ok')
  );
$$;

REVOKE ALL ON FUNCTION _ops_window(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 3. ops_snapshot — 집계 숫자만 반환 (읽기 전용)
-- ============================================================
CREATE OR REPLACE FUNCTION ops_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date        := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_d0    timestamptz := v_today::timestamp        AT TIME ZONE 'Asia/Seoul';  -- 오늘 00:00 KST
  v_d1    timestamptz := (v_today - 1)::timestamp  AT TIME ZONE 'Asia/Seoul';  -- 어제 00:00
  v_d7    timestamptz := (v_today - 7)::timestamp  AT TIME ZONE 'Asia/Seoul';
  v_d14   timestamptz := (v_today - 14)::timestamp AT TIME ZONE 'Asia/Seoul';
BEGIN
  PERFORM _ops_assert(p_token);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'kst_today',    v_today,
    'yesterday',    _ops_window(v_d1,  v_d0),
    'last7',        _ops_window(v_d7,  v_d0),
    'prev7',        _ops_window(v_d14, v_d7),
    'daily_14d', (
      SELECT jsonb_agg(
               jsonb_build_object('date', g.d)
               || _ops_window(g.d::timestamp AT TIME ZONE 'Asia/Seoul',
                              (g.d + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
               ORDER BY g.d)
      FROM (SELECT generate_series((v_today - 14)::timestamp, (v_today - 1)::timestamp,
                                   interval '1 day')::date AS d) g
    ),
    'totals', jsonb_build_object(
      'trainers',           (SELECT count(*) FROM trainers),
      'members',            (SELECT count(*) FROM members),
      'members_app_linked', (SELECT count(*) FROM members WHERE auth_id IS NOT NULL),
      'logs',               (SELECT count(*) FROM logs)
    ),
    'queues', jsonb_build_object(
      'signup_requests_pending',   (SELECT count(*) FROM trainer_signup_requests WHERE status = 'pending'),
      'trainers_pending_approval', (SELECT count(*) FROM trainers WHERE approval_status = 'pending'),
      'community_reports_open',    (SELECT count(*) FROM community_reports WHERE resolved_at IS NULL)
    ),
    'subscriptions_active', COALESCE((
      SELECT jsonb_object_agg(s.plan, s.n)
      FROM (SELECT plan, count(DISTINCT trainer_id) AS n
              FROM subscriptions
             WHERE valid_until >= v_today
             GROUP BY plan) s
    ), '{}'::jsonb),
    'storage', (
      SELECT jsonb_build_object(
               'total_bytes', COALESCE(sum(x.bytes), 0),
               'buckets', COALESCE(jsonb_agg(jsonb_build_object(
                            'bucket', x.bucket_id, 'files', x.files, 'bytes', x.bytes)
                          ORDER BY x.bytes DESC), '[]'::jsonb))
      FROM (SELECT bucket_id, count(*) AS files,
                   COALESCE(sum((metadata->>'size')::bigint), 0) AS bytes
              FROM storage.objects
             GROUP BY bucket_id) x
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION ops_snapshot(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION ops_snapshot(text) TO anon;

COMMENT ON FUNCTION ops_snapshot(text) IS
  'AI 운영 직원(ownapp-ops)용 읽기 전용 운영 지표. 집계 숫자만 반환(개인정보 없음). 토큰 = ownapp-ops/.env 의 OPS_TOKEN.';
