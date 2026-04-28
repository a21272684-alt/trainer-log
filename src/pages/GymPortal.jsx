import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ── 피처 데이터 ── */
const CRM_FEATURES = [
  {
    icon: '💪',
    title: '트레이너 관리',
    desc: '소속 트레이너 현황·담당 회원 수·활성 상태를 한눈에 파악해요',
    color: '#c8f135',
  },
  {
    icon: '📊',
    title: '매출 분석',
    desc: '트레이너별 수익·정산 현황을 자동으로 집계해 월별 리포트를 제공해요',
    color: '#e040fb',
  },
  {
    icon: '🗂️',
    title: '회원 CRM',
    desc: '전체 회원 현황·이탈 위험 분석·재등록 예측으로 매출 공백을 방지해요',
    color: '#4fc3f7',
  },
  {
    icon: '📣',
    title: '마케팅 도구',
    desc: '공지·이벤트·프로모션·쿠폰을 회원에게 직접 발송할 수 있어요',
    color: '#ff9800',
  },
  {
    icon: '📋',
    title: '계약 관리',
    desc: '트레이너 고용형태·계약서·인센티브 설정을 체계적으로 관리해요',
    color: '#22c55e',
  },
  {
    icon: '⚡',
    title: '실시간 대시보드',
    desc: '오늘의 수업 현황·매출·신규 회원을 실시간으로 모니터링해요',
    color: '#f59e0b',
  },
]

const PAIN_POINTS = [
  { icon: '😤', text: '트레이너별 매출을 엑셀로 정리하느라 정산일이 두려운 원장님' },
  { icon: '😰', text: '회원이 왜 끊었는지 파악도 못 한 채 신규 마케팅만 하는 센터' },
  { icon: '📱', text: '트레이너와 카톡으로 업무 연락하다 중요한 정보를 놓치는 분' },
  { icon: '📉', text: '비수기에 갑작스러운 매출 급락을 미리 알지 못했던 원장님' },
]

const DEFAULT_CRM_HERO = {
  badge: 'FOR GYM OWNERS',
  headline1: '헬스장 운영의',
  headline2: '모든 것을 한 곳에',
  subheadline: '트레이너 관리부터 매출 정산, 회원 CRM까지.\n헬스장 원장님을 위한 전용 관리 시스템이에요.',
  cta: 'CRM 포털 입장하기',
}

// ── 스크롤 애니메이션 헬퍼 ─────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}
function FadeUp({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.08)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0px)' : 'translateY(44px)',
      transition: `opacity 0.85s cubic-bezier(.22,1,.36,1) ${delay}ms, transform 0.85s cubic-bezier(.22,1,.36,1) ${delay}ms`,
    }}>{children}</div>
  )
}
function SlideCard({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.05)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0px)' : 'translateY(32px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      height: '100%',
    }}>{children}</div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   컴포넌트
═══════════════════════════════════════════════════════════════ */
export default function GymPortal() {
  const [screen,   setScreen]   = useState('landing') // 'landing' | 'login' | 'dashboard'
  const [authUser, setAuthUser] = useState(null)
  const [trainers, setTrainers] = useState([])
  const [members,  setMembers]  = useState([])
  const [loading,  setLoading]  = useState(false)

  // CRM 랜딩 콘텐츠 (Supabase에서 로드)
  const [crmHero,       setCrmHero]       = useState(DEFAULT_CRM_HERO)
  const [crmFeatures,   setCrmFeatures]   = useState(CRM_FEATURES)
  const [crmPainpoints, setCrmPainpoints] = useState(PAIN_POINTS)
  const [crmRoadmap,    setCrmRoadmap]    = useState([
    { now: '트레이너 목록 · 회원 현황 조회', coming: '트레이너별 매출 정산 자동화' },
    { now: '소속 트레이너별 회원 수 통계',    coming: '회원 이탈 예측 · CRM 알림' },
    { now: '활성 회원 · 신규 회원 KPI',      coming: '마케팅 도구 · 쿠폰 발급' },
    { now: '실시간 대시보드',                coming: '트레이너 계약 · 고용형태 관리' },
  ])

  // 랜딩 콘텐츠 로드
  useEffect(() => {
    supabase.from('app_settings').select('key, value').in('key', [
      'landing_crm_hero', 'landing_crm_features', 'landing_crm_painpoints', 'landing_crm_roadmap',
    ]).then(({ data }) => {
      if (!data) return
      const find = (k) => data.find(r => r.key === k)
      if (find('landing_crm_hero')?.value)              setCrmHero(find('landing_crm_hero').value)
      if (Array.isArray(find('landing_crm_features')?.value))   setCrmFeatures(find('landing_crm_features').value)
      if (Array.isArray(find('landing_crm_painpoints')?.value)) setCrmPainpoints(find('landing_crm_painpoints').value)
      if (Array.isArray(find('landing_crm_roadmap')?.value))    setCrmRoadmap(find('landing_crm_roadmap').value)
    })
  }, [])

  /* ── OAuth 로그인 ────────────────────────────────────────── */
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/gym' },
    })
    if (error) console.error('구글 로그인 오류:', error.message)
  }
  async function signInWithKakao() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: window.location.origin + '/gym' },
    })
    if (error) console.error('카카오 로그인 오류:', error.message)
  }
  function handleAuthUser(au) {
    setAuthUser(au)
    setScreen('dashboard')
  }

  // OAuth 인증 상태 감지
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthUser(session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleAuthUser(session.user)
      if (event === 'SIGNED_OUT') { setAuthUser(null); setScreen('landing') }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (screen !== 'dashboard') return
    setLoading(true)
    Promise.all([
      supabase.from('trainers').select('id, name, email, created_at').order('created_at', { ascending: false }),
      supabase.from('members').select('id, name, trainer_id, status, created_at').order('created_at', { ascending: false }),
    ]).then(([t, m]) => {
      setTrainers(t.data || [])
      setMembers(m.data || [])
      setLoading(false)
    })
  }, [screen])

  /* ── 랜딩 ── */
  if (screen === 'landing') {
    return (
      <div style={{background:'#0a0f1a',color:'#fff',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden'}}>

        {/* 배경 글로우 */}
        <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,overflow:'hidden'}}>
          <div style={{position:'absolute',top:'0%',right:'-10%',width:'700px',height:'600px',
            background:'radial-gradient(ellipse,rgba(224,64,251,0.07) 0%,transparent 65%)'}}/>
          <div style={{position:'absolute',bottom:'10%',left:'-10%',width:'500px',height:'500px',
            background:'radial-gradient(ellipse,rgba(200,241,53,0.04) 0%,transparent 65%)'}}/>
        </div>

        {/* 상단 바 */}
        <div style={{position:'relative',zIndex:10,padding:'18px 24px',display:'flex',alignItems:'center',
          justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.06)',
          backdropFilter:'blur(12px)'}}>
          <div style={{fontSize:'16px',fontWeight:900,letterSpacing:'-1px'}}>
            오<span style={{color:'#c8f135'}}>운</span>
            <span style={{fontSize:'11px',fontWeight:600,color:'rgba(255,255,255,0.4)',
              marginLeft:'8px',letterSpacing:'0.08em'}}>CRM</span>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
            <button
              onClick={() => setScreen('login')}
              style={{fontSize:'13px',fontWeight:700,padding:'7px 18px',borderRadius:'9px',
                background:'rgba(224,64,251,0.15)',color:'#e040fb',border:'1px solid rgba(224,64,251,0.3)',
                cursor:'pointer',fontFamily:'inherit'}}>
              로그인
            </button>
            <Link to="/" style={{fontSize:'12px',color:'rgba(255,255,255,0.35)',textDecoration:'none'}}>← 메인으로</Link>
          </div>
        </div>

        <div style={{position:'relative',zIndex:1,maxWidth:'760px',margin:'0 auto',padding:'60px 24px 100px'}}>

          {/* ── 히어로 ── */}
          <FadeUp>
          <div style={{textAlign:'center',marginBottom:'64px'}}>
            <div style={{display:'inline-block',fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',
              color:'#e040fb',background:'rgba(224,64,251,0.1)',padding:'5px 14px',borderRadius:'20px',
              border:'1px solid rgba(224,64,251,0.25)',marginBottom:'24px'}}>
              {crmHero.badge}
            </div>
            <h1 style={{fontSize:'clamp(28px,6vw,52px)',fontWeight:900,letterSpacing:'-2px',
              lineHeight:1.1,margin:'0 0 20px'}}>
              {crmHero.headline1}<br/>
              <span style={{background:'linear-gradient(90deg,#e040fb,#9c27b0)',
                WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
                {crmHero.headline2}
              </span>
            </h1>
            <p style={{fontSize:'15px',color:'rgba(255,255,255,0.55)',lineHeight:1.85,
              maxWidth:'420px',margin:'0 auto 40px',letterSpacing:'-0.2px',whiteSpace:'pre-line'}}>
              {crmHero.subheadline}
            </p>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'10px'}}>
              <button
                onClick={() => setScreen('login')}
                style={{background:'linear-gradient(135deg,#e040fb,#9c27b0)',color:'#fff',
                  padding:'16px 48px',borderRadius:'12px',fontWeight:800,fontSize:'15px',
                  border:'none',cursor:'pointer',boxShadow:'0 4px 28px rgba(224,64,251,0.4)',
                  fontFamily:'inherit',letterSpacing:'-0.3px'}}>
                {crmHero.cta} →
              </button>
              <p style={{fontSize:'12px',color:'rgba(255,255,255,0.3)',margin:0}}>Google 또는 카카오 계정으로 바로 시작할 수 있어요</p>
            </div>
          </div>
          </FadeUp>

          {/* ── 이런 분들을 위해 ── */}
          <FadeUp delay={80}>
            <div style={{marginBottom:'64px'}}>
              <div style={{textAlign:'center',marginBottom:'28px'}}>
                <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.12em',
                  color:'rgba(255,255,255,0.35)',marginBottom:'10px'}}>PAIN POINT</div>
                <h2 style={{fontSize:'clamp(20px,4vw,28px)',fontWeight:800,letterSpacing:'-1px',margin:0}}>
                  이런 경험, 있으신가요?
                </h2>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:'12px'}}>
                {crmPainpoints.map((p, i) => (
                  <SlideCard key={i} delay={i * 80}>
                    <div style={{background:'rgba(255,255,255,0.03)',
                      border:'1px solid rgba(239,68,68,0.15)',borderRadius:'14px',
                      padding:'18px 20px',display:'flex',gap:'12px',alignItems:'flex-start',height:'100%',boxSizing:'border-box'}}>
                      <span style={{fontSize:'22px',flexShrink:0}}>{p.icon}</span>
                      <span style={{fontSize:'13px',color:'rgba(255,255,255,0.65)',lineHeight:1.7}}>{p.text}</span>
                    </div>
                  </SlideCard>
                ))}
              </div>
            </div>
          </FadeUp>

          {/* ── CRM 기능 ── */}
          <FadeUp delay={100}>
            <div style={{marginBottom:'64px'}}>
              <div style={{textAlign:'center',marginBottom:'28px'}}>
                <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.12em',
                  color:'#e040fb',marginBottom:'10px'}}>FEATURES</div>
                <h2 style={{fontSize:'clamp(20px,4vw,28px)',fontWeight:800,letterSpacing:'-1px',margin:'0 0 8px'}}>
                  오운 CRM이 해결해드려요
                </h2>
                <p style={{fontSize:'13px',color:'rgba(255,255,255,0.4)',margin:0}}>헬스장 운영에 필요한 모든 기능을 하나로</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:'12px'}}>
                {crmFeatures.map((f, i) => (
                  <SlideCard key={i} delay={i * 70}>
                    <div style={{
                      background:'rgba(255,255,255,0.03)',
                      border:`1px solid ${f.color}20`,
                      borderRadius:'16px',padding:'22px',
                      transition:'border-color 0.2s',
                      height:'100%',boxSizing:'border-box',
                    }}>
                      <div style={{fontSize:'26px',marginBottom:'12px'}}>{f.icon}</div>
                      <div style={{fontSize:'14px',fontWeight:700,color:f.color,marginBottom:'8px',letterSpacing:'-0.3px'}}>{f.title}</div>
                      <div style={{fontSize:'12px',color:'rgba(255,255,255,0.45)',lineHeight:1.7}}>{f.desc}</div>
                    </div>
                  </SlideCard>
                ))}
              </div>
            </div>
          </FadeUp>

          {/* ── 현재 제공 vs 준비 중 ── */}
          <FadeUp delay={120}>
            <div style={{marginBottom:'64px'}}>
              <div style={{textAlign:'center',marginBottom:'28px'}}>
                <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.12em',
                  color:'rgba(255,255,255,0.35)',marginBottom:'10px'}}>ROADMAP</div>
                <h2 style={{fontSize:'clamp(20px,4vw,28px)',fontWeight:800,letterSpacing:'-1px',margin:0}}>
                  지금 바로 쓸 수 있는 기능
                </h2>
              </div>
              <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',
                borderRadius:'20px',overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',
                  background:'rgba(255,255,255,0.04)',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                  <div style={{padding:'12px 20px',fontSize:'12px',fontWeight:700,
                    color:'#22c55e',letterSpacing:'0.06em'}}>✓ 지금 사용 가능</div>
                  <div style={{padding:'12px 20px',fontSize:'12px',fontWeight:700,
                    color:'rgba(255,255,255,0.3)',borderLeft:'1px solid rgba(255,255,255,0.07)',
                    letterSpacing:'0.06em'}}>⚙ 준비 중</div>
                </div>
                {crmRoadmap.map((row, i) => (
                  <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr',
                    borderBottom: i < crmRoadmap.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}}>
                    <div style={{padding:'14px 20px',fontSize:'13px',color:'rgba(255,255,255,0.75)',
                      display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{color:'#22c55e',flexShrink:0}}>✓</span>{row.now}
                    </div>
                    <div style={{padding:'14px 20px',fontSize:'13px',color:'rgba(255,255,255,0.3)',
                      borderLeft:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{flexShrink:0}}>⚙</span>{row.coming}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>

          {/* ── 하단 CTA ── */}
          <FadeUp delay={150}>
            <div style={{textAlign:'center',padding:'40px 24px',
              background:'linear-gradient(135deg,rgba(224,64,251,0.08),rgba(156,39,176,0.05))',
              border:'1px solid rgba(224,64,251,0.2)',borderRadius:'24px'}}>
              <div style={{fontSize:'24px',marginBottom:'14px'}}>🏢</div>
              <h2 style={{fontSize:'clamp(20px,4vw,26px)',fontWeight:800,letterSpacing:'-1px',
                margin:'0 0 10px'}}>
                지금 바로 시작해보세요
              </h2>
              <p style={{fontSize:'13px',color:'rgba(255,255,255,0.45)',lineHeight:1.7,
                margin:'0 0 28px'}}>
                별도 설치 없이 브라우저에서 바로 사용 가능해요.<br/>
                오운에 등록된 트레이너 데이터를 즉시 연동합니다.
              </p>
              <button
                onClick={() => setScreen('login')}
                style={{background:'linear-gradient(135deg,#e040fb,#9c27b0)',color:'#fff',
                  padding:'14px 40px',borderRadius:'12px',fontWeight:800,fontSize:'14px',
                  border:'none',cursor:'pointer',boxShadow:'0 4px 20px rgba(224,64,251,0.35)',
                  fontFamily:'inherit',letterSpacing:'-0.2px'}}>
                CRM 포털 입장하기 →
              </button>
            </div>
          </FadeUp>

        </div>
      </div>
    )
  }

  /* ── 로그인 화면 ── */
  if (screen === 'login') {
    return (
      <div style={{minHeight:'100vh',background:'#0a0f1a',display:'flex',alignItems:'center',
        justifyContent:'center',fontFamily:"'Noto Sans KR',sans-serif",padding:'24px'}}>

        {/* 배경 글로우 */}
        <div style={{position:'fixed',inset:0,pointerEvents:'none'}}>
          <div style={{position:'absolute',top:'20%',right:'10%',width:'400px',height:'400px',
            background:'radial-gradient(ellipse,rgba(224,64,251,0.08) 0%,transparent 65%)'}}/>
        </div>

        <div style={{position:'relative',zIndex:1,width:'100%',maxWidth:'380px'}}>
          <div style={{textAlign:'center',marginBottom:'32px'}}>
            <div style={{fontSize:'40px',marginBottom:'14px'}}>🏢</div>
            <div style={{fontSize:'22px',fontWeight:900,color:'#fff',letterSpacing:'-0.5px',marginBottom:'6px'}}>
              헬스장 CRM 포털
            </div>
            <div style={{fontSize:'13px',color:'rgba(255,255,255,0.4)'}}>헬스장 대표 전용 관리 시스템</div>
          </div>

          <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:'20px',padding:'28px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {/* Google */}
              <button onClick={signInWithGoogle} style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,
                width:'100%',padding:'13px 20px',borderRadius:'10px',
                border:'1px solid rgba(255,255,255,0.15)',background:'rgba(255,255,255,0.08)',color:'#fff',
                fontSize:'14px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                <svg width="18" height="18" viewBox="0 0 18 18" style={{flexShrink:0}}>
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Google로 입장하기
              </button>
              {/* Kakao */}
              <button onClick={signInWithKakao} style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,
                width:'100%',padding:'13px 20px',borderRadius:'10px',
                border:'none',background:'#FEE500',color:'#191919',
                fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{flexShrink:0}}>
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M9 1C4.582 1 1 3.806 1 7.25c0 2.178 1.417 4.09 3.56 5.19l-.91 3.394c-.08.3.264.535.518.356L8.44 13.84c.184.016.37.024.56.024 4.418 0 8-2.806 8-6.25S13.418 1 9 1z"
                    fill="#191919"/>
                </svg>
                카카오로 입장하기
              </button>
            </div>
          </div>

          <div style={{textAlign:'center',marginTop:'16px',display:'flex',justifyContent:'center',gap:'20px'}}>
            <button onClick={() => setScreen('landing')} style={{fontSize:'12px',color:'rgba(255,255,255,0.25)',
              background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>← 소개 보기</button>
            <Link to="/" style={{fontSize:'12px',color:'rgba(255,255,255,0.25)',textDecoration:'none'}}>← 메인으로</Link>
          </div>
        </div>
      </div>
    )
  }

  /* ── 대시보드 ── */
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const activeMembers = members.filter(m => m.status === 'active').length
  const newThisMonth  = members.filter(m => new Date(m.created_at) > thirtyDaysAgo).length

  const KPI = [
    { icon:'💪', label:'소속 트레이너', value: trainers.length, color:'#c8f135' },
    { icon:'👥', label:'전체 회원',     value: members.length,  color:'#4fc3f7' },
    { icon:'✅', label:'활성 회원',     value: activeMembers,   color:'#22c55e' },
    { icon:'📈', label:'이달 신규',     value: newThisMonth,    color:'#e040fb' },
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
      <div style={{background:'rgba(255,255,255,0.03)',borderBottom:'1px solid rgba(255,255,255,0.07)',
        padding:'0 24px',position:'sticky',top:0,zIndex:50,backdropFilter:'blur(12px)'}}>
        <div style={{maxWidth:'960px',margin:'0 auto',display:'flex',alignItems:'center',
          justifyContent:'space-between',height:'54px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'20px'}}>🏢</span>
            <span style={{fontSize:'15px',fontWeight:900,letterSpacing:'-0.3px'}}>헬스장 CRM</span>
            <span style={{fontSize:'10px',fontWeight:700,background:'rgba(224,64,251,0.15)',
              color:'#e040fb',padding:'2px 8px',borderRadius:'20px',
              border:'1px solid rgba(224,64,251,0.3)',letterSpacing:'0.05em'}}>BETA</span>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); setAuthUser(null); setScreen('landing') }}
            style={{background:'none',border:'1px solid rgba(255,255,255,0.1)',
              color:'rgba(255,255,255,0.4)',borderRadius:'8px',padding:'5px 12px',
              fontSize:'12px',cursor:'pointer',fontFamily:'inherit'}}>
            로그아웃
          </button>
        </div>
      </div>

      <div style={{maxWidth:'960px',margin:'0 auto',padding:'32px 24px'}}>

        {/* KPI 카드 */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',
          gap:'12px',marginBottom:'28px'}}>
          {KPI.map((k, i) => (
            <div key={i} style={{background:'rgba(255,255,255,0.04)',
              border:'1px solid rgba(255,255,255,0.07)',borderRadius:'16px',padding:'20px'}}>
              <div style={{fontSize:'22px',marginBottom:'10px'}}>{k.icon}</div>
              <div style={{fontSize:'30px',fontWeight:900,color:k.color,
                letterSpacing:'-1.5px',lineHeight:1,marginBottom:'6px'}}>
                {loading ? '…' : k.value}
              </div>
              <div style={{fontSize:'12px',color:'rgba(255,255,255,0.4)'}}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* 트레이너 목록 */}
        <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',
          borderRadius:'16px',padding:'20px 24px',marginBottom:'16px'}}>
          <div style={{fontSize:'14px',fontWeight:700,marginBottom:'16px',
            display:'flex',alignItems:'center',gap:'8px'}}>
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
                const myMembers = members.filter(m => m.trainer_id === t.id)
                const myActive  = myMembers.filter(m => m.status === 'active').length
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 14px',
                    background:'rgba(255,255,255,0.03)',borderRadius:'10px',
                    border:'1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',
                      background:'rgba(200,241,53,0.12)',display:'flex',alignItems:'center',
                      justifyContent:'center',fontSize:'15px',fontWeight:800,
                      color:'#c8f135',flexShrink:0}}>
                      {t.name?.[0] || '?'}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'13px',fontWeight:700}}>{t.name}</div>
                      <div style={{fontSize:'11px',color:'rgba(255,255,255,0.35)',marginTop:'1px',
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {t.email || '이메일 미등록'}
                      </div>
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
        <div>
          <div style={{fontSize:'11px',fontWeight:700,color:'rgba(255,255,255,0.25)',
            letterSpacing:'0.1em',marginBottom:'12px'}}>준비 중인 기능</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'10px'}}>
            {COMING.map((s, i) => (
              <div key={i} style={{background:'rgba(255,255,255,0.02)',
                border:'1px solid rgba(255,255,255,0.05)',borderRadius:'14px',
                padding:'18px',display:'flex',gap:'12px',alignItems:'flex-start',opacity:0.55}}>
                <span style={{fontSize:'22px',flexShrink:0}}>{s.icon}</span>
                <div>
                  <div style={{fontSize:'13px',fontWeight:700,marginBottom:'4px'}}>{s.title}</div>
                  <div style={{fontSize:'11px',color:'rgba(255,255,255,0.4)',lineHeight:1.6}}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:'32px'}}>
          <Link to="/" style={{fontSize:'12px',color:'rgba(255,255,255,0.25)',textDecoration:'none'}}>← 메인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  )
}
