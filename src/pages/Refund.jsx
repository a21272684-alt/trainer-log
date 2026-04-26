const S = {
  wrap: { background: '#f8fafc', minHeight: '100vh', fontFamily: "'Noto Sans KR', sans-serif", color: '#0f172a' },
  nav: { position: 'sticky', top: 0, zIndex: 100, background: 'rgba(248,250,252,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #e2e8f0', padding: '0 20px' },
  navInner: { maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '54px' },
  logo: { fontSize: '17px', fontWeight: 900, letterSpacing: '-0.5px', color: '#111', textDecoration: 'none' },
  logoSpan: { background: '#c8f135', color: '#111', padding: '1px 7px', borderRadius: '5px', marginLeft: '2px' },
  backBtn: { fontSize: '13px', fontWeight: 600, color: '#64748b', textDecoration: 'none' },
  body: { maxWidth: '800px', margin: '0 auto', padding: '48px 24px 80px' },
  header: { marginBottom: '48px', paddingBottom: '24px', borderBottom: '2px solid #e2e8f0' },
  badge: { display: 'inline-block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#3f6212', background: 'rgba(200,241,53,0.3)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(132,204,22,0.5)', marginBottom: '16px' },
  title: { fontSize: '28px', fontWeight: 900, letterSpacing: '-1px', margin: '0 0 8px' },
  meta: { fontSize: '13px', color: '#64748b', margin: 0 },
  section: { marginBottom: '40px' },
  h2: { fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 16px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' },
  h3: { fontSize: '15px', fontWeight: 700, margin: '20px 0 8px', color: '#1e293b' },
  p: { fontSize: '14px', lineHeight: 1.85, color: '#334155', margin: '0 0 12px' },
  ul: { fontSize: '14px', lineHeight: 1.85, color: '#334155', paddingLeft: '20px', margin: '0 0 12px' },
  li: { marginBottom: '6px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' },
  th: { background: '#f1f5f9', padding: '10px 14px', textAlign: 'left', fontWeight: 700, borderBottom: '2px solid #e2e8f0', color: '#334155' },
  td: { padding: '10px 14px', borderBottom: '1px solid #e2e8f0', color: '#334155', verticalAlign: 'top' },
  cardGreen: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px 20px', marginBottom: '12px' },
  cardRed: { background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '16px 20px', marginBottom: '12px' },
  cardYellow: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' },
  cardTitle: { fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: '#0f172a' },
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
}

export default function Refund() {
  return (
    <div style={S.wrap}>
      <nav style={S.nav}>
        <div style={S.navInner}>
          <a href="/" style={S.logo}>오운</a>
          <a href="/" style={S.backBtn}>← 홈으로</a>
        </div>
      </nav>

      <div style={S.body}>
        <div style={S.header}>
          <div style={S.badge}>LEGAL</div>
          <h1 style={S.title}>환불정책</h1>
          <p style={S.meta}>시행일: 2026년 5월 1일 · 버전: 1.0</p>
        </div>

        <div style={S.cardYellow}>
          <strong>📌 안내</strong>&nbsp; 본 정책은 전자상거래 등에서의 소비자보호에 관한 법률 및 콘텐츠산업 진흥법을 기반으로 작성되었습니다.<br />
          환불 문의: <strong>support@trainerlog.app</strong>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제1조 (구독 플랜 환불 — Pro · Premium)</h2>
          <p style={S.p}>Pro(₩9,900/월)·Premium(₩19,900/월) 플랜은 결제 즉시 서비스가 제공되는 디지털 구독 상품입니다.</p>

          <div style={S.cardGreen}>
            <div style={S.cardTitle}>✅ 전액 환불 가능</div>
            <ul style={S.ul}>
              <li style={S.li}>결제일로부터 7일 이내이며 AI 수업일지 등 유료 기능을 전혀 사용하지 않은 경우</li>
              <li style={S.li}>서비스 중대 결함으로 핵심 기능을 7일 이상 연속 이용하지 못한 경우</li>
            </ul>
          </div>

          <div style={S.cardGreen}>
            <div style={S.cardTitle}>⚖️ 부분 환불</div>
            <ul style={S.ul}>
              <li style={S.li}>결제일로부터 7일 이내이나 일부 유료 기능을 이미 사용한 경우: 미사용 일수에 비례하여 일할 계산</li>
              <li style={S.li}><strong>환불액 = 결제액 × (잔여일 ÷ 해당 월 총일수)</strong></li>
            </ul>
          </div>

          <div style={S.cardRed}>
            <div style={{ ...S.cardTitle, color: '#9f1239' }}>❌ 환불 불가</div>
            <ul style={S.ul}>
              <li style={S.li}>결제일로부터 7일 초과 후 환불 요청</li>
              <li style={S.li}>이용자의 단순 변심 (7일 경과 후)</li>
              <li style={S.li}>이용약관 위반으로 계정이 정지·삭제된 경우</li>
            </ul>
          </div>

          <h3 style={S.h3}>구독 해지</h3>
          <p style={S.p}>구독 해지는 언제든지 가능하며, 해지 시 당월 결제 기간 종료까지 서비스를 이용할 수 있습니다. 해지 후 자동 갱신은 중단됩니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제2조 (에듀케이터 마켓 — 콘텐츠 구매)</h2>
          <p style={S.p}>에듀케이터 마켓의 루틴·프로그램·영양 정보 등 디지털 콘텐츠는 구매 즉시 열람 가능한 디지털 재화입니다.</p>

          <div style={S.cardGreen}>
            <div style={S.cardTitle}>✅ 환불 가능</div>
            <ul style={S.ul}>
              <li style={S.li}>콘텐츠를 열람하지 않은 경우, 구매일로부터 7일 이내 전액 환불</li>
              <li style={S.li}>콘텐츠 설명과 실제 내용이 현저히 다른 경우</li>
              <li style={S.li}>기술적 오류로 콘텐츠 접근이 불가능한 경우</li>
            </ul>
          </div>

          <div style={S.cardRed}>
            <div style={{ ...S.cardTitle, color: '#9f1239' }}>❌ 환불 불가</div>
            <ul style={S.ul}>
              <li style={S.li}>콘텐츠를 열람·다운로드한 이후 단순 변심</li>
              <li style={S.li}>구매 후 7일 초과</li>
            </ul>
          </div>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제3조 (환불 신청 방법 및 처리 기간)</h2>
          <table style={S.table}>
            <thead><tr><th style={S.th}>단계</th><th style={S.th}>내용</th></tr></thead>
            <tbody>
              <tr>
                <td style={S.td}><strong>1. 환불 신청</strong></td>
                <td style={S.td}>
                  <strong>support@trainerlog.app</strong> 으로 아래 정보 포함 발송<br />
                  · 이름 / 가입 전화번호 · 결제일 및 결제 금액 · 환불 사유
                </td>
              </tr>
              <tr>
                <td style={S.td}><strong>2. 검토</strong></td>
                <td style={S.td}>접수 후 3 영업일 이내 검토 완료 및 결과 안내</td>
              </tr>
              <tr>
                <td style={S.td}><strong>3. 환불 처리</strong></td>
                <td style={S.td}>승인 후 원결제 수단으로 3~5 영업일 이내 처리<br />(카드사 정책에 따라 최대 7 영업일 소요 가능)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제4조 (Free 플랜)</h2>
          <p style={S.p}>Free 플랜은 무료 서비스로 환불 대상이 아닙니다. 언제든지 계정을 삭제할 수 있습니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제5조 (소비자 분쟁 해결)</h2>
          <ul style={S.ul}>
            <li style={S.li}>한국소비자원: www.kca.go.kr / 1372</li>
            <li style={S.li}>전자상거래 분쟁조정위원회: www.ecmc.or.kr</li>
            <li style={S.li}>콘텐츠분쟁조정위원회: www.kcdrc.kr / 1588-2201</li>
          </ul>
        </div>

        <p style={S.footer}>
          이 정책은 2026년 5월 1일부터 시행됩니다.<br />
          <a href="/terms" style={{ color: '#64748b' }}>이용약관</a>
          &nbsp;·&nbsp;
          <a href="/privacy" style={{ color: '#64748b' }}>개인정보처리방침</a>
          &nbsp;·&nbsp;
          <a href="/" style={{ color: '#64748b' }}>홈으로</a>
        </p>
      </div>
    </div>
  )
}
