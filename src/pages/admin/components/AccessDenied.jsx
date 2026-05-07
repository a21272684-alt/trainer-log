// 권한 없는 탭 접근 시 표시되는 화이트 톤 접근 금지 화면
export default function AccessDenied() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '55vh',
      padding: '32px 16px',
    }}>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '20px',
        padding: '48px 52px',
        textAlign: 'center',
        maxWidth: '380px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {/* 자물쇠 아이콘 */}
        <div style={{
          width: '76px',
          height: '76px',
          background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
          border: '1.5px solid #FECACA',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '34px',
          margin: '0 auto 24px',
          userSelect: 'none',
        }}>
          🔒
        </div>

        {/* 제목 */}
        <div style={{
          fontSize: '17px',
          fontWeight: 700,
          color: '#111827',
          letterSpacing: '-0.3px',
          marginBottom: '8px',
        }}>
          접근 권한이 없습니다
        </div>

        {/* 설명 */}
        <div style={{
          fontSize: '13px',
          color: '#6B7280',
          lineHeight: 1.75,
          marginBottom: '24px',
        }}>
          이 메뉴에 접근할 권한이 없어요.<br />
          센터 대표에게 문의해주세요.
        </div>

        {/* 힌트 박스 */}
        <div style={{
          padding: '11px 16px',
          background: '#F9FAFB',
          border: '1px solid #F3F4F6',
          borderRadius: '10px',
          fontSize: '11.5px',
          color: '#9CA3AF',
          lineHeight: 1.65,
        }}>
          💡 센터 설정 → 직원 권한 관리에서<br />권한을 부여받을 수 있어요.
        </div>
      </div>
    </div>
  )
}
