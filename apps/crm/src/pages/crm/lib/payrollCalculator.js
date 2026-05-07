/**
 * payrollCalculator.js
 * 직원 급여 정산 순수 계산 엔진
 *
 * [원칙]
 * - 외부 의존성 없는 순수 함수(no React, no Supabase)
 * - 모든 입력은 null/undefined 가능 → 방어적 파싱 후 기본값 0
 * - 돈 계산에 휴리스틱(최근 데이터 꼼수) 절대 사용하지 않음
 * - attendance.ticket_id → payments FK 로 연결된 데이터만 신뢰
 */

// ── 결과 기본값 (에러 시 fallback) ──────────────────────────────
export const ZERO_PAYROLL = Object.freeze({
  baseSalary:     0,
  revenue:        0,
  ptPayout:       0,
  ptDetail:       '—',
  completedCnt:   0,
  noshowCnt:      0,
  salesInc:       0,
  bonus:          0,
  deduction:      0,
  netPayout:      0,
  withholdingTax: 0,
})

// ── 내부 헬퍼: 카드 수수료 적용 후 유효 단가 ──────────────────
function effectivePrice(row, sc) {
  const base = Number(row?.perSessionPrice ?? 0)
  if (!sc?.deduct_card_fee || sc.card_fee_rate == null) return base
  if (row?.paymentMethod !== 'card') return base
  return Math.round(base * (1 - Number(sc.card_fee_rate) / 100))
}

// ── 단일 출석 행의 PT 수당 (Export 상세 시트용) ───────────────
export function getSessionPtAmount(row, sc) {
  if (!row || !sc) return 0
  try {
    const ptType     = sc.pt_calc_type || 'ratio'
    const ptValue    = Number(sc.pt_value ?? 0)
    const noshowRate = Number(sc.noshow_payout_rate ?? 100) / 100

    if (row.status !== 'completed' && row.status !== 'noshow') return 0
    const isNoshow = row.status === 'noshow'

    // 고정단가
    if (ptType === 'fixed') {
      const base = ptValue
      return isNoshow ? Math.round(base * noshowRate) : base
    }

    // 비율제: ticket_id 연결 수강권 단가 기준
    const ep    = effectivePrice(row, sc)
    const ptAmt = Math.round(ep * ptValue / 100)
    return isNoshow ? Math.round(ptAmt * noshowRate) : ptAmt
  } catch {
    return 0
  }
}

// ── 내부: PT 수당 집계 ─────────────────────────────────────────
function calcPt(sc, rows) {
  const ptType     = sc.pt_calc_type || 'ratio'
  const ptValue    = Number(sc.pt_value ?? 0)
  const noshowRate = Number(sc.noshow_payout_rate ?? 100) / 100
  const cardFeeRate = (sc.deduct_card_fee && sc.card_fee_rate != null)
                        ? Number(sc.card_fee_rate) / 100 : 0

  const completedRows = rows.filter(r => r.status === 'completed')
  const noshowRows    = rows.filter(r => r.status === 'noshow')
  const completedCnt  = completedRows.length
  const noshowCnt     = noshowRows.length

  if (!ptValue) {
    return { ptPayout: 0, ptDetail: '미설정', completedCnt, noshowCnt }
  }

  // ── 고정단가 ────────────────────────────────────────────────
  if (ptType === 'fixed') {
    const ptPayout = completedCnt * ptValue
                   + Math.round(noshowCnt * ptValue * noshowRate)
    const detail = [
      `${completedCnt}회 × ${Number(ptValue).toLocaleString()}₩`,
      noshowCnt > 0 ? `+ 노쇼 ${noshowCnt}회×${Math.round(noshowRate * 100)}%` : '',
    ].filter(Boolean).join(' ')
    return { ptPayout, ptDetail: detail, completedCnt, noshowCnt }
  }

  // ── 비율제: ticket_id 기반 건별 누적 ────────────────────────
  // completed: effectivePrice × (ptValue/100)
  // noshow   : effectivePrice × (ptValue/100) × (noshow_payout_rate/100)
  let ptPayout = 0
  for (const row of completedRows) {
    ptPayout += Math.round(effectivePrice(row, sc) * ptValue / 100)
  }
  for (const row of noshowRows) {
    ptPayout += Math.round(effectivePrice(row, sc) * ptValue / 100 * noshowRate)
  }

  const ticketMissing = rows.filter(r => !r.hasTicket).length
  const detail = [
    `비율 ${ptValue}% · 완료 ${completedCnt}회`,
    noshowCnt > 0     ? `노쇼 ${noshowCnt}회(${Math.round(noshowRate * 100)}%)` : '',
    cardFeeRate > 0   ? `카드 ${sc.card_fee_rate}% 선차감` : '',
    ticketMissing > 0 ? `⚠ 수강권 미연결 ${ticketMissing}건` : '',
  ].filter(Boolean).join(' · ')

  return { ptPayout, ptDetail: detail, completedCnt, noshowCnt }
}

/**
 * 트레이너 1명 급여 전체 산출 (순수 함수)
 *
 * @param {object}      trainer         - settlement_config, incentive_rate 포함 트레이너 row
 * @param {Array}       attendRows      - { status, perSessionPrice, paymentMethod, hasTicket,
 *                                         attendedDate, memberName }
 *                                        ticket_id → payments FK 로 정확히 연결된 데이터
 * @param {Array}       trainerPayments - 이달 payments (매출·영업인센티브 기준)
 * @param {object|null} rank            - gym_ranks row { base_salary, default_incentive_rate }
 * @param {object}      manualOverride  - { bonus, deduction } 원장 수동 입력값
 * @returns {object} ZERO_PAYROLL 구조와 동일한 급여 결과 객체
 */
export function calculatePayroll(
  trainer,
  attendRows,
  trainerPayments,
  rank,
  manualOverride = {},
) {
  try {
    const sc = (trainer?.settlement_config && typeof trainer.settlement_config === 'object')
                 ? trainer.settlement_config : {}

    const baseSalary = Number(rank?.base_salary ?? 0)

    const revenue = (trainerPayments ?? []).reduce(
      (s, p) => s + Number(p.amount ?? 0), 0,
    )

    const { ptPayout, ptDetail, completedCnt, noshowCnt } = calcPt(sc, attendRows ?? [])

    const salesInc = (sc.sales_commission_rate != null && revenue > 0)
      ? Math.round(revenue * Number(sc.sales_commission_rate) / 100) : 0

    const bonus     = Number(manualOverride.bonus     ?? 0)
    const deduction = Number(manualOverride.deduction ?? 0)
    const netPayout = baseSalary + ptPayout + salesInc + bonus - deduction

    return {
      baseSalary,
      revenue,
      ptPayout,
      ptDetail,
      completedCnt,
      noshowCnt,
      salesInc,
      bonus,
      deduction,
      netPayout,
      withholdingTax: Math.round(netPayout * 0.033),
    }
  } catch (e) {
    console.error('[calculatePayroll] 계산 오류:', e)
    return { ...ZERO_PAYROLL }
  }
}
