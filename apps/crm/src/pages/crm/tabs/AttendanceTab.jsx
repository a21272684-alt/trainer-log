import { useState, useEffect, useMemo } from 'react'
import { addDays, format, parseISO, startOfWeek, startOfMonth } from 'date-fns'
import * as XLSX from 'xlsx'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from '../components/CrmModal'
import { todayStr } from '../lib/ticketDateCalc'

// ── 출석 관리 ───────────────────────────────────────────────────
// 회원 출석: 날짜별 입장 기록(089·090 RPC), 수동 출석, 기록 취소(직원 누구나), 장기 미출석(14일).
// 직원 근태: 대표 또는 '근태 관리' 권한자만 — 태블릿 출퇴근 기록 조회·직접 입력·수정·삭제.

const mono = { fontFamily: "'DM Mono', monospace" }
const ABSENT_DAYS = 14
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const hm  = iso => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const dur = min => `${Math.floor(min / 60)}시간 ${String(min % 60).padStart(2, '0')}분`

const TAG = {
  ok:      { label: '입장',        cls: 's-use' },
  staff:   { label: '직원 처리',   cls: 's-off' },
  rejected:{ label: '거부 · 만료', cls: 's-over' },
}

function tagOf(r) {
  if (r.result === 'rejected_expired') return TAG.rejected
  return r.source === 'staff' ? TAG.staff : TAG.ok
}

// ── 회원 출석 ───────────────────────────────────────────────────
function MemberAttendance({ gymId, members }) {
  const [date,    setDate]    = useState(todayStr())
  const [day,     setDay]     = useState(null)
  const [absent,  setAbsent]  = useState([])
  const [filter,  setFilter]  = useState('all')
  const [query,   setQuery]   = useState('')
  const [manual,  setManual]  = useState(false)
  const [mq,      setMq]      = useState('')
  const [mResult, setMResult] = useState(null)
  const [busy,    setBusy]    = useState(false)

  useEffect(() => { loadDay() }, [gymId, date]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.rpc('crm_long_absent', { p_gym_id: gymId, p_days: ABSENT_DAYS }).then(({ data }) => setAbsent(data || []))
  }, [gymId])

  async function loadDay() {
    const { data } = await supabase.rpc('crm_attendance_day', { p_gym_id: gymId, p_date: date })
    setDay(data || { rows: [], hourly: [] })
  }

  const rows = day?.rows || []
  const visible = rows
    .filter(r => filter === 'all'
      || (filter === 'ok' && r.result === 'ok')
      || (filter === 'rej' && r.result === 'rejected_expired')
      || (filter === 'staff' && r.source === 'staff'))
    .filter(r => !query.trim() || r.name.includes(query.trim()))

  const counts = {
    all: rows.length,
    ok: rows.filter(r => r.result === 'ok').length,
    rej: rows.filter(r => r.result === 'rejected_expired').length,
    staff: rows.filter(r => r.source === 'staff').length,
  }
  const okCount = day?.ok_count ?? 0
  const diff = okCount - (day?.last_week_ok ?? 0)
  const hours = (day?.hourly || []).slice(6, 24)
  const maxH = Math.max(1, ...hours)
  const peak = hours.indexOf(Math.max(...hours, 0))
  const d = parseISO(date)

  async function cancel(r) {
    if (!confirm(`${hm(r.at)} ${r.name} 회원의 ${r.result === 'ok' ? '입장' : '거부'} 기록을 취소할까요?`)) return
    const { error } = await supabase.rpc('crm_cancel_checkin', { p_checkin_id: r.id })
    if (error) { alert('취소 실패: ' + error.message); return }
    loadDay()
  }

  const mMatches = useMemo(() => {
    const q = mq.trim()
    if (!q) return []
    return members.filter(m => m.name?.includes(q) || (m.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 8)
  }, [mq, members])

  async function manualCheckin(m, endPauseHoldId = null) {
    setBusy(true)
    const { data, error } = endPauseHoldId
      ? await supabase.rpc('crm_kiosk_end_pause', { p_gym_id: gymId, p_hold_id: endPauseHoldId })
      : await supabase.rpc('crm_kiosk_checkin', { p_gym_id: gymId, p_member_id: m.id, p_source: 'staff' })
    setBusy(false)
    if (error) { setMResult({ member: m, error: error.message }); return }
    setMResult({ member: m, ...data })
    if (data.status !== 'paused') loadDay()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div className="att-datenav">
          <button type="button" aria-label="이전 날" onClick={() => setDate(format(addDays(d, -1), 'yyyy-MM-dd'))}>◀</button>
          <span style={mono}>{date} ({WEEKDAY[d.getDay()]})</span>
          <button type="button" aria-label="다음 날" disabled={date >= todayStr()} onClick={() => setDate(format(addDays(d, 1), 'yyyy-MM-dd'))}>▶</button>
          {date !== todayStr() && <button type="button" onClick={() => setDate(todayStr())}>오늘</button>}
        </div>
        <button className="btn btn-secondary" style={{ fontSize: '12px' }}
          onClick={() => { setManual(true); setMq(''); setMResult(null) }}>+ 수동 출석</button>
      </div>

      <div className="rev-kpis">
        <div className="card rev-kpi">
          <div className="rev-kpi-label">{date === todayStr() ? '오늘' : '이날'} 입장</div>
          <div className="rev-kpi-value" style={mono}>{okCount}명</div>
          <div className="rev-kpi-sub">
            {diff === 0 ? '지난주 같은 요일과 같음'
              : <><span style={{ fontWeight: 700, color: diff > 0 ? '#3F6212' : '#B42318' }}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}명</span> 지난주 같은 요일 대비</>}
          </div>
        </div>
        <div className="card rev-kpi">
          <div className="rev-kpi-label">입장 거부 (회원권 만료)</div>
          <div className="rev-kpi-value" style={{ ...mono, color: '#B42318' }}>{day?.rejected_count ?? 0}명</div>
          <div className="rev-kpi-sub">재등록 안내가 필요한 회원</div>
        </div>
        <div className="card rev-kpi">
          <div className="rev-kpi-label">장기 미출석 ({ABSENT_DAYS}일 이상)</div>
          <div className="rev-kpi-value" style={{ ...mono, color: '#C2410C' }}>{absent.length}명</div>
          <div className="rev-kpi-sub">회원권은 남아 있는데 안 오는 회원</div>
        </div>
      </div>

      <div className="lk-layout">
        <div className="card" style={{ flex: '999 1 560px', minWidth: 0, padding: 0, overflow: 'hidden' }}>
          <div className="att-toolbar">
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[['all', '전체'], ['ok', '입장'], ['rej', '거부'], ['staff', '직원 처리']].map(([k, l]) => (
                <button key={k} className={`filter-chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                  {l} <span style={{ ...mono, fontSize: '10px', opacity: 0.7 }}>{counts[k]}</span>
                </button>
              ))}
            </div>
            <input className="input" style={{ maxWidth: '200px' }} type="search" aria-label="회원 이름 검색"
              placeholder="회원 이름 검색" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>시간</th><th>회원</th><th>결과</th><th>회원권</th><th>처리</th><th></th></tr></thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={6} className="rev-empty">기록이 없어요</td></tr>}
                {visible.map(r => {
                  const t = tagOf(r)
                  return (
                    <tr key={r.id} style={{ opacity: r.canceled ? 0.5 : 1 }}>
                      <td style={{ ...mono, color: 'var(--text-muted)' }}>{hm(r.at)}</td>
                      <td style={{ fontWeight: 700, textDecoration: r.canceled ? 'line-through' : 'none' }}>{r.name}</td>
                      <td><span className={`lk-badge ${t.cls}`}>{t.label}</span></td>
                      <td style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)' }}>{r.membership || '—'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.source === 'staff' ? (r.by || '직원') : '태블릿'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r.canceled
                          ? <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>취소됨{r.canceled_by ? ` · ${r.canceled_by}` : ''}</span>
                          : <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '11px' }} onClick={() => cancel(r)}>취소</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ flex: '1 1 280px', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="card">
            <div className="rev-card-title">시간대별 입장</div>
            <div className="att-hours">
              {hours.map((v, i) => (
                <div key={i} title={`${i + 6}시 ${v}명`} className="att-hour">
                  <div style={{ height: `${v / maxH * 100}%`, background: i === peak && v > 0 ? '#4D6A00' : '#6B8E0E' }} />
                </div>
              ))}
            </div>
            <div className="rev-ticks" style={mono}><span>06시</span><span>12시</span><span>18시</span><span>23시</span></div>
            {okCount > 0 && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              가장 붐빈 시간: <b style={{ color: 'var(--text)' }}>{peak + 6}시 ({hours[peak]}명)</b></div>}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <span className="rev-card-title" style={{ margin: 0 }}>장기 미출석</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ABSENT_DAYS}일 이상 · 회원권 유효</span>
            </div>
            {absent.length === 0 ? <div className="rev-empty">없어요</div> : (
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {absent.map(a => (
                  <div key={a.member_id} className="att-absent">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{a.name}</div>
                      <div style={{ ...mono, fontSize: '11px', color: 'var(--text-muted)' }}>
                        {a.last_visit ? `마지막 ${a.last_visit.slice(5).replace('-', '/')}` : '방문 기록 없음'}
                        {a.membership_end ? ` · 만료 ${a.membership_end.slice(5).replace('-', '/')}` : ' · PT 회원'}
                      </div>
                    </div>
                    <span style={{ ...mono, fontSize: '12px', fontWeight: 700, color: '#C2410C' }}>{a.days != null ? `${a.days}일` : '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              태블릿 입장과 PT 출석 중 최근 날짜 기준. 도입 초기엔 기록이 쌓일 때까지 많이 잡힐 수 있어요.
            </div>
          </div>
        </div>
      </div>

      <Modal open={manual} onClose={() => setManual(false)} title="수동 출석" maxWidth="440px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            휴대폰을 안 가져왔거나 태블릿이 안 될 때 직원이 대신 입장 처리해요. 회원권 확인은 태블릿과 똑같이 해요.
          </div>
          <input className="input" type="search" placeholder="이름 또는 전화번호" aria-label="회원 검색" autoFocus
            value={mq} onChange={e => { setMq(e.target.value); setMResult(null) }} />
          {mResult && (
            <div className={mResult.error || mResult.status === 'expired' ? 'pause-error' : 'pause-current'} role="status" style={{ display: 'block' }}>
              {mResult.error ? `처리 실패: ${mResult.error}`
                : mResult.status === 'ok' ? `✓ ${mResult.name} 입장 처리됐어요${mResult.pause_ended ? ` (정지 ${mResult.paused_days}일 반영 후 해제)` : ''}`
                : mResult.status === 'already' ? `${mResult.name} 회원은 오늘 이미 입장했어요 (${hm(mResult.first_at)})`
                : mResult.status === 'expired' ? `${mResult.name} 회원은 회원권이 만료돼 입장할 수 없어요 (거부로 기록됨)`
                : mResult.status === 'paused' ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>{mResult.name} 회원은 정지 중이에요 ({mResult.hold.start_date.slice(5)} ~ {mResult.hold.end_date.slice(5)})</span>
                    <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '11px', flexShrink: 0 }} disabled={busy}
                      onClick={() => manualCheckin(mResult.member, mResult.hold.id)}>정지 풀고 입장</button>
                  </div>
                ) : null}
            </div>
          )}
          {mMatches.map(m => (
            <button key={m.id} type="button" className="att-pick" disabled={busy} onClick={() => manualCheckin(m)}>
              <b>{m.name}</b><span style={{ ...mono, color: 'var(--text-muted)' }}>{m.phone || ''}</span>
            </button>
          ))}
          {mq.trim() && mMatches.length === 0 && <div className="rev-empty">일치하는 회원이 없어요</div>}
        </div>
      </Modal>
    </div>
  )
}

// ── 직원 근태 ───────────────────────────────────────────────────
function StaffAttendance({ gymId, gymName }) {
  const [range,  setRange]  = useState('week')
  const [data,   setData]   = useState(null)
  const [error,  setError]  = useState('')
  const [edit,   setEdit]   = useState(null)   // { id?, trainer_id, date, in, out }
  const [busy,   setBusy]   = useState(false)

  const today = parseISO(todayStr())
  const from = format(range === 'today' ? today : range === 'week' ? startOfWeek(today, { weekStartsOn: 1 }) : startOfMonth(today), 'yyyy-MM-dd')
  const to = todayStr()

  useEffect(() => { load() }, [gymId, range]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data, error } = await supabase.rpc('crm_staff_attendance', { p_gym_id: gymId, p_from: from, p_to: to })
    if (error) { setError(error.message.includes('PERMISSION_DENIED') ? '근태 관리 권한이 없어요.' : error.message); return }
    setError(''); setData(data)
  }

  const toLocal = iso => iso ? { date: format(new Date(iso), 'yyyy-MM-dd'), time: format(new Date(iso), 'HH:mm') } : { date: '', time: '' }

  function openEdit(r) {
    if (!r) { setEdit({ id: null, trainer_id: data?.staff?.[0]?.trainer_id || '', date: todayStr(), in: '09:00', out: '' }); return }
    const a = toLocal(r.clock_in), b = toLocal(r.clock_out)
    setEdit({ id: r.id, trainer_id: r.trainer_id, date: a.date, in: a.time, out: b.time, outDate: b.date })
  }

  async function save() {
    if (!edit.trainer_id || !edit.date || !edit.in) { alert('직원·날짜·출근 시간을 입력해주세요.'); return }
    const clockIn = new Date(`${edit.date}T${edit.in}:00`)
    let clockOut = null
    if (edit.out) {
      clockOut = new Date(`${edit.outDate || edit.date}T${edit.out}:00`)
      if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 86400000)   // 자정 넘김
    }
    setBusy(true)
    const { error } = await supabase.rpc('crm_staff_attendance_save', {
      p_gym_id: gymId, p_id: edit.id, p_trainer_id: edit.trainer_id,
      p_clock_in: clockIn.toISOString(), p_clock_out: clockOut ? clockOut.toISOString() : null,
    })
    setBusy(false)
    if (error) { alert('저장 실패: ' + error.message); return }
    setEdit(null); load()
  }

  async function remove() {
    if (!confirm('이 근태 기록을 삭제할까요?')) return
    setBusy(true)
    const { error } = await supabase.rpc('crm_staff_attendance_delete', { p_gym_id: gymId, p_id: edit.id })
    setBusy(false)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setEdit(null); load()
  }

  function exportExcel() {
    const rows = (data?.rows || []).map(r => {
      const mins = r.clock_out ? Math.floor((new Date(r.clock_out) - new Date(r.clock_in)) / 60000) : null
      return [format(new Date(r.clock_in), 'yyyy-MM-dd'), r.name, hm(r.clock_in), r.clock_out ? hm(r.clock_out) : '', mins != null ? dur(mins) : '', r.source === 'manual' ? `직접 입력 (${r.edited_by || ''})` : r.edited_by ? `태블릿 · ${r.edited_by} 수정` : '태블릿']
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['날짜', '직원', '출근', '퇴근', '근무 시간', '기록'], ...rows]), '근태')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['직원', '근무 시간', '출근 일수'],
      ...(data?.staff || []).map(s => [s.name, dur(s.minutes), s.days])]), '직원별 합계')
    XLSX.writeFile(wb, `근태_${(gymName || '센터').replace(/\s+/g, '')}_${from}_${to}.xlsx`)
  }

  if (error) return <div className="pause-error">{error}</div>
  const staff = data?.staff || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div className="rev-seg">
          {[['today', '오늘'], ['week', '이번 주'], ['month', '이번 달']].map(([k, l]) => (
            <button key={k} className={range === k ? 'on' : ''} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={() => openEdit(null)}>+ 근태 직접 입력</button>
          <button className="btn btn-secondary" style={{ fontSize: '12px' }} disabled={!data} onClick={exportExcel}>엑셀 내보내기</button>
        </div>
      </div>

      <div className="att-staff-grid">
        {staff.map(s => (
          <div key={s.trainer_id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <b style={{ fontSize: '14px' }}>{s.name}</b>
              <span className={`lk-badge ${s.working ? 's-use' : 's-off'}`}>{s.working ? '근무 중' : '근무 외'}</span>
            </div>
            <div style={{ ...mono, fontSize: '20px', fontWeight: 700, marginTop: '8px' }}>{dur(s.minutes)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {s.days}일 출근{!s.has_phone && ' · 전화번호 없음(태블릿 불가)'}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>날짜</th><th>직원</th><th>출근</th><th>퇴근</th><th style={{ textAlign: 'right' }}>근무 시간</th><th>기록</th><th></th></tr></thead>
          <tbody>
            {(data?.rows || []).length === 0 && <tr><td colSpan={7} className="rev-empty">기록이 없어요</td></tr>}
            {(data?.rows || []).map(r => {
              const mins = r.clock_out ? Math.floor((new Date(r.clock_out) - new Date(r.clock_in)) / 60000) : null
              return (
                <tr key={r.id}>
                  <td style={mono}>{format(new Date(r.clock_in), 'MM/dd')}</td>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td style={mono}>{hm(r.clock_in)}</td>
                  <td style={mono}>
                    {r.clock_out ? hm(r.clock_out) : r.missing_out
                      ? <span className="lk-badge s-soon">퇴근 미기록</span>
                      : <span style={{ color: 'var(--text-muted)' }}>근무 중</span>}
                  </td>
                  <td style={{ ...mono, textAlign: 'right' }}>{mins != null ? dur(mins) : '—'}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {r.source === 'manual' ? `직접 입력${r.edited_by ? ` · ${r.edited_by}` : ''}` : r.edited_by ? `태블릿 · ${r.edited_by} 수정` : '태블릿'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '11px' }} onClick={() => openEdit(r)}>수정</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        대표와 '근태 관리' 권한이 있는 직원에게만 보여요. 수정하면 누가 고쳤는지 함께 남아요.
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '근태 수정' : '근태 직접 입력'} maxWidth="400px">
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="pause-field"><span>직원</span>
              <select className="input" value={edit.trainer_id} onChange={e => setEdit(v => ({ ...v, trainer_id: e.target.value }))}>
                {staff.map(s => <option key={s.trainer_id} value={s.trainer_id}>{s.name}</option>)}
              </select>
            </label>
            <label className="pause-field"><span>날짜</span>
              <input className="input" type="date" value={edit.date} max={todayStr()} onChange={e => setEdit(v => ({ ...v, date: e.target.value, outDate: '' }))} />
            </label>
            <div className="crm-range">
              <label className="pause-field" style={{ flex: 1 }}><span>출근</span>
                <input className="input" type="time" value={edit.in} onChange={e => setEdit(v => ({ ...v, in: e.target.value }))} /></label>
              <label className="pause-field" style={{ flex: 1 }}><span>퇴근 (비우면 근무 중)</span>
                <input className="input" type="time" value={edit.out} onChange={e => setEdit(v => ({ ...v, out: e.target.value, outDate: '' }))} /></label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              {edit.id ? <button className="pause-cancel" disabled={busy} onClick={remove}>삭제</button> : <span />}
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default function AttendanceTab({ gymId, gymName, members = [], canManageAttendance, onOpenKiosk }) {
  const [view, setView] = useState('member')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        {canManageAttendance ? (
          <div className="rev-seg" role="tablist" aria-label="출석 관리 보기">
            <button role="tab" aria-selected={view === 'member'} className={view === 'member' ? 'on' : ''} onClick={() => setView('member')}>회원 출석</button>
            <button role="tab" aria-selected={view === 'staff'} className={view === 'staff' ? 'on' : ''} onClick={() => setView('staff')}>직원 근태</button>
          </div>
        ) : <span />}
        <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={onOpenKiosk}>📲 출석 모드</button>
      </div>
      {view === 'staff' && canManageAttendance
        ? <StaffAttendance gymId={gymId} gymName={gymName} />
        : <MemberAttendance gymId={gymId} members={members} />}
    </div>
  )
}
