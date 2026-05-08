import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@trainer-log/shared/lib/supabase'
import GymOwnerPortal from './crm/GymOwnerPortal'
import './crm/styles/crm.css'

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
   신규 대표 셀프 온보딩 — 센터 개설 컴포넌트
═══════════════════════════════════════════════════════════════ */
function OnboardingSetup({ authUser, onComplete, onSwitchAccount }) {
  const [gymName,  setGymName]  = useState('')
  const [ownerName, setOwnerName] = useState(
    authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || ''
  )
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function handleCreate() {
    const trimName = gymName.trim()
    const trimOwner = ownerName.trim()
    if (!trimName)  { setError('센터 이름을 입력해주세요'); return }
    if (!trimOwner) { setError('대표 이름을 입력해주세요'); return }
    setSaving(true)
    setError('')

    try {
      // ① gyms 테이블에 새 센터 INSERT
      const { data: newGym, error: gymErr } = await supabase
        .from('gyms')
        .insert({ name: trimName })
        .select()
        .single()
      if (gymErr) throw new Error('센터 생성 실패: ' + gymErr.message)

      // ② trainers 테이블 — 기존 row 있으면 UPDATE, 없으면 INSERT
      const { data: existing } = await supabase
        .from('trainers')
        .select('id')
        .eq('email', authUser.email)
        .maybeSingle()

      let trainerRow
      if (existing) {
        // 기존 트레이너 계정에 gym_id + name + 대표 승인 상태 업데이트
        const { data, error: upErr } = await supabase
          .from('trainers')
          .update({ gym_id: newGym.id, name: trimOwner, approval_status: 'approved', role: 'owner' })
          .eq('id', existing.id)
          .select('*, trainer_ranks(*)')
          .single()
        if (upErr) throw new Error('트레이너 연동 실패: ' + upErr.message)
        trainerRow = data
      } else {
        // 신규 트레이너(대표) 계정 생성
        const { data, error: insErr } = await supabase
          .from('trainers')
          .insert({
            name:            trimOwner,
            email:           authUser.email,
            gym_id:          newGym.id,
            role:            'owner',
            approval_status: 'approved',
          })
          .select('*, trainer_ranks(*)')
          .single()
        if (insErr) throw new Error('계정 생성 실패: ' + insErr.message)
        trainerRow = data
      }

      // ③ 완료 → GymOwnerPortal로 전환
      onComplete(trainerRow, newGym)

    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '14px',
    fontFamily: "'Noto Sans KR', sans-serif",
    outline: 'none',
  }
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 700,
    color: 'rgba(255,255,255,0.45)', marginBottom: '7px', letterSpacing: '0.05em',
  }

  return (
    <div style={{minHeight:'100vh',background:'#0a0f1a',display:'flex',alignItems:'center',
      justifyContent:'center',fontFamily:"'Noto Sans KR',sans-serif",padding:'24px'}}>

      {/* 배경 글로우 */}
      <div style={{position:'fixed',inset:0,pointerEvents:'none'}}>
        <div style={{position:'absolute',top:'20%',left:'50%',transform:'translateX(-50%)',
          width:'500px',height:'400px',
          background:'radial-gradient(ellipse,rgba(224,64,251,0.07) 0%,transparent 65%)'}}/>
      </div>

      <div style={{position:'relative',zIndex:1,width:'100%',maxWidth:'420px'}}>

        {/* 헤더 */}
        <div style={{textAlign:'center',marginBottom:'32px'}}>
          <div style={{fontSize:'44px',marginBottom:'14px'}}>🏗️</div>
          <div style={{fontSize:'22px',fontWeight:900,color:'#fff',
            letterSpacing:'-0.5px',marginBottom:'8px'}}>
            내 센터 개설하기
          </div>
          <div style={{fontSize:'13px',color:'rgba(255,255,255,0.4)',lineHeight:1.7}}>
            처음 오셨군요! 센터 정보를 입력하면<br/>
            바로 CRM을 시작할 수 있어요.
          </div>
        </div>

        {/* 폼 카드 */}
        <div style={{background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:'20px',padding:'28px'}}>

          {error && (
            <div style={{marginBottom:'16px',padding:'10px 14px',
              background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',
              borderRadius:'8px',fontSize:'12px',color:'#f87171'}}>
              ⚠️ {error}
            </div>
          )}

          <div style={{display:'flex',flexDirection:'column',gap:'18px',marginBottom:'24px'}}>

            {/* 대표 이름 */}
            <div>
              <label style={labelStyle}>대표 이름 *</label>
              <input
                style={inputStyle}
                placeholder="홍길동"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                autoFocus
              />
            </div>

            {/* 센터 이름 */}
            <div>
              <label style={labelStyle}>센터 이름 *</label>
              <input
                style={inputStyle}
                placeholder="예) 오운 피트니스 강남점"
                value={gymName}
                onChange={e => setGymName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>

            {/* 로그인 계정 표시 */}
            <div style={{padding:'10px 14px',background:'rgba(255,255,255,0.03)',
              borderRadius:'8px',fontSize:'11px',color:'rgba(255,255,255,0.3)',
              display:'flex',alignItems:'center',gap:'7px'}}>
              <span>🔗</span>
              <span>로그인 계정: <strong style={{color:'rgba(255,255,255,0.55)'}}>{authUser?.email}</strong></span>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={saving}
            style={{width:'100%',padding:'14px',borderRadius:'12px',
              background: saving ? 'rgba(224,64,251,0.4)' : 'linear-gradient(135deg,#e040fb,#9c27b0)',
              color:'#fff',fontWeight:800,fontSize:'14px',border:'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily:'inherit',letterSpacing:'-0.2px',
              boxShadow: saving ? 'none' : '0 4px 20px rgba(224,64,251,0.35)',
              transition:'all 0.2s'}}>
            {saving ? '⟳ 개설 중...' : '🏢 내 센터 개설하기'}
          </button>
        </div>

        {/* 하단 링크 */}
        <div style={{textAlign:'center',marginTop:'20px',display:'flex',
          justifyContent:'center',gap:'20px'}}>
          <button onClick={onSwitchAccount}
            style={{fontSize:'12px',color:'rgba(255,255,255,0.25)',
              background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
            ← 다른 계정으로 로그인
          </button>
          <Link to="/" style={{fontSize:'12px',color:'rgba(255,255,255,0.25)',textDecoration:'none'}}>
            ← 메인으로
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   컴포넌트
═══════════════════════════════════════════════════════════════ */
export default function GymPortal() {
  const [screen,   setScreen]   = useState('landing') // 'landing' | 'login' | 'loading' | 'dashboard' | 'onboarding'
  const [authUser, setAuthUser] = useState(null)
  const [gymInfo,  setGymInfo]  = useState(null)      // { trainer, gym }

  // window focus 시 Supabase가 SIGNED_IN 을 재발화하는 문제 방어:
  // 이미 dashboard를 렌더 중이면 handleAuthUser 를 다시 실행하지 않는다.
  const isAuthenticatedRef = useRef(false)

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
  // AdminPortal SoT 는 단일 키 landing_v1 (.crm_hero / .crm_features / .crm_painpoints / .crm_roadmap).
  // 레거시 파편 키 (landing_crm_*) 는 v1 미존재 또는 누락된 섹션만 폴백.
  // 이전 버그: landing_v1 을 안 읽어서 admin 의 CRM 랜딩 수정이 영원히 stale.
  useEffect(() => {
    // app_settings.value 는 jsonb/string 양형 호환. 문자열이면 JSON.parse 시도, 실패 시 원본 반환.
    const parseValue = (raw) => {
      if (raw == null) return null
      if (typeof raw !== 'string') return raw
      try { return JSON.parse(raw) } catch { return raw }
    }

    supabase.from('app_settings').select('key, value').in('key', [
      'landing_v1',
      'landing_crm_hero', 'landing_crm_features', 'landing_crm_painpoints', 'landing_crm_roadmap',
    ]).then(({ data }) => {
      if (!data) return

      // 1) landing_v1 통합 객체 우선 적용
      const v1Row = data.find(r => r.key === 'landing_v1')
      const v1 = parseValue(v1Row?.value)
      const v1Applied = new Set()
      if (v1 && typeof v1 === 'object' && !Array.isArray(v1)) {
        if (v1.crm_hero       && typeof v1.crm_hero === 'object') { setCrmHero(v1.crm_hero);             v1Applied.add('crm_hero') }
        if (Array.isArray(v1.crm_features))                        { setCrmFeatures(v1.crm_features);     v1Applied.add('crm_features') }
        if (Array.isArray(v1.crm_painpoints))                      { setCrmPainpoints(v1.crm_painpoints); v1Applied.add('crm_painpoints') }
        if (Array.isArray(v1.crm_roadmap))                         { setCrmRoadmap(v1.crm_roadmap);       v1Applied.add('crm_roadmap') }
      }

      // 2) 레거시 폴백 — v1 에서 적용 안 된 섹션만
      const find = (k) => data.find(r => r.key === k)
      if (!v1Applied.has('crm_hero')       && find('landing_crm_hero')?.value)                        setCrmHero(parseValue(find('landing_crm_hero').value))
      if (!v1Applied.has('crm_features')   && Array.isArray(parseValue(find('landing_crm_features')?.value)))   setCrmFeatures(parseValue(find('landing_crm_features').value))
      if (!v1Applied.has('crm_painpoints') && Array.isArray(parseValue(find('landing_crm_painpoints')?.value))) setCrmPainpoints(parseValue(find('landing_crm_painpoints').value))
      if (!v1Applied.has('crm_roadmap')    && Array.isArray(parseValue(find('landing_crm_roadmap')?.value)))    setCrmRoadmap(parseValue(find('landing_crm_roadmap').value))
    })
  }, [])

  /* ── OAuth 로그인 ────────────────────────────────────────── */
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/crm' },
    })
    if (error) console.error('구글 로그인 오류:', error.message)
  }
  async function signInWithKakao() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: window.location.origin + '/crm' },
    })
    if (error) console.error('카카오 로그인 오류:', error.message)
  }
  // OAuth 로그인 성공 후 trainers → gyms 순서로 조회
  async function handleAuthUser(au) {
    // 이미 인증 완료 상태면 토큰 갱신 이벤트 재진입을 무시
    if (isAuthenticatedRef.current) return
    isAuthenticatedRef.current = true

    setAuthUser(au)
    setScreen('loading')

    // ① email로 트레이너 계정 조회
    const { data: trainerData } = await supabase
      .from('trainers')
      .select('*, trainer_ranks(*)')
      .eq('email', au.email)
      .maybeSingle()

    if (!trainerData || !trainerData.gym_id) {
      setScreen('onboarding')
      return
    }

    // ② gym_id로 센터 정보 조회
    const { data: gymData } = await supabase
      .from('gyms')
      .select('*')
      .eq('id', trainerData.gym_id)
      .maybeSingle()

    if (!gymData) {
      setScreen('onboarding')
      return
    }

    setGymInfo({ trainer: trainerData, gym: gymData })
    setScreen('dashboard')
  }

  // OAuth 인증 상태 감지
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthUser(session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleAuthUser(session.user)
      if (event === 'SIGNED_OUT') {
        isAuthenticatedRef.current = false  // 재로그인 허용
        setAuthUser(null); setGymInfo(null); setScreen('landing')
      }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  /* ── 로딩 (OAuth 후 DB 조회 중) ── */
  if (screen === 'loading') {
    return (
      <div style={{minHeight:'100vh',background:'#0a0f1a',display:'flex',alignItems:'center',
        justifyContent:'center',fontFamily:"'Noto Sans KR',sans-serif",color:'rgba(255,255,255,0.5)',
        flexDirection:'column',gap:'16px'}}>
        <div style={{fontSize:'32px',animation:'spin 1s linear infinite'}}>⟳</div>
        <div style={{fontSize:'14px'}}>센터 정보를 불러오는 중...</div>
      </div>
    )
  }

  /* ── 온보딩 (신규 대표 셀프 센터 개설) ── */
  if (screen === 'onboarding') {
    return <OnboardingSetup authUser={authUser} onComplete={(trainer, gym) => {
      setGymInfo({ trainer, gym })
      setScreen('dashboard')
    }} onSwitchAccount={async () => {
      await supabase.auth.signOut()
      setAuthUser(null)
      setScreen('login')
    }} />
  }

  /* ── 진짜 CRM 대시보드 ── */
  if (screen === 'dashboard' && gymInfo) {
    return (
      <GymOwnerPortal
        trainer={gymInfo.trainer}
        gym={gymInfo.gym}
        onLogout={async () => {
          isAuthenticatedRef.current = false  // 재로그인 허용
          await supabase.auth.signOut()
          setAuthUser(null)
          setGymInfo(null)
          setScreen('landing')
        }}
      />
    )
  }

  // 예외 fallback (gymInfo 로딩 실패 등)
  return null
}
