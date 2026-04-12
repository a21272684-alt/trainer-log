-- ============================================================
-- 001_init.sql — 초기 테이블 생성
-- ============================================================

-- 트레이너 테이블
create table if not exists trainers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  phone text not null,
  api_key text,
  created_at timestamp default now()
);

alter table trainers enable row level security;
create policy "trainers_read"   on trainers for select using (true);
create policy "trainers_insert" on trainers for insert with check (true);
create policy "trainers_update" on trainers for update using (true);

-- 회원 테이블
create table if not exists members (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references trainers(id),
  name text not null,
  phone text,
  email text,
  lesson_purpose text default '체형교정',
  total_sessions integer default 0,
  done_sessions integer default 0,
  memo text,
  created_at timestamp default now()
);

alter table members enable row level security;
create policy "members_read"   on members for select using (true);
create policy "members_insert" on members for insert with check (true);
create policy "members_update" on members for update using (true);

-- 수업일지(로그) 테이블
create table if not exists logs (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references trainers(id),
  member_id uuid references members(id),
  content text,
  session_number integer,
  created_at timestamp default now()
);

alter table logs enable row level security;
create policy "logs_read"   on logs for select using (true);
create policy "logs_insert" on logs for insert with check (true);

-- 건강기록 테이블
create table if not exists health_records (
  id uuid default gen_random_uuid() primary key,
  member_id uuid references members(id),
  record_date date not null,
  diet_note text,
  created_at timestamp default now()
);

alter table health_records enable row level security;
create policy "health_read"   on health_records for select using (true);
create policy "health_insert" on health_records for insert with check (true);
create policy "health_update" on health_records for update using (true);
