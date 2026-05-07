import { useState, useEffect, useRef } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import Modal from '../components/CrmModal'

// ── 카테고리 정의 ──────────────────────────────────────────────
const CATEGORIES = [
  { key: '회원권', label: '회원권',     color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  border: 'rgba(96,165,250,0.3)'  },
  { key: '레슨',   label: '레슨 / PT', color: '#fb923c', bg: 'rgba(251,146,60,0.15)',  border: 'rgba(251,146,60,0.3)'  },
  { key: '대여권', label: '대여권',     color: '#4ade80', bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.3)'  },
  { key: '구독권', label: '구독권',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.15)',  border: 'rgba(45,212,191,0.3)'  },
  { key: '패키지', label: '패키지',     color: '#c084fc', bg: 'rgba(192,132,252,0.15)', border: 'rgba(192,132,252,0.3)' },
  { key: '일반',   label: '일반 상품', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)' },
]

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))
const mono = { fontFamily: "'DM Mono', monospace" }

// payment_prices JSONB ↔ 폼 상태 변환 헬퍼
function pricesFromProduct(p) {
  const pp = p.payment_prices || {}
  return {
    price_cash:            String(p.price_cash ?? ''),
    price_card:            String(p.price_card ?? ''),
    price_transfer:        String(pp.transfer ?? ''),
    local_currency_items:  (pp.local_currency || []).map(i => ({ label: i.label, price: String(i.price) })),
    payments_items:        (pp.payments       || []).map(i => ({ label: i.label, price: String(i.price) })),
  }
}

const EMPTY_FORM = {
  name: '',
  category: '회원권',
  // 결제 수단별 가격
  price_cash:           '',
  price_card:           '',
  price_transfer:       '',     // 계좌이체
  local_currency_items: [],     // [{ label, price }]  지역화폐 항목
  payments_items:       [],     // [{ label, price }]  페이먼츠 항목
  // 이용 조건
  duration_days: '',
  session_limit:  '',
  // 옵션
  is_income_deductible: false,
  is_active:            true,
  description:          '',
}

// ── 결제 수단 확장 아이템 행 ────────────────────────────────────
function ExtendablePaymentRow({ label, color, items, onAddItem, onChangeItem, onRemoveItem }) {
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding]     = useState(false)

  function confirmAdd() {
    if (!newLabel.trim()) return
    onAddItem(newLabel.trim())
    setNewLabel('')
    setAdding(false)
  }

  return (
    <div style={{ marginBottom: '4px' }}>
      {/* 섹션 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', minWidth: '64px' }}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => setAdding(a => !a)}
          style={{
            display: 'flex', alignItems: 'center', gap: '3px',
            background: adding ? `${color}20` : 'none',
            border: `1px solid ${adding ? color : 'var(--border)'}`,
            borderRadius: '5px', padding: '2px 7px', fontSize: '10px',
            color: adding ? color : 'var(--text-dim)',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          {adding ? '✕ 닫기' : '+ 항목 추가'}
        </button>
      </div>

      {/* 신규 항목 입력 */}
      {adding && (
        <div style={{
          display: 'flex', gap: '6px', alignItems: 'center',
          background: `${color}08`, border: `1px solid ${color}30`,
          borderRadius: '8px', padding: '8px 10px', marginBottom: '6px',
        }}>
          <input
            className="input"
            style={{ flex: 1, padding: '5px 8px', fontSize: '12px' }}
            placeholder={`${label} 종류 입력 (예: 카카오페이)`}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), confirmAdd())}
            autoFocus
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '5px 10px', fontSize: '11px', flexShrink: 0 }}
            onClick={confirmAdd}
          >추가</button>
        </div>
      )}

      {/* 추가된 항목 목록 */}
      {items.map((item, idx) => (
        <div key={idx} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          marginBottom: '5px', paddingLeft: '8px',
        }}>
          <span style={{ fontSize: '10px', color: color, marginRight: '2px' }}>└</span>
          <span style={{
            fontSize: '11px', color: 'var(--text-muted)',
            minWidth: '88px', background: `${color}10`,
            border: `1px solid ${color}25`, borderRadius: '5px',
            padding: '3px 8px',
          }}>
            {item.label}
          </span>
          <input
            className="input"
            type="number"
            min="0"
            placeholder="0"
            value={item.price}
            onChange={e => onChangeItem(idx, e.target.value)}
            style={{ flex: 1, padding: '5px 8px', fontSize: '12px', textAlign: 'right' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', flexShrink: 0 }}>원</span>
          <button
            type="button"
            onClick={() => onRemoveItem(idx)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-dim)',
              cursor: 'pointer', fontSize: '13px', padding: '2px 5px', borderRadius: '4px',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
          >✕</button>
        </div>
      ))}
    </div>
  )
}

// ── 상품 등록/수정 폼 ──────────────────────────────────────────
function ProductForm({ form, setForm }) {
  const f = key => ({
    value: form[key],
    onChange: e => setForm(v => ({ ...v, [key]: e.target.value })),
  })

  // 지역화폐 항목 조작
  const lcAdd    = label => setForm(v => ({ ...v, local_currency_items: [...v.local_currency_items, { label, price: '' }] }))
  const lcChange = (idx, price) => setForm(v => {
    const arr = [...v.local_currency_items]; arr[idx] = { ...arr[idx], price }; return { ...v, local_currency_items: arr }
  })
  const lcRemove = idx => setForm(v => ({ ...v, local_currency_items: v.local_currency_items.filter((_,i) => i !== idx) }))

  // 페이먼츠 항목 조작
  const pmAdd    = label => setForm(v => ({ ...v, payments_items: [...v.payments_items, { label, price: '' }] }))
  const pmChange = (idx, price) => setForm(v => {
    const arr = [...v.payments_items]; arr[idx] = { ...arr[idx], price }; return { ...v, payments_items: arr }
  })
  const pmRemove = idx => setForm(v => ({ ...v, payments_items: v.payments_items.filter((_,i) => i !== idx) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── 카테고리 ── */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>카테고리 *</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.key} type="button"
              onClick={() => setForm(v => ({ ...v, category: cat.key }))}
              style={{
                padding: '5px 12px', borderRadius: '20px', border: '1px solid',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background:   form.category === cat.key ? cat.bg    : 'none',
                color:        form.category === cat.key ? cat.color : 'var(--text-muted)',
                borderColor:  form.category === cat.key ? cat.color : 'var(--border)',
                transition:   'all 0.15s',
              }}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 상품명 ── */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>상품명 *</label>
        <input className="input" placeholder="예: 3개월 회원권, 1:1 PT 10회" {...f('name')} />
      </div>

      {/* ── 이용기간 + 입장횟수 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>이용기간 (일)</label>
          <input className="input" type="number" min="1" placeholder="비워두면 무제한" {...f('duration_days')} />
        </div>
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>입장횟수 (회)</label>
          <input className="input" type="number" min="1" placeholder="비워두면 무제한" {...f('session_limit')} />
        </div>
      </div>

      {/* ── 결제 수단별 가격 ── */}
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '10px' }}>
          결제 수단별 가격
        </div>
        <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* 현금 / 카드 / 계좌이체 — 단일 가격 행 */}
          {[
            ['현금',     'price_cash',     '#c8f135'],
            ['카드',     'price_card',     '#60a5fa'],
            ['계좌이체', 'price_transfer', '#4ade80'],
          ].map(([label, key, color]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 600,
                color: 'var(--text-muted)', minWidth: '64px',
                background: `${color}12`, border: `1px solid ${color}25`,
                borderRadius: '5px', padding: '3px 8px', textAlign: 'center',
              }}>
                {label}
              </span>
              <input
                className="input"
                type="number"
                min="0"
                placeholder="0"
                value={form[key]}
                onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
                style={{ flex: 1, textAlign: 'right' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', flexShrink: 0 }}>원</span>
            </div>
          ))}

          {/* 구분선 */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          {/* 지역화폐 — 확장 가능 */}
          <ExtendablePaymentRow
            label="지역화폐"
            color="#2dd4bf"
            items={form.local_currency_items}
            onAddItem={lcAdd}
            onChangeItem={lcChange}
            onRemoveItem={lcRemove}
          />

          {/* 페이먼츠 — 확장 가능 */}
          <ExtendablePaymentRow
            label="페이먼츠"
            color="#a78bfa"
            items={form.payments_items}
            onAddItem={pmAdd}
            onChangeItem={pmChange}
            onRemoveItem={pmRemove}
          />
        </div>
      </div>

      {/* ── 옵션 체크박스 ── */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {[
          ['is_income_deductible', '소득공제 적용'],
          ['is_active',            '판매 중 (활성)'],
        ].map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={form[key]}
              onChange={e => setForm(v => ({ ...v, [key]: e.target.checked }))}
              style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }}
            />
            {label}
          </label>
        ))}
      </div>

      {/* ── 메모 ── */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>메모 / 설명</label>
        <textarea
          className="input"
          rows={2}
          placeholder="상품 설명, 내부 메모 등"
          value={form.description}
          onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
          style={{ resize: 'vertical' }}
        />
      </div>
    </div>
  )
}

// ── 상품 카드 ──────────────────────────────────────────────────
function ProductCard({ product, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const cat = CAT_MAP[product.category] ?? CAT_MAP['일반']

  useEffect(() => {
    function handleClick(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const duration = product.duration_days ? `${product.duration_days}일` : '무제한'
  const sessions = product.session_limit  ? `${product.session_limit}회` : '무제한'
  const pp = product.payment_prices || {}

  // 설정된 결제 수단 목록 (카드에 표시용 요약)
  const paymentSummary = [
    product.price_cash  ? '현금'     : null,
    product.price_card  ? '카드'     : null,
    pp.transfer         ? '계좌이체' : null,
    (pp.local_currency?.length > 0) ? '지역화폐' : null,
    (pp.payments?.length > 0)       ? '페이먼츠' : null,
  ].filter(Boolean)

  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '14px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        opacity: product.is_active ? 1 : 0.5,
        position: 'relative', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = cat.color}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* 카테고리 배지 + 메뉴 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px',
          background: cat.bg, color: cat.color, border: `1px solid ${cat.border}`,
        }}>
          {product.category}
        </span>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}
          >⋯</button>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 50,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '4px', minWidth: '100px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              {[
                { label: '✏️ 편집', color: 'var(--text)',   hoverBg: 'var(--surface3)',             action: () => { setMenuOpen(false); onEdit(product) } },
                { label: '🗑 삭제', color: 'var(--red)',    hoverBg: 'rgba(248,113,113,0.08)',      action: () => { setMenuOpen(false); onDelete(product) } },
              ].map(({ label, color, hoverBg, action }) => (
                <button key={label} onClick={action}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color, fontSize: '12px', padding: '7px 10px', cursor: 'pointer', borderRadius: '5px' }}
                  onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >{label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상품명 */}
      <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.3, minHeight: '36px' }}>
        {product.name}
        {!product.is_active && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-dim)', fontWeight: 400 }}>[판매중단]</span>}
      </div>

      {/* 이용 조건 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
        {[['이용기간', duration], ['입장횟수', sessions]].map(([l, v]) => (
          <div key={l} style={{ background: 'var(--surface2)', borderRadius: '6px', padding: '5px 8px' }}>
            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '2px' }}>{l}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, ...mono }}>{v}</div>
          </div>
        ))}
      </div>

      {/* 가격 — 현금 메인, 나머지 요약 */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>현금</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: cat.color, ...mono }}>
            {Number(product.price_cash).toLocaleString()}원
          </span>
        </div>
        {product.price_card > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>카드</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', ...mono }}>{Number(product.price_card).toLocaleString()}원</span>
          </div>
        )}
        {pp.transfer > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>계좌이체</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', ...mono }}>{Number(pp.transfer).toLocaleString()}원</span>
          </div>
        )}
        {/* 지역화폐 항목 */}
        {(pp.local_currency || []).map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
            <span style={{ fontSize: '10px', color: '#2dd4bf' }}>지역화폐 · {item.label}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', ...mono }}>{Number(item.price).toLocaleString()}원</span>
          </div>
        ))}
        {/* 페이먼츠 항목 */}
        {(pp.payments || []).map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
            <span style={{ fontSize: '10px', color: '#a78bfa' }}>페이먼츠 · {item.label}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', ...mono }}>{Number(item.price).toLocaleString()}원</span>
          </div>
        ))}
      </div>

      {/* 소득공제 + 결제수단 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
        <span style={{ fontSize: '10px', color: product.is_income_deductible ? 'var(--green)' : 'var(--text-dim)' }}>
          {product.is_income_deductible ? '✓ 소득공제' : '소득공제 해당없음'}
        </span>
        {paymentSummary.length > 2 && (
          <span style={{ fontSize: '9px', color: 'var(--text-dim)', background: 'var(--surface2)', borderRadius: '4px', padding: '2px 5px' }}>
            {paymentSummary.length}가지 결제
          </span>
        )}
      </div>
    </div>
  )
}

// ── 메인 상품 관리 탭 ──────────────────────────────────────────
export default function ProductsTab({ gymId }) {
  const showToast   = useToast()
  const [products,     setProducts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [catFilter,    setCatFilter]    = useState('전체')
  const [search,       setSearch]       = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [noTable,      setNoTable]      = useState(false)

  useEffect(() => { if (gymId) load() }, [gymId])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('gym_products')
      .select('*')
      .eq('gym_id', gymId)
      .order('category')
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('gym_products')) setNoTable(true)
      setLoading(false)
      return
    }
    setProducts(data || [])
    setNoTable(false)
    setLoading(false)
  }

  function openNew() {
    setEditTarget(null)
    setForm({ ...EMPTY_FORM, local_currency_items: [], payments_items: [] })
    setShowModal(true)
  }

  function openEdit(product) {
    setEditTarget(product)
    setForm({
      name:                 product.name,
      category:             product.category,
      duration_days:        product.duration_days ? String(product.duration_days) : '',
      session_limit:        product.session_limit  ? String(product.session_limit)  : '',
      is_income_deductible: product.is_income_deductible,
      is_active:            product.is_active,
      description:          product.description || '',
      ...pricesFromProduct(product),
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim())      { showToast('상품명을 입력해주세요'); return }
    if (form.price_cash === '') { showToast('현금가를 입력해주세요'); return }

    setSaving(true)

    // payment_prices JSONB 구성
    const payment_prices = {
      transfer:       form.price_transfer !== '' ? Number(form.price_transfer) : null,
      local_currency: form.local_currency_items
        .filter(i => i.label)
        .map(i => ({ label: i.label, price: Number(i.price) || 0 })),
      payments: form.payments_items
        .filter(i => i.label)
        .map(i => ({ label: i.label, price: Number(i.price) || 0 })),
    }

    const payload = {
      gym_id:               gymId,
      name:                 form.name.trim(),
      category:             form.category,
      price_cash:           Number(form.price_cash) || 0,
      price_card:           form.price_card !== '' ? Number(form.price_card) : Number(form.price_cash) || 0,
      duration_days:        form.duration_days !== '' ? Number(form.duration_days) : null,
      session_limit:        form.session_limit  !== '' ? Number(form.session_limit)  : null,
      is_income_deductible: form.is_income_deductible,
      is_active:            form.is_active,
      description:          form.description || null,
      payment_prices,
    }

    let error
    if (editTarget) {
      ;({ error } = await supabase.from('gym_products').update(payload).eq('id', editTarget.id))
    } else {
      ;({ error } = await supabase.from('gym_products').insert(payload))
    }

    setSaving(false)
    if (error) { showToast('저장 오류: ' + error.message); return }
    showToast(editTarget ? '✓ 상품이 수정됐어요' : '✓ 상품이 등록됐어요')
    setShowModal(false)
    await load()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const targetId = deleteTarget.id
    const { error } = await supabase.from('gym_products').delete().eq('id', targetId)
    if (error) { showToast('삭제 오류: ' + error.message); return }
    // 모달 닫기 + 로컬 상태에서 즉시 제거 (재조회 없이 즉각 반영)
    setDeleteTarget(null)
    setProducts(prev => prev.filter(p => p.id !== targetId))
    showToast('✓ 상품이 삭제됐어요')
  }

  const filtered = products
    .filter(p => catFilter === '전체' || p.category === catFilter)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  const countByCategory = Object.fromEntries(
    CATEGORIES.map(c => [c.key, products.filter(p => p.category === c.key).length])
  )

  // ── 테이블 미생성 안내 ──────────────────────────────────────
  if (noTable) {
    return (
      <div style={{ maxWidth: '640px' }}>
        <div style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.25)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '20px', marginBottom: '10px' }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>gym_products 테이블이 아직 없어요</div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '16px' }}>
            Supabase 대시보드 → SQL Editor에서 아래 SQL을 실행한 뒤 새로고침해주세요.
          </div>
          <pre style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', fontSize: '11px', color: 'var(--text-muted)', overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
{`CREATE TABLE IF NOT EXISTS gym_products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id               UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL DEFAULT '회원권'
    CHECK (category IN ('회원권','레슨','대여권','구독권','패키지','일반')),
  price_cash           INTEGER NOT NULL DEFAULT 0,
  price_card           INTEGER NOT NULL DEFAULT 0,
  payment_prices       JSONB DEFAULT '{}',
  duration_days        INTEGER DEFAULT NULL,
  session_limit        INTEGER DEFAULT NULL,
  is_income_deductible BOOLEAN NOT NULL DEFAULT false,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  description          TEXT DEFAULT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE gym_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON gym_products USING (true) WITH CHECK (true);
CREATE INDEX ON gym_products(gym_id, category);`}
          </pre>
          <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={load}>🔄 다시 확인</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 툴바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '280px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
          <input className="input" style={{ paddingLeft: '32px' }} placeholder="상품명 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{filtered.length}개 상품</span>
          <button className="btn btn-primary" onClick={openNew}>+ 상품 등록</button>
        </div>
      </div>

      {/* 카테고리 필터 탭 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button className={`filter-chip ${catFilter === '전체' ? 'active' : ''}`} onClick={() => setCatFilter('전체')}>
          전체 <span style={{ opacity: 0.7, marginLeft: '3px' }}>({products.length})</span>
        </button>
        {CATEGORIES.map(cat => (
          <button key={cat.key} onClick={() => setCatFilter(cat.key)}
            style={{
              padding: '5px 12px', borderRadius: '20px', border: '1px solid',
              fontSize: '12px', fontWeight: catFilter === cat.key ? 700 : 400,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              background:  catFilter === cat.key ? cat.bg    : 'none',
              color:       catFilter === cat.key ? cat.color : 'var(--text-muted)',
              borderColor: catFilter === cat.key ? cat.color : 'var(--border)',
            }}>
            {cat.label}
            {countByCategory[cat.key] > 0 && <span style={{ opacity: 0.7, marginLeft: '3px' }}>({countByCategory[cat.key]})</span>}
          </button>
        ))}
      </div>

      {/* 로딩 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          <span className="spinner" style={{ fontSize: '24px', display: 'block', marginBottom: '10px' }}>✦</span>
          상품 목록을 불러오는 중...
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-text" style={{ marginBottom: '16px' }}>
            {search ? `"${search}" 검색 결과가 없어요` : '등록된 상품이 없어요'}
          </div>
          {!search && <button className="btn btn-primary" onClick={openNew}>+ 첫 상품 등록</button>}
        </div>
      )}

      {/* 상품 카드 그리드 */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onEdit={openEdit} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {/* 등록/수정 모달 */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTarget ? '상품 수정' : '새 상품 등록'} maxWidth="540px">
        <ProductForm form={form} setForm={setForm} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowModal(false)}>취소</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : editTarget ? '수정 완료' : '등록'}
          </button>
        </div>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="상품 삭제" maxWidth="360px">
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
          <strong style={{ color: 'var(--text)' }}>{deleteTarget?.name}</strong> 상품을 삭제할까요?<br />
          삭제된 상품은 복구할 수 없어요.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDeleteTarget(null)}>취소</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--red)', color: '#fff' }} onClick={handleDelete}>삭제</button>
        </div>
      </Modal>
    </div>
  )
}
