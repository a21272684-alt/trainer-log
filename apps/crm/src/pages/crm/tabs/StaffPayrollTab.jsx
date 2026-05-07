import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import { calculatePayroll, getSessionPtAmount, ZERO_PAYROLL } from '../lib/payrollCalculator'

/*
  trainer_payroll_records 테이블 DDL (Supabase SQL Editor에서 한 번 실행):
  ─────────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS trainer_payroll_records (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id           UUID        NOT NULL REFERENCES gyms(id)     ON DELETE CASCADE,
    trainer_id       UUID        NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
    payroll_month    TEXT        NOT NULL,          -- 'YYYY-MM'
    bonus_amount     INTEGER     NOT NULL DEFAULT 0,
    deduction_amount INTEGER     NOT NULL DEFAULT 0,
    memo             TEXT        NOT NULL DEFAULT '',
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payroll_per_month UNIQUE (gym_id, trainer_id, payroll_month)
  );
  ─────────────────────────────────────────────────────────────────────────
*/

const mono = { fontFamily: "'DM Mono', monospace" }
const fmt  = n => Number(n || 0).toLocaleString()
const fmtW = n => fmt(n) + '원'

const EMP_LABEL = { employee: '정직원', freelance: '프리랜서' }
const STATUS_LABEL = { completed: '완료', noshow: '노쇼', scheduled: '예정', cancelled: '취소' }

// ── @media print 스타일 (라이브러리 없이 DOM 그대로 인쇄) ────────
const PRINT_CSS = `
  @media print {
    @page { size: A4 landscape; margin: 12mm 14mm; }
    body * { visibility: hidden !important; }
    #payroll-print-root,
    #payroll-print-root * { visibility: visible !important; }
    #payroll-print-root {
      position: fixed; top: 0; left: 0;
      width: 100%; background: #fff !important;
      color: #111 !important; font-size: 10px;
      padding: 10mm; box-sizing: border-box; z-index: 99999;
    }
    .payroll-no-print   { display: none !important; }
    .payroll-print-only { display: block !important; }
    .payroll-print-th   { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #bbb !important; padding: 4px 7px !important;
             color: #111 !important; }
    th { font-weight: 700; }
    tfoot tr { border-top: 2px solid #555 !important; font-weight: 700; }
  }
`

// ── 배지: PT 정산 방식 ────────────────────────────────────────────
function PtBadge({ sc }) {
  const isFixed = sc?.pt_calc_type === 'fixed'
  const val     = sc?.pt_value
  return isFixed
    ? <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
        background: 'rgba(200,241,53,0.1)', color: 'var(--accent)',
        border: '1px solid rgba(200,241,53,0.25)' }}>
        고정 {val != null ? fmt(val) + '₩/회' : '미설정'}
      </span>
    : <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
        background: 'rgba(96,165,250,0.1)', color: 'var(--blue)',
        border: '1px solid rgba(96,165,250,0.25)' }}>
        비율 {val != null ? val + '%' : '미설정'}
      </span>
}

// ── 수동 입력 셀 (보너스·공제) ────────────────────────────────────
// onBlur: e.target.value(현재 DOM 값)를 그대로 상위로 전달
function AmountInput({ value, onChange, onBlur, color, placeholder }) {
  return (
    <input type="number" min={0} value={value || ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onBlur?.(e.target.value)}
      style={{ width: '88px', textAlign: 'right', fontSize: '12px', outline: 'none',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: '6px', padding: '4px 8px', color,
        fontFamily: "'DM Mono', monospace" }} />
  )
}

// ════════════════════════════════════════════════════════════════
export default function StaffPayrollTab({ gymId, trainers = [] }) {
  const showToast = useToast()
  const now = new Date()
  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  // ── 서버 데이터 ───────────────────────────────────────────────
  const [gymRanks,          setGymRanks]          = useState([])
  const [payments,          setPayments]          = useState([])   // 매출·영업인센티브용
  const [trainerAttendRows, setTrainerAttendRows]  = useState({})  // { trainerId: row[] }

  // ── 보너스·공제 수동 오버라이드 (DB 영구 저장) ────────────────
  // { [trainerId]: { bonus: '1000', deduction: '0', memo: '' } }
  const [overrides, setOverrides] = useState({})

  // stale-closure 방어: async 저장 함수가 항상 최신 overrides를 읽도록 ref 유지
  const overridesRef = useRef(overrides)
  useEffect(() => { overridesRef.current = overrides }, [overrides])

  const staffList = trainers.filter(t => t.employment_type !== 'rental')

  useEffect(() => {
    if (gymId) load()
  }, [gymId, year, month, trainers.length])

  // ── 데이터 패치 ───────────────────────────────────────────────
  async function load() {
    setLoading(true)
    try {
      const start = `${year}-${String(month).padStart(2, '0')}-01`
      const endD  = new Date(year, month, 1)
      const end   = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-01`
      const tIds  = staffList.map(t => t.id)
      if (!tIds.length) return

      // Round 1: members + ranks + 이달 payments (병렬)
      // trainer_payroll_records 테이블 미배포 — 보너스·공제 SELECT 차단, 빈 데이터 폴백
      const payrollMonth = `${year}-${String(month).padStart(2, '0')}`
      const [memberRes, rankRes, payRes] = await Promise.all([
        supabase.from('members').select('id, trainer_id').in('trainer_id', tIds),
        supabase.from('gym_ranks').select('*').eq('gym_id', gymId),
        supabase.from('payments')
          .select('trainer_id, amount, payment_method')
          .in('trainer_id', tIds)
          .gte('paid_at', start).lt('paid_at', end),
      ])
      const rawPayrollRes = { data: [], error: null }

      const allMembers       = memberRes.data || []
      const memberIds        = allMembers.map(m => m.id)
      const memberTrainerMap = Object.fromEntries(allMembers.map(m => [m.id, m.trainer_id]))

      // Round 2: 출석 + ticket_id→payments Join (FK 정확 연결)
      // status IN ('completed','noshow') 만 급여 계산 대상
      const { data: attendData } = memberIds.length
        ? await supabase
            .from('attendance')
            .select(`
              member_id,
              attended_date,
              status,
              ticket_id,
              members!attendance_member_id_fkey ( name ),
              payments!attendance_ticket_id_fkey ( amount, session_count, payment_method )
            `)
            .in('member_id', memberIds)
            .in('status', ['completed', 'noshow'])
            .gte('attended_date', start)
            .lt('attended_date', end)
            .order('attended_date', { ascending: true })
        : { data: [] }

      // ── 트레이너별 출석 행 집계 ─────────────────────────────
      const rowsMap = {}
      for (const row of attendData || []) {
        const tid = memberTrainerMap[row.member_id]
        if (!tid) continue

        const pmt = row.payments   // nullable: ticket_id 없으면 null
        const cnt = Math.max(Number(pmt?.session_count ?? 1), 1)
        const perSessionPrice = pmt
          ? Math.round(Number(pmt.amount ?? 0) / cnt)
          : 0

        if (!rowsMap[tid]) rowsMap[tid] = []
        rowsMap[tid].push({
          status:           row.status,
          attendedDate:     row.attended_date  ?? '',
          memberName:       row.members?.name  ?? '—',
          perSessionPrice,
          paymentMethod:    pmt?.payment_method ?? 'card',
          hasTicket:        !!pmt,
        })
      }

      setGymRanks(rankRes.data || [])
      setPayments(payRes.data  || [])
      setTrainerAttendRows(rowsMap)

      // DB 저장된 보너스·공제 → overrides 초기 상태에 반영
      // rawPayrollRes.error: 테이블 없음·권한 없음 → 조용히 {} 유지
      const initOverrides = {}
      for (const rec of (rawPayrollRes.error ? [] : rawPayrollRes.data || [])) {
        initOverrides[rec.trainer_id] = {
          bonus:     rec.bonus_amount     ? String(rec.bonus_amount)     : '',
          deduction: rec.deduction_amount ? String(rec.deduction_amount) : '',
          memo:      rec.memo || '',
        }
      }
      setOverrides(initOverrides)
    } catch (e) {
      console.error('[StaffPayrollTab] load error:', e)
    } finally {
      setLoading(false)
    }
  }

  // ── 월 이동 ───────────────────────────────────────────────────
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (isCurrent) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }

  const rankMap      = Object.fromEntries(gymRanks.map(r => [r.id, r]))
  const payrollMonth = `${year}-${String(month).padStart(2, '0')}`

  // trainer_payroll_records 테이블 미배포 — 모든 upsert 차단, alert 안내.
  async function saveAllOverrides() {
    alert('해당 기능은 준비 중입니다.')
  }

  // 단일 저장(onBlur)도 동일하게 무력화 — 호출돼도 silent skip.
  async function saveTrainerOverride(trainerId) {
    // 미배포 테이블 — DB 호출 차단
    return
  }

  // ── 트레이너별 급여 산출 (순수 함수 위임) ────────────────────
  function payrollOf(t) {
    return calculatePayroll(
      t,
      trainerAttendRows[t.id] ?? [],
      payments.filter(p => p.trainer_id === t.id),
      rankMap[t.gym_rank_id] ?? null,
      overrides[t.id] ?? {},
    )
  }

  // ── 전체 합계 ─────────────────────────────────────────────────
  const totals = staffList.reduce((acc, t) => {
    const p = payrollOf(t)
    acc.baseSalary += p.baseSalary
    acc.ptPayout   += p.ptPayout
    acc.salesInc   += p.salesInc
    acc.bonus      += p.bonus
    acc.deduction  += p.deduction
    acc.netPayout  += p.netPayout
    return acc
  }, { baseSalary: 0, ptPayout: 0, salesInc: 0, bonus: 0, deduction: 0, netPayout: 0 })

  // ────────────────────────────────────────────────────────────
  // Excel 내보내기 (xlsx — 이미 설치된 라이브러리 활용)
  // ────────────────────────────────────────────────────────────
  function exportExcel() {
    const wb      = XLSX.utils.book_new()
    const period  = `${year}년 ${month}월`

    // Sheet 1: 급여 요약
    const s1 = [
      [`직원 급여 명세서 — ${period}`],
      [],
      ['이름', '직급', '고용형태', '기본급', 'PT 수당', '영업인센티브',
       '보너스', '공제', '실지급액', '원천징수(3.3%)'],
      ...staffList.map(t => {
        const p    = payrollOf(t)
        const rank = rankMap[t.gym_rank_id]
        return [
          t.name                   || '',
          rank?.label              || '미설정',
          EMP_LABEL[t.employment_type] || '—',
          p.baseSalary, p.ptPayout, p.salesInc,
          p.bonus, p.deduction, p.netPayout, p.withholdingTax,
        ]
      }),
      [],
      ['합계', '', '',
       totals.baseSalary, totals.ptPayout, totals.salesInc,
       totals.bonus, totals.deduction, totals.netPayout,
       Math.round(totals.netPayout * 0.033)],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), '급여 요약')

    // Sheet 2: 출석 상세 (수당 산출 근거)
    const s2 = [
      [`출석 상세 내역 — ${period}`],
      [],
      ['트레이너', '날짜', '회원명', '출석 상태',
       '수강권 1회단가(원)', 'PT 수당(원)', '비고'],
    ]
    for (const t of staffList) {
      const sc   = (t.settlement_config && typeof t.settlement_config === 'object')
                     ? t.settlement_config : {}
      const rows = trainerAttendRows[t.id] ?? []
      for (const row of rows) {
        s2.push([
          t.name                       || '',
          row.attendedDate             || '',
          row.memberName               || '',
          STATUS_LABEL[row.status]     || row.status,
          row.perSessionPrice,
          getSessionPtAmount(row, sc),
          !row.hasTicket ? '⚠ 수강권 미연결' : '',
        ])
      }
      if (rows.length > 0) s2.push([])   // 트레이너 구분 빈 행
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), '출석 상세')

    XLSX.writeFile(wb, `급여명세_${year}${String(month).padStart(2, '0')}.xlsx`)
  }

  // ────────────────────────────────────────────────────────────
  // 인쇄/PDF (CSS @media print — 추가 라이브러리 없음)
  // ────────────────────────────────────────────────────────────
  function handlePrint() {
    // onafterprint 로 스타일 정리해 사이드이펙트 방지
    window.onafterprint = () => { window.onafterprint = null }
    window.print()
  }

  // ── 공용 스타일 ───────────────────────────────────────────────
  const navBtn = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer',
    fontSize: '16px', color: 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <>
      {/* @media print 스타일 주입 */}
      <style>{PRINT_CSS}</style>

      {/* ▼ 인쇄 영역 시작 ─────────────────────────────────────── */}
      <div id="payroll-print-root">

        {/* 인쇄 전용 헤더 (화면에서는 숨김) */}
        <div className="payroll-print-only" style={{ display: 'none',
          borderBottom: '2px solid #222', paddingBottom: '10px', marginBottom: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>직원 급여 명세서</div>
          <div style={{ fontSize: '11px', marginTop: '3px' }}>
            {year}년 {month}월 &nbsp;·&nbsp; 출력일: {new Date().toLocaleDateString('ko-KR')}
          </div>
        </div>

        {/* ── 상단 컨트롤 (인쇄 시 숨김) ── */}
        <div className="payroll-no-print" style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          {/* 월 이동 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={prevMonth} style={navBtn}>‹</button>
            <div style={{ fontWeight: 700, fontSize: '16px', minWidth: '110px', textAlign: 'center' }}>
              {year}년 {month}월
            </div>
            <button onClick={nextMonth} disabled={isCurrent}
              style={{ ...navBtn, opacity: isCurrent ? 0.3 : 1, cursor: isCurrent ? 'not-allowed' : 'pointer' }}>›
            </button>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={load}>
              🔄 새로고침
            </button>
          </div>
          {/* 내보내기 + 저장 버튼 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={handlePrint} disabled={loading || staffList.length === 0}>
              🖨️ 인쇄 / PDF
            </button>
            <button className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={exportExcel} disabled={loading || staffList.length === 0}>
              📥 엑셀 내보내기
            </button>
            <button className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={saveAllOverrides} disabled={saving || loading || staffList.length === 0}>
              {saving ? <><span className="spinner">✦</span> 저장 중...</> : '💾 저장'}
            </button>
          </div>
        </div>

        {/* 안내 배너 (인쇄 시 숨김) */}
        <div className="payroll-no-print" style={{ fontSize: '11px', color: 'var(--text-dim)',
          padding: '5px 12px', marginBottom: '16px',
          background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.18)',
          borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>💾</span>
          <span>보너스 · 공제 입력 후 <strong style={{ color: 'var(--green)' }}>저장</strong> 버튼을 누르거나 입력 칸을 벗어나면 자동으로 DB에 저장됩니다</span>
        </div>

        {/* ── KPI 요약 (인쇄 시 숨김) ── */}
        <div className="payroll-no-print" style={{ display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: '이달 총 지급 예정', value: totals.netPayout,                       color: 'var(--purple)', bg: 'rgba(167,139,250,0.10)' },
            { label: '정산 직원 수',       value: staffList.length + '명', isText: true,  color: 'var(--blue)',   bg: 'rgba(96,165,250,0.10)'  },
            { label: '세금 3.3% 합계',    value: Math.round(totals.netPayout * 0.033),   color: 'var(--red)',    bg: 'rgba(248,113,113,0.10)' },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.color}28`,
              borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: k.color, fontWeight: 700,
                letterSpacing: '0.4px', marginBottom: '8px' }}>{k.label}</div>
              <div style={{ ...mono, fontSize: '18px', fontWeight: 700, color: k.color }}>
                {k.isText ? k.value : <>{fmt(k.value)}<span style={{ fontSize: '11px', marginLeft: '2px' }}>원</span></>}
              </div>
            </div>
          ))}
        </div>

        {/* ── 급여 명세 테이블 ── */}
        <div className="card">
          {/* 인쇄 시 카드 기간 제목 */}
          <div className="card-title" style={{ marginBottom: '16px' }}>
            직원 급여 명세 — {year}년 {month}월
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)', fontSize: '12px' }}>
              <span className="spinner" style={{ display: 'block', fontSize: '22px', marginBottom: '10px' }}>✦</span>
              수강권 데이터 연산 중...
            </div>
          ) : staffList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💼</div>
              <div className="empty-state-text">정산 대상 직원이 없어요</div>
              <div className="empty-state-sub">직원 관리에서 고용형태를 설정하면 이곳에 표시돼요</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="payroll-print-th">이름 / 직급</th>
                    <th className="payroll-print-th" style={{ textAlign: 'center' }}>PT 정산 방식</th>
                    <th className="payroll-print-th" style={{ textAlign: 'right' }}>기본급</th>
                    <th className="payroll-print-th" style={{ textAlign: 'right' }}>PT 수당</th>
                    <th className="payroll-print-th" style={{ textAlign: 'right' }}>영업 인센티브</th>
                    <th className="payroll-print-th" style={{ textAlign: 'center' }}>보너스</th>
                    <th className="payroll-print-th" style={{ textAlign: 'center' }}>공제</th>
                    <th className="payroll-print-th" style={{ textAlign: 'right' }}>실 지급액</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map(t => {
                    const p    = payrollOf(t)
                    const rank = rankMap[t.gym_rank_id]
                    const sc   = (t.settlement_config && typeof t.settlement_config === 'object')
                                   ? t.settlement_config : {}
                    return (
                      <tr key={t.id}>
                        {/* 이름 / 직급 */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="payroll-no-print" style={{
                              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                              background: 'rgba(200,241,53,0.1)', border: '1px solid rgba(200,241,53,0.2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
                            }}>{(t.name || '?')[0]}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{t.name || '—'}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px' }}>
                                {rank?.label ?? '직급 미설정'} · {EMP_LABEL[t.employment_type] ?? '—'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* PT 정산 방식 */}
                        <td style={{ textAlign: 'center' }}>
                          <PtBadge sc={sc} />
                          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '3px' }}>
                            완료 {p.completedCnt}회
                            {p.noshowCnt > 0 && (
                              <span style={{ color: 'var(--orange)', marginLeft: '4px' }}>
                                / 노쇼 {p.noshowCnt}회
                              </span>
                            )}
                          </div>
                          {sc.deduct_card_fee && sc.pt_calc_type !== 'fixed' && (
                            <div style={{ fontSize: '9px', color: 'var(--red)', marginTop: '1px' }}>
                              카드 {sc.card_fee_rate ?? '?'}% 선차감
                            </div>
                          )}
                        </td>

                        {/* 기본급 */}
                        <td style={{ textAlign: 'right', ...mono, fontSize: '12px', color: 'var(--text-muted)' }}>
                          {p.baseSalary > 0 ? fmtW(p.baseSalary) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>

                        {/* PT 수당 */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ ...mono, fontSize: '12px', fontWeight: 600, color: 'var(--blue)' }}>
                            {fmtW(p.ptPayout)}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '1px',
                            maxWidth: '140px', marginLeft: 'auto' }}>
                            {p.ptDetail}
                          </div>
                        </td>

                        {/* 영업 인센티브 */}
                        <td style={{ textAlign: 'right', ...mono, fontSize: '12px', color: 'var(--accent)' }}>
                          {p.salesInc > 0
                            ? <>{fmtW(p.salesInc)}
                                <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '1px' }}>
                                  매출 {fmt(p.revenue)}원 기준
                                </div>
                              </>
                            : <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                                {sc.sales_commission_rate != null ? '0원' : '—'}
                              </span>}
                        </td>

                        {/* 보너스 — 화면: 입력(onBlur → DB 저장), 인쇄: 숫자 */}
                        <td style={{ textAlign: 'center' }}>
                          <div className="payroll-no-print">
                            <AmountInput
                              value={overrides[t.id]?.bonus}
                              color="var(--green)"
                              placeholder="보너스"
                              onChange={v => setOverrides(prev => ({
                                ...prev, [t.id]: { ...(prev[t.id] || {}), bonus: v },
                              }))}
                              onBlur={v => {
                                // onBlur 시점 값으로 overridesRef를 즉시 갱신 후 단일 upsert
                                overridesRef.current = {
                                  ...overridesRef.current,
                                  [t.id]: { ...(overridesRef.current[t.id] || {}), bonus: v },
                                }
                                saveTrainerOverride(t.id)
                              }}
                            />
                          </div>
                          <div className="payroll-print-only" style={{ display: 'none',
                            ...mono, fontSize: '12px', color: '#2a7a2a' }}>
                            {fmtW(p.bonus)}
                          </div>
                        </td>

                        {/* 공제 — 화면: 입력(onBlur → DB 저장), 인쇄: 숫자 */}
                        <td style={{ textAlign: 'center' }}>
                          <div className="payroll-no-print">
                            <AmountInput
                              value={overrides[t.id]?.deduction}
                              color="var(--red)"
                              placeholder="공제"
                              onChange={v => setOverrides(prev => ({
                                ...prev, [t.id]: { ...(prev[t.id] || {}), deduction: v },
                              }))}
                              onBlur={v => {
                                overridesRef.current = {
                                  ...overridesRef.current,
                                  [t.id]: { ...(overridesRef.current[t.id] || {}), deduction: v },
                                }
                                saveTrainerOverride(t.id)
                              }}
                            />
                          </div>
                          <div className="payroll-print-only" style={{ display: 'none',
                            ...mono, fontSize: '12px', color: '#b00' }}>
                            {fmtW(p.deduction)}
                          </div>
                        </td>

                        {/* 실 지급액 */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ ...mono, fontSize: '14px', fontWeight: 700, color: 'var(--purple)' }}>
                            {fmtW(p.netPayout)}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '1px' }}>
                            원천징수 {fmt(p.withholdingTax)}원
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

                {/* 합계 행 */}
                {staffList.length > 1 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={2} style={{ fontWeight: 700, fontSize: '12px',
                        color: 'var(--text-muted)', padding: '10px 14px' }}>
                        합계 ({staffList.length}명)
                      </td>
                      <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--text-muted)' }}>{fmtW(totals.baseSalary)}</td>
                      <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--blue)'       }}>{fmtW(totals.ptPayout)}</td>
                      <td style={{ textAlign: 'right', ...mono, fontWeight: 700, color: 'var(--accent)'     }}>{fmtW(totals.salesInc)}</td>
                      <td style={{ textAlign: 'center',...mono, fontWeight: 700, color: 'var(--green)'      }}>{fmtW(totals.bonus)}</td>
                      <td style={{ textAlign: 'center',...mono, fontWeight: 700, color: 'var(--red)'        }}>{fmtW(totals.deduction)}</td>
                      <td style={{ textAlign: 'right', ...mono, fontWeight: 700,
                        color: 'var(--purple)', fontSize: '14px' }}>{fmtW(totals.netPayout)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* ── 계산 기준 안내 (인쇄 시 숨김) ── */}
        <div className="payroll-no-print" style={{ marginTop: '16px', padding: '16px 18px',
          background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.2)',
          borderRadius: '12px', fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: '8px' }}>💡 급여 계산 기준 안내</div>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li><strong>PT 수당 (고정단가)</strong>: 완료 × 단가 + 노쇼 × 단가 × 노쇼지급률</li>
            <li><strong>PT 수당 (비율제)</strong>: 수업별 수강권(ticket_id 직결) 1회 단가 × 비율 누적. 카드 건 수수료 선차감 반영.</li>
            <li><strong>영업 인센티브</strong>: 이달 결제 매출 × 영업 인센티브율</li>
            <li><strong>⚠ 수강권 미연결</strong>: ticket_id 없는 구형 출석은 단가 0원 처리. 수강권 재등록 권장.</li>
          </ul>
        </div>

      </div>
      {/* ▲ 인쇄 영역 끝 */}
    </>
  )
}
