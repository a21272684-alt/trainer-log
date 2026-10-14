import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from './CrmModal'
import { useToast } from './CrmToast'
import { isDurationTicket, calcTicketPeriod, todayStr } from '../lib/ticketDateCalc'

// ── 결제 창 ─────────────────────────────────────────────────────
// 왼쪽: 상품 카드(종류 필터·검색, 상품 설명=이벤트 문구 표시) / 오른쪽: 결제 정보.
// 저장 규칙은 기존 결제 등록과 동일: 기간권이면 기존 활성 기간권 뒤로 이어붙여 start/end 저장.

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

export default function PaymentDialog({ open, member, gymId, trainers = [], currentTrainer, onClose, onPaid }) {
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

  // 열릴 때 초기화 + 상품·진행 중 회원권 로드
  useEffect(() => {
    if (!open || !member) return
    setCat('전체'); setQuery(''); setSelId(''); setMethod('card'); setAmount('')
    setMemo(''); setStaffId(currentTrainer?.id || ''); setPeriod(null); setError('')
    loadProducts(); loadCurrent()
  }, [open, member?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProducts() {
    setLoading(true)
    const { data } = await supabase.from('gym_products').select('*')
      .eq('gym_id', gymId).eq('is_active', true).order('category').order('name')
    setProducts(data || [])
    setLoading(false)
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

  // 상품·수단 바뀌면 정가로 금액 채움 (할인 시 직접 수정)
  useEffect(() => {
    const p = priceOf(selected, method)
    setAmount(p > 0 ? String(p) : '')
  }, [selId, method]) // eslint-disable-line react-hooks/exhaustive-deps

  // 기간권이면 기존 활성 기간권 뒤로 이어붙인 기간 계산
  useEffect(() => {
    if (!selected || !isTimeBased) { setPeriod(null); return }
    let alive = true
    setPeriodLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.from('payments').select('end_date')
          .eq('member_id', member.id).eq('status', 'active')
          .gte('end_date', todayStr()).not('end_date', 'is', null)
          .order('end_date', { ascending: false }).limit(1)
        if (alive) setPeriod(calcTicketPeriod(data?.[0]?.end_date ?? null, selected.duration_days))
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

  const q = query.trim()
  const shown = products
    .filter(p => cat === '전체' || p.category === cat)
    .filter(p => !q || p.name.includes(q) || (p.description || '').includes(q))

  const amountNum = Number(amount) || 0

  async function submit() {
    if (busy) return
    setError('')
    if (!selected)  { setError('상품을 선택해주세요.'); return }
    if (!amountNum) { setError('결제 금액을 입력해주세요 (0원 불가).'); return }
    if (isTimeBased && (periodLoading || !period)) { setError('이용 기간을 계산 중이에요. 잠시 후 다시 눌러주세요.'); return }
    setBusy(true)
    try {
      const row = {
        member_id:      member.id,
        trainer_id:     member.trainer_id ?? null,
        gym_product_id: selected.id,
        product_name:   selected.name,
        session_count:  selected.session_limit ?? 0,
        amount:         amountNum,
        payment_method: method,
        memo:           memo.trim() || null,
        processed_by:   staffId || null,
        paid_at:        new Date().toISOString(),
      }
      if (isTimeBased && period) { row.start_date = period.startDate; row.end_date = period.endDate }
      const { error } = await supabase.from('payments').insert(row)
      if (error) throw error
      showToast?.(`✓ 결제 등록 — ${selected.name} ${won(amountNum)}`)
      onPaid?.()
      onClose()
    } catch (e) {
      setError('등록 오류: ' + (e.message ?? '알 수 없는 오류'))
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
              <span className="pay-label">결제 금액 (할인 시 수정)</span>
              <input className="input" type="number" min={0} step={1000} style={{ ...mono, textAlign: 'right' }}
                placeholder="금액 입력" value={amount} onChange={e => setAmount(e.target.value)} />
            </label>
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
              <span style={{ ...mono, fontSize: '20px', fontWeight: 700 }}>{amountNum ? won(amountNum) : '—'}</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}
              disabled={busy || !selected || !amountNum} onClick={submit}>
              {busy ? '등록 중…' : '결제 등록'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
