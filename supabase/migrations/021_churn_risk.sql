-- ============================================================
-- 021_churn_risk.sql
-- 회원 이탈 징후(Churn Risk) 분석 시스템
--
-- 목표:
--   · logs 에 session_rating 컬럼 추가 (트레이너가 수업 후 평가)
--   · member_risk_scores 테이블: 주기적으로 갱신되는 점수 박제
--   · compute_member_risk(p_member_id) RPC: 단일 회원 점수 계산
--   · get_trainer_risk_scores(p_trainer_id) RPC: 트레이너 전 회원 일괄 조회
--   · refresh_risk_scores(p_trainer_id) RPC: 점수 일괄 갱신
--
-- 점수 구성 (100점 만점 — 높을수록 위험):
--   A. 출석 위험도   (0~40점)
--   B. 건강기록 중단 (0~30점)
--   C. 수업 평점 저하 (0~30점)
--
-- 위험 등급:
--    0~29  : safe     🟢 안전
--   30~49  : watch    🟡 관찰
--   50~74  : risk     🟠 위험
--   75~100 : critical 🔴 이탈 임박
-- ============================================================

-- ── 1. logs 테이블에 session_rating 추가 ────────────────────
-- 트레이너가 수업 종료 후 회원 상태를 1~5점으로 평가
-- 1: 매우 저조  2: 저조  3: 보통  4: 좋음  5: 매우 좋음

alter table logs
  add column if not exists session_rating smallint check (session_rating between 1 and 5);

comment on column logs.session_rating is
  '트레이너 수업 평가 점수 1~5. NULL=미평가. 낮을수록 회원 상태 불량.';

create index if not exists idx_logs_rating on logs (member_id, session_rating)
  where session_rating is not null;

-- ── 2. member_risk_scores 테이블 ────────────────────────────
-- 계산된 리스크 점수를 저장 (client 폴백용 + 히스토리)

create table if not exists member_risk_scores (
  id              uuid    default gen_random_uuid() primary key,
  member_id       uuid    not null references members(id) on delete cascade,
  trainer_id      uuid    references trainers(id) on delete set null,
  scored_at       timestamp default now(),

  -- 세부 점수 (합산 = risk_score)
  attend_score    smallint not null default 0,  -- 출석 위험도   0~40
  health_score    smallint not null default 0,  -- 건강기록 중단 0~30
  rating_score    smallint not null default 0,  -- 수업 평점 저하 0~30
  risk_score      smallint not null default 0,  -- 합계          0~100
  risk_level      text     not null default 'safe'
                    check (risk_level in ('safe','watch','risk','critical')),

  -- 진단 근거 (JSON 배열 — 사유 텍스트)
  flags           jsonb    default '[]',

  unique (member_id)  -- 최신 점수 1건만 유지
);

alter table member_risk_scores enable row level security;
create policy "risk_read"   on member_risk_scores for select using (true);
create policy "risk_insert" on member_risk_scores for insert with check (true);
create policy "risk_upsert" on member_risk_scores for update using (true);
create policy "risk_delete" on member_risk_scores for delete using (true);

create index if not exists idx_risk_trainer  on member_risk_scores (trainer_id);
create index if not exists idx_risk_level    on member_risk_scores (risk_level);
create index if not exists idx_risk_score    on member_risk_scores (risk_score desc);

-- ── 3. 핵심 RPC — compute_member_risk ───────────────────────
-- 단일 회원의 이탈 위험 점수를 실시간 계산하여 반환 + upsert

create or replace function compute_member_risk(p_member_id uuid)
returns table (
  attend_score  smallint,
  health_score  smallint,
  rating_score  smallint,
  risk_score    smallint,
  risk_level    text,
  flags         jsonb
)
language plpgsql security definer as $$
declare
  v_now            date    := current_date;
  v_2w_ago         date    := current_date - 14;
  v_4w_ago         date    := current_date - 28;

  -- 출석
  v_recent_attend  int;
  v_prev_attend    int;
  v_last_attend    date;
  v_days_since     int;

  -- 건강 기록
  v_recent_health  int;
  v_prev_health    int;
  v_total_health   int;
  v_recent_sleep   numeric;
  v_prev_sleep     numeric;

  -- 수업 평점
  v_recent_rating  numeric;
  v_prev_rating    numeric;
  v_rating_cnt     int;

  -- 결과
  v_attend_score   smallint := 0;
  v_health_score   smallint := 0;
  v_rating_score   smallint := 0;
  v_total          smallint;
  v_level          text;
  v_flags          jsonb    := '[]';
  v_trainer_id     uuid;
begin
  -- ── 트레이너 ID ──────────────────────────────────────────
  select trainer_id into v_trainer_id from members where id = p_member_id;

  -- ────────────────────────────────────────────────────────
  -- A. 출석 위험도 (0~40점)
  -- ────────────────────────────────────────────────────────

  -- 최근 2주 출석 수
  select count(*) into v_recent_attend
  from attendance
  where member_id = p_member_id
    and attended_date > v_2w_ago;

  -- 이전 2주 출석 수 (2~4주 전)
  select count(*) into v_prev_attend
  from attendance
  where member_id = p_member_id
    and attended_date > v_4w_ago
    and attended_date <= v_2w_ago;

  -- 마지막 출석일
  select max(attended_date) into v_last_attend
  from attendance
  where member_id = p_member_id;

  v_days_since := case
    when v_last_attend is null then 999
    else (v_now - v_last_attend)
  end;

  -- 마지막 출석 경과일 점수
  if v_days_since >= 21 then
    v_attend_score := v_attend_score + 20;
    v_flags := v_flags || jsonb_build_array('마지막 출석 ' || v_days_since || '일 경과');
  elsif v_days_since >= 14 then
    v_attend_score := v_attend_score + 13;
    v_flags := v_flags || jsonb_build_array('마지막 출석 ' || v_days_since || '일 경과');
  elsif v_days_since >= 7 then
    v_attend_score := v_attend_score + 6;
  end if;

  -- 출석 빈도 하락 점수
  if v_recent_attend = 0 and v_prev_attend > 0 then
    v_attend_score := v_attend_score + 20;
    v_flags := v_flags || jsonb_build_array('최근 2주 출석 0회 (이전 ' || v_prev_attend || '회)');
  elsif v_prev_attend > 0 and v_recent_attend::numeric / v_prev_attend < 0.5 then
    v_attend_score := v_attend_score + 12;
    v_flags := v_flags || jsonb_build_array('출석 빈도 50% 이상 감소 (' || v_prev_attend || '→' || v_recent_attend || '회)');
  elsif v_recent_attend < v_prev_attend then
    v_attend_score := v_attend_score + 5;
  end if;

  -- 상한 40
  v_attend_score := least(v_attend_score, 40);

  -- ────────────────────────────────────────────────────────
  -- B. 건강 기록 중단 (0~30점)
  -- ────────────────────────────────────────────────────────

  select count(*) into v_total_health
  from health_records
  where member_id = p_member_id;

  select count(*) into v_recent_health
  from health_records
  where member_id = p_member_id
    and record_date > v_2w_ago;

  select count(*) into v_prev_health
  from health_records
  where member_id = p_member_id
    and record_date > v_4w_ago
    and record_date <= v_2w_ago;

  -- 평균 수면 비교
  select avg(sleep_level) into v_recent_sleep
  from health_records
  where member_id = p_member_id
    and record_date > v_2w_ago
    and sleep_level is not null;

  select avg(sleep_level) into v_prev_sleep
  from health_records
  where member_id = p_member_id
    and record_date > v_4w_ago
    and record_date <= v_2w_ago
    and sleep_level is not null;

  -- 기록 중단 점수
  if v_recent_health = 0 and v_total_health >= 3 then
    v_health_score := v_health_score + 20;
    v_flags := v_flags || jsonb_build_array('최근 2주 건강 기록 중단');
  elsif v_prev_health > 0 and v_recent_health::numeric / greatest(v_prev_health,1) < 0.5 then
    v_health_score := v_health_score + 10;
    v_flags := v_flags || jsonb_build_array('건강 기록 빈도 감소 (' || v_prev_health || '→' || v_recent_health || '건)');
  end if;

  -- 수면 품질 하락 점수
  if v_recent_sleep is not null and v_recent_sleep <= 2 then
    v_health_score := v_health_score + 10;
    v_flags := v_flags || jsonb_build_array('수면 품질 저하 (평균 ' || round(v_recent_sleep,1) || '/10)');
  elsif v_prev_sleep is not null and v_recent_sleep is not null
        and (v_prev_sleep - v_recent_sleep) >= 2 then
    v_health_score := v_health_score + 6;
    v_flags := v_flags || jsonb_build_array('수면 품질 감소 (' || round(v_prev_sleep,1) || '→' || round(v_recent_sleep,1) || ')');
  end if;

  -- 상한 30
  v_health_score := least(v_health_score, 30);

  -- ────────────────────────────────────────────────────────
  -- C. 수업 평점 저하 (0~30점)
  -- ────────────────────────────────────────────────────────

  -- 최근 3회 평점 평균
  select avg(session_rating), count(*) into v_recent_rating, v_rating_cnt
  from (
    select session_rating from logs
    where member_id = p_member_id and session_rating is not null
    order by created_at desc limit 3
  ) t;

  -- 이전 3회 평점 평균 (최근 3회 제외)
  select avg(session_rating) into v_prev_rating
  from (
    select session_rating from logs
    where member_id = p_member_id and session_rating is not null
    order by created_at desc
    limit 3 offset 3
  ) t;

  if v_rating_cnt >= 1 then
    if v_recent_rating <= 2 then
      v_rating_score := v_rating_score + 20;
      v_flags := v_flags || jsonb_build_array('수업 평점 매우 낮음 (' || round(v_recent_rating,1) || '/5)');
    elsif v_recent_rating <= 3 then
      v_rating_score := v_rating_score + 10;
      v_flags := v_flags || jsonb_build_array('수업 평점 저조 (' || round(v_recent_rating,1) || '/5)');
    end if;

    if v_prev_rating is not null then
      if (v_prev_rating - v_recent_rating) >= 1.5 then
        v_rating_score := v_rating_score + 10;
        v_flags := v_flags || jsonb_build_array('수업 평점 급락 (' || round(v_prev_rating,1) || '→' || round(v_recent_rating,1) || ')');
      elsif (v_prev_rating - v_recent_rating) >= 1.0 then
        v_rating_score := v_rating_score + 5;
      end if;
    end if;
  end if;

  -- 상한 30
  v_rating_score := least(v_rating_score, 30);

  -- ────────────────────────────────────────────────────────
  -- 합산 및 등급 결정
  -- ────────────────────────────────────────────────────────

  v_total := v_attend_score + v_health_score + v_rating_score;

  v_level := case
    when v_total >= 75 then 'critical'
    when v_total >= 50 then 'risk'
    when v_total >= 30 then 'watch'
    else 'safe'
  end;

  -- ── upsert 저장 ────────────────────────────────────────
  insert into member_risk_scores
    (member_id, trainer_id, scored_at,
     attend_score, health_score, rating_score, risk_score, risk_level, flags)
  values
    (p_member_id, v_trainer_id, now(),
     v_attend_score, v_health_score, v_rating_score, v_total, v_level, v_flags)
  on conflict (member_id) do update set
    trainer_id   = excluded.trainer_id,
    scored_at    = excluded.scored_at,
    attend_score = excluded.attend_score,
    health_score = excluded.health_score,
    rating_score = excluded.rating_score,
    risk_score   = excluded.risk_score,
    risk_level   = excluded.risk_level,
    flags        = excluded.flags;

  return query select v_attend_score, v_health_score, v_rating_score, v_total, v_level, v_flags;
end;
$$;

-- ── 4. 트레이너 전 회원 일괄 조회 RPC ───────────────────────
-- 저장된 최신 점수를 회원 정보와 조인하여 반환

create or replace function get_trainer_risk_scores(p_trainer_id uuid)
returns table (
  member_id     uuid,
  member_name   text,
  risk_score    smallint,
  risk_level    text,
  attend_score  smallint,
  health_score  smallint,
  rating_score  smallint,
  flags         jsonb,
  scored_at     timestamp
)
language sql stable security definer as $$
  select
    m.id            as member_id,
    m.name          as member_name,
    coalesce(r.risk_score,   0)      as risk_score,
    coalesce(r.risk_level,   'safe') as risk_level,
    coalesce(r.attend_score, 0)      as attend_score,
    coalesce(r.health_score, 0)      as health_score,
    coalesce(r.rating_score, 0)      as rating_score,
    coalesce(r.flags,        '[]')   as flags,
    r.scored_at
  from members m
  left join member_risk_scores r on r.member_id = m.id
  where m.trainer_id = p_trainer_id
    and (m.suspended is null or m.suspended = false)
  order by coalesce(r.risk_score, 0) desc;
$$;

-- ── 5. 일괄 점수 갱신 RPC ───────────────────────────────────
-- 트레이너 소속 활성 회원 전체 점수를 재계산

create or replace function refresh_risk_scores(p_trainer_id uuid)
returns integer
language plpgsql security definer as $$
declare
  v_member record;
  v_count  integer := 0;
begin
  for v_member in
    select id from members
    where trainer_id = p_trainer_id
      and (suspended is null or suspended = false)
  loop
    perform compute_member_risk(v_member.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── 6. 편의 뷰 — 이탈 위험 회원 대시보드 ──────────────────

create or replace view v_churn_risk_dashboard as
  select
    m.trainer_id,
    t.name          as trainer_name,
    m.id            as member_id,
    m.name          as member_name,
    m.phone,
    m.lesson_purpose,
    m.total_sessions,
    m.done_sessions,
    r.risk_score,
    r.risk_level,
    r.attend_score,
    r.health_score,
    r.rating_score,
    r.flags,
    r.scored_at,
    -- 잔여 세션
    greatest(0, m.total_sessions - m.done_sessions) as remain_sessions
  from members m
  join trainers t on t.id = m.trainer_id
  left join member_risk_scores r on r.member_id = m.id
  where (m.suspended is null or m.suspended = false)
  order by coalesce(r.risk_score, 0) desc;

-- ── 7. 검증 쿼리 (주석 참고용) ─────────────────────────────
-- select * from compute_member_risk('<member-uuid>');
-- select * from get_trainer_risk_scores('<trainer-uuid>');
-- select refresh_risk_scores('<trainer-uuid>');
-- select * from v_churn_risk_dashboard where trainer_id = '<trainer-uuid>';
