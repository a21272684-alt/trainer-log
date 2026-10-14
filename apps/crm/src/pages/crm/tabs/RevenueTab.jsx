import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@trainer-log/shared/lib/supabase'

// ── 매출 분석 ───────────────────────────────────────────────────
// 집계는 crm_revenue_report RPC(085). 대표는 센터 전체, 그 외 직원은 본인 매출만.
// 순매출 = 기간 내 결제 - 기간 내 환불 처리. 비교 = 같은 길이의 직전 기간.

const mono = { fontFamily: "'DM Mono', monospace" }
const won  = n => Number(n || 0).toLocaleString() + '원'
const man  = n => {
  const v = Number(n || 0)
  return Math.abs(v) >= 10000 ? Math.round(v / 10000).toLocaleString() + '만' : v.toLocaleString()
}

const METHOD_LABEL = {
  cash: '현금', card: '카드', transfer: '계좌이체',
  local_currency: '지역화폐', payments_app: '페이먼츠앱',
}

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

// 일별 → 주/월 묶음
function bucket(daily, grain) {
  if (grain === 'day') return daily.map(d => ({ label: d.day.slice(5).replace('-', '/'), net: d.net, count: d.count }))
  const out = []
  const keyOf = d => {
    if (grain === 'month') return d.day.slice(0, 7)
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
  return out.map(b => ({
    label: grain === 'month'
      ? `${Number(b.key.slice(5))}월`
      : `${b.first.slice(5).replace('-', '/')}~${b.last.slice(8)}`,
    net: b.net, count: b.count,
  }))
}

function Delta({ cur, prev, invert = false, unit = 'pct' }) {
  if (!prev && !cur) return <span>지난 기간과 같음</span>
  if (!prev && unit !== 'count') return <span>지난 기간 기록 없음</span>
  const diff = cur - prev
  if (diff === 0) return <span>지난 기간과 같음</span>
  const good = invert ? diff < 0 : diff > 0
  const text = unit === 'count'
    ? `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}건`
    : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff / prev * 100).toFixed(1)}%`
  return <><span style={{ fontWeight: 700, color: good ? '#3F6212' : '#B42318' }}>{text}</span> 지난 기간 대비</>
}

function RankList({ rows, total, nameOf = r => r.name }) {
  if (!rows.length) return <div className="rev-empty">기간 내 결제가 없어요</div>
  const max = Math.max(...rows.map(r => r.amount), 1)
  return rows.map((r, i) => (
    <div className="rev-rank" key={i}>
      <span className="rev-rank-name" title={nameOf(r)}>{nameOf(r)}</span>
      <div className="rev-track"><div className="rev-fill" style={{ width: `${Math.max(0, r.amount) / max * 100}%` }} /></div>
      <span style={{ ...mono, textAlign: 'right' }}>{man(r.amount)}</span>
      <span style={{ ...mono, textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)' }}>
        {total > 0 ? Math.round(r.amount / total * 100) + '%' : '—'}
      </span>
    </div>
  ))
}

export default function RevenueTab({ gymId, gymName }) {
  const [period, setPeriod] = useState('this')
  const [custom, setCustom] = useState(() => rangeFor('this'))
  const [grain,  setGrain]  = useState('day')
  const [data,   setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,  setError]  = useState('')
  const [hover,  setHover]  = useState(-1)

  const [from, to] = period === 'custom' ? custom : rangeFor(period)

  useEffect(() => {
    if (!from || !to || from > to) return
    let alive = true
    setLoading(true); setError(''); setHover(-1)
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

  const series = useMemo(() => (data ? bucket(data.daily, grain) : []), [data, grain])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>매출을 불러오지 못했어요: {error}</div>

  const cur  = data?.current  || { sales: 0, count: 0, refund: 0, refund_count: 0 }
  const prev = data?.previous || { sales: 0, count: 0, refund: 0, refund_count: 0 }
  const net     = cur.sales - cur.refund
  const prevNet = prev.sales - prev.refund
  const avg     = cur.count ? Math.round(cur.sales / cur.count) : 0
  const prevAvg = prev.count ? Math.round(prev.sales / prev.count) : 0
  const isGym   = data?.scope === 'gym'

  const maxBar = Math.max(1, ...series.map(s => s.net))
  const axisTop = maxBar
  const hv = series[hover]

  function exportExcel() {
    if (!data) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['기간', `${from} ~ ${to}`], ['범위', isGym ? '센터 전체' : '본인 매출'], [],
      ['항목', '이번 기간', '직전 기간'],
      ['매출', cur.sales, prev.sales], ['환불', cur.refund, prev.refund],
      ['순매출', net, prevNet], ['결제 건수', cur.count, prev.count], ['객단가', avg, prevAvg],
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ── 기간 선택 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {from} ~ {to} · 직전 같은 기간과 비교
          {data && !isGym && <span className="rev-scope">본인 매출만 표시</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="rev-seg" role="group" aria-label="기간">
            {PERIODS.map(([k, l]) => (
              <button key={k} className={period === k ? 'on' : ''} aria-pressed={period === k}
                onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="crm-range" style={{ width: '290px' }}>
              <input className="input" type="date" value={custom[0]} max={custom[1]} aria-label="시작일"
                onChange={e => setCustom([e.target.value, custom[1]])} />
              <span>~</span>
              <input className="input" type="date" value={custom[1]} min={custom[0]} aria-label="종료일"
                onChange={e => setCustom([custom[0], e.target.value])} />
            </div>
          )}
          <button className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12px' }}
            disabled={!data} onClick={exportExcel}>엑셀 내보내기</button>
        </div>
      </div>

      {/* ── 핵심 지표 ── */}
      <div className={`rev-kpis ${loading ? 'loading' : ''}`}>
        {[
          ['순매출',   won(net),       <Delta cur={net} prev={prevNet} />],
          ['결제 건수', `${cur.count}건`, <Delta cur={cur.count} prev={prev.count} unit="count" />],
          ['객단가',   won(avg),       <Delta cur={avg} prev={prevAvg} />],
          ['환불',     won(cur.refund), <Delta cur={cur.refund_count} prev={prev.refund_count} unit="count" invert />],
        ].map(([label, value, delta]) => (
          <div className="card rev-kpi" key={label}>
            <div className="rev-kpi-label">{label}</div>
            <div className="rev-kpi-value" style={mono}>{value}</div>
            <div className="rev-kpi-sub">{delta}</div>
          </div>
        ))}
      </div>

      {/* ── 순매출 추이 ── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>순매출 추이</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>환불 차감 후 · 막대에 마우스를 올리면 상세</div>
          </div>
          <div className="rev-seg" role="group" aria-label="단위">
            {[['day', '일별'], ['week', '주별'], ['month', '월별']].map(([k, l]) => (
              <button key={k} className={grain === k ? 'on' : ''} aria-pressed={grain === k}
                onClick={() => { setGrain(k); setHover(-1) }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="rev-axis" style={mono}>
            <span>{man(axisTop)}</span><span>{man(axisTop / 2)}</span><span>0</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rev-plot" key={`${from}${to}${grain}`} onMouseLeave={() => setHover(-1)}>
              <div className="rev-grid" style={{ top: 0 }} />
              <div className="rev-grid" style={{ top: '50%' }} />
              {series.map((s, i) => (
                <button key={i} className={`rev-bar ${hover === i ? 'hot' : ''}`}
                  aria-label={`${s.label} 순매출 ${won(s.net)}, 결제 ${s.count}건`}
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(-1)}>
                  <span style={{
                    height: `${Math.max(0, s.net) / axisTop * 100}%`,
                    animationDelay: `${Math.min(i, 40) * 12}ms`,
                  }} />
                </button>
              ))}
              {hv && (
                <div className="rev-tip" style={{
                  left: `clamp(0px, calc(${(hover + 0.5) / series.length * 100}% - 75px), calc(100% - 150px))`,
                  bottom: `calc(${Math.min(85, Math.max(0, hv.net) / axisTop * 100)}% + 10px)`,
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{hv.label}</div>
                  <div style={{ ...mono, fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>{won(hv.net)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>결제 {hv.count}건</div>
                </div>
              )}
            </div>
            <div className="rev-ticks" style={mono}>
              {series.length > 0 && <span>{series[0].label}</span>}
              {series.length > 2 && <span>{series[Math.floor(series.length / 2)].label}</span>}
              {series.length > 1 && <span>{series[series.length - 1].label}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── 상품별 · 트레이너별 ── */}
      <div className="rev-two">
        <div className="card">
          <div className="rev-card-title">상품별 매출</div>
          <RankList rows={data?.by_product || []} total={cur.sales} />
        </div>
        {isGym ? (
          <div className="card">
            <div className="rev-card-title">트레이너별 매출</div>
            <RankList rows={data?.by_trainer || []} total={cur.sales} />
          </div>
        ) : (
          <div className="card">
            <div className="rev-card-title">결제 수단</div>
            <RankList rows={data?.by_method || []} total={cur.sales} nameOf={r => METHOD_LABEL[r.method] || r.method} />
          </div>
        )}
      </div>

      {/* ── 결제 수단 · 환불 ── */}
      <div className="rev-two">
        {isGym && (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <div className="rev-card-title" style={{ padding: '16px 16px 4px' }}>결제 수단</div>
            <table className="data-table">
              <thead><tr><th>수단</th><th style={{ textAlign: 'right' }}>건수</th><th style={{ textAlign: 'right' }}>금액</th><th style={{ textAlign: 'right' }}>비중</th></tr></thead>
              <tbody>
                {(data?.by_method || []).length === 0 && (
                  <tr><td colSpan={4} className="rev-empty">기간 내 결제가 없어요</td></tr>
                )}
                {(data?.by_method || []).map(r => (
                  <tr key={r.method}>
                    <td>{METHOD_LABEL[r.method] || r.method}</td>
                    <td style={{ ...mono, textAlign: 'right' }}>{r.count}건</td>
                    <td style={{ ...mono, textAlign: 'right' }}>{won(r.amount)}</td>
                    <td style={{ ...mono, textAlign: 'right', color: 'var(--text-muted)' }}>
                      {cur.sales > 0 ? Math.round(r.amount / cur.sales * 100) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div className="rev-card-title" style={{ padding: '16px 16px 4px' }}>환불 내역</div>
          <table className="data-table">
            <thead><tr><th>환불일</th><th>회원</th><th>상품</th><th style={{ textAlign: 'right' }}>금액</th></tr></thead>
            <tbody>
              {(data?.refund_list || []).length === 0 && (
                <tr><td colSpan={4} className="rev-empty">기간 내 환불이 없어요</td></tr>
              )}
              {(data?.refund_list || []).map((r, i) => (
                <tr key={i}>
                  <td style={mono}>{r.date}</td>
                  <td>{r.member || '—'}</td>
                  <td>{r.product || '—'}</td>
                  <td style={{ ...mono, textAlign: 'right', color: '#B42318' }}>−{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
