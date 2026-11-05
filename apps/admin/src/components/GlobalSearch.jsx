import { useState, useEffect, useRef, useMemo } from 'react'
import AdminIcon from './AdminIcon'
import { Badge } from './ui'
import { NAV_GROUPS, NAV_GROUP_LABEL } from './AdminSidebar'
import { adminRpc, planLabel, textMatch } from '../lib/adminRpc'

// 통합 검색 (Ctrl K) — 트레이너·회원은 서버(admin_global_search)에서 찾으므로 인원이 많아도 빠지지 않는다.
// 메뉴 바로가기는 화면 안에서 찾음. 자음만 입력하면 초성 검색.

// 사이드바 메뉴 + 화면 안 세부 항목
const MENU_ITEMS = [
  ...NAV_GROUPS.flatMap(g => g.items.map(i => ({ label: i.label, nav: i.id, where: g.label || '' }))),
  { label: '기능 권한 (무료 · Pro · Premium)', nav: 'plans', where: '플랜 · 기능 권한' },
  { label: '공지사항', nav: 'notices', where: '공지' },
  { label: '로그인 팝업 공지', nav: 'settings', where: '시스템 설정' },
  { label: '커뮤니티 신고함', nav: 'community', where: '커뮤니티' },
  { label: 'AI 키 · 1:1 문의 채널', nav: 'settings', where: '시스템 설정' },
  { label: '법적 고지 (약관 · 개인정보 · 환불)', nav: 'settings', where: '시스템 설정' },
  { label: '트레이너 사전 등록', nav: 'trainers', where: '트레이너' },
]

const RECENT_KEY = 'adm_recent_trainers'
export function rememberTrainer(t) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(x => x.id !== t.id)
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ id: t.id, name: t.name }, ...list].slice(0, 5)))
  } catch { /* 저장 불가 환경은 무시 */ }
}
function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

export default function GlobalSearch({ open, onClose, onOpenTrainer, onNavigate }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(0)
  const reqId = useRef(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQ(''); setRes(null); setCursor(0); setError('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  // 입력이 멈추면 0.2초 뒤 서버 검색 (마지막 요청 결과만 반영)
  useEffect(() => {
    const term = q.trim()
    if (!open || !term) { setRes(null); setLoading(false); return }
    setLoading(true)
    const id = ++reqId.current
    const timer = setTimeout(async () => {
      try {
        const data = await adminRpc('admin_global_search', { p_query: term, p_limit: 6 })
        if (id === reqId.current) { setRes(data); setError('') }
      } catch (e) {
        if (id === reqId.current) setError(e.message || '검색하지 못했어요')
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [q, open])

  const term = q.trim()
  const menus = useMemo(() => term ? MENU_ITEMS.filter(m => textMatch(m.label, term)).slice(0, 4) : [], [term])
  const recent = useMemo(() => (open ? readRecent() : []), [open])

  // 키보드 이동 대상 (트레이너 → 회원 → 메뉴 순)
  const items = useMemo(() => [
    ...(res?.trainers || []).map(t => ({ kind: 'trainer', key: 't' + t.id, data: t })),
    ...(res?.members || []).map(m => ({ kind: 'member', key: 'm' + m.id, data: m })),
    ...menus.map(m => ({ kind: 'menu', key: 'n' + m.label, data: m })),
  ], [res, menus])

  useEffect(() => { setCursor(0) }, [res, menus.length])

  const run = (item) => {
    if (!item) return
    if (item.kind === 'trainer') onOpenTrainer(item.data.id, 'overview')
    else if (item.kind === 'member') { if (item.data.trainer_id) onOpenTrainer(item.data.trainer_id, 'members') }
    else onNavigate(item.data.nav)
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(items.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[cursor]) }
  }

  if (!open) return null
  let idx = -1
  const rowClass = () => { idx += 1; return `adm-gs-row${idx === cursor ? ' is-cursor' : ''}` }
  const empty = term && !loading && res && !items.length

  return (
    <div className="adm-gs-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="adm-gs" role="dialog" aria-label="통합 검색" onKeyDown={onKeyDown}>
        <div className="adm-gs-input">
          <AdminIcon name="search" size={20} strokeWidth={2.2} />
          <input ref={inputRef} type="text" value={q} onChange={e => setQ(e.target.value)} aria-label="검색어"
            placeholder="트레이너 · 회원 이름, 메뉴 (초성도 돼요: ㅇㅈㅎ)" />
          {loading && <span className="adm-gs-loading">찾는 중…</span>}
          <kbd>Esc</kbd>
        </div>

        <div className="adm-gs-body">
          {!term && (
            recent.length ? (
              <>
                <div className="adm-gs-group">최근 본 트레이너</div>
                <div className="adm-gs-recent">
                  {recent.map(r => (
                    <button key={r.id} type="button" onClick={() => { onOpenTrainer(r.id, 'overview'); onClose() }}>{r.name}</button>
                  ))}
                </div>
              </>
            ) : <div className="adm-gs-hint">이름 일부만 입력해도 돼요. 회원은 전화번호 뒷자리(4자리 이상)로도 찾아요.</div>
          )}

          {error && <div className="adm-gs-hint" style={{ color: '#B91C1C' }}>{error}</div>}
          {empty && <div className="adm-gs-hint"><b>'{term}'</b> 결과가 없어요</div>}

          {res?.trainers?.length > 0 && (
            <>
              <div className="adm-gs-group">트레이너 · {res.trainer_total}명{res.trainer_total > res.trainers.length ? ` 중 ${res.trainers.length}명` : ''}</div>
              {res.trainers.map(t => (
                <button key={t.id} type="button" className={rowClass()} onClick={() => run({ kind: 'trainer', data: t })}>
                  <span className={`adm-avatar${t.plan ? ' is-strong' : ''}`} aria-hidden="true">{(t.name || '?').trim()[0]?.toUpperCase()}</span>
                  <span className="adm-gs-main">
                    <span className="adm-gs-title">{t.name}</span>
                    <span className="adm-gs-sub">회원 {t.member_count}명 · {String(t.created_at).slice(0, 10).replace(/-/g, '.')} 가입{t.email ? ` · ${t.email}` : ''}</span>
                  </span>
                  <Badge tone={t.plan === 'premium' ? 'lime' : t.plan === 'pro' ? 'blue' : 'gray'}>{t.plan ? planLabel(t.plan) : '무료'}</Badge>
                </button>
              ))}
              {res.trainer_total > res.trainers.length && (
                <button type="button" className="adm-gs-more" onClick={() => { onNavigate('trainers', term); onClose() }}>
                  트레이너 목록에서 '{term}' 전체 {res.trainer_total}명 보기 <AdminIcon name="arrowRight" size={14} />
                </button>
              )}
            </>
          )}

          {res?.members?.length > 0 && (
            <>
              <div className="adm-gs-group">회원 · {res.member_total}명{res.member_total > res.members.length ? ` 중 ${res.members.length}명` : ''}</div>
              {res.members.map(m => (
                <button key={m.id} type="button" className={rowClass()} onClick={() => run({ kind: 'member', data: m })}>
                  <span className="adm-avatar" aria-hidden="true">{(m.name || '?').trim()[0]}</span>
                  <span className="adm-gs-main">
                    <span className="adm-gs-title">{m.name}</span>
                    <span className="adm-gs-sub">{m.trainer_name ? `${m.trainer_name} 트레이너` : '담당 없음'} · 세션 {m.done_sessions}/{m.total_sessions}{m.phone_tail ? ` · •••• ${m.phone_tail}` : ''}</span>
                  </span>
                  <span className="adm-gs-go">트레이너 보기</span>
                </button>
              ))}
            </>
          )}

          {menus.length > 0 && (
            <>
              <div className="adm-gs-group">메뉴 바로가기</div>
              {menus.map(m => (
                <button key={m.label} type="button" className={rowClass()} onClick={() => run({ kind: 'menu', data: m })}>
                  <span className="adm-gs-menuicon"><AdminIcon name="arrowRight" size={16} strokeWidth={2.2} /></span>
                  <span className="adm-gs-main"><span className="adm-gs-title">{m.label}</span></span>
                  <span className="adm-gs-go">{m.where || NAV_GROUP_LABEL[m.nav] || ''}</span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="adm-gs-foot">
          <span><b>↑ ↓</b> 이동</span><span><b>Enter</b> 열기</span><span><b>Esc</b> 닫기</span>
          <span className="adm-gs-foot-right">어느 화면에서든 Ctrl K</span>
        </div>
      </section>
    </div>
  )
}
