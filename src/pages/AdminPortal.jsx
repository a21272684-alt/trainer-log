import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import '../styles/admin.css'

const ADMIN_PW = 'trainer2024!'

const PORTAL_TABS = {
  trainer:   [{ id:'list', label:'트레이너 목록' }, { id:'logs', label:'수업일지' }, { id:'subs', label:'구독 관리' }, { id:'plans', label:'플랜 관리' }, { id:'support', label:'1:1 문의' }],
  member:    [{ id:'status', label:'회원 현황' }, { id:'notices', label:'공지사항 관리' }, { id:'free_board', label:'자유게시판 관리' }],
  community: [{ id:'posts', label:'게시글' }, { id:'users', label:'유저' }, { id:'contacts', label:'연락 요청' }],
  crm:       [{ id:'permissions', label:'권한 관리' }],
  landing:   [
    { id:'hero',      label:'히어로' },
    { id:'stats',     label:'통계 수치' },
    { id:'problems',  label:'문제 인식' },
    { id:'solutions', label:'솔루션' },
    { id:'reviews',   label:'트레이너 후기' },
    { id:'kakao',     label:'카카오 메시지' },
    { id:'targets',   label:'타겟 분기' },
    { id:'members',   label:'회원 포털 기능' },
    { id:'plans',      label:'요금제' },
    { id:'faqs',       label:'FAQ' },
    { id:'comparison', label:'기능 비교' },
  ],
}

const DEFAULT_TAB = { trainer:'list', member:'status', community:'posts', crm:'permissions', landing:'hero' }

const DEFAULT_LANDING_STATS = [
  { num:'3분', label:'첫 수업일지 완성까지', sub:'녹음 업로드부터 발송까지' },
  { num:'98%', label:'리포트 평균 열람률', sub:'회원이 실제로 확인하는 일지' },
  { num:'0원', label:'시작 비용', sub:'무료 플랜으로 지금 바로 시작' },
]
const DEFAULT_LANDING_REVIEWS = [
  { name:'김O준 트레이너', location:'서울 마포구 · 1인샵', text:'수업 끝나고 일지 쓰는 게 제일 귀찮았는데, 녹음 올리면 알아서 써줘서 진짜 편해요. 회원들도 리포트 받으면 좋아해서 재등록률이 확실히 올라갔어요.', rating:5, initial:'김' },
  { name:'이O현 트레이너', location:'경기 성남 · 프리랜서', text:'이탈위험 기능이 신기해요. 출석이 줄던 회원한테 미리 연락했더니 "연락 와줘서 감사하다"고 하더라고요. 그 회원 재등록했어요.', rating:5, initial:'이' },
  { name:'박O영 트레이너', location:'부산 해운대 · 센터 소속', text:'매출 계산을 엑셀로 하다가 이걸로 바꿨는데 시간이 확 줄었어요. 세금 계산까지 해주는 건 몰랐는데 정산 탭 보고 깜짝 놀랐어요.', rating:5, initial:'박' },
]
const DEFAULT_LANDING_KAKAO = [
  { from:'회원', text:'트레이너님!! 리포트 너무 자세해서 깜짝 놀랐어요 ㅠㅠ 이렇게까지 신경 써주시다니 감동이에요 🥹', time:'오후 8:23' },
  { from:'회원', text:'오늘 운동 기록 딱 정리돼서 왔네요! 다음 수업도 기대돼요 💪', time:'오후 10:05' },
  { from:'회원', text:'와 선생님 이거 뭐예요?? 제 운동 내용이 다 정리돼있어요 ㅋㅋㅋ 친구한테도 자랑했어요', time:'오후 7:41' },
]
const DEFAULT_LANDING_FAQS = [
  { q:'AI 수업일지를 만들려면 별도 비용이 드나요?', a:'크레딧 방식으로 운영돼요. 가입 시 기본 크레딧이 지급되며, 크레딧 1개로 AI 수업일지를 1회 생성할 수 있어요. 추가 크레딧은 합리적인 가격으로 충전할 수 있어요.' },
  { q:'회원이 별도로 앱을 설치해야 하나요?', a:'아니요. 회원은 트레이너가 카카오톡으로 보내는 링크를 클릭하기만 하면 돼요. 앱 설치 없이 브라우저에서 바로 수업 리포트를 확인할 수 있어요.' },
  { q:'트레이너 여러 명이 함께 쓸 수 있나요?', a:'현재는 트레이너 개인 계정 단위로 운영돼요. 각 트레이너가 개별 계정을 만들어 사용하면 됩니다.' },
  { q:'기존에 쓰던 데이터를 옮겨올 수 있나요?', a:'현재는 직접 입력 방식만 지원해요. 데이터 마이그레이션 기능은 Pro 플랜과 함께 제공될 예정이에요.' },
  { q:'스마트폰에서도 잘 되나요?', a:'네. 모바일 브라우저에 최적화되어 있어요. 홈 화면에 추가(PWA)하면 앱처럼 사용할 수 있고, 수업 전 푸시 알림도 받을 수 있어요.' },
  { q:'Pro 플랜 가격은 얼마인가요?', a:'아직 확정되지 않았어요. 얼리어답터분들에게 더 합리적인 가격으로 제공할 예정이에요.' },
]

const DEFAULT_PLANS = [
  { id:'free',    name:'Free',    price:'무료',        color:'#9ca3af', highlight:false, current:true,  badge:null,       enabled:true, features:['회원 5명','AI 일지 월 20회','식단 기록','기본 통계'] },
  { id:'pro',     name:'Pro',     price:'₩9,900/월',  color:'#60a5fa', highlight:false, current:false, badge:'출시 예정', enabled:true, features:['회원 무제한','AI 일지 무제한','주간 리포트 AI','매출 분석'] },
  { id:'premium', name:'Premium', price:'₩19,900/월', color:'#c8f135', highlight:true,  current:false, badge:'출시 예정', enabled:true, features:['Pro 전체 포함','루틴 마켓 무제한','카카오 자동 발송','우선 지원'] },
]

const DEFAULT_LANDING_HERO = {
  badge: 'FOR PERSONAL TRAINERS & MEMBERS',
  headline: '좋은 트레이너는',
  highlight: '기록',
  headlineAfter: '으로 증명합니다',
  subheadline: '수업일지 · 회원관리 · 매출분석을 하나의 앱으로',
  desc: 'AI가 수업일지를 대신 쓰고, 회원은 포털에서 기록을 확인해요. 트레이너의 전문성이 데이터로 쌓입니다.',
}
const DEFAULT_LANDING_PROBLEMS = [
  { icon:'😮‍💨', title:'수업 끝나고 일지 쓰는 데 30분씩 쓰고 계신가요?', desc:'운동 종목, 세트 수, 느낀 점… 기억에 의존해서 손으로 하나하나 적다 보면 하루가 다 가요. 정작 다음 회원 준비는 뒷전이 되고요.' },
  { icon:'👻', title:'연락 없이 사라지는 회원, 막을 방법이 없었나요?', desc:'재등록 시기가 됐는데도 아무 신호가 없어요. 출석이 줄고 있다는 걸 알면서도 어떻게 말을 꺼내야 할지 모르죠.' },
  { icon:'📉', title:'이번 달 매출이 얼마인지 바로 답할 수 있나요?', desc:'엑셀도, 메모장도, 카카오톡도 다 따로따로. 세션 단가 × 잔여 횟수 계산을 머릿속으로 하고 계신다면, 이미 시간을 낭비하고 있는 거예요.' },
]
const DEFAULT_LANDING_SOLUTIONS = [
  { icon:'✦', tag:'AI 수업일지', title:'녹음만 올리면 일지가 완성돼요', desc:'AI가 수업 내용을 분석해 운동 종목·세트·피드백을 완성된 일지로 만들어줘요. 회원에게는 카카오톡으로 바로 발송.' },
  { icon:'🔔', tag:'이탈위험 감지', title:'이탈 징후를 미리 알려줘요', desc:'출석률·건강기록·수업 평점을 분석해 이탈위험 회원을 자동으로 감지해요. 연락 타이밍을 놓치지 마세요.' },
  { icon:'📊', tag:'매출 자동 분석', title:'매출이 실시간으로 계산돼요', desc:'결제를 등록하면 세션 단가·잔존가치·월 매출이 자동으로 집계돼요. 고용형태별 세금 계산도 지원해요.' },
]
const DEFAULT_LANDING_TARGETS = [
  { type:'1인샵 운영 트레이너', icon:'🏠', color:'#c8f135', textColor:'#3f6212', bg:'rgba(200,241,53,0.08)', border:'rgba(200,241,53,0.3)', points:['혼자 다 하느라 행정에 시간 다 빼앗기는 분','회원 관리·매출·일지를 하나로 합치고 싶은 분','더 많은 시간을 수업 품질에 쓰고 싶은 분'] },
  { type:'프리랜서 트레이너', icon:'🧳', color:'#60a5fa', textColor:'#1d4ed8', bg:'rgba(96,165,250,0.08)', border:'rgba(96,165,250,0.3)', points:['센터별 회원을 따로 관리하기 복잡한 분','수수료·세금 계산이 번거로운 분','이탈 걱정 없이 안정적인 수업을 원하는 분'] },
  { type:'센터 소속 트레이너', icon:'🏢', color:'#a78bfa', textColor:'#7c3aed', bg:'rgba(167,139,250,0.08)', border:'rgba(167,139,250,0.3)', points:['재등록률을 높여 인센티브를 늘리고 싶은 분','회원과의 관계를 전문적으로 보여주고 싶은 분','주간 리포트로 센터 내 신뢰를 쌓고 싶은 분'] },
]
const DEFAULT_LANDING_MEMBER_FEATURES = [
  { icon:'📋', title:'수업일지 열람', desc:'PDF 저장·복사로 내 성장 기록을 언제든 꺼내볼 수 있어요' },
  { icon:'⚖️', title:'체중·건강 추적', desc:'공복/저녁 체중, 수면 레벨을 기록하고 14일 추이를 확인' },
  { icon:'🏃', title:'개인운동 일지', desc:'60+ 종목 자동완성, 세트·볼륨 계산, 앞뒤 근육 다이어그램' },
  { icon:'🤝', title:'회원 커뮤니티', desc:'같은 센터 회원들과 운동 일상을 사진·이모지로 공유' },
]
const DEFAULT_LANDING_COMPARISON = [
  { feature:'AI 수업일지 작성',  legacy:'수기 메모 · 10~30분',      ours:'AI 자동 생성 · 3분' },
  { feature:'회원 리포트 발송',  legacy:'별도 없음',                 ours:'카카오톡 자동 발송' },
  { feature:'이탈 회원 감지',    legacy:'감 또는 직접 연락',          ours:'AI 이탈위험 자동 알림' },
  { feature:'매출 계산',         legacy:'엑셀·메모장 수기 집계',      ours:'결제 등록 시 자동 집계' },
  { feature:'건강 기록 추적',    legacy:'없음',                      ours:'체중·수면·체성분 추적' },
  { feature:'회원 전용 포털',    legacy:'없음',                      ours:'전용 포털 + 개인운동 일지' },
  { feature:'시작 비용',         legacy:'유료 구독 필요',             ours:'0원 (무료 플랜)' },
]
const DEFAULT_LANDING_PLANS_LANDING = [
  { name:'무료 플랜', price:'0원', period:'영구 무료', highlight:false, tag:null, features:['AI 수업일지 월 20회','회원 관리 (최대 20명)','수업 리포트 카카오 발송','체중·건강 기록','주간 스케줄','매출 기본 분석'], cta:'무료로 시작하기', ctaLink:'/trainer', note:'결제 수단 등록 불필요' },
  { name:'Pro 플랜', price:'준비 중', period:'출시 예정', highlight:true, tag:'곧 출시', features:['AI 수업일지 무제한','회원 관리 무제한','이탈위험 자동 감지','고용형태별 세금 계산','주간 센터 리포트','우선 고객 지원'], cta:'출시 알림 받기', ctaLink:'mailto:support@trainerlog.app?subject=Pro 플랜 출시 알림 신청', note:'얼리어답터 할인 예정' },
]

const COMM_CAT_LABEL = {
  trainer_seeks_member:     '직원 구인',
  member_seeks_trainer:     '나만의 트레이너 찾기',
  instructor_seeks_student: '수강생 구인',
  gym_seeks_trainer:        '트레이너 채용',
  trainer_seeks_gym:        '센터 구직',
}

// 커뮤니티 역할 옵션 (권한 설정 모달에서 사용)
const COMM_ROLE_OPTIONS = [
  { key:'trainer',    label:'트레이너',    emoji:'💪', color:'#c8f135', desc:'수업일지·구인 작성' },
  { key:'member',     label:'회원',        emoji:'🏃', color:'#4fc3f7', desc:'트레이너 찾기 작성' },
  { key:'gym_owner',  label:'헬스장 대표', emoji:'🏢', color:'#e040fb', desc:'채용공고·제휴 작성' },
  { key:'educator',   label:'교육강사',    emoji:'📚', color:'#ff9800', desc:'교육과정·마켓 작성' },
]
const COMM_ROLE_LABEL = { trainer:'트레이너', member:'회원', instructor:'교육강사', gym_owner:'헬스장 대표' }

const CAT_COLOR = {
  trainer_seeks_member:     { bg:'rgba(200,241,53,0.12)',  color:'#c8f135' },
  member_seeks_trainer:     { bg:'rgba(79,195,247,0.12)',  color:'#4fc3f7' },
  instructor_seeks_student: { bg:'rgba(255,152,0,0.12)',   color:'#ff9800' },
  gym_seeks_trainer:        { bg:'rgba(224,64,251,0.12)',  color:'#e040fb' },
  trainer_seeks_gym:        { bg:'rgba(255,92,92,0.12)',   color:'#ff5c5c' },
}

const CRM_FEATURES = [
  { key:'lead_management',  label:'리드 관리' },
  { key:'client_notes',     label:'고객 노트' },
  { key:'follow_up',        label:'팔로업' },
  { key:'data_export',      label:'데이터 내보내기' },
]

export default function AdminPortal() {
  const showToast = useToast()
  const [loggedIn, setLoggedIn] = useState(false)
  const [pw, setPw] = useState('')
  const [page, setPage] = useState('dashboard')
  const [subTab, setSubTab] = useState('')

  const [trainers, setTrainers] = useState([])
  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState([])
  const [subs, setSubs] = useState([])
  const [commUsers, setCommUsers] = useState([])
  const [commPosts, setCommPosts] = useState([])
  const [commContacts, setCommContacts] = useState([])

  const [logPeriod, setLogPeriod] = useState('day')
  const [subModal, setSubModal] = useState(false)
  const [trainerModal, setTrainerModal] = useState(null)
  const [subForm, setSubForm] = useState({ trainer_id:'', plan:'basic', amount:'', payment_method:'카카오페이', paid_at:'', valid_until:'', memo:'' })

  // 플랜 관리
  const [planGuideVisible, setPlanGuideVisible] = useState(true)
  const [plans, setPlans] = useState(DEFAULT_PLANS)
  const [planEditModal, setPlanEditModal] = useState(null)

  // 커뮤니티 유저 권한 관리
  const [commPermModal, setCommPermModal] = useState(null) // community_users row

  // 1:1 문의 관리
  const [supportList,  setSupportList]  = useState([])
  const [supportModal, setSupportModal] = useState(null)   // 선택된 inquiry row
  const [answerText,   setAnswerText]   = useState('')
  const [answerFilter, setAnswerFilter] = useState('all')  // all | pending | answered

  // 공지사항 관리
  const [notices, setNotices] = useState([])
  const [noticeModal, setNoticeModal] = useState(false)
  const [noticeEditId, setNoticeEditId] = useState(null)
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', is_pinned: false })

  // 자유게시판 관리
  const [freePosts, setFreePosts] = useState([])

  // 랜딩페이지 관리
  const [landingStats,   setLandingStats]   = useState(DEFAULT_LANDING_STATS)
  const [landingReviews, setLandingReviews] = useState(DEFAULT_LANDING_REVIEWS)
  const [landingKakao,   setLandingKakao]   = useState(DEFAULT_LANDING_KAKAO)
  const [landingFaqs,    setLandingFaqs]    = useState(DEFAULT_LANDING_FAQS)
  const [landingEditModal, setLandingEditModal] = useState(null) // {type, index, data}

  // 랜딩 추가 섹션
  const [landingHero,           setLandingHero]           = useState(DEFAULT_LANDING_HERO)
  const [landingProblems,       setLandingProblems]       = useState(DEFAULT_LANDING_PROBLEMS)
  const [landingSolutions,      setLandingSolutions]      = useState(DEFAULT_LANDING_SOLUTIONS)
  const [landingTargets,        setLandingTargets]        = useState(DEFAULT_LANDING_TARGETS)
  const [landingMemberFeatures, setLandingMemberFeatures] = useState(DEFAULT_LANDING_MEMBER_FEATURES)
  const [landingPlansLanding,   setLandingPlansLanding]   = useState(DEFAULT_LANDING_PLANS_LANDING)
  const [landingComparison,     setLandingComparison]     = useState(DEFAULT_LANDING_COMPARISON)

  // 크레딧 / API 키 관리
  const [creditAmount, setCreditAmount] = useState('10')
  const [centralApiKey, setCentralApiKey] = useState('')
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)

  const navigate = (portalId) => {
    setPage(portalId)
    if (DEFAULT_TAB[portalId]) setSubTab(DEFAULT_TAB[portalId])
  }

  const login = () => {
    if (pw !== ADMIN_PW) { showToast('비밀번호가 틀렸어요'); return }
    setLoggedIn(true)
  }
  const logout = () => { setLoggedIn(false); setPw('') }

  useEffect(() => { if (loggedIn) loadAll() }, [loggedIn])

  async function loadAll() {
    try {
      const [t, m, l, s, cu, cp, cc, settings, inq, ntc, fp] = await Promise.all([
        supabase.from('trainers').select('*').order('created_at', { ascending: false }),
        supabase.from('members').select('*').order('created_at', { ascending: false }),
        supabase.from('logs').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*').order('paid_at', { ascending: false }),
        supabase.from('community_users').select('*').order('created_at', { ascending: false }),
        supabase.from('community_posts').select('*, author:community_users(name,role)').order('created_at', { ascending: false }),
        supabase.from('community_contacts').select('*, requester:community_users(name,role), post:community_posts(title)').order('created_at', { ascending: false }),
        supabase.from('app_settings').select('key, value').in('key', [
          'plan_guide_visible', 'plans', 'gemini_api_key',
          'landing_hero', 'landing_stats', 'landing_problems', 'landing_solutions',
          'landing_reviews', 'landing_kakao', 'landing_targets', 'landing_member_features',
          'landing_plans_landing', 'landing_faqs', 'landing_comparison',
        ]),
        supabase.from('inquiries').select('*, trainer:trainers(name)').order('created_at', { ascending: false }),
        supabase.from('notices').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('member_posts').select('*').order('created_at', { ascending: false }),
      ])
      setTrainers(t.data || []); setMembers(m.data || []); setLogs(l.data || []); setSubs(s.data || [])
      setCommUsers(cu.data || []); setCommPosts(cp.data || []); setCommContacts(cc.data || [])
      setSupportList(inq.data || [])
      setNotices(ntc.data || [])
      setFreePosts(fp.data || [])
      if (settings.data) {
        const vis  = settings.data.find(r => r.key === 'plan_guide_visible')
        const plns = settings.data.find(r => r.key === 'plans')
        const lStats   = settings.data.find(r => r.key === 'landing_stats')
        const lReviews = settings.data.find(r => r.key === 'landing_reviews')
        const lKakao   = settings.data.find(r => r.key === 'landing_kakao')
        const lFaqs    = settings.data.find(r => r.key === 'landing_faqs')
        if (vis  != null) setPlanGuideVisible(vis.value)
        if (plns != null) setPlans(plns.value)
        if (lStats)   setLandingStats(lStats.value)
        if (lReviews) setLandingReviews(lReviews.value)
        if (lKakao)   setLandingKakao(lKakao.value)
        if (lFaqs)    setLandingFaqs(lFaqs.value)
        const lHero    = settings.data.find(r => r.key === 'landing_hero')
        const lProbs   = settings.data.find(r => r.key === 'landing_problems')
        const lSols    = settings.data.find(r => r.key === 'landing_solutions')
        const lTargets = settings.data.find(r => r.key === 'landing_targets')
        const lMembers = settings.data.find(r => r.key === 'landing_member_features')
        const lPlansl  = settings.data.find(r => r.key === 'landing_plans_landing')
        const lComparison = settings.data.find(r => r.key === 'landing_comparison')
        if (lHero?.value)         setLandingHero(lHero.value)
        if (lProbs?.value)        setLandingProblems(lProbs.value)
        if (lSols?.value)         setLandingSolutions(lSols.value)
        if (lTargets?.value)      setLandingTargets(lTargets.value)
        if (lMembers?.value)      setLandingMemberFeatures(lMembers.value)
        if (lPlansl?.value)       setLandingPlansLanding(lPlansl.value)
        if (lComparison?.value)   setLandingComparison(lComparison.value)
        const apiKeyRow = settings.data.find(r => r.key === 'gemini_api_key')
        if (apiKeyRow?.value) setCentralApiKey(String(apiKeyRow.value).replace(/^"|"$/g, ''))
        setApiKeyLoaded(true)
      }
    } catch(e) { showToast('데이터 로드 오류: ' + e.message) }
  }

  // 크레딧 충전
  async function addTrainerCredits(trainerId, amount) {
    try {
      const { data, error } = await supabase.rpc('admin_add_credits', { p_trainer_id: trainerId, p_amount: amount })
      if (error) throw error
      setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, credits: data } : t))
      showToast(`✓ ${amount}크레딧 충전 완료 (잔액: ${data}개)`)
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // 중앙 API 키 저장
  async function saveCentralApiKey() {
    try {
      await supabase.from('app_settings').upsert({ key: 'gemini_api_key', value: centralApiKey }, { onConflict: 'key' })
      showToast('✓ API 키가 저장됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // ===== COMMUNITY =====
  async function commClosePost(postId) {
    await supabase.from('community_posts').update({ status: 'closed' }).eq('id', postId)
    setCommPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'closed' } : p))
    showToast('마감 처리했습니다')
  }
  async function commDeletePost(postId) {
    if (!window.confirm('게시글을 삭제할까요?')) return
    await supabase.from('community_posts').delete().eq('id', postId)
    setCommPosts(prev => prev.filter(p => p.id !== postId))
    showToast('삭제했습니다')
  }
  async function commDeleteUser(userId) {
    if (!window.confirm('이 유저를 삭제할까요? 작성한 글과 연락 요청도 모두 삭제됩니다.')) return
    await supabase.from('community_users').delete().eq('id', userId)
    setCommUsers(prev => prev.filter(u => u.id !== userId))
    setCommPosts(prev => prev.filter(p => p.author?.id !== userId))
    showToast('유저를 삭제했습니다')
  }

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
        setNotices(prev => prev.map(n => n.id === noticeEditId ? { ...n, ...noticeForm } : n).sort((a,b) => b.is_pinned - a.is_pinned || new Date(b.created_at) - new Date(a.created_at)))
        showToast('✓ 공지사항이 수정됐어요')
      } else {
        const { data, error } = await supabase.from('notices').insert({
          title: noticeForm.title.trim(), content: noticeForm.content.trim(),
          is_pinned: noticeForm.is_pinned, author_name: '관리자',
        }).select().single()
        if (error) throw error
        setNotices(prev => [data, ...prev].sort((a,b) => b.is_pinned - a.is_pinned || new Date(b.created_at) - new Date(a.created_at)))
        showToast('✓ 공지사항이 등록됐어요')
      }
      setNoticeModal(false); setNoticeForm({ title:'', content:'', is_pinned:false }); setNoticeEditId(null)
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deleteNotice(noticeId) {
    if (!window.confirm('공지사항을 삭제할까요?')) return
    const { error } = await supabase.from('notices').delete().eq('id', noticeId)
    if (!error) { setNotices(prev => prev.filter(n => n.id !== noticeId)); showToast('삭제됐어요') }
    else showToast('오류: ' + error.message)
  }
  function openNoticeEdit(notice) {
    setNoticeEditId(notice.id)
    setNoticeForm({ title: notice.title, content: notice.content, is_pinned: notice.is_pinned })
    setNoticeModal(true)
  }

  // ===== 자유게시판 모더레이션 =====
  async function deleteFreeBoardPost(postId) {
    if (!window.confirm('게시글을 삭제할까요?')) return
    const { error } = await supabase.from('member_posts').delete().eq('id', postId)
    if (!error) { setFreePosts(prev => prev.filter(p => p.id !== postId)); showToast('삭제됐어요') }
    else showToast('오류: ' + error.message)
  }

  // ===== 커뮤니티 유저 권한 =====
  async function saveCommUserPerms(userId, newPerms) {
    const { error } = await supabase
      .from('community_users')
      .update({ admin_permissions: newPerms })
      .eq('id', userId)
    if (error) { showToast('오류: ' + error.message); return false }
    setCommUsers(prev => prev.map(u => u.id === userId ? { ...u, admin_permissions: newPerms } : u))
    // 모달 데이터도 동기화
    setCommPermModal(prev => prev ? { ...prev, admin_permissions: newPerms } : null)
    return true
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

  // ===== 1:1 문의 =====
  async function submitAnswer(inquiryId) {
    if (!answerText.trim()) return showToast('답변 내용을 입력해주세요')
    const now = new Date().toISOString()
    const { error } = await supabase.from('inquiries')
      .update({ status:'answered', answer: answerText.trim(), answered_at: now })
      .eq('id', inquiryId)
    if (error) return showToast('오류: ' + error.message)
    setSupportList(prev => prev.map(i => i.id === inquiryId
      ? { ...i, status:'answered', answer: answerText.trim(), answered_at: now } : i))
    setSupportModal(prev => prev ? { ...prev, status:'answered', answer: answerText.trim(), answered_at: now } : null)
    setAnswerText('')
    showToast('✓ 답변이 등록됐어요')
  }

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

  // ===== 플랜 관리 =====
  async function savePlanVisibility(visible) {
    const { error } = await supabase.from('app_settings')
      .upsert({ key:'plan_guide_visible', value:visible, updated_at:new Date().toISOString() }, { onConflict:'key' })
    if (error) { showToast('오류: ' + error.message); return }
    setPlanGuideVisible(visible)
    showToast(visible ? '플랜 안내가 표시됩니다' : '플랜 안내가 숨겨집니다')
  }
  async function savePlans(newPlans) {
    const { error } = await supabase.from('app_settings')
      .upsert({ key:'plans', value:newPlans, updated_at:new Date().toISOString() }, { onConflict:'key' })
    if (error) { showToast('오류: ' + error.message); return }
    setPlans(newPlans)
    showToast('✓ 플랜이 저장됐어요')
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
      if (period === 'day')   return d.toDateString() === now.toDateString()
      if (period === 'week')  { const w = new Date(now); w.setDate(now.getDate()-7); return d >= w }
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      return true
    })
  }

  // ===== SUBSCRIPTION =====
  const openAddSub = () => {
    const today = new Date().toISOString().split('T')[0]
    const next = new Date(); next.setMonth(next.getMonth()+1)
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
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // ===== LOGIN =====
  if (!loggedIn) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">오운</div>
          <div className="login-badge">ADMIN</div>
          <div className="form-group">
            <label>관리자 비밀번호</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="비밀번호 입력" onKeyDown={e => e.key === 'Enter' && login()} />
          </div>
          <button className="btn btn-primary btn-full" style={{marginTop:'8px'}} onClick={login}>관리자 로그인</button>
        </div>
      </div>
    )
  }

  // ===== COMPUTED =====
  const today = new Date().toDateString()
  const todayLogs = logs.filter(l => new Date(l.created_at).toDateString() === today)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7)
  const activeTrainers = new Set(logs.filter(l => new Date(l.created_at) > weekAgo).map(l => l.trainer_id)).size
  const filteredLogs = filterLogsByPeriod(logs, logPeriod)
  const periodLabel = {day:'오늘', week:'이번 주', month:'이번 달'}[logPeriod]

  const selectedTrainer = trainerModal ? trainers.find(t => t.id === trainerModal) : null
  const stMembers = selectedTrainer ? members.filter(m => m.trainer_id === selectedTrainer.id) : []
  const stLogs    = selectedTrainer ? logs.filter(l => l.trainer_id === selectedTrainer.id) : []
  const stSubs    = selectedTrainer ? subs.filter(s => s.trainer_id === selectedTrainer.id).sort((a,b) => new Date(b.paid_at)-new Date(a.paid_at)) : []

  // ── 랜딩 저장 헬퍼 ──────────────────────────────────────────
  async function saveLandingKey(key, value) {
    await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' })
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
  async function saveLandingHero(next)          { setLandingHero(next);          await saveLandingKey('landing_hero', next);            showToast('✓ 히어로 저장됨') }
  async function saveLandingProblems(next)      { setLandingProblems(next);      await saveLandingKey('landing_problems', next);        showToast('✓ 문제 인식 저장됨') }
  async function saveLandingSolutions(next)     { setLandingSolutions(next);     await saveLandingKey('landing_solutions', next);       showToast('✓ 솔루션 저장됨') }
  async function saveLandingTargets(next)       { setLandingTargets(next);       await saveLandingKey('landing_targets', next);         showToast('✓ 타겟 분기 저장됨') }
  async function saveLandingMemberFeatures(next){ setLandingMemberFeatures(next);await saveLandingKey('landing_member_features', next); showToast('✓ 회원 포털 기능 저장됨') }
  async function saveLandingPlansLanding(next)  { setLandingPlansLanding(next);  await saveLandingKey('landing_plans_landing', next);   showToast('✓ 요금제 저장됨') }
  async function saveLandingComparison(next)    { setLandingComparison(next);    await saveLandingKey('landing_comparison', next);        showToast('✓ 기능 비교 저장됨') }

  function openLandingEdit(type, index, data) {
    setLandingEditModal({ type, index, data: { ...data } })
  }
  function closeLandingEdit() { setLandingEditModal(null) }
  async function saveLandingEdit() {
    const { type, index, data } = landingEditModal
    if (type === 'stats') {
      const next = landingStats.map((s,i) => i === index ? data : s)
      await saveLandingStats(next)
    } else if (type === 'reviews') {
      const next = index === -1 ? [...landingReviews, data] : landingReviews.map((r,i) => i === index ? data : r)
      await saveLandingReviews(next)
    } else if (type === 'kakao') {
      const next = index === -1 ? [...landingKakao, data] : landingKakao.map((r,i) => i === index ? data : r)
      await saveLandingKakao(next)
    } else if (type === 'faqs') {
      const next = index === -1 ? [...landingFaqs, data] : landingFaqs.map((r,i) => i === index ? data : r)
      await saveLandingFaqs(next)
    } else if (type === 'problems') {
      const next = index === -1 ? [...landingProblems, data] : landingProblems.map((r,i) => i === index ? data : r)
      await saveLandingProblems(next)
    } else if (type === 'solutions') {
      const next = index === -1 ? [...landingSolutions, data] : landingSolutions.map((r,i) => i === index ? data : r)
      await saveLandingSolutions(next)
    } else if (type === 'targets') {
      const next = index === -1 ? [...landingTargets, data] : landingTargets.map((r,i) => i === index ? data : r)
      await saveLandingTargets(next)
    } else if (type === 'members') {
      const next = index === -1 ? [...landingMemberFeatures, data] : landingMemberFeatures.map((r,i) => i === index ? data : r)
      await saveLandingMemberFeatures(next)
    } else if (type === 'landing_plans') {
      const next = index === -1 ? [...landingPlansLanding, data] : landingPlansLanding.map((r,i) => i === index ? data : r)
      await saveLandingPlansLanding(next)
    } else if (type === 'comparison') {
      const next = index === -1 ? [...landingComparison, data] : landingComparison.map((r,i) => i === index ? data : r)
      await saveLandingComparison(next)
    }
    closeLandingEdit()
  }
  async function deleteLandingItem(type, index) {
    if (!window.confirm('삭제할까요?')) return
    if (type === 'reviews')       await saveLandingReviews(landingReviews.filter((_,i) => i !== index))
    else if (type === 'kakao')    await saveLandingKakao(landingKakao.filter((_,i) => i !== index))
    else if (type === 'faqs')     await saveLandingFaqs(landingFaqs.filter((_,i) => i !== index))
    else if (type === 'problems') await saveLandingProblems(landingProblems.filter((_,i) => i !== index))
    else if (type === 'solutions')await saveLandingSolutions(landingSolutions.filter((_,i) => i !== index))
    else if (type === 'targets')  await saveLandingTargets(landingTargets.filter((_,i) => i !== index))
    else if (type === 'members')  await saveLandingMemberFeatures(landingMemberFeatures.filter((_,i) => i !== index))
    else if (type === 'landing_plans') await saveLandingPlansLanding(landingPlansLanding.filter((_,i) => i !== index))
    else if (type === 'comparison')    await saveLandingComparison(landingComparison.filter((_,i) => i !== index))
  }

  const navItems = [
    { id:'dashboard', icon:'📊', label:'대시보드' },
    { id:'trainer',   icon:'💪', label:'트레이너 포털' },
    { id:'member',    icon:'👥', label:'회원 포털' },
    { id:'community', icon:'🤝', label:'커뮤니티 포털' },
    { id:'crm',       icon:'🗂️',  label:'CRM 포털' },
    { id:'landing',   icon:'🌐', label:'랜딩페이지' },
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
        {/* SIDEBAR */}
        <div className="sidebar">
          {navItems.map(n => (
            <div key={n.id} className={`nav-item${page===n.id?' active':''}`} onClick={() => navigate(n.id)}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </div>
          ))}
        </div>

        {/* CONTENT */}
        <div className="content">

          {/* PORTAL SUB-TABS */}
          {page !== 'dashboard' && PORTAL_TABS[page] && (
            <div className="portal-tab-bar">
              {PORTAL_TABS[page].map(tab => (
                <button key={tab.id} className={`portal-tab-btn${subTab===tab.id?' active':''}`} onClick={() => setSubTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
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
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commUsers.length}</div><div className="stat-label">커뮤니티 유저</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commPosts.filter(p=>p.status==='active').length}</div><div className="stat-label">활성 게시글</div><div className="stat-sub">전체 {commPosts.length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='pending').length}</div><div className="stat-label">대기 연락 요청</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='accepted').length}</div><div className="stat-label">매칭 성사</div></div>
              </div>
              <div className="section-label">CRM 현황</div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num" style={{color:'#a78bfa'}}>{trainers.filter(t=>t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 활성 트레이너</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#a78bfa'}}>{trainers.length - trainers.filter(t=>t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 미사용</div></div>
              </div>
              <div className="section-label">오늘의 활동</div>
              <div className="card">
                <div style={{display:'flex',gap:'24px',flexWrap:'wrap'}}>
                  <div><div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'4px'}}>오늘 수업일지</div><div style={{fontSize:'20px',fontWeight:700,color:'var(--accent)',fontFamily:"'DM Mono',monospace"}}>{todayLogs.length}건</div></div>
                  <div><div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'4px'}}>이번주 활성 트레이너</div><div style={{fontSize:'20px',fontWeight:700,color:'var(--accent)',fontFamily:"'DM Mono',monospace"}}>{activeTrainers}명</div></div>
                  <div><div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'4px'}}>전체 회원 평균 세션</div><div style={{fontSize:'20px',fontWeight:700,color:'var(--accent)',fontFamily:"'DM Mono',monospace"}}>{members.length ? Math.round(members.reduce((s,m)=>s+m.done_sessions,0)/members.length) : 0}회</div></div>
                </div>
              </div>
              <div className="section-label">최근 수업일지</div>
              {logs.slice(0,5).map(l => {
                const trainer = trainers.find(t => t.id === l.trainer_id)
                const member  = members.find(m => m.id === l.member_id)
                const d = new Date(l.created_at)
                return (
                  <div className="card" key={l.id} style={{marginBottom:'8px',padding:'12px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}}>
                      <span style={{fontSize:'13px',fontWeight:500}}>{member?.name || '?'} 회원님 · {l.session_number}회차</span>
                      <span style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>{d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})} {d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <div style={{fontSize:'12px',color:'var(--text-muted)'}}>트레이너: {trainer?.name || '?'}</div>
                  </div>
                )
              })}
              {!logs.length && <div className="empty">수업일지가 없어요</div>}
            </div>
          )}

          {/* ==================== 트레이너 포털 ==================== */}
          {page === 'trainer' && subTab === 'list' && (
            <div>
              {/* 중앙 Gemini API 키 설정 */}
              <div className="card" style={{marginBottom:'16px',padding:'14px 16px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'1px'}}>🔑 중앙 Gemini API 키</div>
                <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                  <input
                    type="text"
                    value={centralApiKey}
                    onChange={e => setCentralApiKey(e.target.value)}
                    placeholder="AIza..."
                    style={{flex:1,padding:'8px 10px',borderRadius:'8px',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:'13px',fontFamily:'monospace'}}
                  />
                  <button className="btn btn-primary btn-sm" onClick={saveCentralApiKey}>저장</button>
                </div>
                {centralApiKey && <div style={{fontSize:'11px',color:'#4ade80',marginTop:'6px'}}>✓ API 키 설정됨 — 모든 트레이너가 이 키로 AI를 사용해요</div>}
              </div>
              <div className="section-title">트레이너 목록 <button className="btn btn-primary btn-sm" onClick={openAddSub}>+ 구독 추가</button></div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>트레이너</th><th>회원수</th><th>일지 발송</th><th>크레딧</th><th>가입일</th><th>구독상태</th><th></th></tr></thead>
                  <tbody>
                    {!trainers.length && <tr><td colSpan={6} className="empty">등록된 트레이너가 없어요</td></tr>}
                    {trainers.map(t => {
                      const mc = members.filter(m => m.trainer_id === t.id).length
                      const lc = logs.filter(l => l.trainer_id === t.id).length
                      const sub = subs.filter(s => s.trainer_id === t.id).sort((a,b) => new Date(b.paid_at)-new Date(a.paid_at))[0]
                      const isActive = sub && sub.valid_until && new Date(sub.valid_until) > new Date()
                      const joinDate = new Date(t.created_at)
                      return (
                        <tr key={t.id}>
                          <td><div className="name-cell"><div className="avatar">{t.name[0]}</div><div><div style={{color:'var(--text)',fontWeight:500}}>{t.name}</div></div></div></td>
                          <td>{mc}명</td>
                          <td>{lc}건</td>
                          <td><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:'var(--accent)'}}>{t.credits ?? 0}</span></td>
                          <td style={{fontFamily:"'DM Mono',monospace",fontSize:'12px'}}>{joinDate.toLocaleDateString('ko-KR',{year:'2-digit',month:'short',day:'numeric'})}<br/><span style={{color:'var(--text-dim)',fontSize:'11px'}}>{joinDate.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span></td>
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
                {['day','week','month'].map(p => (
                  <button key={p} className={`period-tab${logPeriod===p?' active':''}`} onClick={() => setLogPeriod(p)}>
                    {{day:'오늘',week:'이번 주',month:'이번 달'}[p]}
                  </button>
                ))}
              </div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num">{filteredLogs.length}</div><div className="stat-label">{periodLabel} 발송</div></div>
                <div className="stat-card"><div className="stat-num">{new Set(filteredLogs.map(l=>l.trainer_id)).size}</div><div className="stat-label">활성 트레이너</div></div>
                <div className="stat-card"><div className="stat-num">{new Set(filteredLogs.map(l=>l.member_id)).size}</div><div className="stat-label">수업 회원</div></div>
              </div>
              <div className="section-label">트레이너별 발송 현황</div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>트레이너</th><th>발송 건수</th><th>마지막 발송</th></tr></thead>
                  <tbody>
                    {trainers.map(t => {
                      const tLogs   = filteredLogs.filter(l => l.trainer_id === t.id)
                      const lastLog = logs.filter(l => l.trainer_id === t.id)[0]
                      const lastDate = lastLog ? new Date(lastLog.created_at) : null
                      return (
                        <tr key={t.id}>
                          <td><div className="name-cell"><div className="avatar">{t.name[0]}</div><span style={{color:'var(--text)'}}>{t.name}</span></div></td>
                          <td><span style={{color:'var(--accent)',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{tLogs.length}건</span></td>
                          <td style={{fontSize:'12px',color:'var(--text-dim)'}}>{lastDate ? lastDate.toLocaleDateString('ko-KR',{month:'short',day:'numeric'}) + ' ' + lastDate.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) : '없음'}</td>
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
                      const methodBadge = {'카카오페이':'badge-yellow','카드':'badge-blue','계좌이체':'badge-green','현금':'badge-blue'}[s.payment_method] || 'badge-blue'
                      return (
                        <tr key={s.id}>
                          <td style={{color:'var(--text)',fontWeight:500}}>{trainer?.name || '?'}</td>
                          <td><span className={`badge ${isActive?'badge-green':'badge-red'}`}>{s.plan}</span></td>
                          <td><span className={`badge ${methodBadge}`}>{s.payment_method}</span></td>
                          <td style={{fontFamily:"'DM Mono',monospace"}}>{s.amount?.toLocaleString()}원</td>
                          <td style={{fontSize:'12px',color:'var(--text-dim)'}}>{s.paid_at?.split('T')[0] || '-'}</td>
                          <td style={{fontSize:'12px',color:isActive?'var(--accent)':'var(--danger)'}}>{s.valid_until || '-'}</td>
                          <td style={{fontSize:'12px',color:'var(--text-dim)'}}>{s.memo || '-'}</td>
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
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                        <div className="avatar">{t.name[0]}</div>
                        <span style={{fontWeight:500}}>{t.name} 트레이너</span>
                      </div>
                      <span className="badge badge-green">{tMembers.length}명</span>
                    </div>
                    {tMembers.length ? (
                      <div className="table-wrap"><table>
                        <thead><tr><th>이름</th><th>레슨목적</th><th>세션</th><th>전화</th></tr></thead>
                        <tbody>{tMembers.map(m => (
                          <tr key={m.id}>
                            <td style={{color:'var(--text)',fontWeight:500}}>{m.name}</td>
                            <td><span className="badge badge-blue">{m.lesson_purpose || '미설정'}</span></td>
                            <td style={{fontFamily:"'DM Mono',monospace"}}>{m.done_sessions}/{m.total_sessions}</td>
                            <td style={{color:'var(--text-dim)'}}>***{m.phone}</td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    ) : <div style={{color:'var(--text-dim)',fontSize:'13px',padding:'8px 0'}}>회원이 없어요</div>}
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
                <button className="btn btn-primary btn-sm" style={{marginLeft:'12px'}}
                  onClick={() => { setNoticeEditId(null); setNoticeForm({ title:'', content:'', is_pinned:false }); setNoticeModal(true) }}>
                  + 공지 작성
                </button>
              </div>
              {!notices.length && <div className="empty">등록된 공지사항이 없어요</div>}
              {notices.map(notice => {
                const d = new Date(notice.created_at)
                return (
                  <div className="card" key={notice.id} style={{marginBottom:'10px', borderLeft: notice.is_pinned ? '3px solid var(--accent)' : '3px solid transparent'}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:'12px'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                          {notice.is_pinned && <span className="badge badge-yellow" style={{fontSize:'10px'}}>📌 고정</span>}
                          <div style={{fontSize:'14px',fontWeight:700,color:'var(--text)'}}>{notice.title}</div>
                        </div>
                        <div style={{fontSize:'13px',color:'var(--text-muted)',lineHeight:'1.6',marginBottom:'8px',whiteSpace:'pre-wrap'}}>{notice.content}</div>
                        <div style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>
                          {notice.author_name} · {d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})} {d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openNoticeEdit(notice)}>수정</button>
                        <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => deleteNotice(notice.id)}>삭제</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ==================== 회원 포털 > 자유게시판 관리 ==================== */}
          {page === 'member' && subTab === 'free_board' && (
            <div>
              <div className="section-title">자유게시판 관리</div>
              <div className="stat-grid" style={{marginBottom:'16px'}}>
                <div className="stat-card"><div className="stat-num">{freePosts.length}</div><div className="stat-label">전체 게시글</div></div>
                <div className="stat-card"><div className="stat-num">{new Set(freePosts.map(p=>p.member_id)).size}</div><div className="stat-label">작성 회원</div></div>
              </div>
              <div className="card table-wrap">
                <table>
                  <thead>
                    <tr><th>작성자</th><th>내용</th><th>사진</th><th>작성일</th><th></th></tr>
                  </thead>
                  <tbody>
                    {!freePosts.length && <tr><td colSpan={5} className="empty">게시글이 없어요</td></tr>}
                    {freePosts.map(post => {
                      const d = new Date(post.created_at)
                      const content = post.content || ''
                      return (
                        <tr key={post.id}>
                          <td>
                            <div className="name-cell">
                              <div className="avatar">{(post.member_name||'?')[0]}</div>
                              <span style={{color:'var(--text)',fontWeight:500}}>{post.member_name||'회원'}</span>
                            </div>
                          </td>
                          <td style={{maxWidth:'260px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'13px',color:'var(--text-muted)'}}>{content||'(사진만 첨부)'}</td>
                          <td style={{textAlign:'center'}}>{post.photo_url ? <span style={{fontSize:'16px'}}>📷</span> : '-'}</td>
                          <td style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>{d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}<br/>{d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</td>
                          <td><button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => deleteFreeBoardPost(post.id)}>삭제</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== 트레이너 포털 > 1:1 문의 ==================== */}
          {page === 'trainer' && subTab === 'support' && (() => {
            const INQ_CAT = { general:'일반 문의', billing:'결제/구독', bug:'오류 신고', feature:'기능 제안' }
            const filtered = answerFilter === 'all' ? supportList
              : supportList.filter(i => i.status === answerFilter)
            const pendingCount = supportList.filter(i => i.status === 'pending').length
            return (
              <div>
                <div className="section-title">
                  1:1 문의 관리
                  {pendingCount > 0 && <span className="badge badge-red" style={{marginLeft:'10px'}}>{pendingCount} 미답변</span>}
                </div>

                {/* 통계 */}
                <div className="stat-grid" style={{marginBottom:'20px'}}>
                  <div className="stat-card"><div className="stat-num">{supportList.length}</div><div className="stat-label">전체 문의</div></div>
                  <div className="stat-card"><div className="stat-num" style={{color:'#f5a623'}}>{pendingCount}</div><div className="stat-label">답변 대기</div></div>
                  <div className="stat-card"><div className="stat-num" style={{color:'var(--accent)'}}>{supportList.filter(i=>i.status==='answered').length}</div><div className="stat-label">답변 완료</div></div>
                </div>

                {/* 필터 */}
                <div className="period-tabs" style={{marginBottom:'16px'}}>
                  {[['all','전체'],['pending','답변 대기'],['answered','답변 완료']].map(([val,label]) => (
                    <button key={val} className={`period-tab${answerFilter===val?' active':''}`} onClick={() => setAnswerFilter(val)}>{label}</button>
                  ))}
                </div>

                {/* 문의 목록 */}
                <div className="card table-wrap">
                  <table>
                    <thead><tr><th>트레이너</th><th>유형</th><th>제목</th><th>상태</th><th>접수일</th><th></th></tr></thead>
                    <tbody>
                      {!filtered.length && <tr><td colSpan={6} className="empty">문의가 없어요</td></tr>}
                      {filtered.map(inq => {
                        const isAnswered = inq.status === 'answered'
                        const d = new Date(inq.created_at)
                        return (
                          <tr key={inq.id}>
                            <td><div className="name-cell"><div className="avatar">{(inq.trainer?.name||'?')[0]}</div><span style={{color:'var(--text)',fontWeight:500}}>{inq.trainer?.name||'탈퇴한 트레이너'}</span></div></td>
                            <td><span className="badge badge-blue" style={{fontSize:'10px'}}>{INQ_CAT[inq.category]||inq.category}</span></td>
                            <td style={{maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'13px',color:'var(--text)'}}>{inq.title}</td>
                            <td>{isAnswered
                              ? <span className="badge badge-green">답변 완료</span>
                              : <span className="badge badge-red">대기 중</span>}
                            </td>
                            <td style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>{d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</td>
                            <td>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setSupportModal(inq); setAnswerText(inq.answer||'') }}>
                                {isAnswered ? '보기' : '답변'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* ==================== 커뮤니티 포털 ==================== */}
          {page === 'community' && (
            <div>
              <div className="stat-grid" style={{marginBottom:'20px'}}>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commUsers.length}</div><div className="stat-label">전체 유저</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commPosts.filter(p=>p.status==='active').length}</div><div className="stat-label">활성 게시글</div><div className="stat-sub">전체 {commPosts.length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='pending').length}</div><div className="stat-label">대기 연락</div><div className="stat-sub">수락 {commContacts.filter(c=>c.status==='accepted').length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='accepted').length}</div><div className="stat-label">매칭 성사</div></div>
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
                        const cc = CAT_COLOR[p.category] || { bg:'rgba(136,136,136,0.1)', color:'#888' }
                        return (
                          <tr key={p.id}>
                            <td style={{maxWidth:'180px'}}>
                              <div style={{color:'var(--text)',fontWeight:500,fontSize:'13px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title}</div>
                              {p.location && <div style={{fontSize:'11px',color:'var(--text-dim)'}}>📍 {p.location}</div>}
                            </td>
                            <td><span style={{display:'inline-block',padding:'2px 7px',borderRadius:'100px',fontSize:'10px',fontWeight:700,background:cc.bg,color:cc.color}}>{COMM_CAT_LABEL[p.category] || p.category}</span></td>
                            <td>
                              <div style={{color:'var(--text)',fontSize:'13px'}}>{p.author?.name || '?'}</div>
                              <div style={{fontSize:'11px',color:'var(--text-dim)'}}>{COMM_ROLE_LABEL[p.author?.role] || p.author?.role}</div>
                            </td>
                            <td style={{textAlign:'center',fontFamily:"'DM Mono',monospace"}}>{p.contact_count || 0}</td>
                            <td>{isActive ? <span className="badge badge-green">활성</span> : <span className="badge" style={{background:'rgba(136,136,136,0.1)',color:'#888',border:'1px solid #333'}}>마감</span>}</td>
                            <td style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>{d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}<br/>{d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</td>
                            <td>
                              <div style={{display:'flex',gap:'4px',flexDirection:'column'}}>
                                {isActive && <button className="btn btn-ghost btn-sm" style={{fontSize:'10px'}} onClick={() => commClosePost(p.id)}>마감</button>}
                                <button className="btn btn-danger btn-sm" style={{fontSize:'10px'}} onClick={() => commDeletePost(p.id)}>삭제</button>
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
                            <td><div className="name-cell"><div className="avatar" style={{background:'#4fc3f7',color:'#0a0a0a'}}>{u.name[0]}</div><span style={{color:'var(--text)',fontWeight:500}}>{u.name}</span></div></td>
                            <td><span className="badge badge-blue">{COMM_ROLE_LABEL[u.role] || u.role}</span></td>
                            <td style={{fontSize:'12px',color:'var(--text-muted)'}}>{u.location || '-'}</td>
                            <td style={{fontSize:'12px',color:'var(--text-muted)',maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.bio || '-'}</td>
                            <td style={{textAlign:'center',fontFamily:"'DM Mono',monospace"}}>{userPostCount}건</td>
                            <td style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace'"}}>{d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</td>
                            <td>
                              {isBanned
                                ? <span className="badge badge-red">차단</span>
                                : extraCount > 0
                                  ? <span className="badge badge-green">+{extraCount}권한</span>
                                  : <span style={{fontSize:'11px',color:'var(--text-dim)'}}>기본</span>
                              }
                            </td>
                            <td>
                              <div style={{display:'flex',gap:'4px'}}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setCommPermModal(u)}>권한</button>
                                <button className="btn btn-danger btn-sm" onClick={() => commDeleteUser(u.id)}>삭제</button>
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
                          pending:  { bg:'rgba(245,166,35,0.1)',  color:'#f5a623', border:'rgba(245,166,35,0.2)',  label:'대기중' },
                          accepted: { bg:'rgba(200,241,53,0.1)',  color:'#c8f135', border:'rgba(200,241,53,0.2)',  label:'수락됨' },
                          rejected: { bg:'rgba(255,92,92,0.1)',   color:'#ff5c5c', border:'rgba(255,92,92,0.2)',   label:'거절됨' },
                        }[c.status] || {}
                        return (
                          <tr key={c.id}>
                            <td>
                              <div style={{color:'var(--text)',fontWeight:500,fontSize:'13px'}}>{c.requester?.name || '?'}</div>
                              <div style={{fontSize:'11px',color:'var(--text-dim)'}}>{COMM_ROLE_LABEL[c.requester?.role] || c.requester?.role}</div>
                            </td>
                            <td style={{fontSize:'12px',color:'var(--text-muted)',maxWidth:'160px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.post?.title || '-'}</td>
                            <td style={{fontSize:'12px',color:'var(--text-dim)',maxWidth:'160px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.message || '-'}</td>
                            <td><span style={{display:'inline-block',padding:'3px 8px',borderRadius:'100px',fontSize:'10px',fontWeight:700,background:statusStyle.bg,color:statusStyle.color,border:`1px solid ${statusStyle.border}`}}>{statusStyle.label}</span></td>
                            <td style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>{d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}<br/>{d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ==================== CRM 포털 ==================== */}
          {page === 'crm' && subTab === 'permissions' && (
            <div>
              <div className="section-title">CRM 권한 관리</div>
              <div className="stat-grid" style={{marginBottom:'20px'}}>
                <div className="stat-card"><div className="stat-num" style={{color:'#a78bfa'}}>{trainers.filter(t=>t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 활성 트레이너</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'var(--text-dim)'}}>{trainers.length - trainers.filter(t=>t.crm_permissions?.enabled).length}</div><div className="stat-label">CRM 비활성</div></div>
              </div>
              <div className="card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>트레이너</th>
                      <th style={{textAlign:'center'}}>CRM 활성화</th>
                      {CRM_FEATURES.map(f => <th key={f.key} style={{textAlign:'center'}}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {!trainers.length && <tr><td colSpan={2+CRM_FEATURES.length} className="empty">트레이너가 없어요</td></tr>}
                    {trainers.map(t => {
                      const perms = t.crm_permissions || {}
                      const enabled = !!perms.enabled
                      return (
                        <tr key={t.id}>
                          <td>
                            <div className="name-cell">
                              <div className="avatar">{t.name[0]}</div>
                              <span style={{color:'var(--text)',fontWeight:500}}>{t.name}</span>
                            </div>
                          </td>
                          <td style={{textAlign:'center'}}>
                            <button
                              className={`crm-toggle${enabled?' on':''}`}
                              onClick={() => updateCrmEnabled(t.id, !enabled)}
                            >
                              {enabled ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          {CRM_FEATURES.map(f => (
                            <td key={f.key} style={{textAlign:'center'}}>
                              <button
                                className={`crm-toggle crm-toggle-sm${perms[f.key]?' on':''}`}
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
          {page === 'landing' && subTab === 'hero' && (
            <div>
              <div className="section-title">히어로 섹션</div>
              <div className="card">
                <div className="form-group"><label>뱃지 텍스트</label>
                  <input value={landingHero.badge||''} onChange={e=>setLandingHero(h=>({...h,badge:e.target.value}))} placeholder="FOR PERSONAL TRAINERS & MEMBERS"/>
                </div>
                <div className="form-group"><label>헤드라인 첫 줄</label>
                  <input value={landingHero.headline||''} onChange={e=>setLandingHero(h=>({...h,headline:e.target.value}))} placeholder="좋은 트레이너는"/>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>강조 키워드 (초록 하이라이트)</label>
                    <input value={landingHero.highlight||''} onChange={e=>setLandingHero(h=>({...h,highlight:e.target.value}))} placeholder="기록"/>
                  </div>
                  <div className="form-group"><label>키워드 뒷 문구</label>
                    <input value={landingHero.headlineAfter||''} onChange={e=>setLandingHero(h=>({...h,headlineAfter:e.target.value}))} placeholder="으로 증명합니다"/>
                  </div>
                </div>
                <div className="form-group"><label>서브헤드라인</label>
                  <input value={landingHero.subheadline||''} onChange={e=>setLandingHero(h=>({...h,subheadline:e.target.value}))} placeholder="수업일지 · 회원관리 · 매출분석을 하나의 앱으로"/>
                </div>
                <div className="form-group"><label>설명 텍스트</label>
                  <textarea rows={3} value={landingHero.desc||''} onChange={e=>setLandingHero(h=>({...h,desc:e.target.value}))} placeholder="AI가 수업일지를 대신 쓰고..."/>
                </div>
                {/* 미리보기 */}
                <div className="form-group">
                  <label>미리보기</label>
                  <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'18px',border:'1px solid var(--border)'}}>
                    <div style={{fontSize:'10px',color:'var(--accent)',fontWeight:700,letterSpacing:'0.1em',marginBottom:'8px'}}>{landingHero.badge}</div>
                    <div style={{fontWeight:900,fontSize:'20px',lineHeight:1.2,marginBottom:'6px'}}>
                      {landingHero.headline}<br/>
                      <span style={{color:'#c8f135'}}>{landingHero.highlight}</span>{landingHero.headlineAfter}
                    </div>
                    <div style={{fontWeight:600,fontSize:'13px',color:'var(--text-muted)',marginBottom:'4px'}}>{landingHero.subheadline}</div>
                    <div style={{fontSize:'12px',color:'var(--text-dim)',lineHeight:1.7}}>{landingHero.desc}</div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => saveLandingHero(landingHero)}>저장</button>
              </div>
            </div>
          )}

          {/* ==================== 트레이너 포털 > 플랜 관리 ==================== */}
          {page === 'landing' && subTab === 'stats' && (
            <div>
              <div className="section-title">통계 수치</div>
              <div style={{fontSize:'13px',color:'var(--text-dim)',marginBottom:'16px'}}>히어로 섹션 아래 3개의 숫자 카드를 수정해요</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
                {landingStats.map((s, i) => (
                  <div key={i} className="card" style={{textAlign:'center'}}>
                    <div style={{fontSize:'26px',fontWeight:900,color:'var(--accent)',marginBottom:'6px'}}>{s.num}</div>
                    <div style={{fontSize:'13px',fontWeight:600,marginBottom:'4px'}}>{s.label}</div>
                    <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'12px'}}>{s.sub}</div>
                    <button className="btn btn-ghost btn-sm" style={{width:'100%'}} onClick={() => openLandingEdit('stats', i, s)}>수정</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && subTab === 'reviews' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>트레이너 후기</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('reviews', -1, {name:'',location:'',text:'',rating:5,initial:''})}>+ 추가</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {landingReviews.map((r, i) => (
                  <div key={i} className="card" style={{display:'flex',gap:'14px',alignItems:'flex-start'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'var(--accent)',color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:'15px',flexShrink:0}}>{r.initial||'?'}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'13px'}}>{r.name} <span style={{color:'var(--text-dim)',fontWeight:400,fontSize:'11px'}}>· {r.location}</span></div>
                      <div style={{fontSize:'12px',color:'var(--text-dim)',marginTop:'4px',lineHeight:1.6}}>"{r.text}"</div>
                    </div>
                    <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('reviews', i, r)}>수정</button>
                      <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('reviews', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && subTab === 'kakao' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>카카오 메시지</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('kakao', -1, {from:'회원',text:'',time:'오후 0:00'})}>+ 추가</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {landingKakao.map((m, i) => (
                  <div key={i} className="card" style={{display:'flex',gap:'14px',alignItems:'flex-start'}}>
                    <div style={{fontSize:'24px'}}>💬</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                        <span style={{fontSize:'12px',fontWeight:600}}>{m.from}</span>
                        <span style={{fontSize:'11px',color:'var(--text-dim)'}}>{m.time}</span>
                      </div>
                      <div style={{fontSize:'13px',color:'var(--text-dim)',lineHeight:1.6}}>{m.text}</div>
                    </div>
                    <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('kakao', i, m)}>수정</button>
                      <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('kakao', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && subTab === 'faqs' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>FAQ</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('faqs', -1, {q:'',a:''})}>+ 추가</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {landingFaqs.map((f, i) => (
                  <div key={i} className="card">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:600,marginBottom:'6px'}}>{f.q}</div>
                        <div style={{fontSize:'12px',color:'var(--text-dim)',lineHeight:1.7}}>{f.a}</div>
                      </div>
                      <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('faqs', i, f)}>수정</button>
                        <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('faqs', i)}>삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 문제 인식 ── */}
          {page === 'landing' && subTab === 'problems' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>문제 인식 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('problems', -1, {icon:'',title:'',desc:''})}>+ 추가</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {landingProblems.map((p,i) => (
                  <div key={i} className="card" style={{display:'flex',gap:'14px',alignItems:'flex-start'}}>
                    <div style={{fontSize:'28px',flexShrink:0}}>{p.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'13px',marginBottom:'4px'}}>{p.title}</div>
                      <div style={{fontSize:'12px',color:'var(--text-dim)',lineHeight:1.6}}>{p.desc}</div>
                    </div>
                    <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('problems', i, p)}>수정</button>
                      <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('problems', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 솔루션 ── */}
          {page === 'landing' && subTab === 'solutions' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>솔루션 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('solutions', -1, {icon:'',tag:'',title:'',desc:''})}>+ 추가</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {landingSolutions.map((s,i) => (
                  <div key={i} className="card" style={{display:'flex',gap:'14px',alignItems:'flex-start'}}>
                    <div style={{fontSize:'24px',flexShrink:0}}>{s.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                        <span style={{fontWeight:600,fontSize:'13px'}}>{s.title}</span>
                        {s.tag && <span style={{fontSize:'10px',background:'rgba(22,163,74,0.15)',color:'#16a34a',padding:'2px 8px',borderRadius:'20px'}}>{s.tag}</span>}
                      </div>
                      <div style={{fontSize:'12px',color:'var(--text-dim)',lineHeight:1.6}}>{s.desc}</div>
                    </div>
                    <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('solutions', i, s)}>수정</button>
                      <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('solutions', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 타겟 분기 ── */}
          {page === 'landing' && subTab === 'targets' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>타겟 분기 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('targets', -1, {type:'',icon:'',color:'#c8f135',textColor:'#3f6212',bg:'rgba(200,241,53,0.08)',border:'rgba(200,241,53,0.3)',points:[]})}>+ 추가</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {landingTargets.map((t,i) => (
                  <div key={i} className="card" style={{display:'flex',gap:'14px',alignItems:'flex-start'}}>
                    <div style={{fontSize:'28px',flexShrink:0}}>{t.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:'13px',marginBottom:'6px'}}>{t.type}</div>
                      {(t.points||[]).map((pt,j) => (
                        <div key={j} style={{fontSize:'12px',color:'var(--text-dim)',lineHeight:1.7}}>✓ {pt}</div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('targets', i, t)}>수정</button>
                      <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('targets', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 회원 포털 기능 ── */}
          {page === 'landing' && subTab === 'members' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>회원 포털 기능 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('members', -1, {icon:'',title:'',desc:''})}>+ 추가</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {landingMemberFeatures.map((f,i) => (
                  <div key={i} className="card" style={{display:'flex',gap:'14px',alignItems:'flex-start'}}>
                    <div style={{fontSize:'28px',flexShrink:0}}>{f.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'13px',marginBottom:'4px'}}>{f.title}</div>
                      <div style={{fontSize:'12px',color:'var(--text-dim)',lineHeight:1.6}}>{f.desc}</div>
                    </div>
                    <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openLandingEdit('members', i, f)}>수정</button>
                      <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('members', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 요금제 (랜딩) ── */}
          {page === 'landing' && subTab === 'plans' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>요금제 카드</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('landing_plans', -1, {name:'',price:'',period:'',highlight:false,tag:'',features:[],cta:'',ctaLink:'',note:''})}>+ 추가</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'12px'}}>
                {landingPlansLanding.map((plan,i) => (
                  <div key={i} className="card" style={{border:`1px solid ${plan.highlight?'rgba(200,241,53,0.35)':'var(--border)'}`,background:plan.highlight?'rgba(200,241,53,0.03)':'var(--surface)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:'14px',color:plan.highlight?'var(--accent)':'var(--text)'}}>{plan.name}</div>
                        <div style={{fontSize:'20px',fontWeight:900,color:'var(--text)',letterSpacing:'-1px'}}>{plan.price}</div>
                        <div style={{fontSize:'11px',color:'var(--text-dim)'}}>{plan.period}</div>
                      </div>
                      {plan.highlight && <span style={{fontSize:'10px',background:'var(--accent)',color:'#0a0a0a',padding:'2px 8px',borderRadius:'20px',fontWeight:700}}>추천</span>}
                    </div>
                    <div style={{marginBottom:'10px'}}>
                      {(plan.features||[]).map((f,j) => <div key={j} style={{fontSize:'12px',color:'var(--text-muted)',lineHeight:1.8}}>✓ {f}</div>)}
                    </div>
                    <div style={{display:'flex',gap:'6px'}}>
                      <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={() => openLandingEdit('landing_plans', i, plan)}>수정</button>
                      <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('landing_plans', i)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'landing' && subTab === 'comparison' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div className="section-title" style={{margin:0}}>기능 비교 행</div>
                <button className="btn btn-primary btn-sm" onClick={() => openLandingEdit('comparison', -1, {feature:'',legacy:'',ours:''})}>+ 행 추가</button>
              </div>
              {/* 미리보기 테이블 */}
              <div className="card" style={{padding:'0',overflow:'hidden',marginBottom:'20px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr',background:'var(--surface)'}}>
                  <div style={{padding:'10px 14px',fontSize:'11px',fontWeight:700,letterSpacing:'0.06em',color:'var(--text-dim)',borderBottom:'1px solid var(--border)'}}>기능</div>
                  <div style={{padding:'10px 14px',fontSize:'11px',fontWeight:700,letterSpacing:'0.06em',color:'var(--text-dim)',borderLeft:'1px solid var(--border)',borderBottom:'1px solid var(--border)'}}>기존 방식</div>
                  <div style={{padding:'10px 14px',fontSize:'11px',fontWeight:700,letterSpacing:'0.06em',color:'var(--accent)',borderLeft:'1px solid var(--border)',borderBottom:'1px solid var(--border)'}}>✦ 오운</div>
                </div>
                {landingComparison.map((row, i) => (
                  <div key={i} style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr',borderBottom: i < landingComparison.length-1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}}>
                    <div style={{padding:'12px 14px',fontSize:'13px',fontWeight:600,color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                      <span>{row.feature}</span>
                      <div style={{display:'flex',gap:'4px',flexShrink:0}}>
                        <button className="btn btn-ghost btn-sm" style={{fontSize:'11px',padding:'2px 8px'}} onClick={() => openLandingEdit('comparison', i, row)}>수정</button>
                        <button className="btn btn-sm" style={{fontSize:'11px',padding:'2px 8px',background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.2)'}} onClick={() => deleteLandingItem('comparison', i)}>삭제</button>
                      </div>
                    </div>
                    <div style={{padding:'12px 14px',fontSize:'12px',color:'var(--text-dim)',borderLeft:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'6px'}}>
                      <span style={{color:'#ef4444',fontWeight:700}}>✗</span>{row.legacy}
                    </div>
                    <div style={{padding:'12px 14px',fontSize:'12px',color:'var(--accent)',borderLeft:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'6px',fontWeight:600}}>
                      <span>✓</span>{row.ours}
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
              <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'14px'}}>플랜 안내 노출</div>
                  <div style={{fontSize:'12px',color:'var(--text-dim)',marginTop:'3px'}}>트레이너 포털 설정 탭에서 플랜 안내 섹션 표시 여부</div>
                </div>
                <button
                  className={`crm-toggle${planGuideVisible?' on':''}`}
                  style={{fontSize:'13px',padding:'6px 18px'}}
                  onClick={() => savePlanVisibility(!planGuideVisible)}
                >
                  {planGuideVisible ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 플랜 카드 */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
                {plans.map(plan => {
                  const isOn = plan.enabled !== false
                  return (
                    <div key={plan.id} className="card" style={{
                      border:`1px solid ${isOn ? (plan.highlight ? 'rgba(200,241,53,0.35)' : 'var(--border)') : 'rgba(136,136,136,0.2)'}`,
                      background: isOn ? (plan.highlight ? 'rgba(200,241,53,0.03)' : 'var(--surface)') : 'rgba(136,136,136,0.04)',
                      position:'relative',
                      opacity: isOn ? 1 : 0.6,
                    }}>
                      {plan.current && (
                        <span style={{position:'absolute',top:'-9px',left:'12px',background:'#9ca3af',color:'#0f0f0f',fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:'8px'}}>현재 플랜</span>
                      )}
                      {plan.badge && !plan.current && (
                        <span style={{position:'absolute',top:'-9px',left:'12px',background:plan.highlight?'var(--accent)':'#60a5fa',color:'#0f0f0f',fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:'8px'}}>{plan.badge}</span>
                      )}
                      {/* 플랜 ON/OFF 토글 */}
                      <button
                        className={`crm-toggle crm-toggle-sm${isOn?' on':''}`}
                        style={{position:'absolute',top:'10px',right:'10px'}}
                        onClick={() => togglePlanEnabled(plan.id)}
                      >
                        {isOn ? 'ON' : 'OFF'}
                      </button>
                      <div style={{fontWeight:700,color:isOn?plan.color:'var(--text-dim)',fontSize:'15px',marginBottom:'4px',marginTop:'4px'}}>{plan.name}</div>
                      <div style={{fontWeight:700,fontSize:'12px',marginBottom:'8px',color:'var(--text)'}}>{plan.price}</div>
                      {plan.features.map(f => (
                        <div key={f} style={{fontSize:'11px',color:'var(--text-muted)',lineHeight:1.9}}>· {f}</div>
                      ))}
                      <button className="btn btn-ghost btn-sm" style={{marginTop:'12px',width:'100%'}} onClick={() => openPlanEdit(plan)}>수정</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* LANDING EDIT MODAL */}
      <Modal open={!!landingEditModal} onClose={closeLandingEdit} title={
        landingEditModal?.type === 'stats'         ? '통계 수치 수정' :
        landingEditModal?.type === 'reviews'       ? (landingEditModal.index === -1 ? '후기 추가' : '후기 수정') :
        landingEditModal?.type === 'kakao'         ? (landingEditModal.index === -1 ? '메시지 추가' : '메시지 수정') :
        landingEditModal?.type === 'faqs'          ? (landingEditModal.index === -1 ? 'FAQ 추가' : 'FAQ 수정') :
        landingEditModal?.type === 'problems'      ? (landingEditModal.index === -1 ? '문제 카드 추가' : '문제 카드 수정') :
        landingEditModal?.type === 'solutions'     ? (landingEditModal.index === -1 ? '솔루션 카드 추가' : '솔루션 카드 수정') :
        landingEditModal?.type === 'targets'       ? (landingEditModal.index === -1 ? '타겟 추가' : '타겟 수정') :
        landingEditModal?.type === 'members'       ? (landingEditModal.index === -1 ? '회원 기능 추가' : '회원 기능 수정') :
        landingEditModal?.type === 'landing_plans' ? (landingEditModal.index === -1 ? '요금제 추가' : '요금제 수정') :
        landingEditModal?.type === 'comparison'    ? (landingEditModal.index === -1 ? '비교 행 추가' : '비교 행 수정') : ''
      }>
        {landingEditModal && (() => {
          const d = landingEditModal.data
          const upd = (patch) => setLandingEditModal(prev => ({...prev, data:{...prev.data,...patch}}))
          if (landingEditModal.type === 'stats') return (
            <>
              <div className="form-group"><label>숫자 / 값 (예: 3분, 98%)</label><input value={d.num} onChange={e=>upd({num:e.target.value})} placeholder="3분"/></div>
              <div className="form-group"><label>레이블</label><input value={d.label} onChange={e=>upd({label:e.target.value})} placeholder="첫 수업일지 완성까지"/></div>
              <div className="form-group"><label>보조 설명</label><input value={d.sub} onChange={e=>upd({sub:e.target.value})} placeholder="녹음 업로드부터 발송까지"/></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'reviews') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>이름</label><input value={d.name} onChange={e=>upd({name:e.target.value})} placeholder="김O준 트레이너"/></div>
                <div className="form-group"><label>이니셜 (아바타)</label><input value={d.initial} onChange={e=>upd({initial:e.target.value})} placeholder="김" maxLength={2}/></div>
              </div>
              <div className="form-group"><label>소속 / 지역</label><input value={d.location} onChange={e=>upd({location:e.target.value})} placeholder="서울 마포구 · 1인샵"/></div>
              <div className="form-group"><label>후기 내용</label><textarea rows={4} value={d.text} onChange={e=>upd({text:e.target.value})} placeholder="후기를 입력하세요"/></div>
              <div className="form-group"><label>별점 (1~5)</label><input type="number" min={1} max={5} value={d.rating} onChange={e=>upd({rating:Number(e.target.value)})}/></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'kakao') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>발신자</label><input value={d.from} onChange={e=>upd({from:e.target.value})} placeholder="회원"/></div>
                <div className="form-group"><label>시간</label><input value={d.time} onChange={e=>upd({time:e.target.value})} placeholder="오후 8:23"/></div>
              </div>
              <div className="form-group"><label>메시지 내용</label><textarea rows={3} value={d.text} onChange={e=>upd({text:e.target.value})} placeholder="메시지를 입력하세요"/></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'faqs') return (
            <>
              <div className="form-group"><label>질문</label><input value={d.q} onChange={e=>upd({q:e.target.value})} placeholder="자주 묻는 질문을 입력하세요"/></div>
              <div className="form-group"><label>답변</label><textarea rows={4} value={d.a} onChange={e=>upd({a:e.target.value})} placeholder="답변을 입력하세요"/></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'problems') return (
            <>
              <div className="form-group"><label>이모지 아이콘</label><input value={d.icon||''} onChange={e=>upd({icon:e.target.value})} placeholder="😮‍💨"/></div>
              <div className="form-group"><label>제목</label><input value={d.title||''} onChange={e=>upd({title:e.target.value})} placeholder="카드 제목"/></div>
              <div className="form-group"><label>설명</label><textarea rows={3} value={d.desc||''} onChange={e=>upd({desc:e.target.value})} placeholder="카드 설명"/></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'solutions') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>이모지 아이콘</label><input value={d.icon||''} onChange={e=>upd({icon:e.target.value})} placeholder="✦"/></div>
                <div className="form-group"><label>태그</label><input value={d.tag||''} onChange={e=>upd({tag:e.target.value})} placeholder="AI 수업일지"/></div>
              </div>
              <div className="form-group"><label>제목</label><input value={d.title||''} onChange={e=>upd({title:e.target.value})} placeholder="솔루션 제목"/></div>
              <div className="form-group"><label>설명</label><textarea rows={3} value={d.desc||''} onChange={e=>upd({desc:e.target.value})} placeholder="솔루션 설명"/></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'targets') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>이모지 아이콘</label><input value={d.icon||''} onChange={e=>upd({icon:e.target.value})} placeholder="🏠"/></div>
                <div className="form-group"><label>타겟명</label><input value={d.type||''} onChange={e=>upd({type:e.target.value})} placeholder="1인샵 운영 트레이너"/></div>
              </div>
              <div className="form-group">
                <label>포인트 목록 (줄바꿈으로 구분)</label>
                <textarea rows={4} value={(d.points||[]).join('\n')} onChange={e=>upd({points:e.target.value.split('\n')})} placeholder={"포인트 1\n포인트 2\n포인트 3"}/>
              </div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'members') return (
            <>
              <div className="form-group"><label>이모지 아이콘</label><input value={d.icon||''} onChange={e=>upd({icon:e.target.value})} placeholder="📋"/></div>
              <div className="form-group"><label>기능명</label><input value={d.title||''} onChange={e=>upd({title:e.target.value})} placeholder="수업일지 열람"/></div>
              <div className="form-group"><label>설명</label><textarea rows={2} value={d.desc||''} onChange={e=>upd({desc:e.target.value})} placeholder="기능 설명"/></div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'landing_plans') return (
            <>
              <div className="form-row">
                <div className="form-group"><label>플랜 이름</label><input value={d.name||''} onChange={e=>upd({name:e.target.value})} placeholder="무료 플랜"/></div>
                <div className="form-group"><label>가격</label><input value={d.price||''} onChange={e=>upd({price:e.target.value})} placeholder="0원"/></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>기간/설명</label><input value={d.period||''} onChange={e=>upd({period:e.target.value})} placeholder="영구 무료"/></div>
                <div className="form-group"><label>배지 (비워두면 없음)</label><input value={d.tag||''} onChange={e=>upd({tag:e.target.value||null})} placeholder="곧 출시"/></div>
              </div>
              <div className="form-group">
                <label>기능 목록 (줄바꿈으로 구분)</label>
                <textarea rows={5} value={(d.features||[]).join('\n')} onChange={e=>upd({features:e.target.value.split('\n')})} placeholder={"AI 수업일지 월 20회\n회원 관리 (최대 20명)"}/>
              </div>
              <div className="form-row">
                <div className="form-group"><label>버튼 텍스트</label><input value={d.cta||''} onChange={e=>upd({cta:e.target.value})} placeholder="무료로 시작하기"/></div>
                <div className="form-group"><label>버튼 링크</label><input value={d.ctaLink||''} onChange={e=>upd({ctaLink:e.target.value})} placeholder="/trainer"/></div>
              </div>
              <div className="form-group"><label>하단 메모</label><input value={d.note||''} onChange={e=>upd({note:e.target.value})} placeholder="결제 수단 등록 불필요"/></div>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'16px'}}>
                <input type="checkbox" id="planHighlightChk" checked={!!d.highlight} onChange={e=>upd({highlight:e.target.checked})} style={{width:'16px',height:'16px',cursor:'pointer'}}/>
                <label htmlFor="planHighlightChk" style={{cursor:'pointer',fontSize:'13px',fontWeight:500,marginBottom:0}}>✨ 추천 플랜 (하이라이트)</label>
              </div>
              <button className="btn btn-primary btn-full" onClick={saveLandingEdit}>저장</button>
            </>
          )
          if (landingEditModal.type === 'comparison') return (
            <>
              <div className="form-group"><label>기능명</label><input value={d.feature||''} onChange={e=>upd({feature:e.target.value})} placeholder="AI 수업일지 작성"/></div>
              <div className="form-group">
                <label>기존 방식 <span style={{color:'#ef4444'}}>✗</span></label>
                <input value={d.legacy||''} onChange={e=>upd({legacy:e.target.value})} placeholder="수기 메모 · 10~30분"/>
              </div>
              <div className="form-group">
                <label>오운 <span style={{color:'var(--accent)'}}>✓</span></label>
                <input value={d.ours||''} onChange={e=>upd({ours:e.target.value})} placeholder="AI 자동 생성 · 3분"/>
              </div>
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
          <input value={noticeForm.title} onChange={e => setNoticeForm(f => ({...f, title: e.target.value}))} placeholder="공지 제목을 입력해주세요" />
        </div>
        <div className="form-group">
          <label>내용</label>
          <textarea rows={6} style={{resize:'vertical'}} value={noticeForm.content}
            onChange={e => setNoticeForm(f => ({...f, content: e.target.value}))}
            placeholder="공지 내용을 입력해주세요" />
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'16px'}}>
          <input type="checkbox" id="adminNoticePinned" checked={noticeForm.is_pinned}
            onChange={e => setNoticeForm(f => ({...f, is_pinned: e.target.checked}))}
            style={{width:'16px',height:'16px',cursor:'pointer'}} />
          <label htmlFor="adminNoticePinned" style={{cursor:'pointer',fontSize:'13px',fontWeight:500,marginBottom:0}}>📌 상단 고정</label>
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
                <input value={planEditModal.name} onChange={e => setPlanEditModal({...planEditModal, name:e.target.value})} />
              </div>
              <div className="form-group">
                <label>가격</label>
                <input value={planEditModal.price} onChange={e => setPlanEditModal({...planEditModal, price:e.target.value})} placeholder="₩9,900/월" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>색상 (hex)</label>
                <input value={planEditModal.color} onChange={e => setPlanEditModal({...planEditModal, color:e.target.value})} placeholder="#c8f135" />
              </div>
              <div className="form-group">
                <label>뱃지 텍스트 (선택)</label>
                <input value={planEditModal.badge || ''} onChange={e => setPlanEditModal({...planEditModal, badge:e.target.value||null})} placeholder="출시 예정" />
              </div>
            </div>
            <div className="form-group">
              <label>혜택 목록 (한 줄에 하나씩)</label>
              <textarea rows={5} value={planEditModal.featuresText} onChange={e => setPlanEditModal({...planEditModal, featuresText:e.target.value})} style={{resize:'vertical'}} />
            </div>
            <div style={{display:'flex',gap:'16px',marginBottom:'16px'}}>
              <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',cursor:'pointer'}}>
                <input type="checkbox" checked={!!planEditModal.highlight} onChange={e => setPlanEditModal({...planEditModal, highlight:e.target.checked})} />
                추천 플랜 강조
              </label>
              <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',cursor:'pointer'}}>
                <input type="checkbox" checked={!!planEditModal.current} onChange={e => setPlanEditModal({...planEditModal, current:e.target.checked})} />
                현재 플랜 표시
              </label>
            </div>
            <button className="btn btn-primary btn-full" onClick={async () => {
              const updated = plans.map(p => p.id === planEditModal.id
                ? { ...planEditModal, features: planEditModal.featuresText.split('\n').map(f=>f.trim()).filter(Boolean) }
                : p)
              await savePlans(updated)
              closePlanEdit()
            }}>저장</button>
          </>
        )}
      </Modal>

      {/* 1:1 문의 답변 MODAL */}
      <Modal open={!!supportModal} onClose={() => { setSupportModal(null); setAnswerText('') }}
        title={supportModal ? `문의 — ${supportModal.trainer?.name || '?'} 트레이너` : ''}>
        {supportModal && (() => {
          const INQ_CAT = { general:'일반 문의', billing:'결제/구독', bug:'오류 신고', feature:'기능 제안' }
          const isAnswered = supportModal.status === 'answered'
          return (
            <>
              {/* 유형 + 접수일 */}
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                <span className="badge badge-blue">{INQ_CAT[supportModal.category]||supportModal.category}</span>
                <span style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>
                  {new Date(supportModal.created_at).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                </span>
                {isAnswered && <span className="badge badge-green" style={{marginLeft:'auto'}}>답변 완료</span>}
              </div>

              {/* 제목 */}
              <div style={{fontWeight:700,fontSize:'15px',color:'var(--text)',marginBottom:'10px'}}>
                {supportModal.title}
              </div>

              {/* 문의 내용 */}
              <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'12px',
                fontSize:'13px',color:'var(--text-muted)',lineHeight:1.8,
                whiteSpace:'pre-wrap',marginBottom:'16px',border:'1px solid var(--border)'}}>
                {supportModal.content}
              </div>

              <div className="divider" />

              {/* 답변 입력 */}
              <div className="form-group">
                <label>{isAnswered ? '등록된 답변' : '답변 작성 *'}</label>
                <textarea rows={6} style={{resize:'vertical'}}
                  placeholder="트레이너에게 전달할 답변을 작성해주세요"
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  readOnly={isAnswered && answerText === (supportModal.answer||'')}
                />
                {isAnswered && (
                  <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'4px'}}>
                    답변일: {new Date(supportModal.answered_at).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                  </div>
                )}
              </div>

              <button className="btn btn-primary btn-full"
                onClick={() => submitAnswer(supportModal.id)}>
                {isAnswered ? '답변 수정하기' : '답변 등록하기'}
              </button>
            </>
          )
        })()}
      </Modal>

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
              <div style={{marginBottom:'16px'}}>
                <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'1px'}}>기본 역할</div>
                <div style={{display:'inline-flex',alignItems:'center',gap:'6px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'8px',padding:'6px 12px'}}>
                  <span>{baseMeta?.emoji}</span>
                  <span style={{fontSize:'13px',fontWeight:600,color:baseMeta?.color || 'var(--text)'}}>{baseMeta?.label || baseRole}</span>
                  <span style={{fontSize:'11px',color:'var(--text-dim)'}}>· {baseMeta?.desc}</span>
                </div>
              </div>

              <div className="divider" />

              {/* 접근 차단 */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'13px',color: isBanned ? 'var(--danger)' : 'var(--text)'}}>커뮤니티 접근 차단</div>
                  <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'2px'}}>차단 시 로그인해도 피드에 접근할 수 없습니다</div>
                </div>
                <button
                  className={`crm-toggle${isBanned ? ' on' : ''}`}
                  style={{fontSize:'12px',padding:'5px 14px', background: isBanned ? 'rgba(239,68,68,0.12)' : '', borderColor: isBanned ? 'rgba(239,68,68,0.3)' : '', color: isBanned ? 'var(--danger)' : ''}}
                  onClick={() => toggleCommBan(commPermModal.id, !isBanned)}
                >
                  {isBanned ? '차단 중' : '허용'}
                </button>
              </div>

              <div className="divider" />

              {/* 추가 권한 */}
              <div style={{marginBottom:'8px'}}>
                <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'1px'}}>추가 권한 부여</div>
                <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'12px'}}>체크한 역할의 카테고리 열람·작성 권한이 추가됩니다</div>
                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {COMM_ROLE_OPTIONS.filter(r => r.key !== baseRole).map(r => {
                    const hasExtra = extraRoles.includes(r.key)
                    return (
                      <div key={r.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',borderRadius:'8px',border:`1px solid ${hasExtra ? `${r.color}33` : 'var(--border)'}`,background: hasExtra ? `${r.color}0a` : 'transparent',cursor:'pointer'}} onClick={() => toggleExtraRole(commPermModal.id, r.key, hasExtra)}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{fontSize:'16px'}}>{r.emoji}</span>
                          <div>
                            <div style={{fontSize:'13px',fontWeight:600,color: hasExtra ? r.color : 'var(--text)'}}>{r.label}</div>
                            <div style={{fontSize:'11px',color:'var(--text-dim)'}}>{r.desc}</div>
                          </div>
                        </div>
                        <div style={{width:'18px',height:'18px',borderRadius:'5px',border:`2px solid ${hasExtra ? r.color : 'var(--border)'}`,background: hasExtra ? r.color : 'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          {hasExtra && <span style={{fontSize:'11px',color:'#0a0a0a',fontWeight:900}}>✓</span>}
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
          <select value={subForm.trainer_id} onChange={e => setSubForm({...subForm, trainer_id:e.target.value})}>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>플랜</label>
            <select value={subForm.plan} onChange={e => setSubForm({...subForm, plan:e.target.value})}>
              <option value="basic">Basic</option><option value="pro">Pro</option><option value="business">Business</option>
            </select>
          </div>
          <div className="form-group">
            <label>결제 금액 (원)</label>
            <input type="number" value={subForm.amount} onChange={e => setSubForm({...subForm, amount:e.target.value})} placeholder="99000" />
          </div>
        </div>
        <div className="form-group">
          <label>결제 수단</label>
          <select value={subForm.payment_method} onChange={e => setSubForm({...subForm, payment_method:e.target.value})}>
            <option value="카카오페이">카카오페이</option><option value="카드">카드</option><option value="계좌이체">계좌이체</option><option value="현금">현금</option>
          </select>
        </div>
        <div className="form-row">
          <div className="form-group"><label>결제일</label><input type="date" value={subForm.paid_at} onChange={e => setSubForm({...subForm, paid_at:e.target.value})} /></div>
          <div className="form-group"><label>만료일</label><input type="date" value={subForm.valid_until} onChange={e => setSubForm({...subForm, valid_until:e.target.value})} /></div>
        </div>
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={subForm.memo} onChange={e => setSubForm({...subForm, memo:e.target.value})} placeholder="특이사항" /></div>
        <button className="btn btn-primary btn-full" onClick={addSubscription}>저장</button>
      </Modal>

      {/* TRAINER DETAIL MODAL */}
      <Modal open={!!trainerModal} onClose={() => setTrainerModal(null)} title={selectedTrainer ? `${selectedTrainer.name} 트레이너` : '트레이너 상세'}>
        {selectedTrainer && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
              <div className="stat-card"><div className="stat-num" style={{fontSize:'20px'}}>{stMembers.length}</div><div className="stat-label">회원수</div></div>
              <div className="stat-card"><div className="stat-num" style={{fontSize:'20px'}}>{stLogs.length}</div><div className="stat-label">총 일지</div></div>
              <div className="stat-card"><div className="stat-num" style={{fontSize:'20px'}}>{stSubs.length}</div><div className="stat-label">결제 건</div></div>
            </div>
            <div style={{fontSize:'12px',color:'var(--text-dim)',marginBottom:'8px'}}>가입일: {new Date(selectedTrainer.created_at).toLocaleString('ko-KR')}</div>
            <div className="divider" />
            {/* 크레딧 관리 */}
            <div style={{fontSize:'12px',color:'var(--text-dim)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'1px'}}>AI 크레딧 관리</div>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px',padding:'12px',background:'rgba(255,255,255,0.04)',borderRadius:'10px',border:'1px solid var(--border)'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:'22px',fontWeight:800,fontFamily:"'DM Mono',monospace",color:'var(--accent)'}}>{selectedTrainer.credits ?? 0}</div>
                <div style={{fontSize:'11px',color:'var(--text-dim)'}}>보유 크레딧</div>
              </div>
              <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                <input
                  type="number" min="1" max="1000"
                  value={creditAmount}
                  onChange={e => setCreditAmount(e.target.value)}
                  style={{width:'70px',padding:'6px 8px',borderRadius:'6px',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:'13px',fontFamily:'inherit'}}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => addTrainerCredits(selectedTrainer.id, parseInt(creditAmount)||0)}
                >충전</button>
              </div>
            </div>
            <div className="divider" />
            <div style={{fontSize:'12px',color:'var(--text-dim)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'1px'}}>회원 목록</div>
            {stMembers.length ? stMembers.map(m => (
              <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'13px'}}>
                <span style={{color:'var(--text)'}}>{m.name}</span>
                <span style={{color:'var(--text-dim)',fontSize:'11px'}}>{m.lesson_purpose || '-'} · {m.done_sessions}/{m.total_sessions}회</span>
              </div>
            )) : <div style={{color:'var(--text-dim)',fontSize:'13px'}}>회원 없음</div>}
            <div className="divider" />
            <div style={{fontSize:'12px',color:'var(--text-dim)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'1px'}}>결제 이력</div>
            {stSubs.length ? stSubs.map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'13px'}}>
                <div><span className="badge badge-blue" style={{marginRight:'6px'}}>{s.plan}</span>{s.payment_method}</div>
                <div style={{textAlign:'right'}}><div style={{color:'var(--text)'}}>{s.amount?.toLocaleString()}원</div><div style={{fontSize:'11px',color:'var(--text-dim)'}}>{s.paid_at?.split('T')[0]}</div></div>
              </div>
            )) : <div style={{color:'var(--text-dim)',fontSize:'13px'}}>결제 이력 없음</div>}
          </>
        )}
      </Modal>
    </div>
  )
}
