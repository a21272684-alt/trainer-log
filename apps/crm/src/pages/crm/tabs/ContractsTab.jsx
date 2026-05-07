import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import Modal from '../components/CrmModal'
import { isDurationTicket, calcTicketPeriod } from '../lib/ticketDateCalc'

/*
  DB 마이그레이션 (Supabase SQL Editor에서 1회 실행):
  ────────────────────────────────────────────────────────────────
  ALTER TABLE member_contracts
    ADD COLUMN IF NOT EXISTS gym_product_id UUID REFERENCES gym_products(id),
    ADD COLUMN IF NOT EXISTS processed_by   UUID REFERENCES trainers(id),
    ADD COLUMN IF NOT EXISTS duration_days  INTEGER;   -- 오버라이드 이용 기간(일)

  ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES trainers(id);
  ────────────────────────────────────────────────────────────────
*/

// ── 계약서 종류 ───────────────────────────────────────────────────
const CONTRACT_TYPES = {
  pt:         'PT 계약서',
  group:      '그룹수업 계약서',
  membership: '회원권 계약서',
  package:    '패키지 계약서',
}

// ── 계약서 종류별 기본 약관 텍스트 ───────────────────────────────
// contract_type 변경 시 special_terms textarea에 주입됨
const CONTRACT_TEMPLATES = {
  pt:
`[PT 계약 기본 약관]

1. 환불 규정
   - 수업 시작 전: 결제 금액 전액 환불
   - 수업 시작 후: 잔여 세션 비율 환불 (잔여 횟수 / 총 횟수 × 결제 금액)
   - 환불 신청 시 행정 비용 10%가 차감될 수 있습니다.

2. 노쇼(No-Show) 처리
   - 예약 시간 24시간 전까지 취소하지 않은 경우 세션 1회가 차감됩니다.
   - 연속 3회 노쇼 시 계약이 해지될 수 있습니다.

3. 일시 정지
   - 부상·질병 등 불가피한 사유 발생 시 서면 신청으로 최대 1회 일시 정지 가능합니다.
   - 정지 기간은 계약 기간에 포함되지 않습니다.

4. 위약금: 회원이 정당한 사유 없이 중도 해지 시 잔여 금액의 10%가 위약금으로 발생합니다.

5. 양도: 본 계약은 제3자에게 양도할 수 없습니다.`,

  group:
`[그룹수업 계약 기본 약관]

1. 환불 규정
   - 수업 시작 전: 결제 금액 전액 환불
   - 수업 시작 후: 잔여 횟수 비율 환불 (행정 비용 10% 차감)

2. 결석 처리
   - 수업 시작 2시간 전까지 취소하면 횟수 차감 없음
   - 2시간 이내 취소 또는 미참석 시 해당 횟수는 소멸됩니다.

3. 정원 관리
   - 수업 정원 초과 시 사전 등록 순서를 우선합니다.
   - 만원 수업은 예약 앱을 통해 선착순으로 운영합니다.

4. 유효 기간: 등록일로부터 계약서에 명시된 기간 내에 소진해야 합니다.

5. 위약금: 중도 해지 시 잔여 금액의 10%가 위약금으로 발생합니다.`,

  membership:
`[회원권 계약 기본 약관]

1. 환불 규정
   - 이용 시작 전: 결제 금액 전액 환불
   - 이용 시작 후: 잔여 일수 비율 환불 (행정 비용 10% 차감)
   - 이용 기간의 1/2 경과 후에는 환불이 불가합니다.

2. 일시 정지
   - 연간 최대 30일 일시 정지 신청 가능 (의료 확인서 또는 증빙 서류 필요)
   - 정지 기간만큼 만료일이 자동 연장됩니다.

3. 시설 이용 규칙
   - 운영 시간 이외 입장 불가합니다.
   - 타인에게 피해를 주는 행위 적발 시 이용이 제한될 수 있습니다.

4. 양도: 미이용 회원권에 한해 1회 양도 가능합니다. (양도 수수료 발생 가능)

5. 위약금: 중도 해지 시 잔여 금액의 10%가 위약금으로 발생합니다.`,

  package:
`[패키지 계약 기본 약관]

■ 패키지 구성 내역 (해당 항목에 기재해주세요)
  - 헬스 이용권 : ___개월
  - PT          : ___회
  - 그룹수업    : ___회
  - 락커        : ___개월
  - 기타        : ___________________

1. 환불 규정
   - 패키지 구성 항목별 환불 규정이 각각 독립 적용됩니다.
   - 일부 항목 이용 후 전체 해지 시 미이용 항목 환불 + 이용 항목별 위약금이 적용됩니다.
   - 패키지 할인 혜택은 일부 항목 단독 취소 시 소급 조정될 수 있습니다.

2. 유효 기간
   - 구성 항목별 유효기간이 다른 경우, 각 항목의 만료일을 개별 기준으로 합니다.

3. 양도: 전체 구성 항목이 미이용 상태인 경우에 한하여 1회 양도 가능합니다.

4. 위약금: 중도 해지 시 각 항목 잔여 금액의 합산 기준 10%가 위약금으로 발생합니다.`,
}

// ── 서명 캔버스 ───────────────────────────────────────────────────
function SignatureCanvas({ onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [drawing,    setDrawing]    = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const lastPos = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1e2329'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#e8ecf0'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e, canvas) => {
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return { x:(e.touches[0].clientX - rect.left)*scaleX, y:(e.touches[0].clientY - rect.top)*scaleY }
    }
    return { x:(e.clientX - rect.left)*scaleX, y:(e.clientY - rect.top)*scaleY }
  }

  const startDraw = useCallback((e) => {
    e.preventDefault()
    setDrawing(true)
    lastPos.current = getPos(e, canvasRef.current)
  }, [])

  const draw = useCallback((e) => {
    if (!drawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const pos    = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setHasStrokes(true)
  }, [drawing])

  const stopDraw = useCallback(() => setDrawing(false), [])

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.fillStyle = '#1e2329'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  return (
    <div>
      <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'8px' }}>아래 영역에 서명해주세요</div>
      <canvas
        ref={canvasRef} width={440} height={180}
        style={{ width:'100%', height:'180px', borderRadius:'10px', border:'1px solid var(--border)',
          touchAction:'none', cursor:'crosshair', display:'block' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
        <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={clearCanvas}>초기화</button>
        <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={onCancel}>취소</button>
        <button className="btn btn-primary"   style={{ flex:1, justifyContent:'center' }} disabled={!hasStrokes}
          onClick={() => hasStrokes && onSave(canvasRef.current.toDataURL('image/png'))}>서명 완료</button>
      </div>
    </div>
  )
}

// ── 레이블 + 입력 래퍼 ───────────────────────────────────────────
function Field({ label, required, hint, children }) {
  return (
    <div>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'4px',
        display:'flex', gap:'6px', alignItems:'center' }}>
        {label}{required && <span style={{ color:'var(--red)' }}>*</span>}
        {hint && <span style={{ fontSize:'10px', color:'var(--text-dim)', fontWeight:400 }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
export default function ContractsTab({ gymId, trainers = [], members = [], currentTrainer }) {
  const showToast = useToast()

  const [contracts,   setContracts]   = useState([])
  const [gymProducts, setGymProducts] = useState([])
  const [showForm,    setShowForm]    = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [showSign,    setShowSign]    = useState(false)
  const [signing,     setSigning]     = useState(false)
  const [filter,      setFilter]      = useState('all')

  // ── 폼 초기값 — PT 약관 기본 주입 ───────────────────────────
  const emptyForm = () => ({
    member_id:      '',
    trainer_id:     '',
    contract_type:  'pt',
    gym_product_id: '',
    product_name:   '',
    amount:         '',
    session_count:  '',
    duration_days:  '',
    start_date:     '',
    end_date:       '',
    special_terms:  CONTRACT_TEMPLATES.pt,  // 기본 PT 약관 주입
    processed_by:   currentTrainer?.id || '',
  })
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { loadContracts(); loadProducts() }, [gymId])  // eslint-disable-line

  // member_contracts 테이블 미배포 — DB 호출 차단, 빈 배열 폴백.
  async function loadContracts() {
    setContracts([])
  }

  async function loadProducts() {
    const { data } = await supabase
      .from('gym_products').select('*')
      .eq('gym_id', gymId).eq('is_active', true)
      .order('category').order('name')
    setGymProducts(data || [])
  }

  // ── 계약서 종류 변경 → 약관 텍스트 주입 ─────────────────────
  // 기존 내용이 기본 약관 텍스트와 다르면(직원이 수정한 경우) 덮어쓰기 전 확인
  function handleTypeChange(newType) {
    const currentText   = form.special_terms?.trim() || ''
    const currentTmpl   = CONTRACT_TEMPLATES[form.contract_type]?.trim() || ''
    const newTmpl       = CONTRACT_TEMPLATES[newType] || ''

    const isCustomized  = currentText && currentText !== currentTmpl

    if (isCustomized) {
      const ok = window.confirm(
        '특약 사항에 이미 수정된 내용이 있습니다.\n새 계약서 양식의 기본 약관으로 덮어쓸까요?'
      )
      if (!ok) {
        // 약관 내용은 유지하고 종류만 변경
        setForm(prev => ({ ...prev, contract_type: newType }))
        return
      }
    }
    setForm(prev => ({ ...prev, contract_type: newType, special_terms: newTmpl }))
  }

  // ── 판매 상품 선택 → 가격·횟수·기간 주입 (약관·종류에 영향 없음) ─
  function handleProductSelect(productId) {
    if (!productId) {
      setForm(prev => ({ ...prev, gym_product_id: '' }))
      return
    }
    const product = gymProducts.find(p => p.id === productId)
    if (!product) return
    setForm(prev => ({
      ...prev,
      gym_product_id: productId,
      // 상품명: 비어있을 때만 자동 채움 — 직접 입력한 값 보호
      product_name:   prev.product_name || product.name,
      amount:         product.price         != null ? String(product.price)         : prev.amount,
      session_count:  product.session_limit != null ? String(product.session_limit) : prev.session_count,
      duration_days:  product.duration_days != null ? String(product.duration_days) : prev.duration_days,
      // special_terms, contract_type 절대 건드리지 않음
    }))
  }

  // member_contracts 테이블 미배포 — INSERT 차단, alert 안내.
  async function handleSaveDraft(e) {
    e.preventDefault()
    alert('해당 기능은 준비 중입니다.')
    setShowForm(false)
    setForm(emptyForm())
  }

  // member_contracts 테이블 미배포 — 서명·결제 자동 연동 파이프라인 차단.
  async function handleSign(dataUrl) {
    alert('해당 기능은 준비 중입니다.')
    setShowSign(false)
  }

  // member_contracts 의존 — 비활성.
  async function insertPaymentFromContract(contract) {
    alert('해당 기능은 준비 중입니다.')
  }

  // member_contracts 테이블 미배포 — UPDATE 차단, alert 안내.
  async function handleCancel(id) {
    alert('해당 기능은 준비 중입니다.')
    setSelected(null)
  }

  const filtered = contracts.filter(c => filter === 'all' || c.status === filter)
  const STATUS   = {
    draft:     { label:'초안',     color:'var(--yellow)', bg:'rgba(250,204,21,0.1)'  },
    signed:    { label:'서명 완료', color:'var(--green)',  bg:'rgba(74,222,128,0.1)' },
    cancelled: { label:'취소됨',   color:'var(--red)',    bg:'rgba(248,113,113,0.1)' },
  }

  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <div>
      {/* 필터 + 작성 버튼 */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ display:'flex', gap:'6px' }}>
          {[['all','전체'],['draft','초안'],['signed','서명 완료'],['cancelled','취소']].map(([v,l]) => (
            <button key={v} className={`filter-chip ${filter===v?'active':''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ padding:'6px 14px', fontSize:'12px' }}
          onClick={() => { setShowForm(v=>!v); if (!showForm) setForm(emptyForm()) }}>
          + 계약서 작성
        </button>
      </div>

      {/* ── 계약서 작성 폼 ── */}
      {showForm && (
        <div className="card" style={{ marginBottom:'16px' }}>
          <div className="card-title" style={{ marginBottom:'16px' }}>계약서 작성</div>
          <form onSubmit={handleSaveDraft}>
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

              {/* 1. 계약서 종류 — 먼저 선택하면 약관이 자동 주입됨 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <Field label="계약서 종류" hint="선택 시 기본 약관이 자동 채워집니다">
                  <select className="input" value={form.contract_type}
                    onChange={e => handleTypeChange(e.target.value)}>
                    {Object.entries(CONTRACT_TYPES).map(([k,l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                </Field>

                {/* 2. 판매 상품 — 선택 시 가격·횟수·기간이 자동 채워짐 (약관과 독립) */}
                <Field label="판매 상품" hint="선택 시 하단 금액·횟수·기간이 채워집니다">
                  <select className="input" value={form.gym_product_id}
                    onChange={e => handleProductSelect(e.target.value)}>
                    <option value="">— 상품 선택 (선택 사항) —</option>
                    {gymProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.category}] {p.name}
                        {p.duration_days ? ` · ${p.duration_days}일` : ''}
                        {p.session_limit ? ` · ${p.session_limit}회` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* 3. 회원 / 담당 트레이너 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <Field label="회원" required>
                  <select className="input" value={form.member_id}
                    onChange={e => setForm(v=>({...v, member_id:e.target.value}))}>
                    <option value="">회원 선택</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="담당 트레이너">
                  <select className="input" value={form.trainer_id}
                    onChange={e => setForm(v=>({...v, trainer_id:e.target.value}))}>
                    <option value="">선택 (선택 사항)</option>
                    {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              </div>

              {/* 4. 상품명 (자유 입력 / 상품 선택 시 자동 채워짐) */}
              <Field label="상품명 / 계약 내용">
                <input className="input"
                  placeholder="예: 3개월 PT 20회 패키지 (상품 선택 시 자동 채워짐)"
                  value={form.product_name}
                  onChange={e => setForm(v=>({...v, product_name:e.target.value}))} />
              </Field>

              {/* 5. 금액 / 횟수 / 이용기간 (오버라이드 가능) */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                <Field label="금액 (원)" hint="할인 적용 가능">
                  <input className="input" type="number" min={0} placeholder="예: 300000"
                    value={form.amount}
                    onChange={e => setForm(v=>({...v, amount:e.target.value}))} />
                </Field>
                <Field label="횟수 (회)" hint="횟수권">
                  <input className="input" type="number" min={0} placeholder="예: 20"
                    value={form.session_count}
                    onChange={e => setForm(v=>({...v, session_count:e.target.value}))} />
                </Field>
                <Field label="이용 기간 (일)" hint="기간권">
                  <input className="input" type="number" min={0} placeholder="예: 90"
                    value={form.duration_days}
                    onChange={e => setForm(v=>({...v, duration_days:e.target.value}))} />
                </Field>
              </div>

              {/* 6. 시작일 / 종료일 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <Field label="시작일">
                  <input className="input" type="date" value={form.start_date}
                    onChange={e => setForm(v=>({...v, start_date:e.target.value}))} />
                </Field>
                <Field label="종료일">
                  <input className="input" type="date" value={form.end_date}
                    onChange={e => setForm(v=>({...v, end_date:e.target.value}))} />
                </Field>
              </div>

              {/* 7. 특약 사항 + 약관 — 계약서 종류에 따라 기본값 주입 */}
              <Field label="특약 사항 및 약관" hint="계약서 종류 변경 시 자동 채워집니다 · 직접 수정 가능">
                <textarea className="input"
                  rows={10}
                  placeholder="계약 조건, 환불 규정, 특약 사항 등"
                  value={form.special_terms}
                  onChange={e => setForm(v=>({...v, special_terms:e.target.value}))}
                  style={{ resize:'vertical', minHeight:'160px', fontSize:'12px', lineHeight:1.65,
                    fontFamily:"'DM Mono', 'Noto Sans KR', monospace" }} />
              </Field>

              {/* 8. 결제 담당자 (서명 시 결제 연동에 사용 — 초안 단계엔 선택 가능) */}
              <Field label="결제 담당자" hint="서명 완료 후 결제 자동 등록 시 사용">
                <select className="input" value={form.processed_by}
                  onChange={e => setForm(v=>({...v, processed_by:e.target.value}))}>
                  <option value="">— 담당자 선택 (선택 사항) —</option>
                  {trainers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.id === currentTrainer?.id ? ' (나)' : ''}
                    </option>
                  ))}
                </select>
              </Field>

              {/* 9. 버튼 */}
              <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
                <button type="button" className="btn btn-secondary"
                  style={{ flex:1, justifyContent:'center' }}
                  onClick={() => { setShowForm(false); setForm(emptyForm()) }}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary"
                  style={{ flex:2, justifyContent:'center', opacity: submitting ? 0.6 : 1 }}
                  disabled={submitting}>
                  {submitting
                    ? <><span className="spinner">✦</span> 저장 중…</>
                    : '📄 초안 저장'}
                </button>
              </div>

            </div>
          </form>
        </div>
      )}

      {/* ── 계약서 목록 ── */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-text">계약서가 없어요</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>회원</th>
                <th>계약 내용</th>
                <th>기간</th>
                <th style={{ textAlign:'right' }}>금액</th>
                <th>담당자</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const st = STATUS[c.status] || STATUS.draft
                // 레거시 null → "담당자 미상" fallback
                const processedName = c.processed_trainer?.name ?? '담당자 미상'
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight:600, fontSize:'13px' }}>{c.members?.name || '—'}</div>
                      <div style={{ fontSize:'11px', color:'var(--text-dim)' }}>{c.members?.phone || ''}</div>
                    </td>
                    <td>
                      <div style={{ fontSize:'13px' }}>{c.product_name || '(상품명 없음)'}</div>
                      <div style={{ fontSize:'11px', color:'var(--text-dim)' }}>
                        {CONTRACT_TYPES[c.contract_type] ?? c.contract_type}
                        {c.session_count ? ` · ${c.session_count}회` : ''}
                        {c.duration_days ? ` · ${c.duration_days}일` : ''}
                      </div>
                    </td>
                    <td style={{ fontSize:'11px', color:'var(--text-muted)' }}>
                      {c.start_date || '—'} ~<br />{c.end_date || '—'}
                    </td>
                    <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace",
                      fontSize:'12px', color:'var(--accent)', fontWeight:700 }}>
                      {c.amount ? c.amount.toLocaleString() + '원' : '—'}
                    </td>
                    <td style={{ fontSize:'11px', color:'var(--text-dim)' }}>{processedName}</td>
                    <td><span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span></td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding:'4px 10px', fontSize:'11px' }}
                        onClick={() => setSelected(c)}>상세</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── 계약서 상세 모달 ── */}
      <Modal open={!!selected && !showSign} onClose={() => setSelected(null)} title="계약서 상세" maxWidth="520px">
        {selected && (() => {
          const st            = STATUS[selected.status] || STATUS.draft
          const processedName = selected.processed_trainer?.name ?? '담당자 미상'
          return (
            <div>
              {/* 헤더 요약 */}
              <div style={{ background:'var(--surface2)', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
                  <div>
                    <div style={{ fontSize:'16px', fontWeight:700 }}>
                      {selected.product_name || '(상품명 없음)'}
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--text-dim)', marginTop:'2px' }}>
                      {CONTRACT_TYPES[selected.contract_type] ?? selected.contract_type}
                    </div>
                  </div>
                  <span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span>
                </div>

                {/* 세부 정보 그리드 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px' }}>
                  {[
                    ['회원',        selected.members?.name      || '—'],
                    ['담당 트레이너', selected.trainers?.name     || '—'],
                    ['세션 수',      selected.session_count ? `${selected.session_count}회` : '—'],
                    ['이용 기간',    selected.duration_days ? `${selected.duration_days}일` : '—'],
                    ['금액',         selected.amount ? selected.amount.toLocaleString()+'원' : '—'],
                    ['결제 담당자',   processedName],
                    ['시작일',       selected.start_date || '—'],
                    ['종료일',       selected.end_date   || '—'],
                  ].map(([k,v]) => (
                    <div key={k} style={{ background:'var(--surface3)', borderRadius:'6px', padding:'8px 10px' }}>
                      <div style={{ fontSize:'10px', color:'var(--text-dim)', marginBottom:'2px' }}>{k}</div>
                      <div style={{ fontWeight:500 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* 특약 사항 */}
                {selected.special_terms && (
                  <div style={{ marginTop:'10px', padding:'10px 12px', background:'var(--surface3)',
                    borderRadius:'8px', fontSize:'11px', color:'var(--text-muted)',
                    whiteSpace:'pre-wrap', lineHeight:1.7, maxHeight:'200px', overflowY:'auto' }}>
                    <div style={{ fontSize:'10px', color:'var(--text-dim)', marginBottom:'6px', fontWeight:700 }}>
                      특약 사항 및 약관
                    </div>
                    {selected.special_terms}
                  </div>
                )}
              </div>

              {/* 서명 */}
              {selected.status === 'signed' && selected.signature_url ? (
                <div className="card" style={{ marginBottom:'12px' }}>
                  <div className="card-title">서명</div>
                  <img src={selected.signature_url} alt="서명"
                    style={{ width:'100%', borderRadius:'8px', border:'1px solid var(--border)' }} />
                  <div style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'6px' }}>
                    서명 완료: {selected.signed_at
                      ? new Date(selected.signed_at).toLocaleString('ko-KR') : '—'}
                  </div>
                </div>
              ) : selected.status === 'draft' ? (
                <button className="btn btn-primary"
                  style={{ width:'100%', justifyContent:'center', marginBottom:'8px' }}
                  onClick={() => setShowSign(true)}>
                  ✍️ 서명하기
                </button>
              ) : null}

              {selected.status !== 'cancelled' && (
                <button className="btn btn-secondary"
                  style={{ width:'100%', justifyContent:'center',
                    color:'var(--red)', borderColor:'rgba(248,113,113,0.3)' }}
                  onClick={() => handleCancel(selected.id)}>
                  계약 취소
                </button>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* ── 서명 모달 ── */}
      <Modal open={showSign} onClose={() => setShowSign(false)} title="전자 서명" maxWidth="500px">
        <SignatureCanvas onSave={handleSign} onCancel={() => setShowSign(false)} />
        {signing && (
          <div style={{ textAlign:'center', marginTop:'10px', color:'var(--text-dim)', fontSize:'12px' }}>
            <span className="spinner">✦</span> 서명 저장 중...
          </div>
        )}
      </Modal>
    </div>
  )
}
