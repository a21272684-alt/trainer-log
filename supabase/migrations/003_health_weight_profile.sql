-- ============================================================
-- 003_health_weight_profile.sql
-- 건강기록 체중 컬럼 + 회원 체형 프로필 컬럼 추가
-- ============================================================

-- 건강기록: 공복/저녁 체중, 수면 품질
alter table health_records add column if not exists morning_weight numeric(5,2);
alter table health_records add column if not exists evening_weight numeric(5,2);
alter table health_records add column if not exists sleep_level integer;

-- 회원: 목표/시작 체중, 신체 정보, 특이사항
alter table members add column if not exists target_weight numeric(5,2);
alter table members add column if not exists start_weight numeric(5,2);
alter table members add column if not exists age integer;
alter table members add column if not exists height numeric(5,2);
alter table members add column if not exists special_note text;

-- 회원 업데이트 정책 추가
create policy "members_update2" on members for update using (true);
