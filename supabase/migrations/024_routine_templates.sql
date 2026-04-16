-- ============================================================
-- 024_routine_templates.sql
-- 교육자 루틴 템플릿 마켓
--
-- 설계:
--   educator 가 workout_routines 구조와 호환되는 주차별 운동 프로그램을
--   educator_market 에 유·무료로 등록 → 트레이너가 구매 후 회원에게 즉시 적용.
--
-- 기존 호환:
--   workout_routines.exercises  JSONB: [{ name, sets:[{weight,reps,rest_sec}] }]
--   global_exercises.name       → 종목 메타 매칭 키
--   market_purchases            → 구매 이력 (이미 존재)
--   market_item_contents        → preview_day 를 full_content 대신 routine_data 로 저장
--
-- 테이블:
--   routine_templates           — 주차별 구조화 데이터
--   routine_template_applications — 트레이너 → 회원 적용 이력
-- ============================================================

-- ── 1. routine_templates ────────────────────────────────────

create table if not exists routine_templates (
  id             uuid    primary key default gen_random_uuid(),
  -- educator_market community_posts 와 1:1
  post_id        uuid    unique references community_posts(id) on delete cascade,
  -- community_users (educator / instructor)
  seller_id      uuid    not null references community_users(id) on delete cascade,

  -- 프로그램 메타
  goal           text    check (goal in ('strength','hypertrophy','fat_loss','endurance','rehab')),
  level          text    check (level in ('beginner','intermediate','advanced')),
  duration_weeks int     not null default 1 check (duration_weeks between 1 and 52),
  days_per_week  int     not null default 3 check (days_per_week between 1 and 7),
  equipment      text[]  not null default '{}',

  -- 핵심: 주차별 운동 프로그램
  -- 스키마: [{ week, label, days: [{ day, label, focus, estimated_min,
  --            exercises: [{ name, order, sets:[{set,reps,weight_note,rest_sec,rir}], notes }],
  --            day_notes }] }]
  weeks_data     jsonb   not null default '[]',

  -- 구매 전 공개 미리보기 (1일치, workout_routines.exercises 포맷)
  -- [{ name, sets:[{reps,weight_note,rest_sec}] }]
  preview_day    jsonb   not null default '[]',

  -- 적용 통계 (트리거 자동 갱신)
  apply_count    int     not null default 0,

  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table routine_templates enable row level security;
create policy "rt_read"   on routine_templates for select using (true);
create policy "rt_insert" on routine_templates for insert with check (true);
create policy "rt_update" on routine_templates for update using (true);
create policy "rt_delete" on routine_templates for delete using (true);

create index if not exists idx_rt_post     on routine_templates (post_id);
create index if not exists idx_rt_seller   on routine_templates (seller_id);
create index if not exists idx_rt_goal     on routine_templates (goal);
create index if not exists idx_rt_level    on routine_templates (level);
create index if not exists idx_rt_weeks    on routine_templates (duration_weeks);

comment on table routine_templates is
  '교육자가 제작한 주차별 루틴 템플릿. '
  'post_id → community_posts(educator_market) 와 1:1. '
  'weeks_data JSONB 가 핵심 데이터. '
  'workout_routines.exercises 포맷과 호환.';

-- ── 2. routine_template_applications ───────────────────────

create table if not exists routine_template_applications (
  id          uuid    primary key default gen_random_uuid(),
  template_id uuid    not null references routine_templates(id) on delete cascade,
  -- trainers 테이블의 id (trainer app 기준)
  trainer_id  uuid    not null references trainers(id) on delete cascade,
  -- 적용 대상 회원 (null 허용 — "나만의 루틴"으로 저장하는 경우)
  member_id   uuid    references members(id) on delete set null,
  -- 생성된 workout_routines row
  routine_id  uuid    references workout_routines(id) on delete set null,
  -- 적용한 주차 (null = 전체)
  week_number int,
  applied_at  timestamptz default now(),
  unique (template_id, trainer_id, member_id)
);

alter table routine_template_applications enable row level security;
create policy "rta_read"   on routine_template_applications for select using (true);
create policy "rta_insert" on routine_template_applications for insert with check (true);

create index if not exists idx_rta_template on routine_template_applications (template_id);
create index if not exists idx_rta_trainer  on routine_template_applications (trainer_id);
create index if not exists idx_rta_member   on routine_template_applications (member_id);

comment on table routine_template_applications is
  '트레이너가 구매한 루틴 템플릿을 회원에게 적용한 이력. '
  'routine_id 는 생성된 workout_routines.id.';

-- ── 3. apply_count 자동 갱신 트리거 ────────────────────────

create or replace function increment_apply_count()
returns trigger language plpgsql as $$
begin
  update routine_templates
  set apply_count = apply_count + 1,
      updated_at  = now()
  where id = new.template_id;
  return new;
end;
$$;

drop trigger if exists trg_apply_count on routine_template_applications;
create trigger trg_apply_count
  after insert on routine_template_applications
  for each row execute function increment_apply_count();

-- ── 4. updated_at 자동 갱신 트리거 ─────────────────────────

create or replace function set_rt_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rt_updated_at on routine_templates;
create trigger trg_rt_updated_at
  before update on routine_templates
  for each row execute function set_rt_updated_at();

-- ── 5. RPC — 루틴 템플릿 생성 ──────────────────────────────
-- educator 가 community_posts insert 후 호출.
-- post_id 에 해당하는 routine_templates row 를 생성한다.

create or replace function create_routine_template(
  p_post_id        uuid,
  p_seller_id      uuid,    -- community_users.id
  p_goal           text,
  p_level          text,
  p_duration_weeks int,
  p_days_per_week  int,
  p_equipment      text[],
  p_weeks_data     jsonb,
  p_preview_day    jsonb
)
returns uuid
language plpgsql security definer as $$
declare
  v_id uuid;
begin
  -- post 가 educator_market 카테고리인지 확인
  if not exists (
    select 1 from community_posts
    where id = p_post_id and category = 'educator_market' and market_type = 'routine'
  ) then
    raise exception 'post_id 가 educator_market/routine 이 아닙니다';
  end if;

  insert into routine_templates (
    post_id, seller_id, goal, level,
    duration_weeks, days_per_week, equipment,
    weeks_data, preview_day
  ) values (
    p_post_id, p_seller_id, p_goal, p_level,
    p_duration_weeks, p_days_per_week, p_equipment,
    p_weeks_data, p_preview_day
  )
  on conflict (post_id) do update set
    goal           = excluded.goal,
    level          = excluded.level,
    duration_weeks = excluded.duration_weeks,
    days_per_week  = excluded.days_per_week,
    equipment      = excluded.equipment,
    weeks_data     = excluded.weeks_data,
    preview_day    = excluded.preview_day,
    updated_at     = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ── 6. RPC — 루틴 템플릿 상세 조회 ────────────────────────
-- 구매자·판매자·무료 상품만 weeks_data 반환.
-- 미구매자는 preview_day 만 반환.

create or replace function get_routine_template(
  p_post_id          uuid,
  p_buyer_community_id uuid   -- community_users.id (비로그인이면 null)
)
returns jsonb
language plpgsql stable security definer as $$
declare
  v_rt      routine_templates%rowtype;
  v_post    community_posts%rowtype;
  v_has_access boolean := false;
begin
  select * into v_rt   from routine_templates  where post_id = p_post_id;
  select * into v_post from community_posts    where id      = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', '템플릿을 찾을 수 없습니다');
  end if;

  -- 접근 판단: 판매자 | 무료 | 구매자
  if v_rt.seller_id = p_buyer_community_id then
    v_has_access := true;
  elsif v_post.price = 0 then
    v_has_access := true;
  elsif p_buyer_community_id is not null and exists (
    select 1 from market_purchases
    where post_id = p_post_id and buyer_id = p_buyer_community_id
  ) then
    v_has_access := true;
  end if;

  return jsonb_build_object(
    'ok',            true,
    'id',            v_rt.id,
    'post_id',       v_rt.post_id,
    'goal',          v_rt.goal,
    'level',         v_rt.level,
    'duration_weeks',v_rt.duration_weeks,
    'days_per_week', v_rt.days_per_week,
    'equipment',     v_rt.equipment,
    'apply_count',   v_rt.apply_count,
    'has_access',    v_has_access,
    -- 접근 가능 여부에 따라 weeks_data 또는 preview_day 반환
    'weeks_data',    case when v_has_access then v_rt.weeks_data else '[]'::jsonb end,
    'preview_day',   v_rt.preview_day
  );
end;
$$;

-- ── 7. RPC — 트레이너 → 회원 적용 ──────────────────────────
-- weeks_data 중 특정 주차(또는 1주차)를 workout_routines 에 insert.
-- routine_template_applications 에 이력을 기록.

create or replace function apply_routine_to_member(
  p_template_id  uuid,
  p_trainer_id   uuid,   -- trainers.id
  p_member_id    uuid,   -- members.id (null 허용)
  p_week_number  int     default 1
)
returns jsonb
language plpgsql security definer as $$
declare
  v_rt          routine_templates%rowtype;
  v_post        community_posts%rowtype;
  v_week        jsonb;
  v_exercises   jsonb := '[]'::jsonb;
  v_day         jsonb;
  v_routine_id  uuid;
  v_app_id      uuid;
  v_routine_name text;
begin
  select * into v_rt from routine_templates where id = p_template_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '템플릿을 찾을 수 없습니다');
  end if;

  select * into v_post from community_posts where id = v_rt.post_id;

  -- 구매 여부 확인 (무료 or 구매)
  -- trainer 는 community_users 가 아닐 수 있으므로 market_purchases 조회는 스킵.
  -- 프론트엔드에서 이미 검증 후 호출한다는 신뢰 방식 (honor system).

  -- 해당 주차 데이터 추출
  select value into v_week
  from jsonb_array_elements(v_rt.weeks_data) as t(value)
  where (t.value->>'week')::int = p_week_number
  limit 1;

  if v_week is null then
    -- 주차 데이터가 없으면 preview_day 사용
    v_exercises := v_rt.preview_day;
    v_routine_name := v_post.title || ' (미리보기)';
  else
    -- 해당 주차의 모든 운동을 flat하게 합침 (첫 번째 날만)
    select value into v_day
    from jsonb_array_elements(v_week->'days') as t(value)
    order by (t.value->>'day')::int
    limit 1;

    if v_day is not null then
      -- exercises 배열을 workout_routines 포맷으로 변환
      -- { name, sets:[{reps,weight_note,rest_sec,rir}] } → { name, sets:[{weight,reps,rest_sec}] }
      select jsonb_agg(
        jsonb_build_object(
          'name', ex->>'name',
          'sets', (
            select jsonb_agg(
              jsonb_build_object(
                'weight', coalesce(s->>'weight_note', ''),
                'reps',   coalesce(s->>'reps', '10'),
                'rest_sec', coalesce((s->>'rest_sec')::int, 60)
              )
            )
            from jsonb_array_elements(ex->'sets') as s
          )
        )
      )
      into v_exercises
      from jsonb_array_elements(v_day->'exercises') as ex;
    end if;

    v_routine_name := v_post.title
      || ' — ' || coalesce(v_week->>'label', p_week_number || '주차')
      || ' ' || coalesce(v_day->>'label', '');
  end if;

  -- workout_routines insert
  insert into workout_routines (trainer_id, member_id, name, exercises)
  values (p_trainer_id, p_member_id, v_routine_name, coalesce(v_exercises, '[]'::jsonb))
  returning id into v_routine_id;

  -- 적용 이력 기록 (중복이면 update)
  insert into routine_template_applications
    (template_id, trainer_id, member_id, routine_id, week_number)
  values
    (p_template_id, p_trainer_id, p_member_id, v_routine_id, p_week_number)
  on conflict (template_id, trainer_id, member_id)
  do update set
    routine_id  = excluded.routine_id,
    week_number = excluded.week_number,
    applied_at  = now()
  returning id into v_app_id;

  return jsonb_build_object(
    'ok',         true,
    'routine_id', v_routine_id,
    'app_id',     v_app_id
  );
end;
$$;

-- ── 8. RPC — 교육자 루틴 통계 ──────────────────────────────

create or replace function get_educator_routine_stats(p_seller_id uuid)
returns jsonb
language sql stable security definer as $$
  select jsonb_build_object(
    'total_templates', (
      select count(*) from routine_templates where seller_id = p_seller_id
    ),
    'total_sales', (
      select count(*)
      from market_purchases mp
      join routine_templates rt on rt.post_id = mp.post_id
      where rt.seller_id = p_seller_id
    ),
    'total_applies', (
      select coalesce(sum(apply_count), 0)
      from routine_templates where seller_id = p_seller_id
    ),
    'total_revenue', (
      select coalesce(sum(mp.amount_paid), 0)
      from market_purchases mp
      join routine_templates rt on rt.post_id = mp.post_id
      where rt.seller_id = p_seller_id
    ),
    'top_templates', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'title',       cp.title,
          'apply_count', rt.apply_count,
          'sales',       (
            select count(*) from market_purchases
            where post_id = rt.post_id
          ),
          'price',       cp.price,
          'goal',        rt.goal,
          'level',       rt.level
        ) order by rt.apply_count desc
      ), '[]')
      from routine_templates rt
      join community_posts cp on cp.id = rt.post_id
      where rt.seller_id = p_seller_id
      limit 5
    )
  );
$$;

-- ── 9. VIEW — 마켓 루틴 목록 ───────────────────────────────

create or replace view v_routine_market as
  select
    cp.id             as post_id,
    rt.id             as template_id,
    cp.user_id        as seller_community_id,
    cu.name           as seller_name,
    cu.role           as seller_role,
    cu.avatar_url,
    cp.title,
    cp.content        as preview_text,
    cp.price,
    cp.purchase_count,
    cp.tags,
    cp.status,
    rt.goal,
    rt.level,
    rt.duration_weeks,
    rt.days_per_week,
    rt.equipment,
    rt.preview_day,
    rt.apply_count,
    cp.created_at
  from community_posts cp
  join community_users   cu on cu.id = cp.user_id
  join routine_templates rt on rt.post_id = cp.id
  where cp.category = 'educator_market'
    and cp.market_type = 'routine'
  order by cp.created_at desc;

comment on view v_routine_market is
  'educator_market 중 market_type=routine 인 상품만 조회하는 편의 뷰.';

-- ── 10. 검증 쿼리 (참고) ────────────────────────────────────
-- select get_routine_template('<post-uuid>', '<buyer-community-user-uuid>');
-- select apply_routine_to_member('<template-id>', '<trainer-id>', '<member-id>', 1);
-- select get_educator_routine_stats('<seller-community-user-id>');
-- select * from v_routine_market where status = 'active';
