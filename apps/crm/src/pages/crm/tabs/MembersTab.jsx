import { useState, useEffect, useMemo } from 'react'
import { parseISO, addDays, format } from 'date-fns'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import Modal from '../components/CrmModal'
import { computeRiskScore, RISK_LEVELS } from '@trainer-log/shared/lib/churnRisk'
import { todayStr } from '../lib/ticketDateCalc'
import MemberFilterPanel from '../components/MemberFilterPanel'
import MemberPausePanel from '../components/MemberPausePanel'
import PaymentDialog from '../components/PaymentDialog'
import {
  EMPTY_FILTERS, STATUS_CHIPS, memberStatus, matchStatus, matchFilters,
  filterTags, daysSince,
} from '../lib/memberFilters'

const mono = { fontFamily: "'DM Mono', monospace" }
const krw  = n => Number(n||0).toLocaleString() + '원'

// ── RBAC: 환불 허용 역할 ──────────────────────────────────────
const REFUND_ROLES = ['owner', 'manager']
const canRefund = (trainer) => REFUND_ROLES.includes(trainer?.role)



// ════════════════════════════════════════════════════════════════
function RefundModal({ payment, memberId, executorRole, onRefunded, onClose }) {
  const showToast = useToast()

  // 환불 기준일 (기본: 오늘)
  const [refundDate,   setRefundDate]   = useState(todayStr())
  // 후속 기간권 목록 (기간권만, start_date ASC)
  const [subsequent,   setSubsequent]   = useState([])
  const [loadingPrev,  setLoadingPrev]  = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError,  setSubmitError]  = useState('')

  // ── 후속 기간권 조회 ──────────────────────────────────────────
  useEffect(() => {
    loadSubsequent()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSubsequent() {
    setLoadingPrev(true)
    try {
      const { data } = await supabase
        .from('payments')
        .select(`
          id,
          product_name,
          start_date,
          end_date,
          gym_products!payments_gym_product_id_fkey ( duration_days )
        `)
        .eq('member_id', memberId)
        .eq('status', 'active')
        .gt('start_date', payment.start_date ?? '1970-01-01')
        .not('gym_product_id', 'is', null)
        .order('start_date', { ascending: true })

      // 기간권만 (duration_days > 0)
      setSubsequent(
        (data || [])
          .filter(p => Number(p.gym_products?.duration_days) > 0)
          .map(p => ({ ...p, duration_days: p.gym_products.duration_days }))
      )
    } catch (e) {
      console.error('[RefundModal] loadSubsequent:', e)
    } finally {
      setLoadingPrev(false)
    }
  }

  // ── 도미노 미리보기 (date-fns, 표시 전용 — DB 쓰지 않음) ───────
  const preview = useMemo(() => {
    if (!subsequent.length) return []
    try {
      let curEnd = refundDate
      return subsequent.map(t => {
        const newStart = format(addDays(parseISO(curEnd), 1), 'yyyy-MM-dd')
        const newEnd   = format(addDays(parseISO(newStart), t.duration_days - 1), 'yyyy-MM-dd')
        curEnd = newEnd
        return { id: t.id, product_name: t.product_name, newStart, newEnd,
                 oldStart: t.start_date, oldEnd: t.end_date }
      })
    } catch {
      return []
    }
  }, [refundDate, subsequent])

  // ── 환불 실행 (RPC 단일 호출 — 트랜잭션 원자성 보장) ────────────
  async function handleConfirm() {
    if (isSubmitting) return   // ❗중복 클릭 방어
    setSubmitError('')
    setIsSubmitting(true)
    try {
      const { error } = await supabase.rpc('process_refund_and_cascade', {
        p_payment_id:    payment.id,
        p_refund_date:   refundDate,
        p_executor_role: executorRole,
      })
      if (error) throw error

      showToast(`✓ 환불 처리 완료 — ${subsequent.length > 0 ? `후속 ${subsequent.length}건 날짜 자동 조정` : '후속 기간권 없음'}`)
      onRefunded()
      onClose()
    } catch (e) {
      // RPC RAISE EXCEPTION 메시지 파싱
      const msg = e.message ?? ''
      if (msg.includes('PERMISSION_DENIED'))   setSubmitError('권한이 없습니다 (owner·manager만 가능).')
      else if (msg.includes('ALREADY_REFUNDED')) setSubmitError('이미 환불 처리된 결제입니다.')
      else if (msg.includes('INVALID_REFUND_DATE')) setSubmitError('환불 기준일이 이용 시작일보다 앞입니다.')
      else setSubmitError('오류: ' + msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const refundDateLabel = refundDate === todayStr() ? `${refundDate} (오늘)` : refundDate

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* 환불 대상 결제 정보 */}
      <div style={{
        background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
        borderRadius: '10px', padding: '14px',
      }}>
        <div style={{ fontSize: '10px', color: 'var(--red)', fontWeight: 700,
          marginBottom: '6px', letterSpacing: '0.4px' }}>환불 대상 기간권</div>
        <div style={{ fontSize: '13px', fontWeight: 700 }}>{payment.product_name || '—'}</div>
        <div style={{ ...mono, fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {payment.start_date} ~ {payment.end_date}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px' }}>
          결제일: {payment.paid_at?.slice(0, 10)} · {krw(payment.amount)}
        </div>
      </div>

      {/* 환불 기준일 선택 */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600,
          display: 'block', marginBottom: '6px' }}>
          환불 기준일 *
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 400,
            marginLeft: '6px' }}>후속 기간권이 이 날짜 기준으로 당겨집니다</span>
        </label>
        <input
          type="date"
          className="input"
          value={refundDate}
          min={payment.start_date ?? undefined}
          max={todayStr()}
          onChange={e => setRefundDate(e.target.value)}
          style={{ ...mono, fontSize: '13px' }}
        />
      </div>

      {/* 도미노 미리보기 */}
      {loadingPrev ? (
        <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', padding: '8px' }}>
          후속 기간권 확인 중…
        </div>
      ) : subsequent.length === 0 ? (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', fontSize: '12px',
          background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)',
          color: 'var(--green)',
        }}>
          ✓ 후속 기간권 없음 — 단순 환불 처리됩니다
        </div>
      ) : (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--blue)', fontWeight: 700,
            marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔗</span>
            <span>후속 기간권 {subsequent.length}건 날짜 자동 조정 미리보기</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {preview.map((p, i) => (
              <div key={p.id} style={{
                background: 'var(--surface2)', borderRadius: '8px',
                padding: '10px 12px', borderLeft: '3px solid var(--blue)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 700 }}>
                    {i + 1}순위
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{p.product_name || '—'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '6px',
                  alignItems: 'center', fontSize: '10px' }}>
                  <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: '5px',
                    padding: '4px 8px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-dim)', marginBottom: '1px' }}>기존</div>
                    <div style={{ ...mono, color: 'var(--text-muted)', fontSize: '10px' }}>
                      {p.oldStart} ~ {p.oldEnd}
                    </div>
                  </div>
                  <span style={{ color: 'var(--blue)', fontSize: '14px' }}>→</span>
                  <div style={{ background: 'rgba(96,165,250,0.08)', borderRadius: '5px',
                    padding: '4px 8px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--blue)', fontWeight: 700, marginBottom: '1px' }}>변경 후</div>
                    <div style={{ ...mono, color: 'var(--blue)', fontSize: '10px', fontWeight: 600 }}>
                      {p.newStart} ~ {p.newEnd}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오류 메시지 */}
      {submitError && (
        <div style={{
          padding: '9px 12px', borderRadius: '8px', fontSize: '12px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: 'var(--red)',
        }}>
          ⚠️ {submitError}
        </div>
      )}

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-secondary"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={onClose}
          disabled={isSubmitting}>
          취소
        </button>
        <button
          style={{
            flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', padding: '10px 16px', borderRadius: '9px', border: 'none',
            background: isSubmitting ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.85)',
            color: '#fff', fontWeight: 700, fontSize: '13px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
          onClick={handleConfirm}
          disabled={isSubmitting || loadingPrev}>
          {isSubmitting
            ? <><span className="spinner">✦</span> 처리 중…</>
            : `⚠ 환불 확정 — 기준일 ${refundDateLabel}`}
        </button>
      </div>
    </div>
  )
}

function RiskBadge({ riskRow }) {
  if (!riskRow) return <span style={{ color:'var(--text-dim)', fontSize:'11px' }}>미분석</span>
  const lvl = RISK_LEVELS[riskRow.risk_level]
  if (!lvl) return null
  return (
    <div>
      <span className="badge" style={{ background:lvl.bg, color:lvl.color, border:`1px solid ${lvl.color}33` }}>{lvl.emoji} {lvl.label}</span>
      <div className="risk-bar" style={{ width:'60px', marginTop:'4px' }}>
        <div className="risk-bar-fill" style={{ width:`${riskRow.risk_score}%`, background:lvl.color }} />
      </div>
    </div>
  )
}

function MemberDetailModal({ member, trainer, gymId, trainers = [], currentTrainer, onMemberStatusChange, onClose, paymentsVersion }) {
  const [tab, setTab] = useState('info')
  const [payments, setPayments] = useState([])
  const [lockers,  setLockers]  = useState(null)   // 락커 이력 (crm_member_lockers)
  const [riskData, setRiskData] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  // 환불 모달
  const [refundTarget, setRefundTarget] = useState(null)  // 환불 처리할 payment row
  const showToast = useToast()

  const remain = Math.max(0, (member.total_sessions||0) - (member.done_sessions||0))
  const pct    = member.total_sessions > 0 ? Math.round(member.done_sessions / member.total_sessions * 100) : 0

  useEffect(() => {
    loadPayments()
    loadLockers()
    loadRisk()
  }, [member.id])

  // 결제 창에서 결제가 끝나면 결제 내역 갱신
  useEffect(() => { if (paymentsVersion) loadPayments() }, [paymentsVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPayments() {
    const { data } = await supabase
      .from('payments')
      .select('*, products(name), gym_products!payments_gym_product_id_fkey(duration_days)')
      .eq('member_id', member.id)
      .order('paid_at', { ascending: false })
    setPayments(data || [])
  }

  async function loadLockers() {
    const { data } = await supabase.rpc('crm_member_lockers', { p_member_id: member.id })
    setLockers(data || [])
  }


  // member_risk_scores SELECT 만 유지 (READ 는 RLS 통과). 미존재 시 null 폴백.
  async function loadRisk() {
    try {
      const { data } = await supabase.from('member_risk_scores')
        .select('*').eq('member_id', member.id).maybeSingle()
      setRiskData(data || null)
    } catch (e) {
      console.error('[loadRisk]', e)
      setRiskData(null)
    }
  }

  // analyzeRisk — 분석 결과 DB upsert 제거(403 차단), 프론트 state 만 갱신.
  async function analyzeRisk() {
    setAnalyzing(true)
    try {
      const [logsRes, healthRes, attendRes] = await Promise.all([
        supabase.from('logs').select('*').eq('member_id', member.id).order('created_at',{ascending:false}).limit(100),
        supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date',{ascending:false}).limit(60),
        supabase.from('attendance').select('*').eq('member_id', member.id),
      ])
      const r = computeRiskScore(member, logsRes.data||[], healthRes.data||[], attendRes.data||[])
      // (제거됨) supabase.from('member_risk_scores').upsert(...) — RLS 403 차단
      setRiskData({ ...r, risk_score: r.riskScore, risk_level: r.riskLevel })
      alert('✓ 분석 완료 — 프론트엔드 화면에만 표시됩니다 (DB 저장 없음)')
    } catch(e) {
      console.error('[analyzeRisk]', e)
      alert('이탈 위험 분석 중 오류가 발생했어요: ' + (e?.message || ''))
    }
    finally { setAnalyzing(false) }
  }

  const TABS = [
    { key:'info',    label:'기본 정보' },
    { key:'payment', label:'결제 내역' },
    { key:'pause',   label:'회원권 정지' },
    { key:'locker',  label:'락커' },
    { key:'risk',    label:'이탈 위험' },
  ]

  return (
    <div>
      {/* 탭 헤더 */}
      <div style={{ display:'flex', gap:'4px', marginBottom:'16px', borderBottom:'1px solid var(--border)', paddingBottom:'12px' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding:'5px 12px', borderRadius:'6px', border:'none', fontSize:'11px', fontWeight:600, cursor:'pointer', fontFamily:'inherit',
              background: tab===t.key ? 'var(--accent)' : 'var(--surface2)',
              color: tab===t.key ? '#0a0a0a' : 'var(--text-muted)' }}
          >{t.label}</button>
        ))}
      </div>

      {/* 기본 정보 탭 */}
      {tab === 'info' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px', marginBottom:'16px' }}>
            {[['전화번호', member.phone||'—'], ['담당 트레이너', trainer?.name??'—'], ['운동 목적', member.lesson_purpose||'—'], ['방문 경로', member.visit_source||'—']].map(([k,v]) => (
              <div key={k} style={{ background:'var(--surface2)', borderRadius:'8px', padding:'10px 12px' }}>
                <div style={{ color:'var(--text-dim)', fontSize:'10px', marginBottom:'3px' }}>{k}</div>
                <div style={{ fontWeight:500 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">세션 현황</div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'8px' }}>
              <span style={{ color:'var(--text-muted)' }}>{member.done_sessions}회 완료 / {member.total_sessions}회 전체</span>
              <span style={{ ...mono, color: remain===0?'var(--text-dim)':remain<=3?'var(--orange)':'var(--accent)', fontWeight:700 }}>잔여 {remain}회</span>
            </div>
            <div style={{ height:'6px', borderRadius:'3px', background:'var(--border)' }}>
              <div style={{ height:'100%', borderRadius:'3px', width:`${pct}%`, background: remain===0?'var(--text-dim)':'var(--accent)', transition:'width 0.4s' }} />
            </div>
          </div>
        </div>
      )}

      {/* 결제 내역 탭 */}
      {tab === 'payment' && (
        <div>
          {/* ── 결제 내역 ── */}
          {payments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💳</div>
              <div className="empty-state-text">결제 내역이 없어요</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>상품 / 상태</th>
                  <th>이용 기간</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                  {/* 환불 버튼 컬럼 — owner/manager 에게만 표시 */}
                  {canRefund(currentTrainer) && <th></th>}
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const isRefunded  = p.status === 'refunded'
                  const isPeriodPmt = !!p.start_date   // 기간권 여부 (start_date 있으면 기간권)
                  const showRefund  = canRefund(currentTrainer) && isPeriodPmt && !isRefunded

                  return (
                    <tr key={p.id} style={{ opacity: isRefunded ? 0.55 : 1 }}>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {p.paid_at?.slice(0, 10)}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>{p.product_name || p.products?.name || '—'}</span>
                          {isRefunded && (
                            <span style={{
                              fontSize: '9px', padding: '1px 6px', borderRadius: '4px',
                              background: 'rgba(239,68,68,0.12)', color: 'var(--red)',
                              border: '1px solid rgba(239,68,68,0.25)', fontWeight: 700,
                            }}>환불</span>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px' }}>
                          {p.session_count > 0 ? `${p.session_count}회권` : '기간권'}
                        </div>
                      </td>
                      <td style={{ fontSize: '10px' }}>
                        {p.start_date && p.end_date
                          ? <span style={{ ...mono, color: isRefunded ? 'var(--text-dim)' : 'var(--blue)' }}>
                              {p.start_date} ~ {p.end_date}
                            </span>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', ...mono,
                        color: isRefunded ? 'var(--text-dim)' : 'var(--accent)', fontWeight: 700 }}>
                        <span style={{ textDecoration: isRefunded ? 'line-through' : 'none' }}>
                          {krw(p.amount)}
                        </span>
                      </td>
                      {/* 환불 버튼 */}
                      {canRefund(currentTrainer) && (
                        <td style={{ textAlign: 'right' }}>
                          {showRefund ? (
                            <button
                              onClick={() => setRefundTarget(p)}
                              style={{
                                padding: '3px 9px', borderRadius: '5px', fontSize: '10px',
                                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                color: 'var(--red)',
                              }}>
                              환불
                            </button>
                          ) : <span />}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}

          {/* 환불 모달 */}
          <Modal
            open={!!refundTarget}
            onClose={() => setRefundTarget(null)}
            title={`환불 처리 — ${refundTarget?.product_name ?? ''}`}
            maxWidth="500px"
          >
            {refundTarget && (
              <RefundModal
                payment={refundTarget}
                memberId={member.id}
                executorRole={currentTrainer?.role ?? 'staff'}
                onRefunded={loadPayments}
                onClose={() => setRefundTarget(null)}
              />
            )}
          </Modal>
        </div>
      )}

      {/* 회원권 정지 탭 */}
      {tab === 'pause' && (
        <MemberPausePanel member={member} payments={payments} onChanged={loadPayments} />
      )}

      {tab === 'locker' && (
        <div>
          <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'10px', lineHeight: 1.5 }}>
            락커 배정은 위쪽 <b>결제</b>에서 대여권을 고르면 함께 할 수 있어요. 회수·이동·연장은 락커 관리 탭에서.
          </div>
          {lockers === null ? (
            <div className="rev-empty">불러오는 중…</div>
          ) : lockers.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🔒</div><div className="empty-state-text">락커 이용 내역이 없어요</div></div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {lockers.map(l => {
                const active = !l.returned_at
                const over   = active && l.end_date < todayStr()
                return (
                  <div key={l.id} className="pause-row" style={{ opacity: active ? 1 : 0.6 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'13px' }}>
                        {l.number}번 <span style={{ fontWeight:400, fontSize:'11px', color:'var(--text-muted)' }}>{l.product_name || ''}</span>
                      </div>
                      <div style={{ fontSize:'11px', color:'var(--text-muted)', fontFamily:"'DM Mono', monospace", marginTop:'3px' }}>
                        {l.start_date} ~ {l.end_date}
                      </div>
                    </div>
                    <span className={`lk-badge ${!active ? 's-off' : over ? 's-over' : 's-use'}`}>
                      {!active ? `회수됨 ${String(l.returned_at).slice(0, 10)}` : over ? '만료·미회수' : '사용 중'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 이탈 위험 탭 */}
      {tab === 'risk' && (
        <div>
          {riskData ? (() => {
            const lvl = RISK_LEVELS[riskData.risk_level]
            return lvl ? (
              <div>
                <div style={{ background:lvl.bg, border:`1px solid ${lvl.color}44`, borderRadius:'10px', padding:'16px', marginBottom:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:'28px', marginBottom:'4px' }}>{lvl.emoji}</div>
                  <div style={{ ...mono, fontSize:'32px', fontWeight:800, color:lvl.color }}>{riskData.risk_score}<span style={{ fontSize:'13px', color:'var(--text-dim)' }}>/100</span></div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:lvl.color, marginTop:'2px' }}>{lvl.label}</div>
                </div>
                {[['출석 위험도', riskData.attend_score, 40, 'var(--orange)'],
                  ['건강기록 중단', riskData.health_score, 30, 'var(--yellow)'],
                  ['수업 평점 저하', riskData.rating_score, 30, 'var(--purple)']].map(([label, score, max, color]) => score !== undefined && (
                  <div key={label} style={{ marginBottom:'8px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'var(--text-muted)', marginBottom:'3px' }}>
                      <span>{label}</span><span style={{ ...mono, color, fontWeight:700 }}>{score} / {max}</span>
                    </div>
                    <div style={{ height:'4px', borderRadius:'2px', background:'var(--surface2)' }}>
                      <div style={{ height:'100%', borderRadius:'2px', width:`${Math.round(score/max*100)}%`, background:color }} />
                    </div>
                  </div>
                ))}
                {(riskData.flags||[]).map((f,i) => (
                  <div key={i} style={{ display:'flex', gap:'6px', fontSize:'11px', color:'var(--orange)', background:'rgba(249,115,22,0.06)', border:'1px solid rgba(249,115,22,0.2)', borderRadius:'6px', padding:'6px 10px', marginBottom:'4px' }}>
                    <span>⚠</span><span>{f}</span>
                  </div>
                ))}
              </div>
            ) : null
          })() : (
            <div style={{ textAlign:'center', padding:'20px', color:'var(--text-dim)', fontSize:'12px' }}>분석 전입니다. 아래 버튼을 눌러 분석해주세요.</div>
          )}
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:'12px' }} onClick={analyzeRisk} disabled={analyzing}>
            {analyzing ? <><span className="spinner">✦</span> 분석 중...</> : '📊 이탈 위험 분석'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function MembersTab({ members: membersProp, trainers, gymId, currentTrainer }) {
  const showToast = useToast()
  const [localMembers, setLocalMembers] = useState(membersProp)
  const [filter,        setFilter]       = useState('all')
  const [search,        setSearch]       = useState('')
  const [riskMap,       setRiskMap]      = useState({})
  // 리텐션 지표 맵 { [memberId]: { expiry_warning, absence_warning, latest_end_date, last_attended_date } }
  const [retentionMap,  setRetentionMap] = useState({})
  const [selected,      setSelected]     = useState(null)

  // ── 고급 필터 · 세그먼트 ──
  const [filters,       setFilters]      = useState(EMPTY_FILTERS)
  const [panelOpen,     setPanelOpen]    = useState(false)
  // { [memberId]: { total_paid, payment_count, last_paid_at, last_attended } }
  const [statsMap,      setStatsMap]     = useState({})
  const [segments,      setSegments]     = useState([])
  const [activeSegId,   setActiveSegId]  = useState(null)
  // 결제 창
  const [payTarget,     setPayTarget]    = useState(null)
  const [paymentsVersion, setPaymentsVersion] = useState(0)

  // ── 신규 회원 등록 모달 상태 ──
  const [addModal,  setAddModal]  = useState(false)
  const [addForm,   setAddForm]   = useState({ name: '', phone: '', trainer_id: '', status: 'active', lead_memo: '' })
  const [addError,  setAddError]  = useState('')
  const [saving,    setSaving]    = useState(false)

  // 부모에서 members prop이 교체되면 동기화
  useEffect(() => { setLocalMembers(membersProp) }, [membersProp])

  // 회원 목록 변경·탭 진입 시 risk + retention 병렬 로드
  useEffect(() => {
    loadRiskScores()
    if (gymId) { loadRetention(); loadStats() }
  }, [localMembers.length, gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (gymId) loadSegments() }, [gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  // payments/attendance RLS 는 본인 담당분만 허용 → 센터 전체 집계는 RPC 경유
  async function loadStats() {
    const { data, error } = await supabase.rpc('crm_member_stats', { p_gym_id: gymId })
    if (error) { console.error('[crm_member_stats]', error); return }
    const map = {}
    ;(data || []).forEach(r => { map[r.member_id] = r })
    setStatsMap(map)
  }

  async function loadSegments() {
    const { data, error } = await supabase.from('crm_segments')
      .select('id, name, filters').eq('gym_id', gymId).order('created_at')
    if (error) { console.error('[crm_segments]', error); return }
    setSegments(data || [])
  }

  async function saveSegment(name, segFilters) {
    const { data, error } = await supabase.from('crm_segments')
      .insert({ gym_id: gymId, name, filters: segFilters, created_by: currentTrainer?.id ?? null })
      .select('id, name, filters').single()
    if (error) { alert('세그먼트 저장 실패: ' + error.message); return false }
    setSegments(prev => [...prev, data])
    setFilters(segFilters)          // 저장한 조건을 바로 적용
    setActiveSegId(data.id)
    return true
  }

  async function deleteSegment(seg) {
    if (!confirm(`'${seg.name}' 세그먼트를 삭제할까요?`)) return
    const { error } = await supabase.from('crm_segments').delete().eq('id', seg.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setSegments(prev => prev.filter(s => s.id !== seg.id))
    if (activeSegId === seg.id) setActiveSegId(null)
  }

  function applySegment(seg) {
    if (activeSegId === seg.id) { setActiveSegId(null); setFilters(EMPTY_FILTERS); return }
    setActiveSegId(seg.id)
    setFilters({ ...EMPTY_FILTERS, ...seg.filters })
  }

  function applyFilters(next) {
    setFilters(next)
    setActiveSegId(null)
  }

  function removeTag(keys) {
    applyFilters({ ...filters, ...Object.fromEntries(keys.map(k => [k, EMPTY_FILTERS[k]])) })
  }

  async function loadRiskScores() {
    if (!localMembers.length) return
    const { data } = await supabase.from('member_risk_scores').select('*')
      .in('member_id', localMembers.map(m => m.id))
    const map = {}
    ;(data||[]).forEach(r => { map[r.member_id] = r })
    setRiskMap(map)
  }

  // ── 리텐션 지표 — get_member_retention RPC 미존재로 무력화 ──────
  // DB 에 함수가 배포되지 않아 404 가 발생하던 호출을 차단하고 빈 맵으로 폴백.
  // 추후 RPC 가 배포되면 본 함수를 다시 활성화한다.
  async function loadRetention() {
    setRetentionMap({})
  }

  // ── 회원 상태 로컬 즉시 동기화 (lead→active 전환 등) ───────────
  function updateLocalMember(memberId, updates) {
    setLocalMembers(prev => prev.map(m => m.id === memberId ? { ...m, ...updates } : m))
    setSelected(prev => (prev?.id === memberId ? { ...prev, ...updates } : prev))
  }

  // 재직 중인 트레이너만 선택 가능 (employment_status 미설정 레거시 포함)
  const activeTrainers = trainers.filter(t => !t.employment_status || t.employment_status === 'active')

  function openAddModal() {
    setAddForm({ name: '', phone: '', trainer_id: activeTrainers[0]?.id ?? '',
                 status: 'active', lead_memo: '' })
    setAddError('')
    setAddModal(true)
  }

  async function handleAdd() {
    const name  = addForm.name.trim()
    const phone = addForm.phone.trim()
    if (!name)               { setAddError('이름을 입력해주세요.'); return }
    if (!phone)              { setAddError('연락처를 입력해주세요.'); return }
    if (!addForm.trainer_id) { setAddError('담당 트레이너를 선택해주세요.'); return }

    setSaving(true)
    setAddError('')
    try {
      // ── 중복 방어: 같은 트레이너 내 동일 phone (members.gym_id 컬럼 부재) ──
      const { data: dup } = await supabase
        .from('members').select('id')
        .eq('trainer_id', addForm.trainer_id)
        .eq('phone', phone)
        .maybeSingle()
      if (dup) { setAddError('이미 등록된 연락처입니다.'); return }

      // ── INSERT ──
      // 환각 컬럼(lead_memo / status / gym_id)은 members 스키마 부재 → 페이로드에서 100% 제외.
      // 폼 state(addForm.lead_memo / addForm.status)는 UI 호환 위해 유지하되 DB 전송 0건.
      const { data: inserted, error } = await supabase
        .from('members')
        .insert({
          name,
          phone,
          trainer_id: addForm.trainer_id,
          // 센터(CRM) 등록 회원은 트레이너 포털의 "개인 레슨 회원" 목록에 노출 X
          // (migration 049 의 is_personal 컬럼)
          is_personal: false,
        })
        .select().single()
      if (error) { setAddError('오류: ' + error.message); return }

      // showToast 는 본 컴포넌트 스코프에서 참조 불가 → alert 로 안전 폴백 (TypeError 차단)
      alert(`✓ ${inserted.name} 님이 등록됐어요`)
      setLocalMembers(prev => [inserted, ...prev])
      setAddModal(false)
    } catch (err) {
      console.error(err)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 상태 칩(빠른 분류) + 고급 필터 조건을 모두 통과한 회원
  const statusOf = m => memberStatus(m, statsMap[m.id])
  const filtered = localMembers
    .filter(m => matchStatus(statusOf(m), filter))
    .filter(m => matchFilters(m, statsMap[m.id], riskMap[m.id], filters))
    .filter(m => !search || m.name.includes(search) || (m.phone||'').includes(search))
    .sort((a,b) => (riskMap[b.id]?.risk_score??-1) - (riskMap[a.id]?.risk_score??-1))

  const statusCounts = useMemo(() => {
    const c = { all: localMembers.length, active: 0, expiring: 0, expired: 0, none: 0 }
    localMembers.forEach(m => {
      const st = memberStatus(m, statsMap[m.id])
      c[st]++
      if (st === 'expiring') c.active++
    })
    return c
  }, [localMembers, statsMap])

  const tags     = filterTags(filters, trainers)
  const purposes = useMemo(
    () => [...new Set(localMembers.map(m => m.lesson_purpose).filter(Boolean))].sort(),
    [localMembers])

  return (
    <div>
      {/* ── 상태 칩 + 저장한 세그먼트 ── */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '6px' }}>
        {STATUS_CHIPS.map(([v, l]) => (
          <button key={v} className={`filter-chip ${filter===v?'active':''}`}
            onClick={() => setFilter(v)}>
            {l} <span style={{ ...mono, fontSize: '10px', opacity: 0.7 }}>{statusCounts[v]}</span>
          </button>
        ))}

        {segments.length > 0 && (
          <>
            <span style={{ width: '1px', height: '20px', background: 'var(--border)',
              alignSelf: 'center', margin: '0 4px' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', alignSelf: 'center' }}>세그먼트</span>
            {segments.map(seg => (
              <span key={seg.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <button className={`filter-chip ${activeSegId===seg.id?'active':''}`}
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                  onClick={() => applySegment(seg)}>
                  {seg.name}
                </button>
                <button className="filter-chip" aria-label={`${seg.name} 세그먼트 삭제`}
                  style={{ borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '5px 8px' }}
                  onClick={() => deleteSegment(seg)}>
                  ×
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {/* ── 검색 + 고급 필터 토글 ── */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '6px' }}>
        <div className="search-bar" style={{ maxWidth: '220px' }}>
          <span className="search-icon">🔍</span>
          <input className="input" placeholder="이름·전화번호 검색"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <button className={`filter-chip ${panelOpen?'active':''}`}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(o => !o)}>
          고급 필터{tags.length > 0 ? ` · ${tags.length}` : ''}
          <span className={`crm-chevron ${panelOpen?'open':''}`} aria-hidden="true" style={{ marginLeft: '4px' }}>▾</span>
        </button>

        {tags.map(t => (
          <button key={t.text} className="filter-chip"
            style={{ borderColor: 'rgba(200,241,53,0.35)', color: 'var(--accent)' }}
            aria-label={`${t.text} 조건 해제`}
            onClick={() => removeTag(t.keys)}>
            {t.text} ×
          </button>
        ))}

        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-dim)' }}>
          {filtered.length}명
        </span>
        <button className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: '12px', flexShrink: 0 }}
          onClick={openAddModal}>
          + 신규 등록
        </button>
      </div>

      <MemberFilterPanel
          open={panelOpen}
          filters={filters}
          trainers={trainers}
          purposes={purposes}
          onApply={applyFilters}
          onSaveSegment={saveSegment}
        />

      {/* ── 회원 목록 테이블 ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-text">해당하는 회원이 없어요</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>회원</th>
                <th>담당 트레이너</th>
                <th style={{ textAlign: 'right' }}>세션 현황</th>
                <th style={{ textAlign: 'right' }}>잔여</th>
                <th style={{ textAlign: 'right' }}>누적 결제</th>
                <th>마지막 결제</th>
                <th>마지막 출석</th>
                <th>위험도 · 알림</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const remain  = Math.max(0,(m.total_sessions||0)-(m.done_sessions||0))
                const pct     = m.total_sessions > 0 ? Math.round(m.done_sessions/m.total_sessions*100) : 0
                const tName   = trainers.find(t => t.id===m.trainer_id)?.name ?? '—'
                const ret     = retentionMap[m.id]
                const isLead  = m.status === 'lead'
                const stat    = statsMap[m.id]
                const attDays = daysSince(stat?.last_attended)

                return (
                  <tr key={m.id} className="member-row" tabIndex={0}
                    aria-label={`${m.name} 회원 상세 열기`}
                    onClick={() => setSelected(m)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(m) } }}>
                    {/* 회원명 + 상태·리텐션 뱃지 */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
                        marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{m.name}</span>
                        {/* Lead 뱃지 */}
                        {isLead && (
                          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px',
                            background: 'rgba(167,139,250,0.15)', color: 'var(--purple)',
                            border: '1px solid rgba(167,139,250,0.3)', fontWeight: 700 }}>
                            가망
                          </span>
                        )}
                        {/* 만료 임박 뱃지 */}
                        {ret?.expiry_warning && (
                          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px',
                            background: 'rgba(250,204,21,0.15)', color: 'var(--yellow)',
                            border: '1px solid rgba(250,204,21,0.35)', fontWeight: 700 }}>
                            ⏰ 만료 임박
                          </span>
                        )}
                        {/* 장기 미출석 뱃지 */}
                        {ret?.absence_warning && (
                          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px',
                            background: 'rgba(251,146,60,0.15)', color: 'var(--orange)',
                            border: '1px solid rgba(251,146,60,0.3)', fontWeight: 700 }}>
                            😴 미출석
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{m.phone||'—'}</div>
                      {/* 만료 임박 — 날짜 표시 */}
                      {ret?.latest_end_date && ret.expiry_warning && (
                        <div style={{ fontSize: '9px', ...mono, color: 'var(--yellow)', marginTop: '1px' }}>
                          만료 {ret.latest_end_date}
                        </div>
                      )}
                      {/* 마지막 출석일 — 미출석 경고 시 표시 */}
                      {ret?.absence_warning && ret.last_attended_date && (
                        <div style={{ fontSize: '9px', ...mono, color: 'var(--orange)', marginTop: '1px' }}>
                          마지막 출석 {ret.last_attended_date}
                        </div>
                      )}
                    </td>

                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tName}</td>

                    <td style={{ textAlign: 'right' }}>
                      {isLead ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>결제 전</span>
                      ) : (
                        <>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'12px' }}>
                            {m.done_sessions} / {m.total_sessions}회
                          </div>
                          <div style={{ height:'3px', background:'var(--border)', borderRadius:'2px',
                            marginTop:'4px', width:'60px', marginLeft:'auto' }}>
                            <div style={{ height:'100%', borderRadius:'2px', width:`${pct}%`,
                              background: remain===0?'var(--text-dim)':'var(--accent)' }} />
                          </div>
                        </>
                      )}
                    </td>

                    <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace",
                      color: remain===0?'var(--text-dim)':remain<=3?'var(--orange)':'var(--green)',
                      fontWeight:600 }}>
                      {isLead ? '—' : `${remain}회`}
                    </td>

                    <td style={{ textAlign:'right', ...mono, fontSize:'12px' }}>
                      {stat?.total_paid ? krw(stat.total_paid) : '—'}
                    </td>
                    <td style={{ ...mono, fontSize:'11px', color:'var(--text-muted)' }}>
                      {stat?.last_paid_at ? String(stat.last_paid_at).slice(0, 10) : '—'}
                    </td>
                    <td style={{ ...mono, fontSize:'11px',
                      color: attDays == null ? 'var(--text-dim)' : attDays >= 14 ? 'var(--orange)' : 'var(--text-muted)' }}>
                      {attDays == null ? '—' : attDays === 0 ? '오늘' : `${attDays}일 전`}
                    </td>

                    <td><RiskBadge riskRow={riskMap[m.id]} /></td>

                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} maxWidth="520px"
        title={selected ? (
          <div>
            <div>{selected.name}</div>
            <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginTop: '2px' }}>
              {[selected.phone, `잔여 ${Math.max(0, (selected.total_sessions || 0) - (selected.done_sessions || 0))}회`,
                statsMap[selected.id]?.last_paid_at ? `마지막 결제 ${String(statsMap[selected.id].last_paid_at).slice(0, 10)}` : null]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
        ) : ''}
        headerAction={selected && (
          <button className="btn btn-primary" style={{ padding: '7px 16px', fontSize: '12px' }}
            onClick={() => setPayTarget(selected)}>결제</button>
        )}>
        {selected && (
          <MemberDetailModal
            member={selected}
            trainer={trainers.find(t => t.id === selected.trainer_id)}
            gymId={gymId}
            trainers={trainers}
            currentTrainer={currentTrainer}
            onMemberStatusChange={({ id, status }) => {
              updateLocalMember(id, { status })
              loadRetention()
            }}
            onClose={() => setSelected(null)}
            paymentsVersion={paymentsVersion}
          />
        )}
      </Modal>

      {/* ── 결제 창 (목록 · 회원 상세 공용) ── */}
      <PaymentDialog
        open={!!payTarget}
        member={payTarget}
        gymId={gymId}
        trainers={trainers}
        currentTrainer={currentTrainer}
        onClose={() => setPayTarget(null)}
        onPaid={() => { setPaymentsVersion(v => v + 1); if (gymId) loadStats() }}
      />

      {/* ── 신규 회원 등록 모달 ── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="신규 회원 등록" maxWidth="400px">
        <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>

          {/* 이름 */}
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'5px' }}>이름 *</div>
            <input className="input" placeholder="홍길동"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {/* 연락처 */}
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'5px' }}>연락처 *</div>
            <input className="input" placeholder="010-0000-0000"
              value={addForm.phone}
              onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
          </div>

          {/* 담당 트레이너 */}
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'5px' }}>담당 트레이너 *</div>
            {activeTrainers.length === 0 ? (
              <div style={{ fontSize:'12px', color:'var(--text-dim)', padding:'8px 0' }}>재직 중인 트레이너가 없어요</div>
            ) : (
              <select className="input" value={addForm.trainer_id}
                onChange={e => setAddForm(f => ({ ...f, trainer_id: e.target.value }))}>
                {activeTrainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* 등록 유형 */}
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'7px' }}>등록 유형 *</div>
            <div style={{ display:'flex', gap:'8px' }}>
              {[['active','정식 회원'],['lead','가망 고객 (상담 중)']].map(([v,l]) => {
                const isActive = addForm.status === v
                return (
                  <button key={v} type="button"
                    onClick={() => setAddForm(f => ({ ...f, status: v }))}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: '8px',
                      border: isActive
                        ? (v === 'lead' ? '2px solid var(--purple)' : '2px solid var(--accent)')
                        : '1px solid var(--border)',
                      background: isActive
                        ? (v === 'lead' ? 'rgba(167,139,250,0.1)' : 'rgba(200,241,53,0.08)')
                        : 'var(--surface2)',
                      color: isActive
                        ? (v === 'lead' ? 'var(--purple)' : 'var(--accent)')
                        : 'var(--text-muted)',
                      fontWeight: 600, fontSize: '12px', cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'all 0.12s',
                    }}>
                    {v === 'lead' ? '🌱 ' : '✅ '}{l}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize:'10px', color:'var(--text-dim)', marginTop:'5px', lineHeight:1.5 }}>
              {addForm.status === 'lead'
                ? '결제 전 상담 중인 잠재 고객입니다. 첫 결제 시 자동으로 정식 회원으로 전환됩니다.'
                : '즉시 활성 회원으로 등록됩니다.'}
            </div>
          </div>

          {/* 상담 메모 (가망 고객일 때만 표시) */}
          {addForm.status === 'lead' && (
            <div>
              <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'5px' }}>
                상담 메모 <span style={{ fontWeight:400, color:'var(--text-dim)' }}>(선택)</span>
              </div>
              <textarea
                className="input"
                rows={2}
                placeholder="상담 내용, 운동 목적, 특이사항 등"
                value={addForm.lead_memo}
                onChange={e => setAddForm(f => ({ ...f, lead_memo: e.target.value }))}
                style={{ resize:'vertical', minHeight:'56px', lineHeight:1.5 }}
              />
            </div>
          )}

          {/* 에러 메시지 */}
          {addError && (
            <div style={{
              padding:'8px 12px', borderRadius:'8px', fontSize:'12px',
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444',
            }}>
              ⚠️ {addError}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:'8px' }}>
          <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}
            onClick={() => setAddModal(false)}>취소</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
            onClick={handleAdd} disabled={saving || activeTrainers.length === 0}>
            {saving ? '등록 중...' : '등록'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
