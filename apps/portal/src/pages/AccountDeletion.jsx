// 계정 및 데이터 삭제 페이지 (/account-deletion)
// Google Play "계정 삭제 URL" + App Store 심사 5.1.1(v) 요구사항 충족:
//  - 스토어에 표시되는 앱/개발자 이름 기재
//  - 로그인 상태면 앱 안에서 바로 "계정 영구 삭제" 가능(delete_my_account RPC)
//  - 삭제/보관되는 데이터 유형 및 보관 기간 지정
// 정책 페이지(Terms/Privacy/Refund)와 동일한 비주얼.
import { useState, useEffect } from 'react'
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
  ol: { fontSize: '14px', lineHeight: 1.85, color: '#334155', paddingLeft: '20px', margin: '0 0 12px' },
  ul: { fontSize: '14px', lineHeight: 1.85, color: '#334155', paddingLeft: '20px', margin: '0 0 12px' },
  li: { marginBottom: '6px' },
  info: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#1e40af', marginBottom: '16px', lineHeight: 1.7 },
  highlight: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px 18px', fontSize: '13px', color: '#92400e', marginBottom: '16px', lineHeight: 1.7 },
  a: { color: '#2563eb', fontWeight: 600, textDecoration: 'none' },
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
  danger: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '22px 24px', marginBottom: '40px' },
  dangerH: { fontSize: '17px', fontWeight: 800, color: '#b91c1c', margin: '0 0 8px' },
  dangerP: { fontSize: '13px', lineHeight: 1.75, color: '#7f1d1d', margin: '0 0 14px' },
  delBtn: { display: 'inline-block', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '9px', padding: '11px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  delBtnDisabled: { background: '#fca5a5', cursor: 'not-allowed' },
  cancelBtn: { background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '9px', padding: '11px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginRight: '8px' },
  confirmInput: { width: '100%', maxWidth: '240px', padding: '10px 12px', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', marginBottom: '12px', boxSizing: 'border-box' },
  errText: { color: '#b91c1c', fontSize: '13px', fontWeight: 600, marginTop: '10px' },
  okText: { color: '#047857', fontSize: '14px', fontWeight: 700, marginTop: '4px' },
}

export default function AccountDeletion() {
  const [email, setEmail] = useState(null)   // 로그인 이메일 (null = 비로그인)
  const [step, setStep] = useState('idle')    // idle | confirm | done
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setEmail(data.user.email || '(이메일 없음)')
    }).catch(() => {})
  }, [])

  async function handleDelete() {
    setBusy(true); setErr('')
    try {
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
      await supabase.auth.signOut()
      setStep('done')
      setTimeout(() => { window.location.href = '/' }, 3000)
    } catch (e) {
      setErr('삭제 중 오류가 발생했습니다: ' + (e?.message || e))
      setBusy(false)
    }
  }

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

        {/* 로그인 상태면 앱 안에서 바로 삭제 (App Store 5.1.1 v / Google Play) */}
        {email && (
          <div style={S.danger}>
            <h2 style={S.dangerH}>⚠️ 내 계정 영구 삭제</h2>
            {step === 'done' ? (
              <p style={S.okText}>계정이 삭제되었습니다. 잠시 후 홈으로 이동합니다…</p>
            ) : (
              <>
                <p style={S.dangerP}>
                  현재 <strong>{email}</strong> 로 로그인되어 있습니다. 아래에서 계정과 관련 데이터를
                  <strong> 영구적으로 삭제</strong>할 수 있습니다. 삭제된 데이터는 복구할 수 없으며,
                  일부 정보는 아래 4번의 법정 보관 기간 동안만 분리 보관 후 파기됩니다.
                </p>
                {step === 'idle' && (
                  <button style={S.delBtn} onClick={() => { setErr(''); setStep('confirm') }}>
                    계정 삭제하기
                  </button>
                )}
                {step === 'confirm' && (
                  <div>
                    <p style={S.dangerP}>
                      확인을 위해 아래 칸에 <strong>삭제</strong> 를 입력한 뒤 버튼을 누르세요.
                    </p>
                    <input
                      style={S.confirmInput}
                      value={confirmText}
                      onChange={e => setConfirmText(e.target.value)}
                      placeholder="삭제"
                      aria-label="삭제 확인 입력"
                    />
                    <div>
                      <button
                        style={S.cancelBtn}
                        onClick={() => { setStep('idle'); setConfirmText('') }}
                        disabled={busy}
                      >취소</button>
                      <button
                        style={{ ...S.delBtn, ...((confirmText !== '삭제' || busy) ? S.delBtnDisabled : {}) }}
                        onClick={handleDelete}
                        disabled={confirmText !== '삭제' || busy}
                      >{busy ? '삭제 중…' : '영구 삭제'}</button>
                    </div>
                  </div>
                )}
                {err && <p style={S.errText}>{err}</p>}
              </>
            )}
          </div>
        )}

        <div style={S.section}>
          <h2 style={S.h2}>1. 안내</h2>
          <p style={S.p}>
            본 페이지는 <strong>오운</strong>(운영: 이루스케일즈) 서비스의 이용자가 자신의 계정과
            관련 데이터를 삭제하는 방법을 안내합니다. 로그인한 상태라면 위의 <strong>“계정 삭제”</strong> 로
            앱에서 직접 즉시 삭제할 수 있으며, 삭제 시 아래 3번의 데이터가 <strong>영구 파기</strong>됩니다.
          </p>
        </div>

        <div style={S.section}>
          <h2 style={S.h2}>2. 삭제 방법</h2>
          <p style={S.p}>
            <strong>① 앱에서 직접 삭제 (권장)</strong> — 로그인 후 본 페이지 상단의 <strong>“계정 삭제”</strong> 버튼으로
            본인 계정과 데이터를 즉시 영구 삭제할 수 있습니다.
            (트레이너: <strong>설정 → 계정 → 계정 삭제</strong> / 회원: 상단 <strong>“계정 삭제”</strong>)
          </p>
          <p style={S.p}>
            <strong>② 문의로 요청</strong> — 로그인이 어려운 경우, 카카오톡 채널 <strong>@ownapp</strong>
            (<a href="https://pf.kakao.com/_ownapp" target="_blank" rel="noopener noreferrer" style={S.a}>https://pf.kakao.com/_ownapp</a>)
            또는 앱 내 <strong>“1:1 문의”</strong>로 가입 이메일 주소와 함께 “계정 삭제 요청”을 보내주세요. 본인 확인 후 처리됩니다.
          </p>
          <div style={S.info}>
            앱에서 직접 삭제 시 <strong>즉시</strong> 처리되며, 문의를 통한 요청은 본인 확인 후
            <strong> 영업일 기준 최대 5일 이내</strong>에 처리됩니다.
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
            현재 본 서비스는 결제 기능(PG)을 도입하지 않은 단계로, 계정 삭제 시 위 데이터는
            <strong> 지체 없이 전부 파기</strong>되며 별도로 보관하는 정보는 없습니다.
          </p>
          <div style={S.highlight}>
            향후 결제 기능 도입 시에는 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관련 법령에 따라
            거래·결제 기록을 법정 기간(예: 5년) 동안 분리 보관한 뒤 파기하게 되며, 정책 시행 전
            본 페이지와 개인정보 처리방침에 반영하여 사전 공지합니다.
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
