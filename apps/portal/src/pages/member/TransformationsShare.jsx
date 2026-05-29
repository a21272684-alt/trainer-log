// TransformationsShare.jsx (재설계 2026-05-29)
// 회원이 트레이너가 올린 비포애프터에 1탭으로 동의/거부 + 공개된 것 영구삭제.
// 트레이너가 업로드(pending) → 여기서 회원이 동의(published) 또는 거부(declined).
// 7일 무응답 시 자연 비공개(공개 RLS = status='published' 만).
// 설계: docs/trainer-public-profile-design.md
//
// props: { member, onClose }

import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'

const LIME = '#c8f135', INK = '#111827'

export default function TransformationsShare({ member, onClose }) {
  const showToast = useToast()
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (member?.id) load() /* eslint-disable-next-line */ }, [member?.id])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('member_transformations').select('*').eq('member_id', member.id)
        .neq('status', 'declined') // 거부한 건 안 보임
        .order('created_at', { ascending: false })
      setList(data || [])
    } catch (e) { console.warn('[TransformationsShare load]', e.message) }
    setLoading(false)
  }

  async function approve(id) {
    try {
      const { error } = await supabase.from('member_transformations').update({
        consent: true,
        status: 'published',
        consented_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      showToast('✓ 공개 동의가 기록됐어요')
      await load()
    } catch (e) { showToast('실패: ' + e.message) }
  }

  async function decline(id) {
    if (!window.confirm('이 변화를 거부할까요? 트레이너에게 공유되지 않습니다.')) return
    try {
      const { error } = await supabase.from('member_transformations').update({
        consent: false, status: 'declined',
      }).eq('id', id)
      if (error) throw error
      showToast('거부됐어요')
      await load()
    } catch (e) { showToast('실패: ' + e.message) }
  }

  // 영구 삭제 — 강한 확인
  async function deleteForever(item) {
    const ok1 = window.confirm(
      '이 비포애프터를 영구 삭제할까요?\n\n' +
      '⚠️ 되돌릴 수 없어요. 다시 보이게 하려면 트레이너가 재업로드 + 다시 동의해야 합니다.'
    )
    if (!ok1) return
    try {
      // 스토리지 파일 정리
      const paths = []
      for (const url of [item.before_url, item.after_url]) {
        if (!url) continue
        const m = url.match(/transformations\/(.+)$/)
        if (m) paths.push(m[1])
      }
      if (paths.length) {
        try { await supabase.storage.from('transformations').remove(paths) } catch {}
      }
      const { error } = await supabase.from('member_transformations').delete().eq('id', item.id)
      if (error) throw error
      showToast('영구 삭제됐어요')
      await load()
    } catch (e) { showToast('실패: ' + e.message) }
  }

  const pending  = list.filter(t => t.status === 'pending')
  const approved = list.filter(t => t.status === 'published')

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>불러오는 중…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
      {/* 동의 대기 */}
      {pending.length > 0 && (
        <Section title={`동의 대기 (${pending.length})`} hint="트레이너가 올린 사진이에요. 동의하면 트레이너 공개 프로필에 노출돼요.">
          {pending.map(t => (
            <Card key={t.id} item={t}>
              <ExpireHint expiresAt={t.expires_at} />
              <Row>
                <BtnGhost onClick={() => decline(t.id)}>거부</BtnGhost>
                <BtnPrimary onClick={() => approve(t.id)}>✓ 공개 동의</BtnPrimary>
              </Row>
            </Card>
          ))}
        </Section>
      )}

      {/* 공개 중 */}
      {approved.length > 0 && (
        <Section title={`공개 중 (${approved.length})`} hint="트레이너 프로필에 노출되고 있어요. 언제든 영구 삭제 가능.">
          {approved.map(t => (
            <Card key={t.id} item={t} pillText="게시 중" pillColor={{ c: '#166534', bg: '#dcfce7' }}>
              <Row>
                <BtnDanger onClick={() => deleteForever(t)}>영구 삭제</BtnDanger>
              </Row>
            </Card>
          ))}
        </Section>
      )}

      {pending.length === 0 && approved.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>
          아직 트레이너가 올린 변화 사진이 없어요.
        </div>
      )}

      {onClose && (
        <button type="button" onClick={onClose}
          style={{ padding: 14, borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 }}>닫기</button>
      )}
    </div>
  )
}

// ── 작은 컴포넌트들 ──
function Section({ title, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>{hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}
function Card({ item, children, pillText, pillColor }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
      <BigImages before={item.before_url} after={item.after_url} />
      <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#4d7c0f' }}>
          {item.result_label || '변화'}
          {item.duration_label && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}> · {item.duration_label}</span>}
        </div>
        {pillText && <span style={{ fontSize: 10, fontWeight: 800, color: pillColor.c, background: pillColor.bg, padding: '3px 9px', borderRadius: 8 }}>{pillText}</span>}
      </div>
      <div style={{ padding: '0 14px 14px' }}>{children}</div>
    </div>
  )
}
function BigImages({ before, after }) {
  // 1열 큰 표시는 PublicProfile 에서. 회원 관리 화면은 2열 큰 셀로 충분.
  return (
    <div style={{ display: 'flex', height: 200 }}>
      <Half url={before} label="BEFORE" />
      <Half url={after} label="AFTER" after />
    </div>
  )
}
function Half({ url, label, after }) {
  return (
    <div style={{ flex: 1, position: 'relative', background: url ? '#000' : (after ? 'linear-gradient(160deg,#d9f99d,#a3e635)' : 'linear-gradient(160deg,#cbd5e1,#94a3b8)') }}>
      {url && <img src={url} alt={label} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 7px', borderRadius: 6 }}>{label}</span>
    </div>
  )
}
function ExpireHint({ expiresAt }) {
  if (!expiresAt) return null
  const days = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
  return (
    <div style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
      ⏱️ {days > 0 ? `${days}일 내 응답이 없으면 자동 비공개` : '응답 기한이 지났어요'}
    </div>
  )
}
function Row({ children }) {
  return <div style={{ display: 'flex', gap: 8 }}>{children}</div>
}
function BtnPrimary({ children, onClick }) {
  return <button onClick={onClick} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: LIME, color: INK, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
}
function BtnGhost({ children, onClick }) {
  return <button onClick={onClick} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
}
function BtnDanger({ children, onClick }) {
  return <button onClick={onClick} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
}
