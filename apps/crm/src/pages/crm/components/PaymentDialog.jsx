import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from './CrmModal'
import { useToast } from './CrmToast'
import { parseISO, addDays, format } from 'date-fns'
import { isDurationTicket, calcTicketPeriod, todayStr } from '../lib/ticketDateCalc'
import { couponDiscount, priceBreakdown, rateOf, pt, errText } from '../lib/benefits'

// ── 결제 창 ─────────────────────────────────────────────────────
// 왼쪽: 상품 카드(종류 필터·검색, 상품 설명=이벤트 문구 표시) / 오른쪽: 결제 정보.
// 저장 규칙은 기존 결제 등록과 동일: 기간권이면 기존 활성 기간권 뒤로 이어붙여 start/end 저장.
// 단, 대여권(락커)은 회원권 체인과 무관: 오늘부터(연장이면 기존 락커 만료 다음 날부터) 계산하고,
// 회원권 이어붙이기 계산에서도 대여권 결제는 제외.
// lockerExtend = { assignment, number } 이면 락커 연장 결제 모드.
// 쿠폰·마일리지: 화면은 미리보기만, 저장은 crm_pay_with_benefits RPC 가 검증·계산·기록 (091).

const mono = { fontFamily: "'DM Mono', monospace" }
const won  = n => Number(n || 0).toLocaleString() + '원'

const CATEGORIES = ['회원권', '레슨', '대여권', '구독권', '패키지', '일반']
const CAT_STYLE = {
  '회원권': { color: '#1D4ED8', bg: 'rgba(96,165,250,0.15)',  border: 'rgba(96,165,250,0.35)' },
  '레슨':   { color: '#C2410C', bg: 'rgba(251,146,60,0.15)',  border: 'rgba(251,146,60,0.35)' },
  '대여권': { color: '#15803D', bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.35)' },
  '구독권': { color: '#0F766E', bg: 'rgba(45,212,191,0.15)',  border: 'rgba(45,212,191,0.35)' },
  '패키지': { color: '#7E22CE', bg: 'rgba(192,132,252,0.15)', border: 'rgba(192,132,252,0.35)' },
  '일반':   { color: '#475569', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.35)' },
}

const METHODS = [
  { value: 'card',           label: '카드' },
  { value: 'cash',           label: '현금' },
  { value: 'transfer',       label: '계좌이체' },
  { value: 'local_currency', label: '지역화폐' },
  { value: 'payments_app',   label: '페이먼츠앱' },
]

function priceOf(product, method) {
  if (!product) return 0
  const pp = product.payment_prices || {}
  if (method === 'cash')     return Number(product.price_cash ?? 0)
  if (method === 'card')     return Number(product.price_card ?? 0)
  if (method === 'transfer') return Number(pp.transfer ?? 0)
  return 0   // 지역화폐·페이먼츠앱 → 직접 입력
}

export default function PaymentDialog({ open, member, gymId, trainers = [], currentTrainer, onClose, onPaid, lockerExtend = null }) {
  const showToast = useToast()
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [cat,      setCat]      = useState('전체')
  const [query,    setQuery]    = useState('')
  const [selId,    setSelId]    = useState('')
  const [method,   setMethod]   = useState('card')
  const [amount,   setAmount]   = useState('')
  const [memo,     setMemo]     = useState('')
  const [staffId,  setStaffId]  = useState(currentTrainer?.id || '')
  const [period,   setPeriod]   = useState(null)      // { startDate, endDate } (기간권)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [current,  setCurrent]  = useState(null)      // 진행 중 기간권 (헤더 표시)
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)
  // 락커
  const [emptyLockers, setEmptyLockers] = useState([])
  const [lockerId, setLockerId] = useState('')
  const [later,    setLater]    = useState(false)
  // 쿠폰·마일리지
  const [benefits, setBenefits] = useState(null)      // crm_member_benefits
  const [couponId, setCouponId] = useState('')        // member_coupons.id
  const [useInput, setUseInput] = useState('')

  // 열릴 때 초기화 + 상품·진행 중 회원권 로드
  useEffect(() => {
    if (!open || !member) return
    setCat(lockerExtend ? '대여권' : '전체'); setQuery(''); setSelId(''); setMethod('card'); setAmount('')
    setMemo(''); setStaffId(currentTrainer?.id || ''); setPeriod(null); setError('')
    setLockerId(''); setLater(false)
    setBenefits(null); setCouponId(''); setUseInput('')
    loadProducts(); loadCurrent(); loadBenefits()
  }, [open, member?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProducts() {
    setLoading(true)
    const { data } = await supabase.from('gym_products').select('*')
      .eq('gym_id', gymId).eq('is_active', true).order('category').order('name')
    setProducts(data || [])
    setLoading(false)
  }

  async function loadBenefits() {
    const { data, error } = await supabase.rpc('crm_member_benefits', { p_member_id: member.id })
    if (error) { console.error('[crm_member_benefits]', error); return }
    setBenefits(data)
  }

  async function loadCurrent() {
    const t = todayStr()
    const { data } = await supabase.from('payments').select('product_name, end_date')
      .eq('member_id', member.id).eq('status', 'active')
      .lte('start_date', t).gte('end_date', t)
      .order('end_date', { ascending: false }).limit(1)
    setCurrent(data?.[0] || null)
  }

  const selected = products.find(p => p.id === selId) || null
  const isTimeBased = isDurationTicket(selected)
  const isLocker    = selected?.category === '대여권'

  // 대여권을 고르면 빈 락커 목록 (연장 모드는 칸 고정)
  useEffect(() => {
    if (!isLocker || lockerExtend) return
    supabase.rpc('crm_locker_board', { p_gym_id: gymId }).then(({ data }) => {
      setEmptyLockers((data || []).filter(l => l.status === 'available' && !l.assignment))
    })
  }, [isLocker, gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 상품·수단 바뀌면 정가로 금액 채움 (할인 시 직접 수정)
  useEffect(() => {
    const p = priceOf(selected, method)
    setAmount(p > 0 ? String(p) : '')
  }, [selId, method]) // eslint-disable-line react-hooks/exhaustive-deps

  // 기간 계산
  //  - 대여권: 오늘부터 (연장이면 기존 락커 만료 다음 날부터) N일
  //  - 그 외 기간권: 기존 활성 기간권(대여권 제외) 뒤로 이어붙임
  useEffect(() => {
    if (!selected || !isTimeBased) { setPeriod(null); return }
    if (isLocker) {
      const start = lockerExtend ? addDays(parseISO(lockerExtend.assignment.end_date), 1) : parseISO(todayStr())
      const end   = addDays(start, Number(selected.duration_days) - 1)
      setPeriod({ startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') })
      return
    }
    let alive = true
    setPeriodLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.from('payments')
          .select('end_date, gym_products!payments_gym_product_id_fkey(category)')
          .eq('member_id', member.id).eq('status', 'active')
          .gte('end_date', todayStr()).not('end_date', 'is', null)
          .order('end_date', { ascending: false }).limit(20)
        const maxEnd = (data || []).find(r => r.gym_products?.category !== '대여권')?.end_date ?? null
        if (alive) setPeriod(calcTicketPeriod(maxEnd, selected.duration_days))
      } catch {
        if (alive) setPeriod(calcTicketPeriod(null, selected.duration_days))
      } finally {
        if (alive) setPeriodLoading(false)
      }
    })()
    return () => { alive = false }
  }, [selId]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { 전체: products.length }
    CATEGORIES.forEach(k => { c[k] = products.filter(p => p.category === k).length })
    return c
  }, [products])

  const amountNum = Number(amount) || 0

  // 쿠폰·마일리지 미리보기
  const settings = benefits?.settings
  const myCoupons = benefits?.coupons || []
  const coupon = myCoupons.find(c => c.id === couponId)?.coupon || null
  const bd = priceBreakdown({
    list: amountNum, coupon, product: selected, use: Number(useInput || 0),
    balance: benefits?.balance || 0, settings,
  })
  const mileageOn = !!settings?.enabled
  const minUse = Number(settings?.min_use || 0)
  const useNum = Number(useInput || 0)
  const useError = !useNum ? ''
    : useNum > (benefits?.balance || 0) ? '보유 마일리지보다 많아요'
    : useNum > bd.maxUse ? `최대 ${pt(bd.maxUse)}까지 쓸 수 있어요`
    : useNum < minUse ? `${pt(minUse)}부터 쓸 수 있어요` : ''

  // 상품·금액이 바뀌어 쓸 수 없게 된 쿠폰은 해제
  useEffect(() => {
    if (coupon && couponDiscount(coupon, selected, amountNum).discount == null) setCouponId('')
  }, [selId, amountNum]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim()
  const shown = products
    .filter(p => cat === '전체' || p.category === cat)
    .filter(p => !q || p.name.includes(q) || (p.description || '').includes(q))


  async function submit() {
    if (busy) return
    setError('')
    if (!selected)  { setError('상품을 선택해주세요.'); return }
    if (!amountNum) { setError('결제 금액을 입력해주세요 (0원 불가).'); return }
    if (isTimeBased && (periodLoading || !period)) { setError('이용 기간을 계산 중이에요. 잠시 후 다시 눌러주세요.'); return }
    if (isLocker && !lockerExtend && isTimeBased && !lockerId && !later) {
      setError("락커 칸을 고르거나 '칸은 나중에 배정'을 체크해주세요."); return
    }
    if (useError) { setError('마일리지: ' + useError); return }
    if (bd.final <= 0) { setError('할인 후 결제 금액이 0원이 될 수 없어요.'); return }
    setBusy(true)
    try {
      const { data: paid, error } = await supabase.rpc('crm_pay_with_benefits', {
        p_member_id:        member.id,
        p_product_id:       selected.id,
        p_list_amount:      amountNum,
        p_method:           method,
        p_member_coupon_id: couponId || null,
        p_mileage_use:      useNum,
        p_memo:             memo.trim() || null,
        p_processed_by:     staffId || null,
        p_start:            isTimeBased && period ? period.startDate : null,
        p_end:              isTimeBased && period ? period.endDate : null,
      })
      if (error) throw error
      paid.id = paid.payment_id

      // 락커 배정 / 연장 — 실패해도 결제는 이미 저장됨 → 안내만
      let lockerMsg = ''
      if (isLocker && isTimeBased && period) {
        const { error: lkErr } = lockerExtend
          ? await supabase.rpc('crm_extend_locker', { p_assignment_id: lockerExtend.assignment.id, p_new_end: period.endDate, p_payment_id: paid.id })
          : lockerId
            ? await supabase.rpc('crm_assign_locker', { p_locker_id: lockerId, p_member_id: member.id, p_start: period.startDate, p_end: period.endDate, p_payment_id: paid.id })
            : { error: null }
        if (lkErr) {
          alert('결제는 등록됐지만 락커 처리에 실패했어요. 락커 관리에서 다시 배정해주세요.\n' + lkErr.message)
        } else if (lockerExtend) {
          lockerMsg = ` · ${lockerExtend.number}번 ~${period.endDate}`
        } else if (lockerId) {
          lockerMsg = ` · ${emptyLockers.find(l => l.id === lockerId)?.number}번 배정`
        }
      }
      const earnMsg = paid.mileage_earned > 0 ? ` · ${pt(paid.mileage_earned)} 적립` : ''
      showToast?.(`✓ 결제 등록 — ${selected.name} ${won(paid.amount)}${earnMsg}${lockerMsg}`)
      onPaid?.()
      onClose()
    } catch (e) {
      setError('등록 오류: ' + errText(e))
    } finally {
      setBusy(false)
    }
  }

  const activeStaff = trainers.filter(t => !t.employment_status || t.employment_status === 'active')

  return (
    <Modal open={open} onClose={onClose} maxWidth="1000px"
      title={<span>{member?.name} 결제
        <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px' }}>
          {current ? `진행 중: ${current.product_name || '회원권'} (~${current.end_date})` : '진행 중인 회원권 없음'}
          {benefits && <> · 마일리지 {pt(benefits.balance)} · 쿠폰 {myCoupons.length}장</>}
        </span></span>}>
      <div className="pay-dialog">
        {/* ── 상품 고르기 ── */}
        <div className="pay-products">
          <div className="pay-filter">
            <input className="input" type="search" placeholder="상품 이름·이벤트 검색"
              aria-label="상품 검색" value={query} onChange={e => setQuery(e.target.value)} />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['전체', ...CATEGORIES].filter(k => k === '전체' || counts[k] > 0).map(k => (
                <button key={k} className={`filter-chip ${cat === k ? 'active' : ''}`} onClick={() => setCat(k)}>
                  {k} <span style={{ ...mono, fontSize: '10px', opacity: 0.7 }}>{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pay-grid">
            {loading && <div className="rev-empty" style={{ gridColumn: '1 / -1' }}>상품을 불러오는 중…</div>}
            {!loading && shown.length === 0 && (
              <div className="rev-empty" style={{ gridColumn: '1 / -1' }}>
                {products.length === 0 ? '판매 중인 상품이 없어요. 상품 관리에서 먼저 등록해주세요.' : '조건에 맞는 상품이 없어요'}
              </div>
            )}
            {shown.map(p => {
              const st = CAT_STYLE[p.category] || CAT_STYLE['일반']
              const on = p.id === selId
              return (
                <button key={p.id} type="button" className={`pay-card ${on ? 'on' : ''}`}
                  aria-pressed={on} onClick={() => { setSelId(p.id); setError('') }}>
                  <span className="pay-badge" style={{ color: st.color, background: st.bg, borderColor: st.border }}>{p.category}</span>
                  <span className="pay-card-name">{p.name}</span>
                  {p.description && <span className="pay-card-desc">{p.description}</span>}
                  <span className="pay-kv">
                    <span><b>이용기간</b><span style={mono}>{p.duration_days ? `${p.duration_days}일` : '무제한'}</span></span>
                    <span><b>횟수</b><span style={mono}>{p.session_limit ? `${p.session_limit}회` : '무제한'}</span></span>
                  </span>
                  <span className="pay-price">
                    <span>현금</span><span style={{ ...mono, fontSize: '14px', fontWeight: 700 }}>{won(p.price_cash)}</span>
                  </span>
                  {p.price_card > 0 && (
                    <span className="pay-price" style={{ border: 'none', paddingTop: 0 }}>
                      <span>카드</span><span style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)' }}>{won(p.price_card)}</span>
                    </span>
                  )}
                  {rateOf(p, settings) > 0 && <span className="pay-earn">마일리지 {rateOf(p, settings)}% 적립</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── 결제 정보 ── */}
        <div className="pay-side">
          <div className="pay-side-body">
            <div>
              <span className="pay-label">선택한 상품</span>
              <div className="pay-selected">
                {selected ? (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{selected.name}</div>
                    <div style={{ fontSize: '11px', color: selected.description ? '#9A3412' : 'var(--text-muted)', marginTop: '3px' }}>
                      {selected.description || '기본 구성'}
                    </div>
                  </>
                ) : <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>왼쪽에서 상품을 골라주세요</div>}
              </div>
            </div>

            {selected && (
              <div className="pay-period">
                <span>이용 기간</span>
                <span style={mono}>
                  {!isTimeBased ? '기간 제한 없음'
                    : periodLoading || !period ? '계산 중…'
                    : `${period.startDate} ~ ${period.endDate}`}
                </span>
              </div>
            )}

            {isLocker && isTimeBased && (
              lockerExtend ? (
                <div className="pay-period">
                  <span>연장할 락커</span><b style={mono}>{lockerExtend.number}번</b>
                </div>
              ) : (
                <div>
                  <span className="pay-label">락커 칸 선택 · 빈 칸 {emptyLockers.length}개</span>
                  {emptyLockers.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>빈 칸이 없어요. 결제 후 락커 관리에서 배정할 수 있어요.</div>
                  ) : (
                    <div className="lk-pick">
                      {emptyLockers.map(l => (
                        <button key={l.id} type="button" className={`lk-pick-btn ${lockerId === l.id ? 'on' : ''}`}
                          aria-pressed={lockerId === l.id}
                          onClick={() => { setLockerId(l.id); setLater(false) }}>{l.number}</button>
                      ))}
                    </div>
                  )}
                  <label className="lk-later">
                    <input type="checkbox" checked={later}
                      onChange={e => { setLater(e.target.checked); if (e.target.checked) setLockerId('') }} />
                    칸은 나중에 배정 (락커 관리에서)
                  </label>
                </div>
              )
            )}

            <div>
              <span className="pay-label">결제 수단</span>
              <div className="pay-methods">
                {METHODS.map(m => {
                  const p = priceOf(selected, m.value)
                  return (
                    <button key={m.value} type="button" className={`pay-method ${method === m.value ? 'on' : ''}`}
                      aria-pressed={method === m.value} onClick={() => setMethod(m.value)}>
                      <span>{m.label}</span>
                      <span style={{ ...mono, fontSize: '10px', color: 'var(--text-muted)' }}>{p > 0 ? won(p) : '직접 입력'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="pay-field">
              <span className="pay-label">상품 금액 (현장 할인 시 수정)</span>
              <input className="input" type="number" min={0} step={1000} style={{ ...mono, textAlign: 'right' }}
                placeholder="금액 입력" value={amount} onChange={e => setAmount(e.target.value)} />
            </label>
            {selected && myCoupons.length > 0 && (
              <div>
                <span className="pay-label">쿠폰 · 이 상품에 쓸 수 있는 것만 선택돼요</span>
                <div className="pay-coupons">
                  {myCoupons.map(mc => {
                    const { discount, reason } = couponDiscount(mc.coupon, selected, amountNum)
                    const on = couponId === mc.id
                    return (
                      <button key={mc.id} type="button" className={`pay-cpn ${on ? 'on' : ''}`} disabled={discount == null}
                        aria-pressed={on} onClick={() => setCouponId(on ? '' : mc.id)}>
                        <span style={{ minWidth: 0 }}>
                          {mc.coupon.name}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px', fontSize: '11px' }}>~{mc.expires_at.slice(5).replace('-', '/')}</span>
                        </span>
                        <span style={mono}>{discount == null ? (reason || '사용 불가') : `−${won(discount)}`}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {selected && mileageOn && (benefits?.balance || 0) > 0 && (
              <div>
                <span className="pay-label">
                  마일리지 사용 · 보유 {pt(benefits.balance)} (최대 {pt(bd.maxUse)}{minUse > 0 ? `, ${pt(minUse)}부터` : ''})
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input className="input" type="number" min={0} step={100} style={{ ...mono, textAlign: 'right' }}
                    aria-label="사용할 마일리지" placeholder="0" value={useInput} onChange={e => setUseInput(e.target.value)} />
                  <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                    disabled={bd.maxUse < Math.max(minUse, 1)} onClick={() => setUseInput(String(bd.maxUse))}>최대 사용</button>
                </div>
                {useError && <div style={{ fontSize: '11px', color: '#B42318', marginTop: '4px' }}>{useError}</div>}
              </div>
            )}

            {selected && amountNum > 0 && (bd.couponDiscount > 0 || bd.mileage > 0 || bd.earn > 0) && (
              <div className="pay-summary">
                <div><span>상품 금액</span><span style={mono}>{won(amountNum)}</span></div>
                {bd.couponDiscount > 0 && <div className="minus"><span>쿠폰 할인</span><span style={mono}>−{won(bd.couponDiscount)}</span></div>}
                {bd.mileage > 0 && !useError && <div className="minus"><span>마일리지 사용</span><span style={mono}>−{won(bd.mileageWon)}</span></div>}
                <div className="total"><span>결제 금액</span><span style={mono}>{won(useError ? amountNum - bd.couponDiscount : bd.final)}</span></div>
                {bd.earn > 0 && <div className="earn"><span>적립 예정 ({bd.rate}%)</span><span style={mono}>+{pt(bd.earn)}</span></div>}
              </div>
            )}

            <label className="pay-field">
              <span className="pay-label">메모 (선택)</span>
              <input className="input" placeholder="특이사항, 할인 내용 등" value={memo} onChange={e => setMemo(e.target.value)} />
            </label>
            <label className="pay-field">
              <span className="pay-label">결제 담당자</span>
              <select className="input" value={staffId} onChange={e => setStaffId(e.target.value)}>
                <option value="">선택 안 함</option>
                {activeStaff.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>

          <div className="pay-side-foot">
            {error && <div className="pause-error" role="alert" style={{ marginBottom: '10px' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>결제 금액</span>
              <span style={{ ...mono, fontSize: '20px', fontWeight: 700 }}>{amountNum ? won(useError ? amountNum - bd.couponDiscount : bd.final) : '—'}</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}
              disabled={busy || !selected || !amountNum} onClick={submit}>
              {busy ? '등록 중…'
                : isLocker && lockerExtend ? `결제하고 ${lockerExtend.number}번 연장`
                : isLocker && lockerId ? `결제하고 ${emptyLockers.find(l => l.id === lockerId)?.number}번 배정`
                : '결제 등록'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
