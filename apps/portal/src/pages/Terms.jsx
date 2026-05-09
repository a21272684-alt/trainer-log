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
  p: { fontSize: '14px', lineHeight: 1.85, color: '#334155', margin: '0 0 12px' },
  ul: { fontSize: '14px', lineHeight: 1.85, color: '#334155', paddingLeft: '20px', margin: '0 0 12px' },
  li: { marginBottom: '6px' },
  info: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#1e40af', marginBottom: '16px', lineHeight: 1.7 },
  highlight: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#92400e', marginBottom: '16px', lineHeight: 1.7 },
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
  pre: {
    fontSize: '14px', lineHeight: 1.85, color: '#334155',
    fontFamily: "'Noto Sans KR', sans-serif",
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    margin: 0,
  },
  loading: { fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '40px 0' },
}

function FallbackTerms() {
  return (
    <>
      <div style={S.section}>
        <h2 style={S.h2}>제1조 (목적)</h2>
        <p style={S.p}>본 약관은 <strong>이루스케일즈</strong>(대표 윤준현, 이하 "회사")가 제공하는 <strong>오운</strong> 피트니스 관리·커뮤니티·센터 운영(CRM) 플랫폼(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무·책임 사항을 규정함을 목적으로 합니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제1조의2 (회사 및 사업자 정보)</h2>
        <ul style={S.ul}>
          <li style={S.li}><strong>상호</strong>: 이루스케일즈</li>
          <li style={S.li}><strong>서비스명</strong>: 오운</li>
          <li style={S.li}><strong>대표자</strong>: 윤준현</li>
          <li style={S.li}><strong>업태/종목</strong>: 정보통신업 / 소프트웨어 개발 및 공급업</li>
          <li style={S.li}><strong>사업자등록번호</strong>: 정식 출시 전 본 항목에 기재 예정 (1:1 문의 시 안내)</li>
          <li style={S.li}><strong>사업장 주소</strong>: 정확한 주소는 1:1 문의 시 안내</li>
          <li style={S.li}><strong>고객지원</strong>: 카카오톡 채널을 통한 1:1 문의 (서비스 내 "1:1 문의" 버튼 또는 푸터 링크)</li>
        </ul>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제2조 (정의)</h2>
        <ul style={S.ul}>
          <li style={S.li}><strong>"서비스"</strong>란 회사가 제공하는 트레이너 포털, 회원 포털, 커뮤니티 포털, 헬스장 운영자 포털 및 부속 기능 일체를 말합니다.</li>
          <li style={S.li}><strong>"트레이너"</strong>란 서비스에 가입하여 자신의 회원을 관리하는 개인 트레이너를 말합니다.</li>
          <li style={S.li}><strong>"회원(Member)"</strong>이란 트레이너가 등록한 피트니스 이용자로서 회원 포털을 이용하는 자를 말합니다.</li>
          <li style={S.li}><strong>"커뮤니티 이용자"</strong>란 커뮤니티 포털 가입자를 말합니다.</li>
          <li style={S.li}><strong>"헬스장 운영자"</strong>란 CRM 포털을 통해 센터를 관리하는 대표자를 말합니다.</li>
          <li style={S.li}><strong>"콘텐츠"</strong>란 서비스 내에서 유통되는 운동 루틴·프로그램·게시글·이미지 등 디지털 재화를 말합니다.</li>
        </ul>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제3조 (계정 및 인증)</h2>
        <p style={S.p}>① 이용자는 Google 또는 Kakao 계정을 통한 OAuth 인증으로 서비스에 가입할 수 있습니다.</p>
        <p style={S.p}>② 이용자는 본인 계정의 보안을 직접 유지할 책임이 있으며, 계정의 양도·대여·공유는 금지됩니다.</p>
        <p style={S.p}>③ 회사는 본인 확인 절차에 필요한 최소한의 정보만 OAuth 제공자로부터 수집합니다(상세 내용은 개인정보 처리방침 참조).</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제4조 (서비스의 내용)</h2>
        <ul style={S.ul}>
          <li style={S.li}><strong>트레이너 포털</strong>: 회원 관리, 수업일지 작성·전송, 운동 루틴 설계, 일정 관리, 매출 관리.</li>
          <li style={S.li}><strong>회원 포털</strong>: 본인의 운동 기록·식단 기록·건강 데이터(체중 등) 열람 및 자가 입력, 트레이너로부터 받은 수업일지 열람.</li>
          <li style={S.li}><strong>커뮤니티 포털</strong>: 게시글 작성·열람, 트레이너 간 정보 교류, 운동 루틴 등 디지털 콘텐츠의 등록·교환.</li>
          <li style={S.li}><strong>헬스장 운영자(CRM) 포털</strong>: 소속 트레이너·회원 통계, 정산 운영, 주간 운영 리포트.</li>
        </ul>
        <p style={S.p}>본 서비스는 디지털 형태로만 제공되며, 실물 상품의 판매·배송·교환·반품을 포함하지 않습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제5조 (AI 기능 및 데이터 처리)</h2>
        <p style={S.p}>① 회사는 서비스 품질 향상을 위해 AI 기능(Google Gemini API 등)을 제공합니다. 회원이 입력·업로드한 식단·운동·수업일지 등의 데이터는 향상된 서비스 제공을 위해 AI를 통해 분석될 수 있습니다.</p>
        <p style={S.p}>② AI 분석 결과는 참고 자료이며 의료적 진단·처방을 대체하지 않습니다. 이용자는 자신의 건강 상태에 대해서는 의료 전문가의 판단을 우선해야 합니다.</p>
        <p style={S.p}>③ AI 처리에 관한 데이터 흐름·보존·제3자 처리위탁의 자세한 사항은 개인정보 처리방침에 따릅니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제6조 (유료 플랜·크레딧 운영 및 환불)</h2>
        <div style={S.info}>
          <strong>📌 현재 운영 방식</strong><br/>
          본 서비스는 PG(전자결제대행) 자동 결제 모듈을 도입하지 않은 단계로, 이용자에게 카드·계좌 등을 통한 직접적인 결제 행위가 발생하지 않습니다. 유료 플랜 활성화 및 AI 크레딧 부여는 회사 관리자가 트레이너 계정에 직접 부여하는 방식으로 운영됩니다.
        </div>
        <p style={S.p}>① 향후 PG 모듈을 통한 유료 결제 또는 크레딧 유료 교환 방식이 도입될 경우, 회사는 가격·결제 수단·청약철회 및 환불 정책을 사전 공지합니다.</p>
        <p style={S.p}>② 새로운 유료 정책 시행 전 발생한 이용 분에 대해서는 본 약관과 별도 환불 정책을 따릅니다.</p>
        <p style={S.p}>③ 환불의 구체적 기준·절차는 별도 <a href="/refund" style={{ color: '#2563eb', fontWeight: 600 }}>환불정책</a> 페이지에 따르며, 다음 핵심 사항이 적용됩니다.</p>
        <div style={S.highlight}>
          ⚠️ <strong>핵심 환불 제한 — 결제 시 별도 동의 후 효력 발생</strong><br/>
          유료 결제 도입 후 회사는 결제일로부터 7일 이내라도 <strong>AI 호출이 발생하는 핵심 기능(AI 수업일지 자동 생성, AI 식단 사진 인식, AI 인사이트 등)을 1회 이상 사용한 경우 환불을 제한</strong>할 수 있습니다. 본 제한은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항에 따라 결제 화면에서 이용자가 별도 동의한 경우에만 효력이 발생하며, 결제 화면에 무료 체험(Free 플랜) 또는 사전 미리보기 수단이 함께 제공됩니다.
        </div>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제7조 (커뮤니티 및 콘텐츠 거래 — 통신판매중개자 면책)</h2>
        <p style={S.p}>① 커뮤니티 포털 내 운동 루틴 템플릿 등 트레이너·이용자 간의 디지털 콘텐츠 거래에 있어, 회사는 거래 당사자가 아닌 <strong>통신판매중개자</strong>의 지위를 가집니다.</p>
        <p style={S.p}>② 회사는 콘텐츠의 품질·정확성·적법성·거래의 이행을 보증하지 않으며, 콘텐츠 자체로 인하여 발생한 손해 및 거래 당사자(판매자·구매자) 간의 분쟁에 대해 원칙적으로 개입하지 않습니다. 회사가 직접 거래의 당사자가 아닌 한 회사는 책임을 지지 않습니다.</p>
        <p style={S.p}>③ 다만, 회사는 신고가 접수된 부적절·위법 콘텐츠에 대해 일시 비공개·삭제·이용 제한 등의 조치를 취할 수 있습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제8조 (이용자의 의무)</h2>
        <ul style={S.ul}>
          <li style={S.li}>타인의 개인정보·저작물·초상권을 무단 이용·게시하지 않습니다.</li>
          <li style={S.li}>서비스에 부정하게 접근하거나 비정상적인 방법으로 데이터를 수집·조작하지 않습니다.</li>
          <li style={S.li}>회원 데이터(건강·식단·운동 기록 등) 입력 시 정확한 정보를 제공합니다.</li>
          <li style={S.li}>커뮤니티에 음란·차별·허위·광고성·도배성 게시물을 작성하지 않습니다.</li>
        </ul>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제9조 (서비스 이용 제한)</h2>
        <p style={S.p}>회사는 이용자가 본 약관 또는 관련 법령을 위반한 경우 사전 통지 또는 사후 통지로써 서비스 이용 일시 정지, 콘텐츠 비공개·삭제, 계정 해지 등의 조치를 취할 수 있습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제10조 (면책 조항)</h2>
        <div style={S.highlight}>
          ⚠️ 본 서비스는 의료기기·진단 서비스가 아닙니다. 운동 루틴·식단 분석·건강 인사이트는 일반적 건강 정보 제공 목적이며, 질병의 진단·치료·예방을 보증하지 않습니다.
        </div>
        <ul style={S.ul}>
          <li style={S.li}>회사는 천재지변, 전기통신 사업자의 회선 장애, 외부 클라우드 서비스(데이터베이스·스토리지·AI API 등)의 일시적 중단으로 인한 서비스 제공 차질에 대해 책임을 지지 않습니다.</li>
          <li style={S.li}>회사는 회원·트레이너·헬스장 운영자 간 발생한 사적 분쟁에 대해 직접 당사자가 아니므로 책임을 지지 않습니다.</li>
          <li style={S.li}>회사는 이용자가 자발적으로 작성·게시한 콘텐츠의 적법성·정확성에 대해 책임을 지지 않습니다.</li>
        </ul>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제11조 (지식재산권)</h2>
        <p style={S.p}>① 서비스 내 디자인·로고·코드 등 회사가 직접 제작한 저작물의 권리는 회사에 귀속됩니다.</p>
        <p style={S.p}>② 이용자가 작성·업로드한 콘텐츠의 저작권은 이용자에게 있으며, 회사는 서비스 운영·개선·홍보 목적으로 비독점적·무상의 사용권을 부여받습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제12조 (고객 지원 채널)</h2>
        <p style={S.p}>① 회사는 1:1 문의 및 고객 지원을 외부 플랫폼인 <strong>카카오톡 채널(또는 카카오톡 오픈채팅)</strong>을 통해 운영합니다.</p>
        <p style={S.p}>② 카카오톡 등 외부 메신저 이용 시에는 해당 플랫폼 자체의 이용약관 및 개인정보 처리방침이 적용되며, 회사는 이용자가 해당 외부 플랫폼에서 직접 입력한 정보의 처리에 대해 책임을 지지 않습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제13조 (분쟁 해결 및 준거법)</h2>
        <p style={S.p}>① 본 약관의 해석 및 회사와 이용자 간 분쟁에는 대한민국 법령이 적용됩니다.</p>
        <p style={S.p}>② 분쟁이 발생할 경우 회사와 이용자는 신의성실의 원칙에 따라 해결을 위해 협의하며, 협의가 이루어지지 않을 경우 민사소송법상의 관할 법원을 따릅니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제14조 (약관의 변경)</h2>
        <p style={S.p}>회사는 관련 법령 또는 정책 변경 사유가 있을 경우 본 약관을 개정할 수 있으며, 개정 시 시행일 7일 전(이용자에게 불리한 변경의 경우 30일 전)까지 서비스 내 공지 또는 이메일로 사전 공지합니다.</p>
      </div>
    </>
  )
}

export default function Terms() {
  const [dbContent, setDbContent] = useState(null) // null = 미로드 / '' or text = DB 응답
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'legal_terms')
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        const raw = data?.value
        const text = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' ? (raw.text || '') : '')
        setDbContent(text || '')
      } catch (e) {
        console.warn('[legal_terms] 로드 실패, 폴백 본문 사용:', e?.message)
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
          <div style={S.badge}>LEGAL</div>
          <h1 style={S.title}>이용약관</h1>
          <p style={S.meta}>시행일: 2026년 5월 8일 · 버전: 3.0</p>
        </div>

        {loading ? (
          <div style={S.loading}>본문을 불러오는 중...</div>
        ) : useDb ? (
          <pre style={S.pre}>{dbContent}</pre>
        ) : (
          <FallbackTerms />
        )}

        <div style={S.footer}>
          <p>이루스케일즈 (서비스명: 오운) · 대표 윤준현 · 대한민국</p>
          <p style={{ marginTop: '8px' }}>
            <a href="/privacy" style={{ color: '#64748b' }}>개인정보 처리방침</a>
            <span style={{ margin: '0 8px' }}>·</span>
            <a href="/refund" style={{ color: '#64748b' }}>환불정책</a>
          </p>
        </div>
      </div>
    </div>
  )
}
