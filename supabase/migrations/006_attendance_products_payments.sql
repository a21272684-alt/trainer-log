-- ============================================================
-- 006_attendance_products_payments.sql
-- 출석부, 상품, 결제 테이블 추가
-- ============================================================

-- 출석 테이블
create table if not exists attendance (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references trainers(id),
  member_id uuid references members(id),
  attended_date date not null,
  created_at timestamp default now(),
  unique(member_id, attended_date)
);

alter table attendance enable row level security;
create policy "attendance_read"   on attendance for select using (true);
create policy "attendance_insert" on attendance for insert with check (true);
create policy "attendance_delete" on attendance for delete using (true);

-- 상품(패키지) 테이블
create table if not exists products (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references trainers(id),
  name text not null,
  session_count integer not null default 0,
  price_excl_tax integer not null default 0,
  price_incl_tax integer not null default 0,
  memo text,
  created_at timestamp default now()
);

alter table products enable row level security;
create policy "products_read"   on products for select using (true);
create policy "products_insert" on products for insert with check (true);
create policy "products_update" on products for update using (true);
create policy "products_delete" on products for delete using (true);

-- 결제 테이블
create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references trainers(id),
  member_id uuid references members(id),
  product_id uuid references products(id),
  product_name text,
  session_count integer default 0,
  amount integer not null default 0,
  tax_included boolean default false,
  memo text,
  paid_at timestamp default now(),
  created_at timestamp default now()
);

alter table payments enable row level security;
create policy "payments_read"   on payments for select using (true);
create policy "payments_insert" on payments for insert with check (true);
create policy "payments_delete" on payments for delete using (true);
