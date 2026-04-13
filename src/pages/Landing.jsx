import { Link } from 'react-router-dom'

const TRAINER_FEATURES = [
  { icon: '✦', title: 'AI 수업일지 자동 생성', desc: '녹음 파일 업로드만 하면 AI가 완성된 수업일지를 작성해줘요' },
  { icon: '👥', title: '회원 관리 올인원', desc: '상태 배지·결제 내역·정지 이력·방문 경로까지 한 곳에' },
  { icon: '📅', title: '주간 스케줄', desc: '수업·개인 일정을 블록으로 관리하고 수업 전 푸시 알림 발송' },
  { icon: '📊', title: '매출 자동 분석', desc: '세션 단가 기반 수익·미진행 세션 잔존가치를 자동 계산' },
  { icon: '⏸', title: '정지(홀딩) 관리', desc: '기간·사유·사진까지 기록하고 회원 상태에 자동 반영' },
  { icon: '🔔', title: '브라우저 종료 알림', desc: '앱을 닫아도 VAPID 푸시로 수업 시작 전 미리 알림' },
]

const MEMBER_FEATURES = [
  { icon: '📋', title: '수업일지 열람', desc: 'PDF 저장·복사로 내 성장 기록을 언제든 꺼내볼 수 있어요' },
  { icon: '⚖️', title: '체중·건강 추적', desc: '공복/저녁 체중, 수면 레벨을 기록하고 14일 추이를 확인' },
  { icon: '🏃', title: '개인운동 일지', desc: '60+ 종목 자동완성, 세트·볼륨 계산, 앞뒤 근육 다이어그램' },
  { icon: '🤝', title: '회원 커뮤니티', desc: '같은 센터 회원들과 운동 일상을 사진·이모지로 공유' },
]

export default function Landing() {
  return (
    <div style={{background:'#0d0d0d',color:'#fff',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden',position:'relative'}}>

      {/* ── 앰비언트 글로우 블롭 (스크롤 내내 배경에 깔림) ── */}
      <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,overflow:'hidden'}}>
        {/* 왼쪽 위 — 초록 (트레이너 섹션) */}
        <div style={{position:'absolute',top:'20%',left:'-15%',width:'700px',height:'600px',background:'radial-gradient(ellipse,rgba(200,241,53,0.055) 0%,transparent 65%)',transform:'rotate(-20deg)'}}/>
        {/* 오른쪽 중간 — 하늘색 (회원 섹션) */}
        <div style={{position:'absolute',top:'55%',right:'-12%',width:'650px',height:'600px',background:'radial-gradient(ellipse,rgba(79,195,247,0.045) 0%,transparent 65%)'}}/>
        {/* 하단 중앙 — 주황 (커뮤니티 / 포털 섹션) */}
        <div style={{position:'absolute',bottom:'8%',left:'25%',width:'600px',height:'400px',background:'radial-gradient(ellipse,rgba(255,152,0,0.03) 0%,transparent 65%)'}}/>
        {/* 전체 노이즈 텍스처 (CSS SVG 패턴) */}
        <div style={{position:'absolute',inset:0,opacity:0.018,backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,backgroundSize:'200px'}}/>
      </div>

      {/* ── HERO ─────────────────────────────────────── */}
      <section style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 24px 40px',textAlign:'center',position:'relative',overflow:'hidden'}}>
        {/* 배경 사진 — 트레이너 코칭 */}
        <div style={{position:'absolute',inset:0,backgroundImage:'url(https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1920&q=80)',backgroundSize:'cover',backgroundPosition:'center top',zIndex:0}}></div>
        {/* 다크 오버레이 — 상단 진하게, 중간 살짝 투명, 하단 다시 진하게 */}
        <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(13,13,13,0.82) 0%,rgba(13,13,13,0.55) 45%,rgba(13,13,13,0.90) 100%)',zIndex:1}}></div>
        {/* 하단 페이드아웃 — 다음 섹션과 자연스럽게 연결 */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:'180px',background:'linear-gradient(transparent,#0d0d0d)',zIndex:2}}></div>

        {/* 콘텐츠 */}
        <div style={{position:'relative',zIndex:3,display:'flex',flexDirection:'column',alignItems:'center'}}>
          <div style={{fontSize:'13px',fontWeight:600,letterSpacing:'0.12em',color:'#c8f135',marginBottom:'20px',background:'rgba(200,241,53,0.1)',padding:'5px 14px',borderRadius:'20px',border:'1px solid rgba(200,241,53,0.25)',backdropFilter:'blur(8px)'}}>
            FOR PERSONAL TRAINERS
          </div>

          <div style={{fontSize:'clamp(36px,8vw,72px)',fontWeight:900,letterSpacing:'-2px',lineHeight:1,marginBottom:'16px',textShadow:'0 2px 20px rgba(0,0,0,0.5)'}}>
            TRAINER<span style={{color:'#c8f135'}}>LOG</span>
          </div>

          <h1 style={{fontSize:'clamp(18px,4vw,28px)',fontWeight:700,lineHeight:1.4,margin:'0 0 16px',maxWidth:'520px',letterSpacing:'-0.5px',textShadow:'0 2px 12px rgba(0,0,0,0.6)'}}>
            트레이너의 시간을 아껴주는<br/>스마트 피트니스 플랫폼
          </h1>

          <p style={{fontSize:'14px',color:'rgba(255,255,255,0.72)',lineHeight:1.8,marginBottom:'36px',maxWidth:'380px',textShadow:'0 1px 8px rgba(0,0,0,0.5)'}}>
            AI가 수업일지를 대신 써주고, 회원은 포털에서 직접 기록을 확인해요.<br/>
            매출·스케줄·건강까지 모든 것이 연결됩니다.
          </p>

          <div style={{display:'flex',gap:'12px',flexWrap:'wrap',justifyContent:'center',marginBottom:'60px'}}>
            <Link to="/trainer" style={{background:'#c8f135',color:'#0d0d0d',padding:'14px 28px',borderRadius:'12px',fontWeight:700,fontSize:'14px',textDecoration:'none',letterSpacing:'-0.3px',boxShadow:'0 4px 24px rgba(200,241,53,0.35)'}}>
              트레이너 시작하기 →
            </Link>
            <Link to="/member" style={{background:'rgba(255,255,255,0.12)',color:'#fff',padding:'14px 28px',borderRadius:'12px',fontWeight:600,fontSize:'14px',textDecoration:'none',border:'1px solid rgba(255,255,255,0.25)',backdropFilter:'blur(8px)'}}>
              회원 포털 입장
            </Link>
          </div>
          {/* 스탯 바 */}
          <div style={{position:'relative',zIndex:3,display:'flex',gap:'0',background:'rgba(13,13,13,0.55)',backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'16px',overflow:'hidden',maxWidth:'480px',width:'100%'}}>
            {[['AI 자동', '수업일지 완성'],['실시간','트레이너↔회원 연결'],['전부 자동','매출·세션 계산']].map(([big,small],i)=>(
              <div key={i} style={{flex:1,padding:'16px 12px',textAlign:'center',borderRight:i<2?'1px solid rgba(255,255,255,0.1)':'none'}}>
                <div style={{fontSize:'16px',fontWeight:800,color:'#c8f135',marginBottom:'3px'}}>{big}</div>
                <div style={{fontSize:'10px',color:'rgba(255,255,255,0.5)',lineHeight:1.4}}>{small}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 트레이너 기능 ─────────────────────────────── */}
      <section style={{padding:'80px 24px',maxWidth:'680px',margin:'0 auto'}}>
        <div style={{marginBottom:'40px'}}>
          <div style={{fontSize:'11px',fontWeight:600,letterSpacing:'0.1em',color:'#c8f135',marginBottom:'10px'}}>TRAINER APP</div>
          <h2 style={{fontSize:'clamp(22px,5vw,32px)',fontWeight:800,letterSpacing:'-1px',margin:0,lineHeight:1.2}}>
            트레이너를 위한 6가지 핵심 기능
          </h2>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'12px'}}>
          {TRAINER_FEATURES.map((f,i)=>(
            <div key={i} style={{background:'#161616',border:'1px solid #222',borderRadius:'14px',padding:'20px',transition:'border-color 0.2s'}}>
              <div style={{fontSize:'24px',marginBottom:'10px'}}>{f.icon}</div>
              <div style={{fontSize:'14px',fontWeight:700,marginBottom:'6px',letterSpacing:'-0.3px'}}>{f.title}</div>
              <div style={{fontSize:'12px',color:'#666',lineHeight:1.65}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI 수업일지 하이라이트 ──────────────────────── */}
      <section style={{padding:'0 24px 80px',maxWidth:'680px',margin:'0 auto'}}>
        <div style={{background:'linear-gradient(135deg,#161616 0%,#1a1f0a 100%)',border:'1px solid rgba(200,241,53,0.2)',borderRadius:'20px',padding:'32px',display:'flex',flexDirection:'column',gap:'16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'28px'}}>✦</span>
            <span style={{fontSize:'13px',fontWeight:700,color:'#c8f135',letterSpacing:'0.05em'}}>AI POWERED</span>
          </div>
          <div style={{fontSize:'clamp(18px,4vw,24px)',fontWeight:800,lineHeight:1.3,letterSpacing:'-0.5px'}}>
            수업 후 녹음 파일만 올리면<br/>수업일지가 완성됩니다
          </div>
          <div style={{fontSize:'13px',color:'#888',lineHeight:1.8}}>
            Gemini AI가 음성을 분석해 운동 종목·세트·느낀점을 자동으로 일지로 변환해요.
            완성된 일지는 카카오톡으로 회원에게 즉시 전달됩니다.
          </div>
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
            {['녹음 업로드','AI 분석','일지 완성','카카오 발송'].map((step,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                <span style={{background:'rgba(200,241,53,0.15)',color:'#c8f135',borderRadius:'50%',width:'20px',height:'20px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,flexShrink:0}}>{i+1}</span>
                <span style={{fontSize:'12px',color:'#aaa'}}>{step}</span>
                {i<3 && <span style={{color:'#333',fontSize:'12px'}}>›</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 회원 포털 기능 ────────────────────────────── */}
      <section style={{padding:'0 24px 80px',maxWidth:'680px',margin:'0 auto'}}>
        <div style={{marginBottom:'32px'}}>
          <div style={{fontSize:'11px',fontWeight:600,letterSpacing:'0.1em',color:'#4fc3f7',marginBottom:'10px'}}>MEMBER PORTAL</div>
          <h2 style={{fontSize:'clamp(22px,5vw,32px)',fontWeight:800,letterSpacing:'-1px',margin:0,lineHeight:1.2}}>
            회원이 직접 기록하고 확인하는 공간
          </h2>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'12px'}}>
          {MEMBER_FEATURES.map((f,i)=>(
            <div key={i} style={{background:'#161616',border:'1px solid #222',borderRadius:'14px',padding:'20px'}}>
              <div style={{fontSize:'24px',marginBottom:'10px'}}>{f.icon}</div>
              <div style={{fontSize:'14px',fontWeight:700,marginBottom:'6px',letterSpacing:'-0.3px'}}>{f.title}</div>
              <div style={{fontSize:'12px',color:'#666',lineHeight:1.65}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 근육 다이어그램 하이라이트 ─────────────────── */}
      <section style={{padding:'0 24px 80px',maxWidth:'680px',margin:'0 auto'}}>
        <div style={{background:'#161616',border:'1px solid #222',borderRadius:'20px',padding:'32px',display:'grid',gridTemplateColumns:'1fr auto',gap:'24px',alignItems:'center'}}>
          <div>
            <div style={{fontSize:'11px',fontWeight:600,letterSpacing:'0.1em',color:'#22c55e',marginBottom:'12px'}}>PERSONAL WORKOUT</div>
            <div style={{fontSize:'clamp(16px,3.5vw,22px)',fontWeight:800,lineHeight:1.3,marginBottom:'12px',letterSpacing:'-0.5px'}}>
              60+ 운동 종목<br/>근육 다이어그램 제공
            </div>
            <div style={{fontSize:'12px',color:'#666',lineHeight:1.8}}>
              종목 입력 시 주동근·보조근을 앞뒤 신체 이미지로 표시해요.
              세트·무게·볼륨이 자동 계산됩니다.
            </div>
            <div style={{display:'flex',gap:'6px',marginTop:'14px',flexWrap:'wrap'}}>
              {['가슴','등','어깨','하체','코어'].map((m,i)=>{
                const c = ['#ef4444','#3b82f6','#8b5cf6','#22c55e','#eab308'][i]
                return <span key={m} style={{fontSize:'11px',padding:'3px 9px',borderRadius:'6px',background:c+'22',color:c,border:`1px solid ${c}44`}}>{m}</span>
              })}
            </div>
          </div>
          {/* 미니 SVG 바디 */}
          <div style={{display:'flex',gap:'8px',opacity:0.85}}>
            <svg width="48" height="110" viewBox="0 0 80 180">
              <circle cx="40" cy="12" r="11" fill="#2a2a2a"/>
              <rect x="35" y="22" width="10" height="8" rx="2" fill="#2a2a2a"/>
              <ellipse cx="21" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
              <ellipse cx="59" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
              <path d="M30 32 Q40 37 50 32 L52 65 Q40 69 28 65 Z" fill="#ef4444"/>
              <rect x="29" y="65" width="22" height="28" rx="3" fill="#eab308"/>
              <ellipse cx="15" cy="57" rx="6" ry="14" fill="#f97316"/>
              <ellipse cx="65" cy="57" rx="6" ry="14" fill="#f97316"/>
              <ellipse cx="14" cy="80" rx="5" ry="11" fill="#2a2a2a"/>
              <ellipse cx="66" cy="80" rx="5" ry="11" fill="#2a2a2a"/>
              <ellipse cx="32" cy="120" rx="11" ry="19" fill="#22c55e"/>
              <ellipse cx="48" cy="120" rx="11" ry="19" fill="#22c55e"/>
              <ellipse cx="31" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.7"/>
              <ellipse cx="49" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.7"/>
            </svg>
            <svg width="48" height="110" viewBox="0 0 80 180">
              <circle cx="40" cy="12" r="11" fill="#2a2a2a"/>
              <rect x="35" y="22" width="10" height="8" rx="2" fill="#2a2a2a"/>
              <ellipse cx="21" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
              <ellipse cx="59" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
              <path d="M28 32 Q40 37 52 32 L54 65 Q40 70 26 65 Z" fill="#3b82f6"/>
              <rect x="29" y="65" width="22" height="14" rx="3" fill="#3b82f6" opacity="0.6"/>
              <rect x="29" y="80" width="22" height="13" rx="3" fill="#eab308" opacity="0.5"/>
              <ellipse cx="15" cy="57" rx="6" ry="14" fill="#06b6d4"/>
              <ellipse cx="65" cy="57" rx="6" ry="14" fill="#06b6d4"/>
              <ellipse cx="14" cy="80" rx="5" ry="11" fill="#2a2a2a"/>
              <ellipse cx="66" cy="80" rx="5" ry="11" fill="#2a2a2a"/>
              <ellipse cx="32" cy="120" rx="11" ry="19" fill="#22c55e"/>
              <ellipse cx="48" cy="120" rx="11" ry="19" fill="#22c55e"/>
              <ellipse cx="31" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.7"/>
              <ellipse cx="49" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.7"/>
            </svg>
          </div>
        </div>
      </section>

      {/* ── 포털 입장 카드 ────────────────────────────── */}
      <section style={{padding:'0 24px 80px',maxWidth:'680px',margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:'32px'}}>
          <h2 style={{fontSize:'clamp(20px,4vw,28px)',fontWeight:800,letterSpacing:'-0.5px',margin:'0 0 8px'}}>
            어떤 역할로 시작할까요?
          </h2>
          <p style={{fontSize:'13px',color:'#666',margin:0}}>포털을 선택해 바로 시작할 수 있어요</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'}}>
          <Link to="/trainer" style={{background:'linear-gradient(135deg,#161616,#1a1f0a)',border:'1px solid rgba(200,241,53,0.25)',borderRadius:'16px',padding:'28px 20px',textAlign:'center',textDecoration:'none',color:'#fff',display:'block',transition:'all 0.2s'}}>
            <div style={{fontSize:'32px',marginBottom:'12px'}}>💪</div>
            <div style={{fontSize:'16px',fontWeight:700,marginBottom:'6px'}}>트레이너 앱</div>
            <div style={{fontSize:'11px',color:'#888',lineHeight:1.6}}>수업일지 · 회원관리<br/>스케줄 · 매출</div>
            <div style={{marginTop:'14px',fontSize:'12px',color:'#c8f135',fontWeight:600}}>시작하기 →</div>
          </Link>
          <Link to="/member" style={{background:'linear-gradient(135deg,#161616,#0d1a1a)',border:'1px solid rgba(79,195,247,0.2)',borderRadius:'16px',padding:'28px 20px',textAlign:'center',textDecoration:'none',color:'#fff',display:'block',transition:'all 0.2s'}}>
            <div style={{fontSize:'32px',marginBottom:'12px'}}>🏃</div>
            <div style={{fontSize:'16px',fontWeight:700,marginBottom:'6px'}}>회원 포털</div>
            <div style={{fontSize:'11px',color:'#888',lineHeight:1.6}}>수업일지 · 체중관리<br/>개인운동 · 커뮤니티</div>
            <div style={{marginTop:'14px',fontSize:'12px',color:'#4fc3f7',fontWeight:600}}>입장하기 →</div>
          </Link>
        </div>
        <Link to="/community" style={{background:'linear-gradient(135deg,#161616,#1a1410)',border:'1px solid rgba(255,152,0,0.2)',borderRadius:'16px',padding:'22px 28px',textDecoration:'none',color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
            <div style={{fontSize:'32px'}}>🤝</div>
            <div>
              <div style={{fontSize:'15px',fontWeight:700,marginBottom:'4px'}}>커뮤니티</div>
              <div style={{fontSize:'11px',color:'#888'}}>트레이너 구인 · 구직 · 센터 매칭</div>
            </div>
          </div>
          <div style={{fontSize:'12px',color:'#ff9800',fontWeight:600,flexShrink:0}}>입장하기 →</div>
        </Link>
      </section>

      {/* ── FOOTER ───────────────────────────────────── */}
      <footer style={{borderTop:'1px solid #1a1a1a',padding:'24px',textAlign:'center'}}>
        <div style={{fontSize:'14px',fontWeight:800,letterSpacing:'-0.5px',marginBottom:'12px',color:'#333'}}>
          TRAINER<span style={{color:'#c8f135'}}>LOG</span>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:'20px',marginBottom:'16px'}}>
          <Link to="/trainer" style={{fontSize:'12px',color:'#444',textDecoration:'none'}}>트레이너 앱</Link>
          <Link to="/member" style={{fontSize:'12px',color:'#444',textDecoration:'none'}}>회원 포털</Link>
          <Link to="/community" style={{fontSize:'12px',color:'#444',textDecoration:'none'}}>커뮤니티</Link>
          <Link to="/admin" style={{fontSize:'12px',color:'#333',textDecoration:'none'}}>관리자</Link>
        </div>
        <div style={{fontSize:'11px',color:'#2a2a2a',fontFamily:"'DM Mono',monospace"}}>v2.0 · TrainerLog</div>
      </footer>
    </div>
  )
}
