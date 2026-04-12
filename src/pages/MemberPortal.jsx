import { useState, useEffect, useRef } from 'react'
import { supabase, GEMINI_MODEL } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import { Link } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import '../styles/member.css'

Chart.register(...registerables)

export default function MemberPortal() {
  const showToast = useToast()
  const [loggedIn, setLoggedIn] = useState(false)
  const [member, setMember] = useState(null)
  const [tab, setTab] = useState('logs')
  const [memberLogs, setMemberLogs] = useState([])
  const [healthRecords, setHealthRecords] = useState([])
  const [dietRecords, setDietRecords] = useState([])
  const [selectedSleep, setSelectedSleep] = useState(null)
  const [loginName, setLoginName] = useState('')
  const [loginPhone, setLoginPhone] = useState('')
  const [hMorning, setHMorning] = useState('')
  const [hEvening, setHEvening] = useState('')
  const [hDate, setHDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dDate, setDDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dBreakfast, setDBreakfast] = useState('')
  const [dLunch, setDLunch] = useState('')
  const [dDinner, setDDinner] = useState('')
  const [dSnack, setDSnack] = useState('')
  const [hTarget, setHTarget] = useState('')
  const [hStart, setHStart] = useState('')
  const [hAge, setHAge] = useState('')
  const [hHeight, setHHeight] = useState('')
  const [hSpecial, setHSpecial] = useState('')
  const [openLogIdx, setOpenLogIdx] = useState(null)
  const chartRef = useRef(null)
  const chartInstance = useRef(null)

  // Personal Workout
  const MUSCLE_GROUPS = ['가슴','등','어깨','이두','삼두','하체','코어','유산소','전신']
  const MUSCLE_COLOR = {'가슴':'#ef4444','등':'#3b82f6','어깨':'#8b5cf6','이두':'#f97316','삼두':'#06b6d4','하체':'#22c55e','코어':'#eab308','유산소':'#ec4899','전신':'#6b7280'}
  const emptyWEx = () => ({localId:Date.now().toString()+Math.random(),name:'',muscle_group:'',sets:[{weight:'',reps:'',rest_sec:''}]})
  const [workoutSessions, setWorkoutSessions] = useState([])
  const [workoutRoutines, setWorkoutRoutines] = useState([])
  const [workoutModal, setWorkoutModal] = useState(false)
  const [workoutEditId, setWorkoutEditId] = useState(null)
  const [workoutForm, setWorkoutForm] = useState({date:'',title:'',duration_min:'',memo:'',exercises:[emptyWEx()]})
  const [workoutRoutineModal, setWorkoutRoutineModal] = useState(false)
  const [workoutSaveRoutineName, setWorkoutSaveRoutineName] = useState('')
  const [workoutDetailId, setWorkoutDetailId] = useState(null)

  const today = () => new Date().toISOString().split('T')[0]
  const formatDate = (str) => new Date(str+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})

  async function login() {
    if (!loginName || !loginPhone) { showToast('이름과 전화번호 뒷자리를 입력해주세요'); return }
    try {
      const { data } = await supabase.from('members').select('*').eq('name', loginName).eq('phone', loginPhone)
      if (!data?.length) { showToast('등록된 회원 정보가 없어요. 트레이너에게 문의하세요'); return }
      setMember(data[0]); setLoggedIn(true)
      showToast('✓ 환영해요, '+data[0].name+'님!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  function logout() {
    setMember(null); setLoggedIn(false); setLoginName(''); setLoginPhone('')
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null }
  }

  useEffect(() => {
    if (member) {
      loadAll()
      setHTarget(member.target_weight || ''); setHStart(member.start_weight || '')
      setHAge(member.age || ''); setHHeight(member.height || ''); setHSpecial(member.special_note || '')
      loadWorkoutSessions(); loadWorkoutRoutines()
    }
  }, [member])

  useEffect(() => { if (tab === 'workout' && member) { loadWorkoutSessions(); loadWorkoutRoutines() } }, [tab])

  async function loadAll() {
    const [l, h, d] = await Promise.all([
      supabase.from('logs').select('*').eq('member_id', member.id).order('created_at', { ascending: false }),
      supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date', { ascending: false }).limit(60),
      supabase.from('health_records').select('*').eq('member_id', member.id).not('diet_note','is',null).order('record_date', { ascending: false }).limit(30),
    ])
    setMemberLogs(l.data || []); setHealthRecords(h.data || []); setDietRecords(d.data || [])
  }

  useEffect(() => {
    if (tab === 'health' && healthRecords.length) setTimeout(renderChart, 200)
  }, [tab, healthRecords])

  function renderChart() {
    const records = healthRecords.filter(r => r.morning_weight).slice(0,14).reverse()
    if (!records.length || !chartRef.current) return
    if (chartInstance.current) chartInstance.current.destroy()
    const ctx = chartRef.current.getContext('2d')
    chartInstance.current = new Chart(ctx, {
      type:'line',
      data:{labels:records.map(r=>formatDate(r.record_date)),datasets:[
        {label:'공복 체중',data:records.map(r=>r.morning_weight),borderColor:'#111',backgroundColor:'rgba(17,17,17,0.05)',tension:0.35,pointRadius:4,pointBackgroundColor:'#111',borderWidth:2,fill:true},
        ...(member?.target_weight?[{label:'목표',data:Array(records.length).fill(member.target_weight),borderColor:'#c8f135',borderDash:[6,4],borderWidth:2,pointRadius:0,fill:false}]:[])
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#aaa'}},y:{grid:{color:'#f0f0ee'},ticks:{font:{size:10},color:'#aaa',callback:v=>v+'kg'}}}}
    })
  }

  async function saveHealthRecord() {
    const morning = parseFloat(hMorning) || null; const evening = parseFloat(hEvening) || null
    if (!morning && !evening) { showToast('체중을 입력해주세요'); return }
    try {
      await supabase.from('health_records').insert({ member_id:member.id, record_date:hDate||today(), morning_weight:morning, evening_weight:evening, sleep_level:selectedSleep, weight:morning })
      setHMorning(''); setHEvening(''); setSelectedSleep(null)
      const { data } = await supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date', { ascending: false }).limit(60)
      setHealthRecords(data || []); showToast('✓ 체중이 기록됐어요!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function saveProfile() {
    try {
      const updates = { target_weight:parseFloat(hTarget)||null, start_weight:parseFloat(hStart)||null, age:parseInt(hAge)||null, height:parseFloat(hHeight)||null, special_note:hSpecial.trim()||null }
      await supabase.from('members').update(updates).eq('id', member.id)
      setMember({...member, ...updates}); showToast('✓ 목표가 저장됐어요!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function saveDiet() {
    const parts = [dBreakfast&&'🍳 아침: '+dBreakfast, dLunch&&'🍱 점심: '+dLunch, dDinner&&'🍽️ 저녁: '+dDinner, dSnack&&'🧃 간식: '+dSnack].filter(Boolean)
    if (!parts.length) { showToast('식단을 입력해주세요'); return }
    try {
      await supabase.from('health_records').insert({ member_id:member.id, record_date:dDate||today(), diet_note:parts.join('\n') })
      setDBreakfast(''); setDLunch(''); setDDinner(''); setDSnack('')
      const { data } = await supabase.from('health_records').select('*').eq('member_id', member.id).not('diet_note','is',null).order('record_date', { ascending: false }).limit(30)
      setDietRecords(data || []); showToast('✓ 식단이 기록됐어요!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // === PERSONAL WORKOUT ===
  async function loadWorkoutSessions() {
    const { data, error } = await supabase.from('workout_sessions').select('*').eq('member_id', member.id).order('workout_date', { ascending: false })
    if (!error) setWorkoutSessions(data || [])
  }
  async function loadWorkoutRoutines() {
    const { data, error } = await supabase.from('workout_routines').select('*').eq('member_id', member.id).order('created_at', { ascending: false })
    if (!error) setWorkoutRoutines(data || [])
  }
  function openWorkoutModal(session = null) {
    const todayStr = new Date().toISOString().split('T')[0]
    if (session) {
      setWorkoutEditId(session.id)
      setWorkoutForm({ date: session.workout_date, title: session.title||'', duration_min: session.duration_min||'', memo: session.memo||'', exercises: session.exercises?.length ? session.exercises.map(e=>({...e,localId:Date.now().toString()+Math.random()})) : [emptyWEx()] })
    } else {
      setWorkoutEditId(null)
      setWorkoutForm({ date: todayStr, title: '', duration_min: '', memo: '', exercises: [emptyWEx()] })
    }
    setWorkoutSaveRoutineName(''); setWorkoutModal(true)
  }
  function calcVolume(exercises) {
    return exercises.reduce((t,ex)=>t+ex.sets.reduce((s,set)=>s+((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)),0),0)
  }
  async function saveWorkoutSession() {
    const f = workoutForm
    if (!f.date) { showToast('날짜를 입력해주세요'); return }
    const exercises = f.exercises.filter(e=>e.name.trim())
    const total_volume = calcVolume(exercises)
    try {
      if (workoutEditId) {
        const { error } = await supabase.from('workout_sessions').update({ title:f.title||null, workout_date:f.date, duration_min:parseInt(f.duration_min)||null, memo:f.memo||null, exercises, total_volume }).eq('id', workoutEditId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workout_sessions').insert({ member_id:member.id, trainer_id:member.trainer_id||null, title:f.title||null, workout_date:f.date, duration_min:parseInt(f.duration_min)||null, memo:f.memo||null, exercises, total_volume })
        if (error) throw error
      }
      await loadWorkoutSessions(); setWorkoutModal(false)
      showToast(workoutEditId ? '✓ 수정됐어요' : '✓ 운동일지가 저장됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deleteWorkoutSession(id) {
    const { error } = await supabase.from('workout_sessions').delete().eq('id', id)
    if (!error) { await loadWorkoutSessions(); showToast('삭제됐어요') }
    else showToast('오류: ' + error.message)
  }
  async function saveAsRoutine() {
    if (!workoutSaveRoutineName.trim()) { showToast('루틴 이름을 입력해주세요'); return }
    const exercises = workoutForm.exercises.filter(e=>e.name.trim())
    const { error } = await supabase.from('workout_routines').insert({ member_id:member.id, trainer_id:member.trainer_id||null, name:workoutSaveRoutineName.trim(), exercises })
    if (!error) { await loadWorkoutRoutines(); setWorkoutSaveRoutineName(''); showToast('✓ 루틴으로 저장됐어요') }
    else showToast('오류: ' + error.message)
  }
  async function deleteWorkoutRoutine(id) {
    const { error } = await supabase.from('workout_routines').delete().eq('id', id)
    if (!error) { await loadWorkoutRoutines(); showToast('루틴이 삭제됐어요') }
  }
  function loadRoutineIntoForm(routine) {
    const todayStr = new Date().toISOString().split('T')[0]
    setWorkoutEditId(null)
    setWorkoutForm({ date:todayStr, title:routine.name, duration_min:'', memo:'', exercises:routine.exercises.map(e=>({...e,localId:Date.now().toString()+Math.random(),sets:e.sets.map(s=>({...s,weight:'',reps:'',rest_sec:''})) })) })
    setWorkoutRoutineModal(false); setWorkoutModal(true)
  }
  function wfAddEx() { setWorkoutForm(f=>({...f,exercises:[...f.exercises,emptyWEx()]})) }
  function wfRemoveEx(lid) { setWorkoutForm(f=>({...f,exercises:f.exercises.filter(e=>e.localId!==lid)})) }
  function wfUpdateEx(lid,key,val) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===lid?{...e,[key]:val}:e)})) }
  function wfAddSet(lid) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===lid?{...e,sets:[...e.sets,{weight:'',reps:'',rest_sec:''}]}:e)})) }
  function wfRemoveSet(lid,idx) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===lid?{...e,sets:e.sets.filter((_,i)=>i!==idx)}:e)})) }
  function wfUpdateSet(lid,idx,key,val) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===lid?{...e,sets:e.sets.map((s,i)=>i===idx?{...s,[key]:val}:s)}:e)})) }

  function copyLog(i) { navigator.clipboard.writeText(memberLogs[i].content).then(()=>showToast('✓ 복사됐어요!')) }

  function downloadPDF(i) {
    import('jspdf').then(({jsPDF}) => {
      const log = memberLogs[i]; const d = new Date(log.created_at)
      const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
      doc.setFillColor(26,26,26); doc.rect(0,0,210,28,'F'); doc.setTextColor(200,241,53); doc.setFontSize(16); doc.text('TRAINERLOG',14,12)
      doc.setTextColor(255,255,255); doc.setFontSize(10); doc.text(member.name+' | '+d.toLocaleDateString('ko-KR')+' | '+log.session_number+'회차',14,22)
      doc.setTextColor(30,30,30); doc.setFontSize(10); doc.text(doc.splitTextToSize(log.content,182),14,40)
      doc.save('수업일지_'+member.name+'_'+log.session_number+'회차.pdf'); showToast('✓ PDF 저장됐어요!')
    })
  }

  // === COMPUTED ===
  const latestMorning = healthRecords.find(r => r.morning_weight)
  const currentW = latestMorning?.morning_weight || null
  const lost = (member?.start_weight && currentW) ? (member.start_weight - currentW).toFixed(1) : null
  const lostPct = (member?.start_weight && lost) ? ((lost/member.start_weight)*100).toFixed(1) : 0
  const goalPct = (member?.start_weight && member?.target_weight && lost && member.start_weight !== member.target_weight) ? Math.min(100, Math.round((lost/(member.start_weight-member.target_weight))*100)) : 0

  // === LOGIN ===
  if (!loggedIn) {
    return (
      <div className="m-login-wrap">
        <div className="m-login-card">
          <div className="m-login-logo">TRAINER<span>LOG</span></div>
          <div className="m-login-sub">회원 전용 포털입니다</div>
          <div className="form-group"><label>이름</label><input type="text" value={loginName} onChange={e=>setLoginName(e.target.value)} placeholder="홍길동" /></div>
          <div className="form-group"><label>전화번호 뒷 4자리</label><input type="password" value={loginPhone} onChange={e=>setLoginPhone(e.target.value)} placeholder="1234" maxLength={4} onKeyDown={e=>e.key==='Enter'&&login()} /></div>
          <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={login}>로그인</button>
          <div style={{textAlign:'center',marginTop:'14px'}}><Link to="/" style={{fontSize:'12px',color:'var(--m-text-dim)',textDecoration:'none'}}>← 메인으로</Link></div>
        </div>
      </div>
    )
  }

  const pct = member.total_sessions>0 ? Math.round((member.done_sessions/member.total_sessions)*100) : 0
  const remain = member.total_sessions - member.done_sessions

  return (
    <div className="member-portal">
      <div className="m-topbar">
        <div className="m-topbar-title">TRAINER<span>LOG</span></div>
        <button className="m-logout-btn" onClick={logout}>로그아웃</button>
      </div>
      <div className="m-tabs">
        {['logs','health','diet','workout'].map(t => (
          <div key={t} className={`m-tab${tab===t?' active':''}`} onClick={()=>setTab(t)}>
            {{logs:'📋 수업일지',health:'⚖️ 체중관리',diet:'🥗 식단기록',workout:'🏃 개인운동'}[t]}
          </div>
        ))}
      </div>

      {/* 수업일지 */}
      {tab === 'logs' && (
        <div className="m-page">
          <div className="m-member-header">
            <div className="m-member-header-name">{member.name} 회원님 👋</div>
            <div className="m-member-header-meta">{member.lesson_purpose || '열심히 운동 중!'}</div>
            <div className="m-session-stats">
              <div className="m-stat-box"><div className="m-stat-num">{member.done_sessions}</div><div className="m-stat-label">완료</div></div>
              <div className="m-stat-box"><div className="m-stat-num">{remain}</div><div className="m-stat-label">남은 세션</div></div>
              <div className="m-stat-box"><div className="m-stat-num">{pct}%</div><div className="m-stat-label">진행률</div></div>
            </div>
            <div className="m-session-bar-bg"><div className="m-session-bar-fill" style={{width:pct+'%'}}></div></div>
          </div>
          <div className="section-label">수업일지</div>
          {!memberLogs.length && <div className="empty">아직 수업일지가 없어요.<br/>첫 수업 후에 확인해보세요!</div>}
          {memberLogs.map((l,i) => {
            const d = new Date(l.created_at); const isOpen = openLogIdx === i
            return (
              <div key={l.id} className="m-log-item">
                <div className="m-log-item-header" onClick={()=>setOpenLogIdx(isOpen?null:i)}>
                  <div><div style={{fontSize:'14px',fontWeight:500,marginBottom:'2px'}}>{d.toLocaleDateString('ko-KR',{month:'long',day:'numeric'})}</div><div className="m-log-item-date">{d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</div></div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}><span className="m-log-session">{l.session_number}회차</span><span className={`chevron${isOpen?' open':''}`}>▼</span></div>
                </div>
                {isOpen && <div className="m-log-body">{l.content}</div>}
                {isOpen && (
                  <div className="m-log-footer">
                    <button className="btn btn-outline btn-sm" onClick={()=>downloadPDF(i)}>📄 PDF</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>copyLog(i)}>📋 복사</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 체중관리 */}
      {tab === 'health' && (
        <div className="m-page">
          {!member.target_weight && !member.start_weight && <div className="m-setup-banner">💡 아래 목표 설정에서 목표/시작 체중을 먼저 입력해주세요!</div>}
          <div className="m-weight-stats">
            <div className="m-weight-card dark"><div className="m-weight-card-label">🎯 목표 체중</div><div className="m-weight-card-num">{member.target_weight||'—'}<span className="m-weight-card-unit">kg</span></div></div>
            <div className="m-weight-card"><div className="m-weight-card-label">📌 시작 체중</div><div className="m-weight-card-num">{member.start_weight||'—'}<span className="m-weight-card-unit">kg</span></div></div>
            <div className="m-weight-card green"><div className="m-weight-card-label">⚖️ 현재 공복 체중</div><div className="m-weight-card-num">{currentW||'—'}<span className="m-weight-card-unit">kg</span></div></div>
            <div className="m-weight-card green"><div className="m-weight-card-label">📉 총 감량</div><div className="m-weight-card-num">{lost||'—'}<span className="m-weight-card-unit">kg</span></div></div>
          </div>
          <div className="card">
            <div className="m-progress-wrap"><div className="m-progress-row"><span>감량률</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{lostPct}%</span></div><div className="m-progress-bg"><div className="m-progress-fill" style={{width:Math.min(100,lostPct)+'%'}}></div></div></div>
            <div className="m-progress-wrap" style={{marginBottom:0}}><div className="m-progress-row"><span>목표 달성률</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600,color:goalPct>=100?'#16a34a':'var(--m-accent)'}}>{goalPct}%</span></div><div className="m-progress-bg"><div className="m-progress-fill" style={{width:goalPct+'%'}}></div></div></div>
          </div>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
              <span style={{fontSize:'13px',fontWeight:600}}>체중 변화 추이</span>
              <span style={{fontSize:'11px',color:'var(--m-text-dim)'}}>최근 14일 · 공복 체중</span>
            </div>
            <div style={{position:'relative',height:'200px',marginBottom:'4px'}}><canvas ref={chartRef}></canvas></div>
          </div>
          <div className="section-label">오늘 체중 기록</div>
          <div className="card">
            <div className="two-col" style={{marginBottom:'12px'}}>
              <div className="form-group" style={{marginBottom:0}}><label>🌅 공복 체중 (아침, kg)</label><input type="number" value={hMorning} onChange={e=>setHMorning(e.target.value)} placeholder="68.5" step="0.1" /></div>
              <div className="form-group" style={{marginBottom:0}}><label>🌙 저녁 체중 (kg)</label><input type="number" value={hEvening} onChange={e=>setHEvening(e.target.value)} placeholder="69.2" step="0.1" /></div>
            </div>
            <div className="form-group">
              <label>😴 수면 레벨 (1~10)</label>
              <div className="m-sleep-selector">
                {Array.from({length:10},(_,i)=>(
                  <button key={i} className={`m-sleep-btn${selectedSleep&&i<selectedSleep?' active':''}`} onClick={()=>setSelectedSleep(i+1)}>{i+1}</button>
                ))}
              </div>
            </div>
            <div className="form-group"><label>📅 날짜</label><input type="date" value={hDate} onChange={e=>setHDate(e.target.value)} /></div>
            <button className="btn btn-primary" style={{width:'100%'}} onClick={saveHealthRecord}>체중 기록 저장</button>
          </div>
          <div className="section-label">일별 기록</div>
          {healthRecords.filter(r=>r.morning_weight||r.evening_weight).slice(0,14).map(r => {
            const diff = (r.morning_weight&&r.evening_weight)?(r.evening_weight-r.morning_weight).toFixed(1):null
            return (
              <div key={r.id} className="m-daily-item">
                <div className="m-daily-date">{formatDate(r.record_date)}</div>
                <div className="m-daily-weights">
                  <div className="m-daily-w"><div className="m-daily-w-num">{r.morning_weight||'—'}</div><div className="m-daily-w-label">공복</div></div>
                  <div className="m-daily-w"><div className="m-daily-w-num">{r.evening_weight||'—'}</div><div className="m-daily-w-label">저녁</div></div>
                  {diff && <div className="m-daily-w"><div className="m-daily-w-num" style={{color:diff>0?'#e53935':'#16a34a'}}>{diff>0?'+':''}{diff}</div><div className="m-daily-w-label">일중증가</div></div>}
                </div>
                {r.sleep_level && <div className="m-sleep-pips">{Array.from({length:10},(_,i)=><div key={i} className={`m-sleep-pip${i<r.sleep_level?' on':''}`}></div>)}</div>}
              </div>
            )
          })}
          {!healthRecords.filter(r=>r.morning_weight||r.evening_weight).length && <div className="empty">체중 기록이 없어요.<br/>위에서 오늘 체중을 기록해보세요!</div>}
          <div className="section-label">목표 설정</div>
          <div className="card">
            <div className="two-col">
              <div className="form-group"><label>🎯 목표 체중 (kg)</label><input type="number" value={hTarget} onChange={e=>setHTarget(e.target.value)} placeholder="60" step="0.1" /></div>
              <div className="form-group"><label>📌 시작 체중 (kg)</label><input type="number" value={hStart} onChange={e=>setHStart(e.target.value)} placeholder="75" step="0.1" /></div>
            </div>
            <div className="two-col">
              <div className="form-group"><label>나이</label><input type="number" value={hAge} onChange={e=>setHAge(e.target.value)} placeholder="28" /></div>
              <div className="form-group"><label>키 (cm)</label><input type="number" value={hHeight} onChange={e=>setHHeight(e.target.value)} placeholder="165" step="0.1" /></div>
            </div>
            <div className="form-group"><label>특이사항</label><input type="text" value={hSpecial} onChange={e=>setHSpecial(e.target.value)} placeholder="무릎 통증, 알레르기 등" /></div>
            <button className="btn btn-outline" style={{width:'100%'}} onClick={saveProfile}>목표 저장</button>
          </div>
        </div>
      )}

      {/* 식단기록 */}
      {tab === 'diet' && (
        <div className="m-page">
          <div className="section-label">오늘의 식단 기록</div>
          <div className="card">
            <div className="form-group"><label>📅 날짜</label><input type="date" value={dDate} onChange={e=>setDDate(e.target.value)} /></div>
            {[['🍳 아침',dBreakfast,setDBreakfast],['🍱 점심',dLunch,setDLunch],['🍽️ 저녁',dDinner,setDDinner],['🧃 간식',dSnack,setDSnack]].map(([label,val,setter]) => (
              <div key={label} className="m-meal-section">
                <div className="m-meal-label">{label}</div>
                <textarea value={val} onChange={e=>setter(e.target.value)} placeholder="직접 입력하세요" rows={2}></textarea>
              </div>
            ))}
            <button className="btn btn-primary" style={{width:'100%'}} onClick={saveDiet}>식단 저장</button>
          </div>
          <div className="section-label">식단 기록 히스토리</div>
          {!dietRecords.length && <div className="empty">식단 기록이 없어요.<br/>위에서 오늘 식단을 기록해보세요!</div>}
          {dietRecords.map(r => (
            <div key={r.id} className="m-diet-history-item">
              <div style={{fontSize:'11px',color:'var(--m-text-dim)',fontFamily:"'DM Mono',monospace",marginBottom:'8px'}}>{formatDate(r.record_date)}</div>
              <div style={{fontSize:'13px',lineHeight:'1.8',whiteSpace:'pre-wrap',color:'var(--m-text-muted)'}}>{r.diet_note}</div>
            </div>
          ))}
        </div>
      )}
      {/* 개인운동 */}
      {tab === 'workout' && (() => {
        const thisMonth = new Date().toISOString().slice(0,7)
        const monthSessions = workoutSessions.filter(s=>s.workout_date?.startsWith(thisMonth))
        const monthVolume = monthSessions.reduce((s,ss)=>s+(ss.total_volume||0),0)
        return (
          <div className="m-page">
            {/* 이번 달 요약 */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'16px'}}>
              {[['이번 달',monthSessions.length+'회'],['총 볼륨',monthVolume>=1000?(monthVolume/1000).toFixed(1)+'t':Math.round(monthVolume)+'kg'],['전체',workoutSessions.length+'회']].map(([l,v])=>(
                <div key={l} className="card" style={{marginBottom:0,padding:'10px 12px'}}>
                  <div style={{fontSize:'10px',color:'var(--m-text-dim)',marginBottom:'3px'}}>{l}</div>
                  <div style={{fontSize:'17px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{v}</div>
                </div>
              ))}
            </div>
            {/* 버튼 행 */}
            <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
              {workoutRoutines.length > 0 && (
                <button className="btn btn-outline btn-sm" style={{flex:1,fontSize:'13px'}} onClick={()=>setWorkoutRoutineModal(true)}>📋 루틴 불러오기</button>
              )}
              <button className="btn btn-primary" style={{flex:1,fontSize:'13px'}} onClick={()=>openWorkoutModal()}>+ 운동 기록</button>
            </div>
            {/* 세션 이력 */}
            {!workoutSessions.length && <div className="empty" style={{marginTop:'32px'}}>🏃<br/><br/>아직 개인 운동 기록이 없어요.<br/>위 버튼으로 첫 운동을 기록해보세요!</div>}
            {workoutSessions.map(s => {
              const isOpen = workoutDetailId === s.id
              const exList = s.exercises || []
              const vol = s.total_volume || 0
              const dateStr = new Date(s.workout_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})
              const muscles = [...new Set(exList.map(e=>e.muscle_group).filter(Boolean))]
              return (
                <div key={s.id} className="m-log-item" style={{cursor:'pointer'}} onClick={()=>setWorkoutDetailId(isOpen?null:s.id)}>
                  <div className="m-log-item-header">
                    <div>
                      <div style={{fontSize:'14px',fontWeight:600,marginBottom:'4px'}}>{s.title||'운동'}</div>
                      <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'4px'}}>
                        {muscles.map(mg=>(
                          <span key={mg} style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(MUSCLE_COLOR[mg]||'#6b7280')+'22',color:MUSCLE_COLOR[mg]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[mg]||'#6b7280')}44`}}>{mg}</span>
                        ))}
                      </div>
                      <div style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{dateStr}{s.duration_min?' · ⏱ '+s.duration_min+'분':''} · {exList.length}종목 · {vol>=1000?(vol/1000).toFixed(1)+'t':Math.round(vol)+'kg'}</div>
                    </div>
                    <span className={`chevron${isOpen?' open':''}`}>▼</span>
                  </div>
                  {isOpen && (
                    <div className="m-log-body" onClick={e=>e.stopPropagation()}>
                      {exList.map((ex,ei)=>{
                        const exVol = ex.sets.reduce((s,set)=>s+((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)),0)
                        return (
                          <div key={ei} style={{marginBottom:'12px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                              <span style={{fontSize:'13px',fontWeight:600}}>{ex.name}</span>
                              {ex.muscle_group && <span style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')+'22',color:MUSCLE_COLOR[ex.muscle_group]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')}44`}}>{ex.muscle_group}</span>}
                              <span style={{fontSize:'11px',color:'var(--m-text-dim)',marginLeft:'auto'}}>볼륨 {Math.round(exVol)}kg</span>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:'4px'}}>
                              {ex.sets.map((set,si)=>(
                                <div key={si} style={{background:'var(--m-surface2,#f5f5f3)',borderRadius:'6px',padding:'6px 8px',fontSize:'12px',textAlign:'center'}}>
                                  <div style={{fontSize:'10px',color:'var(--m-text-dim)',marginBottom:'2px'}}>{si+1}세트</div>
                                  <div style={{fontWeight:600}}>{set.weight||'—'}kg × {set.reps||'—'}회</div>
                                  {set.rest_sec && <div style={{fontSize:'10px',color:'var(--m-text-dim)',marginTop:'1px'}}>휴식 {set.rest_sec}초</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {s.memo && <div style={{fontSize:'12px',color:'var(--m-text-muted)',padding:'8px',background:'var(--m-surface2,#f5f5f3)',borderRadius:'6px',marginTop:'4px'}}>💬 {s.memo}</div>}
                      <div className="m-log-footer">
                        <button className="btn btn-outline btn-sm" onClick={()=>openWorkoutModal(s)}>✏️ 수정</button>
                        <button className="btn btn-outline btn-sm" style={{color:'#e53935'}} onClick={()=>deleteWorkoutSession(s.id)}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* 운동 기록 모달 */}
      <Modal open={workoutModal} onClose={()=>setWorkoutModal(false)} title={workoutEditId?'운동일지 수정':'운동 기록'} maxWidth="520px">
        <div className="two-col">
          <div className="form-group"><label>날짜</label><input type="date" value={workoutForm.date} onChange={e=>setWorkoutForm(f=>({...f,date:e.target.value}))} /></div>
          <div className="form-group"><label>운동 시간 (분)</label><input type="number" value={workoutForm.duration_min} onChange={e=>setWorkoutForm(f=>({...f,duration_min:e.target.value}))} placeholder="60" min="1" /></div>
        </div>
        <div className="form-group"><label>제목 (선택)</label><input type="text" value={workoutForm.title} onChange={e=>setWorkoutForm(f=>({...f,title:e.target.value}))} placeholder="상체 / 하체 / 풀바디..." /></div>
        <div className="divider"></div>
        <div className="section-label" style={{marginTop:0}}>운동 항목</div>
        {workoutForm.exercises.map((ex) => (
          <div key={ex.localId} style={{background:'var(--m-surface,#fafaf8)',border:'1px solid var(--m-border,#e8e8e4)',borderRadius:'10px',padding:'12px',marginBottom:'10px'}}>
            <div style={{display:'flex',gap:'8px',marginBottom:'8px',alignItems:'center'}}>
              <input type="text" value={ex.name} onChange={e=>wfUpdateEx(ex.localId,'name',e.target.value)} placeholder="운동명 (예: 벤치프레스)" style={{flex:1}} />
              {workoutForm.exercises.length > 1 && (
                <button onClick={()=>wfRemoveEx(ex.localId)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:'18px',padding:'0 4px',lineHeight:1}}>×</button>
              )}
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'10px'}}>
              {MUSCLE_GROUPS.map(mg=>(
                <button key={mg} type="button" onClick={()=>wfUpdateEx(ex.localId,'muscle_group',ex.muscle_group===mg?'':mg)}
                  style={{padding:'3px 9px',borderRadius:'6px',border:'1px solid',fontSize:'11px',cursor:'pointer',fontFamily:'inherit',
                    background:ex.muscle_group===mg?(MUSCLE_COLOR[mg]||'#333'):'transparent',
                    color:ex.muscle_group===mg?'#fff':'#888',
                    borderColor:ex.muscle_group===mg?(MUSCLE_COLOR[mg]||'#333'):'#ddd'}}>
                  {mg}
                </button>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 24px',gap:'4px',marginBottom:'4px'}}>
              <span style={{fontSize:'10px',color:'#aaa',textAlign:'center',alignSelf:'center'}}>세트</span>
              <span style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>무게(kg)</span>
              <span style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>횟수</span>
              <span style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>휴식(초)</span>
              <span></span>
            </div>
            {ex.sets.map((set,si)=>(
              <div key={si} style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 24px',gap:'4px',marginBottom:'4px',alignItems:'center'}}>
                <span style={{fontSize:'11px',color:'#aaa',textAlign:'center'}}>{si+1}</span>
                <input type="number" value={set.weight} onChange={e=>wfUpdateSet(ex.localId,si,'weight',e.target.value)} placeholder="0" min="0" step="0.5" style={{padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                <input type="number" value={set.reps} onChange={e=>wfUpdateSet(ex.localId,si,'reps',e.target.value)} placeholder="0" min="0" style={{padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                <input type="number" value={set.rest_sec} onChange={e=>wfUpdateSet(ex.localId,si,'rest_sec',e.target.value)} placeholder="60" min="0" style={{padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                {ex.sets.length > 1
                  ? <button onClick={()=>wfRemoveSet(ex.localId,si)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:'15px',padding:0,textAlign:'center'}}>×</button>
                  : <span></span>}
              </div>
            ))}
            <button className="btn btn-outline btn-sm" style={{width:'100%',marginTop:'4px',fontSize:'11px'}} onClick={()=>wfAddSet(ex.localId)}>+ 세트 추가</button>
          </div>
        ))}
        <button className="btn btn-outline" style={{width:'100%',marginBottom:'12px'}} onClick={wfAddEx}>+ 운동 종목 추가</button>
        <div className="form-group"><label>메모 (선택)</label><textarea value={workoutForm.memo} onChange={e=>setWorkoutForm(f=>({...f,memo:e.target.value}))} placeholder="오늘 컨디션, 특이사항 등" rows={2} style={{resize:'vertical'}} /></div>
        <div style={{display:'flex',gap:'6px',marginBottom:'12px',padding:'10px',background:'var(--m-surface,#fafaf8)',borderRadius:'8px',border:'1px solid var(--m-border,#e8e8e4)'}}>
          <input type="text" value={workoutSaveRoutineName} onChange={e=>setWorkoutSaveRoutineName(e.target.value)} placeholder="루틴 이름 입력 후 저장" style={{flex:1,fontSize:'12px'}} />
          <button className="btn btn-outline btn-sm" style={{flexShrink:0,fontSize:'12px'}} onClick={saveAsRoutine}>루틴 저장</button>
        </div>
        <button className="btn btn-primary" style={{width:'100%'}} onClick={saveWorkoutSession}>{workoutEditId?'수정 완료':'기록 완료'}</button>
      </Modal>

      {/* 루틴 불러오기 모달 */}
      <Modal open={workoutRoutineModal} onClose={()=>setWorkoutRoutineModal(false)} title="루틴 불러오기">
        {!workoutRoutines.length && <div className="empty">저장된 루틴이 없어요</div>}
        {workoutRoutines.map(r=>(
          <div key={r.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px',background:'var(--m-surface,#fafaf8)',border:'1px solid var(--m-border,#e8e8e4)',borderRadius:'8px',marginBottom:'8px'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',fontWeight:600,marginBottom:'4px'}}>{r.name}</div>
              <div style={{fontSize:'11px',color:'#aaa'}}>{(r.exercises||[]).length}종목 · {(r.exercises||[]).map(e=>e.name).filter(Boolean).join(', ').slice(0,40)}</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{flexShrink:0,fontSize:'12px'}} onClick={()=>loadRoutineIntoForm(r)}>불러오기</button>
            <button className="btn btn-outline btn-sm" style={{flexShrink:0,fontSize:'12px',color:'#e53935',padding:'4px 6px'}} onClick={()=>deleteWorkoutRoutine(r.id)}>×</button>
          </div>
        ))}
      </Modal>
    </div>
  )
}
