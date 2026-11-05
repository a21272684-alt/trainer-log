import AdminIcon from './AdminIcon'

// 개편 메뉴 구조 (5묶음 11메뉴) — 통합 검색의 '메뉴 바로가기'도 이 목록을 쓴다.
export const NAV_GROUPS = [
  { label: null, items: [{ id: 'home', label: '홈', icon: 'home' }] },
  { label: '사람', items: [
    { id: 'trainers', label: '트레이너', icon: 'users' },
    { id: 'signups', label: '가입 승인', icon: 'userCheck' },
    { id: 'members', label: '회원', icon: 'user' },
  ] },
  { label: '구독 · 매출', items: [
    { id: 'subs', label: '구독 관리', icon: 'card' },
    { id: 'plans', label: '플랜 · 기능 권한', icon: 'sliders' },
  ] },
  { label: '운영', items: [
    { id: 'logs', label: '수업일지', icon: 'file' },
    { id: 'notices', label: '공지', icon: 'megaphone' },
    { id: 'community', label: '커뮤니티', icon: 'message' },
  ] },
  { label: '사이트 · 설정', items: [
    { id: 'landing', label: '랜딩 페이지', icon: 'globe' },
    { id: 'settings', label: '시스템 설정', icon: 'settings' },
  ] },
]

export const NAV_LABEL = Object.fromEntries(NAV_GROUPS.flatMap(g => g.items.map(i => [i.id, i.label])))
export const NAV_GROUP_LABEL = Object.fromEntries(NAV_GROUPS.flatMap(g => g.items.map(i => [i.id, g.label])))

// counts: { trainers, members } = 숫자만 / alerts: { signups, subs, community } = 처리할 일 배지
export default function AdminSidebar({ active, onNavigate, counts = {}, alerts = {}, onLogout }) {
  return (
    <nav className="adm-sidebar" aria-label="관리자 메뉴">
      <button type="button" className="adm-brand" onClick={() => onNavigate('home')}>
        <span className="adm-brand-name">오<span>운</span></span>
        <span className="adm-brand-badge">ADMIN</span>
      </button>

      {NAV_GROUPS.map((g, gi) => (
        <div key={gi} className="adm-nav-group">
          {g.label && <div className="adm-nav-label">{g.label}</div>}
          {g.items.map(item => {
            const on = active === item.id
            const alert = alerts[item.id]
            const count = counts[item.id]
            return (
              <button key={item.id} type="button" aria-current={on ? 'page' : undefined}
                className={`adm-nav-item${on ? ' is-active' : ''}`} onClick={() => onNavigate(item.id)}>
                <span className="adm-nav-icon"><AdminIcon name={item.icon} size={17} /></span>
                <span className="adm-nav-text">{item.label}</span>
                {alert > 0 ? (
                  <span className={`adm-nav-alert adm-nav-alert--${item.id === 'subs' ? 'amber' : 'rose'}`}>{alert}</span>
                ) : count != null ? (
                  <span className="adm-nav-count">{count}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}

      <div className="adm-sidebar-foot">
        <span className="adm-avatar is-white" aria-hidden="true">관</span>
        <span className="adm-sidebar-who">관리자</span>
        <button type="button" className="adm-icon-btn" aria-label="로그아웃" onClick={onLogout}>
          <AdminIcon name="logout" size={17} />
        </button>
      </div>
    </nav>
  )
}
