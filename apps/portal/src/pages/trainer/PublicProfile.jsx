// PublicProfile.jsx
// 트레이너 공개 프로필 페이지 — /t/{handle} (dev 전용 라우트, 시안 ① 렌더).
// anon 도 봄: trainer_profiles(is_public) / trainer_packages / member_transformations 는
// 공개 RLS 로 읽힘. 상담은 카톡 연결 + 익명 profile_events 기록 (PII 미수집).
// 설계: docs/trainer-public-profile-design.md
//
// ※ "오운 인증 데이터" 집계 박스는 후속(060 RPC) — MVP 에선 생략.

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@trainer-log/shared/lib/supabase'

const LIME = '#c8f135', NAVY = '#0f172a', INK = '#111827'

export default function PublicProfile() {
  const { handle } = useParams()
  const [loading, setLoading]   = useState(true)
  const [profile, setProfile]   = useState(null)
  const [packages, setPackages] = useState([])
  const [transes, setTranses]   = useState([])
  const [panel, setPanel]       = useState(null) // 'contact' | 'pricing' | null
  const [interests, setInterests] = useState([])

  useEffect(() => { load() /* eslint-disable-next-line */ }, [handle])

  async function load() {
    setLoading(true)
    try {
      const { data: prof } = await supabase
        .from('trainer_profiles').select('*').eq('handle', handle).maybeSingle()
      if (!prof) { setProfile(null); setLoading(false); return }
      setProfile(prof)
      logEvent(prof.trainer_id, 'view')
      const [{ data: pkgs }, { data: tr }] = await Promise.all([
        supabase.from('trainer_packages').select('*').eq('trainer_id', prof.trainer_id).order('sort'),
        supabase.from('member_transformations').select('*').eq('trainer_id', prof.trainer_id)
          .eq('status', 'published').order('created_at', { ascending: false }).limit(8),
      ])
      setPackages(pkgs || [])
      setTranses(tr || [])
    } catch (e) { console.warn('[PublicProfile]', e.message); setProfile(null) }
    setLoading(false)
  }

  function logEvent(trainerId, type, interest) {
    // 익명 이벤트 (실패해도 무시)
    supabase.from('profile_events').insert({ trainer_id: trainerId, type, interest: interest || null })
      .then(() => {}, () => {})
  }

  function openContact() { setPanel('contact'); if (profile) logEvent(profile.trainer_id, 'contact_click') }
  function openPricing() { setPanel('pricing'); if (profile) logEvent(profile.trainer_id, 'pricing_view') }
  function goKakao() {
    if (profile) logEvent(profile.trainer_id, 'contact_click', interests.join(','))
    if (profile?.kakao_link) window.open(profile.kakao_link, '_blank', 'noopener')
  }
  function toggleInterest(s) {
    setInterests(v => v.includes(s) ? v.filter(x => x !== s) : [...v, s])
  }

  if (loading) return <Center>불러오는 중…</Center>
  if (!profile) return <Center>프로필을 찾을 수 없어요.<br />주소를 다시 확인해 주세요.</Center>

  const wrap = { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc' }

  return (
    <div style={{ background: '#0a0f1a', minHeight: '100vh' }}>
      <div style={wrap}>
        {/* 히어로 */}
        <div style={{ background: NAVY, padding: '34px 24px 26px', color: '#fff', borderBottom: `4px solid ${LIME}` }}>
          {profile.photo_url
            ? <img src={profile.photo_url} alt="" crossOrigin="anonymous"
                style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', marginBottom: 12 }} />
            : <div style={{ width: 84, height: 84, borderRadius: '50%', background: LIME, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800, marginBottom: 12 }}>{(profile.display_name || '?')[0]}</div>}
          <div style={{ fontSize: 22, fontWeight: 800 }}>{profile.display_name}</div>
          {profile.tagline && <div style={{ fontSize: 13, color: LIME, fontWeight: 600, marginTop: 4 }}>{profile.tagline}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {profile.location && <Meta>📍 {profile.location}</Meta>}
            {(profile.specialties || []).slice(0, 3).map(s => <Meta key={s}>{s}</Meta>)}
          </div>
        </div>

        <div style={{ padding: '20px 24px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {(profile.specialties || []).length > 0 && (
            <Section title="전문 분야">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profile.specialties.map(s => <Chip key={s}>{s}</Chip>)}
              </div>
            </Section>
          )}

          {profile.bio && (
            <Section title="소개">
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#334155', whiteSpace: 'pre-wrap', margin: 0 }}>{profile.bio}</p>
            </Section>
          )}

          {transes.length > 0 && (
            <Section title="회원 변화 (BEFORE → AFTER)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {transes.map(t => (
                  <div key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
                    <div style={{ display: 'flex', height: 220 }}>
                      <BAimg url={t.before_url} label="BEFORE" />
                      <BAimg url={t.after_url} label="AFTER" after />
                    </div>
                    <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #fbffe9, #ffffff 60%)', borderTop: `3px solid ${LIME}` }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: -0.8 }}>{t.result_label || '변화'}</span>
                      {t.duration_label && (
                        <span style={{ background: LIME, color: INK, fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 20, letterSpacing: 0.3 }}>
                          {t.duration_label}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 9px', marginTop: 10 }}>
                ✓ 모든 사진은 회원 동의 후 게시
              </div>
            </Section>
          )}

          {/* CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Btn bg={LIME} color={INK} onClick={openContact}>💬 1:1 상담 신청하기</Btn>
            {packages.length > 0 && <Btn bg="#fff" color="#4d7c0f" border={LIME} onClick={openPricing}>수업/가격 안내 보기</Btn>}
          </div>

          <div style={{ textAlign: 'center', fontSize: 10, color: '#cbd5e1' }}>Powered by <b style={{ color: '#4d7c0f' }}>오운</b> · ownapp.kr</div>
        </div>

        {/* 상담 패널 */}
        {panel === 'contact' && (
          <Overlay onClose={() => setPanel(null)}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>{profile.display_name}와 상담</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>카카오톡으로 바로 연결돼요</p>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 7 }}>관심 분야 (선택)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
              {(profile.specialties?.length ? profile.specialties : ['체중감량', '바디프로필', '식단']).map(s => (
                <button key={s} onClick={() => toggleInterest(s)} style={{
                  fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                  background: interests.includes(s) ? '#f0fbd2' : '#fff',
                  color: interests.includes(s) ? '#4d7c0f' : '#64748b',
                  border: `1.5px solid ${interests.includes(s) ? '#d9f99d' : '#e2e8f0'}`,
                }}>{s}</button>
              ))}
            </div>
            <Btn bg="#FEE500" color="#3b1e1e" onClick={goKakao} disabled={!profile.kakao_link}>
              💬 카카오톡으로 상담하기
            </Btn>
            {!profile.kakao_link && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 8 }}>아직 상담 링크가 등록되지 않았어요.</p>}
            <p style={{ fontSize: 11, color: '#15803d', background: '#f0fdf4', borderRadius: 8, padding: '8px 10px', marginTop: 12, lineHeight: 1.5 }}>
              🔒 오운은 이름·연락처를 저장하지 않아요. 상담은 카카오톡에서 진행됩니다.
            </p>
          </Overlay>
        )}

        {/* 가격 패널 */}
        {panel === 'pricing' && (
          <Overlay onClose={() => setPanel(null)}>
            <h3 style={{ margin: '0 0 14px', fontSize: 17 }}>수업 안내</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {packages.map(p => (
                <div key={p.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 13 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{p.name}</div>
                  <div style={{ fontSize: 19, fontWeight: 900, color: '#4d7c0f', marginTop: 3 }}>
                    {Number(p.price).toLocaleString()}원
                    {p.sessions ? <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}> · {p.sessions}회</span> : ''}
                  </div>
                  {p.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{p.description}</div>}
                </div>
              ))}
            </div>
            <Btn bg="#FEE500" color="#3b1e1e" onClick={goKakao} disabled={!profile.kakao_link} style={{ marginTop: 16 }}>
              이 조건으로 카톡 상담 →
            </Btn>
          </Overlay>
        )}
      </div>
    </div>
  )
}

// ── 작은 프레젠테이션 컴포넌트들 ──
function Center({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#94a3b8', background: '#0a0f1a', fontSize: 14, lineHeight: 1.7 }}>{children}</div>
}
function Meta({ children }) {
  return <span style={{ background: 'rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(200,241,53,0.25)' }}>{children}</span>
}
function Section({ title, children }) {
  return <div><div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>{children}</div>
}
function Chip({ children }) {
  return <span style={{ background: '#f0fbd2', color: '#4d7c0f', fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 20, border: '1px solid #d9f99d' }}>{children}</span>
}
function Btn({ children, bg, color, border, onClick, disabled, style }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: 14, borderRadius: 13, fontSize: 14, fontWeight: 800, textAlign: 'center', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', width: '100%', background: bg, color, border: border ? `1.5px solid ${border}` : 'none', opacity: disabled ? 0.5 : 1, ...style }}>{children}</button>
}
function BAimg({ url, label, hidden, after }) {
  return (
    <div style={{ flex: 1, height: '100%', position: 'relative', background: url ? '#000' : (after ? 'linear-gradient(160deg,#d9f99d,#a3e635)' : 'linear-gradient(160deg,#cbd5e1,#94a3b8)'), display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      {url && <img src={url} alt={label} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: hidden ? 'none' : 'none' }} />}
      <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '1px 6px', borderRadius: 5 }}>{label}</span>
    </div>
  )
}
function Overlay({ children, onClose }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: '22px 24px 30px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
