import { useState, useEffect, useMemo } from 'react'
import { addDays, format, parseISO, startOfWeek, startOfMonth } from 'date-fns'
import * as XLSX from 'xlsx'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from '../components/CrmModal'
import CrmIcon from '../components/CrmIcon'
import TopbarActions from '../components/TopbarActions'
import { todayStr } from '../lib/ticketDateCalc'
import { LONG_ABSENT_DAYS } from '../lib/memberFilters'

// ── 출석 관리 ───────────────────────────────────────────────────
// 회원 출석: 날짜별 입장 기록(089·090·103 RPC), 직접 출석, 기록 취소(직원 누구나), 오래 안 온 회원(14일).
// 직원 근태: 대표 또는 '근태 관리' 권한자만 — 태블릿 출퇴근 기록 조회·직접 입력·수정·삭제.

const mono = { fontVariantNumeric: 'tabular-nums' }
const ABSENT_DAYS = LONG_ABSENT_DAYS
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const hm  = iso => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const dur = min => `${Math.floor(min / 60)}시간 ${String(min % 60).padStart(2, '0')}분`
const md  = d => { const [, m, day] = String(d).slice(0, 10).split('-').map(Number); return `${m}월 ${day}일` }

const TAG = {
  ok:       { label: '입장',        cls: 'ok' },
  staff:    { label: '직원 처리',   cls: 'staff' },
  rejected: { label: '거부 · 만료', cls: 'rej' },
}

function tagOf(r) {
  if (r.result === 'rejected_expired') return TAG.rejected
  return r.source === 'staff' ? TAG.staff : TAG.ok
}

// 회원권 칸 — '이용권 · 4회 남음' / '이용권 · 11월 5일 만료'
function passText(r) {
  let t
  if (r.result === 'rejected_expired') t = [r.pass || '회원권', r.pass_end ? `${md(r.pass_end)} 만료` : '만료'].join(' · ')
  else if (r.remain > 0) t = [r.pass, `${r.remain}회 남음`].filter(Boolean).join(' · ')
  else if (r.pass_end) t = [r.pass, `${md(r.pass_end)}까지`].filter(Boolean).join(' · ')
  else t = r.pass || r.membership || '—'
  return r.source === 'staff' && r.by ? `${t} · 처리 ${r.by}` : t
}

function absentSub(a) {
  const tail = a.remain > 0 ? `${a.remain}회 남음` : a.membership_end ? `${md(a.membership_end)}까지` : ''
  const text = [a.pass, tail].filter(Boolean).join(' · ')
  return text || (a.last_visit ? `마지막 방문 ${md(a.last_visit)}` : '방문 기록 없음')
}

// ── 회원 출석 ───────────────────────────────────────────────────
function MemberAttendance({ gymId, members, head, onOpenMember }) {
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
  const isToday = date === todayStr()
  const okCount = day?.ok_count ?? 0
  const diff    = okCount - (day?.last_week_ok ?? 0)
  const hours   = (day?.hourly || []).slice(6, 24)   // 06시~23시
  const maxH    = Math.max(1, ...hours)
  const peak    = hours.indexOf(Math.max(...hours, 0))
  const nowH    = new Date().getHours()
  const d       = parseISO(date)
  const memberById = id => members.find(m => m.id === id)

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
    <div className="att">
      <TopbarActions>
        <button type="button" className="btn btn-primary btn-lg"
          onClick={() => { setManual(true); setMq(''); setMResult(null) }}>
          <CrmIcon name="plus" size={16} stroke={2.4} />직접 출석
        </button>
      </TopbarActions>

      <div className="att-head">
        {head}
        <div className="att-date">
          <button type="button" className="sc-icon-btn" aria-label="이전 날" onClick={() => setDate(format(addDays(d, -1), 'yyyy-MM-dd'))}>‹</button>
          <span className="att-date-text">{d.getMonth() + 1}월 {d.getDate()}일 {WEEKDAY[d.getDay()]}요일</span>
          <button type="button" className="sc-icon-btn" aria-label="다음 날" disabled={isToday} onClick={() => setDate(format(addDays(d, 1), 'yyyy-MM-dd'))}>›</button>
          {isToday
            ? <span className="att-today">오늘</span>
            : <button type="button" className="sc-text-btn" onClick={() => setDate(todayStr())}>오늘로</button>}
        </div>
      </div>

      <div className="rev-kpis att-kpis">
        <div className="card rev-kpi">
          <div className="rev-kpi-label">{isToday ? '오늘' : '이날'} 입장</div>
          <div className="rev-kpi-value" style={mono}>{okCount}<small>명</small></div>
          <div className="rev-kpi-sub">
            {diff === 0 ? '지난주 같은 요일과 같아요'
              : <span style={{ fontWeight: 700, color: diff > 0 ? '#3F6212' : '#BE123C' }}>지난주 같은 요일보다 {Math.abs(diff)}명 {diff > 0 ? '많아요' : '적어요'}</span>}
          </div>
        </div>
        <div className="card rev-kpi rose">
          <div className="rev-kpi-label">입장 거부 · 회원권 만료</div>
          <div className="rev-kpi-value" style={mono}>{day?.rejected_count ?? 0}<small>명</small></div>
          <div className="rev-kpi-sub">재등록 안내가 필요해요</div>
        </div>
        <div className="card rev-kpi">
          <div className="rev-kpi-label">{ABSENT_DAYS}일 넘게 안 온 회원</div>
          <div className="rev-kpi-value" style={mono}>{absent.length}<small>명</small></div>
          <div className="rev-kpi-sub">회원권은 남아 있는데 안 와요</div>
        </div>
      </div>

      <div className="lk-layout">
        <section className="att-log" aria-label="입장 기록">
          <div className="att-toolbar">
            <div className="mb-chips" role="group" aria-label="결과">
              {[['all', '전체'], ['ok', '입장'], ['rej', '거부'], ['staff', '직원 처리']].map(([k, l]) => (
                <button key={k} type="button" className={`mb-chip ${k === 'rej' ? 'danger' : ''} ${filter === k ? 'on' : ''}`}
                  aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {counts[k]}</button>
              ))}
            </div>
            <label className="mb-search">
              <CrmIcon name="search" size={15} stroke={2.2} />
              <input type="search" aria-label="회원 이름 검색" placeholder="회원 이름" value={query} onChange={e => setQuery(e.target.value)} />
            </label>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="att-table">
              <thead><tr><th>시간</th><th>회원</th><th>결과</th><th>회원권</th><th className="r">처리</th></tr></thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={5} className="rev-empty">기록이 없어요</td></tr>}
                {visible.map(r => {
                  const t = tagOf(r)
                  const rej = r.result === 'rejected_expired'
                  const mem = memberById(r.member_id)
                  return (
                    <tr key={r.id} className={`${rej && !r.canceled ? 'rej' : ''} ${r.canceled ? 'canceled' : ''}`}>
                      <td className="t" style={mono}>{hm(r.at)}</td>
                      <td>
                        <span className="att-who">
                          <span className={`att-av ${rej ? 'rej' : ''}`} aria-hidden="true">{(r.name || '?')[0]}</span>
                          <b className={r.canceled ? 'strike' : ''}>{r.name}</b>
                        </span>
                      </td>
                      <td><span className={`att-tag ${t.cls}`}>{t.label}</span></td>
                      <td className="p">{passText(r)}</td>
                      <td className="r">
                        {r.canceled
                          ? <span className="att-canceled">취소됨{r.canceled_by ? ` · ${r.canceled_by}` : ''}</span>
                          : (
                            <span className="att-acts">
                              {rej && mem && <button type="button" className="att-btn strong" onClick={() => onOpenMember?.(mem)}>회원 보기</button>}
                              <button type="button" className="att-btn" onClick={() => cancel(r)}>취소</button>
                            </span>
                          )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="att-side">
          <section className="card" aria-label="시간대별 입장">
            <div className="att-card-head">
              <h2>시간대별 입장</h2>
              {okCount > 0 && <span>가장 붐빈 때 {String(peak + 6).padStart(2, '0')}시 · {hours[peak]}명</span>}
            </div>
            <div className="att-hours" role="img"
              aria-label={`시간대별 입장 수: ${hours.map((v, i) => `${i + 6}시 ${v}명`).join(', ')}`}>
              {hours.map((v, i) => {
                const hh = i + 6
                const future = isToday && hh > nowH
                const hot = isToday ? hh === nowH : (i === peak && v > 0)
                return (
                  <div key={hh} title={future ? `${hh}시 · 아직` : `${hh}시 · ${v}명${isToday && hot ? ' (지금)' : ''}`} className="att-hour">
                    <div className={future ? 'future' : hot ? 'hot' : ''} style={future ? undefined : { height: `${v / maxH * 100}%` }} />
                  </div>
                )
              })}
            </div>
            <div className="rev-ticks" style={mono}><span>06시</span><span>09시</span><span>12시</span><span>15시</span><span>18시</span><span>21시</span><span>23시</span></div>
          </section>

          <section className="card" aria-label="오래 안 온 회원">
            <div className="att-card-head">
              <h2>오래 안 온 회원</h2>
              <span>{ABSENT_DAYS}일 이상 · 회원권 남음</span>
            </div>
            {absent.length === 0 ? <div className="rev-empty">없어요</div> : (
              <div className="att-absent-list">
                {absent.map(a => {
                  const mem = memberById(a.member_id)
                  return (
                    <button key={a.member_id} type="button" className="att-absent" disabled={!mem} onClick={() => mem && onOpenMember?.(mem)}>
                      <span style={{ minWidth: 0 }}>
                        <b>{a.name}</b>
                        <small>{absentSub(a)}</small>
                      </span>
                      <em style={mono}>{a.days != null ? `${a.days}일째` : '방문 없음'}</em>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="att-foot">태블릿 입장과 PT 출석 중 최근 날짜 기준이에요. 도입 초기엔 기록이 쌓일 때까지 많이 잡힐 수 있어요.</p>
          </section>
        </div>
      </div>

      <Modal open={manual} onClose={() => setManual(false)} title="직접 출석" maxWidth="440px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            휴대폰을 안 가져왔거나 태블릿이 안 될 때 직원이 대신 입장 처리해요. 회원권 확인은 태블릿과 똑같이 해요.
          </div>
          <input className="input" type="search" placeholder="이름 또는 전화번호" aria-label="회원 검색" autoFocus
            value={mq} onChange={e => { setMq(e.target.value); setMResult(null) }} />
          {mResult && (
            <div className={mResult.error || mResult.status === 'expired' ? 'pause-error' : 'pause-current'} role="status" style={{ display: 'block' }}>
              {mResult.error ? `처리 실패: ${mResult.error}`
                : mResult.status === 'ok' ? `${mResult.name} 회원 입장 처리됐어요${mResult.pause_ended ? ` (정지 ${mResult.paused_days}일 반영 후 해제)` : ''}`
                : mResult.status === 'already' ? `${mResult.name} 회원은 오늘 이미 입장했어요 (${hm(mResult.first_at)})`
                : mResult.status === 'expired' ? `${mResult.name} 회원은 회원권이 만료돼 입장할 수 없어요 (거부로 기록됨)`
                : mResult.status === 'paused' ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>{mResult.name} 회원은 정지 중이에요 ({mResult.hold.start_date.slice(5)} ~ {mResult.hold.end_date.slice(5)})</span>
                    <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '12px', flexShrink: 0 }} disabled={busy}
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
function StaffAttendance({ gymId, gymName, head }) {
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

  if (error) return <div className="att">{head && <div className="att-head">{head}</div>}<div className="pause-error">{error}</div></div>
  const staff = data?.staff || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <TopbarActions>
        <button type="button" className="btn btn-secondary btn-lg" onClick={() => openEdit(null)}><CrmIcon name="plus" size={16} stroke={2.4} />근태 직접 입력</button>
        <button type="button" className="btn btn-secondary btn-lg" disabled={!data} onClick={exportExcel}><CrmIcon name="download" size={16} />엑셀 내보내기</button>
      </TopbarActions>

      <div className="att-head">
        {head}
        <div className="rev-seg">
          {[['today', '오늘'], ['week', '이번 주'], ['month', '이번 달']].map(([k, l]) => (
            <button key={k} className={range === k ? 'on' : ''} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>
          ))}
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

export default function AttendanceTab({ gymId, gymName, members = [], canManageAttendance, onOpenKiosk, onOpenMember }) {
  const [view, setView] = useState('member')

  const head = canManageAttendance ? (
    <div className="rev-seg" role="tablist" aria-label="출석 관리 보기">
      <button role="tab" aria-selected={view === 'member'} className={view === 'member' ? 'on' : ''} onClick={() => setView('member')}>회원 출석</button>
      <button role="tab" aria-selected={view === 'staff'} className={view === 'staff' ? 'on' : ''} onClick={() => setView('staff')}>직원 근태</button>
    </div>
  ) : <span />

  return (
    <>
      <TopbarActions>
        <button type="button" className="btn btn-secondary btn-lg" onClick={onOpenKiosk}>
          <CrmIcon name="tablet" size={16} stroke={2.1} />출석 모드 켜기
        </button>
      </TopbarActions>
      {view === 'staff' && canManageAttendance
        ? <StaffAttendance gymId={gymId} gymName={gymName} head={head} />
        : <MemberAttendance gymId={gymId} members={members} head={head} onOpenMember={onOpenMember} />}
    </>
  )
}
