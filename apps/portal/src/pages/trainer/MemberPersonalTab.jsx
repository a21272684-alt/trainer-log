// 트레이너 앱 — 회원 상세 '개인운동' 탭 (TrainerApp 에서 떼어냄). 기록 · 수정 · 삭제 팝업은 TrainerApp 이 처리.
import ExThumb from '../../components/ExThumb'

export default function MemberPersonalTab({
  workoutSessions, workoutRoutines, trainerLibraryRoutines, workoutDetailId, setWorkoutDetailId,
  muscleColor, onOpenRoutines, openWorkoutModal, deleteWorkoutSession,
}) {
  const now = new Date()
  const thisMonth = now.toISOString().slice(0,7)
  const monthSessions = workoutSessions.filter(s => s.workout_date?.startsWith(thisMonth))
  const monthVolume = monthSessions.reduce((s,ss)=>s+(ss.total_volume||0),0)
  return (
    <div>
      {/* 이번 달 요약 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
        {[
          ['이번 달 운동', monthSessions.length+'회', 'var(--accent)'],
          ['총 볼륨', monthVolume>=1000?(monthVolume/1000).toFixed(1)+'t':Math.round(monthVolume)+'kg', 'var(--accent)'],
          ['전체 기록', workoutSessions.length+'회', 'var(--text-muted)'],
        ].map(([label,val,color])=>(
          <div key={label} className="card" style={{marginBottom:0,padding:'10px 12px'}}>
            <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'3px'}}>{label}</div>
            <div style={{fontSize:'16px',fontWeight:700,fontVariantNumeric:'tabular-nums',color}}>{val}</div>
          </div>
        ))}
      </div>
      {/* 버튼 행 */}
      <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
        {(workoutRoutines.length > 0 || trainerLibraryRoutines.length > 0) && (
          <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:'12px'}} onClick={onOpenRoutines}>
            루틴 불러오기{trainerLibraryRoutines.length > 0 ? ` · 마켓 ${trainerLibraryRoutines.length}` : ''}
          </button>
        )}
        <button className="btn btn-primary btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>openWorkoutModal()}>+ 운동 기록</button>
      </div>
      {/* 세션 이력 */}
      {!workoutSessions.length && <div className="empty"><p>아직 개인 운동 기록이 없어요</p></div>}
      {workoutSessions.map(s => {
        const isOpen = workoutDetailId === s.id
        const exList = s.exercises || []
        const vol = s.total_volume || 0
        const dateStr = new Date(s.workout_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})
        const muscles = [...new Set(exList.map(e=>e.muscle_group).filter(Boolean))]
        return (
          <div key={s.id} className="card" style={{marginBottom:'10px',cursor:'pointer'}} onClick={()=>setWorkoutDetailId(isOpen?null:s.id)}>
            <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px',flexWrap:'wrap'}}>
                  <span style={{fontSize:'13px',fontWeight:600}}>{s.title||'운동'}</span>
                  <span style={{fontSize:'11px',color:'var(--text-dim)'}}>{dateStr}</span>
                  {s.duration_min && <span style={{fontSize:'12px',color:'var(--text-muted)'}}>{s.duration_min}분</span>}
                  {s.source === 'member' && <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'4px',background:'rgba(34,197,94,0.12)',color:'#16a34a',border:'1px solid rgba(34,197,94,0.3)'}}>회원 기록</span>}
                </div>
                <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'4px'}}>
                  {muscles.map(mg=>(
                    <span key={mg} style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(muscleColor[mg]||'#6b7280')+'22',color:muscleColor[mg]||'#6b7280',border:`1px solid ${(muscleColor[mg]||'#6b7280')}44`}}>{mg}</span>
                  ))}
                </div>
                <div style={{fontSize:'12px',color:'var(--text-muted)'}}>운동 {exList.length}종목 · 총 볼륨 {vol>=1000?(vol/1000).toFixed(1)+'t':Math.round(vol)+'kg'}</div>
              </div>
              <span style={{color:'var(--text-dim)',fontSize:'14px',flexShrink:0,marginTop:'2px'}}>{isOpen?'▲':'▼'}</span>
            </div>
            {isOpen && (
              <div style={{marginTop:'12px',borderTop:'1px solid var(--border)',paddingTop:'12px'}} onClick={e=>e.stopPropagation()}>
                {exList.map((ex,ei)=>{
                  const exVol = ex.sets.reduce((s,set)=>s+((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)),0)
                  return (
                    <div key={ei} style={{marginBottom:'10px',display:'flex',gap:'10px',alignItems:'flex-start'}}>
                      <ExThumb name={ex.name} size={44} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                          <span style={{fontSize:'13px',fontWeight:600}}>{ex.name}</span>
                          {ex.muscle_group && <span style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(muscleColor[ex.muscle_group]||'#6b7280')+'22',color:muscleColor[ex.muscle_group]||'#6b7280',border:`1px solid ${(muscleColor[ex.muscle_group]||'#6b7280')}44`}}>{ex.muscle_group}</span>}
                          <span style={{fontSize:'11px',color:'var(--text-dim)',marginLeft:'auto'}}>볼륨 {Math.round(exVol)}kg</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:'4px'}}>
                          {ex.sets.map((set,si)=>(
                            <div key={si} style={{background:'var(--surface2)',borderRadius:'6px',padding:'6px 8px',fontSize:'12px',textAlign:'center'}}>
                              <div style={{color:'var(--text-dim)',fontSize:'10px',marginBottom:'2px'}}>{si+1}세트</div>
                              <div style={{fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{set.weight||'—'}kg × {set.reps||'—'}회</div>
                              {set.rest_sec && <div style={{color:'var(--text-dim)',fontSize:'10px',marginTop:'2px'}}>휴식 {set.rest_sec}초</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {s.memo && <div style={{marginTop:'8px',fontSize:'12px',color:'var(--text-muted)',padding:'8px',background:'var(--surface2)',borderRadius:'10px'}}>{s.memo}</div>}
                <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
                  <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>openWorkoutModal(s)}>수정</button>
                  <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:'12px',color:'var(--danger)'}} onClick={()=>deleteWorkoutSession(s.id)}>삭제</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
