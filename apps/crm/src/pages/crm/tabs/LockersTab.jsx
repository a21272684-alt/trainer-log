import { useState, useEffect, useMemo } from 'react'
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from '../components/CrmModal'
import PaymentDialog from '../components/PaymentDialog'
import CrmIcon from '../components/CrmIcon'
import TopbarActions from '../components/TopbarActions'
import { todayStr } from '../lib/ticketDateCalc'

// ── 락커 관리 ───────────────────────────────────────────────────
// 현황판 + 칸 상세. 쓰기는 087 RPC. 만료돼도 자동으로 비우지 않음 → "회수" 를 눌러야 빈 칸.

const mono = { fontVariantNumeric: 'tabular-nums' }

const STATES = {
  empty: { label: '빈 칸',       cls: 's-empty', dot: 'transparent', ring: '#9CA3AF' },
  use:   { label: '사용 중',     cls: 's-use',   dot: '#65A30D' },
  soon:  { label: '만료 임박',   cls: 's-soon',  dot: '#D97706' },
  over:  { label: '만료 · 미회수', cls: 's-over',  dot: '#E11D48' },
  off:   { label: '사용 불가',   cls: 's-off',   dot: '#9CA3AF' },
}

const ERRORS = {
  IN_USE: '이미 사용 중인 칸이에요.', DISABLED: '사용 불가로 표시된 칸이에요.',
  INVALID_RANGE: '번호 범위를 확인해주세요 (1~9999, 한 번에 500개까지).',
  NOT_ACTIVE: '이미 회수된 배정이에요.', PERMISSION_DENIED: '권한이 없어요.',
}
const errText = (m = '') => ERRORS[Object.keys(ERRORS).find(k => m.includes(k))] || '처리 중 오류: ' + m

function stateOf(l, today) {
  if (l.status === 'disabled') return 'off'
  const a = l.assignment
  if (!a) return 'empty'
  const left = differenceInCalendarDays(parseISO(a.end_date), parseISO(today))
  if (left < 0) return 'over'
  if (left <= 7) return 'soon'
  return 'use'
}

const md = d => d.slice(5).replace('-', '/')

// 칸에 보이는 기간 (시작~만료)
function periodText(l) {
  const a = l.assignment
  return a ? `${md(a.start_date)}~${md(a.end_date)}` : ''
}

// 기간 아래 상태 (만료 임박·만료만)
function statusText(l, st, today) {
  if (st === 'empty') return '빈 칸'
  if (st === 'off')   return '사용 불가'
  const left = differenceInCalendarDays(parseISO(l.assignment.end_date), parseISO(today))
  if (st === 'over') return `만료 ${-left}일`
  if (st === 'soon') return left === 0 ? '오늘 만료' : `D-${left}`
  return ''
}

export default function LockersTab({ gymId, members = [], trainers = [], currentTrainer }) {
  const today = todayStr()
  const [lockers,  setLockers]  = useState([])
  const [pending,  setPending]  = useState([])     // 칸 미배정 대여권 결제
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [selId,    setSelId]    = useState(null)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [addOpen,  setAddOpen]  = useState(false)
  const [range,    setRange]    = useState({ from: '', to: '' })
  const [moving,   setMoving]   = useState(false)
  const [extendFor, setExtendFor] = useState(null)  // { member, assignment, number }

  useEffect(() => { load() }, [gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const [b, u] = await Promise.all([
      supabase.rpc('crm_locker_board', { p_gym_id: gymId }),
      supabase.rpc('crm_unassigned_locker_payments', { p_gym_id: gymId }),
    ])
    if (b.error) setError(errText(b.error.message))
    setLockers(b.data || [])
    setPending(u.data || [])
    setLoading(false)
  }

  const rows = useMemo(() => lockers.map(l => {
    const st = stateOf(l, today)
    return { ...l, st, period: periodText(l), status: statusText(l, st, today) }
  }), [lockers, today])

  const counts = useMemo(() => {
    const c = { all: rows.length }
    Object.keys(STATES).forEach(k => { c[k] = rows.filter(r => r.st === k).length })
    return c
  }, [rows])

  const usable = rows.length - counts.off
  const rate = usable ? Math.round((usable - counts.empty) / usable * 100) : 0
  const shown = rows.filter(r => filter === 'all' || r.st === filter)
  const sel = rows.find(r => r.id === selId) || null
  const emptyLockers = rows.filter(r => r.st === 'empty')

  async function run(fn, args) {
    setBusy(true); setError('')
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { setError(errText(error.message)); return false }
    await load()
    return true
  }

  async function addRange() {
    const from = Number(range.from), to = Number(range.to || range.from)
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('crm_add_lockers', { p_gym_id: gymId, p_from: from, p_to: to })
    setBusy(false)
    if (error) { setError(errText(error.message)); return }
    setAddOpen(false); setRange({ from: '', to: '' })
    await load()
    if (data === 0) setError('이미 있는 번호라 새로 추가된 칸이 없어요.')
  }

  async function returnLocker() {
    const a = sel.assignment
    if (!confirm(`${sel.number}번 락커를 회수할까요?\n${a.member_name} 회원 배정이 끝나고 빈 칸이 돼요.`)) return
    await run('crm_return_locker', { p_assignment_id: a.id })
  }

  async function moveTo(target) {
    const ok = await run('crm_move_locker', { p_assignment_id: sel.assignment.id, p_new_locker_id: target.id })
    if (ok) { setMoving(false); setSelId(target.id) }
  }

  async function assignPending(p) {
    await run('crm_assign_locker', {
      p_locker_id: sel.id, p_member_id: p.member_id,
      p_start: p.start_date, p_end: p.end_date, p_payment_id: p.payment_id,
    })
  }

  // 빈 칸을 골라 둔 상태면 바로 배정, 아니면 가장 앞 번호의 빈 칸을 먼저 골라 보여 준다
  function pickOrAssign(p) {
    if (sel?.st === 'empty') { assignPending(p); return }
    if (!emptyLockers.length) { setError('빈 칸이 없어요. 락커를 추가하거나 회수한 뒤 배정해 주세요.'); return }
    setFilter('all'); setSelId(emptyLockers[0].id); setMoving(false); setError('')
  }

  function openExtend() {
    const a = sel.assignment
    const member = members.find(m => m.id === a.member_id) || { id: a.member_id, name: a.member_name }
    setExtendFor({ member, assignment: a, number: sel.number })
  }

  return (
    <div className="lk-page">
      <TopbarActions>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => { setAddOpen(true); setError('') }}>
          <CrmIcon name="plus" size={16} stroke={2.4} />락커 추가
        </button>
      </TopbarActions>

      <div className="lk-head">
        <div className="mb-chips" role="group" aria-label="상태">
          {[['all', '전체'], ...Object.entries(STATES).map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <button key={k} type="button" className={`mb-chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k !== 'all' && <span className="lk-dot" style={{ background: STATES[k].dot, borderColor: STATES[k].ring || STATES[k].dot }} />}
              {l} <b style={mono}>{counts[k]}</b>
            </button>
          ))}
        </div>
        <span className="lk-stat" style={mono}>락커 {rows.length}칸 · 사용률 {rate}%</span>
      </div>

      {error && <div className="pause-error" role="alert">{error}</div>}

      <div className="lk-layout">
        <div className="lk-left">
          <section className="lk-board" aria-label="락커 칸">
            {loading ? <div className="rev-empty">불러오는 중…</div>
              : rows.length === 0 ? (
                <div className="rev-empty">아직 락커가 없어요. 오른쪽 위 <b>락커 추가</b>로 번호 범위를 만들어 주세요. (예: 1 ~ 40)</div>
              ) : shown.length === 0 ? <div className="rev-empty">해당하는 칸이 없어요</div>
              : (
                <div className="lk-grid">
                  {shown.map(r => (
                    <button key={r.id} type="button" className={`lk-tile ${STATES[r.st].cls} ${selId === r.id ? 'sel' : ''}`}
                      title={[`${r.number}번`, STATES[r.st].label, r.assignment?.member_name, r.period].filter(Boolean).join(' · ')}
                      aria-label={`${r.number}번 ${STATES[r.st].label}${r.assignment ? ' ' + r.assignment.member_name : ''}`}
                      onClick={() => { setSelId(r.id); setMoving(false); setError('') }}>
                      <span className="lk-tile-no">{r.number}</span>
                      <span className="lk-tile-who">{r.assignment ? r.assignment.member_name : r.st === 'empty' ? '빈 칸' : '고장'}</span>
                      {(r.st === 'soon' || r.st === 'over') && <span className="lk-tile-d">{r.status}</span>}
                    </button>
                  ))}
                </div>
              )}
          </section>

          {pending.length > 0 && (
            <section className="lk-wait" aria-label="칸 배정을 기다리는 결제">
              <div className="lk-wait-head">
                <h2>칸 배정을 기다리는 결제 <span style={mono}>{pending.length}</span></h2>
                <small>대여권은 결제했는데 칸을 아직 안 고른 회원</small>
              </div>
              {pending.map(p => (
                <div key={p.payment_id} className="lk-wait-row">
                  <span style={{ minWidth: 0 }}><b>{p.member_name}</b><small>{p.product_name} · {md(p.end_date)}까지</small></span>
                  <button type="button" className="lk-wait-btn" disabled={busy} onClick={() => pickOrAssign(p)}>
                    {sel?.st === 'empty' ? `${sel.number}번에 배정` : '빈 칸 고르기'}
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="lk-panel" aria-label={sel ? `락커 ${sel.number}번` : '락커 상세'}>
          {!sel ? (
            <div className="rev-empty">칸을 누르면 상세가 보여요</div>
          ) : (
            <>
              <div className="lk-panel-head">
                <span className="lk-panel-no">{sel.number}번</span>
                <span className={`lk-state ${STATES[sel.st].cls}`}>
                  {STATES[sel.st].label}{(sel.st === 'soon' || sel.st === 'over') && sel.status ? ` · ${sel.status}` : ''}
                </span>
              </div>

              {sel.assignment && (
                <>
                  <dl className="lk-info">
                    <dt>회원</dt><dd>{sel.assignment.member_name}</dd>
                    <dt>기간</dt><dd style={mono}>{sel.assignment.start_date.replace(/-/g, '.')} – {sel.assignment.end_date.slice(5).replace('-', '.')}</dd>
                    <dt>결제</dt><dd>{sel.assignment.product_name ? `${sel.assignment.product_name} · ${Number(sel.assignment.amount || 0).toLocaleString()}원` : '결제 연결 없음'}</dd>
                  </dl>
                  {moving ? (
                    <div>
                      <div className="pay-label">옮길 빈 칸 고르기</div>
                      <div className="lk-pick">
                        {emptyLockers.length === 0 && <div className="rev-empty" style={{ gridColumn: '1 / -1' }}>빈 칸이 없어요</div>}
                        {emptyLockers.map(t => (
                          <button key={t.id} type="button" className="lk-pick-btn" disabled={busy} onClick={() => moveTo(t)}>{t.number}</button>
                        ))}
                      </div>
                      <button type="button" className="lk-act" style={{ width: '100%', marginTop: '8px' }} onClick={() => setMoving(false)}>취소</button>
                    </div>
                  ) : (
                    <div className="lk-acts">
                      <button type="button" className="lk-act primary" disabled={busy} onClick={openExtend}>연장 결제</button>
                      <button type="button" className="lk-act" disabled={busy} onClick={() => setMoving(true)}>다른 칸으로 옮기기</button>
                      <button type="button" className="lk-act danger" disabled={busy} onClick={returnLocker}>회수하고 비우기</button>
                    </div>
                  )}
                  <div className="lk-note">기간이 끝나면 칸이 붉은색으로 바뀌어요. 짐을 정리한 뒤 회수하거나 연장해 주세요.</div>
                </>
              )}

              {sel.st === 'empty' && (
                <>
                  <div className="lk-note">
                    {pending.length > 0
                      ? '왼쪽 아래 목록에서 이 칸에 배정할 회원을 고를 수 있어요.'
                      : '비어 있는 칸이에요. 회원 상세의 결제 등록에서 대여권을 고르면 이 칸을 배정할 수 있어요.'}
                  </div>
                  <div className="lk-acts">
                    <button type="button" className="lk-act" disabled={busy}
                      onClick={() => run('crm_set_locker_status', { p_locker_id: sel.id, p_status: 'disabled' })}>
                      사용 불가로 표시 (고장 등)
                    </button>
                  </div>
                </>
              )}

              {sel.st === 'off' && (
                <div className="lk-acts">
                  <button type="button" className="lk-act" disabled={busy}
                    onClick={() => run('crm_set_locker_status', { p_locker_id: sel.id, p_status: 'available' })}>
                    다시 사용 가능으로
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="락커 추가" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            번호 범위로 한 번에 만들어요. 이미 있는 번호는 건너뛰어요.
          </div>
          <div className="crm-range">
            <input className="input" type="number" min={1} placeholder="시작 번호" aria-label="시작 번호"
              value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
            <span>~</span>
            <input className="input" type="number" min={1} placeholder="끝 번호" aria-label="끝 번호"
              value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
          </div>
          {range.from && (
            <div style={{ fontSize: '12px' }}>
              {Number(range.from)}번 ~ {Number(range.to || range.from)}번 ·{' '}
              <b>{Math.max(0, Number(range.to || range.from) - Number(range.from) + 1)}개</b>
            </div>
          )}
          <button className="btn btn-primary" style={{ justifyContent: 'center' }}
            disabled={busy || !range.from} onClick={addRange}>{busy ? '추가 중…' : '추가'}</button>
        </div>
      </Modal>

      <PaymentDialog
        open={!!extendFor}
        member={extendFor?.member}
        gymId={gymId}
        trainers={trainers}
        currentTrainer={currentTrainer}
        lockerExtend={extendFor ? { assignment: extendFor.assignment, number: extendFor.number } : null}
        onClose={() => setExtendFor(null)}
        onPaid={load}
      />
    </div>
  )
}
