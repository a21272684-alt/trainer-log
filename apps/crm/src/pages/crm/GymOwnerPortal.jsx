import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import TermsAgreementModal from '@trainer-log/shared/components/common/TermsAgreementModal'
import DashboardTab, { DashboardSubtitle } from './tabs/DashboardTab'
import MembersTab          from './tabs/MembersTab'
import CenterSettlementTab from './tabs/CenterSettlementTab'
import ReportsTab          from './tabs/ReportsTab'
import ScheduleTab         from './tabs/ScheduleTab'
import ContractsTab        from './tabs/ContractsTab'
import NotificationsTab    from './tabs/NotificationsTab'
import ProductsTab         from './tabs/ProductsTab'
import SettingsTab         from './tabs/SettingsTab'
import RevenueTab          from './tabs/RevenueTab'
import LockersTab          from './tabs/LockersTab'
import AttendanceTab       from './tabs/AttendanceTab'
import BenefitsTab         from './tabs/BenefitsTab'
import KioskMode           from './components/KioskMode'
import KioskLauncher       from './components/KioskLauncher'
import AccessDenied        from './components/AccessDenied'
import CrmIcon             from './components/CrmIcon'
import QuickActions        from './components/QuickActions'

// sessionStorage 기반 탭 상태 — 외부 요인으로 컴포넌트가 리마운트돼도 탭 위치 유지
function useSessionTab(storageKey, defaultVal) {
  const [val, setVal] = useState(() => {
    try { const s = sessionStorage.getItem(storageKey); return s || defaultVal }
    catch { return defaultVal }
  })
  const save = useCallback((v) => {
    setVal(v)
    try { sessionStorage.setItem(storageKey, v) } catch {}
  }, [storageKey])
  return [val, save]
}

// ── 탭별 필요 권한 매핑 ────────────────────────────────────────────
// null            → 무제한 (모든 직원 접근 가능)
// '__owner_only__'→ 대표(owner)만 접근
// 문자열 키       → trainers.crm_permissions[key] === true 여야 접근
const TAB_PERMISSIONS = {
  dashboard:     null,
  members:       null,
  attendance:    null,
  lockers:       null,
  benefits:      'manage_benefits',   // 쿠폰 만들기·발급·마일리지 규칙 (결제 시 적용은 누구나)
  revenue:       null,                // 범위는 RPC 가 결정: 대표=센터 전체, 직원=본인 매출만
  settlement:    'view_settlement',   // SettingsTab > 직원 권한 관리의 '정산 열람' 키
  products:      'manage_products',   // SettingsTab > 직원 권한 관리의 '상품 관리' 키
  schedule:      null,
  contracts:     null,
  notifications: null,
  reports:       null,
  settings:      '__owner_only__',    // 직원 관리 · 급여 정산 포함 → 대표 전용
}

// 메뉴 묶음 — 운영 / 회원 / 매출·정산 / 리포트·설정
const NAV_GROUPS = [
  { key: 'top', items: [
    { key: 'dashboard',     icon: 'home',      label: '대시보드' },
  ] },
  { key: 'ops', title: '운영', items: [
    { key: 'schedule',      icon: 'calendar',  label: '수업 예약' },
    { key: 'attendance',    icon: 'clipboard', label: '출석 관리' },
  ] },
  { key: 'member', title: '회원', items: [
    { key: 'members',       icon: 'users',     label: '회원 관리' },
    { key: 'lockers',       icon: 'locker',    label: '락커 관리' },
    { key: 'benefits',      icon: 'ticket',    label: '쿠폰 · 마일리지' },
    { key: 'notifications', icon: 'send',      label: '알림 발송' },
    { key: 'contracts',     icon: 'contract',  label: '전자 계약서' },
  ] },
  { key: 'money', title: '매출 · 정산', items: [
    { key: 'revenue',       icon: 'chart',     label: '매출 분석' },
    { key: 'settlement',    icon: 'cash',      label: '센터 정산' },
    { key: 'products',      icon: 'box',       label: '상품 관리' },
  ] },
  { key: 'etc', title: '리포트 · 설정', items: [
    { key: 'reports',       icon: 'star',      label: '주간 리포트' },
    { key: 'settings',      icon: 'gear',      label: '센터 설정' },
  ] },
]
const TAB_KEYS = NAV_GROUPS.flatMap(g => g.items.map(i => i.key))

const ROLE_LABEL = { owner: '대표', staff: '직원' }

export default function GymOwnerPortal({ trainer, gym: initialGym, onLogout }) {
  const [activeTab,    setActiveTabRaw] = useSessionTab('crm_activeTab', 'dashboard')
  const [trainers,     setTrainers]     = useState([])
  const [members,      setMembers]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [gym,          setGym]          = useState(initialGym)
  // 태블릿 터치 출석
  const [kioskMenu,    setKioskMenu]    = useState(false)
  const [kioskOn,      setKioskOn]      = useState(false)
  // 대시보드 → 회원 관리로 넘길 때 (특정 회원 열기 · 상태 필터)
  const [membersFocus, setMembersFocus] = useState(null)
  // 사이드바 배지 — 대시보드가 불러온 숫자
  const [summary,      setSummary]      = useState(null)
  const [dashKey,      setDashKey]      = useState(0)

  const setActiveTab = useCallback((key) => setActiveTabRaw(TAB_KEYS.includes(key) ? key : 'dashboard'), [setActiveTabRaw])
  const tab = TAB_KEYS.includes(activeTab) ? activeTab : 'dashboard'

  // 현재 로그인 트레이너의 탭 접근 권한 검사 — DB 재조회 없이 동기 판단
  // trainer.role === 'owner' 이면 전체 탭 패스, 그 외는 crm_permissions 키 확인
  // crm_permissions 가 없거나 해당 키가 없으면 false (secure-by-default)
  function canAccess(tabKey) {
    if (trainer?.role === 'owner') return true
    const required = TAB_PERMISSIONS[tabKey]
    if (!required) return true
    if (required === '__owner_only__') return false
    return (trainer?.crm_permissions || {})[required] === true
  }
  const canManageAttendance = trainer?.role === 'owner' || (trainer?.crm_permissions || {}).manage_attendance === true

  useEffect(() => { loadData() }, [initialGym.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 예전 'AI 설정' 에 저장하던 개인 Gemini 키 정리 — AI 는 서버(gemini-proxy)를 거친다
  useEffect(() => { try { localStorage.removeItem('crm_gemini_key') } catch {} }, [])

  async function loadData() {
    setLoading(true)
    // members 는 gym_id 컬럼 부재 → 본 센터 소속 트레이너의 회원만 후속 조회
    const [trainersRes, gymRes] = await Promise.all([
      supabase.from('trainers').select('*, trainer_ranks(*)').eq('gym_id', initialGym.id),
      supabase.from('gyms').select('*').eq('id', initialGym.id).single(),
    ])
    const trainers = trainersRes.data || []
    setTrainers(trainers)
    if (gymRes.data) setGym(gymRes.data)

    // 트레이너 ID 목록으로 회원 조회 (members.gym_id 필터 환각 제거)
    const trainerIds = trainers.map(t => t.id)
    if (trainerIds.length > 0) {
      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .in('trainer_id', trainerIds)
      setMembers(membersData || [])
    } else {
      setMembers([])
    }
    setLoading(false)
  }

  function openMember(m) {
    setMembersFocus({ memberId: m.id })
    setActiveTab('members')
  }
  function navigate(key, opts) {
    if (key === 'members' && opts?.filter) setMembersFocus({ filter: opts.filter })
    setActiveTab(key)
  }

  const TAB_TITLES = {
    dashboard:     { title: '대시보드',      sub: <DashboardSubtitle /> },
    members:       { title: '회원 관리',     sub: `전체 ${members.length}명 · 줄을 누르면 상세가 열려요` },
    attendance:    { title: '출석 관리',     sub: '입장 기록 · 직접 출석 · 오래 안 온 회원 · 직원 근태' },
    lockers:       { title: '락커 관리',     sub: '락커 현황 · 배정 · 연장 · 회수' },
    benefits:      { title: '쿠폰 · 마일리지', sub: '쿠폰 만들기 · 회원에게 발급 · 마일리지 규칙 · 내역' },
    revenue:       { title: '매출 분석',     sub: '환불을 뺀 순매출 · 상품 · 트레이너 · 결제 수단' },
    settlement:    { title: '센터 정산',     sub: '월별 매출 · 트레이너 정산 · 엑셀 내보내기' },
    products:      { title: '상품 관리',     sub: '센터에서 파는 상품 · 결제 등록 창에 이 목록이 나와요' },
    schedule:      { title: '수업 예약',     sub: '센터 전체 수업 일정 · 트레이너 앱 시간표 그대로' },
    contracts:     { title: '전자 계약서',   sub: '계약서 작성 · 서명 · 보관' },
    notifications: { title: '알림 발송',     sub: '챙겨야 할 회원을 골라 회원 앱으로 보낼 안내를 만들어요' },
    reports:       { title: '주간 리포트',   sub: 'AI가 지난주 센터 운영을 정리해요' },
    settings:      { title: '센터 설정',     sub: '대표만 볼 수 있어요 · 직원 · 급여 · 기록 · 센터 정보' },
  }
  const current = TAB_TITLES[tab]

  // 메뉴 오른쪽 숫자 — 대시보드에서 받은 값
  function badgeFor(key) {
    if (!summary) return null
    if (key === 'schedule' && summary.todayLessons > 0)
      return <span className="sb-count plain" title={`오늘 수업 ${summary.todayLessons}건`}>{summary.todayLessons}</span>
    if (key === 'attendance' && summary.rejected > 0)
      return <span className="sb-count rose" title={`오늘 입장 거부 ${summary.rejected}건`}>{summary.rejected}</span>
    if (key === 'members' && summary.expiring > 0)
      return <span className="sb-count" title={`만료 임박 ${summary.expiring}명`}>{summary.expiring}</span>
    return null
  }

  return (
    <div className="crm-layout">
      {/* 최초 로그인 1회 약관 동의 모달 (user_metadata.terms_agreed 미설정 시 강제 노출) */}
      <TermsAgreementModal />

      {/* ── 사이드바 ── */}
      <aside className="sidebar" aria-label="CRM 메뉴">
        <div className="sb-brand">
          <span className="sb-logo">오<b>운</b></span>
          <span className="sb-tag">CRM</span>
        </div>
        <div className="sb-gym" title={gym.name}>
          <span className="sb-gym-mark" aria-hidden="true">{(gym.name || '센').trim()[0]}</span>
          <span className="sb-gym-text">
            <span className="sb-gym-name">{gym.name}</span>
            <span className="sb-gym-sub">트레이너 {trainers.length}명 · 회원 {members.length}명</span>
          </span>
        </div>

        <nav>
          {NAV_GROUPS.map(g => (
            <div key={g.key} role="group" aria-label={g.title || '대시보드'}>
              {g.title && <div className="sb-group">{g.title}</div>}
              {g.items.map(item => (
                <button key={item.key} type="button"
                  className={`sb-item${tab === item.key ? ' active' : ''}`}
                  aria-current={tab === item.key ? 'page' : undefined}
                  title={item.label}
                  onClick={() => setActiveTab(item.key)}>
                  <span className="sb-ic"><CrmIcon name={item.icon} /></span>
                  <span className="sb-label">{item.label}</span>
                  {badgeFor(item.key)}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-spacer" />
        <button type="button" className="sb-kiosk" onClick={() => setKioskMenu(true)} title="출석 모드 켜기">
          <CrmIcon name="tablet" size={16} stroke={2.1} /><span className="sb-kiosk-label">출석 모드 켜기</span>
        </button>
        <div className="sb-user">
          <span className="sb-avatar" aria-hidden="true">{(trainer.name || '?')[0]}</span>
          <span className="sb-user-text">
            <span className="sb-user-name">{trainer.name}</span>
            <span className="sb-user-role">{ROLE_LABEL[trainer.role] || '직원'}</span>
          </span>
          <button type="button" className="sb-logout" aria-label="로그아웃" title="로그아웃" onClick={onLogout}>
            <CrmIcon name="logout" />
          </button>
        </div>
      </aside>

      {/* ── 메인 ── */}
      <main className="crm-main">
        <header className="crm-topbar">
          <div style={{ minWidth: 0 }}>
            <h1 className="crm-topbar-title">{current.title}</h1>
            <p className="crm-topbar-sub">{current.sub}</p>
          </div>
          <div className="crm-topbar-actions">
            {tab === 'dashboard' && !loading && (
              <QuickActions members={members} trainers={trainers} gymId={gym.id} currentTrainer={trainer}
                onOpenMember={openMember} onPaid={() => setDashKey(k => k + 1)} />
            )}
            <div id="crm-topbar-slot" className="crm-topbar-slot" />
            <button type="button" className="btn btn-secondary btn-lg" onClick={loadData} disabled={loading}>
              <CrmIcon name="refresh" size={16} />새로고침
            </button>
          </div>
        </header>

        <div className="crm-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)' }}>
              <span className="spinner" style={{ fontSize: '28px', display: 'block', marginBottom: '12px' }}>✦</span>
              센터 정보를 불러오는 중이에요
            </div>
          ) : (
            <>
              {tab === 'dashboard'     && <DashboardTab key={dashKey} gymId={gym.id} trainers={trainers} members={members}
                  canManageAttendance={canManageAttendance}
                  onNavigate={navigate} onOpenMember={openMember} onSummary={setSummary} />}
              {tab === 'members'       && <MembersTab          members={members} trainers={trainers} gymId={gym.id} currentTrainer={trainer}
                  focus={membersFocus} onFocusDone={() => setMembersFocus(null)} />}
              {tab === 'attendance'    && <AttendanceTab gymId={gym.id} gymName={gym.name} members={members}
                  canManageAttendance={canManageAttendance}
                  onOpenKiosk={() => setKioskMenu(true)} onOpenMember={openMember} />}
              {tab === 'lockers'       && <LockersTab gymId={gym.id} members={members} trainers={trainers} currentTrainer={trainer} />}
              {tab === 'benefits'      && (canAccess('benefits')
                ? <BenefitsTab gymId={gym.id} members={members} />
                : <AccessDenied />)}
              {tab === 'revenue'       && <RevenueTab gymId={gym.id} gymName={gym.name} />}
              {tab === 'settlement'    && (canAccess('settlement')
                ? <CenterSettlementTab gymId={gym.id} trainers={trainers} />
                : <AccessDenied />)}
              {tab === 'products'      && (canAccess('products')
                ? <ProductsTab gymId={gym.id} />
                : <AccessDenied />)}
              {tab === 'schedule'      && <ScheduleTab         gymId={gym.id} trainers={trainers} members={members} onOpenMember={openMember} />}
              {tab === 'contracts'     && <ContractsTab        gymId={gym.id} trainers={trainers} members={members} currentTrainer={trainer} />}
              {tab === 'notifications' && <NotificationsTab    gymId={gym.id} gymName={gym.name} members={members} trainers={trainers} />}
              {tab === 'reports'       && <ReportsTab          gymId={gym.id} />}
              {tab === 'settings'      && (canAccess('settings')
                ? <SettingsTab gymId={gym.id} gym={gym} trainers={trainers} members={members} onGymUpdate={g => setGym(g)} />
                : <AccessDenied />)}
            </>
          )}
        </div>
      </main>

      <KioskLauncher
        open={kioskMenu}
        gymId={gym.id}
        isOwner={trainer?.role === 'owner'}
        onClose={() => setKioskMenu(false)}
        onStart={() => { setKioskMenu(false); setKioskOn(true) }}
      />
      {kioskOn && <KioskMode gymId={gym.id} gymName={gym.name} onExit={() => setKioskOn(false)} />}
    </div>
  )
}
