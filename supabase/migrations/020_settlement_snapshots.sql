-- ============================================================
-- 020_settlement_snapshots.sql
-- 정산 스냅샷 (시점 박제)
--
-- 목적:
--   결제(payment) 또는 수업 완료(log) 시점의 트레이너 직급·인센티브율·
--   금액을 즉시 박제해, 이후 직급·요율 변경이 과거 데이터에 영향을
--   주지 않도록 보장.
--
-- 트리거 발화 시점:
--   ① payments    AFTER INSERT  → snapshot_type = 'payment'
--   ② logs        AFTER INSERT  → snapshot_type = 'lesson'
--
-- calculate_settlement() 갱신:
--   스냅샷이 있는 기간 → SUM(snapshot.incentive_amount) 사용 (박제값)
--   스냅샷이 없는 기간 → payments × 현재 요율 (레거시 폴백, 019와 동일)
--
-- settlement_snapshots 컬럼 설명:
--   base_amount           : 박제 기준 금액
--                           payment → payments.amount (결제금액)
--                           lesson  → members.session_price (세션 단가)
--   trainer_incentive_rate: 이 트랜잭션 시점의 실제 적용 요율 (불변)
--   incentive_amount      : base_amount × trainer_incentive_rate (불변)
--   settlement_id         : calculate_settlement() 실행 시 연결됨
-- ============================================================

-- ── 1. settlement_snapshots 테이블 ───────────────────────────

create table if not exists settlement_snapshots (
  id                     uuid    primary key default gen_random_uuid(),

  -- 주체
  trainer_id             uuid    not null references trainers(id) on delete cascade,
  member_id              uuid    references members(id)  on delete set null,
  gym_id                 uuid    references gyms(id)     on delete set null,

  -- 박제 유형 & 원본 참조
  snapshot_type          text    not null
                         check (snapshot_type in ('payment', 'lesson')),
  payment_id             uuid    references payments(id) on delete set null,
  log_id                 uuid    references logs(id)     on delete set null,

  -- 박제 시점
  snapped_at             timestamptz not null default now(),
  period_year            integer not null,
  period_month           integer not null check (period_month between 1 and 12),

  -- ★ 박제 데이터 (이후 수정 불가 의도)
  trainer_rank           text,                      -- 시점의 직급 코드
  trainer_rank_label     text,                      -- 시점의 직급명 (코드 변경에도 안전)
  trainer_incentive_rate numeric(5,4) not null,     -- 시점의 적용 인센티브율

  base_amount            integer not null default 0, -- 결제금액 or 세션 단가
  incentive_amount       integer not null default 0, -- base_amount × rate (박제)

  -- 정산 연결 (generate_settlement() 시 채워짐)
  settlement_id          uuid    references settlements(id) on delete set null,

  created_at             timestamptz default now()
);

comment on table settlement_snapshots is
  '결제·수업 완료 시점의 트레이너 직급/인센티브율/금액을 박제하는 불변 이력 테이블. '
  'trainer_incentive_rate 와 incentive_amount 는 INSERT 후 절대 UPDATE 하지 않는다.';

comment on column settlement_snapshots.base_amount is
  'payment: payments.amount / lesson: members.session_price';
comment on column settlement_snapshots.incentive_amount is
  'base_amount × trainer_incentive_rate — 박제 시점에 계산, 이후 변경 불가';

alter table settlement_snapshots enable row level security;
create policy "snaps_read"  on settlement_snapshots for select using (true);
-- INSERT 는 트리거 함수(security definer)가 담당하므로 직접 쓰기 허용
create policy "snaps_insert" on settlement_snapshots for insert with check (true);
-- settlement_id 연결용 UPDATE 만 허용 (박제 핵심 컬럼은 앱 레벨에서 보호)
create policy "snaps_update_link" on settlement_snapshots for update
  using (true) with check (true);

-- ── 2. 인덱스 ────────────────────────────────────────────────

create index if not exists idx_snaps_trainer_period
  on settlement_snapshots (trainer_id, period_year, period_month);

create index if not exists idx_snaps_payment
  on settlement_snapshots (payment_id);

create index if not exists idx_snaps_log
  on settlement_snapshots (log_id);

create index if not exists idx_snaps_settlement
  on settlement_snapshots (settlement_id);

-- ── 3. 트리거 — payments INSERT 시 스냅샷 ───────────────────

create or replace function snap_on_payment_insert()
returns trigger language plpgsql security definer as $$
declare
  v_trainer  trainers%rowtype;
  v_rank     trainer_ranks%rowtype;
  v_rate     numeric(5,4);
  v_snap_at  timestamptz;
begin
  -- 트레이너 현재 상태 조회
  select * into v_trainer from trainers where id = new.trainer_id;
  if not found then return new; end if;   -- trainer_id 없으면 스킵

  -- 직급 기본 인센티브율
  select * into v_rank from trainer_ranks where code = v_trainer.rank;

  -- ★ 이 시점의 실제 적용 인센티브율 (개인 설정 > 직급 기본 > 폴백 10%)
  v_rate := coalesce(
    v_trainer.incentive_rate,
    v_rank.default_incentive_rate,
    0.10
  );

  -- paid_at 기준 월로 박제 (없으면 now())
  v_snap_at := coalesce(new.paid_at, now());

  insert into settlement_snapshots (
    trainer_id, member_id, gym_id,
    snapshot_type, payment_id,
    snapped_at,
    period_year, period_month,
    trainer_rank, trainer_rank_label,
    trainer_incentive_rate,
    base_amount, incentive_amount
  ) values (
    new.trainer_id,
    new.member_id,
    v_trainer.gym_id,
    'payment',
    new.id,
    v_snap_at,
    extract(year  from v_snap_at)::integer,
    extract(month from v_snap_at)::integer,
    v_trainer.rank,
    coalesce(v_rank.label, '직급 미설정'),
    v_rate,
    new.amount,
    round(new.amount * v_rate)::integer
  );

  return new;
end;
$$;

drop trigger if exists trg_snap_payment on payments;
create trigger trg_snap_payment
  after insert on payments
  for each row
  execute function snap_on_payment_insert();

-- ── 4. 트리거 — logs INSERT 시 스냅샷 (수업 완료) ───────────

create or replace function snap_on_log_insert()
returns trigger language plpgsql security definer as $$
declare
  v_trainer    trainers%rowtype;
  v_rank       trainer_ranks%rowtype;
  v_member     members%rowtype;
  v_rate       numeric(5,4);
  v_base_amt   integer;
begin
  -- trainer_id / member_id 없는 로그는 스킵
  if new.trainer_id is null then return new; end if;

  select * into v_trainer from trainers where id = new.trainer_id;
  if not found then return new; end if;

  select * into v_rank from trainer_ranks where code = v_trainer.rank;
  select * into v_member from members where id = new.member_id;

  -- ★ 이 시점의 실제 적용 인센티브율
  v_rate := coalesce(
    v_trainer.incentive_rate,
    v_rank.default_incentive_rate,
    0.10
  );

  -- 세션 단가: 회원 설정값 기준
  v_base_amt := coalesce(v_member.session_price, 0);

  insert into settlement_snapshots (
    trainer_id, member_id, gym_id,
    snapshot_type, log_id,
    snapped_at,
    period_year, period_month,
    trainer_rank, trainer_rank_label,
    trainer_incentive_rate,
    base_amount, incentive_amount
  ) values (
    new.trainer_id,
    new.member_id,
    v_trainer.gym_id,
    'lesson',
    new.id,
    coalesce(new.created_at, now()),
    extract(year  from coalesce(new.created_at, now()))::integer,
    extract(month from coalesce(new.created_at, now()))::integer,
    v_trainer.rank,
    coalesce(v_rank.label, '직급 미설정'),
    v_rate,
    v_base_amt,
    round(v_base_amt * v_rate)::integer
  );

  return new;
end;
$$;

drop trigger if exists trg_snap_log on logs;
create trigger trg_snap_log
  after insert on logs
  for each row
  execute function snap_on_log_insert();

-- ── 5. 기존 데이터 백필 ─────────────────────────────────────
-- 트리거 등록 이전에 삽입된 payments / logs 에 대해 스냅샷을 소급 생성.
-- trainer.incentive_rate (현재값) 을 best-effort 로 적용.
-- 이미 스냅샷이 있는 행은 on conflict 로 스킵 (payment_id unique).
-- ※ logs 백필은 session_price=0 가능성이 높으므로 payment 만 수행.

insert into settlement_snapshots (
  trainer_id, member_id, gym_id,
  snapshot_type, payment_id,
  snapped_at,
  period_year, period_month,
  trainer_rank, trainer_rank_label,
  trainer_incentive_rate,
  base_amount, incentive_amount
)
select
  p.trainer_id,
  p.member_id,
  t.gym_id,
  'payment',
  p.id,
  coalesce(p.paid_at, p.created_at),
  extract(year  from coalesce(p.paid_at, p.created_at))::integer,
  extract(month from coalesce(p.paid_at, p.created_at))::integer,
  t.rank,
  coalesce(r.label, '직급 미설정'),
  coalesce(t.incentive_rate, r.default_incentive_rate, 0.10),
  p.amount,
  round(p.amount * coalesce(t.incentive_rate, r.default_incentive_rate, 0.10))::integer
from payments p
join trainers t on t.id = p.trainer_id
left join trainer_ranks r on r.code = t.rank
-- 이미 스냅샷이 있는 payment 는 건너뜀
where not exists (
  select 1 from settlement_snapshots s where s.payment_id = p.id
);

-- ── 6. calculate_settlement() 오버라이드 ────────────────────
-- 스냅샷 우선: 해당 기간에 payment 스냅샷이 있으면 박제값 사용.
-- 없으면 레거시 폴백(payments 직접 합산 × 현재 요율).

create or replace function calculate_settlement(
  p_trainer_id uuid,
  p_year       integer,
  p_month      integer
)
returns settlements
language plpgsql security definer as $$
declare
  v_trainer         trainers%rowtype;
  v_rank            trainer_ranks%rowtype;
  v_existing        settlements%rowtype;

  v_period_start    date;
  v_base_salary     integer;
  v_incentive_rate  numeric(5,4);   -- 표시용 (가중평균 or 현재 요율)
  v_incentive_base  integer;        -- 결제 원금 합계
  v_incentive_amt   integer;        -- 실제 인센티브 금액
  v_tax_rate        numeric(5,4) := 0.033;
  v_tax_amt         integer;
  v_total_payout    integer;
  v_settle_id       uuid;
  v_snap_count      integer;
  v_result          settlements%rowtype;
begin
  v_period_start := make_date(p_year, p_month, 1);

  -- 트레이너 조회
  select * into v_trainer from trainers where id = p_trainer_id;
  if not found then
    raise exception 'Trainer not found: %', p_trainer_id;
  end if;

  -- 기존 정산 상태 확인 (confirmed/paid 이면 재계산 차단)
  select * into v_existing
  from settlements
  where trainer_id  = p_trainer_id
    and period_year  = p_year
    and period_month = p_month;

  if found and v_existing.status in ('confirmed', 'paid') then
    raise exception
      '이미 확정된 정산입니다 (status: %). reset_settlement_to_draft() 로 초기화 후 재시도하세요.',
      v_existing.status;
  end if;

  -- 직급 기본급 / 기본 인센티브율
  select * into v_rank from trainer_ranks where code = v_trainer.rank;
  v_base_salary    := coalesce(v_rank.base_salary, 0);
  v_incentive_rate := coalesce(
    v_trainer.incentive_rate,
    v_rank.default_incentive_rate,
    0.10
  );

  -- ── 인센티브 계산: 스냅샷 우선 ──────────────────────────

  select
    count(*),
    coalesce(sum(base_amount),       0),
    coalesce(sum(incentive_amount),  0)
  into v_snap_count, v_incentive_base, v_incentive_amt
  from settlement_snapshots
  where trainer_id    = p_trainer_id
    and snapshot_type = 'payment'
    and period_year   = p_year
    and period_month  = p_month;

  if v_snap_count > 0 then
    -- ★ 스냅샷 기반: 박제된 incentive_amount 합산 (요율 변경 무관)
    -- 표시용 가중평균 요율 계산
    v_incentive_rate := case
      when v_incentive_base > 0
        then round(v_incentive_amt::numeric / v_incentive_base, 4)
      else v_incentive_rate
    end;
  else
    -- 레거시 폴백: payments 직접 합산 × 현재 요율
    select coalesce(sum(amount), 0)
    into v_incentive_base
    from payments
    where trainer_id = p_trainer_id
      and paid_at   >= v_period_start
      and paid_at   <  v_period_start + interval '1 month';

    v_incentive_amt := round(v_incentive_base * v_incentive_rate)::integer;
  end if;

  -- 세금 / 최종 지급
  v_tax_amt      := round((v_base_salary + v_incentive_amt) * v_tax_rate)::integer;
  v_total_payout := v_base_salary + v_incentive_amt - v_tax_amt;

  -- ── settlements upsert ──────────────────────────────────

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

  -- ── 스냅샷 → settlement 연결 ────────────────────────────

  update settlement_snapshots
  set settlement_id = v_settle_id
  where trainer_id    = p_trainer_id
    and snapshot_type = 'payment'
    and period_year   = p_year
    and period_month  = p_month
    and (settlement_id is null or settlement_id = v_settle_id);

  -- ── settlement_items 재구성 ─────────────────────────────

  delete from settlement_items where settlement_id = v_settle_id;

  if v_snap_count > 0 then
    -- 스냅샷 기반 items: 박제된 incentive_amount 를 금액으로 기록
    insert into settlement_items (
      settlement_id, payment_id, amount, item_type, description
    )
    select
      v_settle_id,
      ss.payment_id,
      ss.incentive_amount,
      'payment',
      coalesce(p.product_name, '결제')
        || ' · ' || coalesce(m.name, '회원')
        || ' (인센티브율 ' || round(ss.trainer_incentive_rate * 100, 1) || '% · '
        || ss.snapped_at::date || ')'
    from settlement_snapshots ss
    left join payments p on p.id = ss.payment_id
    left join members  m on m.id = ss.member_id
    where ss.trainer_id    = p_trainer_id
      and ss.snapshot_type = 'payment'
      and ss.period_year   = p_year
      and ss.period_month  = p_month;
  else
    -- 레거시 폴백 items
    insert into settlement_items (
      settlement_id, payment_id, amount, item_type, description
    )
    select
      v_settle_id,
      p.id,
      p.amount,
      'payment',
      coalesce(p.product_name, '결제') || ' · ' || coalesce(m.name, '회원')
    from payments p
    left join members m on m.id = p.member_id
    where p.trainer_id = p_trainer_id
      and p.paid_at   >= v_period_start
      and p.paid_at   <  v_period_start + interval '1 month';
  end if;

  select * into v_result from settlements where id = v_settle_id;
  return v_result;
end;
$$;

-- ── 7. 스냅샷 요약 조회 함수 ─────────────────────────────────

-- 트레이너 월별 스냅샷 요약 (정산 전 확인용)
create or replace function get_snapshot_preview(
  p_trainer_id uuid,
  p_year       integer,
  p_month      integer
)
returns table (
  snapshot_type          text,
  event_count            bigint,
  base_amount_total      bigint,
  incentive_amount_total bigint,
  avg_incentive_rate     numeric,
  earliest_snap          timestamptz,
  latest_snap            timestamptz
)
language sql stable security definer as $$
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
  group by snapshot_type
  order by snapshot_type;
$$;

-- ── 8. 검증 쿼리 (참고용 주석) ──────────────────────────────
-- -- 이번 달 스냅샷 미리보기:
-- select * from get_snapshot_preview('<trainer_id>', 2026, 4);
--
-- -- 특정 결제의 박제 내역:
-- select * from settlement_snapshots where payment_id = '<payment_id>';
--
-- -- 백필 결과 확인:
-- select period_year, period_month, count(*), sum(incentive_amount)
-- from settlement_snapshots
-- where snapshot_type = 'payment'
-- group by period_year, period_month
-- order by period_year, period_month;
