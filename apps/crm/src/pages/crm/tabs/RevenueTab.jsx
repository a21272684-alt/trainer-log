import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@trainer-log/shared/lib/supabase'
import CrmIcon from '../components/CrmIcon'
import TopbarActions from '../components/TopbarActions'

// ── 매출 분석 ───────────────────────────────────────────────────
// 집계는 crm_revenue_report RPC(085 · 103). 대표는 센터 전체, 그 외 직원은 본인 매출만.
// 순매출 = 기간 내 결제 - 기간 내 환불 처리.
// 비교 = 1일부터 시작한 달은 지난달 같은 날까지, 그 외에는 같은 길이의 직전 기간.

const mono = { fontVariantNumeric: 'tabular-nums' }
const won  = n => Number(n || 0).toLocaleString() + '원'
const man  = n => {
  const v = Number(n || 0)
  return Math.abs(v) >= 10000 ? Math.round(v / 10000).toLocaleString() + '만' : v.toLocaleString()
}
const manWon = n => (Math.abs(Number(n || 0)) >= 10000 ? `${man(n)}원` : won(n))

// 큰 숫자 + 작은 단위 — [숫자, 단위]
function moneyParts(n, digits = 0) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 10000) return [(v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: digits }), '만원']
  return [v.toLocaleString('ko-KR'), '원']
}

const METHOD_LABEL = {
  cash: '현금', card: '카드', transfer: '계좌이체',
  local_currency: '지역화폐', payments_app: '페이먼츠앱',
}

// 상품 종류 묶음 — 색은 순위가 아니라 종류에 고정
const CATEGORY_GROUPS = [
  { key: 'pt',   label: '레슨 · PT',     color: '#4D7C0F', cats: ['레슨'] },
  { key: 'pass', label: '회원권',        color: '#4F46E5', cats: ['회원권'] },
  { key: 'pack', label: '패키지 · 구독', color: '#0891B2', cats: ['패키지', '구독권'] },
  { key: 'etc',  label: '기타',          color: '#B45309', cats: ['대여권', '일반'] },
]

// 로컬(한국) 날짜 → 'YYYY-MM-DD'
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function rangeFor(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (key === 'last') return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))]
  if (key === 'q')    return [ymd(new Date(y, m - 2, 1)), ymd(now)]
  return [ymd(new Date(y, m, 1)), ymd(now)]               // this
}

const PERIODS = [['this', '이번 달'], ['last', '지난 달'], ['q', '최근 3개월'], ['custom', '직접 지정']]

function periodCaption(period, from, to) {
  const [, fm, fd] = from.split('-').map(Number)
  const [, tm, td] = to.split('-').map(Number)
  if (period === 'this') return `${tm}월 ${fd}–${td}일`
  if (period === 'last') return `${fm}월`
  return `${fm}.${fd} – ${tm}.${td}`
}

// 일별 → 주별 묶음 (월별은 서버의 최근 6개월 값을 쓴다)
function bucket(daily, grain) {
  if (grain === 'day') return daily.map(d => ({ label: d.day.slice(5).replace('-', '/'), net: d.net, count: d.count }))
  const out = []
  const keyOf = d => {
    const dt = new Date(d.day + 'T00:00:00')
    const mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))   // 월요일 시작
    return ymd(mon)
  }
  for (const d of daily) {
    const k = keyOf(d)
    let b = out[out.length - 1]
    if (!b || b.key !== k) { b = { key: k, first: d.day, last: d.day, net: 0, count: 0 }; out.push(b) }
    b.net += d.net; b.count += d.count; b.last = d.day
  }
  return out.map(b => ({ label: `${b.first.slice(5).replace('-', '/')}~${b.last.slice(8)}`, net: b.net, count: b.count }))
}

function monthlySeries(monthly, to) {
  const [y, m, d] = to.split('-').map(Number)
  const partial = new Date(y, m, 0).getDate() !== d
  return monthly.map((x, i) => {
    const cur = i === monthly.length - 1
    const label = `${Number(x.month.slice(5))}월`
    return { label, tick: cur && partial ? `${label} (${d}일까지)` : label, net: x.net, count: x.count, cur }
  })
}

// 눈금: 1 · 2 · 5 단위로 3칸 안팎
function niceTicks(max) {
  if (max <= 1) return [0, 10000]
  const raw  = max / 3
  const mag  = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  const ticks = [0]
  while (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

const tickLabel = v => (v === 0 ? '0' : (Math.round(v / 1000) / 10).toLocaleString('ko-KR'))

function Delta({ cur, prev, label }) {
  if (!prev) return <span>{cur ? '비교할 지난 기록이 없어요' : '기록 없음'}</span>
  const pct = (cur - prev) / Math.abs(prev) * 100
  if (Math.abs(pct) < 0.05) return <span>{label} 같아요</span>
  return <span style={{ fontWeight: 700, color: pct > 0 ? '#3F6212' : '#BE123C' }}>{label} {pct > 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span>
}

function Kpi({ label, caption, parts, sub }) {
  return (
    <div className="card rev-kpi">
      <div className="rev-kpi-label">{label}{caption && <span> {caption}</span>}</div>
      <div className="rev-kpi-value" style={mono}>{parts[0]}<small>{parts[1]}</small></div>
      <div className="rev-kpi-sub">{sub}</div>
    </div>
  )
}

// ── 순매출 추이 ─────────────────────────────────────────────────
function TrendChart({ series, grain, resetKey }) {
  const [hover, setHover] = useState(-1)
  useEffect(() => { setHover(-1) }, [resetKey])

  const max   = Math.max(1, ...series.map(s => s.net))
  const ticks = niceTicks(max)
  const top   = ticks[ticks.length - 1]
  const hv    = series[hover]
  const peak  = series.reduce((b, s, i) => (s.net > (series[b]?.net ?? -Infinity) ? i : b), 0)
  const showAll = grain === 'month'

  return (
    <div className="rv-chart">
      <div className="rv-axis" style={mono}>
        {ticks.map(t => <span key={t} style={{ bottom: `calc(${t / top * 100}% - 7px)` }}>{tickLabel(t)}</span>)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="rev-plot" key={resetKey} onMouseLeave={() => setHover(-1)}>
          {ticks.slice(1).map(t => <div key={t} className="rev-grid" style={{ bottom: `${t / top * 100}%` }} />)}
          {series.map((s, i) => (
            <button key={i} type="button" className={`rev-bar ${s.cur ? 'cur' : ''} ${hover === i ? 'hot' : ''}`}
              aria-label={`${s.tick || s.label} 순매출 ${won(s.net)}, 결제 ${s.count}건`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(-1)}>
              <span style={{ height: `${Math.max(0, s.net) / top * 100}%`, animationDelay: `${Math.min(i, 40) * 12}ms` }}>
                {showAll && (s.cur || i === peak) && s.net > 0 && <em style={mono}>{man(s.net).replace('만', '')}</em>}
              </span>
            </button>
          ))}
          {hv && (
            <div className="rev-tip" style={{
              left: `clamp(0px, calc(${(hover + 0.5) / series.length * 100}% - 75px), calc(100% - 150px))`,
              bottom: `calc(${Math.min(85, Math.max(0, hv.net) / top * 100)}% + 10px)`,
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{hv.tick || hv.label}</div>
              <div style={{ ...mono, fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>{won(hv.net)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>결제 {hv.count}건</div>
            </div>
          )}
        </div>
        {showAll ? (
          <div className="rv-months" style={mono}>
            {series.map((s, i) => <span key={i} className={s.cur ? 'cur' : ''}>{s.tick || s.label}</span>)}
          </div>
        ) : (
          <div className="rev-ticks" style={mono}>
            {series.length > 0 && <span>{series[0].label}</span>}
            {series.length > 2 && <span>{series[Math.floor(series.length / 2)].label}</span>}
            {series.length > 1 && <span>{series[series.length - 1].label}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 상품 종류별 비중 ────────────────────────────────────────────
const R = 60
const CIRC = 2 * Math.PI * R
const GAP = 2

function CategoryDonut({ rows, caption }) {
  const [active, setActive] = useState(null)

  const parts = CATEGORY_GROUPS.map(g => {
    const hit = rows.filter(r => g.cats.includes(r.category))
    return { ...g, amount: hit.reduce((s, r) => s + Number(r.amount), 0), count: hit.reduce((s, r) => s + Number(r.count), 0) }
  })
  const total = parts.reduce((s, p) => s + p.amount, 0)
  const shown = parts.filter(p => p.amount > 0)
  const solo  = shown.length === 1
  let cum = 0
  const segs = shown.map(p => {
    const frac = p.amount / total
    const seg = { ...p, frac, dash: Math.max(0, frac * CIRC - (solo ? 0 : GAP)), off: -cum * CIRC }
    cum += frac
    return seg
  })
  const focus = shown.find(p => p.key === active)

  if (total <= 0) return <div className="rev-empty">기간 내 결제가 없어요</div>

  return (
    <div className="rv-donut-wrap">
      <div className="rv-donut">
        <svg width="156" height="156" viewBox="0 0 156 156" role="img"
          aria-label={`상품 종류별 비중: ${shown.map(p => `${p.label} ${Math.round(p.amount / total * 100)}%`).join(', ')}`}>
          <circle cx="78" cy="78" r={R} fill="none" stroke="#F2F3EF" strokeWidth="20" />
          {segs.map(s => (
            <circle key={s.key} cx="78" cy="78" r={R} fill="none" stroke={s.color}
              strokeWidth={active === s.key ? 23 : 20}
              strokeDasharray={`${s.dash.toFixed(2)} ${(CIRC - s.dash).toFixed(2)}`}
              strokeDashoffset={s.off.toFixed(2)} transform="rotate(-90 78 78)"
              style={{ transition: 'stroke-width 0.12s ease', cursor: 'default' }}
              onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)} />
          ))}
        </svg>
        <div className="rv-donut-center">
          <span>{focus ? focus.label : `${caption} 결제`}</span>
          <b style={mono}>{manWon(focus ? focus.amount : total)}</b>
          {focus && <span style={mono}>{focus.count}건</span>}
        </div>
      </div>
      <div className="rv-legend">
        {shown.map(p => (
          <div key={p.key} className={active === p.key ? 'on' : ''}
            onMouseEnter={() => setActive(p.key)} onMouseLeave={() => setActive(null)}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b style={mono}>{Math.round(p.amount / total * 100)}%</b>
            <em style={mono}>{man(p.amount)}</em>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankList({ rows, total }) {
  if (!rows.length) return <div className="rev-empty">기간 내 결제가 없어요</div>
  const max = Math.max(...rows.map(r => r.amount), 1)
  return rows.map((r, i) => (
    <div className="rev-rank" key={i}>
      <span className="rev-rank-name" title={r.name}>{r.name}</span>
      <div className="rev-track"><div className="rev-fill" style={{ width: `${Math.max(0, r.amount) / max * 100}%` }} /></div>
      <span style={{ ...mono, textAlign: 'right', fontWeight: 700 }}>{man(r.amount)}</span>
      <span style={{ ...mono, textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
        {total > 0 ? Math.round(r.amount / total * 100) + '%' : '—'}
      </span>
    </div>
  ))
}

export default function RevenueTab({ gymId, gymName }) {
  const [period, setPeriod] = useState('this')
  const [custom, setCustom] = useState(() => rangeFor('this'))
  const [grain,  setGrain]  = useState('month')
  const [data,   setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,  setError]  = useState('')

  const [from, to] = period === 'custom' ? custom : rangeFor(period)

  useEffect(() => {
    if (!from || !to || from > to) return
    let alive = true
    setLoading(true); setError('')
    supabase.rpc('crm_revenue_report', { p_gym_id: gymId, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setError(error.message); setData(null) } else setData(data)
        setLoading(false)
      })
    return () => { alive = false }
  }, [gymId, from, to])

  // 기간이 길면 일별 막대가 너무 많아짐 → 자동으로 주별
  useEffect(() => {
    const days = (new Date(to) - new Date(from)) / 86400000 + 1
    if (days > 62 && grain === 'day') setGrain('week')
  }, [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    if (!data) return []
    return grain === 'month' ? monthlySeries(data.monthly || [], to) : bucket(data.daily, grain)
  }, [data, grain, to])

  if (error) return <div className="pause-error">매출을 불러오지 못했어요: {error}</div>

  const cur  = data?.current  || { sales: 0, count: 0, refund: 0, refund_count: 0, new_count: 0, re_count: 0 }
  const prev = data?.previous || { sales: 0, count: 0, refund: 0, refund_count: 0 }
  const net     = cur.sales - cur.refund
  const prevNet = prev.sales - prev.refund
  const avg     = cur.count ? Math.round(cur.sales / cur.count) : 0
  const prevAvg = prev.count ? Math.round(prev.sales / prev.count) : 0
  const isGym   = data?.scope === 'gym'
  const caption = periodCaption(period, from, to)
  const prevMonth = data?.compare ? Number(data.compare.from.slice(5, 7)) : null
  const compareText = period === 'this' ? '지난달 같은 기간보다' : period === 'last' ? '그 전달보다' : '직전 같은 기간보다'
  const prevAvgLabel = (period === 'this' || period === 'last') && prevMonth ? `${prevMonth}월` : '직전 기간'
  const trainers = data?.by_trainer || []
  const maxTrainer = Math.max(1, ...trainers.map(t => t.amount))

  function exportExcel() {
    if (!data) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['기간', `${from} ~ ${to}`], ['범위', isGym ? '센터 전체' : '본인 매출'], [],
      ['항목', '이번 기간', '비교 기간'],
      ['매출', cur.sales, prev.sales], ['환불', cur.refund, prev.refund],
      ['순매출', net, prevNet], ['결제 건수', cur.count, prev.count], ['평균 결제액', avg, prevAvg],
    ]), '요약')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['날짜', '순매출', '결제 건수'], ...data.daily.map(d => [d.day, d.net, d.count]),
    ]), '일별')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['상품', '매출', '건수'], ...data.by_product.map(r => [r.name, r.amount, r.count]),
    ]), '상품별')
    if (isGym) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['트레이너', '매출', '건수'], ...(data.by_trainer || []).map(r => [r.name, r.amount, r.count]),
    ]), '트레이너별')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['결제 수단', '매출', '건수'], ...data.by_method.map(r => [METHOD_LABEL[r.method] || r.method, r.amount, r.count]),
    ]), '결제수단별')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['환불일', '회원', '상품', '금액'], ...data.refund_list.map(r => [r.date, r.member || '', r.product || '', r.amount]),
    ]), '환불')
    XLSX.writeFile(wb, `매출분석_${(gymName || '센터').replace(/\s+/g, '')}_${from}_${to}.xlsx`)
  }

  return (
    <div className="rv">
      <TopbarActions>
        <div className="rev-seg" role="group" aria-label="기간">
          {PERIODS.map(([k, l]) => (
            <button key={k} type="button" className={period === k ? 'on' : ''} aria-pressed={period === k}
              onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-lg" disabled={!data} onClick={exportExcel}>
          <CrmIcon name="download" size={16} />엑셀 내보내기
        </button>
      </TopbarActions>

      {period === 'custom' && (
        <div className="crm-range" style={{ width: '290px' }}>
          <input className="input" type="date" value={custom[0]} max={custom[1]} aria-label="시작일"
            onChange={e => setCustom([e.target.value, custom[1]])} />
          <span>~</span>
          <input className="input" type="date" value={custom[1]} min={custom[0]} aria-label="종료일"
            onChange={e => setCustom([custom[0], e.target.value])} />
        </div>
      )}

      <div className={`rev-kpis ${loading ? 'loading' : ''}`}>
        <Kpi label="순매출" caption={caption} parts={moneyParts(net)}
          sub={<Delta cur={net} prev={prevNet} label={compareText} />} />
        <Kpi label="결제" parts={[cur.count.toLocaleString('ko-KR'), '건']}
          sub={`재등록 ${cur.re_count ?? 0}건 · 신규 ${cur.new_count ?? 0}건`} />
        <Kpi label="평균 결제액" parts={moneyParts(avg, 1)}
          sub={prevAvg ? `${prevAvgLabel} ${manWon(prevAvg)}` : '비교할 지난 기록이 없어요'} />
        <Kpi label="환불" parts={moneyParts(cur.refund)}
          sub={cur.refund_count > 0 ? `${cur.refund_count}건 · 순매출에서 뺐어요` : '환불이 없어요'} />
      </div>

      {data && !isGym && <div className="rv-scope">내가 담당한 결제만 보여요. 센터 전체 매출은 대표만 볼 수 있어요.</div>}

      <div className="rv-top">
        <section className="card rv-card" aria-label="순매출 추이">
          <div className="rv-card-head">
            <h2>순매출 추이 <span>단위 만원 · 막대에 올리면 금액</span></h2>
            <div className="rev-seg sm" role="group" aria-label="단위">
              {[['day', '일별'], ['week', '주별'], ['month', '월별']].map(([k, l]) => (
                <button key={k} type="button" className={grain === k ? 'on' : ''} aria-pressed={grain === k}
                  onClick={() => setGrain(k)}>{l}</button>
              ))}
            </div>
          </div>
          <TrendChart series={series} grain={grain} resetKey={`${from}${to}${grain}`} />
        </section>

        <section className="card rv-card" aria-label="상품 종류별 비중">
          <div className="rv-card-head"><h2>상품 종류별 비중 <span>{caption}</span></h2></div>
          <CategoryDonut rows={data?.by_category || []} caption={caption} />
        </section>
      </div>

      <div className="rv-cards">
        {isGym && (
          <section className="rv-list" aria-label="트레이너별 매출">
            <h2>트레이너별 매출</h2>
            {trainers.length === 0 && <div className="rev-empty">기간 내 결제가 없어요</div>}
            {trainers.map(t => (
              <div key={t.name} className="rv-tr">
                <span className="rv-tr-who">
                  <span className="rv-av" aria-hidden="true">{(t.name || '?')[0]}</span>
                  <span><b>{t.name}</b><small>{t.count}건</small></span>
                </span>
                <span className="rv-tr-track"><span style={{ width: `${Math.max(0, t.amount) / maxTrainer * 100}%` }} /></span>
                <b className="rv-tr-amt" style={mono}>{manWon(t.amount)}</b>
              </div>
            ))}
          </section>
        )}

        <section className="rv-list" aria-label="상품별 매출">
          <h2>상품별 매출</h2>
          <div style={{ padding: '4px 18px 12px' }}>
            <RankList rows={(data?.by_product || []).slice(0, 8)} total={cur.sales} />
          </div>
        </section>

        <section className="rv-list" aria-label="결제 수단">
          <h2>결제 수단</h2>
          <div className="rv-method head"><span>수단</span><span>건수</span><span>금액</span><span>비중</span></div>
          {(data?.by_method || []).length === 0 && <div className="rev-empty">기간 내 결제가 없어요</div>}
          {(data?.by_method || []).map(r => (
            <div key={r.method} className="rv-method" style={mono}>
              <span className="n">{METHOD_LABEL[r.method] || r.method}</span>
              <span>{r.count}</span>
              <span className="a">{manWon(r.amount)}</span>
              <span className="p">{cur.sales > 0 ? Math.round(r.amount / cur.sales * 100) + '%' : '—'}</span>
            </div>
          ))}
        </section>

        <section className="rv-list" aria-label="환불 내역">
          <h2>환불 내역</h2>
          {(data?.refund_list || []).length === 0 && <div className="rev-empty">기간 내 환불이 없어요</div>}
          {(data?.refund_list || []).map((r, i) => (
            <div key={i} className="rv-refund">
              <span>
                <b>{r.member || '—'}</b>
                <small>{r.date?.slice(5).replace('-', '/')} · {r.product || '—'}</small>
              </span>
              <b className="neg" style={mono}>−{won(r.amount)}</b>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
