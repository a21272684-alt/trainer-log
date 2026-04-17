-- 023_fix_weekly_stats.sql
-- get_gym_weekly_stats 함수에서 존재하지 않는 p.cancelled 컬럼 참조 제거
-- payments 테이블에는 cancelled 컬럼이 없으므로 해당 조건을 제거

create or replace function get_gym_weekly_stats(
  p_gym_id    uuid,
  p_week_start date
)
returns jsonb
language plpgsql stable security definer as $$
declare
  v_week_end      date := p_week_start + 6;
  v_prev_start    date := p_week_start - 7;
  v_prev_end      date := p_week_start - 1;

  v_gym_name      text;
  v_trainer_cnt   int;

  v_attend_total  int;
  v_attend_prev   int;

  v_member_total  int;
  v_member_new    int;
  v_member_expiring int;
  v_member_expired  int;
  v_member_risk     int;

  v_sessions_done int;
  v_sessions_prev int;

  v_revenue_week  numeric;
  v_revenue_prev  numeric;

  v_trainers_json jsonb;
  v_risk_json     jsonb;
  v_expiring_json jsonb;
begin

  select name into v_gym_name from gyms where id = p_gym_id;

  select count(*) into v_trainer_cnt from trainers where gym_id = p_gym_id;

  -- 출석 통계
  select count(*) into v_attend_total
  from attendance a
  join members m on m.id = a.member_id
  where m.gym_id = p_gym_id
    and a.attended_date between p_week_start and v_week_end;

  select count(*) into v_attend_prev
  from attendance a
  join members m on m.id = a.member_id
  where m.gym_id = p_gym_id
    and a.attended_date between v_prev_start and v_prev_end;

  -- 회원 통계
  select count(*) into v_member_total
  from members where gym_id = p_gym_id and (suspended is null or suspended = false);

  select count(*) into v_member_new
  from members where gym_id = p_gym_id
    and created_at::date between p_week_start and v_week_end;

  select count(*) into v_member_expiring
  from members
  where gym_id = p_gym_id
    and (suspended is null or suspended = false)
    and (total_sessions - done_sessions) between 1 and 3;

  select count(*) into v_member_expired
  from members
  where gym_id = p_gym_id
    and (suspended is null or suspended = false)
    and (total_sessions - done_sessions) <= 0;

  select count(*) into v_member_risk
  from members m
  join member_risk_scores r on r.member_id = m.id
  where m.gym_id = p_gym_id
    and r.risk_score >= 50
    and (m.suspended is null or m.suspended = false);

  -- 수업(로그) 통계
  select count(*) into v_sessions_done
  from logs l
  join members m on m.id = l.member_id
  where m.gym_id = p_gym_id
    and l.created_at::date between p_week_start and v_week_end;

  select count(*) into v_sessions_prev
  from logs l
  join members m on m.id = l.member_id
  where m.gym_id = p_gym_id
    and l.created_at::date between v_prev_start and v_prev_end;

  -- 매출 통계 (cancelled 컬럼 제거 — payments 테이블에 해당 컬럼 없음)
  select coalesce(sum(p.amount), 0) into v_revenue_week
  from payments p
  join members m on m.id = p.member_id
  where m.gym_id = p_gym_id
    and p.paid_at::date between p_week_start and v_week_end;

  select coalesce(sum(p.amount), 0) into v_revenue_prev
  from payments p
  join members m on m.id = p.member_id
  where m.gym_id = p_gym_id
    and p.paid_at::date between v_prev_start and v_prev_end;

  -- 트레이너별 세부 현황
  select jsonb_agg(
    jsonb_build_object(
      'trainer_name',   t.name,
      'member_count',   (select count(*) from members where trainer_id = t.id and (suspended is null or suspended = false)),
      'sessions_week',  (
        select count(*) from logs l
        join members m on m.id = l.member_id
        where m.trainer_id = t.id
          and l.created_at::date between p_week_start and v_week_end
      ),
      'revenue_week',   (
        select coalesce(sum(p2.amount),0) from payments p2
        join members m2 on m2.id = p2.member_id
        where m2.trainer_id = t.id
          and p2.paid_at::date between p_week_start and v_week_end
      ),
      'rank',           coalesce(tr.label, t.rank, '미설정')
    )
    order by t.name
  ) into v_trainers_json
  from trainers t
  left join trainer_ranks tr on tr.code = t.rank
  where t.gym_id = p_gym_id;

  -- 이탈 위험 회원 목록 (top 5)
  select jsonb_agg(
    jsonb_build_object(
      'name',       m.name,
      'risk_score', r.risk_score,
      'risk_level', r.risk_level,
      'flags',      r.flags
    )
    order by r.risk_score desc
  ) into v_risk_json
  from members m
  join member_risk_scores r on r.member_id = m.id
  where m.gym_id = p_gym_id
    and r.risk_score >= 50
    and (m.suspended is null or m.suspended = false)
  limit 5;

  -- 만료 예정 회원 목록 (top 5)
  select jsonb_agg(
    jsonb_build_object(
      'name',    m.name,
      'remain',  m.total_sessions - m.done_sessions,
      'trainer', (select t.name from trainers t where t.id = m.trainer_id)
    )
    order by (m.total_sessions - m.done_sessions) asc
  ) into v_expiring_json
  from members m
  where m.gym_id = p_gym_id
    and (m.suspended is null or m.suspended = false)
    and (m.total_sessions - m.done_sessions) between 1 and 3
  limit 5;

  return jsonb_build_object(
    'gym_id',          p_gym_id,
    'gym_name',        coalesce(v_gym_name, '센터'),
    'week_start',      p_week_start,
    'week_end',        v_week_end,

    'trainer_count',   v_trainer_cnt,

    'attendance', jsonb_build_object(
      'this_week', v_attend_total,
      'prev_week', v_attend_prev,
      'trend',     v_attend_total - v_attend_prev
    ),

    'members', jsonb_build_object(
      'total',         v_member_total,
      'new_this_week', v_member_new,
      'expiring',      v_member_expiring,
      'expired',       v_member_expired,
      'at_risk',       v_member_risk
    ),

    'sessions', jsonb_build_object(
      'this_week', v_sessions_done,
      'prev_week', v_sessions_prev,
      'trend',     v_sessions_done - v_sessions_prev
    ),

    'revenue', jsonb_build_object(
      'this_week', v_revenue_week,
      'prev_week', v_revenue_prev,
      'trend',     v_revenue_week - v_revenue_prev
    ),

    'trainers',          coalesce(v_trainers_json, '[]'),
    'risk_members',      coalesce(v_risk_json,     '[]'),
    'expiring_members',  coalesce(v_expiring_json, '[]')
  );
end;
$$;
