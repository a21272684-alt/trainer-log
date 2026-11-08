import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@trainer-log/shared/lib/supabase'
import GymOwnerPortal from './crm/GymOwnerPortal'
import { ToastProvider as CrmToastProvider } from './crm/components/CrmToast'
import CrmIcon from './crm/components/CrmIcon'
import './crm/styles/crm.css'

/* ── 소개 화면 기본 내용 (관리자 랜딩 편집 landing_v1 이 있으면 그 값을 쓴다) ── */
const CRM_FEATURES = [
  { title: '트레이너 관리', desc: '소속 트레이너 현황·담당 회원 수·활성 상태를 한눈에 파악해요', color: '#4D7C0F' },
  { title: '매출 분석',     desc: '트레이너별 수익·정산 현황을 자동으로 집계해 월별 리포트를 제공해요', color: '#4F46E5' },
  { title: '회원 CRM',      desc: '전체 회원 현황·이탈 위험 분석·재등록 예측으로 매출 공백을 방지해요', color: '#0891B2' },
  { title: '마케팅 도구',   desc: '공지·이벤트·프로모션·쿠폰을 회원에게 직접 발송할 수 있어요', color: '#B45309' },
  { title: '계약 관리',     desc: '트레이너 고용형태·계약서·인센티브 설정을 체계적으로 관리해요', color: '#4D7C0F' },
  { title: '실시간 대시보드', desc: '오늘의 수업 현황·매출·신규 회원을 실시간으로 모니터링해요', color: '#4F46E5' },
]

const PAIN_POINTS = [
  { text: '트레이너별 매출을 엑셀로 정리하느라 정산일이 두려운 원장님' },
  { text: '회원이 왜 끊었는지 파악도 못 한 채 신규 마케팅만 하는 센터' },
  { text: '트레이너와 카톡으로 업무 연락하다 중요한 정보를 놓치는 분' },
  { text: '비수기에 갑작스러운 매출 급락을 미리 알지 못했던 원장님' },
]

const DEFAULT_CRM_HERO = {
  badge: 'FOR GYM OWNERS',
  headline1: '헬스장 운영의',
  headline2: '모든 것을 한 곳에',
  subheadline: '트레이너 관리부터 매출 정산, 회원 CRM까지.\n헬스장 원장님을 위한 전용 관리 시스템이에요.',
  cta: 'CRM 포털 입장하기',
}

// 로그인 화면 왼쪽 — 지금 CRM 에 있는 기능만 (알림 발송은 연결 전)
const LOGIN_FEATURES = [
  ['회원 · 수강권 관리'], ['출석 · 태블릿 출석 모드'], ['트레이너 시간표 한눈에'],
  ['매출 분석 · 센터 정산'], ['전자 계약서 · 서명'], ['회원 알림 발송', true],
]

// 관리자 편집 색이 너무 밝으면(형광 등) 흰 바탕에서 안 보임 → 표시용 점에만 쓴다
const dotColor = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#4D7C0F')

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

function KakaoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" fill="#191919"
        d="M9 1C4.582 1 1 3.806 1 7.25c0 2.178 1.417 4.09 3.56 5.19l-.91 3.394c-.08.3.264.535.518.356L8.44 13.84c.184.016.37.024.56.024 4.418 0 8-2.806 8-6.25S13.418 1 9 1z" />
    </svg>
  )
}

function Brand({ to }) {
  const inner = <><span>오<b>운</b></span><span className="sb-tag">CRM</span></>
  return to
    ? <Link to={to} className="gp-brand">{inner}</Link>
    : <span className="gp-brand">{inner}</span>
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
    if (!trimName)  { setError('센터 이름을 입력해 주세요'); return }
    if (!trimOwner) { setError('대표 이름을 입력해 주세요'); return }
    setSaving(true)
    setError('')

    try {
      // 센터 생성 + 대표 계정 연결을 RPC 하나로 처리 (084).
      // gyms 는 073 이후 클라이언트 INSERT 정책이 없음 → 직접 INSERT 하지 않는다.
      const { data, error: rpcErr } = await supabase.rpc('crm_create_gym', {
        p_gym_name:   trimName,
        p_owner_name: trimOwner,
      })
      if (rpcErr) {
        const msg = rpcErr.message || ''
        if (msg.includes('ALREADY_IN_GYM')) throw new Error('이미 다른 센터에 소속된 계정이에요. 해당 센터 대표에게 문의해 주세요.')
        throw new Error('센터를 만들지 못했어요: ' + msg)
      }
      const newGym     = data.gym
      const trainerRow = { ...data.trainer, trainer_ranks: null }

      // 완료 → GymOwnerPortal로 전환
      onComplete(trainerRow, newGym)

    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="gc">
      <div className="gc-box">
        <div className="gc-head">
          <span className="gc-mark"><CrmIcon name="home" size={24} stroke={2.2} /></span>
          <h1>내 센터 만들기</h1>
          <p>처음 오셨네요. 센터 정보를 넣으면 바로 CRM을 쓸 수 있어요.</p>
        </div>

        <div className="gc-card">
          {error && <div className="gc-err" role="alert">{error}</div>}
          <div className="gc-form">
            <label className="gc-field">
              <span>대표 이름</span>
              <input className="input" placeholder="홍길동" value={ownerName}
                onChange={e => setOwnerName(e.target.value)} autoFocus />
            </label>
            <label className="gc-field">
              <span>센터 이름</span>
              <input className="input" placeholder="예) 오운 피트니스 강남점" value={gymName}
                onChange={e => setGymName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </label>
            <div className="gc-account">로그인한 계정 <b>{authUser?.email}</b></div>
          </div>
          <button type="button" className="btn btn-primary gc-wide" onClick={handleCreate} disabled={saving}>
            {saving ? '센터를 만드는 중…' : '센터 만들기'}
          </button>
        </div>

        <div className="gl-links">
          <button type="button" className="gp-link" onClick={onSwitchAccount}>다른 계정으로 로그인</button>
          <Link to="/" className="gp-link">오운 메인으로</Link>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   컴포넌트
═══════════════════════════════════════════════════════════════ */
export default function GymPortal() {
  const [screen,   setScreen]   = useState('landing') // 'landing' | 'login' | 'loading' | 'dashboard' | 'onboarding' | 'access_denied'
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

    // 관리자(admin)가 'CRM 활성화' 를 끈 직원의 포털 진입 차단.
    // 정책: 센터 owner 는 무조건 통과 (자기 헬스장이라). 그 외 직원만 crm_access 검사.
    // legacy 'enabled' 키도 alias 로 인정 (마이그레이션 호환).
    const perms = trainerData.crm_permissions || {}
    const hasAccess = perms.crm_access === true || perms.enabled === true
    if (trainerData.role !== 'owner' && !hasAccess) {
      setGymInfo({ trainer: trainerData, gym: gymData })
      setScreen('access_denied')
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

  /* ── 소개 ── */
  if (screen === 'landing') {
    return (
      <div className="gp">
        <header className="gp-top">
          <Brand />
          <div className="gp-top-actions">
            <Link to="/" className="gp-link">오운 메인으로</Link>
            <button type="button" className="btn btn-primary" onClick={() => setScreen('login')}>로그인</button>
          </div>
        </header>

        <div className="gp-wrap">
          <section className="gp-hero">
            {crmHero.badge && <div className="gp-badge">{crmHero.badge}</div>}
            <h1>{crmHero.headline1}<br /><span>{crmHero.headline2}</span></h1>
            <p>{crmHero.subheadline}</p>
            <button type="button" className="gp-cta" onClick={() => setScreen('login')}>{crmHero.cta}</button>
            <p className="gp-note">구글 또는 카카오 계정으로 바로 시작할 수 있어요</p>
          </section>

          <section className="gp-sec" aria-label="이런 분들을 위해">
            <h2>이런 경험, 있으신가요?</h2>
            <div className="gp-grid">
              {crmPainpoints.map((p, i) => (
                <div key={i} className="gp-card gp-pain">
                  {p.icon && <span aria-hidden="true">{p.icon}</span>}
                  <span>{p.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="gp-sec" aria-label="CRM 기능">
            <h2>오운 CRM이 해결해 드려요</h2>
            <p>헬스장 운영에 필요한 기능을 한곳에</p>
            <div className="gp-grid">
              {crmFeatures.map((f, i) => (
                <div key={i} className="gp-card">
                  {f.icon && <div className="gp-feat-ic" aria-hidden="true">{f.icon}</div>}
                  <div className="gp-feat-title"><i style={{ background: dotColor(f.color) }} />{f.title}</div>
                  <div className="gp-feat-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="gp-sec" aria-label="지금 쓸 수 있는 기능">
            <h2>지금 바로 쓸 수 있는 기능</h2>
            <div className="gp-road">
              <div className="gp-road-row head">
                <div className="ok">지금 사용 가능</div>
                <div>준비 중</div>
              </div>
              {crmRoadmap.map((row, i) => (
                <div key={i} className="gp-road-row">
                  <div><span className="ok" aria-hidden="true"><CrmIcon name="check" size={15} stroke={2.6} /></span>{row.now}</div>
                  <div>{row.coming}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="gp-final">
            <h2>지금 바로 시작해 보세요</h2>
            <p>설치 없이 브라우저에서 바로 써요.<br />오운에 등록된 트레이너 데이터가 그대로 이어져요.</p>
            <button type="button" className="gp-cta" onClick={() => setScreen('login')}>CRM 포털 입장하기</button>
          </section>
        </div>
      </div>
    )
  }

  /* ── 로그인 화면 ── */
  if (screen === 'login') {
    return (
      <div className="gl">
        <section className="gl-intro" aria-label="오운 CRM 소개">
          <Brand />
          <div>
            <h1>헬스장 운영을<br />한 화면에서</h1>
            <p>회원 · 수강권 · 출석 · 매출 · 정산을 센터 대표와 직원이 함께 봐요. 트레이너는 지금 쓰는 오운 앱 그대로예요.</p>
          </div>
          <ul className="gl-feats" style={{ listStyle: 'none' }}>
            {LOGIN_FEATURES.map(([t, soon]) => (
              <li key={t} className="gl-feat">
                <span className={`gl-check${soon ? ' soon' : ''}`}><CrmIcon name="check" size={14} stroke={2.8} /></span>
                <span>{t}</span>
                {soon && <span className="gl-soon">준비 중</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="gl-side" aria-label="로그인">
          <div className="gl-box">
            <h2>센터 관리자 로그인</h2>
            <p>대표와 직원 모두 구글 · 카카오 계정으로 들어와요</p>
            <button type="button" className="gl-btn google" onClick={signInWithGoogle}><GoogleMark />구글로 계속하기</button>
            <button type="button" className="gl-btn kakao" onClick={signInWithKakao}><KakaoMark />카카오로 계속하기</button>
            <div className="gl-info">
              <b>처음이세요?</b>
              로그인하면 바로 내 센터를 만들 수 있어요. 오운 앱을 쓰는 트레이너라면 같은 계정으로 들어오세요.
            </div>
            <div className="gl-links">
              <button type="button" className="gp-link" onClick={() => setScreen('landing')}>CRM 소개 보기</button>
              <Link to="/" className="gp-link">오운 메인으로</Link>
            </div>
          </div>
        </section>
      </div>
    )
  }

  /* ── 불러오는 중 (OAuth 후 DB 조회) ── */
  if (screen === 'loading') {
    return (
      <div className="gc">
        <div className="gc-loading" role="status">
          <span className="spinner" style={{ fontSize: '28px' }}>✦</span>
          센터 정보를 불러오는 중이에요
        </div>
      </div>
    )
  }

  /* ── 관리자에 의한 CRM 접근 차단 화면 ── */
  if (screen === 'access_denied') {
    return (
      <div className="gc">
        <div className="gc-box">
          <div className="gc-head">
            <span className="gc-mark"><CrmIcon name="alert" size={24} stroke={2.2} /></span>
            <h1>CRM 사용 권한이 꺼져 있어요</h1>
            <p>
              지금 계정({gymInfo?.trainer?.name || ''})은 CRM 포털을 쓸 수 없어요.<br />
              센터 대표에게 권한을 켜 달라고 요청해 주세요.
            </p>
          </div>
          <button type="button" className="btn btn-secondary gc-wide"
            onClick={async () => {
              await supabase.auth.signOut()
              setAuthUser(null); setGymInfo(null); setScreen('landing')
            }}>
            다른 계정으로 로그인
          </button>
        </div>
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

  /* ── CRM 본 화면 ── */
  if (screen === 'dashboard' && gymInfo) {
    // CRM 탭들은 CrmToast 의 useToast 를 씀 → 여기서 Provider 마운트 (없으면 showToast 가 undefined)
    return (
      <CrmToastProvider>
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
      </CrmToastProvider>
    )
  }

  // 예외 fallback (gymInfo 로딩 실패 등)
  return null
}
