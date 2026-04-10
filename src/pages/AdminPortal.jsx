import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import '../styles/admin.css'

const ADMIN_PW = 'trainer2024!'

export default function AdminPortal() {
  const showToast = useToast()
  const [loggedIn, setLoggedIn] = useState(false)
  const [pw, setPw] = useState('')
  const [page, setPage] = useState('dashboard')
  const [trainers, setTrainers] = useState([])
  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState([])
  const [subs, setSubs] = useState([])
  const [logPeriod, setLogPeriod] = useState('day')
  const [subModal, setSubModal] = useState(false)
  const [trainerModal, setTrainerModal] = useState(null)
  const [subForm, setSubForm] = useState({ trainer_id:'', plan:'basic', amount:'', payment_method:'카카오페이', paid_at:'', valid_until:'', memo:'' })

  // 커뮤니티 데이터
  const [commUsers, setCommUsers] = useState([])
  const [commPosts, setCommPosts] = useState([])
  const [commContacts, setCommContacts] = useState([])
  const [commTab, setCommTab] = useState('posts')

  const login = () => {
    if (pw !== ADMIN_PW) { showToast('비밀번호가 틀렸어요'); return }
    setLoggedIn(true)
  }
  const logout = () => { setLoggedIn(false); setPw('') }

  useEffect(() => { if (loggedIn) loadAll() }, [loggedIn])

  async function loadAll() {
    try {
      const [t, m, l, s, cu, cp, cc] = await Promise.all([
        supabase.from('trainers').select('*').order('created_at', { ascending: false }),
        supabase.from('members').select('*').order('created_at', { ascending: false }),
        supabase.from('logs').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*').order('paid_at', { ascending: false }),
        supabase.from('community_users').select('*').order('created_at', { ascending: false }),
        supabase.from('community_posts').select('*, author:community_users(name,role)').order('created_at', { ascending: false }),
        supabase.from('community_contacts').select('*, requester:community_users(name,role), post:community_posts(title)').order('created_at', { ascending: false }),
      ])
      setTrainers(t.data || []); setMembers(m.data || []); setLogs(l.data || []); setSubs(s.data || [])
      setCommUsers(cu.data || []); setCommPosts(cp.data || []); setCommContacts(cc.data || [])
    } catch(e) { showToast('데이터 로드 오류: ' + e.message) }
  }

  // ===== 커뮤니티 관리 =====
  const COMM_CAT_LABEL = {
    trainer_seeks_member:     '직원 구인',
    member_seeks_trainer:     '나만의 트레이너 찾기',
    instructor_seeks_student: '수강생 구인(교육)',
    gym_seeks_trainer:        '트레이너 채용',
    trainer_seeks_gym:        '센터 구직',
  }
  const COMM_ROLE_LABEL = { trainer:'트레이너', member:'회원', instructor:'교육강사', gym_owner:'헬스장 대표' }

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

  // ===== FILTERING HELPERS =====
  const filterLogsByPeriod = (allL, period) => {
    const now = new Date()
    return allL.filter(l => {
      const d = new Date(l.created_at)
      if (period === 'day') return d.toDateString() === now.toDateString()
      if (period === 'week') { const w = new Date(now); w.setDate(now.getDate()-7); return d >= w }
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      return true
    })
  }

  // ===== ADD SUBSCRIPTION =====
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

  // ===== LOGIN SCREEN =====
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

  const navItems = [
    { id:'dashboard', icon:'📊', label:'대시보드' },
    { id:'trainers', icon:'💪', label:'트레이너' },
    { id:'members', icon:'👥', label:'회원 현황' },
    { id:'logs', icon:'📋', label:'수업일지' },
    { id:'subscriptions', icon:'💳', label:'구독 관리' },
    { id:'community', icon:'🤝', label:'커뮤니티' },
  ]

  // ===== TRAINER DETAIL =====
  const selectedTrainer = trainerModal ? trainers.find(t => t.id === trainerModal) : null
  const stMembers = selectedTrainer ? members.filter(m => m.trainer_id === selectedTrainer.id) : []
  const stLogs = selectedTrainer ? logs.filter(l => l.trainer_id === selectedTrainer.id) : []
  const stSubs = selectedTrainer ? subs.filter(s => s.trainer_id === selectedTrainer.id).sort((a,b) => new Date(b.paid_at)-new Date(a.paid_at)) : []

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
            <div key={n.id} className={`nav-item${page===n.id?' active':''}`} onClick={() => setPage(n.id)}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </div>
          ))}
        </div>

        {/* CONTENT */}
        <div className="content">

          {/* DASHBOARD */}
          {page === 'dashboard' && (
            <div>
              <div className="section-title">대시보드</div>
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
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='pending').length}</div><div className="stat-label">대기 연락 요청</div><div className="stat-sub">전체 {commContacts.length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='accepted').length}</div><div className="stat-label">매칭 성사</div></div>
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
                const member = members.find(m => m.id === l.member_id)
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
              {logs.length === 0 && <div className="empty">수업일지가 없어요</div>}
            </div>
          )}

          {/* TRAINERS */}
          {page === 'trainers' && (
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
                          <td><span style={{color:'var(--text)'}}>{mc}명</span></td>
                          <td><span style={{color:'var(--text)'}}>{lc}건</span></td>
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

          {/* MEMBERS */}
          {page === 'members' && (
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

          {/* LOGS */}
          {page === 'logs' && (
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
                      const tLogs = filteredLogs.filter(l => l.trainer_id === t.id)
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

          {/* COMMUNITY */}
          {page === 'community' && (
            <div>
              <div className="section-title">커뮤니티 관리</div>

              {/* 통계 */}
              <div className="stat-grid" style={{marginBottom:'20px'}}>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commUsers.length}</div><div className="stat-label">전체 유저</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commPosts.filter(p=>p.status==='active').length}</div><div className="stat-label">활성 게시글</div><div className="stat-sub">전체 {commPosts.length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='pending').length}</div><div className="stat-label">대기 연락</div><div className="stat-sub">수락 {commContacts.filter(c=>c.status==='accepted').length}건</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#4fc3f7'}}>{commContacts.filter(c=>c.status==='accepted').length}</div><div className="stat-label">매칭 성사</div></div>
              </div>

              {/* 탭 */}
              <div className="period-tabs" style={{marginBottom:'16px'}}>
                {[['posts','게시글'],['users','유저'],['contacts','연락 요청']].map(([key,label]) => (
                  <button key={key} className={`period-tab${commTab===key?' active':''}`} onClick={() => setCommTab(key)}>{label}</button>
                ))}
              </div>

              {/* 게시글 관리 */}
              {commTab === 'posts' && (
                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr><th>제목</th><th>카테고리</th><th>작성자</th><th>연락수</th><th>상태</th><th>작성일</th><th></th></tr>
                    </thead>
                    <tbody>
                      {!commPosts.length && <tr><td colSpan={7} className="empty">게시글이 없어요</td></tr>}
                      {commPosts.map(p => {
                        const d = new Date(p.created_at)
                        const isActive = p.status === 'active'
                        return (
                          <tr key={p.id}>
                            <td style={{maxWidth:'180px'}}>
                              <div style={{color:'var(--text)',fontWeight:500,fontSize:'13px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title}</div>
                              {p.location && <div style={{fontSize:'11px',color:'var(--text-dim)'}}>📍 {p.location}</div>}
                            </td>
                            <td><span style={{
                              display:'inline-block',padding:'2px 7px',borderRadius:'100px',fontSize:'10px',fontWeight:700,
                              background: {trainer_seeks_member:'rgba(200,241,53,0.12)',member_seeks_trainer:'rgba(79,195,247,0.12)',instructor_seeks_student:'rgba(255,152,0,0.12)',gym_seeks_trainer:'rgba(224,64,251,0.12)',trainer_seeks_gym:'rgba(255,92,92,0.12)'}[p.category],
                              color: {trainer_seeks_member:'#c8f135',member_seeks_trainer:'#4fc3f7',instructor_seeks_student:'#ff9800',gym_seeks_trainer:'#e040fb',trainer_seeks_gym:'#ff5c5c'}[p.category],
                            }}>{COMM_CAT_LABEL[p.category] || p.category}</span></td>
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

              {/* 유저 관리 */}
              {commTab === 'users' && (
                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr><th>이름</th><th>역할</th><th>지역</th><th>소개</th><th>게시글</th><th>가입일</th><th></th></tr>
                    </thead>
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
                            <td style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace'"}}>
                              {d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}
                            </td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => commDeleteUser(u.id)}>삭제</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 연락 요청 관리 */}
              {commTab === 'contacts' && (
                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr><th>요청자</th><th>대상 게시글</th><th>메시지</th><th>상태</th><th>요청일</th></tr>
                    </thead>
                    <tbody>
                      {!commContacts.length && <tr><td colSpan={5} className="empty">연락 요청이 없어요</td></tr>}
                      {commContacts.map(c => {
                        const d = new Date(c.created_at)
                        const statusStyle = {
                          pending:  {bg:'rgba(245,166,35,0.1)',  color:'#f5a623', border:'rgba(245,166,35,0.2)',  label:'대기중'},
                          accepted: {bg:'rgba(200,241,53,0.1)',  color:'#c8f135', border:'rgba(200,241,53,0.2)',  label:'수락됨'},
                          rejected: {bg:'rgba(255,92,92,0.1)',   color:'#ff5c5c', border:'rgba(255,92,92,0.2)',   label:'거절됨'},
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

          {/* SUBSCRIPTIONS */}
          {page === 'subscriptions' && (
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
        </div>
      </div>

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
