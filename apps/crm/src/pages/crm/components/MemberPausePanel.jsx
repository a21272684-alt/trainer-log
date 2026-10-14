import { useState, useEffect, useMemo } from 'react'
import { parseISO, addDays, differenceInCalendarDays, format } from 'date-fns'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { todayStr } from '../lib/ticketDateCalc'

// ── 회원권 정지 (회원 상세 탭) ───────────────────────────────────
// 등록/취소는 RPC(086)가 원자 처리: 정지 N일만큼 정지 시작일 이후에도 유효한
// 기간권을 뒤로 미루고(진행 중 = 만료일만, 대기 중 = 시작·만료 모두), 취소 시 정확히 복구.
// 횟수권(시작·만료일 없음)은 날짜 영향 없음.

const mono = { fontFamily: "'DM Mono', monospace" }
const fmt  = d => format(d, 'yyyy-MM-dd')

const ERRORS = {
  OVERLAP:       '이미 등록된 정지 기간과 겹쳐요.',
  TOO_LONG:      '한 번에 최대 366일까지 정지할 수 있어요.',
  INVALID_RANGE: '종료일이 시작일보다 빠를 수 없어요.',
  PERMISSION_DENIED: '이 회원을 정지할 권한이 없어요.',
  CHANGED_SINCE: '정지 이후 회원권 날짜가 따로 변경돼 자동으로 되돌릴 수 없어요. 결제 내역에서 날짜를 확인해주세요.',
}
const errText = (msg = '') => {
  const key = Object.keys(ERRORS).find(k => msg.includes(k))
  return key ? ERRORS[key] : '처리 중 오류가 발생했어요: ' + msg
}

const daysOf = h => differenceInCalendarDays(parseISO(h.end_date), parseISO(h.start_date)) + 1

// 서버(086)와 같은 규칙으로 미리보기
function previewShifts(tickets, start, end) {
  if (!start || !end || end < start) return []
  const n = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
  return tickets
    .filter(p => p.end_date >= start)
    .map(p => ({
      name:     p.product_name || '회원권',
      queued:   p.start_date >= start,
      oldStart: p.start_date, oldEnd: p.end_date,
      newStart: p.start_date >= start ? fmt(addDays(parseISO(p.start_date), n)) : p.start_date,
      newEnd:   fmt(addDays(parseISO(p.end_date), n)),
    }))
}

export default function MemberPausePanel({ member, payments, onChanged }) {
  const today = todayStr()
  const [holds,    setHolds]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ start: today, end: '', reason: '' })
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => { loadHolds() }, [member.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHolds() {
    setLoading(true)
    const { data, error } = await supabase.rpc('crm_member_pauses', { p_member_id: member.id })
    if (error) setError(errText(error.message))
    setHolds(data || [])
    setLoading(false)
  }

  // 날짜가 있는 활성 기간권만 (횟수권 제외)
  const tickets = useMemo(() => (payments || [])
    .filter(p => (p.status || 'active') === 'active' && p.start_date && p.end_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date)), [payments])

  const current = tickets.find(p => p.start_date <= today && p.end_date >= today)
  const queued  = tickets.filter(p => p.start_date > today)
  const pausedNow = holds.find(h => h.start_date <= today && h.end_date >= today)
  const preview = previewShifts(tickets, form.start, form.end)
  const formDays = form.start && form.end && form.end >= form.start
    ? differenceInCalendarDays(parseISO(form.end), parseISO(form.start)) + 1 : 0

  async function submit() {
    if (!form.start || !form.end) { setError('시작일과 종료일을 입력해주세요.'); return }
    setBusy(true); setError('')
    const { error } = await supabase.rpc('crm_pause_membership', {
      p_member_id: member.id, p_start: form.start, p_end: form.end, p_reason: form.reason || null,
    })
    setBusy(false)
    if (error) { setError(errText(error.message)); return }
    setShowForm(false)
    setForm({ start: today, end: '', reason: '' })
    await Promise.all([loadHolds(), onChanged?.()])
  }

  async function cancel(h) {
    const moved = Array.isArray(h.shifts) ? h.shifts.length : 0
    const msg = moved
      ? `${h.start_date} ~ ${h.end_date} 정지를 취소할까요?\n뒤로 미뤘던 회원권 ${moved}건의 날짜가 원래대로 돌아가요.`
      : `${h.start_date} ~ ${h.end_date} 정지 기록을 삭제할까요?`
    if (!confirm(msg)) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('crm_cancel_pause', { p_hold_id: h.id })
    setBusy(false)
    if (error) { setError(errText(error.message)); return }
    await Promise.all([loadHolds(), onChanged?.()])
  }

  const totalDays = holds.reduce((s, h) => s + daysOf(h), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {pausedNow && (
        <div className="pause-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
          <div style={{ fontSize: '13px' }}>
            <b>회원권 정지 중</b> · {pausedNow.start_date.slice(5).replace('-', '/')} ~ {pausedNow.end_date.slice(5).replace('-', '/')} ({daysOf(pausedNow)}일)
            · {fmt(addDays(parseISO(pausedNow.end_date), 1)).slice(5).replace('-', '/')}부터 다시 이용
          </div>
        </div>
      )}

      <div className="pause-current">
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>진행 중인 회원권</div>
          <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '3px' }}>{current?.product_name || (current ? '회원권' : '없음')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {current && <div style={{ ...mono, fontSize: '12px' }}>{current.start_date} ~ {current.end_date}</div>}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
            {queued.length ? `이후 대기 회원권 ${queued.length}건 (${queued.map(q => q.product_name || '회원권').join(', ')})` : '대기 중인 회원권 없음'}
          </div>
        </div>
      </div>

      {error && <div className="pause-error" role="alert">{error}</div>}

      <div className={`crm-collapse ${showForm ? 'open' : ''}`} inert={!showForm} aria-hidden={!showForm}>
        <div className="crm-collapse-inner">
          <div className="pause-form">
            <div style={{ fontSize: '14px', fontWeight: 700 }}>회원권 정지 등록</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <label className="pause-field">
                <span>시작일</span>
                <input className="input" type="date" value={form.start} max={form.end || undefined}
                  onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
              </label>
              <label className="pause-field">
                <span>종료일</span>
                <input className="input" type="date" value={form.end} min={form.start || undefined}
                  onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </label>
            </div>
            <label className="pause-field">
              <span>사유 (선택)</span>
              <input className="input" type="text" maxLength={100} placeholder="예: 출장, 부상, 여행"
                value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </label>

            {formDays > 0 && (
              <div className="pause-preview">
                <div style={{ fontSize: '12px', fontWeight: 700 }}>{formDays}일 정지하면 이렇게 바뀌어요</div>
                {preview.length === 0 && (
                  <div style={{ fontSize: '12px' }}>이 기간에 해당하는 기간권이 없어 날짜는 바뀌지 않아요. 정지 기록만 남아요.</div>
                )}
                {preview.map((s, i) => (
                  <div key={i} className="pause-preview-row">
                    <span>{s.name}{s.queued ? ' (대기)' : ''}</span>
                    <span style={mono}>
                      {s.queued
                        ? <>{s.oldStart}~ → <b>{s.newStart}~</b></>
                        : <>만료 {s.oldEnd} → <b>{s.newEnd}</b></>}
                    </span>
                  </div>
                ))}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PT 같은 횟수권은 날짜가 바뀌지 않아요. 정지를 취소하면 원래 날짜로 돌아가요.</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }}
                onClick={() => { setShowForm(false); setError('') }}>취소</button>
              <button className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12px' }}
                disabled={busy || !formDays} onClick={submit}>{busy ? '처리 중…' : '정지 등록'}</button>
            </div>
          </div>
        </div>
      </div>

      {!showForm && (
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => { setShowForm(true); setError('') }}>
          + 회원권 정지
        </button>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>정지 이력</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>총 {holds.length}회 · {totalDays}일</span>
        </div>
        {loading ? (
          <div className="rev-empty">불러오는 중…</div>
        ) : holds.length === 0 ? (
          <div className="rev-empty">정지 이력이 없어요</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {holds.map(h => {
              const moved = Array.isArray(h.shifts) ? h.shifts.length : null
              return (
                <div key={h.id} className="pause-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...mono, fontSize: '12px', fontWeight: 700 }}>
                      {h.start_date} ~ {h.end_date} <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({daysOf(h)}일)</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{h.reason || '사유 없음'}</div>
                    <div style={{ fontSize: '11px', marginTop: '3px', color: moved ? '#3F6212' : 'var(--text-dim)' }}>
                      {moved === null
                        ? '트레이너 앱에서 등록 · 날짜 변경 없음'
                        : moved > 0 ? `만료일 +${daysOf(h)}일 · 회원권 ${moved}건 연장` : '해당 기간권 없음 · 날짜 변경 없음'}
                    </div>
                  </div>
                  <button className="pause-cancel" disabled={busy} onClick={() => cancel(h)}>취소</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
