import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const GYM_PW = 'gym2024!'

export default function GymPortal() {
  const [pw,       setPw]       = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [error,    setError]    = useState('')
  const [trainers, setTrainers] = useState([])
  const [members,  setMembers]  = useState([])
  const [loading,  setLoading]  = useState(false)

  const login = () => {
    if (pw !== GYM_PW) { setError('비밀번호가 틀렸어요'); return }
    setLoggedIn(true)
  }

  useEffect(() => {
    if (!loggedIn) return
    setLoading(true)
    Promise.all([
      supabase.from('trainers').select('id, name, email, created_at').order('created_at', { ascending: false }),
      supabase.from('members').select('id, name, trainer_id, status, created_at').order('created_at', { ascending: false }),
    ]).then(([t, m]) => {
      setTrainers(t.data || [])
      setMembers(m.data || [])
      setLoading(false)
    })
  }, [loggedIn])

  /* ── 로그인 화면 ── */
  if (!loggedIn) {
    return (
      <div style={{minHeight:'100vh',background:'#0a0f1a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Noto Sans KR',sans-serif",padding:'24px'}}>
        <div style={{width:'100%',maxWidth:'380px'}}>
          <div style={{textAlign:'center',marginBottom:'32px'}}>
            <div style={{fontSize:'40px',marginBottom:'14px'}}>🏢</div>
            <div style={{fontSize:'22px',fontWeight:900,color:'#fff',letterSpacing:'-0.5px',marginBottom:'6px'}}>헬스장 CRM 포털</div>
            <div style={{fontSize:'13px',color:'rgba(255,255,255,0.4)'}}>헬스장 대표 전용 관리 시스템</div>
          </div>

          <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'20px',padding:'28px'}}>
            <div style={{marginBottom:'16px'}}>
              <label style={{fontSize:'12px',fontWeight:700,color:'rgba(255,255,255,0.45)',display:'block',marginBottom:'7px',letterSpacing:'0.04em'}}>비밀번호</label>
              <input
                type="password"
                value={pw}
                onChange={e => { setPw(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && login()}
                placeholder="비밀번호를 입력하세요"
                style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'10px',color:'#fff',fontSize:'14px',padding:'12px 14px',outline:'none',fontFamily:'inherit'}}
              />
            </div>
            {error && <div style={{fontSize:'12px',color:'#ef4444',marginBottom:'12px'}}>{error}</div>}
            <button
              onClick={login}
              style={{width:'100%',background:'linear-gradient(135deg,#e040fb,#9c27b0)',color:'#fff',border:'none',borderRadius:'10px',padding:'13px',fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',letterSpacing:'-0.2px'}}
            >
              입장하기 →
            </button>
          </div>

          <div style={{textAlign:'center',marginTop:'20px'}}>
            <Link to="/" style={{fontSize:'12px',color:'rgba(255,255,255,0.25)',textDecoration:'none'}}>← 메인으로 돌아가기</Link>
          </div>
        </div>
      </div>
    )
  }

  /* ── 대시보드 ── */
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const activeMembers  = members.filter(m => m.status === 'active').length
  const newThisMonth   = members.filter(m => new Date(m.created_at) > thirtyDaysAgo).length

  const KPI = [
    { icon:'💪', label:'소속 트레이너', value: trainers.length,  color:'#c8f135' },
    { icon:'👥', label:'전체 회원',     value: members.length,   color:'#4fc3f7' },
    { icon:'✅', label:'활성 회원',     value: activeMembers,    color:'#22c55e' },
    { icon:'📈', label:'이달 신규',     value: newThisMonth,     color:'#e040fb' },
  ]

  const COMING = [
    { icon:'📊', title:'매출 분석',   desc:'트레이너별 매출 · 정산 현황 · 세금 리포트' },
    { icon:'🗂️',  title:'회원 CRM',   desc:'전체 회원 현황 · 이탈 분석 · 재등록 예측' },
    { icon:'📣', title:'마케팅 도구', desc:'공지 · 이벤트 · 프로모션 · 쿠폰 관리' },
    { icon:'📋', title:'계약 관리',   desc:'트레이너 계약서 · 고용형태 · 인센티브 설정' },
  ]

  return (
    <div style={{minHeight:'100vh',background:'#0a0f1a',fontFamily:"'Noto Sans KR',sans-serif",color:'#fff'}}>

      {/* TOPBAR */}
      <div style={{background:'rgba(255,255,255,0.03)',borderBottom:'1px solid rgba(255,255,255,0.08)',padding:'0 24px',position:'sticky',top:0,zIndex:50,backdropFilter:'blur(12px)'}}>
        <div style={{maxWidth:'960px',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',height:'54px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'20px'}}>🏢</span>
            <span style={{fontSize:'15px',fontWeight:900,letterSpacing:'-0.3px'}}>헬스장 CRM</span>
            <span style={{fontSize:'10px',fontWeight:700,background:'rgba(224,64,251,0.15)',color:'#e040fb',padding:'2px 8px',borderRadius:'20px',border:'1px solid rgba(224,64,251,0.3)',letterSpacing:'0.05em'}}>BETA</span>
          </div>
          <button
            onClick={() => setLoggedIn(false)}
            style={{background:'none',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.4)',borderRadius:'8px',padding:'5px 12px',fontSize:'12px',cursor:'pointer',fontFamily:'inherit'}}
          >
            로그아웃
          </button>
        </div>
      </div>

      <div style={{maxWidth:'960px',margin:'0 auto',padding:'32px 24px'}}>

        {/* KPI 카드 */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'12px',marginBottom:'28px'}}>
          {KPI.map((k, i) => (
            <div key={i} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'16px',padding:'20px'}}>
              <div style={{fontSize:'22px',marginBottom:'10px'}}>{k.icon}</div>
              <div style={{fontSize:'30px',fontWeight:900,color:k.color,letterSpacing:'-1.5px',lineHeight:1,marginBottom:'6px'}}>
                {loading ? '…' : k.value}
              </div>
              <div style={{fontSize:'12px',color:'rgba(255,255,255,0.4)'}}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* 트레이너 목록 */}
        <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'16px',padding:'20px 24px',marginBottom:'16px'}}>
          <div style={{fontSize:'14px',fontWeight:700,marginBottom:'16px',display:'flex',alignItems:'center',gap:'8px'}}>
            💪 소속 트레이너
            <span style={{fontSize:'11px',color:'rgba(255,255,255,0.35)',fontWeight:400}}>({trainers.length}명)</span>
          </div>

          {loading ? (
            <div style={{textAlign:'center',padding:'24px',color:'rgba(255,255,255,0.3)',fontSize:'13px'}}>불러오는 중…</div>
          ) : trainers.length === 0 ? (
            <div style={{textAlign:'center',padding:'24px',color:'rgba(255,255,255,0.3)',fontSize:'13px'}}>등록된 트레이너가 없어요</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {trainers.map((t, i) => {
                const myMembers   = members.filter(m => m.trainer_id === t.id)
                const myActive    = myMembers.filter(m => m.status === 'active').length
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'rgba(200,241,53,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',fontWeight:800,color:'#c8f135',flexShrink:0}}>
                      {t.name?.[0] || '?'}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'13px',fontWeight:700}}>{t.name}</div>
                      <div style={{fontSize:'11px',color:'rgba(255,255,255,0.35)',marginTop:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.email || '이메일 미등록'}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:'13px',fontWeight:600,color:'#c8f135'}}>{myMembers.length}명</div>
                      <div style={{fontSize:'10px',color:'rgba(255,255,255,0.35)',marginTop:'2px'}}>활성 {myActive}명</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 준비 중 기능 */}
        <div style={{marginBottom:'8px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'rgba(255,255,255,0.25)',letterSpacing:'0.1em',marginBottom:'12px'}}>준비 중인 기능</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'10px'}}>
            {COMING.map((s, i) => (
              <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'14px',padding:'18px',display:'flex',gap:'12px',alignItems:'flex-start',opacity:0.55}}>
                <span style={{fontSize:'22px',flexShrink:0}}>{s.icon}</span>
                <div>
                  <div style={{fontSize:'13px',fontWeight:700,marginBottom:'4px'}}>{s.title}</div>
                  <div style={{fontSize:'11px',color:'rgba(255,255,255,0.4)',lineHeight:1.6}}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:'28px'}}>
          <Link to="/" style={{fontSize:'12px',color:'rgba(255,255,255,0.25)',textDecoration:'none'}}>← 메인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  )
}
