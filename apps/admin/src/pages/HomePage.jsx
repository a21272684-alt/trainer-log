import { useState, useEffect } from 'react'
import AdminIcon from '../components/AdminIcon'
import { Badge, EmptyState } from '../components/ui'
import { adminRpc, daysBetween, fmtShort, planLabel } from '../lib/adminRpc'

// 홈 — 오늘 처리할 일 + 숫자 요약 + 월별 가입 추이 + 최근 수업일지 (admin_home_overview, 099)

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(String(iso).endsWith('Z') || String(iso).includes('+') ? iso : iso + 'Z')
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HomePage({ onNavigate, onOpenTrainer, refreshKey, showToast }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    adminRpc('admin_home_overview').then(setData)
      .catch(e => showToast('홈 요약을 불러오지 못했어요: ' + e.message, 'error'))
  }, [refreshKey])

  if (!data) return <div className="adm-page"><EmptyState title="불러오는 중…" /></div>

  const { counts = {}, todo = {}, monthly = [], soon_list = [], recent_logs = [], today } = data
  const todos = [
    { key: 'signups', n: todo.signups_pending, label: '가입 승인 대기', desc: '승인해야 앱을 쓸 수 있어요', nav: 'signups', tone: 'rose', icon: 'userCheck' },
    { key: 'soon', n: todo.subs_soon, label: '7일 안에 만료되는 구독', desc: '연장 여부를 확인하세요', nav: 'subs', tone: 'amber', icon: 'clock' },
    { key: 'expired', n: todo.subs_expired_7d, label: '최근 7일 안에 만료된 구독', desc: '재결제 안내가 필요할 수 있어요', nav: 'subs', tone: 'amber', icon: 'card' },
    { key: 'reports', n: todo.reports_pending, label: '커뮤니티 신고', desc: '처리하지 않은 신고', nav: 'community', tone: 'rose', icon: 'alert' },
  ]
  const open = todos.filter(t => t.n > 0)
  const maxMonth = Math.max(1, ...monthly.map(m => Math.max(m.trainers, m.members)))

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">{today} · 오늘</p>
          <h1 className="adm-page-title">홈</h1>
        </div>
      </header>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>오늘 처리할 일</h2>
          {open.length === 0 && <Badge tone="lime">모두 처리했어요</Badge>}
        </div>
        <div className="adm-todo-grid">
          {todos.map(t => (
            <button key={t.key} type="button" className={`adm-todo${t.n > 0 ? ` is-${t.tone}` : ' is-done'}`} onClick={() => onNavigate(t.nav)}>
              <span className="adm-todo-icon"><AdminIcon name={t.n > 0 ? t.icon : 'check'} size={18} strokeWidth={2.2} /></span>
              <span className="adm-todo-main">
                <b>{t.label}</b>
                <em>{t.n > 0 ? t.desc : '없음'}</em>
              </span>
              <span className="adm-todo-n">{t.n || 0}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="adm-stats">
        <button type="button" className="adm-stat adm-stat--btn" onClick={() => onNavigate('trainers')}>
          <span>트레이너</span><b>{counts.trainers}<small>명</small></b>
          <em>최근 7일 일지 쓴 트레이너 {counts.active_trainers_7d}명</em>
        </button>
        <button type="button" className="adm-stat adm-stat--btn" onClick={() => onNavigate('members')}>
          <span>회원</span><b>{counts.members}<small>명</small></b>
          <em>트레이너 1명당 평균 {counts.trainers ? (counts.members / counts.trainers).toFixed(1) : 0}명</em>
        </button>
        <button type="button" className="adm-stat adm-stat--lime adm-stat--btn" onClick={() => onNavigate('subs')}>
          <span>구독 중</span><b>{counts.subscribed}<small>명</small></b>
          <em>CRM 사용 {counts.crm_trainers}명</em>
        </button>
        <button type="button" className="adm-stat adm-stat--btn" onClick={() => onNavigate('logs')}>
          <span>수업일지</span><b>{counts.logs}<small>건</small></b>
          <em>오늘 {counts.logs_today}건 · 커뮤니티 유저 {counts.community_users}명</em>
        </button>
      </div>

      <div className="adm-home-grid">
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>월별 가입</h2>
            <div className="adm-legend"><span className="is-trainer">트레이너</span><span className="is-member">회원</span></div>
          </div>
          <div className="adm-bars" role="img" aria-label="최근 12개월 월별 트레이너·회원 가입 수">
            {monthly.map(m => (
              <div key={m.ym} className="adm-bar-col" title={`${m.ym} · 트레이너 ${m.trainers}명 · 회원 ${m.members}명`}>
                <div className="adm-bar-pair">
                  <span className="adm-bar is-trainer" style={{ height: `${(m.trainers / maxMonth) * 100}%` }}>{m.trainers > 0 && <i>{m.trainers}</i>}</span>
                  <span className="adm-bar is-member" style={{ height: `${(m.members / maxMonth) * 100}%` }}>{m.members > 0 && <i>{m.members}</i>}</span>
                </div>
                <span className="adm-bar-label">{Number(m.ym.slice(5))}월</span>
              </div>
            ))}
          </div>
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2>만료 임박 · 최근 만료</h2>
            <button type="button" className="adm-link" onClick={() => onNavigate('subs')}>구독 관리 <AdminIcon name="arrowRight" size={14} /></button>
          </div>
          {soon_list.length === 0
            ? <EmptyState title="앞뒤 7일 안에 만료되는 구독이 없어요" />
            : (
              <div className="adm-list">
                {soon_list.map(s => {
                  const d = daysBetween(today, s.valid_until)
                  return (
                    <button key={s.trainer_id} type="button" className="adm-list-row adm-list-btn" onClick={() => onOpenTrainer(s.trainer_id, 'subs')}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="adm-list-title">{s.name}</span>
                        <span className="adm-list-sub">{planLabel(s.plan)} · {fmtShort(s.valid_until)}까지</span>
                      </span>
                      <Badge tone={d < 0 ? 'red' : d === 0 ? 'amber' : 'amber'}>{d < 0 ? `${-d}일 지남` : d === 0 ? '오늘 만료' : `D-${d}`}</Badge>
                    </button>
                  )
                })}
              </div>
            )}
        </section>
      </div>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>최근 수업일지</h2>
          <button type="button" className="adm-link" onClick={() => onNavigate('logs')}>수업일지 통계 <AdminIcon name="arrowRight" size={14} /></button>
        </div>
        {recent_logs.length === 0
          ? <EmptyState title="수업일지가 아직 없어요" />
          : (
            <div className="adm-list">
              {recent_logs.map(l => (
                <button key={l.id} type="button" className="adm-list-row adm-list-btn" onClick={() => l.trainer_id && onOpenTrainer(l.trainer_id)}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="adm-list-title">{l.member_name || '(삭제된 회원)'} 회원 · {l.session_number}회차</span>
                    <span className="adm-list-sub">트레이너 {l.trainer_name || '?'}</span>
                  </span>
                  <span className="adm-num adm-num--soft">{fmtTime(l.created_at)}</span>
                </button>
              ))}
            </div>
          )}
      </section>
    </div>
  )
}
