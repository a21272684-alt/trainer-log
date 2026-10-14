import { PORTAL_URL } from '../lib/urls'

// 공개 전 placeholder — main.jsx 의 VITE_COMMUNITY_OPEN 게이트가 닫혀 있을 때 노출.
// portal 의 ComingSoon 과 같은 모양. 커뮤니티는 별도 도메인이라 홈 링크는 PORTAL_URL 로.
export default function ComingSoon() {
  const linkStyle = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '11px 22px', borderRadius: '10px',
    fontSize: '13px', fontWeight: 700, textDecoration: 'none',
  }

  return (
    <div style={{
      background: '#f8fafc',
      minHeight: '100vh',
      fontFamily: "'Noto Sans KR', sans-serif",
      color: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(248,250,252,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #e2e8f0', padding: '0 20px',
      }}>
        <div style={{
          maxWidth: '800px', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: '54px',
        }}>
          <a href={PORTAL_URL} style={{
            fontSize: '17px', fontWeight: 900, letterSpacing: '-0.5px',
            color: '#111', textDecoration: 'none',
          }}>
            오<span style={{
              background: '#c8f135', color: '#111',
              padding: '1px 7px', borderRadius: '5px', marginLeft: '2px',
            }}>운</span>
          </a>
          <a href={PORTAL_URL} style={{
            fontSize: '13px', fontWeight: 600, color: '#64748b', textDecoration: 'none',
          }}>← 홈으로</a>
        </div>
      </nav>

      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 80px',
      }}>
        <div style={{
          maxWidth: '480px', width: '100%',
          background: '#fff', borderRadius: '20px',
          boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
          border: '1px solid #e2e8f0',
          padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>💬</div>

          <h1 style={{
            fontSize: '24px', fontWeight: 900, letterSpacing: '-0.8px',
            margin: '0 0 14px',
          }}>커뮤니티 곧 출시 예정</h1>

          <p style={{
            fontSize: '14px', lineHeight: 1.85,
            color: '#475569', margin: '0 0 32px',
            whiteSpace: 'pre-line',
          }}>{'트레이너·헬스장·교육강사가 함께하는\n피트니스 커뮤니티를 준비 중이에요.\n\n오픈 알림은 카카오톡 채널 @ownapp 으로 전해드릴게요.'}</p>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={PORTAL_URL} style={{ ...linkStyle, background: '#111827', color: '#fff' }}>
              ← 홈으로
            </a>
            <a
              href="https://pf.kakao.com/_ZGTKX"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...linkStyle, background: '#FEE500', color: '#191919' }}
            >💛 카카오톡 채널 문의</a>
          </div>

          <div style={{
            marginTop: '32px', paddingTop: '20px',
            borderTop: '1px solid #e2e8f0',
            fontSize: '12px', color: '#94a3b8',
          }}>
            이루스케일즈 (서비스명: 오운) · 대표 윤준현
          </div>
        </div>
      </div>
    </div>
  )
}
