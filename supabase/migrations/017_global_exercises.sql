-- ============================================================
-- 017_global_exercises.sql
-- EXERCISE_DB → Supabase global_exercises 테이블 마이그레이션
--
-- 하위 호환 전략:
--   logs.exercises_data  JSONB : [{ name, sets:[{reps,rir,feel,weight}] }]
--   workout_sessions.exercises JSONB : [{ name, sets:[{weight,reps,rest_sec}] }]
--   workout_routines.exercises JSONB : [{ name, sets:[{weight,reps,rest_sec}] }]
--
--   → 세 테이블 모두 name(text)으로 종목을 참조하므로
--     global_exercises.name 을 KEY로 사용하면 JSONB 수정 없이 호환됨.
--     get_exercise_meta(name) 함수로 어느 JSONB 행에서든 메타 조회 가능.
-- ============================================================

-- ── 1. global_exercises 테이블 ──────────────────────────────

create table if not exists global_exercises (
  id                uuid    primary key default gen_random_uuid(),
  name              text    not null unique,
  primary_muscles   text[]  not null default '{}',
  secondary_muscles text[]  not null default '{}',
  equipment         text    not null default '-',
  -- category : 고수준 분류 (가슴·등·어깨·이두·삼두·하체·코어·유산소·전신)
  -- primary_muscles[1] 에서 파생. 복합 종목은 dominant 근육 기준.
  category          text    not null,
  is_custom         boolean not null default false,
  -- 사용자가 추가한 커스텀 종목의 소유자 (글로벌 종목은 null)
  created_by        uuid    references auth.users(id) on delete set null,
  created_at        timestamptz default now()
);

comment on table global_exercises is
  'src/lib/exercises.js EXERCISE_DB 를 Supabase 로 이전한 전역 운동 종목 테이블. '
  'logs.exercises_data / workout_sessions.exercises / workout_routines.exercises JSONB 와 '
  'name 필드 기반으로 호환됨 (FK 없이 name 텍스트 매칭).';

comment on column global_exercises.is_custom is
  'false = 시스템 제공 글로벌 종목 / true = 사용자 추가 커스텀 종목';

-- ── 2. 인덱스 ───────────────────────────────────────────────

-- 자동완성 prefix 검색 (LIKE 'keyword%')
create index if not exists idx_gex_name_pattern
  on global_exercises using btree (name text_pattern_ops);

-- 근육 그룹 배열 검색 (e.g. primary_muscles @> ARRAY['가슴'])
create index if not exists idx_gex_primary_muscles
  on global_exercises using gin (primary_muscles);

create index if not exists idx_gex_secondary_muscles
  on global_exercises using gin (secondary_muscles);

-- 카테고리 필터
create index if not exists idx_gex_category
  on global_exercises (category);

-- 전문 텍스트 검색 (한글 단순 토크나이저 기반 자동완성 보조)
alter table global_exercises
  add column if not exists name_tsv tsvector
  generated always as (to_tsvector('simple', name)) stored;

create index if not exists idx_gex_tsv
  on global_exercises using gin (name_tsv);

-- ── 3. RLS ──────────────────────────────────────────────────

alter table global_exercises enable row level security;

-- 전체 공개 읽기 (비인증 사용자도 자동완성 가능)
create policy "gex_read_all"
  on global_exercises for select using (true);

-- 커스텀 종목 삽입: 로그인한 본인만
create policy "gex_insert_custom"
  on global_exercises for insert
  with check (is_custom = true and created_by = auth.uid());

-- 커스텀 종목 수정: 본인만
create policy "gex_update_custom"
  on global_exercises for update
  using (is_custom = true and created_by = auth.uid())
  with check (is_custom = true and created_by = auth.uid());

-- 커스텀 종목 삭제: 본인만
create policy "gex_delete_custom"
  on global_exercises for delete
  using (is_custom = true and created_by = auth.uid());

-- ── 4. 헬퍼 함수 ────────────────────────────────────────────

-- 4-A. 이름으로 메타 조회
--   용도: logs.exercises_data / workout_sessions.exercises JSONB 의
--         name 값을 받아 근육·장비 정보를 즉시 조회.
--         클라이언트에서 EXERCISE_DB.find(e=>e.name===name) 를 이 함수로 대체 가능.
create or replace function get_exercise_meta(ex_name text)
returns table (
  name              text,
  primary_muscles   text[],
  secondary_muscles text[],
  equipment         text,
  category          text
)
language sql stable security definer as $$
  select name, primary_muscles, secondary_muscles, equipment, category
  from   global_exercises
  where  global_exercises.name = ex_name
  limit  1;
$$;

-- 4-B. 자동완성 검색 (prefix 우선 → 부분 일치)
--   용도: 운동 이름 입력창의 드롭다운 후보 조회.
--         기존 EXERCISE_DB.filter(e=>e.name.includes(query)) 를 대체.
create or replace function search_exercises(
  query       text,
  max_results int default 10
)
returns setof global_exercises
language sql stable security definer as $$
  select *
  from   global_exercises
  where  name ilike query || '%'      -- prefix 우선
      or name ilike '%' || query || '%' -- 부분 포함
  order by
    case when name ilike query || '%' then 0 else 1 end,  -- prefix 먼저
    is_custom,                                              -- 글로벌 먼저
    name
  limit max_results;
$$;

-- 4-C. JSONB 배열에서 종목명 목록을 받아 메타 일괄 조회
--   용도: workout_sessions.exercises JSONB 를 화면에 렌더링할 때
--         근육 다이어그램 정보 일괄 로딩.
--   example: select * from get_exercises_bulk(ARRAY['벤치프레스','스쿼트'])
create or replace function get_exercises_bulk(names text[])
returns setof global_exercises
language sql stable security definer as $$
  select *
  from   global_exercises
  where  name = any(names)
  order by array_position(names, name);
$$;

-- ── 5. 시드 데이터 — EXERCISE_DB 전체 삽입 ─────────────────
-- on conflict (name) do nothing → 재실행해도 안전 (멱등)

insert into global_exercises (name, primary_muscles, secondary_muscles, equipment, category) values

  -- 가슴 ────────────────────────────────────────────────────
  ('벤치프레스',
    ARRAY['가슴'], ARRAY['어깨','삼두'], '바벨', '가슴'),
  ('인클라인 벤치프레스',
    ARRAY['가슴'], ARRAY['어깨','삼두'], '바벨', '가슴'),
  ('덤벨 플라이',
    ARRAY['가슴'], ARRAY['어깨'], '덤벨', '가슴'),
  ('푸시업',
    ARRAY['가슴'], ARRAY['어깨','삼두','코어'], '맨몸', '가슴'),
  ('딥스',
    ARRAY['가슴','삼두'], ARRAY['어깨'], '맨몸', '가슴'),
  ('케이블 크로스오버',
    ARRAY['가슴'], ARRAY['어깨'], '케이블', '가슴'),
  ('체스트 프레스 머신',
    ARRAY['가슴'], ARRAY['어깨','삼두'], '머신', '가슴'),

  -- 등 ──────────────────────────────────────────────────────
  ('풀업',
    ARRAY['등'], ARRAY['이두','어깨'], '맨몸', '등'),
  ('랫풀다운',
    ARRAY['등'], ARRAY['이두','어깨'], '케이블', '등'),
  ('바벨 로우',
    ARRAY['등'], ARRAY['이두','코어'], '바벨', '등'),
  ('덤벨 로우',
    ARRAY['등'], ARRAY['이두','어깨'], '덤벨', '등'),
  ('시티드 케이블 로우',
    ARRAY['등'], ARRAY['이두'], '케이블', '등'),
  ('데드리프트',
    ARRAY['등','하체'], ARRAY['코어','어깨'], '바벨', '등'),
  ('루마니안 데드리프트',
    ARRAY['하체','등'], ARRAY['코어'], '바벨', '등'),
  ('로잉 머신',
    ARRAY['유산소','등'], ARRAY['이두','하체','코어'], '머신', '유산소'),

  -- 어깨 ────────────────────────────────────────────────────
  ('바벨 숄더프레스',
    ARRAY['어깨'], ARRAY['삼두'], '바벨', '어깨'),
  ('덤벨 숄더프레스',
    ARRAY['어깨'], ARRAY['삼두'], '덤벨', '어깨'),
  ('레터럴 레이즈',
    ARRAY['어깨'], ARRAY[]::text[], '덤벨', '어깨'),
  ('프론트 레이즈',
    ARRAY['어깨'], ARRAY[]::text[], '덤벨', '어깨'),
  ('페이스풀',
    ARRAY['어깨'], ARRAY['이두'], '케이블', '어깨'),
  ('업라이트 로우',
    ARRAY['어깨'], ARRAY['이두'], '바벨', '어깨'),
  ('리어 델트 플라이',
    ARRAY['어깨'], ARRAY['등'], '덤벨', '어깨'),

  -- 이두 ────────────────────────────────────────────────────
  ('바벨 컬',
    ARRAY['이두'], ARRAY[]::text[], '바벨', '이두'),
  ('덤벨 컬',
    ARRAY['이두'], ARRAY[]::text[], '덤벨', '이두'),
  ('해머 컬',
    ARRAY['이두'], ARRAY[]::text[], '덤벨', '이두'),
  ('케이블 컬',
    ARRAY['이두'], ARRAY[]::text[], '케이블', '이두'),
  ('인클라인 덤벨 컬',
    ARRAY['이두'], ARRAY[]::text[], '덤벨', '이두'),
  ('컨센트레이션 컬',
    ARRAY['이두'], ARRAY[]::text[], '덤벨', '이두'),
  ('프리처 컬',
    ARRAY['이두'], ARRAY[]::text[], '바벨', '이두'),

  -- 삼두 ────────────────────────────────────────────────────
  ('케이블 푸시다운',
    ARRAY['삼두'], ARRAY[]::text[], '케이블', '삼두'),
  ('스컬 크러셔',
    ARRAY['삼두'], ARRAY[]::text[], '바벨', '삼두'),
  ('오버헤드 트라이셉스 익스텐션',
    ARRAY['삼두'], ARRAY[]::text[], '덤벨', '삼두'),
  ('클로즈그립 벤치프레스',
    ARRAY['삼두','가슴'], ARRAY['어깨'], '바벨', '삼두'),
  ('킥백',
    ARRAY['삼두'], ARRAY[]::text[], '덤벨', '삼두'),

  -- 하체 ────────────────────────────────────────────────────
  ('스쿼트',
    ARRAY['하체'], ARRAY['코어','등'], '바벨', '하체'),
  ('레그프레스',
    ARRAY['하체'], ARRAY[]::text[], '머신', '하체'),
  ('런지',
    ARRAY['하체'], ARRAY['코어'], '맨몸', '하체'),
  ('불가리안 스플릿 스쿼트',
    ARRAY['하체'], ARRAY['코어'], '덤벨', '하체'),
  ('레그 익스텐션',
    ARRAY['하체'], ARRAY[]::text[], '머신', '하체'),
  ('레그 컬',
    ARRAY['하체'], ARRAY[]::text[], '머신', '하체'),
  ('힙쓰러스트',
    ARRAY['하체'], ARRAY['코어'], '바벨', '하체'),
  ('카프 레이즈',
    ARRAY['하체'], ARRAY[]::text[], '맨몸', '하체'),
  ('케틀벨 스윙',
    ARRAY['하체','등'], ARRAY['코어','어깨'], '케틀벨', '하체'),
  ('박스 점프',
    ARRAY['유산소','하체'], ARRAY['코어'], '맨몸', '유산소'),

  -- 코어 ────────────────────────────────────────────────────
  ('플랭크',
    ARRAY['코어'], ARRAY['어깨','등'], '맨몸', '코어'),
  ('사이드 플랭크',
    ARRAY['코어'], ARRAY[]::text[], '맨몸', '코어'),
  ('크런치',
    ARRAY['코어'], ARRAY[]::text[], '맨몸', '코어'),
  ('레그 레이즈',
    ARRAY['코어'], ARRAY[]::text[], '맨몸', '코어'),
  ('러시안 트위스트',
    ARRAY['코어'], ARRAY[]::text[], '맨몸', '코어'),
  ('AB 롤아웃',
    ARRAY['코어'], ARRAY['어깨','등'], '롤러', '코어'),
  ('케이블 크런치',
    ARRAY['코어'], ARRAY[]::text[], '케이블', '코어'),
  ('마운틴 클라이머',
    ARRAY['유산소','코어'], ARRAY['어깨'], '맨몸', '유산소'),

  -- 유산소 ──────────────────────────────────────────────────
  ('러닝',
    ARRAY['유산소'], ARRAY['하체'], '-', '유산소'),
  ('자전거 (실내)',
    ARRAY['유산소'], ARRAY['하체'], '-', '유산소'),
  ('줄넘기',
    ARRAY['유산소'], ARRAY['하체','코어'], '-', '유산소'),
  ('버피',
    ARRAY['유산소','코어'], ARRAY['가슴','어깨'], '맨몸', '유산소'),
  ('점핑잭',
    ARRAY['유산소'], ARRAY['어깨','하체'], '맨몸', '유산소'),
  ('팔 벌려뛰기',
    ARRAY['유산소'], ARRAY['어깨','하체'], '맨몸', '유산소'),
  ('스텝퍼',
    ARRAY['유산소','하체'], ARRAY[]::text[], '머신', '유산소'),
  ('일립티컬',
    ARRAY['유산소'], ARRAY['하체','코어'], '머신', '유산소')

on conflict (name) do nothing;
