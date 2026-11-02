import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Icon from './Icon'

// 수업 신청 (096) — 트레이너 쪽 화면 2개.
//   BookingSettings: 예약 받기 켜기 · 수업 길이 · 요일별 열린 시간 · 잠금(요청 못 하게 닫은 시간)
//   RequestInbox:    회원 신청 목록 → 승인(시간표에 수업 추가) / 거절
// 시간표(blocks)는 TrainerApp 이 통째로 저장하므로, 승인 시 블록 추가는 onApprove 로 위임한다.

const DAYS = ['월','화','수','목','금','토','일']           // index+1 = ISO 요일
const TIMES = (() => { const o = []; for (let h = 5; h <= 23; h++) for (const m of ['00','30']) o.push(`${String(h).padStart(2,'0')}:${m}`); o.push('24:00'); return o })()
const INK = '#111827'

const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px', padding:'14px 16px', marginBottom:'12px' }
const label = { fontSize:'13px', fontWeight:700, color:INK }
const sub = { fontSize:'11px', color:'var(--text-muted)', marginTop:'2px', lineHeight:1.5 }
const chip = on => ({
  padding:'6px 12px', borderRadius:'999px', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:'inherit',
  border:'1px solid ' + (on ? INK : 'var(--border)'), background: on ? INK : 'var(--surface)', color: on ? '#fff' : 'var(--text-muted)',
})
const sel = { fontSize:'13px', padding:'6px 8px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--surface)', color:'inherit', fontFamily:'inherit' }

const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const isoDow = s => ((parseDate(s).getDay() + 6) % 7) + 1

// 신청 1건이 만들 수업 날짜들 (매주 같은 요일)
export function requestDates(req) {
  const base = parseDate(req.start_date)
  return Array.from({ length: req.weeks || 1 }, (_, k) => { const d = new Date(base); d.setDate(base.getDate() + k * 7); return fmtDate(d) })
}

function Toggle({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)} role="switch" aria-checked={on}
      style={{width:'44px',height:'24px',borderRadius:'12px',cursor:'pointer',position:'relative',flexShrink:0,transition:'background 0.2s',
        background: on ? 'var(--accent)' : 'var(--surface2)', border:'1px solid ' + (on ? 'var(--accent)' : 'var(--border)')}}>
      <div style={{position:'absolute',top:'2px',width:'18px',height:'18px',borderRadius:'50%',transition:'left 0.2s',
        background: on ? INK : 'var(--text-dim)', left: on ? '22px' : '2px'}} />
    </div>
  )
}

function TimeSelect({ value, onChange, min }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={sel}>
      {TIMES.filter(t => !min || t > min).map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

// ─────────────────────────────────────────────
// 예약 받기 설정
// ─────────────────────────────────────────────
export function BookingSettings({ trainerId, showToast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [slot, setSlot] = useState(50)
  const [weekly, setWeekly] = useState({})          // {"1":[["10:00","12:00"]]}
  const [locks, setLocks] = useState([])
  const [adding, setAdding] = useState(null)        // 열린 시간 추가 중인 요일 (1~7)
  const [range, setRange] = useState(['10:00', '12:00'])
  const [lockForm, setLockForm] = useState(null)

  useEffect(() => {
    if (!trainerId) return
    let alive = true
    supabase.from('trainer_booking_settings').select('*').eq('trainer_id', trainerId).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) { setEnabled(data.enabled); setSlot(data.slot_minutes); setWeekly(data.weekly || {}); setLocks(data.locks || []) }
        setLoading(false)
      })
    return () => { alive = false }
  }, [trainerId])

  const touch = fn => (...a) => { fn(...a); setDirty(true) }

  const addRange = touch((day) => {
    const [s, e] = range
    if (e <= s) { showToast('끝 시간이 시작보다 늦어야 해요'); return }
    setWeekly(w => {
      const list = [...(w[day] || []), [s, e]].sort((a, b) => a[0].localeCompare(b[0]))
      return { ...w, [day]: list }
    })
    setAdding(null)
  })
  const removeRange = touch((day, i) => setWeekly(w => ({ ...w, [day]: (w[day] || []).filter((_, j) => j !== i) })))
  const copyMonToWeekdays = touch(() => setWeekly(w => ({ ...w, 2: w[1] || [], 3: w[1] || [], 4: w[1] || [], 5: w[1] || [] })))

  const addLock = touch(() => {
    const f = lockForm
    if (f.end <= f.start) { showToast('끝 시간이 시작보다 늦어야 해요'); return }
    if (f.kind === 'date' && !f.date) { showToast('날짜를 골라 주세요'); return }
    setLocks(l => [...l, {
      id: `${Date.now()}`, weekday: f.kind === 'weekly' ? Number(f.weekday) : null,
      date: f.kind === 'date' ? f.date : null, start: f.start, end: f.end, label: (f.label || '').trim().slice(0, 20),
    }])
    setLockForm(null)
  })
  const removeLock = touch(id => setLocks(l => l.filter(x => x.id !== id)))

  async function save() {
    setSaving(true)
    const today = fmtDate(new Date())
    const keptLocks = locks.filter(l => !l.date || l.date >= today)   // 지난 날짜 잠금은 정리
    const { error } = await supabase.from('trainer_booking_settings').upsert({
      trainer_id: trainerId, enabled, slot_minutes: slot, weekly, locks: keptLocks, updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (error) { showToast('저장하지 못했어요. 잠시 후 다시 시도해 주세요'); return }
    setLocks(keptLocks); setDirty(false)
    showToast(enabled ? '✓ 저장됐어요. 회원이 열린 시간에 신청할 수 있어요' : '✓ 저장됐어요')
  }

  if (loading) return <div style={{...card, textAlign:'center', color:'var(--text-muted)', fontSize:'13px'}}>불러오는 중…</div>

  const openCount = Object.values(weekly).reduce((n, l) => n + (l?.length || 0), 0)

  return (
    <div>
      <div style={{...card, display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', background: enabled ? INK : 'var(--surface)', borderColor: enabled ? INK : 'var(--border)'}}>
        <div>
          <div style={{...label, color: enabled ? '#fff' : INK}}>회원 수업 신청 받기</div>
          <div style={{...sub, color: enabled ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)'}}>
            켜면 회원 앱에 '수업 신청'이 열려요. 아래 열린 시간 중 비어 있는 칸만 보여요.
          </div>
        </div>
        <Toggle on={enabled} onChange={touch(setEnabled)} />
      </div>

      <div style={card}>
        <div style={label}>수업 길이</div>
        <div style={sub}>회원이 고르는 한 칸의 길이예요</div>
        <div style={{display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'10px'}}>
          {[30, 40, 50, 60, 90].map(m => <button key={m} type="button" onClick={touch(() => setSlot(m))} style={chip(slot === m)}>{m}분</button>)}
        </div>
      </div>

      <div style={card}>
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px'}}>
          <div>
            <div style={label}>매주 열린 시간</div>
            <div style={sub}>이미 시간표에 있는 수업·일정과 잠금 시간은 자동으로 빠져요</div>
          </div>
          {(weekly[1]?.length > 0) && (
            <button type="button" onClick={copyMonToWeekdays} style={{...chip(false), fontSize:'11px', padding:'4px 10px', flexShrink:0}}>월요일 → 평일 복사</button>
          )}
        </div>
        <div style={{marginTop:'10px'}}>
          {DAYS.map((d, i) => {
            const day = i + 1
            const list = weekly[day] || []
            return (
              <div key={day} style={{display:'flex', alignItems:'flex-start', gap:'10px', padding:'9px 0', borderTop: i ? '1px solid var(--border)' : 'none'}}>
                <div style={{width:'22px', fontSize:'13px', fontWeight:800, color: day >= 6 ? '#BE123C' : INK, paddingTop:'5px'}}>{d}</div>
                <div style={{flex:1, display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center'}}>
                  {list.map(([s, e], j) => (
                    <span key={j} style={{display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 6px 5px 10px', borderRadius:'8px', background:'#ECFCCB', color:'#3F6212', fontSize:'12px', fontWeight:700}}>
                      {s}–{e}
                      <button type="button" aria-label="삭제" onClick={() => removeRange(day, j)} style={{border:'none', background:'none', color:'#3F6212', cursor:'pointer', display:'flex', padding:'0 2px'}}><Icon name="x" size={13} /></button>
                    </span>
                  ))}
                  {adding === day ? (
                    <span style={{display:'inline-flex', alignItems:'center', gap:'4px', flexWrap:'wrap'}}>
                      <TimeSelect value={range[0]} onChange={v => setRange(r => [v, r[1] > v ? r[1] : TIMES[TIMES.indexOf(v) + 2] || '24:00'])} />
                      <span style={{fontSize:'12px'}}>–</span>
                      <TimeSelect value={range[1]} min={range[0]} onChange={v => setRange(r => [r[0], v])} />
                      <button type="button" onClick={() => addRange(day)} className="btn btn-primary btn-sm" style={{fontSize:'12px'}}>추가</button>
                      <button type="button" onClick={() => setAdding(null)} className="btn btn-ghost btn-sm" style={{fontSize:'12px'}}>취소</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => {
                      // 이어서 추가: 마지막 범위 끝부터 2시간
                      const last = list[list.length - 1]?.[1]
                      const s = last && last < '24:00' && TIMES.includes(last) ? last : '10:00'
                      setAdding(day); setRange([s, TIMES[TIMES.indexOf(s) + 4] || '24:00'])
                    }}
                      style={{border:'1px dashed var(--border)', background:'none', borderRadius:'8px', padding:'5px 10px', fontSize:'12px', color:'var(--text-muted)', cursor:'pointer', fontFamily:'inherit'}}>
                      + 시간
                    </button>
                  )}
                  {!list.length && adding !== day && <span style={{fontSize:'11px', color:'var(--text-dim)'}}>신청 안 받음</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{display:'flex', alignItems:'center', gap:'6px'}}><Icon name="lock" size={15} /><div style={label}>잠금</div></div>
        <div style={sub}>열린 시간 안이라도 회원이 신청하지 못하게 닫아 둬요 (점심·개인 운동 등)</div>
        <div style={{marginTop:'10px', display:'flex', flexDirection:'column', gap:'6px'}}>
          {locks.map(l => (
            <div key={l.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', padding:'8px 10px', borderRadius:'10px', background:'var(--surface2)'}}>
              <div style={{fontSize:'12px', fontWeight:700, color:INK}}>
                {l.date ? `${Number(l.date.slice(5,7))}/${Number(l.date.slice(8,10))} (${DAYS[isoDow(l.date)-1]})` : `매주 ${DAYS[l.weekday-1]}`} · {l.start}–{l.end}
                {l.label && <span style={{fontWeight:500, color:'var(--text-muted)', marginLeft:'6px'}}>{l.label}</span>}
              </div>
              <button type="button" aria-label="잠금 삭제" onClick={() => removeLock(l.id)} style={{border:'none', background:'none', color:'var(--text-muted)', cursor:'pointer', display:'flex'}}><Icon name="x" size={15} /></button>
            </div>
          ))}
          {!locks.length && !lockForm && <div style={{fontSize:'11px', color:'var(--text-dim)'}}>잠근 시간이 없어요</div>}
        </div>
        {lockForm ? (
          <div style={{marginTop:'10px', padding:'12px', borderRadius:'10px', border:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:'8px'}}>
            <div style={{display:'flex', gap:'6px'}}>
              <button type="button" onClick={() => setLockForm(f => ({...f, kind:'weekly'}))} style={chip(lockForm.kind === 'weekly')}>매주 반복</button>
              <button type="button" onClick={() => setLockForm(f => ({...f, kind:'date'}))} style={chip(lockForm.kind === 'date')}>특정 날짜</button>
            </div>
            <div style={{display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap'}}>
              {lockForm.kind === 'weekly'
                ? <select value={lockForm.weekday} onChange={e => setLockForm(f => ({...f, weekday:e.target.value}))} style={sel}>{DAYS.map((d, i) => <option key={d} value={i+1}>{d}요일</option>)}</select>
                : <input type="date" value={lockForm.date} min={fmtDate(new Date())} onChange={e => setLockForm(f => ({...f, date:e.target.value}))} style={sel} />}
              <TimeSelect value={lockForm.start} onChange={v => setLockForm(f => ({...f, start:v}))} />
              <span style={{fontSize:'12px'}}>–</span>
              <TimeSelect value={lockForm.end} min={lockForm.start} onChange={v => setLockForm(f => ({...f, end:v}))} />
            </div>
            <input value={lockForm.label} maxLength={20} placeholder="메모 (선택) 예: 점심" onChange={e => setLockForm(f => ({...f, label:e.target.value}))} style={{...sel, width:'100%', boxSizing:'border-box'}} />
            <div style={{display:'flex', gap:'6px', justifyContent:'flex-end'}}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLockForm(null)} style={{fontSize:'12px'}}>취소</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={addLock} style={{fontSize:'12px'}}>잠금 추가</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setLockForm({ kind:'weekly', weekday:1, date:'', start:'12:00', end:'13:00', label:'' })}
            style={{marginTop:'10px', width:'100%', border:'1px dashed var(--border)', background:'none', borderRadius:'10px', padding:'9px', fontSize:'12px', fontWeight:600, color:'var(--text-muted)', cursor:'pointer', fontFamily:'inherit'}}>
            + 잠글 시간 추가
          </button>
        )}
      </div>

      <button type="button" onClick={save} disabled={saving || !dirty} className="btn btn-primary"
        style={{width:'100%', padding:'14px', fontSize:'14px', fontWeight:800, opacity: (saving || !dirty) ? 0.5 : 1, marginBottom:'8px'}}>
        {saving ? '저장 중…' : dirty ? '저장하기' : '저장됨'}
      </button>
      {enabled && openCount === 0 && (
        <div style={{fontSize:'12px', color:'#92400E', background:'#FEF3C7', borderRadius:'10px', padding:'10px 12px'}}>
          열린 시간이 없어서 회원에게는 신청할 수 있는 시간이 보이지 않아요.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 요청함
// ─────────────────────────────────────────────
const STATUS = {
  approved:  { t:'승인',     bg:'#ECFCCB', fg:'#3F6212' },
  declined:  { t:'거절',     bg:'#FEE2E2', fg:'#991B1B' },
  cancelled: { t:'회원 취소', bg:'var(--surface2)', fg:'var(--text-muted)' },
}

function reqLabel(r) {
  const d = parseDate(r.start_date)
  const day = DAYS[isoDow(r.start_date) - 1]
  return r.weeks > 1
    ? `매주 ${day} ${r.start_time}–${r.end_time}`
    : `${d.getMonth()+1}/${d.getDate()} (${day}) ${r.start_time}–${r.end_time}`
}

export function RequestInbox({ trainerId, members, blocks, onApprove, onChanged, showToast }) {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    if (!trainerId) return
    const since = new Date(Date.now() - 14 * 864e5).toISOString()
    const { data, error } = await supabase.from('schedule_requests').select('*')
      .eq('trainer_id', trainerId)
      .or(`status.eq.pending,created_at.gte.${since}`)
      .order('created_at', { ascending: false }).limit(50)
    if (error) { showToast('요청을 불러오지 못했어요'); setRows([]); return }
    setRows(data || [])
  }, [trainerId])

  useEffect(() => { load() }, [load])

  const memberOf = id => members.find(m => m.id === id)

  function conflicts(r) {
    const dates = new Set(requestDates(r))
    return blocks.filter(b => !b.cancelled && dates.has(b.date) && b.start < r.end_time && b.end > r.start_time)
  }

  async function decide(r, status) {
    const clash = status === 'approved' ? conflicts(r) : []
    if (clash.length && !window.confirm(`시간표에 겹치는 일정이 ${clash.length}개 있어요. 그래도 승인할까요?`)) return
    if (status === 'declined' && !window.confirm('이 신청을 거절할까요?')) return
    setBusy(r.id)
    const { error } = await supabase.rpc('trainer_decide_request', { p_id: r.id, p_status: status })
    setBusy(null)
    if (error) { showToast(error.message || '처리하지 못했어요'); load(); onChanged?.(); return }
    if (status === 'approved') {
      // 회원이 시간표에서 쓰던 색을 이어서 사용
      const color = [...blocks].reverse().find(b => b.memberId === r.member_id && b.color)?.color || 'green'
      const base = Date.now()
      const newBlocks = requestDates(r).map((date, i) => ({
        id: `${base}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        date, start: r.start_time, end: r.end_time, type: 'lesson', color,
        memo: r.note ? `회원 신청: ${r.note}` : '회원 신청', memberId: r.member_id, title: null,
      }))
      onApprove(newBlocks, r.member_id)
      showToast(`✓ 승인했어요. 시간표에 ${newBlocks.length}회 추가됐어요`)
    } else {
      showToast('거절했어요')
    }
    load(); onChanged?.()
  }

  if (rows === null) return <div style={{...card, textAlign:'center', color:'var(--text-muted)', fontSize:'13px'}}>불러오는 중…</div>

  const pending = rows.filter(r => r.status === 'pending')
  const done = rows.filter(r => r.status !== 'pending').slice(0, 10)

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
        <div style={{fontSize:'13px', fontWeight:800, color:INK}}>승인 대기 {pending.length}건</div>
        <button type="button" onClick={load} className="btn btn-ghost btn-sm" style={{fontSize:'12px', display:'flex', alignItems:'center', gap:'4px'}}><Icon name="refresh" size={13} />새로고침</button>
      </div>

      {!pending.length && (
        <div style={{...card, textAlign:'center', padding:'28px 16px'}}>
          <div style={{display:'flex', justifyContent:'center', color:'var(--text-dim)', marginBottom:'8px'}}><Icon name="calendarCheck" size={28} /></div>
          <div style={{fontSize:'13px', fontWeight:700, color:INK}}>새 신청이 없어요</div>
          <div style={sub}>회원이 앱에서 수업을 신청하면 여기에 모여요</div>
        </div>
      )}

      {pending.map(r => {
        const m = memberOf(r.member_id)
        const remain = m ? Math.max(0, (m.total_sessions || 0) - (m.done_sessions || 0)) : null
        const clash = conflicts(r)
        const past = r.start_date < fmtDate(new Date())
        return (
          <div key={r.id} style={card}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px'}}>
              <div style={{fontSize:'15px', fontWeight:800, color:INK}}>{m?.name || '회원'}</div>
              <div style={{display:'flex', gap:'4px', flexWrap:'wrap', justifyContent:'flex-end'}}>
                {r.weeks > 1 && <span style={{fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'999px', background:'#ECFCCB', color:'#3F6212'}}>매주 {r.weeks}회</span>}
                {remain !== null && <span style={{fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'999px', background:'var(--surface2)', color:'var(--text-muted)'}}>잔여 {remain}회</span>}
              </div>
            </div>
            <div style={{fontSize:'14px', fontWeight:700, color:INK, marginTop:'6px', display:'flex', alignItems:'center', gap:'6px'}}>
              <Icon name="clock" size={15} />{reqLabel(r)}
            </div>
            {r.weeks > 1 && <div style={{...sub, marginTop:'4px'}}>{requestDates(r).map(d => `${Number(d.slice(5,7))}/${Number(d.slice(8,10))}`).join(' · ')}</div>}
            {r.note && <div style={{fontSize:'12px', color:INK, background:'var(--surface2)', borderRadius:'8px', padding:'8px 10px', marginTop:'8px', lineHeight:1.5}}>"{r.note}"</div>}
            {clash.length > 0 && (
              <div style={{fontSize:'12px', fontWeight:600, color:'#92400E', background:'#FEF3C7', borderRadius:'8px', padding:'7px 10px', marginTop:'8px', display:'flex', alignItems:'center', gap:'6px'}}>
                <Icon name="alert" size={14} />시간표에 겹치는 일정 {clash.length}개
              </div>
            )}
            {past && <div style={{...sub, color:'#991B1B', marginTop:'6px'}}>시작일이 지난 신청이에요</div>}
            <div style={{display:'flex', gap:'8px', marginTop:'12px'}}>
              <button type="button" disabled={busy === r.id} onClick={() => decide(r, 'declined')} className="btn btn-ghost" style={{flex:1, fontSize:'13px'}}>거절</button>
              <button type="button" disabled={busy === r.id} onClick={() => decide(r, 'approved')} className="btn btn-primary" style={{flex:2, fontSize:'13px', fontWeight:800}}>
                {busy === r.id ? '처리 중…' : '승인하고 시간표에 넣기'}
              </button>
            </div>
          </div>
        )
      })}

      {done.length > 0 && (
        <>
          <div style={{fontSize:'12px', fontWeight:700, color:'var(--text-muted)', margin:'18px 0 8px'}}>최근 2주 처리 내역</div>
          {done.map(r => {
            const s = STATUS[r.status]
            return (
              <div key={r.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', padding:'10px 12px', borderRadius:'10px', border:'1px solid var(--border)', marginBottom:'6px', background:'var(--surface)'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:'13px', fontWeight:700, color:INK}}>{memberOf(r.member_id)?.name || '회원'}</div>
                  <div style={{fontSize:'11px', color:'var(--text-muted)'}}>{reqLabel(r)}{r.weeks > 1 ? ` · ${r.weeks}회` : ''}</div>
                </div>
                <span style={{fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'999px', background:s.bg, color:s.fg, flexShrink:0}}>{s.t}</span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
