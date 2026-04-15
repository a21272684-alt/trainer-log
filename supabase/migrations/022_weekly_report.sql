-- ============================================================
-- 022_weekly_report.sql
-- 센터 운영 주간 리포트 자동 생성 시스템
--
-- 구조:
--   gym_weekly_reports   - 리포트 저장소 (pending → done)
--   get_gym_weekly_stats - 한 주치 운영 데이터 수집 RPC
--   pg_cron              - 매주 월요일 09:00 KST pending 레코드 생성
--
-- 흐름:
--   pg_cron (월요일 00:00 UTC)
--     → gym_weekly_reports 에 status='pending' 행 INSERT
--   gym_owner / trainer 로그인
--     → 클라이언트가 pending 감지
--     → get_gym_weekly_stats() 로 데이터 수집
--     → Gemini API 호출 (클라이언트)
--     → 결과를 report_text 에 저장, status='done'
--
-- 주의:
--   pg_cron 은 Supabase Pro 플랜 이상에서 사용 가능.
--   Free 플랜은 하단 주석의 수동 등록 방법 또는
--   클라이언트 "월요일 자동 감지" 로직만으로도 동작.
-- ============================================================

-- ── 1. 리포트 저장 테이블 ──────────────────────────────────

create table if not exists gym_weekly_reports (
  id              uuid      default gen_random_uuid() primary key,
  gym_id          uuid      not null references gyms(id) on delete cascade,
  week_start      date      not null,            -- 해당 주 월요일
  week_end        date      generated always as (week_start + 6) stored,
  status          text      not null default 'pending'
                    check (status in ('pending','generating','done','error')),
  report_text     text,                           -- Gemini 생성 리포트 본문
  stats_snapshot  jsonb     default '{}',         -- 생성 당시 데이터 스냅샷
  error_message   text,
  generated_at    timestamptz,
  created_at      timestamptz default now(),
  unique (gym_id, week_start)
);

alter table gym_weekly_reports enable row level security;
create policy "report_read"   on gym_weekly_reports for select using (true);
create policy "report_insert" on gym_weekly_reports for insert with check (true);
create policy "report_update" on gym_weekly_reports for update using (true);

create index if not exists idx_report_gym    on gym_weekly_reports (gym_id, week_start desc);
create index if not exists idx_report_status on gym_weekly_reports (status);

comment on table gym_weekly_reports is
  '센터별 주간 운영 리포트. pg_cron이 매주 월요일 pending 행을 생성하고, 클라이언트가 Gemini로 완성.';

-- ── 2. 주간 운영 통계 수집 RPC ─────────────────────────────
-- 특정 gym_id 의 week_start ~ week_end 데이터를 JSONB 로 반환

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

  -- 출석
  v_attend_total  int;
  v_attend_prev   int;

  -- 회원
  v_member_total  int;
  v_member_new    int;
  v_member_expiring int;  -- 잔여 3회 이하
  v_member_expired  int;  -- 세션 소진
  v_member_risk     int;  -- risk_score >= 50

  -- 수업
  v_sessions_done int;    -- 이번 주 수업 완료 수 (logs)
  v_sessions_prev int;

  -- 매출
  v_revenue_week  numeric;
  v_revenue_prev  numeric;

  -- JSON 결과
  v_trainers_json jsonb;
  v_risk_json     jsonb;
  v_expiring_json jsonb;
begin

  -- 센터 기본 정보
  select name into v_gym_name from gyms where id = p_gym_id;

  -- 소속 트레이너 수
  select count(*) into v_trainer_cnt from trainers where gym_id = p_gym_id;

  -- ── 출석 통계 ───────────────────────────────────────────

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

  -- ── 회원 통계 ───────────────────────────────────────────

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

  -- ── 수업(로그) 통계 ─────────────────────────────────────

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

  -- ── 매출 통계 ───────────────────────────────────────────

  select coalesce(sum(p.amount), 0) into v_revenue_week
  from payments p
  join members m on m.id = p.member_id
  where m.gym_id = p_gym_id
    and p.paid_at::date between p_week_start and v_week_end
    and (p.cancelled is null or p.cancelled = false);

  select coalesce(sum(p.amount), 0) into v_revenue_prev
  from payments p
  join members m on m.id = p.member_id
  where m.gym_id = p_gym_id
    and p.paid_at::date between v_prev_start and v_prev_end
    and (p.cancelled is null or p.cancelled = false);

  -- ── 트레이너별 세부 현황 ────────────────────────────────

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
          and (p2.cancelled is null or p2.cancelled = false)
      ),
      'rank',           coalesce(tr.display_name, t.rank, '미설정')
    )
    order by t.name
  ) into v_trainers_json
  from trainers t
  left join trainer_ranks tr on tr.rank_key = t.rank
  where t.gym_id = p_gym_id;

  -- ── 이탈 위험 회원 목록 (top 5) ─────────────────────────

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

  -- ── 만료 예정 회원 목록 (top 5) ─────────────────────────

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

  -- ── 최종 JSONB 조합 ─────────────────────────────────────

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
      'total',     v_member_total,
      'new_this_week', v_member_new,
      'expiring',  v_member_expiring,
      'expired',   v_member_expired,
      'at_risk',   v_member_risk
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

    'trainers',     coalesce(v_trainers_json, '[]'),
    'risk_members', coalesce(v_risk_json,     '[]'),
    'expiring_members', coalesce(v_expiring_json, '[]')
  );
end;
$$;

-- ── 3. pending 리포트 생성 헬퍼 ────────────────────────────
-- 특정 gym 의 지난 주 리포트 pending 행을 수동으로 생성
-- (pg_cron 미사용 환경 또는 수동 트리거용)

create or replace function create_pending_weekly_report(p_gym_id uuid)
returns uuid
language plpgsql security definer as $$
declare
  v_week_start date;
  v_report_id  uuid;
begin
  -- 직전 주 월요일 계산
  v_week_start := date_trunc('week', current_date - interval '7 days')::date;

  insert into gym_weekly_reports (gym_id, week_start, status)
  values (p_gym_id, v_week_start, 'pending')
  on conflict (gym_id, week_start) do nothing
  returning id into v_report_id;

  return v_report_id;
end;
$$;

-- ── 4. 리포트 완성 저장 RPC ────────────────────────────────
-- 클라이언트가 Gemini 호출 후 결과를 저장

create or replace function save_weekly_report(
  p_report_id   uuid,
  p_report_text text,
  p_stats       jsonb
)
returns void
language sql security definer as $$
  update gym_weekly_reports
  set
    status        = 'done',
    report_text   = p_report_text,
    stats_snapshot = p_stats,
    generated_at  = now(),
    error_message = null
  where id = p_report_id;
$$;

-- 에러 저장
create or replace function fail_weekly_report(
  p_report_id   uuid,
  p_error       text
)
returns void
language sql security definer as $$
  update gym_weekly_reports
  set status = 'error', error_message = p_error
  where id = p_report_id;
$$;

-- ── 5. pg_cron 스케줄 등록 ─────────────────────────────────
-- 매주 월요일 00:00 UTC (한국시간 09:00 KST) 에 전체 gym pending 생성
--
-- ※ Supabase Pro 플랜 이상에서만 사용 가능.
--    Free 플랜 사용자는 이 블록을 건너뛰고,
--    클라이언트 측 "월요일 자동 감지" 로직만 사용하면 됩니다.
--
-- 활성화하려면 아래 주석을 제거하고 SQL Editor에서 실행:
--
-- select cron.schedule(
--   'gym-weekly-report-pending',
--   '0 0 * * 1',
--   $$
--     insert into gym_weekly_reports (gym_id, week_start, status)
--     select
--       id,
--       date_trunc('week', current_date - interval '7 days')::date,
--       'pending'
--     from gyms
--     on conflict (gym_id, week_start) do nothing;
--   $$
-- );

-- ── 6. 편의 뷰 ─────────────────────────────────────────────

create or replace view v_pending_reports as
  select
    r.id,
    r.gym_id,
    g.name  as gym_name,
    r.week_start,
    r.week_end,
    r.status,
    r.created_at
  from gym_weekly_reports r
  join gyms g on g.id = r.gym_id
  where r.status = 'pending'
  order by r.created_at desc;

-- ── 7. 검증 쿼리 (참고용 주석) ─────────────────────────────
-- select get_gym_weekly_stats('<gym-uuid>', '2026-04-07');
-- select create_pending_weekly_report('<gym-uuid>');
-- select * from v_pending_reports;
