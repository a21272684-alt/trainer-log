import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import '../styles/admin.css'

const ADMIN_PW = 'trainer2024!'

const PORTAL_TABS = {
  trainer:   [{ id:'list', label:'트레이너 목록' }, { id:'logs', label:'수업일지' }, { id:'subs', label:'구독 관리' }, { id:'plans', label:'플랜 관리' }],
  member:    [{ id:'status', label:'회원 현황' }],
  community: [{ id:'posts', label:'게시글' }, { id:'users', label:'유저' }, { id:'contacts', label:'연락 요청' }],
  crm:       [{ id:'permissions', label:'권한 관리' }],
  landing:   [{ id:'stats', label:'통계 수치' }, { id:'reviews', label:'트레이너 후기' }, { id:'kakao', label:'카카오 메시지' }, { id:'faqs', label:'FAQ' }],
}

const DEFAULT_TAB = { trainer:'list', member:'status', community:'posts', crm:'permissions', landing:'stats' }

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
  { q:'AI 수업일지를 만들려면 별도 비용이 드나요?', a:'아니요. 무료 플랜에서도 월 20회의 AI 수업일지를 사용할 수 있어요. 별도 결제 수단 등록이 필요 없고, 한도를 넘으면 자동으로 멈출 뿐 추가 요금은 발생하지 않아요.' },
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

  // 랜딩페이지 관리
  const [landingStats,   setLandingStats]   = useState(DEFAULT_LANDING_STATS)
  const [landingReviews, setLandingReviews] = useState(DEFAULT_LANDING_REVIEWS)
  const [landingKakao,   setLandingKakao]   = useState(DEFAULT_LANDING_KAKAO)
  const [landingFaqs,    setLandingFaqs]    = useState(DEFAULT_LANDING_FAQS)
  const [landingEditModal, setLandingEditModal] = useState(null) // {type, index, data}

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
      const [t, m, l, s, cu, cp, cc, settings] = await Promise.all([
        supabase.from('trainers').select('*').order('created_at', { ascending: false }),
        supabase.from('members').select('*').order('created_at', { ascending: false }),
        supabase.from('logs').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*').order('paid_at', { ascending: false }),
        supabase.from('community_users').select('*').order('created_at', { ascending: false }),
        supabase.from('community_posts').select('*, author:community_users(name,role)').order('created_at', { ascending: false }),
        supabase.from('community_contacts').select('*, requester:community_users(name,role), post:community_posts(title)').order('created_at', { ascending: false }),
        supabase.from('app_settings').select('key, value').in('key', ['plan_guide_visible', 'plans', 'landing_stats', 'landing_reviews', 'landing_kakao', 'landing_faqs']),
      ])
      setTrainers(t.data || []); setMembers(m.data || []); setLogs(l.data || []); setSubs(s.data || [])
      setCommUsers(cu.data || []); setCommPosts(cp.data || []); setCommContacts(cc.data || [])
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
      }
    } catch(e) { showToast('데이터 로드 오류: ' + e.message) }
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
    }
    closeLandingEdit()
  }
  async function deleteLandingItem(type, index) {
    if (!window.confirm('삭제할까요?')) return
    if (type === 'reviews') await saveLandingReviews(landingReviews.filter((_,i) => i !== index))
    else if (type === 'kakao') await saveLandingKakao(landingKakao.filter((_,i) => i !== index))
    else if (type === 'faqs') await saveLandingFaqs(landingFaqs.filter((_,i) => i !== index))
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
              <div className="section-title">트레이너 목록 <button className="btn btn-primary btn-sm" onClick={openAddSub}>+ 구독 추가</button></div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>트레이너</th><th>회원수</th><th>일지 발송</th><th>가입일</th><th>구독상태</th><th></th></tr></thead>
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

          {/* ==================== 트레이너 포털 > 플랜 관리 ==================== */}
          {/* ==================== 랜딩페이지 관리 ==================== */}

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
        landingEditModal?.type === 'stats'   ? '통계 수치 수정' :
        landingEditModal?.type === 'reviews' ? (landingEditModal.index === -1 ? '후기 추가' : '후기 수정') :
        landingEditModal?.type === 'kakao'   ? (landingEditModal.index === -1 ? '메시지 추가' : '메시지 수정') :
        landingEditModal?.type === 'faqs'    ? (landingEditModal.index === -1 ? 'FAQ 추가' : 'FAQ 수정') : ''
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
          return null
        })()}
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
