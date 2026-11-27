// 트레이너 앱 — 회원 상세 '출석' 탭 (TrainerApp 에서 떼어냄). 출결 기록 · 삭제는 TrainerApp 함수를 받아 호출만 한다.
// todayStr: 로컬 날짜 (toISOString 은 KST 새벽 0~9시에 어제가 돼서 오늘을 못 골랐다)
export default function MemberAttendanceTab({
  todayStr, attendanceDates, attendanceMonth, setAttendanceMonth, attendancePolicy,
  recordDate, setRecordDate, recordAttendanceStatus, toggleAttendance, onOpenPolicy,
}) {
  const { y, m } = attendanceMonth
  const firstDay = new Date(y, m, 1)
  const daysInMonth = new Date(y, m+1, 0).getDate()
  const startDow = (firstDay.getDay()+6)%7 // 월=0
  const statusOf = d => attendanceDates.find(a => a.attended_date === d)?.status || null
  const attendedSet = new Set(attendanceDates.filter(a => (a.status||'attended')==='attended').map(a => a.attended_date))
  const noshowSet   = new Set(attendanceDates.filter(a => a.status==='noshow').map(a => a.attended_date))
  const cancelledSet= new Set(attendanceDates.filter(a => a.status==='cancelled').map(a => a.attended_date))
  const monthCount = attendedSet.size
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
        <button className="week-nav-btn" onClick={()=>setAttendanceMonth(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1})}>‹</button>
        <div style={{fontSize:'14px',fontWeight:700}}>{y}년 {m+1}월 <span style={{fontSize:'12px',color:'var(--accent-text)',fontWeight:400}}>({monthCount}회 출석)</span></div>
        <button className="week-nav-btn" onClick={()=>setAttendanceMonth(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1})}>›</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'8px'}}>
        {['월','화','수','목','금','토','일'].map(d=><div key={d} style={{textAlign:'center',fontSize:'11px',color:'var(--text-dim)',padding:'4px 0'}}>{d}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
        {Array.from({length:startDow}).map((_,i)=><div key={'e'+i}></div>)}
        {Array.from({length:daysInMonth}).map((_,i)=>{
          const day = i+1
          const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const isAttended = attendedSet.has(dateStr)
          const isNoshow = noshowSet.has(dateStr)
          const isCancelled = cancelledSet.has(dateStr)
          const isToday = dateStr === todayStr
          const isFuture = dateStr > todayStr
          const bg = isAttended ? 'var(--accent)' : isNoshow ? 'rgba(239,68,68,0.85)' : isCancelled ? 'rgba(148,163,184,0.35)' : isToday ? 'rgba(200,241,53,0.12)' : 'var(--surface2)'
          const fg = isAttended ? '#0f0f0f' : isNoshow ? '#fff' : isToday ? 'var(--accent)' : isFuture ? 'var(--text-dim)' : 'var(--text)'
          return (
            <div key={day}
              title={isNoshow?'노쇼':isCancelled?'취소':isAttended?'출석':''}
              style={{aspectRatio:'1',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'8px',fontSize:'13px',fontWeight:(isAttended||isNoshow)?700:400,cursor:'default',
                background:bg, color:fg,
                border:isToday&&!isAttended&&!isNoshow&&!isCancelled?'1px solid rgba(200,241,53,0.4)':'1px solid transparent',
                opacity:isFuture?0.4:1}}>
              {day}
            </div>
          )
        })}
      </div>
      {/* 달력은 조회 전용 — 실수 클릭 방지. 기록은 아래 날짜 + 버튼으로만 */}
      <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'9px',lineHeight:1.5,textAlign:'center'}}>
        달력은 조회용이에요. 지난 수업 출석은 <b style={{color:'var(--text-muted)'}}>아래에서 날짜를 골라</b> 기록해요.
      </div>
      {/* 출석 · 노쇼 · 사전취소 기록 (고른 날짜로) + 정책 */}
      <div style={{marginTop:'14px',display:'flex',gap:'8px',alignItems:'center'}}>
        <input type="date" value={recordDate} max={todayStr} aria-label="기록할 날짜"
          onChange={e=>setRecordDate(e.target.value)}
          style={{flex:1,minWidth:0,fontSize:'12px'}} />
        <button className="btn btn-sm" style={{background:'var(--accent)',color:'#111827',border:'1px solid var(--accent)',whiteSpace:'nowrap'}}
          onClick={()=>recordAttendanceStatus(recordDate||todayStr,'attended')}>출석</button>
        <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.25)',whiteSpace:'nowrap'}}
          onClick={()=>recordAttendanceStatus(recordDate||todayStr,'noshow')}>노쇼</button>
        <button className="btn btn-sm" style={{background:'var(--surface2)',color:'var(--text-muted)',border:'1px solid var(--border)',whiteSpace:'nowrap'}}
          onClick={()=>recordAttendanceStatus(recordDate||todayStr,'cancelled')}>사전취소</button>
      </div>
      <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'6px',lineHeight:1.5}}>
        날짜 선택 후 기록 (미선택 시 오늘). 출석은 세션 1회 차감, 노쇼는 {attendancePolicy?.noshow_deduct===1?'정책에 따라 세션 1회 차감':'차감 없음'}.{' '}
        <span onClick={onOpenPolicy} style={{color:'var(--accent-text)',cursor:'pointer',fontWeight:600}}>출결 정책 설정 ›</span>
      </div>

      {attendanceDates.length>0 && (
        <div style={{marginTop:'16px'}}>
          <div className="section-label">출결 내역</div>
          {[...attendanceDates].sort((a,b)=>b.attended_date.localeCompare(a.attended_date)).map(a=>{
            const st = a.status || 'attended'
            const meta = st==='noshow' ? {label:'노쇼',c:'#ef4444',bg:'rgba(239,68,68,0.1)'}
              : st==='cancelled' ? {label:'사전취소',c:'var(--text-muted)',bg:'var(--surface2)'}
              : {label:'출석',c:'var(--accent)',bg:'rgba(200,241,53,0.1)'}
            return (
              <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
                <div style={{fontSize:'13px'}}>
                  {new Date(a.attended_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  {a.session_deducted && <span style={{fontSize:'10px',color:'#ef4444'}}>−1회</span>}
                  <span style={{fontSize:'11px',color:meta.c,background:meta.bg,padding:'2px 8px',borderRadius:'4px'}}>{meta.label}</span>
                  <button onClick={()=>toggleAttendance(a.attended_date)} style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'15px',lineHeight:1}}>×</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
