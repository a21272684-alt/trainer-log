import { useState, useEffect, useMemo } from 'react'
import { parseISO, addDays, addMonths, endOfMonth, format } from 'date-fns'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { computeRiskScore, RISK_LEVELS } from '@trainer-log/shared/lib/churnRisk'
import { useToast } from './CrmToast'
import Modal from './CrmModal'
import CrmIcon from './CrmIcon'
import MemberPausePanel from './MemberPausePanel'
import MemberBenefitsPanel from './MemberBenefitsPanel'
import { todayStr } from '../lib/ticketDateCalc'
import { passSummary, STATUS_TAG, fmtDot, fmtMan } from '../lib/memberFilters'

// ── 회원 상세 패널 ──────────────────────────────────────────────
// 회원 목록 오른쪽에 열린다 (좁은 화면에서는 오른쪽에서 밀려 나오는 창).
// 맨 위 회원권 카드 → 결제 · 정지 → 탭(기본 정보 · 결제 내역 · 회원권 정지 · 락커 · 혜택 · 이탈 위험).

const mono = { fontVariantNumeric: 'tabular-nums' }
const won  = n => Number(n || 0).toLocaleString() + '원'

const METHOD_LABEL = {
  cash: '현금', card: '카드', transfer: '계좌이체',
  local_currency: '지역화폐', payments_app: '페이먼츠앱',
}

// 환불 버튼은 대표 · 매니저에게만
const REFUND_ROLES = ['owner', 'manager']
const canRefund = t => REFUND_ROLES.includes(t?.role)

// 밝은 바탕에서 읽히는 위험 등급 색 — 공용 RISK_LEVELS 는 트레이너 앱도 쓰므로 CRM 에서만 덮어쓴다
const RISK_TONE = {
  safe:     { color: '#3F6212', bg: '#ECFCCB' },
  watch:    { color: '#92400E', bg: '#FEF3C7' },
  risk:     { color: '#C2410C', bg: '#FFEDD5' },
  critical: { color: '#BE123C', bg: '#FFE4E6' },
}

const TABS = [
  { key: 'info',    label: '기본 정보' },
  { key: 'payment', label: '결제 내역' },
  { key: 'pause',   label: '회원권 정지' },
  { key: 'locker',  label: '락커' },
  { key: 'benefit', label: '혜택' },
  { key: 'risk',    label: '이탈 위험' },
]

// ── 환불 창 ─────────────────────────────────────────────────────
function RefundModal({ payment, memberId, executorRole, onRefunded, onClose }) {
  const showToast = useToast()
  const [refundDate,   setRefundDate]   = useState(todayStr())
  const [subsequent,   setSubsequent]   = useState([])   // 뒤에 이어지는 기간권 (시작일 순)
  const [loadingPrev,  setLoadingPrev]  = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError,  setSubmitError]  = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('payments')
          .select('id, product_name, start_date, end_date, gym_products!payments_gym_product_id_fkey ( duration_days )')
          .eq('member_id', memberId)
          .eq('status', 'active')
          .gt('start_date', payment.start_date ?? '1970-01-01')
          .not('gym_product_id', 'is', null)
          .order('start_date', { ascending: true })
        if (!alive) return
        setSubsequent((data || [])
          .filter(p => Number(p.gym_products?.duration_days) > 0)
          .map(p => ({ ...p, duration_days: p.gym_products.duration_days })))
      } catch (e) {
        console.error('[RefundModal] loadSubsequent:', e)
      } finally {
        if (alive) setLoadingPrev(false)
      }
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 뒤 기간권 날짜가 어떻게 당겨지는지 미리 계산 (표시 전용)
  const preview = useMemo(() => {
    if (!subsequent.length) return []
    try {
      let curEnd = refundDate
      return subsequent.map(t => {
        const newStart = format(addDays(parseISO(curEnd), 1), 'yyyy-MM-dd')
        const newEnd   = format(addDays(parseISO(newStart), t.duration_days - 1), 'yyyy-MM-dd')
        curEnd = newEnd
        return { id: t.id, product_name: t.product_name, newStart, newEnd, oldStart: t.start_date, oldEnd: t.end_date }
      })
    } catch {
      return []
    }
  }, [refundDate, subsequent])

  async function handleConfirm() {
    if (isSubmitting) return   // 중복 클릭 방어
    setSubmitError('')
    setIsSubmitting(true)
    try {
      const { error } = await supabase.rpc('process_refund_and_cascade', {
        p_payment_id:    payment.id,
        p_refund_date:   refundDate,
        p_executor_role: executorRole,
      })
      if (error) throw error
      showToast(`환불 처리 완료 — ${subsequent.length > 0 ? `뒤 기간권 ${subsequent.length}건 날짜 자동 조정` : '뒤 기간권 없음'}`)
      onRefunded()
      onClose()
    } catch (e) {
      const msg = e.message ?? ''
      if (msg.includes('PERMISSION_DENIED'))        setSubmitError('권한이 없습니다 (대표 · 매니저만 가능).')
      else if (msg.includes('ALREADY_REFUNDED'))    setSubmitError('이미 환불 처리된 결제입니다.')
      else if (msg.includes('INVALID_REFUND_DATE')) setSubmitError('환불 기준일이 이용 시작일보다 앞입니다.')
      else setSubmitError('오류: ' + msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const refundDateLabel = refundDate === todayStr() ? `${refundDate} (오늘)` : refundDate

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="mp-refund-target">
        <div className="mp-refund-kicker">환불 대상 기간권</div>
        <div style={{ fontSize: '14px', fontWeight: 800 }}>{payment.product_name || '—'}</div>
        <div style={{ ...mono, fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {payment.start_date} ~ {payment.end_date}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px' }}>
          결제일 {payment.paid_at?.slice(0, 10)} · {won(payment.amount)}
        </div>
      </div>

      <label className="pause-field">
        <span>환불 기준일 · 뒤 기간권이 이 날짜 기준으로 당겨져요</span>
        <input type="date" className="input" value={refundDate} style={mono}
          min={payment.start_date ?? undefined} max={todayStr()}
          onChange={e => setRefundDate(e.target.value)} />
      </label>

      {loadingPrev ? (
        <div className="rev-empty">뒤 기간권 확인 중…</div>
      ) : subsequent.length === 0 ? (
        <div className="mp-note ok">뒤에 이어지는 기간권이 없어 이 결제만 환불돼요</div>
      ) : (
        <div>
          <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--blue)', marginBottom: '8px' }}>
            뒤 기간권 {subsequent.length}건의 날짜가 이렇게 바뀌어요
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {preview.map(p => (
              <div key={p.id} className="mp-refund-row">
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{p.product_name || '—'}</div>
                <div style={{ ...mono, fontSize: '12px', color: 'var(--text-dim)' }}>기존 {p.oldStart} ~ {p.oldEnd}</div>
                <div style={{ ...mono, fontSize: '12px', fontWeight: 700, color: 'var(--blue)' }}>변경 {p.newStart} ~ {p.newEnd}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {submitError && <div className="pause-error" role="alert">{submitError}</div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
          onClick={onClose} disabled={isSubmitting}>취소</button>
        <button className="mp-refund-go" onClick={handleConfirm} disabled={isSubmitting || loadingPrev}>
          {isSubmitting ? '처리 중…' : `환불 확정 · 기준일 ${refundDateLabel}`}
        </button>
      </div>
    </div>
  )
}

// ── 맨 위 회원권 카드 ───────────────────────────────────────────
function PassCard({ p, trainerName }) {
  if (p.status === 'none') {
    return (
      <div className="mp-card none">
        <div className="mp-card-head">{trainerName ? `담당 ${trainerName}` : '담당 없음'}</div>
        <div className="mp-card-big">결제 전이에요</div>
        <div className="mp-card-foot"><span>결제를 등록하면 남은 횟수와 기간이 여기에 나와요</span></div>
      </div>
    )
  }
  const head = [p.passName, trainerName && `담당 ${trainerName}`].filter(Boolean).join(' · ')
  return (
    <div className={`mp-card ${p.status === 'expired' ? 'closed' : ''}`}>
      <div className="mp-card-head">{head || '회원권'}</div>
      <div className="mp-card-nums">
        {p.useSessions
          ? <><span className="mp-card-big">잔여 {p.remain}회</span><span className="mp-card-of">/ {p.total}회</span></>
          : <span className="mp-card-big">{p.hasPass ? (p.endLeft === 0 ? '오늘까지' : `${p.endLeft}일 남음`) : '기간이 끝났어요'}</span>}
      </div>
      <div className="mp-card-track"><div style={{ width: `${Math.round(p.ratio * 100)}%` }} /></div>
      <div className="mp-card-foot">
        <span>{p.endDate ? `${fmtDot(p.endDate)}${p.endLeft < 0 ? ' 끝남' : '까지'}` : '유효기간 없음'}</span>
        {p.dLabel && <span>{p.dLabel}</span>}
      </div>
    </div>
  )
}

// ── 출석 달력 ───────────────────────────────────────────────────
const DOW = ['월', '화', '수', '목', '금', '토', '일']

function AttendanceCalendar({ memberId }) {
  const today = todayStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [days,  setDays]  = useState(null)   // Map('YYYY-MM-DD' → { pt, checkin })

  useEffect(() => {
    let alive = true
    setDays(null)
    const first = parseISO(`${month}-01`)
    // 지난달 횟수도 함께 보여 주려고 두 달치를 읽는다
    supabase.rpc('crm_member_attendance', {
      p_member_id: memberId,
      p_from: format(addMonths(first, -1), 'yyyy-MM-dd'),
      p_to:   format(endOfMonth(first), 'yyyy-MM-dd'),
    }).then(({ data, error }) => {
      if (!alive) return
      if (error) console.error('[crm_member_attendance]', error)
      setDays(new Map((data || []).map(d => [d.day, d])))
    })
    return () => { alive = false }
  }, [memberId, month])

  const first    = parseISO(`${month}-01`)
  const prevKey  = format(addMonths(first, -1), 'yyyy-MM')
  const monthNo  = first.getMonth() + 1
  const prevNo   = addMonths(first, -1).getMonth() + 1
  const lead     = (first.getDay() + 6) % 7   // 월요일 시작
  const lastDay  = endOfMonth(first).getDate()
  const keys     = days ? [...days.keys()] : []
  const nThis    = keys.filter(k => k.startsWith(month)).length
  const nPrev    = keys.filter(k => k.startsWith(prevKey)).length
  const isNow    = month === today.slice(0, 7)

  const cells = []
  for (let i = 0; i < lead; i++) cells.push(<span key={`e${i}`} />)
  for (let d = 1; d <= lastDay; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`
    const hit = days?.get(key)
    const what = hit ? [hit.pt && 'PT 수업', hit.checkin && '센터 입장'].filter(Boolean).join(', ') : ''
    const cls = ['mp-day', hit ? 'on' : '', key === today ? 'today' : '', key > today ? 'future' : ''].filter(Boolean).join(' ')
    cells.push(<span key={key} className={cls} title={hit ? `${monthNo}월 ${d}일 · ${what}` : undefined}>{d}</span>)
  }

  return (
    <section aria-label={`${monthNo}월 출석`}>
      <div className="mp-sec-head">
        <span className="mp-cal-title">
          <button type="button" className="mp-cal-nav" aria-label="이전 달"
            onClick={() => setMonth(format(addMonths(first, -1), 'yyyy-MM'))}>‹</button>
          <b>{monthNo}월 출석</b>
          <button type="button" className="mp-cal-nav" aria-label="다음 달" disabled={isNow}
            onClick={() => setMonth(format(addMonths(first, 1), 'yyyy-MM'))}>›</button>
        </span>
        <span className="mp-sec-sub">{days ? `${isNow ? '이번 달' : `${monthNo}월`} ${nThis}회 · ${prevNo}월 ${nPrev}회` : '불러오는 중'}</span>
      </div>
      <div className={`mp-cal ${days ? '' : 'loading'}`}>
        {DOW.map(w => <span key={w} className="mp-dow">{w}</span>)}
        {cells}
      </div>
    </section>
  )
}

// ── 결제 한 줄 ──────────────────────────────────────────────────
function PayRow({ p, onRefund }) {
  const refunded = p.status === 'refunded'
  const name = p.product_name || p.products?.name || '—'
  const kind = p.session_count > 0 ? `${p.session_count}회권` : (p.start_date ? '기간권' : '')
  const meta = [fmtDot(p.paid_at), METHOD_LABEL[p.payment_method] || null, kind].filter(Boolean).join(' · ')
  return (
    <div className={`mp-pay ${refunded ? 'refunded' : ''}`}>
      <div style={{ minWidth: 0 }}>
        <div className="mp-pay-name">
          <span>{name}</span>
          {refunded && <span className="mp-pay-tag">환불</span>}
        </div>
        <div className="mp-pay-meta">{meta}</div>
        {p.start_date && p.end_date && (
          <div className="mp-pay-meta" style={mono}>{fmtDot(p.start_date)} ~ {fmtDot(p.end_date)}</div>
        )}
      </div>
      <div className="mp-pay-right">
        <b className={refunded ? 'strike' : ''}>{won(p.amount)}</b>
        {onRefund && <button type="button" className="mp-pay-refund" onClick={onRefund}>환불</button>}
      </div>
    </div>
  )
}

// ── 패널 ────────────────────────────────────────────────────────
export default function MemberDetailPanel({ member, stat, trainer, gymId, currentTrainer, paymentsVersion, onClose, onPay }) {
  const showToast = useToast()
  const [tab, setTab]             = useState('info')
  const [payments, setPayments]   = useState(null)
  const [lockers,  setLockers]    = useState(null)
  const [riskData, setRiskData]   = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refundTarget, setRefundTarget] = useState(null)

  const p   = passSummary(member, stat)
  const tag = STATUS_TAG[p.status]
  const memo = (member.special_notes || member.special_note || '').trim()

  useEffect(() => { loadLockers(); loadRisk() }, [member.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadPayments() }, [member.id, paymentsVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // 입력창에 있지 않을 때 Esc 로 닫기 (서브창이 열려 있으면 서브창이 먼저)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || document.querySelector('.crm-modal-backdrop')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  // 분석 결과는 화면에만 표시 (저장 권한 없음)
  async function analyzeRisk() {
    setAnalyzing(true)
    try {
      const [logsRes, healthRes, attendRes] = await Promise.all([
        supabase.from('logs').select('*').eq('member_id', member.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date', { ascending: false }).limit(60),
        supabase.from('attendance').select('*').eq('member_id', member.id),
      ])
      const r = computeRiskScore(member, logsRes.data || [], healthRes.data || [], attendRes.data || [])
      setRiskData({ ...r, risk_score: r.riskScore, risk_level: r.riskLevel })
      showToast('분석을 마쳤어요 · 결과는 이 화면에만 보여요')
    } catch (e) {
      console.error('[analyzeRisk]', e)
      showToast('이탈 위험 분석 중 오류가 생겼어요')
    } finally {
      setAnalyzing(false)
    }
  }

  const list    = payments || []
  const canR    = canRefund(currentTrainer)
  const facts   = [
    ['방문 경로', member.visit_source],
    ['끝낸 수업', member.done_sessions > 0 ? `${member.done_sessions}회` : null],
  ].filter(([, v]) => v)

  return (
    <div className="mp">
      <div className="mp-head">
        <span className="mp-av" aria-hidden="true">{(member.name || '?')[0]}</span>
        <span className="mp-head-text">
          <span className="mp-name-row">
            <span className="mp-name">{member.name}</span>
            <span className="mp-tag" style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
          </span>
          <span className="mp-sub">
            {[member.phone, member.created_at && `${fmtDot(member.created_at)} 등록`, member.lesson_purpose].filter(Boolean).join(' · ')}
          </span>
        </span>
        <button type="button" className="mp-close" aria-label="닫기" onClick={onClose}><CrmIcon name="close" size={15} stroke={2.2} /></button>
      </div>

      <PassCard p={p} trainerName={trainer?.name} />

      <div className="mp-actions">
        <button type="button" className="mp-act" onClick={onPay}>결제 등록</button>
        <button type="button" className="mp-act" onClick={() => setTab('pause')}>회원권 정지</button>
      </div>

      <div className="mp-tabs" role="tablist" aria-label="회원 상세 메뉴">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="mp-body">
        {tab === 'info' && (
          <>
            <AttendanceCalendar memberId={member.id} />

            {memo && (
              <div className="mp-memo">
                <div className="mp-memo-title">메모</div>
                <p>{memo}</p>
              </div>
            )}

            <section aria-label="결제 내역 요약">
              <div className="mp-sec-head">
                <b>결제 내역</b>
                <span className="mp-sec-sub">{stat?.total_paid ? `누적 ${fmtMan(stat.total_paid)}` : '결제 없음'}</span>
              </div>
              {payments === null ? <div className="rev-empty">불러오는 중…</div>
                : list.length === 0 ? <div className="rev-empty">결제 내역이 없어요</div>
                : list.slice(0, 2).map(x => <PayRow key={x.id} p={x} />)}
              {list.length > 2 && (
                <button type="button" className="mp-more" onClick={() => setTab('payment')}>전체 {list.length}건 보기</button>
              )}
            </section>

            {facts.length > 0 && (
              <dl className="mp-facts">
                {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            )}
          </>
        )}

        {tab === 'payment' && (
          <section aria-label="결제 내역">
            {payments === null ? <div className="rev-empty">불러오는 중…</div>
              : list.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><CrmIcon name="cash" size={30} /></div>
                  <div className="empty-state-text">결제 내역이 없어요</div>
                </div>
              ) : list.map(x => (
                <PayRow key={x.id} p={x}
                  onRefund={canR && x.start_date && x.status !== 'refunded' ? () => setRefundTarget(x) : null} />
              ))}
            <Modal open={!!refundTarget} onClose={() => setRefundTarget(null)}
              title={`환불 처리 — ${refundTarget?.product_name ?? ''}`} maxWidth="500px">
              {refundTarget && (
                <RefundModal payment={refundTarget} memberId={member.id}
                  executorRole={currentTrainer?.role ?? 'staff'}
                  onRefunded={loadPayments} onClose={() => setRefundTarget(null)} />
              )}
            </Modal>
          </section>
        )}

        {tab === 'pause' && <MemberPausePanel member={member} payments={list} onChanged={loadPayments} />}

        {tab === 'locker' && (
          <section aria-label="락커">
            <p className="mp-hint">락커 배정은 결제 등록에서 대여권을 고르면 함께 할 수 있어요. 회수 · 이동 · 연장은 락커 관리에서 해요.</p>
            {lockers === null ? <div className="rev-empty">불러오는 중…</div>
              : lockers.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><CrmIcon name="locker" size={30} /></div>
                  <div className="empty-state-text">락커 이용 내역이 없어요</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lockers.map(l => {
                    const active = !l.returned_at
                    const over   = active && l.end_date < todayStr()
                    return (
                      <div key={l.id} className="pause-row" style={{ opacity: active ? 1 : 0.6 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13.5px' }}>
                            {l.number}번 <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-muted)' }}>{l.product_name || ''}</span>
                          </div>
                          <div style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{l.start_date} ~ {l.end_date}</div>
                        </div>
                        <span className={`lk-badge ${!active ? 's-off' : over ? 's-over' : 's-use'}`}>
                          {!active ? `회수됨 ${String(l.returned_at).slice(0, 10)}` : over ? '만료 · 미회수' : '사용 중'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
          </section>
        )}

        {tab === 'benefit' && <MemberBenefitsPanel member={member} gymId={gymId} version={payments} />}

        {tab === 'risk' && (
          <section aria-label="이탈 위험">
            {riskData && RISK_LEVELS[riskData.risk_level] && RISK_TONE[riskData.risk_level] ? (() => {
              const lvl = RISK_LEVELS[riskData.risk_level]
              const tn  = RISK_TONE[riskData.risk_level]
              return (
                <div>
                  <div className="mp-risk-score" style={{ background: tn.bg, color: tn.color }}>
                    <div style={mono}><b>{riskData.risk_score}</b><span> / 100</span></div>
                    <div className="mp-risk-level">{lvl.label}</div>
                  </div>
                  {[['출석 위험도', riskData.attend_score, 40],
                    ['건강 기록 중단', riskData.health_score, 30],
                    ['수업 평점 저하', riskData.rating_score, 30]].map(([label, score, max]) => score !== undefined && (
                    <div key={label} className="mp-risk-row">
                      <div><span>{label}</span><b style={mono}>{score} / {max}</b></div>
                      <div className="mp-risk-track"><div style={{ width: `${Math.round(score / max * 100)}%` }} /></div>
                    </div>
                  ))}
                  {(riskData.flags || []).map((f, i) => (
                    <div key={i} className="mp-risk-flag"><CrmIcon name="alert" size={14} /><span>{f}</span></div>
                  ))}
                </div>
              )
            })() : (
              <div className="rev-empty">아직 분석 전이에요. 아래 버튼을 눌러 분석해 주세요.</div>
            )}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
              onClick={analyzeRisk} disabled={analyzing}>
              {analyzing ? '분석 중…' : '이탈 위험 분석'}
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
