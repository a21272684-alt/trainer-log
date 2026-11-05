import { useState, useEffect, useRef } from 'react'
import AdminIcon from '../components/AdminIcon'
import { Badge, Chip, SearchInput, Pagination, EmptyState, Avatar } from '../components/ui'
import { adminRpc, seoulToday, daysBetween, fmtDate, planLabel } from '../lib/adminRpc'

// 트레이너 목록 — 검색·필터·정렬·페이지를 서버(admin_search_trainers)에서 처리.
// 예전 목록은 최근 100명만 불러와서 그 뒤 트레이너는 목록·검색 어디에도 안 보였음.

const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'subscribed', label: '구독 중' },
  { id: 'free', label: '무료' },
  { id: 'no_members', label: '회원 0명', tone: 'rose' },
  { id: 'no_credits', label: '크레딧 0' },
  { id: 'crm', label: 'CRM 사용' },
]
const SORTS = [
  { id: 'recent', label: '최근 가입순' },
  { id: 'members', label: '회원 많은 순' },
  { id: 'logs', label: '일지 많은 순' },
  { id: 'name', label: '이름순' },
]

export default function TrainersPage({ onOpenTrainer, onRegister, refreshKey, preset, showToast }) {
  const [q, setQ] = useState(preset?.q || '')
  const [dq, setDq] = useState(preset?.q || '')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)
  const today = seoulToday()

  // 통합 검색의 '전체 보기'로 들어오면 그 검색어로 시작
  useEffect(() => {
    if (preset?.q != null) { setQ(preset.q); setDq(preset.q); setFilter('all'); setPage(1) }
  }, [preset?.key])

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { setPage(1) }, [dq, filter, sort, pageSize])

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    adminRpc('admin_search_trainers', {
      p_query: dq || null, p_filter: filter, p_sort: sort,
      p_limit: pageSize, p_offset: (page - 1) * pageSize,
    }).then(res => {
      if (id === reqId.current) setData(res)
    }).catch(e => {
      if (id === reqId.current) showToast('트레이너 목록을 불러오지 못했어요: ' + e.message, 'error')
    }).finally(() => {
      if (id === reqId.current) setLoading(false)
    })
  }, [dq, filter, sort, page, pageSize, refreshKey])

  const counts = data?.counts || {}
  const rows = data?.rows || []

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">사람</p>
          <h1 className="adm-page-title">트레이너 <span>{counts.all == null ? '' : dq ? `'${dq}' 검색 결과 ${counts.all}명` : `${counts.all}명`}</span></h1>
        </div>
        <button type="button" className="adm-btn adm-btn--primary" onClick={onRegister}>
          <AdminIcon name="plus" size={16} strokeWidth={2.4} />트레이너 사전 등록
        </button>
      </header>

      <div className="adm-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="이름 · 이메일 · 초성으로 찾기" width={280} />
        <div className="adm-chips" role="group" aria-label="필터">
          {FILTERS.map(f => (
            <Chip key={f.id} active={filter === f.id} tone={f.tone} onClick={() => setFilter(f.id)}>
              {f.label} {counts[f.id] ?? ''}
            </Chip>
          ))}
        </div>
        <label className="adm-select-label">정렬
          <select value={sort} onChange={e => setSort(e.target.value)}>
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className={`adm-table${loading ? ' is-loading' : ''}`}>
        <div className="adm-tr adm-th adm-cols-trainers">
          <div>트레이너</div><div>플랜</div><div>회원</div><div>수업일지</div><div>AI 크레딧</div><div>CRM</div><div>가입일</div><div />
        </div>
        {data && !rows.length && (
          <EmptyState title={dq ? `'${dq}' 검색 결과가 없어요` : '해당하는 트레이너가 없어요'} desc={dq ? '이름 일부나 초성(ㅇㅈㅎ)으로도 찾아보세요' : null} />
        )}
        {!data && <EmptyState title="불러오는 중…" />}
        {rows.map(t => {
          const isNew = daysBetween(String(t.created_at).slice(0, 10), today) <= 7
          const soon = t.subscribed && t.valid_until ? daysBetween(today, t.valid_until) : null
          return (
            <button key={t.id} type="button" className="adm-tr adm-cols-trainers adm-row-btn" onClick={() => onOpenTrainer(t.id)}>
              <span className="adm-cell-name">
                <Avatar name={t.name} strong={t.subscribed} />
                <span className="adm-ellipsis">{t.name}</span>
                {isNew && <span className="adm-new">NEW</span>}
                {t.approval_status === 'pending' && <Badge tone="amber">승인 대기</Badge>}
              </span>
              <span>
                {t.subscribed
                  ? <Badge tone={t.plan === 'pro' ? 'blue' : 'lime'} title={`${fmtDate(t.valid_until)}까지`}>{planLabel(t.plan)}{soon != null && soon <= 30 ? ` · D-${soon}` : ''}</Badge>
                  : <Badge tone="gray">무료</Badge>}
              </span>
              <span className={t.member_count === 0 ? 'adm-num adm-num--warn' : 'adm-num'}>{t.member_count}명</span>
              <span className="adm-num adm-num--soft">{t.log_count ? `${t.log_count}건` : '–'}</span>
              <span className={t.credits <= 0 ? 'adm-num adm-num--danger' : 'adm-num'}>{t.credits <= 0 ? '0 · 소진' : t.credits}</span>
              <span>{t.crm ? <Badge tone="blue">사용</Badge> : <span className="adm-num adm-num--soft">–</span>}</span>
              <span className="adm-num adm-num--soft">{fmtDate(t.created_at)}</span>
              <span className="adm-cell-arrow"><AdminIcon name="chevronRight" size={18} strokeWidth={2.2} /></span>
            </button>
          )
        })}
        {data && data.total > 0 && (
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>
      <p className="adm-foot-note">줄을 누르면 오른쪽에 상세 패널이 열려요. 목록은 서버에서 찾아와서 트레이너가 많아져도 전부 검색돼요.</p>
    </div>
  )
}
