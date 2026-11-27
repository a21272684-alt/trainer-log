// 트레이너 앱 — 회원 상세 '정지(홀딩)' 탭 (TrainerApp 에서 떼어냄). 등록 팝업 · 해제는 TrainerApp 이 처리.
export default function MemberHoldsTab({ holds, deleteHold, onAddHold }) {
  return (
      <div>
        {!holds.length ? (
          <div className="empty"><p>정지(홀딩) 이력이 없어요</p></div>
        ) : (
          <>
            {/* 요약 */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
              <div className="card" style={{marginBottom:0,padding:'12px'}}>
                <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'4px'}}>총 정지 횟수</div>
                <div style={{fontSize:'20px',fontWeight:700,fontVariantNumeric:'tabular-nums',color:'var(--accent-text)'}}>{holds.length}회</div>
              </div>
              <div className="card" style={{marginBottom:0,padding:'12px'}}>
                <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'4px'}}>총 정지 일수</div>
                <div style={{fontSize:'20px',fontWeight:700,fontVariantNumeric:'tabular-nums',color:'var(--accent-text)'}}>
                  {holds.reduce((s,h)=>s+Math.round((new Date(h.end_date)-new Date(h.start_date))/86400000)+1,0)}일
                </div>
              </div>
            </div>
            {/* 이력 목록 */}
            {holds.map(h => {
              const days = Math.round((new Date(h.end_date)-new Date(h.start_date))/86400000)+1
              const today = new Date().toISOString().split('T')[0]
              const isActive = h.start_date <= today && today <= h.end_date
              return (
                <div key={h.id} className="card" style={{marginBottom:'10px'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                        {isActive && <span style={{fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'4px',background:'#f97316'+'22',color:'#f97316',border:'1px solid #f9731644'}}>진행중</span>}
                        <span style={{fontSize:'13px',fontWeight:600}}>{h.start_date} ~ {h.end_date}</span>
                        <span style={{fontSize:'11px',color:'var(--text-dim)'}}>{days}일</span>
                      </div>
                      {h.product_name && (
                        <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'4px'}}>{h.product_name}</div>
                      )}
                      {h.reason && (
                        <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'6px'}}>{h.reason}</div>
                      )}
                      {h.photo_url && (
                        <img src={h.photo_url} alt="첨부사진" style={{maxWidth:'100%',maxHeight:'160px',borderRadius:'8px',objectFit:'cover',marginTop:'4px'}} />
                      )}
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)',fontSize:'11px',flexShrink:0,padding:'4px 8px'}} onClick={()=>deleteHold(h.id)}>해제</button>
                  </div>
                </div>
              )
            })}
          </>
        )}
        <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={onAddHold}>+ 정지 등록</button>
      </div>
  )
}
