import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import AdminIcon from '../components/AdminIcon'
import { Badge, Switch, SidePanel, EmptyState } from '../components/ui'
import { adminRpc } from '../lib/adminRpc'

// 공지 — 공지사항(목록형)과 로그인 팝업(앱 켤 때 1회)을 한 화면에.
// 공지사항 쓰기는 notices 쓰기 정책이 service_role 전용이라 토큰 가드 RPC(admin_notice_save/delete, 099)로.

const fmtDT = (v) => v ? new Date(v).toLocaleString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const TARGET_LABEL = { all: '트레이너 + 회원', trainer: '트레이너만', member: '회원만' }
const splitLines = (s) => String(s || '').split('\n').map(l => l.trim()).filter(Boolean)

function NoticeEditor({ notice, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ title: notice?.title || '', content: notice?.content || '', is_pinned: !!notice?.is_pinned })
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const save = async () => {
    if (!form.title.trim()) return showToast('제목을 입력해 주세요', 'error')
    if (!form.content.trim()) return showToast('내용을 입력해 주세요', 'error')
    setSaving(true)
    try {
      await adminRpc('admin_notice_save', { p_id: notice?.id || null, p_title: form.title, p_content: form.content, p_is_pinned: form.is_pinned })
      showToast(notice ? '공지를 수정했어요' : '공지를 올렸어요', 'success')
      onSaved()
    } catch (e) { showToast('저장 실패: ' + e.message, 'error') }
    finally { setSaving(false) }
  }
  return (
    <SidePanel open onClose={onClose} width={560} label={notice ? '공지 수정' : '새 공지'}>
      <div className="adm-panel-head adm-panel-head--plain">
        <div className="adm-dialog-title"><h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{notice ? '공지 수정' : '새 공지'}</h2>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="닫기"><AdminIcon name="x" size={18} /></button></div>
      </div>
      <div className="adm-panel-body">
        <label className="adm-field"><span className="adm-field-label">제목</span>
          <input className="adm-input" type="text" value={form.title} onChange={e => set({ title: e.target.value })} placeholder="공지 제목" /></label>
        <label className="adm-field"><span className="adm-field-label">내용</span>
          <textarea className="adm-textarea" rows={8} value={form.content} onChange={e => set({ content: e.target.value })} placeholder="공지 내용" /></label>
        <div className="adm-box adm-box--row">
          <div style={{ flex: 1 }}><h3>맨 위에 고정</h3><p className="adm-box-text">고정한 공지는 목록 맨 위에 보여요</p></div>
          <Switch checked={form.is_pinned} onChange={v => set({ is_pinned: v })} label="맨 위에 고정" />
        </div>
        <p className="adm-section-label">미리보기</p>
        <div className="adm-notice-preview">
          <div className="adm-notice-preview-title">{form.is_pinned && <Badge tone="lime">고정</Badge>}<b>{form.title || '제목'}</b></div>
          <p>{form.content || '내용이 여기에 보여요'}</p>
          <em>관리자 · 방금</em>
        </div>
      </div>
      <div className="adm-panel-foot">
        <div style={{ flex: 1 }} />
        <button type="button" className="adm-btn" onClick={onClose}>취소</button>
        <button type="button" className="adm-btn adm-btn--primary" disabled={saving} onClick={save}>{saving ? '저장 중…' : notice ? '수정 저장' : '공지 올리기'}</button>
      </div>
    </SidePanel>
  )
}

export default function NoticesPage({ loginNotice, setLoginNotice, onSaveLogin, showToast }) {
  const [tab, setTab] = useState('notices')
  const [notices, setNotices] = useState(null)
  const [editing, setEditing] = useState(null) // { notice } | { notice: null } 새 공지
  const [busy, setBusy] = useState(null)
  const [savingLogin, setSavingLogin] = useState(false)

  const load = useCallback(() => {
    supabase.from('notices').select('*').is('trainer_id', null)
      .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => {
        if (error) showToast('공지를 불러오지 못했어요: ' + error.message, 'error')
        setNotices(data || [])
      })
  }, [showToast])
  useEffect(() => { load() }, [load])

  const remove = async (n) => {
    if (!window.confirm(`'${n.title}' 공지를 삭제할까요?`)) return
    setBusy(n.id)
    try {
      await adminRpc('admin_notice_delete', { p_id: n.id })
      showToast('공지를 삭제했어요', 'success'); load()
    } catch (e) { showToast('삭제 실패: ' + e.message, 'error') }
    finally { setBusy(null) }
  }
  const togglePin = async (n) => {
    setBusy(n.id)
    try {
      await adminRpc('admin_notice_save', { p_id: n.id, p_title: n.title, p_content: n.content, p_is_pinned: !n.is_pinned })
      load()
    } catch (e) { showToast('저장 실패: ' + e.message, 'error') }
    finally { setBusy(null) }
  }
  const saveLogin = async () => { setSavingLogin(true); try { await onSaveLogin() } finally { setSavingLogin(false) } }
  const ln = loginNotice
  const setLn = (patch) => setLoginNotice(p => ({ ...p, ...patch }))

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">운영</p>
          <h1 className="adm-page-title">공지</h1>
        </div>
        {tab === 'notices' && (
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => setEditing({ notice: null })}>
            <AdminIcon name="plus" size={16} strokeWidth={2.4} />새 공지
          </button>
        )}
      </header>

      <div className="adm-legacy-tabs" role="tablist" aria-label="공지 종류" style={{ marginBottom: 0 }}>
        <button type="button" role="tab" aria-selected={tab === 'notices'} className={tab === 'notices' ? 'is-active' : ''} onClick={() => setTab('notices')}>공지사항 {notices ? notices.length : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'is-active' : ''} onClick={() => setTab('login')}>
          로그인 팝업 {ln.enabled ? <Badge tone="lime">켜짐</Badge> : <Badge tone="muted">꺼짐</Badge>}
        </button>
      </div>

      {tab === 'notices' && (
        <div className="adm-table">
          {!notices && <EmptyState title="불러오는 중…" />}
          {notices && !notices.length && <EmptyState title="올린 공지가 없어요" desc="오른쪽 위 '새 공지'로 올릴 수 있어요" />}
          {(notices || []).map(n => (
            <div key={n.id} className={`adm-notice-row${n.is_pinned ? ' is-pinned' : ''}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="adm-notice-preview-title">{n.is_pinned && <Badge tone="lime">고정</Badge>}<b className="adm-ellipsis">{n.title}</b></div>
                <p className="adm-notice-body">{n.content}</p>
                <em className="adm-cell-sub">{n.author_name || '관리자'} · {fmtDT(n.created_at)}{n.updated_at && n.updated_at !== n.created_at ? ' · 수정됨' : ''}</em>
              </div>
              <div className="adm-row-actions">
                <button type="button" className="adm-btn adm-btn--sm" disabled={busy === n.id} onClick={() => togglePin(n)}>{n.is_pinned ? '고정 해제' : '고정'}</button>
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => setEditing({ notice: n })}>수정</button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--danger-ghost" disabled={busy === n.id} onClick={() => remove(n)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'login' && (
        <div className="adm-home-grid">
          <section className="adm-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="adm-box adm-box--row">
              <div style={{ flex: 1 }}><h3>로그인 팝업 켜기</h3><p className="adm-box-text">앱에 로그인한 직후 한 번 보여줘요. 저장하면 'N일 보지 않기'를 누른 사람에게도 다시 떠요.</p></div>
              <Switch checked={ln.enabled} onChange={v => setLn({ enabled: v })} label="로그인 팝업 켜기" />
            </div>
            <div className="adm-grid-2">
              <label className="adm-field"><span className="adm-field-label">보여줄 대상</span>
                <select className="adm-input" value={ln.target} onChange={e => setLn({ target: e.target.value })}>
                  <option value="all">트레이너 + 회원</option><option value="trainer">트레이너만</option><option value="member">회원만</option>
                </select></label>
              <label className="adm-field"><span className="adm-field-label">'N일 보지 않기'</span>
                <input className="adm-input" type="number" min="1" max="60" value={ln.snoozeDays} onChange={e => setLn({ snoozeDays: e.target.value })} /></label>
            </div>
            <label className="adm-field"><span className="adm-field-label">제목</span>
              <input className="adm-input" type="text" value={ln.title} onChange={e => setLn({ title: e.target.value })} placeholder="업데이트 안내" /></label>
            <label className="adm-field"><span className="adm-field-label">새로 생긴 기능 <small className="adm-hint">한 줄에 하나 · '날짜 | 내용' 형식 권장</small></span>
              <textarea className="adm-textarea" rows={4} value={ln.newItems} onChange={e => setLn({ newItems: e.target.value })} placeholder={'2026-11-06 | 수업 신청 기능이 생겼어요'} /></label>
            <label className="adm-field"><span className="adm-field-label">업데이트 예정 <small className="adm-hint">한 줄에 하나</small></span>
              <textarea className="adm-textarea" rows={3} value={ln.plannedItems} onChange={e => setLn({ plannedItems: e.target.value })} placeholder="iOS 앱 출시 예정" /></label>
            <div className="adm-box-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="adm-btn adm-btn--primary" disabled={savingLogin} onClick={saveLogin}>{savingLogin ? '저장 중…' : '저장하고 바로 반영'}</button>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-head"><h2>미리보기</h2>{ln.enabled ? <Badge tone="lime">{TARGET_LABEL[ln.target]}에게 보여요</Badge> : <Badge tone="muted">꺼져 있어서 아무에게도 안 보여요</Badge>}</div>
            <div className={`adm-phone${ln.enabled ? '' : ' is-off'}`}>
              <div className="adm-phone-modal">
                <b className="adm-phone-title">{ln.title || '공지'}</b>
                {splitLines(ln.newItems).length > 0 && (<>
                  <span className="adm-phone-label">새로 생긴 기능</span>
                  <ul>{splitLines(ln.newItems).map((l, i) => {
                    const [d, ...rest] = l.split('|')
                    return <li key={i}>{rest.length ? <><small>{d.trim()}</small> {rest.join('|').trim()}</> : l}</li>
                  })}</ul>
                </>)}
                {splitLines(ln.plannedItems).length > 0 && (<>
                  <span className="adm-phone-label">업데이트 예정</span>
                  <ul>{splitLines(ln.plannedItems).map((l, i) => <li key={i}>{l}</li>)}</ul>
                </>)}
                <div className="adm-phone-btns"><span>{Number(ln.snoozeDays) || 7}일 보지 않기</span><span className="is-primary">확인</span></div>
              </div>
            </div>
          </section>
        </div>
      )}

      {editing && (
        <NoticeEditor notice={editing.notice} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} showToast={showToast} />
      )}
    </div>
  )
}
