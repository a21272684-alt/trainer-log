import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'

const CLASS_TYPES = { pt:'PT', group:'그룹', pilates:'필라테스', yoga:'요가', other:'기타' }
const COLORS = ['blue','green','purple','yellow','red']
const COLOR_MAP = {
  blue:   { bg:'rgba(96,165,250,0.15)',  border:'rgba(96,165,250,0.5)',  dot:'#60a5fa' },
  green:  { bg:'rgba(74,222,128,0.15)',  border:'rgba(74,222,128,0.5)',  dot:'#4ade80' },
  purple: { bg:'rgba(167,139,250,0.15)', border:'rgba(167,139,250,0.5)', dot:'#a78bfa' },
  yellow: { bg:'rgba(250,204,21,0.15)',  border:'rgba(250,204,21,0.5)',  dot:'#facc15' },
  red:    { bg:'rgba(248,113,113,0.15)', border:'rgba(248,113,113,0.5)', dot:'#f87171' },
}

const pad = n => String(n).padStart(2,'0')
const toLocal = d => {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export default function ScheduleTab({ gymId, trainers, members }) {
  const showToast = useToast()
  const [schedules,  setSchedules]  = useState([])
  const [bookings,   setBookings]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [selected,   setSelected]   = useState(null)  // 선택된 일정 (상세 모달)
  const [viewMode,   setViewMode]   = useState('week') // week | list

  // 현재 주 월요일
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=일, 1=월...
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  const [weekStart, setWeekStart] = useState(monday)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const [form, setForm] = useState({
    trainer_id: '', class_type: 'pt', title: '', description: '',
    start_at: '', end_at: '', max_capacity: 1, color: 'blue',
  })

  useEffect(() => { loadSchedules() }, [gymId, weekStart])

  async function loadSchedules() {
    if (!gymId) return
    setLoading(true)
    const rangeStart = weekDays[0].toISOString()
    const rangeEnd   = new Date(weekDays[6].setHours(23,59,59)).toISOString()

    const [schedRes, bookRes] = await Promise.all([
      supabase.from('class_schedules').select('*')
        .eq('gym_id', gymId).gte('start_at', rangeStart).lte('start_at', rangeEnd)
        .order('start_at'),
      supabase.from('class_bookings').select('*, members(name)')
        .eq('gym_id', gymId),
    ])
    setSchedules(schedRes.data || [])
    setBookings(bookRes.data || [])
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title || !form.start_at || !form.end_at) { showToast('제목, 시작/종료 시간을 입력해주세요'); return }
    const { error } = await supabase.from('class_schedules').insert({
      gym_id: gymId, trainer_id: form.trainer_id || null,
      class_type: form.class_type, title: form.title, description: form.description,
      start_at: new Date(form.start_at).toISOString(), end_at: new Date(form.end_at).toISOString(),
      max_capacity: Number(form.max_capacity), color: form.color,
    })
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 수업 일정 등록 완료')
    setShowForm(false)
    setForm({ trainer_id:'', class_type:'pt', title:'', description:'', start_at:'', end_at:'', max_capacity:1, color:'blue' })
    loadSchedules()
  }

  async function handleCancel(id) {
    const reason = prompt('취소 사유를 입력하세요 (선택)')
    await supabase.from('class_schedules').update({ is_cancelled: true, cancel_reason: reason || '' }).eq('id', id)
    showToast('✓ 수업 취소 처리됨')
    setSelected(null)
    loadSchedules()
  }

  async function handleBook(scheduleId, memberId) {
    const { error } = await supabase.from('class_bookings').insert({
      schedule_id: scheduleId, member_id: memberId, gym_id: gymId, status: 'confirmed'
    })
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 예약 완료')
    loadSchedules()
  }

  async function handleCancelBooking(bookingId) {
    await supabase.from('class_bookings').update({ status: 'cancelled' }).eq('id', bookingId)
    showToast('✓ 예약 취소')
    loadSchedules()
  }

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d) }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d) }

  const DAYS = ['월','화','수','목','금','토','일']

  const schedulesForDay = (day) => {
    const ds = day.toDateString()
    return schedules.filter(s => new Date(s.start_at).toDateString() === ds)
  }

  const bookingsForSchedule = (scheduleId) =>
    bookings.filter(b => b.schedule_id === scheduleId && b.status !== 'cancelled')

  const trainerName = id => trainers.find(t => t.id === id)?.name ?? '—'

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <button onClick={prevWeek} className="btn btn-secondary" style={{ padding:'5px 10px' }}>‹</button>
          <span style={{ fontWeight:700, fontSize:'14px' }}>
            {weekDays[0].getMonth()+1}/{weekDays[0].getDate()} ~ {weekDays[6].getMonth()+1}/{weekDays[6].getDate()}
          </span>
          <button onClick={nextWeek} className="btn btn-secondary" style={{ padding:'5px 10px' }}>›</button>
          <button className="btn btn-secondary" style={{ padding:'5px 10px', fontSize:'11px' }} onClick={() => setWeekStart(monday)}>오늘</button>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          {['week','list'].map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{ padding:'5px 12px', borderRadius:'6px', border:'1px solid', fontSize:'11px', fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                background: viewMode===m ? 'var(--accent)' : 'var(--surface2)',
                color: viewMode===m ? '#0a0a0a' : 'var(--text-muted)',
                borderColor: viewMode===m ? 'var(--accent)' : 'var(--border)' }}
            >{m==='week' ? '주간' : '목록'}</button>
          ))}
          <button className="btn btn-primary" style={{ padding:'5px 14px', fontSize:'12px' }} onClick={() => setShowForm(v=>!v)}>+ 수업 등록</button>
        </div>
      </div>

      {/* 수업 등록 폼 */}
      {showForm && (
        <div className="card" style={{ marginBottom:'16px' }}>
          <div className="card-title">수업 일정 등록</div>
          <form onSubmit={handleCreate}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'8px' }}>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>수업 종류</div>
                <select className="input" value={form.class_type} onChange={e => setForm(v=>({...v,class_type:e.target.value}))}>
                  {Object.entries(CLASS_TYPES).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>담당 트레이너</div>
                <select className="input" value={form.trainer_id} onChange={e => setForm(v=>({...v,trainer_id:e.target.value}))}>
                  <option value="">전체</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>최대 정원</div>
                <input className="input" type="number" min={1} value={form.max_capacity} onChange={e => setForm(v=>({...v,max_capacity:e.target.value}))} />
              </div>
            </div>
            <input className="input" placeholder="수업 제목" value={form.title} onChange={e => setForm(v=>({...v,title:e.target.value}))} style={{ marginBottom:'8px' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>시작 시간</div>
                <input className="input" type="datetime-local" value={form.start_at} onChange={e => setForm(v=>({...v,start_at:e.target.value}))} />
              </div>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>종료 시간</div>
                <input className="input" type="datetime-local" value={form.end_at} onChange={e => setForm(v=>({...v,end_at:e.target.value}))} />
              </div>
            </div>
            <div style={{ display:'flex', gap:'6px', marginBottom:'12px' }}>
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(v=>({...v,color:c}))}
                  style={{ width:'24px', height:'24px', borderRadius:'50%', border: form.color===c ? '3px solid white' : '2px solid transparent', background: COLOR_MAP[c].dot, cursor:'pointer' }} />
              ))}
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button type="button" className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowForm(false)}>취소</button>
              <button type="submit" className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>등록</button>
            </div>
          </form>
        </div>
      )}

      {/* 주간 뷰 */}
      {viewMode === 'week' && (
        <div style={{ display:'grid', gridTemplateColumns:`repeat(7, 1fr)`, gap:'8px' }}>
          {weekDays.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString()
            const daySchedules = schedulesForDay(day)
            return (
              <div key={i}>
                <div style={{ textAlign:'center', padding:'6px 0', fontSize:'11px', fontWeight:600,
                  color: isToday ? 'var(--accent)' : i >= 5 ? 'var(--red)' : 'var(--text-muted)',
                  borderBottom:`2px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`, marginBottom:'8px' }}>
                  {DAYS[i]} <span style={{ display:'block', fontSize:'14px', fontWeight:700 }}>{day.getDate()}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'4px', minHeight:'120px' }}>
                  {daySchedules.length === 0 ? (
                    <div style={{ fontSize:'10px', color:'var(--text-dim)', textAlign:'center', paddingTop:'12px' }}>—</div>
                  ) : daySchedules.map(s => {
                    const cm = COLOR_MAP[s.color] || COLOR_MAP.blue
                    const bk = bookingsForSchedule(s.id)
                    const startH = new Date(s.start_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})
                    return (
                      <button key={s.id} onClick={() => setSelected(s)}
                        style={{ background: s.is_cancelled ? 'var(--surface2)' : cm.bg, border:`1px solid ${s.is_cancelled ? 'var(--border)' : cm.border}`,
                          borderRadius:'8px', padding:'6px 8px', cursor:'pointer', textAlign:'left', fontFamily:'inherit', opacity: s.is_cancelled ? 0.5 : 1 }}>
                        <div style={{ fontSize:'10px', color: s.is_cancelled ? 'var(--text-dim)' : cm.dot, fontWeight:700 }}>{startH}</div>
                        <div style={{ fontSize:'11px', fontWeight:600, color:'var(--text)', marginTop:'2px', lineHeight:1.2,
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.title}</div>
                        <div style={{ fontSize:'10px', color:'var(--text-dim)', marginTop:'2px' }}>
                          {bk.length}/{s.max_capacity}명 {s.is_cancelled && '· 취소됨'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 목록 뷰 */}
      {viewMode === 'list' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {schedules.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">이번 주 수업이 없어요</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>일시</th><th>수업</th><th>트레이너</th><th style={{textAlign:'right'}}>예약/정원</th><th>상태</th><th></th></tr></thead>
              <tbody>
                {schedules.map(s => {
                  const cm = COLOR_MAP[s.color] || COLOR_MAP.blue
                  const bk = bookingsForSchedule(s.id)
                  return (
                    <tr key={s.id} style={{ opacity: s.is_cancelled ? 0.5 : 1 }}>
                      <td style={{ fontSize:'11px', color:'var(--text-muted)' }}>
                        {new Date(s.start_at).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})}<br />
                        {new Date(s.start_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}
                      </td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:cm.dot, flexShrink:0 }} />
                          <div>
                            <div style={{ fontWeight:600, fontSize:'13px' }}>{s.title}</div>
                            <div style={{ fontSize:'11px', color:'var(--text-dim)' }}>{CLASS_TYPES[s.class_type]}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize:'12px', color:'var(--text-muted)' }}>{s.trainer_id ? trainerName(s.trainer_id) : '—'}</td>
                      <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:'12px' }}>{bk.length} / {s.max_capacity}</td>
                      <td>{s.is_cancelled ? <span className="badge" style={{background:'rgba(248,113,113,0.1)',color:'var(--red)'}}>취소됨</span> : <span className="badge" style={{background:'rgba(74,222,128,0.1)',color:'var(--green)'}}>진행 예정</span>}</td>
                      <td><button className="btn btn-secondary" style={{padding:'4px 10px',fontSize:'11px'}} onClick={() => setSelected(s)}>상세</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 수업 상세 모달 */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''} maxWidth="480px">
        {selected && (() => {
          const cm = COLOR_MAP[selected.color] || COLOR_MAP.blue
          const bk = bookingsForSchedule(selected.id)
          const alreadyBooked = bk.map(b => b.member_id)
          return (
            <div>
              <div style={{ background:cm.bg, border:`1px solid ${cm.border}`, borderRadius:'10px', padding:'12px', marginBottom:'16px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px' }}>
                  {[['수업 종류', CLASS_TYPES[selected.class_type]],
                    ['담당 트레이너', selected.trainer_id ? trainerName(selected.trainer_id) : '—'],
                    ['시작', new Date(selected.start_at).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})],
                    ['종료', new Date(selected.end_at).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})],
                  ].map(([k,v]) => (
                    <div key={k} style={{ background:'rgba(0,0,0,0.15)', borderRadius:'6px', padding:'8px 10px' }}>
                      <div style={{ fontSize:'10px', color:cm.dot, marginBottom:'2px' }}>{k}</div>
                      <div style={{ fontWeight:600 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {selected.description && <div style={{ marginTop:'8px', fontSize:'12px', color:'var(--text-muted)' }}>{selected.description}</div>}
              </div>

              {/* 예약 현황 */}
              <div className="card" style={{ marginBottom:'12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <div className="card-title" style={{ marginBottom:0 }}>예약 현황 ({bk.length}/{selected.max_capacity})</div>
                </div>
                {bk.length === 0 ? (
                  <div style={{ fontSize:'12px', color:'var(--text-dim)', textAlign:'center', padding:'12px' }}>예약한 회원이 없어요</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {bk.map(b => (
                      <div key={b.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:'13px', fontWeight:500 }}>{b.members?.name || '—'}</span>
                        <button className="btn btn-secondary" style={{ padding:'3px 8px', fontSize:'10px' }} onClick={() => handleCancelBooking(b.id)}>취소</button>
                      </div>
                    ))}
                  </div>
                )}
                {!selected.is_cancelled && bk.length < selected.max_capacity && (
                  <div style={{ marginTop:'10px' }}>
                    <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>회원 추가 예약</div>
                    <select className="input" onChange={e => { if(e.target.value) handleBook(selected.id, e.target.value); e.target.value='' }} defaultValue="">
                      <option value="">회원 선택...</option>
                      {members.filter(m => !alreadyBooked.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {!selected.is_cancelled && (
                <button className="btn btn-secondary" style={{ width:'100%', justifyContent:'center', color:'var(--red)', borderColor:'rgba(248,113,113,0.3)' }} onClick={() => handleCancel(selected.id)}>
                  🚫 수업 취소 처리
                </button>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
