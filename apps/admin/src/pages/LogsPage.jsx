import { useState, useEffect, useRef } from 'react'
import AdminIcon from '../components/AdminIcon'
import { Chip, SearchInput, Pagination, EmptyState, Avatar } from '../components/ui'
import { adminRpc, fmtDate } from '../lib/adminRpc'

// 수업일지 — 기간별 통계를 서버(admin_log_stats, 099)에서 집계. 예전엔 최근 100건만 보고 계산했음.

const PERIODS = [
  { id: 'day', label: '오늘' },
  { id: 'week', label: '최근 7일' },
  { id: 'month', label: '이번 달' },
]

export default function LogsPage({ onOpenTrainer, refreshKey, showToast }) {
  const [period, setPeriod] = useState('week')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(1) }, [dq, period, pageSize])

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    adminRpc('admin_log_stats', { p_period: period, p_query: dq || null, p_limit: pageSize, p_offset: (page - 1) * pageSize })
      .then(r => { if (id === reqId.current) setData(r) })
      .catch(e => { if (id === reqId.current) showToast('수업일지 통계를 불러오지 못했어요: ' + e.message, 'error') })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }, [period, dq, page, pageSize, refreshKey])

  const s = data?.summary || {}
  const daily = data?.daily || []
  const maxDay = Math.max(1, ...daily.map(d => d.n))
  const pLabel = PERIODS.find(p => p.id === period)?.label

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">운영</p>
          <h1 className="adm-page-title">수업일지 <span>전체 {s.all_time ?? ''}건</span></h1>
        </div>
        <div className="adm-chips" role="group" aria-label="기간">
          {PERIODS.map(p => <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</Chip>)}
        </div>
      </header>

      <div className="adm-stats adm-stats--3">
        <div className="adm-stat adm-stat--lime"><span>{pLabel} 작성</span><b>{s.logs ?? '–'}<small>건</small></b></div>
        <div className="adm-stat"><span>일지 쓴 트레이너</span><b>{s.trainers ?? '–'}<small>명</small></b></div>
        <div className="adm-stat"><span>수업 받은 회원</span><b>{s.members ?? '–'}<small>명</small></b></div>
      </div>

      <section className="adm-card">
        <div className="adm-card-head"><h2>날짜별 작성 수 <span className="adm-card-sub">최근 {daily.length}일</span></h2></div>
        <div className="adm-bars adm-bars--days" role="img" aria-label={`최근 ${daily.length}일 날짜별 수업일지 수`}>
          {daily.map(d => (
            <div key={d.d} className="adm-bar-col" title={`${d.d} · ${d.n}건`}>
              <div className="adm-bar-pair">
                <span className="adm-bar is-trainer" style={{ height: `${(d.n / maxDay) * 100}%` }}>{d.n > 0 && <i>{d.n}</i>}</span>
              </div>
              <span className="adm-bar-label">{Number(d.d.slice(8))}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="adm-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="트레이너 이름 · 이메일 · 초성" width={280} />
        <span className="adm-foot-note">많이 쓴 순서 · {pLabel} 기준</span>
      </div>

      <div className={`adm-table${loading ? ' is-loading' : ''}`}>
        <div className="adm-tr adm-th adm-cols-logs">
          <div>트레이너</div><div>{pLabel}</div><div>수업 회원</div><div>누적</div><div>마지막 작성</div><div />
        </div>
        {!data && <EmptyState title="불러오는 중…" />}
        {data && !data.rows.length && <EmptyState title={dq ? `'${dq}' 검색 결과가 없어요` : '트레이너가 없어요'} />}
        {(data?.rows || []).map(t => (
          <button key={t.id} type="button" className="adm-tr adm-cols-logs adm-row-btn" onClick={() => onOpenTrainer(t.id)}>
            <span className="adm-cell-name">
              <Avatar name={t.name} strong={t.period_count > 0} />
              <span style={{ minWidth: 0 }}>
                <span className="adm-ellipsis" style={{ display: 'block' }}>{t.name}</span>
                <span className="adm-cell-sub adm-ellipsis" style={{ display: 'block' }}>{t.email}</span>
              </span>
            </span>
            <span className={t.period_count ? 'adm-num' : 'adm-num adm-num--soft'} style={t.period_count ? { fontWeight: 800 } : undefined}>{t.period_count ? `${t.period_count}건` : '–'}</span>
            <span className="adm-num adm-num--soft">{t.period_members ? `${t.period_members}명` : '–'}</span>
            <span className="adm-num adm-num--soft">{t.total_count}건</span>
            <span className="adm-num adm-num--soft">{t.last_log_at ? fmtDate(t.last_log_at) : '없음'}</span>
            <span className="adm-cell-arrow"><AdminIcon name="chevronRight" size={18} strokeWidth={2.2} /></span>
          </button>
        ))}
        {data && data.total > 0 && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={setPageSize} />}
      </div>
    </div>
  )
}
