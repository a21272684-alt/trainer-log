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
  highlight: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#1e40af', marginBottom: '16px' },
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
}

export default function Privacy() {
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
          <h1 style={S.title}>개인정보처리방침</h1>
          <p style={S.meta}>시행일: 2026년 5월 1일 · 버전: 1.0</p>
        </div>

        <div style={S.highlight}>
          트레이너로그(이하 "회사")는 개인정보 보호법, 정보통신망 이용촉진 및 정보보호 등에 관한 법률을 준수하며,
          이용자의 개인정보를 안전하게 보호하기 위해 최선을 다하고 있습니다.
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제1조 (처리하는 개인정보 항목 및 수집 방법)</h2>
          <h3 style={S.h3}>1. 트레이너</h3>
          <table style={S.table}>
            <thead><tr><th style={S.th}>항목</th><th style={S.th}>수집 목적</th><th style={S.th}>필수 여부</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>이름, 전화번호</td><td style={S.td}>계정 식별 및 인증</td><td style={S.td}>필수</td></tr>
              <tr><td style={S.td}>플랜 정보, AI 사용량</td><td style={S.td}>서비스 이용 한도 관리</td><td style={S.td}>자동 수집</td></tr>
              <tr><td style={S.td}>Google Gemini API 키</td><td style={S.td}>AI 기능 연동</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>정산 정보(랭크, 인센티브율)</td><td style={S.td}>급여 정산 계산</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>푸시 알림 구독 정보</td><td style={S.td}>수업 전 알림 발송</td><td style={S.td}>선택</td></tr>
            </tbody>
          </table>
          <h3 style={S.h3}>2. 회원(Member)</h3>
          <table style={S.table}>
            <thead><tr><th style={S.th}>항목</th><th style={S.th}>수집 목적</th><th style={S.th}>필수 여부</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>이름, 전화번호</td><td style={S.td}>회원 포털 접근 인증</td><td style={S.td}>필수</td></tr>
              <tr><td style={S.td}>이메일, 카카오톡 ID</td><td style={S.td}>수업일지 전송</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>생년월일, 주소</td><td style={S.td}>회원 프로파일 관리</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>신장, 목표 체중, 시작 체중, 나이</td><td style={S.td}>건강 추적 및 AI 인사이트</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>공복/저녁 체중, 수면 레벨</td><td style={S.td}>건강 기록 및 14일 추이 분석</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>식단 기록 및 사진</td><td style={S.td}>식단 관리 및 AI 음식 분석</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>개인 운동 기록</td><td style={S.td}>운동 일지 관리</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>결제 내역, 세션 정보</td><td style={S.td}>수업 관리 및 매출 정산</td><td style={S.td}>필수(트레이너 입력)</td></tr>
              <tr><td style={S.td}>출석 기록, 정지 이력</td><td style={S.td}>회원 상태 관리</td><td style={S.td}>자동 수집</td></tr>
            </tbody>
          </table>
          <h3 style={S.h3}>3. 커뮤니티 이용자</h3>
          <table style={S.table}>
            <thead><tr><th style={S.th}>항목</th><th style={S.th}>수집 목적</th><th style={S.th}>필수 여부</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>Google 계정 정보(이름, 이메일, Google ID)</td><td style={S.td}>OAuth 인증 및 계정 식별</td><td style={S.td}>필수</td></tr>
              <tr><td style={S.td}>역할(트레이너/회원/강사/헬스장 운영자)</td><td style={S.td}>서비스 맞춤 제공</td><td style={S.td}>필수</td></tr>
              <tr><td style={S.td}>지역, 소개, 전화번호</td><td style={S.td}>프로필 공개 및 구인·구직 활동</td><td style={S.td}>선택</td></tr>
              <tr><td style={S.td}>구매 내역</td><td style={S.td}>콘텐츠 접근 권한 관리</td><td style={S.td}>자동 수집</td></tr>
            </tbody>
          </table>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제2조 (처리 목적 및 보유 기간)</h2>
          <table style={S.table}>
            <thead><tr><th style={S.th}>처리 목적</th><th style={S.th}>보유 기간</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>회원가입 및 서비스 이용 관리</td><td style={S.td}>회원 탈퇴 시까지</td></tr>
              <tr><td style={S.td}>결제·정산 기록</td><td style={S.td}>5년 (전자상거래법)</td></tr>
              <tr><td style={S.td}>불만 처리 및 분쟁 해결</td><td style={S.td}>3년 (전자상거래법)</td></tr>
              <tr><td style={S.td}>건강·운동 기록</td><td style={S.td}>탈퇴 시 즉시 파기</td></tr>
              <tr><td style={S.td}>AI 사용 로그</td><td style={S.td}>12개월</td></tr>
              <tr><td style={S.td}>커뮤니티 게시물</td><td style={S.td}>삭제 요청 시까지</td></tr>
            </tbody>
          </table>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제3조 (개인정보의 제3자 제공)</h2>
          <p style={S.p}>회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우 또는 법령에 의거한 경우는 예외입니다.</p>
          <p style={S.p}>트레이너가 등록한 회원 정보는 해당 트레이너 계정의 범위 내에서만 처리되며, 타 트레이너와 공유되지 않습니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제4조 (개인정보 처리 위탁)</h2>
          <table style={S.table}>
            <thead><tr><th style={S.th}>수탁 업체</th><th style={S.th}>위탁 업무 내용</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>Supabase Inc.</td><td style={S.td}>데이터베이스 저장·관리, 파일 스토리지</td></tr>
              <tr><td style={S.td}>Google LLC (Gemini API)</td><td style={S.td}>AI 수업일지 생성, 음식 분석, 회원 인사이트</td></tr>
              <tr><td style={S.td}>Google LLC (OAuth)</td><td style={S.td}>커뮤니티 이용자 소셜 로그인 인증</td></tr>
            </tbody>
          </table>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제5조 (정보주체의 권리)</h2>
          <p style={S.p}>이용자는 언제든지 개인정보 열람·정정·삭제·처리 정지·이식을 요청할 수 있습니다. 요청은 <strong>support@trainerlog.app</strong>으로 하시면 10 영업일 이내에 처리합니다.</p>
          <p style={S.p}>만 14세 미만 아동의 개인정보는 수집하지 않으며, 확인 시 즉시 삭제합니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제6조 (개인정보의 파기)</h2>
          <p style={S.p}>보유 기간 만료 또는 탈퇴 시 지체 없이 복구 불가능한 방법으로 영구 삭제합니다. 법령에 의한 보존 의무 정보는 해당 기간 동안 별도 보관 후 파기합니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제7조 (기술·관리적 보호 조치)</h2>
          <ul style={S.ul}>
            <li style={S.li}>데이터 전송 구간 TLS/HTTPS 암호화</li>
            <li style={S.li}>Supabase Row Level Security(RLS)로 계정별 데이터 격리</li>
            <li style={S.li}>API 키 등 민감 정보 환경변수 관리</li>
            <li style={S.li}>관리자 포털 별도 인증 접근 제어</li>
          </ul>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제8조 (쿠키 및 자동 수집 정보)</h2>
          <p style={S.p}>서비스는 별도의 쿠키를 사용하지 않으나, 브라우저 로컬 스토리지를 통해 로그인 상태를 유지합니다. 브라우저 설정을 통해 언제든지 삭제 가능합니다.</p>
          <p style={S.p}>푸시 알림 이용 시 VAPID 기반 알림 구독 정보가 저장되며, 수신 거부 시 즉시 삭제됩니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제9조 (개인정보 보호책임자)</h2>
          <table style={S.table}>
            <tbody>
              <tr><td style={{ ...S.td, fontWeight: 700, width: '140px' }}>이메일</td><td style={S.td}>privacy@trainerlog.app</td></tr>
              <tr><td style={{ ...S.td, fontWeight: 700 }}>처리 기간</td><td style={S.td}>접수 후 10 영업일 이내</td></tr>
            </tbody>
          </table>
          <p style={S.p}>개인정보 침해 관련 신고·상담 기관</p>
          <ul style={S.ul}>
            <li style={S.li}>개인정보 침해신고센터: privacy.kisa.or.kr / 118</li>
            <li style={S.li}>개인정보 분쟁조정위원회: www.kopico.go.kr / 1833-6972</li>
            <li style={S.li}>대검찰청 사이버수사과: 1301 / 경찰청 사이버안전국: 182</li>
          </ul>
        </div>

        <p style={S.footer}>
          이 방침은 2026년 5월 1일부터 시행됩니다.<br />
          <a href="/terms" style={{ color: '#64748b' }}>이용약관</a>
          &nbsp;·&nbsp;
          <a href="/refund" style={{ color: '#64748b' }}>환불정책</a>
          &nbsp;·&nbsp;
          <a href="/" style={{ color: '#64748b' }}>홈으로</a>
        </p>
      </div>
    </div>
  )
}
