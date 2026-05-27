// ProfileEditor.jsx
// 트레이너 공개 프로필 편집 — 독립 컴포넌트 (TrainerApp 7000줄 파일 분리 원칙).
// 설계: docs/trainer-public-profile-design.md
//   - trainer_profiles(공개 프로필) + trainer_packages(수업/가격) CRUD
//   - 공개 페이지는 /t/{handle}. anon 이 보므로 표시용 이름/사진은 여기에 저장.
//   - 마이그 059 적용 후 동작.
//
// props: { trainer, onClose }   trainer = { id, name, profile_photo_url, ... }

import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'

const SPECIALTY_PRESET = ['체중감량','바디프로필','체형교정','식단관리','재활','근력강화','다이어트','자세교정']
const LIME = '#c8f135'

// 핸들 기본 제안: 이메일 앞부분(영문) 또는 trainer-랜덤
function suggestHandle(trainer) {
  const local = (trainer?.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
  if (local.length >= 3) return local.slice(0, 24)
  return 'trainer-' + Math.random().toString(36).slice(2, 8)
}
function normalizeHandle(v) {
  return (v || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)
}

export default function ProfileEditor({ trainer, onClose }) {
  const { showToast } = useToast()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [savedHandle, setSavedHandle] = useState(null) // 저장돼있던 핸들(변경 경고용)
  const [form, setForm] = useState({
    handle: '', display_name: '', tagline: '', bio: '',
    specialties: [], location: '', kakao_link: '',
    show_stats: true, is_public: false,
  })
  const [packages, setPackages] = useState([])

  useEffect(() => { if (trainer?.id) load() }, [trainer?.id])

  async function load() {
    setLoading(true)
    try {
      const { data: prof } = await supabase
        .from('trainer_profiles').select('*').eq('trainer_id', trainer.id).maybeSingle()
      if (prof) {
        setSavedHandle(prof.handle)
        setForm({
          handle: prof.handle || '',
          display_name: prof.display_name || trainer.name || '',
          tagline: prof.tagline || '',
          bio: prof.bio || '',
          specialties: prof.specialties || [],
          location: prof.location || '',
          kakao_link: prof.kakao_link || '',
          show_stats: prof.show_stats ?? true,
          is_public: prof.is_public ?? false,
        })
      } else {
        setForm(f => ({ ...f, handle: suggestHandle(trainer), display_name: trainer.name || '' }))
      }
      const { data: pkgs } = await supabase
        .from('trainer_packages').select('*').eq('trainer_id', trainer.id)
        .order('sort', { ascending: true })
      setPackages(pkgs || [])
    } catch (e) {
      console.warn('[ProfileEditor load]', e.message)
      showToast('프로필 로드 오류: ' + e.message)
    }
    setLoading(false)
  }

  function toggleSpecialty(s) {
    setForm(f => ({
      ...f,
      specialties: f.specialties.includes(s)
        ? f.specialties.filter(x => x !== s)
        : [...f.specialties, s],
    }))
  }

  async function save() {
    if (saving) return
    const handle = normalizeHandle(form.handle)
    if (handle.length < 3) return showToast('주소(handle)는 영문/숫자 3자 이상이어야 해요')
    if (!form.display_name.trim()) return showToast('이름을 입력해주세요')
    if (form.is_public && !form.kakao_link.trim())
      return showToast('공개하려면 카카오톡 상담 링크를 넣어주세요 (상담 연결용)')
    setSaving(true)
    try {
      const { error } = await supabase.from('trainer_profiles').upsert({
        trainer_id:   trainer.id,
        handle,
        display_name: form.display_name.trim(),
        tagline:      form.tagline.trim() || null,
        bio:          form.bio.trim() || null,
        specialties:  form.specialties,
        location:     form.location.trim() || null,
        kakao_link:   form.kakao_link.trim() || null,
        photo_url:    trainer.profile_photo_url || null,
        show_stats:   form.show_stats,
        is_public:    form.is_public,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'trainer_id' })
      if (error) {
        if (error.code === '23505') { showToast('이미 사용 중인 주소예요. 다른 주소를 써주세요'); return }
        throw error
      }
      setSavedHandle(handle)
      setForm(f => ({ ...f, handle }))
      showToast('✓ 프로필이 저장됐어요')
    } catch (e) {
      console.error('[ProfileEditor save]', e)
      showToast('저장 실패: ' + (e.message || '알 수 없는 오류'))
    }
    setSaving(false)
  }

  // ── 패키지 CRUD ──
  async function addPackage() {
    try {
      const { data, error } = await supabase.from('trainer_packages').insert({
        trainer_id: trainer.id, name: '새 패키지', price: 0,
        sort: packages.length,
      }).select().single()
      if (error) throw error
      setPackages(p => [...p, data])
    } catch (e) { showToast('패키지 추가 실패: ' + e.message) }
  }
  function editPackage(id, patch) {
    setPackages(p => p.map(x => x.id === id ? { ...x, ...patch } : x))
  }
  async function savePackage(pkg) {
    try {
      const { error } = await supabase.from('trainer_packages').update({
        name: pkg.name, price: Number(pkg.price) || 0,
        sessions: pkg.sessions ? Number(pkg.sessions) : null,
        description: pkg.description || null, active: pkg.active ?? true,
      }).eq('id', pkg.id)
      if (error) throw error
      showToast('✓ 패키지 저장')
    } catch (e) { showToast('패키지 저장 실패: ' + e.message) }
  }
  async function deletePackage(id) {
    if (!window.confirm('이 패키지를 삭제할까요?')) return
    try {
      await supabase.from('trainer_packages').delete().eq('id', id)
      setPackages(p => p.filter(x => x.id !== id))
    } catch (e) { showToast('삭제 실패: ' + e.message) }
  }

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>불러오는 중…</div>

  const handleChanged = savedHandle && normalizeHandle(form.handle) !== savedHandle
  const lbl = { fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }
  const inp = { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 520 }}>
      {/* 공개 주소 */}
      <div>
        <label style={lbl}>공개 주소 (인스타 아이디처럼 — 영문/숫자/하이픈)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>ownapp.kr/t/</span>
          <input style={{ ...inp, flex: 1 }} value={form.handle}
            onChange={e => setForm(f => ({ ...f, handle: normalizeHandle(e.target.value) }))}
            placeholder="jihoon-pt" />
        </div>
        {handleChanged && (
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 5 }}>
            ⚠️ 주소를 바꾸면 기존에 공유한 링크(ownapp.kr/t/{savedHandle})는 더 이상 열리지 않아요.
          </div>
        )}
      </div>

      {/* 이름 */}
      <div>
        <label style={lbl}>이름 (공개 표시)</label>
        <input style={inp} value={form.display_name}
          onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="김지훈 트레이너" />
      </div>

      {/* 한 줄 소개 */}
      <div>
        <label style={lbl}>한 줄 소개</label>
        <input style={inp} value={form.tagline}
          onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
          placeholder="체중감량 · 바디프로필 전문 PT · 8년차" />
      </div>

      {/* 전문 분야 */}
      <div>
        <label style={lbl}>전문 분야 (탭하여 선택)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SPECIALTY_PRESET.map(s => {
            const on = form.specialties.includes(s)
            return (
              <button key={s} type="button" onClick={() => toggleSpecialty(s)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: on ? '#f0fbd2' : '#fff',
                  color: on ? '#4d7c0f' : '#64748b',
                  border: `1.5px solid ${on ? '#d9f99d' : '#e2e8f0'}`,
                }}>{s}</button>
            )
          })}
        </div>
      </div>

      {/* 소개 */}
      <div>
        <label style={lbl}>소개</label>
        <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.bio}
          onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
          placeholder="운동 철학, 수업 방식 등을 적어주세요." />
      </div>

      {/* 위치 + 카톡 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>위치</label>
          <input style={inp} value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="서울 마포" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lbl}>카카오톡 상담 링크</label>
          <input style={inp} value={form.kakao_link}
            onChange={e => setForm(f => ({ ...f, kakao_link: e.target.value }))} placeholder="https://open.kakao.com/..." />
        </div>
      </div>

      {/* 토글들 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Toggle label="오운 인증 데이터 표시" desc="누적 일지·평균 유지·출석률 (데이터 적으면 끄기 권장)"
          on={form.show_stats} onClick={() => setForm(f => ({ ...f, show_stats: !f.show_stats }))} />
        <Toggle label="프로필 공개" desc="켜면 ownapp.kr/t/주소 에서 누구나 볼 수 있어요"
          on={form.is_public} onClick={() => setForm(f => ({ ...f, is_public: !f.is_public }))} highlight />
      </div>

      {/* 수업/가격 패키지 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>수업 / 가격 패키지</label>
          <button type="button" onClick={addPackage}
            style={{ fontSize: 12, fontWeight: 700, color: '#4d7c0f', background: '#f0fbd2', border: '1px solid #d9f99d', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>+ 추가</button>
        </div>
        {packages.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>아직 패키지가 없어요. "+ 추가"로 만들어보세요.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {packages.map(pkg => (
            <div key={pkg.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inp, flex: 2 }} value={pkg.name} placeholder="패키지명 (예: 20회 패키지)"
                  onChange={e => editPackage(pkg.id, { name: e.target.value })} />
                <input style={{ ...inp, flex: 1 }} type="number" value={pkg.price ?? ''} placeholder="가격(원)"
                  onChange={e => editPackage(pkg.id, { price: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inp, width: 90 }} type="number" value={pkg.sessions ?? ''} placeholder="횟수"
                  onChange={e => editPackage(pkg.id, { sessions: e.target.value })} />
                <input style={{ ...inp, flex: 1 }} value={pkg.description ?? ''} placeholder="설명 (선택)"
                  onChange={e => editPackage(pkg.id, { description: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => deletePackage(pkg.id)}
                  style={{ fontSize: 12, color: '#dc2626', background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>삭제</button>
                <button type="button" onClick={() => savePackage(pkg)}
                  style={{ fontSize: 12, fontWeight: 700, color: '#111827', background: LIME, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>저장</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 저장 / 미리보기 */}
      <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: '#fff', paddingTop: 6 }}>
        {onClose && (
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: 14, borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>닫기</button>
        )}
        <button type="button" onClick={save} disabled={saving}
          style={{ flex: 2, padding: 14, borderRadius: 12, border: 'none', background: LIME, color: '#111827', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
          {saving ? '저장 중…' : '프로필 저장'}
        </button>
      </div>
      {savedHandle && (
        <a href={`/t/${savedHandle}`} target="_blank" rel="noreferrer"
          style={{ fontSize: 12, color: '#4d7c0f', textAlign: 'center', textDecoration: 'none' }}>
          내 공개 페이지 보기 → ownapp.kr/t/{savedHandle}
        </a>
      )}
    </div>
  )
}

function Toggle({ label, desc, on, onClick, highlight }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
        background: on && highlight ? '#f0fdf4' : '#fff', cursor: 'pointer', fontFamily: 'inherit',
        border: `1.5px solid ${on ? (highlight ? '#86efac' : '#d9f99d') : '#e2e8f0'}`, borderRadius: 12, padding: 13,
      }}>
      <span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'block' }}>{label}</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>{desc}</span>
      </span>
      <span style={{ width: 42, height: 24, borderRadius: 14, background: on ? LIME : '#cbd5e1', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s' }} />
      </span>
    </button>
  )
}
