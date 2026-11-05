import { useState, useEffect, useCallback, useMemo } from 'react'
import AdminIcon from './AdminIcon'
import { Badge, Switch, SidePanel, SearchInput, Avatar, EmptyState } from './ui'
import { adminRpc, seoulToday, fmtDate, fmtShort, planLabel, subStatus, subProgress, won } from '../lib/adminRpc'
import { rememberTrainer } from './GlobalSearch'

// 트레이너 상세 패널 — 목록 위에 오른쪽에서 열림. 회원·구독·크레딧·CRM 권한을 한 곳에서.
// (예전 '트레이너 상세' 팝업 + 'CRM 권한 관리' 화면을 합침)

// CRM 의 실제 권한 키 (apps/crm SettingsTab PERM_DEFS / GymOwnerPortal TAB_PERMISSIONS 와 1:1)
const CRM_FEATURES = [
  { key: 'view_all_members', label: '전체 회원 열람', desc: '소속 모든 트레이너의 회원 조회' },
  { key: 'manage_products', label: '상품 관리', desc: '센터 상품 등록 · 수정 · 삭제' },
  { key: 'view_settlement', label: '정산 열람', desc: '직원 정산 내역 조회' },
]

const EVENT_LABEL = { created: '구독 추가', updated: '수정', extended: '기간 연장', stopped: '중지', voided: '무효 처리' }
const FIELD_LABEL = { plan: '플랜', valid_until: '만료일', amount: '금액', payment_method: '결제수단', paid_at: '결제일', memo: '메모' }

function fmtField(key, v) {
  if (v == null || v === '') return '없음'
  if (key === 'plan') return planLabel(v)
  if (key === 'amount') return won(v)
  if (key === 'valid_until' || key === 'paid_at') return fmtDate(v)
  return String(v)
}

export function eventText(e) {
  const d = e.detail || {}
  if (e.action === 'created') return `${planLabel(d.plan)} · ${fmtDate(d.valid_until)}까지${d.amount ? ` · ${won(d.amount)}` : ''}`
  if (e.action === 'extended') return `만료 ${fmtDate(d.from)} → ${fmtDate(d.to)} (+${d.months}개월)`
  if (e.action === 'updated') return Object.entries(d).map(([k, [a, b]]) => `${FIELD_LABEL[k] || k} ${fmtField(k, a)} → ${fmtField(k, b)}`).join(' · ')
  if (e.action === 'stopped') return `사유: ${e.reason || '-'}`
  if (e.action === 'voided') return `사유: ${e.reason || '-'}`
  return ''
}

const relDays = (ts) => {
  if (!ts) return '없음'
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  return days <= 0 ? '오늘' : `${days}일 전`
}

export default function TrainerDrawer({ trainerId, initialTab = 'overview', refreshKey, onClose, onChanged, onEditSub, onStopSub, onAddSub, showToast }) {
  const [tab, setTab] = useState(initialTab)
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState('')
  const [credit, setCredit] = useState(100)
  const [mq, setMq] = useState('')
  const today = seoulToday()

  const load = useCallback(async () => {
    if (!trainerId) return
    try {
      const res = await adminRpc('admin_trainer_detail', { p_trainer_id: trainerId })
      setD(res)
      rememberTrainer(res.trainer)
    } catch (e) {
      showToast('트레이너 정보를 불러오지 못했어요: ' + e.message, 'error')
    }
  }, [trainerId])

  useEffect(() => { setD(null); setTab(initialTab); setMq('') }, [trainerId, initialTab])
  useEffect(() => { load() }, [load, refreshKey])

  const subs = d?.subscriptions || []
  // 현재 구독 = 무효가 아닌 것 중 만료일이 가장 늦은 것
  const current = useMemo(() => subs.filter(s => !s.voided_at).sort((a, b) => String(b.valid_until).localeCompare(String(a.valid_until)))[0] || null, [subs])
  const st = subStatus(current, today)
  const perms = d?.trainer?.crm_permissions || {}
  const crmOn = !!(perms.crm_access || perms.enabled)

  async function act(key, fn, okMsg) {
    setBusy(key)
    try {
      await fn()
      if (okMsg) showToast(okMsg, 'success')
      await load()
      onChanged?.()
    } catch (e) {
      showToast(e.message || '처리하지 못했어요', 'error')
    } finally {
      setBusy('')
    }
  }

  const extend = (sub) => act('extend', async () => {
    const r = await adminRpc('admin_extend_subscription', { p_id: sub.id, p_months: 1 })
    showToast(`✓ 1개월 연장 — ${fmtDate(r.valid_until)}까지`, 'success')
  })

  const charge = () => {
    const n = parseInt(credit, 10)
    if (!n || n < 1 || n > 1000) { showToast('1~1000 사이로 입력해 주세요', 'error'); return }
    act('credit', async () => {
      const balance = await adminRpc('admin_add_credits', { p_trainer_id: trainerId, p_amount: n })
      showToast(`✓ ${n} 크레딧 충전 — 잔액 ${balance}`, 'success')
    })
  }

  const savePerms = (next, msg) => act('crm', () => adminRpc('admin_update_trainer_crm_permissions', {
    p_trainer_id: trainerId, p_permissions: next,
  }), msg)

  const members = useMemo(() => {
    const list = d?.members || []
    const term = mq.trim().toLowerCase()
    return term ? list.filter(m => String(m.name).toLowerCase().includes(term) || (m.phone_tail || '').includes(term)) : list
  }, [d, mq])

  const t = d?.trainer
  return (
    <SidePanel open={!!trainerId} onClose={onClose} width={560} label={t ? `${t.name} 트레이너 상세` : '트레이너 상세'}>
      {!d ? <div className="adm-panel-loading">불러오는 중…</div> : (
        <>
          <header className="adm-panel-head">
            <div className="adm-panel-id">
              <Avatar name={t.name} strong={st.key === 'active' || st.key === 'soon'} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="adm-panel-name">
                  <h2>{t.name}</h2>
                  {current && !current.voided_at && st.key !== 'expired' && st.key !== 'stopped'
                    ? <Badge tone={current.plan === 'pro' ? 'blue' : 'lime'}>{planLabel(current.plan)}</Badge>
                    : <Badge tone="gray">무료</Badge>}
                  {crmOn && <Badge tone="blue">CRM 사용</Badge>}
                  {t.approval_status === 'pending' && <Badge tone="amber">승인 대기</Badge>}
                </div>
                <p className="adm-panel-meta">{fmtDate(t.created_at)} 가입{t.email ? ` · ${t.email}` : ''}</p>
              </div>
              <button type="button" className="adm-icon-btn is-bordered" aria-label="닫기" onClick={onClose}><AdminIcon name="x" size={18} strokeWidth={2.2} /></button>
            </div>
            <div className="adm-tabs" role="tablist" aria-label="상세 항목">
              {[
                ['overview', '개요'],
                ['members', `회원 ${d.stats.member_count}`],
                ['subs', `구독 · 결제 ${subs.length}`],
                ['perms', 'CRM 권한'],
              ].map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
          </header>

          <div className="adm-panel-body">
            {tab === 'overview' && (
              <>
                <div className="adm-kpis">
                  <div><span>회원</span><b>{d.stats.member_count}명</b></div>
                  <div><span>보낸 수업일지</span><b>{d.stats.log_count}건</b><em>최근 30일 {d.stats.logs_30d}건</em></div>
                  <div><span>마지막 일지</span><b>{d.stats.last_log_at ? fmtShort(d.stats.last_log_at) : '–'}</b><em>{relDays(d.stats.last_log_at)}</em></div>
                </div>

                <section className="adm-box">
                  <div className="adm-box-head">
                    <h3>구독</h3>
                    {current && <Badge tone={st.tone}>{st.key === 'active' ? `활성 · D-${st.days}` : st.label}</Badge>}
                  </div>
                  {current ? (
                    <>
                      <div className="adm-box-text">{planLabel(current.plan)} · {fmtDate(current.paid_at)} – {fmtDate(current.valid_until)}{current.status_reason ? ` · ${current.status_reason}` : ''}</div>
                      <div className="adm-progress"><span style={{ width: `${subProgress(current, today)}%` }} className={`is-${st.tone}`} /></div>
                      <div className="adm-box-actions">
                        <button type="button" className="adm-btn" disabled={busy === 'extend'} onClick={() => extend(current)}>+1개월 연장</button>
                        <button type="button" className="adm-btn adm-btn--ink" onClick={() => onEditSub(current, t.name)}>구독 수정</button>
                      </div>
                    </>
                  ) : (
                    <div className="adm-box-actions" style={{ marginTop: 0 }}>
                      <span className="adm-box-text" style={{ flex: 1 }}>구독 기록이 없어요 (무료 플랜)</span>
                      <button type="button" className="adm-btn adm-btn--primary" onClick={() => onAddSub({ id: t.id, name: t.name })}>구독 추가</button>
                    </div>
                  )}
                </section>

                <section className="adm-box">
                  <div className="adm-box-head"><h3>AI 크레딧</h3><b className="adm-big">{t.credits}</b></div>
                  <div className="adm-box-actions">
                    {[50, 100, 200].map(n => (
                      <button key={n} type="button" className={`adm-chip${Number(credit) === n ? ' is-active' : ''}`} onClick={() => setCredit(n)}>+{n}</button>
                    ))}
                    <input type="number" min="1" max="1000" value={credit} onChange={e => setCredit(e.target.value)} aria-label="충전할 크레딧" className="adm-input adm-input--sm" />
                    <span style={{ flex: 1 }} />
                    <button type="button" className="adm-btn adm-btn--primary" disabled={busy === 'credit'} onClick={charge}>
                      {Number(credit) > 0 ? `${credit} 충전 → ${t.credits + Number(credit)}` : '충전'}
                    </button>
                  </div>
                </section>

                <section className="adm-box adm-box--row">
                  <div style={{ flex: 1 }}>
                    <h3>CRM 포털 접근</h3>
                    <p className="adm-box-text">켜면 헬스장 관리(CRM) 화면을 쓸 수 있어요 · 세부 권한은 'CRM 권한' 탭</p>
                  </div>
                  <Switch checked={crmOn} label="CRM 포털 접근" disabled={busy === 'crm'}
                    onChange={(on) => savePerms({ ...perms, crm_access: on, enabled: on }, on ? 'CRM 접근을 켰어요' : 'CRM 접근을 껐어요')} />
                </section>
              </>
            )}

            {tab === 'members' && (
              <>
                <SearchInput value={mq} onChange={setMq} placeholder="회원 이름 · 전화 뒷자리" />
                {!members.length ? <EmptyState title={mq ? '검색 결과가 없어요' : '등록된 회원이 없어요'} /> : (
                  <div className="adm-list">
                    {members.map(m => {
                      const left = Math.max(0, (m.total_sessions || 0) - (m.done_sessions || 0))
                      const pct = m.total_sessions ? Math.round((m.done_sessions / m.total_sessions) * 100) : 0
                      const tone = left === 0 ? 'red' : left <= 3 ? 'amber' : 'lime'
                      return (
                        <div key={m.id} className="adm-list-row">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="adm-list-title">{m.name}</div>
                            <div className="adm-list-sub">{m.lesson_purpose || '목적 미설정'}{m.phone_tail ? ` · •••• ${m.phone_tail}` : ''}</div>
                          </div>
                          <div className="adm-mini-progress"><span className={`is-${tone}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                          <span className="adm-num" style={{ width: 52, textAlign: 'right' }}>{m.done_sessions}/{m.total_sessions}</span>
                          <Badge tone={tone}>{left === 0 ? '끝남' : `${left}회 남음`}</Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {tab === 'subs' && (
              <>
                <div className="adm-box-actions" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
                  <button type="button" className="adm-btn adm-btn--primary" onClick={() => onAddSub({ id: t.id, name: t.name })}>
                    <AdminIcon name="plus" size={15} strokeWidth={2.4} />구독 추가
                  </button>
                </div>
                {!subs.length ? <EmptyState title="결제 기록이 없어요" /> : (
                  <div className="adm-list">
                    {subs.map(s => {
                      const ss = subStatus(s, today)
                      return (
                        <div key={s.id} className={`adm-list-row${s.voided_at ? ' is-voided' : ''}`}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="adm-list-title">{planLabel(s.plan)} · {fmtDate(s.paid_at)} – {fmtDate(s.valid_until)}</div>
                            <div className="adm-list-sub">{s.payment_method} · {won(s.amount)}{s.memo ? ` · ${s.memo}` : ''}{s.status_reason ? ` · 사유: ${s.status_reason}` : ''}</div>
                          </div>
                          <Badge tone={ss.tone}>{ss.label}</Badge>
                          {!s.voided_at && (
                            <>
                              <button type="button" className="adm-btn adm-btn--sm" onClick={() => onEditSub(s, t.name)}>수정</button>
                              <button type="button" className="adm-btn adm-btn--sm adm-btn--danger-ghost" onClick={() => onStopSub(s, t.name)}>중지 · 무효</button>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <h3 className="adm-section-label">변경 이력</h3>
                {!d.events.length ? <p className="adm-box-text">아직 기록이 없어요 (이번 개편 이후부터 쌓여요)</p> : (
                  <ol className="adm-timeline">
                    {d.events.map(e => (
                      <li key={e.id} className={`is-${e.action}`}>
                        <b>{EVENT_LABEL[e.action] || e.action}</b>
                        <span>{eventText(e)}</span>
                        <em>{new Date(e.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</em>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}

            {tab === 'perms' && (
              <>
                <section className="adm-box adm-box--row">
                  <div style={{ flex: 1 }}>
                    <h3>CRM 포털 접근</h3>
                    <p className="adm-box-text">끄면 아래 세부 권한도 쓸 수 없어요</p>
                  </div>
                  <Switch checked={crmOn} label="CRM 포털 접근" disabled={busy === 'crm'}
                    onChange={(on) => savePerms({ ...perms, crm_access: on, enabled: on }, on ? 'CRM 접근을 켰어요' : 'CRM 접근을 껐어요')} />
                </section>
                {CRM_FEATURES.map(f => (
                  <section key={f.key} className={`adm-box adm-box--row${crmOn ? '' : ' is-disabled'}`}>
                    <div style={{ flex: 1 }}>
                      <h3>{f.label}</h3>
                      <p className="adm-box-text">{f.desc}</p>
                    </div>
                    <Switch checked={!!perms[f.key]} label={f.label} disabled={!crmOn || busy === 'crm'}
                      onChange={(on) => savePerms({ ...perms, [f.key]: on }, `${f.label} ${on ? '허용' : '차단'}`)} />
                  </section>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </SidePanel>
  )
}
