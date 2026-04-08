-- 회원 테이블에 레슨목적 추가
alter table members add column if not exists lesson_purpose text default '체형교정';

-- 구독/결제 테이블 추가
create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references trainers(id),
  plan text not null default 'basic',
  payment_method text not null default '카카오페이',
  amount integer not null default 0,
  paid_at timestamp default now(),
  valid_until date,
  memo text,
  created_at timestamp default now()
);

alter table subscriptions enable row level security;
create policy "subs_read" on subscriptions for select using (true);
create policy "subs_insert" on subscriptions for insert with check (true);
