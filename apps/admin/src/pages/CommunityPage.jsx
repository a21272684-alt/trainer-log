import { useState, useEffect, useRef } from 'react'
import AdminIcon from '../components/AdminIcon'
import { Badge, Switch, SearchInput, Pagination, EmptyState, Avatar, SidePanel } from '../components/ui'
import { adminRpc, fmtDate, won } from '../lib/adminRpc'
import CommunityReportsTab from './CommunityReportsTab'

// 커뮤니티 — 목록·조치를 토큰 가드 RPC(admin_community_*, 099)로.
// 예전엔 anon 키로 테이블을 직접 읽어서 RLS 에 막혀 유저·게시글이 0으로 보였음.

const TABS = [
  { id: 'reports', label: '신고함' },
  { id: 'posts', label: '게시글' },
  { id: 'users', label: '유저' },
  { id: 'contacts', label: '연락 요청' },
  { id: 'market', label: '마켓 거래' },
]
const ROLE_LABEL = { trainer: '트레이너', member: '회원', instructor: '교육강사', educator: '교육강사', gym_owner: '헬스장 대표' }
const ROLE_OPTIONS = [
  { key: 'trainer', label: '트레이너', desc: '구인·레슨 모집 글 작성' },
  { key: 'member', label: '회원', desc: '트레이너 찾기 글 작성' },
  { key: 'gym_owner', label: '헬스장 대표', desc: '채용공고·제휴 글 작성' },
  { key: 'educator', label: '교육강사', desc: '교육과정·마켓 글 작성' },
]
const CAT_LABEL = {
  trainer_hire: '트레이너 채용', trainer_seek: '구직', gym_partner: '센터 제휴', education_hire: '수강생 구인',
  member_recruit: '레슨 회원 모집', find_trainer: '트레이너 찾기', market_routine: '마켓 · 루틴',
  market_program: '마켓 · 프로그램', market_nutrition: '마켓 · 식단', market_content: '마켓 · 교육',
  educator_market: '마켓', trainer_lesson_recruit: '레슨 회원 모집', member_seeks_trainer: '트레이너 찾기',
  instructor_seeks_student: '수강생 구인', gym_seeks_trainer: '트레이너 채용', trainer_seeks_gym: '구직',
}
const CONTACT_STATUS = { pending: ['amber', '대기'], accepted: ['lime', '수락'], rejected: ['red', '거절'] }
const PLACEHOLDER = { posts: '제목 · 작성자', users: '이름 · 지역 · 초성', contacts: '요청자 · 게시글 제목', market: '' }

function PermPanel({ user, onClose, onSaved, showToast }) {
  const [perms, setPerms] = useState(user.admin_permissions || {})
  const [saving, setSaving] = useState(false)
  const extras = perms.extra_roles || []
  const save = async (next) => {
    const prev = perms
    setPerms(next); setSaving(true)
    try { await adminRpc('admin_community_user_perms', { p_user_id: user.id, p_perms: next }); onSaved() }
    catch (e) { setPerms(prev); showToast('권한 저장 실패: ' + e.message, 'error') }
    finally { setSaving(false) }
  }
  return (
    <SidePanel open onClose={onClose} width={480} label={`${user.name} 권한`}>
      <div className="adm-panel-head adm-panel-head--plain">
        <div className="adm-panel-id">
          <Avatar name={user.name} strong />
          <div style={{ flex: 1 }}>
            <div className="adm-panel-name"><h2>{user.name}</h2><Badge tone="blue">{ROLE_LABEL[user.role] || user.role}</Badge></div>
            <p className="adm-panel-meta">{user.location || '지역 없음'} · {fmtDate(user.created_at)} 가입 · 글 {user.post_count}개</p>
          </div>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="닫기"><AdminIcon name="x" size={18} /></button>
        </div>
      </div>
      <div className="adm-panel-body">
        <div className={`adm-box adm-box--row${perms.banned ? ' adm-box--danger' : ''}`}>
          <div style={{ flex: 1 }}><h3>커뮤니티 이용 차단</h3><p className="adm-box-text">켜면 로그인해도 글 목록에 들어갈 수 없어요</p></div>
          <Switch checked={!!perms.banned} disabled={saving} onChange={v => save({ ...perms, banned: v })} label="이용 차단" />
        </div>
        <p className="adm-section-label">추가 권한 <span className="adm-hint">체크한 역할의 글도 보고 쓸 수 있어요</span></p>
        <div className="adm-list">
          {ROLE_OPTIONS.filter(r => r.key !== user.role).map(r => {
            const on = extras.includes(r.key)
            return (
              <label key={r.key} className="adm-list-row" style={{ cursor: 'pointer' }}>
                <span style={{ flex: 1 }}><span className="adm-list-title">{r.label}</span><span className="adm-list-sub" style={{ display: 'block' }}>{r.desc}</span></span>
                <Switch checked={on} disabled={saving} label={r.label}
                  onChange={() => save({ ...perms, extra_roles: on ? extras.filter(x => x !== r.key) : [...extras, r.key] })} />
              </label>
            )
          })}
        </div>
      </div>
    </SidePanel>
  )
}

export default function CommunityPage({ refreshKey, showToast }) {
  const [tab, setTab] = useState('reports')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [permUser, setPermUser] = useState(null)
  const [tick, setTick] = useState(0)
  const reqId = useRef(0)
  const reload = () => setTick(t => t + 1)

  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(1) }, [dq, tab, pageSize])
  useEffect(() => { setQ(''); setDq(''); setData(null) }, [tab])

  useEffect(() => {
    const kind = tab === 'reports' ? 'users' : tab   // 신고함 탭은 위 숫자 카드용 통계만 받음
    const id = ++reqId.current
    setLoading(true)
    adminRpc('admin_community_list', { p_kind: kind, p_query: tab === 'reports' ? null : (dq || null), p_limit: tab === 'reports' ? 1 : pageSize, p_offset: tab === 'reports' ? 0 : (page - 1) * pageSize })
      .then(r => { if (id !== reqId.current) return; setStats(r.stats); if (tab !== 'reports') setData(r) })
      .catch(e => { if (id === reqId.current) showToast('커뮤니티 목록을 불러오지 못했어요: ' + e.message, 'error') })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }, [tab, dq, page, pageSize, refreshKey, tick])

  const postAction = async (p, action) => {
    if (action === 'delete' && !window.confirm(`'${p.title}' 글을 삭제할까요? 되돌릴 수 없어요.`)) return
    setBusy(p.id)
    try { await adminRpc('admin_community_post_action', { p_post_id: p.id, p_action: action }); showToast(action === 'close' ? '마감 처리했어요' : '글을 삭제했어요', 'success'); reload() }
    catch (e) { showToast('처리 실패: ' + e.message, 'error') }
    finally { setBusy(null) }
  }
  const deleteUser = async (u) => {
    if (!window.confirm(`'${u.name}' 유저를 삭제할까요? 쓴 글과 연락 요청도 함께 지워지고 되돌릴 수 없어요.`)) return
    setBusy(u.id)
    try { await adminRpc('admin_community_user_delete', { p_user_id: u.id }); showToast('유저를 삭제했어요', 'success'); reload() }
    catch (e) { showToast('삭제 실패: ' + e.message, 'error') }
    finally { setBusy(null) }
  }

  const rows = data?.rows || []
  const s = stats || {}

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">운영</p>
          <h1 className="adm-page-title">커뮤니티</h1>
        </div>
      </header>

      <div className="adm-stats">
        <button type="button" className="adm-stat adm-stat--btn" onClick={() => setTab('users')}><span>유저</span><b>{s.users ?? '–'}<small>명</small></b></button>
        <button type="button" className="adm-stat adm-stat--btn" onClick={() => setTab('posts')}><span>진행 중인 글</span><b>{s.posts_active ?? '–'}<small>건</small></b><em>전체 {s.posts ?? 0}건</em></button>
        <button type="button" className="adm-stat adm-stat--btn" onClick={() => setTab('contacts')}><span>연락 요청 대기</span><b>{s.contacts_pending ?? '–'}<small>건</small></b><em>수락 {s.contacts_accepted ?? 0}건</em></button>
        <button type="button" className={`adm-stat adm-stat--btn${s.reports_pending ? ' adm-stat--amber' : ''}`} onClick={() => setTab('reports')}><span>처리 안 한 신고</span><b>{s.reports_pending ?? '–'}<small>건</small></b></button>
      </div>

      <div className="adm-legacy-tabs" role="tablist" aria-label="커뮤니티 메뉴" style={{ marginBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}{t.id === 'reports' && s.reports_pending ? ` ${s.reports_pending}` : ''}
          </button>
        ))}
      </div>

      {tab === 'reports' && <div className="adm-legacy-wrap"><CommunityReportsTab showToast={showToast} /></div>}

      {tab !== 'reports' && (<>
        {tab !== 'market' && (
          <div className="adm-toolbar">
            <SearchInput value={q} onChange={setQ} placeholder={PLACEHOLDER[tab]} width={300} />
          </div>
        )}
        <div className={`adm-table${loading ? ' is-loading' : ''}`}>
          {tab === 'posts' && (<>
            <div className="adm-tr adm-th adm-cols-cposts"><div>제목</div><div>분류</div><div>작성자</div><div>연락</div><div>상태</div><div>작성일</div><div /></div>
            {rows.map(p => (
              <div key={p.id} className="adm-tr adm-cols-cposts">
                <span style={{ minWidth: 0 }}><span className="adm-ellipsis" style={{ display: 'block', fontWeight: 700 }}>{p.title}</span>{p.location && <span className="adm-cell-sub">{p.location}</span>}</span>
                <span><Badge tone="gray">{CAT_LABEL[p.category] || p.category}</Badge></span>
                <span style={{ minWidth: 0 }}><span className="adm-ellipsis" style={{ display: 'block' }}>{p.author_name || '?'}</span><span className="adm-cell-sub">{ROLE_LABEL[p.author_role] || ''}</span></span>
                <span className="adm-num adm-num--soft">{p.contact_count || 0}</span>
                <span>{p.status === 'active' ? <Badge tone="lime">진행 중</Badge> : p.status === 'closed' ? <Badge tone="muted">마감</Badge> : <Badge tone="red" title={p.hidden_reason || ''}>숨김</Badge>}</span>
                <span className="adm-num adm-num--soft">{fmtDate(p.created_at)}</span>
                <span className="adm-row-actions">
                  {p.status === 'active' && <button type="button" className="adm-btn adm-btn--sm" disabled={busy === p.id} onClick={() => postAction(p, 'close')}>마감</button>}
                  <button type="button" className="adm-btn adm-btn--sm adm-btn--danger-ghost" disabled={busy === p.id} onClick={() => postAction(p, 'delete')}>삭제</button>
                </span>
              </div>
            ))}
          </>)}

          {tab === 'users' && (<>
            <div className="adm-tr adm-th adm-cols-cusers"><div>이름</div><div>역할</div><div>지역</div><div>글</div><div>상태</div><div>가입일</div><div /></div>
            {rows.map(u => {
              const p = u.admin_permissions || {}
              return (
                <div key={u.id} className="adm-tr adm-cols-cusers">
                  <span className="adm-cell-name"><Avatar name={u.name} /><span style={{ minWidth: 0 }}><span className="adm-ellipsis" style={{ display: 'block' }}>{u.name}</span>{u.bio && <span className="adm-cell-sub adm-ellipsis" style={{ display: 'block' }}>{u.bio}</span>}</span></span>
                  <span><Badge tone="blue">{ROLE_LABEL[u.role] || u.role}</Badge></span>
                  <span className="adm-num adm-num--soft adm-ellipsis">{u.location || '–'}</span>
                  <span className="adm-num adm-num--soft">{u.post_count}개</span>
                  <span>{p.banned ? <Badge tone="red">차단</Badge> : (p.extra_roles || []).length ? <Badge tone="lime">+{p.extra_roles.length} 권한</Badge> : <span className="adm-num adm-num--soft">기본</span>}</span>
                  <span className="adm-num adm-num--soft">{fmtDate(u.created_at)}</span>
                  <span className="adm-row-actions">
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPermUser(u)}>권한</button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--danger-ghost" disabled={busy === u.id} onClick={() => deleteUser(u)}>삭제</button>
                  </span>
                </div>
              )
            })}
          </>)}

          {tab === 'contacts' && (<>
            <div className="adm-tr adm-th adm-cols-ccontacts"><div>요청자</div><div>대상 글</div><div>메시지</div><div>상태</div><div>요청일</div></div>
            {rows.map(c => {
              const [tone, label] = CONTACT_STATUS[c.status] || ['gray', c.status]
              return (
                <div key={c.id} className="adm-tr adm-cols-ccontacts">
                  <span style={{ minWidth: 0 }}><span className="adm-ellipsis" style={{ display: 'block', fontWeight: 700 }}>{c.requester_name || '?'}</span><span className="adm-cell-sub">{ROLE_LABEL[c.requester_role] || ''}</span></span>
                  <span className="adm-ellipsis adm-num adm-num--soft">{c.post_title || '(삭제된 글)'}</span>
                  <span className="adm-ellipsis adm-num adm-num--soft">{c.message || '–'}</span>
                  <span><Badge tone={tone}>{label}</Badge></span>
                  <span className="adm-num adm-num--soft">{fmtDate(c.created_at)}</span>
                </div>
              )
            })}
          </>)}

          {tab === 'market' && (<>
            <div className="adm-tr adm-th adm-cols-cmarket"><div>상품</div><div>판매자</div><div>구매자</div><div>거래일</div><div style={{ textAlign: 'right' }}>금액</div></div>
            {rows.map(p => (
              <div key={p.id} className="adm-tr adm-cols-cmarket">
                <span style={{ minWidth: 0 }}><span className="adm-ellipsis" style={{ display: 'block', fontWeight: 700 }}>{p.item_title || '(삭제된 상품)'}</span>{p.item_price != null && <span className="adm-cell-sub">정가 {won(p.item_price)}</span>}</span>
                <span className="adm-ellipsis adm-num">{p.seller_name || '–'}</span>
                <span className="adm-ellipsis adm-num">{p.buyer_name || '–'}</span>
                <span className="adm-num adm-num--soft">{fmtDate(p.purchased_at)}</span>
                <span className="adm-num" style={{ textAlign: 'right', fontWeight: 800 }}>{won(p.amount_paid)}</span>
              </div>
            ))}
          </>)}

          {!data && <EmptyState title="불러오는 중…" />}
          {data && !rows.length && <EmptyState title={dq ? `'${dq}' 검색 결과가 없어요` : `${TABS.find(t => t.id === tab)?.label}이(가) 아직 없어요`} />}
          {data && data.total > 0 && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={setPageSize} />}
        </div>
      </>)}

      {permUser && <PermPanel user={permUser} onClose={() => setPermUser(null)} onSaved={reload} showToast={showToast} />}
    </div>
  )
}
