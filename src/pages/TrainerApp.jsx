import { useState, useEffect, useRef } from 'react'
import { supabase, GEMINI_MODEL } from '../lib/supabase'
import { subscribeToPush, scheduleNotification, deleteScheduledNotification } from '../lib/push'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import { Link } from 'react-router-dom'
import '../styles/trainer.css'
import { computeStats, buildInsightPrompt, callGeminiInsight } from '../lib/memberInsights'
import { computeRiskScore, getRiskLevel, RISK_LEVELS } from '../lib/churnRisk'
import {
  generateWeeklyReport,
  checkAndEnsurePendingReport,
  fetchRecentReports,
  parseReportSections,
  collectWeeklyStats,
  getPrevMondayStr,
} from '../lib/gymReport'
import {
  callGemini,
  callGeminiMultipart,
  buildSessionLogPrompt,
} from '../lib/ai_templates'

// 통합 매출 내역 (revenue 탭용)
function RevenuePaymentList({ trainerId, members, refreshKey }) {
  const [list, setList] = useState(null)
  const [loading, setLoading] = useState(false)
  const fetchList = () => {
    if (!trainerId) return
    setLoading(true)
    supabase.from('payments').select('*').eq('trainer_id', trainerId).order('paid_at', { ascending: false }).limit(100)
      .then(({ data }) => { setList(data || []); setLoading(false) })
  }
  useEffect(() => { fetchList() }, [trainerId, refreshKey])
  if (!list) return <div style={{padding:'12px',color:'var(--text-dim)',fontSize:'13px'}}>불러오는 중...</div>
  const total = list.reduce((s,p) => s+p.amount, 0)
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:'8px',marginBottom:'8px'}}>
        {loading && <span style={{fontSize:'11px',color:'var(--text-dim)'}}>새로고침 중...</span>}
        <span style={{fontSize:'12px',color:'var(--text-muted)'}}>총 <span style={{color:'var(--accent)',fontWeight:700}}>{total.toLocaleString()}원</span> · {list.length}건</span>
      </div>
      {!list.length && <div className="empty" style={{padding:'20px'}}><p>결제 내역이 없어요</p></div>}
      {list.map(p => {
        const mem = members.find(m => m.id === p.member_id)
        const d = new Date(p.paid_at).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
        const METHOD_LABEL = {cash:'💵 현금',card:'💳 카드',transfer:'🏦 계좌이체',local_currency:'🪙 지역화폐',payments_app:'📱 페이먼츠'}
        const methodLabel = METHOD_LABEL[p.payment_method] || ''
        const methodDetail = p.payment_method_memo ? ` (${p.payment_method_memo})` : ''
        return (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
            <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'var(--accent)',color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'12px',flexShrink:0}}>{mem?.name[0]||'?'}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',fontWeight:500}}>{mem?.name||'회원'} · {p.product_name}</div>
              <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'4px',marginTop:'2px'}}>
                {methodLabel && (
                  <span style={{fontSize:'10px',fontWeight:600,padding:'1px 6px',borderRadius:'4px',
                    background:'rgba(200,241,53,0.12)',color:'var(--accent-text)',border:'1px solid rgba(200,241,53,0.3)'}}>
                    {methodLabel}{methodDetail}
                  </span>
                )}
                <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{d} · {p.session_count}회{p.memo?' · '+p.memo:''}{p.tax_included?' (부가세포함)':''}</span>
              </div>
            </div>
            <div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--accent)',flexShrink:0}}>{p.amount.toLocaleString()}원</div>
          </div>
        )
      })}
    </div>
  )
}

// 회원별 결제 관리 카드 (확정 매출 = payments 합계)
function MemberRevenueCard({ m, mWeekLogs, mMonthLogs, attendRate, cancelledBlocks, remain, pct, price, dayOfMonth, daysInMonth, trainerId, onOpenPayment }) {
  const [confirmed, setConfirmed] = useState(null)
  const [recentPays, setRecentPays] = useState([])
  useEffect(() => {
    if (!trainerId) return
    supabase.from('payments').select('*').eq('member_id', m.id).order('paid_at',{ascending:false})
      .then(({ data }) => {
        const d = data||[]
        setConfirmed(d.reduce((s,p)=>s+p.amount,0))
        setRecentPays(d.slice(0,3))
      })
  }, [m.id, trainerId])
  return (
    <div className="card" style={{marginBottom:'12px'}}>
      {/* 헤더 */}
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
        <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'var(--accent)',color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'14px',flexShrink:0}}>{m.name[0]}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:'14px',fontWeight:600}}>{m.name}</div>
          <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{m.lesson_purpose||''} · 단가 {price ? price.toLocaleString()+'원' : '미설정'}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'4px',flexShrink:0}}>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'15px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--accent)'}}>{confirmed!=null?confirmed.toLocaleString():'—'}<span style={{fontSize:'11px'}}>원</span></div>
            <div style={{fontSize:'10px',color:'var(--text-dim)'}}>누적 결제</div>
          </div>
          <button
            onClick={onOpenPayment}
            style={{padding:'5px 12px',borderRadius:'8px',border:'none',background:'var(--accent)',
              color:'#0f0f0f',fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
            💳 결제관리
          </button>
        </div>
      </div>

      {/* 세션 통계 */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'12px'}}>
        {[
          [attendRate!==null?attendRate+'%':'—','주간출석률',attendRate!==null?(attendRate>=80?'#4ade80':attendRate>=60?'#facc15':'var(--danger)'):'var(--text-dim)'],
          [mWeekLogs.length,'주당소진','var(--text)'],
          [mMonthLogs.length,'월간소진','var(--text)'],
          [dayOfMonth>0&&mMonthLogs.length>0?Math.round(mMonthLogs.length/dayOfMonth*daysInMonth):0,'월간예상','#60a5fa']
        ].map(([v,l,c],i)=>(
          <div key={i} style={{textAlign:'center',padding:'8px',background:'var(--surface2)',borderRadius:'8px'}}>
            <div style={{fontSize:'15px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:c}}>{v}</div>
            <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>{l}</div>
          </div>
        ))}
      </div>

      {/* 세션 프로그레스 바 */}
      <div style={{height:'4px',background:'var(--border)',borderRadius:'2px',overflow:'hidden',marginBottom:'8px'}}>
        <div style={{height:'100%',background:'var(--accent)',borderRadius:'2px',width:pct+'%'}}></div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'var(--text-muted)',marginBottom: recentPays.length>0?'10px':0}}>
        <span>{m.done_sessions}회 완료 · 잔여 {remain}회</span>
        {price>0 && <span style={{color:'var(--accent)'}}>잔존가치 {(price*remain).toLocaleString()}원</span>}
      </div>

      {/* 최근 결제 미리보기 */}
      {recentPays.length>0 && (
        <div style={{borderTop:'1px solid var(--border)',paddingTop:'10px'}}>
          <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'6px',fontWeight:600,letterSpacing:'0.05em'}}>최근 결제 내역</div>
          {recentPays.map(p=>(
            <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div style={{fontSize:'11px',color:'var(--text-muted)'}}>
                {new Date(p.paid_at).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})} · {p.product_name}
              </div>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--accent)',fontFamily:"'DM Mono',monospace"}}>{p.amount.toLocaleString()}원</div>
            </div>
          ))}
        </div>
      )}

      {/* 취소 이력 */}
      {cancelledBlocks.length>0 && (
        <div style={{marginTop:'10px',paddingTop:'10px',borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:'10px',color:'var(--danger)',marginBottom:'6px'}}>취소 이력 {cancelledBlocks.length}건</div>
          {cancelledBlocks.slice(-3).map((b,i)=>(
            <div key={i} style={{fontSize:'11px',color:'var(--text-muted)',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              {b.date} · {b.cancelType}{b.cancelDetail?' — '+b.cancelDetail:''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 주간 리포트 컴포넌트 ─────────────────────────────────────
function WeeklyReportPanel({ gymId, apiKey }) {
  const [reports,   setReports]   = useState([])
  const [selected,  setSelected]  = useState(null)   // 보고 있는 레코드
  const [phase,     setPhase]     = useState('idle')  // idle|loading|done|error
  const [statusMsg, setStatus]    = useState('')
  const [errMsg,    setErrMsg]    = useState('')
  const showToast = useToast()

  const mono = { fontFamily: "'DM Mono',monospace" }

  // ── 리포트 목록 로드 ──────────────────────────────────────
  async function loadReports() {
    if (!gymId) return
    setPhase('loading'); setStatus('리포트 목록을 불러오는 중...')
    try {
      const list = await fetchRecentReports(supabase, gymId)
      setReports(list)
      if (list.length > 0) setSelected(list[0])
      setPhase('idle')
    } catch (e) {
      setPhase('error'); setErrMsg(e.message)
    }
  }

  useEffect(() => { loadReports() }, [gymId])

  // ── 리포트 생성 ───────────────────────────────────────────
  async function handleGenerate(existingReport = null) {
    if (!apiKey) { showToast('AI 서비스 준비 중이에요. 잠시 후 다시 시도해주세요'); return }
    if (!gymId)  { showToast('센터 정보가 없어요. 트레이너 설정에서 gym_id를 확인해주세요'); return }

    setPhase('loading'); setErrMsg('')

    try {
      let reportRow = existingReport

      // pending 레코드가 없으면 새로 생성
      if (!reportRow) {
        const { data } = await supabase.rpc('create_pending_weekly_report', { p_gym_id: gymId })
        if (data) {
          const { data: row } = await supabase
            .from('gym_weekly_reports').select('*').eq('id', data).single()
          reportRow = row
        }
        if (!reportRow) { setPhase('error'); setErrMsg('리포트 레코드 생성 실패'); return }
      }

      const { reportText } = await generateWeeklyReport({
        supabase,
        apiKey,
        model:     GEMINI_MODEL,
        gymId,
        reportId:  reportRow.id,
        weekStart: reportRow.week_start || getPrevMondayStr(),
        onStatus:  setStatus,
      })

      showToast('✓ 주간 리포트가 생성됐어요')
      await loadReports()
      setPhase('done')
    } catch (e) {
      setPhase('error'); setErrMsg(e.message)
    }
  }

  // ── 리포트 텍스트 렌더링 ──────────────────────────────────
  function renderReport(text) {
    return parseReportSections(text).map((sec, i) => {
      if (!sec.emoji) {
        return <p key={i} style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'8px'}}>{sec.body}</p>
      }
      return (
        <div key={i} style={{background: sec.style.bg, border:`1px solid ${sec.style.border}`,
          borderRadius:'10px', padding:'12px', marginBottom:'10px'}}>
          <pre style={{margin:0, fontSize:'13px', lineHeight:1.7, color:'var(--text)',
            whiteSpace:'pre-wrap', fontFamily:"'Noto Sans KR',sans-serif"}}>
            {sec.body}
          </pre>
        </div>
      )
    })
  }

  // ── 통계 요약 카드 (생성된 리포트의 snapshot) ────────────
  function StatsGrid({ stats }) {
    if (!stats) return null
    const items = [
      ['이번 주 출석', stats.attendance?.this_week + '회', '#60a5fa'],
      ['신규 회원',    stats.members?.new_this_week + '명', '#4ade80'],
      ['이번 주 매출', (Number(stats.revenue?.this_week || 0) / 10000).toFixed(0) + '만', '#c8f135'],
      ['이탈 위험',   stats.members?.at_risk + '명',    stats.members?.at_risk > 0 ? '#f87171' : '#9ca3af'],
      ['만료 예정',   stats.members?.expiring + '명',   stats.members?.expiring > 0 ? '#fb923c' : '#9ca3af'],
      ['수업 완료',   stats.sessions?.this_week + '회', '#a78bfa'],
    ]
    return (
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px', marginBottom:'14px'}}>
        {items.map(([label, val, color]) => (
          <div key={label} style={{background:'var(--surface2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center'}}>
            <div style={{...mono, fontSize:'14px', fontWeight:700, color}}>{val}</div>
            <div style={{fontSize:'9px', color:'var(--text-dim)', marginTop:'2px'}}>{label}</div>
          </div>
        ))}
      </div>
    )
  }

  // ── 렌더 ─────────────────────────────────────────────────
  const pendingReports = reports.filter(r => r.status === 'pending' || r.status === 'error')
  const doneReports    = reports.filter(r => r.status === 'done')

  return (
    <div>
      {/* pending / 자동 알림 배너 */}
      {pendingReports.map(r => (
        <div key={r.id} style={{background:'rgba(250,204,21,0.08)',border:'1px solid rgba(250,204,21,0.25)',
          borderRadius:'10px',padding:'12px',marginBottom:'12px'}}>
          <div style={{fontSize:'12px',fontWeight:700,color:'#facc15',marginBottom:'6px'}}>
            {r.status === 'error' ? '⚠️ 생성 실패 — 재시도 필요' : '📋 새 주간 리포트 대기 중'}
          </div>
          <div style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'8px'}}>
            기준 기간: {r.week_start} ~ {r.week_end || ''}
          </div>
          {r.error_message && (
            <div style={{fontSize:'11px',color:'#f87171',marginBottom:'8px'}}>{r.error_message}</div>
          )}
          <button onClick={() => handleGenerate(r)} disabled={phase === 'loading'}
            style={{width:'100%',padding:'8px',borderRadius:'8px',border:'none',fontWeight:700,
              fontSize:'12px',cursor:'pointer',fontFamily:'inherit',
              background:'#facc15',color:'#0f0f0f'}}>
            {phase === 'loading' ? statusMsg : '🤖 AI 리포트 지금 생성'}
          </button>
        </div>
      ))}

      {/* 리포트 없고 pending도 없을 때 수동 생성 */}
      {reports.length === 0 && phase !== 'loading' && (
        <div style={{textAlign:'center',padding:'20px 0',marginBottom:'12px'}}>
          <div style={{fontSize:'28px',marginBottom:'8px'}}>📄</div>
          <div style={{fontSize:'12px',color:'var(--text-dim)',marginBottom:'12px'}}>
            아직 생성된 리포트가 없어요.<br/>직전 주 데이터로 리포트를 생성할 수 있어요.
          </div>
          <button onClick={() => handleGenerate()}
            style={{padding:'10px 20px',borderRadius:'8px',border:'none',background:'var(--accent)',
              color:'#0f0f0f',fontWeight:700,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>
            📊 첫 리포트 생성
          </button>
        </div>
      )}

      {/* 로딩 */}
      {phase === 'loading' && (
        <div style={{textAlign:'center',padding:'16px',color:'var(--text-dim)',fontSize:'13px',marginBottom:'12px'}}>
          <div style={{fontSize:'22px',marginBottom:'6px',display:'inline-block',
            animation:'spin 1.5s linear infinite'}}>✦</div>
          <div>{statusMsg}</div>
        </div>
      )}

      {/* 에러 */}
      {phase === 'error' && errMsg && (
        <div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',
          borderRadius:'10px',padding:'12px',marginBottom:'12px',fontSize:'12px',color:'#f87171'}}>
          ⚠️ {errMsg}
        </div>
      )}

      {/* 리포트 목록 탭 */}
      {doneReports.length > 0 && (
        <>
          <div style={{display:'flex',gap:'6px',overflowX:'auto',marginBottom:'12px',paddingBottom:'2px'}}>
            {doneReports.map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                style={{flexShrink:0,padding:'5px 10px',borderRadius:'8px',border:'1px solid',fontSize:'10px',
                  fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',
                  background: selected?.id === r.id ? 'var(--accent)' : 'var(--surface2)',
                  color:      selected?.id === r.id ? '#0f0f0f' : 'var(--text-muted)',
                  borderColor: selected?.id === r.id ? 'var(--accent)' : 'var(--border)'}}>
                {r.week_start}
              </button>
            ))}
          </div>

          {selected && selected.status === 'done' && (
            <div>
              {/* 기간 헤더 */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                <div>
                  <div style={{fontSize:'13px',fontWeight:700}}>{selected.week_start} ~ {selected.week_end}</div>
                  <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>
                    생성: {selected.generated_at ? new Date(selected.generated_at).toLocaleString('ko-KR') : '-'}
                  </div>
                </div>
                <button onClick={() => handleGenerate({ ...selected, status: 'pending' })}
                  style={{padding:'6px 10px',borderRadius:'6px',border:'1px solid var(--border)',
                    background:'transparent',color:'var(--text-dim)',fontSize:'11px',cursor:'pointer',fontFamily:'inherit'}}>
                  🔄 재생성
                </button>
              </div>

              {/* 통계 요약 */}
              <StatsGrid stats={selected.stats_snapshot} />

              {/* 리포트 본문 */}
              {renderReport(selected.report_text || '')}
            </div>
          )}
        </>
      )}

      {/* 새 리포트 생성 버튼 (리포트가 있을 때) */}
      {doneReports.length > 0 && pendingReports.length === 0 && phase !== 'loading' && (
        <button onClick={() => handleGenerate()}
          style={{width:'100%',marginTop:'10px',padding:'9px',borderRadius:'8px',
            border:'1px solid var(--border)',background:'transparent',color:'var(--text-dim)',
            fontSize:'12px',cursor:'pointer',fontFamily:'inherit'}}>
          + 이번 주 리포트 수동 생성
        </button>
      )}
    </div>
  )
}

// ── 정산 분석 컴포넌트 v3 (고용형태 + 회원별 수수료) ─────────
function SettlementBreakdown({ trainerId, showToast, members = [] }) {
  const now = new Date()
  const [year,  setYear]   = useState(now.getFullYear())
  const [month, setMonth]  = useState(now.getMonth() + 1)

  // 공통 DB 데이터
  const [snap,       setSnap]       = useState(null)
  const [settle,     setSettle]     = useState(null)
  const [trainerRow, setTrainerRow] = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  // 고용형태
  const [empType, setEmpType] = useState('employee')

  // 대관 설정
  const [rentalFee,     setRentalFee]     = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)
  // 대관: 센터 배정 회원 목록 & 수수료율
  const [assignedMembers,    setAssignedMembers]    = useState([])   // member_id[]
  const [rentalMemberRates,  setRentalMemberRates]  = useState({})   // {id: rate%}
  const [showRentalAssigned, setShowRentalAssigned] = useState(false)

  // 프리랜서 설정
  const [commissionRate,    setCommissionRate]    = useState(30)     // 기본 수수료율 %
  const [memberCommissions, setMemberCommissions] = useState({})     // {id: rate%} 회원별 오버라이드
  const [showMemberRates,   setShowMemberRates]   = useState(false)

  // 정직원 커스텀 설정
  const [customGrade,         setCustomGrade]         = useState('')
  const [customBaseSalary,    setCustomBaseSalary]    = useState(0)
  const [customIncentiveRate, setCustomIncentiveRate] = useState(10)

  // 이번 달 회원별 결제액 { member_id: amount }
  const [memberPayments, setMemberPayments] = useState({})

  const [savingCfg, setSavingCfg] = useState(false)
  const mono = { fontFamily:"'DM Mono',monospace" }

  // ── 로드 ──────────────────────────────────────────────────
  useEffect(() => { if (trainerId) load() }, [trainerId, year, month])

  async function load() {
    setLoading(true)
    const pad = n => String(n).padStart(2,'0')
    const start = `${year}-${pad(month)}-01`
    const end   = month === 12 ? `${year+1}-01-01` : `${year}-${pad(month+1)}-01`

    const [snapRes, settleRes, trainerRes, paymentsRes] = await Promise.all([
      supabase.rpc('get_snapshot_preview', { p_trainer_id: trainerId, p_year: year, p_month: month }),
      supabase.from('settlements').select('*')
        .eq('trainer_id', trainerId).eq('period_year', year).eq('period_month', month)
        .maybeSingle(),
      supabase.from('trainers').select('*, trainer_ranks(*)').eq('id', trainerId).maybeSingle(),
      supabase.from('payments').select('member_id, amount')
        .eq('trainer_id', trainerId).gte('paid_at', start).lt('paid_at', end),
    ])

    setSnap(snapRes.data || [])
    setSettle(settleRes.data || null)
    const tr = trainerRes.data
    setTrainerRow(tr)

    // 회원별 결제 합산
    const pmap = {}
    for (const p of paymentsRes.data || []) {
      if (p.member_id) pmap[p.member_id] = (pmap[p.member_id] || 0) + p.amount
    }
    setMemberPayments(pmap)

    // 설정 복원
    if (tr) {
      const cfg = tr.settlement_config || {}
      setEmpType(tr.employment_type || cfg.employment_type || 'employee')
      if (cfg.rental_fee        !== undefined) setRentalFee(cfg.rental_fee)
      if (cfg.other_expenses    !== undefined) setOtherExpenses(cfg.other_expenses)
      if (cfg.commission_rate   !== undefined) setCommissionRate(cfg.commission_rate)
      if (cfg.member_commissions)              setMemberCommissions(cfg.member_commissions)
      if (cfg.assigned_members)               setAssignedMembers(cfg.assigned_members)
      if (cfg.rental_member_rates)            setRentalMemberRates(cfg.rental_member_rates)
      if (cfg.custom_grade)                    setCustomGrade(cfg.custom_grade)
      if (cfg.custom_base_salary !== undefined) setCustomBaseSalary(cfg.custom_base_salary)
      if (cfg.custom_incentive_rate !== undefined) setCustomIncentiveRate(cfg.custom_incentive_rate)
    }
    setLoading(false)
  }

  async function saveConfig(overrides = {}) {
    setSavingCfg(true)
    const newEmpType = overrides.employment_type ?? empType
    const cfg = {
      ...(trainerRow?.settlement_config || {}),
      employment_type:       newEmpType,
      rental_fee:            Number(rentalFee),
      other_expenses:        Number(otherExpenses),
      commission_rate:       Number(commissionRate),
      member_commissions:    memberCommissions,
      assigned_members:      assignedMembers,
      rental_member_rates:   rentalMemberRates,
      custom_grade:          customGrade,
      custom_base_salary:    Number(customBaseSalary),
      custom_incentive_rate: Number(customIncentiveRate),
      ...overrides,
    }
    const { error } = await supabase.from('trainers')
      .update({ employment_type: newEmpType, settlement_config: cfg })
      .eq('id', trainerId)
    setSavingCfg(false)
    if (error) showToast('저장 실패: ' + error.message)
    else showToast('✓ 설정이 저장됐어요')
  }

  // ── 월 이동 ────────────────────────────────────────────────
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  function prevMonth() {
    if (month===1) { setYear(y=>y-1); setMonth(12) } else setMonth(m=>m-1)
  }
  function nextMonth() {
    if (isCurrentMonth) return
    if (month===12) { setYear(y=>y+1); setMonth(1) } else setMonth(m=>m+1)
  }

  // ── 공통 스냅샷 ────────────────────────────────────────────
  const paySnap     = (snap||[]).find(s=>s.snapshot_type==='payment')
  const lessonSnap  = (snap||[]).find(s=>s.snapshot_type==='lesson')
  const totalRevenue = paySnap?.base_amount_total ?? 0
  const payCount    = paySnap?.event_count ?? 0
  const lessonCount = lessonSnap?.event_count ?? 0
  const rank        = trainerRow?.trainer_ranks
  const hasGym      = !!trainerRow?.gym_id

  // ── 근로소득세 간이세액 ─────────────────────────────────────
  function approxIncomeTax(monthlyGross) {
    if (monthlyGross <= 0) return 0
    const annual = monthlyGross * 12
    let tax = 0
    if      (annual <= 14_000_000)  tax = annual * 0.06
    else if (annual <= 50_000_000)  tax = 840_000        + (annual - 14_000_000) * 0.15
    else if (annual <= 88_000_000)  tax = 6_240_000      + (annual - 50_000_000) * 0.24
    else if (annual <= 150_000_000) tax = 15_360_000     + (annual - 88_000_000) * 0.35
    else                            tax = 37_060_000     + (annual - 150_000_000) * 0.38
    return Math.round(Math.max(0, tax / 12))
  }

  // ── [대관] 계산 ────────────────────────────────────────────
  function calcRental() {
    const fee      = Number(rentalFee)
    const other    = Number(otherExpenses)

    // 센터 배정 회원 수수료 합산
    const assignedSet = new Set(assignedMembers)
    let assignedCommission = 0
    const memberFeeDetails = []
    for (const [mid, amt] of Object.entries(memberPayments)) {
      if (!assignedSet.has(mid)) continue
      const rate = (rentalMemberRates[mid] ?? 0) / 100
      const fee2 = Math.round(amt * rate)
      assignedCommission += fee2
      const m = members.find(m => m.id === mid)
      if (m) memberFeeDetails.push({ name: m.name, amount: amt, rate: rentalMemberRates[mid] ?? 0, fee: fee2 })
    }

    const expenses   = fee + other + assignedCommission
    const netIncome  = Math.max(0, totalRevenue - expenses)
    const prepaidTax = Math.round(netIncome * 0.033)
    const payout     = netIncome - prepaidTax
    const annualizedRevenue = totalRevenue * 12
    const vatStatus  = annualizedRevenue < 48_000_000
      ? '간이과세 해당 가능 (VAT 경감)'
      : annualizedRevenue < 80_000_000
        ? '일반과세 전환 임박 확인 필요'
        : '일반과세 대상 (VAT 10%)'
    return { fee, other, expenses, assignedCommission, memberFeeDetails, netIncome, prepaidTax, payout, vatStatus }
  }

  // ── [프리랜서] 계산 ────────────────────────────────────────
  function calcFreelance() {
    // 회원별 결제액이 있으면 개별 수수료율 적용, 없으면 기본율
    let totalCenterFee = 0
    const memberFeeDetails = []
    let computedFromMembers = 0

    for (const [mid, amt] of Object.entries(memberPayments)) {
      const rate = (memberCommissions[mid] !== undefined
        ? memberCommissions[mid]
        : commissionRate) / 100
      const fee = Math.round(amt * rate)
      totalCenterFee += fee
      computedFromMembers += amt
      const m = members.find(m => m.id === mid)
      if (m) memberFeeDetails.push({
        name: m.name, amount: amt,
        rate: memberCommissions[mid] !== undefined ? memberCommissions[mid] : commissionRate,
        isCustom: memberCommissions[mid] !== undefined,
        fee,
      })
    }

    // memberPayments에 없는 나머지 수입은 기본율 적용
    const remainder = Math.max(0, totalRevenue - computedFromMembers)
    if (remainder > 0) {
      const rate = Number(commissionRate) / 100
      totalCenterFee += Math.round(remainder * rate)
    }

    const myIncome = totalRevenue - totalCenterFee
    const withheld = Math.round(myIncome * 0.033)
    const payout   = myIncome - withheld
    const annualIncome = myIncome * 12
    const simpleExpenseNote = annualIncome <= 25_000_000
      ? '연 2,500만 이하 — 단순경비율(74.4%) 적용 시 환급 가능'
      : annualIncome <= 75_000_000
        ? '연 2,500~7,500만 — 기준경비율 or 장부 기장 필요'
        : '연 7,500만 초과 — 복식부기 의무 (세무사 상담 권장)'
    return { totalCenterFee, myIncome, withheld, payout, memberFeeDetails, annualIncome, simpleExpenseNote }
  }

  // ── [정직원] 계산 ──────────────────────────────────────────
  function calcEmployee() {
    const baseSalary = settle?.base_salary
      ?? (hasGym ? (rank?.base_salary ?? 0) : Number(customBaseSalary))
    const iRate = settle?.incentive_rate
      ?? (hasGym
        ? (trainerRow?.incentive_rate ?? rank?.default_incentive_rate ?? 0.10)
        : Number(customIncentiveRate) / 100)
    const incentiveAmt = settle?.incentive_amount ?? Math.round(totalRevenue * iRate)
    const grossPay = baseSalary + incentiveAmt
    const pension  = Math.round(grossPay * 0.045)
    const health   = Math.round(grossPay * 0.03545)
    const ltc      = Math.round(health   * 0.1295)
    const employ   = Math.round(grossPay * 0.009)
    const totalIns = pension + health + ltc + employ
    const taxableMonthly = Math.max(0, grossPay - totalIns - 200_000)
    const incomeTax = approxIncomeTax(taxableMonthly)
    const localTax  = Math.round(incomeTax * 0.1)
    const totalTax  = incomeTax + localTax
    const payout    = grossPay - totalIns - totalTax
    const gradeLabel = hasGym ? (rank?.label ?? '직급 미설정') : (customGrade || '직접 입력')
    return { baseSalary, iRate, incentiveAmt, grossPay, pension, health, ltc, employ, totalIns, incomeTax, localTax, totalTax, payout, gradeLabel }
  }

  // ── 헬퍼 컴포넌트 ──────────────────────────────────────────
  function NumInput({ label, value, onChange, unit='원', hint }) {
    return (
      <div style={{marginBottom:'10px'}}>
        <div style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'4px'}}>{label}</div>
        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
          <input type="number" value={value} onChange={e=>onChange(Number(e.target.value))}
            style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',
              borderRadius:'8px',padding:'8px 10px',color:'var(--text)',fontSize:'13px',
              fontFamily:"'DM Mono',monospace",outline:'none'}}/>
          <span style={{fontSize:'12px',color:'var(--text-dim)',minWidth:'18px'}}>{unit}</span>
        </div>
        {hint && <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'3px'}}>{hint}</div>}
      </div>
    )
  }

  function Row({ label, value, sub, highlight }) {
    return (
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',
        padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
        <span style={{fontSize:'12px',color:highlight?'var(--text)':'var(--text-muted)',fontWeight:highlight?700:400}}>{label}</span>
        <span style={{textAlign:'right'}}>
          {value!=null && <span style={{...mono,fontWeight:highlight?700:600,color:highlight?'var(--accent)':'var(--text)',fontSize:'12px'}}>{Number(value).toLocaleString()}원</span>}
          {sub && <span style={{fontSize:'10px',color:'var(--text-dim)',marginLeft:'5px'}}>{sub}</span>}
        </span>
      </div>
    )
  }

  // ── 회원별 수수료율 테이블 (공통 UI) ───────────────────────
  function MemberRateTable({ accentColor, getRateFor, setRateFor, getPayment, showAll = true }) {
    const activeMembers = members.filter(m => showAll || getPayment(m.id) > 0)
    if (!activeMembers.length) return (
      <div style={{fontSize:'11px',color:'var(--text-dim)',padding:'8px 0'}}>
        이번 달 결제된 회원이 없어요.
      </div>
    )
    return (
      <div>
        {activeMembers.map(m => {
          const amt  = getPayment(m.id)
          const rate = getRateFor(m.id)
          const fee  = Math.round(amt * rate / 100)
          const isCustom = memberCommissions[m.id] !== undefined
          return (
            <div key={m.id} style={{
              display:'flex', alignItems:'center', gap:'8px',
              padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
            }}>
              {/* 이름 + 결제액 */}
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:'12px',fontWeight:600,color:'var(--text)',
                  display:'flex',alignItems:'center',gap:'5px'}}>
                  {m.name}
                  {isCustom && <span style={{fontSize:'9px',color:accentColor,
                    background:`${accentColor}22`,borderRadius:'4px',padding:'1px 4px'}}>
                    개별설정
                  </span>}
                </div>
                {amt > 0
                  ? <div style={{...mono,fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>
                      이번달 {amt.toLocaleString()}원
                      {amt > 0 && fee > 0 && <span style={{color:'#f87171',marginLeft:'4px'}}>→ 수수료 {fee.toLocaleString()}원</span>}
                    </div>
                  : <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>이번달 결제 없음</div>
                }
              </div>
              {/* 수수료율 입력 */}
              <div style={{display:'flex',alignItems:'center',gap:'4px',flexShrink:0}}>
                <input type="number" min="0" max="100" value={rate}
                  onChange={e => setRateFor(m.id, Number(e.target.value))}
                  style={{width:'52px',background:'var(--surface)',border:`1px solid ${isCustom ? accentColor+'88' : 'var(--border)'}`,
                    borderRadius:'6px',padding:'5px 6px',color:'var(--text)',fontSize:'12px',
                    fontFamily:"'DM Mono',monospace",outline:'none',textAlign:'center'}}/>
                <span style={{fontSize:'11px',color:'var(--text-dim)'}}>%</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── 렌더 ──────────────────────────────────────────────────
  const EMP_TABS = [
    { key:'rental',    label:'🏠 대관',     color:'#a78bfa' },
    { key:'freelance', label:'💼 프리랜서', color:'#fb923c' },
    { key:'employee',  label:'👔 정직원',   color:'#60a5fa' },
  ]

  return (
    <div className="card" style={{marginBottom:'16px',padding:'16px'}}>

      {/* 헤더: 월 선택 */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <button onClick={prevMonth}
            style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'18px',cursor:'pointer',lineHeight:1,padding:'0 4px'}}>‹</button>
          <span style={{fontSize:'14px',fontWeight:700,minWidth:'90px',textAlign:'center'}}>{year}년 {month}월</span>
          <button onClick={nextMonth} disabled={isCurrentMonth}
            style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer',lineHeight:1,padding:'0 4px',
              color:isCurrentMonth?'var(--border)':'var(--text-muted)'}}>›</button>
        </div>
        {totalRevenue > 0 && (
          <span style={{...mono,fontSize:'12px',fontWeight:700,color:'var(--accent)'}}>
            {totalRevenue.toLocaleString()}원
            <span style={{fontSize:'10px',color:'var(--text-dim)',fontWeight:400,fontFamily:'inherit',marginLeft:'4px'}}>{payCount}건</span>
          </span>
        )}
      </div>

      {/* 고용형태 탭 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',marginBottom:'14px'}}>
        {EMP_TABS.map(t => (
          <button key={t.key} onClick={()=>setEmpType(t.key)}
            style={{padding:'8px 4px',borderRadius:'8px',border:'1px solid',fontWeight:600,fontSize:'11px',
              cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
              background: empType===t.key ? t.color+'22' : 'var(--surface2)',
              color:      empType===t.key ? t.color       : 'var(--text-dim)',
              borderColor:empType===t.key ? t.color       : 'var(--border)'}}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'20px',color:'var(--text-dim)',fontSize:'13px'}}>불러오는 중...</div>
      ) : (

        /* ════ 대관 ════ */
        empType === 'rental' ? (() => {
          const r = calcRental()
          const assignedSet = new Set(assignedMembers)
          return (
            <div>
              <div style={{background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',
                borderRadius:'8px',padding:'10px 12px',marginBottom:'14px',fontSize:'11px',color:'#a78bfa',lineHeight:1.6}}>
                📌 <strong>대관 트레이너 세금 안내</strong><br/>
                사업소득 3.3% 예납 · 매년 5월 종합소득세 신고 · 대관료·장비비 등 필요경비 공제 가능
              </div>

              <NumInput label="월 대관료" value={rentalFee} onChange={setRentalFee} hint="헬스장에 매월 납부하는 공간 임차료"/>
              <NumInput label="기타 필요경비" value={otherExpenses} onChange={setOtherExpenses} hint="장비·소모품·교육비 등"/>

              {/* ── 센터 배정 회원 설정 ── */}
              <div style={{border:'1px solid rgba(167,139,250,0.25)',borderRadius:'10px',marginBottom:'12px',overflow:'hidden'}}>
                <button onClick={()=>setShowRentalAssigned(v=>!v)}
                  style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',
                    padding:'10px 12px',background:'rgba(167,139,250,0.08)',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                  <span style={{fontSize:'12px',fontWeight:700,color:'#a78bfa'}}>
                    🏢 센터 배정 회원 수수료 설정
                    {assignedMembers.length > 0 && <span style={{marginLeft:'6px',fontSize:'10px',
                      background:'rgba(167,139,250,0.2)',borderRadius:'4px',padding:'1px 5px'}}>
                      {assignedMembers.length}명 배정
                    </span>}
                  </span>
                  <span style={{fontSize:'12px',color:'#a78bfa'}}>{showRentalAssigned?'▲':'▼'}</span>
                </button>
                {showRentalAssigned && (
                  <div style={{padding:'12px'}}>
                    <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'10px',lineHeight:1.6}}>
                      센터가 배정해준 회원에 한해 수수료율을 설정할 수 있어요.<br/>
                      배정 회원의 수수료는 필요경비로 처리됩니다.
                    </div>
                    {members.map(m => {
                      const isAssigned = assignedSet.has(m.id)
                      const amt = memberPayments[m.id] ?? 0
                      const rate = rentalMemberRates[m.id] ?? 0
                      const fee = Math.round(amt * rate / 100)
                      return (
                        <div key={m.id} style={{
                          display:'flex', alignItems:'center', gap:'8px',
                          padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
                          opacity: isAssigned ? 1 : 0.5,
                        }}>
                          {/* 배정 토글 */}
                          <button onClick={() => {
                              setAssignedMembers(prev =>
                                prev.includes(m.id) ? prev.filter(id=>id!==m.id) : [...prev, m.id])
                            }}
                            style={{width:'20px',height:'20px',borderRadius:'4px',border:'2px solid',
                              flexShrink:0,cursor:'pointer',transition:'all 0.15s',
                              background: isAssigned ? '#a78bfa' : 'transparent',
                              borderColor: isAssigned ? '#a78bfa' : 'var(--border)'}}>
                            {isAssigned && <span style={{color:'#0f0f0f',fontSize:'12px',lineHeight:'16px',display:'block',textAlign:'center'}}>✓</span>}
                          </button>
                          {/* 이름 + 결제액 */}
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:'12px',fontWeight:600,color:'var(--text)'}}>{m.name}</div>
                            {amt > 0
                              ? <div style={{...mono,fontSize:'10px',color:'var(--text-dim)',marginTop:'1px'}}>
                                  이번달 {amt.toLocaleString()}원
                                  {isAssigned && fee > 0 && <span style={{color:'#a78bfa',marginLeft:'4px'}}>→ 수수료 {fee.toLocaleString()}원</span>}
                                </div>
                              : <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'1px'}}>이번달 결제 없음</div>
                            }
                          </div>
                          {/* 수수료율 (배정된 경우만 활성) */}
                          {isAssigned && (
                            <div style={{display:'flex',alignItems:'center',gap:'4px',flexShrink:0}}>
                              <input type="number" min="0" max="100" value={rate}
                                onChange={e => setRentalMemberRates(prev=>({...prev,[m.id]:Number(e.target.value)}))}
                                style={{width:'52px',background:'var(--surface)',
                                  border:'1px solid rgba(167,139,250,0.5)',borderRadius:'6px',
                                  padding:'5px 6px',color:'var(--text)',fontSize:'12px',
                                  fontFamily:"'DM Mono',monospace",outline:'none',textAlign:'center'}}/>
                              <span style={{fontSize:'11px',color:'var(--text-dim)'}}>%</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {assignedMembers.length > 0 && (
                      <div style={{marginTop:'10px',padding:'8px',background:'rgba(167,139,250,0.08)',
                        borderRadius:'6px',fontSize:'10px',color:'#a78bfa',lineHeight:1.5}}>
                        배정 회원 수수료 합계: <strong>{r.assignedCommission.toLocaleString()}원</strong> (필요경비 처리)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 결과 카드 */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'12px'}}>
                {[['순수익',r.netIncome,'#a78bfa'],['실수령',r.payout,'var(--accent)'],
                  ['필요경비',r.expenses,'#9ca3af'],['예납세 3.3%',r.prepaidTax,'#f87171']
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:'var(--surface2)',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
                    <div style={{fontSize:'9px',color:c,fontWeight:600,marginBottom:'5px'}}>{l}</div>
                    <div style={{...mono,fontSize:'14px',fontWeight:700,color:c,lineHeight:1.2}}>{Number(v).toLocaleString()}</div>
                    <div style={{fontSize:'9px',color:'var(--text-dim)',marginTop:'3px'}}>원</div>
                  </div>
                ))}
              </div>

              {/* 상세 내역 */}
              <button onClick={()=>setShowDetail(d=>!d)}
                style={{width:'100%',background:'none',border:'none',color:'var(--text-dim)',
                  fontSize:'11px',cursor:'pointer',textAlign:'left',padding:'4px 0',marginBottom:'6px'}}>
                {showDetail?'▲':'▼'} 상세 내역
              </button>
              {showDetail && (
                <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',marginBottom:'12px'}}>
                  <Row label="총 결제 수입" value={totalRevenue} sub={`${payCount}건`}/>
                  <Row label="월 대관료" value={-r.fee} sub="필요경비"/>
                  <Row label="기타 필요경비" value={-r.other} sub="필요경비"/>
                  {r.assignedCommission > 0 && <>
                    <div style={{fontSize:'10px',color:'var(--text-dim)',fontWeight:600,padding:'6px 0 2px'}}>배정 회원 수수료 (필요경비)</div>
                    {r.memberFeeDetails.map(d=>(
                      <Row key={d.name} label={`└ ${d.name} (${d.rate}%)`} value={-d.fee} sub={`결제 ${d.amount.toLocaleString()}원`}/>
                    ))}
                  </>}
                  <div style={{borderTop:'1px solid var(--border)',margin:'6px 0'}}/>
                  <Row label="과세 순수익" value={r.netIncome}/>
                  <Row label="사업소득 예납 (3.3%)" value={-r.prepaidTax} sub="소득세3%+지방세0.3%"/>
                  <div style={{borderTop:'1px solid var(--border)',margin:'6px 0'}}/>
                  <Row label="예상 실수령" value={r.payout} highlight/>
                  <div style={{marginTop:'10px',padding:'8px',background:'rgba(167,139,250,0.08)',
                    borderRadius:'6px',fontSize:'10px',color:'#a78bfa',lineHeight:1.6}}>
                    💡 부가세: {r.vatStatus}<br/>
                    💡 배정 회원 수수료는 사업 필요경비로 처리됩니다.
                  </div>
                </div>
              )}
              <button onClick={()=>saveConfig({employment_type:'rental'})} disabled={savingCfg}
                style={{width:'100%',padding:'11px',borderRadius:'8px',border:'none',
                  background:savingCfg?'var(--surface2)':'#a78bfa',color:savingCfg?'var(--text-dim)':'#0f0f0f',
                  fontWeight:700,fontSize:'13px',cursor:savingCfg?'default':'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                {savingCfg?'저장 중...':'💾 설정 저장'}
              </button>
            </div>
          )
        })()

        /* ════ 프리랜서 ════ */
        : empType === 'freelance' ? (() => {
          const f = calcFreelance()
          return (
            <div>
              <div style={{background:'rgba(251,146,60,0.08)',border:'1px solid rgba(251,146,60,0.2)',
                borderRadius:'8px',padding:'10px 12px',marginBottom:'14px',fontSize:'11px',color:'#fb923c',lineHeight:1.6}}>
                📌 <strong>프리랜서 세금 안내</strong><br/>
                센터가 수수료 지급 시 3.3% 원천징수 · 매년 5월 종합소득세 신고 · 지급조서 발급 의무
              </div>

              <NumInput label="기본 수수료율 (전체 적용)" value={commissionRate} onChange={setCommissionRate} unit="%"
                hint="회원별 설정이 없는 경우 이 비율을 적용합니다 (통상 20~40%)"/>

              {/* ── 회원별 수수료율 설정 ── */}
              <div style={{border:'1px solid rgba(251,146,60,0.25)',borderRadius:'10px',marginBottom:'12px',overflow:'hidden'}}>
                <button onClick={()=>setShowMemberRates(v=>!v)}
                  style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',
                    padding:'10px 12px',background:'rgba(251,146,60,0.08)',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                  <span style={{fontSize:'12px',fontWeight:700,color:'#fb923c'}}>
                    👤 회원별 수수료율 개별 설정
                    {Object.keys(memberCommissions).length > 0 && (
                      <span style={{marginLeft:'6px',fontSize:'10px',
                        background:'rgba(251,146,60,0.2)',borderRadius:'4px',padding:'1px 5px'}}>
                        {Object.keys(memberCommissions).length}명 개별설정
                      </span>
                    )}
                  </span>
                  <span style={{fontSize:'12px',color:'#fb923c'}}>{showMemberRates?'▲':'▼'}</span>
                </button>
                {showMemberRates && (
                  <div style={{padding:'12px'}}>
                    <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'10px',lineHeight:1.6}}>
                      수수료율을 변경하면 해당 회원에게만 개별 적용됩니다.<br/>
                      기본율과 같으면 '개별설정' 표시가 제거됩니다.
                    </div>
                    <MemberRateTable
                      accentColor="#fb923c"
                      getRateFor={mid => memberCommissions[mid] !== undefined ? memberCommissions[mid] : commissionRate}
                      setRateFor={(mid, val) => {
                        if (val === commissionRate) {
                          // 기본율과 같으면 개별 설정 제거
                          setMemberCommissions(prev => { const n={...prev}; delete n[mid]; return n })
                        } else {
                          setMemberCommissions(prev => ({...prev, [mid]: val}))
                        }
                      }}
                      getPayment={mid => memberPayments[mid] ?? 0}
                      showAll={true}
                    />
                    {Object.keys(memberCommissions).length > 0 && (
                      <button onClick={()=>setMemberCommissions({})}
                        style={{marginTop:'10px',background:'none',border:'none',color:'#f87171',
                          fontSize:'10px',cursor:'pointer',fontFamily:'inherit',padding:'4px 0'}}>
                        × 모든 개별 설정 초기화
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 결과 카드 */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'12px'}}>
                {[['내 수입',f.myIncome,'#fb923c'],['실수령',f.payout,'var(--accent)'],
                  ['센터 수수료',f.totalCenterFee,'#9ca3af'],['원천징수 3.3%',f.withheld,'#f87171']
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:'var(--surface2)',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
                    <div style={{fontSize:'9px',color:c,fontWeight:600,marginBottom:'5px'}}>{l}</div>
                    <div style={{...mono,fontSize:'14px',fontWeight:700,color:c,lineHeight:1.2}}>{Number(v).toLocaleString()}</div>
                    <div style={{fontSize:'9px',color:'var(--text-dim)',marginTop:'3px'}}>원</div>
                  </div>
                ))}
              </div>

              {/* 상세 */}
              <button onClick={()=>setShowDetail(d=>!d)}
                style={{width:'100%',background:'none',border:'none',color:'var(--text-dim)',
                  fontSize:'11px',cursor:'pointer',textAlign:'left',padding:'4px 0',marginBottom:'6px'}}>
                {showDetail?'▲':'▼'} 상세 내역
              </button>
              {showDetail && (
                <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',marginBottom:'12px'}}>
                  <Row label="총 레슨 수입" value={totalRevenue} sub={`${payCount}건`}/>
                  {f.memberFeeDetails.length > 0 && <>
                    <div style={{fontSize:'10px',color:'var(--text-dim)',fontWeight:600,padding:'6px 0 2px'}}>회원별 수수료</div>
                    {f.memberFeeDetails.map(d=>(
                      <Row key={d.name}
                        label={`└ ${d.name} (${d.rate}%${d.isCustom?' 개별':''})`}
                        value={-d.fee} sub={`결제 ${d.amount.toLocaleString()}원`}/>
                    ))}
                  </>}
                  <div style={{borderTop:'1px solid var(--border)',margin:'6px 0'}}/>
                  <Row label="프리랜서 수입" value={f.myIncome}/>
                  <Row label="원천징수 (3.3%)" value={-f.withheld} sub="소득세3%+지방세0.3%"/>
                  <div style={{borderTop:'1px solid var(--border)',margin:'6px 0'}}/>
                  <Row label="예상 실수령" value={f.payout} highlight/>
                  <div style={{marginTop:'10px',padding:'8px',background:'rgba(251,146,60,0.08)',
                    borderRadius:'6px',fontSize:'10px',color:'#fb923c',lineHeight:1.6}}>
                    💡 {f.simpleExpenseNote}<br/>
                    💡 센터는 분기별 지급조서(원천징수영수증)를 발급해야 합니다.
                  </div>
                </div>
              )}
              <button onClick={()=>saveConfig({employment_type:'freelance'})} disabled={savingCfg}
                style={{width:'100%',padding:'11px',borderRadius:'8px',border:'none',
                  background:savingCfg?'var(--surface2)':'#fb923c',color:savingCfg?'var(--text-dim)':'#0f0f0f',
                  fontWeight:700,fontSize:'13px',cursor:savingCfg?'default':'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                {savingCfg?'저장 중...':'💾 설정 저장'}
              </button>
            </div>
          )
        })()

        /* ════ 정직원 ════ */
        : (() => {
          const e = calcEmployee()
          const status = settle?.status ?? 'none'
          const STATUS_META = {
            none:      { label:'계산 전',  color:'var(--text-dim)', bg:'var(--surface2)' },
            draft:     { label:'초안',     color:'#facc15',         bg:'rgba(250,204,21,0.12)' },
            confirmed: { label:'확정',     color:'#60a5fa',         bg:'rgba(96,165,250,0.12)' },
            paid:      { label:'지급완료', color:'var(--accent)',   bg:'rgba(200,241,53,0.12)' },
          }
          const sm = STATUS_META[status] || STATUS_META.none
          return (
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                <div style={{fontSize:'11px',fontWeight:600,borderRadius:'6px',padding:'3px 8px',color:sm.color,background:sm.bg}}>{sm.label}</div>
                <div style={{fontSize:'11px',borderRadius:'6px',padding:'3px 8px',
                  color:hasGym?'#4ade80':'#facc15',background:hasGym?'rgba(74,222,128,0.1)':'rgba(250,204,21,0.1)'}}>
                  {hasGym ? `🏢 CRM 연동 · ${e.gradeLabel}` : '⚙️ 직접 설정'}
                </div>
              </div>
              {!hasGym && (
                <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',marginBottom:'12px'}}>
                  <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'10px',lineHeight:1.5}}>
                    ⚙️ 소속 센터가 CRM 포털에 미가입 상태입니다.<br/>직접 급여 조건을 입력해 정산을 계산할 수 있어요.
                  </div>
                  <div style={{marginBottom:'8px'}}>
                    <div style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'4px'}}>직급명</div>
                    <input value={customGrade} onChange={e=>setCustomGrade(e.target.value)}
                      placeholder="예: 트레이너, 팀장, 대리..."
                      style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',
                        border:'1px solid var(--border)',borderRadius:'8px',padding:'8px 10px',
                        color:'var(--text)',fontSize:'13px',fontFamily:'inherit',outline:'none'}}/>
                  </div>
                  <NumInput label="월 기본급" value={customBaseSalary} onChange={setCustomBaseSalary} hint="센터 계약서 기준 고정 월급"/>
                  <NumInput label="인센티브율" value={customIncentiveRate} onChange={setCustomIncentiveRate} unit="%" hint="이번 달 결제액 대비 인센티브 지급 비율"/>
                </div>
              )}
              <div style={{background:'rgba(96,165,250,0.08)',border:'1px solid rgba(96,165,250,0.2)',
                borderRadius:'8px',padding:'10px 12px',marginBottom:'12px',fontSize:'11px',color:'#60a5fa',lineHeight:1.6}}>
                📌 <strong>정직원 세금 안내</strong><br/>4대보험(근로자부담 ~9.6%) · 근로소득세 간이세액 · 연말정산 (1월)
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'12px'}}>
                {[['세전 급여',e.grossPay,'#60a5fa'],['실수령 예상',e.payout,'var(--accent)'],
                  ['4대보험 공제',e.totalIns,'#fb923c'],['소득세+지방세',e.totalTax,'#f87171']
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:'var(--surface2)',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
                    <div style={{fontSize:'9px',color:c,fontWeight:600,marginBottom:'5px'}}>{l}</div>
                    <div style={{...mono,fontSize:'14px',fontWeight:700,color:c,lineHeight:1.2}}>{Number(v).toLocaleString()}</div>
                    <div style={{fontSize:'9px',color:'var(--text-dim)',marginTop:'3px'}}>원</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setShowDetail(d=>!d)}
                style={{width:'100%',background:'none',border:'none',color:'var(--text-dim)',
                  fontSize:'11px',cursor:'pointer',textAlign:'left',padding:'4px 0',marginBottom:'6px'}}>
                {showDetail?'▲':'▼'} 상세 내역
              </button>
              {showDetail && (
                <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',marginBottom:'12px'}}>
                  <Row label={`기본급 (${e.gradeLabel})`} value={e.baseSalary}/>
                  <Row label={`인센티브 (${Math.round(e.iRate*100)}%)`} value={e.incentiveAmt} sub={`결제액 × ${Math.round(e.iRate*100)}%`}/>
                  <div style={{borderTop:'1px solid var(--border)',margin:'6px 0'}}/>
                  <Row label="세전 합계" value={e.grossPay}/>
                  <div style={{marginTop:'6px',marginBottom:'4px',fontSize:'10px',color:'var(--text-dim)',fontWeight:600}}>4대보험 (근로자 부담)</div>
                  <Row label="국민연금 4.5%" value={-e.pension}/>
                  <Row label="건강보험 3.545%" value={-e.health}/>
                  <Row label="장기요양 (건강보험×12.95%)" value={-e.ltc}/>
                  <Row label="고용보험 0.9%" value={-e.employ}/>
                  <div style={{marginTop:'6px',marginBottom:'4px',fontSize:'10px',color:'var(--text-dim)',fontWeight:600}}>근로소득세 (간이세액 추정)</div>
                  <Row label="근로소득세" value={-e.incomeTax}/>
                  <Row label="지방소득세 10%" value={-e.localTax}/>
                  <div style={{borderTop:'1px solid var(--border)',margin:'6px 0'}}/>
                  <Row label="예상 실수령" value={e.payout} highlight/>
                  {lessonCount > 0 && <div style={{marginTop:'8px',fontSize:'11px',color:'var(--text-dim)'}}>📋 수업 완료 {lessonCount}회 기록됨</div>}
                  <div style={{marginTop:'10px',padding:'8px',background:'rgba(96,165,250,0.08)',
                    borderRadius:'6px',fontSize:'10px',color:'#60a5fa',lineHeight:1.6}}>
                    💡 4대보험 요율은 2024년 기준입니다.<br/>
                    💡 근로소득세는 간이세액표 추정값 — 연말정산으로 정산됩니다.<br/>
                    💡 식대 비과세 월 20만원 공제 적용.
                  </div>
                </div>
              )}
              {!hasGym && (
                <button onClick={()=>saveConfig({employment_type:'employee'})} disabled={savingCfg}
                  style={{width:'100%',padding:'11px',borderRadius:'8px',border:'none',
                    background:savingCfg?'var(--surface2)':'#60a5fa',color:savingCfg?'var(--text-dim)':'#0f0f0f',
                    fontWeight:700,fontSize:'13px',cursor:savingCfg?'default':'pointer',fontFamily:'inherit',transition:'all 0.2s',marginBottom:'8px'}}>
                  {savingCfg?'저장 중...':'💾 설정 저장'}
                </button>
              )}
              {hasGym && (status==='none'||status==='draft') && (
                <button onClick={async()=>{
                    const{data,error}=await supabase.rpc('calculate_settlement',{p_trainer_id:trainerId,p_year:year,p_month:month})
                    if(error){showToast('오류: '+error.message);return}
                    setSettle(data);showToast('✓ 정산이 계산됐어요')
                  }}
                  style={{width:'100%',padding:'11px',borderRadius:'8px',border:'none',
                    background:'var(--accent)',color:'#0f0f0f',fontWeight:700,fontSize:'13px',
                    cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                  {status==='draft'?'🔄 재계산':'📊 정산 계산하기'}
                </button>
              )}
              {hasGym && status==='confirmed' && (
                <div style={{textAlign:'center',fontSize:'12px',color:'#60a5fa',padding:'8px',background:'rgba(96,165,250,0.08)',borderRadius:'8px'}}>
                  ✅ 정산이 확정됐어요. 지급 처리 후 '지급완료'로 변경해주세요.
                </div>
              )}
              {hasGym && status==='paid' && (
                <div style={{textAlign:'center',fontSize:'12px',color:'var(--accent)',padding:'8px',background:'rgba(200,241,53,0.08)',borderRadius:'8px'}}>
                  🎉 지급 완료된 정산입니다.
                </div>
              )}
            </div>
          )
        })()
      )}
    </div>
  )
}

// ── AI 인사이트 패널 컴포넌트 ────────────────────────────────
function AiInsightPanel({ member, apiKey }) {
  const [phase, setPhase]       = useState('idle')   // idle | loading | done | error
  const [statusMsg, setStatus]  = useState('')
  const [stats, setStats]       = useState(null)
  const [insight, setInsight]   = useState('')
  const [errMsg, setErrMsg]     = useState('')
  const [showStats, setShowStats] = useState(false)

  async function generate() {
    if (!apiKey) {
      setPhase('error'); setErrMsg('AI 서비스 준비 중이에요. 잠시 후 다시 시도해주세요'); return
    }
    setPhase('loading'); setInsight(''); setErrMsg(''); setStats(null)

    try {
      // ── 데이터 로드 ──────────────────────────────────────────
      setStatus('데이터를 불러오는 중...')
      const [logsRes, healthRes, attendRes] = await Promise.all([
        supabase.from('logs').select('*').eq('member_id', member.id)
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('health_records').select('*').eq('member_id', member.id)
          .order('record_date', { ascending: false }).limit(60),
        supabase.from('attendance').select('*').eq('member_id', member.id)
          .order('attended_date', { ascending: false }),
      ])

      // ── 통계 계산 ────────────────────────────────────────────
      setStatus('데이터를 분석하는 중...')
      const computed = computeStats(
        member,
        logsRes.data  || [],
        healthRes.data || [],
        attendRes.data || [],
      )
      setStats(computed)

      // ── Gemini 호출 ──────────────────────────────────────────
      setStatus('AI가 인사이트를 생성하는 중...')
      const prompt = buildInsightPrompt(member, computed)
      const text   = await callGeminiInsight(apiKey, GEMINI_MODEL, prompt)
      setInsight(text)
      setPhase('done')
    } catch (e) {
      setErrMsg(e.message || 'AI 요청 중 오류가 발생했어요')
      setPhase('error')
    }
  }

  const mono = { fontFamily:"'DM Mono',monospace" }

  // ── 통계 요약 미니카드 ──────────────────────────────────────
  function StatChip({ label, value, color = 'var(--text)' }) {
    return (
      <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'8px 10px',textAlign:'center',minWidth:'64px'}}>
        <div style={{...mono,fontSize:'14px',fontWeight:700,color}}>{value ?? '—'}</div>
        <div style={{fontSize:'9px',color:'var(--text-dim)',marginTop:'3px'}}>{label}</div>
      </div>
    )
  }

  // ── AI 응답 파싱: 섹션별 색상 렌더링 ───────────────────────
  function renderInsight(text) {
    const SECTION_STYLES = {
      '✅': { color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)' },
      '⚠️': { color: '#facc15', bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.2)' },
      '💡': { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
      '💪': { color: 'var(--accent)', bg: 'rgba(200,241,53,0.08)', border: 'rgba(200,241,53,0.2)' },
    }
    // 섹션 분리
    const sections = []
    let current = null
    text.split('\n').forEach(line => {
      const emoji = ['✅','⚠️','💡','💪'].find(e => line.startsWith(e))
      if (emoji) {
        if (current) sections.push(current)
        current = { emoji, style: SECTION_STYLES[emoji], lines: [line] }
      } else if (current) {
        current.lines.push(line)
      } else {
        sections.push({ emoji: null, style: null, lines: [line] })
      }
    })
    if (current) sections.push(current)

    return sections.map((sec, i) => {
      const body = sec.lines.join('\n').trim()
      if (!body) return null
      if (!sec.emoji) {
        return <p key={i} style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'8px'}}>{body}</p>
      }
      return (
        <div key={i} style={{background: sec.style.bg, border:`1px solid ${sec.style.border}`,
          borderRadius:'10px',padding:'12px',marginBottom:'10px'}}>
          <pre style={{margin:0,fontSize:'13px',lineHeight:1.65,color:'var(--text)',
            whiteSpace:'pre-wrap',fontFamily:"'Noto Sans KR',sans-serif"}}>
            {body}
          </pre>
        </div>
      )
    })
  }

  return (
    <div>
      {/* ── 통계 요약 (로드 후 표시) ── */}
      {stats && (
        <div>
          <button onClick={() => setShowStats(s => !s)}
            style={{background:'none',border:'none',color:'var(--text-dim)',fontSize:'11px',
              cursor:'pointer',padding:'4px 0',marginBottom:'8px'}}>
            {showStats ? '▲' : '▼'} 데이터 요약
          </button>
          {showStats && (
            <div style={{marginBottom:'14px'}}>
              <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'6px'}}>출석</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'10px'}}>
                <StatChip label="누적" value={stats.totalAttend + '회'} />
                <StatChip label="최근4주" value={stats.recent4wAttend + '회'}
                  color={stats.attendTrend >= 0 ? 'var(--accent)' : '#f87171'} />
                <StatChip label="주평균" value={stats.weeklyAvg + '회'} />
                <StatChip label="최대연속" value={stats.maxStreak + '회'} color='var(--accent)' />
                {stats.daysSinceLast !== null && (
                  <StatChip label="마지막출석" value={stats.daysSinceLast + '일전'}
                    color={stats.daysSinceLast >= 7 ? '#f87171' : 'var(--text)'} />
                )}
              </div>
              {stats.latestWeight && (
                <>
                  <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'6px'}}>체중/건강</div>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'10px'}}>
                    <StatChip label="현재체중" value={stats.latestWeight + 'kg'} />
                    {member.start_weight && <StatChip label="변화"
                      value={(stats.latestWeight - member.start_weight).toFixed(1) + 'kg'}
                      color={(stats.latestWeight - member.start_weight) <= 0 ? 'var(--accent)' : '#f87171'} />}
                    {stats.trend4w && <StatChip label="주당추세"
                      value={(parseFloat(stats.trend4w) > 0 ? '+' : '') + stats.trend4w + 'kg'}
                      color={parseFloat(stats.trend4w) <= 0 ? 'var(--accent)' : '#facc15'} />}
                    {stats.avgSleep4w && <StatChip label="수면품질" value={stats.avgSleep4w + '/5'}
                      color={parseFloat(stats.avgSleep4w) >= 3.5 ? 'var(--accent)' : '#f87171'} />}
                  </div>
                </>
              )}
              <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'6px'}}>수업</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'10px'}}>
                <StatChip label="누적" value={stats.totalLogs + '회'} />
                <StatChip label="최근4주" value={stats.recent4wLogs + '회'}
                  color={stats.logTrend >= 0 ? 'var(--accent)' : '#f87171'} />
                {stats.avgGapDays && <StatChip label="평균간격" value={stats.avgGapDays + '일'} />}
                {stats.avgVolume > 0 && <StatChip label="평균볼륨" value={(stats.avgVolume/1000).toFixed(1) + 't'} color='#a78bfa' />}
              </div>
              {stats.topExercises.length > 0 && (
                <div style={{fontSize:'11px',color:'var(--text-muted)',lineHeight:1.7}}>
                  <span style={{color:'var(--text-dim)'}}>주요 종목 </span>
                  {stats.topExercises.map((e, i) => (
                    <span key={i} style={{marginRight:'8px'}}>
                      <span style={{color:'var(--text)'}}>{e.name}</span>
                      <span style={{color:'var(--accent)',fontSize:'10px',marginLeft:'2px'}}>{e.cnt}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AI 인사이트 결과 ── */}
      {phase === 'done' && insight && (
        <div style={{marginBottom:'14px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'12px'}}>
            <span style={{fontSize:'13px',fontWeight:700}}>AI 인사이트</span>
            <span style={{fontSize:'10px',color:'var(--text-dim)',background:'var(--surface2)',
              padding:'2px 8px',borderRadius:'4px'}}>Gemini</span>
          </div>
          {renderInsight(insight)}
        </div>
      )}

      {/* ── 에러 ── */}
      {phase === 'error' && (
        <div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',
          borderRadius:'10px',padding:'12px',marginBottom:'12px',fontSize:'12px',color:'#f87171'}}>
          ⚠️ {errMsg}
        </div>
      )}

      {/* ── 로딩 / 버튼 ── */}
      {phase === 'loading' ? (
        <div style={{textAlign:'center',padding:'20px',color:'var(--text-dim)',fontSize:'13px'}}>
          <div style={{fontSize:'24px',marginBottom:'8px',animation:'spin 1.5s linear infinite',
            display:'inline-block'}}>✦</div>
          <div>{statusMsg}</div>
        </div>
      ) : (
        <button onClick={generate}
          style={{width:'100%',padding:'11px',borderRadius:'8px',border:'none',
            background: phase === 'done' ? 'var(--surface2)' : 'var(--accent)',
            color: phase === 'done' ? 'var(--text-muted)' : '#0f0f0f',
            fontWeight:700,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>
          {phase === 'done' ? '🔄 다시 분석하기' : '🤖 AI 인사이트 생성'}
        </button>
      )}
    </div>
  )
}

// ── 이탈 위험 분석 패널 ───────────────────────────────────────
function RiskPanel({ member }) {
  const [phase, setPhase]     = useState('idle')  // idle | loading | done | error
  const [result, setResult]   = useState(null)
  const [rating, setRating]   = useState(0)       // 새 평점 입력
  const [saving, setSaving]   = useState(false)
  const showToast = useToast()

  async function analyze() {
    setPhase('loading')
    try {
      const [logsRes, healthRes, attendRes] = await Promise.all([
        supabase.from('logs').select('*').eq('member_id', member.id)
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('health_records').select('*').eq('member_id', member.id)
          .order('record_date', { ascending: false }).limit(60),
        supabase.from('attendance').select('*').eq('member_id', member.id),
      ])
      const r = computeRiskScore(
        member,
        logsRes.data  || [],
        healthRes.data || [],
        attendRes.data || [],
      )
      setResult(r)
      setPhase('done')
    } catch (e) {
      setPhase('error')
    }
  }

  async function saveRating() {
    if (!rating) return
    setSaving(true)
    // 가장 최근 로그에 평점 업데이트
    const { data: latestLog } = await supabase
      .from('logs').select('id').eq('member_id', member.id)
      .order('created_at', { ascending: false }).limit(1).single()
    if (latestLog) {
      await supabase.from('logs').update({ session_rating: rating }).eq('id', latestLog.id)
      showToast('✓ 수업 평점이 저장됐어요')
      setRating(0)
      if (phase === 'done') analyze() // 결과 갱신
    } else {
      showToast('최근 수업 기록이 없어요')
    }
    setSaving(false)
  }

  const mono = { fontFamily:"'DM Mono',monospace" }

  // 점수 바 컴포넌트
  function ScoreBar({ label, score, max, color }) {
    const pct = Math.round((score / max) * 100)
    return (
      <div style={{marginBottom:'10px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
          <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{label}</span>
          <span style={{...mono,fontSize:'11px',color,fontWeight:700}}>{score} / {max}</span>
        </div>
        <div style={{height:'5px',borderRadius:'3px',background:'var(--surface2)'}}>
          <div style={{height:'100%',borderRadius:'3px',width:`${pct}%`,background:color,transition:'width 0.4s'}} />
        </div>
      </div>
    )
  }

  const level = result ? getRiskLevel(result.riskScore) : null

  return (
    <div>
      {/* ── 수업 평점 입력 ── */}
      <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'12px',marginBottom:'14px'}}>
        <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'8px'}}>최근 수업 평점 입력 (1–5점)</div>
        <div style={{display:'flex',gap:'6px',marginBottom:'8px'}}>
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setRating(n)}
              style={{flex:1,padding:'8px 0',borderRadius:'8px',border:'1px solid',fontSize:'13px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                background: rating === n ? 'var(--accent)' : 'transparent',
                color: rating === n ? '#0f0f0f' : 'var(--text-muted)',
                borderColor: rating === n ? 'var(--accent)' : 'var(--border)'}}>
              {n}
            </button>
          ))}
        </div>
        <button onClick={saveRating} disabled={!rating || saving}
          style={{width:'100%',padding:'8px',borderRadius:'8px',border:'none',fontSize:'12px',fontWeight:600,cursor: rating ? 'pointer' : 'not-allowed',fontFamily:'inherit',
            background: rating ? 'var(--accent)' : 'var(--surface)',
            color: rating ? '#0f0f0f' : 'var(--text-dim)',opacity: rating ? 1 : 0.5}}>
          {saving ? '저장 중...' : '평점 저장'}
        </button>
      </div>

      {/* ── 분석 결과 ── */}
      {phase === 'done' && result && level && (
        <div>
          {/* 종합 점수 카드 */}
          <div style={{background: level.bg, border:`1px solid ${level.color}44`,
            borderRadius:'12px',padding:'16px',marginBottom:'14px',textAlign:'center'}}>
            <div style={{fontSize:'28px',marginBottom:'4px'}}>{level.emoji}</div>
            <div style={{...mono,fontSize:'36px',fontWeight:800,color: level.color,marginBottom:'4px'}}>
              {result.riskScore}
              <span style={{fontSize:'16px',fontWeight:400,color:'var(--text-dim)'}}>/ 100</span>
            </div>
            <div style={{fontSize:'14px',fontWeight:700,color: level.color}}>{level.label}</div>
          </div>

          {/* 세부 점수 바 */}
          <div style={{marginBottom:'14px'}}>
            <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'8px',fontWeight:600}}>세부 점수</div>
            <ScoreBar label="출석 위험도"   score={result.attendScore} max={40} color='#f97316' />
            <ScoreBar label="건강기록 중단" score={result.healthScore} max={30} color='#eab308' />
            <ScoreBar label="수업 평점 저하" score={result.ratingScore} max={30} color='#a78bfa' />
          </div>

          {/* 진단 근거 */}
          {result.flags.length > 0 && (
            <div style={{marginBottom:'14px'}}>
              <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'8px',fontWeight:600}}>⚠️ 위험 신호</div>
              {result.flags.map((f, i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',
                  background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.2)',
                  borderRadius:'8px',padding:'8px 10px',marginBottom:'6px',fontSize:'12px',color:'#fb923c'}}>
                  <span>⚠</span><span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {result.flags.length === 0 && (
            <div style={{textAlign:'center',padding:'12px',fontSize:'12px',color:'#22c55e'}}>
              🟢 현재 이탈 위험 신호 없음
            </div>
          )}

          {/* 세부 데이터 */}
          <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'10px',fontSize:'11px',color:'var(--text-dim)',lineHeight:1.8}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 12px'}}>
              <span>최근 2주 출석</span><span style={{...mono,color:'var(--text)'}}>{result.detail.recentAttend}회</span>
              <span>이전 2주 출석</span><span style={{...mono,color:'var(--text)'}}>{result.detail.prevAttend}회</span>
              {result.detail.daysSinceLast !== null && (
                <><span>마지막 출석</span><span style={{...mono,color:'var(--text)'}}>{result.detail.daysSinceLast}일 전</span></>
              )}
              <span>최근 2주 건강기록</span><span style={{...mono,color:'var(--text)'}}>{result.detail.recentHealthCount}건</span>
              {result.detail.recentRatingAvg !== null && (
                <><span>최근 평점 평균</span><span style={{...mono,color:'var(--text)'}}>{result.detail.recentRatingAvg?.toFixed(1)}/5</span></>
              )}
              {result.detail.ratedCount > 0 && (
                <><span>평점 기록 수</span><span style={{...mono,color:'var(--text)'}}>{result.detail.ratedCount}건</span></>
              )}
            </div>
          </div>

          <button onClick={analyze}
            style={{width:'100%',marginTop:'10px',padding:'9px',borderRadius:'8px',border:'1px solid var(--border)',
              background:'transparent',color:'var(--text-dim)',fontSize:'12px',cursor:'pointer',fontFamily:'inherit'}}>
            🔄 다시 분석
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div style={{color:'#f87171',fontSize:'12px',textAlign:'center',padding:'12px'}}>분석 중 오류가 발생했어요</div>
      )}

      {(phase === 'idle' || phase === 'loading') && (
        <button onClick={analyze} disabled={phase === 'loading'}
          style={{width:'100%',padding:'12px',borderRadius:'8px',border:'none',
            background: phase === 'loading' ? 'var(--surface2)' : '#f97316',
            color: phase === 'loading' ? 'var(--text-dim)' : '#fff',
            fontWeight:700,fontSize:'13px',cursor: phase === 'loading' ? 'not-allowed' : 'pointer',fontFamily:'inherit'}}>
          {phase === 'loading' ? '분석 중...' : '📊 이탈 위험 분석 시작'}
        </button>
      )}
    </div>
  )
}

const COLORS=[{id:'green',bg:'#c8f135',tx:'#1a3300'},{id:'blue',bg:'#60a5fa',tx:'#1e3a5f'},{id:'purple',bg:'#a78bfa',tx:'#2e1065'},{id:'coral',bg:'#fb923c',tx:'#431407'},{id:'pink',bg:'#f472b6',tx:'#500724'},{id:'teal',bg:'#2dd4bf',tx:'#134e4a'},{id:'yellow',bg:'#facc15',tx:'#422006'},{id:'gray',bg:'#94a3b8',tx:'#1e293b'}]
const DAYS=['월','화','수','목','금','토','일']
const SH=0,EH=24,SMIN=5,SPX=4

// ── 스크롤 애니메이션 헬퍼 ─────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}
function FadeUp({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.1)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0px)' : 'translateY(40px)',
      transition: `opacity 0.8s cubic-bezier(.22,1,.36,1) ${delay}ms, transform 0.8s cubic-bezier(.22,1,.36,1) ${delay}ms`,
    }}>{children}</div>
  )
}
function SlideCard({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.06)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0px)' : 'translateY(36px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      height: '100%',
    }}>{children}</div>
  )
}

export default function TrainerApp() {
  const showToast = useToast()
  const [screen, setScreen] = useState('landing') // landing, login, reg, app
  const [trainer, setTrainer] = useState(null)
  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('members')
  const [activePage, setActivePage] = useState('page-members')
  const [currentMemberId, setCurrentMemberId] = useState(null)
  const [exercises, setExercises] = useState([])
  const [audioData, setAudioData] = useState(null)
  const [audioMime, setAudioMime] = useState(null)
  const [audioName, setAudioName] = useState('')
  const [audioSize, setAudioSize] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [perspectiveInput, setPerspectiveInput] = useState('')  // AI 해석 관점
  const [previewContent, setPreviewContent] = useState('')
  const [finalContent, setFinalContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [rtab, setRtab] = useState('write')
  const [healthData, setHealthData] = useState(null)

  // Member sort
  const [memberSort, setMemberSort] = useState('created') // 'name' | 'created' | 'expire'
  const [memberSearch, setMemberSearch] = useState('')
  const [showRiskInfo, setShowRiskInfo] = useState(false)
  const [showReadModal, setShowReadModal] = useState(false)
  const [expandedLogId, setExpandedLogId] = useState(null)
  const [historyDateFilter, setHistoryDateFilter] = useState('')

  // Settings tab — leaderboard
  const [leaderboard, setLeaderboard] = useState(null)
  const [lbLoading, setLbLoading] = useState(false)

  // Settings tab — 플랜 안내
  const [planGuideVisible, setPlanGuideVisible] = useState(true)
  const [plansList, setPlansList] = useState(null)

  // 1:1 문의
  const [inquiries,      setInquiries]      = useState([])
  const [inqLoading,     setInqLoading]     = useState(false)
  const [inqSubmitting,  setInqSubmitting]  = useState(false)
  const [inqForm,        setInqForm]        = useState({ category:'general', title:'', content:'' })
  const [inqSelected,    setInqSelected]    = useState(null)   // 상세 보기용

  // Revenue tab — tooltip
  const [revTooltip, setRevTooltip] = useState(null)
  // Revenue tab — 회원별 결제 검색
  const [revMemberSearch, setRevMemberSearch] = useState('')

  // Settings — profile photo upload
  const [profileUploading, setProfileUploading] = useState(false)
  const profileInputRef = useRef(null)

  // Revenue tab — 월별 총 결제액
  const [payMonthStr, setPayMonthStr] = useState(() => {
    const n = new Date()
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0')
  })
  const [payMonthData, setPayMonthData] = useState(null)
  const [payMonthLoading, setPayMonthLoading] = useState(false)
  const [revenueRefreshKey, setRevenueRefreshKey] = useState(0)

  // Add member form
  const [addForm, setAddForm] = useState({name:'',kakao_phone:'',phone:'',birthdate:'',address:'',email:'',special_notes:'',purpose:'체형교정',visit_source:'',visit_source_memo:'',total:'',done:'0',price:'',memo:''})
  const [memberFilter, setMemberFilter] = useState('전체')
  const [riskMap, setRiskMap]           = useState({})  // { [memberId]: riskResult }

  // Edit member modal
  const [editMemberModal, setEditMemberModal] = useState(false)
  const [editMemberForm, setEditMemberForm] = useState({})
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false)
  const [sessionAdvOpen, setSessionAdvOpen] = useState(false)
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false)

  // Attendance
  const [attendanceDates, setAttendanceDates] = useState([]) // [{id, attended_date}]
  const [attendanceMonth, setAttendanceMonth] = useState(() => { const n=new Date(); return {y:n.getFullYear(),m:n.getMonth()} })

  // Products & Payments
  const [products, setProducts] = useState([])
  const [payments, setPayments] = useState([])
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentTab, setPaymentTab] = useState('pay') // 'pay' | 'products'
  const [productManageModal, setProductManageModal] = useState(false)
  const [productFormModal, setProductFormModal] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [productForm, setProductForm] = useState({name:'',count:'',priceEx:'',priceIn:''})
  const [paymentForm, setPaymentForm] = useState({productId:'',memo:'',customAmount:'',taxIncluded:false,paymentMethod:'card',paymentMethodMemo:''})
  const [cancelPaymentTarget, setCancelPaymentTarget] = useState(null) // 취소 확인 대상 payment

  // Personal Workout Log
  const MUSCLE_GROUPS = ['가슴','등','어깨','이두','삼두','하체','코어','유산소','전신']
  const MUSCLE_COLOR = {'가슴':'#ef4444','등':'#3b82f6','어깨':'#8b5cf6','이두':'#f97316','삼두':'#06b6d4','하체':'#22c55e','코어':'#eab308','유산소':'#ec4899','전신':'#6b7280'}
  const emptyWEx = () => ({localId:Date.now().toString(),name:'',muscle_group:'',sets:[{weight:'',reps:'',rest_sec:''}]})
  const [workoutSessions, setWorkoutSessions] = useState([])
  const [workoutRoutines, setWorkoutRoutines] = useState([])
  const [trainerLibraryRoutines, setTrainerLibraryRoutines] = useState([]) // 마켓 구매 루틴 (member_id IS NULL)
  const [workoutModal, setWorkoutModal] = useState(false)
  const [workoutEditId, setWorkoutEditId] = useState(null)
  const [workoutForm, setWorkoutForm] = useState({date:'',title:'',duration_min:'',memo:'',exercises:[emptyWEx()]})
  const [workoutRoutineModal, setWorkoutRoutineModal] = useState(false)
  const [workoutSaveRoutineName, setWorkoutSaveRoutineName] = useState('')
  const [workoutDetailId, setWorkoutDetailId] = useState(null)

  // Hold (정지/홀딩) modal
  const [holdModal, setHoldModal] = useState(false)
  const [holdForm, setHoldForm] = useState({startDate:'',endDate:'',productId:'',reason:'',photoFile:null,photoPreview:''})
  const [holds, setHolds] = useState([])

  // Exercise modal
  const [exModal, setExModal] = useState(false)
  const [exName, setExName] = useState('')
  const [newSets, setNewSets] = useState([])
  const [editingExId, setEditingExId] = useState(null)
  const [setReps, setSetReps] = useState('')
  const [setRir, setSetRir] = useState('')
  const [setFeel, setSetFeel] = useState('')

  // Settings modal
  const [settingsModal, setSettingsModal] = useState(false)
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false)
  const [aiUsage, setAiUsage] = useState(null)   // { plan, limit, used, remaining, blocked }
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [centralApiKey, setCentralApiKey] = useState('')  // 중앙화된 Gemini API 키
  const [credits, setCredits] = useState(0)               // 트레이너 크레딧 잔액

  // Schedule
  const [weekOff, setWeekOff] = useState(0)
  const [blocks, setBlocks] = useState(() => JSON.parse(localStorage.getItem('tl_sch')||'[]'))
  const [schModal, setSchModal] = useState(false)
  const [editBlockId, setEditBlockId] = useState(null)
  const [selColor, setSelColor] = useState('green')
  const [selType, setSelType] = useState('lesson')
  const [blockDate, setBlockDate] = useState('')
  const [blockStart, setBlockStart] = useState('09:00')
  const [blockEnd, setBlockEnd] = useState('10:00')
  const [blockMemo, setBlockMemo] = useState('')
  const [blockMemberId, setBlockMemberId] = useState('')
  const [blockTitle, setBlockTitle] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelType, setCancelType] = useState('')
  const [cancelDetail, setCancelDetail] = useState('')

  // Notifications
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem('tl_notif_enabled') === 'true')
  const [notifMinutes, setNotifMinutes] = useState(() => parseInt(localStorage.getItem('tl_notif_minutes')||'30'))

  // Login / OAuth
  const [authUser, setAuthUser] = useState(null)   // Supabase Auth user
  const [regName, setRegName] = useState('')
  const [regApi, setRegApi] = useState('')

  const audioInputRef = useRef(null)

  useEffect(() => { localStorage.setItem('tl_sch', JSON.stringify(blocks)) }, [blocks])

  // 알림 설정 localStorage 동기화
  useEffect(() => { localStorage.setItem('tl_notif_enabled', notifEnabled) }, [notifEnabled])
  useEffect(() => { localStorage.setItem('tl_notif_minutes', notifMinutes) }, [notifMinutes])

  // 알림 체크 인터벌 (30초마다)
  useEffect(() => {
    if (!notifEnabled) return
    async function checkAndNotify() {
      if (Notification.permission !== 'granted') return
      const now = new Date()
      // SW registration 가져오기 (백그라운드 알림 지원)
      const swReg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null
      blocks.forEach(b => {
        if (b.cancelled) return
        const blockTime = new Date(b.date + 'T' + b.start + ':00')
        const diffMin = (blockTime - now) / 60000
        if (diffMin > notifMinutes - 0.5 && diffMin <= notifMinutes + 0.5) {
          const key = `tl_notified_${b.id}_${b.date}_${notifMinutes}`
          if (localStorage.getItem(key)) return
          const label = b.type === 'lesson'
            ? (members.find(m => m.id === b.memberId)?.name || '회원') + ' 수업'
            : (b.title || '개인일정')
          const title = '🏋️ 오운 수업 알림'
          const options = {
            body: `${notifMinutes}분 후 [${label}] 시작 (${b.start})`,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: key,          // 같은 일정 중복 알림 방지
            renotify: false
          }
          // SW가 있으면 백그라운드 알림(탭 비활성/최소화 시에도 동작)
          if (swReg) swReg.showNotification(title, options)
          else new Notification(title, options)
          localStorage.setItem(key, '1')
        }
      })
    }
    checkAndNotify()
    const id = setInterval(checkAndNotify, 30000)
    return () => clearInterval(id)
  }, [notifEnabled, notifMinutes, blocks, members])

  async function requestNotifPermission() {
    if (!('Notification' in window)) { showToast('이 브라우저는 알림을 지원하지 않아요'); return }
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setNotifEnabled(true)
      showToast('✓ 알림이 활성화됐어요')
      // Web Push 구독 등록 (브라우저 완전 종료 시에도 알림)
      if ('serviceWorker' in navigator && import.meta.env.VITE_VAPID_PUBLIC_KEY && trainer?.id) {
        try { await subscribeToPush(trainer.id) } catch(e) { console.warn('Web Push 구독 실패:', e) }
      }
    } else {
      setNotifEnabled(false)
      showToast('알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요')
    }
  }
  async function toggleNotif(on) {
    if (on) {
      if (Notification.permission === 'granted') { setNotifEnabled(true); showToast('✓ 알림 켜짐') }
      else await requestNotifPermission()
    } else {
      setNotifEnabled(false); showToast('알림 꺼짐')
    }
  }

  const currentMember = members.find(m => m.id === currentMemberId)

  async function uploadProfilePhoto(file) {
    if (!file || !trainer) return
    const MAX_MB = 5
    if (file.size > MAX_MB * 1024 * 1024) { showToast(`사진은 ${MAX_MB}MB 이하로 업로드해주세요`); return }

    // 지원하는 이미지 형식 확인
    const allowedTypes = ['image/jpeg','image/jpg','image/png','image/webp','image/gif']
    if (!allowedTypes.includes(file.type)) {
      showToast('JPG, PNG, WebP, GIF 형식만 업로드할 수 있어요')
      return
    }

    setProfileUploading(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
      const path = `trainer_${trainer.id}_${Date.now()}.${ext}`

      // Storage 업로드
      const { error: upErr } = await supabase.storage
        .from('trainer-photos')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (upErr) {
        if (upErr.message?.includes('Bucket not found') || upErr.statusCode === 400) {
          throw new Error('스토리지 버킷이 준비되지 않았어요.\n\nSupabase SQL Editor에서 033_trainer_profile.sql을 실행해주세요.')
        }
        throw upErr
      }

      const { data: urlData } = supabase.storage.from('trainer-photos').getPublicUrl(path)
      const publicUrl = urlData?.publicUrl
      if (!publicUrl) throw new Error('URL 생성에 실패했어요')

      // DB 업데이트
      const { error: dbErr } = await supabase.from('trainers')
        .update({ profile_photo_url: publicUrl })
        .eq('id', trainer.id)

      if (dbErr) {
        if (dbErr.message?.includes('column') && dbErr.message?.includes('profile_photo_url')) {
          throw new Error('DB 컬럼이 없어요.\n\nSupabase SQL Editor에서 033_trainer_profile.sql을 실행해주세요.')
        }
        throw dbErr
      }

      setTrainer(prev => ({ ...prev, profile_photo_url: publicUrl }))
      showToast('✓ 프로필 사진이 업데이트됐어요')
    } catch(e) {
      console.error('프로필 업로드 오류:', e)
      showToast('업로드 실패: ' + (e.message || '알 수 없는 오류'))
    }
    setProfileUploading(false)
  }

  async function removeProfilePhoto() {
    if (!trainer) return
    try {
      await supabase.from('trainers').update({ profile_photo_url: null }).eq('id', trainer.id)
      setTrainer(prev => ({ ...prev, profile_photo_url: null }))
      showToast('✓ 프로필 사진이 삭제됐어요')
    } catch(e) { showToast('삭제 실패: ' + e.message) }
  }

  async function loadAiUsage(tid) {
    try {
      const { data, error } = await supabase.rpc('get_ai_usage', { p_trainer_id: tid })
      if (!error && data) setAiUsage(data)
    } catch(_) {}
  }

  // 중앙 Gemini API 키 로드 (앱 마운트 시 1회)
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'gemini_api_key').single()
      .then(({ data }) => { if (data?.value) setCentralApiKey(String(data.value).replace(/^"|"$/g, '')) })
      .catch(() => {})
  }, [])

  /* ── OAuth 로그인 ────────────────────────────────────────── */
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/trainer' },
    })
    if (error) showToast('구글 로그인 오류: ' + error.message)
  }
  async function signInWithKakao() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: window.location.origin + '/trainer' },
    })
    if (error) showToast('카카오 로그인 오류: ' + error.message)
  }

  async function handleAuthUser(au) {
    setAuthUser(au)
    // auth_id로 조회
    const { data: byId } = await supabase.from('trainers').select('*').eq('auth_id', au.id).maybeSingle()
    if (byId) { await _loginWithRecord(byId); return }
    // email로 조회 (기존 트레이너 연동)
    if (au.email) {
      const { data: byEmail } = await supabase.from('trainers').select('*').eq('email', au.email).maybeSingle()
      if (byEmail) {
        await supabase.from('trainers').update({ auth_id: au.id }).eq('id', byEmail.id)
        await _loginWithRecord({ ...byEmail, auth_id: au.id }); return
      }
    }
    // 신규 트레이너 → 등록 화면
    setRegName(au.user_metadata?.full_name || au.user_metadata?.name || au.email?.split('@')[0] || '')
    setScreen('reg')
  }

  async function _loginWithRecord(t) {
    setTrainer(t); setCredits(t.credits ?? 0); setScreen('app')
    showToast('✓ 환영해요, ' + t.name + ' 트레이너님!')
    const { data: libData } = await supabase.from('workout_routines').select('*')
      .eq('trainer_id', t.id).is('member_id', null).order('created_at', { ascending: false })
    setTrainerLibraryRoutines(libData || [])
    loadAiUsage(t.id)
  }

  async function register() {
    if (!regName) { showToast('이름을 입력해주세요'); return }
    if (!authUser) { showToast('먼저 소셜 로그인을 해주세요'); setScreen('login'); return }
    try {
      const { data: inserted, error } = await supabase
        .from('trainers')
        .insert({ name: regName, auth_id: authUser.id, email: authUser.email })
        .select().single()
      if (error) throw error
      await _loginWithRecord(inserted)
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // OAuth 인증 상태 감지
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthUser(session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleAuthUser(session.user)
      if (event === 'SIGNED_OUT') { setAuthUser(null); setTrainer(null); setMembers([]); setLogs([]); setScreen('landing') }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (trainer) { loadMembers(); loadLogs(); loadProducts() } }, [trainer])

  async function loadMembers() {
    const { data } = await supabase.from('members').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: false })
    setMembers(data || [])
    // 회원 목록 로드 후 백그라운드에서 리스크 점수 일괄 계산
    computeAllRiskScores(data || [])
  }

  async function computeAllRiskScores(memberList) {
    const active = memberList.filter(m => !m.suspended)
    if (!active.length) return
    try {
      const [logsAll, healthAll, attendAll] = await Promise.all([
        supabase.from('logs').select('id,member_id,created_at,session_rating,exercises_data')
          .eq('trainer_id', trainer.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('health_records').select('id,member_id,record_date,morning_weight,sleep_level')
          .in('member_id', active.map(m => m.id)),
        supabase.from('attendance').select('member_id,attended_date')
          .in('member_id', active.map(m => m.id)),
      ])
      const map = {}
      active.forEach(m => {
        const mLogs    = (logsAll.data  || []).filter(l => l.member_id === m.id)
        const mHealth  = (healthAll.data || []).filter(r => r.member_id === m.id)
        const mAttend  = (attendAll.data || []).filter(a => a.member_id === m.id)
        map[m.id] = computeRiskScore(m, mLogs, mHealth, mAttend)
      })
      setRiskMap(map)
    } catch (_) { /* 백그라운드 계산 실패 시 무시 */ }
  }
  async function loadLogs() {
    const { data } = await supabase.from('logs').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: false }).limit(50)
    setLogs(data || [])
  }

  async function loadProducts() {
    if (!trainer) return
    const { data } = await supabase.from('products').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: true })
    setProducts(data || [])
  }

  // 주간 리더보드 로드
  async function loadLeaderboard() {
    setLbLoading(true)
    try {
      // 이번 주 월요일 0시
      const now = new Date()
      const daysFromMon = (now.getDay() + 6) % 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - daysFromMon)
      monday.setHours(0, 0, 0, 0)

      const [logsRes, trainersRes] = await Promise.all([
        supabase.from('logs').select('trainer_id, read_at').gte('created_at', monday.toISOString()),
        supabase.from('trainers').select('id, name'),
      ])
      const weekLogs = logsRes.data || []
      const trainerMap = {}
      ;(trainersRes.data || []).forEach(t => { trainerMap[t.id] = t.name })

      const grouped = {}
      weekLogs.forEach(l => {
        if (!grouped[l.trainer_id]) grouped[l.trainer_id] = { count: 0, read: 0 }
        grouped[l.trainer_id].count++
        if (l.read_at) grouped[l.trainer_id].read++
      })
      const list = Object.entries(grouped)
        .map(([id, v]) => ({
          name: trainerMap[id] || '알 수 없음',
          logCount: v.count,
          readCount: v.read,
          readRate: v.count > 0 ? Math.round(v.read / v.count * 100) : 0,
          isMe: id === String(trainer?.id),
        }))
        .sort((a, b) => b.logCount - a.logCount)

      const totalRead = weekLogs.filter(l => l.read_at).length
      const overallRate = weekLogs.length > 0 ? Math.round(totalRead / weekLogs.length * 100) : 0
      setLeaderboard({ list, totalLogs: weekLogs.length, totalRead, overallRate })
    } catch(_) { setLeaderboard(null) }
    setLbLoading(false)
  }
  useEffect(() => {
    if (tab === 'settings' && trainer) {
      loadLeaderboard()
      loadPlanSettings()
    }
  }, [tab])

  async function loadPlanSettings() {
    try {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', ['plan_guide_visible', 'plans'])
      if (data) {
        const vis  = data.find(r => r.key === 'plan_guide_visible')
        const plns = data.find(r => r.key === 'plans')
        if (vis  != null) setPlanGuideVisible(vis.value)
        if (plns != null) setPlansList(plns.value)
      }
    } catch(_) {}
  }

  // 월별 총 결제액 로드
  async function loadMonthPayments(monthStr) {
    if (!trainer) return
    setPayMonthLoading(true)
    try {
      const [y, m] = monthStr.split('-').map(Number)
      const start = new Date(y, m-1, 1).toISOString()
      const end   = new Date(y, m,   1).toISOString()
      const { data } = await supabase.from('payments')
        .select('amount')
        .eq('trainer_id', trainer.id)
        .gte('paid_at', start)
        .lt('paid_at', end)
      const total = (data||[]).reduce((s,p) => s+(p.amount||0), 0)
      setPayMonthData({ total, count: (data||[]).length })
    } catch(_) { setPayMonthData(null) }
    setPayMonthLoading(false)
  }
  useEffect(() => { if (tab === 'revenue' && trainer) loadMonthPayments(payMonthStr) }, [tab, payMonthStr])
  useEffect(() => { if (tab === 'support' && trainer) loadInquiries() }, [tab])

  async function loadInquiries() {
    if (!trainer?.id) return
    setInqLoading(true)
    const { data } = await supabase.from('inquiries')
      .select('*').eq('trainer_id', trainer.id)
      .order('created_at', { ascending: false })
    setInquiries(data || [])
    setInqLoading(false)
  }
  async function submitInquiry() {
    if (!inqForm.title.trim())   return showToast('제목을 입력해주세요')
    if (!inqForm.content.trim()) return showToast('내용을 입력해주세요')
    setInqSubmitting(true)
    const { error } = await supabase.from('inquiries').insert({
      trainer_id: trainer.id,
      category:   inqForm.category,
      title:      inqForm.title.trim(),
      content:    inqForm.content.trim(),
    })
    setInqSubmitting(false)
    if (error) return showToast('문의 등록 중 오류가 발생했습니다')
    showToast('✓ 문의가 접수됐습니다')
    setInqForm({ category:'general', title:'', content:'' })
    loadInquiries()
  }

  async function loadPayments(memberId) {
    const { data } = await supabase.from('payments').select('*').eq('member_id', memberId).order('paid_at', { ascending: false })
    setPayments(data || [])
  }
  async function saveProduct() {
    const f = productForm
    if (!f.name || !f.count) { showToast('상품명과 횟수를 입력해주세요'); return }
    const payload = { trainer_id: trainer.id, name: f.name, session_count: parseInt(f.count)||0, price_excl_tax: parseInt(f.priceEx)||0, price_incl_tax: parseInt(f.priceIn)||0, memo: f.memo||null }
    try {
      if (editingProductId) {
        await supabase.from('products').update(payload).eq('id', editingProductId)
        showToast('✓ 상품이 수정됐어요')
      } else {
        await supabase.from('products').insert(payload)
        showToast('✓ 상품이 추가됐어요')
      }
      await loadProducts(); setProductFormModal(false)
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deleteProduct(id) {
    try {
      await supabase.from('products').delete().eq('id', id)
      await loadProducts(); showToast('상품이 삭제됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function addPayment() {
    const f = paymentForm
    const prod = products.find(p => p.id === f.productId)
    if (!prod) { showToast('상품을 선택해주세요'); return }
    const amount = f.taxIncluded ? (prod.price_incl_tax||prod.price_excl_tax) : prod.price_excl_tax
    try {
      await supabase.from('payments').insert({
        trainer_id: trainer.id, member_id: currentMemberId,
        product_id: prod.id, product_name: prod.name,
        session_count: prod.session_count, amount,
        tax_included: f.taxIncluded, memo: f.memo,
        payment_method: f.paymentMethod || 'card',
        payment_method_memo: (['payments_app','local_currency'].includes(f.paymentMethod) && f.paymentMethodMemo) ? f.paymentMethodMemo : null
      })
      // 회원 total_sessions 업데이트
      const m = members.find(x => x.id === currentMemberId)
      await supabase.from('members').update({ total_sessions: (m?.total_sessions||0) + prod.session_count }).eq('id', currentMemberId)
      await loadMembers(); await loadPayments(currentMemberId)
      setPaymentForm({productId:'',memo:'',taxIncluded:false,paymentMethod:'card',paymentMethodMemo:''})
      setRevenueRefreshKey(k => k + 1)
      loadMonthPayments(payMonthStr)
      showToast('✓ 결제가 등록됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deletePayment(payment) {
    try {
      await supabase.from('payments').delete().eq('id', payment.id)
      // 회원 total_sessions 복원
      const m = members.find(x => x.id === currentMemberId)
      await supabase.from('members').update({ total_sessions: Math.max(0,(m?.total_sessions||0) - payment.session_count) }).eq('id', currentMemberId)
      await loadMembers(); await loadPayments(currentMemberId)
      setRevenueRefreshKey(k => k + 1)
      loadMonthPayments(payMonthStr)
      showToast('결제가 취소됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // Hold (정지/홀딩)
  async function loadHolds(memberId) {
    const { data, error } = await supabase.from('member_holds').select('*').eq('member_id', memberId).order('start_date', { ascending: false })
    if (!error) setHolds(data || [])
  }
  async function addHold() {
    const f = holdForm
    if (!f.startDate || !f.endDate) { showToast('기간을 선택해주세요'); return }
    if (f.startDate > f.endDate) { showToast('종료일이 시작일보다 늦어야 해요'); return }
    try {
      const prod = products.find(p => p.id === f.productId)
      let photoUrl = null
      if (f.photoFile) {
        const ext = f.photoFile.name.split('.').pop()
        const path = `holds/${trainer.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('hold-photos').upload(path, f.photoFile)
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('hold-photos').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }
      const { error: insertErr } = await supabase.from('member_holds').insert({
        member_id: currentMemberId, trainer_id: trainer.id,
        product_id: f.productId || null, product_name: prod?.name || null,
        start_date: f.startDate, end_date: f.endDate,
        reason: f.reason || null, photo_url: photoUrl
      })
      if (insertErr) throw insertErr
      // 회원 상태 정지 처리
      await supabase.from('members').update({ suspended: true }).eq('id', currentMemberId)
      await loadMembers(); await loadHolds(currentMemberId)
      setEditMemberForm(prev => prev.id === currentMemberId ? {...prev, suspended: true} : prev)
      setHoldModal(false)
      showToast('✓ 정지(홀딩)가 등록됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deleteHold(holdId, memberId) {
    const mId = memberId || currentMemberId
    try {
      const { error: delErr } = await supabase.from('member_holds').delete().eq('id', holdId)
      if (delErr) throw delErr
      // 남은 홀딩 없으면 정지 해제
      const { data: remaining } = await supabase.from('member_holds').select('id').eq('member_id', mId)
      if (!remaining?.length) {
        await supabase.from('members').update({ suspended: false }).eq('id', mId)
        await loadMembers()
        setEditMemberForm(prev => prev.id === mId ? {...prev, suspended: false} : prev)
      }
      await loadHolds(mId)
      showToast('정지가 해제됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // Attendance
  async function loadAttendance(memberId) {
    const { y, m } = attendanceMonth
    const from = `${y}-${String(m+1).padStart(2,'0')}-01`
    const to = `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}`
    const { data } = await supabase.from('attendance').select('*').eq('member_id', memberId).gte('attended_date', from).lte('attended_date', to)
    setAttendanceDates(data || [])
  }
  async function toggleAttendance(dateStr) {
    const existing = attendanceDates.find(a => a.attended_date === dateStr)
    if (existing) {
      await supabase.from('attendance').delete().eq('id', existing.id)
    } else {
      await supabase.from('attendance').insert({ trainer_id: trainer.id, member_id: currentMemberId, attended_date: dateStr })
    }
    await loadAttendance(currentMemberId)
  }
  useEffect(() => { if (rtab === 'attendance' && currentMemberId) loadAttendance(currentMemberId) }, [rtab, attendanceMonth, currentMemberId])

  function showTabFn(t) {
    setTab(t)
    setActivePage('page-' + t)
  }

  // === MEMBERS ===
  async function addMember() {
    if (!addForm.name || !addForm.phone) { showToast('이름과 전화번호를 입력해주세요'); return }
    try {
      await supabase.from('members').insert({
        trainer_id: trainer.id, name: addForm.name, kakao_phone: addForm.kakao_phone, phone: addForm.phone,
        birthdate: addForm.birthdate || null, address: addForm.address || null,
        email: addForm.email || null, special_notes: addForm.special_notes || null,
        lesson_purpose: addForm.purpose,
        visit_source: addForm.visit_source || null,
        visit_source_memo: addForm.visit_source_memo || null,
        total_sessions: parseInt(addForm.total)||0, done_sessions: parseInt(addForm.done)||0,
        session_price: parseInt(addForm.price)||0, memo: addForm.memo
      })
      await loadMembers(); setActivePage('page-members'); setTab('members'); showToast('✓ 회원이 추가됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  function openRecord(memberId) {
    setCurrentMemberId(memberId); setExercises([]); setActivePage('page-record')
    setAudioData(null); setShowPreview(false); setShowSend(false); setRawInput(''); setFinalContent(''); setRtab('write')
    loadHolds(memberId)
  }

  function openEditMember(m) {
    setEditMemberForm({
      id: m.id, name: m.name, kakao_phone: m.kakao_phone||'', phone: m.phone||'',
      birthdate: m.birthdate||'', address: m.address||'',
      email: m.email||'', special_notes: m.special_notes||'',
      purpose: m.lesson_purpose||'체형교정',
      visit_source: m.visit_source||'', visit_source_memo: m.visit_source_memo||'',
      total: String(m.total_sessions||0), done: String(m.done_sessions||0),
      price: String(m.session_price||0), memo: m.memo||'',
      suspended: m.suspended||false
    })
    loadHolds(m.id)
    setSessionAdvOpen(false)
    setSessionInfoOpen(false)
    setEditMemberModal(true)
  }

  async function updateMember() {
    const f = editMemberForm
    if (!f.name || !f.phone) { showToast('이름과 전화번호를 입력해주세요'); return }
    try {
      await supabase.from('members').update({
        name: f.name, kakao_phone: f.kakao_phone, phone: f.phone,
        birthdate: f.birthdate || null, address: f.address || null,
        email: f.email || null, special_notes: f.special_notes || null,
        lesson_purpose: f.purpose,
        visit_source: f.visit_source || null, visit_source_memo: f.visit_source_memo || null,
        total_sessions: parseInt(f.total)||0,
        done_sessions: parseInt(f.done)||0, session_price: parseInt(f.price)||0,
        memo: f.memo
      }).eq('id', f.id)
      await loadMembers()
      setEditMemberModal(false)
      showToast('✓ 회원 정보가 수정됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function deleteMember() {
    try {
      await supabase.from('members').delete().eq('id', editMemberForm.id)
      await loadMembers()
      setDeleteConfirmModal(false)
      setEditMemberModal(false)
      showToast('회원이 삭제됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // === AUDIO ===
  function handleAudio(e) {
    const file = e.target.files[0]; if (!file) return
    if (file.size > 100*1024*1024) { showToast('파일이 너무 커요. 100MB 이하만 가능해요.'); return }
    setAudioName(file.name); setAudioSize((file.size/(1024*1024)).toFixed(1) + ' MB')
    const reader = new FileReader()
    reader.onload = ev => {
      setAudioData(ev.target.result.split(',')[1])
      setAudioMime(file.type || 'audio/m4a')
      showToast('✓ 파일 업로드 완료!')
    }
    reader.readAsDataURL(file)
  }
  function removeAudio() { setAudioData(null); if (audioInputRef.current) audioInputRef.current.value = '' }

  // === EXERCISES ===
  function openAddExercise() { setNewSets([]); setEditingExId(null); setExName(''); setSetReps(''); setSetRir(''); setSetFeel(''); setExModal(true) }
  function addSet() {
    if (!setReps) { showToast('횟수를 입력해주세요'); return }
    setNewSets([...newSets, { reps: setReps, rir: setRir, feel: setFeel }])
    setSetReps(''); setSetRir(''); setSetFeel('')
  }
  function confirmAddExercise() {
    if (!exName) { showToast('운동 종목명을 입력해주세요'); return }
    if (!newSets.length) { showToast('세트를 최소 1개 추가해주세요'); return }
    if (editingExId) {
      setExercises(exercises.map(e => e.id === editingExId ? { id: editingExId, name: exName, sets: [...newSets] } : e))
    } else {
      setExercises([...exercises, { id: Date.now().toString(), name: exName, sets: [...newSets] }])
    }
    setExModal(false)
  }
  function editExercise(id) {
    const ex = exercises.find(e => e.id === id); if (!ex) return
    setEditingExId(id); setNewSets([...ex.sets]); setExName(ex.name); setExModal(true)
  }

  // === GENERATE ===
  async function generateLog() {
    if (!audioData && !rawInput && !exercises.length) { showToast('녹음 파일을 업로드하거나 내용을 입력해주세요'); return }
    const key = centralApiKey
    if (!key) { showToast('AI 서비스 준비 중이에요. 잠시 후 다시 시도해주세요'); return }

    // ── 크레딧 체크 ──────────────────────────────────────────
    if (credits <= 0) { setShowLimitModal(true); return }
    // ─────────────────────────────────────────────────────────

    const m = currentMember
    setGenerating(true); setShowPreview(false); setShowSend(false)
    try {
      // ai_templates.buildSessionLogPrompt 로 프롬프트 생성
      const prompt = buildSessionLogPrompt({
        trainer,
        member:      m,
        exercises,
        rawInput,
        hasAudio:    !!audioData,
        perspective: perspectiveInput,
      })

      let text
      if (audioData) {
        // 멀티파트(오디오 + 텍스트) — ai_templates.callGeminiMultipart
        setAiStatus('AI가 수업 녹음을 분석하는 중...')
        text = await callGeminiMultipart(key, GEMINI_MODEL, [
          { inline_data: { mime_type: audioMime, data: audioData } },
          { text: prompt },
        ])
      } else {
        // 텍스트 전용 — ai_templates.callGemini
        setAiStatus('AI가 수업일지를 작성하는 중...')
        text = await callGemini(key, GEMINI_MODEL, prompt, { timeoutMs: 45000 })
      }

      setShowPreview(true); setPreviewContent(text); setFinalContent(text); setShowSend(true)
      showToast('✦ 수업일지 생성 완료!')

      // ── 크레딧 차감 ──────────────────────────────────────
      try {
        const { data: result } = await supabase.rpc('use_ai_credit', { p_trainer_id: trainer.id })
        if (result?.success) setCredits(result.credits)
      } catch(_) {}
      // ─────────────────────────────────────────────────────
    } catch(e) {
      showToast('오류: ' + e.message)
    } finally {
      setGenerating(false)
      setAiStatus('')
    }
  }

  // === SEND ===
  async function sendKakao() {
    const m = currentMember; if (!finalContent) { showToast('먼저 수업일지를 생성해주세요'); return }
    const reportId = Date.now().toString(36) + Math.random().toString(36).substr(2,5)
    try {
      const exData = exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({reps:s.reps,rir:s.rir,feel:s.feel,weight:s.weight||''})) }))
      const { error: logErr } = await supabase.from('logs').insert({ trainer_id:trainer.id, member_id:currentMemberId, content:finalContent, session_number:m.done_sessions+1, report_id:reportId, exercises_data:exData })
      if (logErr) throw new Error('일지 저장 실패: ' + logErr.message)
      const { error: memErr } = await supabase.from('members').update({ done_sessions: m.done_sessions+1 }).eq('id', currentMemberId)
      if (memErr) console.warn('세션 카운트 업데이트 실패:', memErr.message)
      await loadMembers(); await loadLogs()
      const reportUrl = window.location.origin + '/report?id=' + reportId
      const kakaoMsg = m.name + ' 회원님, 오늘 수업 리포트가 도착했어요! 👇\n' + reportUrl
      navigator.clipboard.writeText(kakaoMsg).then(() => showToast('✓ 일지 저장 완료! 링크 복사됨 — 카카오톡에 붙여넣기 하세요')).catch(()=>{})
      setTimeout(() => { setShowSend(false); setShowPreview(false); setAudioData(null); setRawInput(''); setPerspectiveInput(''); setFinalContent(''); setExercises([]) }, 1500)
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function saveSettings() {
    setSettingsModal(false); showToast('✓ 설정이 저장됐어요')
  }

  // === HEALTH VIEW ===
  async function loadHealthView() {
    try {
      const { data: records } = await supabase.from('health_records').select('*').eq('member_id', currentMemberId).order('record_date', { ascending: false }).limit(30)
      setHealthData(records || [])
    } catch(e) { setHealthData([]) }
  }
  useEffect(() => { if (rtab === 'health' && currentMemberId) loadHealthView() }, [rtab, currentMemberId])
  useEffect(() => { if (rtab === 'holds' && currentMemberId) loadHolds(currentMemberId) }, [rtab, currentMemberId])
  useEffect(() => { if (rtab === 'personal' && currentMemberId) { loadWorkoutSessions(currentMemberId); loadWorkoutRoutines(currentMemberId) } }, [rtab, currentMemberId])

  // === PERSONAL WORKOUT LOG ===
  async function loadWorkoutSessions(memberId) {
    const { data, error } = await supabase.from('workout_sessions').select('*').eq('member_id', memberId).order('workout_date', { ascending: false })
    if (!error) setWorkoutSessions(data || [])
  }
  async function loadWorkoutRoutines(memberId) {
    const { data, error } = await supabase.from('workout_routines').select('*').eq('member_id', memberId).order('created_at', { ascending: false })
    if (!error) setWorkoutRoutines(data || [])
  }
  async function loadTrainerLibraryRoutines() {
    if (!trainer?.id) return
    const { data } = await supabase
      .from('workout_routines')
      .select('*')
      .eq('trainer_id', trainer.id)
      .is('member_id', null)
      .order('created_at', { ascending: false })
    setTrainerLibraryRoutines(data || [])
  }
  function openWorkoutModal(session = null) {
    const today = new Date().toISOString().split('T')[0]
    if (session) {
      setWorkoutEditId(session.id)
      setWorkoutForm({ date: session.workout_date, title: session.title||'', duration_min: session.duration_min||'', memo: session.memo||'', exercises: session.exercises?.length ? session.exercises.map(e=>({...e,localId:e.localId||Date.now().toString()+Math.random()})) : [emptyWEx()] })
    } else {
      setWorkoutEditId(null)
      setWorkoutForm({ date: today, title: '', duration_min: '', memo: '', exercises: [emptyWEx()] })
    }
    setWorkoutSaveRoutineName('')
    setWorkoutModal(true)
  }
  function calcVolume(exercises) {
    return (exercises||[]).reduce((total, ex) => {
      const sets = ex?.sets || []
      return total + sets.reduce((s, set) => s + ((parseFloat(set?.weight)||0) * (parseInt(set?.reps)||0)), 0)
    }, 0)
  }
  async function saveWorkoutSession() {
    const f = workoutForm
    if (!f.date) { showToast('날짜를 입력해주세요'); return }
    try {
      const exercises = (f.exercises||[]).filter(e => e?.name?.trim())
      const total_volume = calcVolume(exercises)
      const cleanExercises = exercises.map(({ localId, ...rest }) => rest)
      if (workoutEditId) {
        const { error } = await supabase.from('workout_sessions').update({ title: f.title||null, workout_date: f.date, duration_min: parseInt(f.duration_min)||null, memo: f.memo||null, exercises: cleanExercises, total_volume }).eq('id', workoutEditId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workout_sessions').insert({ member_id: currentMemberId, trainer_id: trainer.id, source: 'trainer', title: f.title||null, workout_date: f.date, duration_min: parseInt(f.duration_min)||null, memo: f.memo||null, exercises: cleanExercises, total_volume })
        if (error) throw error
      }
      await loadWorkoutSessions(currentMemberId)
      setWorkoutModal(false)
      showToast(workoutEditId ? '✓ 운동일지가 수정됐어요' : '✓ 운동일지가 저장됐어요')
    } catch(e) {
      console.error('saveWorkoutSession error:', e)
      showToast('오류: ' + (e?.message || '알 수 없는 오류'))
    }
  }
  async function deleteWorkoutSession(id) {
    const { error } = await supabase.from('workout_sessions').delete().eq('id', id)
    if (!error) { await loadWorkoutSessions(currentMemberId); showToast('삭제됐어요') }
    else showToast('오류: ' + error.message)
  }
  async function saveAsRoutine() {
    if (!workoutSaveRoutineName.trim()) { showToast('루틴 이름을 입력해주세요'); return }
    const exercises = workoutForm.exercises.filter(e => e.name.trim())
    const { error } = await supabase.from('workout_routines').insert({ trainer_id: trainer.id, member_id: currentMemberId, name: workoutSaveRoutineName.trim(), exercises })
    if (!error) { await loadWorkoutRoutines(currentMemberId); setWorkoutSaveRoutineName(''); showToast('✓ 루틴으로 저장됐어요') }
    else showToast('오류: ' + error.message)
  }
  async function deleteWorkoutRoutine(id) {
    const { error } = await supabase.from('workout_routines').delete().eq('id', id)
    if (!error) { await loadWorkoutRoutines(currentMemberId); showToast('루틴이 삭제됐어요') }
  }
  // 마켓 라이브러리 루틴 → 현재 회원에게 복사 적용
  async function applyLibraryRoutineToMember(libRoutine) {
    if (!currentMemberId) { showToast('회원을 먼저 선택해주세요'); return }
    const memberName = currentMember?.name || '회원'
    const { error } = await supabase.from('workout_routines').insert({
      trainer_id: trainer.id,
      member_id:  currentMemberId,
      name:       libRoutine.name.replace(/^\[마켓\]\s*/, '') + ` (${memberName})`,
      exercises:  libRoutine.exercises,
    })
    if (error) { showToast('오류: ' + error.message); return }
    await loadWorkoutRoutines(currentMemberId)
    setWorkoutRoutineModal(false)
    showToast(`✅ "${libRoutine.name.replace(/^\[마켓\]\s*/, '')}" 루틴을 ${memberName} 회원에게 적용했어요`)
  }
  async function deleteLibraryRoutine(id) {
    if (!window.confirm('마켓 루틴을 보관함에서 삭제할까요?')) return
    const { error } = await supabase.from('workout_routines').delete().eq('id', id)
    if (!error) { await loadTrainerLibraryRoutines(); showToast('보관함에서 삭제됐어요') }
  }
  function loadRoutineIntoForm(routine) {
    const today = new Date().toISOString().split('T')[0]
    setWorkoutEditId(null)
    setWorkoutForm({ date: today, title: routine.name, duration_min: '', memo: '', exercises: routine.exercises.map(e=>({...e,localId:Date.now().toString()+Math.random(),sets:e.sets.map(s=>({...s,weight:'',reps:'',rest_sec:''})) })) })
    setWorkoutRoutineModal(false)
    setWorkoutModal(true)
  }
  // 운동 항목 조작
  function wfAddEx() { setWorkoutForm(f=>({...f,exercises:[...f.exercises,emptyWEx()]})) }
  function wfRemoveEx(localId) { setWorkoutForm(f=>({...f,exercises:f.exercises.filter(e=>e.localId!==localId)})) }
  function wfUpdateEx(localId, key, val) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,[key]:val}:e)})) }
  function wfAddSet(localId) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,sets:[...e.sets,{weight:'',reps:'',rest_sec:''}]}:e)})) }
  function wfRemoveSet(localId, idx) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,sets:e.sets.filter((_,i)=>i!==idx)}:e)})) }
  function wfUpdateSet(localId, idx, key, val) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,sets:e.sets.map((s,i)=>i===idx?{...s,[key]:val}:s)}:e)})) }

  // === SCHEDULE HELPERS ===
  function getWeekDates() {
    const now = new Date(); const day = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate()-(day===0?6:day-1)+weekOff*7)
    return Array.from({length:7},(_,i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d })
  }
  const dStr = d => d.toISOString().split('T')[0]
  const tToSlot = t => { const[h,m]=t.split(':').map(Number); return(h-SH)*60/SMIN+m/SMIN }
  const slotToT = s => { const tot=SH*60+s*SMIN; return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0') }

  function openAddBlock(ds, start, end) {
    setEditBlockId(null); setBlockDate(ds||dStr(new Date())); setBlockStart(start||'09:00'); setBlockEnd(end||'10:00')
    setBlockMemo(''); setBlockTitle(''); setSelType('lesson'); setSelColor('green')
    setBlockMemberId(members[0]?.id || ''); setShowCancelForm(false); setCancelType(''); setCancelDetail(''); setSchModal(true)
  }
  function openEditBlock(id) {
    const b = blocks.find(x => x.id === id); if (!b) return
    setEditBlockId(id); setBlockDate(b.date); setBlockStart(b.start); setBlockEnd(b.end)
    setBlockMemo(b.memo||''); setBlockTitle(b.title||''); setSelType(b.type); setSelColor(b.color)
    setBlockMemberId(b.memberId||''); setShowCancelForm(false); setCancelType(''); setCancelDetail(''); setSchModal(true)
  }
  function toggleCancel() {
    if (showCancelForm) {
      if (!cancelType) { showToast('취소 사유를 선택해주세요'); return }
      if (!editBlockId) return
      setBlocks(blocks.map(b => b.id===editBlockId ? {...b, cancelled:true, cancelType, cancelDetail} : b))
      setSchModal(false); showToast('취소 처리됐어요')
    } else {
      setShowCancelForm(true)
    }
  }
  async function saveBlock() {
    if (!blockDate||!blockStart||!blockEnd) { showToast('날짜와 시간을 입력해주세요'); return }
    if (blockStart>=blockEnd) { showToast('종료 시간이 시작보다 늦어야 해요'); return }
    const block = { id:editBlockId||Date.now().toString(), date:blockDate, start:blockStart, end:blockEnd, type:selType, color:selColor, memo:blockMemo.trim(), memberId:selType==='lesson'?blockMemberId:null, title:selType==='personal'?blockTitle.trim():null }
    setBlocks(editBlockId ? blocks.map(b=>b.id===editBlockId?block:b) : [...blocks,block])
    setSchModal(false); showToast(editBlockId?'✓ 수정됐어요!':'✓ 스케쥴 추가됐어요!')
    // Web Push 알림 예약 (설정 ON + 권한 허용 + 트레이너 로그인 상태)
    if (notifEnabled && Notification.permission==='granted' && trainer?.id && import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      try {
        const memberName = block.type==='lesson'
          ? (members.find(m=>m.id===block.memberId)?.name||'회원')
          : (block.title||'개인일정')
        await scheduleNotification(trainer.id, block, memberName, notifMinutes)
      } catch(e) { console.warn('알림 예약 실패:', e) }
    }
  }
  async function deleteBlock() {
    if (!editBlockId) return
    setBlocks(blocks.filter(b=>b.id!==editBlockId))
    setSchModal(false); showToast('삭제됐어요')
    if (trainer?.id && import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      try { await deleteScheduledNotification(trainer.id, editBlockId) } catch(e) {}
    }
  }

  // === RENDER SCHEDULE GRID ===
  function renderScheduleGrid() {
    const dates = getWeekDates(); const todayStr = dStr(new Date())
    const totalSlots = (EH-SH)*60/SMIN; const totalPx = totalSlots*SPX
    return (
      <div className="sg-wrap">
        <div className="sg" style={{display:'grid',gridTemplateColumns:'40px repeat(7,1fr)',minWidth:'480px'}}>
          <div className="sg-th-e" style={{height:'36px'}}></div>
          {dates.map((d,i) => {
            const isToday = dStr(d)===todayStr
            return <div key={i} className={`sg-th${isToday?' today':''}`}><span className="d">{d.getDate()}</span>{DAYS[i]}</div>
          })}
          <div className="sg-tc" style={{height:totalPx+'px',position:'relative'}}>
            {Array.from({length:totalSlots+1}).map((_,s) => {
              const min=s*SMIN
              if (min%60===0) { const h=SH+min/60; return <div key={s} className="sg-tl" style={{top:s*SPX+'px'}}>{h}:00</div> }
              return null
            })}
          </div>
          {dates.map(d => {
            const ds = dStr(d); const dayBlocks = blocks.filter(b=>b.date===ds)
            return (
              <div key={ds} className="sg-dc" style={{height:totalPx+'px'}} onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect(); const y = e.clientY-rect.top
                const slot = Math.round(y/SPX); const maxSlot = totalSlots
                openAddBlock(ds, slotToT(Math.max(0,slot)), slotToT(Math.min(slot+12,maxSlot)))
              }}>
                {Array.from({length:totalSlots}).map((_,s) => {
                  const min=s*SMIN
                  if (min%60===0) return <div key={s} className="sg-hl" style={{top:s*SPX+'px',borderTop:'1px solid var(--border)'}}></div>
                  if (min%30===0) return <div key={s} className="sg-hl" style={{top:s*SPX+'px',borderTop:'1px dashed rgba(255,255,255,0.04)'}}></div>
                  return null
                })}
                {dayBlocks.map(b => {
                  const h = Math.max((tToSlot(b.end)-tToSlot(b.start))*SPX-2,14); const top = tToSlot(b.start)*SPX+1
                  const col = COLORS.find(c=>c.id===b.color)||COLORS[0]
                  const label = b.type==='lesson'?(members.find(m=>m.id===b.memberId)?.name||'회원'):(b.title||'개인일정')
                  const cancelledStyle = b.cancelled ? {opacity:0.4,textDecoration:'line-through'} : {}
                  return (
                    <div key={b.id} className="sg-blk" style={{top:top+'px',height:h+'px',background:b.cancelled?'#444':col.bg,color:b.cancelled?'#aaa':col.tx,...cancelledStyle}} onClick={e => { e.stopPropagation(); openEditBlock(b.id) }}>
                      <span className="bn">{label}</span>
                      {h>22 && <span className="bt">{b.start}~{b.end}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // === 매출관리 ===
  function renderRevenue() {
    if (!members.length) return <div style={{textAlign:'center',padding:'40px',color:'var(--text-dim)'}}>회원을 먼저 추가해주세요</div>
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate()-(now.getDay()||7)+1); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const weekLogs = logs.filter(l => new Date(l.created_at) >= weekStart)
    const monthLogs = logs.filter(l => new Date(l.created_at) >= monthStart)
    const remainRevenue = members.reduce((s,m) => s+(m.session_price||0)*(m.total_sessions-m.done_sessions), 0)
    const weekRevenue = weekLogs.reduce((s,l) => { const m=members.find(x=>x.id===l.member_id); return s+(m?.session_price||0) }, 0)
    const monthRevenue = monthLogs.reduce((s,l) => { const m=members.find(x=>x.id===l.member_id); return s+(m?.session_price||0) }, 0)
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
    const projectedMonth = dayOfMonth>0 ? Math.round(monthRevenue/dayOfMonth*daysInMonth) : 0
    // payments는 전체 로드가 필요하므로 revenuePayments state 사용 (없으면 빈 배열)
    const handleRevenueRefresh = async () => {
      setRevenueRefreshKey(k => k + 1)
      await loadMonthPayments(payMonthStr)
      await loadMembers()
      await loadLogs()
      showToast('✓ 매출 현황을 새로고침했어요')
    }
    return (
      <div>
        {/* 새로고침 버튼 */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
          <div className="section-label" style={{margin:0}}>전체 매출 현황</div>
          <button
            onClick={handleRevenueRefresh}
            style={{
              display:'flex',alignItems:'center',gap:'5px',
              padding:'6px 14px',borderRadius:'10px',
              border:'1px solid var(--border)',
              background:'var(--surface)',
              color:'var(--text-muted)',fontSize:'12px',fontWeight:600,
              cursor:'pointer',fontFamily:'inherit',
              transition:'all 0.15s',
            }}
            onMouseEnter={e=>{e.currentTarget.style.background='var(--surface2)';e.currentTarget.style.color='var(--text)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='var(--surface)';e.currentTarget.style.color='var(--text-muted)'}}
          >
            <span style={{fontSize:'13px'}}>🔄</span> 새로고침
          </button>
        </div>
        <div style={{marginBottom:'14px'}}>
          {(() => {
            const REV_ITEMS = [
              [weekRevenue,  '이번 주 소진된 매출',    weekLogs.length+'회 수업',          'var(--accent)', '이번 주 월요일 00:00부터 오늘까지 발송된 수업일지 수 × 각 회원의 세션 단가를 합산한 금액이에요.'],
              [monthRevenue, '이번 달 소진된 매출',    monthLogs.length+'회 수업',          'var(--accent)', '이번 달 1일부터 오늘까지 발송된 수업일지 수 × 각 회원의 세션 단가를 합산한 금액이에요.'],
              [projectedMonth,'이번 달 예상 소진 매출',dayOfMonth+'/'+daysInMonth+'일 기준','#facc15',       '이번 달 소진 매출 ÷ 오늘까지 경과 일수 × 이번 달 총 일수로 계산해요. 현재 수업 페이스가 유지된다고 가정한 예상치예요.'],
              [remainRevenue,'미진행 세션 잔존가치',   '남은 세션 기준',                    '#60a5fa',       '전체 회원의 (총 세션 수 − 완료 세션 수) × 세션 단가를 합산한 금액이에요. 아직 진행하지 않은 세션의 이론적 가치예요.'],
            ]
            return (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                {REV_ITEMS.map(([v,label,sub,c,tip],i)=>(
                  <div key={i} className="card" style={{marginBottom:0,padding:'14px',position:'relative'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'6px'}}>
                      <span style={{fontSize:'10px',color:'var(--text-dim)',flex:1,lineHeight:1.4}}>{label}</span>
                      <button
                        onClick={()=>setRevTooltip(revTooltip===i?null:i)}
                        style={{flexShrink:0,width:'15px',height:'15px',borderRadius:'50%',
                          border:'1px solid var(--border)',background:'var(--surface2)',
                          color:'var(--text-dim)',fontSize:'8px',cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          padding:0,fontFamily:'inherit',lineHeight:1}}>?</button>
                    </div>
                    {revTooltip===i && (
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:20,
                        background:'#1a1a1a',border:'1px solid var(--border)',borderRadius:'10px',
                        padding:'10px 12px 10px 12px',marginTop:'4px',
                        fontSize:'11px',color:'var(--text-muted)',lineHeight:'1.7',
                        boxShadow:'0 8px 24px rgba(0,0,0,0.6)'}}>
                        {tip}
                        <button onClick={()=>setRevTooltip(null)}
                          style={{position:'absolute',top:'7px',right:'9px',background:'none',
                            border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'13px',lineHeight:1,padding:0}}>×</button>
                      </div>
                    )}
                    <div style={{fontSize:'20px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:c}}>{v.toLocaleString()}원</div>
                    <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'3px'}}>{sub}</div>
                  </div>
                ))}
              </div>
            )
          })()}
          {/* ── 월별 총 결제액 카드 ── */}
          {(() => {
            const [py, pm] = payMonthStr.split('-').map(Number)
            const label = `${py}년 ${pm}월 총 결제액`
            return (
              <div className="card" style={{marginBottom:0,padding:'16px',position:'relative'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                  <span style={{fontSize:'12px',fontWeight:700,color:'var(--text)',flex:1}}>{label}</span>
                  {/* 달력 버튼 */}
                  <div style={{position:'relative'}}>
                    <button
                      title="월 선택"
                      style={{
                        width:'30px',height:'30px',borderRadius:'8px',
                        border:'1px solid var(--border)',background:'var(--surface2)',
                        color:'var(--text-muted)',fontSize:'15px',cursor:'pointer',
                        display:'flex',alignItems:'center',justifyContent:'center',padding:0,
                      }}
                    >
                      📅
                      <input
                        type="month"
                        value={payMonthStr}
                        max={new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')}
                        onChange={e=>{ if(e.target.value) setPayMonthStr(e.target.value) }}
                        style={{
                          position:'absolute',inset:0,opacity:0,cursor:'pointer',
                          width:'100%',height:'100%',
                        }}
                      />
                    </button>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'flex-end',gap:'10px'}}>
                  <div style={{fontSize:'28px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'#34d399',lineHeight:1}}>
                    {payMonthLoading ? '—' : (payMonthData?.total??0).toLocaleString()}
                    <span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'3px'}}>원</span>
                  </div>
                  <div style={{fontSize:'11px',color:'var(--text-muted)',paddingBottom:'3px'}}>
                    {payMonthLoading ? '조회 중...' : `${payMonthData?.count??0}건 결제`}
                  </div>
                </div>
                <div style={{marginTop:'10px',height:'2px',background:'var(--border)',borderRadius:'1px',overflow:'hidden'}}>
                  <div style={{height:'100%',background:'#34d399',borderRadius:'1px',
                    width: payMonthData?.total > 0 ? '100%' : '0%',
                    transition:'width 0.6s ease'}} />
                </div>
                <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'5px'}}>
                  payments 테이블에 등록된 실제 결제 금액 기준이에요.
                </div>
              </div>
            )
          })()}
        </div>

        {/* 주간 리포트 — 접기/펼치기 */}
        <button
          onClick={() => setWeeklyReportOpen(o => !o)}
          style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            width:'100%', background:'var(--surface2)', border:'1px solid var(--border)',
            borderRadius:'10px', padding:'12px 14px', cursor:'pointer',
            fontFamily:'inherit', marginBottom: weeklyReportOpen ? '10px' : '16px',
            transition:'background 0.15s',
          }}
        >
          <span style={{fontSize:'13px', fontWeight:700, color:'var(--text)'}}>📋 주간 리포트</span>
          <span style={{fontSize:'16px', color:'var(--text-muted)', lineHeight:1}}>
            {weeklyReportOpen ? '▲' : '▼'}
          </span>
        </button>
        {weeklyReportOpen && (
          <div style={{marginBottom:'16px'}}>
            <WeeklyReportPanel gymId={trainer?.gym_id} apiKey={centralApiKey} />
          </div>
        )}

        <div className="section-label">정산 분석</div>
        <SettlementBreakdown trainerId={trainer?.id} showToast={showToast} members={members} />

        <div className="section-label">통합 매출 내역</div>
        <RevenuePaymentList trainerId={trainer?.id} members={members} refreshKey={revenueRefreshKey} />

        {/* 회원별 결제 관리 */}
        <div style={{marginTop:'24px',marginBottom:'12px'}}>
          {/* 헤더 행: 섹션명 + 상품 관리 버튼 */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <div className="section-label" style={{margin:0}}>회원별 결제 관리</div>
            <button
              onClick={()=>setProductManageModal(true)}
              style={{
                padding:'8px 16px',borderRadius:'10px',border:'none',
                background:'linear-gradient(135deg,#60a5fa,#818cf8)',
                color:'#fff',fontSize:'12px',fontWeight:700,
                cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',
                boxShadow:'0 2px 8px rgba(96,165,250,0.35)',
              }}>
              🗂 상품 관리
            </button>
          </div>
          {/* 검색창 */}
          <div style={{position:'relative',marginBottom:'10px'}}>
            <span style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',fontSize:'14px',pointerEvents:'none'}}>🔍</span>
            <input
              type="text"
              value={revMemberSearch}
              onChange={e=>setRevMemberSearch(e.target.value)}
              placeholder="회원 이름 검색..."
              style={{width:'100%',padding:'10px 36px 10px 36px',borderRadius:'10px',
                border:'1px solid var(--border)',background:'var(--surface)',
                color:'var(--text)',fontSize:'13px',fontFamily:'inherit',boxSizing:'border-box'}}
            />
            {revMemberSearch && (
              <button onClick={()=>setRevMemberSearch('')}
                style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',
                  background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'16px',lineHeight:1,padding:0}}>
                ×
              </button>
            )}
          </div>
          {/* 회원 카드 목록 */}
          {!revMemberSearch.trim() ? (
            <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-dim)',fontSize:'13px'}}>
              <div style={{fontSize:'28px',marginBottom:'8px'}}>🔍</div>
              회원 이름을 검색하면 결제 정보가 표시돼요
            </div>
          ) : (() => {
            const q = revMemberSearch.trim().toLowerCase()
            const filtered = members.filter(m => m.name.toLowerCase().includes(q))
            if (!filtered.length) return (
              <div style={{textAlign:'center',padding:'20px 0',color:'var(--text-dim)',fontSize:'13px'}}>
                <div style={{fontSize:'24px',marginBottom:'6px'}}>😅</div>
                '{revMemberSearch}' 회원을 찾을 수 없어요
              </div>
            )
            return filtered.map(m => {
              const mLogs = logs.filter(l => l.member_id === m.id)
              const mWeekLogs = mLogs.filter(l => new Date(l.created_at) >= weekStart)
              const mMonthLogs = mLogs.filter(l => new Date(l.created_at) >= monthStart)
              const price = m.session_price || 0
              const weekBlocks = blocks.filter(b => b.type==='lesson' && b.memberId===m.id && !b.cancelled && new Date(b.date+'T00:00:00')>=weekStart && new Date(b.date+'T00:00:00')<=now)
              const attendRate = weekBlocks.length>0 ? Math.round((mWeekLogs.length/weekBlocks.length)*100) : null
              const cancelledBlocks = blocks.filter(b => b.memberId===m.id && b.cancelled)
              const remain = m.total_sessions - m.done_sessions
              const pct = m.total_sessions>0 ? Math.round((m.done_sessions/m.total_sessions)*100) : 0
              return (
                <MemberRevenueCard key={m.id} m={m} mWeekLogs={mWeekLogs} mMonthLogs={mMonthLogs}
                  attendRate={attendRate} cancelledBlocks={cancelledBlocks}
                  remain={remain} pct={pct} price={price}
                  dayOfMonth={dayOfMonth} daysInMonth={daysInMonth}
                  trainerId={trainer?.id}
                  onOpenPayment={()=>{
                    setCurrentMemberId(m.id)
                    setPaymentTab('pay')
                    setPaymentForm({productId:'',memo:'',taxIncluded:false,paymentMethod:'card',paymentMethodMemo:''})
                    loadPayments(m.id)
                    setPaymentModal(true)
                  }} />
              )
            })
          })()}
        </div>
      </div>
    )
  }

  // === TRAINER LANDING SCREEN ===
  if (screen === 'landing') {
    const FEATURES = [
      { icon:'✦', title:'AI 수업일지 자동 생성', desc:'녹음 업로드 → AI 분석 → 완성된 일지까지 자동' },
      { icon:'👥', title:'회원 관리 올인원', desc:'결제·정지·방문경로·상태 배지까지 한 곳에' },
      { icon:'📅', title:'주간 스케줄', desc:'수업·개인 일정 블록 관리, 수업 전 푸시 알림' },
      { icon:'📊', title:'매출 자동 분석', desc:'세션 단가 기반 수익 & 잔존가치 실시간 계산' },
      { icon:'⏸', title:'정지(홀딩) 관리', desc:'기간·사유·사진 기록, 회원 상태 자동 반영' },
      { icon:'🔔', title:'브라우저 종료 알림', desc:'VAPID 푸시로 앱 닫아도 수업 알림 수신' },
    ]
    return (
      <div style={{background:'#F7F8F4',color:'#111827',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden'}}>

        {/* ── 상단 네비바 ── */}
        <div style={{background:'#fff',borderBottom:'1px solid #E1E4D9',padding:'14px 24px',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          boxShadow:'0 1px 8px rgba(0,0,0,0.05)',position:'sticky',top:0,zIndex:10}}>
          <div style={{fontSize:'17px',fontWeight:900,letterSpacing:'-0.5px',color:'#111'}}>
            오<span style={{background:'#c8f135',color:'#111',padding:'1px 7px',borderRadius:'5px',marginLeft:'2px'}}>운</span>
          </div>
          <Link to="/" style={{fontSize:'12px',color:'#9CA3AF',textDecoration:'none',fontWeight:500}}>← 메인으로</Link>
        </div>

        {/* ── 히어로 ── */}
        <FadeUp>
          <div style={{background:'#fff',borderBottom:'1px solid #E1E4D9',padding:'52px 24px 48px',textAlign:'center'}}>
            <div style={{maxWidth:'480px',margin:'0 auto'}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11px',fontWeight:700,
                letterSpacing:'0.13em',color:'#4d7c0f',background:'rgba(200,241,53,0.2)',padding:'5px 14px',
                borderRadius:'20px',border:'1px solid rgba(200,241,53,0.45)',marginBottom:'22px'}}>
                <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'#84cc16',display:'inline-block'}}/>
                TRAINER APP
              </div>
              <h1 style={{fontSize:'clamp(30px,7vw,48px)',fontWeight:900,letterSpacing:'-2px',lineHeight:1.08,
                color:'#111827',margin:'0 0 16px'}}>
                트레이너의 모든 것<br/>
                <span style={{color:'#4d7c0f',background:'rgba(200,241,53,0.18)',padding:'2px 12px',borderRadius:'10px'}}>하나로 연결</span>
              </h1>
              <p style={{fontSize:'14px',color:'#6B7280',lineHeight:1.9,maxWidth:'340px',margin:'0 auto 32px'}}>
                AI 수업일지부터 매출 분석까지, 수업에만 집중할 수 있도록
                나머지는 오운이 처리합니다.
              </p>
              <button onClick={()=>setScreen('login')} style={{
                background:'#c8f135',color:'#111',padding:'15px 36px',borderRadius:'12px',
                fontWeight:800,fontSize:'15px',border:'none',cursor:'pointer',
                boxShadow:'0 4px 20px rgba(200,241,53,0.42)',letterSpacing:'-0.3px',
                fontFamily:'inherit',display:'block',width:'100%',maxWidth:'300px',
                marginLeft:'auto',marginRight:'auto',marginBottom:'12px',transition:'all 0.2s'}}>
                트레이너 로그인 / 등록하기
              </button>
              <p style={{fontSize:'12px',color:'#9CA3AF',margin:0}}>이미 등록된 트레이너라면 바로 로그인하세요</p>
            </div>
          </div>
        </FadeUp>

        {/* ── 기능 그리드 ── */}
        <div style={{maxWidth:'640px',margin:'0 auto',padding:'40px 20px 60px'}}>
          <FadeUp>
            <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.1em',color:'#9CA3AF',
              textAlign:'center',marginBottom:'20px'}}>핵심 기능 6가지</div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'28px'}}>
            {FEATURES.map((f,i)=>(
              <SlideCard key={i} delay={i * 80}>
                <div style={{background:'#fff',border:'1px solid #E1E4D9',
                  borderRadius:'14px',padding:'18px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
                  transition:'box-shadow 0.2s',height:'100%',boxSizing:'border-box'}}>
                  <div style={{fontSize:'22px',marginBottom:'9px'}}>{f.icon}</div>
                  <div style={{fontSize:'13px',fontWeight:700,color:'#111827',marginBottom:'5px',letterSpacing:'-0.2px'}}>{f.title}</div>
                  <div style={{fontSize:'11px',color:'#6B7280',lineHeight:1.65}}>{f.desc}</div>
                </div>
              </SlideCard>
            ))}
          </div>

          {/* AI 하이라이트 배너 */}
          <FadeUp delay={100}>
            <div style={{background:'linear-gradient(135deg,#f0fcd4,#ecfccb)',
              border:'1px solid rgba(200,241,53,0.52)',borderRadius:'16px',padding:'24px',marginBottom:'12px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#4d7c0f',letterSpacing:'0.08em',marginBottom:'10px'}}>✦ AI POWERED</div>
              <div style={{fontSize:'15px',fontWeight:800,marginBottom:'10px',lineHeight:1.4,color:'#111827'}}>
                녹음 파일 하나로<br/>수업일지 완성 + 카카오 발송
              </div>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                {['녹음 업로드','AI 분석','일지 생성','카카오 발송'].map((s,i)=>(
                  <span key={i} style={{fontSize:'11px',padding:'4px 10px',borderRadius:'6px',
                    background:'rgba(200,241,53,0.38)',color:'#4d7c0f',fontWeight:600}}>
                    {i+1}. {s}
                  </span>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    )
  }

  // === LOGIN SCREEN ===
  if (screen === 'login') {
    return (
      <div className="login-wrap">
        <div style={{width:'100%',maxWidth:'400px'}}>
          {/* 로고 + 카드 */}
          <div style={{background:'#fff',border:'1px solid #E1E4D9',borderRadius:'22px',
            padding:'40px 32px',boxShadow:'0 8px 40px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04)'}}>

            {/* 로고 */}
            <div style={{marginBottom:'28px'}}>
              <div style={{fontSize:'22px',fontWeight:900,letterSpacing:'-0.5px',color:'#111',marginBottom:'6px'}}>
                오<span style={{background:'#c8f135',color:'#111',padding:'1px 7px',borderRadius:'5px',marginLeft:'2px'}}>운</span>
              </div>
              <div style={{fontSize:'13px',color:'#6B7280'}}>트레이너 전용 앱에 오신 것을 환영해요</div>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'10px',marginTop:'8px'}}>
              {/* Google */}
              <button onClick={signInWithGoogle} style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,
                width:'100%',padding:'13px 20px',borderRadius:'10px',
                border:'1px solid #E1E4D9',background:'#fff',color:'#111',
                fontSize:'14px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                <svg width="18" height="18" viewBox="0 0 18 18" style={{flexShrink:0}}>
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Google로 로그인
              </button>
              {/* Kakao */}
              <button onClick={signInWithKakao} style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,
                width:'100%',padding:'13px 20px',borderRadius:'10px',
                border:'none',background:'#FEE500',color:'#191919',
                fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{flexShrink:0}}>
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M9 1C4.582 1 1 3.806 1 7.25c0 2.178 1.417 4.09 3.56 5.19l-.91 3.394c-.08.3.264.535.518.356L8.44 13.84c.184.016.37.024.56.024 4.418 0 8-2.806 8-6.25S13.418 1 9 1z"
                    fill="#191919"/>
                </svg>
                카카오로 로그인
              </button>
            </div>

            <div style={{textAlign:'center',marginTop:'18px'}}>
              <Link to="/" style={{fontSize:'12px',color:'#9CA3AF',textDecoration:'none'}}>← 메인으로</Link>
            </div>
          </div>

          <div style={{textAlign:'center',marginTop:'14px'}}>
            <span style={{fontSize:'12px',color:'#9CA3AF',cursor:'pointer'}}
              onClick={()=>setScreen('landing')}>앱 소개 보기</span>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'reg') {
    return (
      <div className="login-wrap">
        <div style={{width:'100%',maxWidth:'400px'}}>
          <div style={{background:'#fff',border:'1px solid #E1E4D9',borderRadius:'22px',
            padding:'40px 32px',boxShadow:'0 8px 40px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04)'}}>

            <div style={{marginBottom:'24px'}}>
              <div style={{fontSize:'22px',fontWeight:900,letterSpacing:'-0.5px',color:'#111',marginBottom:'2px'}}>
                오<span style={{background:'#c8f135',color:'#111',padding:'1px 7px',borderRadius:'5px',marginLeft:'2px'}}>운</span>
              </div>
              <div style={{fontSize:'18px',fontWeight:800,color:'#111',marginTop:'12px',marginBottom:'4px',letterSpacing:'-0.3px'}}>트레이너 등록</div>
              <div style={{fontSize:'13px',color:'#6B7280'}}>처음 한 번만 등록하면 바로 시작할 수 있어요</div>
            </div>

            {authUser?.email && (
              <div style={{background:'#f9fafb',border:'1px solid #E1E4D9',borderRadius:'8px',
                padding:'10px 14px',marginBottom:'16px',fontSize:'13px',color:'#6B7280'}}>
                연결된 계정: <strong style={{color:'#111'}}>{authUser.email}</strong>
              </div>
            )}
            <div className="form-group">
              <label>이름 <span style={{color:'#9CA3AF',fontWeight:400}}>(앱에서 표시될 이름)</span></label>
              <input type="text" value={regName} onChange={e=>setRegName(e.target.value)} placeholder="홍길동"
                onKeyDown={e=>e.key==='Enter'&&register()} />
            </div>
            <button className="btn btn-primary btn-full"
              style={{marginTop:'4px',padding:'13px',fontSize:'14px'}} onClick={register}>
              트레이너 등록 완료
            </button>
            <div style={{textAlign:'center',marginTop:'16px'}}>
              <span style={{fontSize:'13px',color:'#4d7c0f',cursor:'pointer',fontWeight:600}}
                onClick={()=>setScreen('login')}>← 뒤로</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === MAIN APP ===
  return (
    <div>
      <div className="topbar-t">
        <div className="topbar-left"><Link to="/" style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'18px',textDecoration:'none'}}>⌂</Link><div className="topbar-title">오<span>운</span></div></div>
        <button className="settings-btn" onClick={()=>setSettingsModal(true)}>⚙ AI 설정</button>
      </div>
      <div className="tabs-t">
        {['members','history','schedule','revenue','settings','support'].map(t => (
          <div key={t} className={`tab-t${tab===t?' active':''}`} onClick={()=>showTabFn(t)}>
            {{members:'회원',history:'발송기록',schedule:'시간표',revenue:'매출관리',settings:'설정',support:'문의'}[t]}
          </div>
        ))}
      </div>

      {/* MEMBERS LIST */}
      {activePage === 'page-members' && (
        <div className="page-t">
          <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={()=>{setAddForm({name:'',kakao_phone:'',phone:'',birthdate:'',address:'',email:'',special_notes:'',purpose:'체형교정',visit_source:'',visit_source_memo:'',total:'',done:'0',price:'',memo:''});setActivePage('page-add-member')}}>+ 회원 추가</button>
            <button
              onClick={() => setShowReadModal(true)}
              title="일지 확인 현황"
              style={{
                position:'relative',flexShrink:0,width:'44px',height:'44px',
                border:'1px solid var(--border)',borderRadius:'10px',
                background:'var(--surface2)',cursor:'pointer',fontSize:'20px',
                display:'flex',alignItems:'center',justifyContent:'center',
              }}
            >
              ✅
              {(() => {
                const unread = logs.filter(l => !l.read_at).length
                return unread > 0 ? (
                  <span style={{
                    position:'absolute',top:'-6px',right:'-6px',
                    background:'#ef4444',color:'#fff',borderRadius:'10px',
                    fontSize:'10px',fontWeight:700,padding:'1px 5px',minWidth:'16px',textAlign:'center',lineHeight:'16px',
                  }}>{unread}</span>
                ) : null
              })()}
            </button>
          </div>
          {members.length > 0 && (() => {
            // 상태 계산
            function getStatus(m) {
              if (m.suspended) return 'suspended'
              const r = m.total_sessions - m.done_sessions
              if (r <= 0) return 'expired'
              if (r <= 3) return 'expiring'
              return 'active'
            }
            const STATUS_LABEL = { active:'활성', expiring:'만료예정', expired:'만료', suspended:'정지' }
            const STATUS_COLOR = { active:'#4ade80', expiring:'#f97316', expired:'#ef4444', suspended:'#9ca3af' }
            // 필터 + 정렬
            const searchQ = memberSearch.trim().toLowerCase()
            const filtered = [...members].filter(m => {
              // 이름 검색
              if (searchQ && !m.name.toLowerCase().includes(searchQ)) return false
              // 상태 필터
              const s = getStatus(m)
              if (memberFilter === '전체') return true
              if (memberFilter === '활성') return s === 'active' || s === 'expiring'
              if (memberFilter === '만료') return s === 'expired'
              if (memberFilter === '정지') return s === 'suspended'
              if (memberFilter === '이탈위험') {
                const rs = riskMap[m.id]
                return rs && (rs.riskLevel === 'risk' || rs.riskLevel === 'critical')
              }
              return true
            }).sort((a,b) => {
              if (memberSort === 'name') return a.name.localeCompare(b.name, 'ko')
              if (memberSort === 'expire') return (a.total_sessions-a.done_sessions) - (b.total_sessions-b.done_sessions)
              if (memberSort === 'risk') return (riskMap[b.id]?.riskScore ?? 0) - (riskMap[a.id]?.riskScore ?? 0)
              return new Date(b.created_at) - new Date(a.created_at)
            })
            return (
              <>
                {/* 이름 검색 */}
                <div style={{position:'relative',marginBottom:'8px'}}>
                  <span style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',fontSize:'14px',pointerEvents:'none'}}>🔍</span>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="이름으로 검색"
                    style={{width:'100%',padding:'8px 10px 8px 32px',borderRadius:'10px',border:'1px solid var(--border)',background:'var(--surface2)',color:'var(--text)',fontSize:'13px',fontFamily:'inherit',boxSizing:'border-box',outline:'none'}}
                  />
                  {memberSearch && (
                    <button
                      onClick={() => setMemberSearch('')}
                      style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--text-dim)',fontSize:'16px',cursor:'pointer',padding:'0',lineHeight:1}}
                    >×</button>
                  )}
                </div>

                {/* 상태 필터 */}
                <div style={{display:'flex',gap:'6px',marginBottom:'6px',flexWrap:'wrap'}}>
                  {['전체','활성','만료','정지'].map(f => (
                    <button key={f} onClick={()=>setMemberFilter(f)}
                      style={{flex:1,padding:'6px 4px',borderRadius:'8px',border:'1px solid',fontSize:'11px',fontWeight:500,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                        background: memberFilter===f ? 'var(--accent)' : 'var(--surface2)',
                        color: memberFilter===f ? '#0f0f0f' : 'var(--text-muted)',
                        borderColor: memberFilter===f ? 'var(--accent)' : 'var(--border)'}}>
                      {f}
                    </button>
                  ))}
                  {/* 이탈위험 필터 */}
                  {Object.keys(riskMap).length > 0 && (() => {
                    const riskCount = members.filter(m => {
                      const rs = riskMap[m.id]
                      return rs && (rs.riskLevel === 'risk' || rs.riskLevel === 'critical')
                    }).length
                    return (
                      <button onClick={()=>setMemberFilter('이탈위험')}
                        style={{padding:'6px 8px',borderRadius:'8px',border:'1px solid',fontSize:'11px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',whiteSpace:'nowrap',
                          background: memberFilter==='이탈위험' ? '#ef4444' : 'rgba(239,68,68,0.1)',
                          color: memberFilter==='이탈위험' ? '#fff' : '#ef4444',
                          borderColor: '#ef444444'}}>
                        🔴 이탈위험 {riskCount > 0 ? `(${riskCount})` : ''}
                      </button>
                    )
                  })()}
                </div>

                {/* 이탈위험이란? 버튼 + 설명 패널 */}
                {memberFilter === '이탈위험' && (
                  <div style={{marginBottom:'10px'}}>
                    <button
                      onClick={() => setShowRiskInfo(v => !v)}
                      style={{
                        display:'flex', alignItems:'center', gap:'5px',
                        background:'none', border:'1px solid rgba(239,68,68,0.3)',
                        borderRadius:'8px', padding:'6px 10px', cursor:'pointer',
                        fontFamily:'inherit', fontSize:'11px',
                        color:'#f87171', fontWeight:600, transition:'all 0.15s',
                      }}>
                      {showRiskInfo ? '▲' : '❓'} 이탈위험이란?
                    </button>

                    {showRiskInfo && (
                      <div style={{
                        marginTop:'8px', background:'rgba(239,68,68,0.06)',
                        border:'1px solid rgba(239,68,68,0.2)', borderRadius:'12px',
                        padding:'14px', fontSize:'12px', lineHeight:1.65,
                      }}>
                        {/* 위험 등급 */}
                        <div style={{fontWeight:700, color:'#f87171', marginBottom:'10px', fontSize:'13px'}}>
                          🔴 이탈위험 판단 기준
                        </div>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginBottom:'12px'}}>
                          {[
                            ['🟢 안전',      '0~29점',  '#22c55e'],
                            ['🟡 관찰',      '30~49점', '#eab308'],
                            ['🟠 위험',      '50~74점', '#f97316'],
                            ['🔴 이탈 임박', '75~100점','#ef4444'],
                          ].map(([label, range, color]) => (
                            <div key={label} style={{
                              background:'var(--surface2)', borderRadius:'8px',
                              padding:'8px 10px', borderLeft:`3px solid ${color}`,
                            }}>
                              <div style={{fontWeight:700, color, fontSize:'11px'}}>{label}</div>
                              <div style={{color:'var(--text-dim)', fontSize:'10px', marginTop:'2px'}}>{range}</div>
                            </div>
                          ))}
                        </div>

                        {/* 3가지 신호 */}
                        <div style={{fontWeight:700, color:'var(--text)', marginBottom:'8px', fontSize:'12px'}}>
                          📊 3가지 신호로 0~100점 산출
                        </div>

                        {/* A. 출석 */}
                        <div style={{
                          background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.2)',
                          borderRadius:'8px', padding:'10px', marginBottom:'8px',
                        }}>
                          <div style={{fontWeight:700, color:'#60a5fa', marginBottom:'6px'}}>
                            A. 출석 위험도 <span style={{fontWeight:400, color:'var(--text-dim)'}}>0~40점</span>
                          </div>
                          <div style={{color:'var(--text-muted)'}}>
                            · 마지막 출석 <b style={{color:'var(--text)'}}>7일</b> 경과 → +6점<br/>
                            · 마지막 출석 <b style={{color:'var(--text)'}}>14일</b> 경과 → +13점<br/>
                            · 마지막 출석 <b style={{color:'var(--text)'}}>21일</b> 경과 → +20점<br/>
                            · 최근 2주 출석 0회 (이전 대비) → +20점<br/>
                            · 출석 빈도 <b style={{color:'var(--text)'}}>50% 이상</b> 감소 → +12점
                          </div>
                        </div>

                        {/* B. 건강기록 */}
                        <div style={{
                          background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)',
                          borderRadius:'8px', padding:'10px', marginBottom:'8px',
                        }}>
                          <div style={{fontWeight:700, color:'#4ade80', marginBottom:'6px'}}>
                            B. 건강기록 중단 <span style={{fontWeight:400, color:'var(--text-dim)'}}>0~30점</span>
                          </div>
                          <div style={{color:'var(--text-muted)'}}>
                            · 최근 2주 체중/수면 기록 <b style={{color:'var(--text)'}}>전혀 없음</b> → +20점<br/>
                            · 기록 빈도 50% 이상 감소 → +10점<br/>
                            · 수면 품질 <b style={{color:'var(--text)'}}>2점 이하</b> (10점 만점) → +10점<br/>
                            · 수면 품질 2점 이상 하락 → +6점
                          </div>
                        </div>

                        {/* C. 수업 평점 */}
                        <div style={{
                          background:'rgba(250,204,21,0.08)', border:'1px solid rgba(250,204,21,0.2)',
                          borderRadius:'8px', padding:'10px', marginBottom:'10px',
                        }}>
                          <div style={{fontWeight:700, color:'#facc15', marginBottom:'6px'}}>
                            C. 수업 평점 저하 <span style={{fontWeight:400, color:'var(--text-dim)'}}>0~30점</span>
                          </div>
                          <div style={{color:'var(--text-muted)'}}>
                            · 최근 3회 평점 <b style={{color:'var(--text)'}}>2점 이하</b> (5점 만점) → +20점<br/>
                            · 최근 3회 평점 <b style={{color:'var(--text)'}}>3점 이하</b> → +10점<br/>
                            · 이전 대비 평점 <b style={{color:'var(--text)'}}>1.5점 이상</b> 급락 → +10점<br/>
                            · 1.0점 이상 하락 → +5점
                          </div>
                        </div>

                        <div style={{fontSize:'10px', color:'var(--text-dim)', lineHeight:1.6}}>
                          💡 <b>위험(50점 이상)</b> · <b>이탈임박(75점 이상)</b> 회원이 필터에 표시됩니다.<br/>
                          💡 점수는 출석·건강기록·수업일지 데이터를 기반으로 자동 계산됩니다.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 정렬 */}
                <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
                  {[['created','등록일자순'],['name','이름순'],['expire','만료예정순'],['risk','위험도순']].map(([key,label])=>(
                    <button key={key} onClick={()=>setMemberSort(key)}
                      style={{flex:1,padding:'6px 4px',borderRadius:'8px',border:'1px solid',fontSize:'11px',fontWeight:500,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                        background: memberSort===key ? 'var(--surface2)' : 'transparent',
                        color: memberSort===key ? 'var(--text)' : 'var(--text-dim)',
                        borderColor: memberSort===key ? 'var(--border)' : 'transparent'}}>
                      {label}
                    </button>
                  ))}
                </div>
                {!filtered.length && (
                  <div className="empty">
                    <p>{searchQ ? `"${memberSearch}" 검색 결과가 없어요` : '해당하는 회원이 없어요'}</p>
                  </div>
                )}
                {filtered.map(m => {
                  const status = getStatus(m)
                  const pct = m.total_sessions>0?Math.round((m.done_sessions/m.total_sessions)*100):0
                  const remain = m.total_sessions-m.done_sessions; const low = remain<=3
                  const riskResult = riskMap[m.id]
                  const riskLv = riskResult ? getRiskLevel(riskResult.riskScore) : null
                  return (
                    <div key={m.id} className="member-card" onClick={()=>openRecord(m.id)}>
                      <div className="member-avatar" style={riskLv && riskResult.riskLevel !== 'safe' ? {boxShadow:`0 0 0 2px ${riskLv.color}66`} : {}}>
                        {m.name[0]}
                      </div>
                      <div className="member-info">
                        <div className="member-name" style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap'}}>
                          <span style={{fontSize:'10px',fontWeight:600,padding:'1px 6px',borderRadius:'4px',background: STATUS_COLOR[status]+'22',color: STATUS_COLOR[status],border:`1px solid ${STATUS_COLOR[status]}44`,flexShrink:0}}>
                            {STATUS_LABEL[status]}
                          </span>
                          {riskLv && riskResult.riskLevel !== 'safe' && (
                            <span style={{fontSize:'10px',fontWeight:700,padding:'1px 5px',borderRadius:'4px',background: riskLv.bg,color: riskLv.color,border:`1px solid ${riskLv.color}44`,flexShrink:0}}>
                              {riskLv.emoji} {riskResult.riskScore}
                            </span>
                          )}
                          {m.name}
                        </div>
                        <div className="member-meta">📱 {m.phone}{m.lesson_purpose?' · '+m.lesson_purpose:''}</div>
                        <div className="session-bar-bg"><div className={`session-bar-fill${low?' low':''}`} style={{width:pct+'%'}}></div></div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span className={`session-badge${low?' low':''}`}>{m.done_sessions}/{m.total_sessions}</span>
                        <button className="btn btn-ghost btn-sm" style={{padding:'4px 8px',fontSize:'13px'}} onClick={e=>{e.stopPropagation();openEditMember(m)}}>✏️</button>
                      </div>
                    </div>
                  )
                })}
              </>
            )
          })()}
          {!members.length && <div className="empty"><div style={{fontSize:'36px',marginBottom:'12px'}}>👥</div><p>아직 회원이 없어요.<br/>위에서 첫 회원을 추가해보세요!</p></div>}
        </div>
      )}

      {/* HISTORY */}
      {activePage === 'page-history' && (
        <div className="page-t">
          {/* 날짜 필터 바 */}
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
            <div style={{flex:1,position:'relative'}}>
              <span style={{position:'absolute',left:'11px',top:'50%',transform:'translateY(-50%)',fontSize:'15px',pointerEvents:'none'}}>📅</span>
              <input
                type="date"
                value={historyDateFilter}
                onChange={e=>{ setHistoryDateFilter(e.target.value); setExpandedLogId(null) }}
                style={{width:'100%',padding:'9px 36px 9px 36px',borderRadius:'10px',
                  border:'1px solid '+(historyDateFilter?'var(--accent)':'var(--border)'),
                  background: historyDateFilter?'rgba(200,241,53,0.06)':'var(--surface)',
                  color: historyDateFilter?'var(--accent)':'var(--text-muted)',
                  fontSize:'13px',fontFamily:'inherit',boxSizing:'border-box',cursor:'pointer'}}
              />
              {historyDateFilter && (
                <button onClick={()=>{setHistoryDateFilter('');setExpandedLogId(null)}}
                  style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',
                    background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'17px',lineHeight:1,padding:0}}>
                  ×
                </button>
              )}
            </div>
            {historyDateFilter && (
              <div style={{fontSize:'11px',color:'var(--accent)',whiteSpace:'nowrap',fontWeight:600}}>
                {logs.filter(l=>new Date(l.created_at).toISOString().slice(0,10)===historyDateFilter).length}건
              </div>
            )}
          </div>

          {/* 일지 목록 */}
          {(() => {
            const filtered = historyDateFilter
              ? logs.filter(l => new Date(l.created_at).toISOString().slice(0,10) === historyDateFilter)
              : logs
            if (!logs.length) return <div className="empty"><div style={{fontSize:'36px',marginBottom:'12px'}}>📋</div><p>발송한 수업일지가 없어요.</p></div>
            if (historyDateFilter && !filtered.length) return (
              <div className="empty">
                <div style={{fontSize:'32px',marginBottom:'10px'}}>🗓</div>
                <p style={{color:'var(--text-muted)'}}>
                  {new Date(historyDateFilter+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric'})}에 발송된 일지가 없어요
                </p>
              </div>
            )
            return filtered.map(l => {
            const d = new Date(l.created_at)
            const dateStr = d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
            const timeStr = d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
            const mem = members.find(x=>x.id===l.member_id)
            const isOpen = expandedLogId === l.id
            return (
              <div key={l.id}
                onClick={()=>setExpandedLogId(isOpen ? null : l.id)}
                style={{
                  background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:'12px',marginBottom:'8px',overflow:'hidden',
                  cursor:'pointer',transition:'border-color 0.15s',
                  borderColor: isOpen ? 'var(--accent)' : 'var(--border)',
                }}>
                {/* 항상 보이는 요약 행 */}
                <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 14px'}}>
                  {/* 회원 아바타 */}
                  <div style={{width:'34px',height:'34px',borderRadius:'50%',background:'var(--accent)',
                    color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',
                    fontWeight:700,fontSize:'13px',flexShrink:0}}>
                    {mem?.name?.[0] || '?'}
                  </div>
                  {/* 이름 + 회차 */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>
                      {mem?.name || '회원'} <span style={{color:'var(--text-muted)',fontWeight:400}}>· {l.session_number}회차</span>
                    </div>
                    <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'1px'}}>{dateStr} {timeStr}</div>
                  </div>
                  {/* 열람 상태 + 화살표 */}
                  <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
                    {l.read_at
                      ? <span style={{fontSize:'10px',color:'#4ade80',fontWeight:600,background:'rgba(74,222,128,0.1)',padding:'2px 7px',borderRadius:'6px'}}>✅ 확인</span>
                      : <span style={{fontSize:'10px',color:'#9ca3af',background:'var(--surface2)',padding:'2px 7px',borderRadius:'6px'}}>⏳ 미확인</span>
                    }
                    <span style={{fontSize:'12px',color:'var(--text-dim)',transition:'transform 0.2s',
                      display:'inline-block',transform:isOpen?'rotate(180deg)':'rotate(0deg)'}}>▼</span>
                  </div>
                </div>
                {/* 펼쳐진 전체 내용 */}
                {isOpen && (
                  <div style={{padding:'0 14px 14px',borderTop:'1px solid var(--border)'}}>
                    <div style={{paddingTop:'12px',fontSize:'13px',color:'var(--text)',lineHeight:'1.8',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                      {l.content || '내용 없음'}
                    </div>
                    {l.read_at && (
                      <div style={{marginTop:'10px',fontSize:'11px',color:'var(--text-dim)'}}>
                        열람일: {new Date(l.read_at).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'})}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
          })()}
        </div>
      )}

      {/* SCHEDULE */}
      {activePage === 'page-schedule' && (
        <div className="page-t">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
            <div className="week-nav">
              <button className="week-nav-btn" onClick={()=>setWeekOff(weekOff-1)}>‹</button>
              <div className="week-label">{(() => { const d = getWeekDates(); return (d[0].getMonth()+1)+'/'+d[0].getDate()+' — '+(d[6].getMonth()+1)+'/'+d[6].getDate() })()}</div>
              <button className="week-nav-btn" onClick={()=>setWeekOff(weekOff+1)}>›</button>
            </div>
            <div style={{display:'flex',gap:'6px'}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setWeekOff(0)} style={{fontSize:'12px'}}>오늘</button>
              <button className="btn btn-primary btn-sm" onClick={()=>openAddBlock(null,null,null)} style={{fontSize:'12px'}}>+ 추가</button>
            </div>
          </div>

          {/* 알림 설정 */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px 14px',marginBottom:'12px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:'13px',fontWeight:500}}>알림 사용</div>
                <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>일정 시작 전 미리 알림을 받아요</div>
              </div>
              <div onClick={()=>toggleNotif(!notifEnabled)}
                style={{width:'44px',height:'24px',borderRadius:'12px',cursor:'pointer',transition:'background 0.2s',position:'relative',flexShrink:0,
                  background: notifEnabled ? 'var(--accent)' : 'var(--surface2)',
                  border: '1px solid ' + (notifEnabled ? 'var(--accent)' : 'var(--border)')}}>
                <div style={{position:'absolute',top:'2px',width:'18px',height:'18px',borderRadius:'50%',background: notifEnabled ? '#0f0f0f' : 'var(--text-dim)',transition:'left 0.2s',
                  left: notifEnabled ? '22px' : '2px'}}></div>
              </div>
            </div>
            {notifEnabled && (
              <div style={{marginTop:'12px',borderTop:'1px solid var(--border)',paddingTop:'12px'}}>
                <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'8px'}}>몇 분 전에 알림을 받을까요?</div>
                <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'8px'}}>
                  {[5,10,15,30,60].map(v => (
                    <button key={v} onClick={()=>setNotifMinutes(v)}
                      style={{padding:'5px 11px',borderRadius:'8px',border:'1px solid',fontSize:'12px',cursor:'pointer',fontFamily:'inherit',
                        background: notifMinutes===v ? 'var(--accent)' : 'var(--surface2)',
                        color: notifMinutes===v ? '#0f0f0f' : 'var(--text-muted)',
                        borderColor: notifMinutes===v ? 'var(--accent)' : 'var(--border)'}}>
                      {v}분
                    </button>
                  ))}
                  <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                    <input type="number" value={notifMinutes} min="1" max="120"
                      onChange={e=>setNotifMinutes(Math.max(1,parseInt(e.target.value)||1))}
                      style={{width:'60px',fontSize:'12px',padding:'4px 8px'}} />
                    <span style={{fontSize:'12px',color:'var(--text-muted)'}}>분</span>
                  </div>
                </div>
                {Notification.permission !== 'granted' && (
                  <div style={{fontSize:'12px',color:'var(--danger)'}}>
                    ⚠️ 브라우저 알림 권한이 필요해요.
                    <span style={{color:'var(--accent)',cursor:'pointer',marginLeft:'6px'}} onClick={requestNotifPermission}>권한 요청 →</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {renderScheduleGrid()}
        </div>
      )}

      {/* REVENUE */}
      {activePage === 'page-revenue' && (
        <div className="page-t">{renderRevenue()}</div>
      )}

      {/* SETTINGS */}
      {activePage === 'page-settings' && (
        <div className="page-t" style={{paddingBottom:'40px'}}>

          {/* ── 트레이너 정보 ── */}
          <input ref={profileInputRef} type="file" accept="image/*" style={{display:'none'}}
            onChange={e => { if (e.target.files?.[0]) uploadProfilePhoto(e.target.files[0]); e.target.value='' }} />

          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'20px'}}>
            {/* 상단 행: 아바타 + 이름/플랜 */}
            <div style={{display:'flex',alignItems:'center',gap:'14px',marginBottom:'14px'}}>
              {/* 프로필 아바타 */}
              <div style={{position:'relative',flexShrink:0}}>
                {trainer?.profile_photo_url ? (
                  <img src={trainer.profile_photo_url} alt="프로필"
                    style={{width:'56px',height:'56px',borderRadius:'50%',objectFit:'cover',border:'2px solid var(--accent)'}} />
                ) : (
                  <div style={{width:'56px',height:'56px',borderRadius:'50%',background:'var(--accent)',color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'22px'}}>
                    {trainer?.name?.[0] || 'T'}
                  </div>
                )}
                {/* 카메라 뱃지 */}
                <button onClick={() => profileInputRef.current?.click()} disabled={profileUploading}
                  style={{position:'absolute',bottom:0,right:0,width:'20px',height:'20px',borderRadius:'50%',
                    background:'var(--surface2)',border:'1px solid var(--border)',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    cursor:'pointer',padding:0,fontSize:'11px'}}>
                  {profileUploading ? '…' : '📷'}
                </button>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'15px',fontWeight:700}}>{trainer?.name} 트레이너</div>
                <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>오운 이용 중</div>
              </div>
              <div style={{fontSize:'11px',padding:'4px 10px',borderRadius:'20px',background:'rgba(200,241,53,0.12)',color:'var(--accent)',border:'1px solid rgba(200,241,53,0.3)',fontWeight:600,flexShrink:0}}>FREE</div>
            </div>

            {/* 프로필 사진 버튼 행 */}
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={() => profileInputRef.current?.click()} disabled={profileUploading}
                style={{flex:1,padding:'8px',borderRadius:'8px',border:'1px solid var(--border)',
                  background:'var(--surface2)',color:'var(--text-muted)',fontSize:'12px',fontWeight:500,
                  cursor:'pointer',fontFamily:'inherit',opacity:profileUploading?0.6:1}}>
                {profileUploading ? '업로드 중…' : trainer?.profile_photo_url ? '📷 사진 변경' : '📷 사진 등록'}
              </button>
              {trainer?.profile_photo_url && (
                <button onClick={removeProfilePhoto}
                  style={{padding:'8px 12px',borderRadius:'8px',border:'1px solid rgba(239,68,68,0.3)',
                    background:'rgba(239,68,68,0.06)',color:'#ef4444',fontSize:'12px',fontWeight:500,
                    cursor:'pointer',fontFamily:'inherit'}}>
                  삭제
                </button>
              )}
            </div>
          </div>

          {/* ── 유료 플랜 ── */}
          {planGuideVisible && plansList && (
            <>
              <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',letterSpacing:'0.08em',marginBottom:'10px'}}>💎 플랜 안내</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'24px'}}>
                {plansList.map(plan => {
                  const isOn = plan.enabled !== false
                  return (
                    <div key={plan.id || plan.name} style={{
                      background: plan.highlight ? 'rgba(200,241,53,0.06)' : 'var(--surface)',
                      border:`1px solid ${plan.highlight ? 'rgba(200,241,53,0.35)' : plan.current ? 'var(--border)' : 'rgba(96,165,250,0.3)'}`,
                      borderRadius:'12px', position:'relative', textAlign:'center', marginTop:'10px',
                    }}>
                      {/* 뱃지 — 블러 영향 없이 항상 노출 */}
                      {plan.badge && !plan.current && (
                        <div style={{position:'absolute',top:'-9px',left:'50%',transform:'translateX(-50%)',
                          background: plan.highlight ? 'var(--accent)' : '#60a5fa',
                          color:'#0f0f0f',fontSize:'8px',fontWeight:700,padding:'2px 7px',borderRadius:'8px',whiteSpace:'nowrap',zIndex:2}}>
                          {plan.badge}
                        </div>
                      )}
                      {plan.current && (
                        <div style={{position:'absolute',top:'-9px',left:'50%',transform:'translateX(-50%)',
                          background:'#9ca3af',color:'#0f0f0f',fontSize:'8px',fontWeight:700,padding:'2px 7px',borderRadius:'8px',zIndex:2}}>
                          현재 플랜
                        </div>
                      )}
                      {/* 실제 컨텐츠 — OFF면 블러 */}
                      <div style={{padding:'12px 10px', filter: isOn ? 'none' : 'blur(5px)', userSelect: isOn ? 'auto' : 'none', pointerEvents: isOn ? 'auto' : 'none'}}>
                        <div style={{fontSize:'13px',fontWeight:700,color:plan.color,marginBottom:'4px',marginTop:'4px'}}>{plan.name}</div>
                        <div style={{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:'8px'}}>{plan.price}</div>
                        {(plan.features || []).map(f => (
                          <div key={f} style={{fontSize:'10px',color:'var(--text-muted)',lineHeight:'1.9'}}>· {f}</div>
                        ))}
                        {!plan.current && (
                          <button disabled style={{marginTop:'10px',width:'100%',padding:'6px',borderRadius:'8px',border:'none',
                            background: plan.highlight ? 'var(--accent)' : '#60a5fa',
                            color:'#0f0f0f',fontSize:'10px',fontWeight:700,cursor:'not-allowed',opacity:0.6,fontFamily:'inherit'}}>
                            곧 출시
                          </button>
                        )}
                      </div>
                      {/* OFF 오버레이 */}
                      {!isOn && (
                        <div style={{position:'absolute',inset:0,background:'rgba(10,10,10,0.45)',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'12px'}}>
                          <span style={{fontSize:'10px',fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:'0.05em'}}>준비 중</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ════════════════════════════════════
               🏆 이번 주 일지 발송 리더보드
          ════════════════════════════════════ */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',letterSpacing:'0.08em'}}>🏆 이번 주 일지 발송 리더보드</div>
            <button onClick={loadLeaderboard} style={{fontSize:'11px',color:'var(--text-dim)',background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>↻ 새로고침</button>
          </div>
          {lbLoading && <div style={{textAlign:'center',padding:'20px',color:'var(--text-dim)',fontSize:'12px'}}>불러오는 중...</div>}
          {!lbLoading && leaderboard && (
            leaderboard.list.length === 0
              ? <div style={{textAlign:'center',padding:'16px',color:'var(--text-dim)',fontSize:'12px'}}>이번 주 발송된 일지가 없어요</div>
              : leaderboard.list.map((t, i) => (
                <div key={i} style={{
                  display:'flex',alignItems:'center',gap:'12px',
                  padding:'10px 14px',borderRadius:'10px',marginBottom:'6px',
                  background: t.isMe ? 'rgba(200,241,53,0.07)' : 'var(--surface)',
                  border:`1px solid ${t.isMe ? 'rgba(200,241,53,0.3)' : 'var(--border)'}`,
                }}>
                  <div style={{fontSize:'15px',width:'22px',textAlign:'center',flexShrink:0}}>
                    {i===0?'💎':i===1?'🥇':i===2?'🥈':<span style={{fontSize:'12px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--text-dim)'}}>{i+1}</span>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:t.isMe?700:500,color:t.isMe?'var(--accent)':'var(--text)'}}>
                      {t.name}{t.isMe ? ' (나)' : ''}
                    </div>
                    <div style={{marginTop:'4px',height:'3px',background:'var(--surface2)',borderRadius:'2px',overflow:'hidden'}}>
                      <div style={{height:'100%',background:t.isMe?'var(--accent)':'#60a5fa',borderRadius:'2px',
                        width:(leaderboard.list[0]?.logCount>0 ? Math.round(t.logCount/leaderboard.list[0].logCount*100) : 0)+'%'}} />
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--text)'}}>{t.logCount}<span style={{fontSize:'10px',fontWeight:400,color:'var(--text-dim)'}}> 건</span></div>
                    <div style={{fontSize:'10px',color:t.readRate>=70?'#4ade80':t.readRate>=40?'#facc15':'var(--text-dim)',marginTop:'1px'}}>열람 {t.readRate}%</div>
                  </div>
                </div>
              ))
          )}
          {!lbLoading && !leaderboard && (
            <div style={{textAlign:'center',padding:'20px',color:'var(--text-dim)',fontSize:'12px'}}>데이터를 불러올 수 없어요</div>
          )}

          {/* 섹션 구분선 */}
          <div style={{margin:'28px 0',height:'1px',background:'var(--border)'}} />

          {/* ════════════════════════════════════
               📊 이번 주 전체 일지 열람률
          ════════════════════════════════════ */}
          <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',letterSpacing:'0.08em',marginBottom:'10px'}}>📊 이번 주 전체 일지 열람률</div>
          {lbLoading && <div style={{textAlign:'center',padding:'16px',color:'var(--text-dim)',fontSize:'12px'}}>불러오는 중...</div>}
          {!lbLoading && leaderboard && (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'14px',padding:'20px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
                <div style={{fontSize:'42px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--accent)',lineHeight:1}}>
                  {leaderboard.overallRate}<span style={{fontSize:'20px'}}>%</span>
                </div>
                <div style={{textAlign:'right',display:'flex',flexDirection:'column',gap:'6px'}}>
                  <div style={{fontSize:'12px',color:'var(--text-muted)'}}>총 발송 <span style={{color:'var(--text)',fontWeight:700}}>{leaderboard.totalLogs}건</span></div>
                  <div style={{fontSize:'12px',color:'var(--text-muted)'}}>열람 완료 <span style={{color:'#4ade80',fontWeight:700}}>{leaderboard.totalRead}건</span></div>
                  <div style={{fontSize:'12px',color:'var(--text-muted)'}}>미열람 <span style={{color:'#f87171',fontWeight:700}}>{leaderboard.totalLogs - leaderboard.totalRead}건</span></div>
                </div>
              </div>
              <div style={{height:'8px',background:'var(--surface2)',borderRadius:'4px',overflow:'hidden'}}>
                <div style={{height:'100%',background:'linear-gradient(90deg,var(--accent),#4ade80)',borderRadius:'4px',
                  width:leaderboard.overallRate+'%',transition:'width 0.6s ease'}} />
              </div>
              <div style={{marginTop:'8px',fontSize:'11px',color:'var(--text-dim)'}}>이번 주 월요일 기준 · 전체 트레이너 합산</div>
            </div>
          )}
          {!lbLoading && !leaderboard && (
            <div style={{textAlign:'center',padding:'20px',color:'var(--text-dim)',fontSize:'12px'}}>데이터를 불러올 수 없어요</div>
          )}

          {/* ── 로그아웃 ── */}
          <div style={{marginTop:'32px'}}>
            <button
              onClick={async () => {
                if (window.confirm('로그아웃 하시겠습니까?')) {
                  await supabase.auth.signOut()
                  setAuthUser(null); setTrainer(null)
                  setMembers([]); setLogs([])
                  setScreen('landing')
                }
              }}
              style={{
                width:'100%',padding:'13px',borderRadius:'12px',
                border:'1px solid rgba(239,68,68,0.3)',
                background:'rgba(239,68,68,0.06)',
                color:'#ef4444',fontSize:'14px',fontWeight:700,
                cursor:'pointer',fontFamily:'inherit',
              }}
            >
              로그아웃
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ 1:1 문의 탭 ══════════════════ */}
      {activePage === 'page-support' && (
        <div className="page-t" style={{paddingBottom:'40px'}}>

          {/* 새 문의 작성 */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'20px'}}>
            <div style={{fontSize:'13px',fontWeight:700,marginBottom:'14px'}}>✉️ 새 문의 작성</div>

            <div className="form-group">
              <label>문의 유형</label>
              <select value={inqForm.category} onChange={e=>setInqForm({...inqForm,category:e.target.value})}>
                <option value="general">일반 문의</option>
                <option value="billing">결제 / 구독</option>
                <option value="bug">오류 신고</option>
                <option value="feature">기능 제안</option>
              </select>
            </div>

            <div className="form-group">
              <label>제목 <span style={{color:'var(--danger)'}}>*</span></label>
              <input type="text" placeholder="문의 제목을 입력해주세요" maxLength={80}
                value={inqForm.title} onChange={e=>setInqForm({...inqForm,title:e.target.value})} />
            </div>

            <div className="form-group">
              <label>내용 <span style={{color:'var(--danger)'}}>*</span></label>
              <textarea rows={5} placeholder="문의 내용을 자세히 적어주세요" maxLength={1000}
                value={inqForm.content} onChange={e=>setInqForm({...inqForm,content:e.target.value})}
                style={{resize:'vertical'}} />
              <div style={{fontSize:'11px',color:'var(--text-dim)',textAlign:'right',marginTop:'2px'}}>{inqForm.content.length}/1000</div>
            </div>

            <button
              onClick={submitInquiry} disabled={inqSubmitting}
              style={{width:'100%',padding:'12px',borderRadius:'10px',border:'none',
                background:'var(--accent)',color:'#0f0f0f',fontSize:'13px',fontWeight:700,
                cursor:'pointer',fontFamily:'inherit',opacity:inqSubmitting?0.6:1}}>
              {inqSubmitting ? '접수 중...' : '문의 접수하기'}
            </button>
          </div>

          {/* 문의 내역 */}
          <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',marginBottom:'10px',letterSpacing:'0.06em'}}>📋 문의 내역</div>
          {inqLoading && <div style={{textAlign:'center',padding:'20px',color:'var(--text-dim)',fontSize:'12px'}}>불러오는 중...</div>}
          {!inqLoading && !inquiries.length && (
            <div style={{textAlign:'center',padding:'28px',color:'var(--text-dim)',fontSize:'13px'}}>아직 문의 내역이 없어요</div>
          )}
          {!inqLoading && inquiries.map(inq => {
            const isSelected = inqSelected?.id === inq.id
            const isAnswered = inq.status === 'answered'
            const catLabel = {general:'일반 문의',billing:'결제/구독',bug:'오류 신고',feature:'기능 제안'}[inq.category] || inq.category
            return (
              <div key={inq.id}
                onClick={() => setInqSelected(isSelected ? null : inq)}
                style={{background:'var(--surface)',border:`1px solid ${isAnswered?'rgba(200,241,53,0.25)':'var(--border)'}`,
                  borderRadius:'12px',padding:'14px',marginBottom:'8px',cursor:'pointer',
                  transition:'border-color 0.15s'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{fontSize:'10px',padding:'2px 8px',borderRadius:'100px',fontWeight:700,
                      background:'rgba(136,136,136,0.1)',color:'var(--text-dim)'}}>
                      {catLabel}
                    </span>
                    <span style={{fontSize:'10px',padding:'2px 8px',borderRadius:'100px',fontWeight:700,
                      background: isAnswered?'rgba(200,241,53,0.12)':'rgba(245,166,35,0.1)',
                      color: isAnswered?'var(--accent)':'#f5a623'}}>
                      {isAnswered ? '답변 완료' : '답변 대기'}
                    </span>
                  </div>
                  <span style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>
                    {new Date(inq.created_at).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}
                  </span>
                </div>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)',marginBottom: isSelected?'12px':'0'}}>
                  {inq.title}
                </div>

                {/* 펼쳐진 상태 */}
                {isSelected && (
                  <div onClick={e=>e.stopPropagation()}>
                    <div style={{fontSize:'13px',color:'var(--text-muted)',lineHeight:1.7,
                      padding:'10px 0',borderTop:'1px solid var(--border)',whiteSpace:'pre-wrap'}}>
                      {inq.content}
                    </div>
                    {isAnswered && inq.answer && (
                      <div style={{marginTop:'10px',padding:'12px',borderRadius:'10px',
                        background:'rgba(200,241,53,0.06)',border:'1px solid rgba(200,241,53,0.2)'}}>
                        <div style={{fontSize:'10px',fontWeight:700,color:'var(--accent)',marginBottom:'6px',letterSpacing:'0.05em'}}>
                          💬 관리자 답변 · {new Date(inq.answered_at).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}
                        </div>
                        <div style={{fontSize:'13px',color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>
                          {inq.answer}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ADD MEMBER */}
      {activePage === 'page-add-member' && (
        <div className="page-t">
          <div className="record-header"><button className="back-btn" onClick={()=>{setActivePage('page-members');setTab('members')}}>←</button><div style={{fontSize:'15px',fontWeight:700}}>회원 추가</div></div>
          <div className="section-label" style={{marginTop:0}}>기본 정보</div>
          <div className="form-group"><label>이름 *</label><input type="text" value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="홍길동" /></div>
          <div className="form-group"><label>휴대폰 번호 (카카오톡 발송용)</label><input type="text" value={addForm.kakao_phone} onChange={e=>setAddForm({...addForm,kakao_phone:e.target.value})} placeholder="010-1234-5678" /></div>
          <div className="form-group"><label>전화번호 뒷 4자리 (회원 포털 로그인용) *</label><input type="text" value={addForm.phone} onChange={e=>setAddForm({...addForm,phone:e.target.value})} placeholder="1234" maxLength={4} /></div>
          <div className="form-group"><label>생년월일</label><input type="date" value={addForm.birthdate} onChange={e=>setAddForm({...addForm,birthdate:e.target.value})} /></div>
          <div className="form-group"><label>주소</label><input type="text" value={addForm.address} onChange={e=>setAddForm({...addForm,address:e.target.value})} placeholder="서울시 강남구..." /></div>
          <div className="form-group"><label>이메일 (선택)</label><input type="email" value={addForm.email} onChange={e=>setAddForm({...addForm,email:e.target.value})} placeholder="example@gmail.com" /></div>
          <div className="form-group"><label>특이사항</label><textarea value={addForm.special_notes} onChange={e=>setAddForm({...addForm,special_notes:e.target.value})} placeholder="부상 이력, 주의사항 등" rows={2} style={{resize:'vertical'}} /></div>
          <div className="form-group"><label>운동 목적</label>
            <select value={addForm.purpose} onChange={e=>setAddForm({...addForm,purpose:e.target.value})}>
              {['체형교정','근비대','다이어트','체력향상','재활','스포츠퍼포먼스','유지관리','기타'].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>방문 경로</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'8px'}}>
              {['소개','인터넷','광고물','SNS','기타'].map(src => (
                <button key={src} type="button" onClick={()=>setAddForm({...addForm,visit_source:addForm.visit_source===src?'':src,visit_source_memo:''})}
                  style={{padding:'6px 12px',borderRadius:'8px',border:'1px solid',fontSize:'12px',cursor:'pointer',fontFamily:'inherit',
                    background: addForm.visit_source===src ? 'var(--accent)' : 'var(--surface2)',
                    color: addForm.visit_source===src ? '#0f0f0f' : 'var(--text-muted)',
                    borderColor: addForm.visit_source===src ? 'var(--accent)' : 'var(--border)'}}>
                  {src}
                </button>
              ))}
            </div>
            {(addForm.visit_source==='소개'||addForm.visit_source==='기타') && (
              <input type="text" value={addForm.visit_source_memo} onChange={e=>setAddForm({...addForm,visit_source_memo:e.target.value})}
                placeholder={addForm.visit_source==='소개'?'소개해주신 분 이름 또는 메모':'기타 경로 메모'} />
            )}
            {addForm.visit_source==='광고물' && <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'4px'}}>간판, 전단지, 현수막 등</div>}
          </div>
          <div className="divider"></div>
          <div className="section-label">세션 관리</div>
          <div className="two-col">
            <div className="form-group"><label>총 세션 수</label><input type="number" value={addForm.total} onChange={e=>setAddForm({...addForm,total:e.target.value})} placeholder="30" min="1" /></div>
            <div className="form-group"><label>완료한 세션</label><input type="number" value={addForm.done} onChange={e=>setAddForm({...addForm,done:e.target.value})} placeholder="0" min="0" /></div>
          </div>
          <div className="form-group"><label>세션 단가 (원, 예상매출 계산용)</label><input type="number" value={addForm.price} onChange={e=>setAddForm({...addForm,price:e.target.value})} placeholder="60000" min="0" /></div>
          <div className="form-group"><label>메모 (선택)</label><input type="text" value={addForm.memo} onChange={e=>setAddForm({...addForm,memo:e.target.value})} placeholder="기타 메모" /></div>
          <button className="btn btn-primary" style={{width:'100%'}} onClick={addMember}>회원 추가 완료</button>
        </div>
      )}

      {/* RECORD */}
      {activePage === 'page-record' && currentMember && (
        <div className="page-t">
<div className="record-header"><button className="back-btn" onClick={()=>{setActivePage('page-members');setTab('members')}}>←</button>
            <div style={{flex:1}}><div style={{fontSize:'15px',fontWeight:700}}>{currentMember.name}</div><div style={{fontSize:'12px',color:'var(--text-muted)'}}>📱 {currentMember.phone}{currentMember.lesson_purpose?' · '+currentMember.lesson_purpose:''}</div></div>
            <div style={{display:'flex',gap:'6px',flexShrink:0}}>
              <button className="btn btn-sm" style={{fontSize:'12px',whiteSpace:'nowrap',background:'var(--surface2)',border:'1px solid var(--border)',color:currentMember.suspended?'#f97316':'var(--text-muted)'}}
                onClick={()=>{setHoldForm({startDate:'',endDate:'',productId:'',reason:'',photoFile:null,photoPreview:''});loadHolds(currentMemberId);setHoldModal(true)}}>
                {currentMember.suspended?'⏸ 정지중':'⏸ 정지'}
              </button>
            </div>
          </div>
          <div className="card" style={{marginBottom:'14px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}>
              <span style={{fontSize:'13px',fontWeight:500}}>세션 현황</span>
              <span className="pill">{currentMember.done_sessions}회 완료 · {currentMember.total_sessions-currentMember.done_sessions}회 남음</span>
            </div>
            <div className="session-bar-bg"><div className={`session-bar-fill${(currentMember.total_sessions-currentMember.done_sessions)<=3?' low':''}`} style={{width:(currentMember.total_sessions>0?Math.round((currentMember.done_sessions/currentMember.total_sessions)*100):0)+'%'}}></div></div>
          </div>
          <div className="rtab-row">
            <button className={`btn ${rtab==='write'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('write')} style={{fontSize:'12px'}}>📝 수업일지</button>
            <button className={`btn ${rtab==='attendance'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('attendance')} style={{fontSize:'12px'}}>📅 출석부</button>
            <button className={`btn ${rtab==='health'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('health')} style={{fontSize:'12px'}}>⚖️ 건강기록</button>
            <button className={`btn ${rtab==='holds'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>{setRtab('holds');loadHolds(currentMemberId)}} style={{fontSize:'12px'}}>⏸ 정지기록</button>
            <button className={`btn ${rtab==='personal'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('personal')} style={{fontSize:'12px'}}>🏃 개인운동</button>
            <button className={`btn ${rtab==='insight'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('insight')} style={{fontSize:'12px'}}>🤖 AI 분석</button>
          </div>

          {rtab === 'attendance' && (() => {
            const { y, m } = attendanceMonth
            const firstDay = new Date(y, m, 1)
            const daysInMonth = new Date(y, m+1, 0).getDate()
            const startDow = (firstDay.getDay()+6)%7 // 월=0
            const todayStr = new Date().toISOString().split('T')[0]
            const attendedSet = new Set(attendanceDates.map(a => a.attended_date))
            const monthCount = attendanceDates.length
            return (
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                  <button className="week-nav-btn" onClick={()=>setAttendanceMonth(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1})}>‹</button>
                  <div style={{fontSize:'14px',fontWeight:700}}>{y}년 {m+1}월 <span style={{fontSize:'12px',color:'var(--accent)',fontWeight:400}}>({monthCount}회 출석)</span></div>
                  <button className="week-nav-btn" onClick={()=>setAttendanceMonth(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1})}>›</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'8px'}}>
                  {['월','화','수','목','금','토','일'].map(d=><div key={d} style={{textAlign:'center',fontSize:'11px',color:'var(--text-dim)',padding:'4px 0'}}>{d}</div>)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
                  {Array.from({length:startDow}).map((_,i)=><div key={'e'+i}></div>)}
                  {Array.from({length:daysInMonth}).map((_,i)=>{
                    const day = i+1
                    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const isAttended = attendedSet.has(dateStr)
                    const isToday = dateStr === todayStr
                    const isFuture = dateStr > todayStr
                    return (
                      <div key={day} onClick={()=>!isFuture&&toggleAttendance(dateStr)}
                        style={{aspectRatio:'1',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'8px',fontSize:'13px',fontWeight:isAttended?700:400,cursor:isFuture?'default':'pointer',
                          background:isAttended?'var(--accent)':isToday?'rgba(200,241,53,0.12)':'var(--surface2)',
                          color:isAttended?'#0f0f0f':isToday?'var(--accent)':isFuture?'var(--text-dim)':'var(--text)',
                          border:isToday&&!isAttended?'1px solid rgba(200,241,53,0.4)':'1px solid transparent',
                          opacity:isFuture?0.4:1}}>
                        {day}
                      </div>
                    )
                  })}
                </div>
                {attendanceDates.length>0 && (
                  <div style={{marginTop:'16px'}}>
                    <div className="section-label">출석 일시</div>
                    {[...attendanceDates].sort((a,b)=>b.attended_date.localeCompare(a.attended_date)).map(a=>(
                      <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
                        <div style={{fontSize:'13px'}}>
                          {new Date(a.attended_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{fontSize:'11px',color:'var(--accent)',background:'rgba(200,241,53,0.1)',padding:'2px 8px',borderRadius:'4px'}}>출석</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {rtab === 'health' && (
            <div>
              {!healthData ? <div className="empty">불러오는 중...</div> : (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
                    {[[currentMember.target_weight,'목표 체중','var(--accent)'],[healthData.find(r=>r.morning_weight)?.morning_weight,'현재 체중','var(--text)'],[currentMember.start_weight,'시작 체중','var(--text)'],[(currentMember.start_weight&&healthData.find(r=>r.morning_weight)?.morning_weight?(currentMember.start_weight-healthData.find(r=>r.morning_weight).morning_weight).toFixed(1)+'kg':'—'),'감량','var(--accent)']].map(([v,l,c],i)=>(
                      <div key={i} className="card" style={{marginBottom:0,padding:'12px'}}><div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'4px'}}>{l}</div><div style={{fontSize:'18px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:c}}>{v||'—'}</div></div>
                    ))}
                  </div>
                  <div className="section-label">체중 기록</div>
                  {healthData.filter(r=>r.morning_weight||r.evening_weight).slice(0,10).map(r => {
                    const diff = (r.morning_weight&&r.evening_weight)?(r.evening_weight-r.morning_weight).toFixed(1):null
                    const ds = new Date(r.record_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
                    return (
                      <div key={r.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
                        <div style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace",minWidth:'40px'}}>{ds}</div>
                        <div style={{flex:1,display:'flex',gap:'16px'}}>
                          <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{r.morning_weight||'—'}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>공복</div></div>
                          <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{r.evening_weight||'—'}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>저녁</div></div>
                          {diff && <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:diff>0?'#ff5c5c':'#4ade80'}}>{diff>0?'+':''}{diff}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>일중증가</div></div>}
                        </div>
                        {r.sleep_level && <div style={{fontSize:'11px',color:'var(--text-muted)'}}>💤 {r.sleep_level}/10</div>}
                      </div>
                    )
                  })}
                  {!healthData.filter(r=>r.morning_weight||r.evening_weight).length && <div className="empty">체중 기록 없음</div>}
                </>
              )}
            </div>
          )}

          {rtab === 'holds' && (
            <div>
              {!holds.length ? (
                <div className="empty"><div style={{fontSize:'32px',marginBottom:'12px'}}>⏸</div><p>정지(홀딩) 이력이 없어요</p></div>
              ) : (
                <>
                  {/* 요약 */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
                    <div className="card" style={{marginBottom:0,padding:'12px'}}>
                      <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'4px'}}>총 정지 횟수</div>
                      <div style={{fontSize:'20px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--accent)'}}>{holds.length}회</div>
                    </div>
                    <div className="card" style={{marginBottom:0,padding:'12px'}}>
                      <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'4px'}}>총 정지 일수</div>
                      <div style={{fontSize:'20px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--accent)'}}>
                        {holds.reduce((s,h)=>s+Math.round((new Date(h.end_date)-new Date(h.start_date))/86400000)+1,0)}일
                      </div>
                    </div>
                  </div>
                  {/* 이력 목록 */}
                  {holds.map(h => {
                    const days = Math.round((new Date(h.end_date)-new Date(h.start_date))/86400000)+1
                    const today = new Date().toISOString().split('T')[0]
                    const isActive = h.start_date <= today && today <= h.end_date
                    return (
                      <div key={h.id} className="card" style={{marginBottom:'10px'}}>
                        <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                              {isActive && <span style={{fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'4px',background:'#f97316'+'22',color:'#f97316',border:'1px solid #f9731644'}}>진행중</span>}
                              <span style={{fontSize:'13px',fontWeight:600}}>{h.start_date} ~ {h.end_date}</span>
                              <span style={{fontSize:'11px',color:'var(--text-dim)'}}>{days}일</span>
                            </div>
                            {h.product_name && (
                              <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'4px'}}>📦 {h.product_name}</div>
                            )}
                            {h.reason && (
                              <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'6px'}}>💬 {h.reason}</div>
                            )}
                            {h.photo_url && (
                              <img src={h.photo_url} alt="첨부사진" style={{maxWidth:'100%',maxHeight:'160px',borderRadius:'8px',objectFit:'cover',marginTop:'4px'}} />
                            )}
                          </div>
                          <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)',fontSize:'11px',flexShrink:0,padding:'4px 8px'}} onClick={()=>deleteHold(h.id)}>해제</button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
              <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={()=>{setHoldForm({startDate:'',endDate:'',productId:'',reason:'',photoFile:null,photoPreview:''});setHoldModal(true)}}>+ 정지 등록</button>
            </div>
          )}

          {rtab === 'personal' && (() => {
            const now = new Date()
            const thisMonth = now.toISOString().slice(0,7)
            const monthSessions = workoutSessions.filter(s => s.workout_date?.startsWith(thisMonth))
            const monthVolume = monthSessions.reduce((s,ss)=>s+(ss.total_volume||0),0)
            return (
              <div>
                {/* 이번 달 요약 */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
                  {[
                    ['이번 달 운동', monthSessions.length+'회', 'var(--accent)'],
                    ['총 볼륨', monthVolume>=1000?(monthVolume/1000).toFixed(1)+'t':Math.round(monthVolume)+'kg', 'var(--accent)'],
                    ['전체 기록', workoutSessions.length+'회', 'var(--text-muted)'],
                  ].map(([label,val,color])=>(
                    <div key={label} className="card" style={{marginBottom:0,padding:'10px 12px'}}>
                      <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'3px'}}>{label}</div>
                      <div style={{fontSize:'16px',fontWeight:700,fontFamily:"'DM Mono',monospace",color}}>{val}</div>
                    </div>
                  ))}
                </div>
                {/* 버튼 행 */}
                <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
                  {(workoutRoutines.length > 0 || trainerLibraryRoutines.length > 0) && (
                    <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>setWorkoutRoutineModal(true)}>
                      📋 루틴 불러오기{trainerLibraryRoutines.length > 0 ? ` · 🛒${trainerLibraryRoutines.length}` : ''}
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>openWorkoutModal()}>+ 운동 기록</button>
                </div>
                {/* 세션 이력 */}
                {!workoutSessions.length && <div className="empty"><div style={{fontSize:'32px',marginBottom:'12px'}}>🏃</div><p>아직 개인 운동 기록이 없어요</p></div>}
                {workoutSessions.map(s => {
                  const isOpen = workoutDetailId === s.id
                  const exList = s.exercises || []
                  const vol = s.total_volume || 0
                  const dateStr = new Date(s.workout_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})
                  const muscles = [...new Set(exList.map(e=>e.muscle_group).filter(Boolean))]
                  return (
                    <div key={s.id} className="card" style={{marginBottom:'10px',cursor:'pointer'}} onClick={()=>setWorkoutDetailId(isOpen?null:s.id)}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px',flexWrap:'wrap'}}>
                            <span style={{fontSize:'13px',fontWeight:600}}>{s.title||'운동'}</span>
                            <span style={{fontSize:'11px',color:'var(--text-dim)'}}>{dateStr}</span>
                            {s.duration_min && <span style={{fontSize:'11px',color:'var(--text-dim)'}}>⏱ {s.duration_min}분</span>}
                            {s.source === 'member' && <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'4px',background:'rgba(34,197,94,0.12)',color:'#16a34a',border:'1px solid rgba(34,197,94,0.3)'}}>회원 기록</span>}
                          </div>
                          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'4px'}}>
                            {muscles.map(mg=>(
                              <span key={mg} style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(MUSCLE_COLOR[mg]||'#6b7280')+'22',color:MUSCLE_COLOR[mg]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[mg]||'#6b7280')}44`}}>{mg}</span>
                            ))}
                          </div>
                          <div style={{fontSize:'12px',color:'var(--text-muted)'}}>운동 {exList.length}종목 · 총 볼륨 {vol>=1000?(vol/1000).toFixed(1)+'t':Math.round(vol)+'kg'}</div>
                        </div>
                        <span style={{color:'var(--text-dim)',fontSize:'14px',flexShrink:0,marginTop:'2px'}}>{isOpen?'▲':'▼'}</span>
                      </div>
                      {isOpen && (
                        <div style={{marginTop:'12px',borderTop:'1px solid var(--border)',paddingTop:'12px'}} onClick={e=>e.stopPropagation()}>
                          {exList.map((ex,ei)=>{
                            const exVol = ex.sets.reduce((s,set)=>s+((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)),0)
                            return (
                              <div key={ei} style={{marginBottom:'10px'}}>
                                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                                  <span style={{fontSize:'13px',fontWeight:600}}>{ex.name}</span>
                                  {ex.muscle_group && <span style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')+'22',color:MUSCLE_COLOR[ex.muscle_group]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')}44`}}>{ex.muscle_group}</span>}
                                  <span style={{fontSize:'11px',color:'var(--text-dim)',marginLeft:'auto'}}>볼륨 {Math.round(exVol)}kg</span>
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:'4px'}}>
                                  {ex.sets.map((set,si)=>(
                                    <div key={si} style={{background:'var(--surface2)',borderRadius:'6px',padding:'6px 8px',fontSize:'12px',textAlign:'center'}}>
                                      <div style={{color:'var(--text-dim)',fontSize:'10px',marginBottom:'2px'}}>{si+1}세트</div>
                                      <div style={{fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{set.weight||'—'}kg × {set.reps||'—'}회</div>
                                      {set.rest_sec && <div style={{color:'var(--text-dim)',fontSize:'10px',marginTop:'2px'}}>휴식 {set.rest_sec}초</div>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                          {s.memo && <div style={{marginTop:'8px',fontSize:'12px',color:'var(--text-muted)',padding:'8px',background:'var(--surface2)',borderRadius:'6px'}}>💬 {s.memo}</div>}
                          <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
                            <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>openWorkoutModal(s)}>✏️ 수정</button>
                            <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:'12px',color:'var(--danger)'}} onClick={()=>deleteWorkoutSession(s.id)}>삭제</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {rtab === 'write' && (
            <div>
              <div className="section-label">1단계 — 수업 녹음 업로드</div>
              <div className="card">
                {!audioData ? (
                  <div id="upload-area" onClick={()=>audioInputRef.current?.click()} style={{border:'1.5px dashed var(--border)',borderRadius:'10px',padding:'22px 16px',textAlign:'center',cursor:'pointer',marginBottom:'14px'}}>
                    <div style={{fontSize:'28px',marginBottom:'8px'}}>🎙</div>
                    <div style={{fontSize:'13px',fontWeight:500,color:'var(--text-muted)'}}>음성 메모 파일 업로드</div>
                    <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'4px'}}>m4a · mp3 · wav 지원</div>
                  </div>
                ) : (
                  <div style={{display:'flex',background:'var(--surface2)',borderRadius:'8px',padding:'10px 14px',marginBottom:'14px',alignItems:'center',gap:'10px'}}>
                    <span style={{fontSize:'20px'}}>🎵</span>
                    <div style={{flex:1}}><div style={{fontSize:'13px',fontWeight:500}}>{audioName}</div><div style={{fontSize:'11px',color:'var(--text-dim)'}}>{audioSize}</div></div>
                    <button onClick={removeAudio} style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'18px'}}>×</button>
                  </div>
                )}
                <input ref={audioInputRef} type="file" accept="audio/*" style={{display:'none'}} onChange={handleAudio} />
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                  <span style={{fontSize:'11px',color:'var(--text-dim)'}}>추가 메모 (선택)</span>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                </div>
                <div className="form-group"><textarea value={rawInput} onChange={e=>setRawInput(e.target.value)} placeholder="녹음에 없는 내용을 추가로 입력하세요." rows={3}></textarea></div>

                {/* ── AI 해석 관점 입력 ── */}
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px',marginTop:'6px'}}>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                  <span style={{fontSize:'11px',color:'var(--text-dim)'}}>AI 해석 관점 (선택)</span>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                </div>
                <div className="form-group" style={{marginBottom:'8px'}}>
                  <textarea
                    value={perspectiveInput}
                    onChange={e => setPerspectiveInput(e.target.value)}
                    placeholder="예: 재활 중심으로 작성해줘 / 동기부여에 초점을 맞춰줘"
                    rows={2}
                    style={{resize:'none'}}
                  />
                </div>
                {/* 관점 예시 가이드 */}
                <div style={{
                  background:'rgba(255,255,255,0.03)',
                  border:'1px solid var(--border)',
                  borderRadius:'10px',
                  padding:'12px 14px',
                  marginBottom:'16px',
                }}>
                  <div style={{fontSize:'11px',fontWeight:700,color:'var(--text-muted)',marginBottom:'10px',letterSpacing:'0.5px',textTransform:'uppercase'}}>
                    ✦ 관점 예시
                  </div>
                  {[
                    {
                      tag: '재활·부상 케어',
                      color: '#f9a8d4',
                      bg: 'rgba(249,168,212,0.08)',
                      border: 'rgba(249,168,212,0.25)',
                      examples: [
                        '무릎 재활 중인 회원이니 부하 조절과 통증 반응을 중심으로 써줘',
                        '어깨 부상 후 복귀 단계라 가동범위 회복 위주로 기록해줘',
                      ],
                    },
                    {
                      tag: '동기부여·심리',
                      color: '#86efac',
                      bg: 'rgba(134,239,172,0.08)',
                      border: 'rgba(134,239,172,0.25)',
                      examples: [
                        '요즘 의욕이 떨어진 회원이니 잘한 점을 크게 칭찬하는 톤으로 써줘',
                        '첫 달이라 적응 기간임을 강조하고 격려 위주로 작성해줘',
                      ],
                    },
                    {
                      tag: '퍼포먼스·기술',
                      color: '#fcd34d',
                      bg: 'rgba(252,211,77,0.08)',
                      border: 'rgba(252,211,77,0.25)',
                      examples: [
                        '대회 준비 중이니 볼륨·강도 수치를 구체적으로 분석해줘',
                        '폼 교정이 목표라 자세 개선 포인트를 항목별로 정리해줘',
                      ],
                    },
                    {
                      tag: '다이어트·체성분',
                      color: '#c4b5fd',
                      bg: 'rgba(196,181,253,0.08)',
                      border: 'rgba(196,181,253,0.25)',
                      examples: [
                        '체지방 감량이 목표라 칼로리 소모와 운동 강도 연결해서 써줘',
                        '식단도 병행 중이니 일지에 에너지 섭취와 운동 균형을 언급해줘',
                      ],
                    },
                  ].map(({ tag, color, bg, border, examples }) => (
                    <div key={tag} style={{marginBottom:'10px'}}>
                      <div style={{
                        display:'inline-block',
                        background: bg,
                        border: `1px solid ${border}`,
                        borderRadius:'20px',
                        padding:'2px 10px',
                        fontSize:'10px',
                        fontWeight:700,
                        color,
                        marginBottom:'6px',
                      }}>{tag}</div>
                      {examples.map((ex, i) => (
                        <div
                          key={i}
                          onClick={() => setPerspectiveInput(ex)}
                          style={{
                            display:'flex',
                            alignItems:'flex-start',
                            gap:'6px',
                            padding:'6px 8px',
                            borderRadius:'7px',
                            cursor:'pointer',
                            marginBottom:'4px',
                            transition:'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}
                        >
                          <span style={{color:'var(--text-dim)',fontSize:'11px',flexShrink:0,marginTop:'1px'}}>→</span>
                          <span style={{fontSize:'12px',color:'var(--text-muted)',lineHeight:1.5}}>{ex}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'4px',paddingTop:'8px',borderTop:'1px solid var(--border)'}}>
                    💡 예시를 탭하면 자동으로 입력돼요. 직접 자유롭게 작성해도 됩니다.
                  </div>
                </div>

                <div className="section-label" style={{marginTop:'4px'}}>운동 종목 기록 (선택)</div>
                {exercises.map(ex => (
                  <div key={ex.id} className="ex-block">
                    <div className="ex-block-header">
                      <span className="ex-block-name">{ex.name}</span>
                      <div className="ex-block-actions">
                        <button className="btn btn-ghost btn-sm" onClick={()=>editExercise(ex.id)} style={{fontSize:'11px',padding:'4px 10px'}}>수정</button>
                        <button className="ex-set-remove" onClick={()=>setExercises(exercises.filter(e=>e.id!==ex.id))} style={{fontSize:'16px',marginLeft:'4px'}}>×</button>
                      </div>
                    </div>
                    <div className="ex-set-list">
                      {ex.sets.map((s,i) => (
                        <div key={i} className="ex-set-item">
                          <span className="ex-set-num">{i+1}세트</span>
                          <span className="ex-set-info">{s.reps}회{s.feel?' · '+s.feel:''}</span>
                          {s.rir!=='' && <span className="ex-set-rir">RIR {s.rir}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{width:'100%',padding:'10px',marginBottom:'8px'}} onClick={openAddExercise}>+ 운동 종목 추가</button>
                <div className="section-label" style={{marginTop:'12px'}}>RIR 가이드</div>
                <div className="rir-guide">
                  <div className="rir-item rir-2"><div className="rir-badge">2 RIR 추천</div><div className="rir-label">부상위험↑ · 협응성 복합운동</div><div className="rir-moves">벤치프레스 · 스쿼트 · 데드리프트</div></div>
                  <div className="rir-item rir-1"><div className="rir-badge">1 RIR 추천</div><div className="rir-label">큰 근육 · 부상위험 낮은 복합운동</div><div className="rir-moves">렛풀다운 · 시티드로우 · 덤벨체스트프레스 · 런지</div></div>
                  <div className="rir-item rir-0"><div className="rir-badge">0 RIR 추천</div><div className="rir-label">자극 위주 · 단일관절 고립운동</div><div className="rir-moves">사이드레터럴레이즈 · 덤벨컬 · 케이블푸쉬다운 · 레그익스텐션</div></div>
                </div>
              </div>
              <div className="section-label">2단계 — AI 수업일지 생성</div>
              {generating && <div className="ai-status"><div className="ai-dot"></div><span>{aiStatus}</span></div>}
              {showPreview && (
                <div>
                  <div className="preview-card">{previewContent}</div>
                  <div className="form-group"><label>수정이 필요하면 직접 편집하세요</label><textarea value={finalContent} onChange={e=>setFinalContent(e.target.value)} rows={12} style={{fontSize:'13px',lineHeight:'1.8'}}></textarea></div>
                </div>
              )}
              {/* 크레딧 표시 */}
              {(function CreditBar() {
                const barColor  = credits <= 3 ? '#f9a8d4' : credits <= 10 ? '#fcd34d' : '#86efac'
                const label     = credits <= 0
                  ? '⛔ 크레딧이 없어요'
                  : credits <= 3
                  ? `⚠️ 크레딧 ${credits}개 남았어요`
                  : credits <= 10
                  ? `🔔 크레딧 ${credits}개 남았어요`
                  : `✦ 크레딧 ${credits}개`
                return (
                  <div style={{
                    background:'rgba(255,255,255,0.05)',
                    border:`1px solid ${barColor}44`,
                    borderRadius:'10px',
                    padding:'12px 14px',
                    marginBottom:'10px',
                    display:'flex',
                    justifyContent:'space-between',
                    alignItems:'center',
                  }}>
                    <span style={{fontSize:'13px',fontWeight:600,color:barColor}}>{label}</span>
                    <button
                      onClick={()=>setSettingsModal(true)}
                      style={{background:'none',border:`1px solid ${barColor}66`,borderRadius:'6px',
                        color:barColor,fontSize:'11px',fontWeight:700,padding:'3px 8px',
                        cursor:'pointer',fontFamily:'inherit'}}>
                      충전
                    </button>
                  </div>
                )
              }())}
              {!generating && !showPreview && (
                <button
                  className="btn btn-primary"
                  style={{width:'100%',marginBottom:'10px',opacity: credits <= 0 ? 0.5 : 1,cursor: credits <= 0 ? 'not-allowed' : 'pointer'}}
                  onClick={generateLog}
                >
                  {credits <= 0 ? '🔒 크레딧 부족' : '✦ AI 수업일지 생성'}
                </button>
              )}
              {showSend && (
                <div>
                  <div className="section-label">3단계 — 발송</div>
                  <button className="btn btn-primary" style={{width:'100%',marginBottom:'8px'}} onClick={sendKakao}>
                    <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#0f0f0f"><path d="M12 3C6.477 3 2 6.582 2 11c0 2.83 1.634 5.33 4.127 6.89l-1.07 3.97a.5.5 0 0 0 .733.556L10.13 19.7A11.6 11.6 0 0 0 12 19.8c5.523 0 10-3.582 10-8S17.523 3 12 3z"/></svg>
                      회원님께 리포트 링크 공유하기
                    </span>
                  </button>
                  <div style={{fontSize:'12px',color:'var(--text-dim)',textAlign:'center',marginBottom:'10px'}}>회원이 링크를 클릭하면 예쁜 리포트 페이지가 열려요</div>
                </div>
              )}
            </div>
          )}

          {rtab === 'insight' && (
            <div>
              {/* 이탈 위험 분석 */}
              <div style={{marginBottom:'18px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',marginBottom:'10px',display:'flex',alignItems:'center',gap:'6px'}}>
                  <span>📊 이탈 위험 분석</span>
                  {riskMap[currentMember?.id] && (() => {
                    const lv = getRiskLevel(riskMap[currentMember.id].riskScore)
                    return <span style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:lv.bg,color:lv.color,border:`1px solid ${lv.color}33`}}>{lv.emoji} {lv.label} ({riskMap[currentMember.id].riskScore}점)</span>
                  })()}
                </div>
                <RiskPanel member={currentMember} />
              </div>
              <div style={{height:'1px',background:'var(--border)',marginBottom:'18px'}} />
              {/* AI 인사이트 */}
              <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',marginBottom:'10px'}}>🤖 AI 인사이트</div>
              <AiInsightPanel member={currentMember} apiKey={centralApiKey} />
            </div>
          )}
        </div>
      )}

      {/* PAYMENT CANCEL CONFIRM MODAL */}
      <Modal open={!!cancelPaymentTarget} onClose={()=>setCancelPaymentTarget(null)} title="결제 취소 확인" maxWidth="320px">
        <div style={{textAlign:'center',padding:'8px 0 20px'}}>
          <div style={{fontSize:'32px',marginBottom:'12px'}}>⚠️</div>
          <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px'}}>정말로 결제를 취소하시겠습니까?</div>
          {cancelPaymentTarget && (
            <div style={{fontSize:'12px',color:'var(--text-muted)',lineHeight:'1.7'}}>
              {cancelPaymentTarget.product_name}<br/>
              {cancelPaymentTarget.amount.toLocaleString()}원 · {cancelPaymentTarget.session_count}회<br/>
              <span style={{color:'var(--danger)',fontSize:'11px'}}>취소 시 해당 세션 수가 차감됩니다.</span>
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setCancelPaymentTarget(null)}>아니오</button>
          <button className="btn btn-primary" style={{flex:1,background:'var(--danger)',color:'#fff'}} onClick={()=>{deletePayment(cancelPaymentTarget);setCancelPaymentTarget(null)}}>네</button>
        </div>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal open={paymentModal} onClose={()=>setPaymentModal(false)} title={`결제 관리 — ${currentMember?.name||''}`}>
        <div className="type-row" style={{marginBottom:'14px'}}>
          <button className={`type-btn${paymentTab==='pay'?' active':''}`} onClick={()=>setPaymentTab('pay')}>💳 결제 등록</button>
          <button className={`type-btn${paymentTab==='history'?' active':''}`} onClick={()=>setPaymentTab('history')}>📋 결제 내역</button>
          <button className={`type-btn${paymentTab==='products'?' active':''}`} onClick={()=>setPaymentTab('products')}>🗂 상품 관리</button>
        </div>

        {paymentTab === 'pay' && (
          <div>
            <div className="form-group">
              <label>상품 선택</label>
              <select value={paymentForm.productId} onChange={e=>setPaymentForm({...paymentForm,productId:e.target.value})}>
                <option value="">상품을 선택하세요</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.session_count}회)</option>)}
              </select>
            </div>
            {paymentForm.productId && (() => {
              const prod = products.find(p=>p.id===paymentForm.productId)
              return prod ? (
                <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',marginBottom:'12px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                    <div>
                      <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'3px'}}>부가세 미포함</div>
                      <div style={{fontSize:'15px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{(prod.price_excl_tax||0).toLocaleString()}원</div>
                    </div>
                    <div>
                      <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'3px'}}>부가세 포함</div>
                      <div style={{fontSize:'15px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{(prod.price_incl_tax||0).toLocaleString()}원</div>
                    </div>
                  </div>
                  <div style={{marginTop:'10px'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                      <input type="checkbox" checked={paymentForm.taxIncluded} onChange={e=>setPaymentForm({...paymentForm,taxIncluded:e.target.checked})} />
                      부가세 포함 금액으로 결제
                    </label>
                  </div>
                  <div style={{marginTop:'8px',fontSize:'12px',color:'var(--text-muted)'}}>
                    결제 금액: <span style={{color:'var(--accent)',fontWeight:700}}>{(paymentForm.taxIncluded?(prod.price_incl_tax||prod.price_excl_tax):prod.price_excl_tax).toLocaleString()}원</span>
                    {' '}· 세션 {prod.session_count}회 추가
                  </div>
                </div>
              ) : null
            })()}
            {/* 결제 수단 선택 */}
            <div className="form-group" style={{marginBottom:'8px'}}>
              <label>결제 수단</label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'6px',marginTop:'4px'}}>
                {[
                  {value:'cash',     label:'💵',  name:'현금'},
                  {value:'card',     label:'💳',  name:'카드'},
                  {value:'transfer', label:'🏦',  name:'계좌\n이체'},
                  {value:'local_currency', label:'🪙', name:'지역\n화폐'},
                  {value:'payments_app',   label:'📱', name:'페이\n먼츠'},
                ].map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={()=>setPaymentForm(f=>({...f,paymentMethod:m.value,paymentMethodMemo:''}))}
                    style={{
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      gap:'3px',padding:'10px 4px',borderRadius:'10px',
                      border: paymentForm.paymentMethod===m.value
                        ? '2px solid var(--accent-dim)'
                        : '1px solid var(--border)',
                      background: paymentForm.paymentMethod===m.value
                        ? 'rgba(200,241,53,0.12)'
                        : 'var(--surface2)',
                      cursor:'pointer',fontFamily:'inherit',
                      transition:'all 0.12s',
                    }}
                  >
                    <span style={{fontSize:'18px',lineHeight:1}}>{m.label}</span>
                    <span style={{
                      fontSize:'9px',fontWeight:600,whiteSpace:'pre',textAlign:'center',lineHeight:1.3,
                      color: paymentForm.paymentMethod===m.value ? 'var(--accent-text)' : 'var(--text-muted)',
                    }}>{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* 페이먼츠 / 지역화폐 선택 시 상세 메모 입력란 */}
            {(paymentForm.paymentMethod === 'payments_app' || paymentForm.paymentMethod === 'local_currency') && (
              <div style={{
                display:'flex',alignItems:'center',gap:'8px',
                padding:'8px 12px',borderRadius:'8px',
                background:'rgba(200,241,53,0.07)',
                border:'1px solid rgba(200,241,53,0.25)',
                marginBottom:'12px',
              }}>
                <span style={{fontSize:'13px',flexShrink:0}}>
                  {paymentForm.paymentMethod === 'payments_app' ? '📱' : '🪙'}
                </span>
                <input
                  type="text"
                  value={paymentForm.paymentMethodMemo}
                  onChange={e=>setPaymentForm(f=>({...f,paymentMethodMemo:e.target.value}))}
                  placeholder={
                    paymentForm.paymentMethod === 'payments_app'
                      ? '결제 앱 종류 입력 (예: 카카오페이, 네이버페이...)'
                      : '지역화폐 종류 입력 (예: 서울사랑상품권...)'
                  }
                  style={{
                    flex:1,border:'none',background:'transparent',
                    color:'var(--text)',fontSize:'12px',fontFamily:'inherit',
                    outline:'none',
                  }}
                />
              </div>
            )}
            <div className="form-group">
              <label>메모 (선택)</label>
              <input type="text" value={paymentForm.memo} onChange={e=>setPaymentForm({...paymentForm,memo:e.target.value})} placeholder="특이사항, 할인 내용 등" />
            </div>
            <button className="btn btn-primary" style={{width:'100%'}} onClick={addPayment}>결제 등록</button>
            {!products.length && <div style={{marginTop:'10px',fontSize:'12px',color:'var(--text-muted)',textAlign:'center'}}>상품을 먼저 등록해주세요 → 상품 관리 탭</div>}
          </div>
        )}

        {paymentTab === 'history' && (
          <div>
            {payments.length === 0
              ? <div className="empty"><p>결제 내역이 없어요</p></div>
              : payments.map(p => {
                const METHOD_LABEL = {cash:'💵 현금',card:'💳 카드',transfer:'🏦 계좌이체',local_currency:'🪙 지역화폐',payments_app:'📱 페이먼츠'}
                const methodLabel = METHOD_LABEL[p.payment_method] || (p.payment_method || '')
                const methodDetail = p.payment_method_memo ? ` (${p.payment_method_memo})` : ''
                return (
                  <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'var(--surface2)',borderRadius:'8px',marginBottom:'8px'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'13px',fontWeight:500}}>{p.product_name}</div>
                      <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'4px',marginTop:'3px'}}>
                        {methodLabel && (
                          <span style={{fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'5px',
                            background:'rgba(200,241,53,0.12)',color:'var(--accent-text)',border:'1px solid rgba(200,241,53,0.3)'}}>
                            {methodLabel}{methodDetail}
                          </span>
                        )}
                        <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{new Date(p.paid_at).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'})} · {p.session_count}회{p.tax_included?' · 부가세포함':''}{p.memo?' · '+p.memo:''}</span>
                      </div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:'14px',fontWeight:700,color:'var(--accent)',fontFamily:"'DM Mono',monospace"}}>{p.amount.toLocaleString()}원</div>
                      <button style={{fontSize:'10px',color:'var(--danger)',background:'none',border:'none',cursor:'pointer',padding:0}} onClick={()=>setCancelPaymentTarget(p)}>취소</button>
                    </div>
                  </div>
                )
              })
            }
            {payments.length > 0 && (
              <div style={{textAlign:'right',paddingTop:'8px',borderTop:'1px solid var(--border)',fontSize:'12px',color:'var(--text-muted)'}}>
                총 결제: <span style={{color:'var(--accent)',fontWeight:700}}>{payments.reduce((s,p)=>s+p.amount,0).toLocaleString()}원</span>
              </div>
            )}
          </div>
        )}

        {paymentTab === 'products' && (
          <div>
            <button className="btn btn-primary btn-sm" style={{marginBottom:'12px'}} onClick={()=>{setEditingProductId(null);setProductForm({name:'',count:'',priceEx:'',priceIn:''});setProductFormModal(true)}}>+ 상품 추가</button>
            {products.length === 0
              ? <div className="empty"><p>등록된 상품이 없어요</p></div>
              : products.map(p => (
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'var(--surface2)',borderRadius:'8px',marginBottom:'8px'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:600}}>{p.name} <span style={{fontWeight:400,color:'var(--text-muted)'}}>({p.session_count}회)</span></div>
                    <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>
                      미포함 {(p.price_excl_tax||0).toLocaleString()}원 / 포함 {(p.price_incl_tax||0).toLocaleString()}원
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'6px'}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:'11px',padding:'4px 8px'}} onClick={()=>{setEditingProductId(p.id);setProductForm({name:p.name,count:String(p.session_count),priceEx:String(p.price_excl_tax||0),priceIn:String(p.price_incl_tax||0)});setProductFormModal(true)}}>수정</button>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:'11px',padding:'4px 8px',color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)'}} onClick={()=>deleteProduct(p.id)}>삭제</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </Modal>

      {/* PRODUCT MANAGE MODAL */}
      <Modal open={productManageModal} onClose={()=>setProductManageModal(false)} title="🗂 상품 관리" maxWidth="400px">
        <div style={{marginBottom:'12px',display:'flex',justifyContent:'flex-end'}}>
          <button
            className="btn btn-primary btn-sm"
            onClick={()=>{setEditingProductId(null);setProductForm({name:'',count:'',priceEx:'',priceIn:''});setProductFormModal(true)}}
          >+ 상품 추가</button>
        </div>
        {products.length === 0 ? (
          <div className="empty" style={{padding:'32px 0',textAlign:'center'}}>
            <div style={{fontSize:'32px',marginBottom:'10px'}}>📦</div>
            <p style={{color:'var(--text-muted)',fontSize:'13px'}}>등록된 상품이 없어요.<br/>상품 추가 버튼으로 첫 상품을 등록해보세요.</p>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {products.map(p => (
              <div key={p.id} style={{
                display:'flex',alignItems:'center',gap:'10px',
                padding:'12px 14px',background:'var(--surface2)',
                borderRadius:'10px',border:'1px solid var(--border)',
              }}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:'3px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {p.name}
                    <span style={{fontWeight:400,fontSize:'12px',color:'var(--text-muted)',marginLeft:'6px'}}>({p.session_count}회)</span>
                  </div>
                  <div style={{fontSize:'11px',color:'var(--text-muted)'}}>
                    부가세 미포함 <strong style={{color:'var(--text)'}}>{(p.price_excl_tax||0).toLocaleString()}원</strong>
                    <span style={{margin:'0 5px',color:'var(--border)'}}>|</span>
                    포함 <strong style={{color:'var(--text)'}}>{(p.price_incl_tax||0).toLocaleString()}원</strong>
                  </div>
                  {p.memo && <div style={{fontSize:'11px',color:'var(--accent-text)',marginTop:'3px'}}>💬 {p.memo}</div>}
                  <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>
                    회당 단가: 미포함 {Math.round((p.price_excl_tax||0)/(p.session_count||1)).toLocaleString()}원 / 포함 {Math.round((p.price_incl_tax||0)/(p.session_count||1)).toLocaleString()}원
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'4px',flexShrink:0}}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{fontSize:'11px',padding:'4px 10px'}}
                    onClick={()=>{
                      setEditingProductId(p.id)
                      setProductForm({name:p.name,count:String(p.session_count),priceEx:String(p.price_excl_tax||0),priceIn:String(p.price_incl_tax||0),memo:p.memo||''})
                      setProductFormModal(true)
                    }}>✏️ 수정</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{fontSize:'11px',padding:'4px 10px',color:'var(--danger)',borderColor:'rgba(239,68,68,0.3)'}}
                    onClick={()=>deleteProduct(p.id)}>🗑 삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* PRODUCT FORM MODAL */}
      <Modal open={productFormModal} onClose={()=>setProductFormModal(false)} title={editingProductId?'상품 수정':'상품 추가'} maxWidth="360px" zIndex={400}>
        <div className="form-group"><label>상품명</label><input type="text" value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} placeholder="예: 30회 패키지" /></div>
        <div className="form-group"><label>횟수</label><input type="number" value={productForm.count} onChange={e=>setProductForm({...productForm,count:e.target.value})} placeholder="30" min="1" /></div>
        <div className="divider"></div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
          <div className="section-label" style={{margin:0}}>단가 설정</div>
          <span style={{fontSize:'11px',color:'var(--accent)',fontWeight:600,background:'rgba(200,241,53,0.1)',border:'1px solid rgba(200,241,53,0.25)',borderRadius:'6px',padding:'1px 7px'}}>회당</span>
        </div>
        <div className="two-col">
          <div className="form-group"><label>부가세 미포함 (원)</label><input type="number" value={productForm.priceEx} onChange={e=>setProductForm({...productForm,priceEx:e.target.value})} placeholder="1500000" min="0" /></div>
          <div className="form-group"><label>부가세 포함 (원)</label><input type="number" value={productForm.priceIn} onChange={e=>setProductForm({...productForm,priceIn:e.target.value})} placeholder="1650000" min="0" /></div>
        </div>
        {productForm.count && productForm.priceEx && (
          <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'12px'}}>
            세션 단가: 미포함 {Math.round((parseInt(productForm.priceEx)||0)/(parseInt(productForm.count)||1)).toLocaleString()}원 / 포함 {Math.round((parseInt(productForm.priceIn)||0)/(parseInt(productForm.count)||1)).toLocaleString()}원
          </div>
        )}
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={productForm.memo||''} onChange={e=>setProductForm({...productForm,memo:e.target.value})} placeholder="할인 조건 등" /></div>
        <button className="btn btn-primary" style={{width:'100%'}} onClick={saveProduct}>저장</button>
      </Modal>

      {/* WORKOUT LOG MODAL */}
      <Modal open={workoutModal} onClose={()=>setWorkoutModal(false)} title={workoutEditId?'운동일지 수정':'운동 기록'} maxWidth="520px">
        <div className="two-col">
          <div className="form-group"><label>날짜</label><input type="date" value={workoutForm.date} onChange={e=>setWorkoutForm(f=>({...f,date:e.target.value}))} /></div>
          <div className="form-group"><label>운동 시간 (분)</label><input type="number" value={workoutForm.duration_min} onChange={e=>setWorkoutForm(f=>({...f,duration_min:e.target.value}))} placeholder="60" min="1" /></div>
        </div>
        <div className="form-group"><label>제목 (선택)</label><input type="text" value={workoutForm.title} onChange={e=>setWorkoutForm(f=>({...f,title:e.target.value}))} placeholder="상체 / 하체 / 풀바디..." /></div>

        <div className="divider"></div>
        <div className="section-label" style={{marginTop:0}}>운동 항목</div>
        {workoutForm.exercises.map((ex, ei) => (
          <div key={ex.localId} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px',marginBottom:'10px'}}>
            <div style={{display:'flex',gap:'8px',marginBottom:'8px',alignItems:'flex-start'}}>
              <input type="text" value={ex.name} onChange={e=>wfUpdateEx(ex.localId,'name',e.target.value)} placeholder={`운동명 (예: 벤치프레스)`} style={{flex:1}} />
              {workoutForm.exercises.length > 1 && (
                <button onClick={()=>wfRemoveEx(ex.localId)} style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'18px',padding:'0 4px',lineHeight:1,flexShrink:0}}>×</button>
              )}
            </div>
            {/* 근육군 칩 */}
            <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'10px'}}>
              {MUSCLE_GROUPS.map(mg=>(
                <button key={mg} type="button" onClick={()=>wfUpdateEx(ex.localId,'muscle_group',ex.muscle_group===mg?'':mg)}
                  style={{padding:'3px 9px',borderRadius:'6px',border:'1px solid',fontSize:'11px',cursor:'pointer',fontFamily:'inherit',
                    background: ex.muscle_group===mg?(MUSCLE_COLOR[mg]||'var(--accent)'):'var(--surface2)',
                    color: ex.muscle_group===mg?'#fff':'var(--text-muted)',
                    borderColor: ex.muscle_group===mg?(MUSCLE_COLOR[mg]||'var(--accent)'):'var(--border)'}}>
                  {mg}
                </button>
              ))}
            </div>
            {/* 세트 목록 */}
            <div style={{display:'flex',gap:'4px',marginBottom:'4px'}}>
              <span style={{fontSize:'10px',color:'var(--text-dim)',width:'32px',textAlign:'center'}}>세트</span>
              <span style={{fontSize:'10px',color:'var(--text-dim)',flex:1,textAlign:'center'}}>무게 (kg)</span>
              <span style={{fontSize:'10px',color:'var(--text-dim)',flex:1,textAlign:'center'}}>횟수</span>
              <span style={{fontSize:'10px',color:'var(--text-dim)',flex:1,textAlign:'center'}}>휴식 (초)</span>
              <span style={{width:'24px'}}></span>
            </div>
            {ex.sets.map((set,si)=>(
              <div key={si} style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'4px'}}>
                <span style={{fontSize:'11px',color:'var(--text-dim)',width:'32px',textAlign:'center',flexShrink:0}}>{si+1}</span>
                <input type="number" value={set.weight} onChange={e=>wfUpdateSet(ex.localId,si,'weight',e.target.value)} placeholder="0" min="0" step="0.5" style={{flex:1,padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                <input type="number" value={set.reps} onChange={e=>wfUpdateSet(ex.localId,si,'reps',e.target.value)} placeholder="0" min="0" style={{flex:1,padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                <input type="number" value={set.rest_sec} onChange={e=>wfUpdateSet(ex.localId,si,'rest_sec',e.target.value)} placeholder="60" min="0" style={{flex:1,padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                {ex.sets.length > 1
                  ? <button onClick={()=>wfRemoveSet(ex.localId,si)} style={{width:'24px',background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'16px',flexShrink:0,padding:0}}>×</button>
                  : <span style={{width:'24px'}}></span>
                }
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:'4px',fontSize:'11px'}} onClick={()=>wfAddSet(ex.localId)}>+ 세트 추가</button>
          </div>
        ))}
        <button className="btn btn-ghost" style={{width:'100%',marginBottom:'12px'}} onClick={wfAddEx}>+ 운동 종목 추가</button>

        <div className="form-group"><label>메모 (선택)</label><textarea value={workoutForm.memo} onChange={e=>setWorkoutForm(f=>({...f,memo:e.target.value}))} placeholder="오늘 컨디션, 특이사항 등" rows={2} style={{resize:'vertical'}} /></div>

        {/* 루틴 저장 */}
        <div style={{display:'flex',gap:'6px',marginBottom:'12px',padding:'10px',background:'var(--surface)',borderRadius:'8px',border:'1px solid var(--border)'}}>
          <input type="text" value={workoutSaveRoutineName} onChange={e=>setWorkoutSaveRoutineName(e.target.value)} placeholder="루틴 이름 입력 후 저장" style={{flex:1,fontSize:'12px'}} />
          <button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:'12px'}} onClick={saveAsRoutine}>루틴 저장</button>
        </div>
        <button className="btn btn-primary" style={{width:'100%'}} onClick={saveWorkoutSession}>{workoutEditId?'수정 완료':'기록 완료'}</button>
      </Modal>

      {/* WORKOUT ROUTINE MODAL */}
      <Modal open={workoutRoutineModal} onClose={()=>setWorkoutRoutineModal(false)} title="루틴 불러오기">
        {/* ── 🛒 마켓 루틴 보관함 ── */}
        {trainerLibraryRoutines.length > 0 && (
          <>
            <div style={{fontSize:'11px',fontWeight:700,color:'#34d399',letterSpacing:'0.08em',marginBottom:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
              🛒 마켓 루틴 보관함
              <span style={{fontSize:'10px',color:'var(--text-dim)',fontWeight:400}}>— 구매한 교육자 루틴</span>
            </div>
            {trainerLibraryRoutines.map(r => (
              <div key={r.id} style={{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.25)',borderRadius:'10px',padding:'12px',marginBottom:'8px'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:700,marginBottom:'4px',color:'var(--text)'}}>
                      {r.name.replace(/^\[마켓\]\s*/, '')}
                    </div>
                    <div style={{fontSize:'11px',color:'var(--text-dim)'}}>
                      {(r.exercises||[]).length}종목 · {(r.exercises||[]).map(e=>e.name).filter(Boolean).join(', ').slice(0,50)}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',gap:'6px',marginTop:'10px'}}>
                  {/* 이 회원에게 적용: workout_routines 복사본 생성 */}
                  <button
                    className="btn btn-primary btn-sm"
                    style={{flex:2,fontSize:'11px',background:'#34d399',color:'#0a0a0a',fontWeight:700}}
                    onClick={()=>applyLibraryRoutineToMember(r)}>
                    ✅ {currentMember?.name || '회원'}에게 적용
                  </button>
                  {/* 세션 폼에 바로 불러오기 */}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{flex:1,fontSize:'11px'}}
                    onClick={()=>loadRoutineIntoForm(r)}>
                    폼에 불러오기
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{flexShrink:0,fontSize:'11px',color:'var(--danger)',padding:'4px 8px'}}
                    onClick={()=>deleteLibraryRoutine(r.id)}>×</button>
                </div>
              </div>
            ))}
            {workoutRoutines.length > 0 && (
              <div style={{borderTop:'1px solid var(--border)',margin:'12px 0 10px'}} />
            )}
          </>
        )}

        {/* ── 회원별 저장 루틴 ── */}
        {workoutRoutines.length > 0 && (
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--text-dim)',letterSpacing:'0.08em',marginBottom:'8px'}}>
            📋 저장된 루틴
          </div>
        )}
        {!workoutRoutines.length && !trainerLibraryRoutines.length && (
          <div className="empty"><p>저장된 루틴이 없어요</p></div>
        )}
        {workoutRoutines.map(r=>(
          <div key={r.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'8px'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',fontWeight:600,marginBottom:'4px'}}>{r.name}</div>
              <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{(r.exercises||[]).length}종목 · {(r.exercises||[]).map(e=>e.name).filter(Boolean).join(', ').slice(0,40)}</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{flexShrink:0,fontSize:'12px'}} onClick={()=>loadRoutineIntoForm(r)}>불러오기</button>
            <button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:'12px',color:'var(--danger)',padding:'4px 6px'}} onClick={()=>deleteWorkoutRoutine(r.id)}>×</button>
          </div>
        ))}
      </Modal>

      {/* HOLD (정지/홀딩) MODAL */}
      <Modal open={holdModal} onClose={()=>setHoldModal(false)} title="정지 (기간 홀딩)" zIndex={400}>
        {/* 기존 홀딩 이력 */}
        {holds.length > 0 && (
          <>
            <div className="section-label" style={{marginTop:0}}>정지 이력</div>
            {holds.map(h => (
              <div key={h.id} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13px',fontWeight:500}}>{h.start_date} ~ {h.end_date}</div>
                  {h.product_name && <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>상품: {h.product_name}</div>}
                  {h.reason && <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>{h.reason}</div>}
                  {h.photo_url && <img src={h.photo_url} alt="첨부사진" style={{marginTop:'6px',maxWidth:'100%',maxHeight:'120px',borderRadius:'6px',objectFit:'cover'}} />}
                </div>
                <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)',fontSize:'11px',flexShrink:0}} onClick={()=>deleteHold(h.id)}>해제</button>
              </div>
            ))}
            <div className="divider"></div>
          </>
        )}
        <div className="section-label" style={{marginTop:0}}>새 정지 등록</div>
        <div className="two-col">
          <div className="form-group"><label>시작일</label><input type="date" value={holdForm.startDate} onChange={e=>setHoldForm({...holdForm,startDate:e.target.value})} /></div>
          <div className="form-group"><label>종료일</label><input type="date" value={holdForm.endDate} onChange={e=>setHoldForm({...holdForm,endDate:e.target.value})} /></div>
        </div>
        {holdForm.startDate && holdForm.endDate && holdForm.startDate <= holdForm.endDate && (
          <div style={{fontSize:'12px',color:'var(--accent)',marginBottom:'8px',marginTop:'-4px'}}>
            총 {Math.round((new Date(holdForm.endDate)-new Date(holdForm.startDate))/86400000)+1}일 정지
          </div>
        )}
        <div className="form-group">
          <label>상품 선택 (선택)</label>
          <select value={holdForm.productId} onChange={e=>setHoldForm({...holdForm,productId:e.target.value})}>
            <option value="">상품 미지정</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>정지 사유 (메모)</label>
          <textarea value={holdForm.reason} onChange={e=>setHoldForm({...holdForm,reason:e.target.value})} placeholder="부상, 개인 사정, 여행 등" rows={2} style={{resize:'vertical'}} />
        </div>
        <div className="form-group">
          <label>사진 첨부 (선택)</label>
          <input type="file" accept="image/*" onChange={e=>{
            const file = e.target.files?.[0]
            if (!file) return
            setHoldForm({...holdForm, photoFile:file, photoPreview:URL.createObjectURL(file)})
          }} style={{fontSize:'12px'}} />
          {holdForm.photoPreview && (
            <div style={{marginTop:'8px',position:'relative',display:'inline-block'}}>
              <img src={holdForm.photoPreview} alt="미리보기" style={{maxWidth:'100%',maxHeight:'160px',borderRadius:'8px',objectFit:'cover'}} />
              <button onClick={()=>setHoldForm({...holdForm,photoFile:null,photoPreview:''})}
                style={{position:'absolute',top:'4px',right:'4px',background:'rgba(0,0,0,0.6)',border:'none',borderRadius:'50%',width:'22px',height:'22px',color:'#fff',cursor:'pointer',fontSize:'12px',lineHeight:'22px',textAlign:'center'}}>✕</button>
            </div>
          )}
        </div>
        <button className="btn btn-primary" style={{width:'100%'}} onClick={addHold}>정지 등록</button>
      </Modal>

      {/* EDIT MEMBER MODAL */}
      <Modal open={editMemberModal} onClose={()=>setEditMemberModal(false)} title="회원 정보 수정">
        <div className="section-label" style={{marginTop:0}}>기본 정보</div>
        <div className="form-group"><label>이름 *</label><input type="text" value={editMemberForm.name||''} onChange={e=>setEditMemberForm({...editMemberForm,name:e.target.value})} placeholder="홍길동" /></div>
        <div className="form-group"><label>휴대폰 번호 (카카오톡 발송용)</label><input type="text" value={editMemberForm.kakao_phone||''} onChange={e=>setEditMemberForm({...editMemberForm,kakao_phone:e.target.value})} placeholder="010-1234-5678" /></div>
        <div className="form-group"><label>전화번호 뒷 4자리 (회원 포털 로그인용) *</label><input type="text" value={editMemberForm.phone||''} onChange={e=>setEditMemberForm({...editMemberForm,phone:e.target.value})} placeholder="1234" maxLength={4} /></div>
        <div className="form-group"><label>생년월일</label><input type="date" value={editMemberForm.birthdate||''} onChange={e=>setEditMemberForm({...editMemberForm,birthdate:e.target.value})} /></div>
        <div className="form-group"><label>주소</label><input type="text" value={editMemberForm.address||''} onChange={e=>setEditMemberForm({...editMemberForm,address:e.target.value})} placeholder="서울시 강남구..." /></div>
        <div className="form-group"><label>이메일 (선택)</label><input type="email" value={editMemberForm.email||''} onChange={e=>setEditMemberForm({...editMemberForm,email:e.target.value})} placeholder="example@gmail.com" /></div>
        <div className="form-group"><label>특이사항</label><textarea value={editMemberForm.special_notes||''} onChange={e=>setEditMemberForm({...editMemberForm,special_notes:e.target.value})} placeholder="부상 이력, 주의사항 등" rows={2} style={{resize:'vertical'}} /></div>
        <div className="form-group"><label>운동 목적</label>
          <select value={editMemberForm.purpose||'체형교정'} onChange={e=>setEditMemberForm({...editMemberForm,purpose:e.target.value})}>
            {['체형교정','근비대','다이어트','체력향상','재활','스포츠퍼포먼스','유지관리','기타'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>방문 경로</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'8px'}}>
            {['소개','인터넷','광고물','SNS','기타'].map(src => (
              <button key={src} type="button" onClick={()=>setEditMemberForm({...editMemberForm,visit_source:editMemberForm.visit_source===src?'':src,visit_source_memo:''})}
                style={{padding:'6px 12px',borderRadius:'8px',border:'1px solid',fontSize:'12px',cursor:'pointer',fontFamily:'inherit',
                  background: editMemberForm.visit_source===src ? 'var(--accent)' : 'var(--surface2)',
                  color: editMemberForm.visit_source===src ? '#0f0f0f' : 'var(--text-muted)',
                  borderColor: editMemberForm.visit_source===src ? 'var(--accent)' : 'var(--border)'}}>
                {src}
              </button>
            ))}
          </div>
          {(editMemberForm.visit_source==='소개'||editMemberForm.visit_source==='기타') && (
            <input type="text" value={editMemberForm.visit_source_memo||''} onChange={e=>setEditMemberForm({...editMemberForm,visit_source_memo:e.target.value})}
              placeholder={editMemberForm.visit_source==='소개'?'소개해주신 분 이름 또는 메모':'기타 경로 메모'} />
          )}
          {editMemberForm.visit_source==='광고물' && <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'4px'}}>간판, 전단지, 현수막 등</div>}
        </div>
        <div className="divider"></div>
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={editMemberForm.memo||''} onChange={e=>setEditMemberForm({...editMemberForm,memo:e.target.value})} placeholder="기타 메모" /></div>
        <div className="divider"></div>

        {/* 세션 직접 수정 — 고급 설정 (접기/펼치기) */}
        <div style={{marginBottom:'16px'}}>
          {/* 헤더 */}
          <button
            type="button"
            onClick={()=>setSessionAdvOpen(o=>!o)}
            style={{
              width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
              background: sessionAdvOpen ? 'var(--surface2)' : 'var(--surface2)',
              border:'1px solid var(--border)',borderRadius: sessionAdvOpen ? '10px 10px 0 0' : '10px',
              padding:'10px 14px',cursor:'pointer',fontFamily:'inherit',transition:'border-radius 0.15s',
            }}
          >
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'12px',fontWeight:700,color:'var(--text)'}}>⚙️ 세션 직접 수정</span>
              <span style={{fontSize:'10px',color:'var(--text-dim)',fontWeight:400}}>앱 이전·오류 수정·증정 세션 전용</span>
              {/* ? 버튼 */}
              <button
                type="button"
                onClick={e=>{e.stopPropagation();setSessionInfoOpen(o=>!o)}}
                style={{
                  width:'16px',height:'16px',borderRadius:'50%',border:'1px solid var(--border)',
                  background:'var(--surface)',color:'var(--text-dim)',fontSize:'9px',fontWeight:700,
                  cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                  padding:0,fontFamily:'inherit',flexShrink:0,lineHeight:1,
                }}>?</button>
            </div>
            <span style={{fontSize:'13px',color:'var(--text-muted)',lineHeight:1}}>
              {sessionAdvOpen ? '▲' : '▼'}
            </span>
          </button>

          {/* ? 설명 툴팁 */}
          {sessionInfoOpen && (
            <div style={{
              background:'#1e2a1a',border:'1px solid rgba(200,241,53,0.2)',
              borderRadius:'10px',padding:'13px 15px',margin:'6px 0',
              fontSize:'12px',lineHeight:'1.85',color:'#d1fae5',
              boxShadow:'0 6px 20px rgba(0,0,0,0.25)',position:'relative',
            }}>
              <button
                onClick={()=>setSessionInfoOpen(false)}
                style={{position:'absolute',top:'8px',right:'10px',background:'none',border:'none',
                  color:'#6b7280',cursor:'pointer',fontSize:'14px',lineHeight:1,padding:0}}>×</button>
              <div style={{fontWeight:700,color:'#a3e635',marginBottom:'8px',fontSize:'12px'}}>
                💡 매출관리 결제 vs 세션 직접 수정
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                <div>
                  <span style={{color:'#86efac',fontWeight:600}}>💳 매출관리 → 결제 등록</span>
                  <br/>상품 선택 → 결제 금액 기록 + 세션 수 자동 추가.<br/>
                  <span style={{color:'#6b7280'}}>정식 결제 흐름으로, 매출 내역에 기록됩니다.</span>
                </div>
                <div style={{height:'1px',background:'rgba(255,255,255,0.07)'}}/>
                <div>
                  <span style={{color:'#fbbf24',fontWeight:600}}>⚙️ 세션 직접 수정 (이 항목)</span>
                  <br/>결제 기록 없이 세션 수만 바로 수정합니다.<br/>
                  <span style={{color:'#9ca3af'}}>아래 경우에만 사용하세요:</span>
                  <ul style={{margin:'5px 0 0 14px',padding:0,color:'#9ca3af',fontSize:'11px',lineHeight:'1.9'}}>
                    <li>다른 앱에서 이전 시 기존 수업 이력 입력</li>
                    <li>세션 수를 잘못 입력했을 때 수정</li>
                    <li>결제 없이 증정 세션을 추가할 때</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 펼쳐진 입력 영역 */}
          {sessionAdvOpen && (
            <div style={{
              border:'1px solid var(--border)',borderTop:'none',
              borderRadius:'0 0 10px 10px',padding:'14px',
              background:'var(--surface)',
            }}>
              <div style={{
                fontSize:'11px',color:'#f97316',background:'rgba(249,115,22,0.08)',
                border:'1px solid rgba(249,115,22,0.2)',borderRadius:'7px',
                padding:'7px 10px',marginBottom:'12px',lineHeight:'1.6',
              }}>
                ⚠️ 결제 기록 없이 직접 수정됩니다. 정식 결제는 <strong>매출관리 탭</strong>을 이용하세요.
              </div>
              <div className="two-col">
                <div className="form-group" style={{marginBottom:0}}>
                  <label>총 세션 수</label>
                  <input type="number" value={editMemberForm.total||''} onChange={e=>setEditMemberForm({...editMemberForm,total:e.target.value})} placeholder="30" min="1" />
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label>완료한 세션</label>
                  <input type="number" value={editMemberForm.done||''} onChange={e=>setEditMemberForm({...editMemberForm,done:e.target.value})} placeholder="0" min="0" />
                </div>
              </div>
              <div className="form-group" style={{marginTop:'10px',marginBottom:0}}>
                <label>세션 단가 (원)</label>
                <input type="number" value={editMemberForm.price||''} onChange={e=>setEditMemberForm({...editMemberForm,price:e.target.value})} placeholder="60000" min="0" />
              </div>
            </div>
          )}
        </div>

        <div className="divider"></div>

        {/* 정지 이력 */}
        <div style={{
          background:'var(--surface2)',borderRadius:'10px',
          border:'1px solid var(--border)',
          padding:'12px 14px',marginBottom:'16px',
        }}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{fontSize:'12px',fontWeight:700,color:'var(--text)'}}>⏸ 정지 이력</span>
              {holds.length > 0 && (
                <span style={{fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'10px',
                  background:'rgba(249,115,22,0.12)',color:'#f97316',border:'1px solid rgba(249,115,22,0.25)'}}>
                  총 {holds.length}회 · {holds.reduce((s,h)=>s+Math.round((new Date(h.end_date)-new Date(h.start_date))/86400000)+1,0)}일
                </span>
              )}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{fontSize:'11px',padding:'3px 10px'}}
              onClick={()=>{
                setCurrentMemberId(editMemberForm.id)
                setHoldForm({startDate:'',endDate:'',productId:'',reason:'',photoFile:null,photoPreview:''})
                setHoldModal(true)
              }}
            >+ 정지 등록</button>
          </div>

          {holds.length === 0 ? (
            <div style={{textAlign:'center',padding:'14px 0',color:'var(--text-dim)',fontSize:'12px'}}>
              정지 이력이 없어요
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {holds.map(h => {
                const days = Math.round((new Date(h.end_date)-new Date(h.start_date))/86400000)+1
                const today = new Date().toISOString().split('T')[0]
                const isActive = h.start_date <= today && today <= h.end_date
                const startFmt = new Date(h.start_date+'T00:00:00').toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'})
                const endFmt   = new Date(h.end_date  +'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
                return (
                  <div key={h.id} style={{
                    background:'var(--surface)',borderRadius:'8px',
                    border: isActive ? '1px solid rgba(249,115,22,0.35)' : '1px solid var(--border)',
                    padding:'10px 12px',
                  }}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'8px'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'4px'}}>
                          {isActive && (
                            <span style={{fontSize:'10px',fontWeight:700,padding:'1px 7px',borderRadius:'4px',
                              background:'rgba(249,115,22,0.15)',color:'#f97316',border:'1px solid rgba(249,115,22,0.3)'}}>
                              진행중
                            </span>
                          )}
                          <span style={{fontSize:'12px',fontWeight:600,color:'var(--text)'}}>
                            {startFmt} ~ {endFmt}
                          </span>
                          <span style={{fontSize:'11px',color:'var(--text-muted)',fontFamily:"'DM Mono',monospace"}}>
                            {days}일
                          </span>
                        </div>
                        {h.reason && (
                          <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>
                            💬 {h.reason}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={()=>deleteHold(h.id, editMemberForm.id)}
                        style={{fontSize:'10px',color:'var(--danger)',background:'none',border:'none',
                          cursor:'pointer',padding:'2px 4px',flexShrink:0,lineHeight:1}}>
                        해제
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button className="btn btn-primary" style={{width:'100%',marginBottom:'8px'}} onClick={updateMember}>저장</button>
        <button className="btn btn-ghost" style={{width:'100%',color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)'}} onClick={()=>setDeleteConfirmModal(true)}>회원 삭제</button>
      </Modal>

      {/* DELETE CONFIRM MODAL */}
      <Modal open={deleteConfirmModal} onClose={()=>setDeleteConfirmModal(false)} title="회원 삭제" maxWidth="320px">
        <div style={{textAlign:'center',padding:'8px 0 20px'}}>
          <div style={{fontSize:'32px',marginBottom:'12px'}}>⚠️</div>
          <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px'}}>{editMemberForm.name} 회원을 삭제할까요?</div>
          <div style={{fontSize:'12px',color:'var(--text-muted)',lineHeight:'1.6'}}>수업일지, 건강기록 등 관련 데이터는<br/>삭제되지 않습니다.</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setDeleteConfirmModal(false)}>취소</button>
          <button className="btn btn-primary" style={{flex:1,background:'var(--danger)',color:'#fff'}} onClick={deleteMember}>삭제</button>
        </div>
      </Modal>

      {/* SETTINGS MODAL */}
      {/* 일지 확인 현황 모달 */}
      <Modal open={showReadModal} onClose={()=>setShowReadModal(false)} title="✅ 일지 확인 현황">
        {(() => {
          const readLogs   = logs.filter(l => l.read_at)
          const unreadLogs = logs.filter(l => !l.read_at)
          const fmt = (str) => {
            const d = new Date(str)
            return d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
          }
          return (
            <div>
              {/* 요약 */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'16px'}}>
                <div style={{background:'rgba(74,222,128,0.1)',border:'1px solid rgba(74,222,128,0.3)',borderRadius:'10px',padding:'12px',textAlign:'center'}}>
                  <div style={{fontSize:'24px',fontWeight:800,color:'#4ade80'}}>{readLogs.length}</div>
                  <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'2px'}}>확인 완료</div>
                </div>
                <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'10px',padding:'12px',textAlign:'center'}}>
                  <div style={{fontSize:'24px',fontWeight:800,color:'#ef4444'}}>{unreadLogs.length}</div>
                  <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'2px'}}>미확인</div>
                </div>
              </div>

              {/* 미확인 목록 */}
              {unreadLogs.length > 0 && (
                <>
                  <div style={{fontSize:'11px',fontWeight:700,color:'#ef4444',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.05em'}}>⏳ 미확인</div>
                  {unreadLogs.map(l => {
                    const mem = members.find(x=>x.id===l.member_id)
                    return (
                      <div key={l.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'var(--surface2)',borderRadius:'8px',marginBottom:'4px'}}>
                        <div>
                          <span style={{fontSize:'13px',fontWeight:700}}>{mem?.name || '회원'}</span>
                          <span style={{fontSize:'11px',color:'var(--text-dim)',marginLeft:'6px'}}>{l.session_number}회차</span>
                        </div>
                        <div style={{fontSize:'11px',color:'var(--text-dim)'}}>{fmt(l.created_at)}</div>
                      </div>
                    )
                  })}
                  <div style={{height:'12px'}}/>
                </>
              )}

              {/* 확인 완료 목록 */}
              {readLogs.length > 0 && (
                <>
                  <div style={{fontSize:'11px',fontWeight:700,color:'#4ade80',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.05em'}}>✅ 확인 완료</div>
                  {readLogs.map(l => {
                    const mem = members.find(x=>x.id===l.member_id)
                    return (
                      <div key={l.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'var(--surface2)',borderRadius:'8px',marginBottom:'4px'}}>
                        <div>
                          <span style={{fontSize:'13px',fontWeight:700}}>{mem?.name || '회원'}</span>
                          <span style={{fontSize:'11px',color:'var(--text-dim)',marginLeft:'6px'}}>{l.session_number}회차</span>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:'10px',color:'#4ade80',fontWeight:600}}>확인</div>
                          <div style={{fontSize:'10px',color:'var(--text-dim)'}}>{fmt(l.read_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {!logs.length && <div className="empty"><p>아직 발송한 일지가 없어요</p></div>}
            </div>
          )
        })()}
      </Modal>

      <Modal open={settingsModal} onClose={()=>setSettingsModal(false)} title="설정">
        <div className="form-group">
          <label>트레이너 이름</label>
          <input type="text" value={trainer?.name||''} readOnly style={{opacity:0.6}} />
        </div>
        <div className="divider"></div>

        {/* 크레딧 섹션 */}
        <div className="form-group">
          <label>AI 크레딧</label>
          <div style={{
            background:'rgba(255,255,255,0.05)',
            border:'1px solid var(--border)',
            borderRadius:'10px',
            padding:'16px',
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
              <div>
                <div style={{fontSize:'28px',fontWeight:800,fontFamily:"'DM Mono',monospace",color:'var(--accent)',lineHeight:1}}>
                  {credits}
                </div>
                <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'4px'}}>보유 크레딧</div>
              </div>
              <div style={{fontSize:'32px'}}>🎟️</div>
            </div>
            <div style={{fontSize:'11px',color:'var(--text-muted)',lineHeight:1.6,marginBottom:'12px'}}>
              크레딧 1개 = AI 수업일지 생성 1회<br/>
              크레딧이 부족하면 관리자에게 충전을 요청하세요.
            </div>
            <div style={{
              background:'rgba(200,241,53,0.08)',
              border:'1px solid rgba(200,241,53,0.2)',
              borderRadius:'8px',
              padding:'10px 12px',
              fontSize:'12px',
              color:'var(--accent)',
              fontWeight:600,
            }}>
              💡 크레딧 충전 문의: 관리자에게 연락해주세요
            </div>
          </div>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={saveSettings}>닫기</button>
      </Modal>

      {/* ── 크레딧 부족 모달 ── */}
      <Modal open={showLimitModal} onClose={()=>setShowLimitModal(false)} title="크레딧이 부족해요">
        <div style={{textAlign:'center',padding:'8px 0'}}>
          <div style={{fontSize:'48px',marginBottom:'12px'}}>🎟️</div>
          <div style={{fontSize:'15px',fontWeight:700,marginBottom:'8px'}}>
            AI 수업일지를 생성하려면 크레딧이 필요해요
          </div>
          <div style={{fontSize:'13px',color:'var(--text-dim)',marginBottom:'16px'}}>
            현재 보유 크레딧: <strong style={{color:'var(--accent)'}}>{credits}개</strong>
          </div>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'14px',marginBottom:'16px',textAlign:'left',fontSize:'13px',lineHeight:1.7}}>
            <div style={{fontWeight:600,marginBottom:'6px'}}>💡 크레딧이란?</div>
            <div style={{color:'var(--text-dim)'}}>크레딧 1개로 AI 수업일지를 1회 생성할 수 있어요. 크레딧은 관리자에게 문의하여 충전할 수 있어요.</div>
          </div>
          <button
            className="btn btn-primary"
            style={{width:'100%',marginBottom:'8px'}}
            onClick={()=>{ setShowLimitModal(false); setSettingsModal(true) }}
          >
            🎟️ 크레딧 확인하기
          </button>
          <button className="btn btn-ghost" style={{width:'100%'}} onClick={()=>setShowLimitModal(false)}>
            닫기
          </button>
        </div>
      </Modal>

      {/* ── API KEY 발급 가이드 모달 (비활성화) ── */}
      <Modal open={false} onClose={()=>{}} title="Gemini API 키 발급 방법">
        <div style={{fontSize:'13px',lineHeight:1.6}}>

          {/* 비용 안심 배너 */}
          <div style={{background:'rgba(74,222,128,0.1)',border:'1px solid rgba(74,222,128,0.3)',
            borderRadius:'12px',padding:'14px',marginBottom:'20px'}}>
            <div style={{fontWeight:700,color:'#4ade80',fontSize:'14px',marginBottom:'8px'}}>
              🛡️ 비용 걱정 없이 무료로 사용하세요
            </div>
            {[
              ['💳', '신용카드 등록 없이', '구글 계정만 있으면 바로 발급 가능'],
              ['🔒', '자동 차단 보호', '무료 한도 초과 시 자동으로 멈춰요 (추가 청구 없음)'],
              ['🎁', '개인 사용 충분한 무료 한도', '일반적인 PT 수업량 기준으로 무료 한도 안에서 사용 가능'],
              ['🚫', '유료 전환 불가', '직접 카드 등록하지 않는 한 절대 청구되지 않아요'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{display:'flex',gap:'10px',marginBottom:'8px',alignItems:'flex-start'}}>
                <span style={{fontSize:'16px',flexShrink:0}}>{icon}</span>
                <div>
                  <div style={{fontWeight:700,color:'var(--text)',fontSize:'12px'}}>{title}</div>
                  <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 발급 단계 */}
          <div style={{fontWeight:700,color:'var(--text)',marginBottom:'14px',fontSize:'14px'}}>
            📋 발급 순서 (3분이면 끝나요)
          </div>

          {/* STEP 1 */}
          <div style={{marginBottom:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
              <div style={{width:'24px',height:'24px',borderRadius:'50%',background:'var(--accent)',
                color:'#0f0f0f',fontWeight:800,fontSize:'12px',display:'flex',alignItems:'center',
                justifyContent:'center',flexShrink:0}}>1</div>
              <div style={{fontWeight:700,color:'var(--text)'}}>Google AI Studio 접속</div>
            </div>
            {/* 화면 mock */}
            <div style={{background:'#1a1a2e',borderRadius:'10px',padding:'12px',marginLeft:'32px',
              border:'1px solid rgba(255,255,255,0.1)'}}>
              <div style={{display:'flex',gap:'6px',marginBottom:'8px'}}>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#f87171'}}/>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#facc15'}}/>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#4ade80'}}/>
              </div>
              <div style={{background:'rgba(255,255,255,0.08)',borderRadius:'6px',padding:'6px 10px',
                fontSize:'11px',color:'#60a5fa',fontFamily:'monospace'}}>
                🔗 aistudio.google.com/app/apikey
              </div>
            </div>
            <div style={{marginLeft:'32px',marginTop:'6px',fontSize:'11px',color:'var(--text-dim)'}}>
              위 주소로 접속하거나 아래 버튼을 클릭하세요.
            </div>
            <div style={{marginLeft:'32px',marginTop:'8px'}}>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                style={{display:'inline-block',background:'var(--accent)',color:'#0f0f0f',
                  borderRadius:'8px',padding:'8px 16px',fontSize:'12px',fontWeight:700,
                  textDecoration:'none'}}>
                Google AI Studio 열기 →
              </a>
            </div>
          </div>

          {/* STEP 2 */}
          <div style={{marginBottom:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
              <div style={{width:'24px',height:'24px',borderRadius:'50%',background:'var(--accent)',
                color:'#0f0f0f',fontWeight:800,fontSize:'12px',display:'flex',alignItems:'center',
                justifyContent:'center',flexShrink:0}}>2</div>
              <div style={{fontWeight:700,color:'var(--text)'}}>구글 계정으로 로그인</div>
            </div>
            <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'12px',marginLeft:'32px',
              border:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <div style={{width:'36px',height:'36px',borderRadius:'50%',
                  background:'linear-gradient(135deg,#4285f4,#34a853,#fbbc04,#ea4335)',
                  display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{color:'#fff',fontWeight:800,fontSize:'14px'}}>G</span>
                </div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:600,color:'var(--text)'}}>Google 계정으로 계속하기</div>
                  <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>평소 쓰는 구글 계정으로 로그인</div>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 3 */}
          <div style={{marginBottom:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
              <div style={{width:'24px',height:'24px',borderRadius:'50%',background:'var(--accent)',
                color:'#0f0f0f',fontWeight:800,fontSize:'12px',display:'flex',alignItems:'center',
                justifyContent:'center',flexShrink:0}}>3</div>
              <div style={{fontWeight:700,color:'var(--text)'}}>"Create API Key" 클릭</div>
            </div>
            <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'12px',marginLeft:'32px',
              border:'1px solid var(--border)'}}>
              <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'8px'}}>페이지 상단 또는 중앙에 있는 버튼:</div>
              <div style={{display:'inline-block',background:'#1967d2',borderRadius:'6px',
                padding:'7px 14px',fontSize:'12px',fontWeight:700,color:'#fff'}}>
                + Create API key
              </div>
              <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'8px'}}>
                → "Create API key in new project" 선택
              </div>
            </div>
          </div>

          {/* STEP 4 */}
          <div style={{marginBottom:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
              <div style={{width:'24px',height:'24px',borderRadius:'50%',background:'var(--accent)',
                color:'#0f0f0f',fontWeight:800,fontSize:'12px',display:'flex',alignItems:'center',
                justifyContent:'center',flexShrink:0}}>4</div>
              <div style={{fontWeight:700,color:'var(--text)'}}>키 복사</div>
            </div>
            <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'12px',marginLeft:'32px',
              border:'1px solid var(--border)'}}>
              <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'6px'}}>생성된 키가 이런 형태로 나타나요:</div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{flex:1,background:'var(--surface)',borderRadius:'6px',padding:'7px 10px',
                  fontFamily:'monospace',fontSize:'11px',color:'#a78bfa',letterSpacing:'0.5px',
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  AIzaSyD••••••••••••••••••••••••••••••
                </div>
                <div style={{background:'var(--accent)',borderRadius:'6px',padding:'6px 10px',
                  fontSize:'11px',fontWeight:700,color:'#0f0f0f',flexShrink:0}}>
                  복사
                </div>
              </div>
            </div>
          </div>

          {/* STEP 5 */}
          <div style={{marginBottom:'20px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
              <div style={{width:'24px',height:'24px',borderRadius:'50%',background:'var(--accent)',
                color:'#0f0f0f',fontWeight:800,fontSize:'12px',display:'flex',alignItems:'center',
                justifyContent:'center',flexShrink:0}}>5</div>
              <div style={{fontWeight:700,color:'var(--text)'}}>오운 설정에 붙여넣기</div>
            </div>
            <div style={{background:'var(--surface2)',borderRadius:'10px',padding:'12px',marginLeft:'32px',
              border:'1px solid var(--border)'}}>
              <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'6px'}}>설정 → API 키 입력란에 붙여넣기</div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{flex:1,background:'var(--surface)',borderRadius:'6px',padding:'7px 10px',
                  border:'1px solid var(--accent)',fontFamily:'monospace',fontSize:'11px',
                  color:'var(--text-dim)'}}>
                  AIzaSyD... 붙여넣기
                </div>
                <div style={{background:'var(--accent)',borderRadius:'6px',padding:'6px 10px',
                  fontSize:'11px',fontWeight:700,color:'#0f0f0f',flexShrink:0}}>
                  저장
                </div>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div style={{background:'rgba(250,204,21,0.08)',border:'1px solid rgba(250,204,21,0.2)',
            borderRadius:'12px',padding:'14px',marginBottom:'16px'}}>
            <div style={{fontWeight:700,color:'#facc15',marginBottom:'10px',fontSize:'13px'}}>
              ❓ 자주 묻는 질문
            </div>
            {[
              ['갑자기 돈이 빠져나가지 않나요?',
               '아니요. 무료 플랜은 결제 수단 등록 없이 사용합니다.\n유료 전환은 직접 Google Cloud 콘솔에서 카드를 등록해야만 가능해요.'],
              ['수업일지를 매일 만들어도 괜찮나요?',
               '네. 일반적인 PT 트레이너 기준 하루 수업량으로는 무료 한도가 충분해요.\n혹시 한도를 초과하더라도 자동으로 멈출 뿐, 추가 요금은 발생하지 않아요.'],
              ['한 번 발급받으면 계속 쓸 수 있나요?',
               '네. API 키는 영구적으로 유효합니다.\n분실 시 동일한 방법으로 새로 발급하면 돼요.'],
              ['키를 다른 사람과 공유해도 되나요?',
               '공유하지 않는 게 좋아요. 내 무료 한도가 소모될 수 있어요.'],
            ].map(([q, a]) => (
              <div key={q} style={{marginBottom:'10px',paddingBottom:'10px',
                borderBottom:'1px solid rgba(250,204,21,0.1)'}}>
                <div style={{fontWeight:600,color:'var(--text)',fontSize:'12px',marginBottom:'3px'}}>Q. {q}</div>
                <div style={{fontSize:'11px',color:'var(--text-muted)',whiteSpace:'pre-line'}}>A. {a}</div>
              </div>
            ))}
          </div>

          {/* 발급 바로가기 + 설정으로 돌아가기 */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
              style={{display:'block',textAlign:'center',background:'var(--accent)',color:'#0f0f0f',
                borderRadius:'10px',padding:'12px',fontSize:'13px',fontWeight:700,
                textDecoration:'none'}}>
              🔑 API 키 발급하기
            </a>
            <button onClick={()=>{ setShowApiGuide(false); setSettingsModal(true) }}
              style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'10px',
                padding:'12px',fontSize:'13px',fontWeight:700,color:'var(--text)',
                cursor:'pointer',fontFamily:'inherit'}}>
              ← 설정으로 돌아가기
            </button>
          </div>
        </div>
      </Modal>

      {/* EXERCISE MODAL */}
      <Modal open={exModal} onClose={()=>setExModal(false)} title={editingExId?'운동 수정':'운동 종목 추가'} maxWidth="400px">
        <div className="form-group"><label>운동 종목명</label><input type="text" value={exName} onChange={e=>setExName(e.target.value)} placeholder="예: 벤치프레스" /></div>
        <div className="section-label" style={{marginTop:0}}>세트 기록</div>
        {newSets.map((s,i)=>(
          <div key={i} className="ex-set-item">
            <span className="ex-set-num">{i+1}세트</span>
            <span className="ex-set-info">{s.reps}회{s.feel?' · '+s.feel.substring(0,20):''}</span>
            {s.rir!=='' && <span className="ex-set-rir">RIR {s.rir}</span>}
            <button className="ex-set-remove" onClick={()=>setNewSets(newSets.filter((_,j)=>j!==i))}>×</button>
          </div>
        ))}
        <div className="add-set-form">
          <div className="set-form-row">
            <div><label style={{fontSize:'11px'}}>횟수</label><input type="number" value={setReps} onChange={e=>setSetReps(e.target.value)} placeholder="10" min="1" /></div>
            <div><label style={{fontSize:'11px'}}>RIR</label><input type="number" value={setRir} onChange={e=>setSetRir(e.target.value)} placeholder="2" min="0" max="10" /></div>
          </div>
          <div className="form-group" style={{marginBottom:'8px'}}><label style={{fontSize:'11px'}}>이번 세트 감각 / 느낀점</label><textarea value={setFeel} onChange={e=>setSetFeel(e.target.value)} placeholder="예) 3세트 때 팔꿈치 당김" rows={2} style={{minHeight:'60px'}}></textarea></div>
          <button className="btn btn-ghost btn-sm" onClick={addSet} style={{width:'100%',padding:'8px'}}>+ 세트 추가</button>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:'10px'}} onClick={confirmAddExercise}>운동 저장</button>
      </Modal>

      {/* SCHEDULE MODAL */}
      <Modal open={schModal} onClose={()=>setSchModal(false)} title={editBlockId?'스케쥴 수정':'스케쥴 추가'} maxWidth="360px">
        <div className="type-row">
          <button className={`type-btn${selType==='lesson'?' active':''}`} onClick={()=>setSelType('lesson')}>🏋️ 수업</button>
          <button className={`type-btn${selType==='personal'?' active':''}`} onClick={()=>setSelType('personal')}>📌 개인일정</button>
        </div>
        {selType==='lesson' && <div className="form-group"><label>회원</label><select value={blockMemberId} onChange={e=>setBlockMemberId(e.target.value)}>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
        {selType==='personal' && <div className="form-group"><label>일정 제목</label><input type="text" value={blockTitle} onChange={e=>setBlockTitle(e.target.value)} placeholder="미팅, 휴식 등" /></div>}
        <div className="form-group"><label>날짜</label><input type="date" value={blockDate} onChange={e=>setBlockDate(e.target.value)} /></div>
        <div className="form-group"><label>시간</label><div className="time-row"><input type="time" value={blockStart} onChange={e=>setBlockStart(e.target.value)} step="300" /><span>~</span><input type="time" value={blockEnd} onChange={e=>setBlockEnd(e.target.value)} step="300" /></div></div>
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={blockMemo} onChange={e=>setBlockMemo(e.target.value)} placeholder="특이사항" /></div>
        <div className="form-group"><label>색상</label><div className="color-row">{COLORS.map(c=><div key={c.id} className={`color-btn${selColor===c.id?' sel':''}`} style={{background:c.bg}} onClick={()=>setSelColor(c.id)}></div>)}</div></div>
        {showCancelForm && (
          <div>
            <div style={{height:'1px',background:'var(--border)',margin:'12px 0'}}></div>
            <div className="form-group">
              <label style={{color:'var(--danger)'}}>취소 사유</label>
              <select value={cancelType} onChange={e=>setCancelType(e.target.value)}>
                <option value="">사유 선택</option>
                <option value="회원 개인 사정">회원 개인 사정</option>
                <option value="회원 질병/부상">회원 질병/부상</option>
                <option value="트레이너 사정">트레이너 사정</option>
                <option value="시설 문제">시설 문제</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{color:'var(--danger)'}}>취소 상세 내용 (선택)</label>
              <textarea value={cancelDetail} onChange={e=>setCancelDetail(e.target.value)} placeholder="취소 사유를 자세히 적어주세요" rows={2} style={{minHeight:'60px'}}></textarea>
            </div>
          </div>
        )}
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={saveBlock}>저장</button>
          {editBlockId && (
            <button className="btn btn-ghost btn-sm" onClick={toggleCancel} style={{color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)',background:showCancelForm?'rgba(255,92,92,0.1)':'none'}}>
              {showCancelForm ? '취소 확정' : '취소 처리'}
            </button>
          )}
          {editBlockId && !showCancelForm && <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)'}} onClick={deleteBlock}>삭제</button>}
        </div>
      </Modal>
    </div>
  )
}
