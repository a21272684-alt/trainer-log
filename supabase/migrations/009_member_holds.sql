-- 회원 정지(홀딩) 이력 테이블
create table if not exists member_holds (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  trainer_id uuid references trainers(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text,
  start_date date not null,
  end_date date not null,
  reason text,
  photo_url text,
  created_at timestamptz default now()
);

alter table member_holds enable row level security;
create policy "trainer_holds" on member_holds
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
