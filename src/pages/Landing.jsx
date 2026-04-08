import { Link } from 'react-router-dom'
import '../styles/landing.css'

export default function Landing() {
  return (
    <div className="landing-body">
      <div className="logo">TRAINER<span>LOG</span></div>
      <div className="tagline">트레이너와 회원을 연결하는<br/>스마트 수업일지 플랫폼</div>

      <div className="cards">
        <Link to="/trainer" className="portal-card">
          <div className="portal-icon">💪</div>
          <div className="portal-title">트레이너</div>
          <div className="portal-sub">수업일지 작성<br/>회원 관리</div>
        </Link>
        <Link to="/member" className="portal-card">
          <div className="portal-icon">🏃</div>
          <div className="portal-title">회원</div>
          <div className="portal-sub">수업일지 조회<br/>체중·식단 기록</div>
        </Link>
      </div>

      <div className="admin-link"><Link to="/admin">관리자 페이지 →</Link></div>
      <div className="version">v2.0</div>
    </div>
  )
}
