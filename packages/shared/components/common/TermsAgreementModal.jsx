import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/* ═══════════════════════════════════════════════════════════════
   TermsAgreementModal
   - 최초 로그인 1회 명시적 동의 모달.
   - 사용자 메타데이터(user_metadata.terms_agreed)에 동의 여부를 영구 저장.
   - 4대 포털(트레이너 / 회원 / 커뮤니티 / 헬스장 운영자)의 로그인 직후
     화면 위에 강제로 렌더 — 닫기 버튼 없음, 동의 후에만 진행 가능.
   - 사용법: 포털 메인 JSX 최상단에 <TermsAgreementModal /> 한 줄 삽입.
   - DB 스키마 수정 0, 외부 패키지 0 (순수 React + Supabase Auth).
═══════════════════════════════════════════════════════════════ */
export default function TermsAgreementModal() {
  // 'idle'   : 사용자/메타데이터 미확인 (모달 미노출)
  // 'open'   : 동의 필요 — 모달 노출
  // 'saving' : 동의 처리 중
  // 'closed' : 동의 완료 또는 비대상 — 모달 미노출
  const [phase, setPhase] = useState('idle')
  const [agreed, setAgreed] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 마운트 시 현재 세션의 동의 상태 확인
  useEffect(() => {
    let cancelled = false

    const evaluate = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (cancelled) return
        if (error || !data?.user) {
          // 비로그인(anon) 또는 조회 실패 — 모달 미노출
          setPhase('closed')
          return
        }
        const already = data.user.user_metadata?.terms_agreed === true
        setPhase(already ? 'closed' : 'open')
      } catch {
        if (!cancelled) setPhase('closed')
      }
    }

    evaluate()

    // 로그인 직후 onAuthStateChange 로 다시 평가
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        evaluate()
      } else if (event === 'SIGNED_OUT') {
        setPhase('closed')
      }
    })

    return () => {
      cancelled = true
      subscription?.subscription?.unsubscribe?.()
    }
  }, [])

  if (phase !== 'open' && phase !== 'saving') return null

  async function handleStart() {
    if (!agreed || phase === 'saving') return
    setErrorMsg('')
    setPhase('saving')
    try {
      const { error } = await supabase.auth.updateUser({
        data: { terms_agreed: true, terms_agreed_at: new Date().toISOString() },
      })
      if (error) throw error
      setPhase('closed')
    } catch (e) {
      console.error('[TermsAgreementModal] 동의 저장 실패:', e?.message)
      setErrorMsg('동의 저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
      setPhase('open')
    }
  }

  const saving = phase === 'saving'
  const canStart = agreed && !saving

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 10, 15, 0.78)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Noto Sans KR', sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
          padding: '28px 24px 24px',
          color: '#0f172a',
          boxSizing: 'border-box',
        }}
      >
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '34px', lineHeight: 1, marginBottom: '10px' }}>📜</div>
          <h2
            id="terms-modal-title"
            style={{
              fontSize: '18px',
              fontWeight: 900,
              letterSpacing: '-0.4px',
              margin: 0,
            }}
          >
            서비스 시작을 위해 약관 동의가 필요합니다.
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: '#64748b',
              margin: '8px 0 0',
              lineHeight: 1.6,
            }}
          >
            아래 항목을 확인하신 후 동의해 주시면 서비스 이용을 시작하실 수 있어요.
          </p>
        </div>

        {/* 동의 체크 영역 */}
        <label
          htmlFor="terms-modal-agree"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px 16px',
            cursor: saving ? 'not-allowed' : 'pointer',
            marginBottom: '16px',
          }}
        >
          <input
            id="terms-modal-agree"
            type="checkbox"
            checked={agreed}
            disabled={saving}
            onChange={e => setAgreed(e.target.checked)}
            style={{
              marginTop: '3px',
              width: '18px',
              height: '18px',
              accentColor: '#10B981',
              flexShrink: 0,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          />
          <span style={{ fontSize: '13px', color: '#1e293b', lineHeight: 1.7 }}>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#10B981', fontWeight: 700, textDecoration: 'underline' }}
            >
              이용약관
            </a>
            {' 및 '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#10B981', fontWeight: 700, textDecoration: 'underline' }}
            >
              개인정보처리방침
            </a>
            <span>에 모두 동의합니다.</span>
            <span style={{ color: '#ef4444', fontWeight: 700, marginLeft: '4px' }}>(필수)</span>
          </span>
        </label>

        {/* 오류 메시지 */}
        {errorMsg && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '12px',
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '12px',
              lineHeight: 1.6,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* 시작하기 버튼 */}
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: '12px',
            border: 'none',
            background: canStart ? '#10B981' : '#cbd5e1',
            color: canStart ? '#ffffff' : '#64748b',
            fontWeight: 800,
            fontSize: '14px',
            cursor: canStart ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            transition: 'background 0.18s ease',
          }}
        >
          {saving ? '저장 중…' : '시작하기'}
        </button>

        <p
          style={{
            fontSize: '11px',
            color: '#94a3b8',
            textAlign: 'center',
            margin: '14px 0 0',
            lineHeight: 1.6,
          }}
        >
          동의 내역은 계정 메타데이터에 안전하게 보관되며, 한 번 동의하면 다시 표시되지 않습니다.
        </p>
      </div>
    </div>
  )
}
