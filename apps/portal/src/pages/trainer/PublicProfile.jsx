// PublicProfile.jsx
// 트레이너 공개 프로필 페이지 — /t/{handle} (dev 전용 라우트).
// anon 도 봄: trainer_profiles(is_public) / trainer_packages / member_transformations 는
// 공개 RLS 로 읽힘. 상담은 카톡 연결 + 익명 profile_events 기록 (PII 미수집).
// 설계: docs/trainer-public-profile-design.md
//
// ※ "오운 인증 데이터" 집계 박스는 후속(060 RPC).

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@trainer-log/shared/lib/supabase'

const LIME = '#c8f135', LIME_DK = '#4d7c0f', INK = '#0f172a'
const BG = '#f5f7fa'

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

  return (
    <div style={{ background: '#0a0f1a', minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: BG, position: 'relative', paddingBottom: 92 }}>

        {/* ───── 히어로 ───── */}
        <div style={{ position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(165deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)',
          padding: '44px 24px 34px', color: '#fff', textAlign: 'center' }}>
          {/* 라임 글로우 */}
          <div style={{ position: 'absolute', top: -70, right: -50, width: 220, height: 220,
            background: 'radial-gradient(circle, rgba(200,241,53,0.28), transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -90, left: -60, width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(200,241,53,0.12), transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative' }}>
            {profile.photo_url
              ? <img src={profile.photo_url} alt="" crossOrigin="anonymous"
                  style={{ width: 104, height: 104, borderRadius: '50%', objectFit: 'cover',
                    border: `3px solid ${LIME}`, boxShadow: '0 10px 30px rgba(200,241,53,0.35)' }} />
              : <div style={{ width: 104, height: 104, borderRadius: '50%', margin: '0 auto',
                  background: `linear-gradient(135deg, ${LIME}, #a3e635)`, color: INK, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 900,
                  boxShadow: '0 10px 30px rgba(200,241,53,0.35)' }}>{(profile.display_name || '?')[0]}</div>}

            <div style={{ fontSize: 25, fontWeight: 900, marginTop: 16, letterSpacing: -0.5 }}>{profile.display_name}</div>
            {profile.tagline && (
              <div style={{ fontSize: 13.5, color: LIME, fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>{profile.tagline}</div>
            )}

            <div style={{ display: 'flex', gap: 7, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {profile.location && <Meta>📍 {profile.location}</Meta>}
              {(profile.specialties || []).slice(0, 3).map(s => <Meta key={s}>{s}</Meta>)}
            </div>
          </div>
        </div>

        {/* ───── 본문 ───── */}
        <div style={{ padding: '24px 20px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {(profile.specialties || []).length > 0 && (
            <Section title="전문 분야" emoji="🎯">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {profile.specialties.map(s => <Chip key={s}>{s}</Chip>)}
              </div>
            </Section>
          )}

          {profile.bio && (
            <Section title="소개" emoji="✍️">
              <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px',
                boxShadow: '0 2px 14px rgba(15,23,42,0.06)' }}>
                <p style={{ fontSize: 14, lineHeight: 1.75, color: '#334155', whiteSpace: 'pre-wrap', margin: 0 }}>{profile.bio}</p>
              </div>
            </Section>
          )}

          {transes.length > 0 && (
            <Section title="회원 변화" emoji="🔥" sub="BEFORE → AFTER">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {transes.map(t => (
                  <div key={t.id} style={{ borderRadius: 18, overflow: 'hidden', background: '#fff',
                    boxShadow: '0 4px 20px rgba(15,23,42,0.10)' }}>
                    <div style={{ display: 'flex', height: 230, position: 'relative' }}>
                      <BAimg url={t.before_url} label="BEFORE" />
                      <div style={{ width: 2, background: LIME }} />
                      <BAimg url={t.after_url} label="AFTER" after />
                    </div>
                    <div style={{ padding: '15px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'linear-gradient(to right, #fbffe9, #ffffff 65%)' }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color: INK, letterSpacing: -1 }}>{t.result_label || '변화'}</span>
                      {t.duration_label && (
                        <span style={{ background: INK, color: LIME, fontSize: 12, fontWeight: 800, padding: '6px 13px', borderRadius: 20, letterSpacing: 0.3 }}>
                          ⏱ {t.duration_label}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 5, marginTop: 12, justifyContent: 'center' }}>
                ✓ 모든 사진은 회원 동의 후 게시됩니다
              </div>
            </Section>
          )}

          <div style={{ textAlign: 'center', fontSize: 11, color: '#cbd5e1', padding: '6px 0 2px' }}>
            Powered by <b style={{ color: LIME_DK }}>오운</b> · ownapp.kr
          </div>
        </div>

        {/* ───── 하단 고정 CTA 바 ───── */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', zIndex: 50, pointerEvents: 'none' }}>
          <div style={{ width: '100%', maxWidth: 480, padding: '12px 16px 16px',
            background: 'linear-gradient(to top, rgba(245,247,250,1) 60%, rgba(245,247,250,0))',
            display: 'flex', gap: 9, pointerEvents: 'auto' }}>
            <button onClick={openContact} style={{ flex: 1, padding: '15px', borderRadius: 14, border: 'none',
              background: `linear-gradient(135deg, ${LIME}, #a3e635)`, color: INK, fontSize: 15, fontWeight: 900,
              cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(200,241,53,0.45)' }}>
              💬 1:1 상담 신청하기
            </button>
            {packages.length > 0 && (
              <button onClick={openPricing} style={{ flex: '0 0 auto', padding: '15px 18px', borderRadius: 14,
                border: 'none', background: '#fff', color: INK, fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(15,23,42,0.12)' }}>
                ₩ 가격
              </button>
            )}
          </div>
        </div>

        {/* ───── 상담 패널 ───── */}
        {panel === 'contact' && (
          <Overlay onClose={() => setPanel(null)}>
            <h3 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 900, color: INK }}>{profile.display_name}와 상담</h3>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 18px' }}>카카오톡으로 바로 연결돼요</p>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#475569', marginBottom: 9 }}>관심 분야 (선택)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 20 }}>
              {(profile.specialties?.length ? profile.specialties : ['체중감량', '바디프로필', '식단']).map(s => (
                <button key={s} onClick={() => toggleInterest(s)} style={{
                  fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                  background: interests.includes(s) ? LIME : '#f1f5f9',
                  color: interests.includes(s) ? INK : '#64748b',
                  border: 'none', transition: 'all .12s',
                }}>{s}</button>
              ))}
            </div>
            <button onClick={goKakao} disabled={!profile.kakao_link} style={{ width: '100%', padding: 15, borderRadius: 14,
              border: 'none', background: '#FEE500', color: '#3b1e1e', fontSize: 15, fontWeight: 900,
              cursor: profile.kakao_link ? 'pointer' : 'not-allowed', opacity: profile.kakao_link ? 1 : 0.5, fontFamily: 'inherit' }}>
              💬 카카오톡으로 상담하기
            </button>
            {!profile.kakao_link && <p style={{ fontSize: 11.5, color: '#dc2626', marginTop: 8 }}>아직 상담 링크가 등록되지 않았어요.</p>}
            <p style={{ fontSize: 11.5, color: '#15803d', background: '#f0fdf4', borderRadius: 10, padding: '10px 12px', marginTop: 14, lineHeight: 1.5 }}>
              🔒 오운은 이름·연락처를 저장하지 않아요. 상담은 카카오톡에서 진행됩니다.
            </p>
          </Overlay>
        )}

        {/* ───── 가격 패널 ───── */}
        {panel === 'pricing' && (
          <Overlay onClose={() => setPanel(null)}>
            <h3 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 900, color: INK }}>수업 안내</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {packages.map(p => (
                <div key={p.id} style={{ border: '1.5px solid #eef2f6', borderRadius: 14, padding: 15, background: '#fbfdff' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{p.name}</div>
                  <div style={{ fontSize: 21, fontWeight: 900, color: LIME_DK, marginTop: 4 }}>
                    {Number(p.price).toLocaleString()}원
                    {p.sessions ? <span style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600 }}> · {p.sessions}회</span> : ''}
                  </div>
                  {p.description && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 5 }}>{p.description}</div>}
                </div>
              ))}
            </div>
            <button onClick={goKakao} disabled={!profile.kakao_link} style={{ width: '100%', padding: 15, borderRadius: 14, marginTop: 18,
              border: 'none', background: '#FEE500', color: '#3b1e1e', fontSize: 15, fontWeight: 900,
              cursor: profile.kakao_link ? 'pointer' : 'not-allowed', opacity: profile.kakao_link ? 1 : 0.5, fontFamily: 'inherit' }}>
              이 조건으로 카톡 상담 →
            </button>
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
  return <span style={{ background: 'rgba(255,255,255,0.10)', fontSize: 11.5, fontWeight: 600, padding: '5px 11px', borderRadius: 20, border: '1px solid rgba(200,241,53,0.3)', color: '#e2e8f0' }}>{children}</span>
}
function Section({ title, emoji, sub, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span style={{ width: 4, height: 18, background: LIME, borderRadius: 2 }} />
        <span style={{ fontSize: 16, fontWeight: 900, color: INK, letterSpacing: -0.4 }}>{emoji ? emoji + ' ' : ''}{title}</span>
        {sub && <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}
function Chip({ children }) {
  return <span style={{ background: '#fff', color: LIME_DK, fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 20, border: '1.5px solid #e6f5b8', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>{children}</span>
}
function BAimg({ url, label, after }) {
  return (
    <div style={{ flex: 1, height: '100%', position: 'relative', background: url ? '#0a0f1a' : (after ? 'linear-gradient(160deg,#d9f99d,#a3e635)' : 'linear-gradient(160deg,#cbd5e1,#94a3b8)') }}>
      {url && <img src={url} alt={label} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9.5, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: 6, letterSpacing: 0.5 }}>{label}</span>
    </div>
  )
}
function Overlay({ children, onClose }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '24px 24px 0 0', padding: '14px 24px 30px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, color: '#cbd5e1', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
