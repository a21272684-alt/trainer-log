import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from '@trainer-log/shared/components/common/Modal'
import '../styles/admin.css'

// ── 관리자 자격 (Vite 환경변수) ───────────────────────────────
// 운영 배포 시 반드시 .env / Vercel 환경변수에 다음을 설정할 것:
//   VITE_ADMIN_ID=<관리자 아이디>
//   VITE_ADMIN_PASSWORD=<관리자 비밀번호>
// 미설정 시 폴백 난수 문자열로 동작 → 실 운영 환경에선 절대 통과 불가하도록 함.
const FALLBACK_ADMIN_ID = '__unset_admin_id_' + Math.random().toString(36).slice(2, 14)
const FALLBACK_ADMIN_PW = '__unset_admin_pw_' + Math.random().toString(36).slice(2, 14)
const ADMIN_ID = import.meta.env.VITE_ADMIN_ID || FALLBACK_ADMIN_ID
const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD || FALLBACK_ADMIN_PW

// app_settings 보호용 RPC 토큰 (DB 함수의 하드코딩 토큰과 일치해야 함)
const ADMIN_DB_TOKEN = import.meta.env.VITE_ADMIN_DB_TOKEN || ''

// 무제한 fetch 방어용 페이지 상한
const ADMIN_LOAD_LIMIT = 100

// app_settings 쓰기는 모두 SECURITY DEFINER RPC 경유 (RLS 정책상 anon 직접 upsert 차단됨)
// 객체/배열을 RPC value 로 그대로 전달하면 jsonb 직렬화 단계에서 P0001 unauthorized 로
// 폭발하는 케이스가 보고됨 → 헬퍼에서 강제 JSON.stringify 통일.
//
// RPC 시그니처(SoT 합의): app_settings_admin_upsert(p_key text, p_value text, p_secret text)
// 토큰: 'own-admin-123' 하드코딩. 운영 단계에서 토큰 회전 시 본 상수와 SQL 함수 양쪽을 동시에 갱신할 것.
const ADMIN_RPC_SECRET = 'own-admin-123'

async function adminUpsertSetting(key, value) {
  const safeValue = (value !== null && typeof value === 'object')
    ? JSON.stringify(value)
    : value
  const { data, error } = await supabase.rpc('app_settings_admin_upsert', {
    p_key: key,
    p_value: safeValue,
    p_secret: ADMIN_RPC_SECRET,
  })
  if (error) throw error
  return data
}

async function adminDeleteSetting(key) {
  const { data, error } = await supabase.rpc('app_settings_admin_delete', {
    p_key: key,
    p_admin_token: ADMIN_DB_TOKEN,
  })
  if (error) throw error
  return data
}

// app_settings.value 는 jsonb 또는 string 으로 저장될 수 있어 양형 호환 파싱.
function parseSettingValue(raw) {
  if (raw == null) return null
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return raw }
}

const PORTAL_TABS = {
  // 1:1 문의(support) 탭은 카카오 채널 외부 우회로 완전 폐기 — admin 관리 항목 0건.
  // 자유게시판(free_board) 모더레이션도 제거 — 운영 단순화.
  trainer:   [{ id: 'list', label: '트레이너 목록' }, { id: 'logs', label: '수업일지' }, { id: 'subs', label: '구독 관리' }, { id: 'plans', label: '플랜 관리' }],
  member:    [{ id: 'status', label: '회원 현황' }, { id: 'notices', label: '공지사항 관리' }],
  community: [{ id: 'posts', label: '게시글' }, { id: 'users', label: '유저' }, { id: 'contacts', label: '연락 요청' }, { id: 'market', label: '마켓 거래 관리' }],
  crm:       [{ id: 'permissions', label: '권한 관리' }],
  // landing 은 아래 LANDING_PORTALS / LANDING_TABS 로 2단계 관리
}

const DEFAULT_TAB = { trainer: 'list', member: 'status', community: 'posts', crm: 'permissions', landing: 'hero' }

// ── 기능 게이트 정의 ─────────────────────────────────────────
const FEATURE_DEFS = [
  { key: 'ai_journal', icon: '🤖', label: 'AI 수업일지 생성', desc: '음성·텍스트 → AI 분석 → 수업일지 자동 완성' },
  { key: 'history_tab', icon: '📋', label: '발송기록 탭', desc: '생성된 수업일지 전체 이력 조회' },
  { key: 'revenue_tab', icon: '💰', label: '매출관리 탭', desc: '결제·상품·정산·주간 리포트 전체' },
  { key: 'settlement', icon: '📊', label: '정산 분석', desc: '고용 형태별 자동 정산 계산 (대관·프리랜서·정직원)' },
  { key: 'weekly_report', icon: '📈', label: '주간 AI 리포트', desc: 'AI가 주차별 운영 요약 리포트 자동 생성' },
  { key: 'ai_insight', icon: '🧠', label: 'AI 회원 인사이트', desc: '회원 데이터 기반 AI 분석 및 조언' },
  { key: 'risk_analysis', icon: '⚠️', label: '이탈위험 분석', desc: '회원별 이탈 위험 점수 자동 계산' },
  { key: 'push_notif', icon: '🔔', label: 'Web Push 알림', desc: '브라우저 종료 후에도 수업 전 알림 발송' },
  { key: 'schedule_tab', icon: '📅', label: '시간표 탭', desc: '주간 24시간 수업 일정 블록 관리' },
]

const DEFAULT_FEATURE_GATES = {
  free: {
    ai_journal: false, history_tab: true, revenue_tab: false,
    settlement: false, weekly_report: false, ai_insight: false,
    risk_analysis: false, push_notif: false, schedule_tab: true,
    member_limit: 5,
  },
  paid: {
    ai_journal: true, history_tab: true, revenue_tab: true,
    settlement: true, weekly_report: true, ai_insight: true,
    risk_analysis: true, push_notif: true, schedule_tab: true,
    member_limit: 9999,
  },
}

// ── 랜딩 2단계 네비 ──────────────────────────────────────────
const LANDING_PORTALS = [
  { id: 'main', label: '🌐 메인 랜딩' },
  { id: 'community', label: '🤝 커뮤니티 랜딩' },
  { id: 'crm', label: '🏢 CRM 랜딩' },
]
const LANDING_TABS = {
  main: [
    { id: 'hero', label: '히어로' },
    { id: 'stats', label: '통계 수치' },
    { id: 'problems', label: '문제 인식' },
    { id: 'solutions', label: '솔루션' },
    { id: 'ai_highlight', label: 'AI 하이라이트' },
    { id: 'reviews', label: '트레이너 후기' },
    { id: 'kakao', label: '카카오 메시지' },
    { id: 'targets', label: '타겟 분기' },
    { id: 'members', label: '회원 포털 기능' },
    { id: 'plans', label: '요금제' },
    { id: 'faqs', label: 'FAQ' },
    { id: 'comparison', label: '기능 비교' },
    { id: 'portal_buttons', label: '포털 버튼' },
  ],
  community: [
    { id: 'hero', label: '히어로' },
  ],
  crm: [
    { id: 'hero', label: '히어로' },
    { id: 'features', label: '기능 소개' },
    { id: 'painpoints', label: '페인포인트' },
    { id: 'roadmap', label: '로드맵' },
  ],
}

const DEFAULT_LANDING_STATS = [
  { num: '3분', label: '첫 수업일지 완성까지', sub: '녹음 업로드부터 발송까지' },
  { num: '98%', label: '리포트 평균 열람률', sub: '회원이 실제로 확인하는 일지' },
  { num: '0원', label: '시작 비용', sub: '무료 플랜으로 지금 바로 시작' },
]
const DEFAULT_LANDING_REVIEWS = [
  { name: '김O준 트레이너', location: '서울 마포구 · 1인샵', text: '수업 끝나고 일지 쓰는 게 제일 귀찮았는데, 녹음 올리면 알아서 써줘서 진짜 편해요. 회원들도 리포트 받으면 좋아해서 재등록률이 확실히 올라갔어요.', rating: 5, initial: '김', photo: '', instagram: '' },
  { name: '이O현 트레이너', location: '경기 성남 · 프리랜서', text: '이탈위험 기능이 신기해요. 출석이 줄던 회원한테 미리 연락했더니 "연락 와줘서 감사하다"고 하더라고요. 그 회원 재등록했어요.', rating: 5, initial: '이', photo: '', instagram: '' },
  { name: '박O영 트레이너', location: '부산 해운대 · 센터 소속', text: '매출 계산을 엑셀로 하다가 이걸로 바꿨는데 시간이 확 줄었어요. 세금 계산까지 해주는 건 몰랐는데 정산 탭 보고 깜짝 놀랐어요.', rating: 5, initial: '박', photo: '', instagram: '' },
]
const DEFAULT_LANDING_KAKAO = [
  { from: '회원', text: '트레이너님!! 리포트 너무 자세해서 깜짝 놀랐어요 ㅠㅠ 이렇게까지 신경 써주시다니 감동이에요 🥹', time: '오후 8:23' },
  { from: '회원', text: '오늘 운동 기록 딱 정리돼서 왔네요! 다음 수업도 기대돼요 💪', time: '오후 10:05' },
  { from: '회원', text: '와 선생님 이거 뭐예요?? 제 운동 내용이 다 정리돼있어요 ㅋㅋㅋ 친구한테도 자랑했어요', time: '오후 7:41' },
]
const DEFAULT_LANDING_FAQS = [
  { q: 'AI 수업일지를 만들려면 별도 비용이 드나요?', a: '크레딧 방식으로 운영돼요. 가입 시 기본 크레딧이 지급되며, 크레딧 1개로 AI 수업일지를 1회 생성할 수 있어요. 추가 크레딧은 합리적인 가격으로 충전할 수 있어요.' },
  { q: '회원이 별도로 앱을 설치해야 하나요?', a: '아니요. 회원은 트레이너가 카카오톡으로 보내는 링크를 클릭하기만 하면 돼요. 앱 설치 없이 브라우저에서 바로 수업 리포트를 확인할 수 있어요.' },
  { q: '트레이너 여러 명이 함께 쓸 수 있나요?', a: '현재는 트레이너 개인 계정 단위로 운영돼요. 각 트레이너가 개별 계정을 만들어 사용하면 됩니다.' },
  { q: '기존에 쓰던 데이터를 옮겨올 수 있나요?', a: '현재는 직접 입력 방식만 지원해요. 데이터 마이그레이션 기능은 Pro 플랜과 함께 제공될 예정이에요.' },
  { q: '스마트폰에서도 잘 되나요?', a: '네. 모바일 브라우저에 최적화되어 있어요. 홈 화면에 추가(PWA)하면 앱처럼 사용할 수 있고, 수업 전 푸시 알림도 받을 수 있어요.' },
  { q: 'Pro 플랜 가격은 얼마인가요?', a: '아직 확정되지 않았어요. 얼리어답터분들에게 더 합리적인 가격으로 제공할 예정이에요.' },
]

const DEFAULT_PLANS = [
  { id: 'free', name: 'Free', price: '무료', color: '#9ca3af', highlight: false, current: true, badge: null, enabled: true, features: ['회원 5명', 'AI 일지 월 20회', '식단 기록', '기본 통계'] },
  { id: 'pro', name: 'Pro', price: '₩9,900/월', color: '#60a5fa', highlight: false, current: false, badge: '출시 예정', enabled: true, features: ['회원 무제한', 'AI 일지 무제한', '주간 리포트 AI', '매출 분석'] },
  { id: 'premium', name: 'Premium', price: '₩19,900/월', color: '#c8f135', highlight: true, current: false, badge: '출시 예정', enabled: true, features: ['Pro 전체 포함', '루틴 마켓 무제한', '카카오 자동 발송', '우선 지원'] },
]

const DEFAULT_LANDING_AI_HIGHLIGHT = {
  badge: 'AI POWERED',
  headline: '수업 후 녹음 파일만 올리면\n수업일지가 완성됩니다',
  desc: 'Gemini AI가 음성을 분석해 운동 종목·세트·느낀점을 자동으로 일지로 변환해요.\n완성된 일지는 카카오톡으로 회원에게 즉시 전달됩니다.',
  steps: '녹음 업로드,AI 분석,일지 완성,카카오 발송',
}

const DEFAULT_LANDING_HERO = {
  badge: 'FOR PERSONAL TRAINERS & MEMBERS',
  headline: '좋은 트레이너는',
  highlight: '기록',
  headlineAfter: '으로 증명합니다',
  subheadline: '수업일지 · 회원관리 · 매출분석을 하나의 앱으로',
  desc: 'AI가 수업일지를 대신 쓰고, 회원은 포털에서 기록을 확인해요. 트레이너의 전문성이 데이터로 쌓입니다.',
}
const DEFAULT_LANDING_PROBLEMS = [
  { icon: '😮‍💨', title: '수업 끝나고 일지 쓰는 데 30분씩 쓰고 계신가요?', desc: '운동 종목, 세트 수, 느낀 점… 기억에 의존해서 손으로 하나하나 적다 보면 하루가 다 가요. 정작 다음 회원 준비는 뒷전이 되고요.' },
  { icon: '👻', title: '연락 없이 사라지는 회원, 막을 방법이 없었나요?', desc: '재등록 시기가 됐는데도 아무 신호가 없어요. 출석이 줄고 있다는 걸 알면서도 어떻게 말을 꺼내야 할지 모르죠.' },
  { icon: '📉', title: '이번 달 매출이 얼마인지 바로 답할 수 있나요?', desc: '엑셀도, 메모장도, 카카오톡도 다 따로따로. 세션 단가 × 잔여 횟수 계산을 머릿속으로 하고 계신다면, 이미 시간을 낭비하고 있는 거예요.' },
]
const DEFAULT_LANDING_SOLUTIONS = [
  { icon: '✦', tag: 'AI 수업일지', title: '녹음만 올리면 일지가 완성돼요', desc: 'AI가 수업 내용을 분석해 운동 종목·세트·피드백을 완성된 일지로 만들어줘요. 회원에게는 카카오톡으로 바로 발송.' },
  { icon: '🔔', tag: '이탈위험 감지', title: '이탈 징후를 미리 알려줘요', desc: '출석률·건강기록·수업 평점을 분석해 이탈위험 회원을 자동으로 감지해요. 연락 타이밍을 놓치지 마세요.' },
  { icon: '📊', tag: '매출 자동 분석', title: '매출이 실시간으로 계산돼요', desc: '결제를 등록하면 세션 단가·잔존가치·월 매출이 자동으로 집계돼요. 고용형태별 세금 계산도 지원해요.' },
]
const DEFAULT_LANDING_TARGETS = [
  { type: '1인샵 운영 트레이너', icon: '🏠', color: '#c8f135', textColor: '#3f6212', bg: 'rgba(200,241,53,0.08)', border: 'rgba(200,241,53,0.3)', points: ['혼자 다 하느라 행정에 시간 다 빼앗기는 분', '회원 관리·매출·일지를 하나로 합치고 싶은 분', '더 많은 시간을 수업 품질에 쓰고 싶은 분'] },
  { type: '프리랜서 트레이너', icon: '🧳', color: '#60a5fa', textColor: '#1d4ed8', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.3)', points: ['센터별 회원을 따로 관리하기 복잡한 분', '수수료·세금 계산이 번거로운 분', '이탈 걱정 없이 안정적인 수업을 원하는 분'] },
  { type: '센터 소속 트레이너', icon: '🏢', color: '#a78bfa', textColor: '#7c3aed', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.3)', points: ['재등록률을 높여 인센티브를 늘리고 싶은 분', '회원과의 관계를 전문적으로 보여주고 싶은 분', '주간 리포트로 센터 내 신뢰를 쌓고 싶은 분'] },
]
const DEFAULT_LANDING_MEMBER_FEATURES = [
  { icon: '📋', title: '수업일지 열람', desc: 'PDF 저장·복사로 내 성장 기록을 언제든 꺼내볼 수 있어요' },
  { icon: '⚖️', title: '체중·건강 추적', desc: '공복/저녁 체중, 수면 레벨을 기록하고 14일 추이를 확인' },
  { icon: '🏃', title: '개인운동 일지', desc: '60+ 종목 자동완성, 세트·볼륨 계산, 앞뒤 근육 다이어그램' },
  { icon: '🤝', title: '회원 커뮤니티', desc: '같은 센터 회원들과 운동 일상을 사진·이모지로 공유' },
]
// ── 커뮤니티 포털 랜딩 ──────────────────────────────────────
const DEFAULT_LANDING_COMMUNITY_HERO = {
  badge: 'FITNESS COMMUNITY',
  headline: '피트니스 업계의',
  highlight: '구인·구직 커뮤니티',
  subheadline: '트레이너·회원·교육강사·센터 대표가 함께하는\n피트니스 전문 매칭 플랫폼입니다.',
  cta: 'Google로 시작하기',
}

// ── CRM 포털 랜딩 ────────────────────────────────────────────
const DEFAULT_LANDING_CRM_HERO = {
  badge: 'FOR GYM OWNERS',
  headline1: '헬스장 운영의',
  headline2: '모든 것을 한 곳에',
  subheadline: '트레이너 관리부터 매출 정산, 회원 CRM까지.\n헬스장 원장님을 위한 전용 관리 시스템이에요.',
  cta: 'CRM 포털 입장하기',
}
const DEFAULT_LANDING_CRM_FEATURES = [
  { icon: '💪', title: '트레이너 관리', desc: '소속 트레이너 현황·담당 회원 수·활성 상태를 한눈에 파악해요', color: '#c8f135' },
  { icon: '📊', title: '매출 분석', desc: '트레이너별 수익·정산 현황을 자동으로 집계해 월별 리포트를 제공해요', color: '#e040fb' },
  { icon: '🗂️', title: '회원 CRM', desc: '전체 회원 현황·이탈 위험 분석·재등록 예측으로 매출 공백을 방지해요', color: '#4fc3f7' },
  { icon: '📣', title: '마케팅 도구', desc: '공지·이벤트·프로모션·쿠폰을 회원에게 직접 발송할 수 있어요', color: '#ff9800' },
  { icon: '📋', title: '계약 관리', desc: '트레이너 고용형태·계약서·인센티브 설정을 체계적으로 관리해요', color: '#22c55e' },
  { icon: '⚡', title: '실시간 대시보드', desc: '오늘의 수업 현황·매출·신규 회원을 실시간으로 모니터링해요', color: '#f59e0b' },
]
const DEFAULT_LANDING_CRM_PAINPOINTS = [
  { icon: '😤', text: '트레이너별 매출을 엑셀로 정리하느라 정산일이 두려운 원장님' },
  { icon: '😰', text: '회원이 왜 끊었는지 파악도 못 한 채 신규 마케팅만 하는 센터' },
  { icon: '📱', text: '트레이너와 카톡으로 업무 연락하다 중요한 정보를 놓치는 분' },
  { icon: '📉', text: '비수기에 갑작스러운 매출 급락을 미리 알지 못했던 원장님' },
]
const DEFAULT_LANDING_CRM_ROADMAP = [
  { now: '트레이너 목록 · 회원 현황 조회', coming: '트레이너별 매출 정산 자동화' },
  { now: '소속 트레이너별 회원 수 통계', coming: '회원 이탈 예측 · CRM 알림' },
  { now: '활성 회원 · 신규 회원 KPI', coming: '마케팅 도구 · 쿠폰 발급' },
  { now: '실시간 대시보드', coming: '트레이너 계약 · 고용형태 관리' },
]

const DEFAULT_LANDING_COMPARISON = [
  { feature: 'AI 수업일지 작성', legacy: '수기 메모 · 10~30분', ours: 'AI 자동 생성 · 3분' },
  { feature: '회원 리포트 발송', legacy: '별도 없음', ours: '카카오톡 자동 발송' },
  { feature: '이탈 회원 감지', legacy: '감 또는 직접 연락', ours: 'AI 이탈위험 자동 알림' },
  { feature: '매출 계산', legacy: '엑셀·메모장 수기 집계', ours: '결제 등록 시 자동 집계' },
  { feature: '건강 기록 추적', legacy: '없음', ours: '체중·수면·체성분 추적' },
  { feature: '회원 전용 포털', legacy: '없음', ours: '전용 포털 + 개인운동 일지' },
  { feature: '시작 비용', legacy: '유료 구독 필요', ours: '0원 (무료 플랜)' },
]
const DEFAULT_LANDING_PLANS_LANDING = [
  { name: '무료 플랜', price: '0원', period: '영구 무료', highlight: false, tag: null, features: ['AI 수업일지 월 20회', '회원 관리 (최대 20명)', '수업 리포트 카카오 발송', '체중·건강 기록', '주간 스케줄', '매출 기본 분석'], cta: '무료로 시작하기', ctaLink: '/trainer', note: '결제 수단 등록 불필요' },
  { name: 'Pro 플랜', price: '준비 중', period: '출시 예정', highlight: true, tag: '곧 출시', features: ['AI 수업일지 무제한', '회원 관리 무제한', '이탈위험 자동 감지', '고용형태별 세금 계산', '주간 센터 리포트', '우선 고객 지원'], cta: '출시 알림 받기', ctaLink: 'mailto:support@trainerlog.app?subject=Pro 플랜 출시 알림 신청', note: '얼리어답터 할인 예정' },
]

const COMM_CAT_LABEL = {
  trainer_lesson_recruit: '레슨 회원 모집',
  member_seeks_trainer: '나만의 트레이너 찾기',
  instructor_seeks_student: '수강생 구인',
  gym_seeks_trainer: '트레이너 채용',
  trainer_seeks_gym: '센터 구직',
}

// 커뮤니티 역할 옵션 (권한 설정 모달에서 사용)
const COMM_ROLE_OPTIONS = [
  { key: 'trainer', label: '트레이너', emoji: '💪', color: '#c8f135', desc: '수업일지·구인 작성' },
  { key: 'member', label: '회원', emoji: '🏃', color: '#4fc3f7', desc: '트레이너 찾기 작성' },
  { key: 'gym_owner', label: '헬스장 대표', emoji: '🏢', color: '#e040fb', desc: '채용공고·제휴 작성' },
  { key: 'educator', label: '교육강사', emoji: '📚', color: '#ff9800', desc: '교육과정·마켓 작성' },
]
const COMM_ROLE_LABEL = { trainer: '트레이너', member: '회원', instructor: '교육강사', gym_owner: '헬스장 대표' }

const CAT_COLOR = {
  trainer_lesson_recruit: { bg: 'rgba(200,241,53,0.12)', color: '#c8f135' },
  member_seeks_trainer: { bg: 'rgba(79,195,247,0.12)', color: '#4fc3f7' },
  instructor_seeks_student: { bg: 'rgba(255,152,0,0.12)', color: '#ff9800' },
  gym_seeks_trainer: { bg: 'rgba(224,64,251,0.12)', color: '#e040fb' },
  trainer_seeks_gym: { bg: 'rgba(255,92,92,0.12)', color: '#ff5c5c' },
}

const CRM_FEATURES = [
  { key: 'lead_management', label: '리드 관리' },
  { key: 'client_notes', label: '고객 노트' },
  { key: 'follow_up', label: '팔로업' },
  { key: 'data_export', label: '데이터 내보내기' },
]

export default function AdminPortal() {
  // ─── 자체 Toast 시스템 (admin-main.jsx 진입점은 ToastProvider 미포함 → 자체 구현) ───
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })
  const toastTimerRef = useRef(null)
  const showToast = useCallback((message, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ show: true, message: String(message ?? ''), type })
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }))
    }, 3000)
  }, [])
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  const [loggedIn, setLoggedIn] = useState(false)
  const [adminId, setAdminId] = useState('')
  const [pw, setPw] = useState('')
  const [busyMap, setBusyMap] = useState({}) // 모더레이션 중복 클릭 방어용
  const isBusy = (k) => !!busyMap[k]
  const startBusy = (k) => setBusyMap(prev => ({ ...prev, [k]: true }))
  const endBusy = (k) => setBusyMap(prev => { const n = { ...prev }; delete n[k]; return n })
  const [page, setPage] = useState('dashboard')
  const [subTab, setSubTab] = useState('')
  const [landingSite, setLandingSite] = useState('main') // 'main' | 'community' | 'crm'

  const [trainers, setTrainers] = useState([])
  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState([])
  const [subs, setSubs] = useState([])
  const [commUsers, setCommUsers] = useState([])
  const [commPosts, setCommPosts] = useState([])
  const [commContacts, setCommContacts] = useState([])
  const [marketPurchases, setMarketPurchases] = useState([])

  const [logPeriod, setLogPeriod] = useState('day')
  const [subModal, setSubModal] = useState(false)
  const [trainerModal, setTrainerModal] = useState(null)
  const [subForm, setSubForm] = useState({ trainer_id: '', plan: 'basic', amount: '', payment_method: '카카오페이', paid_at: '', valid_until: '', memo: '' })

  // 트레이너 사전 등록 (화이트리스트)
  const [trainerRegModal, setTrainerRegModal] = useState(false)
  const [trainerRegForm, setTrainerRegForm] = useState({ name: '', email: '' })
  const [trainerRegLoading, setTrainerRegLoading] = useState(false)

  // 플랜 관리
  const [planGuideVisible, setPlanGuideVisible] = useState(true)
  const [plans, setPlans] = useState(DEFAULT_PLANS)
  const [planEditModal, setPlanEditModal] = useState(null)

  // 커뮤니티 유저 권한 관리
  const [commPermModal, setCommPermModal] = useState(null) // community_users row

  // (제거됨) 1:1 문의 관리 — 카카오 채널 외부 우회로 폐기. inquiries 테이블 호출 0건.
  // (제거됨) 자유게시판 관리(freePosts) — admin 모더레이션 폐기.

  // 공지사항 관리
  const [notices, setNotices] = useState([])
  const [noticeModal, setNoticeModal] = useState(false)
  const [noticeEditId, setNoticeEditId] = useState(null)
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', is_pinned: false })

  // 랜딩페이지 관리
  const [landingStats, setLandingStats] = useState(DEFAULT_LANDING_STATS)
  const [landingReviews, setLandingReviews] = useState(DEFAULT_LANDING_REVIEWS)
  const [landingKakao, setLandingKakao] = useState(DEFAULT_LANDING_KAKAO)
  const [landingFaqs, setLandingFaqs] = useState(DEFAULT_LANDING_FAQS)
  const [landingEditModal, setLandingEditModal] = useState(null) // {type, index, data}

  // 랜딩 추가 섹션
  const [landingAiHighlight, setLandingAiHighlight] = useState(DEFAULT_LANDING_AI_HIGHLIGHT)
  const [landingHero, setLandingHero] = useState(DEFAULT_LANDING_HERO)
  const [landingProblems, setLandingProblems] = useState(DEFAULT_LANDING_PROBLEMS)
  const [landingSolutions, setLandingSolutions] = useState(DEFAULT_LANDING_SOLUTIONS)
  const [landingTargets, setLandingTargets] = useState(DEFAULT_LANDING_TARGETS)
  const [landingMemberFeatures, setLandingMemberFeatures] = useState(DEFAULT_LANDING_MEMBER_FEATURES)
  const [landingPlansLanding, setLandingPlansLanding] = useState(DEFAULT_LANDING_PLANS_LANDING)
  const [landingComparison, setLandingComparison] = useState(DEFAULT_LANDING_COMPARISON)

  // 포털 버튼 ON/OFF
  const [landingPortalButtons, setLandingPortalButtons] = useState({ trainer: true, member: true, community: true, crm: true })

  // 커뮤니티·CRM 포털 랜딩
  const [landingCommHero, setLandingCommHero] = useState(DEFAULT_LANDING_COMMUNITY_HERO)
  const [landingCrmHero, setLandingCrmHero] = useState(DEFAULT_LANDING_CRM_HERO)
  const [landingCrmFeatures, setLandingCrmFeatures] = useState(DEFAULT_LANDING_CRM_FEATURES)
  const [landingCrmPainpoints, setLandingCrmPainpoints] = useState(DEFAULT_LANDING_CRM_PAINPOINTS)
  const [landingCrmRoadmap, setLandingCrmRoadmap] = useState(DEFAULT_LANDING_CRM_ROADMAP)

  // 기능 게이트
  const [featureGates, setFeatureGates] = useState(DEFAULT_FEATURE_GATES)

  // 크레딧 / API 키 관리
  const [creditAmount, setCreditAmount] = useState('10')
  const [centralApiKey, setCentralApiKey] = useState('')
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)
  const [urgentInquiryUrl, setUrgentInquiryUrl] = useState('')   // 긴급문의 카카오 오픈채팅 링크

  // 법적 고지 관리 (이용약관 / 개인정보처리방침 / 환불정책)
  const [legalTerms,   setLegalTerms]   = useState('')
  const [legalPrivacy, setLegalPrivacy] = useState('')
  const [legalRefund,  setLegalRefund]  = useState('')
  const [legalSaving,  setLegalSaving]  = useState({ terms: false, privacy: false, refund: false })

  const navigate = (portalId) => {
    setPage(portalId)
    if (DEFAULT_TAB[portalId]) setSubTab(DEFAULT_TAB[portalId])
    if (portalId === 'landing') { setLandingSite('main'); setSubTab('hero') }
  }
  const switchLandingSite = (site) => {
    setLandingSite(site)
    setSubTab(LANDING_TABS[site][0].id)
  }

  const login = () => {
    const inputId = adminId.trim()
    if (!inputId || !pw) { showToast('아이디와 비밀번호를 모두 입력해 주세요'); return }
    if (inputId !== ADMIN_ID || pw !== ADMIN_PW) { showToast('아이디 또는 비밀번호가 틀렸어요'); return }
    setLoggedIn(true)
  }
  const logout = () => { setLoggedIn(false); setAdminId(''); setPw('') }

  useEffect(() => { if (loggedIn) loadAll() }, [loggedIn])

  async function loadAll() {
    try {
      // inquiries / member_posts 조회 제거 — 1:1 문의·자유게시판 관리 기능 폐기
      const [t, m, l, s, cu, cp, cc, settings, ntc] = await Promise.all([
        supabase.from('trainers').select('*').order('created_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
        supabase.from('members').select('*').order('created_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
        supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
        supabase.from('subscriptions').select('*').order('paid_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
        supabase.from('community_users').select('*').order('created_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
        supabase.from('community_posts').select('*, author:community_users(name,role)').order('created_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
        supabase.from('community_contacts').select('*, requester:community_users(name,role), post:community_posts(title)').order('created_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
        // 랜딩 17개 파편 키 → landing_v1 단일 객체로 통합 (N+1 설정 렌더링 폭탄 제거)
        // 'plan_guide_visible', 'plans', 'gemini_api_key', 'feature_gates', 'urgent_inquiry_url'
        // 위 5개는 도메인이 다른 일반 설정이므로 그대로 유지.
        supabase.from('app_settings').select('key, value').in('key', [
          'plan_guide_visible', 'plans', 'gemini_api_key',
          'landing_v1',
          'feature_gates', 'urgent_inquiry_url',
          'legal_terms', 'legal_privacy', 'legal_refund',
        ]).limit(ADMIN_LOAD_LIMIT),
        supabase.from('notices').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(ADMIN_LOAD_LIMIT),
      ])
      setTrainers(t.data || []); setMembers(m.data || []); setLogs(l.data || []); setSubs(s.data || [])
      setCommUsers(cu.data || []); setCommPosts(cp.data || []); setCommContacts(cc.data || [])
      setNotices(ntc.data || [])
      if (settings.data) {
        // 일반 설정 (도메인 분리)
        const vis = settings.data.find(r => r.key === 'plan_guide_visible')
        const plns = settings.data.find(r => r.key === 'plans')
        if (vis?.value != null) {
          // ── String Boolean 함정 방어 ──
          // DB jsonb 컬럼에 'false' / '"false"' / boolean false / null 등 다양하게 저장될 수 있음.
          // parseSettingValue 가 stringified JSON 을 디시리얼라이즈한 뒤
          // 정확히 true 또는 'true' 인 경우에만 ON으로 인정한다. ('false' 문자열은 false로 정규화)
          const parsedVis = parseSettingValue(vis.value)
          const isVisible = (parsedVis === true || parsedVis === 'true')
          setPlanGuideVisible(isVisible)
        }
        if (plns?.value != null) {
          // 저장 시 JSON.stringify 로 직렬화되었을 수 있으므로 안전 파싱
          const parsedPlans = parseSettingValue(plns.value)
          if (Array.isArray(parsedPlans)) setPlans(parsedPlans)
        }

        // 랜딩 단일 통합 키 (landing_v1) → 17개 섹션 분배 (string/object 양형 호환)
        const v1Row = settings.data.find(r => r.key === 'landing_v1')
        const v1Parsed = parseSettingValue(v1Row?.value)
        const v1 = (v1Parsed && typeof v1Parsed === 'object' && !Array.isArray(v1Parsed)) ? v1Parsed : null
        if (v1) {
          if (v1.stats)                       setLandingStats(v1.stats)
          if (v1.reviews)                     setLandingReviews(v1.reviews)
          if (v1.kakao)                       setLandingKakao(v1.kakao)
          if (v1.faqs)                        setLandingFaqs(v1.faqs)
          if (v1.ai_highlight)                setLandingAiHighlight(v1.ai_highlight)
          if (v1.hero)                        setLandingHero(v1.hero)
          if (v1.problems)                    setLandingProblems(v1.problems)
          if (v1.solutions)                   setLandingSolutions(v1.solutions)
          if (v1.targets)                     setLandingTargets(v1.targets)
          if (v1.member_features)             setLandingMemberFeatures(v1.member_features)
          if (v1.plans_landing)               setLandingPlansLanding(v1.plans_landing)
          if (v1.comparison)                  setLandingComparison(v1.comparison)
          if (v1.community_hero)              setLandingCommHero(v1.community_hero)
          if (v1.crm_hero)                    setLandingCrmHero(v1.crm_hero)
          if (Array.isArray(v1.crm_features))   setLandingCrmFeatures(v1.crm_features)
          if (Array.isArray(v1.crm_painpoints)) setLandingCrmPainpoints(v1.crm_painpoints)
          if (Array.isArray(v1.crm_roadmap))    setLandingCrmRoadmap(v1.crm_roadmap)
          if (v1.portal_buttons && typeof v1.portal_buttons === 'object') {
            setLandingPortalButtons(prev => ({ ...prev, ...v1.portal_buttons }))
          }
        }

        // 도메인 분리 설정 (string/object 양형 호환 파싱)
        const fGatesRaw = settings.data.find(r => r.key === 'feature_gates')
        const fGatesParsed = parseSettingValue(fGatesRaw?.value)
        if (fGatesParsed?.free && fGatesParsed?.paid) setFeatureGates(fGatesParsed)

        const apiKeyRow = settings.data.find(r => r.key === 'gemini_api_key')
        const apiKeyParsed = parseSettingValue(apiKeyRow?.value)
        if (apiKeyParsed) setCentralApiKey(String(apiKeyParsed).replace(/^"|"$/g, ''))

        const urgentRow = settings.data.find(r => r.key === 'urgent_inquiry_url')
        const urgentParsed = parseSettingValue(urgentRow?.value)
        if (urgentParsed) setUrgentInquiryUrl(String(urgentParsed).replace(/^"|"$/g, ''))

        // 법적 고지 3종 (이용약관 / 개인정보처리방침 / 환불정책) — string/object 양형 호환
        const pickLegalText = (raw) => {
          const parsed = parseSettingValue(raw)
          if (parsed == null) return ''
          if (typeof parsed === 'string') return parsed
          if (typeof parsed === 'object') return parsed.text || ''
          return String(parsed)
        }
        const legalTermsRow   = settings.data.find(r => r.key === 'legal_terms')
        const legalPrivacyRow = settings.data.find(r => r.key === 'legal_privacy')
        const legalRefundRow  = settings.data.find(r => r.key === 'legal_refund')
        if (legalTermsRow?.value   != null) setLegalTerms(  pickLegalText(legalTermsRow.value))
        if (legalPrivacyRow?.value != null) setLegalPrivacy(pickLegalText(legalPrivacyRow.value))
        if (legalRefundRow?.value  != null) setLegalRefund( pickLegalText(legalRefundRow.value))

        setApiKeyLoaded(true)
      }
    } catch (e) { showToast('데이터 로드 오류: ' + e.message) }
  }

  // 기능 게이트 저장 (RPC 경유 — RLS 정책상 직접 upsert 차단됨)
  async function saveFeatureGates(next) {
    setFeatureGates(next)
    try {
      await adminUpsertSetting('feature_gates', next)
      showToast('✓ 기능 설정 저장됨')
    } catch (e) {
      console.error('기능 설정 저장 오류:', e)
      showToast('오류: ' + (e?.message || '저장 실패'))
    }
  }
  function toggleGate(plan, key) {
    const next = { ...featureGates, [plan]: { ...featureGates[plan], [key]: !featureGates[plan][key] } }
    saveFeatureGates(next)
  }
  function setMemberLimit(plan, val) {
    const n = Math.max(0, parseInt(val) || 0)
    setFeatureGates(prev => ({ ...prev, [plan]: { ...prev[plan], member_limit: n } }))
  }
  function saveMemberLimit() { saveFeatureGates(featureGates) }

  // 크레딧 충전
  async function addTrainerCredits(trainerId, amount) {
    try {
      const { data, error } = await supabase.rpc('admin_add_credits', { p_trainer_id: trainerId, p_amount: amount })
      if (error) throw error
      setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, credits: data } : t))
      showToast(`✓ ${amount}크레딧 충전 완료 (잔액: ${data}개)`)
    } catch (e) { showToast('오류: ' + e.message) }
  }

  // 중앙 API 키 저장 (RPC 경유)
  async function saveCentralApiKey() {
    try {
      await adminUpsertSetting('gemini_api_key', centralApiKey)
      showToast('✓ API 키가 저장됐어요')
    } catch (e) {
      console.error('API 키 저장 오류:', e)
      showToast('오류: ' + (e?.message || '저장 실패'))
    }
  }

  // 긴급문의 링크 저장 (RPC 경유)
  async function saveUrgentInquiryUrl() {
    try {
      await adminUpsertSetting('urgent_inquiry_url', urgentInquiryUrl.trim())
      showToast('✓ 긴급문의 링크가 저장됐어요')
    } catch (e) {
      console.error('긴급문의 링크 저장 오류:', e)
      showToast('오류: ' + (e?.message || '저장 실패'))
    }
  }

  // 법적 고지 저장 (RPC 경유) — kind: 'terms' | 'privacy' | 'refund'
  async function saveLegalDocument(kind) {
    const map = {
      terms:   { key: 'legal_terms',   value: legalTerms,   label: '이용약관' },
      privacy: { key: 'legal_privacy', value: legalPrivacy, label: '개인정보처리방침' },
      refund:  { key: 'legal_refund',  value: legalRefund,  label: '환불정책' },
    }
    const target = map[kind]
    if (!target) return
    if (legalSaving[kind]) return
    setLegalSaving(prev => ({ ...prev, [kind]: true }))
    try {
      await adminUpsertSetting(target.key, target.value)
      showToast(`✓ ${target.label}이(가) 저장됐어요`)
    } catch (e) {
      console.error(`${target.label} 저장 오류:`, e)
      showToast('오류: ' + (e?.message || '저장 실패'))
    } finally {
      setLegalSaving(prev => ({ ...prev, [kind]: false }))
    }
  }

  // ===== COMMUNITY =====
  async function commClosePost(postId) {
    const k = `commClose:${postId}`
    if (isBusy(k)) return
    startBusy(k)
    try {
      const { error } = await supabase.from('community_posts').update({ status: 'closed' }).eq('id', postId)
      if (error) throw error
      setCommPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'closed' } : p))
      showToast('마감 처리했습니다')
    } catch (e) {
      console.error('마감 처리 오류:', e)
      showToast('마감 처리 실패: ' + (e?.message || '네트워크 오류'))
    } finally {
      endBusy(k)
    }
  }

  async function commDeletePost(postId) {
    const k = `commDeletePost:${postId}`
    if (isBusy(k)) return
    if (!window.confirm('게시글을 삭제할까요?')) return
    startBusy(k)
    try {
      const { error } = await supabase.from('community_posts').delete().eq('id', postId)
      if (error) throw error
      setCommPosts(prev => prev.filter(p => p.id !== postId))
      showToast('삭제했습니다')
    } catch (e) {
      console.error('게시글 삭제 오류:', e)
      showToast('삭제 실패: ' + (e?.message || '네트워크 오류'))
    } finally {
      endBusy(k)
    }
  }

  async function commDeleteUser(userId) {
    const k = `commDeleteUser:${userId}`
    if (isBusy(k)) return
    if (!window.confirm('이 유저를 삭제할까요? 작성한 글과 연락 요청도 모두 삭제됩니다.')) return
    startBusy(k)
    try {
      const { error } = await supabase.from('community_users').delete().eq('id', userId)
      if (error) throw error
      setCommUsers(prev => prev.filter(u => u.id !== userId))
      setCommPosts(prev => prev.filter(p => p.author?.id !== userId))
      showToast('유저를 삭제했습니다')
    } catch (e) {
      console.error('유저 삭제 오류:', e)
      showToast('유저 삭제 실패: ' + (e?.message || '네트워크 오류'))
    } finally {
      endBusy(k)
    }
  }
  async function loadMarketPurchases() {
    try {
      const { data, error } = await supabase
        .from('market_purchases')
        .select('*, buyer:community_users!buyer_id(name, role), seller:community_users!seller_id(name, role), item:community_posts!post_id(title, price)')
        .order('purchased_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      setMarketPurchases(data || [])
    } catch (e) {
      showToast('마켓 거래 내역 로드 실패: ' + e.message)
    }
  }

  useEffect(() => {
    if (loggedIn && page === 'community' && subTab === 'market' && marketPurchases.length === 0) {
      loadMarketPurchases()
    }
  }, [loggedIn, page, subTab])

  // ===== 공지사항 =====
  async function saveNotice() {
    if (!noticeForm.title.trim()) { showToast('제목을 입력해주세요'); return }
    if (!noticeForm.content.trim()) { showToast('내용을 입력해주세요'); return }
    try {
      if (noticeEditId) {
        const { error } = await supabase.from('notices')
          .update({ title: noticeForm.title.trim(), content: noticeForm.content.trim(), is_pinned: noticeForm.is_pinned })
          .eq('id', noticeEditId)
        if (error) throw error
        setNotices(prev => prev.map(n => n.id === noticeEditId ? { ...n, ...noticeForm } : n).sort((a, b) => b.is_pinned - a.is_pinned || new Date(b.created_at) - new Date(a.created_at)))
        showToast('✓ 공지사항이 수정됐어요')
      } else {
        const { data, error } = await supabase.from('notices').insert({
          title: noticeForm.title.trim(), content: noticeForm.content.trim(),
          is_pinned: noticeForm.is_pinned, author_name: '관리자',
        }).select().single()
        if (error) throw error
        setNotices(prev => [data, ...prev].sort((a, b) => b.is_pinned - a.is_pinned || new Date(b.created_at) - new Date(a.created_at)))
        showToast('✓ 공지사항이 등록됐어요')
      }
      setNoticeModal(false); setNoticeForm({ title: '', content: '', is_pinned: false }); setNoticeEditId(null)
    } catch (e) { showToast('오류: ' + e.message) }
  }
  async function deleteNotice(noticeId) {
    const k = `deleteNotice:${noticeId}`
    if (isBusy(k)) return
    if (!window.confirm('공지사항을 삭제할까요?')) return
    startBusy(k)
    try {
      const { error } = await supabase.from('notices').delete().eq('id', noticeId)
      if (error) throw error
      setNotices(prev => prev.filter(n => n.id !== noticeId))
      showToast('삭제됐어요')
    } catch (e) {
      console.error('공지사항 삭제 오류:', e)
      showToast('삭제 실패: ' + (e?.message || '네트워크 오류'))
    } finally {
      endBusy(k)
    }
  }
  function openNoticeEdit(notice) {
    setNoticeEditId(notice.id)
    setNoticeForm({ title: notice.title, content: notice.content, is_pinned: notice.is_pinned })
    setNoticeModal(true)
  }

  // (제거됨) 자유게시판 모더레이션(deleteFreeBoardPost) — admin 모더레이션 폐기.

  // ===== 커뮤니티 유저 권한 =====
  async function saveCommUserPerms(userId, newPerms) {
    // admin_permissions 는 jsonb 컬럼 — supabase-js 가 자동 직렬화하므로 객체 그대로 전달.
    // 다만 잘못된 입력(string/array 등)이 들어오면 jsonb 캐스팅 실패하므로 객체로 강제 정규화.
    const safePerms = (newPerms && typeof newPerms === 'object' && !Array.isArray(newPerms))
      ? newPerms
      : {}
    try {
      const { error } = await supabase
        .from('community_users')
        .update({ admin_permissions: safePerms })
        .eq('id', userId)
      if (error) throw error
      setCommUsers(prev => prev.map(u => u.id === userId ? { ...u, admin_permissions: safePerms } : u))
      // 모달 데이터도 동기화
      setCommPermModal(prev => prev ? { ...prev, admin_permissions: safePerms } : null)
      return true
    } catch (e) {
      console.error('권한 저장 오류:', e)
      showToast('오류: ' + (e?.message || '권한 저장 실패'))
      return false
    }
  }
  async function toggleCommBan(userId, banned) {
    const user = commUsers.find(u => u.id === userId)
    const newPerms = { ...(user?.admin_permissions || {}), banned }
    const ok = await saveCommUserPerms(userId, newPerms)
    if (ok) showToast(banned ? '🚫 접근이 차단됐습니다' : '✓ 접근이 허용됐습니다')
  }
  async function toggleExtraRole(userId, roleKey, hasRole) {
    const user = commUsers.find(u => u.id === userId)
    const current = user?.admin_permissions || {}
    const extras = current.extra_roles || []
    const newExtras = hasRole ? extras.filter(r => r !== roleKey) : [...extras, roleKey]
    const newPerms = { ...current, extra_roles: newExtras }
    await saveCommUserPerms(userId, newPerms)
  }

  // (제거됨) 1:1 문의 답변(submitAnswer) — 카카오 채널 외부 우회로 폐기.

  // ===== CRM =====
  async function updateCrmEnabled(trainerId, enabled) {
    const trainer = trainers.find(t => t.id === trainerId)
    const current = trainer?.crm_permissions || {}
    const updated = { ...current, enabled }
    const { error } = await supabase.from('trainers').update({ crm_permissions: updated }).eq('id', trainerId)
    if (error) { showToast('오류: ' + error.message); return }
    setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, crm_permissions: updated } : t))
    showToast(enabled ? 'CRM이 활성화됐어요' : 'CRM이 비활성화됐어요')
  }
  async function updateCrmFeature(trainerId, featureKey, value) {
    const trainer = trainers.find(t => t.id === trainerId)
    const current = trainer?.crm_permissions || {}
    const updated = { ...current, [featureKey]: value }
    const { error } = await supabase.from('trainers').update({ crm_permissions: updated }).eq('id', trainerId)
    if (error) { showToast('오류: ' + error.message); return }
    setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, crm_permissions: updated } : t))
  }

  // ===== 플랜 관리 (RPC 경유) =====
  // RPC value 컬럼이 text 기대 시 boolean 직삽입은 P0001 unauthorized/타입 오류를 유발 → 문자열로 강제 변환.
  async function savePlanVisibility(visible) {
    try {
      const safeValue = visible ? 'true' : 'false'
      await adminUpsertSetting('plan_guide_visible', safeValue)
      setPlanGuideVisible(visible)
      showToast(visible ? '플랜 안내가 표시됩니다' : '플랜 안내가 숨겨집니다')
    } catch (e) {
      console.error('플랜 노출 설정 오류:', e)
      showToast('오류: ' + (e?.message || '저장 실패'))
    }
  }
  async function savePlans(newPlans) {
    try {
      // 객체/배열은 RPC value 로 직접 전달 시 jsonb 캐스팅 실패로 P0001 발생 → 명시적 직렬화.
      const payload = JSON.stringify(Array.isArray(newPlans) ? newPlans : [])
      await adminUpsertSetting('plans', payload)
      setPlans(newPlans)
      showToast('✓ 플랜이 저장됐어요')
    } catch (e) {
      console.error('플랜 저장 오류:', e)
      showToast('오류: ' + (e?.message || '저장 실패'))
    }
  }
  async function togglePlanEnabled(planId) {
    const newPlans = plans.map(p => p.id === planId ? { ...p, enabled: p.enabled === false } : p)
    await savePlans(newPlans)
  }
  const openPlanEdit = (plan) => setPlanEditModal({ ...plan, featuresText: plan.features.join('\n') })
  const closePlanEdit = () => setPlanEditModal(null)

  // ===== LOGS FILTER =====
  const filterLogsByPeriod = (allL, period) => {
    const now = new Date()
    return allL.filter(l => {
      const d = new Date(l.created_at)
      if (period === 'day') return d.toDateString() === now.toDateString()
      if (period === 'week') { const w = new Date(now); w.setDate(now.getDate() - 7); return d >= w }
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      return true
    })
  }

  // ===== 트레이너 사전 등록 (화이트리스트) =====
  async function registerTrainer() {
    const name = trainerRegForm.name.trim()
    const email = trainerRegForm.email.trim()
    if (!name) { alert('이름을 입력해주세요'); return }
    if (!email) { alert('이메일을 입력해주세요'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('올바른 이메일 형식이 아니에요'); return }
    setTrainerRegLoading(true)
    try {
      const { error } = await supabase.from('trainers').insert([{ name, email }])
      if (error) {
        if (error.code === '23505') alert('이미 등록된 이메일이에요')
        else alert('오류: ' + error.message)
        return
      }
      alert('✓ 트레이너가 사전 등록됐어요')
      setTrainerRegModal(false)
      setTrainerRegForm({ name: '', email: '' })
      await loadAll()
    } catch (e) {
      alert('오류: ' + e.message)
    } finally {
      setTrainerRegLoading(false)
    }
  }

  // ===== SUBSCRIPTION =====
  const openAddSub = () => {
    const today = new Date().toISOString().split('T')[0]
    const next = new Date(); next.setMonth(next.getMonth() + 1)
    setSubForm({ ...subForm, paid_at: today, valid_until: next.toISOString().split('T')[0], trainer_id: trainers[0]?.id || '' })
    setSubModal(true)
  }
  const addSubscription = async () => {
    try {
      await supabase.from('subscriptions').insert({
        trainer_id: subForm.trainer_id, plan: subForm.plan, payment_method: subForm.payment_method,
        amount: parseInt(subForm.amount) || 0, paid_at: subForm.paid_at, valid_until: subForm.valid_until, memo: subForm.memo.trim()
      })
      await loadAll(); setSubModal(false); showToast('✓ 결제가 추가됐어요')
    } catch (e) { showToast('오류: ' + e.message) }
  }

  // ===== LOGIN =====
  if (!loggedIn) {
    return (
      <>
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-logo">오운</div>
            <div className="login-badge">ADMIN</div>
            <div className="form-group">
              <label>관리자 아이디</label>
              <input
                type="text"
                autoComplete="username"
                value={adminId}
                onChange={e => setAdminId(e.target.value)}
                placeholder="아이디 입력"
                onKeyDown={e => e.key === 'Enter' && login()}
              />
            </div>
            <div className="form-group">
              <label>관리자 비밀번호</label>
              <input
                type="password"
                autoComplete="current-password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="비밀번호 입력"
                onKeyDown={e => e.key === 'Enter' && login()}
              />
            </div>
            <button className="btn btn-primary btn-full" style={{ marginTop: '8px' }} onClick={login}>관리자 로그인</button>
          </div>
        </div>

        {/* Toast 레이어 — 로그인 화면용 */}
        <div
          role="status"
          aria-live="polite"
          className={`admin-toast${toast.show ? ' admin-toast--show' : ''} admin-toast--${toast.type}`}
        >
          {toast.message}
        </div>
      </>
    )
  }

  // ===== COMPUTED =====
  const today = new Date().toDateString()
  const todayLogs = logs.filter(l => new Date(l.created_at).toDateString() === today)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const activeTrainers = new Set(logs.filter(l => new Date(l.created_at) > weekAgo).map(l => l.trainer_id)).size
  const filteredLogs = filterLogsByPeriod(logs, logPeriod)
  const periodLabel = { day: '오늘', week: '이번 주', month: '이번 달' }[logPeriod]

  const selectedTrainer = trainerModal ? trainers.find(t => t.id === trainerModal) : null
  const stMembers = selectedTrainer ? members.filter(m => m.trainer_id === selectedTrainer.id) : []
  const stLogs = selectedTrainer ? logs.filter(l => l.trainer_id === selectedTrainer.id) : []
  const stSubs = selectedTrainer ? subs.filter(s => s.trainer_id === selectedTrainer.id).sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at)) : []

  // ── 랜딩 저장 헬퍼 (단일 landing_v1 객체 통합 저장) ─────────
  // 17개 파편 키 개별 upsert를 모두 단일 키 1회 upsert로 통합한다.
  // 기존 개별 키들은 더 이상 새로 쓰지 않음 (점진적 마이그레이션).
  const LANDING_FIELD_MAP = {
    landing_hero:             'hero',
    landing_stats:            'stats',
    landing_problems:         'problems',
    landing_solutions:        'solutions',
    landing_ai_highlight:     'ai_highlight',
    landing_reviews:          'reviews',
    landing_kakao:            'kakao',
    landing_targets:          'targets',
    landing_member_features:  'member_features',
    landing_plans_landing:    'plans_landing',
    landing_faqs:             'faqs',
    landing_comparison:       'comparison',
    landing_community_hero:   'community_hero',
    landing_crm_hero:         'crm_hero',
    landing_crm_features:     'crm_features',
    landing_crm_painpoints:   'crm_painpoints',
    landing_crm_roadmap:      'crm_roadmap',
    landing_portal_buttons:   'portal_buttons',
  }

  async function saveLandingV1Bundle(overrides = {}) {
    const bundle = {
      hero:            landingHero,
      stats:           landingStats,
      problems:        landingProblems,
      solutions:       landingSolutions,
      ai_highlight:    landingAiHighlight,
      reviews:         landingReviews,
      kakao:           landingKakao,
      targets:         landingTargets,
      member_features: landingMemberFeatures,
      plans_landing:   landingPlansLanding,
      faqs:            landingFaqs,
      comparison:      landingComparison,
      community_hero:  landingCommHero,
      crm_hero:        landingCrmHero,
      crm_features:    landingCrmFeatures,
      crm_painpoints:  landingCrmPainpoints,
      crm_roadmap:     landingCrmRoadmap,
      portal_buttons:  landingPortalButtons,
      ...overrides,
    }
    // RLS 정책상 anon 직접 upsert 차단 → SECURITY DEFINER RPC 경유
    await adminUpsertSetting('landing_v1', bundle)
  }

  async function saveLandingKey(key, value) {
    const field = LANDING_FIELD_MAP[key]
    if (field) {
      // 랜딩 17개 키는 단일 landing_v1 객체에 통합 저장
      await saveLandingV1Bundle({ [field]: value })
    } else {
      // 비-랜딩(plans, gemini_api_key 등)도 동일하게 RPC 경유
      await adminUpsertSetting(key, value)
    }
  }
  async function saveLandingStats(next) {
    setLandingStats(next)
    await saveLandingKey('landing_stats', next)
    showToast('✓ 통계 수치 저장됨')
  }
  async function saveLandingReviews(next) {
    setLandingReviews(next)
    await saveLandingKey('landing_reviews', next)
    showToast('✓ 후기 저장됨')
  }
  async function saveLandingKakao(next) {
    setLandingKakao(next)
    await saveLandingKey('landing_kakao', next)
    showToast('✓ 메시지 저장됨')
  }
  async function saveLandingFaqs(next) {
    setLandingFaqs(next)
    await saveLandingKey('landing_faqs', next)
    showToast('✓ FAQ 저장됨')
  }
  async function saveLandingAiHighlight(next) { setLandingAiHighlight(next); await saveLandingKey('landing_ai_highlight', next); showToast('✓ AI 하이라이트 저장됨') }
  async function saveLandingHero(next) { setLandingHero(next); await saveLandingKey('landing_hero', next); showToast('✓ 히어로 저장됨') }
  async function saveLandingProblems(next) { setLandingProblems(next); await saveLandingKey('landing_problems', next); showToast('✓ 문제 인식 저장됨') }
  async function saveLandingSolutions(next) { setLandingSolutions(next); await saveLandingKey('landing_solutions', next); showToast('✓ 솔루션 저장됨') }
  async function saveLandingTargets(next) { setLandingTargets(next); await saveLandingKey('landing_targets', next); showToast('✓ 타겟 분기 저장됨') }
  async function saveLandingMemberFeatures(next) { setLandingMemberFeatures(next); await saveLandingKey('landing_member_features', next); showToast('✓ 회원 포털 기능 저장됨') }
  async function saveLandingPlansLanding(next) { setLandingPlansLanding(next); await saveLandingKey('landing_plans_landing', next); showToast('✓ 요금제 저장됨') }
  async function saveLandingComparison(next) { setLandingComparison(next); await saveLandingKey('landing_comparison', next); showToast('✓ 기능 비교 저장됨') }
  async function saveLandingPortalButtons(next) { setLandingPortalButtons(next); await saveLandingKey('landing_portal_buttons', next); showToast('✓ 포털 버튼 설정 저장됨') }
  async function saveLandingCommHero(next) { setLandingCommHero(next); await saveLandingKey('landing_community_hero', next); showToast('✓ 커뮤니티 히어로 저장됨') }
  async function saveLandingCrmHero(next) { setLandingCrmHero(next); await saveLandingKey('landing_crm_hero', next); showToast('✓ CRM 히어로 저장됨') }
  async function saveLandingCrmFeatures(next) { setLandingCrmFeatures(next); await saveLandingKey('landing_crm_features', next); showToast('✓ CRM 기능 저장됨') }
  async function saveLandingCrmPainpoints(next) { setLandingCrmPainpoints(next); await saveLandingKey('landing_crm_painpoints', next); showToast('✓ 페인포인트 저장됨') }
  async function saveLandingCrmRoadmap(next) { setLandingCrmRoadmap(next); await saveLandingKey('landing_crm_roadmap', next); showToast('✓ 로드맵 저장됨') }

  function openLandingEdit(type, index, data) {
    setLandingEditModal({ type, index, data: { ...data } })
  }
  function closeLandingEdit() { setLandingEditModal(null) }
  async function saveLandingEdit() {
    const { type, index, data } = landingEditModal
    if (type === 'stats') {
      const next = landingStats.map((s, i) => i === index ? data : s)
      await saveLandingStats(next)
    } else if (type === 'reviews') {
      const next = index === -1 ? [...landingReviews, data] : landingReviews.map((r, i) => i === index ? data : r)
      await saveLandingReviews(next)
    } else if (type === 'kakao') {
      const next = index === -1 ? [...landingKakao, data] : landingKakao.map((r, i) => i === index ? data : r)
      await saveLandingKakao(next)
    } else if (type === 'faqs') {
      const next = index === -1 ? [...landingFaqs, data] : landingFaqs.map((r, i) => i === index ? data : r)
      await saveLandingFaqs(next)
    } else if (type === 'problems') {
      const next = index === -1 ? [...landingProblems, data] : landingProblems.map((r, i) => i === index ? data : r)
      await saveLandingProblems(next)
    } else if (type === 'solutions') {
      const next = index === -1 ? [...landingSolutions, data] : landingSolutions.map((r, i) => i === index ? data : r)
      await saveLandingSolutions(next)
    } else if (type === 'targets') {
      const next = index === -1 ? [...landingTargets, data] : landingTargets.map((r, i) => i === index ? data : r)
      await saveLandingTargets(next)
    } else if (type === 'members') {
      const next = index === -1 ? [...landingMemberFeatures, data] : landingMemberFeatures.map((r, i) => i === index ? data : r)
      await saveLandingMemberFeatures(next)
    } else if (type === 'landing_plans') {
      const next = index === -1 ? [...landingPlansLanding, data] : landingPlansLanding.map((r, i) => i === index ? data : r)
      await saveLandingPlansLanding(next)
    } else if (type === 'comparison') {
      const next = index === -1 ? [...landingComparison, data] : landingComparison.map((r, i) => i === index ? data : r)
      await saveLandingComparison(next)
    } else if (type === 'crm_features') {
      const next = index === -1 ? [...landingCrmFeatures, data] : landingCrmFeatures.map((r, i) => i === index ? data : r)
      await saveLandingCrmFeatures(next)
    } else if (type === 'crm_painpoints') {
      const next = index === -1 ? [...landingCrmPainpoints, data] : landingCrmPainpoints.map((r, i) => i === index ? data : r)
      await saveLandingCrmPainpoints(next)
    } else if (type === 'crm_roadmap') {
      const next = index === -1 ? [...landingCrmRoadmap, data] : landingCrmRoadmap.map((r, i) => i === index ? data : r)
      await saveLandingCrmRoadmap(next)
    }
    closeLandingEdit()
  }
  async function deleteLandingItem(type, index) {
    if (!window.confirm('삭제할까요?')) return
    if (type === 'reviews') await saveLandingReviews(landingReviews.filter((_, i) => i !== index))
    else if (type === 'kakao') await saveLandingKakao(landingKakao.filter((_, i) => i !== index))
    else if (type === 'faqs') await saveLandingFaqs(landingFaqs.filter((_, i) => i !== index))
    else if (type === 'problems') await saveLandingProblems(landingProblems.filter((_, i) => i !== index))
    else if (type === 'solutions') await saveLandingSolutions(landingSolutions.filter((_, i) => i !== index))
    else if (type === 'targets') await saveLandingTargets(landingTargets.filter((_, i) => i !== index))
    else if (type === 'members') await saveLandingMemberFeatures(landingMemberFeatures.filter((_, i) => i !== index))
    else if (type === 'landing_plans') await saveLandingPlansLanding(landingPlansLanding.filter((_, i) => i !== index))
    else if (type === 'comparison') await saveLandingComparison(landingComparison.filter((_, i) => i !== index))
    else if (type === 'crm_features') await saveLandingCrmFeatures(landingCrmFeatures.filter((_, i) => i !== index))
    else if (type === 'crm_painpoints') await saveLandingCrmPainpoints(landingCrmPainpoints.filter((_, i) => i !== index))
    else if (type === 'crm_roadmap') await saveLandingCrmRoadmap(landingCrmRoadmap.filter((_, i) => i !== index))
  }

  // 카테고리 기반 네비게이션 — 도메인별 4그룹 (대시보드 / 포털 제어 / 운영 설정 / 시스템 & 법적 고지)
  const navGroups = [
    {
      id: 'overview',
      label: '대시보드',
      items: [
        { id: 'dashboard', icon: '📊', label: '통계 / 요약' },
      ],
    },
    {
      id: 'portals',
      label: '포털 제어',
      items: [
        { id: 'trainer',   icon: '💪', label: '트레이너 포털' },
        { id: 'member',    icon: '👥', label: '회원 포털' },
        { id: 'community', icon: '🤝', label: '커뮤니티 포털' },
        { id: 'crm',       icon: '🗂️', label: 'CRM 포털' },
      ],
    },
    {
      id: 'operations',
      label: '운영 설정',
      items: [
        { id: 'landing',  icon: '🌐', label: '랜딩 페이지' },
        { id: 'features', icon: '🔐', label: '기능 게이트 / 플랜' },
      ],
    },
    {
      id: 'system',
      label: '시스템 & 법적 고지',
      items: [
        { id: 'system', icon: '⚙️', label: 'API 키 · 운영 채널' },
        { id: 'legal',  icon: '📜', label: '법적 고지 관리' },
      ],
    },
  ]

  return (
    <div>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">오운</div>
          <div className="admin-badge">ADMIN</div>
        </div>
        <button className="logout-btn" onClick={logout}>로그아웃</button>
      </div>

      <div className="layout">
        {/* SIDEBAR — 카테고리 그룹별 렌더 */}
        <div className="sidebar">
          {navGroups.map((group, gIdx) => (
            <div key={group.id} style={{ marginBottom: gIdx === navGroups.length - 1 ? 0 : '12px' }}>
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map(n => (
                <div
                  key={n.id}
                  className={`nav-item${page === n.id ? ' active' : ''}`}
                  onClick={() => navigate(n.id)}
                >
                  <span className="nav-icon">{n.icon}</span>{n.label}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* CONTENT */}
        <div className="content">

          {/* PORTAL SUB-TABS (landing 제외) */}
          {page !== 'dashboard' && page !== 'landing' && PORTAL_TABS[page] && (
            <div className="portal-tab-bar">
              {PORTAL_TABS[page].map(tab => (
                <button key={tab.id} className={`portal-tab-btn${subTab === tab.id ? ' active' : ''}`} onClick={() => setSubTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* LANDING 2단계 네비 */}
          {page === 'landing' && (
            <>
              {/* Level 1: 포털 선택 */}
              <div className="portal-tab-bar" style={{ background: 'var(--surface-2,#1a1a24)', borderBottom: '2px solid var(--border)' }}>
                {LANDING_PORTALS.map(p => (
                  <button
                    key={p.id}
                    className={`portal-tab-btn${landingSite === p.id ? ' active' : ''}`}
                    style={landingSite === p.id ? { fontWeight: 800 } : {}}
                    onClick={() => switchLandingSite(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {/* Level 2: 섹션 탭 */}
              <div className="portal-tab-bar">
                {LANDING_TABS[landingSite].map(tab => (
                  <button key={tab.id} className={`portal-tab-btn${subTab === tab.id ? ' active' : ''}`} onClick={() => setSubTab(tab.id)}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ==================== DASHBOARD ==================== */}
          {page === 'dashboard' && (
            <div>
              <div className="section-title">대시보드</div>
              <div className="section-label">트레이너 · 회원 현황</div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num">{trainers.length}</div><div className="stat-label">전체 트레이너</div><div className="stat-sub">활성 {activeTrainers}명 / 7일</div></div>
                <div className="stat-card"><div className="stat-num">{members.length}</div><div className="stat-label">전체 회원</div></div>
                <div className="stat-card"><div className="stat-num">{logs.length}</div><div className="stat-label">총 수업일지</div><div className="stat-sub">오늘 {todayLogs.length}건</div></div>
                <div className="stat-card"><div className="stat-num">{subs.length}</div><div className="stat-label">총 결제 건수</div></div>
              </div>
              <div className="section-label">커뮤니티 현황</div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commUsers.length}</div><div className="stat-label">커뮤니티 유저</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commPosts.filter(p => p.status === 'active').length}</div><div className="stat-label">활성 게시글</div><div className="stat-sub">전체 {commPosts.length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commContacts.filter(c => c.status === 'pending').length}</div><div className="stat-label">대기 연락 요청</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commContacts.filter(c => c.status === 'accepted').length}</div><div className="stat-label">매칭 성사</div></div>
              </div>
              <div className="section-label">CRM 현황</div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num" style={{ color: '#a78bfa' }}>{trainers.filter(t => t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 활성 트레이너</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: '#a78bfa' }}>{trainers.length - trainers.filter(t => t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 미사용</div></div>
              </div>
              <div className="section-label">오늘의 활동</div>
              <div className="card">
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  <div><div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>오늘 수업일지</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>{todayLogs.length}건</div></div>
                  <div><div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>이번주 활성 트레이너</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>{activeTrainers}명</div></div>
                  <div><div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>전체 회원 평균 세션</div><div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>{members.length ? Math.round(members.reduce((s, m) => s + m.done_sessions, 0) / members.length) : 0}회</div></div>
                </div>
              </div>
              <div className="section-label">최근 수업일지</div>
              {logs.slice(0, 5).map(l => {
                const trainer = trainers.find(t => t.id === l.trainer_id)
                const member = members.find(m => m.id === l.member_id)
                const d = new Date(l.created_at)
                return (
                  <div className="card" key={l.id} style={{ marginBottom: '8px', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{member?.name || '?'} 회원님 · {l.session_number}회차</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace" }}>{d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>트레이너: {trainer?.name || '?'}</div>
                  </div>
                )
              })}
              {!logs.length && <div className="empty">수업일지가 없어요</div>}
            </div>
          )}

          {/* ==================== 트레이너 포털 ==================== */}
          {page === 'trainer' && subTab === 'list' && (
            <div>
              {/* (이전) 중앙 Gemini API 키 / 긴급문의 카드는 [시스템 & 법적 고지 → API 키·운영 채널] 페이지로 이관됨 */}
              <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                트레이너 목록
                <button className="btn btn-primary btn-sm" onClick={openAddSub}>+ 구독 추가</button>
                <button
                  className="btn btn-sm"
                  style={{ background: 'rgba(200,241,53,0.12)', color: '#c8f135', border: '1px solid rgba(200,241,53,0.3)', fontWeight: 700 }}
                  onClick={() => { setTrainerRegForm({ name: '', email: '' }); setTrainerRegModal(true) }}
                >+ 트레이너 사전 등록</button>
              </div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>트레이너</th><th>회원수</th><th>일지 발송</th><th>크레딧</th><th>가입일</th><th>구독상태</th><th></th></tr></thead>
                  <tbody>
                    {!trainers.length && <tr><td colSpan={6} className="empty">등록된 트레이너가 없어요</td></tr>}
                    {trainers.map(t => {
                      const mc = members.filter(m => m.trainer_id === t.id).length
                      const lc = logs.filter(l => l.trainer_id === t.id).length
                      const sub = subs.filter(s => s.trainer_id === t.id).sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))[0]
                      const isActive = sub && sub.valid_until && new Date(sub.valid_until) > new Date()
                      const joinDate = new Date(t.created_at)
                      return (
                        <tr key={t.id}>
                          <td><div className="name-cell"><div className="avatar">{t.name[0]}</div><div><div style={{ color: 'var(--text)', fontWeight: 500, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>{t.name}{!t.auth_id && <span style={{ backgroundColor: '#F0FDF4', color: '#10B981', border: '1px solid #A7F3D0', borderRadius: '4px', padding: '2px 6px', fontSize: '0.8rem', marginLeft: '8px', fontWeight: 500 }}>사전등록</span>}</div></div></div></td>
                          <td>{mc}명</td>
                          <td>{lc}건</td>
                          <td><span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--accent)' }}>{t.credits ?? 0}</span></td>
                          <td style={{ fontFamily: "'DM Mono',monospace", fontSize: '12px' }}>{joinDate.toLocaleDateString('ko-KR', { year: '2-digit', month: 'short', day: 'numeric' })}<br /><span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{joinDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></td>
                          <td>{isActive ? <span className="badge badge-green">{sub.plan}</span> : <span className="badge badge-red">미구독</span>}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setTrainerModal(t.id)}>상세</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page === 'trainer' && subTab === 'logs' && (
            <div>
              <div className="section-title">수업일지 현황</div>
              <div className="period-tabs">
                {['day', 'week', 'month'].map(p => (
                  <button key={p} className={`period-tab${logPeriod === p ? ' active' : ''}`} onClick={() => setLogPeriod(p)}>
                    {{ day: '오늘', week: '이번 주', month: '이번 달' }[p]}
                  </button>
                ))}
              </div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num">{filteredLogs.length}</div><div className="stat-label">{periodLabel} 발송</div></div>
                <div className="stat-card"><div className="stat-num">{new Set(filteredLogs.map(l => l.trainer_id)).size}</div><div className="stat-label">활성 트레이너</div></div>
                <div className="stat-card"><div className="stat-num">{new Set(filteredLogs.map(l => l.member_id)).size}</div><div className="stat-label">수업 회원</div></div>
              </div>
              <div className="section-label">트레이너별 발송 현황</div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>트레이너</th><th>발송 건수</th><th>마지막 발송</th></tr></thead>
                  <tbody>
                    {trainers.map(t => {
                      const tLogs = filteredLogs.filter(l => l.trainer_id === t.id)
                      const lastLog = logs.filter(l => l.trainer_id === t.id)[0]
                      const lastDate = lastLog ? new Date(lastLog.created_at) : null
                      return (
                        <tr key={t.id}>
                          <td><div className="name-cell"><div className="avatar">{t.name[0]}</div><span style={{ color: 'var(--text)' }}>{t.name}</span></div></td>
                          <td><span style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{tLogs.length}건</span></td>
                          <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{lastDate ? lastDate.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' + lastDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '없음'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page === 'trainer' && subTab === 'subs' && (
            <div>
              <div className="section-title">구독 · 결제 관리 <button className="btn btn-primary btn-sm" onClick={openAddSub}>+ 결제 추가</button></div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>트레이너</th><th>플랜</th><th>결제수단</th><th>금액</th><th>결제일</th><th>만료일</th><th>메모</th></tr></thead>
                  <tbody>
                    {!subs.length && <tr><td colSpan={7} className="empty">결제 내역이 없어요</td></tr>}
                    {subs.map(s => {
                      const trainer = trainers.find(t => t.id === s.trainer_id)
                      const isActive = s.valid_until && new Date(s.valid_until) > new Date()
                      const methodBadge = { '카카오페이': 'badge-yellow', '카드': 'badge-blue', '계좌이체': 'badge-green', '현금': 'badge-blue' }[s.payment_method] || 'badge-blue'
                      return (
                        <tr key={s.id}>
                          <td style={{ color: 'var(--text)', fontWeight: 500 }}>{trainer?.name || '?'}</td>
                          <td><span className={`badge ${isActive ? 'badge-green' : 'badge-red'}`}>{s.plan}</span></td>
                          <td><span className={`badge ${methodBadge}`}>{s.payment_method}</span></td>
                          <td style={{ fontFamily: "'DM Mono',monospace" }}>{s.amount?.toLocaleString()}원</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{s.paid_at?.split('T')[0] || '-'}</td>
                          <td style={{ fontSize: '12px', color: isActive ? 'var(--accent)' : 'var(--danger)' }}>{s.valid_until || '-'}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{s.memo || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== 회원 포털 ==================== */}
          {page === 'member' && subTab === 'status' && (
            <div>
              <div className="section-title">회원 현황</div>
              {!trainers.length && <div className="empty">트레이너가 없어요</div>}
              {trainers.map(t => {
                const tMembers = members.filter(m => m.trainer_id === t.id)
                return (
                  <div className="card" key={t.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="avatar">{t.name[0]}</div>
                        <span style={{ fontWeight: 500 }}>{t.name} 트레이너</span>
                      </div>
                      <span className="badge badge-green">{tMembers.length}명</span>
                    </div>
                    {tMembers.length ? (
                      <div className="table-wrap"><table>
                        <thead><tr><th>이름</th><th>레슨목적</th><th>세션</th><th>전화</th></tr></thead>
                        <tbody>{tMembers.map(m => (
                          <tr key={m.id}>
                            <td style={{ color: 'var(--text)', fontWeight: 500 }}>{m.name}</td>
                            <td><span className="badge badge-blue">{m.lesson_purpose || '미설정'}</span></td>
                            <td style={{ fontFamily: "'DM Mono',monospace" }}>{m.done_sessions}/{m.total_sessions}</td>
                            <td style={{ color: 'var(--text-dim)' }}>***{m.phone}</td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    ) : <div style={{ color: 'var(--text-dim)', fontSize: '13px', padding: '8px 0' }}>회원이 없어요</div>}
                  </div>
                )
              })}
            </div>
          )}

          {/* ==================== 회원 포털 > 공지사항 관리 ==================== */}
          {page === 'member' && subTab === 'notices' && (
            <div>
              <div className="section-title">
                공지사항 관리
                <button className="btn btn-primary btn-sm" style={{ marginLeft: '12px' }}
                  onClick={() => { setNoticeEditId(null); setNoticeForm({ title: '', content: '', is_pinned: false }); setNoticeModal(true) }}>
                  + 공지 작성
                </button>
              </div>
              {!notices.length && <div className="empty">등록된 공지사항이 없어요</div>}
              {notices.map(notice => {
                const d = new Date(notice.created_at)
                return (
                  <div className="card" key={notice.id} style={{ marginBottom: '10px', borderLeft: notice.is_pinned ? '3px solid var(--accent)' : '3px solid transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          {notice.is_pinned && <span className="badge badge-yellow" style={{ fontSize: '10px' }}>📌 고정</span>}
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{notice.title}</div>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>{notice.content}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace" }}>
                          {notice.author_name} · {d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openNoticeEdit(notice)}>수정</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={isBusy(`deleteNotice:${notice.id}`)} onClick={() => deleteNotice(notice.id)}>삭제</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* (제거됨) 회원 포털 > 자유게시판 관리 — admin 모더레이션 폐기 */}

          {/* (제거됨) 트레이너 포털 > 1:1 문의 — 카카오 채널 외부 우회로 폐기 */}

          {/* ==================== 커뮤니티 포털 ==================== */}
          {page === 'community' && (
            <div>
              <div className="stat-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commUsers.length}</div><div className="stat-label">전체 유저</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commPosts.filter(p => p.status === 'active').length}</div><div className="stat-label">활성 게시글</div><div className="stat-sub">전체 {commPosts.length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commContacts.filter(c => c.status === 'pending').length}</div><div className="stat-label">대기 연락</div><div className="stat-sub">수락 {commContacts.filter(c => c.status === 'accepted').length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: '#4fc3f7' }}>{commContacts.filter(c => c.status === 'accepted').length}</div><div className="stat-label">매칭 성사</div></div>
              </div>

              {subTab === 'posts' && (
                <div className="card table-wrap">
                  <table>
                    <thead><tr><th>제목</th><th>카테고리</th><th>작성자</th><th>연락수</th><th>상태</th><th>작성일</th><th></th></tr></thead>
                    <tbody>
                      {!commPosts.length && <tr><td colSpan={7} className="empty">게시글이 없어요</td></tr>}
                      {commPosts.map(p => {
                        const d = new Date(p.created_at)
                        const isActive = p.status === 'active'
                        const cc = CAT_COLOR[p.category] || { bg: 'rgba(136,136,136,0.1)', color: '#888' }
                        return (
                          <tr key={p.id}>
                            <td style={{ maxWidth: '180px' }}>
                              <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                              {p.location && <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>📍 {p.location}</div>}
                            </td>
                            <td><span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '100px', fontSize: '10px', fontWeight: 700, background: cc.bg, color: cc.color }}>{COMM_CAT_LABEL[p.category] || p.category}</span></td>
                            <td>
                              <div style={{ color: 'var(--text)', fontSize: '13px' }}>{p.author?.name || '?'}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{COMM_ROLE_LABEL[p.author?.role] || p.author?.role}</div>
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace" }}>{p.contact_count || 0}</td>
                            <td>{isActive ? <span className="badge badge-green">활성</span> : <span className="badge" style={{ background: 'rgba(136,136,136,0.1)', color: '#888', border: '1px solid #333' }}>마감</span>}</td>
                            <td style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace" }}>{d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}<br />{d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
                                {isActive && <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px' }} disabled={isBusy(`commClose:${p.id}`)} onClick={() => commClosePost(p.id)}>마감</button>}
                                <button className="btn btn-danger btn-sm" style={{ fontSize: '10px' }} disabled={isBusy(`commDeletePost:${p.id}`)} onClick={() => commDeletePost(p.id)}>삭제</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {subTab === 'users' && (
                <div className="card table-wrap">
                  <table>
                    <thead><tr><th>이름</th><th>역할</th><th>지역</th><th>소개</th><th>게시글</th><th>가입일</th><th>상태</th><th></th></tr></thead>
                    <tbody>
                      {!commUsers.length && <tr><td colSpan={8} className="empty">유저가 없어요</td></tr>}
                      {commUsers.map(u => {
                        const userPostCount = commPosts.filter(p => p.user_id === u.id).length
                        const d = new Date(u.created_at)
                        const perms = u.admin_permissions || {}
                        const isBanned = !!perms.banned
                        const extraCount = (perms.extra_roles || []).length
                        return (
                          <tr key={u.id}>
                            <td><div className="name-cell"><div className="avatar" style={{ background: '#4fc3f7', color: '#0a0a0a' }}>{u.name[0]}</div><span style={{ color: 'var(--text)', fontWeight: 500 }}>{u.name}</span></div></td>
                            <td><span className="badge badge-blue">{COMM_ROLE_LABEL[u.role] || u.role}</span></td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{u.location || '-'}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.bio || '-'}</td>
                            <td style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace" }}>{userPostCount}건</td>
                            <td style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace'" }}>{d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</td>
                            <td>
                              {isBanned
                                ? <span className="badge badge-red">차단</span>
                                : extraCount > 0
                                  ? <span className="badge badge-green">+{extraCount}권한</span>
                                  : <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>기본</span>
                              }
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setCommPermModal(u)}>권한</button>
                                <button className="btn btn-danger btn-sm" disabled={isBusy(`commDeleteUser:${u.id}`)} onClick={() => commDeleteUser(u.id)}>삭제</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {subTab === 'contacts' && (
                <div className="card table-wrap">
                  <table>
                    <thead><tr><th>요청자</th><th>대상 게시글</th><th>메시지</th><th>상태</th><th>요청일</th></tr></thead>
                    <tbody>
                      {!commContacts.length && <tr><td colSpan={5} className="empty">연락 요청이 없어요</td></tr>}
                      {commContacts.map(c => {
                        const d = new Date(c.created_at)
                        const statusStyle = {
                          pending: { bg: 'rgba(245,166,35,0.1)', color: '#f5a623', border: 'rgba(245,166,35,0.2)', label: '대기중' },
                          accepted: { bg: 'rgba(200,241,53,0.1)', color: '#c8f135', border: 'rgba(200,241,53,0.2)', label: '수락됨' },
                          rejected: { bg: 'rgba(255,92,92,0.1)', color: '#ff5c5c', border: 'rgba(255,92,92,0.2)', label: '거절됨' },
                        }[c.status] || {}
                        return (
                          <tr key={c.id}>
                            <td>
                              <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: '13px' }}>{c.requester?.name || '?'}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{COMM_ROLE_LABEL[c.requester?.role] || c.requester?.role}</div>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.post?.title || '-'}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-dim)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message || '-'}</td>
                            <td><span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 700, background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>{statusStyle.label}</span></td>
                            <td style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace" }}>{d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}<br />{d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {subTab === 'market' && (
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>거래 일시</th>
                    <th>상품명</th>
                    <th>판매자</th>
                    <th>구매자</th>
                    <th style={{ textAlign: 'right' }}>거래 금액</th>
                  </tr>
                </thead>
                <tbody>
                  {!marketPurchases.length && (
                    <tr><td colSpan={5} className="empty">거래 내역이 없어요</td></tr>
                  )}
                  {marketPurchases.map(p => {
                    const d = new Date(p.purchased_at)
                    return (
                      <tr key={p.id}>
                        <td style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace", whiteSpace: 'nowrap' }}>
                          {d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}<br />
                          {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.item?.title || '(삭제된 상품)'}
                          </div>
                          {p.item?.price != null && (
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                              정가 {Number(p.item.price).toLocaleString('ko-KR')}원
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>{p.seller?.name || '—'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{COMM_ROLE_LABEL[p.seller?.role] || p.seller?.role || ''}</div>
                        </td>
                        <td>
                          <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>{p.buyer?.name || '—'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{COMM_ROLE_LABEL[p.buyer?.role] || p.buyer?.role || ''}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 700, color: '#c8f135', whiteSpace: 'nowrap' }}>
                          {Number(p.amount_paid).toLocaleString('ko-KR')}원
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}



          {/* ==================== CRM 포털 ==================== */}
          {page === 'crm' && subTab === 'permissions' && (
            <div>
              <div className="section-title">CRM 권한 관리</div>
              <div className="stat-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card"><div className="stat-num" style={{ color: '#a78bfa' }}>{trainers.filter(t => t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 활성 트레이너</div></div>
                <div className="stat-card"><div className="stat-num" style={{ color: 'var(--text-dim)' }}>{trainers.length - trainers.filter(t => t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 비활성</div></div>
              </div>
              <div className="card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>트레이너</th>
                      <th style={{ textAlign: 'center' }}>CRM 활성화</th>
                      {CRM_FEATURES.map(f => <th key={f.key} style={{ textAlign: 'center' }}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {!trainers.length && <tr><td colSpan={2 + CRM_FEATURES.length} className="empty">트레이너가 없어요</td></tr>}
                    {trainers.map(t => {
                      const perms = t.crm_permissions || {}
                      const enabled = !!perms.enabled
                      return (
                        <tr key={t.id}>
                          <td>
                            <div className="name-cell">
                              <div className="avatar">{t.name[0]}</div>
                              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{t.name}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className={`crm-toggle${enabled ? ' on' : ''}`}
                              onClick={() => updateCrmEnabled(t.id, !enabled)}
                            >
                              {enabled ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          {CRM_FEATURES.map(f => (
                            <td key={f.key} style={{ textAlign: 'center' }}>
                              <button
                                className={`crm-toggle crm-toggle-sm${perms[f.key] ? ' on' : ''}`}
                                disabled={!enabled}
                                onClick={() => updateCrmFeature(t.id, f.key, !perms[f.key])}
                              >
                                {perms[f.key] ? '허용' : '차단'}
                              </button>
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== 랜딩페이지 관리 ==================== */}

          {/* ── 히어로 ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'hero' && (
            <div>
              <div className="section-title">히어로 섹션</div>
              <div className="card">
                <div className="form-group"><label>뱃지 텍스트</label>
                  <input value={landingHero.badge || ''} onChange={e => setLandingHero(h => ({ ...h, badge: e.target.value }))} placeholder="FOR PERSONAL TRAINERS & MEMBERS" />
                </div>
                <div className="form-group"><label>헤드라인 첫 줄</label>
                  <input value={landingHero.headline || ''} onChange={e => setLandingHero(h => ({ ...h, headline: e.target.value }))} placeholder="좋은 트레이너는" />
                </div>
                <div className="form-row">
                  <div className="form-group"><label>강조 키워드 (초록 하이라이트)</label>
                    <input value={landingHero.highlight || ''} onChange={e => setLandingHero(h => ({ ...h, highlight: e.target.value }))} placeholder="기록" />
                  </div>
                  <div className="form-group"><label>키워드 뒷 문구</label>
                    <input value={landingHero.headlineAfter || ''} onChange={e => setLandingHero(h => ({ ...h, headlineAfter: e.target.value }))} placeholder="으로 증명합니다" />
                  </div>
                </div>
                <div className="form-group"><label>서브헤드라인</label>
                  <input value={landingHero.subheadline || ''} onChange={e => setLandingHero(h => ({ ...h, subheadline: e.target.value }))} placeholder="수업일지 · 회원관리 · 매출분석을 하나의 앱으로" />
                </div>
                <div className="form-group"><label>설명 텍스트</label>
                  <textarea rows={3} value={landingHero.desc || ''} onChange={e => setLandingHero(h => ({ ...h, desc: e.target.value }))} placeholder="AI가 수업일지를 대신 쓰고..." />
                </div>
                {/* 미리보기 */}
                <div className="form-group">
                  <label>미리보기</label>
                  <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '18px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '8px' }}>{landingHero.badge}</div>
                    <div style={{ fontWeight: 900, fontSize: '20px', lineHeight: 1.2, marginBottom: '6px' }}>
                      {landingHero.headline}<br />
                      <span style={{ color: '#c8f135' }}>{landingHero.highlight}</span>{landingHero.headlineAfter}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>{landingHero.subheadline}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7 }}>{landingHero.desc}</div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => saveLandingHero(landingHero)}>저장</button>
              </div>
            </div>
          )}

          {/* ==================== 트레이너 포털 > 플랜 관리 ==================== */}
          {page === 'landing' && landingSite === 'main' && subTab === 'stats' && (
            <div>
              <div className="section-title">통계 수치</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>히어로 섹션 아래 3개의 숫자 카드를 수정해요</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {landingStats.map((s, i) => (
                  <div key={i} className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--accent)', marginBottom: '6px' }}>{s.num}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px' }}>{s.sub}</div>
                    <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => openLandingEdit('stats', i, s)}>수정</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && landingSite === 'main' && subTab === 'reviews' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>트레이너 후기</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('reviews', -1, { name: '', location: '', text: '', rating: 5, initial: '', photo: '', instagram: '' })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {landingReviews.map((r, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    {/* 프로필 사진 or 이니셜 */}
                    {r.photo
                      ? <img src={r.photo} alt={r.name} style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }} onError={e => { e.target.style.display = 'none' }} />
                      : <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent)', color: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '16px', flexShrink: 0 }}>{r.initial || '?'}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{r.name}</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>· {r.location}</span>
                        {r.instagram && (
                          <span style={{ fontSize: '11px', color: '#e1306c', fontWeight: 600 }}>
                            📸 {r.instagram.startsWith('@') ? r.instagram : `@${r.instagram}`}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px', lineHeight: 1.6 }}>"{r.text}"</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('reviews', i, r)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('reviews', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && landingSite === 'main' && subTab === 'kakao' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>카카오 메시지</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('kakao', -1, { from: '회원', text: '', time: '오후 0:00' })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {landingKakao.map((m, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '24px' }}>💬</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{m.from}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{m.time}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.6 }}>{m.text}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('kakao', i, m)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('kakao', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && landingSite === 'main' && subTab === 'faqs' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>FAQ</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('faqs', -1, { q: '', a: '' })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {landingFaqs.map((f, i) => (
                  <div key={i} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>{f.q}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7 }}>{f.a}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('faqs', i, f)}>수정</button>
                        <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('faqs', i)}>삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 문제 인식 ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'problems' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>문제 인식 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('problems', -1, { icon: '', title: '', desc: '' })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {landingProblems.map((p, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '28px', flexShrink: 0 }}>{p.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{p.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6 }}>{p.desc}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('problems', i, p)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('problems', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 솔루션 ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'solutions' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>솔루션 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('solutions', -1, { icon: '', tag: '', title: '', desc: '' })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {landingSolutions.map((s, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '24px', flexShrink: 0 }}>{s.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{s.title}</span>
                        {s.tag && <span style={{ fontSize: '10px', background: 'rgba(22,163,74,0.15)', color: '#16a34a', padding: '2px 8px', borderRadius: '20px' }}>{s.tag}</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6 }}>{s.desc}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('solutions', i, s)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('solutions', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI 하이라이트 ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'ai_highlight' && (
            <div>
              <div className="section-title">AI 하이라이트 카드 (솔루션 섹션 하단)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
                솔루션 섹션 아래에 표시되는 AI POWERED 하이라이트 카드를 수정합니다.
              </div>

              {/* 뱃지 */}
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>뱃지 텍스트 (✦ 옆)</label>
                <input
                  className="input"
                  value={landingAiHighlight.badge || ''}
                  onChange={e => setLandingAiHighlight(h => ({ ...h, badge: e.target.value }))}
                  placeholder="AI POWERED"
                />
              </div>

              {/* 헤드라인 */}
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>헤드라인 (줄바꿈은 \n)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={landingAiHighlight.headline || ''}
                  onChange={e => setLandingAiHighlight(h => ({ ...h, headline: e.target.value }))}
                  placeholder="수업 후 녹음 파일만 올리면\n수업일지가 완성됩니다"
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* 설명 */}
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>설명 (줄바꿈은 \n)</label>
                <textarea
                  className="input"
                  rows={4}
                  value={landingAiHighlight.desc || ''}
                  onChange={e => setLandingAiHighlight(h => ({ ...h, desc: e.target.value }))}
                  placeholder="Gemini AI가 음성을 분석해..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* 단계 스텝 */}
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>진행 단계 (쉼표로 구분)</label>
                <input
                  className="input"
                  value={landingAiHighlight.steps || ''}
                  onChange={e => setLandingAiHighlight(h => ({ ...h, steps: e.target.value }))}
                  placeholder="녹음 업로드,AI 분석,일지 완성,카카오 발송"
                />
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>예: 녹음 업로드,AI 분석,일지 완성,카카오 발송</div>
              </div>

              {/* 미리보기 */}
              <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#14290a 100%)', borderRadius: '16px', padding: '24px', color: '#fff', marginBottom: '20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '160px', height: '160px', background: 'radial-gradient(circle,rgba(200,241,53,0.18) 0%,transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '18px' }}>✦</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#c8f135', letterSpacing: '0.1em' }}>{landingAiHighlight.badge || 'AI POWERED'}</span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, lineHeight: 1.3, marginBottom: '10px' }}>
                    {(landingAiHighlight.headline || '').split('\\n').map((line, i) => (
                      <span key={i}>{line}{i === 0 && <br />}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.75, marginBottom: '16px' }}>
                    {(landingAiHighlight.desc || '').split('\\n').map((line, i) => (
                      <span key={i}>{line}{i < (landingAiHighlight.desc || '').split('\\n').length - 1 && <br />}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {(landingAiHighlight.steps || '').split(',').filter(Boolean).map((step, i, arr) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ background: 'rgba(200,241,53,0.18)', color: '#c8f135', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, border: '1px solid rgba(200,241,53,0.3)' }}>{i + 1}</span>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{step.trim()}</span>
                        {i < arr.length - 1 && <span style={{ color: '#334155', fontSize: '14px' }}>›</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => saveLandingAiHighlight(landingAiHighlight)}
              >
                저장
              </button>
            </div>
          )}

          {/* ── 타겟 분기 ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'targets' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>타겟 분기 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('targets', -1, { type: '', icon: '', color: '#c8f135', textColor: '#3f6212', bg: 'rgba(200,241,53,0.08)', border: 'rgba(200,241,53,0.3)', points: [] })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {landingTargets.map((t, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '28px', flexShrink: 0 }}>{t.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>{t.type}</div>
                      {(t.points || []).map((pt, j) => (
                        <div key={j} style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7 }}>✓ {pt}</div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('targets', i, t)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('targets', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 회원 포털 기능 ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'members' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>회원 포털 기능 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('members', -1, { icon: '', title: '', desc: '' })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {landingMemberFeatures.map((f, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '28px', flexShrink: 0 }}>{f.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{f.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6 }}>{f.desc}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('members', i, f)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('members', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 요금제 (랜딩) ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'plans' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>요금제 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('landing_plans', -1, { name: '', price: '', period: '', highlight: false, tag: '', features: [], cta: '', ctaLink: '', note: '' })}>+ 추가</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '12px' }}>
                {landingPlansLanding.map((plan, i) => (
                  <div key={i} className="card" style={{ border: `1px solid ${plan.highlight ? 'rgba(200,241,53,0.35)' : 'var(--border)'}`, background: plan.highlight ? 'rgba(200,241,53,0.03)' : 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: plan.highlight ? 'var(--accent)' : 'var(--text)' }}>{plan.name}</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px' }}>{plan.price}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{plan.period}</div>
                      </div>
                      {plan.highlight && <span style={{ fontSize: '10px', background: 'var(--accent)', color: '#0a0a0a', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>추천</span>}
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      {(plan.features || []).map((f, j) => <div key={j} style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.8 }}>✓ {f}</div>)}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openLandingEdit('landing_plans', i, plan)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('landing_plans', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && landingSite === 'main' && subTab === 'comparison' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>기능 비교 행</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('comparison', -1, { feature: '', legacy: '', ours: '' })}>+ 행 추가</button>
              </div>
              {/* 미리보기 테이블 */}
              <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', background: 'var(--surface)' }}>
                  <div style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>기능</div>
                  <div style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-dim)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>기존 방식</div>
                  <div style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>✦ 오운</div>
                </div>
                {landingComparison.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', borderBottom: i < landingComparison.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <div style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span>{row.feature}</span>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={() => openLandingEdit('comparison', i, row)}>수정</button>
                        <button className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('comparison', i)}>삭제</button>
                      </div>
                    </div>
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-dim)', borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>✗</span>{row.legacy}
                    </div>
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--accent)', borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                      <span>✓</span>{row.ours}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 포털 버튼 ON/OFF ── */}
          {page === 'landing' && landingSite === 'main' && subTab === 'portal_buttons' && (() => {
            const PORTALS = [
              { key: 'trainer', label: '트레이너 앱', icon: '💪', color: '#c8f135', desc: '/trainer — AI 수업일지 · 회원관리 · 스케줄 · 매출' },
              { key: 'member', label: '회원 포털', icon: '🏃', color: '#4fc3f7', desc: '/member — 수업일지 · 체중관리 · 개인운동 · 커뮤니티' },
              { key: 'community', label: '커뮤니티', icon: '🤝', color: '#ff9800', desc: '/community — 구인·구직 · 센터 매칭 · 수강생 모집' },
              { key: 'crm', label: '헬스장 CRM', icon: '🏢', color: '#e040fb', desc: '/crm — 트레이너 관리 · 매출 현황 · 정산' },
            ]
            const toggle = (key) => {
              const next = { ...landingPortalButtons, [key]: !landingPortalButtons[key] }
              saveLandingPortalButtons(next)
            }
            return (
              <div>
                <div className="section-title">포털 버튼 노출 관리</div>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '20px', lineHeight: 1.7 }}>
                  OFF로 설정하면 랜딩페이지 <strong style={{ color: 'var(--text)' }}>GET STARTED</strong> 섹션에서 해당 포털 카드가 <strong style={{ color: '#ef4444' }}>준비중</strong>으로 표시되고 클릭이 비활성화돼요.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {PORTALS.map(p => {
                    const isOn = landingPortalButtons[p.key] !== false
                    return (
                      <div key={p.key} className="card" style={{
                        display: 'flex', alignItems: 'center', gap: '16px',
                        border: `1px solid ${isOn ? p.color + '33' : 'var(--border)'}`,
                        opacity: isOn ? 1 : 0.65,
                      }}>
                        <div style={{ fontSize: '28px', flexShrink: 0 }}>{p.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: isOn ? p.color : 'var(--text-dim)' }}>{p.label}</span>
                            {isOn
                              ? <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(200,241,53,0.12)', color: '#c8f135', padding: '2px 7px', borderRadius: '10px', border: '1px solid rgba(200,241,53,0.25)' }}>ON</span>
                              : <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#ef4444', padding: '2px 7px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.25)' }}>OFF · 준비중</span>
                            }
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace" }}>{p.desc}</div>
                        </div>
                        <button
                          className={`crm-toggle${isOn ? ' on' : ''}`}
                          style={{ flexShrink: 0 }}
                          onClick={() => toggle(p.key)}
                        >
                          {isOn ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: '16px', padding: '12px 14px', background: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.2)', borderRadius: '10px', fontSize: '12px', color: 'rgba(255,152,0,0.8)', lineHeight: 1.7 }}>
                  ⚠️ 변경 즉시 저장됩니다. 토글을 클릭하면 바로 랜딩페이지에 반영돼요.
                </div>
              </div>
            )
          })()}

          {/* ── 커뮤니티 랜딩 > 히어로 ── */}
          {page === 'landing' && landingSite === 'community' && subTab === 'hero' && (
            <div>
              <div className="section-title">커뮤니티 랜딩 · 히어로</div>
              <div className="card">
                <div className="form-group"><label>뱃지</label>
                  <input value={landingCommHero.badge || ''} onChange={e => setLandingCommHero(h => ({ ...h, badge: e.target.value }))} placeholder="FITNESS COMMUNITY" />
                </div>
                <div className="form-row">
                  <div className="form-group"><label>헤드라인</label>
                    <input value={landingCommHero.headline || ''} onChange={e => setLandingCommHero(h => ({ ...h, headline: e.target.value }))} placeholder="피트니스 업계의" />
                  </div>
                  <div className="form-group"><label>강조 키워드</label>
                    <input value={landingCommHero.highlight || ''} onChange={e => setLandingCommHero(h => ({ ...h, highlight: e.target.value }))} placeholder="구인·구직 커뮤니티" />
                  </div>
                </div>
                <div className="form-group"><label>서브헤드라인 (줄바꿈은 \n)</label>
                  <textarea rows={2} value={landingCommHero.subheadline || ''} onChange={e => setLandingCommHero(h => ({ ...h, subheadline: e.target.value }))} placeholder="트레이너·회원·교육강사·센터 대표가 함께하는..." />
                </div>
                <div className="form-group"><label>CTA 버튼</label>
                  <input value={landingCommHero.cta || ''} onChange={e => setLandingCommHero(h => ({ ...h, cta: e.target.value }))} placeholder="Google로 시작하기" />
                </div>
                {/* 미리보기 */}
                <div className="form-group">
                  <label>미리보기</label>
                  <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '18px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', color: '#4fc3f7', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '8px' }}>{landingCommHero.badge}</div>
                    <div style={{ fontWeight: 900, fontSize: '20px', lineHeight: 1.2, marginBottom: '6px' }}>
                      {landingCommHero.headline}<br />
                      <span style={{ color: '#c8f135' }}>{landingCommHero.highlight}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', whiteSpace: 'pre-line', lineHeight: 1.7, marginBottom: '10px' }}>{landingCommHero.subheadline}</div>
                    <div style={{ display: 'inline-block', background: '#4fc3f7', color: '#0f0f0f', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{landingCommHero.cta}</div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => saveLandingCommHero(landingCommHero)}>저장</button>
              </div>
            </div>
          )}

          {/* ── CRM 랜딩 > 히어로 ── */}
          {page === 'landing' && landingSite === 'crm' && subTab === 'hero' && (
            <div>
              <div className="section-title">CRM 랜딩 · 히어로</div>
              <div className="card">
                <div className="form-group"><label>뱃지</label>
                  <input value={landingCrmHero.badge || ''} onChange={e => setLandingCrmHero(h => ({ ...h, badge: e.target.value }))} placeholder="FOR GYM OWNERS" />
                </div>
                <div className="form-row">
                  <div className="form-group"><label>헤드라인 1줄</label>
                    <input value={landingCrmHero.headline1 || ''} onChange={e => setLandingCrmHero(h => ({ ...h, headline1: e.target.value }))} placeholder="헬스장 운영의" />
                  </div>
                  <div className="form-group"><label>헤드라인 2줄 (강조)</label>
                    <input value={landingCrmHero.headline2 || ''} onChange={e => setLandingCrmHero(h => ({ ...h, headline2: e.target.value }))} placeholder="모든 것을 한 곳에" />
                  </div>
                </div>
                <div className="form-group"><label>서브헤드라인 (줄바꿈은 \n)</label>
                  <textarea rows={2} value={landingCrmHero.subheadline || ''} onChange={e => setLandingCrmHero(h => ({ ...h, subheadline: e.target.value }))} placeholder="트레이너 관리부터 매출 정산..." />
                </div>
                <div className="form-group"><label>CTA 버튼</label>
                  <input value={landingCrmHero.cta || ''} onChange={e => setLandingCrmHero(h => ({ ...h, cta: e.target.value }))} placeholder="CRM 포털 입장하기" />
                </div>
                {/* 미리보기 */}
                <div className="form-group">
                  <label>미리보기</label>
                  <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '18px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '8px' }}>{landingCrmHero.badge}</div>
                    <div style={{ fontWeight: 900, fontSize: '20px', lineHeight: 1.2, marginBottom: '6px' }}>
                      {landingCrmHero.headline1}<br />
                      <span style={{ color: '#c8f135' }}>{landingCrmHero.headline2}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', whiteSpace: 'pre-line', lineHeight: 1.7, marginBottom: '10px' }}>{landingCrmHero.subheadline}</div>
                    <div style={{ display: 'inline-block', background: 'var(--accent)', color: '#0f0f0f', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{landingCrmHero.cta}</div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => saveLandingCrmHero(landingCrmHero)}>저장</button>
              </div>
            </div>
          )}

          {/* ── CRM 랜딩 > 기능 소개 ── */}
          {page === 'landing' && landingSite === 'crm' && subTab === 'features' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>CRM 랜딩 · 기능 소개</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('crm_features', -1, { icon: '⚡', title: '', desc: '', color: '#c8f135' })}>+ 추가</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {landingCrmFeatures.map((f, i) => (
                  <div key={i} className="card" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '24px', lineHeight: 1, flexShrink: 0 }}>{f.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: f.color || 'var(--accent)', marginBottom: '4px' }}>{f.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>{f.desc}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('crm_features', i, f)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('crm_features', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CRM 랜딩 > 페인포인트 ── */}
          {page === 'landing' && landingSite === 'crm' && subTab === 'painpoints' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>CRM 랜딩 · 페인포인트</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('crm_painpoints', -1, { icon: '😤', text: '' })}>+ 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {landingCrmPainpoints.map((p, i) => (
                  <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '22px', flexShrink: 0 }}>{p.icon}</div>
                    <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{p.text}</div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('crm_painpoints', i, p)}>수정</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('crm_painpoints', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CRM 랜딩 > 로드맵 ── */}
          {page === 'landing' && landingSite === 'crm' && subTab === 'roadmap' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0 }}>CRM 랜딩 · 로드맵</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('crm_roadmap', -1, { now: '', coming: '' })}>+ 행 추가</button>
              </div>
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--surface)' }}>
                  <div style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent)', borderBottom: '1px solid var(--border)' }}>✅ 지금 사용 가능</div>
                  <div style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-dim)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>🔜 출시 예정</div>
                </div>
                {landingCrmRoadmap.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: i < landingCrmRoadmap.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span>{row.now}</span>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px', padding: '2px 7px' }} onClick={() => openLandingEdit('crm_roadmap', i, row)}>수정</button>
                        <button className="btn btn-sm" style={{ fontSize: '10px', padding: '2px 7px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => deleteLandingItem('crm_roadmap', i)}>삭제</button>
                      </div>
                    </div>
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-dim)', borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#60a5fa', fontWeight: 700 }}>→</span>{row.coming}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'trainer' && subTab === 'plans' && (
            <div>
              <div className="section-title">플랜 관리</div>

              {/* 노출 토글 */}
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>플랜 안내 노출</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px' }}>트레이너 포털 설정 탭에서 플랜 안내 섹션 표시 여부</div>
                </div>
                <button
                  className={`crm-toggle${planGuideVisible ? ' on' : ''}`}
                  style={{ fontSize: '13px', padding: '6px 18px' }}
                  onClick={() => savePlanVisibility(!planGuideVisible)}
                >
                  {planGuideVisible ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 플랜 카드 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {plans.map(plan => {
                  const isOn = plan.enabled !== false
                  return (
                    <div key={plan.id} className="card" style={{
                      border: `1px solid ${isOn ? (plan.highlight ? 'rgba(200,241,53,0.35)' : 'var(--border)') : 'rgba(136,136,136,0.2)'}`,
                      background: isOn ? (plan.highlight ? 'rgba(200,241,53,0.03)' : 'var(--surface)') : 'rgba(136,136,136,0.04)',
                      position: 'relative',
                      opacity: isOn ? 1 : 0.6,
                    }}>
                      {plan.current && (
                        <span style={{ position: 'absolute', top: '-9px', left: '12px', background: '#9ca3af', color: '#0f0f0f', fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px' }}>현재 플랜</span>
                      )}
                      {plan.badge && !plan.current && (
                        <span style={{ position: 'absolute', top: '-9px', left: '12px', background: plan.highlight ? 'var(--accent)' : '#60a5fa', color: '#0f0f0f', fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px' }}>{plan.badge}</span>
                      )}
                      {/* 플랜 ON/OFF 토글 */}
                      <button
                        className={`crm-toggle crm-toggle-sm${isOn ? ' on' : ''}`}
                        style={{ position: 'absolute', top: '10px', right: '10px' }}
                        onClick={() => togglePlanEnabled(plan.id)}
                      >
                        {isOn ? 'ON' : 'OFF'}
                      </button>
                      <div style={{ fontWeight: 700, color: isOn ? plan.color : 'var(--text-dim)', fontSize: '15px', marginBottom: '4px', marginTop: '4px' }}>{plan.name}</div>
                      <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '8px', color: 'var(--text)' }}>{plan.price}</div>
                      {plan.features.map(f => (
                        <div key={f} style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.9 }}>· {f}</div>
                      ))}
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: '12px', width: '100%' }} onClick={() => openPlanEdit(plan)}>수정</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {page === 'features' && (
            <div>
              <div className="section-title">🔐 기능별 플랜 설정</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '20px' }}>
                무료/유료 트레이너가 사용할 수 있는 기능을 ON/OFF로 관리합니다. 변경 즉시 저장됩니다.
              </div>

              {/* 기능 토글 테이블 */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
                {/* 헤더 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 90px', gap: 0, background: 'rgba(255,255,255,0.04)', padding: '10px 18px', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <div>기능</div>
                  <div>설명</div>
                  <div style={{ textAlign: 'center' }}>무료</div>
                  <div style={{ textAlign: 'center' }}>유료</div>
                </div>
                {FEATURE_DEFS.map((fd, i) => (
                  <div key={fd.key} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 90px 90px', gap: 0,
                    padding: '13px 18px', alignItems: 'center',
                    borderBottom: i < FEATURE_DEFS.length - 1 ? '1px solid var(--border)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
                      <span style={{ fontSize: '16px' }}>{fd.icon}</span>
                      {fd.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', paddingRight: '12px' }}>{fd.desc}</div>
                    {['free', 'paid'].map(plan => {
                      const isOn = !!featureGates[plan]?.[fd.key]
                      return (
                        <div key={plan} style={{ textAlign: 'center' }}>
                          <button
                            className={`crm-toggle crm-toggle-sm${isOn ? ' on' : ''}`}
                            onClick={() => toggleGate(plan, fd.key)}
                          >
                            {isOn ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* 회원 수 제한 */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>👥 관리 가능한 최대 회원 수</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {[{ plan: 'free', label: '무료 플랜' }, { plan: 'paid', label: '유료 플랜' }].map(({ plan, label }) => (
                    <div key={plan}>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '6px' }}>{label}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          className="input"
                          style={{ width: '100px' }}
                          value={featureGates[plan]?.member_limit ?? 0}
                          onChange={e => setMemberLimit(plan, e.target.value)}
                          onBlur={saveMemberLimit}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>명 (9999 = 무제한)</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: '16px' }} onClick={saveMemberLimit}>
                  저장
                </button>
              </div>

              {/* 현재 설정 미리보기 */}
              <div className="card" style={{ marginTop: '20px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>📋 현재 설정 요약</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {[{ plan: 'free', label: '무료', color: '#9ca3af' }, { plan: 'paid', label: '유료', color: 'var(--accent)' }].map(({ plan, label, color }) => (
                    <div key={plan} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ fontWeight: 700, color, marginBottom: '10px', fontSize: '13px' }}>{label} 플랜</div>
                      {FEATURE_DEFS.map(fd => {
                        const isOn = !!featureGates[plan]?.[fd.key]
                        return (
                          <div key={fd.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ color: 'var(--text-dim)' }}>{fd.icon} {fd.label}</span>
                            <span style={{ color: isOn ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: '11px' }}>{isOn ? 'ON' : 'OFF'}</span>
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', paddingTop: '6px' }}>
                        <span style={{ color: 'var(--text-dim)' }}>👥 최대 회원</span>
                        <span style={{ fontWeight: 700 }}>{featureGates[plan]?.member_limit >= 9999 ? '무제한' : featureGates[plan]?.member_limit + '명'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {page === 'system' && (
            <div>
              <div className="section-title">⚙️ 시스템 운영 — API 키 · 운영 채널</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '20px' }}>
                중앙 AI API 키와 외부 채널 링크를 한 곳에서 관리합니다. 변경 사항은 보안 RPC(<code>app_settings_admin_upsert</code>) 경유로 즉시 박제됩니다.
              </div>

              {/* 중앙 Gemini API 키 카드 */}
              <div className="card" style={{ padding: '18px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>🔑 중앙 Gemini API 키 (gemini_api_key)</div>
                  <button className="btn btn-primary" onClick={saveCentralApiKey} style={{ fontSize: '12px', padding: '6px 14px' }}>💾 저장</button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.6 }}>
                  유료 트레이너가 AI 수업일지를 생성할 때 사용하는 중앙 API 키입니다. 키가 비어 있으면 AI 기능은 트레이너의 개별 키로 폴백합니다.
                </div>
                <input
                  type="text"
                  value={centralApiKey}
                  onChange={e => setCentralApiKey(e.target.value)}
                  placeholder="AIza..."
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '13px',
                    fontFamily: 'monospace', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                />
                {centralApiKey && (
                  <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '8px' }}>
                    ✓ API 키 설정됨 — 모든 유료 트레이너가 이 키를 공유합니다.
                  </div>
                )}
              </div>

              {/* 긴급문의 링크 카드 */}
              <div className="card" style={{ padding: '18px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>💬 1:1 문의 채널 URL (urgent_inquiry_url)</div>
                  <button className="btn btn-primary" onClick={saveUrgentInquiryUrl} style={{ fontSize: '12px', padding: '6px 14px' }}>💾 저장</button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.6 }}>
                  4대 포털(트레이너·회원·커뮤니티·CRM)의 "1:1 문의" 버튼이 새 창으로 여는 카카오톡 오픈채팅 URL입니다. 비워두면 일부 포털에서는 폴백 URL로 동작합니다.
                </div>
                <input
                  type="url"
                  value={urgentInquiryUrl}
                  onChange={e => setUrgentInquiryUrl(e.target.value)}
                  placeholder="https://open.kakao.com/o/..."
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '13px',
                    fontFamily: 'monospace', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                />
                {urgentInquiryUrl
                  ? <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '8px' }}>✓ 채널 링크 설정됨 — 4대 포털의 1:1 문의 버튼에 즉시 반영됩니다.</div>
                  : <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '8px' }}>링크 미설정 시 일부 포털은 카카오 오픈채팅 메인으로 폴백합니다.</div>
                }
              </div>

              {/* 운영 안내 카드 (정보성) */}
              <div className="card" style={{ padding: '18px', marginBottom: '18px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '8px' }}>🔒 운영 보안 체크리스트</div>
                <ul style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.8, paddingLeft: '18px', margin: 0 }}>
                  <li>관리자 자격(VITE_ADMIN_ID / VITE_ADMIN_PASSWORD)은 환경변수에서만 관리하고 있나요?</li>
                  <li>RLS 정책(<code>fix_rls_top3.sql</code> + <code>fix_rls_all_tables.sql</code>)이 운영 DB에 적용되어 있나요?</li>
                  <li>180일 데이터 청소 cron(<code>supabase_cleanup_cron.sql</code>)이 등록되어 있나요?</li>
                  <li>Storage 6개 버킷이 모두 인증 사용자 + 본인 폴더 정책으로 잠겨 있나요?</li>
                </ul>
              </div>
            </div>
          )}

          {page === 'legal' && (
            <div>
              <div className="section-title">📜 법적 고지 관리</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '20px' }}>
                이용약관 / 개인정보처리방침 / 환불정책 본문을 직접 편집해 즉시 반영합니다. 저장 시 보안 RPC(<code>app_settings_admin_upsert</code>)를 통해 <code>legal_terms</code> · <code>legal_privacy</code> · <code>legal_refund</code> 키로 박제됩니다. 줄바꿈은 그대로 화면에 출력됩니다.
              </div>

              {/* 이용약관 */}
              <div className="card" style={{ padding: '18px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>📄 이용약관 (legal_terms)</div>
                  <button
                    className="btn btn-primary"
                    onClick={() => saveLegalDocument('terms')}
                    disabled={legalSaving.terms}
                    style={{ fontSize: '12px', padding: '6px 14px', opacity: legalSaving.terms ? 0.55 : 1, cursor: legalSaving.terms ? 'not-allowed' : 'pointer' }}
                  >
                    {legalSaving.terms ? '저장 중…' : '💾 저장'}
                  </button>
                </div>
                <textarea
                  value={legalTerms}
                  onChange={e => setLegalTerms(e.target.value)}
                  placeholder="이용약관 본문을 입력하세요. 비워두면 페이지에서 기본 하드코딩 본문이 노출됩니다."
                  style={{
                    width: '100%', minHeight: '320px', padding: '12px', fontSize: '13px',
                    fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.7,
                    border: '1px solid var(--border)', borderRadius: '8px',
                    background: 'var(--surface)', color: 'var(--text)', resize: 'vertical',
                    boxSizing: 'border-box', whiteSpace: 'pre-wrap',
                  }}
                />
              </div>

              {/* 개인정보처리방침 */}
              <div className="card" style={{ padding: '18px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>🔐 개인정보처리방침 (legal_privacy)</div>
                  <button
                    className="btn btn-primary"
                    onClick={() => saveLegalDocument('privacy')}
                    disabled={legalSaving.privacy}
                    style={{ fontSize: '12px', padding: '6px 14px', opacity: legalSaving.privacy ? 0.55 : 1, cursor: legalSaving.privacy ? 'not-allowed' : 'pointer' }}
                  >
                    {legalSaving.privacy ? '저장 중…' : '💾 저장'}
                  </button>
                </div>
                <textarea
                  value={legalPrivacy}
                  onChange={e => setLegalPrivacy(e.target.value)}
                  placeholder="개인정보처리방침 본문을 입력하세요. 비워두면 페이지에서 기본 하드코딩 본문이 노출됩니다."
                  style={{
                    width: '100%', minHeight: '320px', padding: '12px', fontSize: '13px',
                    fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.7,
                    border: '1px solid var(--border)', borderRadius: '8px',
                    background: 'var(--surface)', color: 'var(--text)', resize: 'vertical',
                    boxSizing: 'border-box', whiteSpace: 'pre-wrap',
                  }}
                />
              </div>

              {/* 환불정책 */}
              <div className="card" style={{ padding: '18px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>💸 환불정책 (legal_refund)</div>
                  <button
                    className="btn btn-primary"
                    onClick={() => saveLegalDocument('refund')}
                    disabled={legalSaving.refund}
                    style={{ fontSize: '12px', padding: '6px 14px', opacity: legalSaving.refund ? 0.55 : 1, cursor: legalSaving.refund ? 'not-allowed' : 'pointer' }}
                  >
                    {legalSaving.refund ? '저장 중…' : '💾 저장'}
                  </button>
                </div>
                <textarea
                  value={legalRefund}
                  onChange={e => setLegalRefund(e.target.value)}
                  placeholder="환불정책 본문을 입력하세요. 비워두면 페이지에서 기본 하드코딩 본문이 노출됩니다."
                  style={{
                    width: '100%', minHeight: '320px', padding: '12px', fontSize: '13px',
                    fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.7,
                    border: '1px solid var(--border)', borderRadius: '8px',
                    background: 'var(--surface)', color: 'var(--text)', resize: 'vertical',
                    boxSizing: 'border-box', whiteSpace: 'pre-wrap',
                  }}
                />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* LANDING EDIT MODAL */}
      <Modal open={!!landingEditModal} onClose={closeLandingEdit} title={
        landingEditModal?.type === 'stats' ? '통계 수치 수정' :
          landingEditModal?.type === 'reviews' ? (landingEditModal.index === -1 ? '후기 추가' : '후기 수정') :
            landingEditModal?.type === 'kakao' ? (landingEditModal.index === -1 ? '메시지 추가' : '메시지 수정') :
              landingEditModal?.type === 'faqs' ? (landingEditModal.index === -1 ? 'FAQ 추가' : 'FAQ 수정') :
                landingEditModal?.type === 'problems' ? (landingEditModal.index === -1 ? '문제 카드 추가' : '문제 카드 수정') :
                  landingEditModal?.type === 'solutions' ? (landingEditModal.index === -1 ? '솔루션 카드 추가' : '솔루션 카드 수정') :
                    landingEditModal?.type === 'targets' ? (landingEditModal.index === -1 ? '타겟 추가' : '타겟 수정') :
                      landingEditModal?.type === 'members' ? (landingEditModal.index === -1 ? '회원 기능 추가' : '회원 기능 수정') :
                        landingEditModal?.type === 'landing_plans' ? (landingEditModal.index === -1 ? '요금제 추가' : '요금제 수정') :
                          landingEditModal?.type === 'comparison' ? (landingEditModal.index === -1 ? '비교 행 추가' : '비교 행 수정') :
                            landingEditModal?.type === 'crm_features' ? (landingEditModal.index === -1 ? 'CRM 기능 추가' : 'CRM 기능 수정') :
                              landingEditModal?.type === 'crm_painpoints' ? (landingEditModal.index === -1 ? '페인포인트 추가' : '페인포인트 수정') :
                                landingEditModal?.type === 'crm_roadmap' ? (landingEditModal.index === -1 ? '로드맵 행 추가' : '로드맵 행 수정') : ''
      }>
        {landingEditModal && (() => {
          const d = landingEditModal.data
          const upd = (patch) => setLandingEditModal(prev => ({ ...prev, data: { ...prev.data, ...patch } }))
          if (landingEditModal.type === 'stats') return (
            <>
              <div className="form-group"><label>숫자 / 값 (예: 3분, 98%)</label><input value={d.num} onChange={e => upd({ num: e.target.value })} placeholder="3분" /></div>
              <div className="form-group"><label>레이블</label><input value={d.label} onChange={e => upd({ label: e.target.value })} placeholder="첫 수업일지 완성까지" /></div>
              <div className="form-group"><label>보조 설명</label><input value={d.sub} onChange={e => upd({ sub: e.target.value })} placeholder="녹음 업로드부터 발송까지" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'reviews') return (
            <>
              {/* 프로필 사진 미리보기 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', padding: '14px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                {d.photo
                  ? <img src={d.photo} alt="preview" style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} onError={e => { e.target.src = '' }} />
                  : <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent)', color: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '20px', flexShrink: 0 }}>{d.initial || '?'}</div>
                }
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  사진 URL을 입력하면 이니셜 대신 실제 사진이 표시됩니다.<br />
                  <span style={{ color: 'var(--text-muted)' }}>이미지 링크를 직접 복사해서 붙여넣기 하세요.</span>
                </div>
              </div>
              <div className="form-group">
                <label>프로필 사진 URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(선택)</span></label>
                <input value={d.photo || ''} onChange={e => upd({ photo: e.target.value })} placeholder="https://...jpg" />
              </div>
              <div className="form-row">
                <div className="form-group"><label>이름</label><input value={d.name || ''} onChange={e => upd({ name: e.target.value })} placeholder="김O준 트레이너" /></div>
                <div className="form-group"><label>이니셜 (사진 없을 때)</label><input value={d.initial || ''} onChange={e => upd({ initial: e.target.value })} placeholder="김" maxLength={2} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>소속 / 지역</label><input value={d.location || ''} onChange={e => upd({ location: e.target.value })} placeholder="서울 마포구 · 1인샵" /></div>
                <div className="form-group">
                  <label>인스타그램 아이디 <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(선택)</span></label>
                  <input value={d.instagram || ''} onChange={e => upd({ instagram: e.target.value })} placeholder="@trainer_id" />
                </div>
              </div>
              <div className="form-group"><label>후기 내용</label><textarea rows={4} value={d.text || ''} onChange={e => upd({ text: e.target.value })} placeholder="후기를 입력하세요" /></div>
              <div className="form-group"><label>별점 (1~5)</label><input type="number" min={1} max={5} value={d.rating || 5} onChange={e => upd({ rating: Number(e.target.value) })} /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'kakao') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>발신자</label><input value={d.from} onChange={e => upd({ from: e.target.value })} placeholder="회원" /></div>
                <div className="form-group"><label>시간</label><input value={d.time} onChange={e => upd({ time: e.target.value })} placeholder="오후 8:23" /></div>
              </div>
              <div className="form-group"><label>메시지 내용</label><textarea rows={3} value={d.text} onChange={e => upd({ text: e.target.value })} placeholder="메시지를 입력하세요" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'faqs') return (
            <>
              <div className="form-group"><label>질문</label><input value={d.q} onChange={e => upd({ q: e.target.value })} placeholder="자주 묻는 질문을 입력하세요" /></div>
              <div className="form-group"><label>답변</label><textarea rows={4} value={d.a} onChange={e => upd({ a: e.target.value })} placeholder="답변을 입력하세요" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'problems') return (
            <>
              <div className="form-group"><label>이모지 아이콘</label><input value={d.icon || ''} onChange={e => upd({ icon: e.target.value })} placeholder="😮‍💨" /></div>
              <div className="form-group"><label>제목</label><input value={d.title || ''} onChange={e => upd({ title: e.target.value })} placeholder="카드 제목" /></div>
              <div className="form-group"><label>설명</label><textarea rows={3} value={d.desc || ''} onChange={e => upd({ desc: e.target.value })} placeholder="카드 설명" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'solutions') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>이모지 아이콘</label><input value={d.icon || ''} onChange={e => upd({ icon: e.target.value })} placeholder="✦" /></div>
                <div className="form-group"><label>태그</label><input value={d.tag || ''} onChange={e => upd({ tag: e.target.value })} placeholder="AI 수업일지" /></div>
              </div>
              <div className="form-group"><label>제목</label><input value={d.title || ''} onChange={e => upd({ title: e.target.value })} placeholder="솔루션 제목" /></div>
              <div className="form-group"><label>설명</label><textarea rows={3} value={d.desc || ''} onChange={e => upd({ desc: e.target.value })} placeholder="솔루션 설명" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'targets') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>이모지 아이콘</label><input value={d.icon || ''} onChange={e => upd({ icon: e.target.value })} placeholder="🏠" /></div>
                <div className="form-group"><label>타겟명</label><input value={d.type || ''} onChange={e => upd({ type: e.target.value })} placeholder="1인샵 운영 트레이너" /></div>
              </div>
              <div className="form-group">
                <label>포인트 목록 (줄바꿈으로 구분)</label>
                <textarea rows={4} value={(d.points || []).join('\n')} onChange={e => upd({ points: e.target.value.split('\n') })} placeholder={"포인트 1\n포인트 2\n포인트 3"} />
              </div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'members') return (
            <>
              <div className="form-group"><label>이모지 아이콘</label><input value={d.icon || ''} onChange={e => upd({ icon: e.target.value })} placeholder="📋" /></div>
              <div className="form-group"><label>기능명</label><input value={d.title || ''} onChange={e => upd({ title: e.target.value })} placeholder="수업일지 열람" /></div>
              <div className="form-group"><label>설명</label><textarea rows={2} value={d.desc || ''} onChange={e => upd({ desc: e.target.value })} placeholder="기능 설명" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'landing_plans') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>플랜 이름</label><input value={d.name || ''} onChange={e => upd({ name: e.target.value })} placeholder="무료 플랜" /></div>
                <div className="form-group"><label>가격</label><input value={d.price || ''} onChange={e => upd({ price: e.target.value })} placeholder="0원" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>기간/설명</label><input value={d.period || ''} onChange={e => upd({ period: e.target.value })} placeholder="영구 무료" /></div>
                <div className="form-group"><label>배지 (비워두면 없음)</label><input value={d.tag || ''} onChange={e => upd({ tag: e.target.value || null })} placeholder="곧 출시" /></div>
              </div>
              <div className="form-group">
                <label>기능 목록 (줄바꿈으로 구분)</label>
                <textarea rows={5} value={(d.features || []).join('\n')} onChange={e => upd({ features: e.target.value.split('\n') })} placeholder={"AI 수업일지 월 20회\n회원 관리 (최대 20명)"} />
              </div>
              <div className="form-row">
                <div className="form-group"><label>버튼 텍스트</label><input value={d.cta || ''} onChange={e => upd({ cta: e.target.value })} placeholder="무료로 시작하기" /></div>
                <div className="form-group"><label>버튼 링크</label><input value={d.ctaLink || ''} onChange={e => upd({ ctaLink: e.target.value })} placeholder="/trainer" /></div>
              </div>
              <div className="form-group"><label>하단 메모</label><input value={d.note || ''} onChange={e => upd({ note: e.target.value })} placeholder="결제 수단 등록 불필요" /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input type="checkbox" id="planHighlightChk" checked={!!d.highlight} onChange={e => upd({ highlight: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="planHighlightChk" style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 500, marginBottom: 0 }}>✨ 추천 플랜 (하이라이트)</label>
              </div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'comparison') return (
            <>
              <div className="form-group"><label>기능명</label><input value={d.feature || ''} onChange={e => upd({ feature: e.target.value })} placeholder="AI 수업일지 작성" /></div>
              <div className="form-group">
                <label>기존 방식 <span style={{ color: '#ef4444' }}>✗</span></label>
                <input value={d.legacy || ''} onChange={e => upd({ legacy: e.target.value })} placeholder="수기 메모 · 10~30분" />
              </div>
              <div className="form-group">
                <label>오운 <span style={{ color: 'var(--accent)' }}>✓</span></label>
                <input value={d.ours || ''} onChange={e => upd({ ours: e.target.value })} placeholder="AI 자동 생성 · 3분" />
              </div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'crm_features') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>이모지 아이콘</label><input value={d.icon || ''} onChange={e => upd({ icon: e.target.value })} placeholder="💪" /></div>
                <div className="form-group"><label>강조 색상 (hex)</label><input value={d.color || ''} onChange={e => upd({ color: e.target.value })} placeholder="#c8f135" /></div>
              </div>
              <div className="form-group"><label>기능명</label><input value={d.title || ''} onChange={e => upd({ title: e.target.value })} placeholder="트레이너 관리" /></div>
              <div className="form-group"><label>설명</label><textarea rows={2} value={d.desc || ''} onChange={e => upd({ desc: e.target.value })} placeholder="기능 설명" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'crm_painpoints') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>이모지 아이콘</label><input value={d.icon || ''} onChange={e => upd({ icon: e.target.value })} placeholder="😤" /></div>
              </div>
              <div className="form-group"><label>페인포인트 문구</label><textarea rows={2} value={d.text || ''} onChange={e => upd({ text: e.target.value })} placeholder="트레이너별 매출을 엑셀로 정리하느라..." /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'crm_roadmap') return (
            <>
              <div className="form-group"><label>✅ 지금 사용 가능</label><input value={d.now || ''} onChange={e => upd({ now: e.target.value })} placeholder="트레이너 목록 · 회원 현황 조회" /></div>
              <div className="form-group"><label>🔜 출시 예정</label><input value={d.coming || ''} onChange={e => upd({ coming: e.target.value })} placeholder="트레이너별 매출 정산 자동화" /></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          return null
        })()}
      </Modal>

      {/* 공지사항 작성/수정 MODAL */}
      <Modal open={noticeModal} onClose={() => setNoticeModal(false)} title={noticeEditId ? '공지사항 수정' : '공지사항 작성'}>
        <div className="form-group">
          <label>제목</label>
          <input value={noticeForm.title} onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))} placeholder="공지 제목을 입력해주세요" />
        </div>
        <div className="form-group">
          <label>내용</label>
          <textarea rows={6} style={{ resize: 'vertical' }} value={noticeForm.content}
            onChange={e => setNoticeForm(f => ({ ...f, content: e.target.value }))}
            placeholder="공지 내용을 입력해주세요" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <input type="checkbox" id="adminNoticePinned" checked={noticeForm.is_pinned}
            onChange={e => setNoticeForm(f => ({ ...f, is_pinned: e.target.checked }))}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          <label htmlFor="adminNoticePinned" style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 500, marginBottom: 0 }}>📌 상단 고정</label>
        </div>
        <button className="btn btn-primary btn-full" onClick={saveNotice}>{noticeEditId ? '수정 완료' : '공지 등록'}</button>
      </Modal>

      {/* PLAN EDIT MODAL */}
      <Modal open={!!planEditModal} onClose={closePlanEdit} title={planEditModal ? `${planEditModal.name} 플랜 수정` : ''}>
        {planEditModal && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label>플랜 이름</label>
                <input value={planEditModal.name} onChange={e => setPlanEditModal({ ...planEditModal, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>가격</label>
                <input value={planEditModal.price} onChange={e => setPlanEditModal({ ...planEditModal, price: e.target.value })} placeholder="₩9,900/월" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>색상 (hex)</label>
                <input value={planEditModal.color} onChange={e => setPlanEditModal({ ...planEditModal, color: e.target.value })} placeholder="#c8f135" />
              </div>
              <div className="form-group">
                <label>뱃지 텍스트 (선택)</label>
                <input value={planEditModal.badge || ''} onChange={e => setPlanEditModal({ ...planEditModal, badge: e.target.value || null })} placeholder="출시 예정" />
              </div>
            </div>
            <div className="form-group">
              <label>혜택 목록 (한 줄에 하나씩)</label>
              <textarea rows={5} value={planEditModal.featuresText} onChange={e => setPlanEditModal({ ...planEditModal, featuresText: e.target.value })} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!planEditModal.highlight} onChange={e => setPlanEditModal({ ...planEditModal, highlight: e.target.checked })} />
                추천 플랜 강조
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!planEditModal.current} onChange={e => setPlanEditModal({ ...planEditModal, current: e.target.checked })} />
                현재 플랜 표시
              </label>
            </div>
            <button className="btn btn-primary btn-full" onClick={async () => {
              const updated = plans.map(p => p.id === planEditModal.id
                ? { ...planEditModal, features: planEditModal.featuresText.split('\n').map(f => f.trim()).filter(Boolean) }
                : p)
              await savePlans(updated)
              closePlanEdit()
            }}>저장</button>
          </>
        )}
      </Modal>

      {/* (제거됨) 1:1 문의 답변 MODAL — 카카오 채널 외부 우회로 폐기 */}

      {/* COMMUNITY USER PERMISSION MODAL */}
      <Modal open={!!commPermModal} onClose={() => setCommPermModal(null)} title={commPermModal ? `${commPermModal.name} 접근 권한 설정` : ''}>
        {commPermModal && (() => {
          const perms = commPermModal.admin_permissions || {}
          const isBanned = !!perms.banned
          const extraRoles = perms.extra_roles || []
          const baseRole = commPermModal.role
          const baseMeta = COMM_ROLE_OPTIONS.find(r => r.key === baseRole)
          return (
            <>
              {/* 기본 역할 */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>기본 역할</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px' }}>
                  <span>{baseMeta?.emoji}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: baseMeta?.color || 'var(--text)' }}>{baseMeta?.label || baseRole}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>· {baseMeta?.desc}</span>
                </div>
              </div>

              <div className="divider" />

              {/* 접근 차단 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: isBanned ? 'var(--danger)' : 'var(--text)' }}>커뮤니티 접근 차단</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>차단 시 로그인해도 피드에 접근할 수 없습니다</div>
                </div>
                <button
                  className={`crm-toggle${isBanned ? ' on' : ''}`}
                  style={{ fontSize: '12px', padding: '5px 14px', background: isBanned ? 'rgba(239,68,68,0.12)' : '', borderColor: isBanned ? 'rgba(239,68,68,0.3)' : '', color: isBanned ? 'var(--danger)' : '' }}
                  onClick={() => toggleCommBan(commPermModal.id, !isBanned)}
                >
                  {isBanned ? '차단 중' : '허용'}
                </button>
              </div>

              <div className="divider" />

              {/* 추가 권한 */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>추가 권한 부여</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px' }}>체크한 역할의 카테고리 열람·작성 권한이 추가됩니다</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {COMM_ROLE_OPTIONS.filter(r => r.key !== baseRole).map(r => {
                    const hasExtra = extraRoles.includes(r.key)
                    return (
                      <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${hasExtra ? `${r.color}33` : 'var(--border)'}`, background: hasExtra ? `${r.color}0a` : 'transparent', cursor: 'pointer' }} onClick={() => toggleExtraRole(commPermModal.id, r.key, hasExtra)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>{r.emoji}</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: hasExtra ? r.color : 'var(--text)' }}>{r.label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{r.desc}</div>
                          </div>
                        </div>
                        <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${hasExtra ? r.color : 'var(--border)'}`, background: hasExtra ? r.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {hasExtra && <span style={{ fontSize: '11px', color: '#0a0a0a', fontWeight: 900 }}>✓</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )
        })()}
      </Modal>

      {/* ADD SUBSCRIPTION MODAL */}
      <Modal open={subModal} onClose={() => setSubModal(false)} title="결제 추가">
        <div className="form-group">
          <label>트레이너</label>
          <select value={subForm.trainer_id} onChange={e => setSubForm({ ...subForm, trainer_id: e.target.value })}>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>플랜</label>
            <select value={subForm.plan} onChange={e => setSubForm({ ...subForm, plan: e.target.value })}>
              <option value="basic">Basic</option><option value="pro">Pro</option><option value="business">Business</option>
            </select>
          </div>
          <div className="form-group">
            <label>결제 금액 (원)</label>
            <input type="number" value={subForm.amount} onChange={e => setSubForm({ ...subForm, amount: e.target.value })} placeholder="99000" />
          </div>
        </div>
        <div className="form-group">
          <label>결제 수단</label>
          <select value={subForm.payment_method} onChange={e => setSubForm({ ...subForm, payment_method: e.target.value })}>
            <option value="카카오페이">카카오페이</option><option value="카드">카드</option><option value="계좌이체">계좌이체</option><option value="현금">현금</option>
          </select>
        </div>
        <div className="form-row">
          <div className="form-group"><label>결제일</label><input type="date" value={subForm.paid_at} onChange={e => setSubForm({ ...subForm, paid_at: e.target.value })} /></div>
          <div className="form-group"><label>만료일</label><input type="date" value={subForm.valid_until} onChange={e => setSubForm({ ...subForm, valid_until: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={subForm.memo} onChange={e => setSubForm({ ...subForm, memo: e.target.value })} placeholder="특이사항" /></div>
        <button className="btn btn-primary btn-full" onClick={addSubscription}>저장</button>
      </Modal>

      {/* TRAINER PRE-REGISTER MODAL */}
      <Modal open={trainerRegModal} onClose={() => setTrainerRegModal(false)} title="트레이너 사전 등록">
        <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '18px', lineHeight: 1.7 }}>
          소셜 로그인 전에 이름과 이메일을 미리 등록해두면,<br />
          해당 이메일로 첫 로그인 시 <strong style={{ color: 'var(--text)' }}>자동으로 트레이너 계정</strong>과 연동됩니다.
        </div>
        <div className="form-group">
          <label>이름 <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span></label>
          <input
            type="text"
            value={trainerRegForm.name}
            onChange={e => setTrainerRegForm(f => ({ ...f, name: e.target.value }))}
            placeholder="홍길동"
            onKeyDown={e => e.key === 'Enter' && registerTrainer()}
            autoFocus
          />
        </div>
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label>이메일 <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span></label>
          <input
            type="email"
            value={trainerRegForm.email}
            onChange={e => setTrainerRegForm(f => ({ ...f, email: e.target.value }))}
            placeholder="trainer@example.com"
            onKeyDown={e => e.key === 'Enter' && registerTrainer()}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setTrainerRegModal(false)}
            disabled={trainerRegLoading}
          >취소</button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={registerTrainer}
            disabled={trainerRegLoading}
          >{trainerRegLoading ? '등록 중...' : '등록하기'}</button>
        </div>
      </Modal>

      {/* TRAINER DETAIL MODAL */}
      <Modal open={!!trainerModal} onClose={() => setTrainerModal(null)} title={selectedTrainer ? `${selectedTrainer.name} 트레이너` : '트레이너 상세'}>
        {selectedTrainer && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div className="stat-card"><div className="stat-num" style={{ fontSize: '20px' }}>{stMembers.length}</div><div className="stat-label">회원수</div></div>
              <div className="stat-card"><div className="stat-num" style={{ fontSize: '20px' }}>{stLogs.length}</div><div className="stat-label">총 일지</div></div>
              <div className="stat-card"><div className="stat-num" style={{ fontSize: '20px' }}>{stSubs.length}</div><div className="stat-label">결제 건</div></div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>가입일: {new Date(selectedTrainer.created_at).toLocaleString('ko-KR')}</div>
            <div className="divider" />
            {/* 크레딧 관리 */}
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>AI 크레딧 관리</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: "'DM Mono',monospace", color: 'var(--accent)' }}>{selectedTrainer.credits ?? 0}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>보유 크레딧</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="number" min="1" max="1000"
                  value={creditAmount}
                  onChange={e => setCreditAmount(e.target.value)}
                  style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px', fontFamily: 'inherit' }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => addTrainerCredits(selectedTrainer.id, parseInt(creditAmount) || 0)}
                >충전</button>
              </div>
            </div>
            <div className="divider" />
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>회원 목록</div>
            {stMembers.length ? stMembers.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text)' }}>{m.name}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{m.lesson_purpose || '-'} · {m.done_sessions}/{m.total_sessions}회</span>
              </div>
            )) : <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>회원 없음</div>}
            <div className="divider" />
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>결제 이력</div>
            {stSubs.length ? stSubs.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <div><span className="badge badge-blue" style={{ marginRight: '6px' }}>{s.plan}</span>{s.payment_method}</div>
                <div style={{ textAlign: 'right' }}><div style={{ color: 'var(--text)' }}>{s.amount?.toLocaleString()}원</div><div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{s.paid_at?.split('T')[0]}</div></div>
              </div>
            )) : <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>결제 이력 없음</div>}
          </>
        )}
      </Modal>

      {/* Toast 레이어 — 메인 화면용 */}
      <div
        role="status"
        aria-live="polite"
        className={`admin-toast${toast.show ? ' admin-toast--show' : ''} admin-toast--${toast.type}`}
      >
        {toast.message}
      </div>
    </div>
  )
}
