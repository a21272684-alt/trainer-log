import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Icon from '../../components/Icon'

// 회원 '수업 신청' 탭 (096).
// 트레이너가 열어 둔 시간 중 빈 칸만 서버(get_open_slots)에서 받아 보여 준다 — 다른 회원 정보는 오지 않음.
// 신청 → 트레이너 승인 대기 → 승인되면 트레이너 시간표에 수업으로 들어감.

const DAYS = ['월','화','수','목','금','토','일']
const INK = '#111827'
const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const md = s => { const d = parseDate(s); return `${d.getMonth()+1}/${d.getDate()}` }
const dow = s => DAYS[(parseDate(s).getDay() + 6) % 7]

function mondayOf(offsetWeeks) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  return d
}

const STATUS = {
  pending:   { t:'승인 대기', bg:'#FEF3C7', fg:'#92400E' },
  approved:  { t:'확정',     bg:'#ECFCCB', fg:'#3F6212' },
  declined:  { t:'거절됨',   bg:'#FEE2E2', fg:'#991B1B' },
  cancelled: { t:'취소함',   bg:'var(--m-surface2)', fg:'var(--m-text-muted)' },
}

const card = { background:'var(--m-surface)', border:'1px solid var(--m-border)', borderRadius:'14px', padding:'14px 16px', marginBottom:'12px' }

export default function MemberBooking({ info, showToast }) {
  const [weekOff, setWeekOff] = useState(0)
  const [slots, setSlots] = useState(null)          // [{slot_date,start_time,end_time}]
  const [day, setDay] = useState(null)
  const [pick, setPick] = useState(null)            // 선택한 slot
  const [weeks, setWeeks] = useState(1)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [mine, setMine] = useState([])

  const remaining = info?.remaining ?? 0
  const mon = useMemo(() => mondayOf(weekOff), [weekOff])
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return fmtDate(d) }), [mon])

  const loadSlots = useCallback(async () => {
    setSlots(null)
    const { data, error } = await supabase.rpc('get_open_slots', { p_week_start: fmtDate(mon) })
    if (error) { showToast('빈 시간을 불러오지 못했어요'); setSlots([]); return }
    setSlots(data || [])
  }, [mon])

  const loadMine = useCallback(async () => {
    const { data } = await supabase.rpc('my_schedule_requests')
    setMine(data || [])
  }, [])

  useEffect(() => { loadSlots() }, [loadSlots])
  useEffect(() => { loadMine() }, [loadMine])

  // 주가 바뀌거나 목록이 새로 오면 첫 빈 날을 자동 선택
  useEffect(() => {
    if (!slots) return
    setPick(null)
    setDay(d => (d && weekDates.includes(d) && slots.some(s => s.slot_date === d)) ? d : (slots[0]?.slot_date || null))
  }, [slots])

  const byDay = useMemo(() => {
    const m = {}
    for (const s of slots || []) (m[s.slot_date] ||= []).push(s)
    return m
  }, [slots])

  const weekOptions = [1, 2, 4, 8].filter(n => n === 1 || n <= remaining)

  async function submit() {
    if (!pick) return
    setSending(true)
    const { error } = await supabase.rpc('request_schedule', {
      p_date: pick.slot_date, p_start: pick.start_time, p_weeks: weeks, p_note: note.trim() || null,
    })
    setSending(false)
    if (error) { showToast(error.message || '신청하지 못했어요'); loadSlots(); return }
    showToast('✓ 신청했어요. 트레이너가 확인하면 확정돼요')
    setPick(null); setWeeks(1); setNote('')
    loadSlots(); loadMine()
  }

  async function cancel(r) {
    if (!window.confirm('이 신청을 취소할까요?')) return
    const { error } = await supabase.rpc('cancel_schedule_request', { p_id: r.id })
    if (error) { showToast(error.message || '취소하지 못했어요'); loadMine(); return }
    showToast('신청을 취소했어요')
    loadMine(); loadSlots()
  }

  const daySlots = day ? (byDay[day] || []) : []
  const pendingCount = mine.filter(r => r.status === 'pending').length

  return (
    <div className="m-page">
      {/* 트레이너 · 잔여 */}
      <div style={{...card, background:INK, borderColor:INK, color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px'}}>
        <div>
          <div style={{fontSize:'12px', color:'rgba(255,255,255,0.65)'}}>{info?.trainer_name ? `${info.trainer_name} 트레이너` : '담당 트레이너'}</div>
          <div style={{fontSize:'16px', fontWeight:800, marginTop:'2px'}}>원하는 수업 시간을 신청하세요</div>
        </div>
        <div style={{textAlign:'right', flexShrink:0}}>
          <div style={{fontSize:'11px', color:'rgba(255,255,255,0.65)'}}>잔여</div>
          <div style={{fontSize:'20px', fontWeight:900, color:'var(--m-accent)'}}>{remaining}<span style={{fontSize:'12px', fontWeight:700, marginLeft:'1px'}}>회</span></div>
        </div>
      </div>

      {remaining <= 0 ? (
        <div style={{...card, textAlign:'center', padding:'24px 16px'}}>
          <div style={{fontSize:'14px', fontWeight:700}}>남은 수업 횟수가 없어요</div>
          <div style={{fontSize:'12px', color:'var(--m-text-muted)', marginTop:'4px'}}>재등록 후 신청할 수 있어요. 트레이너에게 문의해 주세요.</div>
        </div>
      ) : (
        <>
          {/* 주 이동 */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
            <button type="button" aria-label="이전 주" disabled={weekOff === 0} onClick={() => setWeekOff(w => w - 1)}
              style={{width:'36px', height:'36px', borderRadius:'10px', border:'1px solid var(--m-border)', background:'var(--m-surface)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', opacity: weekOff === 0 ? 0.35 : 1, color:INK}}>
              <Icon name="chevronLeft" size={18} />
            </button>
            <div style={{fontSize:'14px', fontWeight:800}}>
              {weekOff === 0 ? '이번 주' : weekOff === 1 ? '다음 주' : `${weekOff}주 뒤`}
              <span style={{fontSize:'12px', fontWeight:600, color:'var(--m-text-muted)', marginLeft:'6px'}}>{md(weekDates[0])} – {md(weekDates[6])}</span>
            </div>
            <button type="button" aria-label="다음 주" disabled={weekOff >= 7} onClick={() => setWeekOff(w => w + 1)}
              style={{width:'36px', height:'36px', borderRadius:'10px', border:'1px solid var(--m-border)', background:'var(--m-surface)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', opacity: weekOff >= 7 ? 0.35 : 1, color:INK}}>
              <Icon name="chevronRight" size={18} />
            </button>
          </div>

          {/* 요일 */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'4px', marginBottom:'12px'}}>
            {weekDates.map((d, i) => {
              const n = byDay[d]?.length || 0
              const on = day === d
              return (
                <button key={d} type="button" disabled={!n} onClick={() => { setDay(d); setPick(null) }}
                  style={{padding:'8px 0 7px', borderRadius:'12px', border:'1px solid ' + (on ? INK : 'var(--m-border)'), cursor: n ? 'pointer' : 'default', fontFamily:'inherit',
                    background: on ? INK : 'var(--m-surface)', color: on ? '#fff' : (n ? INK : 'var(--m-text-dim)'), opacity: n ? 1 : 0.55}}>
                  <div style={{fontSize:'11px', fontWeight:600, color: on ? 'rgba(255,255,255,0.7)' : (i >= 5 ? '#BE123C' : 'var(--m-text-muted)')}}>{DAYS[i]}</div>
                  <div style={{fontSize:'15px', fontWeight:800, marginTop:'2px'}}>{parseDate(d).getDate()}</div>
                  <div style={{width:'5px', height:'5px', borderRadius:'50%', margin:'4px auto 0', background: n ? (on ? 'var(--m-accent)' : '#4D7C0F') : 'transparent'}} />
                </button>
              )
            })}
          </div>

          {/* 시간 */}
          <div style={card}>
            {slots === null ? (
              <div style={{textAlign:'center', fontSize:'13px', color:'var(--m-text-muted)', padding:'12px 0'}}>빈 시간을 찾는 중…</div>
            ) : !slots.length ? (
              <div style={{textAlign:'center', padding:'14px 0'}}>
                <div style={{display:'flex', justifyContent:'center', color:'var(--m-text-dim)', marginBottom:'6px'}}><Icon name="calendar" size={26} /></div>
                <div style={{fontSize:'13px', fontWeight:700}}>이 주에는 신청할 수 있는 시간이 없어요</div>
                <div style={{fontSize:'12px', color:'var(--m-text-muted)', marginTop:'2px'}}>다음 주를 확인해 보세요</div>
              </div>
            ) : (
              <>
                <div style={{fontSize:'13px', fontWeight:800, marginBottom:'10px'}}>{day ? `${md(day)} (${dow(day)}) 빈 시간` : '날짜를 골라 주세요'}</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'6px'}}>
                  {daySlots.map(s => {
                    const on = pick && pick.slot_date === s.slot_date && pick.start_time === s.start_time
                    return (
                      <button key={s.start_time} type="button" onClick={() => setPick(on ? null : s)}
                        style={{padding:'11px 0', borderRadius:'10px', fontFamily:'inherit', cursor:'pointer', fontSize:'14px', fontWeight:800,
                          border:'1.5px solid ' + (on ? INK : 'var(--m-border)'), background: on ? 'var(--m-accent)' : 'var(--m-surface)', color:INK}}>
                        {s.start_time}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* 신청 */}
          {pick && (
            <div style={{...card, borderColor:INK}}>
              <div style={{fontSize:'15px', fontWeight:800}}>
                {weeks > 1 ? `매주 ${dow(pick.slot_date)}요일` : `${md(pick.slot_date)} (${dow(pick.slot_date)})`} {pick.start_time}–{pick.end_time}
              </div>
              <div style={{fontSize:'12px', fontWeight:700, color:'var(--m-text-muted)', margin:'12px 0 6px'}}>반복</div>
              <div style={{display:'flex', gap:'6px', flexWrap:'wrap'}}>
                {weekOptions.map(n => (
                  <button key={n} type="button" onClick={() => setWeeks(n)}
                    style={{padding:'7px 12px', borderRadius:'999px', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                      border:'1px solid ' + (weeks === n ? INK : 'var(--m-border)'), background: weeks === n ? INK : 'var(--m-surface)', color: weeks === n ? '#fff' : 'var(--m-text-muted)'}}>
                    {n === 1 ? '이번 한 번' : `매주 · ${n}주`}
                  </button>
                ))}
              </div>
              {weeks > 1 && (
                <div style={{fontSize:'11px', color:'var(--m-text-muted)', marginTop:'6px', lineHeight:1.5}}>
                  {Array.from({ length: weeks }, (_, k) => { const d = parseDate(pick.slot_date); d.setDate(d.getDate() + k * 7); return `${d.getMonth()+1}/${d.getDate()}` }).join(' · ')} · 잔여 {remaining}회 중 {weeks}회
                </div>
              )}
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={200} rows={2}
                placeholder="트레이너에게 한마디 (선택)" style={{width:'100%', boxSizing:'border-box', marginTop:'12px', fontSize:'13px', resize:'none'}} />
              <button type="button" onClick={submit} disabled={sending}
                style={{width:'100%', marginTop:'10px', padding:'14px', borderRadius:'12px', border:'none', background:'var(--m-accent)', color:INK, fontSize:'15px', fontWeight:900, cursor:'pointer', fontFamily:'inherit', opacity: sending ? 0.6 : 1}}>
                {sending ? '신청 중…' : weeks > 1 ? `${weeks}회 신청하기` : '신청하기'}
              </button>
              <div style={{fontSize:'11px', color:'var(--m-text-dim)', textAlign:'center', marginTop:'6px'}}>트레이너가 확인하면 확정돼요</div>
            </div>
          )}
        </>
      )}

      {/* 신청 현황 */}
      {mine.length > 0 && (
        <>
          <div style={{fontSize:'13px', fontWeight:800, margin:'18px 0 8px', display:'flex', alignItems:'center', gap:'6px'}}>
            신청 현황{pendingCount > 0 && <span style={{fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'999px', background:'#FEF3C7', color:'#92400E'}}>대기 {pendingCount}</span>}
          </div>
          {mine.map(r => {
            const s = STATUS[r.status] || STATUS.pending
            return (
              <div key={r.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', padding:'12px 14px', borderRadius:'12px', border:'1px solid var(--m-border)', background:'var(--m-surface)', marginBottom:'6px'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:'13px', fontWeight:800}}>
                    {r.weeks > 1 ? `매주 ${dow(r.start_date)} ${r.start_time}` : `${md(r.start_date)} (${dow(r.start_date)}) ${r.start_time}`}
                  </div>
                  <div style={{fontSize:'11px', color:'var(--m-text-muted)', marginTop:'2px'}}>
                    {r.weeks > 1 ? `${md(r.start_date)}부터 ${r.weeks}회` : `${r.start_time}–${r.end_time}`}
                  </div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'6px', flexShrink:0}}>
                  <span style={{fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'999px', background:s.bg, color:s.fg}}>{s.t}</span>
                  {r.status === 'pending' && (
                    <button type="button" onClick={() => cancel(r)} style={{border:'none', background:'none', fontSize:'12px', color:'var(--m-text-muted)', textDecoration:'underline', cursor:'pointer', fontFamily:'inherit', padding:'2px'}}>취소</button>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
