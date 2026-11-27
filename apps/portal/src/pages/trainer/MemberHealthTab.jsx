// 트레이너 앱 — 회원 상세 '건강' 탭 (TrainerApp 에서 떼어냄). 조회 전용.
import Icon from '../../components/Icon'

export default function MemberHealthTab({ member, healthData }) {
  return (
      <div>
        {!healthData ? <div className="empty">불러오는 중...</div> : (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
              {[[member.target_weight,'목표 체중','var(--accent)'],[healthData.find(r=>r.morning_weight)?.morning_weight,'현재 체중','var(--text)'],[member.start_weight,'시작 체중','var(--text)'],[(member.start_weight&&healthData.find(r=>r.morning_weight)?.morning_weight?(member.start_weight-healthData.find(r=>r.morning_weight).morning_weight).toFixed(1)+'kg':'—'),'감량','var(--accent)']].map(([v,l,c],i)=>(
                <div key={i} className="card" style={{marginBottom:0,padding:'12px'}}><div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'4px'}}>{l}</div><div style={{fontSize:'18px',fontWeight:700,fontVariantNumeric:'tabular-nums',color:c}}>{v||'—'}</div></div>
              ))}
            </div>
            <div className="section-label">체중 기록</div>
            {healthData.filter(r=>r.morning_weight||r.evening_weight).slice(0,10).map(r => {
              const diff = (r.morning_weight&&r.evening_weight)?(r.evening_weight-r.morning_weight).toFixed(1):null
              const ds = new Date(r.record_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
              return (
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
                  <div style={{fontSize:'11px',color:'var(--text-dim)',fontVariantNumeric:'tabular-nums',minWidth:'40px'}}>{ds}</div>
                  <div style={{flex:1,display:'flex',gap:'16px'}}>
                    <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{r.morning_weight||'—'}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>공복</div></div>
                    <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{r.evening_weight||'—'}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>저녁</div></div>
                    {diff && <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontVariantNumeric:'tabular-nums',color:diff>0?'#ff5c5c':'#4ade80'}}>{diff>0?'+':''}{diff}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>일중증가</div></div>}
                  </div>
                  {r.sleep_level && <div style={{fontSize:'12px',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'3px'}}><Icon name="moon" size={13} />{r.sleep_level}/10</div>}
                </div>
              )
            })}
            {!healthData.filter(r=>r.morning_weight||r.evening_weight).length && <div className="empty">체중 기록 없음</div>}
          </>
        )}
      </div>
  )
}
