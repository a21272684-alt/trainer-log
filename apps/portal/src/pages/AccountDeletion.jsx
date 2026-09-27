// 계정 및 데이터 삭제 요청 안내 페이지 (/account-deletion)
// Google Play "계정 삭제 URL" 요구사항 충족:
//  - 스토어에 표시되는 앱/개발자 이름 기재
//  - 계정 삭제 요청 단계 명시
//  - 삭제/보관되는 데이터 유형 및 보관 기간 지정
// 정책 페이지(Terms/Privacy/Refund)와 동일한 비주얼.

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
  p: { fontSize: '14px', lineHeight: 1.85, color: '#334155', margin: '0 0 12px' },
  ol: { fontSize: '14px', lineHeight: 1.85, color: '#334155', paddingLeft: '20px', margin: '0 0 12px' },
  ul: { fontSize: '14px', lineHeight: 1.85, color: '#334155', paddingLeft: '20px', margin: '0 0 12px' },
  li: { marginBottom: '6px' },
  info: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#1e40af', marginBottom: '16px', lineHeight: 1.7 },
  highlight: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#92400e', marginBottom: '16px', lineHeight: 1.7 },
  a: { color: '#2563eb', fontWeight: 600, textDecoration: 'none' },
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
}

export default function AccountDeletion() {
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
          <div style={S.badge}>ACCOUNT DELETION</div>
          <h1 style={S.title}>계정 및 데이터 삭제</h1>
          <p style={S.meta}>앱: 오운 · 운영: 이루스케일즈(대표 윤준현) · 최종 업데이트: 2026년 9월</p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>1. 안내</h2>
          <p style={S.p}>
            본 페이지는 <strong>오운</strong>(운영: 이루스케일즈) 서비스의 회원이 자신의 계정과
            관련 데이터의 삭제를 요청하는 방법을 안내합니다. 삭제를 요청하시면 아래에 명시된 데이터가
            파기되며, 법령상 보관 의무가 있는 일부 정보는 정해진 기간 동안 보관 후 파기됩니다.
          </p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>2. 삭제 요청 방법</h2>
          <p style={S.p}>아래 채널로 <strong>가입한 이메일 주소</strong>와 함께 “계정 삭제 요청”을 보내주세요. 본인 확인 후 처리됩니다.</p>
          <ol style={S.ol}>
            <li style={S.li}>
              카카오톡 채널 <strong>@ownapp</strong>
              (<a href="https://pf.kakao.com/_ownapp" target="_blank" rel="noopener noreferrer" style={S.a}>https://pf.kakao.com/_ownapp</a>)
              에 접속하거나, 앱 내 <strong>“1:1 문의”</strong> 버튼을 누릅니다.
            </li>
            <li style={S.li}>“<strong>계정 삭제 요청</strong>”과 함께 <strong>가입 이메일 주소</strong>를 남깁니다.</li>
            <li style={S.li}>본인 확인 절차를 거친 뒤, 아래 데이터가 삭제됩니다.</li>
          </ol>
          <div style={S.info}>
            처리 소요: 요청 접수 및 본인 확인 후 <strong>영업일 기준 최대 5일 이내</strong>에 삭제 처리됩니다.
          </div>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>3. 삭제되는 데이터</h2>
          <p style={S.p}>계정 삭제 시 다음 데이터가 파기됩니다.</p>
          <ul style={S.ul}>
            <li style={S.li}>계정 정보: 이름, 이메일 주소, 전화번호, 주소, 생년월일</li>
            <li style={S.li}>건강 및 피트니스 기록: 체중·체성분·수면 기록, 운동 기록, 식단 기록</li>
            <li style={S.li}>업로드한 사진 및 영상(식단·운동·수업 관련 미디어)</li>
            <li style={S.li}>수업일지 및 앱 내 문의 메시지</li>
            <li style={S.li}>회원 관리·결제 내역 등 계정에 연결된 서비스 이용 데이터</li>
          </ul>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>4. 보관되는 정보 및 기간</h2>
          <p style={S.p}>
            원칙적으로 삭제 요청 시 위 데이터는 지체 없이 파기됩니다. 다만 관련 법령에 따라 일정 기간
            보관이 필요한 정보는 아래 기간 동안 보관한 뒤 파기합니다.
          </p>
          <ul style={S.ul}>
            <li style={S.li}>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
            <li style={S.li}>대금 결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</li>
            <li style={S.li}>소비자 불만 또는 분쟁 처리에 관한 기록: 3년 (전자상거래법)</li>
          </ul>
          <div style={S.highlight}>
            위 법정 보관 정보는 <strong>보관 목적으로만</strong> 분리 저장되며, 보관 기간이 지나면 복구 불가능한 방식으로 파기됩니다.
          </div>
        </div>

        <div style={S.footer}>
          <p>이루스케일즈 (서비스명: 오운) · 대표 윤준현 · 대한민국</p>
          <p style={{ marginTop: '8px' }}>
            <a href="/privacy" style={{ color: '#64748b' }}>개인정보 처리방침</a>
            <span style={{ margin: '0 8px' }}>·</span>
            <a href="/terms" style={{ color: '#64748b' }}>이용약관</a>
          </p>
        </div>
      </div>
    </div>
  )
}
