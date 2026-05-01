import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
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

// ── 대관 트레이너 대관료 관리 섹션 ────────────────────────────────
function RentalSection({ gymId, rentalTrainers, year, month }) {
  const showToast = useToast()
  const monthStr  = `${year}-${String(month).padStart(2, '0')}`
  const start     = `${monthStr}-01`
  const endD      = new Date(year, month, 1)
  const end       = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-01`

  const [rentalFees,   setRentalFees]   = useState({})   // { trainerId: [fee rows] }
  const [attendCounts, setAttendCounts] = useState({})   // { trainerId: 이달 완료 수업 수 }
  const [loading,      setLoading]      = useState(true)

  // 납부 등록 모달
  const [payModal,  setPayModal]  = useState(null)        // trainer object
  const [payForm,   setPayForm]   = useState({ amount: '', memo: '' })
  const [paying,    setPaying]    = useState(false)

  // 대관 계약 설정 모달
  const [cfgModal,    setCfgModal]    = useState(null)    // trainer object
  const [cfgForm,     setCfgForm]     = useState({})
  const [savingCfg,   setSavingCfg]   = useState(false)
  // 저장 후 즉시 반영용 오버라이드 맵 (부모 reload 없이 UI 업데이트)
  const [cfgOverrides, setCfgOverrides] = useState({})   // { trainerId: settlement_config }

  useEffect(() => { loadRental() }, [gymId, year, month])

  async function loadRental() {
    if (!rentalTrainers.length) { setLoading(false); return }
    setLoading(true)
    const tIds = rentalTrainers.map(t => t.id)

    // 1. 이번 달 납부 내역
    const { data: fees } = await supabase
      .from('rental_fees').select('*')
      .in('trainer_id', tIds).eq('target_month', monthStr)
      .order('paid_at', { ascending: false })

    // 2. 대관 트레이너 담당 회원 ID 목록 (per_session 계산용)
    const { data: mems } = await supabase
      .from('members').select('id, trainer_id')
      .in('trainer_id', tIds)

    // 3. 이번 달 출석 횟수 (per_session 청구액 계산 기준)
    const memIds = (mems || []).map(m => m.id)
    const { data: attends } = memIds.length
      ? await supabase.from('attendance').select('member_id')
          .in('member_id', memIds)
          .gte('attended_date', start).lt('attended_date', end)
      : { data: [] }

    // 납부 내역 → trainer별 그룹핑
    const feesMap = {}
    for (const f of fees || []) {
      if (!feesMap[f.trainer_id]) feesMap[f.trainer_id] = []
      feesMap[f.trainer_id].push(f)
    }
    setRentalFees(feesMap)

    // 출석 → member → trainer 매핑하여 카운트
    const memTrainerMap = Object.fromEntries((mems || []).map(m => [m.id, m.trainer_id]))
    const cntMap = {}
    for (const a of attends || []) {
      const tid = memTrainerMap[a.member_id]
      if (tid) cntMap[tid] = (cntMap[tid] || 0) + 1
    }
    setAttendCounts(cntMap)
    setLoading(false)
  }

  // 청구액 계산: fixed → 고정액 / per_session → 완료 수업 수 × 단가
  function calcBilled(t) {
    const cfg = cfgOverrides[t.id] ?? t.settlement_config ?? {}
    if (cfg.rental_fee_type === 'fixed')       return Number(cfg.rental_fee_amount) || 0
    if (cfg.rental_fee_type === 'per_session') return (attendCounts[t.id] || 0) * (Number(cfg.rental_fee_amount) || 0)
    return 0
  }
  function calcPaid(t) {
    return (rentalFees[t.id] || []).reduce((s, f) => s + Number(f.amount), 0)
  }

  // 납부 등록
  async function handlePay() {
    const amount = Number(payForm.amount)
    if (!amount || amount <= 0) { showToast('금액을 입력해주세요'); return }
    setPaying(true)
    const { data, error } = await supabase.from('rental_fees').insert({
      gym_id: gymId, trainer_id: payModal.id,
      amount, target_month: monthStr,
      memo: payForm.memo || null,
    }).select().single()
    setPaying(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`✓ ${payModal.name} 납부 내역이 등록됐어요`)
    // 즉시 로컬 반영 (await loadRental() 없음)
    setRentalFees(prev => ({ ...prev, [payModal.id]: [data, ...(prev[payModal.id] || [])] }))
    setPayModal(null)
    setPayForm({ amount: '', memo: '' })
  }

  // 대관 계약 설정 저장
  async function handleSaveCfg() {
    setSavingCfg(true)
    const { error } = await supabase.from('trainers')
      .update({ settlement_config: cfgForm })
      .eq('id', cfgModal.id)
    setSavingCfg(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 대관 계약 조건이 저장됐어요')
    // 즉시 UI에 반영 (부모 reload 없이)
    setCfgOverrides(prev => ({ ...prev, [cfgModal.id]: { ...cfgForm } }))
    setCfgModal(null)
  }

  function openCfgModal(t) {
    const cfg = cfgOverrides[t.id] ?? t.settlement_config ?? {}
    setCfgForm({
      payment_managed_by: cfg.payment_managed_by || 'self',
      rental_fee_type:    cfg.rental_fee_type    || 'fixed',
      rental_fee_amount:  cfg.rental_fee_amount  || 0,
    })
    setCfgModal(t)
  }

  const totalBilled = rentalTrainers.reduce((s, t) => s + calcBilled(t), 0)
  const totalPaid   = rentalTrainers.reduce((s, t) => s + calcPaid(t), 0)
  const totalUnpaid = totalBilled - totalPaid

  return (
    <>
      <Section title={`대관 트레이너 대관료 현황 (${rentalTrainers.length}명)`}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '12px' }}>
            <span className="spinner" style={{ display: 'block', fontSize: '20px', marginBottom: '8px' }}>✦</span>
            불러오는 중...
          </div>
        ) : (
          <>
            {/* ── 소계 3개 ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 700, letterSpacing: '0.4px', marginBottom: '6px' }}>이달 총 청구액</div>
                <div style={{ ...mono, fontSize: '17px', fontWeight: 700, color: 'var(--blue)' }}>{fmt(totalBilled)}<span style={{ fontSize: '11px', marginLeft: '2px' }}>원</span></div>
              </div>
              <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, letterSpacing: '0.4px', marginBottom: '6px' }}>실제 납부액</div>
                <div style={{ ...mono, fontSize: '17px', fontWeight: 700, color: 'var(--green)' }}>{fmt(totalPaid)}<span style={{ fontSize: '11px', marginLeft: '2px' }}>원</span></div>
              </div>
              <div style={{
                background: totalUnpaid > 0 ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.06)',
                border: `1px solid ${totalUnpaid > 0 ? 'rgba(248,113,113,0.28)' : 'rgba(74,222,128,0.2)'}`,
                borderRadius: '10px', padding: '14px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px', marginBottom: '6px', color: totalUnpaid > 0 ? 'var(--red)' : 'var(--green)' }}>미납액</div>
                <div style={{ ...mono, fontSize: '17px', fontWeight: 700, color: totalUnpaid > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {totalUnpaid > 0 ? fmt(totalUnpaid) : '없음'}<span style={{ fontSize: '11px', marginLeft: '2px' }}>{totalUnpaid > 0 ? '원' : ''}</span>
                </div>
              </div>
            </div>

            {/* ── 트레이너별 상세 테이블 ── */}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>트레이너</th>
                    <th style={{ textAlign: 'center' }}>결제 주체</th>
                    <th style={{ textAlign: 'center' }}>대관 방식</th>
                    <th style={{ textAlign: 'right' }}>이달 청구액</th>
                    <th style={{ textAlign: 'right' }}>납부액</th>
                    <th style={{ textAlign: 'right' }}>미납액</th>
                    <th style={{ textAlign: 'center' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rentalTrainers.map(t => {
                    const cfg    = cfgOverrides[t.id] ?? t.settlement_config ?? {}
                    const billed = calcBilled(t)
                    const paid   = calcPaid(t)
                    const unpaid = billed - paid
                    const isSelf = cfg.payment_managed_by !== 'center'
                    const fType  = cfg.rental_fee_type || 'fixed'
                    return (
                      <tr key={t.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                              background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.25)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', fontWeight: 700, color: 'var(--yellow)',
                            }}>{t.name[0]}</div>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{t.name}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px',
                            background: isSelf ? 'rgba(250,204,21,0.1)' : 'rgba(96,165,250,0.1)',
                            color:      isSelf ? 'var(--yellow)'        : 'var(--blue)',
                            border:     `1px solid ${isSelf ? 'rgba(250,204,21,0.25)' : 'rgba(96,165,250,0.25)'}`,
                          }}>
                            {isSelf ? '독립 결제' : '위탁 결제'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px',
                            background: fType === 'fixed' ? 'rgba(167,139,250,0.1)' : 'rgba(200,241,53,0.1)',
                            color:      fType === 'fixed' ? 'var(--purple)'         : 'var(--accent)',
                            border:     `1px solid ${fType === 'fixed' ? 'rgba(167,139,250,0.25)' : 'rgba(200,241,53,0.25)'}`,
                          }}>
                            {fType === 'fixed' ? '월 고정' : '건별 차감'}
                          </span>
                          {fType === 'per_session' && (
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px' }}>
                              {attendCounts[t.id] || 0}회 × {fmt(cfg.rental_fee_amount || 0)}원
                            </div>
                          )}
                          {fType === 'fixed' && cfg.rental_fee_amount > 0 && (
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px' }}>
                              {fmt(cfg.rental_fee_amount)}원/월
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 600, color: 'var(--blue)', fontSize: '13px' }}>
                          {billed > 0 ? fmt(billed) : <span style={{ color: 'var(--text-dim)' }}>미설정</span>}
                        </td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 600, color: 'var(--green)', fontSize: '13px' }}>
                          {fmt(paid)}
                        </td>
                        <td style={{ textAlign: 'right', ...mono, fontWeight: 700, fontSize: '13px', color: unpaid > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                          {unpaid > 0 ? `▲ ${fmt(unpaid)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 9px', fontSize: '10px' }}
                              onClick={() => {
                                setPayModal(t)
                                setPayForm({ amount: String(Math.max(0, billed - paid) || ''), memo: '' })
                              }}>
                              납부 등록
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 9px', fontSize: '10px' }}
                              onClick={() => openCfgModal(t)}>
                              설정
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ── 납부 등록 모달 ── */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)}
        title={payModal ? `${payModal.name} 대관료 납부 등록` : ''} maxWidth="380px">
        {payModal && (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '16px' }}>
              <strong style={{ color: 'var(--text)' }}>{year}년 {month}월</strong> 납부 금액을 입력해주세요.
              {calcBilled(payModal) > 0 && (
                <> 이달 청구액은 <strong style={{ color: 'var(--blue)' }}>{fmt(calcBilled(payModal))}원</strong>이에요.</>
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>납부 금액 (원) *</div>
                <input className="input" type="number" placeholder="예: 300000"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>메모 (선택)</div>
                <input className="input" placeholder="예: 현금 입금 확인"
                  value={payForm.memo}
                  onChange={e => setPayForm(f => ({ ...f, memo: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPayModal(null)}>취소</button>
              <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={handlePay} disabled={paying}>
                {paying ? '등록 중...' : '납부 등록'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── 대관 계약 설정 모달 ── */}
      <Modal open={!!cfgModal} onClose={() => setCfgModal(null)}
        title={cfgModal ? `${cfgModal.name} 대관 계약 설정` : ''} maxWidth="390px">
        {cfgModal && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>결제 주체</div>
                <select className="input" value={cfgForm.payment_managed_by || 'self'}
                  onChange={e => setCfgForm(f => ({ ...f, payment_managed_by: e.target.value }))}>
                  <option value="self">독립 결제 — 트레이너가 직접 회원 결제 수령</option>
                  <option value="center">위탁 결제 — 센터가 결제 수령 후 정산</option>
                </select>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', lineHeight: 1.6 }}>
                  위탁 결제 선택 시 해당 트레이너 매출이 센터 총 매출에 포함됩니다.
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>대관료 방식</div>
                <select className="input" value={cfgForm.rental_fee_type || 'fixed'}
                  onChange={e => setCfgForm(f => ({ ...f, rental_fee_type: e.target.value }))}>
                  <option value="fixed">월 고정액 — 매월 동일 금액</option>
                  <option value="per_session">수업 건별 차감 — 완료 수업 × 단가</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>
                  {cfgForm.rental_fee_type === 'per_session' ? '1회당 대관료 (원)' : '월 고정 대관료 (원)'}
                </div>
                <input className="input" type="number" placeholder="예: 300000"
                  value={cfgForm.rental_fee_amount || ''}
                  onChange={e => setCfgForm(f => ({ ...f, rental_fee_amount: Number(e.target.value) }))} />
                {cfgForm.rental_fee_type === 'per_session' && (
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
                    이달 완료 수업 {attendCounts[cfgModal.id] || 0}회 기준 예상 청구액:{' '}
                    <strong style={{ color: 'var(--accent)' }}>
                      {fmt((attendCounts[cfgModal.id] || 0) * (Number(cfgForm.rental_fee_amount) || 0))}원
                    </strong>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setCfgModal(null)}>취소</button>
              <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveCfg} disabled={savingCfg}>
                {savingCfg ? '저장 중...' : '저장'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
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
  const trainerMap    = Object.fromEntries(trainers.map(t => [t.id, t]))
  const rankMap       = Object.fromEntries(gymRanks.map(r => [r.id, r]))
  // 대관 트레이너 분리 (별도 섹션으로 렌더)
  const rentalTrainers = trainers.filter(t => t.employment_type === 'rental')

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

          {/* ── 대관 트레이너 대관료 섹션 ── */}
          {rentalTrainers.length > 0 && (
            <RentalSection
              gymId={gymId}
              rentalTrainers={rentalTrainers}
              year={year}
              month={month}
            />
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
