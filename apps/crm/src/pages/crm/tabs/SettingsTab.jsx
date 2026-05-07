import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import Modal from '../components/CrmModal'
import GymRankManager from '../components/GymRankManager'
import StaffPayrollTab from './StaffPayrollTab'

// sessionStorage 기반 탭 상태 — 리마운트 시에도 탭 위치 유지
function useSessionTab(storageKey, defaultVal) {
  const [val, setVal] = useState(() => {
    try { const s = sessionStorage.getItem(storageKey); return s || defaultVal }
    catch { return defaultVal }
  })
  const save = useCallback((v) => {
    setVal(v)
    try { sessionStorage.setItem(storageKey, v) } catch {}
  }, [storageKey])
  return [val, save]
}

const mono = { fontFamily: "'DM Mono', monospace" }

// ── 공용 서브탭 바 ────────────────────────────────────────────────
function SubTabBar({ tabs, active, onChange, variant = 'pill' }) {
  if (variant === 'underline') {
    return (
      <div style={{
        display: 'flex', gap: '0', marginBottom: '24px',
        borderBottom: '1px solid var(--border)',
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            padding: '9px 18px', border: 'none', borderBottom: '2px solid',
            borderBottomColor: active === t.key ? 'var(--accent)' : 'transparent',
            background: 'none', color: active === t.key ? 'var(--accent)' : 'var(--text-dim)',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s', marginBottom: '-1px',
          }}>
            {t.icon && <span style={{ marginRight: '5px' }}>{t.icon}</span>}
            {t.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div style={{
      display: 'inline-flex', gap: '3px', marginBottom: '24px',
      background: 'var(--surface)', borderRadius: '12px',
      padding: '4px', border: '1px solid var(--border)',
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '7px 18px', borderRadius: '9px', border: 'none',
          fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          background: active === t.key ? 'var(--surface3)' : 'none',
          color: active === t.key ? 'var(--text)' : 'var(--text-dim)',
          boxShadow: active === t.key ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
          transition: 'all 0.15s',
        }}>
          {t.icon && <span style={{ marginRight: '5px' }}>{t.icon}</span>}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── 직급 · 고용형태 · 대관 계약 · PT 수당 편집 모달 ─────────────
function RankEditModal({ trainer, gymRanks, onClose, onSaved }) {
  const showToast  = useToast()
  const sc0        = trainer.settlement_config   // 기존 DB 값 shorthand

  const [rankId,     setRankId]     = useState(trainer.gym_rank_id || '')
  const [customRate, setCustomRate] = useState(
    trainer.incentive_rate != null ? String(Math.round(trainer.incentive_rate * 100)) : ''
  )
  const [empType,   setEmpType]   = useState(trainer.employment_type || '')

  // 대관 전용 설정
  const [rentalCfg, setRentalCfg] = useState({
    payment_managed_by: sc0?.payment_managed_by || 'self',
    rental_fee_type:    sc0?.rental_fee_type    || 'fixed',
    rental_fee_amount:  sc0?.rental_fee_amount  || 0,
  })

  // PT 수당 · 커미션 설정 (모든 고용형태 공통)
  const [ptCfg, setPtCfg] = useState({
    pt_calc_type:          sc0?.pt_calc_type          || 'ratio',
    pt_value:              sc0?.pt_value          != null ? String(sc0.pt_value)              : '',
    sales_commission_rate: sc0?.sales_commission_rate != null ? String(sc0.sales_commission_rate) : '',
    noshow_payout_rate:    sc0?.noshow_payout_rate    != null ? String(sc0.noshow_payout_rate)    : '',
    deduct_card_fee:       sc0?.deduct_card_fee       || false,
    card_fee_rate:         sc0?.card_fee_rate     != null ? String(sc0.card_fee_rate)         : '',
  })

  const [saving, setSaving] = useState(false)
  const selectedRank = gymRanks.find(r => r.id === rankId)
  const isRatio      = ptCfg.pt_calc_type === 'ratio'

  async function handleSave() {
    setSaving(true)
    const sc = {
      // 대관 설정 (rental 시만 포함)
      ...(empType === 'rental' ? rentalCfg : {}),
      // PT 수당 · 커미션 (전 고용형태 공통 저장)
      pt_calc_type:          ptCfg.pt_calc_type,
      pt_value:              ptCfg.pt_value              !== '' ? Number(ptCfg.pt_value)              : null,
      sales_commission_rate: ptCfg.sales_commission_rate !== '' ? Number(ptCfg.sales_commission_rate) : null,
      noshow_payout_rate:    ptCfg.noshow_payout_rate    !== '' ? Number(ptCfg.noshow_payout_rate)    : null,
      deduct_card_fee:       ptCfg.deduct_card_fee,
      card_fee_rate:         (ptCfg.deduct_card_fee && ptCfg.card_fee_rate !== '')
                               ? Number(ptCfg.card_fee_rate) : null,
    }
    const { error } = await supabase.from('trainers').update({
      gym_rank_id:       rankId || null,
      employment_type:   empType || null,
      incentive_rate:    customRate !== '' ? Number(customRate) / 100
                         : selectedRank ? selectedRank.default_incentive_rate : null,
      settlement_config: sc,
    }).eq('id', trainer.id)
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 저장 완료')
    onSaved(); onClose()
  }

  // ── 공용 인풋 레이블 ──────────────────────────────────────────────
  function FieldLabel({ children, hint }) {
    return (
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>
        {children}
        {hint && <span style={{ fontWeight: 400, color: 'var(--text-dim)', marginLeft: '4px' }}>{hint}</span>}
      </div>
    )
  }

  return (
    <div>
      {/* ── 직급 ── */}
      <div style={{ marginBottom: '16px' }}>
        <FieldLabel>직급</FieldLabel>
        {gymRanks.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
            등록된 직급이 없어요. 직급 관리에서 먼저 추가하세요.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button onClick={() => setRankId('')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${rankId === '' ? 'var(--accent)' : 'var(--border)'}`,
                background: rankId === '' ? 'rgba(200,241,53,0.08)' : 'var(--surface2)' }}>
              <span style={{ fontSize: '13px', color: rankId === '' ? 'var(--accent)' : 'var(--text-muted)' }}>미설정</span>
              {rankId === '' && <span style={{ color: 'var(--accent)' }}>✓</span>}
            </button>
            {gymRanks.map(r => (
              <button key={r.id} onClick={() => setRankId(r.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  border: `1px solid ${rankId === r.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: rankId === r.id ? 'rgba(200,241,53,0.08)' : 'var(--surface2)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: rankId === r.id ? 'var(--accent)' : 'var(--text)' }}>{r.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    기본급 {Number(r.base_salary).toLocaleString()}원 · 인센티브 {Math.round(r.default_incentive_rate * 100)}%
                  </div>
                </div>
                {rankId === r.id && <span style={{ color: 'var(--accent)', fontSize: '12px' }}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 고용 형태 ── */}
      <div style={{ marginBottom: empType === 'rental' ? '12px' : '16px' }}>
        <FieldLabel>고용 형태</FieldLabel>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[['employee', '정직원'], ['freelance', '프리랜서'], ['rental', '대관'], ['', '미설정']].map(([v, l]) => (
            <button key={v} onClick={() => setEmpType(v)}
              style={{ flex: 1, minWidth: '60px', padding: '8px 6px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${empType === v ? (v === 'rental' ? 'rgba(250,204,21,0.6)' : 'var(--accent)') : 'var(--border)'}`,
                background: empType === v ? (v === 'rental' ? 'rgba(250,204,21,0.1)' : 'rgba(200,241,53,0.08)') : 'var(--surface2)',
                color: empType === v ? (v === 'rental' ? 'var(--yellow)' : 'var(--accent)') : 'var(--text-muted)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── 대관 계약 설정 (rental 선택 시만) ── */}
      {empType === 'rental' && (
        <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '10px',
          border: '1px solid rgba(250,204,21,0.25)', background: 'rgba(250,204,21,0.05)' }}>
          <div style={{ fontSize: '11px', color: 'var(--yellow)', fontWeight: 700, marginBottom: '12px' }}>🏢 대관 계약 설정</div>
          <div style={{ marginBottom: '10px' }}>
            <FieldLabel>결제 주체</FieldLabel>
            <select className="input" value={rentalCfg.payment_managed_by}
              onChange={e => setRentalCfg(c => ({ ...c, payment_managed_by: e.target.value }))}>
              <option value="self">독립 결제 — 트레이너가 직접 수령</option>
              <option value="center">위탁 결제 — 센터가 수령 후 정산</option>
            </select>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <FieldLabel>대관료 방식</FieldLabel>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[['fixed', '월 고정액'], ['per_session', '수업 건별']].map(([v, l]) => (
                <button key={v} onClick={() => setRentalCfg(c => ({ ...c, rental_fee_type: v }))}
                  style={{ flex: 1, padding: '7px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${rentalCfg.rental_fee_type === v ? 'rgba(250,204,21,0.5)' : 'var(--border)'}`,
                    background: rentalCfg.rental_fee_type === v ? 'rgba(250,204,21,0.12)' : 'var(--surface2)',
                    color: rentalCfg.rental_fee_type === v ? 'var(--yellow)' : 'var(--text-muted)' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>{rentalCfg.rental_fee_type === 'per_session' ? '1회당 대관료 (원)' : '월 고정 대관료 (원)'}</FieldLabel>
            <input className="input" type="number" placeholder="예: 300000"
              value={rentalCfg.rental_fee_amount || ''}
              onChange={e => setRentalCfg(c => ({ ...c, rental_fee_amount: Number(e.target.value) }))} />
          </div>
        </div>
      )}

      {/* ── PT 수당 및 커미션 설정 ── */}
      <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '10px',
        border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.04)' }}>
        <div style={{ fontSize: '11px', color: 'var(--blue)', fontWeight: 700, marginBottom: '14px', letterSpacing: '0.3px' }}>
          💰 PT 수당 및 커미션 설정
        </div>

        {/* PT 정산 방식 선택 */}
        <div style={{ marginBottom: '12px' }}>
          <FieldLabel>PT 정산 방식</FieldLabel>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['ratio', '비율제 (%)'], ['fixed', '고정단가 (₩)']].map(([v, l]) => (
              <button key={v} onClick={() => setPtCfg(c => ({ ...c, pt_calc_type: v }))}
                style={{ flex: 1, padding: '7px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${ptCfg.pt_calc_type === v ? 'rgba(96,165,250,0.55)' : 'var(--border)'}`,
                  background: ptCfg.pt_calc_type === v ? 'rgba(96,165,250,0.12)' : 'var(--surface2)',
                  color: ptCfg.pt_calc_type === v ? 'var(--blue)' : 'var(--text-muted)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* PT 단가 / 비율 — 단위가 동적으로 변함 */}
        <div style={{ marginBottom: '12px' }}>
          <FieldLabel>{isRatio ? 'PT 수당 비율' : 'PT 1회 고정단가'}</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input className="input" type="number" min={0} max={isRatio ? 100 : undefined}
              placeholder={isRatio ? '예: 70' : '예: 50000'}
              value={ptCfg.pt_value}
              onChange={e => setPtCfg(c => ({ ...c, pt_value: e.target.value }))}
              style={{ flex: 1 }} />
            <span style={{
              fontSize: '14px', fontWeight: 700, minWidth: '22px', textAlign: 'right',
              color: isRatio ? 'var(--blue)' : 'var(--accent)',
            }}>
              {isRatio ? '%' : '₩'}
            </span>
          </div>
          {isRatio && ptCfg.pt_value !== '' && (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px', lineHeight: 1.5 }}>
              결제 1건 매출의 {ptCfg.pt_value}%를 트레이너 수당으로 지급
            </div>
          )}
        </div>

        {/* 카드 수수료 차감 — 비율제 선택 시에만 노출 */}
        {isRatio && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', transition: 'all 0.15s',
            background: ptCfg.deduct_card_fee ? 'rgba(248,113,113,0.06)' : 'var(--surface2)',
            border: `1px solid ${ptCfg.deduct_card_fee ? 'rgba(248,113,113,0.3)' : 'var(--border)'}` }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input type="checkbox"
                checked={ptCfg.deduct_card_fee}
                onChange={e => setPtCfg(c => ({ ...c, deduct_card_fee: e.target.checked }))}
                style={{ marginTop: '2px', width: '14px', height: '14px', accentColor: 'var(--red)', cursor: 'pointer', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600,
                  color: ptCfg.deduct_card_fee ? 'var(--red)' : 'var(--text)' }}>
                  카드 결제 건 수수료 선 차감
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', lineHeight: 1.55 }}>
                  카드 결제 건에 한해 수수료를 먼저 뺀 금액 기준으로 수당 계산
                </div>
              </div>
            </label>
            {/* 수수료율 입력 — 체크 시에만 노출 */}
            {ptCfg.deduct_card_fee && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, minWidth: '72px' }}>카드 수수료율</div>
                <input className="input" type="number" min={0} max={100} step={0.1}
                  placeholder="예: 3.5"
                  value={ptCfg.card_fee_rate}
                  onChange={e => setPtCfg(c => ({ ...c, card_fee_rate: e.target.value }))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--red)' }}>%</span>
              </div>
            )}
          </div>
        )}

        {/* 매출/영업 인센티브율 */}
        <div style={{ marginBottom: '12px' }}>
          <FieldLabel hint="(선택)">매출/영업 인센티브율</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input className="input" type="number" min={0} max={100} placeholder="예: 5"
              value={ptCfg.sales_commission_rate}
              onChange={e => setPtCfg(c => ({ ...c, sales_commission_rate: e.target.value }))}
              style={{ flex: 1 }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)' }}>%</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px' }}>
            신규 회원 유치 · 매출 목표 달성 시 추가 지급
          </div>
        </div>

        {/* 노쇼/당일취소 수당 지급률 */}
        <div>
          <FieldLabel hint="(선택)">당일취소/노쇼 수당 지급률</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input className="input" type="number" min={0} max={100} placeholder="예: 50"
              value={ptCfg.noshow_payout_rate}
              onChange={e => setPtCfg(c => ({ ...c, noshow_payout_rate: e.target.value }))}
              style={{ flex: 1 }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)' }}>%</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px' }}>
            정상 수당 대비 비율 — 0% 미지급 · 100% 전액 지급
          </div>
        </div>
      </div>

      {/* ── 개인 인센티브율 (직급 기본값 오버라이드) ── */}
      <div style={{ marginBottom: '20px' }}>
        <FieldLabel hint="(비워두면 직급 기본값 적용)">개인 인센티브율</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input className="input" type="number" min={0} max={100}
            placeholder={selectedRank ? `기본: ${Math.round(selectedRank.default_incentive_rate * 100)}%` : '예: 12'}
            value={customRate} onChange={e => setCustomRate(e.target.value)} style={{ flex: 1 }} />
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>%</span>
        </div>
        {customRate !== '' && (
          <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>✓ 직급 기본값 대신 {customRate}% 적용</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>취소</button>
        <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ① 직원 관리
// ────────────────────────────────────────────────────────────────
function StaffPanel({ gymId }) {
  const showToast = useToast()
  const [trainers,         setTrainers]         = useState([])   // employment_status = active
  const [resignedTrainers, setResignedTrainers] = useState([])   // employment_status = resigned
  const [pendingTrainers,  setPendingTrainers]  = useState([])   // approval_status   = pending
  const [gymRanks,         setGymRanks]         = useState([])
  const [loading,          setLoading]          = useState(true)
  const [approving,        setApproving]        = useState(null)
  const [resigning,        setResigning]        = useState(null) // id being resigned/reinstated
  const [showResigned,     setShowResigned]     = useState(false)
  const [addModal,     setAddModal]     = useState(false)
  const [editModal,    setEditModal]    = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [resignTarget, setResignTarget] = useState(null)
  const [rankModal,    setRankModal]    = useState(null)  // 직급/고용형태/대관 편집 대상
  const [form, setForm] = useState({ name: '', phone: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [gymId])

  async function load() {
    setLoading(true)
    const [activeRes, resignedRes, pendingRes, rRes] = await Promise.all([
      // 재직 중 (approved + active)
      supabase.from('trainers').select('*, trainer_ranks(*)')
        .eq('gym_id', gymId)
        .neq('approval_status', 'pending')
        .eq('employment_status', 'active')
        .order('created_at'),
      // 퇴사자 (approved + resigned)
      supabase.from('trainers').select('*, trainer_ranks(*)')
        .eq('gym_id', gymId)
        .neq('approval_status', 'pending')
        .eq('employment_status', 'resigned')
        .order('created_at'),
      // 가입 대기
      supabase.from('trainers').select('id, name, email, phone, created_at')
        .eq('gym_id', gymId)
        .eq('approval_status', 'pending')
        .order('created_at'),
      supabase.from('gym_ranks').select('*')
        .eq('gym_id', gymId).order('sort_order'),
    ])
    setTrainers(activeRes.data || [])
    setResignedTrainers(resignedRes.data || [])
    setPendingTrainers(pendingRes.data || [])
    setGymRanks(rRes.data || [])
    setLoading(false)
  }

  // 가입 승인
  async function handleApprove(trainer) {
    setApproving(trainer.id)
    const { error } = await supabase
      .from('trainers')
      .update({ approval_status: 'approved', employment_status: 'active' })
      .eq('id', trainer.id)
    setApproving(null)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`✓ ${trainer.name} 님을 승인했어요`)
    await load()
  }

  // 가입 거절 (지원 단계이므로 gym_id 초기화는 유지)
  async function handleReject(trainer) {
    setApproving(trainer.id)
    const { error } = await supabase
      .from('trainers')
      .update({ gym_id: null, approval_status: 'approved' })
      .eq('id', trainer.id)
    setApproving(null)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`${trainer.name} 님의 요청을 거절했어요`)
    await load()
  }

  const EMP_LABEL = { rental: '대관', freelance: '프리랜서', employee: '정직원', fulltime: '정직원' }

  async function handleAdd() {
    if (!form.name.trim())  { showToast('이름을 입력하세요'); return }
    if (!form.phone.trim()) { showToast('연락처를 입력하세요'); return }
    setSaving(true)
    const { error } = await supabase.from('trainers').insert({
      name: form.name.trim(), phone: form.phone.trim(),
      gym_id: gymId, employment_status: 'active', approval_status: 'approved',
    })
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 직원이 등록됐어요')
    setAddModal(false); setForm({ name: '', phone: '' }); await load()
  }

  async function handleEdit() {
    if (!form.name.trim()) { showToast('이름을 입력하세요'); return }
    setSaving(true)
    const updatePayload = {
      name:  form.name.trim(),
      phone: form.phone.trim(),
    }
    // owner 역할은 변경 불가 (본인 role 보호)
    if (editTarget?.role !== 'owner' && form.role) {
      updatePayload.role = form.role
    }
    const { error } = await supabase.from('trainers').update(updatePayload).eq('id', editTarget.id)
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 정보가 수정됐어요')
    setEditModal(false); await load()
  }

  // 퇴사 처리 — gym_id 보존, employment_status만 resigned
  async function handleResign() {
    if (!resignTarget) return
    const target = resignTarget
    const { error } = await supabase.from('trainers')
      .update({ employment_status: 'resigned' })
      .eq('id', target.id)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`${target.name} 님을 퇴사 처리했어요`)
    setResignTarget(null)
    // 로컬 상태 즉시 이동: active 목록에서 제거 → resigned 목록에 추가
    const updated = { ...target, employment_status: 'resigned' }
    setTrainers(prev => prev.filter(t => t.id !== target.id))
    setResignedTrainers(prev => [...prev, updated])
  }

  // 복직 처리
  async function handleReinstate(trainer) {
    setResigning(trainer.id)
    const { error } = await supabase.from('trainers')
      .update({ employment_status: 'active' })
      .eq('id', trainer.id)
    setResigning(null)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`✓ ${trainer.name} 님을 복직 처리했어요`)
    // 로컬 상태 즉시 이동: resigned 목록에서 제거 → active 목록에 추가
    const updated = { ...trainer, employment_status: 'active' }
    setResignedTrainers(prev => prev.filter(t => t.id !== trainer.id))
    setTrainers(prev => [...prev, updated])
  }

  function openEdit(t) {
    setEditTarget(t)
    setForm({ name: t.name, phone: t.phone || '', role: t.role || 'staff' })
    setEditModal(true)
  }

  return (
    <div>

      {/* ── 가입 대기열 ── */}
      {pendingTrainers.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>⏳ 가입 대기열</div>
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
              background: 'rgba(250,204,21,0.15)', color: '#facc15',
              border: '1px solid rgba(250,204,21,0.3)',
            }}>{pendingTrainers.length}명 대기 중</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingTrainers.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                background: 'rgba(250,204,21,0.04)',
                border: '1px solid rgba(250,204,21,0.2)',
                borderRadius: '10px',
              }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, color: '#facc15',
                }}>{t.name?.[0] || '?'}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.email || t.phone || '연락처 없음'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleApprove(t)}
                    disabled={approving === t.id}
                    style={{
                      padding: '5px 12px', borderRadius: '7px',
                      background: 'rgba(74,222,128,0.15)', color: '#4ade80',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid rgba(74,222,128,0.3)', outline: 'none',
                      opacity: approving === t.id ? 0.5 : 1,
                    }}>
                    {approving === t.id ? '…' : '✓ 승인'}
                  </button>
                  <button
                    onClick={() => handleReject(t)}
                    disabled={approving === t.id}
                    style={{
                      padding: '5px 12px', borderRadius: '7px',
                      background: 'rgba(248,113,113,0.08)', color: '#f87171',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid rgba(248,113,113,0.25)',
                      opacity: approving === t.id ? 0.5 : 1,
                    }}>
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0' }} />
        </div>
      )}

      {/* ── 직원 목록 헤더 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>직원 목록</div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
            센터에 소속된 직원 관리
          </div>
        </div>
        <button className="btn btn-primary" style={{ gap: '5px' }}
          onClick={() => { setForm({ name: '', phone: '' }); setAddModal(true) }}>
          + 직원 추가
        </button>
      </div>

      {/* ── 재직 중 직원 테이블 ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          <span className="spinner" style={{ display: 'block', marginBottom: '8px', fontSize: '22px' }}>✦</span>
          불러오는 중...
        </div>
      ) : trainers.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: '24px' }}>
          <div className="empty-state-icon">👤</div>
          <div className="empty-state-text">재직 중인 직원이 없어요</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>직급</th>
                <th>고용형태</th>
                <th>등록일</th>
                <th style={{ width: '150px' }}></th>
              </tr>
            </thead>
            <tbody>
              {trainers.map(t => {
                const rank = gymRanks.find(r => r.id === t.gym_rank_id)
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                          background: 'rgba(200,241,53,0.12)', border: '1px solid rgba(200,241,53,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700, color: 'var(--accent)',
                        }}>{t.name[0]}</div>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{t.name}</span>
                      </div>
                    </td>
                    <td style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)' }}>{t.phone}</td>
                    <td>
                      {rank
                        ? <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', background: 'rgba(200,241,53,0.1)', color: 'var(--accent)', border: '1px solid rgba(200,241,53,0.25)' }}>{rank.label}</span>
                        : <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {EMP_LABEL[t.employment_type] || '미설정'}
                      </span>
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-dim)', ...mono }}>
                      {new Date(t.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '10px', color: 'var(--accent)', borderColor: 'rgba(200,241,53,0.3)' }}
                          onClick={() => setRankModal(t)}>직급/계약</button>
                        <button className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => openEdit(t)}>편집</button>
                        <button className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '10px', color: 'var(--red)', borderColor: 'rgba(248,113,113,0.3)' }}
                          onClick={() => setResignTarget(t)}>퇴사</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 퇴사자 아코디언 ── */}
      {resignedTrainers.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setShowResigned(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontSize: '12px', fontWeight: 600, textAlign: 'left',
            }}>
            <span>{showResigned ? '▾' : '▸'}</span>
            <span>퇴사자 {resignedTrainers.length}명</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}>
              기록 보존 중 · gym_id 유지
            </span>
          </button>

          {showResigned && (
            <div style={{ marginTop: '8px' }}>
              <table className="data-table" style={{
                opacity: 0.65, filter: 'grayscale(40%)',
                border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden',
              }}>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>연락처</th>
                    <th>직급</th>
                    <th>고용형태</th>
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {resignedTrainers.map(t => {
                    const rank = gymRanks.find(r => r.id === t.gym_rank_id)
                    return (
                      <tr key={t.id} style={{ color: 'var(--text-dim)' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                              background: 'rgba(150,150,150,0.1)', border: '1px solid rgba(150,150,150,0.2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px', fontWeight: 700, color: 'var(--text-dim)',
                            }}>{t.name[0]}</div>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{t.name}</span>
                          </div>
                        </td>
                        <td style={{ ...mono, fontSize: '12px' }}>{t.phone}</td>
                        <td>
                          {rank
                            ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: 'rgba(150,150,150,0.08)', border: '1px solid rgba(150,150,150,0.15)' }}>{rank.label}</span>
                            : <span style={{ fontSize: '11px' }}>—</span>}
                        </td>
                        <td>
                          <span style={{ fontSize: '11px' }}>
                            {EMP_LABEL[t.employment_type] || '미설정'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleReinstate(t)}
                            disabled={resigning === t.id}
                            style={{
                              padding: '3px 8px', fontSize: '10px', borderRadius: '6px',
                              background: 'rgba(74,222,128,0.08)', color: '#4ade80',
                              border: '1px solid rgba(74,222,128,0.25)', cursor: 'pointer',
                              fontFamily: 'inherit', fontWeight: 600,
                              opacity: resigning === t.id ? 0.5 : 1,
                            }}>
                            {resigning === t.id ? '…' : '복직'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 직급 관리 (GymRankManager 재사용) ── */}
      <GymRankManager gymId={gymId} onChanged={load} />

      {/* ── 직원 추가 모달 ── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="직원 추가" maxWidth="380px">
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.65, marginBottom: '16px' }}>
          트레이너 앱에 이미 가입된 계정이라면 동일한 이름·연락처를 입력하세요.
          계정이 연동됩니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {[['name','이름 *','김트레이너'], ['phone','연락처 *','010-0000-0000']].map(([k,l,ph]) => (
            <div key={k}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>{l}</div>
              <input className="input" placeholder={ph} value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setAddModal(false)}>취소</button>
          <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={handleAdd} disabled={saving}>
            {saving ? '등록 중...' : '등록'}
          </button>
        </div>
      </Modal>

      {/* ── 직원 편집 모달 ── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="직원 정보 편집" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {[['name','이름'], ['phone','연락처']].map(([k,l]) => (
            <div key={k}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>{l}</div>
              <input className="input" value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}

          {/* 권한(Role) 설정 — owner 계정은 변경 불가 */}
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>
              시스템 권한
            </div>
            {editTarget?.role === 'owner' ? (
              <div style={{
                padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                background: 'rgba(200,241,53,0.08)', border: '1px solid rgba(200,241,53,0.2)',
                color: 'var(--accent)', fontWeight: 600,
              }}>
                👑 대표 (변경 불가)
              </div>
            ) : (
              <select className="input" value={form.role ?? 'staff'}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="manager">매니저 (환불 권한 포함)</option>
                <option value="staff">일반 직원</option>
              </select>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditModal(false)}>취소</button>
          <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={handleEdit} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </Modal>

      {/* ── 직급 · 고용형태 · 대관 계약 편집 모달 ── */}
      <Modal open={!!rankModal} onClose={() => setRankModal(null)}
        title={rankModal ? `${rankModal.name} · 직급 및 계약 설정` : ''} maxWidth="440px">
        {rankModal && (
          <RankEditModal
            trainer={rankModal}
            gymRanks={gymRanks}
            onClose={() => setRankModal(null)}
            onSaved={() => { setRankModal(null); load() }}
          />
        )}
      </Modal>

      {/* ── 퇴사 처리 확인 모달 ── */}
      <Modal open={!!resignTarget} onClose={() => setResignTarget(null)} title="퇴사 처리" maxWidth="360px">
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '20px' }}>
          <strong style={{ color: 'var(--text)' }}>{resignTarget?.name}</strong>님을 퇴사 처리할까요?<br />
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            수업 기록·정산 내역은 그대로 보존돼요. 언제든 복직 처리할 수 있어요.
          </span>
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setResignTarget(null)}>취소</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--red)', color: '#fff', border: 'none' }}
            onClick={handleResign}>퇴사 처리</button>
        </div>
      </Modal>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ② 센터 로그
// ────────────────────────────────────────────────────────────────
function CenterLogPanel({ gymId, trainers }) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => { load() }, [gymId])

  async function load() {
    setLoading(true)
    const trainerIds = (trainers || []).map(t => t.id)

    if (trainerIds.length === 0) { setEvents([]); setLoading(false); return }

    const [membersRes, paymentsRes, logsRes] = await Promise.all([
      supabase.from('members')
        .select('id, name, trainer_id, created_at')
        .in('trainer_id', trainerIds)
        .order('created_at', { ascending: false }).limit(60),
      supabase.from('payments')
        .select('id, amount, product_name, trainer_id, paid_at, payment_method, payment_method_memo')
        .in('trainer_id', trainerIds)
        .order('paid_at', { ascending: false }).limit(60),
      supabase.from('logs')
        .select('id, content, trainer_id, created_at')
        .in('trainer_id', trainerIds)
        .order('created_at', { ascending: false }).limit(60),
    ])

    const trainerMap = Object.fromEntries((trainers || []).map(t => [t.id, t.name]))
    const METHOD_ICON = {
      cash: '💵', card: '💳', transfer: '🏦', local_currency: '🪙', payments_app: '📱',
    }

    const allEvents = [
      ...(membersRes.data || []).map(m => ({
        id: 'member_' + m.id,
        type: 'member',
        icon: '👤', color: 'var(--blue)', bg: 'rgba(96,165,250,0.12)',
        title: '회원 등록',
        desc:  m.name,
        sub:   `담당 · ${trainerMap[m.trainer_id] || '—'}`,
        at:    m.created_at,
      })),
      ...(paymentsRes.data || []).map(p => {
        const mIcon = METHOD_ICON[p.payment_method] || '💳'
        const memo  = p.payment_method_memo ? ` (${p.payment_method_memo})` : ''
        return {
          id: 'pay_' + p.id,
          type: 'payment',
          icon: '💰', color: 'var(--accent)', bg: 'rgba(200,241,53,0.10)',
          title: '결제',
          desc:  `${p.product_name} · ${Number(p.amount).toLocaleString()}원`,
          sub:   `${mIcon}${memo} · ${trainerMap[p.trainer_id] || '—'}`,
          at:    p.paid_at,
        }
      }),
      ...(logsRes.data || []).map(l => ({
        id: 'log_' + l.id,
        type: 'log',
        icon: '📝', color: 'var(--purple)', bg: 'rgba(167,139,250,0.12)',
        title: '수업일지',
        desc:  (l.content || '').slice(0, 60) + ((l.content || '').length > 60 ? '…' : ''),
        sub:   `트레이너 · ${trainerMap[l.trainer_id] || '—'}`,
        at:    l.created_at,
      })),
    ]

    allEvents.sort((a, b) => new Date(b.at) - new Date(a.at))
    setEvents(allEvents.slice(0, 120))
    setLoading(false)
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    const d    = new Date(iso)
    const diff = (Date.now() - d) / 1000
    if (diff < 60)    return '방금'
    if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const FILTERS = [
    { key: 'all',     label: '전체',    count: events.length },
    { key: 'member',  label: '회원 등록', count: events.filter(e => e.type === 'member').length },
    { key: 'payment', label: '결제',    count: events.filter(e => e.type === 'payment').length },
    { key: 'log',     label: '수업일지', count: events.filter(e => e.type === 'log').length },
  ]
  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter)

  return (
    <div>
      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button key={f.key} className={`filter-chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}>
            {f.label}
            {f.count > 0 && <span style={{ opacity: 0.7, marginLeft: '3px' }}>({f.count})</span>}
          </button>
        ))}
        <button className="btn btn-secondary"
          style={{ marginLeft: 'auto', padding: '5px 12px', fontSize: '11px' }}
          onClick={load}>
          🔄 새로고침
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          <span className="spinner" style={{ display: 'block', marginBottom: '10px', fontSize: '22px' }}>✦</span>
          로그를 불러오는 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-text">아직 활동 로그가 없어요</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(evt => (
            <div key={evt.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '11px 14px',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = evt.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              {/* 아이콘 */}
              <div style={{
                width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: evt.bg, fontSize: '15px',
              }}>{evt.icon}</div>

              {/* 내용 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px',
                    background: evt.bg, color: evt.color,
                  }}>{evt.title}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{evt.desc}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{evt.sub}</div>
              </div>

              {/* 시간 */}
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0, ...mono, textAlign: 'right', minWidth: '56px' }}>
                {fmtDate(evt.at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ③-A 센터 기본정보 설정
// ────────────────────────────────────────────────────────────────
function GymInfoPanel({ gymId, gym, onGymUpdate }) {
  const showToast = useToast()
  const [form, setForm] = useState({
    name:        gym?.name        || '',
    location:    gym?.location    || '',
    phone:       gym?.phone       || '',
    website:     gym?.website     || '',
    description: gym?.description || '',
  })
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(false)

  // 최신 gym 데이터 로드
  useEffect(() => { loadGym() }, [gymId])

  async function loadGym() {
    setLoading(true)
    const { data } = await supabase.from('gyms').select('*').eq('id', gymId).single()
    if (data) setForm({
      name:        data.name        || '',
      location:    data.location    || '',
      phone:       data.phone       || '',
      website:     data.website     || '',
      description: data.description || '',
    })
    setLoading(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast('센터명을 입력하세요'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('gyms')
      .update({
        name:        form.name.trim()        || null,
        location:    form.location.trim()    || null,
        phone:       form.phone.trim()       || null,
        website:     form.website.trim()     || null,
        description: form.description.trim() || null,
      })
      .eq('id', gymId)
      .select()
      .single()
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 센터 정보가 업데이트됐어요')
    onGymUpdate?.(data)
  }

  const FIELDS = [
    { key: 'name',        label: '센터명 *',       ph: 'OO 피트니스' },
    { key: 'location',    label: '주소',            ph: '서울시 강남구 ...' },
    { key: 'phone',       label: '대표 전화',       ph: '02-0000-0000' },
    { key: 'website',     label: '홈페이지 / SNS',  ph: 'https://instagram.com/...' },
  ]

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
      <span className="spinner" style={{ display: 'block', marginBottom: '8px', fontSize: '22px' }}>✦</span>
      불러오는 중...
    </div>
  )

  return (
    <div style={{ maxWidth: '560px' }}>
      <div className="card">
        <div className="card-title" style={{ marginBottom: '20px' }}>센터 기본정보</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {FIELDS.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '5px' }}>
                {f.label}
              </label>
              <input className="input" placeholder={f.ph}
                value={form[f.key]}
                onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '5px' }}>소개 / 메모</label>
            <textarea className="input" rows={3}
              placeholder="센터 소개, 운영 시간, 내부 메모 등"
              value={form.description}
              onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
              style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={loadGym} disabled={loading}>원래대로</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '✓ 저장'}
          </button>
        </div>
      </div>

      {/* 센터 ID 정보 박스 */}
      <div style={{
        marginTop: '16px', padding: '12px 14px',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: '10px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8,
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>센터 ID (읽기 전용)</div>
        <div style={{ ...mono, fontSize: '10px', wordBreak: 'break-all' }}>{gymId}</div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ③-B 권한 설정
// ────────────────────────────────────────────────────────────────
const PERM_DEFS = [
  { key: 'crm_access',       label: 'CRM 포털 접근', desc: '이 포털에 로그인 가능',          color: 'var(--accent)',  bg: 'rgba(200,241,53,0.12)' },
  { key: 'view_all_members', label: '전체 회원 열람', desc: '모든 트레이너의 회원 조회',      color: 'var(--blue)',    bg: 'rgba(96,165,250,0.12)' },
  { key: 'manage_products',  label: '상품 관리',      desc: '상품 등록·수정·삭제',           color: 'var(--purple)',  bg: 'rgba(167,139,250,0.12)' },
  { key: 'view_settlement',  label: '정산 열람',      desc: '직원 정산 내역 조회',           color: 'var(--green)',   bg: 'rgba(74,222,128,0.12)' },
]

function PermToggle({ active, color, onChange, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width: '34px', height: '19px', borderRadius: '10px', position: 'relative',
        background: active ? color : 'var(--surface3)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px', width: '13px', height: '13px',
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.18s', left: active ? '18px' : '3px',
      }} />
    </div>
  )
}

function PermissionsPanel({ gymId }) {
  const showToast = useToast()
  const [trainers,  setTrainers]  = useState([])
  const [gymRanks,  setGymRanks]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [savingKey, setSavingKey] = useState(null)   // `${trainerId}_${permKey}`
  const [noColumn,  setNoColumn]  = useState(false)

  useEffect(() => { load() }, [gymId])

  async function load() {
    setLoading(true)
    const [tRes, rRes] = await Promise.all([
      supabase.from('trainers').select('id, name, phone, gym_rank_id, employment_type, created_at, crm_permissions')
        .eq('gym_id', gymId).order('created_at'),
      supabase.from('gym_ranks').select('*').eq('gym_id', gymId).order('sort_order'),
    ])
    if (tRes.error?.message?.includes('crm_permissions')) {
      setNoColumn(true); setLoading(false); return
    }
    setTrainers(tRes.data || [])
    setGymRanks(rRes.data || [])
    setNoColumn(false)
    setLoading(false)
  }

  async function toggle(trainerId, permKey, curPerms) {
    const sk = `${trainerId}_${permKey}`
    setSavingKey(sk)
    const newPerms = { ...curPerms, [permKey]: !curPerms[permKey] }
    const { error } = await supabase.from('trainers')
      .update({ crm_permissions: newPerms }).eq('id', trainerId)
    setSavingKey(null)
    if (error) { showToast('오류: ' + error.message); return }
    setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, crm_permissions: newPerms } : t))
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
      <span className="spinner" style={{ display: 'block', marginBottom: '10px', fontSize: '22px' }}>✦</span>
      불러오는 중...
    </div>
  )

  // crm_permissions 컬럼 미생성 안내
  if (noColumn) return (
    <div style={{ maxWidth: '600px' }}>
      <div style={{
        background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.25)',
        borderRadius: '12px', padding: '20px',
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>⚠️</div>
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>DB 마이그레이션이 필요해요</div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '16px' }}>
          권한 설정을 사용하려면 Supabase SQL Editor에서 아래 SQL을 실행하세요.
        </div>
        <pre style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '14px', fontSize: '11px',
          color: 'var(--text-muted)', overflowX: 'auto', lineHeight: 1.6,
        }}>
{`ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS crm_permissions
  JSONB NOT NULL DEFAULT '{}';`}
        </pre>
        <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={load}>
          🔄 다시 확인
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {/* 안내 배너 */}
      <div style={{
        background: 'rgba(200,241,53,0.05)', border: '1px solid rgba(200,241,53,0.18)',
        borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
        maxWidth: '720px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.7,
      }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>💡 권한 설정</span>
        {'  '}각 직원에게 허용할 기능을 설정해요. 권한은 향후 앱 업데이트에서 실제 접근 제어에 적용돼요.
      </div>

      {trainers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔐</div>
          <div className="empty-state-text">소속 직원이 없어요</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '720px' }}>
          {trainers.map(t => {
            const perms = t.crm_permissions || {}
            const rank  = gymRanks.find(r => r.id === t.gym_rank_id)
            return (
              <div key={t.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '16px 18px',
              }}>
                {/* 직원 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(200,241,53,0.1)', border: '1px solid rgba(200,241,53,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: 'var(--accent)',
                  }}>{t.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px' }}>
                      {rank?.label ?? '직급 미설정'} · {t.phone}
                    </div>
                  </div>
                  {/* 활성 권한 수 요약 */}
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'right' }}>
                    {PERM_DEFS.filter(pd => perms[pd.key]).length}/{PERM_DEFS.length} 권한
                  </div>
                </div>

                {/* 권한 토글 그리드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: '8px' }}>
                  {PERM_DEFS.map(pd => {
                    const active    = !!perms[pd.key]
                    const isSaving  = savingKey === `${t.id}_${pd.key}`
                    return (
                      <div key={pd.key}
                        onClick={isSaving ? undefined : () => toggle(t.id, pd.key, perms)}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: '8px',
                          padding: '11px 12px', borderRadius: '10px',
                          border: `1px solid ${active ? pd.color + '45' : 'var(--border)'}`,
                          background: active ? pd.bg : 'var(--surface2)',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s', opacity: isSaving ? 0.6 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: active ? pd.color : 'var(--text-muted)' }}>
                            {pd.label}
                          </span>
                          <PermToggle active={active} color={pd.color} disabled={isSaving} onChange={() => toggle(t.id, pd.key, perms)} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.5 }}>{pd.desc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ③ 고급 설정 (래퍼)
// ────────────────────────────────────────────────────────────────
function AdvancedPanel({ gymId, gym, onGymUpdate }) {
  const [advTab, setAdvTab] = useState('info')

  const ADV_TABS = [
    { key: 'info',        label: '센터 기본정보 설정' },
    { key: 'permissions', label: '권한 설정' },
  ]

  return (
    <div>
      <SubTabBar tabs={ADV_TABS} active={advTab} onChange={setAdvTab} variant="underline" />
      {advTab === 'info'        && <GymInfoPanel gymId={gymId} gym={gym} onGymUpdate={onGymUpdate} />}
      {advTab === 'permissions' && <PermissionsPanel gymId={gymId} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 메인 SettingsTab export
// ────────────────────────────────────────────────────────────────
export default function SettingsTab({ gymId, gym, trainers, members, onGymUpdate }) {
  const [subTab, setSubTab] = useSessionTab('crm_settingsSubTab', 'staff')

  const MAIN_TABS = [
    { key: 'staff',      icon: '👥', label: '직원 관리' },
    { key: 'settlement', icon: '💰', label: '직원 급여 정산' },
    { key: 'log',        icon: '📋', label: '센터 로그' },
    { key: 'advanced',   icon: '⚙️', label: '고급 설정' },
  ]

  return (
    <div>
      <SubTabBar tabs={MAIN_TABS} active={subTab} onChange={setSubTab} />

      {subTab === 'staff'      && <StaffPanel gymId={gymId} />}
      {subTab === 'settlement' && <StaffPayrollTab gymId={gymId} trainers={trainers || []} />}
      {subTab === 'log'        && <CenterLogPanel gymId={gymId} trainers={trainers} />}
      {subTab === 'advanced'   && <AdvancedPanel gymId={gymId} gym={gym} onGymUpdate={onGymUpdate} />}
    </div>
  )
}
