-- ============================================================
-- 016_gym_structure.sql
-- 헬스장(센터) 구조 + educator 역할 확장
-- ============================================================

-- ── 1. gyms 테이블 ───────────────────────────────────────────
-- gym_owner 가 관리하는 센터 정보
create table if not exists gyms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references community_users(id) on delete cascade,
  name        text not null,
  location    text,
  description text,
  phone       text,
  website     text,
  created_at  timestamptz default now()
);

alter table gyms enable row level security;
create policy "gyms_read"  on gyms for select using (true);
create policy "gyms_write" on gyms for all    using (true) with check (true);

-- ── 2. community_users 에 gym_id 컬럼 추가 ───────────────────
-- 트레이너/회원이 소속 센터를 연결할 수 있음 (선택)
alter table community_users
  add column if not exists gym_id uuid references gyms(id) on delete set null;

-- ── 3. educator 역할 허용 (기존 instructor 유지) ──────────────
-- community_users.role 체크 제약 업데이트
-- (기존 제약이 있으면 제거 후 재생성)
do $$
begin
  -- 기존 check constraint 이름이 다를 수 있으므로 조건부 처리
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'community_users'
      and constraint_type = 'CHECK'
      and constraint_name like '%role%'
  ) then
    execute (
      select 'alter table community_users drop constraint ' || constraint_name
      from information_schema.table_constraints
      where table_name = 'community_users'
        and constraint_type = 'CHECK'
        and constraint_name like '%role%'
      limit 1
    );
  end if;
end $$;

alter table community_users
  add constraint community_users_role_check
  check (role in ('trainer', 'member', 'instructor', 'educator', 'gym_owner'));

-- ── 4. 기존 'instructor' 데이터는 그대로 유지 ────────────────
-- 애플리케이션 레벨에서 instructor === educator 동일하게 처리
-- (permissions.js 의 ROLE_META 에서 두 역할 모두 정의)

-- ── 5. 커뮤니티 카테고리 확장 안내 ──────────────────────────
-- 신규 카테고리 (community_posts.category 값으로 사용):
--   'gym_partnership'  : gym_owner 전용 (센터 제휴·협력)
--   'educator_course'  : educator/instructor 전용 (교육 과정 홍보)
--
-- community_posts 테이블의 category 컬럼은 text 타입이므로
-- 별도 마이그레이션 없이 신규 값 삽입 가능.
-- (기존 check constraint 가 없거나 category 는 자유 text 임)
