/**
 * TrainerLog — 통합 권한 구조 (RBAC)
 *
 * ┌──────────────┬──────────────┬──────────────────────────────────────────┐
 * │ 역할         │ 인증 방식    │ 설명                                     │
 * ├──────────────┼──────────────┼──────────────────────────────────────────┤
 * │ trainer      │ 이름+전화    │ 개인 퍼스널 트레이너                     │
 * │ member       │ 이름+전화    │ 피트니스 수강 회원                       │
 * │ gym_owner    │ Google OAuth │ 헬스장 센터 대표·운영자                  │
 * │ educator     │ Google OAuth │ 트레이너 교육강사·자격증 과정 운영자     │
 * │ instructor   │ Google OAuth │ educator 별칭 (기존 데이터 하위 호환)    │
 * └──────────────┴──────────────┴──────────────────────────────────────────┘
 *
 * 포털 접근:
 *   /trainer    → trainer (향후 gym_owner 대표 모드 확장 예정)
 *   /member     → member
 *   /community  → trainer · member · gym_owner · educator · instructor
 *   /report     → 공개 (비인증 포함)
 */

// ── 역할 메타데이터 ──────────────────────────────────────────────────────────
export const ROLE_META = {
  trainer: {
    label:  '트레이너',
    emoji:  '💪',
    color:  '#c8f135',
    auth:   'phone',   // 이름 + 전화 뒷 4자리
    desc:   '퍼스널 트레이너 · 수업일지 작성 및 회원 관리',
    photoRequired: true,
  },
  member: {
    label:  '회원',
    emoji:  '🏃',
    color:  '#4fc3f7',
    auth:   'phone',
    desc:   '피트니스 수강 회원 · 수업일지 열람 및 건강 기록',
    photoRequired: false,
  },
  gym_owner: {
    label:  '헬스장 대표',
    emoji:  '🏢',
    color:  '#e040fb',
    auth:   'google',  // Google OAuth
    desc:   '센터 운영 · 트레이너 채용 · 제휴 활동',
    photoRequired: false,
  },
  educator: {
    label:  '교육강사',
    emoji:  '📚',
    color:  '#ff9800',
    auth:   'google',
    desc:   '트레이너 교육 과정 · 자격증 · 세미나 운영',
    photoRequired: true,
  },
  // 하위 호환: 기존 DB의 'instructor' 값은 educator 와 동일하게 처리
  instructor: {
    label:  '교육강사',
    emoji:  '📚',
    color:  '#ff9800',
    auth:   'google',
    desc:   '트레이너 교육 과정 · 자격증 · 세미나 운영',
    photoRequired: true,
  },
}

// 프로필 사진 필수 역할
export const PHOTO_REQUIRED_ROLES = Object.entries(ROLE_META)
  .filter(([, m]) => m.photoRequired)
  .map(([key]) => key)

// 게시글 상세에서 "전문가" 뱃지를 보여줄 역할
export const PROFESSIONAL_ROLES = ['trainer', 'instructor', 'educator', 'gym_owner']

// ── 포털 접근 권한 ──────────────────────────────────────────────────────────
export const PORTAL_ACCESS = {
  trainer_app: {
    label: '트레이너 앱',
    path:  '/trainer',
    roles: ['trainer'],
    // gym_owner 는 향후 "대표 대시보드" 모드로 확장 예정
    // (현재는 커뮤니티에서 채용·구인만 이용)
    future: ['gym_owner'],
  },
  member_portal: {
    label: '회원 포털',
    path:  '/member',
    roles: ['member'],
  },
  community: {
    label: '커뮤니티',
    path:  '/community',
    roles: ['trainer', 'member', 'gym_owner', 'educator', 'instructor'],
  },
  report: {
    label: '리포트 (공개)',
    path:  '/report',
    roles: '*',   // 인증 불필요
  },
}

// ── 커뮤니티 카테고리 접근 권한 ────────────────────────────────────────────
// view  : 해당 카테고리 게시글을 볼 수 있는 역할
// write : 해당 카테고리에 글을 쓸 수 있는 역할
export const COMMUNITY_ACCESS = {

  // ── 기존 카테고리 ─────────────────────────────────────────────────────────

  trainer_seeks_member: {
    label: '직원 구인',
    desc:  '직원 모집',
    emoji: '💼',
    color: '#c8f135',
    bg:    'rgba(200,241,53,0.12)',
    hint:  '모집 조건, 전문 분야, 근무 지역 등을 적어주세요',
    view:  ['gym_owner', 'trainer'],
    write: ['gym_owner', 'trainer'],
  },

  member_seeks_trainer: {
    label: '나만의 트레이너 찾기',
    desc:  '트레이너 구인',
    emoji: '🏃',
    color: '#4fc3f7',
    bg:    'rgba(79,195,247,0.12)',
    hint:  '원하는 운동 목표, 가능한 시간대, 예산 등을 적어주세요',
    view:  ['member', 'trainer', 'gym_owner'],
    write: ['member'],
  },

  instructor_seeks_student: {
    label: '수강생 구인(교육)',
    desc:  '수강생 모집',
    emoji: '📚',
    color: '#ff9800',
    bg:    'rgba(255,152,0,0.12)',
    hint:  '강의 주제, 대상(트레이너/관장 등), 일정 등을 적어주세요',
    view:  ['trainer', 'member', 'educator', 'instructor', 'gym_owner'],
    write: ['educator', 'instructor'],
  },

  gym_seeks_trainer: {
    label: '트레이너 채용',
    desc:  '채용 공고',
    emoji: '🏢',
    color: '#e040fb',
    bg:    'rgba(224,64,251,0.12)',
    hint:  '센터 위치, 근무 조건, 우대사항 등을 적어주세요',
    view:  ['gym_owner', 'trainer'],
    write: ['gym_owner'],
  },

  trainer_seeks_gym: {
    label: '센터 구직',
    desc:  '근무 센터 구함',
    emoji: '🔍',
    color: '#ff5c5c',
    bg:    'rgba(255,92,92,0.12)',
    hint:  '가능 지역, 경력, 전문 분야 등을 적어주세요',
    view:  ['gym_owner'],
    write: ['trainer'],
  },

  // ── gym_owner 전용 신규 카테고리 ──────────────────────────────────────────

  gym_partnership: {
    label: '센터 제휴·협력',
    desc:  '센터간 협력',
    emoji: '🤝',
    color: '#22c55e',
    bg:    'rgba(34,197,94,0.12)',
    hint:  '제휴 프로그램, 공동 이벤트, 장비 공유 등을 적어주세요',
    view:  ['gym_owner'],
    write: ['gym_owner'],
  },

  // ── educator 전용 신규 카테고리 ───────────────────────────────────────────

  educator_course: {
    label: '교육 과정 홍보',
    desc:  '강의·세미나 모집',
    emoji: '🎓',
    color: '#a78bfa',
    bg:    'rgba(167,139,250,0.12)',
    hint:  '자격증 과정, 세미나, 워크숍 내용을 소개해주세요',
    view:  ['trainer', 'educator', 'instructor', 'gym_owner'],
    write: ['educator', 'instructor'],
  },

  // ── 교육자 마켓 ───────────────────────────────────────────────────────────
  // educator / instructor 가 제작한 루틴·프로그램·콘텐츠를 유·무료로 배포

  educator_market: {
    label: '교육자 마켓',
    desc:  '루틴·프로그램·콘텐츠 판매',
    emoji: '🛒',
    color: '#34d399',
    bg:    'rgba(52,211,153,0.12)',
    hint:  '판매할 루틴, 프로그램, 교육 콘텐츠를 등록해주세요. 미리보기와 전문 콘텐츠를 분리해서 작성해야 합니다.',
    view:  ['trainer', 'member', 'educator', 'instructor', 'gym_owner'],
    write: ['educator', 'instructor'],
    isMarket: true,   // 마켓 전용 플래그 — CommunityPortal 에서 분기 처리
  },
}

// ── 헬퍼 함수 ────────────────────────────────────────────────────────────────

/** 해당 역할이 볼 수 있는 카테고리 키 배열 */
export function getViewableCategories(role) {
  return Object.entries(COMMUNITY_ACCESS)
    .filter(([, cfg]) => cfg.view.includes(role))
    .map(([key]) => key)
}

/** 해당 역할이 쓸 수 있는 카테고리 키 배열 */
export function getWritableCategories(role) {
  return Object.entries(COMMUNITY_ACCESS)
    .filter(([, cfg]) => cfg.write.includes(role))
    .map(([key]) => key)
}

/** 해당 역할이 해당 포털에 접근 가능한지 */
export function canAccessPortal(role, portalKey) {
  const portal = PORTAL_ACCESS[portalKey]
  if (!portal) return false
  if (portal.roles === '*') return true
  return portal.roles.includes(role)
}

/** 역할 메타 반환 (없으면 기본값) */
export function getRoleMeta(role) {
  return ROLE_META[role] ?? {
    label: role, emoji: '❓', color: '#888', auth: 'unknown',
    desc: '', photoRequired: false,
  }
}

/** 두 역할이 같은 권한 그룹인지 (instructor === educator) */
export function isSameRoleGroup(a, b) {
  const normalize = r => (r === 'instructor' ? 'educator' : r)
  return normalize(a) === normalize(b)
}
