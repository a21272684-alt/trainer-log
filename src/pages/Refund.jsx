import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

function FallbackRefund() {
  return (
    <>
      <div style={S.section}>
        <h2 style={S.h2}>제1조 (목적 및 적용 범위)</h2>
        <p style={S.p}>본 환불정책은 오운(이하 "회사")이 운영하는 서비스에서 발생할 수 있는 유료 거래의 청약철회·환불 관련 사항을 규정합니다. 본 정책은 「전자상거래 등에서의 소비자보호에 관한 법률」 및 「콘텐츠산업 진흥법」 등 관련 법령을 준수합니다.</p>
        <p style={S.p}>본 서비스는 디지털 형태로만 제공되며, 실물 상품의 판매·배송·교환·반품을 포함하지 않습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제2조 (현재 결제 운영 현황)</h2>
        <div style={S.info}>
          <strong>📌 현재 운영 방식</strong><br/>
          본 서비스는 PG(전자결제대행) 모듈을 도입하지 않은 단계로, 이용자에게 카드·계좌·간편결제 등을 통한 직접적인 결제 행위가 발생하지 않습니다. 유료 플랜 활성화 및 AI 크레딧 부여는 회사 관리자가 트레이너 계정에 직접 부여하는 방식으로 운영됩니다.
        </div>
        <p style={S.p}>① 따라서 현재 시점에서는 이용자가 회사에 대해 직접 지급한 금원이 존재하지 않으며, 본 정책상의 환불 절차 적용 사례도 발생하지 않습니다.</p>
        <p style={S.p}>② 본 조의 운영 방식은 회사의 정책에 따라 변경될 수 있으며, 유료 결제 모듈이 도입될 경우 변경 사항은 시행일 7일 전(중대한 변경의 경우 30일 전)에 사전 공지합니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제3조 (향후 유료 결제 도입 시 적용 원칙)</h2>
        <p style={S.p}>회사가 향후 PG 모듈을 통한 유료 구독 또는 디지털 콘텐츠 거래를 도입할 경우, 다음의 일반 원칙이 적용됩니다.</p>
        <ul style={S.ul}>
          <li style={S.li}><strong>청약철회</strong>: 결제일로부터 7일 이내, 유료 기능을 사용하지 않은 경우 전액 환불 (전자상거래법 제17조).</li>
          <li style={S.li}><strong>부분 환불</strong>: 기간제 서비스(구독)는 결제 후 일부 사용한 경우, 잔여일 비율에 따라 부분 환불.</li>
          <li style={S.li}><strong>환불 제한</strong>: 즉시 열람·다운로드된 디지털 콘텐츠 또는 이용 완료된 서비스는 「콘텐츠산업 진흥법」 제28조에 따라 환불이 제한될 수 있음.</li>
        </ul>
        <p style={S.p}>본 원칙은 안내용이며, 결제 모듈 도입 시점에 구체적인 환불 정책(가격·환불 비율·신청 절차 등)이 별도로 공지·반영됩니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제4조 (커뮤니티 마켓 — 통신판매중개자 면책)</h2>
        <p style={S.p}>① 커뮤니티 포털 내에서 트레이너·이용자 간에 운동 루틴 템플릿 등 디지털 콘텐츠가 거래되는 경우, 회사는 거래의 당사자가 아닌 <strong>통신판매중개자</strong>의 지위를 가집니다.</p>
        <p style={S.p}>② 회사는 콘텐츠의 품질·정확성·적법성 및 거래의 이행을 보증하지 않으며, 거래 당사자(판매자·구매자) 간의 분쟁에 대해 원칙적으로 개입하지 않고 법적 책임을 지지 않습니다. 다만 회사가 직접 거래의 당사자가 되는 경우는 예외로 합니다.</p>
        <p style={S.p}>③ 거래 분쟁이 발생한 경우 이용자는 우선 거래 상대방과 직접 협의하여 해결하여야 하며, 협의가 이루어지지 않을 경우 「전자문서 및 전자거래 기본법」, 「소비자기본법」 등 관련 법령 및 분쟁조정 절차에 따릅니다.</p>
        <p style={S.p}>④ 회사는 신고가 접수된 부적절·위법 콘텐츠에 대해 일시 비공개·삭제·이용 제한 등의 조치를 자율적으로 취할 수 있습니다.</p>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제5조 (환불·문의 신청 채널)</h2>
        <p style={S.p}>본 정책에 따른 환불 및 관련 문의는 외부 플랫폼(카카오톡 채널)을 통해 접수합니다. 서비스 내 "1:1 문의" 버튼 또는 푸터 링크를 이용하시면 카카오톡 채널로 연결됩니다.</p>
        <div style={S.highlight}>
          ⚠️ 카카오톡 등 외부 메신저 이용 시에는 해당 플랫폼 자체의 이용약관 및 개인정보 처리방침이 적용됩니다. 이용자가 외부 플랫폼에서 직접 입력한 정보의 처리에 대해서는 회사가 직접 책임지지 않으며, 해당 플랫폼 사업자의 정책을 따릅니다.
        </div>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>제6조 (정책의 변경)</h2>
        <p style={S.p}>본 정책은 법령 또는 서비스 정책에 따라 변경될 수 있으며, 변경 시 시행일 7일 전(이용자에게 불리한 변경의 경우 30일 전)까지 서비스 내 공지 또는 이메일로 사전 공지합니다.</p>
      </div>
    </>
  )
}

export default function Refund() {
  const [dbContent, setDbContent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'legal_refund')
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        const raw = data?.value
        const text = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' ? (raw.text || '') : '')
        setDbContent(text || '')
      } catch (e) {
        console.warn('[legal_refund] 로드 실패, 폴백 본문 사용:', e?.message)
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
          <div style={S.badge}>REFUND</div>
          <h1 style={S.title}>환불정책</h1>
          <p style={S.meta}>시행일: 2026년 5월 6일 · 버전: 2.0</p>
        </div>

        {loading ? (
          <div style={S.loading}>본문을 불러오는 중...</div>
        ) : useDb ? (
          <pre style={S.pre}>{dbContent}</pre>
        ) : (
          <FallbackRefund />
        )}

        <div style={S.footer}>
          <p>오운(주) · 대한민국</p>
          <p style={{ marginTop: '8px' }}>
            <a href="/terms" style={{ color: '#64748b' }}>이용약관</a>
            <span style={{ margin: '0 8px' }}>·</span>
            <a href="/privacy" style={{ color: '#64748b' }}>개인정보 처리방침</a>
          </p>
        </div>
      </div>
    </div>
  )
}
