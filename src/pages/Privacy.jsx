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
  highlight: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#1e40af', marginBottom: '16px' },
  warn: { background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#9a3412', marginBottom: '16px', lineHeight: 1.7 },
  important: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px 18px', fontSize: '13px', color: '#7f1d1d', marginBottom: '16px', lineHeight: 1.75 },
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
          <p style={S.meta}>시행일: 2026년 5월 1일 · 최종 개정: 2026년 4월 29일 · 버전: 1.1</p>
        </div>

        <div style={S.highlight}>
          오운(이하 "회사")은 <strong>개인정보 보호법(2023년 개정)</strong>, <strong>정보통신망 이용촉진 및 정보보호 등에 관한 법률</strong>을 준수하며,
          이용자의 개인정보를 안전하게 보호합니다. 본 방침은 회사가 수집·이용·보관·제공·파기하는 모든 개인정보 처리 활동에 적용됩니다.
        </div>

        {/* ── 제1조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제1조 (수집하는 개인정보 항목 및 수집 방법)</h2>

          <h3 style={S.h3}>1. 트레이너</h3>
          <p style={S.p}>수집 방법: 소셜 로그인(Google OAuth / 카카오 OAuth), 이용자 직접 입력, 서비스 이용 과정 중 자동 생성</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>수집 항목</th>
                <th style={S.th}>수집 목적</th>
                <th style={S.th}>필수 여부</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}>Google 계정 정보<br/>(이름, 이메일, Google UID)</td>
                <td style={S.td}>Google OAuth 소셜 로그인 인증 및 계정 식별</td>
                <td style={S.td}>필수 (Google 로그인 선택 시)</td>
              </tr>
              <tr>
                <td style={S.td}>카카오 계정 정보<br/>(닉네임, 이메일, 카카오 UID)</td>
                <td style={S.td}>카카오 OAuth 소셜 로그인 인증 및 계정 식별</td>
                <td style={S.td}>필수 (카카오 로그인 선택 시)</td>
              </tr>
              <tr>
                <td style={{...S.td, background:'#fef9ec', fontWeight:600}}>🎙 수업 음성 녹음 파일</td>
                <td style={{...S.td, background:'#fef9ec'}}>AI 수업일지 자동 생성 목적으로 Google Gemini API에 전송. <strong>서버(Supabase)에 저장되지 않으며</strong>, API 전송 후 즉시 처리됨. AI 학습에 활용되지 않음.</td>
                <td style={{...S.td, background:'#fef9ec'}}>선택<br/>(AI 수업일지 기능 이용 시)</td>
              </tr>
              <tr>
                <td style={S.td}>이름</td>
                <td style={S.td}>앱 내 트레이너 식별 및 표시</td>
                <td style={S.td}>필수</td>
              </tr>
              <tr>
                <td style={S.td}>프로필 사진</td>
                <td style={S.td}>앱 내 프로필 표시 (Supabase Storage 저장)</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>플랜 정보, AI 크레딧 잔량, 사용량</td>
                <td style={S.td}>서비스 이용 한도 관리</td>
                <td style={S.td}>자동 수집</td>
              </tr>
              <tr>
                <td style={S.td}>정산 정보(고용형태, 인센티브율, 세율)</td>
                <td style={S.td}>급여 정산 계산</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>푸시 알림 구독 정보 (VAPID 토큰)</td>
                <td style={S.td}>수업 전 브라우저 푸시 알림 발송</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>Gemini API 키 (구 버전 개인 키 방식 잔존 시)</td>
                <td style={S.td}>AI 기능 연동</td>
                <td style={S.td}>선택</td>
              </tr>
            </tbody>
          </table>

          <h3 style={S.h3}>2. 회원(Member)</h3>
          <p style={S.p}>수집 방법: 소셜 로그인(Google OAuth / 카카오 OAuth), 트레이너 직접 입력, 이용자 직접 입력, 서비스 이용 과정 중 자동 생성</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>수집 항목</th>
                <th style={S.th}>수집 목적</th>
                <th style={S.th}>필수 여부</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}>Google 계정 정보<br/>(이름, 이메일, Google UID)</td>
                <td style={S.td}>회원 포털 Google OAuth 소셜 로그인 인증</td>
                <td style={S.td}>필수 (Google 로그인 선택 시)</td>
              </tr>
              <tr>
                <td style={S.td}>카카오 계정 정보<br/>(닉네임, 이메일, 카카오 UID)</td>
                <td style={S.td}>회원 포털 카카오 OAuth 소셜 로그인 인증</td>
                <td style={S.td}>필수 (카카오 로그인 선택 시)</td>
              </tr>
              <tr>
                <td style={S.td}>이름, 전화번호</td>
                <td style={S.td}>회원 식별 및 카카오 수업일지 발송</td>
                <td style={S.td}>필수 (트레이너 입력)</td>
              </tr>
              <tr>
                <td style={S.td}>이메일, 카카오톡 연락처</td>
                <td style={S.td}>수업일지 리포트 링크 전송</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>생년월일, 주소</td>
                <td style={S.td}>회원 프로파일 관리</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>신장, 목표체중, 시작체중, 나이</td>
                <td style={S.td}>건강 추적 및 AI 인사이트 분석</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>공복체중, 저녁체중, 수면 레벨</td>
                <td style={S.td}>14일 건강 추이 분석</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={{...S.td, background:'#fef9ec'}}>식단 기록 및 식단 사진<br/>(Supabase Storage 저장)</td>
                <td style={{...S.td, background:'#fef9ec'}}>식단 관리 및 Google Gemini API를 통한 AI 음식 분석</td>
                <td style={{...S.td, background:'#fef9ec'}}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>개인 운동 기록</td>
                <td style={S.td}>운동 일지 관리</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>결제 내역, 세션 정보</td>
                <td style={S.td}>수업 관리 및 매출 정산</td>
                <td style={S.td}>필수 (트레이너 입력)</td>
              </tr>
              <tr>
                <td style={S.td}>출석 기록, 정지 이력</td>
                <td style={S.td}>회원 상태 관리 및 이탈위험 분석</td>
                <td style={S.td}>자동 수집</td>
              </tr>
              <tr>
                <td style={S.td}>특이사항, 수업 목적, 방문 경로</td>
                <td style={S.td}>맞춤 수업 관리</td>
                <td style={S.td}>선택 (트레이너 입력)</td>
              </tr>
            </tbody>
          </table>

          <h3 style={S.h3}>3. 커뮤니티 이용자</h3>
          <p style={S.p}>수집 방법: 소셜 로그인(Google OAuth / 카카오 OAuth), 이용자 직접 입력</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>수집 항목</th>
                <th style={S.th}>수집 목적</th>
                <th style={S.th}>필수 여부</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}>Google 계정 정보(이름, 이메일, Google UID)</td>
                <td style={S.td}>커뮤니티 Google OAuth 인증 및 계정 식별</td>
                <td style={S.td}>필수 (Google 로그인 선택 시)</td>
              </tr>
              <tr>
                <td style={S.td}>카카오 계정 정보(닉네임, 이메일, 카카오 UID)</td>
                <td style={S.td}>커뮤니티 카카오 OAuth 인증 및 계정 식별</td>
                <td style={S.td}>필수 (카카오 로그인 선택 시)</td>
              </tr>
              <tr>
                <td style={S.td}>역할(트레이너/회원/강사/헬스장 운영자)</td>
                <td style={S.td}>서비스 맞춤 제공</td>
                <td style={S.td}>필수</td>
              </tr>
              <tr>
                <td style={S.td}>지역, 소개, 전화번호</td>
                <td style={S.td}>프로필 공개 및 구인·구직 활동</td>
                <td style={S.td}>선택</td>
              </tr>
              <tr>
                <td style={S.td}>구매 내역</td>
                <td style={S.td}>콘텐츠 접근 권한 관리</td>
                <td style={S.td}>자동 수집</td>
              </tr>
            </tbody>
          </table>

          <h3 style={S.h3}>4. CRM 포털 (헬스장 운영자)</h3>
          <p style={S.p}>수집 방법: 소셜 로그인(Google OAuth / 카카오 OAuth)</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>수집 항목</th>
                <th style={S.th}>수집 목적</th>
                <th style={S.th}>필수 여부</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}>Google/카카오 계정 정보(이름, 이메일, UID)</td>
                <td style={S.td}>CRM 포털 접근 인증 및 운영자 식별</td>
                <td style={S.td}>필수</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 제2조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제2조 (처리 목적 및 보유 기간)</h2>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>처리 목적</th>
                <th style={S.th}>보유 기간</th>
                <th style={S.th}>근거 법령</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={S.td}>회원가입 및 서비스 이용 관리</td><td style={S.td}>회원 탈퇴 시까지</td><td style={S.td}>개인정보 보호법 제15조</td></tr>
              <tr><td style={S.td}>결제·정산 기록</td><td style={S.td}>5년</td><td style={S.td}>전자상거래법 제6조</td></tr>
              <tr><td style={S.td}>불만 처리 및 분쟁 해결 기록</td><td style={S.td}>3년</td><td style={S.td}>전자상거래법 제6조</td></tr>
              <tr><td style={S.td}>건강·운동 기록</td><td style={S.td}>탈퇴 또는 삭제 요청 시 즉시 파기</td><td style={S.td}>개인정보 보호법 제21조</td></tr>
              <tr><td style={S.td}>AI 사용 로그</td><td style={S.td}>12개월</td><td style={S.td}>-</td></tr>
              <tr><td style={S.td}>커뮤니티 게시물</td><td style={S.td}>삭제 요청 시까지</td><td style={S.td}>-</td></tr>
              <tr><td style={{...S.td, fontWeight:600}}>음성 녹음 파일</td><td style={S.td}><strong>저장하지 않음.</strong> Google Gemini API 전송 후 즉시 처리 완료, 서버 미보관.</td><td style={S.td}>개인정보 보호법 제21조 (최소 보유 원칙)</td></tr>
              <tr><td style={S.td}>식단 사진</td><td style={S.td}>탈퇴 또는 삭제 요청 시 즉시 파기</td><td style={S.td}>-</td></tr>
              <tr><td style={S.td}>소셜 로그인 인증 정보(OAuth 세션)</td><td style={S.td}>로그아웃 또는 계정 삭제 시까지</td><td style={S.td}>개인정보 보호법 제15조</td></tr>
            </tbody>
          </table>
        </div>

        {/* ── 제3조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제3조 (개인정보의 제3자 제공)</h2>
          <p style={S.p}>회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만 아래 경우는 예외입니다.</p>
          <ul style={S.ul}>
            <li style={S.li}>이용자가 사전에 명시적으로 동의한 경우</li>
            <li style={S.li}>법령에 의거하거나 수사기관의 적법한 요청이 있는 경우</li>
          </ul>
          <p style={S.p}>트레이너가 등록한 회원 정보는 해당 트레이너 계정 범위 내에서만 처리되며, 타 트레이너와 공유되지 않습니다.</p>
          <p style={S.p}>소셜 로그인(Google / 카카오)을 통해 취득한 계정 정보는 인증 목적으로만 사용되며, 해당 플랫폼의 개인정보처리방침에도 적용됩니다.</p>
        </div>

        {/* ── 제4조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제4조 (개인정보 처리 위탁)</h2>
          <p style={S.p}>회사는 서비스 제공을 위해 아래 업체에 개인정보 처리를 위탁합니다. 위탁 업체는 계약상 개인정보 보호 의무를 이행합니다.</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>수탁 업체</th>
                <th style={S.th}>위탁 업무 내용</th>
                <th style={S.th}>개인정보 보호방침</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}>Supabase Inc.</td>
                <td style={S.td}>데이터베이스 저장·관리, 파일 스토리지(프로필 사진, 식단 사진), OAuth 인증 중계</td>
                <td style={S.td}>supabase.com/privacy</td>
              </tr>
              <tr>
                <td style={{...S.td, background:'#fef9ec', fontWeight:600}}>Google LLC (Gemini API)</td>
                <td style={{...S.td, background:'#fef9ec'}}>
                  AI 수업일지 생성 (음성 녹음 파일 inline 전송 포함), AI 음식 분석 (식단 사진 전송), 회원 AI 인사이트 생성.<br/>
                  <strong>전송된 데이터는 Google의 AI 모델 학습에 사용되지 않습니다</strong> (Google Gemini API 이용약관 기준).
                </td>
                <td style={S.td}>policies.google.com/privacy</td>
              </tr>
              <tr>
                <td style={S.td}>Google LLC (OAuth)</td>
                <td style={S.td}>Google 계정 소셜 로그인 인증 (트레이너·회원·커뮤니티·CRM 포털 전체)</td>
                <td style={S.td}>policies.google.com/privacy</td>
              </tr>
              <tr>
                <td style={{...S.td, fontWeight:600}}>카카오 Corp (Kakao Corp.)</td>
                <td style={S.td}>카카오 계정 소셜 로그인 인증 (트레이너·회원·커뮤니티·CRM 포털 전체)</td>
                <td style={S.td}>policy.kakao.com/kr/privacy</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 제4조의2 (음성 데이터 처리) — 핵심 추가 조항 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제4조의2 (음성 데이터 및 AI 처리에 관한 특별 고지)</h2>

          <div style={S.important}>
            <strong>⚠️ 음성 데이터는 민감한 개인정보입니다.</strong><br/>
            본 서비스의 AI 수업일지 기능은 수업 중 녹음된 음성 파일을 처리합니다. 이 기능 이용 전 반드시 아래 내용을 확인하시기 바랍니다.
          </div>

          <h3 style={S.h3}>1. 수집 항목 및 처리 방식</h3>
          <ul style={S.ul}>
            <li style={S.li}>트레이너가 직접 업로드한 수업 녹음 파일(mp3, m4a, wav 등 오디오 형식)</li>
            <li style={S.li}>파일은 브라우저에서 Base64로 변환되어 Google Gemini API에 <strong>직접(inline) 전송</strong>됩니다.</li>
            <li style={S.li}>회사 서버(Supabase)에는 <strong>저장되지 않습니다.</strong> API 전송 후 처리 결과(텍스트 일지)만 저장됩니다.</li>
          </ul>

          <h3 style={S.h3}>2. 처리 목적</h3>
          <ul style={S.ul}>
            <li style={S.li}>음성 내용(운동 종목, 세트·반복 수, 트레이너·회원 발언 등)을 AI가 분석하여 구조화된 수업일지로 변환</li>
            <li style={S.li}>생성된 텍스트 일지는 회원에게 카카오톡 또는 링크로 전송</li>
          </ul>

          <h3 style={S.h3}>3. 수업 참여자(회원) 고지 의무</h3>
          <div style={S.warn}>
            <strong>트레이너의 의무:</strong> 음성 녹음에는 회원의 발언이 포함될 수 있습니다.
            트레이너는 이 기능을 사용하기 전 수업 참여 회원에게 <strong>"수업 내용이 AI 수업일지 생성을 위해 녹음되고 처리된다"는 사실을 사전에 고지하고 동의를 받아야 할 의무</strong>가 있습니다.
            이를 이행하지 않아 발생하는 법적 책임은 트레이너 본인에게 있습니다.
          </div>

          <h3 style={S.h3}>4. AI 학습 활용 여부</h3>
          <ul style={S.ul}>
            <li style={S.li}>Google Gemini API 서비스 약관에 따라, API를 통해 전송된 데이터는 Google의 AI 모델 학습에 <strong>사용되지 않습니다.</strong></li>
            <li style={S.li}>회사(오운)는 음성 파일을 별도로 보관하거나 분석·학습에 활용하지 않습니다.</li>
          </ul>

          <h3 style={S.h3}>5. 법적 근거</h3>
          <ul style={S.ul}>
            <li style={S.li}><strong>개인정보 보호법 제15조 제1항 제1호:</strong> 정보주체의 동의를 받은 경우</li>
            <li style={S.li}><strong>개인정보 보호법 제22조:</strong> 동의를 받는 방법 — 트레이너 최초 등록 시 별도 체크박스를 통해 명시적 동의 수집</li>
            <li style={S.li}><strong>개인정보 보호법 제28조의2:</strong> 가명정보 처리 금지 — AI 생성 일지는 익명 처리 여부와 무관하게 개인정보로 취급</li>
          </ul>

          <h3 style={S.h3}>6. 동의 철회 및 기능 중단</h3>
          <p style={S.p}>음성 데이터 AI 처리에 대한 동의를 철회하려면 <strong>support@trainerlog.app</strong>으로 요청하시면 됩니다. 동의 철회 후에는 AI 수업일지 기능을 이용할 수 없습니다.</p>
        </div>

        {/* ── 제5조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제5조 (정보주체의 권리)</h2>
          <p style={S.p}>이용자는 언제든지 아래 권리를 행사할 수 있습니다 (개인정보 보호법 제35조~제39조의2).</p>
          <ul style={S.ul}>
            <li style={S.li}><strong>열람권:</strong> 회사가 보유 중인 본인의 개인정보 확인 요청</li>
            <li style={S.li}><strong>정정·삭제권:</strong> 부정확하거나 불필요한 개인정보 수정·삭제 요청</li>
            <li style={S.li}><strong>처리 정지권:</strong> 개인정보 처리의 일시 중단 요청</li>
            <li style={S.li}><strong>이식권:</strong> 본인 데이터를 구조화된 형식으로 받거나 이전 요청</li>
            <li style={S.li}><strong>동의 철회권:</strong> 수집·이용 동의를 언제든지 철회 (단, 철회 시 일부 서비스 이용이 제한될 수 있음)</li>
          </ul>
          <p style={S.p}>요청 방법: <strong>support@trainerlog.app</strong> — 접수 후 10 영업일 이내 처리.</p>
          <p style={S.p}>만 14세 미만 아동의 개인정보는 수집하지 않으며, 확인 시 즉시 삭제합니다.</p>
        </div>

        {/* ── 제6조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제6조 (개인정보의 파기)</h2>
          <p style={S.p}>보유 기간 만료 또는 탈퇴 시 지체 없이 복구 불가능한 방법으로 영구 삭제합니다.</p>
          <ul style={S.ul}>
            <li style={S.li}><strong>전자적 파일:</strong> 복원이 불가능한 방식으로 영구 삭제</li>
            <li style={S.li}><strong>음성 녹음 파일:</strong> 서버에 저장하지 않으므로 별도 파기 절차 없음 (API 전송 즉시 처리)</li>
            <li style={S.li}><strong>법령 의무 보존 데이터:</strong> 해당 기간 별도 보관 후 파기</li>
          </ul>
        </div>

        {/* ── 제7조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제7조 (기술·관리적 보호 조치)</h2>
          <ul style={S.ul}>
            <li style={S.li}>모든 데이터 전송 구간 TLS 1.2 이상 / HTTPS 암호화</li>
            <li style={S.li}>Supabase Row Level Security(RLS) — 계정별 데이터 완전 격리</li>
            <li style={S.li}>음성 파일은 서버에 저장하지 않고 클라이언트 메모리에서 직접 API 전송 후 즉시 폐기</li>
            <li style={S.li}>API 키·환경변수 서버 측 관리, 클라이언트 노출 없음</li>
            <li style={S.li}>관리자 포털 별도 번들·인증 접근 제어</li>
            <li style={S.li}>Supabase Storage 파일에 대한 접근 권한 정책(Bucket Policy) 적용</li>
          </ul>
        </div>

        {/* ── 제8조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제8조 (쿠키 및 자동 수집 정보)</h2>
          <p style={S.p}>서비스는 별도 쿠키를 사용하지 않으나, 아래 항목은 브라우저에 자동 저장됩니다.</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>저장 항목</th>
                <th style={S.th}>목적</th>
                <th style={S.th}>삭제 방법</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.td}>Supabase Auth 세션 토큰 (localStorage)</td>
                <td style={S.td}>소셜 로그인 상태 유지</td>
                <td style={S.td}>로그아웃 또는 브라우저 저장소 초기화</td>
              </tr>
              <tr>
                <td style={S.td}>스케줄 데이터 (localStorage: tl_sch)</td>
                <td style={S.td}>시간표 로컬 캐시</td>
                <td style={S.td}>브라우저 저장소 초기화</td>
              </tr>
              <tr>
                <td style={S.td}>알림 설정 (localStorage: tl_notif_*)</td>
                <td style={S.td}>푸시 알림 설정 유지</td>
                <td style={S.td}>앱 내 알림 OFF 또는 브라우저 저장소 초기화</td>
              </tr>
              <tr>
                <td style={S.td}>VAPID 푸시 알림 구독 정보</td>
                <td style={S.td}>수업 전 브라우저 푸시 알림</td>
                <td style={S.td}>앱 내 알림 수신 거부 시 즉시 삭제</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 제9조 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제9조 (개인정보 보호책임자)</h2>
          <table style={S.table}>
            <tbody>
              <tr>
                <td style={{ ...S.td, fontWeight: 700, width: '160px' }}>보호책임자 이메일</td>
                <td style={S.td}>privacy@trainerlog.app</td>
              </tr>
              <tr>
                <td style={{ ...S.td, fontWeight: 700 }}>일반 문의</td>
                <td style={S.td}>support@trainerlog.app</td>
              </tr>
              <tr>
                <td style={{ ...S.td, fontWeight: 700 }}>처리 기간</td>
                <td style={S.td}>접수 후 10 영업일 이내</td>
              </tr>
            </tbody>
          </table>

          <h3 style={S.h3}>개인정보 침해 관련 신고·상담 기관</h3>
          <ul style={S.ul}>
            <li style={S.li}><strong>개인정보 침해신고센터:</strong> privacy.kisa.or.kr / ☎ 118</li>
            <li style={S.li}><strong>개인정보 분쟁조정위원회:</strong> www.kopico.go.kr / ☎ 1833-6972</li>
            <li style={S.li}><strong>대검찰청 사이버수사과:</strong> ☎ 1301</li>
            <li style={S.li}><strong>경찰청 사이버안전국:</strong> ☎ 182</li>
          </ul>
        </div>

        {/* ── 제10조 개정 이력 ── */}
        <div style={S.section}>
          <h2 style={S.h2}>제10조 (개정 이력)</h2>
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
                <td style={{...S.td, fontWeight:700}}>v1.1</td>
                <td style={{...S.td, fontWeight:700}}>2026.04.29</td>
                <td style={{...S.td, fontWeight:700}}>
                  음성 데이터 처리 전용 조항(제4조의2) 신설 /
                  Google·카카오 OAuth 계정 정보 수집 항목 명시 /
                  카카오 Corp 위탁 업체 추가 /
                  프로필 사진·푸시 알림 구독 정보 항목 추가 /
                  트레이너 등록 시 동의 체계 강화
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p style={S.footer}>
          이 방침은 2026년 5월 1일부터 시행됩니다. (v1.1 적용: 2026년 4월 29일)<br />
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
