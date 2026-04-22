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
    <div style={{background:'#f8fafc',color:'#0f172a',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden'}}>

      {/* ── STICKY NAV ── */}
      <nav style={{position:'sticky',top:0,zIndex:100,background:'rgba(248,250,252,0.92)',backdropFilter:'blur(16px)',borderBottom:'1px solid #e2e8f0',padding:'0 20px'}}>
        <div style={{maxWidth:'800px',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',height:'54px'}}>
          <div style={{fontSize:'17px',fontWeight:900,letterSpacing:'-0.5px',color:'#111'}}>
            TRAINER<span style={{background:'#c8f135',color:'#111',padding:'1px 7px',borderRadius:'5px',marginLeft:'2px'}}>LOG</span>
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
            <Link to="/trainer" style={{fontSize:'13px',fontWeight:700,padding:'7px 16px',borderRadius:'9px',background:'#111827',color:'#fff',textDecoration:'none'}}>트레이너 앱</Link>
            <Link to="/member" style={{fontSize:'13px',fontWeight:700,padding:'7px 16px',borderRadius:'9px',background:'#c8f135',color:'#111',textDecoration:'none'}}>회원 포털</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{position:'relative',minHeight:'88vh',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',padding:'60px 24px 40px'}}>
        {/* 밝은 배경 사진 */}
        <div style={{position:'absolute',inset:0,
          backgroundImage:'url(https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1920&q=80)',
          backgroundSize:'cover',backgroundPosition:'center 30%',zIndex:0}}/>
        {/* 밝은 오버레이 — 왼쪽에서 페이드 */}
        <div style={{position:'absolute',inset:0,
          background:'linear-gradient(110deg,rgba(248,250,252,0.94) 0%,rgba(248,250,252,0.75) 45%,rgba(248,250,252,0.30) 100%)',
          zIndex:1}}/>
        {/* 하단 페이드 */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:'160px',
          background:'linear-gradient(transparent,#f8fafc)',zIndex:2}}/>

        {/* 콘텐츠 — 왼쪽 정렬 */}
        <div style={{position:'relative',zIndex:3,width:'100%',maxWidth:'800px',margin:'0 auto'}}>
          <div style={{maxWidth:'520px'}}>
            <div style={{display:'inline-block',fontSize:'11px',fontWeight:700,letterSpacing:'0.14em',
              color:'#3f6212',background:'rgba(200,241,53,0.3)',padding:'5px 14px',borderRadius:'20px',
              border:'1px solid rgba(132,204,22,0.5)',marginBottom:'22px'}}>
              FOR PERSONAL TRAINERS &amp; MEMBERS
            </div>

            <h1 style={{fontSize:'clamp(44px,9vw,80px)',fontWeight:900,letterSpacing:'-3px',
              lineHeight:0.95,color:'#0f172a',margin:'0 0 18px',textShadow:'none'}}>
              TRAINER<br/><span style={{color:'#84cc16'}}>LOG</span>
            </h1>

            <p style={{fontSize:'clamp(17px,3vw,22px)',fontWeight:700,color:'#1e293b',
              margin:'0 0 14px',lineHeight:1.4,letterSpacing:'-0.3px'}}>
              트레이너의 시간을 아껴주는<br/>스마트 피트니스 플랫폼
            </p>

            <p style={{fontSize:'14px',color:'#475569',lineHeight:1.85,margin:'0 0 36px',maxWidth:'360px'}}>
              AI가 수업일지를 대신 써주고, 회원은 포털에서 직접 기록을 확인해요.
              매출·스케줄·건강까지 모든 것이 연결됩니다.
            </p>

            <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginBottom:'36px'}}>
              <Link to="/trainer" style={{background:'#0f172a',color:'#fff',padding:'14px 28px',
                borderRadius:'12px',fontWeight:700,fontSize:'14px',textDecoration:'none',
                boxShadow:'0 4px 20px rgba(15,23,42,0.25)',letterSpacing:'-0.3px'}}>
                트레이너 시작하기 →
              </Link>
              <Link to="/member" style={{background:'#c8f135',color:'#0f172a',padding:'14px 28px',
                borderRadius:'12px',fontWeight:700,fontSize:'14px',textDecoration:'none',
                boxShadow:'0 4px 20px rgba(200,241,53,0.45)',letterSpacing:'-0.3px'}}>
                회원 포털 입장
              </Link>
            </div>

            {/* 키포인트 pills */}
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {['AI 수업일지 자동화','트레이너↔회원 실시간 연결','매출·세션 자동 계산'].map((t,i)=>(
                <span key={i} style={{fontSize:'12px',fontWeight:600,padding:'6px 13px',borderRadius:'20px',
                  background:'rgba(255,255,255,0.85)',color:'#334155',
                  border:'1px solid rgba(0,0,0,0.1)',backdropFilter:'blur(8px)'}}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 트레이너 기능 ── */}
      <section style={{background:'#fff',padding:'80px 24px'}}>
        <div style={{maxWidth:'760px',margin:'0 auto'}}>
          <div style={{marginBottom:'48px',textAlign:'center'}}>
            <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#65a30d',marginBottom:'10px'}}>TRAINER APP</div>
            <h2 style={{fontSize:'clamp(24px,5vw,36px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 12px'}}>
              트레이너를 위한 6가지 핵심 기능
            </h2>
            <p style={{fontSize:'14px',color:'#64748b',margin:0}}>모든 것을 하나의 앱으로 관리하세요</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:'16px'}}>
            {TRAINER_FEATURES.map((f,i)=>(
              <div key={i} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'16px',padding:'24px',
                boxShadow:'0 2px 12px rgba(0,0,0,0.04)',transition:'box-shadow 0.2s',cursor:'default'}}>
                <div style={{fontSize:'28px',marginBottom:'12px'}}>{f.icon}</div>
                <div style={{fontSize:'15px',fontWeight:700,color:'#0f172a',marginBottom:'8px',letterSpacing:'-0.3px'}}>{f.title}</div>
                <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.7}}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI 수업일지 하이라이트 ── */}
      <section style={{background:'#f8fafc',padding:'0 24px 80px'}}>
        <div style={{maxWidth:'760px',margin:'0 auto'}}>
          <div style={{background:'linear-gradient(135deg,#0f172a 0%,#14290a 100%)',borderRadius:'24px',padding:'40px 36px',color:'#fff',position:'relative',overflow:'hidden'}}>
            {/* 장식 블롭 */}
            <div style={{position:'absolute',top:'-60px',right:'-60px',width:'240px',height:'240px',
              background:'radial-gradient(circle,rgba(200,241,53,0.18) 0%,transparent 70%)',pointerEvents:'none'}}/>
            <div style={{position:'absolute',bottom:'-40px',left:'30%',width:'180px',height:'180px',
              background:'radial-gradient(circle,rgba(132,204,22,0.08) 0%,transparent 70%)',pointerEvents:'none'}}/>

            <div style={{position:'relative',zIndex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'18px'}}>
                <span style={{fontSize:'24px'}}>✦</span>
                <span style={{fontSize:'12px',fontWeight:700,color:'#c8f135',letterSpacing:'0.1em'}}>AI POWERED</span>
              </div>
              <div style={{fontSize:'clamp(20px,4vw,28px)',fontWeight:800,lineHeight:1.3,marginBottom:'16px',letterSpacing:'-0.5px'}}>
                수업 후 녹음 파일만 올리면<br/>수업일지가 완성됩니다
              </div>
              <div style={{fontSize:'14px',color:'rgba(255,255,255,0.65)',lineHeight:1.85,marginBottom:'28px'}}>
                Gemini AI가 음성을 분석해 운동 종목·세트·느낀점을 자동으로 일지로 변환해요.
                완성된 일지는 카카오톡으로 회원에게 즉시 전달됩니다.
              </div>
              <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
                {['녹음 업로드','AI 분석','일지 완성','카카오 발송'].map((step,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{background:'rgba(200,241,53,0.18)',color:'#c8f135',borderRadius:'50%',
                      width:'24px',height:'24px',display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:'12px',fontWeight:700,flexShrink:0,border:'1px solid rgba(200,241,53,0.3)'}}>
                      {i+1}
                    </span>
                    <span style={{fontSize:'13px',color:'rgba(255,255,255,0.8)'}}>{step}</span>
                    {i<3 && <span style={{color:'#334155',fontSize:'16px'}}>›</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 회원 포털 기능 ── */}
      <section style={{background:'#fff',padding:'0 24px 80px'}}>
        <div style={{maxWidth:'760px',margin:'0 auto'}}>
          <div style={{marginBottom:'40px',textAlign:'center'}}>
            <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#0284c7',marginBottom:'10px'}}>MEMBER PORTAL</div>
            <h2 style={{fontSize:'clamp(24px,5vw,36px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 12px'}}>
              회원이 직접 기록하고 확인하는 공간
            </h2>
            <p style={{fontSize:'14px',color:'#64748b',margin:0}}>트레이너와 연결된 나만의 건강 기록장</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:'16px'}}>
            {MEMBER_FEATURES.map((f,i)=>(
              <div key={i} style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:'16px',padding:'24px',
                boxShadow:'0 2px 8px rgba(2,132,199,0.06)'}}>
                <div style={{fontSize:'28px',marginBottom:'12px'}}>{f.icon}</div>
                <div style={{fontSize:'15px',fontWeight:700,color:'#0f172a',marginBottom:'8px',letterSpacing:'-0.3px'}}>{f.title}</div>
                <div style={{fontSize:'13px',color:'#475569',lineHeight:1.7}}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 근육 다이어그램 하이라이트 ── */}
      <section style={{background:'#f8fafc',padding:'0 24px 80px'}}>
        <div style={{maxWidth:'760px',margin:'0 auto'}}>
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'24px',padding:'36px',
            display:'grid',gridTemplateColumns:'1fr auto',gap:'28px',alignItems:'center',
            boxShadow:'0 4px 20px rgba(0,0,0,0.06)'}}>
            <div>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#16a34a',marginBottom:'14px'}}>PERSONAL WORKOUT</div>
              <div style={{fontSize:'clamp(18px,3.5vw,24px)',fontWeight:800,lineHeight:1.3,marginBottom:'14px',letterSpacing:'-0.5px',color:'#0f172a'}}>
                60+ 운동 종목<br/>근육 다이어그램 제공
              </div>
              <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.85,marginBottom:'16px'}}>
                종목 입력 시 주동근·보조근을 앞뒤 신체 이미지로 표시해요.
                세트·무게·볼륨이 자동 계산됩니다.
              </div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {['가슴','등','어깨','하체','코어'].map((m,i)=>{
                  const c = ['#ef4444','#3b82f6','#8b5cf6','#22c55e','#eab308'][i]
                  return (
                    <span key={m} style={{fontSize:'12px',padding:'4px 10px',borderRadius:'8px',
                      background:c+'18',color:c,border:`1px solid ${c}35`,fontWeight:600}}>
                      {m}
                    </span>
                  )
                })}
              </div>
            </div>
            {/* 미니 SVG 바디 — 밝은 배경용 */}
            <div style={{display:'flex',gap:'10px'}}>
              <svg width="52" height="115" viewBox="0 0 80 180">
                <circle cx="40" cy="12" r="11" fill="#e2e8f0"/>
                <rect x="35" y="22" width="10" height="8" rx="2" fill="#e2e8f0"/>
                <ellipse cx="21" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
                <ellipse cx="59" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
                <path d="M30 32 Q40 37 50 32 L52 65 Q40 69 28 65 Z" fill="#ef4444"/>
                <rect x="29" y="65" width="22" height="28" rx="3" fill="#eab308"/>
                <ellipse cx="15" cy="57" rx="6" ry="14" fill="#f97316"/>
                <ellipse cx="65" cy="57" rx="6" ry="14" fill="#f97316"/>
                <ellipse cx="14" cy="80" rx="5" ry="11" fill="#e2e8f0"/>
                <ellipse cx="66" cy="80" rx="5" ry="11" fill="#e2e8f0"/>
                <ellipse cx="32" cy="120" rx="11" ry="19" fill="#22c55e"/>
                <ellipse cx="48" cy="120" rx="11" ry="19" fill="#22c55e"/>
                <ellipse cx="31" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.6"/>
                <ellipse cx="49" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.6"/>
              </svg>
              <svg width="52" height="115" viewBox="0 0 80 180">
                <circle cx="40" cy="12" r="11" fill="#e2e8f0"/>
                <rect x="35" y="22" width="10" height="8" rx="2" fill="#e2e8f0"/>
                <ellipse cx="21" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
                <ellipse cx="59" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
                <path d="M28 32 Q40 37 52 32 L54 65 Q40 70 26 65 Z" fill="#3b82f6"/>
                <rect x="29" y="65" width="22" height="14" rx="3" fill="#3b82f6" opacity="0.5"/>
                <rect x="29" y="80" width="22" height="13" rx="3" fill="#eab308" opacity="0.4"/>
                <ellipse cx="15" cy="57" rx="6" ry="14" fill="#06b6d4"/>
                <ellipse cx="65" cy="57" rx="6" ry="14" fill="#06b6d4"/>
                <ellipse cx="14" cy="80" rx="5" ry="11" fill="#e2e8f0"/>
                <ellipse cx="66" cy="80" rx="5" ry="11" fill="#e2e8f0"/>
                <ellipse cx="32" cy="120" rx="11" ry="19" fill="#22c55e"/>
                <ellipse cx="48" cy="120" rx="11" ry="19" fill="#22c55e"/>
                <ellipse cx="31" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.6"/>
                <ellipse cx="49" cy="154" rx="8" ry="14" fill="#22c55e" opacity="0.6"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── 포털 선택 CTA ── */}
      <section style={{background:'#0f172a',padding:'80px 24px'}}>
        <div style={{maxWidth:'760px',margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:'48px'}}>
            <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#c8f135',marginBottom:'12px'}}>GET STARTED</div>
            <h2 style={{fontSize:'clamp(24px,5vw,36px)',fontWeight:800,color:'#fff',letterSpacing:'-1px',margin:'0 0 10px'}}>
              어떤 역할로 시작할까요?
            </h2>
            <p style={{fontSize:'14px',color:'rgba(255,255,255,0.5)',margin:0}}>포털을 선택해 바로 시작할 수 있어요</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
            {/* 트레이너 카드 */}
            <Link to="/trainer" style={{
              background:'linear-gradient(145deg,#1e293b,#162004)',
              border:'1px solid rgba(200,241,53,0.3)',borderRadius:'20px',padding:'32px 24px',
              textAlign:'center',textDecoration:'none',color:'#fff',display:'block',
              boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
              <div style={{fontSize:'36px',marginBottom:'14px'}}>💪</div>
              <div style={{fontSize:'17px',fontWeight:800,marginBottom:'8px',letterSpacing:'-0.5px'}}>트레이너 앱</div>
              <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)',lineHeight:1.7,marginBottom:'18px'}}>
                수업일지 · 회원관리<br/>스케줄 · 매출 분석
              </div>
              <div style={{display:'inline-block',fontSize:'13px',color:'#c8f135',fontWeight:700,
                background:'rgba(200,241,53,0.1)',padding:'7px 16px',borderRadius:'8px',
                border:'1px solid rgba(200,241,53,0.25)'}}>
                시작하기 →
              </div>
            </Link>

            {/* 회원 카드 */}
            <Link to="/member" style={{
              background:'linear-gradient(145deg,#1e293b,#041020)',
              border:'1px solid rgba(79,195,247,0.3)',borderRadius:'20px',padding:'32px 24px',
              textAlign:'center',textDecoration:'none',color:'#fff',display:'block',
              boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
              <div style={{fontSize:'36px',marginBottom:'14px'}}>🏃</div>
              <div style={{fontSize:'17px',fontWeight:800,marginBottom:'8px',letterSpacing:'-0.5px'}}>회원 포털</div>
              <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)',lineHeight:1.7,marginBottom:'18px'}}>
                수업일지 · 체중관리<br/>개인운동 · 커뮤니티
              </div>
              <div style={{display:'inline-block',fontSize:'13px',color:'#4fc3f7',fontWeight:700,
                background:'rgba(79,195,247,0.1)',padding:'7px 16px',borderRadius:'8px',
                border:'1px solid rgba(79,195,247,0.25)'}}>
                입장하기 →
              </div>
            </Link>
          </div>

          {/* 커뮤니티 와이드 카드 */}
          <Link to="/community" style={{
            background:'linear-gradient(145deg,#1e293b,#1a0d04)',
            border:'1px solid rgba(255,152,0,0.3)',borderRadius:'20px',padding:'26px 30px',
            textDecoration:'none',color:'#fff',display:'flex',alignItems:'center',
            justifyContent:'space-between',gap:'16px',boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',gap:'18px'}}>
              <div style={{fontSize:'36px'}}>🤝</div>
              <div>
                <div style={{fontSize:'16px',fontWeight:800,marginBottom:'4px',letterSpacing:'-0.5px'}}>커뮤니티</div>
                <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)'}}>트레이너 구인 · 구직 · 센터 매칭 · 수강생 모집</div>
              </div>
            </div>
            <div style={{display:'inline-block',fontSize:'13px',color:'#ff9800',fontWeight:700,
              background:'rgba(255,152,0,0.1)',padding:'7px 16px',borderRadius:'8px',
              border:'1px solid rgba(255,152,0,0.25)',flexShrink:0}}>
              입장하기 →
            </div>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{background:'#0a0f1a',borderTop:'1px solid #1e293b',padding:'28px 24px',textAlign:'center'}}>
        <div style={{fontSize:'15px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'14px',color:'#94a3b8'}}>
          TRAINER<span style={{background:'#c8f135',color:'#111',padding:'0 5px',borderRadius:'4px',marginLeft:'2px',fontSize:'13px'}}>LOG</span>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:'24px',marginBottom:'16px'}}>
          <Link to="/trainer" style={{fontSize:'12px',color:'#475569',textDecoration:'none'}}>트레이너 앱</Link>
          <Link to="/member" style={{fontSize:'12px',color:'#475569',textDecoration:'none'}}>회원 포털</Link>
          <Link to="/community" style={{fontSize:'12px',color:'#475569',textDecoration:'none'}}>커뮤니티</Link>
          <Link to="/admin" style={{fontSize:'12px',color:'#334155',textDecoration:'none'}}>관리자</Link>
        </div>
        <div style={{fontSize:'11px',color:'#1e293b',fontFamily:"'DM Mono',monospace"}}>v2.0 · TrainerLog</div>
      </footer>
    </div>
  )
}
