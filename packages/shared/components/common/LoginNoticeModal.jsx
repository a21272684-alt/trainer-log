import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * 로그인 직후 공지 모달.
 *
 * - app_settings 의 'login_notice' 키(JSON)를 읽어 조건 충족 시 표시.
 * - admin(AdminPortal)에서 제목/신규/예정/ON-OFF/스누즈일수/대상 편집.
 * - 'N일동안 보지않기' → localStorage 에 스누즈 기록. 같은 공지는 그 기간 안 뜸.
 * - 새 공지(updatedAt 갱신) → 스누즈 무시하고 재노출.
 * - '닫기' → 이번 세션만 닫힘 (다음 로그인 시 다시, 스누즈 안 누른 경우).
 *
 * 기존 생태계 무관: app_settings 읽기 1회 추가만. 키 없거나 enabled=false 면 아무것도 안 함.
 *
 * @param {'trainer'|'member'} target  이 화면의 종류 (notice.target 과 매칭)
 */
export default function LoginNoticeModal({ target }) {
  const [notice, setNotice]   = useState(null)   // 표시할 공지 (조건 통과 시)
  const [closed, setClosed]   = useState(false)  // 이번 세션 닫힘

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings').select('value').eq('key', 'login_notice').maybeSingle()
        if (error || !alive || !data?.value) return

        // jsonb / string 양형 호환 파싱
        let n = data.value
        if (typeof n === 'string') { try { n = JSON.parse(n) } catch { return } }
        if (!n || typeof n !== 'object') return
        if (!n.enabled) return

        // 대상 매칭: 'all' 또는 정확히 이 화면
        const tgt = n.target || 'all'
        if (tgt !== 'all' && tgt !== target) return

        // 스누즈 체크 — 같은 공지(updatedAt 동일) + 스누즈 기간 내면 숨김
        try {
          const raw = localStorage.getItem(`ownapp_login_notice_seen_${target}`)
          if (raw) {
            const seen = JSON.parse(raw)
            if (seen && seen.seenUpdatedAt === (n.updatedAt || '') &&
                typeof seen.snoozeUntil === 'number' && seen.snoozeUntil > Date.now()) {
              return // 스누즈 중
            }
          }
        } catch {}

        if (alive) setNotice(n)
      } catch {}
    })()
    return () => { alive = false }
  }, [target])

  if (!notice || closed) return null

  // 줄단위 파싱 — 신규: "날짜 | 내용", 예정: "내용"
  const parseLines = (s) =>
    String(s || '').split('\n').map(l => l.trim()).filter(Boolean)
  const newItems = parseLines(notice.newItems).map(l => {
    const i = l.indexOf('|')
    return i >= 0
      ? { date: l.slice(0, i).trim(), text: l.slice(i + 1).trim() }
      : { date: '', text: l }
  })
  const plannedItems = parseLines(notice.plannedItems)

  const snoozeDays = Number(notice.snoozeDays) > 0 ? Number(notice.snoozeDays) : 7

  const onSnooze = () => {
    try {
      localStorage.setItem(`ownapp_login_notice_seen_${target}`, JSON.stringify({
        seenUpdatedAt: notice.updatedAt || '',
        snoozeUntil: Date.now() + snoozeDays * 86400000,
      }))
    } catch {}
    setClosed(true)
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label={notice.title || '공지'}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setClosed(true) }}
    >
      <div style={{
        background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '440px',
        boxShadow: '0 24px 60px rgba(15,23,42,0.3)', overflow: 'hidden',
        fontFamily: "'Noto Sans KR',sans-serif",
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
        }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
            {notice.title || '공지'}
          </div>
          <button
            type="button" onClick={() => setClosed(true)} aria-label="닫기"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '20px', color: '#94a3b8', lineHeight: 1, padding: '2px 4px',
            }}
          >×</button>
        </div>

        <div style={{ padding: '0 20px 18px', maxHeight: '60vh', overflowY: 'auto' }}>
          {/* 신규 기능 */}
          {newItems.length > 0 && (
            <>
              <div style={{
                fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                color: '#16a34a', marginBottom: '10px',
              }}>신규 기능</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                {newItems.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#16a34a', fontWeight: 800, flexShrink: 0, marginTop: '1px' }}>✓</span>
                    <span style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                      {it.date && (
                        <span style={{ color: '#94a3b8', marginRight: '6px', fontFamily: "'DM Mono',monospace" }}>
                          {it.date}
                        </span>
                      )}
                      {it.text}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 업데이트 예정 */}
          {plannedItems.length > 0 && (
            <>
              <div style={{
                fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                color: '#d97706', marginBottom: '10px',
              }}>업데이트 예정</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {plannedItems.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#d97706', flexShrink: 0, marginTop: '1px' }}>◎</span>
                    <span style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>{t}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 하단 액션 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#fafbfc',
        }}>
          <button
            type="button" onClick={onSnooze}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '12px', color: '#94a3b8', textDecoration: 'underline',
              fontFamily: 'inherit', padding: 0,
            }}
          >{snoozeDays}일동안 보지않기</button>
          <button
            type="button" onClick={() => setClosed(true)}
            style={{
              border: 'none', background: '#84cc16', color: '#0f172a',
              cursor: 'pointer', fontSize: '13px', fontWeight: 700,
              padding: '9px 22px', borderRadius: '9px', fontFamily: 'inherit',
            }}
          >닫기</button>
        </div>
      </div>
    </div>
  )
}
