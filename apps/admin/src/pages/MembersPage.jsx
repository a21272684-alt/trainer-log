import { useState, useEffect, useRef } from 'react'
import AdminIcon from '../components/AdminIcon'
import { Badge, SearchInput, Pagination, EmptyState, Avatar } from '../components/ui'
import { adminRpc, fmtDate } from '../lib/adminRpc'

// 회원 — 서버 검색(admin_search_members, 099). 예전 화면은 회원을 100명까지만 불러왔음.
// 보기 2가지: 전체 목록 / 트레이너별 (왼쪽 트레이너 → 오른쪽 그 트레이너의 회원)

const SORTS = [
  { id: 'recent', label: '최근 등록순' },
  { id: 'sessions', label: '수업 많은 순' },
  { id: 'name', label: '이름순' },
]

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

function MemberRows({ rows, showTrainer, onOpenTrainer }) {
  return rows.map(m => {
    const left = Math.max(0, (m.total_sessions || 0) - (m.done_sessions || 0))
    const pct = m.total_sessions ? Math.min(100, Math.round((m.done_sessions / m.total_sessions) * 100)) : 0
    return (
      <button key={m.id} type="button" className={`adm-tr adm-row-btn ${showTrainer ? 'adm-cols-members' : 'adm-cols-members-solo'}`}
        onClick={() => m.trainer_id && onOpenTrainer(m.trainer_id, 'members')}>
        <span className="adm-cell-name">
          <Avatar name={m.name} />
          <span style={{ minWidth: 0 }}>
            <span className="adm-ellipsis" style={{ display: 'block' }}>{m.name}</span>
            <span className="adm-cell-sub">{m.phone_tail ? `전화 ···${m.phone_tail}` : '전화 없음'}</span>
          </span>
          {m.suspended && <Badge tone="muted">정지</Badge>}
        </span>
        {showTrainer && <span className="adm-ellipsis adm-num">{m.trainer_name || '–'}</span>}
        <span>{m.lesson_purpose ? <Badge tone="gray">{m.lesson_purpose}</Badge> : <span className="adm-num adm-num--soft">–</span>}</span>
        <span>
          <span className="adm-num">{m.done_sessions}/{m.total_sessions}회</span>
          <span className="adm-mini-progress" style={{ display: 'block', marginTop: 4 }}><span className={left <= 2 && m.total_sessions ? 'is-amber' : ''} style={{ width: `${pct}%` }} /></span>
        </span>
        <span className="adm-num adm-num--soft">{m.last_log_at ? fmtDate(m.last_log_at) : '–'}</span>
        <span className="adm-num adm-num--soft">{fmtDate(m.created_at)}</span>
      </button>
    )
  })
}

export default function MembersPage({ onOpenTrainer, refreshKey, showToast }) {
  const [mode, setMode] = useState('all') // all | byTrainer
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim())
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  // 트레이너별 보기
  const [tq, setTq] = useState('')
  const dtq = useDebounced(tq.trim())
  const [tPage, setTPage] = useState(1)
  const [trainers, setTrainers] = useState(null)
  const [picked, setPicked] = useState(null) // { id, name, member_count }

  useEffect(() => { setPage(1) }, [dq, sort, pageSize, mode, picked?.id])
  useEffect(() => { setTPage(1) }, [dtq])

  // 회원 목록 (전체 또는 고른 트레이너)
  useEffect(() => {
    if (mode === 'byTrainer' && !picked) { setData(null); return }
    const id = ++reqId.current
    setLoading(true)
    adminRpc('admin_search_members', {
      p_query: dq || null, p_trainer_id: mode === 'byTrainer' ? picked.id : null,
      p_sort: sort, p_limit: pageSize, p_offset: (page - 1) * pageSize,
    }).then(r => { if (id === reqId.current) setData(r) })
      .catch(e => { if (id === reqId.current) showToast('회원 목록을 불러오지 못했어요: ' + e.message, 'error') })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }, [mode, picked?.id, dq, sort, page, pageSize, refreshKey])

  // 트레이너 목록 (회원 많은 순)
  useEffect(() => {
    if (mode !== 'byTrainer') return
    adminRpc('admin_search_trainers', { p_query: dtq || null, p_sort: 'members', p_limit: 12, p_offset: (tPage - 1) * 12 })
      .then(r => {
        setTrainers(r)
        if (!picked && r?.rows?.length) setPicked(r.rows[0])
      })
      .catch(e => showToast('트레이너 목록을 불러오지 못했어요: ' + e.message, 'error'))
  }, [mode, dtq, tPage, refreshKey])

  const rows = data?.rows || []
  const tRows = trainers?.rows || []
  const tPages = trainers ? Math.max(1, Math.ceil(trainers.total / 12)) : 1

  const table = (showTrainer) => (
    <div className={`adm-table${loading ? ' is-loading' : ''}`}>
      <div className={`adm-tr adm-th ${showTrainer ? 'adm-cols-members' : 'adm-cols-members-solo'}`}>
        <div>회원</div>{showTrainer && <div>담당 트레이너</div>}<div>레슨 목적</div><div>진행</div><div>마지막 일지</div><div>등록일</div>
      </div>
      {!data && <EmptyState title={mode === 'byTrainer' && !picked ? '왼쪽에서 트레이너를 고르세요' : '불러오는 중…'} />}
      {data && !rows.length && <EmptyState title={dq ? `'${dq}' 검색 결과가 없어요` : '회원이 없어요'} desc={dq ? '이름 일부, 초성(ㄱㅂㅈ), 전화번호 뒷자리 4자리로도 찾을 수 있어요' : null} />}
      <MemberRows rows={rows} showTrainer={showTrainer} onOpenTrainer={onOpenTrainer} />
      {data && data.total > 0 && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={setPageSize} />}
    </div>
  )

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">사람</p>
          <h1 className="adm-page-title">회원 <span>{data ? (dq ? `'${dq}' 검색 결과 ${data.total}명` : mode === 'byTrainer' && picked ? `${picked.name} 트레이너 · ${data.total}명` : `${data.total}명`) : ''}</span></h1>
        </div>
        <div className="adm-legacy-tabs" role="tablist" aria-label="보기 방식" style={{ marginBottom: 0 }}>
          <button type="button" role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'is-active' : ''} onClick={() => setMode('all')}>전체 목록</button>
          <button type="button" role="tab" aria-selected={mode === 'byTrainer'} className={mode === 'byTrainer' ? 'is-active' : ''} onClick={() => setMode('byTrainer')}>트레이너별</button>
        </div>
      </header>

      <div className="adm-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder={mode === 'byTrainer' ? '이 트레이너의 회원 찾기' : '회원 이름 · 초성 · 전화 뒷자리 · 트레이너 이름'} width={340} />
        <div style={{ flex: 1 }} />
        <label className="adm-select-label">정렬
          <select value={sort} onChange={e => setSort(e.target.value)}>
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {mode === 'all' ? table(true) : (
        <div className="adm-split">
          <aside className="adm-card adm-split-side">
            <SearchInput value={tq} onChange={setTq} placeholder="트레이너 찾기" />
            <div className="adm-pick-list" style={{ marginTop: 10 }}>
              {trainers && !tRows.length && <EmptyState title="트레이너가 없어요" />}
              {tRows.map(t => (
                <button key={t.id} type="button" className={picked?.id === t.id ? 'is-picked' : ''} onClick={() => setPicked(t)}>
                  <Avatar name={t.name} strong={picked?.id === t.id} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <b className="adm-ellipsis">{t.name}</b>
                    <em className="adm-ellipsis">{t.email}</em>
                  </span>
                  <span className={t.member_count === 0 ? 'adm-num adm-num--warn' : 'adm-num'}>{t.member_count}명</span>
                </button>
              ))}
            </div>
            {tPages > 1 && (
              <div className="adm-split-pager">
                <button type="button" className="adm-icon-btn is-bordered is-sm" disabled={tPage <= 1} onClick={() => setTPage(p => p - 1)} aria-label="이전"><AdminIcon name="chevronLeft" size={16} /></button>
                <span className="adm-num adm-num--soft">{tPage} / {tPages}</span>
                <button type="button" className="adm-icon-btn is-bordered is-sm" disabled={tPage >= tPages} onClick={() => setTPage(p => p + 1)} aria-label="다음"><AdminIcon name="chevronRight" size={16} /></button>
              </div>
            )}
          </aside>
          <div style={{ minWidth: 0 }}>{table(false)}</div>
        </div>
      )}
      <p className="adm-foot-note">줄을 누르면 담당 트레이너 상세 패널의 회원 탭이 열려요. 회원이 많아져도 서버에서 찾아와서 모두 검색돼요.</p>
    </div>
  )
}
