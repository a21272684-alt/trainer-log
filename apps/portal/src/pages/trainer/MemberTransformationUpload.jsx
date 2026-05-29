// MemberTransformationUpload.jsx
// 트레이너가 회원 비포애프터를 업로드 → status='pending' 으로 저장.
// 회원이 회원 앱에서 1탭 동의해야 공개. 7일 무응답 시 자연 비공개 (공개 RLS).
// 설계: docs/trainer-public-profile-design.md (2026-05-28 갱신 — 트레이너 업로드 전환)
//
// props: { trainer, members, onClose }

import { useState } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'
import { compressImage } from '@trainer-log/shared/lib/imageCompress'

const LIME = '#c8f135', INK = '#111827'
const INITIAL = {
  member_id: '',
  beforeBlob: null, beforePreview: '',
  afterBlob:  null, afterPreview:  '',
  duration_label: '', result_label: '',
}

export default function MemberTransformationUpload({ trainer, members, onClose }) {
  const showToast = useToast()
  const [form, setForm]   = useState(INITIAL)
  const [saving, setSaving] = useState(false)

  async function pickFile(which, file) {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) return showToast('20MB 이하 이미지를 골라주세요')
    try {
      const { blob, dataUrl } = await compressImage(file, { maxSize: 1080, quality: 0.75 })
      setForm(f => ({ ...f, [which + 'Blob']: blob, [which + 'Preview']: dataUrl }))
    } catch (e) { showToast('이미지 처리 실패: ' + e.message) }
  }

  async function submit() {
    if (saving) return
    if (!form.member_id)  return showToast('회원을 선택해 주세요')
    if (!form.beforeBlob || !form.afterBlob) return showToast('비포·애프터 사진 모두 추가해 주세요')
    if (!trainer?.auth_id) return showToast('로그인이 필요해요')
    const selectedMember = members.find(m => m.id === form.member_id)
    if (!selectedMember?.auth_id) {
      if (!window.confirm('이 회원은 아직 회원 앱에 로그인하지 않아 동의할 수 없어요. 그래도 업로드할까요? (회원이 가입·로그인 후 동의해야 공개됩니다)')) return
    }
    setSaving(true)
    const uploaded = []
    try {
      const ts = Date.now()
      const basePath = `${trainer.auth_id}/${ts}`
      // 비포
      const beforePath = `${basePath}-before.webp`
      const { error: e1 } = await supabase.storage.from('transformations')
        .upload(beforePath, form.beforeBlob, { contentType: 'image/webp', upsert: false })
      if (e1) throw e1
      uploaded.push(beforePath)
      const before_url = supabase.storage.from('transformations').getPublicUrl(beforePath).data.publicUrl
      // 애프터
      const afterPath = `${basePath}-after.webp`
      const { error: e2 } = await supabase.storage.from('transformations')
        .upload(afterPath, form.afterBlob, { contentType: 'image/webp', upsert: false })
      if (e2) throw e2
      uploaded.push(afterPath)
      const after_url = supabase.storage.from('transformations').getPublicUrl(afterPath).data.publicUrl
      // INSERT (pending — 회원 동의 대기)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const { error: e3 } = await supabase.from('member_transformations').insert({
        trainer_id: trainer.id,
        member_id:  form.member_id,
        before_url, after_url,
        duration_label: form.duration_label.trim() || null,
        result_label:   form.result_label.trim()   || null,
        consent: false,
        status: 'pending',
        expires_at: expiresAt,
      })
      if (e3) throw e3
      showToast('✓ 회원에게 동의 요청을 보냈어요')
      setForm(INITIAL)
      if (onClose) onClose()
    } catch (e) {
      for (const p of uploaded) {
        try { await supabase.storage.from('transformations').remove([p]) } catch {}
      }
      console.error('[MemberTransformationUpload]', e)
      showToast('업로드 실패: ' + (e.message || '알 수 없는 오류'))
    }
    setSaving(false)
  }

  const lbl = { fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }
  const inp = { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <div style={{ background: '#fbffe9', border: '1px solid #ecfccb', borderRadius: 12, padding: 12, fontSize: 12, color: '#3f6212', lineHeight: 1.5 }}>
        회원에게 동의 요청이 발송돼요. <b>회원이 동의해야 공개</b>되고, 7일 무응답 시 자동 비공개.
      </div>

      {/* 회원 선택 */}
      <div>
        <label style={lbl}>회원 선택</label>
        <select style={inp} value={form.member_id}
          onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
          <option value="">— 회원 선택 —</option>
          {(members || []).map(m => (
            <option key={m.id} value={m.id}>
              {m.name}{!m.auth_id ? ' (앱 미가입)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 비포/애프터 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <Slot label="BEFORE" preview={form.beforePreview} onPick={f => pickFile('before', f)} />
        <Slot label="AFTER"  preview={form.afterPreview}  onPick={f => pickFile('after', f)} after />
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        💡 얼굴이 보이지 않게 잘라서 올려주세요. 사진은 자동 압축돼요.
      </div>

      {/* 성과 */}
      <div style={{ display: 'flex', gap: 8 }}>
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

      {/* 액션 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {onClose && (
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: 14, borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>닫기</button>
        )}
        <button type="button" onClick={submit} disabled={saving}
          style={{ flex: 2, padding: 14, borderRadius: 12, border: 'none', background: LIME, color: INK, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
          {saving ? '업로드 중…' : '동의 요청 보내기'}
        </button>
      </div>
    </div>
  )
}

function Slot({ label, preview, onPick, after }) {
  return (
    <label style={{
      flex: 1, height: 150, borderRadius: 12, border: preview ? 'none' : '2px dashed #cbd5e1',
      background: preview ? '#000' : (after ? 'linear-gradient(160deg,#d9f99d,#a3e635)' : 'linear-gradient(160deg,#cbd5e1,#94a3b8)'),
      position: 'relative', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <input type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { onPick(e.target.files?.[0]); e.target.value = '' }} />
      {preview && <img src={preview} alt={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {!preview && <span style={{ fontSize: 12, fontWeight: 700, color: after ? '#3f6212' : '#475569' }}>＋ {label}</span>}
      <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '1px 6px', borderRadius: 5 }}>{label}</span>
    </label>
  )
}
