// TransformationsShare.jsx
// 회원이 자기 비포애프터를 직접 업로드 + 공개 동의 + 셀프 내리기.
// 설계: docs/trainer-public-profile-design.md
//   - 회원 주도 = 동의 자연 확보, 트레이너 무단 게시 X
//   - 사진은 클라 압축(compressImage, ~1080px WebP) → 'transformations' 버킷
//   - 동의 ON 이면 status='published' → 트레이너 공개 프로필에 노출
//   - 내리기(revoke) → 즉시 비공개. 셀프서비스라 CS 부담 0
//
// props: { member, onClose }   member = { id, auth_id, trainer_id, ... }

import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'
import { compressImage } from '@trainer-log/shared/lib/imageCompress'

const LIME = '#c8f135', INK = '#111827'
const INITIAL = {
  beforeBlob: null, beforePreview: '',
  afterBlob: null, afterPreview: '',
  duration_label: '', result_label: '',
  face_hidden: true, consent: true,
}

export default function TransformationsShare({ member, onClose }) {
  const showToast = useToast()
  const [list, setList]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]   = useState(INITIAL)

  useEffect(() => { if (member?.id) load() /* eslint-disable-next-line */ }, [member?.id])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('member_transformations').select('*').eq('member_id', member.id)
        .order('created_at', { ascending: false })
      setList(data || [])
    } catch (e) { console.warn('[TransformationsShare load]', e.message) }
    setLoading(false)
  }

  async function pickFile(which, file) {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) return showToast('20MB 이하 이미지를 골라주세요')
    try {
      const { blob, dataUrl, sizeKB } = await compressImage(file, { maxSize: 1080, quality: 0.75 })
      setForm(f => ({ ...f, [which + 'Blob']: blob, [which + 'Preview']: dataUrl }))
      console.log(`[compress ${which}] ${sizeKB}KB`)
    } catch (e) { showToast('이미지 처리 실패: ' + e.message) }
  }

  async function submit() {
    if (saving) return
    if (!form.beforeBlob && !form.afterBlob) return showToast('비포·애프터 사진을 추가해 주세요')
    if (!member.trainer_id) return showToast('담당 트레이너가 없어요 — 트레이너 등록 후 이용 가능')
    if (!member.auth_id)    return showToast('로그인이 필요해요')
    setSaving(true)
    const uploaded = []
    try {
      const ts = Date.now()
      let before_url = null, after_url = null
      if (form.beforeBlob) {
        const path = `${member.auth_id}/${ts}-before.webp`
        const { error } = await supabase.storage.from('transformations')
          .upload(path, form.beforeBlob, { contentType: 'image/webp', upsert: false })
        if (error) throw error
        uploaded.push(path)
        before_url = supabase.storage.from('transformations').getPublicUrl(path).data.publicUrl
      }
      if (form.afterBlob) {
        const path = `${member.auth_id}/${ts}-after.webp`
        const { error } = await supabase.storage.from('transformations')
          .upload(path, form.afterBlob, { contentType: 'image/webp', upsert: false })
        if (error) throw error
        uploaded.push(path)
        after_url = supabase.storage.from('transformations').getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase.from('member_transformations').insert({
        trainer_id: member.trainer_id, member_id: member.id,
        before_url, after_url,
        duration_label: form.duration_label.trim() || null,
        result_label:   form.result_label.trim()   || null,
        face_hidden:    form.face_hidden,
        consent:        form.consent,
        status:         form.consent ? 'published' : 'draft',
        consented_at:   form.consent ? new Date().toISOString() : null,
      })
      if (error) throw error
      showToast(form.consent ? '✓ 변화가 공유됐어요!' : '저장됐어요 (비공개)')
      setForm(INITIAL)
      await load()
    } catch (e) {
      // 업로드 롤백
      for (const p of uploaded) {
        try { await supabase.storage.from('transformations').remove([p]) } catch {}
      }
      console.error('[transformation submit]', e)
      showToast('저장 실패: ' + (e.message || '알 수 없는 오류'))
    }
    setSaving(false)
  }

  async function setStatus(id, status, withConsent = false) {
    try {
      const patch = { status }
      if (withConsent) { patch.consent = true; patch.consented_at = new Date().toISOString() }
      const { error } = await supabase.from('member_transformations').update(patch).eq('id', id)
      if (error) throw error
      showToast(status === 'revoked' ? '내림 완료' : status === 'published' ? '다시 게시했어요' : '저장됨')
      await load()
    } catch (e) { showToast('실패: ' + e.message) }
  }

  async function deleteOne(item) {
    if (!window.confirm('이 변화를 영구 삭제할까요?')) return
    try {
      // 스토리지 파일 정리 시도(베스트에포트)
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
      showToast('삭제됐어요')
      await load()
    } catch (e) { showToast('실패: ' + e.message) }
  }

  const lbl = { fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }
  const inp = { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 480 }}>
      {/* 기존 변화 목록 */}
      {!loading && list.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>내가 공유한 변화</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map(t => <Item key={t.id} t={t} onRevoke={() => setStatus(t.id, 'revoked')} onRepublish={() => setStatus(t.id, 'published', true)} onDelete={() => deleteOne(t)} />)}
          </div>
        </div>
      )}

      {/* 새 변화 제출 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>새 변화 공유</div>
        <div style={{ background: '#fbffe9', border: '1px solid #ecfccb', borderRadius: 12, padding: 12, fontSize: 12, color: '#3f6212', marginBottom: 12, lineHeight: 1.5 }}>
          담당 트레이너 프로필에 자랑할 변화를 공유해요. 사진은 자동 압축돼요 🗜️
        </div>

        {/* 비포/애프터 슬롯 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <Slot label="BEFORE" preview={form.beforePreview} onPick={f => pickFile('before', f)} />
          <Slot label="AFTER"  preview={form.afterPreview}  onPick={f => pickFile('after', f)} after />
        </div>

        {/* 성과 입력 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>기간 (선택)</label>
            <input style={inp} value={form.duration_label} placeholder="12주"
              onChange={e => setForm(f => ({ ...f, duration_label: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>변화 (선택)</label>
            <input style={inp} value={form.result_label} placeholder="-8.4kg"
              onChange={e => setForm(f => ({ ...f, result_label: e.target.value }))} />
          </div>
        </div>

        {/* 토글 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <Toggle label="얼굴 가리기" desc="얼굴이 보이지 않게 잘라서 올려주세요 (권장)"
            on={form.face_hidden} onClick={() => setForm(f => ({ ...f, face_hidden: !f.face_hidden }))} />
          <Toggle label="✓ 공개 프로필에 게시 동의" desc="끄면 비공개로 저장만 돼요. 게시 후에도 언제든 내릴 수 있어요"
            on={form.consent} onClick={() => setForm(f => ({ ...f, consent: !f.consent }))} highlight />
        </div>

        <div style={{ fontSize: 11, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '9px 11px', lineHeight: 1.5, marginBottom: 12 }}>
          🔒 동의를 끄면 게시되지 않아요. 게시 후에도 <b>언제든 내릴 수 있어요.</b>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {onClose && (
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>닫기</button>
          )}
          <button type="button" onClick={submit} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 12, border: 'none', background: LIME, color: INK, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
            {saving ? '저장 중…' : '변화 공유하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 작은 컴포넌트들 ──
function Slot({ label, preview, onPick, after }) {
  return (
    <label style={{
      flex: 1, height: 150, borderRadius: 12, border: preview ? 'none' : '2px dashed #cbd5e1',
      background: preview ? '#000' : (after ? 'linear-gradient(160deg,#d9f99d,#a3e635)' : 'linear-gradient(160deg,#cbd5e1,#94a3b8)'),
      position: 'relative', overflow: 'hidden', cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    }}>
      <input type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { onPick(e.target.files?.[0]); e.target.value = '' }} />
      {preview && <img src={preview} alt={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {!preview && <span style={{ fontSize: 12, fontWeight: 700, color: after ? '#3f6212' : '#475569' }}>＋ {label}</span>}
      <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '1px 6px', borderRadius: 5 }}>{label}</span>
    </label>
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
      <span style={{ width: 42, height: 24, borderRadius: 14, background: on ? LIME : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
      </span>
    </button>
  )
}
function Item({ t, onRevoke, onRepublish, onDelete }) {
  const pillColor = t.status === 'published' ? { c: '#166534', bg: '#dcfce7' }
    : t.status === 'revoked' ? { c: '#94a3b8', bg: '#f1f5f9' }
    : { c: '#b45309', bg: '#fef3c7' }
  const pillText = t.status === 'published' ? '게시 중' : t.status === 'revoked' ? '내려짐' : '비공개'
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', height: 110 }}>
        <ItemImg url={t.before_url} label="BEFORE" />
        <ItemImg url={t.after_url} label="AFTER" after />
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#4d7c0f' }}>{t.result_label || '변화'}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{t.duration_label ? ` · ${t.duration_label}` : ''}</span></div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: pillColor.c, background: pillColor.bg, padding: '3px 9px', borderRadius: 8 }}>{pillText}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px' }}>
        {t.status === 'published'
          ? <button onClick={onRevoke} style={miniBtn('#dc2626', '#fecaca')}>프로필에서 내리기</button>
          : <button onClick={onRepublish} style={miniBtn('#166534', '#bbf7d0')}>다시 게시</button>}
        <button onClick={onDelete} style={{ ...miniBtn('#94a3b8', '#e5e7eb'), flex: '0 0 auto' }}>삭제</button>
      </div>
    </div>
  )
}
function ItemImg({ url, label, after }) {
  return (
    <div style={{ flex: 1, position: 'relative', background: url ? '#000' : (after ? 'linear-gradient(160deg,#d9f99d,#a3e635)' : 'linear-gradient(160deg,#cbd5e1,#94a3b8)') }}>
      {url && <img src={url} alt={label} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '1px 6px', borderRadius: 5 }}>{label}</span>
    </div>
  )
}
function miniBtn(color, border) {
  return { flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${border}`, background: '#fff', color, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
}
