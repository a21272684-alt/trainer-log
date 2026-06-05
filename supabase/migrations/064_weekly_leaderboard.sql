-- 064_weekly_leaderboard.sql
-- 주간 일지 발송 리더보드 복구 + opt-in 실명.
--
-- 배경:
--   리더보드는 원래 "앱 전체 트레이너의 주간 발송량"을 보여주는 기능이었으나,
--   (1) 이후 작업에서 gym_id 격리가 끼어들었고
--   (2) 050/051 strict RLS 로 trainers/logs 가 본인 자원만 SELECT 가능해지면서
--   트레이너 앱에서 "본인 1명"만 노출되는 버그 발생. (admin 은 우회라 정상)
--
-- 해결:
--   - gym 격리 제거 → 전체 대상.
--   - 이름 노출은 "리더보드 공개 동의(opt-in)" 한 트레이너만 → 익명('트레이너 A')
--     처리 시 조작 의심을 주는 문제 회피, 전원 실명이라 신뢰 유지.
--   - SECURITY DEFINER RPC 로 집계만 반환 (원시 logs/회원 데이터 비노출).
--     호출자는 트레이너여야 함. 전체 발송/열람 총계는 익명 집계로 전체 포함.

-- 1. 리더보드 공개 동의 컬럼 (트레이너 본인 self-update RLS 로 토글, 050)
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT false;

-- 2. 집계 RPC
CREATE OR REPLACE FUNCTION get_weekly_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      uuid;
  v_monday  timestamptz;
  v_list    jsonb;
  v_total_logs int;
  v_total_read int;
  v_self_opt boolean;
BEGIN
  SELECT id, coalesce(leaderboard_opt_in, false) INTO v_me, v_self_opt
  FROM trainers WHERE auth_id = auth.uid();
  IF v_me IS NULL THEN RETURN NULL; END IF;  -- 트레이너만 호출 가능

  v_monday := date_trunc('week', now());  -- 이번 주 월요일 0시 (ISO)

  -- 이름 명단: opt-in 한 트레이너 + 본인(동의 안 해도 본인 카운트는 봄)
  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'log_count')::int DESC), '[]'::jsonb)
  INTO v_list
  FROM (
    SELECT jsonb_build_object(
      'trainer_id', t.id,
      'name',       t.name,
      'log_count',  coalesce(l.cnt, 0),
      'read_count', coalesce(l.rd, 0),
      'is_me',      (t.id = v_me)
    ) AS r
    FROM trainers t
    LEFT JOIN (
      SELECT trainer_id, count(*) AS cnt, count(read_at) AS rd
      FROM logs WHERE created_at >= v_monday
      GROUP BY trainer_id
    ) l ON l.trainer_id = t.id
    WHERE t.leaderboard_opt_in = true OR t.id = v_me
  ) sub;

  -- 전체 총계 (익명 집계 — 이름 없이 전체 발송/열람량)
  SELECT count(*), count(read_at) INTO v_total_logs, v_total_read
  FROM logs WHERE created_at >= v_monday;

  RETURN jsonb_build_object(
    'list',          v_list,
    'total_logs',    v_total_logs,
    'total_read',    v_total_read,
    'self_opted_in', v_self_opt
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_weekly_leaderboard() TO authenticated;
