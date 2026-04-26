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
  highlight: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#92400e', marginBottom: '16px' },
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
}

export default function Terms() {
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
          <h1 style={S.title}>이용약관</h1>
          <p style={S.meta}>시행일: 2026년 5월 1일 · 버전: 1.0</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제1조 (목적)</h2>
          <p style={S.p}>이 약관은 오운(이하 "회사")가 제공하는 오운 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제2조 (정의)</h2>
          <ul style={S.ul}>
            <li style={S.li}><strong>"서비스"</strong>란 오운이 제공하는 트레이너·회원 피트니스 관리 플랫폼 및 커뮤니티 서비스 일체를 말합니다.</li>
            <li style={S.li}><strong>"트레이너"</strong>란 서비스에 가입하여 회원을 관리하고 AI 기능을 활용하는 개인 트레이너 또는 업체를 말합니다.</li>
            <li style={S.li}><strong>"회원(Member)"</strong>란 트레이너가 등록한 피트니스 이용자로, 회원 포털에 접근할 수 있는 이용자를 말합니다.</li>
            <li style={S.li}><strong>"커뮤니티 이용자"</strong>란 트레이너·회원·강사·헬스장 운영자 역할로 커뮤니티 서비스를 이용하는 자를 말합니다.</li>
            <li style={S.li}><strong>"유료 플랜"</strong>이란 월정액 구독료를 납부하고 이용하는 Pro·Premium 플랜을 말합니다.</li>
            <li style={S.li}><strong>"콘텐츠"</strong>란 서비스 내 유통되는 루틴·프로그램·영양 정보 등 디지털 재화를 말합니다.</li>
          </ul>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제3조 (약관의 효력 및 변경)</h2>
          <p style={S.p}>① 이 약관은 서비스 화면에 게시하거나 이용자에게 통지함으로써 효력이 발생합니다.</p>
          <p style={S.p}>② 회사는 관련 법령에 위배되지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일 7일 전(이용자에게 불리한 변경은 30일 전)에 공지합니다.</p>
          <p style={S.p}>③ 변경 약관 시행 후 계속 서비스를 이용할 경우 변경에 동의한 것으로 간주됩니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제4조 (서비스 제공 및 이용)</h2>
          <h3 style={S.h3}>1. 제공 서비스</h3>
          <ul style={S.ul}>
            <li style={S.li}>트레이너 앱: 회원 관리, AI 수업일지 자동 생성, 주간 스케줄, 매출 분석, 정지 관리, 푸시 알림</li>
            <li style={S.li}>회원 포털: 수업일지 열람·PDF 저장, 체중·수면 추적, 개인 운동일지, 회원 커뮤니티, 음식 AI 분석</li>
            <li style={S.li}>커뮤니티: 구인·구직 게시판, 에듀케이터 마켓(유·무료 콘텐츠 거래)</li>
          </ul>
          <h3 style={S.h3}>2. 플랜별 이용 한도</h3>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>구분</th>
                <th style={S.th}>Free</th>
                <th style={S.th}>Pro</th>
                <th style={S.th}>Premium</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={S.td}>관리 회원 수</td><td style={S.td}>최대 5명</td><td style={S.td}>무제한</td><td style={S.td}>무제한</td></tr>
              <tr><td style={S.td}>AI 수업일지</td><td style={S.td}>월 20회</td><td style={S.td}>무제한</td><td style={S.td}>무제한</td></tr>
              <tr><td style={S.td}>마켓 이용</td><td style={S.td}>기본</td><td style={S.td}>기본</td><td style={S.td}>무제한</td></tr>
              <tr><td style={S.td}>이용료(월)</td><td style={S.td}>무료</td><td style={S.td}>₩9,900</td><td style={S.td}>₩19,900</td></tr>
            </tbody>
          </table>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제5조 (이용자 의무)</h2>
          <p style={S.p}>이용자는 다음 행위를 해서는 안 됩니다.</p>
          <ul style={S.ul}>
            <li style={S.li}>타인의 개인정보 무단 수집·이용 또는 허위 정보 등록</li>
            <li style={S.li}>서비스 시스템 무단 접근·해킹·크롤링·리버스 엔지니어링</li>
            <li style={S.li}>회원 포털 접속 링크를 허가받지 않은 제3자에게 공유</li>
            <li style={S.li}>음란·폭력·혐오·명예훼손 등 불법 콘텐츠 게시</li>
            <li style={S.li}>AI 기능을 악용하여 허위 수업일지 또는 불법 마케팅 콘텐츠 생성</li>
            <li style={S.li}>상업적 목적의 스팸, 광고, 홍보물 무단 게시</li>
            <li style={S.li}>기타 관련 법령 또는 이 약관에 위반하는 행위</li>
          </ul>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제6조 (AI 서비스 이용)</h2>
          <div style={S.highlight}>
            AI 수업일지·음식 분석·회원 인사이트 기능은 Google Gemini API를 활용하며, AI 생성 결과는 참고 자료일 뿐 법적·의학적 판단의 근거가 될 수 없습니다.
          </div>
          <p style={S.p}>① AI가 생성한 결과물의 정확성을 회사가 보장하지 않으며, 최종 판단은 이용자 본인의 책임입니다.</p>
          <p style={S.p}>② 트레이너가 입력한 수업 음성·텍스트는 AI 처리 후 수업일지로 변환되며, 원본 데이터는 서비스 외 제3자 AI 학습에 사용되지 않습니다.</p>
          <p style={S.p}>③ 플랜별 AI 사용 한도를 초과하면 해당 기능이 제한되며, 플랜 업그레이드를 통해 재이용할 수 있습니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제7조 (콘텐츠 및 지식재산권)</h2>
          <p style={S.p}>① 이용자가 서비스에 게시한 콘텐츠의 저작권은 원작성자에게 귀속됩니다.</p>
          <p style={S.p}>② 이용자는 콘텐츠 게시 시 회사가 서비스 운영·홍보 목적으로 해당 콘텐츠를 무상으로 사용·수정·배포할 수 있는 비독점적 라이선스를 회사에 부여하는 것에 동의합니다.</p>
          <p style={S.p}>③ 회사 서비스의 디자인·로고·소프트웨어·텍스트 등에 대한 지식재산권은 회사에 귀속됩니다.</p>
          <p style={S.p}>④ 에듀케이터 마켓에 등록한 유료 콘텐츠를 무단으로 복제·재배포하는 행위는 저작권법 위반으로 처벌받을 수 있습니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제8조 (서비스 중단 및 제한)</h2>
          <p style={S.p}>① 회사는 시스템 점검·장애 복구·천재지변·외부 서비스(Supabase, Google API 등) 장애 시 서비스를 일시 중단할 수 있습니다.</p>
          <p style={S.p}>② 이용약관 위반 시 사전 통지 없이 계정을 정지·삭제할 수 있습니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제9조 (면책 조항)</h2>
          <p style={S.p}>① 회사는 이용자 간 분쟁, 이용자가 게시한 콘텐츠의 불법성, 에듀케이터 마켓 콘텐츠의 품질에 대한 책임을 지지 않습니다.</p>
          <p style={S.p}>② AI 기능의 오류·부정확한 결과로 발생한 손해에 대해 회사의 고의 또는 중과실이 없는 한 책임을 지지 않습니다.</p>
          <p style={S.p}>③ 회사의 손해배상 책임은 관련 법령이 허용하는 최대 범위 내에서 해당 서비스 이용료 3개월분을 한도로 합니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제10조 (분쟁 해결 및 준거법)</h2>
          <p style={S.p}>① 이 약관에 관한 분쟁은 대한민국 법률을 준거법으로 합니다.</p>
          <p style={S.p}>② 분쟁 발생 시 먼저 회사 고객센터에 접수하여 협의를 통해 해결하며, 소송 제기 시 민사소송법에 따른 법원을 관할 법원으로 합니다.</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>제11조 (연락처)</h2>
          <ul style={S.ul}>
            <li style={S.li}><strong>서비스명:</strong> 오운</li>
            <li style={S.li}><strong>이메일:</strong> support@trainerlog.app</li>
          </ul>
        </div>

        <p style={S.footer}>
          이 약관은 2026년 5월 1일부터 시행됩니다.<br />
          <a href="/privacy" style={{ color: '#64748b' }}>개인정보처리방침</a>
          &nbsp;·&nbsp;
          <a href="/refund" style={{ color: '#64748b' }}>환불정책</a>
          &nbsp;·&nbsp;
          <a href="/" style={{ color: '#64748b' }}>홈으로</a>
        </p>
      </div>
    </div>
  )
}
