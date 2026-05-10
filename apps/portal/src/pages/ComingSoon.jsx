import { Link } from 'react-router-dom'

// 베타 출시 단계 (Path B) 의 placeholder 페이지.
// CRM / Community 는 코드는 있지만 베타 첫 출시엔 미공개 → 본 컴포넌트로 대체 노출.
// 정식 출시 시점에 App.jsx 의 라우트를 원래 컴포넌트로 되돌리면 됨.
export default function ComingSoon({ title = '곧 출시 예정', emoji = '🚧', description }) {
  const defaultDesc = '오운 베타 출시 후 단계적으로 공개될 예정이에요.\n빠른 알림이 필요하시면 카카오톡 채널 @ownapp 으로 연락주세요.'

  return (
    <div style={{
      background: '#f8fafc',
      minHeight: '100vh',
      fontFamily: "'Noto Sans KR', sans-serif",
      color: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── STICKY NAV ── */}
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
          <Link to="/" style={{
            fontSize: '17px', fontWeight: 900, letterSpacing: '-0.5px',
            color: '#111', textDecoration: 'none',
          }}>
            오<span style={{
              background: '#c8f135', color: '#111',
              padding: '1px 7px', borderRadius: '5px', marginLeft: '2px',
            }}>운</span>
          </Link>
          <Link to="/" style={{
            fontSize: '13px', fontWeight: 600, color: '#64748b', textDecoration: 'none',
          }}>← 홈으로</Link>
        </div>
      </nav>

      {/* ── BODY ── */}
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
          <div style={{ fontSize: '56px', marginBottom: '20px' }}>{emoji}</div>

          <h1 style={{
            fontSize: '24px', fontWeight: 900, letterSpacing: '-0.8px',
            margin: '0 0 14px',
          }}>{title}</h1>

          <p style={{
            fontSize: '14px', lineHeight: 1.85,
            color: '#475569', margin: '0 0 32px',
            whiteSpace: 'pre-line',
          }}>{description || defaultDesc}</p>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '11px 22px', borderRadius: '10px',
              background: '#111827', color: '#fff',
              fontSize: '13px', fontWeight: 700, textDecoration: 'none',
            }}>← 홈으로</Link>
            <a
              href="https://pf.kakao.com/_ownapp"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '11px 22px', borderRadius: '10px',
                background: '#FEE500', color: '#191919',
                fontSize: '13px', fontWeight: 700, textDecoration: 'none',
              }}
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
