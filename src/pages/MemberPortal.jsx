import { useState, useEffect, useRef } from 'react'
import { supabase, GEMINI_MODEL } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
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
    }
  }, [member])

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
        {['logs','health','diet'].map(t => (
          <div key={t} className={`m-tab${tab===t?' active':''}`} onClick={()=>setTab(t)}>
            {{logs:'📋 수업일지',health:'⚖️ 체중관리',diet:'🥗 식단기록'}[t]}
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
    </div>
  )
}
