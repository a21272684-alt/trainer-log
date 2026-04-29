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
  cardGreen:  { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px 20px', marginBottom: '12px' },
  cardRed:    { background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '16px 20px', marginBottom: '12px' },
  cardYellow: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', fontSize: '13px', lineHeight: 1.75 },
  cardBlue:   { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', fontSize: '13px', color: '#1e40af', lineHeight: 1.75 },
  cardTitle:  { fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: '#0f172a' },
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
          <p style={S.meta}>시행일: 2026년 5월 1일 · 최종 개정: 2026년 4월 29일 · 버전: 1.1</p>
        </div>

        <div style={S.cardYellow}>
          <strong>📌 법적 근거</strong><br/>
          본 정책은 <strong>전자상거래 등에서의 소비자보호에 관한 법률(제17조)</strong> 및 <strong>콘텐츠산업 진흥법(제28조)</strong>을 기반으로 작성되었습니다.<br/>
          환불 문의: <strong>support@trainerlog.app</strong>
        </div>

        {/* ── 제1조: 결제 방식 안내 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제1조 (결제 방식 및 현황)</h2>
          <div style={S.cardBlue}>
            <strong>현재 서비스 결제 방식:</strong><br/>
            · <strong>유료 구독 플랜</strong>: 관리자가 트레이너 계정에 구독 기간을 직접 부여하는 방식으로 운영됩니다. 현재 자동 결제(PG사 연동)는 지원하지 않으며, 결제 수단 및 금액은 별도 협의 후 안내됩니다.<br/>
            · <strong>AI 크레딧</strong>: 관리자가 트레이너 계정에 무상으로 부여합니다. 현재 크레딧의 유료 판매는 지원하지 않습니다.<br/>
            · <strong>에듀케이터 마켓</strong>: 디지털 콘텐츠 거래 기능이 포함되어 있습니다. 결제 수단·방식은 마켓 내 안내를 따릅니다.
          </div>
          <p style={S.p}>결제 방식·수단은 서비스 정책에 따라 추후 변경될 수 있으며, 변경 시 사전 공지합니다.</p>
        </div>

        {/* ── 제2조: 유료 구독 플랜 환불 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제2조 (유료 구독 플랜 환불)</h2>
          <p style={S.p}>유료 구독 플랜은 결제 즉시 서비스가 제공되는 디지털 구독 상품입니다.</p>

          <div style={S.cardGreen}>
            <div style={S.cardTitle}>✅ 전액 환불 가능</div>
            <ul style={S.ul}>
              <li style={S.li}>결제일로부터 <strong>7일 이내</strong>이며 AI 수업일지 등 유료 기능을 전혀 사용하지 않은 경우 (전자상거래법 제17조 청약철회권)</li>
              <li style={S.li}>서비스 중대 결함으로 핵심 기능을 7일 이상 연속 이용하지 못한 경우</li>
            </ul>
          </div>

          <div style={S.cardGreen}>
            <div style={S.cardTitle}>⚖️ 부분 환불</div>
            <ul style={S.ul}>
              <li style={S.li}>결제일로부터 7일 이내이나 일부 유료 기능을 이미 사용한 경우</li>
              <li style={S.li}><strong>환불액 = 결제액 × (잔여일 ÷ 구독 총일수)</strong></li>
            </ul>
          </div>

          <div style={S.cardRed}>
            <div style={{ ...S.cardTitle, color: '#9f1239' }}>❌ 환불 불가</div>
            <ul style={S.ul}>
              <li style={S.li}>결제일로부터 <strong>7일 초과</strong> 후 환불 요청 (콘텐츠산업 진흥법 제28조 — 이용한 디지털 서비스)</li>
              <li style={S.li}>7일 이내라도 AI 수업일지, 매출분석, 이탈위험 분석 등 유료 기능을 사용한 경우 (전액 환불 불가, 부분 환불 적용)</li>
              <li style={S.li}>이용약관 위반으로 계정이 정지·삭제된 경우</li>
            </ul>
          </div>

          <h3 style={S.h3}>구독 해지</h3>
          <p style={S.p}>구독 해지는 <strong>support@trainerlog.app</strong>으로 요청하면 됩니다. 해지 후 해당 구독 기간 종료일까지 서비스를 이용할 수 있습니다. 현재 자동 갱신 결제는 지원하지 않으므로, 구독 만료 후 유료 기능은 자동으로 비활성화됩니다.</p>
        </div>

        {/* ── 제3조: AI 크레딧 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제3조 (AI 크레딧)</h2>
          <div style={S.cardBlue}>
            현재 AI 크레딧은 <strong>관리자가 무상으로 부여</strong>하는 방식으로 운영됩니다.
            별도의 현금 결제 없이 제공되므로 현재는 <strong>환불 대상이 아닙니다.</strong>
          </div>
          <p style={S.p}>향후 크레딧 유료 구매 방식이 도입될 경우, 별도 환불정책을 공지하며 이에 따릅니다.</p>
          <ul style={S.ul}>
            <li style={S.li}>사용된 크레딧은 복구되지 않습니다.</li>
            <li style={S.li}>크레딧의 유효기간 및 소멸 기준은 회사 정책에 따라 별도 공지합니다.</li>
          </ul>
        </div>

        {/* ── 제4조: 에듀케이터 마켓 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제4조 (에듀케이터 마켓 — 디지털 콘텐츠 구매)</h2>
          <p style={S.p}>에듀케이터 마켓의 루틴·프로그램·영양 정보 등 디지털 콘텐츠는 구매 즉시 열람 가능한 디지털 재화입니다 (콘텐츠산업 진흥법 제2조).</p>

          <div style={S.cardGreen}>
            <div style={S.cardTitle}>✅ 환불 가능</div>
            <ul style={S.ul}>
              <li style={S.li}><strong>콘텐츠를 열람·다운로드하지 않은 경우</strong>, 구매일로부터 7일 이내 전액 환불</li>
              <li style={S.li}>콘텐츠 설명·미리보기와 실제 내용이 현저히 다른 경우 (구매 후 7일 이내)</li>
              <li style={S.li}>기술적 오류로 콘텐츠 접근이 불가능한 경우</li>
            </ul>
          </div>

          <div style={S.cardRed}>
            <div style={{ ...S.cardTitle, color: '#9f1239' }}>❌ 환불 불가</div>
            <ul style={S.ul}>
              <li style={S.li}><strong>콘텐츠를 열람·다운로드한 이후</strong> 단순 변심 (콘텐츠산업 진흥법 제28조 제2항)</li>
              <li style={S.li}>구매 후 7일 초과</li>
              <li style={S.li}>이용약관 위반으로 계정이 정지·삭제된 경우</li>
            </ul>
          </div>

          <div style={S.cardYellow}>
            <strong>💡 "열람"의 기준</strong><br/>
            콘텐츠 상세 페이지에서 루틴·프로그램의 전체 내용에 접근(클릭·다운로드)한 시점을 열람으로 간주합니다.
            미리보기(썸네일·제목) 확인은 열람으로 보지 않습니다.
          </div>
        </div>

        {/* ── 제5조: 환불 신청 방법 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제5조 (환불 신청 방법 및 처리 기간)</h2>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>단계</th>
                <th style={S.th}>내용</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}><strong>1. 환불 신청</strong></td>
                <td style={S.td}>
                  <strong>support@trainerlog.app</strong>으로 아래 정보 포함 발송<br/>
                  · 이름<br/>
                  · <strong>가입 소셜 계정 이메일</strong> (Google 또는 카카오 로그인 시 사용한 이메일)<br/>
                  · 결제일 및 결제 금액<br/>
                  · 환불 사유
                </td>
              </tr>
              <tr>
                <td style={S.td}><strong>2. 검토</strong></td>
                <td style={S.td}>접수 후 3 영업일 이내 검토 완료 및 결과 안내</td>
              </tr>
              <tr>
                <td style={S.td}><strong>3. 환불 처리</strong></td>
                <td style={S.td}>
                  승인 후 결제 수단에 따라 처리<br/>
                  · 카드/계좌이체: 원결제 수단으로 3~5 영업일 이내<br/>
                  · 기타 수단: 별도 협의 후 처리<br/>
                  (카드사 정책에 따라 최대 7 영업일 소요 가능)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 제6조: Free 플랜 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제6조 (Free 플랜)</h2>
          <p style={S.p}>Free 플랜은 무료 서비스로 환불 대상이 아닙니다. 계정 삭제 요청은 <strong>support@trainerlog.app</strong>으로 하시면 됩니다.</p>
        </div>

        {/* ── 제7조: 소비자 분쟁 해결 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제7조 (소비자 분쟁 해결)</h2>
          <p style={S.p}>환불 관련 분쟁이 해결되지 않을 경우 아래 기관에 도움을 요청할 수 있습니다.</p>
          <ul style={S.ul}>
            <li style={S.li}><strong>한국소비자원:</strong> www.kca.go.kr / ☎ 1372</li>
            <li style={S.li}><strong>전자상거래 분쟁조정위원회:</strong> www.ecmc.or.kr</li>
            <li style={S.li}><strong>콘텐츠분쟁조정위원회:</strong> www.kcdrc.kr / ☎ 1588-2201</li>
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
                  결제 방식 현황 조항 신설(제1조) — PG사 미연동·수동 발급 방식 명시 /
                  계정 식별 방법 수정 (전화번호 → 소셜 계정 이메일) /
                  자동 갱신 관련 문구 수정 (현재 미지원 명시) /
                  AI 크레딧 환불 조항 신설(제3조) /
                  에듀케이터 마켓 열람 기준 명확화 /
                  콘텐츠산업 진흥법 법조항 구체화
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p style={S.footer}>
          이 정책은 2026년 5월 1일부터 시행됩니다. (v1.1 적용: 2026년 4월 29일)<br />
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
