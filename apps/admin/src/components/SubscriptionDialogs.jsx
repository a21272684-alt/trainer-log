import { useState, useEffect, useRef } from 'react'
import AdminIcon from './AdminIcon'
import { Badge, SidePanel, Avatar } from './ui'
import { eventText } from './TrainerDrawer'
import {
  adminRpc, seoulToday, addMonths, fmtDate, planLabel, subStatus, won, PAYMENT_METHODS,
} from '../lib/adminRpc'

// 구독 수정 패널 · 중지/무효 확인 · 구독 추가 — 모든 변경은 subscription_events 에 기록됨 (098)

const PLAN_GATES = { premium: '정산 · AI 인사이트 · 푸시 포함', pro: '정산 · AI 인사이트 · 푸시 제외' }

// ─────────────────────────────────────────────
// 구독 수정
// ─────────────────────────────────────────────
export function SubscriptionEditor({ sub, trainerName, onClose, onSaved, onStop, showToast }) {
  const today = seoulToday()
  const [form, setForm] = useState(null)
  const [history, setHistory] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!sub) return
    setForm({
      plan: String(sub.plan || 'pro').toLowerCase() === 'pro' ? 'pro' : 'premium',
      valid_until: String(sub.valid_until || today).slice(0, 10),
      payment_method: sub.payment_method || '카카오페이',
      amount: sub.amount ?? 0,
      paid_at: String(sub.paid_at || today).slice(0, 10),
      memo: sub.memo || '',
    })
    setHistory(null)
    adminRpc('admin_trainer_detail', { p_trainer_id: sub.trainer_id })
      .then(res => setHistory(res))
      .catch(() => setHistory({ subscriptions: [], events: [] }))
  }, [sub?.id])

  if (!sub || !form) return null
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const st = subStatus(sub, today)
  const base = form.valid_until > today ? form.valid_until : today

  const changes = []
  if (form.plan !== String(sub.plan || '').toLowerCase()) changes.push(['플랜', planLabel(sub.plan), `${planLabel(form.plan)} (${PLAN_GATES[form.plan]})`])
  if (form.valid_until !== String(sub.valid_until || '').slice(0, 10)) changes.push(['만료일', fmtDate(sub.valid_until), fmtDate(form.valid_until)])
  if (Number(form.amount) !== Number(sub.amount || 0)) changes.push(['금액', won(sub.amount), won(form.amount)])
  if (form.payment_method !== sub.payment_method) changes.push(['결제수단', sub.payment_method || '-', form.payment_method])
  if (form.paid_at !== String(sub.paid_at || '').slice(0, 10)) changes.push(['결제일', fmtDate(sub.paid_at), fmtDate(form.paid_at)])
  if ((form.memo || '') !== (sub.memo || '')) changes.push(['메모', sub.memo || '없음', form.memo || '없음'])

  async function save() {
    if (!form.valid_until) { showToast('만료일을 입력해 주세요', 'error'); return }
    setSaving(true)
    try {
      await adminRpc('admin_update_subscription', {
        p_id: sub.id, p_plan: form.plan, p_payment_method: form.payment_method,
        p_amount: parseInt(form.amount, 10) || 0, p_paid_at: form.paid_at || null,
        p_valid_until: form.valid_until, p_memo: form.memo,
      })
      showToast('✓ 구독을 수정했어요 — 트레이너 앱에 바로 반영돼요', 'success')
      onSaved()
    } catch (e) {
      showToast(e.message || '저장하지 못했어요', 'error')
    } finally {
      setSaving(false)
    }
  }

  const otherSubs = (history?.subscriptions || [])
  const events = (history?.events || []).filter(e => e.subscription_id === sub.id || !e.subscription_id).slice(0, 6)

  return (
    <SidePanel open={!!sub} onClose={onClose} width={500} label="구독 수정">
      <header className="adm-panel-head adm-panel-head--plain">
        <div className="adm-panel-id">
          <div style={{ flex: 1 }}>
            <div className="adm-panel-kicker">구독 수정</div>
            <div className="adm-panel-name"><h2>{trainerName}</h2><Badge tone={st.tone}>{st.label}</Badge></div>
          </div>
          <button type="button" className="adm-icon-btn is-bordered" aria-label="닫기" onClick={onClose}><AdminIcon name="x" size={18} strokeWidth={2.2} /></button>
        </div>
      </header>

      <div className="adm-panel-body">
        <div className="adm-field">
          <span className="adm-field-label">플랜</span>
          <div className="adm-seg" role="group" aria-label="플랜">
            {['pro', 'premium'].map(p => (
              <button key={p} type="button" aria-pressed={form.plan === p} className={form.plan === p ? 'is-active' : ''} onClick={() => set('plan', p)}>{planLabel(p)}</button>
            ))}
          </div>
        </div>

        <div className="adm-field">
          <label className="adm-field-label" htmlFor="sub-valid">만료일</label>
          <input id="sub-valid" type="date" className="adm-input" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
          <div className="adm-chips" style={{ marginTop: 8 }}>
            {[[1, '+1개월'], [3, '+3개월'], [12, '+1년']].map(([n, label]) => (
              <button key={n} type="button" className="adm-chip" onClick={() => set('valid_until', addMonths(base, n))}>{label}</button>
            ))}
          </div>
        </div>

        <div className="adm-grid-2">
          <label className="adm-field">
            <span className="adm-field-label">결제수단</span>
            <select className="adm-input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
              {[...new Set([...PAYMENT_METHODS, form.payment_method])].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">금액 (원)</span>
            <input type="number" min="0" className="adm-input" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </label>
        </div>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span className="adm-field-label">결제일</span>
            <input type="date" className="adm-input" value={form.paid_at} onChange={e => set('paid_at', e.target.value)} />
          </label>
          <label className="adm-field">
            <span className="adm-field-label">메모</span>
            <input type="text" className="adm-input" value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="특이사항" />
          </label>
        </div>

        <div className={`adm-preview${changes.length ? '' : ' is-empty'}`}>
          <div className="adm-preview-head"><AdminIcon name="alert" size={14} strokeWidth={2.2} />
            {changes.length ? '저장하면 트레이너 앱에 바로 반영돼요' : '바뀐 내용이 없어요'}
          </div>
          {changes.map(([k, a, b]) => (
            <div key={k} className="adm-preview-row"><span>{k}</span><span>{a} → <b>{b}</b></span></div>
          ))}
        </div>

        <h3 className="adm-section-label">결제 이력 {history ? `${otherSubs.length}건` : ''}</h3>
        {!history ? <p className="adm-box-text">불러오는 중…</p> : (
          <div className="adm-list">
            {otherSubs.map(s => (
              <div key={s.id} className={`adm-list-row${s.voided_at ? ' is-voided' : ''}${s.id === sub.id ? ' is-current' : ''}`}>
                <div style={{ flex: 1 }}>
                  <div className="adm-list-title">{fmtDate(s.paid_at)} · {planLabel(s.plan)} · {s.payment_method}</div>
                  <div className="adm-list-sub">{fmtDate(s.valid_until)}까지{s.voided_at ? ' · 무효' : s.stopped_at ? ' · 중지' : ''}</div>
                </div>
                <span className="adm-num">{won(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {events.length > 0 && (
          <>
            <h3 className="adm-section-label">이 구독의 변경 이력</h3>
            <ol className="adm-timeline">
              {events.map(e => (
                <li key={e.id} className={`is-${e.action}`}>
                  <b>{({ created: '구독 추가', updated: '수정', extended: '기간 연장', stopped: '중지', voided: '무효 처리' })[e.action]}</b>
                  <span>{eventText(e)}</span>
                  <em>{new Date(e.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</em>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      <footer className="adm-panel-foot">
        <button type="button" className="adm-btn adm-btn--danger-ghost" onClick={() => onStop(sub, trainerName)}>구독 중지 · 무효</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="adm-btn" onClick={onClose}>취소</button>
        <button type="button" className="adm-btn adm-btn--primary" disabled={saving || !changes.length} onClick={save}>{saving ? '저장 중…' : '변경 저장'}</button>
      </footer>
    </SidePanel>
  )
}

// ─────────────────────────────────────────────
// 중지 · 무효 확인
// ─────────────────────────────────────────────
const QUICK_REASONS = { stop: ['해지 요청', '서비스 이용 종료', '결제 미납'], void: ['중복 추가', '잘못 입력', '전액 환불'] }

export function SubscriptionStopDialog({ sub, trainerName, onClose, onDone, showToast }) {
  const [mode, setMode] = useState('stop')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setMode(sub?.stopped_at ? 'void' : 'stop'); setReason('') }, [sub?.id])
  useEffect(() => {
    if (!sub) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sub, onClose])

  if (!sub) return null
  const stopped = !!sub.stopped_at

  async function confirm() {
    if (!reason.trim()) { showToast('사유를 입력해 주세요', 'error'); inputRef.current?.focus(); return }
    setBusy(true)
    try {
      await adminRpc(mode === 'stop' ? 'admin_stop_subscription' : 'admin_void_subscription', { p_id: sub.id, p_reason: reason.trim() })
      showToast(mode === 'stop' ? '구독을 오늘로 중지했어요 — 지금부터 무료 플랜' : '무효 처리했어요 — 권한 해제 · 매출에서 빠짐', 'success')
      onDone()
    } catch (e) {
      showToast(e.message || '처리하지 못했어요', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-dialog-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="adm-dialog" role="alertdialog" aria-label="구독 중지 · 무효">
        <div className="adm-dialog-icon"><AdminIcon name="alert" size={22} strokeWidth={2.2} /></div>
        <h2>{trainerName} 님 구독을 어떻게 할까요?</h2>
        <p className="adm-box-text">{planLabel(sub.plan)} · {fmtDate(sub.valid_until)}까지 · 기록은 지워지지 않아요</p>

        <label className={`adm-radio-card${mode === 'stop' ? ' is-active' : ''}${stopped ? ' is-disabled' : ''}`}>
          <input type="radio" name="stop-mode" checked={mode === 'stop'} disabled={stopped} onChange={() => setMode('stop')} />
          <span>
            <b>오늘로 중지</b>
            <span>만료일을 오늘로 바꿔 지금부터 무료 플랜이 돼요. 결제는 매출에 그대로 남아요.{stopped ? ' (이미 중지됨)' : ''}</span>
          </span>
        </label>
        <label className={`adm-radio-card${mode === 'void' ? ' is-active' : ''}`}>
          <input type="radio" name="stop-mode" checked={mode === 'void'} onChange={() => setMode('void')} />
          <span>
            <b>무효 처리</b>
            <span>처음부터 없던 결제로 봐요. 권한이 바로 풀리고 매출 합계에서 빠져요. 잘못 넣은 건 · 중복 · 전액 환불일 때.</span>
          </span>
        </label>

        <label className="adm-field" style={{ marginTop: 14 }}>
          <span className="adm-field-label">사유 (필수)</span>
          <input ref={inputRef} type="text" className="adm-input" value={reason} onChange={e => setReason(e.target.value)} placeholder={mode === 'stop' ? '예: 해지 요청' : '예: 중복 추가'} />
        </label>
        <div className="adm-chips" style={{ marginTop: 8 }}>
          {QUICK_REASONS[mode].map(r => <button key={r} type="button" className="adm-chip" onClick={() => setReason(r)}>{r}</button>)}
        </div>

        <div className="adm-dialog-actions">
          <button type="button" className="adm-btn" onClick={onClose}>돌아가기</button>
          <button type="button" className="adm-btn adm-btn--danger" disabled={busy} onClick={confirm}>{busy ? '처리 중…' : mode === 'stop' ? '오늘로 중지' : '무효 처리'}</button>
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────
// 구독 추가 — 트레이너는 서버 검색으로 고름 (인원이 많아도 찾을 수 있음)
// ─────────────────────────────────────────────
export function AddSubscriptionDialog({ open, preset, onClose, onDone, showToast }) {
  const today = seoulToday()
  const [trainer, setTrainer] = useState(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [form, setForm] = useState({ plan: 'pro', amount: '', payment_method: '카카오페이', paid_at: today, valid_until: addMonths(today, 1), memo: '' })
  const [saving, setSaving] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    if (!open) return
    setTrainer(preset || null); setQ(''); setFound([])
    setForm({ plan: 'pro', amount: '', payment_method: '카카오페이', paid_at: today, valid_until: addMonths(today, 1), memo: '' })
  }, [open, preset?.id])

  useEffect(() => {
    if (!open || trainer) return
    const term = q.trim()
    if (!term) { setFound([]); return }
    const id = ++reqId.current
    const timer = setTimeout(() => {
      adminRpc('admin_search_trainers', { p_query: term, p_limit: 8 })
        .then(res => { if (id === reqId.current) setFound(res.rows || []) })
        .catch(() => {})
    }, 200)
    return () => clearTimeout(timer)
  }, [q, open, trainer])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!trainer) { showToast('트레이너를 골라 주세요', 'error'); return }
    if (!form.valid_until) { showToast('만료일을 입력해 주세요', 'error'); return }
    setSaving(true)
    try {
      await adminRpc('admin_add_subscription', {
        p_trainer_id: trainer.id, p_plan: form.plan, p_payment_method: form.payment_method,
        p_amount: parseInt(form.amount, 10) || 0, p_paid_at: form.paid_at || null,
        p_valid_until: form.valid_until, p_memo: form.memo.trim(),
      })
      showToast(`✓ ${trainer.name} 님 ${planLabel(form.plan)} 구독을 추가했어요`, 'success')
      onDone()
    } catch (e) {
      showToast(e.message || '저장하지 못했어요', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="adm-dialog-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="adm-dialog adm-dialog--wide" role="dialog" aria-label="구독 추가">
        <div className="adm-dialog-title">
          <h2>구독 추가</h2>
          <button type="button" className="adm-icon-btn" aria-label="닫기" onClick={onClose}><AdminIcon name="x" size={18} strokeWidth={2.2} /></button>
        </div>

        <div className="adm-field">
          <span className="adm-field-label">트레이너</span>
          {trainer ? (
            <div className="adm-picked">
              <Avatar name={trainer.name} strong />
              <b style={{ flex: 1 }}>{trainer.name}</b>
              {!preset && <button type="button" className="adm-btn adm-btn--sm" onClick={() => setTrainer(null)}>다시 고르기</button>}
            </div>
          ) : (
            <>
              <label className="adm-search">
                <AdminIcon name="search" size={15} strokeWidth={2.2} />
                <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="이름 · 이메일 · 초성으로 찾기" aria-label="트레이너 찾기" autoFocus />
              </label>
              {found.length > 0 && (
                <div className="adm-pick-list">
                  {found.map(t => (
                    <button key={t.id} type="button" onClick={() => setTrainer({ id: t.id, name: t.name })}>
                      <Avatar name={t.name} strong={t.subscribed} />
                      <span style={{ flex: 1, textAlign: 'left' }}><b>{t.name}</b><em>{t.email || ''}</em></span>
                      {t.subscribed && <Badge tone={t.plan === 'pro' ? 'blue' : 'lime'}>{planLabel(t.plan)} 구독 중</Badge>}
                    </button>
                  ))}
                </div>
              )}
              {q.trim() && !found.length && <p className="adm-box-text" style={{ marginTop: 8 }}>찾는 중이거나 결과가 없어요</p>}
            </>
          )}
        </div>

        <div className="adm-field">
          <span className="adm-field-label">플랜</span>
          <div className="adm-seg" role="group" aria-label="플랜">
            {['pro', 'premium'].map(p => (
              <button key={p} type="button" aria-pressed={form.plan === p} className={form.plan === p ? 'is-active' : ''} onClick={() => set('plan', p)}>{planLabel(p)}</button>
            ))}
          </div>
        </div>
        <div className="adm-grid-2">
          <label className="adm-field"><span className="adm-field-label">결제일</span>
            <input type="date" className="adm-input" value={form.paid_at} onChange={e => set('paid_at', e.target.value)} /></label>
          <label className="adm-field"><span className="adm-field-label">만료일</span>
            <input type="date" className="adm-input" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} /></label>
        </div>
        <div className="adm-chips">
          {[[1, '1개월'], [3, '3개월'], [12, '1년']].map(([n, label]) => (
            <button key={n} type="button" className="adm-chip" onClick={() => set('valid_until', addMonths(form.paid_at || today, n))}>결제일부터 {label}</button>
          ))}
        </div>
        <div className="adm-grid-2" style={{ marginTop: 12 }}>
          <label className="adm-field"><span className="adm-field-label">결제수단</span>
            <select className="adm-input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select></label>
          <label className="adm-field"><span className="adm-field-label">금액 (원)</span>
            <input type="number" min="0" className="adm-input" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="9900" /></label>
        </div>
        <label className="adm-field"><span className="adm-field-label">메모 (선택)</span>
          <input type="text" className="adm-input" value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="특이사항" /></label>

        <div className="adm-dialog-actions">
          <button type="button" className="adm-btn" onClick={onClose}>취소</button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={saving || !trainer} onClick={save}>{saving ? '저장 중…' : '구독 추가'}</button>
        </div>
      </section>
    </div>
  )
}
