/**
 * ticketDateCalc.js
 * 기간권 날짜 이어붙이기 순수 계산 엔진
 *
 * [원칙]
 * - 외부 의존성: date-fns 만 허용 (윤달·타임존 안전 보장)
 * - JS 순수 Date 수동 덧셈 절대 금지
 * - no React, no Supabase — 완전한 순수 함수
 *
 * [용어 정의]
 * - 기간권: duration_days > 0 인 상품 (회원권, 구독권 등)
 * - 횟수권: session_limit > 0, duration_days = null 인 상품 (레슨/PT)
 *
 * [end_date 계산 규칙 — inclusive 방식]
 * 30일권, 시작일 2025-07-01 → 만료일 2025-07-30 (1일 포함 30일)
 * 이어붙이기: 기존 만료일 2025-07-30 → 신규 시작일 2025-07-31
 */

import { parseISO, addDays, format } from 'date-fns'

// ── 로컬 오늘 날짜 문자열 ('YYYY-MM-DD') ──────────────────────
// toISOString() 는 UTC 기준이라 한국 자정 근처에 하루 오차 가능성 있음
// date-fns format + new Date() 는 로컬 시간 기준 → 안전
export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── 기간권 여부 판별 ──────────────────────────────────────────
// duration_days > 0 이면 기간권.  횟수권은 duration_days = null or 0.
export function isDurationTicket(product) {
  return product != null && Number(product.duration_days) > 0
}

/**
 * 신규 기간권 start_date / end_date 계산
 *
 * @param {string|null} maxEndDate
 *   - 해당 회원의 활성 기간권 중 가장 늦은 만료일 ('YYYY-MM-DD') or null
 *   - null 이면 오늘부터 시작
 * @param {number} durationDays
 *   - 신규 상품의 이용 일수 (> 0 정수)
 * @returns {{ startDate: string, endDate: string }}
 *   - 'YYYY-MM-DD' 형식 문자열
 *
 * @example
 *   calcTicketPeriod('2025-06-30', 30)
 *   // → { startDate: '2025-07-01', endDate: '2025-07-30' }
 *
 *   calcTicketPeriod(null, 90)
 *   // → { startDate: <오늘>, endDate: <오늘+89일> }
 */
export function calcTicketPeriod(maxEndDate, durationDays) {
  const days = Number(durationDays)
  if (!days || days <= 0) {
    throw new Error(`[ticketDateCalc] durationDays must be > 0, got: ${durationDays}`)
  }

  const startDate = maxEndDate
    ? addDays(parseISO(maxEndDate), 1)      // 기존 만료일 다음 날
    : parseISO(todayStr())                  // 활성 기간권 없으면 오늘

  const endDate = addDays(startDate, days - 1)  // 시작일 포함 N일 (inclusive)

  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate:   format(endDate,   'yyyy-MM-dd'),
  }
}
