/**
 * exercises.js — 운동 종목 DB
 *
 * [마이그레이션 현황]
 *   EXERCISE_DB (정적 배열) → Supabase global_exercises 테이블
 *   migration: supabase/migrations/017_global_exercises.sql
 *
 * [하위 호환 전략]
 *   - EXERCISE_DB 정적 배열은 오프라인 폴백 / 즉시 자동완성 캐시로 유지
 *   - fetchExercises()  : Supabase에서 전체 목록 로드 (커스텀 종목 포함)
 *   - searchExercises() : Supabase RPC search_exercises() 호출
 *   - getExerciseMeta() : Supabase RPC get_exercise_meta() 호출
 *     → logs.exercises_data / workout_sessions.exercises JSONB 의 name 기반 매핑
 *
 * [JSONB 스키마 — 변경 없음]
 *   logs.exercises_data      : [{ name, sets:[{reps,rir,feel,weight}] }]
 *   workout_sessions.exercises : [{ name, sets:[{weight,reps,rest_sec}] }]
 *   workout_routines.exercises : [{ name, sets:[{weight,reps,rest_sec}] }]
 */

import { supabase } from './supabase'

// ── 정적 폴백 배열 (오프라인 / 초기 렌더링용) ───────────────────────────────
// Supabase global_exercises 테이블과 동기화된 스냅샷.
// 신규 종목 추가는 017_global_exercises.sql INSERT 후 여기도 함께 추가.
export const EXERCISE_DB = [
  // 가슴
  { name:'벤치프레스',               primary:['가슴'],          secondary:['어깨','삼두'],        eq:'바벨',    category:'가슴' },
  { name:'인클라인 벤치프레스',      primary:['가슴'],          secondary:['어깨','삼두'],        eq:'바벨',    category:'가슴' },
  { name:'덤벨 플라이',              primary:['가슴'],          secondary:['어깨'],               eq:'덤벨',    category:'가슴' },
  { name:'푸시업',                   primary:['가슴'],          secondary:['어깨','삼두','코어'], eq:'맨몸',    category:'가슴' },
  { name:'딥스',                     primary:['가슴','삼두'],   secondary:['어깨'],               eq:'맨몸',    category:'가슴' },
  { name:'케이블 크로스오버',        primary:['가슴'],          secondary:['어깨'],               eq:'케이블',  category:'가슴' },
  { name:'체스트 프레스 머신',       primary:['가슴'],          secondary:['어깨','삼두'],        eq:'머신',    category:'가슴' },
  // 등
  { name:'풀업',                     primary:['등'],            secondary:['이두','어깨'],        eq:'맨몸',    category:'등' },
  { name:'랫풀다운',                 primary:['등'],            secondary:['이두','어깨'],        eq:'케이블',  category:'등' },
  { name:'바벨 로우',                primary:['등'],            secondary:['이두','코어'],        eq:'바벨',    category:'등' },
  { name:'덤벨 로우',                primary:['등'],            secondary:['이두','어깨'],        eq:'덤벨',    category:'등' },
  { name:'시티드 케이블 로우',       primary:['등'],            secondary:['이두'],               eq:'케이블',  category:'등' },
  { name:'데드리프트',               primary:['등','하체'],     secondary:['코어','어깨'],        eq:'바벨',    category:'등' },
  { name:'루마니안 데드리프트',      primary:['하체','등'],     secondary:['코어'],               eq:'바벨',    category:'등' },
  { name:'로잉 머신',                primary:['유산소','등'],   secondary:['이두','하체','코어'], eq:'머신',    category:'유산소' },
  // 어깨
  { name:'바벨 숄더프레스',         primary:['어깨'],          secondary:['삼두'],               eq:'바벨',    category:'어깨' },
  { name:'덤벨 숄더프레스',         primary:['어깨'],          secondary:['삼두'],               eq:'덤벨',    category:'어깨' },
  { name:'레터럴 레이즈',           primary:['어깨'],          secondary:[],                     eq:'덤벨',    category:'어깨' },
  { name:'프론트 레이즈',           primary:['어깨'],          secondary:[],                     eq:'덤벨',    category:'어깨' },
  { name:'페이스풀',                primary:['어깨'],          secondary:['이두'],               eq:'케이블',  category:'어깨' },
  { name:'업라이트 로우',           primary:['어깨'],          secondary:['이두'],               eq:'바벨',    category:'어깨' },
  { name:'리어 델트 플라이',        primary:['어깨'],          secondary:['등'],                 eq:'덤벨',    category:'어깨' },
  // 이두
  { name:'바벨 컬',                 primary:['이두'],          secondary:[],                     eq:'바벨',    category:'이두' },
  { name:'덤벨 컬',                 primary:['이두'],          secondary:[],                     eq:'덤벨',    category:'이두' },
  { name:'해머 컬',                 primary:['이두'],          secondary:[],                     eq:'덤벨',    category:'이두' },
  { name:'케이블 컬',               primary:['이두'],          secondary:[],                     eq:'케이블',  category:'이두' },
  { name:'인클라인 덤벨 컬',        primary:['이두'],          secondary:[],                     eq:'덤벨',    category:'이두' },
  { name:'컨센트레이션 컬',         primary:['이두'],          secondary:[],                     eq:'덤벨',    category:'이두' },
  { name:'프리처 컬',               primary:['이두'],          secondary:[],                     eq:'바벨',    category:'이두' },
  // 삼두
  { name:'케이블 푸시다운',         primary:['삼두'],          secondary:[],                     eq:'케이블',  category:'삼두' },
  { name:'스컬 크러셔',             primary:['삼두'],          secondary:[],                     eq:'바벨',    category:'삼두' },
  { name:'오버헤드 트라이셉스 익스텐션', primary:['삼두'],    secondary:[],                     eq:'덤벨',    category:'삼두' },
  { name:'클로즈그립 벤치프레스',   primary:['삼두','가슴'],   secondary:['어깨'],               eq:'바벨',    category:'삼두' },
  { name:'킥백',                    primary:['삼두'],          secondary:[],                     eq:'덤벨',    category:'삼두' },
  // 하체
  { name:'스쿼트',                  primary:['하체'],          secondary:['코어','등'],          eq:'바벨',    category:'하체' },
  { name:'레그프레스',              primary:['하체'],          secondary:[],                     eq:'머신',    category:'하체' },
  { name:'런지',                    primary:['하체'],          secondary:['코어'],               eq:'맨몸',    category:'하체' },
  { name:'불가리안 스플릿 스쿼트',  primary:['하체'],          secondary:['코어'],               eq:'덤벨',    category:'하체' },
  { name:'레그 익스텐션',           primary:['하체'],          secondary:[],                     eq:'머신',    category:'하체' },
  { name:'레그 컬',                 primary:['하체'],          secondary:[],                     eq:'머신',    category:'하체' },
  { name:'힙쓰러스트',              primary:['하체'],          secondary:['코어'],               eq:'바벨',    category:'하체' },
  { name:'카프 레이즈',             primary:['하체'],          secondary:[],                     eq:'맨몸',    category:'하체' },
  { name:'케틀벨 스윙',             primary:['하체','등'],     secondary:['코어','어깨'],        eq:'케틀벨',  category:'하체' },
  { name:'박스 점프',               primary:['유산소','하체'], secondary:['코어'],               eq:'맨몸',    category:'유산소' },
  // 코어
  { name:'플랭크',                  primary:['코어'],          secondary:['어깨','등'],          eq:'맨몸',    category:'코어' },
  { name:'사이드 플랭크',           primary:['코어'],          secondary:[],                     eq:'맨몸',    category:'코어' },
  { name:'크런치',                  primary:['코어'],          secondary:[],                     eq:'맨몸',    category:'코어' },
  { name:'레그 레이즈',             primary:['코어'],          secondary:[],                     eq:'맨몸',    category:'코어' },
  { name:'러시안 트위스트',         primary:['코어'],          secondary:[],                     eq:'맨몸',    category:'코어' },
  { name:'AB 롤아웃',               primary:['코어'],          secondary:['어깨','등'],          eq:'롤러',    category:'코어' },
  { name:'케이블 크런치',           primary:['코어'],          secondary:[],                     eq:'케이블',  category:'코어' },
  { name:'마운틴 클라이머',         primary:['유산소','코어'], secondary:['어깨'],               eq:'맨몸',    category:'유산소' },
  // 유산소
  { name:'러닝',                    primary:['유산소'],        secondary:['하체'],               eq:'-',       category:'유산소' },
  { name:'자전거 (실내)',            primary:['유산소'],        secondary:['하체'],               eq:'-',       category:'유산소' },
  { name:'줄넘기',                  primary:['유산소'],        secondary:['하체','코어'],        eq:'-',       category:'유산소' },
  { name:'버피',                    primary:['유산소','코어'], secondary:['가슴','어깨'],        eq:'맨몸',    category:'유산소' },
  { name:'점핑잭',                  primary:['유산소'],        secondary:['어깨','하체'],        eq:'맨몸',    category:'유산소' },
  { name:'팔 벌려뛰기',             primary:['유산소'],        secondary:['어깨','하체'],        eq:'맨몸',    category:'유산소' },
  { name:'스텝퍼',                  primary:['유산소','하체'], secondary:[],                     eq:'머신',    category:'유산소' },
  { name:'일립티컬',                primary:['유산소'],        secondary:['하체','코어'],        eq:'머신',    category:'유산소' },
]

// ── DB 행 → EXERCISE_DB 형식 변환 ────────────────────────────────────────────
// global_exercises 테이블의 컬럼명(primary_muscles / secondary_muscles / equipment)을
// 기존 코드가 사용하는 (primary / secondary / eq) 로 매핑
function rowToExercise(row) {
  return {
    name:      row.name,
    primary:   row.primary_muscles   ?? [],
    secondary: row.secondary_muscles ?? [],
    eq:        row.equipment         ?? '-',
    category:  row.category          ?? '',
    is_custom: row.is_custom         ?? false,
    id:        row.id,
  }
}

// ── Supabase 어댑터 함수 ─────────────────────────────────────────────────────

/**
 * Supabase에서 전체 종목 목록 로드 (글로벌 + 사용자 커스텀)
 * 실패 시 EXERCISE_DB 정적 배열 폴백
 *
 * @returns {Promise<Array>} EXERCISE_DB 형식의 종목 배열
 */
export async function fetchExercises() {
  const { data, error } = await supabase
    .from('global_exercises')
    .select('*')
    .order('category')
    .order('name')

  if (error || !data?.length) {
    console.warn('[exercises] Supabase 로드 실패, 정적 폴백 사용:', error?.message)
    return EXERCISE_DB
  }
  return data.map(rowToExercise)
}

/**
 * 자동완성 검색 — Supabase RPC search_exercises() 호출
 * 실패 시 EXERCISE_DB 정적 배열에서 클라이언트 필터링으로 폴백
 *
 * @param {string} query      검색어
 * @param {number} maxResults 최대 결과 수 (기본 10)
 * @returns {Promise<Array>}
 */
export async function searchExercises(query, maxResults = 10) {
  if (!query?.trim()) return []

  const { data, error } = await supabase
    .rpc('search_exercises', { query: query.trim(), max_results: maxResults })

  if (error || !data) {
    // 폴백: 정적 배열 클라이언트 검색
    const q = query.trim()
    return EXERCISE_DB
      .filter(e => e.name.includes(q))
      .slice(0, maxResults)
  }
  return data.map(rowToExercise)
}

/**
 * 종목명으로 메타 조회 — Supabase RPC get_exercise_meta() 호출
 * logs.exercises_data / workout_sessions.exercises JSONB 의 name 기반 호환
 * 실패 시 EXERCISE_DB 정적 배열 폴백
 *
 * @param {string} name 종목명 (JSONB의 name 값과 동일)
 * @returns {Promise<Object|null>} EXERCISE_DB 형식 객체 또는 null
 */
export async function getExerciseMeta(name) {
  if (!name) return null

  const { data, error } = await supabase
    .rpc('get_exercise_meta', { ex_name: name })

  if (error || !data?.length) {
    return EXERCISE_DB.find(e => e.name === name) ?? null
  }
  return rowToExercise(data[0])
}

/**
 * 여러 종목명 일괄 메타 조회 — Supabase RPC get_exercises_bulk() 호출
 * workout_sessions.exercises JSONB 배열 렌더링 시 근육 다이어그램 데이터 일괄 로딩
 *
 * @param {string[]} names 종목명 배열
 * @returns {Promise<Object>} { [name]: exerciseObj } 맵
 */
export async function getExercisesBulk(names) {
  if (!names?.length) return {}

  const { data, error } = await supabase
    .rpc('get_exercises_bulk', { names })

  const rows = (!error && data?.length) ? data.map(rowToExercise) : []

  // 폴백 보완: Supabase에서 못 찾은 이름은 정적 배열에서 채움
  const result = {}
  for (const name of names) {
    const found = rows.find(r => r.name === name)
      ?? EXERCISE_DB.find(e => e.name === name)
      ?? null
    if (found) result[name] = found
  }
  return result
}
