import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from './components/Toast'
import Modal from './components/Modal'
import { computeRiskScore, getRiskLevel, RISK_LEVELS } from './lib/churnRisk'
import {
  generateWeeklyReport, checkAndEnsurePendingReport,
  fetchRecentReports, parseReportSections, getPrevMondayStr,
} from './lib/gymReport'
import DashboardTab        from './tabs/DashboardTab'
import MembersTab          from './tabs/MembersTab'
import CenterSettlementTab from './tabs/CenterSettlementTab'
import ReportsTab          from './tabs/ReportsTab'
import ScheduleTab         from './tabs/ScheduleTab'
import ContractsTab        from './tabs/ContractsTab'
import NotificationsTab    from './tabs/NotificationsTab'
import ProductsTab         from './tabs/ProductsTab'
import SettingsTab         from './tabs/SettingsTab'

const NAV_ITEMS = [
  { key: 'dashboard',     icon: '📊', label: '대시보드' },
  { key: 'members',       icon: '👥', label: '회원 관리' },
  { key: 'settlement',    icon: '💵', label: '센터 정산' },
  { key: 'products',      icon: '📦', label: '상품 관리' },
  { key: 'schedule',      icon: '📅', label: '수업 예약' },
  { key: 'contracts',     icon: '📝', label: '전자 계약서' },
  { key: 'notifications', icon: '🔔', label: '알림 발송' },
  { key: 'reports',       icon: '📋', label: '주간 리포트' },
  { key: 'settings',      icon: '⚙️', label: '센터 설정',  divider: true },
]

export default function GymOwnerPortal({ trainer, gym: initialGym, onLogout }) {
  const [activeTab,    setActiveTab]    = useState('dashboard')
  const [trainers,     setTrainers]     = useState([])
  const [members,      setMembers]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [gym,          setGym]          = useState(initialGym)
  const [apiKey,       setApiKey]       = useState(() => localStorage.getItem('crm_gemini_key') || '')
  const [showApiModal, setShowApiModal] = useState(false)
  const [apiKeyInput,  setApiKeyInput]  = useState('')

  useEffect(() => { loadData() }, [initialGym.id])

  async function loadData() {
    setLoading(true)
    const [trainersRes, membersRes, gymRes] = await Promise.all([
      supabase.from('trainers').select('*, trainer_ranks(*)').eq('gym_id', initialGym.id),
      supabase.from('members').select('*').eq('gym_id', initialGym.id),
      supabase.from('gyms').select('*').eq('id', initialGym.id).single(),
    ])
    setTrainers(trainersRes.data || [])
    setMembers(membersRes.data || [])
    if (gymRes.data) setGym(gymRes.data)
    setLoading(false)
  }

  function saveApiKey() {
    localStorage.setItem('crm_gemini_key', apiKeyInput)
    setApiKey(apiKeyInput)
    setShowApiModal(false)
  }

  const TAB_TITLES = {
    dashboard:     { title: '대시보드',  sub: `${gym.name} 운영 현황` },
    members:       { title: '회원 관리', sub: `전체 ${members.length}명` },
    settlement:    { title: '센터 정산', sub: '월별 매출 · 트레이너 정산 · 엑셀 내보내기' },
    products:      { title: '상품 관리',   sub: '센터 판매 상품 등록 및 조회' },
    schedule:      { title: '수업 예약',   sub: '센터 전체 수업 일정' },
    contracts:     { title: '전자 계약서', sub: '디지털 계약 관리' },
    notifications: { title: '알림 발송',   sub: '회원 알림 관리' },
    reports:       { title: '주간 리포트', sub: 'AI 센터 운영 분석' },
    settings:      { title: '센터 설정',   sub: '직원 관리 · 급여 정산 · 로그 · 고급 설정' },
  }
  const current = TAB_TITLES[activeTab] ?? TAB_TITLES.dashboard

  return (
    <div className="crm-layout">
      {/* 사이드바 */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-title">🏢 CRM 포털</div>
          <div className="sidebar-brand-sub">센터 경영 관리 시스템</div>
        </div>
        <div className="sidebar-gym">
          <div className="sidebar-gym-label">센터</div>
          <div className="sidebar-gym-name">{gym.name}</div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <div key={item.key}>
              {item.divider && (
                <div style={{ height: '1px', background: 'var(--border)', margin: '6px 12px' }} />
              )}
              <button
                className={`sidebar-nav-item ${activeTab === item.key ? 'active' : ''}`}
                onClick={() => setActiveTab(item.key)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-trainer">{trainer.name}</div>
          <button className="logout-btn" onClick={onLogout}>로그아웃</button>
        </div>
      </aside>

      {/* 메인 */}
      <div className="crm-main">
        <div className="crm-topbar">
          <div>
            <div className="crm-topbar-title">{current.title}</div>
            <div className="crm-topbar-sub">{current.sub}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {apiKey && <span style={{ fontSize: '10px', color: 'var(--green)', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', padding: '3px 8px', borderRadius: '6px' }}>AI 연결됨</span>}
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => { setApiKeyInput(apiKey); setShowApiModal(true) }}>
              ⚙️ AI 설정
            </button>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={loadData}>
              🔄 새로고침
            </button>
          </div>
        </div>

        <div className="crm-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)' }}>
              <span className="spinner" style={{ fontSize: '28px', display: 'block', marginBottom: '12px' }}>✦</span>
              센터 데이터를 불러오는 중...
            </div>
          ) : (
            <>
              {activeTab === 'dashboard'     && <DashboardTab        gym={gym} gymId={gym.id} trainers={trainers} members={members} />}
              {activeTab === 'members'       && <MembersTab          members={members} trainers={trainers} gymId={gym.id} />}
              {activeTab === 'settlement'    && <CenterSettlementTab gymId={gym.id} trainers={trainers} />}
              {activeTab === 'products'      && <ProductsTab         gymId={gym.id} />}
              {activeTab === 'schedule'      && <ScheduleTab         gymId={gym.id} trainers={trainers} members={members} />}
              {activeTab === 'contracts'     && <ContractsTab        gymId={gym.id} trainers={trainers} members={members} />}
              {activeTab === 'notifications' && <NotificationsTab    gymId={gym.id} members={members} trainers={trainers} />}
              {activeTab === 'reports'       && <ReportsTab          gymId={gym.id} apiKey={apiKey} />}
              {activeTab === 'settings'      && <SettingsTab         gymId={gym.id} gym={gym} trainers={trainers} members={members} onGymUpdate={g => setGym(g)} />}
            </>
          )}
        </div>
      </div>

      {/* Gemini API 키 설정 모달 */}
      <Modal open={showApiModal} onClose={() => setShowApiModal(false)} title="Gemini API 키 설정" maxWidth="400px">
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.6 }}>
          AI 주간 리포트 생성에 사용됩니다.<br />
          Google AI Studio에서 무료로 발급받을 수 있어요.
        </p>
        <input
          className="input"
          type="password"
          placeholder="AIza..."
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          style={{ marginBottom: '12px' }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowApiModal(false)}>취소</button>
          <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={saveApiKey}>저장</button>
        </div>
      </Modal>
    </div>
  )
}
