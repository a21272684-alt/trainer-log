-- 092_settlement_caller_guard.sql
-- 정산 함수 호출자 검사.
-- 기존: calculate_settlement / get_snapshot_preview 가 SECURITY DEFINER 인데 호출자 확인이 없고 anon 도 실행 가능
--       → 트레이너 id 만 알면 누구나(로그인 없이도) 남의 정산 조회·정산 초안 생성/덮어쓰기 가능.
-- 변경: 본인 또는 같은 센터의 대표·'정산 열람' 권한자만. anon 실행 차단.
--       (트레이너 앱 = 본인, CRM 트레이너 탭 = 대표·권한자)

CREATE OR REPLACE FUNCTION settlement_caller_ok(p_trainer_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trainers me
     WHERE me.auth_id = auth.uid()
       AND (me.id = p_trainer_id
            OR (me.gym_id IS NOT NULL
                AND me.gym_id = (SELECT gym_id FROM trainers WHERE id = p_trainer_id)
                AND (me.role = 'owner' OR COALESCE((me.crm_permissions->>'view_settlement')::boolean, false))))
  )
$$;
REVOKE ALL ON FUNCTION settlement_caller_ok(uuid) FROM PUBLIC, anon, authenticated;

-- calculate_settlement: 본문은 그대로 두고 맨 앞에 검사 한 줄 삽입 (DB 에만 있던 함수라 정의를 읽어 재생성)
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.calculate_settlement(uuid,integer,integer)'::regprocedure);
  IF position('settlement_caller_ok' IN d) = 0 THEN
    d := regexp_replace(d, E'\nbegin\n',
      E'\nbegin\n  if not settlement_caller_ok(p_trainer_id) then\n    raise exception ''PERMISSION_DENIED'' using errcode = ''insufficient_privilege'';\n  end if;\n');
    EXECUTE d;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_snapshot_preview(p_trainer_id uuid, p_year integer, p_month integer)
RETURNS TABLE(snapshot_type text, event_count bigint, base_amount_total bigint, incentive_amount_total bigint,
              avg_incentive_rate numeric, earliest_snap timestamp with time zone, latest_snap timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select
    snapshot_type,
    count(*)                                    as event_count,
    sum(base_amount)                            as base_amount_total,
    sum(incentive_amount)                       as incentive_amount_total,
    round(avg(trainer_incentive_rate), 4)       as avg_incentive_rate,
    min(snapped_at)                             as earliest_snap,
    max(snapped_at)                             as latest_snap
  from settlement_snapshots
  where trainer_id  = p_trainer_id
    and period_year  = p_year
    and period_month = p_month
    and settlement_caller_ok(p_trainer_id)
  group by snapshot_type
  order by snapshot_type;
$$;

REVOKE ALL ON FUNCTION calculate_settlement(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_snapshot_preview(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION calculate_settlement(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_snapshot_preview(uuid, integer, integer) TO authenticated;
