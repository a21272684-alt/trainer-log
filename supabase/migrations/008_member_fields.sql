-- 회원 추가 필드
alter table members
  add column if not exists birthdate date,
  add column if not exists address text,
  add column if not exists special_notes text,
  add column if not exists visit_source text,
  add column if not exists visit_source_memo text,
  add column if not exists suspended boolean default false;
