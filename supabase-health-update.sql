-- 기존 health_records 테이블에 컬럼 추가
alter table health_records add column if not exists morning_weight numeric(5,2);
alter table health_records add column if not exists evening_weight numeric(5,2);
alter table health_records add column if not exists sleep_level integer;

-- 회원 프로필에 체중 목표 정보 추가
alter table members add column if not exists target_weight numeric(5,2);
alter table members add column if not exists start_weight numeric(5,2);
alter table members add column if not exists age integer;
alter table members add column if not exists height numeric(5,2);
alter table members add column if not exists special_note text;

-- members update policy
create policy "members_update2" on members for update using (true);
