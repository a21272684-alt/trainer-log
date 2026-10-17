import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import Modal from '../components/CrmModal'
import { useToast } from '../components/CrmToast'
import { todayStr } from '../lib/ticketDateCalc'
import { EMPTY_FILTERS, matchFilters } from '../lib/memberFilters'
import {
  DEFAULT_SETTINGS, pt, couponBig, couponCond, couponValid, errText, LEDGER_KIND,
} from '../lib/benefits'

// ── 쿠폰·마일리지 ───────────────────────────────────────────────
// 대표 또는 '쿠폰·마일리지 관리' 권한자만 들어오는 탭 (권한 검사는 RPC 가 다시 함).
// 쿠폰: 만들기·수정·사용 중지·회원 발급(개별 / 저장한 세그먼트)
// 마일리지 규칙: 사용 여부·포인트 가치·기본 적립률·최소/최대 사용·유효기간 + 상품별 적립률
// 내역: 적립·사용·쿠폰 발급·환불 되돌림·직접 조정

const mono = { fontFamily: "'DM Mono', monospace" }
const CATEGORIES = ['회원권', '레슨', '대여권', '구독권', '패키지', '일반']
const fmtAt = iso => {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

// ── 쿠폰 만들기·수정 ──────────────────────────────────────────────
const EMPTY_COUPON = {
  name: '', discount_type: 'amount', value: '', max_discount: '', min_amount: '',
  product_scope: 'all', categories: [], product_ids: [], validMode: 'days', valid_days: '30', valid_until: '',
}

function CouponEditor({ open, gymId, coupon, products, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY_COUPON)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = patch => setF(prev => ({ ...prev, ...patch }))

  useEffect(() => {
    if (!open) return
    setError('')
    setF(coupon ? {
      ...EMPTY_COUPON, ...coupon,
      value: String(coupon.value ?? ''), max_discount: coupon.max_discount ? String(coupon.max_discount) : '',
      min_amount: coupon.min_amount ? String(coupon.min_amount) : '',
      validMode: coupon.valid_until ? 'until' : 'days',
      valid_days: coupon.valid_days ? String(coupon.valid_days) : '30', valid_until: coupon.valid_until || '',
    } : EMPTY_COUPON)
  }, [open, coupon?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter(x => x !== v) : [...f[key], v] })

  async function save() {
    setError('')
    const value = Number(f.value)
    if (!f.name.trim()) return setError('쿠폰 이름을 입력해주세요.')
    if (!(value > 0)) return setError('할인 값을 입력해주세요.')
    if (f.discount_type === 'percent' && value > 100) return setError('비율 할인은 100% 이하로 입력해주세요.')
    if (f.product_scope === 'category' && f.categories.length === 0) return setError('적용할 상품 종류를 골라주세요.')
    if (f.product_scope === 'products' && f.product_ids.length === 0) return setError('적용할 상품을 골라주세요.')
    if (f.validMode === 'days' && !(Number(f.valid_days) > 0)) return setError('유효 일수를 입력해주세요.')
    if (f.validMode === 'until' && (!f.valid_until || f.valid_until < todayStr())) return setError('오늘 이후 날짜를 골라주세요.')
    setBusy(true)
    const payload = {
      name: f.name.trim(), discount_type: f.discount_type, value,
      max_discount: f.discount_type === 'percent' && f.max_discount ? Number(f.max_discount) : '',
      min_amount: f.min_amount ? Number(f.min_amount) : 0,
      product_scope: f.product_scope,
      categories: f.product_scope === 'category' ? f.categories : [],
      product_ids: f.product_scope === 'products' ? f.product_ids : [],
      valid_days: f.validMode === 'days' ? Number(f.valid_days) : '',
      valid_until: f.validMode === 'until' ? f.valid_until : '',
    }
    const { error: e } = await supabase.rpc('crm_coupon_save', { p_gym_id: gymId, p_id: coupon?.id ?? null, p: payload })
    setBusy(false)
    if (e) return setError(errText(e))
    onSaved(coupon ? '쿠폰을 수정했어요' : '쿠폰을 만들었어요')
  }

  return (
    <Modal open={open} onClose={onClose} title={coupon ? '쿠폰 수정' : '쿠폰 만들기'} maxWidth="520px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <label className="pay-field">
          <span className="pay-label">쿠폰 이름</span>
          <input className="input" maxLength={60} placeholder="예: 재등록 감사 할인" value={f.name} onChange={e => set({ name: e.target.value })} />
        </label>
        <div>
          <span className="pay-label">할인 방식</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['amount', '금액 할인'], ['percent', '비율 할인']].map(([k, l]) => (
              <button key={k} type="button" className={`filter-chip ${f.discount_type === k ? 'active' : ''}`} onClick={() => set({ discount_type: k })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="bn-grid2">
          <label className="pay-field">
            <span className="pay-label">{f.discount_type === 'percent' ? '할인율 (%)' : '할인 금액 (원)'}</span>
            <input className="input" type="number" min={1} style={mono} value={f.value} onChange={e => set({ value: e.target.value })} />
          </label>
          {f.discount_type === 'percent' ? (
            <label className="pay-field">
              <span className="pay-label">최대 할인 금액 (비우면 제한 없음)</span>
              <input className="input" type="number" min={0} style={mono} value={f.max_discount} onChange={e => set({ max_discount: e.target.value })} />
            </label>
          ) : <span />}
          <label className="pay-field">
            <span className="pay-label">최소 결제 금액 (비우면 조건 없음)</span>
            <input className="input" type="number" min={0} style={mono} value={f.min_amount} onChange={e => set({ min_amount: e.target.value })} />
          </label>
        </div>
        <div>
          <span className="pay-label">적용 상품</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[['all', '전체 상품'], ['category', '상품 종류'], ['products', '특정 상품']].map(([k, l]) => (
              <button key={k} type="button" className={`filter-chip ${f.product_scope === k ? 'active' : ''}`} onClick={() => set({ product_scope: k })}>{l}</button>
            ))}
          </div>
          {f.product_scope === 'category' && (
            <div className="bn-pick">
              {CATEGORIES.map(c => (
                <button key={c} type="button" className={`bn-pick-btn ${f.categories.includes(c) ? 'on' : ''}`} aria-pressed={f.categories.includes(c)} onClick={() => toggle('categories', c)}>{c}</button>
              ))}
            </div>
          )}
          {f.product_scope === 'products' && (
            <div className="bn-pick">
              {products.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>판매 중인 상품이 없어요</span>}
              {products.map(p => (
                <button key={p.id} type="button" className={`bn-pick-btn ${f.product_ids.includes(p.id) ? 'on' : ''}`} aria-pressed={f.product_ids.includes(p.id)} onClick={() => toggle('product_ids', p.id)}>{p.name}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <span className="pay-label">유효기간</span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className={`filter-chip ${f.validMode === 'days' ? 'active' : ''}`} onClick={() => set({ validMode: 'days' })}>발급일부터</button>
            <button type="button" className={`filter-chip ${f.validMode === 'until' ? 'active' : ''}`} onClick={() => set({ validMode: 'until' })}>특정 날짜까지</button>
            {f.validMode === 'days' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <input className="input" type="number" min={1} style={{ ...mono, width: '90px' }} aria-label="유효 일수" value={f.valid_days} onChange={e => set({ valid_days: e.target.value })} />일
              </span>
            ) : (
              <input className="input" type="date" min={todayStr()} style={{ width: '170px' }} aria-label="유효 마감일" value={f.valid_until} onChange={e => set({ valid_until: e.target.value })} />
            )}
          </div>
        </div>
        {error && <div className="pause-error" role="alert">{error}</div>}
        <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '11px' }} disabled={busy} onClick={save}>
          {busy ? '저장 중…' : coupon ? '수정 저장' : '만들기'}
        </button>
      </div>
    </Modal>
  )
}

// ── 쿠폰 발급 (개별 선택 / 저장한 세그먼트) ─────────────────────────
function IssueDialog({ open, gymId, coupon, members, onClose, onIssued }) {
  const [mode, setMode]       = useState('pick')
  const [query, setQuery]     = useState('')
  const [picked, setPicked]   = useState([])
  const [segments, setSegments] = useState([])
  const [segId, setSegId]     = useState('')
  const [stats, setStats]     = useState({})
  const [risk, setRisk]       = useState({})
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!open) return
    setMode('pick'); setQuery(''); setPicked([]); setSegId(''); setError('')
    supabase.from('crm_segments').select('id, name, filters').eq('gym_id', gymId).order('created_at')
      .then(({ data }) => setSegments(data || []))
  }, [open, coupon?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 세그먼트 계산에 필요한 결제·출석 통계와 이탈 점수 (세그먼트 모드에서만)
  useEffect(() => {
    if (!open || mode !== 'segment' || Object.keys(stats).length) return
    supabase.rpc('crm_member_stats', { p_gym_id: gymId }).then(({ data }) => {
      const m = {}; (data || []).forEach(r => { m[r.member_id] = r }); setStats(m)
    })
    if (members.length) {
      supabase.from('member_risk_scores').select('member_id, risk_score').in('member_id', members.map(m => m.id))
        .then(({ data }) => { const m = {}; (data || []).forEach(r => { m[r.member_id] = r }); setRisk(m) })
    }
  }, [open, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim()
  const listed = members.filter(m => !q || (m.name || '').includes(q) || (m.phone || '').replace(/-/g, '').includes(q.replace(/-/g, '')))
  const seg = segments.find(s => s.id === segId)
  const segMembers = useMemo(() => seg
    ? members.filter(m => matchFilters(m, stats[m.id], risk[m.id], { ...EMPTY_FILTERS, ...seg.filters }))
    : [], [seg, members, stats, risk])
  const targets = mode === 'pick' ? picked : segMembers.map(m => m.id)

  async function issue() {
    if (!targets.length) return setError('발급할 회원을 골라주세요.')
    setBusy(true); setError('')
    const { data, error: e } = await supabase.rpc('crm_issue_coupon', { p_coupon_id: coupon.id, p_member_ids: targets })
    setBusy(false)
    if (e) return setError(errText(e))
    onIssued(`${data}명에게 '${coupon.name}' 쿠폰을 발급했어요`)
  }

  return (
    <Modal open={open} onClose={onClose} title={`쿠폰 발급 — ${coupon?.name ?? ''}`} maxWidth="520px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="rev-seg" role="tablist" aria-label="발급 대상 고르는 방법" style={{ alignSelf: 'flex-start' }}>
          <button role="tab" aria-selected={mode === 'pick'} className={mode === 'pick' ? 'on' : ''} onClick={() => setMode('pick')}>회원 직접 선택</button>
          <button role="tab" aria-selected={mode === 'segment'} className={mode === 'segment' ? 'on' : ''} onClick={() => setMode('segment')}>저장한 세그먼트</button>
        </div>
        {mode === 'pick' ? (
          <>
            <input className="input" type="search" placeholder="이름·전화번호 검색" aria-label="회원 검색" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="bn-member-list">
              {listed.length === 0 && <div className="rev-empty">회원이 없어요</div>}
              {listed.map(m => (
                <label key={m.id} className="bn-member">
                  <input type="checkbox" checked={picked.includes(m.id)}
                    onChange={e => setPicked(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))} />
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span style={{ ...mono, fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{m.phone || ''}</span>
                </label>
              ))}
            </div>
          </>
        ) : segments.length === 0 ? (
          <div className="rev-empty">저장한 세그먼트가 없어요. 회원 관리 &gt; 고급 필터에서 조건을 저장하면 여기서 고를 수 있어요.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {segments.map(s => (
                <button key={s.id} type="button" className={`filter-chip ${segId === s.id ? 'active' : ''}`} onClick={() => setSegId(s.id)}>{s.name}</button>
              ))}
            </div>
            {seg && (
              <div className="bn-member-list">
                {segMembers.length === 0 && <div className="rev-empty">조건에 맞는 회원이 없어요</div>}
                {segMembers.map(m => (
                  <div key={m.id} className="bn-member"><span style={{ fontWeight: 600 }}>{m.name}</span>
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{m.phone || ''}</span></div>
                ))}
              </div>
            )}
          </>
        )}
        {error && <div className="pause-error" role="alert">{error}</div>}
        <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '11px' }} disabled={busy || !targets.length} onClick={issue}>
          {busy ? '발급 중…' : `${targets.length}명에게 발급`}
        </button>
      </div>
    </Modal>
  )
}

// ── 쿠폰 목록 ─────────────────────────────────────────────────────
function CouponsView({ gymId, members }) {
  const showToast = useToast()
  const [coupons, setCoupons]   = useState(null)
  const [products, setProducts] = useState([])
  const [editing, setEditing]   = useState(null)   // null | 'new' | coupon
  const [issuing, setIssuing]   = useState(null)

  useEffect(() => { load() }, [gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const [c, p] = await Promise.all([
      supabase.rpc('crm_coupon_list', { p_gym_id: gymId }),
      supabase.from('gym_products').select('id, name, category').eq('gym_id', gymId).eq('is_active', true).order('category').order('name'),
    ])
    setCoupons(c.data || [])
    setProducts(p.data || [])
  }

  async function toggleActive(c) {
    if (c.active && !confirm(`'${c.name}' 쿠폰을 사용 중지할까요?\n새로 발급할 수 없게 돼요. 이미 발급된 쿠폰은 유효기간까지 쓸 수 있어요.`)) return
    const { error } = await supabase.rpc('crm_coupon_save', { p_gym_id: gymId, p_id: c.id, p: { ...c, active: !c.active } })
    if (error) return alert(errText(error))
    showToast?.(c.active ? '사용 중지했어요' : '다시 발급할 수 있어요')
    load()
  }

  const byId = Object.fromEntries(products.map(p => [p.id, p]))
  const issued = (coupons || []).reduce((s, c) => s + Number(c.issued || 0), 0)
  const used   = (coupons || []).reduce((s, c) => s + Number(c.used || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {coupons ? `쿠폰 ${coupons.length}종 · 발급 ${issued}장 · 사용 ${used}장` : ''}
        </span>
        <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={() => setEditing('new')}>+ 쿠폰 만들기</button>
      </div>
      {coupons === null ? <div className="rev-empty">불러오는 중…</div>
        : coupons.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🎟️</div><div className="empty-state-text">아직 만든 쿠폰이 없어요</div></div>
        ) : (
          <div className="bn-coupons">
            {coupons.map(c => {
              const { big, small } = couponBig(c)
              const expired = c.valid_until && c.valid_until < todayStr()
              return (
                <div key={c.id} className={`bn-cp ${!c.active || expired ? 'off' : ''}`}>
                  <div className="bn-cp-l"><span style={{ ...mono, fontSize: '20px', fontWeight: 700, color: '#3F6212' }}>{big}</span><span style={{ fontSize: '11px', color: '#4D6A00' }}>{small}</span></div>
                  <div className="bn-cp-r">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <b style={{ fontSize: '14px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</b>
                      <span style={{ ...mono, fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>발급 {c.issued} · 사용 {c.used}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{couponCond(c, byId)}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {!c.active ? '사용 중지됨' : expired ? '기간 끝남' : couponValid(c)}
                      </span>
                      <span style={{ display: 'flex', gap: '4px' }}>
                        <button className="bn-mini" onClick={() => toggleActive(c)}>{c.active ? '중지' : '다시 사용'}</button>
                        <button className="bn-mini" onClick={() => setEditing(c)}>수정</button>
                        {c.active && !expired && <button className="bn-mini strong" onClick={() => setIssuing(c)}>회원에게 발급</button>}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      <CouponEditor open={!!editing} gymId={gymId} coupon={editing === 'new' ? null : editing} products={products}
        onClose={() => setEditing(null)} onSaved={msg => { setEditing(null); showToast?.(msg); load() }} />
      <IssueDialog open={!!issuing} gymId={gymId} coupon={issuing} members={members}
        onClose={() => setIssuing(null)} onIssued={msg => { setIssuing(null); showToast?.(msg); load() }} />
    </div>
  )
}

// ── 마일리지 규칙 ─────────────────────────────────────────────────
function RulesView({ gymId }) {
  const showToast = useToast()
  const [s, setS]         = useState(null)
  const [rates, setRates] = useState([])
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('crm_benefit_settings', { p_gym_id: gymId }).then(({ data }) => {
      const st = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) }
      setS(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v)])))
      setRates((data?.products || []).map(p => ({ ...p, rate: p.mileage_rate == null ? '' : String(Number(p.mileage_rate)) })))
    })
  }, [gymId])

  if (!s) return <div className="rev-empty">불러오는 중…</div>
  const set = patch => setS(prev => ({ ...prev, ...patch }))

  async function save() {
    setError('')
    const nums = ['point_value', 'default_rate', 'min_use', 'max_use_pct', 'expire_months']
    if (nums.some(k => s[k] === '' || isNaN(Number(s[k])))) return setError('숫자를 모두 입력해주세요.')
    if (Number(s.point_value) <= 0) return setError('1포인트 가치는 0보다 커야 해요.')
    if (Number(s.max_use_pct) > 100) return setError('최대 사용 비율은 100% 이하로 입력해주세요.')
    if (rates.some(r => r.rate !== '' && (isNaN(Number(r.rate)) || Number(r.rate) < 0 || Number(r.rate) > 100))) return setError('상품별 적립률은 0~100% 사이로 입력해주세요.')
    setBusy(true)
    const { error: e } = await supabase.rpc('crm_benefit_settings_save', {
      p_gym_id: gymId,
      p_settings: { enabled: s.enabled, ...Object.fromEntries(nums.map(k => [k, Number(s[k])])) },
      p_rates: rates.map(r => ({ id: r.id, rate: r.rate })),
    })
    setBusy(false)
    if (e) return setError(errText(e))
    showToast?.('마일리지 규칙을 저장했어요')
  }

  const field = (key, label, unit) => (
    <label className="pay-field">
      <span className="pay-label">{label}</span>
      <span className="bn-unit"><input className="input" type="number" min={0} style={mono} value={s[key]} onChange={e => set({ [key]: e.target.value })} /><span>{unit}</span></span>
    </label>
  )

  return (
    <div className="bn-rules">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <b style={{ fontSize: '14px' }}>마일리지 사용 규칙</b>
        <label className="bn-switch">
          <span>마일리지 사용<span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>끄면 적립도 사용도 멈춰요 (보유분은 유지)</span></span>
          <input type="checkbox" checked={!!s.enabled} onChange={e => set({ enabled: e.target.checked })} />
        </label>
        <div className="bn-grid2">
          {field('point_value', '1포인트 가치', '원')}
          {field('default_rate', '센터 기본 적립률', '%')}
          {field('min_use', '최소 사용 포인트', 'P')}
          {field('max_use_pct', '1회 최대 사용 (결제액의)', '%')}
          <label className="pay-field">
            <span className="pay-label">유효기간 (적립일부터)</span>
            <select className="input" value={s.expire_months} onChange={e => set({ expire_months: e.target.value })}>
              {[['6', '6개월'], ['12', '1년'], ['24', '2년'], ['36', '3년'], ['0', '소멸 없음']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!['6', '12', '24', '36', '0'].includes(String(s.expire_months)) && <option value={s.expire_months}>{s.expire_months}개월</option>}
            </select>
          </label>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          유효기간을 바꾸면 이후 적립분부터 적용돼요. 사용할 때는 소멸이 가까운 포인트부터 차감돼요.
        </div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <b style={{ fontSize: '14px' }}>상품별 적립률</b>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>비워두면 센터 기본 적립률({s.default_rate || 0}%)을 따라요. 0을 넣으면 적립하지 않아요.</div>
        {rates.length === 0 && <div className="rev-empty">판매 중인 상품이 없어요</div>}
        <div className="bn-rates">
          {rates.map((r, i) => (
            <div key={r.id} className="bn-rate">
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '6px' }}>{r.category}</span>{r.name}
              </span>
              <span className="bn-unit" style={{ width: '96px' }}>
                <input className="input" type="number" min={0} max={100} step="0.5" placeholder={String(s.default_rate || 0)} style={{ ...mono, textAlign: 'right' }}
                  aria-label={`${r.name} 적립률`} value={r.rate}
                  onChange={e => setRates(prev => prev.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                <span>%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bn-rules-foot">
        {error && <div className="pause-error" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '규칙 저장'}</button>
      </div>
    </div>
  )
}

// ── 내역 ─────────────────────────────────────────────────────────
function LedgerView({ gymId }) {
  const [rows, setRows] = useState(null)
  const [kind, setKind] = useState('')
  useEffect(() => {
    supabase.rpc('crm_benefit_ledger', { p_gym_id: gymId }).then(({ data }) => setRows(data || []))
  }, [gymId])

  const KINDS = [['', '전체'], ['earn', '적립'], ['use', '사용'], ['coupon_issue', '쿠폰 발급'], ['refund', '환불 되돌림'], ['adjust', '직접 조정']]
  const shown = (rows || []).filter(r => !kind || (kind === 'refund' ? r.kind.startsWith('refund') : r.kind === kind))

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {KINDS.map(([k, l]) => <button key={k} className={`filter-chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      {rows === null ? <div className="rev-empty">불러오는 중…</div>
        : shown.length === 0 ? <div className="rev-empty">내역이 없어요</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>일시</th><th>회원</th><th>내용</th><th style={{ textAlign: 'right' }}>변동</th><th>처리</th></tr></thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...mono, fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtAt(r.at)}</td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.member}</td>
                    <td style={{ fontSize: '12px' }}>{LEDGER_KIND[r.kind]}{r.memo ? ` · ${r.memo}` : ''}</td>
                    <td style={{ ...mono, textAlign: 'right', whiteSpace: 'nowrap', color: r.delta > 0 ? '#3F6212' : r.delta < 0 ? '#B42318' : 'var(--text-muted)' }}>
                      {r.kind === 'coupon_issue' ? '쿠폰 1장' : (r.delta > 0 ? '+' : r.delta < 0 ? '−' : '') + pt(Math.abs(r.delta))}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.by || '자동'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

export default function BenefitsTab({ gymId, members = [] }) {
  const [view, setView] = useState('coupon')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="rev-seg" role="tablist" aria-label="쿠폰·마일리지 보기" style={{ alignSelf: 'flex-start' }}>
        {[['coupon', '쿠폰'], ['rule', '마일리지 규칙'], ['log', '내역']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>
      {view === 'coupon' && <CouponsView gymId={gymId} members={members} />}
      {view === 'rule'   && <RulesView gymId={gymId} />}
      {view === 'log'    && <LedgerView gymId={gymId} />}
    </div>
  )
}

