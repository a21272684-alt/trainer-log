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
}

const DEFAULT_TAB = { trainer:'list', member:'status', community:'posts', crm:'permissions' }

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
        supabase.from('app_settings').select('key, value').in('key', ['plan_guide_visible', 'plans']),
      ])
      setTrainers(t.data || []); setMembers(m.data || []); setLogs(l.data || []); setSubs(s.data || [])
      setCommUsers(cu.data || []); setCommPosts(cp.data || []); setCommContacts(cc.data || [])
      if (settings.data) {
        const vis  = settings.data.find(r => r.key === 'plan_guide_visible')
        const plns = settings.data.find(r => r.key === 'plans')
        if (vis  != null) setPlanGuideVisible(vis.value)
        if (plns != null) setPlans(plns.value)
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
          <div className="login-logo">TRAINER<span>LOG</span></div>
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

  const navItems = [
    { id:'dashboard', icon:'📊', label:'대시보드' },
    { id:'trainer',   icon:'💪', label:'트레이너 포털' },
    { id:'member',    icon:'👥', label:'회원 포털' },
    { id:'community', icon:'🤝', label:'커뮤니티 포털' },
    { id:'crm',       icon:'🗂️',  label:'CRM 포털' },
  ]

  return (
    <div>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">TRAINER<span>LOG</span></div>
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
                    <thead><tr><th>이름</th><th>역할</th><th>지역</th><th>소개</th><th>게시글</th><th>가입일</th><th></th></tr></thead>
                    <tbody>
                      {!commUsers.length && <tr><td colSpan={7} className="empty">유저가 없어요</td></tr>}
                      {commUsers.map(u => {
                        const userPostCount = commPosts.filter(p => p.user_id === u.id).length
                        const d = new Date(u.created_at)
                        return (
                          <tr key={u.id}>
                            <td><div className="name-cell"><div className="avatar" style={{background:'#4fc3f7',color:'#0a0a0a'}}>{u.name[0]}</div><span style={{color:'var(--text)',fontWeight:500}}>{u.name}</span></div></td>
                            <td><span className="badge badge-blue">{COMM_ROLE_LABEL[u.role] || u.role}</span></td>
                            <td style={{fontSize:'12px',color:'var(--text-muted)'}}>{u.location || '-'}</td>
                            <td style={{fontSize:'12px',color:'var(--text-muted)',maxWidth:'160px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.bio || '-'}</td>
                            <td style={{textAlign:'center',fontFamily:"'DM Mono',monospace"}}>{userPostCount}건</td>
                            <td style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace'"}}>{d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => commDeleteUser(u.id)}>삭제</button></td>
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
