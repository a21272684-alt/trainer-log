/**
 * routineTemplates.js
 * 교육자 루틴 템플릿 마켓 — 클라이언트 헬퍼
 *
 * 주요 흐름:
 *   educator  → createRoutineTemplate()  → Supabase RPC
 *   trainer   → getRoutineTemplate()     → weeks_data or preview_day
 *   trainer   → applyRoutineToMember()   → workout_routines 자동 생성
 *   educator  → getEducatorRoutineStats() → 판매·적용 통계
 */

import { supabase } from './supabase'

// ── 상수 ──────────────────────────────────────────────────────

export const ROUTINE_GOALS = [
  { key: 'strength',    label: '근력 향상',   emoji: '🏋️', color: '#c8f135', desc: '1RM 증가 · 파워 향상' },
  { key: 'hypertrophy', label: '근비대',       emoji: '💪', color: '#4fc3f7', desc: '근육량 증가 · 부피 증가' },
  { key: 'fat_loss',    label: '다이어트',     emoji: '🔥', color: '#ff9800', desc: '체지방 감소 · 유산소 강화' },
  { key: 'endurance',   label: '체력 향상',    emoji: '🏃', color: '#22c55e', desc: '심폐 기능 · 근지구력' },
  { key: 'rehab',       label: '재활·교정',    emoji: '🩺', color: '#a78bfa', desc: '부상 회복 · 자세 교정' },
]

export const ROUTINE_LEVELS = [
  { key: 'beginner',     label: '초급',  emoji: '🌱', desc: '운동 경력 0~6개월' },
  { key: 'intermediate', label: '중급',  emoji: '⚡', desc: '운동 경력 6개월~2년' },
  { key: 'advanced',     label: '고급',  emoji: '🔥', desc: '운동 경력 2년 이상' },
]

export const EQUIPMENT_OPTIONS = [
  '바벨', '덤벨', '케이블', '머신', '케틀벨', '바', '맨몸', '밴드', '롤러',
]

export const DAY_LABELS = [
  'Push (가슴·어깨·삼두)',
  'Pull (등·이두)',
  'Legs (하체)',
  'Upper (상체)',
  'Lower (하체)',
  'Full Body (전신)',
  'Core & Cardio',
  '쉬는 날 (Active Rest)',
  '커스텀',
]

// ── 포맷 유틸 ──────────────────────────────────────────────────

/** 빈 주차 객체 생성 */
export function makeEmptyWeek(weekNum) {
  return {
    week:  weekNum,
    label: `${weekNum}주차`,
    days:  [],
  }
}

/** 빈 요일 객체 생성 */
export function makeEmptyDay(dayNum, label = '') {
  return {
    day:           dayNum,
    label:         label || `Day ${dayNum}`,
    focus:         '',
    estimated_min: 60,
    exercises:     [],
    day_notes:     '',
  }
}

/** 빈 종목 객체 생성 */
export function makeEmptyExercise(name = '') {
  return {
    name,
    order: 1,
    sets:  [makeEmptySet(1)],
    notes: '',
  }
}

/** 빈 세트 객체 생성 */
export function makeEmptySet(setNum) {
  return {
    set:         setNum,
    reps:        '10',
    weight_note: '',
    rest_sec:    90,
    rir:         2,
  }
}

/**
 * weeks_data 의 1일차를 workout_routines.exercises 포맷으로 변환
 * (preview_day 생성용 + apply_routine_to_member 프론트 호환)
 */
export function weeksToPreviewDay(weeksData) {
  const firstWeek = weeksData[0]
  if (!firstWeek?.days?.length) return []
  const firstDay = firstWeek.days[0]
  if (!firstDay?.exercises?.length) return []

  return firstDay.exercises.map(ex => ({
    name: ex.name,
    sets: (ex.sets || []).map(s => ({
      weight:   s.weight_note || '',
      reps:     s.reps        || '10',
      rest_sec: s.rest_sec    || 90,
    })),
  }))
}

/**
 * weeks_data 에서 특정 주차·요일을 workout_routines.exercises 포맷으로 변환
 */
export function weekDayToExercises(weeksData, weekNum, dayIdx = 0) {
  const week = weeksData.find(w => w.week === weekNum)
  if (!week?.days?.length) return []
  const day = week.days[dayIdx]
  if (!day?.exercises?.length) return []

  return day.exercises.map(ex => ({
    name: ex.name,
    sets: (ex.sets || []).map(s => ({
      weight:   s.weight_note || '',
      reps:     s.reps        || '10',
      rest_sec: s.rest_sec    || 90,
    })),
  }))
}

/** 루틴의 총 볼륨 세트 수 계산 */
export function countTotalSets(weeksData) {
  let total = 0
  weeksData.forEach(w =>
    w.days?.forEach(d =>
      d.exercises?.forEach(ex =>
        total += (ex.sets?.length || 0)
      )
    )
  )
  return total
}

/** 루틴에서 사용된 근육 그룹 집계 */
export function collectMuscleGroups(weeksData) {
  const muscles = new Set()
  weeksData.forEach(w =>
    w.days?.forEach(d =>
      d.exercises?.forEach(ex => {
        if (ex.primary_muscles) ex.primary_muscles.forEach(m => muscles.add(m))
      })
    )
  )
  return [...muscles]
}

// ── CRUD — 교육자 측 ────────────────────────────────────────

/**
 * 루틴 템플릿 생성
 * community_posts insert 후 바로 호출.
 */
export async function createRoutineTemplate({
  postId,
  sellerCommunityId,
  goal,
  level,
  durationWeeks,
  daysPerWeek,
  equipment,
  weeksData,
}) {
  const previewDay = weeksToPreviewDay(weeksData)

  const { data, error } = await supabase.rpc('create_routine_template', {
    p_post_id:        postId,
    p_seller_id:      sellerCommunityId,
    p_goal:           goal,
    p_level:          level,
    p_duration_weeks: durationWeeks,
    p_days_per_week:  daysPerWeek,
    p_equipment:      equipment,
    p_weeks_data:     weeksData,
    p_preview_day:    previewDay,
  })

  if (error) throw error
  return data   // template UUID
}

/**
 * educator_market 에 루틴 상품 등록 (community_posts + routine_templates 동시 처리)
 */
export async function publishRoutineTemplate({
  sellerCommunityId,
  title,
  previewText,
  price,
  tags,
  goal,
  level,
  durationWeeks,
  daysPerWeek,
  equipment,
  weeksData,
}) {
  // 1) community_posts insert
  const { data: post, error: postErr } = await supabase
    .from('community_posts')
    .insert({
      user_id:     sellerCommunityId,
      category:    'educator_market',
      market_type: 'routine',
      title:       title.trim(),
      content:     previewText.trim(),
      price:       Math.max(0, price),
      tags:        tags?.length ? tags : null,
    })
    .select('id')
    .single()

  if (postErr) throw postErr

  // 2) routine_templates insert via RPC
  const templateId = await createRoutineTemplate({
    postId:           post.id,
    sellerCommunityId,
    goal,
    level,
    durationWeeks,
    daysPerWeek,
    equipment,
    weeksData,
  })

  return { postId: post.id, templateId }
}

// ── CRUD — 조회 ─────────────────────────────────────────────

/**
 * 루틴 템플릿 상세 조회
 * - 구매자·판매자·무료 → weeks_data 전체 반환
 * - 미구매자 → preview_day 만 반환
 */
export async function getRoutineTemplate(postId, buyerCommunityId = null) {
  const { data, error } = await supabase.rpc('get_routine_template', {
    p_post_id:           postId,
    p_buyer_community_id: buyerCommunityId,
  })
  if (error) throw error
  return data   // { ok, id, goal, level, ..., has_access, weeks_data, preview_day }
}

/**
 * 교육자 루틴 통계
 */
export async function getEducatorRoutineStats(sellerCommunityId) {
  const { data, error } = await supabase.rpc('get_educator_routine_stats', {
    p_seller_id: sellerCommunityId,
  })
  if (error) throw error
  return data
}

// ── CRUD — 트레이너 적용 ────────────────────────────────────

/**
 * 구매한 루틴 템플릿을 회원에게 적용
 * workout_routines row 를 자동 생성하고 id 반환
 */
export async function applyRoutineToMember({
  templateId,
  trainerId,          // trainers.id
  memberId = null,
  weekNumber = 1,
}) {
  const { data, error } = await supabase.rpc('apply_routine_to_member', {
    p_template_id: templateId,
    p_trainer_id:  trainerId,
    p_member_id:   memberId,
    p_week_number: weekNumber,
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || '적용 중 오류가 발생했습니다')
  return data   // { ok, routine_id, app_id }
}

/**
 * 트레이너가 구매한 루틴 목록 조회
 */
export async function getMyPurchasedRoutines(buyerCommunityId) {
  const { data, error } = await supabase
    .from('market_purchases')
    .select(`
      *,
      post:community_posts!inner(
        id, title, price, purchase_count, tags, created_at,
        author:community_users(name, role, avatar_url),
        template:routine_templates(
          id, goal, level, duration_weeks, days_per_week,
          equipment, apply_count, preview_day
        )
      )
    `)
    .eq('buyer_id', buyerCommunityId)
    .not('post.market_type', 'is', null)
    .eq('post.market_type', 'routine')
    .order('purchased_at', { ascending: false })

  if (error) throw error
  return (data || []).filter(d => d.post?.template)
}

/**
 * 트레이너가 특정 회원에게 적용한 이력 조회
 */
export async function getAppliedHistory(trainerId, memberId = null) {
  let q = supabase
    .from('routine_template_applications')
    .select(`
      *,
      template:routine_templates(
        id, goal, level, duration_weeks,
        post:community_posts(title, price)
      ),
      routine:workout_routines(id, name, created_at)
    `)
    .eq('trainer_id', trainerId)
    .order('applied_at', { ascending: false })

  if (memberId) q = q.eq('member_id', memberId)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ── UI 헬퍼 ────────────────────────────────────────────────

export function getGoalMeta(key) {
  return ROUTINE_GOALS.find(g => g.key === key) || { label: key, emoji: '❓', color: '#888', desc: '' }
}

export function getLevelMeta(key) {
  return ROUTINE_LEVELS.find(l => l.key === key) || { label: key, emoji: '❓', desc: '' }
}

/** 주차별 총 세트 수 요약 문자열 */
export function summarizeWeek(week) {
  let sets = 0, exercises = 0
  week.days?.forEach(d => {
    d.exercises?.forEach(ex => {
      exercises++
      sets += ex.sets?.length || 0
    })
  })
  return `${week.days?.length || 0}일 · ${exercises}종목 · ${sets}세트`
}
