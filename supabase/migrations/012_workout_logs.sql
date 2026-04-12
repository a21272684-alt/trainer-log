-- 개인 운동 세션 (회원이 직접 기록)
create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  trainer_id uuid references trainers(id) on delete cascade,
  title text,
  workout_date date not null,
  duration_min int,
  memo text,
  exercises jsonb default '[]',
  total_volume numeric default 0,
  created_at timestamptz default now()
);
alter table workout_sessions enable row level security;
create policy "allow_all_workout_sessions" on workout_sessions for all using (true) with check (true);

-- 루틴 템플릿 (반복 운동 저장)
create table if not exists workout_routines (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  name text not null,
  exercises jsonb default '[]',
  created_at timestamptz default now()
);
alter table workout_routines enable row level security;
create policy "allow_all_workout_routines" on workout_routines for all using (true) with check (true);
