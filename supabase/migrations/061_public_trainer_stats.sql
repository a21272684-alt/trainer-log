-- 061_public_trainer_stats.sql
-- "오운 인증 데이터" — 공개 프로필의 신뢰 증명 집계 (차별점).
-- 설계: docs/trainer-public-profile-design.md (§6)
--
-- 원칙:
--   - anon 도 호출. 단 개인정보(회원 이름/기록) 절대 미반환 — 집계 카운트만.
--   - trainers/members/logs 는 050/051 RLS 로 anon 직접 SELECT 차단됨.
--     → SECURITY DEFINER 로 우회하되, 함수 내부에서 is_public + show_stats 게이트.
--   - 프로필이 비공개거나 show_stats=false 면 NULL 반환(미노출).
--
-- 반환(jsonb): { total_logs, total_members, active_months }  또는 NULL
--   total_logs    : 누적 수업일지 수 (logs)
--   total_members : 관리 회원 수 (members)
--   active_months : 첫 일지 이후 경과 개월 (활동 기간)

CREATE OR REPLACE FUNCTION get_public_trainer_stats(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer uuid;
  v_show    boolean;
  v_logs    integer;
  v_members integer;
  v_first   timestamp;
  v_months  integer;
BEGIN
  -- 공개 + 통계 표시 동의 확인
  SELECT trainer_id, show_stats INTO v_trainer, v_show
  FROM trainer_profiles
  WHERE handle = p_handle AND is_public = true;

  IF v_trainer IS NULL OR v_show IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_logs    FROM logs    WHERE trainer_id = v_trainer;
  SELECT count(*) INTO v_members FROM members WHERE trainer_id = v_trainer;
  SELECT min(created_at) INTO v_first FROM logs WHERE trainer_id = v_trainer;

  v_months := CASE
    WHEN v_first IS NULL THEN 0
    ELSE greatest(1, floor(extract(epoch FROM (now()::timestamp - v_first)) / 2592000)::int)
  END;

  RETURN jsonb_build_object(
    'total_logs',    v_logs,
    'total_members', v_members,
    'active_months', v_months
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_trainer_stats(text) TO anon, authenticated;
