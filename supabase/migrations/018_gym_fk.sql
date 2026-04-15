-- ============================================================
-- 018_gym_fk.sql
-- Gym(센터) 엔티티 FK 관계 설정
--
-- 목표:
--   trainers / members 테이블에 gym_id (FK → gyms) 추가
--   기존 모든 데이터 → default_gym 으로 연결
--
-- 설계 원칙:
--   • gym_id 는 NULLABLE (on delete set null) — 미소속 트레이너/회원 허용
--   • default_gym 은 고정 UUID 사용 → 멱등 실행 보장
--   • members.gym_id 는 trainer 의 gym 을 상속 (트리거 자동 동기화)
--   • 기존 JSONB 구조 / 기존 FK (trainer_id 등) 변경 없음 → 하위 호환 유지
--
-- 관계 다이어그램:
--   gyms (1) ──< trainers (N)  : 한 센터에 여러 트레이너
--   gyms (1) ──< members  (N)  : 한 센터에 여러 회원
--   trainers (1) ──< members (N): 기존 관계 유지 (trainer_id)
--
--   members.gym_id 는 기본값으로 소속 trainer 의 gym_id 를 상속하며,
--   트레이너가 센터를 옮기면 그 센터 소속 회원의 gym_id 도 자동 갱신됨.
-- ============================================================

-- ── 0. 전제: gyms 테이블은 016_gym_structure.sql 에서 생성됨 ─

-- ── 1. default_gym 삽입 ─────────────────────────────────────
-- 고정 UUID: 기존 데이터 연결 기준점. owner_id = NULL (시스템 소유).
-- on conflict do nothing → 재실행해도 안전 (멱등)

insert into gyms (id, name, description, created_at)
values (
  '00000000-0000-0000-0000-000000000001',
  '기본 센터',
  '소속 센터가 지정되지 않은 트레이너/회원의 기본 센터입니다.',
  now()
)
on conflict (id) do nothing;

-- ── 2. trainers 에 gym_id 컬럼 추가 ────────────────────────
-- DEFAULT 설정: 신규 트레이너 등록 시 gym_id 미전달이면 기본 센터로 자동 연결

alter table trainers
  add column if not exists gym_id uuid
    default '00000000-0000-0000-0000-000000000001'
    references gyms(id) on delete set null;

comment on column trainers.gym_id is
  '소속 센터 ID. NULL = 미소속(프리랜서). '
  'default: 00000000-0000-0000-0000-000000000001 (기본 센터)';

create index if not exists idx_trainers_gym_id
  on trainers (gym_id);

-- ── 3. members 에 gym_id 컬럼 추가 ─────────────────────────

alter table members
  add column if not exists gym_id uuid
    references gyms(id) on delete set null;

comment on column members.gym_id is
  '소속 센터 ID. 기본값으로 소속 트레이너의 gym_id 를 상속. '
  'NULL = 미소속. default: 00000000-0000-0000-0000-000000000001 (기본 센터)';

create index if not exists idx_members_gym_id
  on members (gym_id);

-- ── 4. 기존 데이터 → default_gym 연결 ───────────────────────

-- 4-A. 기존 모든 트레이너 → 기본 센터
update trainers
set gym_id = '00000000-0000-0000-0000-000000000001'
where gym_id is null;

-- 4-B. 기존 모든 회원 → 소속 트레이너의 gym_id 상속
--      (트레이너가 없는 고아 회원은 default_gym 으로 직접 연결)
update members m
set gym_id = coalesce(
  (select t.gym_id from trainers t where t.id = m.trainer_id),
  '00000000-0000-0000-0000-000000000001'
)
where m.gym_id is null;

-- ── 5. 트리거 — gym_id 자동 동기화 ─────────────────────────

-- 5-A. 트리거 함수
create or replace function sync_member_gym_on_trainer_update()
returns trigger language plpgsql as $$
begin
  -- 트레이너의 gym_id 가 변경된 경우에만 해당 트레이너의 회원 gym_id 갱신
  if (new.gym_id is distinct from old.gym_id) then
    update members
    set gym_id = new.gym_id
    where trainer_id = new.id;
  end if;
  return new;
end;
$$;

-- 5-B. 트리거 등록 (이미 있으면 교체)
drop trigger if exists trg_sync_member_gym on trainers;
create trigger trg_sync_member_gym
  after update of gym_id on trainers
  for each row
  execute function sync_member_gym_on_trainer_update();

-- 5-C. 트리거 함수 — 신규 회원 등록 시 트레이너 gym 자동 상속
create or replace function inherit_gym_on_member_insert()
returns trigger language plpgsql as $$
begin
  -- gym_id 가 명시되지 않은 경우 트레이너의 gym_id 상속
  if new.gym_id is null and new.trainer_id is not null then
    select gym_id into new.gym_id
    from trainers
    where id = new.trainer_id;
  end if;
  -- 여전히 null 이면 default_gym
  if new.gym_id is null then
    new.gym_id := '00000000-0000-0000-0000-000000000001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inherit_gym_member on members;
create trigger trg_inherit_gym_member
  before insert on members
  for each row
  execute function inherit_gym_on_member_insert();

-- ── 6. 편의 뷰 — 센터별 roster ─────────────────────────────

-- 센터별 트레이너 목록
create or replace view gym_trainers as
  select
    g.id          as gym_id,
    g.name        as gym_name,
    t.id          as trainer_id,
    t.name        as trainer_name,
    t.phone       as trainer_phone,
    t.created_at
  from trainers t
  left join gyms g on g.id = t.gym_id;

-- 센터별 회원 목록 (소속 트레이너 이름 포함)
-- members.gym_id 기준으로 센터 조회 + 소속 트레이너명 LEFT JOIN
create or replace view gym_members as
  select
    m.gym_id,
    g.name        as gym_name,
    m.id          as member_id,
    m.name        as member_name,
    m.phone       as member_phone,
    m.trainer_id,
    t.name        as trainer_name,
    m.suspended,
    m.created_at
  from members m
  left join gyms     g on g.id = m.gym_id
  left join trainers t on t.id = m.trainer_id;

-- ── 7. 헬퍼 함수 ────────────────────────────────────────────

-- 센터 통계 (트레이너 수 / 활성 회원 수 / 전체 회원 수)
create or replace function get_gym_stats(p_gym_id uuid)
returns table (
  trainer_count  bigint,
  active_members bigint,
  total_members  bigint
)
language sql stable security definer as $$
  select
    (select count(*) from trainers where gym_id = p_gym_id)            as trainer_count,
    (select count(*) from members  where gym_id = p_gym_id
       and (suspended is null or suspended = false))                    as active_members,
    (select count(*) from members  where gym_id = p_gym_id)            as total_members;
$$;

-- ── 8. 검증 쿼리 (실행 시 참고용 주석) ─────────────────────
-- select gym_id, count(*) from trainers group by gym_id;
-- select gym_id, count(*) from members  group by gym_id;
-- select * from get_gym_stats('00000000-0000-0000-0000-000000000001');
