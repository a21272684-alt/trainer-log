import { useState, useEffect, useMemo } from 'react'
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from '../components/CrmModal'
import PaymentDialog from '../components/PaymentDialog'
import { todayStr } from '../lib/ticketDateCalc'

// ── 락커 관리 ───────────────────────────────────────────────────
// 현황판 + 칸 상세. 쓰기는 087 RPC. 만료돼도 자동으로 비우지 않음 → "회수" 를 눌러야 빈 칸.

const mono = { fontFamily: "'DM Mono', monospace" }

const STATES = {
  empty: { label: '빈 칸',       cls: 's-empty', dot: 'transparent', ring: '#9CA3AF' },
  use:   { label: '사용 중',     cls: 's-use',   dot: '#9CC22A' },
  soon:  { label: '만료 임박',   cls: 's-soon',  dot: '#F59E0B' },
  over:  { label: '만료·미회수', cls: 's-over',  dot: '#E5484D' },
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

  function openExtend() {
    const a = sel.assignment
    const member = members.find(m => m.id === a.member_id) || { id: a.member_id, name: a.member_name }
    setExtendFor({ member, assignment: a, number: sel.number })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          락커 {rows.length}개 · 사용률 {rate}%{pending.length > 0 && ` · 칸 배정 대기 ${pending.length}건`}
        </div>
        <button className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12px' }}
          onClick={() => { setAddOpen(true); setError('') }}>+ 락커 추가</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[['all', '전체'], ...Object.entries(STATES).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <button key={k} className={`filter-chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
            {k !== 'all' && <span className="lk-dot" style={{ background: STATES[k].dot, borderColor: STATES[k].ring || STATES[k].dot }} />}
            {l} <span style={{ ...mono, fontSize: '10px', opacity: 0.7 }}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {error && <div className="pause-error" role="alert">{error}</div>}

      <div className="lk-layout">
        <div className="card lk-board">
          {loading ? <div className="rev-empty">불러오는 중…</div>
            : rows.length === 0 ? (
              <div className="rev-empty">
                아직 락커가 없어요. 오른쪽 위 <b>+ 락커 추가</b>로 번호 범위를 만들어주세요. (예: 1 ~ 40)
              </div>
            ) : shown.length === 0 ? <div className="rev-empty">해당하는 칸이 없어요</div>
            : (
              <div className="lk-grid">
                {shown.map(r => (
                  <button key={r.id} type="button" className={`lk-tile ${STATES[r.st].cls} ${selId === r.id ? 'sel' : ''}`}
                    aria-label={`${r.number}번 ${STATES[r.st].label}${r.assignment ? ' ' + r.assignment.member_name : ''}`}
                    onClick={() => { setSelId(r.id); setMoving(false); setError('') }}>
                    <span style={{ ...mono, fontSize: '14px', fontWeight: 700 }}>{r.number}</span>
                    <span className="lk-tile-sub">
                      {r.assignment && <span className="lk-tile-name">{r.assignment.member_name}</span>}
                      {r.period && <span style={{ ...mono, fontSize: '10px' }}>{r.period}</span>}
                      {r.status && <span style={{ ...mono, fontSize: '10px', fontWeight: 700 }}>{r.status}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
        </div>

        <div className="card lk-panel">
          {!sel ? (
            <div className="rev-empty">칸을 누르면 상세가 보여요</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ ...mono, fontSize: '22px', fontWeight: 700 }}>{sel.number}번</span>
                <span className={`lk-badge ${STATES[sel.st].cls}`}>{STATES[sel.st].label}</span>
              </div>

              {sel.assignment && (
                <>
                  <div className="lk-info">
                    <div><span>회원</span><b>{sel.assignment.member_name}</b></div>
                    <div><span>기간</span><span style={mono}>{sel.assignment.start_date} ~ {sel.assignment.end_date}</span></div>
                    <div><span>결제</span><span>{sel.assignment.product_name ? `${sel.assignment.product_name} · ${Number(sel.assignment.amount || 0).toLocaleString()}원` : '결제 연결 없음'}</span></div>
                  </div>
                  {sel.st === 'over' && (
                    <div style={{ fontSize: '12px', color: '#7F1D16' }}>기간이 끝났어요. 짐을 정리한 뒤 회수하거나 연장해주세요.</div>
                  )}
                  {moving ? (
                    <div>
                      <div className="pay-label">옮길 빈 칸 고르기</div>
                      <div className="lk-pick">
                        {emptyLockers.length === 0 && <div className="rev-empty" style={{ gridColumn: '1 / -1' }}>빈 칸이 없어요</div>}
                        {emptyLockers.map(t => (
                          <button key={t.id} type="button" className="lk-pick-btn" disabled={busy} onClick={() => moveTo(t)}>{t.number}</button>
                        ))}
                      </div>
                      <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                        onClick={() => setMoving(false)}>취소</button>
                    </div>
                  ) : (
                    <div className="lk-actions">
                      <button className="btn btn-primary" disabled={busy} onClick={openExtend}>연장 결제</button>
                      <button className="btn btn-secondary" disabled={busy} onClick={() => setMoving(true)}>다른 칸으로 이동</button>
                      <button className="pause-cancel" style={{ padding: '9px' }} disabled={busy} onClick={returnLocker}>회수 (비우기)</button>
                    </div>
                  )}
                </>
              )}

              {sel.st === 'empty' && (
                <>
                  {pending.length > 0 ? (
                    <div>
                      <div className="pay-label">칸 배정을 기다리는 결제</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {pending.map(p => (
                          <div key={p.payment_id} className="lk-pending">
                            <div style={{ minWidth: 0 }}>
                              <b style={{ fontSize: '13px' }}>{p.member_name}</b>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', ...mono }}>{p.product_name} · ~{p.end_date}</div>
                            </div>
                            <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '11px' }}
                              disabled={busy} onClick={() => assignPending(p)}>{sel.number}번 배정</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      비어 있는 칸이에요. 회원 상세 → <b>결제</b>에서 대여권을 고르면 이 칸을 배정할 수 있어요.
                    </div>
                  )}
                  <div className="lk-actions">
                    <button className="btn btn-secondary" disabled={busy}
                      onClick={() => run('crm_set_locker_status', { p_locker_id: sel.id, p_status: 'disabled' })}>
                      사용 불가로 표시 (고장 등)
                    </button>
                  </div>
                </>
              )}

              {sel.st === 'off' && (
                <div className="lk-actions">
                  <button className="btn btn-secondary" disabled={busy}
                    onClick={() => run('crm_set_locker_status', { p_locker_id: sel.id, p_status: 'available' })}>
                    다시 사용 가능으로
                  </button>
                </div>
              )}
            </>
          )}
        </div>
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
