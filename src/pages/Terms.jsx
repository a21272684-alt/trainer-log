const S = {
  wrap: { background: '#f8fafc', minHeight: '100vh', fontFamily: "'Noto Sans KR', sans-serif", color: '#0f172a' },
  nav: { position: 'sticky', top: 0, zIndex: 100, background: 'rgba(248,250,252,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #e2e8f0', padding: '0 20px' },
  navInner: { maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '54px' },
  logo: { fontSize: '17px', fontWeight: 900, letterSpacing: '-0.5px', color: '#111', textDecoration: 'none' },
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
  info: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#1e40af', marginBottom: '16px', lineHeight: 1.7 },
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
          <p style={S.meta}>시행일: 2026년 5월 1일 · 최종 개정: 2026년 4월 29일 · 버전: 1.1</p>
        </div>

        {/* ── 제1조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제1조 (목적)</h2>
          <p style={S.p}>이 약관은 오운(이하 "회사")이 제공하는 오운 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.</p>
        </div>

        {/* ── 제2조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제2조 (정의)</h2>
          <ul style={S.ul}>
            <li style={S.li}><strong>"서비스"</strong>란 오운이 제공하는 트레이너·회원 피트니스 관리 플랫폼, 커뮤니티 서비스, 헬스장 CRM 포털 일체를 말합니다.</li>
            <li style={S.li}><strong>"트레이너"</strong>란 서비스에 가입하여 회원을 관리하고 AI 기능을 활용하는 개인 트레이너 또는 업체를 말합니다.</li>
            <li style={S.li}><strong>"회원(Member)"</strong>이란 트레이너가 등록한 피트니스 이용자로, 회원 포털에 접근할 수 있는 이용자를 말합니다.</li>
            <li style={S.li}><strong>"커뮤니티 이용자"</strong>란 트레이너·회원·강사·헬스장 운영자 역할로 커뮤니티 서비스를 이용하는 자를 말합니다.</li>
            <li style={S.li}><strong>"헬스장 운영자"</strong>란 CRM 포털을 통해 센터 경영을 관리하는 자를 말합니다.</li>
            <li style={S.li}><strong>"유료 플랜"</strong>이란 회사가 별도로 안내하는 월정액 또는 기간제 구독 서비스를 말합니다. 플랜의 종류·가격은 서비스 내 안내 화면을 기준으로 하며 변경될 수 있습니다.</li>
            <li style={S.li}><strong>"AI 크레딧"</strong>이란 AI 수업일지 기능을 사용하기 위한 단위로, 관리자가 트레이너에게 부여합니다.</li>
            <li style={S.li}><strong>"콘텐츠"</strong>란 서비스 내 유통되는 루틴·프로그램·영양 정보 등 디지털 재화를 말합니다.</li>
            <li style={S.li}><strong>"수업일지 리포트 링크"</strong>란 AI가 생성한 수업일지에 접근할 수 있는 고유 URL 주소를 말합니다.</li>
          </ul>
        </div>

        {/* ── 제3조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제3조 (약관의 효력 및 변경)</h2>
          <p style={S.p}>① 이 약관은 서비스 화면에 게시하거나 이용자에게 통지함으로써 효력이 발생합니다.</p>
          <p style={S.p}>② 회사는 관련 법령에 위배되지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일 7일 전(이용자에게 불리한 변경은 30일 전)에 공지합니다.</p>
          <p style={S.p}>③ 변경 약관 시행 후 계속 서비스를 이용할 경우 변경에 동의한 것으로 간주됩니다.</p>
        </div>

        {/* ── 제4조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제4조 (서비스 제공 및 이용)</h2>

          <h3 style={S.h3}>1. 제공 서비스</h3>
          <ul style={S.ul}>
            <li style={S.li}><strong>트레이너 앱:</strong> 회원 관리, AI 수업일지 자동 생성(크레딧 차감), 주간 스케줄, 매출 분석, 정산, 이탈위험 분석, AI 회원 인사이트, 주간 리포트, 1:1 문의, 웹 푸시 알림</li>
            <li style={S.li}><strong>회원 포털:</strong> 수업일지 열람·PDF 저장, 체중·수면 추적, 식단 기록 및 AI 음식 분석, 개인 운동일지, 루틴 뷰어</li>
            <li style={S.li}><strong>커뮤니티:</strong> 구인·구직 게시판, 에듀케이터 마켓(디지털 콘텐츠 거래)</li>
            <li style={S.li}><strong>헬스장 CRM 포털:</strong> 소속 트레이너·회원 통합 관리, 센터 매출 현황</li>
          </ul>

          <h3 style={S.h3}>2. 플랜 안내</h3>
          <div style={S.info}>
            현재 서비스는 <strong>무료(Free) 플랜</strong>과 <strong>유료 구독 플랜</strong>으로 운영됩니다.
            플랜별 기능·가격·이용 한도는 서비스 내 플랜 안내 화면 및 고객센터 공지를 기준으로 하며,
            회사는 사전 공지 후 변경할 수 있습니다.
          </div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>구분</th>
                <th style={S.th}>Free</th>
                <th style={S.th}>유료 플랜</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={S.td}>관리 회원 수</td><td style={S.td}>최대 5명 (기본값)</td><td style={S.td}>무제한 (기본값)</td></tr>
              <tr><td style={S.td}>AI 수업일지</td><td style={S.td}>미제공 (기본값)</td><td style={S.td}>크레딧 보유량만큼 사용</td></tr>
              <tr><td style={S.td}>매출·정산 탭</td><td style={S.td}>미제공 (기본값)</td><td style={S.td}>제공</td></tr>
              <tr><td style={S.td}>이탈위험·AI 인사이트</td><td style={S.td}>미제공 (기본값)</td><td style={S.td}>제공</td></tr>
            </tbody>
          </table>
          <p style={S.p}>※ 플랜별 기능은 관리자 설정에 따라 사전 공지 후 변경될 수 있습니다.</p>

          <h3 style={S.h3}>3. AI 크레딧</h3>
          <ul style={S.ul}>
            <li style={S.li}>AI 수업일지 1회 생성 시 크레딧 1개가 차감됩니다.</li>
            <li style={S.li}>크레딧은 회사 관리자가 트레이너 계정에 직접 부여하며, 현금 구매 방식은 별도 공지 시 시행됩니다.</li>
            <li style={S.li}>크레딧의 유효기간 및 소멸 기준은 회사가 별도 공지합니다. 별도 공지가 없는 경우 계정 유지 기간 동안 유효합니다.</li>
            <li style={S.li}>크레딧 잔량이 0인 경우 AI 수업일지 기능을 이용할 수 없습니다.</li>
          </ul>
        </div>

        {/* ── 제5조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제5조 (수업일지 리포트 링크)</h2>
          <div style={S.highlight}>
            AI 수업일지가 생성되면 고유한 공개 URL(리포트 링크)이 생성되어 회원에게 발송됩니다. 아래 사항을 반드시 확인하시기 바랍니다.
          </div>
          <p style={S.p}>① 리포트 링크는 별도의 로그인 없이 <strong>링크를 아는 누구나 접근 가능한 공개 URL</strong>입니다.</p>
          <p style={S.p}>② 트레이너는 발송 전 링크가 의도하지 않은 제3자에게 유출되지 않도록 주의해야 합니다.</p>
          <p style={S.p}>③ 링크 유출로 인한 개인정보 노출 책임은 링크를 발송·관리한 트레이너에게 있으며, 회사는 이에 대한 별도 책임을 지지 않습니다.</p>
          <p style={S.p}>④ 수업일지 내용에는 회원의 개인 운동 기록이 포함될 수 있으므로 취급에 주의하시기 바랍니다.</p>
        </div>

        {/* ── 제6조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제6조 (이용자 의무)</h2>
          <p style={S.p}>이용자는 다음 행위를 해서는 안 됩니다.</p>
          <ul style={S.ul}>
            <li style={S.li}>타인의 개인정보 무단 수집·이용 또는 허위 정보 등록</li>
            <li style={S.li}>서비스 시스템 무단 접근·해킹·크롤링·리버스 엔지니어링</li>
            <li style={S.li}>수업일지 리포트 링크를 해당 회원 외 제3자에게 무단 공유</li>
            <li style={S.li}>음란·폭력·혐오·명예훼손 등 불법 콘텐츠 게시</li>
            <li style={S.li}>AI 기능을 악용하여 허위 수업일지 또는 불법 마케팅 콘텐츠 생성</li>
            <li style={S.li}>상업적 목적의 스팸, 광고, 홍보물 무단 게시</li>
            <li style={S.li}>기타 관련 법령 또는 이 약관에 위반하는 행위</li>
          </ul>
        </div>

        {/* ── 제7조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제7조 (AI 서비스 이용 및 음성 데이터 처리)</h2>
          <div style={S.highlight}>
            AI 수업일지·음식 분석·회원 인사이트 기능은 Google Gemini API를 활용하며,
            AI 생성 결과는 참고 자료일 뿐 법적·의학적 판단의 근거가 될 수 없습니다.
          </div>
          <p style={S.p}>① AI가 생성한 결과물의 정확성을 회사가 보장하지 않으며, 최종 판단은 이용자 본인의 책임입니다.</p>
          <p style={S.p}>② 트레이너가 업로드한 수업 음성 녹음 파일은 AI 수업일지 생성 목적으로 Google Gemini API에 전송됩니다. 해당 파일은 회사 서버에 저장되지 않으며, AI 모델 학습에 활용되지 않습니다.</p>
          <p style={S.p}>③ 트레이너는 AI 수업일지 기능 사용 시 수업에 참여한 회원에게 <strong>"수업 내용이 AI 분석을 위해 처리된다"</strong>는 사실을 사전에 고지하고 동의를 받아야 할 의무가 있습니다. 이를 이행하지 않아 발생하는 법적 책임은 트레이너 본인에게 있으며, 회사는 이에 대한 책임을 지지 않습니다.</p>
          <p style={S.p}>④ 트레이너는 최초 등록 시 음성 데이터의 AI 처리에 동의하며, 동의 철회 시 AI 수업일지 기능 이용이 중단됩니다.</p>
          <p style={S.p}>⑤ AI 크레딧이 소진되면 해당 기능이 제한되며, 관리자를 통해 크레딧을 충전한 후 재이용할 수 있습니다.</p>
        </div>

        {/* ── 제8조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제8조 (콘텐츠 및 지식재산권)</h2>
          <p style={S.p}>① 이용자가 서비스에 게시한 콘텐츠의 저작권은 원작성자에게 귀속됩니다.</p>
          <p style={S.p}>② 이용자는 콘텐츠 게시 시 회사가 서비스 운영·홍보 목적으로 해당 콘텐츠를 무상으로 사용·수정·배포할 수 있는 비독점적 라이선스를 회사에 부여하는 것에 동의합니다.</p>
          <p style={S.p}>③ 회사 서비스의 디자인·로고·소프트웨어·텍스트 등에 대한 지식재산권은 회사에 귀속됩니다.</p>
          <p style={S.p}>④ 에듀케이터 마켓에 등록한 유료 콘텐츠를 무단으로 복제·재배포하는 행위는 저작권법 위반으로 처벌받을 수 있습니다.</p>
        </div>

        {/* ── 제9조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제9조 (이용자 자격 제한)</h2>
          <p style={S.p}>① 만 14세 미만은 서비스를 이용할 수 없습니다. 만 14세 미만으로 확인되는 경우 계정을 즉시 삭제하고 관련 데이터를 파기합니다.</p>
          <p style={S.p}>② 이용약관 위반, 불법 행위, 또는 타인에게 피해를 주는 행위가 확인된 경우 사전 통지 없이 계정 접근을 제한하거나 삭제할 수 있습니다.</p>
        </div>

        {/* ── 제10조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제10조 (계정 탈퇴 및 데이터 삭제)</h2>
          <p style={S.p}>① 이용자는 언제든지 계정 삭제를 요청할 수 있습니다.</p>
          <p style={S.p}>② 탈퇴 요청 방법: <strong>support@trainerlog.app</strong>으로 가입 이메일(소셜 계정) 및 탈퇴 요청 의사를 전송하면 10 영업일 이내에 처리합니다.</p>
          <p style={S.p}>③ 탈퇴 시 건강·운동 기록, 수업일지 등 보존 의무가 없는 데이터는 즉시 삭제됩니다. 다만 전자상거래법에 따른 결제·거래 기록은 법정 보존 기간(5년) 동안 별도 보관 후 파기됩니다.</p>
          <p style={S.p}>④ 탈퇴 후 생성된 수업일지 리포트 링크는 접근 불가 상태로 전환됩니다.</p>
          <p style={S.p}>⑤ 현재 앱 내에 자체 탈퇴 기능은 제공되지 않으며, 이메일을 통한 요청으로만 처리됩니다. 향후 앱 내 탈퇴 기능이 추가될 예정입니다.</p>
        </div>

        {/* ── 제11조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제11조 (서비스 중단 및 제한)</h2>
          <p style={S.p}>① 회사는 시스템 점검·장애 복구·천재지변·외부 서비스(Supabase, Google Gemini API 등) 장애 시 서비스를 일시 중단할 수 있습니다.</p>
          <p style={S.p}>② 이용약관 위반 시 사전 통지 없이 계정을 정지·삭제할 수 있습니다.</p>
          <p style={S.p}>③ 플랜별 제공 기능은 회사의 정책에 따라 7일 이상의 사전 공지 후 변경될 수 있습니다. 이용자에게 불리한 변경은 30일 이상 사전 공지합니다.</p>
        </div>

        {/* ── 제12조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제12조 (서비스 종료 시 데이터 처리)</h2>
          <p style={S.p}>① 회사가 서비스를 종료하는 경우, 종료일 30일 전까지 이용자에게 공지합니다.</p>
          <p style={S.p}>② 서비스 종료 시 이용자는 공지 기간 내에 데이터 다운로드 또는 백업을 요청할 수 있으며, 종료일 이후 모든 데이터는 영구 삭제됩니다.</p>
          <p style={S.p}>③ 법령에 따른 보존 의무가 있는 데이터는 해당 기간 동안 별도 보관 후 파기합니다.</p>
        </div>

        {/* ── 제13조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제13조 (면책 조항)</h2>
          <p style={S.p}>① 회사는 이용자 간 분쟁, 이용자가 게시한 콘텐츠의 불법성, 에듀케이터 마켓 콘텐츠의 품질에 대한 책임을 지지 않습니다.</p>
          <p style={S.p}>② AI 기능의 오류·부정확한 결과로 발생한 손해에 대해 회사의 고의 또는 중과실이 없는 한 책임을 지지 않습니다.</p>
          <p style={S.p}>③ 수업일지 리포트 링크 유출, 트레이너의 회원 사전 고지 의무 미이행 등 트레이너 귀책 사유로 발생한 손해에 대해 회사는 책임을 지지 않습니다.</p>
          <p style={S.p}>④ 회사의 손해배상 책임은 관련 법령이 허용하는 최대 범위 내에서 해당 서비스 이용료 3개월분을 한도로 합니다.</p>
        </div>

        {/* ── 제14조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제14조 (분쟁 해결 및 준거법)</h2>
          <p style={S.p}>① 이 약관에 관한 분쟁은 대한민국 법률을 준거법으로 합니다.</p>
          <p style={S.p}>② 분쟁 발생 시 먼저 회사 고객센터에 접수하여 협의를 통해 해결하며, 소송 제기 시 민사소송법에 따른 법원을 관할 법원으로 합니다.</p>
        </div>

        {/* ── 제15조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제15조 (연락처)</h2>
          <ul style={S.ul}>
            <li style={S.li}><strong>서비스명:</strong> 오운</li>
            <li style={S.li}><strong>고객 문의:</strong> support@trainerlog.app</li>
            <li style={S.li}><strong>개인정보 보호:</strong> privacy@trainerlog.app</li>
          </ul>
        </div>

        {/* ── 개정 이력 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>개정 이력</h2>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>버전</th>
                <th style={S.th}>일자</th>
                <th style={S.th}>주요 변경 내용</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}>v1.0</td>
                <td style={S.td}>2026.05.01</td>
                <td style={S.td}>최초 시행</td>
              </tr>
              <tr>
                <td style={{ ...S.td, fontWeight: 700 }}>v1.1</td>
                <td style={{ ...S.td, fontWeight: 700 }}>2026.04.29</td>
                <td style={{ ...S.td, fontWeight: 700 }}>
                  플랜 구조 현행화(Free/유료) / AI 크레딧 조항 신설(제4조) /
                  수업일지 리포트 링크 조항 신설(제5조) / CRM 포털 서비스 추가 /
                  계정 탈퇴 절차 명시(제10조) / 서비스 종료 데이터 처리 조항 신설(제12조) /
                  미성년자 이용 제한 조항 추가(제9조) / 플랜 기능 변경 예고 조항 추가(제11조)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p style={S.footer}>
          이 약관은 2026년 5월 1일부터 시행됩니다. (v1.1 적용: 2026년 4월 29일)<br />
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
