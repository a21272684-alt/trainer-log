import { Link } from 'react-router-dom'

// iOS 앱(Capacitor) 첫 화면 — 역할 선택.
// 웹·안드로이드는 '/' 에서 마케팅 랜딩을 그대로 보여주고, iOS 앱만 이 화면으로 시작한다.
//  - 앱을 켜자마자 웹사이트(랜딩)가 뜨면 '웹사이트를 감싼 앱'으로 보여 심사 4.2 위험
//  - 심사관이 '회원 포털'로 Apple 로그인했다가 미등록 회원이라 튕긴 사례(2026-10-13 2.1(a)) →
//    처음 쓰는 사람은 트레이너로 시작하도록 안내하고, 회원 버튼엔 이용 조건을 명시
export default function NativeStart() {
  return (
    <div className="login-wrap">
      <div style={{width:'100%',maxWidth:'400px'}}>
        <div style={{background:'#fff',border:'1px solid #E1E4D9',borderRadius:'22px',
          padding:'40px 28px 32px',boxShadow:'0 8px 40px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04)'}}>

          <div style={{marginBottom:'28px'}}>
            <div style={{fontSize:'22px',fontWeight:900,letterSpacing:'-0.5px',color:'#111',marginBottom:'6px'}}>
              오<span style={{background:'#c8f135',color:'#111',padding:'1px 7px',borderRadius:'5px',marginLeft:'2px'}}>운</span>
            </div>
            <div style={{fontSize:'13px',color:'#6B7280'}}>트레이너와 회원을 위한 수업 관리 앱</div>
          </div>

          <Link to="/trainer" style={{display:'block',textDecoration:'none',background:'#c8f135',
            borderRadius:'14px',padding:'18px 18px 16px',marginBottom:'12px',
            boxShadow:'0 4px 16px rgba(200,241,53,0.35)'}}>
            <div style={{fontSize:'16px',fontWeight:800,color:'#111',marginBottom:'4px'}}>트레이너로 시작하기 →</div>
            <div style={{fontSize:'12.5px',color:'#3f4a1a',lineHeight:1.5}}>처음 사용하신다면 여기서 무료로 시작하세요</div>
          </Link>

          <Link to="/member" style={{display:'block',textDecoration:'none',background:'#fff',
            border:'1px solid #E1E4D9',borderRadius:'14px',padding:'18px 18px 16px'}}>
            <div style={{fontSize:'16px',fontWeight:800,color:'#111',marginBottom:'4px'}}>회원 로그인 →</div>
            <div style={{fontSize:'12.5px',color:'#6B7280',lineHeight:1.5}}>담당 트레이너가 등록한 회원만 이용할 수 있어요</div>
          </Link>

          <div style={{textAlign:'center',marginTop:'22px'}}>
            <Link to="/intro" style={{fontSize:'13px',color:'#4d7c0f',fontWeight:600,textDecoration:'none'}}>
              오운 소개 보기
            </Link>
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:'14px',fontSize:'12px',color:'#9CA3AF'}}>
          <Link to="/terms" style={{color:'#9CA3AF'}}>이용약관</Link>
          <span style={{margin:'0 8px'}}>·</span>
          <Link to="/privacy" style={{color:'#9CA3AF'}}>개인정보처리방침</Link>
        </div>
      </div>
    </div>
  )
}
