-- ============================================================
-- 019_settlement_engine.sql
-- 고도화 정산 엔진
--
-- 구조:
--   trainer_ranks      — 직급 마스터 (기본급 · 기본 인센티브율)
--   trainers           — rank / incentive_rate 컬럼 추가
--   settlements        — 월별 정산 결과 (1 trainer × 1 month = 1 row)
--   settlement_items   — 정산 근거 내역 (payments 행 연결)
--
-- 정산 공식:
--   incentive_amount = SUM(payments.amount) × incentive_rate
--   tax_amount       = (base_salary + incentive_amount) × tax_rate (기본 3.3%)
--   deduction_amount = 기타 공제 (수동 입력 가능)
--   total_payout     = base_salary + incentive_amount
--                      - tax_amount - deduction_amount
--
-- 상태 흐름:
--   draft → confirmed → paid
--   (draft 상태만 재계산 가능 / confirmed·paid 는 잠금)
--
-- 하위 호환:
--   payments / products 테이블 구조 변경 없음
--   trainers 에 nullable 컬럼만 추가 → 기존 쿼리 무영향
-- ============================================================

-- ── 1. trainer_ranks — 직급 마스터 ──────────────────────────

create table if not exists trainer_ranks (
  code                   text    primary key,   -- 'intern' | 'junior' | 'senior' | 'head' | 'director'
  label                  text    not null,      -- UI 표시명 (한글)
  base_salary            integer not null default 0,    -- 기본급 (월, 원)
  default_incentive_rate numeric(5,4) not null default 0.10, -- 직급 기본 인센티브율 (0.10 = 10%)
  sort_order             integer not null default 0
);

comment on table trainer_ranks is '트레이너 직급 마스터. 기본급과 기본 인센티브율을 직급별로 정의.';

alter table trainer_ranks enable row level security;
create policy "ranks_read" on trainer_ranks for select using (true);
create policy "ranks_write" on trainer_ranks for all using (true) with check (true);

-- 직급 시드 데이터 (한국 피트니스 센터 일반 직급 체계)
insert into trainer_ranks (code, label, base_salary, default_incentive_rate, sort_order) values
  ('intern',   '인턴 트레이너',  1000000, 0.08, 1),
  ('junior',   '주니어 트레이너',1500000, 0.10, 2),
  ('senior',   '시니어 트레이너',2000000, 0.12, 3),
  ('head',     '헤드 트레이너',  2500000, 0.15, 4),
  ('director', '실장',          3000000, 0.18, 5)
on conflict (code) do nothing;

-- ── 2. trainers — rank / incentive_rate 컬럼 추가 ───────────

-- 직급 코드 (FK → trainer_ranks)
alter table trainers
  add column if not exists rank text references trainer_ranks(code) on delete set null;

comment on column trainers.rank is '직급 코드. trainer_ranks.code 참조. NULL = 직급 미설정.';

-- 개인 인센티브율 (NULL 이면 직급 기본값 사용)
alter table trainers
  add column if not exists incentive_rate numeric(5,4);

comment on column trainers.incentive_rate is
  '개인 인센티브율 (0.10 = 10%). NULL 이면 소속 직급의 default_incentive_rate 사용.';

create index if not exists idx_trainers_rank on trainers (rank);

-- ── 3. settlements — 월별 정산 결과 ─────────────────────────

create table if not exists settlements (
  id               uuid    primary key default gen_random_uuid(),
  trainer_id       uuid    not null references trainers(id) on delete cascade,
  gym_id           uuid    references gyms(id) on delete set null,

  -- 정산 기간
  period_year      integer not null,
  period_month     integer not null check (period_month between 1 and 12),

  -- 기본급
  base_salary      integer not null default 0,

  -- 인센티브
  incentive_base   integer not null default 0,    -- 해당 월 payments 합계
  incentive_rate   numeric(5,4) not null default 0.10,
  incentive_amount integer not null default 0,    -- incentive_base × incentive_rate

  -- 세금 / 공제
  tax_rate         numeric(5,4) not null default 0.033, -- 원천징수 3.3% (프리랜서)
  tax_amount       integer not null default 0,
  deduction_amount integer not null default 0,    -- 기타 공제 (수동 입력)
  deduction_memo   text,

  -- 최종 지급
  total_payout     integer not null default 0,    -- base_salary + incentive - tax - deduction

  -- 상태 관리
  status           text    not null default 'draft'
                   check (status in ('draft','confirmed','paid')),
  confirmed_at     timestamptz,
  paid_at          timestamptz,
  memo             text,

  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  -- 트레이너 × 연월 유니크
  unique (trainer_id, period_year, period_month)
);

comment on table settlements is
  '월별 트레이너 정산 결과. draft→confirmed→paid 상태 전이. '
  'draft 상태에서만 calculate_settlement() 재계산 가능.';

alter table settlements enable row level security;
create policy "settlements_read"  on settlements for select using (true);
create policy "settlements_write" on settlements for all    using (true) with check (true);

create index if not exists idx_settlements_trainer  on settlements (trainer_id, period_year, period_month);
create index if not exists idx_settlements_gym       on settlements (gym_id, period_year, period_month);
create index if not exists idx_settlements_status    on settlements (status);

-- updated_at 자동 갱신 트리거
create or replace function touch_settlements_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_settlements_updated_at on settlements;
create trigger trg_settlements_updated_at
  before update on settlements
  for each row execute function touch_settlements_updated_at();

-- ── 4. settlement_items — 정산 근거 내역 ────────────────────

create table if not exists settlement_items (
  id            uuid  primary key default gen_random_uuid(),
  settlement_id uuid  not null references settlements(id) on delete cascade,
  payment_id    uuid  references payments(id) on delete set null,

  amount        integer not null,
  item_type     text    not null default 'payment'
                check (item_type in ('payment','bonus','deduction')),
  description   text,
  created_at    timestamptz default now()
);

comment on table settlement_items is
  '정산 근거 내역. payment(결제연동) / bonus(추가수당) / deduction(공제항목).';

alter table settlement_items enable row level security;
create policy "sitems_read"  on settlement_items for select using (true);
create policy "sitems_write" on settlement_items for all    using (true) with check (true);

create index if not exists idx_sitems_settlement on settlement_items (settlement_id);
create index if not exists idx_sitems_payment    on settlement_items (payment_id);

-- ── 5. 정산 계산 엔진 ────────────────────────────────────────

-- 5-A. calculate_settlement()
--   지정 트레이너 × 연월 기준으로 정산 row 를 upsert 하고 반환.
--   confirmed / paid 상태이면 예외 발생 (재계산 불가).
create or replace function calculate_settlement(
  p_trainer_id  uuid,
  p_year        integer,
  p_month       integer
)
returns settlements
language plpgsql security definer as $$
declare
  v_trainer        trainers%rowtype;
  v_rank           trainer_ranks%rowtype;
  v_existing       settlements%rowtype;

  v_period_start   date;
  v_base_salary    integer;
  v_incentive_rate numeric(5,4);
  v_incentive_base integer;
  v_incentive_amt  integer;
  v_tax_rate       numeric(5,4) := 0.033;
  v_tax_amt        integer;
  v_total_payout   integer;
  v_settle_id      uuid;
  v_result         settlements%rowtype;
begin
  -- 기간 시작일
  v_period_start := make_date(p_year, p_month, 1);

  -- 트레이너 조회
  select * into v_trainer from trainers where id = p_trainer_id;
  if not found then
    raise exception 'Trainer not found: %', p_trainer_id;
  end if;

  -- 기존 정산 상태 확인
  select * into v_existing
  from settlements
  where trainer_id = p_trainer_id
    and period_year = p_year
    and period_month = p_month;

  if found and v_existing.status in ('confirmed', 'paid') then
    raise exception '이미 확정된 정산입니다 (status: %). 재계산하려면 관리자가 상태를 초기화해야 합니다.', v_existing.status;
  end if;

  -- 직급 기본급 / 기본 인센티브율 조회
  select * into v_rank from trainer_ranks where code = v_trainer.rank;
  v_base_salary    := coalesce(v_rank.base_salary, 0);
  v_incentive_rate := coalesce(
    v_trainer.incentive_rate,       -- 개인 설정 우선
    v_rank.default_incentive_rate,  -- 없으면 직급 기본값
    0.10                            -- 최종 폴백 10%
  );

  -- 해당 월 payments 합계 (인센티브 산정 기준)
  select coalesce(sum(amount), 0)
  into v_incentive_base
  from payments
  where trainer_id  = p_trainer_id
    and paid_at     >= v_period_start
    and paid_at     <  v_period_start + interval '1 month';

  -- 계산
  v_incentive_amt := round(v_incentive_base * v_incentive_rate)::integer;
  v_tax_amt       := round((v_base_salary + v_incentive_amt) * v_tax_rate)::integer;
  v_total_payout  := v_base_salary + v_incentive_amt - v_tax_amt;

  -- settlements upsert (draft 상태만)
  insert into settlements (
    trainer_id, gym_id,
    period_year, period_month,
    base_salary,
    incentive_base, incentive_rate, incentive_amount,
    tax_rate, tax_amount,
    total_payout,
    status
  ) values (
    p_trainer_id,
    v_trainer.gym_id,
    p_year, p_month,
    v_base_salary,
    v_incentive_base, v_incentive_rate, v_incentive_amt,
    v_tax_rate, v_tax_amt,
    v_total_payout,
    'draft'
  )
  on conflict (trainer_id, period_year, period_month)
  do update set
    gym_id           = excluded.gym_id,
    base_salary      = excluded.base_salary,
    incentive_base   = excluded.incentive_base,
    incentive_rate   = excluded.incentive_rate,
    incentive_amount = excluded.incentive_amount,
    tax_rate         = excluded.tax_rate,
    tax_amount       = excluded.tax_amount,
    total_payout     = excluded.total_payout,
    updated_at       = now()
  returning id into v_settle_id;

  -- settlement_items 재구성 (payment 항목)
  delete from settlement_items where settlement_id = v_settle_id;

  insert into settlement_items (settlement_id, payment_id, amount, item_type, description)
  select
    v_settle_id,
    p.id,
    p.amount,
    'payment',
    coalesce(p.product_name, '결제') || ' · ' || coalesce(m.name, '회원')
  from payments p
  left join members m on m.id = p.member_id
  where p.trainer_id = p_trainer_id
    and p.paid_at >= v_period_start
    and p.paid_at <  v_period_start + interval '1 month';

  select * into v_result from settlements where id = v_settle_id;
  return v_result;
end;
$$;

-- 5-B. confirm_settlement() — draft → confirmed 전환
create or replace function confirm_settlement(p_settlement_id uuid)
returns settlements
language plpgsql security definer as $$
declare
  v_result settlements%rowtype;
begin
  update settlements
  set status       = 'confirmed',
      confirmed_at = now()
  where id = p_settlement_id
    and status = 'draft'
  returning * into v_result;

  if not found then
    raise exception '정산을 찾을 수 없거나 이미 확정 상태입니다.';
  end if;
  return v_result;
end;
$$;

-- 5-C. mark_settlement_paid() — confirmed → paid 전환
create or replace function mark_settlement_paid(
  p_settlement_id uuid,
  p_paid_at       timestamptz default now()
)
returns settlements
language plpgsql security definer as $$
declare
  v_result settlements%rowtype;
begin
  update settlements
  set status  = 'paid',
      paid_at = p_paid_at
  where id = p_settlement_id
    and status = 'confirmed'
  returning * into v_result;

  if not found then
    raise exception '정산을 찾을 수 없거나 confirmed 상태가 아닙니다.';
  end if;
  return v_result;
end;
$$;

-- 5-D. reset_settlement_to_draft() — 관리자 전용 초기화
create or replace function reset_settlement_to_draft(p_settlement_id uuid)
returns settlements
language plpgsql security definer as $$
declare
  v_result settlements%rowtype;
begin
  update settlements
  set status       = 'draft',
      confirmed_at = null,
      paid_at      = null
  where id = p_settlement_id
  returning * into v_result;

  if not found then raise exception '정산을 찾을 수 없습니다.'; end if;
  return v_result;
end;
$$;

-- ── 6. 편의 조회 함수 ────────────────────────────────────────

-- 6-A. 트레이너 연간 정산 요약 (12개월)
create or replace function get_annual_settlement_summary(
  p_trainer_id uuid,
  p_year       integer
)
returns table (
  month            integer,
  base_salary      integer,
  incentive_base   integer,
  incentive_amount integer,
  tax_amount       integer,
  deduction_amount integer,
  total_payout     integer,
  status           text,
  payment_count    bigint
)
language sql stable security definer as $$
  select
    s.period_month            as month,
    s.base_salary,
    s.incentive_base,
    s.incentive_amount,
    s.tax_amount,
    s.deduction_amount,
    s.total_payout,
    s.status,
    count(si.id)              as payment_count
  from settlements s
  left join settlement_items si
    on si.settlement_id = s.id and si.item_type = 'payment'
  where s.trainer_id  = p_trainer_id
    and s.period_year = p_year
  group by s.period_month, s.base_salary, s.incentive_base,
           s.incentive_amount, s.tax_amount, s.deduction_amount,
           s.total_payout, s.status
  order by s.period_month;
$$;

-- 6-B. 센터(gym) 월별 전체 트레이너 정산 현황
create or replace function get_gym_monthly_settlements(
  p_gym_id     uuid,
  p_year       integer,
  p_month      integer
)
returns table (
  trainer_id       uuid,
  trainer_name     text,
  rank_label       text,
  base_salary      integer,
  incentive_base   integer,
  incentive_rate   numeric,
  incentive_amount integer,
  tax_amount       integer,
  total_payout     integer,
  status           text,
  settlement_id    uuid
)
language sql stable security definer as $$
  select
    t.id              as trainer_id,
    t.name            as trainer_name,
    coalesce(r.label, '직급 미설정') as rank_label,
    coalesce(s.base_salary, 0),
    coalesce(s.incentive_base, 0),
    coalesce(s.incentive_rate, coalesce(r.default_incentive_rate, 0.10)),
    coalesce(s.incentive_amount, 0),
    coalesce(s.tax_amount, 0),
    coalesce(s.total_payout, 0),
    coalesce(s.status, 'none') as status,
    s.id              as settlement_id
  from trainers t
  left join trainer_ranks r on r.code = t.rank
  left join settlements   s on  s.trainer_id   = t.id
                             and s.period_year  = p_year
                             and s.period_month = p_month
  where t.gym_id = p_gym_id
  order by r.sort_order, t.name;
$$;

-- ── 7. 편의 뷰 ──────────────────────────────────────────────

-- 정산 상세 뷰 (트레이너명 · 직급명 · 센터명 포함)
create or replace view v_settlement_detail as
  select
    s.*,
    t.name                                  as trainer_name,
    t.rank                                  as trainer_rank_code,
    coalesce(r.label, '직급 미설정')        as rank_label,
    coalesce(r.base_salary, 0)              as rank_base_salary,
    coalesce(r.default_incentive_rate, 0.10) as rank_default_rate,
    g.name                                  as gym_name,
    -- 지급 진행률 (1=지급완료)
    case s.status
      when 'paid'      then 1.0
      when 'confirmed' then 0.5
      else 0.0
    end                                     as progress
  from settlements s
  join trainers t    on t.id = s.trainer_id
  left join trainer_ranks r on r.code = t.rank
  left join gyms g   on g.id = s.gym_id;

-- ── 8. 검증 쿼리 (참고용 주석) ──────────────────────────────
-- -- 특정 트레이너 이번 달 정산 계산:
-- select * from calculate_settlement('<trainer_uuid>', 2026, 4);
--
-- -- 직급별 기본급 조회:
-- select * from trainer_ranks order by sort_order;
--
-- -- 센터 이번 달 정산 현황:
-- select * from get_gym_monthly_settlements('<gym_uuid>', 2026, 4);
--
-- -- 연간 요약:
-- select * from get_annual_settlement_summary('<trainer_uuid>', 2026);
