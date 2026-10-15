// ── 쿠폰·마일리지 계산 (화면 미리보기용) ──────────────────────────
// 실제 결제는 crm_pay_with_benefits RPC 가 같은 규칙으로 다시 검증·계산한다 (091).

export const DEFAULT_SETTINGS = { enabled: true, point_value: 1, default_rate: 1, min_use: 0, max_use_pct: 100, expire_months: 12 }

const n = v => Number(v || 0)
export const pt  = v => n(v).toLocaleString() + 'P'
export const won = v => n(v).toLocaleString() + '원'

// 쿠폰 할인액. 적용 불가면 null + 이유
export function couponDiscount(c, product, list) {
  if (!c || !product || !(list > 0)) return { discount: null, reason: '' }
  if (list < n(c.min_amount)) return { discount: null, reason: `${won(c.min_amount)} 이상 결제 시` }
  if (c.product_scope === 'category' && !(c.categories || []).includes(product.category)) {
    return { discount: null, reason: `${(c.categories || []).join('·')} 전용` }
  }
  if (c.product_scope === 'products' && !(c.product_ids || []).includes(product.id)) {
    return { discount: null, reason: '지정 상품 전용' }
  }
  if (c.discount_type === 'amount') return { discount: Math.min(n(c.value), list), reason: '' }
  const raw = Math.floor(list * n(c.value) / 100)
  return { discount: Math.min(list, c.max_discount ? n(c.max_discount) : list, raw), reason: '' }
}

export function rateOf(product, settings) {
  const s = settings || DEFAULT_SETTINGS
  if (!s.enabled || !product) return 0
  return product.mileage_rate != null ? n(product.mileage_rate) : n(s.default_rate)
}

// 금액 흐름: 상품 금액 → 쿠폰 → 마일리지 → 결제 금액 → 적립
export function priceBreakdown({ list, coupon, product, use, balance, settings }) {
  const s  = settings || DEFAULT_SETTINGS
  const pv = n(s.point_value) || 1
  const cd = coupon ? (couponDiscount(coupon, product, list).discount ?? 0) : 0
  const afterCoupon = Math.max(0, list - cd)
  const maxUse = s.enabled ? Math.min(n(balance), Math.floor(afterCoupon * n(s.max_use_pct) / 100 / pv)) : 0
  const mileage = Math.max(0, Math.min(n(use), maxUse))
  const final = afterCoupon - Math.floor(mileage * pv)
  const rate = rateOf(product, s)
  const earn = final > 0 ? Math.floor(final * rate / 100 / pv) : 0
  return { couponDiscount: cd, afterCoupon, maxUse, mileage, mileageWon: Math.floor(mileage * pv), final, rate, earn }
}

// 쿠폰 표시 문구
export function couponBig(c) {
  if (c.discount_type === 'percent') return { big: `${c.value}%`, small: c.max_discount ? `최대 ${won(c.max_discount)}` : '할인' }
  const v = n(c.value)
  return { big: v >= 10000 && v % 10000 === 0 ? `${v / 10000}만원` : won(v), small: '할인' }
}

export function couponCond(c, productsById = {}) {
  const scope = c.product_scope === 'category' ? (c.categories || []).join(' · ')
    : c.product_scope === 'products' ? (c.product_ids || []).map(id => productsById[id]?.name || '삭제된 상품').join(' · ')
    : '전체 상품'
  return n(c.min_amount) > 0 ? `${scope} · ${won(c.min_amount)} 이상 결제 시` : scope
}

export function couponValid(c) {
  return c.valid_until ? `${c.valid_until}까지` : `발급일부터 ${c.valid_days}일`
}

export const PAY_ERRORS = {
  COUPON_UNAVAILABLE:    '이미 쓰였거나 기간이 지난 쿠폰이에요.',
  COUPON_NOT_APPLICABLE: '이 상품·금액에는 쓸 수 없는 쿠폰이에요.',
  MILEAGE_DISABLED:      '센터에서 마일리지 사용을 꺼두었어요.',
  MILEAGE_BELOW_MIN:     '최소 사용 포인트보다 적어요.',
  MILEAGE_OVER_MAX:      '한 번에 쓸 수 있는 마일리지를 넘었어요.',
  MILEAGE_INSUFFICIENT:  '보유 마일리지가 부족해요.',
  ZERO_AMOUNT:           '할인 후 결제 금액이 0원이 될 수 없어요.',
  PRODUCT_NOT_FOUND:     '상품을 찾을 수 없어요.',
  INVALID_AMOUNT:        '금액을 확인해주세요.',
  PERMISSION_DENIED:     '권한이 없어요.',
  INSUFFICIENT:          '보유 마일리지보다 많이 뺄 수 없어요.',
  INVALID_SETTINGS:      '설정 값을 확인해주세요.',
  INACTIVE:              '사용 중지된 쿠폰이에요.',
  EXPIRED:               '유효기간이 이미 지난 쿠폰이에요.',
}
export function errText(e) {
  const msg = e?.message || ''
  const key = Object.keys(PAY_ERRORS).find(k => msg.includes(k))
  return key ? PAY_ERRORS[key] : (msg || '알 수 없는 오류')
}

export const LEDGER_KIND = {
  earn:           '결제 적립',
  use:            '결제에 사용',
  refund_reclaim: '환불 되돌림 (적립 회수)',
  refund_restore: '환불 되돌림 (사용분 반환)',
  adjust:         '직접 조정',
  coupon_issue:   '쿠폰 발급',
}
