import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'

// 커뮤니티 > 신고함 — 신고된 글 목록 + 처리 (082 마이그레이션의 admin RPC 경유)
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_DB_TOKEN || ''

const REASON_LABEL = {
  fake_job: '허위·과장 채용', scam: '사기·먹튀 의심', copyright: '저작권 침해(도용)',
  spam: '스팸·광고', abuse: '욕설·혐오·괴롭힘', offtopic: '주제와 무관한 글', etc: '기타',
}
const CAT_LABEL = {
  trainer_hire: '트레이너 채용', trainer_seek: '구직 (트레이너)', gym_partner: '센터 제휴·협력',
  education_hire: '수강생 구인', member_recruit: '레슨 회원 모집', find_trainer: '트레이너 찾기',
  market_routine: '마켓 · 운동 루틴', market_program: '마켓 · 트레이닝 프로그램',
  market_nutrition: '마켓 · 식단 가이드', market_content: '마켓 · 교육 콘텐츠',
  educator_market: '마켓',
}
const ACTION_LABEL = { warn: '경고 · 글 삭제', d7: '7일 정지 · 글 삭제', perm: '영구 정지 · 글 삭제' }
const RESOLUTION_LABEL = { keep: '다시 공개됨', warn: '경고 · 삭제됨', d7: '7일 정지 · 삭제됨', perm: '영구 정지 · 삭제됨' }

// 제재 기준: 1회 경고 → 2회 7일 → 3회 이상 영구. 사기·먹튀는 즉시 영구.
function recommend(r) {
  if (r.reasons?.scam) return ['perm', '사기·먹튀 의심은 확인되면 즉시 영구 정지']
  if (r.strikes === 0) return ['warn', '첫 위반']
  if (r.strikes === 1) return ['d7', '두 번째 위반']
  return ['perm', `${r.strikes + 1}번째 위반`]
}

export default function CommunityReportsTab({ showToast }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy]       = useState(null)   // 처리 중인 post_id
  const [confirm, setConfirm] = useState(null)   // { post_id, action } — 두 번 눌러 확정

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_list_community_reports', {
        p_admin_token: ADMIN_TOKEN, p_include_resolved: showAll,
      })
      if (error) throw error
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      showToast('신고 목록을 불러오지 못했어요: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [showAll, showToast])

  useEffect(() => { load() }, [load])

  async function resolve(postId, action) {
    if (busy) return
    // 삭제·정지는 한 번 더 눌러야 실행
    if (action !== 'keep' && !(confirm?.post_id === postId && confirm?.action === action)) {
      setConfirm({ post_id: postId, action })
      return
    }
    setBusy(postId); setConfirm(null)
    try {
      const { data, error } = await supabase.rpc('admin_resolve_community_report', {
        p_admin_token: ADMIN_TOKEN, p_post_id: postId, p_action: action,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || '처리 실패')
      showToast(action === 'keep' ? '글을 다시 공개했어요' : `${ACTION_LABEL[action]} 처리했어요`)
      await load()
    } catch (e) {
      showToast('처리하지 못했어요: ' + e.message)
    } finally {
      setBusy(null)
    }
  }

  const openCount = rows.filter(r => r.is_open).length

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>신고된 글</span>
        <span className="badge badge-yellow">대기 {openCount}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          신고 3건이면 자동 숨김 · 제재: 1회 경고 → 2회 7일 → 3회 영구 (사기는 즉시 영구)
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className={`portal-tab-btn${!showAll ? ' active' : ''}`} onClick={() => setShowAll(false)}>처리 대기</button>
          <button className={`portal-tab-btn${showAll ? ' active' : ''}`} onClick={() => setShowAll(true)}>최근 30일 전체</button>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>새로고침</button>
        </div>
      </div>

      {loading && !rows.length && <div className="empty">불러오는 중…</div>}
      {!loading && !rows.length && <div className="empty">처리할 신고가 없어요</div>}

      {rows.map(r => {
        const [rec, recWhy] = recommend(r)
        const pending = r.is_open
        return (
          <div key={r.post_id} style={{ borderBottom: '1px solid var(--border)', padding: '14px 18px',
            display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {CAT_LABEL[r.category] || r.category} · 작성자 {r.author_name || '?'} ·{' '}
                  <span style={{ color: r.strikes ? '#fbbf24' : 'var(--text-muted)' }}>지난 위반 {r.strikes}회</span>
                </div>
              </div>
              {pending
                ? (r.status === 'hidden'
                    ? <span className="badge badge-red">자동 숨김</span>
                    : <span className="badge badge-yellow">확인 대기</span>)
                : <span className="badge">{RESOLUTION_LABEL[r.resolution] || '처리됨'}</span>}
              {pending && (
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: '#fbbf24' }}>
                  신고 {r.open_count}/3
                </span>
              )}
            </div>

            {r.content && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                {r.content}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(r.reasons || {}).map(([k, n]) => (
                <span key={k} style={{ fontSize: 11.5, background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text)', padding: '3px 8px', borderRadius: 6 }}>{REASON_LABEL[k] || k} ×{n}</span>
              ))}
            </div>

            {(r.memos || []).map((m, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', borderLeft: '2px solid var(--border)',
                paddingLeft: 10, lineHeight: 1.7 }}>“{m}”</div>
            ))}

            {pending && (
              <>
                <div style={{ fontSize: 12.5, color: '#4fc3f7' }}>
                  ★ 추천: <b>{ACTION_LABEL[rec]}</b> <span style={{ color: 'var(--text-muted)' }}>({recWhy})</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" disabled={busy === r.post_id}
                    onClick={() => resolve(r.post_id, 'keep')}>문제없음 · 다시 공개</button>
                  {['warn', 'd7', 'perm'].map(a => {
                    const armed = confirm?.post_id === r.post_id && confirm?.action === a
                    return (
                      <button key={a} className="btn btn-danger btn-sm" disabled={busy === r.post_id}
                        onClick={() => resolve(r.post_id, a)}
                        style={a === rec ? { outline: '2px solid #4fc3f7', outlineOffset: 1 } : undefined}>
                        {armed ? '한 번 더 누르면 실행' : `${ACTION_LABEL[a]}${a === rec ? ' ★' : ''}`}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
