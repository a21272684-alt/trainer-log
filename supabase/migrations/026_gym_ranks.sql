-- 026_gym_ranks.sql
-- 센터별 커스텀 직급 관리
--
-- 기존 trainer_ranks는 시스템 기본값으로 유지하되,
-- 각 센터(gym)는 gym_ranks 테이블에서 자체 직급을 정의하여 사용.
-- trainers.gym_rank_id → gym_ranks.id (센터 직급 우선)
-- trainers.rank         → trainer_ranks.code (글로벌 직급 폴백, 기존 호환)

-- ── 1. 센터별 커스텀 직급 테이블 ──────────────────────────────

create table if not exists gym_ranks (
  id                     uuid    primary key default gen_random_uuid(),
  gym_id                 uuid    not null references gyms(id) on delete cascade,
  label                  text    not null,                           -- 직급 명칭 (자유 입력)
  base_salary            integer not null default 0,                 -- 기본급 (월, 원)
  default_incentive_rate numeric(5,4) not null default 0.10,        -- 기본 인센티브율
  sort_order             integer not null default 0,                 -- 정렬 순서
  created_at             timestamptz default now(),

  unique (gym_id, label)
);

comment on table gym_ranks is
  '센터별 커스텀 직급 마스터. 각 센터가 자체 직급명·기본급·인센티브율을 정의한다.';

alter table gym_ranks enable row level security;
create policy "gym_ranks_read"   on gym_ranks for select using (true);
create policy "gym_ranks_insert" on gym_ranks for insert with check (true);
create policy "gym_ranks_update" on gym_ranks for update using (true);
create policy "gym_ranks_delete" on gym_ranks for delete using (true);

create index if not exists idx_gym_ranks_gym on gym_ranks (gym_id, sort_order);

-- ── 2. trainers 테이블에 gym_rank_id 컬럼 추가 ─────────────────

alter table trainers
  add column if not exists gym_rank_id uuid references gym_ranks(id) on delete set null;

comment on column trainers.gym_rank_id is
  '센터 커스텀 직급 ID (gym_ranks.id). 설정 시 글로벌 rank 보다 우선 표시됨.';

create index if not exists idx_trainers_gym_rank on trainers (gym_rank_id);
