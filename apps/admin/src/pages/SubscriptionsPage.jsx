import { useState, useEffect, useMemo, useCallback } from 'react'
import AdminIcon from '../components/AdminIcon'
import { Badge, Chip, SearchInput, EmptyState } from '../components/ui'
import { adminRpc, seoulToday, fmtDate, fmtShort, planLabel, subStatus, subProgress, won, textMatch } from '../lib/adminRpc'

// 구독 관리 — 구독 이력이 있는 트레이너당 1줄 (현재 구독 기준). 지난 결제는 수정 패널의 '결제 이력'에.
// 트레이너 이름은 서버에서 함께 내려옴(admin_subscription_overview) → 트레이너가 많아도 '?' 로 안 보임.

const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '활성' },
  { id: 'soon', label: '곧 만료', tone: 'amber' },
  { id: 'ended', label: '만료 · 중지' },
  { id: 'voided', label: '무효' },
]
const ORDER = { soon: 0, active: 1, expired: 2, stopped: 3, voided: 4 }

export default function SubscriptionsPage({ refreshKey, onOpenTrainer, onEditSub, onStopSub, onAddSub, onChanged, onSoonCount, showToast }) {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [menuFor, setMenuFor] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await adminRpc('admin_subscription_overview'))
    } catch (e) {
      showToast('구독 목록을 불러오지 못했어요: ' + e.message, 'error')
    }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  const today = data?.today || seoulToday()
  const rows = useMemo(() => (data?.rows || [])
    .map(r => ({ ...r, st: subStatus(r.sub, today) }))
    .sort((a, b) => (ORDER[a.st.key] ?? 9) - (ORDER[b.st.key] ?? 9) || String(a.sub.valid_until).localeCompare(String(b.sub.valid_until))),
  [data, today])

  const group = (r) => r.st.key === 'expired' || r.st.key === 'stopped' ? 'ended' : r.st.key
  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, soon: 0, ended: 0, voided: 0 }
    rows.forEach(r => { c[group(r)] = (c[group(r)] || 0) + 1 })
    c.active += c.soon // '활성'은 곧 만료 포함
    return c
  }, [rows])

  useEffect(() => { if (data) onSoonCount?.(counts.soon) }, [data, counts.soon])

  const live = rows.filter(r => r.st.key === 'active' || r.st.key === 'soon')
  const proN = live.filter(r => String(r.sub.plan).toLowerCase() === 'pro').length
  const soonRows = rows.filter(r => r.st.key === 'soon')

  const visible = rows.filter(r => {
    if (!textMatch(r.trainer_name, q)) return false
    if (filter === 'all') return true
    if (filter === 'active') return r.st.key === 'active' || r.st.key === 'soon'
    return group(r) === filter
  })

  async function extend(r) {
    setBusy(r.sub.id)
    try {
      const res = await adminRpc('admin_extend_subscription', { p_id: r.sub.id, p_months: 1 })
      showToast(`✓ ${r.trainer_name} 님 1개월 연장 — ${fmtDate(res.valid_until)}까지`, 'success')
      await load(); onChanged?.()
    } catch (e) {
      showToast(e.message || '연장하지 못했어요', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="adm-page" onClick={() => menuFor && setMenuFor(null)}>
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">구독 · 매출</p>
          <h1 className="adm-page-title">구독 관리</h1>
        </div>
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => onAddSub(null)}>
          <AdminIcon name="plus" size={16} strokeWidth={2.4} />구독 추가
        </button>
      </header>

      <div className="adm-stats">
        <div className="adm-stat adm-stat--lime">
          <span>활성 구독</span><b>{live.length}<small>명</small></b>
          <em>Pro {proN} · Premium {live.length - proN}</em>
        </div>
        <div className="adm-stat adm-stat--amber">
          <span>30일 안에 만료</span><b>{soonRows.length}<small>명</small></b>
          <em>{soonRows.length ? soonRows.slice(0, 2).map(r => `${r.trainer_name} ${fmtShort(r.sub.valid_until)}`).join(' · ') : '없어요'}</em>
        </div>
        <div className="adm-stat">
          <span>만료 · 중지</span><b>{counts.ended}<small>명</small></b>
          <em>재구독 안내 대상</em>
        </div>
        <div className="adm-stat">
          <span>이번 달 결제 합계</span><b>{won(data?.month_total)}</b>
          <em>무효 처리 건 제외</em>
        </div>
      </div>

      <div className="adm-toolbar adm-toolbar--plain">
        <div className="adm-chips" role="group" aria-label="상태">
          {FILTERS.map(f => (
            <Chip key={f.id} active={filter === f.id} tone={f.tone} onClick={() => setFilter(f.id)}>{f.label} {counts[f.id] ?? 0}</Chip>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="트레이너 이름 · 초성" width={240} />
      </div>

      <div className="adm-table">
        <div className="adm-tr adm-th adm-cols-subs">
          <div>트레이너</div><div>플랜</div><div>상태</div><div>이용 기간</div><div>결제</div><div style={{ textAlign: 'right' }}>작업</div>
        </div>
        {!data && <EmptyState title="불러오는 중…" />}
        {data && !visible.length && <EmptyState title={rows.length ? '해당하는 구독이 없어요' : '아직 구독 기록이 없어요'} />}
        {visible.map(r => {
          const s = r.sub
          const voided = !!s.voided_at
          return (
            <div key={r.trainer_id} className={`adm-tr adm-cols-subs${voided ? ' is-voided' : ''}`}>
              <div style={{ minWidth: 0 }}>
                <button type="button" className="adm-link-strong" onClick={() => onOpenTrainer(r.trainer_id, 'subs')}>{r.trainer_name}</button>
                <div className="adm-cell-sub">결제 {r.payment_count}건 · 최근 {fmtShort(s.paid_at)}</div>
              </div>
              <div><Badge tone={String(s.plan).toLowerCase() === 'pro' ? 'blue' : 'lime'}>{planLabel(s.plan)}</Badge></div>
              <div><Badge tone={r.st.tone} title={s.status_reason ? `사유: ${s.status_reason}` : undefined}>{r.st.label}</Badge></div>
              <div>
                <div className="adm-cell-sub" style={{ color: '#374151' }}>{fmtDate(s.paid_at)} – {fmtDate(s.valid_until)}</div>
                <div className="adm-progress adm-progress--thin"><span className={`is-${r.st.tone}`} style={{ width: `${voided ? 0 : subProgress(s, today)}%` }} /></div>
              </div>
              <div className="adm-cell-sub" style={{ color: '#374151' }}>{s.payment_method} · {won(s.amount)}</div>
              <div className="adm-row-actions">
                {!voided && (
                  <>
                    <button type="button" className="adm-btn adm-btn--sm" disabled={busy === s.id} onClick={() => extend(r)}>+1개월</button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--ink" onClick={() => onEditSub({ ...s }, r.trainer_name)}>수정</button>
                  </>
                )}
                <div className="adm-menu-wrap">
                  <button type="button" className="adm-icon-btn is-bordered is-sm" aria-label="더보기" aria-haspopup="menu" aria-expanded={menuFor === r.trainer_id}
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === r.trainer_id ? null : r.trainer_id) }}>
                    <AdminIcon name="more" size={16} />
                  </button>
                  {menuFor === r.trainer_id && (
                    <div className="adm-menu" role="menu" onClick={e => e.stopPropagation()}>
                      <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onOpenTrainer(r.trainer_id, 'subs') }}>결제 · 변경 이력 보기</button>
                      <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onAddSub({ id: r.trainer_id, name: r.trainer_name }) }}>새 구독 추가</button>
                      {!voided && <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuFor(null); onStopSub({ ...s }, r.trainer_name) }}>중지 · 무효 처리</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="adm-foot-note">트레이너 한 명당 한 줄 — 가장 최근 구독 기준. 상태는 만료일로 자동 계산돼요 (30일 이내 = 곧 만료).</p>
    </div>
  )
}
