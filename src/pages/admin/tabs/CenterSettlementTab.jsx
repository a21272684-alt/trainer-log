import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import * as XLSX from 'xlsx'

const mono = { fontFamily: "'DM Mono', monospace" }

const METHOD_LABEL = {
  cash: '현금', card: '카드', transfer: '계좌이체',
  local_currency: '지역화폐', payments_app: '페이먼츠앱',
}
const METHOD_ICON = {
  cash: '💵', card: '💳', transfer: '🏦',
  local_currency: '🪙', payments_app: '📱',
}
const METHOD_COLOR = {
  cash:           { color: 'var(--green)',  bg: 'rgba(74,222,128,0.12)'  },
  card:           { color: 'var(--blue)',   bg: 'rgba(96,165,250,0.12)'  },
  transfer:       { color: 'var(--purple)', bg: 'rgba(167,139,250,0.12)' },
  local_currency: { color: 'var(--yellow)', bg: 'rgba(250,204,21,0.12)'  },
  payments_app:   { color: 'var(--accent)', bg: 'rgba(200,241,53,0.12)'  },
}

function fmt(n) { return Number(n || 0).toLocaleString() }

// ── 요약 카드 ─────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color, bg }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${color}30`,
      borderRadius: '12px', padding: '16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '10px', color, fontWeight: 700, letterSpacing: '0.4px', marginBottom: '8px' }}>{label}</div>
      <div style={{ ...mono, fontSize: '18px', fontWeight: 700, color }}>{fmt(value)}<span style={{ fontSize: '11px', marginLeft: '2px' }}>원</span></div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

// ── 섹션 제목 ─────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export default function CenterSettlementTab({ gymId, trainers = [] }) {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [payments,  setPayments]  = useState([])
  const [gymRanks,  setGymRanks]  = useState([])
  const [loading,   setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showAllPay, setShowAllPay] = useState(false)

  useEffect(() => { load() }, [gymId, year, month])

  async function load() {
    setLoading(true)
    const start  = `${year}-${String(month).padStart(2, '0')}-01`
    const endD   = new Date(year, month, 1)
    const end    = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-01`
    const tIds   = trainers.map(t => t.id)

    const [payRes, rankRes] = await Promise.all([
      tIds.length
        ? supabase.from('payments').select('*')
            .in('trainer_id', tIds)
            .gte('paid_at', start).lt('paid_at', end)
            .order('paid_at', { ascending: false })
        : { data: [] },
      supabase.from('gym_ranks').select('*').eq('gym_id', gymId),
    ])

    setPayments(payRes.data || [])
    setGymRanks(rankRes.data || [])
    setLoading(false)
  }

  // ── 데이터 계산 ───────────────────────────────────────────────
  const trainerMap = Object.fromEntries(trainers.map(t => [t.id, t]))
  const rankMap    = Object.fromEntries(gymRanks.map(r => [r.id, r]))

  const trainerStats = trainers.map(t => {
    const tPays      = payments.filter(p => p.trainer_id === t.id)
    const totalSales = tPays.reduce((s, p) => s + Number(p.amount), 0)
    const rank       = rankMap[t.gym_rank_id]
    const iRate      = t.incentive_rate ?? rank?.default_incentive_rate ?? 0.10
    const iAmt       = Math.round(totalSales * iRate)
    const cPortion   = totalSales - iAmt
    const base       = rank?.base_salary ?? 0
    return {
      ...t,
      rankLabel:    rank?.label ?? '—',
      totalSales,
      iRate, iAmt, cPortion,
      baseSalary:   base,
      totalPayout:  base + iAmt,
      payCount:     tPays.length,
    }
  }).sort((a, b) => b.totalSales - a.totalSales)

  const activeStats  = trainerStats.filter(t => t.totalSales > 0)
  const totalSales   = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalICenter = activeStats.reduce((s, t) => s + t.cPortion, 0)
  const totalIPayout = activeStats.reduce((s, t) => s + t.totalPayout, 0)
  const totalBase    = activeStats.reduce((s, t) => s + t.baseSalary, 0)

  // 결제 수단별
  const methodMap = {}
  for (const p of payments) {
    const m = p.payment_method || 'card'
    if (!methodMap[m]) methodMap[m] = { count: 0, amount: 0 }
    methodMap[m].count++
    methodMap[m].amount += Number(p.amount)
  }
  const methodEntries = Object.entries(methodMap).sort((a, b) => b[1].amount - a[1].amount)

  // 상품별 매출
  const productMap = {}
  for (const p of payments) {
    const name = p.product_name || '기타'
    if (!productMap[name]) productMap[name] = { count: 0, amount: 0 }
    productMap[name].count++
    productMap[name].amount += Number(p.amount)
  }
  const productEntries = Object.entries(productMap).sort((a, b) => b[1].amount - a[1].amount).slice(0, 8)

  // 월 네비
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const isCur = year === now.getFullYear() && month === now.getMonth() + 1
    if (isCur) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1

  // ── Excel 내보내기 ──────────────────────────────────────────────
  function exportExcel() {
    setExporting(true)
    try {
      const wb  = XLSX.utils.book_new()
      const pStr = `${year}년 ${month}월`

      /* Sheet 1 – 월 요약 */
      const s1 = [
        [`${pStr} 센터 정산 요약`],
        [],
        ['항목', '금액 (원)', '비고'],
        ['총 매출', totalSales, `${payments.length}건`],
        ['센터 귀속 금액', totalICenter, '매출 - 인센티브'],
        ['직원 기본급 합계', totalBase, `${activeStats.length}명`],
        ['직원 인센티브 합계', activeStats.reduce((s, t) => s + t.iAmt, 0), ''],
        ['직원 총 지급 예정', totalIPayout, '기본급 + 인센티브'],
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), '월 요약')

      /* Sheet 2 – 트레이너별 정산 */
      const s2 = [
        ['이름', '직급', '매출액', '인센티브율', '인센티브액', '센터귀속액', '기본급', '총 지급예정', '결제건수'],
        ...trainerStats.map(t => [
          t.name, t.rankLabel,
          t.totalSales,
          `${Math.round(t.iRate * 100)}%`,
          t.iAmt, t.cPortion, t.baseSalary, t.totalPayout, t.payCount,
        ]),
        [],
        ['합계', '', totalSales, '', activeStats.reduce((s, t) => s + t.iAmt, 0),
          totalICenter, totalBase, totalIPayout, payments.length],
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), '트레이너별 정산')

      /* Sheet 3 – 결제수단별 */
      const s3 = [
        ['결제 수단', '건수', '금액 (원)', '비중 (%)'],
        ...methodEntries.map(([m, s]) => [
          METHOD_LABEL[m] || m, s.count, s.amount,
          totalSales > 0 ? `${Math.round(s.amount / totalSales * 100)}%` : '0%',
        ]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), '결제수단별')

      /* Sheet 4 – 결제 내역 전체 */
      const s4 = [
        ['결제일시', '트레이너', '상품명', '금액 (원)', '결제수단', '메모'],
        ...payments.map(p => [
          p.paid_at ? new Date(p.paid_at).toLocaleString('ko-KR') : '',
          trainerMap[p.trainer_id]?.name || '',
          p.product_name || '',
          Number(p.amount),
          METHOD_LABEL[p.payment_method] || p.payment_method || '',
          p.payment_method_memo || '',
        ]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s4), '결제 내역')

      XLSX.writeFile(wb, `센터정산_${year}${String(month).padStart(2, '0')}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────
  return (
    <div>
      {/* 상단 기간 선택 + 내보내기 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={prevMonth} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <div style={{ fontWeight: 700, fontSize: '16px', minWidth: '110px', textAlign: 'center' }}>
            {year}년 {month}월
          </div>
          <button onClick={nextMonth} disabled={isCurrent} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', width: '32px', height: '32px', fontSize: '16px', cursor: isCurrent ? 'not-allowed' : 'pointer', color: isCurrent ? 'var(--border)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={load}>
            🔄 새로고침
          </button>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '7px 16px', fontSize: '12px', gap: '6px' }}
          onClick={exportExcel}
          disabled={exporting || payments.length === 0}
        >
          {exporting ? '내보내는 중...' : '📥 엑셀 내보내기'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-dim)' }}>
          <span className="spinner" style={{ display: 'block', fontSize: '28px', marginBottom: '12px' }}>✦</span>
          정산 데이터를 불러오는 중...
        </div>
      ) : (
        <>
          {/* ── 요약 카드 4개 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <SummaryCard label="총 매출" value={totalSales} sub={`${payments.length}건`} color="var(--blue)" bg="rgba(96,165,250,0.10)" />
            <SummaryCard label="센터 귀속 금액" value={totalICenter} sub="매출 − 인센티브 합계" color="var(--accent)" bg="rgba(200,241,53,0.10)" />
            <SummaryCard label="직원 총 지급 예정" value={totalIPayout} sub="기본급 + 인센티브" color="var(--purple)" bg="rgba(167,139,250,0.10)" />
            <SummaryCard label="세금 3.3% 합계" value={Math.round(totalIPayout * 0.033)} sub="예상 원천징수액" color="var(--red)" bg="rgba(248,113,113,0.10)" />
          </div>

          {/* ── 트레이너별 정산 현황 ── */}
          <Section title="트레이너별 정산 현황">
            {trainerStats.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-text">이달 결제 내역이 없어요</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>트레이너</th>
                      <th>직급</th>
                      <th style={{ textAlign: 'right' }}>매출액</th>
                      <th style={{ textAlign: 'center' }}>인센티브율</th>
                      <th style={{ textAlign: 'right' }}>인센티브액</th>
                      <th style={{ textAlign: 'right' }}>센터 귀속</th>
                      <th style={{ textAlign: 'right' }}>기본급</th>
                      <th style={{ textAlign: 'right' }}>총 지급 예정</th>
                      <th style={{ textAlign: 'center' }}>건수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainerStats.map(t => (
                      <tr key={t.id} style={{ opacity: t.totalSales === 0 ? 0.45 : 1 }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(200,241,53,0.12)', border: '1px solid rgba(200,241,53,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                              {t.name[0]}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{t.name}</span>
                          </div>
                        </td>
                        <td>
                          {t.rankLabel !== '—'
                            ? <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '5px', background: 'rgba(200,241,53,0.1)', color: 'var(--accent)', border: '1px solid rgba(200,241,53,0.25)', fontWeight: 600 }}>{t.rankLabel}</span>
                            : <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 600, color: 'var(--blue)' }}>{fmt(t.totalSales)}</td>
                        <td style={{ textAlign: 'center', ...mono, fontSize: '12px', color: 'var(--text-muted)' }}>{Math.round(t.iRate * 100)}%</td>
                        <td style={{ textAlign: 'right', ...mono, fontSize: '12px', color: 'var(--accent)' }}>{fmt(t.iAmt)}</td>
                        <td style={{ textAlign: 'right', ...mono, fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(t.cPortion)}</td>
                        <td style={{ textAlign: 'right', ...mono, fontSize: '12px', color: 'var(--text-dim)' }}>{fmt(t.baseSalary)}</td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--purple)' }}>{fmt(t.totalPayout)}</td>
                        <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-dim)' }}>{t.payCount}</td>
                      </tr>
                    ))}
                  </tbody>
                  {trainerStats.length > 1 && (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={2} style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-muted)', padding: '10px 14px' }}>합계</td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--blue)' }}>{fmt(totalSales)}</td>
                        <td />
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--accent)' }}>{fmt(activeStats.reduce((s, t) => s + t.iAmt, 0))}</td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--text-muted)' }}>{fmt(totalICenter)}</td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--text-dim)' }}>{fmt(totalBase)}</td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--purple)' }}>{fmt(totalIPayout)}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-dim)' }}>{payments.length}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Section>

          {/* ── 결제 수단 · 상품별 나란히 ── */}
          {payments.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* 결제 수단별 */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: '16px' }}>결제 수단별 매출</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {methodEntries.map(([m, s]) => {
                    const pct = totalSales > 0 ? s.amount / totalSales * 100 : 0
                    const mc  = METHOD_COLOR[m] || { color: 'var(--text-muted)', bg: 'var(--surface2)' }
                    return (
                      <div key={m}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>{METHOD_ICON[m] || '💳'}</span>
                            <span>{METHOD_LABEL[m] || m}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 400 }}>{s.count}건</span>
                          </span>
                          <span style={{ ...mono, fontSize: '12px', fontWeight: 700, color: mc.color }}>{fmt(s.amount)}원</span>
                        </div>
                        <div style={{ height: '5px', borderRadius: '3px', background: 'var(--surface2)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: mc.color, borderRadius: '3px', transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'right', marginTop: '2px' }}>{Math.round(pct)}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 상품별 매출 */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: '16px' }}>상품별 매출 TOP {productEntries.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {productEntries.map(([name, s], i) => {
                    const pct = totalSales > 0 ? s.amount / totalSales * 100 : 0
                    return (
                      <div key={name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-dim)', ...mono, minWidth: '16px' }}>#{i + 1}</span>
                            <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 400 }}>{s.count}건</span>
                          </span>
                          <span style={{ ...mono, fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{fmt(s.amount)}원</span>
                        </div>
                        <div style={{ height: '5px', borderRadius: '3px', background: 'var(--surface2)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'right', marginTop: '2px' }}>{Math.round(pct)}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── 결제 내역 전체 ── */}
          <Section
            title={`결제 내역 전체 (${payments.length}건)`}
            action={
              payments.length > 10 && (
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => setShowAllPay(v => !v)}>
                  {showAllPay ? '접기 ▲' : '전체 보기 ▼'}
                </button>
              )
            }
          >
            {payments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">💳</div>
                <div className="empty-state-text">이달 결제 내역이 없어요</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>결제일시</th>
                      <th>트레이너</th>
                      <th>상품명</th>
                      <th style={{ textAlign: 'right' }}>금액</th>
                      <th style={{ textAlign: 'center' }}>결제수단</th>
                      <th>메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllPay ? payments : payments.slice(0, 10)).map(p => {
                      const mc = METHOD_COLOR[p.payment_method] || { color: 'var(--text-muted)', bg: 'var(--surface2)' }
                      return (
                        <tr key={p.id}>
                          <td style={{ ...mono, fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                            {p.paid_at ? new Date(p.paid_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td style={{ fontSize: '12px', fontWeight: 600 }}>
                            {trainerMap[p.trainer_id]?.name || '—'}
                          </td>
                          <td style={{ fontSize: '12px' }}>{p.product_name || '—'}</td>
                          <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--blue)' }}>{fmt(p.amount)}원</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', background: mc.bg, color: mc.color }}>
                              {METHOD_ICON[p.payment_method] || '💳'} {METHOD_LABEL[p.payment_method] || p.payment_method || '카드'}
                            </span>
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{p.payment_method_memo || ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {!showAllPay && payments.length > 10 && (
                  <div style={{ textAlign: 'center', padding: '10px', fontSize: '11px', color: 'var(--text-dim)' }}>
                    {payments.length - 10}건 더 있음 — 전체 보기를 눌러주세요
                  </div>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
