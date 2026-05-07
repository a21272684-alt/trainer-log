import { useEffect, useState } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'

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
  highlight: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#92400e', marginBottom: '16px', lineHeight: 1.7 },
  info: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#1e40af', marginBottom: '16px', lineHeight: 1.7 },
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
  pre: {
    fontSize: '14px', lineHeight: 1.85, color: '#334155',
    fontFamily: "'Noto Sans KR', sans-serif",
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    margin: 0,
  },
  loading: { fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '40px 0' },
}

function FallbackPrivacy() {
  return (
    <>
      <div style={S.section}>
        <h2 style={S.h2}>제1조 (총칙)</h2>
        <p style={S.p}>오운(이하 "회사")은 이용자의 개인정보를 중요시하며, 「개인정보 보호법」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령을 준수하기 위하여 본 처리방침을 수립·공개합니다.</p>
        <p style={S.p}>본 방침은 회사가 운영하는 트레이너 포털, 회원 포털, 커뮤니티 포털, 헬스장 운영자(CRM) 포털 등 모든 서비스에 적용됩니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제2조 (수집하는 개인정보 항목 및 방법)</h2>

        <h3 style={S.h3}>① 가입·인증 시 수집 항목</h3>
        <p style={S.p}>회사는 Google 또는 Kakao OAuth를 통해 이용자가 동의한 다음의 정보를 자동으로 전달받습니다.</p>
        <ul style={S.ul}>
          <li style={S.li}>이메일 주소, 이름(또는 닉네임), 프로필 사진(선택), OAuth 제공자 식별자</li>
        </ul>

        <h3 style={S.h3}>② 서비스 이용 중 입력·생성되는 정보</h3>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>구분</th>
              <th style={S.th}>항목</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={S.td}>트레이너</td><td style={S.td}>소속 센터, 직급, 연락처(자가 입력), 프로필 사진</td></tr>
            <tr><td style={S.td}>회원 PII</td><td style={S.td}>이름, 연락처, 생년월일(선택), 운동 목적 — 트레이너가 입력</td></tr>
            <tr><td style={S.td}>건강·운동 데이터</td><td style={S.td}>체중, 수면 메모, 운동 세션, 운동 루틴, 식단 기록, 출석 기록</td></tr>
            <tr><td style={S.td}>커뮤니티</td><td style={S.td}>게시글, 사진, 댓글, 좋아요·연락 요청 내역</td></tr>
            <tr><td style={S.td}>운영 정보</td><td style={S.td}>유료 플랜 활성 상태, AI 크레딧 잔액(관리자 수동 부여 시)</td></tr>
          </tbody>
        </table>

        <h3 style={S.h3}>③ 서비스 이용 시 자동 수집되는 정보</h3>
        <ul style={S.ul}>
          <li style={S.li}>접속 IP 주소, 접속 일시, 디바이스 종류, 브라우저 정보, 쿠키</li>
          <li style={S.li}>Web Push 알림 구독 시 브라우저가 발급하는 푸시 엔드포인트 토큰</li>
        </ul>

        <div style={S.info}>
          <strong>📌 수집하지 않는 항목</strong><br/>
          본 서비스는 GPS·위치 정보, 주민등록번호, 신용카드 번호, 계좌번호, 통신사 결제 정보를 수집·저장하지 않습니다.
        </div>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제3조 (개인정보의 수집·이용 목적)</h2>
        <ul style={S.ul}>
          <li style={S.li}>회원 식별 및 로그인 인증, 본인 확인</li>
          <li style={S.li}>피트니스 관리·수업일지 작성·전송 등 서비스 본연의 기능 제공</li>
          <li style={S.li}>AI 기반 분석을 통한 향상된 서비스 제공(아래 제5조 참조)</li>
          <li style={S.li}>커뮤니티 운영, 부적절 콘텐츠 신고 처리, 분쟁 해결</li>
          <li style={S.li}>고객 문의 응대 및 공지사항 전달</li>
          <li style={S.li}>서비스 통계 분석 및 품질 개선</li>
          <li style={S.li}>법령상 의무 이행</li>
        </ul>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제4조 (개인정보의 보유 및 이용 기간)</h2>
        <p style={S.p}>회사는 원칙적으로 이용자의 회원 탈퇴 시 또는 수집·이용 목적 달성 후 지체 없이 개인정보를 파기합니다. 다만 다음의 정보는 명시된 기간 동안 보관합니다.</p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>항목</th>
              <th style={S.th}>보유 기간</th>
              <th style={S.th}>근거</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={S.td}>부정 이용 기록</td><td style={S.td}>1년</td><td style={S.td}>부정 이용 방지</td></tr>
            <tr><td style={S.td}>커뮤니티 신고 처리 이력</td><td style={S.td}>3개월</td><td style={S.td}>분쟁 대응</td></tr>
            <tr><td style={S.td}>서비스 접속 로그</td><td style={S.td}>3개월</td><td style={S.td}>통신비밀보호법</td></tr>
          </tbody>
        </table>
        <p style={S.p}>본 서비스는 PG(전자결제) 모듈을 도입하지 않은 단계로, 이용자가 직접 결제한 거래 내역이 발생하지 않습니다. 향후 PG 도입 시에는 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 거래 기록 보존(5년) 등이 적용되며, 정책 시행 시 본 방침에 반영하여 사전 공지합니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제5조 (AI 분석 처리 — Google Gemini API)</h2>
        <div style={S.info}>
          <strong>🤖 AI 분석 명시</strong><br/>
          회원이 업로드한 식단 사진, 식단 텍스트, 운동 일지, 건강 메모 등은 향상된 서비스 제공을 위해 AI(Google Gemini API 등)를 통해 분석될 수 있습니다.
        </div>
        <p style={S.p}>① AI 처리에는 분석에 필요한 최소한의 데이터만 전송되며, 식별성이 높은 회원 PII(이름·연락처)는 원칙적으로 함께 전송되지 않습니다.</p>
        <p style={S.p}>② AI 처리 결과는 참고 자료이며, 의료적 진단·처방을 대체하지 않습니다.</p>
        <p style={S.p}>③ AI 제공자는 자체 정책에 따라 입력 데이터를 일정 기간 보관하거나 학습에 사용하지 않을 수 있으나, 정확한 처리 방식은 해당 제공자(Google)의 정책에 따릅니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제6조 (개인정보 처리위탁 및 제3자 처리)</h2>
        <p style={S.p}>회사는 안정적 서비스 제공을 위해 다음의 처리위탁을 받습니다.</p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>수탁자</th>
              <th style={S.th}>위탁 업무</th>
              <th style={S.th}>처리 정보</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.td}>Supabase Inc.</td>
              <td style={S.td}>데이터베이스, 파일 스토리지, 인증 서버</td>
              <td style={S.td}>본 방침 제2조 항목 일체</td>
            </tr>
            <tr>
              <td style={S.td}>Google LLC</td>
              <td style={S.td}>OAuth 인증, Gemini AI 분석</td>
              <td style={S.td}>이메일·이름, 분석 대상 데이터</td>
            </tr>
            <tr>
              <td style={S.td}>Kakao Corp.</td>
              <td style={S.td}>OAuth 인증</td>
              <td style={S.td}>이메일·이름·프로필 사진</td>
            </tr>
            <tr>
              <td style={S.td}>Vercel Inc.</td>
              <td style={S.td}>웹 호스팅 및 정적 자원 배포</td>
              <td style={S.td}>접속 IP·로그</td>
            </tr>
            <tr>
              <td style={S.td}>브라우저 푸시 사업자(Apple/Google/Mozilla)</td>
              <td style={S.td}>Web Push 알림 발송</td>
              <td style={S.td}>푸시 엔드포인트 토큰</td>
            </tr>
          </tbody>
        </table>
        <div style={S.info}>
          <strong>💬 외부 메신저 고객 지원에 관하여</strong><br/>
          고객 문의 및 1:1 지원은 외부 플랫폼(카카오톡 채널)을 통해 이루어지며, 해당 메신저 이용 시 플랫폼 자체의 개인정보 처리방침이 적용됩니다. 이용자가 카카오톡 등 외부 채널에서 자발적으로 입력한 정보의 처리에 대해서는 회사가 직접 책임지지 않으며, 해당 플랫폼 사업자의 정책을 따릅니다.
        </div>
        <p style={S.p}>회사는 이용자의 명시적 동의가 없는 한 위 처리위탁 외에 개인정보를 제3자에게 제공·판매·제휴 마케팅 목적으로 공유하지 않습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제7조 (이용자의 권리)</h2>
        <p style={S.p}>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
        <ul style={S.ul}>
          <li style={S.li}>본인의 개인정보 열람·수정·삭제 요청</li>
          <li style={S.li}>처리 정지 요청</li>
          <li style={S.li}>회원 탈퇴 및 계정 삭제 요청</li>
        </ul>
        <p style={S.p}>권리 행사는 카카오톡 채널을 통해 신청할 수 있으며, 회사는 본인 확인 후 지체 없이 조치합니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제8조 (개인정보의 안전성 확보 조치)</h2>
        <ul style={S.ul}>
          <li style={S.li}>전송 구간 HTTPS(TLS) 암호화</li>
          <li style={S.li}>데이터베이스 행 단위 보안(RLS) 정책 적용으로 타 이용자 데이터 접근 차단</li>
          <li style={S.li}>접근 권한 분리 및 최소 권한 원칙 적용</li>
          <li style={S.li}>관리자 자격 증명 환경변수 분리 및 정기 갱신</li>
          <li style={S.li}>외부 클라우드 서비스(Supabase 등)의 보안 인증 체계 활용</li>
        </ul>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제9조 (쿠키 사용)</h2>
        <p style={S.p}>회사는 로그인 세션 유지 및 사용자 환경 설정 보존을 위해 브라우저 쿠키 및 로컬 스토리지를 사용합니다. 이용자는 브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 이 경우 일부 서비스 이용에 제한이 있을 수 있습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제10조 (만 14세 미만 이용자 처리)</h2>
        <p style={S.p}>본 서비스는 원칙적으로 만 14세 이상의 이용자를 대상으로 합니다. 만 14세 미만의 이용자가 회원으로 등록되어야 하는 경우 트레이너가 법정대리인의 동의를 사전 확보할 책임이 있으며, 회사는 동의 없는 회원 등록이 확인될 경우 해당 정보를 즉시 삭제합니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제11조 (개인정보 보호책임자)</h2>
        <p style={S.p}>회사는 개인정보 보호와 관련된 이용자의 의견 청취 및 불만 처리를 위해 다음과 같이 보호책임자를 지정합니다.</p>
        <ul style={S.ul}>
          <li style={S.li}><strong>개인정보 보호책임자</strong>: 오운 운영팀</li>
          <li style={S.li}><strong>문의 채널</strong>: 카카오톡 채널을 통해 접수 (서비스 내 1:1 문의 버튼 참조)</li>
        </ul>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제12조 (방침의 변경)</h2>
        <p style={S.p}>본 방침은 법령 또는 서비스 정책에 따라 변경될 수 있으며, 변경 시 시행일 7일 전(중대한 변경의 경우 30일 전)까지 서비스 내 공지로 알립니다.</p>
      </div>
    </>
  )
}

export default function Privacy() {
  const [dbContent, setDbContent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'legal_privacy')
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        const raw = data?.value
        const text = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' ? (raw.text || '') : '')
        setDbContent(text || '')
      } catch (e) {
        console.warn('[legal_privacy] 로드 실패, 폴백 본문 사용:', e?.message)
        setDbContent('')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const useDb = !loading && typeof dbContent === 'string' && dbContent.trim().length > 0

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
          <div style={S.badge}>PRIVACY</div>
          <h1 style={S.title}>개인정보 처리방침</h1>
          <p style={S.meta}>시행일: 2026년 5월 6일 · 버전: 2.0</p>
        </div>

        {loading ? (
          <div style={S.loading}>본문을 불러오는 중...</div>
        ) : useDb ? (
          <pre style={S.pre}>{dbContent}</pre>
        ) : (
          <FallbackPrivacy />
        )}

        <div style={S.footer}>
          <p>오운(주) · 대한민국</p>
          <p style={{ marginTop: '8px' }}>
            <a href="/terms" style={{ color: '#64748b' }}>이용약관</a>
            <span style={{ margin: '0 8px' }}>·</span>
            <a href="/refund" style={{ color: '#64748b' }}>환불정책</a>
          </p>
        </div>
      </div>
    </div>
  )
}
