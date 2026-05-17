import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import ScheduleModal from '../components/ScheduleModal'
import { compressImage as sharedCompressImage } from '@trainer-log/shared/lib/imageCompress'
import { cleanupMemberStorage, removeStorageOnError, cleanupOldSessionMedia } from '@trainer-log/shared/lib/storageCleanup'
import { supabase, GEMINI_MODEL } from '@trainer-log/shared/lib/supabase'
import { subscribeToPush, scheduleNotification, deleteScheduledNotification } from '../lib/push'
import { useToast } from '@trainer-log/shared/components/common/Toast'
import Modal from '@trainer-log/shared/components/common/Modal'
import TermsAgreementModal from '@trainer-log/shared/components/common/TermsAgreementModal'
import InAppBrowserBanner from '@trainer-log/shared/components/common/InAppBrowserBanner'
import { Link } from 'react-router-dom'
import '../styles/trainer.css'
import { computeStats, buildInsightPrompt, callGeminiInsight } from '@trainer-log/shared/lib/memberInsights'
import { computeRiskScore, getRiskLevel, RISK_LEVELS } from '@trainer-log/shared/lib/churnRisk'
import {
  generateWeeklyReport,
  checkAndEnsurePendingReport,
  fetchRecentReports,
  parseReportSections,
  collectWeeklyStats,
  getPrevMondayStr,
} from '@trainer-log/shared/lib/gymReport'
import {
  callGemini,
  buildSessionLogPrompt,
} from '@trainer-log/shared/lib/ai_templates'

// 통합 매출 내역 (revenue 탭용)
function RevenuePaymentList({ trainerId, members, refreshKey }) {
  const [list, setList] = useState(null)
  const [loading, setLoading] = useState(false)
  const fetchList = () => {
    if (!trainerId) return
    setLoading(true)
    supabase.from('payments').select('*').eq('trainer_id', trainerId).order('paid_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) console.warn('[RevenuePaymentList] payments 조회 실패:', error.message)
        setList(data || [])
        setLoading(false)
      })
      // P0 fix: 그 동안 .catch() 누락으로 네트워크 에러 시 setLoading(false) 안 되어 UI 영구 "불러오는 중..." 고착
      .catch(e => {
        console.warn('[RevenuePaymentList] payments fetch catch:', e?.message)
        setList([])
        setLoading(false)
      })
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
            <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'var(--accent)',color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'12px',flexShrink:0}}>{mem?.name?.[0]||'?'}</div>
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
function MemberRevenueCard({ m, mWeekLogs, mMonthLogs, attendRate, cancelledBlocks, remain, pct, price, dayOfMonth, daysInMonth, confirmed, recentPays, onOpenPayment }) {
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

  // ── 7일 1회 rate limit (AI 비용 폭탄 방지) ────────────────
  // 무한 재생성 / 수동 생성 클릭으로 Gemini API 호출이 누적되는 것을 차단.
  // 가장 최근 done 리포트의 generated_at 기준으로 7일 경과 시에만 다시 생성 가능.
  // pending 첫 생성 (자동 알림 배너) 흐름은 lastGeneratedAt 이 없어 cooldown.blocked=false 라
  // 자연스럽게 면제됨. UNIQUE(gym_id, week_start) 제약과 함께 이중 안전장치.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  const cooldown = useMemo(() => {
    const last = reports
      .filter(r => r.status === 'done' && r.generated_at)
      .sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at))[0]
    if (!last) return { blocked: false }
    const elapsed = Date.now() - new Date(last.generated_at).getTime()
    if (elapsed >= SEVEN_DAYS_MS) return { blocked: false, lastGeneratedAt: last.generated_at }
    const hoursLeft = Math.max(1, Math.ceil((SEVEN_DAYS_MS - elapsed) / (60 * 60 * 1000)))
    return { blocked: true, hoursLeft, lastGeneratedAt: last.generated_at }
  }, [reports])

  // 표시용 잔여시간 라벨 ("3일" / "5시간")
  const cooldownLabel = cooldown.blocked
    ? (cooldown.hoursLeft >= 24
        ? `약 ${Math.ceil(cooldown.hoursLeft / 24)}일 후`
        : `약 ${cooldown.hoursLeft}시간 후`)
    : ''

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
    // [Rate limit] 중복 클릭/race 차단 — 이미 생성 진행 중이면 즉시 무시.
    if (phase === 'loading') return
    // [Rate limit] 7일 1회 제한 — 가장 최근 done 리포트 generated_at 기준.
    // AI 비용 폭탄 방지: 무한 재생성 / 수동 생성 클릭 차단.
    if (cooldown.blocked) {
      showToast(`주간 리포트는 7일에 1회만 생성 가능해요 (${cooldownLabel} 다시 시도 가능)`)
      return
    }
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
                  disabled={cooldown.blocked || phase === 'loading'}
                  title={cooldown.blocked ? `7일 1회 제한 — ${cooldownLabel} 다시 시도 가능` : ''}
                  style={{padding:'6px 10px',borderRadius:'6px',border:'1px solid var(--border)',
                    background:'transparent',color:'var(--text-dim)',fontSize:'11px',fontFamily:'inherit',
                    cursor: cooldown.blocked ? 'not-allowed' : 'pointer',
                    opacity: cooldown.blocked ? 0.4 : 1}}>
                  {cooldown.blocked ? '🔒 7일 제한' : '🔄 재생성'}
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
          disabled={cooldown.blocked}
          title={cooldown.blocked ? `7일 1회 제한 — ${cooldownLabel} 다시 시도 가능` : ''}
          style={{width:'100%',marginTop:'10px',padding:'9px',borderRadius:'8px',
            border:'1px solid var(--border)',background:'transparent',color:'var(--text-dim)',
            fontSize:'12px',fontFamily:'inherit',
            cursor: cooldown.blocked ? 'not-allowed' : 'pointer',
            opacity: cooldown.blocked ? 0.5 : 1}}>
          {cooldown.blocked
            ? `🔒 7일 1회 제한 — ${cooldownLabel} 생성 가능`
            : '+ 이번 주 리포트 수동 생성'}
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
  // P1 fix: 정산 계산 더블클릭 방지 (calculate_settlement RPC 다중 호출 차단)
  const [calculating, setCalculating] = useState(false)
  const mono = { fontFamily:"'DM Mono',monospace" }

  // ── 로드 ──────────────────────────────────────────────────
  useEffect(() => { if (trainerId) load() }, [trainerId, year, month])

  async function load() {
    setLoading(true)
    try {
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
    } catch (e) {
      // P0 fix: Promise.all 실패 시 (RLS 거부 / 네트워크 오류) UI 무한 로딩 방지
      console.warn('[settlement load] 정산 데이터 로드 실패:', e?.message)
      showToast('정산 데이터 로드 실패: ' + (e?.message || '알 수 없는 오류'))
    } finally {
      setLoading(false)
    }
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
                    if (calculating) return // P1 fix: 더블클릭 방지
                    setCalculating(true)
                    try {
                      const{data,error}=await supabase.rpc('calculate_settlement',{p_trainer_id:trainerId,p_year:year,p_month:month})
                      if(error){showToast('오류: '+error.message);return}
                      setSettle(data);showToast('✓ 정산이 계산됐어요')
                    } catch (e) {
                      showToast('정산 계산 중 오류가 발생했어요: ' + (e?.message || ''))
                    } finally {
                      setCalculating(false)
                    }
                  }}
                  disabled={calculating}
                  style={{width:'100%',padding:'11px',borderRadius:'8px',border:'none',
                    background:calculating?'var(--surface2)':'var(--accent)',color:calculating?'var(--text-dim)':'#0f0f0f',fontWeight:700,fontSize:'13px',
                    cursor:calculating?'default':'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                  {calculating?'계산 중...':(status==='draft'?'🔄 재계산':'📊 정산 계산하기')}
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
  const showToast = useToast()

  // 주 1회(7일) 하드 락 — localStorage 기반, DB 스키마 수정 0
  const LOCK_KEY = `last_ai_insight_${member?.id || 'unknown'}`
  const LOCK_MS  = 7 * 24 * 60 * 60 * 1000

  function readLockTs() {
    try {
      const raw = localStorage.getItem(LOCK_KEY)
      const n = raw ? parseInt(raw, 10) : 0
      return Number.isFinite(n) ? n : 0
    } catch { return 0 }
  }

  async function generate() {
    if (phase === 'loading') return
    // 7일 경과 검사
    const last = readLockTs()
    const now = Date.now()
    if (last > 0 && (now - last) < LOCK_MS) {
      showToast('AI 분석은 회원당 주 1회만 생성 가능합니다.', 'warning')
      return
    }

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

      // P0 fix (비용 폭탄 방지): Gemini 호출 전 트레이너 월 한도 확인.
      // 그동안 인사이트는 한도 체크/크레딧 차감이 모두 누락되어 무제한 호출 가능했음.
      try {
        const trainerId = member?.trainer_id
        if (trainerId) {
          const { data: usage } = await supabase.rpc('get_ai_usage', { p_trainer_id: trainerId })
          if (usage?.blocked) {
            setErrMsg('AI 인사이트 월 한도를 모두 사용했어요. 다음달에 다시 시도해주세요.')
            setPhase('error')
            return
          }
        }
      } catch (e) {
        console.warn('[AI insight] get_ai_usage 실패 — 한도 체크 skip:', e?.message)
      }

      // ── Gemini 호출 ──────────────────────────────────────────
      setStatus('AI가 인사이트를 생성하는 중...')
      const prompt = buildInsightPrompt(member, computed)
      const text   = await callGeminiInsight(apiKey, GEMINI_MODEL, prompt)
      setInsight(text)
      setPhase('done')

      // P0 fix (비용 폭탄 방지): 호출 성공 후 크레딧 차감 (식단 사진 인식과 동일 패턴).
      try {
        const trainerId = member?.trainer_id
        if (trainerId) {
          await supabase.rpc('use_ai_credit', { p_trainer_id: trainerId })
        }
      } catch (creditErr) {
        console.warn('[AI insight] use_ai_credit 실패:', creditErr?.message)
      }

      // 성공 시 락 타임스탬프 갱신
      try { localStorage.setItem(LOCK_KEY, String(Date.now())) } catch {}
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
          disabled={phase === 'loading'}
          style={{width:'100%',padding:'11px',borderRadius:'8px',border:'none',
            background: phase === 'done' ? 'var(--surface2)' : 'var(--accent)',
            color: phase === 'done' ? 'var(--text-muted)' : '#0f0f0f',
            fontWeight:700,fontSize:'13px',
            cursor: phase === 'loading' ? 'not-allowed' : 'pointer',
            opacity: phase === 'loading' ? 0.55 : 1,
            fontFamily:'inherit'}}>
          {phase === 'done' ? '🔄 다시 분석하기' : '🤖 이번주 AI 인사이트 생성'}
        </button>
      )}
    </div>
  )
}

// ── 이탈 위험 분석 패널 ───────────────────────────────────────
function RiskPanel({ member }) {
  const [phase, setPhase]     = useState('idle')  // idle | loading | done | error
  const [result, setResult]   = useState(null)
  const showToast = useToast()

  // 주 1회(7일) 하드 락 — AiInsightPanel 과 동일 패턴
  const LOCK_KEY = `last_ai_insight_${member?.id || 'unknown'}_risk`
  const LOCK_MS  = 7 * 24 * 60 * 60 * 1000

  function readLockTs() {
    try {
      const raw = localStorage.getItem(LOCK_KEY)
      const n = raw ? parseInt(raw, 10) : 0
      return Number.isFinite(n) ? n : 0
    } catch { return 0 }
  }

  async function analyze() {
    if (phase === 'loading') return
    // 7일 경과 검사
    const last = readLockTs()
    const now = Date.now()
    if (last > 0 && (now - last) < LOCK_MS) {
      showToast('AI 분석은 회원당 주 1회만 생성 가능합니다.', 'warning')
      return
    }

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

      // 성공 시 락 타임스탬프 갱신
      try { localStorage.setItem(LOCK_KEY, String(Date.now())) } catch {}
    } catch (e) {
      setPhase('error')
    }
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
  const [screen, setScreen] = useState('landing') // landing, login, reg, pending, rejected, app
  // 가입 요청 상태 (053 마이그레이션 화이트리스트). pending/rejected 화면에 사용.
  const [signupInfo, setSignupInfo] = useState(null) // { status, reason?, name?, requested_at? }
  const [trainer, setTrainer] = useState(null)
  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState([])
  // P0 perf fix: members.find() 가 .map() / .reduce() 안에서 호출되면 O(N×M) 폭발.
  // 회원 100명 + 로그 500건 시 50,000회 비교. Map.get() 으로 O(1) 변환.
  // members 변경 시에만 Map 재생성 (useMemo deps).
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const [tab, setTab] = useState('members')
  const [activePage, setActivePage] = useState('page-members')
  const [currentMemberId, setCurrentMemberId] = useState(null)
  const [exercises, setExercises] = useState([])
  const [rawInput, setRawInput] = useState('')
  const [perspectiveChip,  setPerspectiveChip]  = useState('rehab') // AI 해석 관점 칩 ('rehab'|'motivation'|'performance'|'diet')
  const [extraInstruction, setExtraInstruction] = useState('')       // 추가 지시사항 오버라이드
  const [showRirGuide,     setShowRirGuide]     = useState(false)    // RIR 가이드 아코디언
  const [isListening, setIsListening] = useState(false)         // 음성 인식 활성 여부
  const [speechSupported, setSpeechSupported] = useState(        // Web Speech API 지원 여부
    typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  )
  // 음성 녹음(AI 수업일지) — openRecord/sendKakao 흐름에서 사용. 직전 정리 과정에서 누락되어 복구.
  const [audioData, setAudioData] = useState(null)        // { blob, durationSec, transcript } | null
  // V3 — 미디어 첨부
  const [mediaFiles, setMediaFiles] = useState([])       // [{id, name, type, dataUrl, sizeKB}]
  const [mediaProcessing, setMediaProcessing] = useState(false)
  const [mediaProgress, setMediaProgress] = useState('')
  const [videoTrimFile,    setVideoTrimFile]    = useState(null)   // 현재 트리밍할 원본 File
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false)
  const [trimStart,        setTrimStart]        = useState(0)
  const [trimEnd,          setTrimEnd]          = useState(60)
  const [trimDuration,     setTrimDuration]     = useState(0)
  const [isTrimming,       setIsTrimming]       = useState(false)
  const [trimBlobUrl,      setTrimBlobUrl]       = useState(null)  // ObjectURL for trimmer preview
  const [previewContent, setPreviewContent] = useState('')
  const [finalContent, setFinalContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const VALID_RTABS = ['write','attendance','health','holds','personal','insight']
  const [rtab, setRtab] = useState('write')
  // rtab setter — 유효하지 않은 값은 'write'로 강제
  const safeSetRtab = (t) => setRtab(VALID_RTABS.includes(t) ? t : 'write')
  const [healthData, setHealthData] = useState(null)

  // Member sort
  const [memberSort, setMemberSort] = useState('created') // 'name' | 'created' | 'expire'
  const [memberSearch, setMemberSearch] = useState('')
  const [showRiskInfo, setShowRiskInfo] = useState(false)
  const [showReadModal, setShowReadModal] = useState(false)
  const [expandedLogId, setExpandedLogId] = useState(null)
  const [historyDateFilter, setHistoryDateFilter] = useState('')
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFiltered, setHistoryFiltered] = useState(null) // null = 페이징 목록 사용

  // Settings tab — leaderboard
  const [leaderboard, setLeaderboard] = useState(null)
  const [lbLoading, setLbLoading] = useState(false)

  // Settings tab — 플랜 안내
  const [planGuideVisible, setPlanGuideVisible] = useState(true)
  const [plansList, setPlansList] = useState(null)

  // 1:1 문의
  // (제거됨) inquiries / inqLoading / inqSubmitting / inqForm / inqSelected
  //   — 1:1 문의 탭이 카카오 채널 외부 우회로 전환되어 내부 state 불필요

  // Revenue tab — tooltip
  const [revTooltip, setRevTooltip] = useState(null)
  // Revenue tab — 회원별 결제 검색
  const [revMemberSearch, setRevMemberSearch] = useState('')

  // Settings — profile photo upload
  const [profileUploading, setProfileUploading] = useState(false)
  const profileInputRef = useRef(null)
  const recognitionRef = useRef(null)  // Web Speech API 인스턴스
  const mediaInputRef = useRef(null)  // 미디어 파일 input
  const trimVideoRef  = useRef(null)  // 트리머 모달 <video> 요소
  const pendingTrimFilesRef = useRef([]) // 트리머 대기 파일 큐

  // Revenue tab — 월별 총 결제액
  const [payMonthStr, setPayMonthStr] = useState(() => {
    const n = new Date()
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0')
  })
  const [payMonthData, setPayMonthData] = useState(null)
  const [payMonthLoading, setPayMonthLoading] = useState(false)
  const [revenueRefreshKey, setRevenueRefreshKey] = useState(0)
  // 회원별 누적/최근 결제 캐시 (N+1 방지를 위해 단일 배치 쿼리로 채움)
  const [revenueByMember, setRevenueByMember] = useState({}) // { [memberId]: { confirmed:number, recentPays: row[] } }
  // 상품 등록/취소 연타 방어용 가드
  const [paymentBusy, setPaymentBusy] = useState(false)

  // Add member form
  const [addForm, setAddForm] = useState({name:'',kakao_phone:'',phone:'',birthdate:'',address:'',email:'',special_notes:'',purpose:'체형교정',visit_source:'',visit_source_memo:'',total:'',done:'0',price:'',memo:''})
  const [memberFilter, setMemberFilter] = useState('전체')
  const [showEmailGuide, setShowEmailGuide] = useState(false)
  const [riskMap, setRiskMap]           = useState({})  // { [memberId]: riskResult }

  // Edit member modal
  const [editMemberModal, setEditMemberModal] = useState(false)
  const [editMemberForm, setEditMemberForm] = useState({})
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false)
  const [sessionAdvOpen, setSessionAdvOpen] = useState(false)
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false)

  // Attendance
  const [attendanceDates,  setAttendanceDates]  = useState([]) // [{id, attended_date}]
  const [attendanceMonth,  setAttendanceMonth]  = useState(() => { const n=new Date(); return {y:n.getFullYear(),m:n.getMonth()} })
  const [todayAttendSet,   setTodayAttendSet]   = useState(new Set()) // 오늘 출석한 회원 ID Set

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
  const [setWeight, setSetWeight] = useState('')
  const [setReps,   setSetReps]   = useState('')
  const [setRir,    setSetRir]    = useState('')
  const [setFeel,   setSetFeel]   = useState('')

  // 센터 연동 (가입 요청)
  const [gymSearchQuery,   setGymSearchQuery]   = useState('')
  const [gymSearchResults, setGymSearchResults] = useState([])
  const [gymSearchLoading, setGymSearchLoading] = useState(false)
  const [joinLoading,      setJoinLoading]      = useState(false)
  const [gymName,          setGymName]          = useState('')   // 승인된 센터명 캐시

  // Settings modal
  const [settingsModal, setSettingsModal] = useState(false)
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false)
  const [aiUsage, setAiUsage] = useState(null)   // { plan, limit, used, remaining, blocked }
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [centralApiKey, setCentralApiKey] = useState('')  // 중앙화된 Gemini API 키
  const [credits, setCredits] = useState(0)               // 트레이너 크레딧 잔액
  const [urgentInquiryUrl, setUrgentInquiryUrl] = useState('') // 긴급문의 카카오 오픈채팅 링크

  // Schedule
  const [weekOff, setWeekOff] = useState(0)
  const [blocks, setBlocks] = useState(() => JSON.parse(localStorage.getItem('tl_sch')||'[]'))
  // 모달 form state 는 ScheduleModal 컴포넌트 내부에서 관리.
  // 부모는 "어떤 block 을 편집할지" 만 보유 — null = 모달 닫힘 / 객체 = 모달 열림.
  const [editingBlock, setEditingBlock] = useState(null)

  // perf: 7일 그리드 render 마다 blocks.filter 7회 → blocks 변경 시 1회 그룹핑.
  const blocksByDate = useMemo(() => {
    const map = {}
    for (const b of blocks) (map[b.date] ||= []).push(b)
    return map
  }, [blocks])

  // Notifications
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem('tl_notif_enabled') === 'true')
  const [notifMinutes, setNotifMinutes] = useState(() => parseInt(localStorage.getItem('tl_notif_minutes')||'30'))

  // Feature gates
  const DEFAULT_FEATURE_GATES = {
    free: { ai_journal:false, history_tab:true, revenue_tab:false, settlement:false, weekly_report:false, ai_insight:false, risk_analysis:false, push_notif:false, schedule_tab:true, member_limit:5 },
    paid: { ai_journal:true,  history_tab:true, revenue_tab:true,  settlement:true,  weekly_report:true,  ai_insight:true,  risk_analysis:true,  push_notif:true,  schedule_tab:true, member_limit:9999 },
  }
  const [featureGates, setFeatureGates] = useState(DEFAULT_FEATURE_GATES)
  const [isPaid, setIsPaid] = useState(false)
  function canUse(key) {
    const plan = isPaid ? 'paid' : 'free'
    return featureGates[plan]?.[key] !== false
  }

  // Login / OAuth
  const [authUser, setAuthUser] = useState(null)   // Supabase Auth user
  const [regName, setRegName] = useState('')
  const [regApi, setRegApi] = useState('')
  const [regError, setRegError] = useState('')
  // 등록 동의 체크박스
  const [agreedTerms,   setAgreedTerms]   = useState(false) // 이용약관
  const [agreedPrivacy, setAgreedPrivacy] = useState(false) // 개인정보처리방침
  // 음성·AI 처리 동의는 제거됨 (2026-05-11): STT 가 디바이스 내장 기능으로 전환되어
  // 외부 Gemini API 로 녹음 전송 없음 → 별도 동의 불필요.


  // 스케줄 + 알림 설정 localStorage 동기화 — 3개 effect → 1개로 통합
  useEffect(() => {
    localStorage.setItem('tl_sch', JSON.stringify(blocks))
    localStorage.setItem('tl_notif_enabled', notifEnabled)
    localStorage.setItem('tl_notif_minutes', notifMinutes)
  }, [blocks, notifEnabled, notifMinutes])

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
      // Storage RLS: 첫 폴더 = auth.uid()::text 강제 (trainer.auth_id == auth.uid())
      const authUid = trainer?.auth_id || null
      if (!authUid) throw new Error('프로필 사진 업로드는 로그인 후 가능해요')
      const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
      const path = `${authUid}/${Date.now()}.${ext}`

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
        // C-002: update 실패 시 storage 롤백 — orphan 차단
        await removeStorageOnError(supabase, 'trainer-photos', path)
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
      if (error) { console.warn('[loadAiUsage] AI 사용량 조회 실패:', error.message); return }
      if (data) setAiUsage(data)
    } catch(e) { console.warn('[loadAiUsage] 오류:', e.message) }
  }

  // 중앙 Gemini API 키 + 긴급문의 링크 로드 (앱 마운트 시 1회)
  useEffect(() => {
    supabase.from('app_settings').select('key, value').in('key', ['gemini_api_key', 'urgent_inquiry_url'])
      .then(({ data, error }) => {
        // B-006 fix: silent fail 방지 — 에러 시 console 에 명시
        if (error) {
          console.warn('[app_settings] 로드 실패:', error.message)
          return
        }
        if (!data) return
        const apiKeyRow = data.find(r => r.key === 'gemini_api_key')
        if (apiKeyRow?.value) setCentralApiKey(String(apiKeyRow.value).replace(/^"|"$/g, ''))
        const urgentRow = data.find(r => r.key === 'urgent_inquiry_url')
        if (urgentRow?.value) setUrgentInquiryUrl(String(urgentRow.value).replace(/^"|"$/g, ''))
      })
      .catch(e => console.warn('[app_settings] catch:', e.message))
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
    // Phase B-1.1 — RLS 강화 후 trainers 직접 select 가 차단되므로,
    // auth_id 매칭 + email fallback 을 SECURITY DEFINER RPC 한 번으로 처리.
    // (마이그레이션 050/053 적용 필요)
    const { data: row, error } = await supabase.rpc('trainer_resolve_or_create', {
      p_email: au.email ?? null,
    })
    if (error) {
      console.error('[handleAuthUser] rpc 실패:', error)
      showToast('로그인 처리 오류: ' + error.message)
      return
    }
    // ⚠️ row.id 가드: Postgres 함수 RETURNS trainers (composite) 가 RETURN NULL 할 때
    // PostgREST/supabase-js 가 빈 객체 {id:null, name:null, ...} 로 변환함.
    // 단순히 `if (row)` 만 체크하면 빈 객체도 truthy 라 _loginWithRecord 로 빠져
    // trainer.id=null 상태로 메인 진입 → 모든 후속 쿼리 400 에러.
    if (row && row.id) {
      await _loginWithRecord(row)
      return
    }
    // 매핑 없음 → 053 마이그레이션 화이트리스트 흐름:
    // (1) 기존 가입 요청 상태 확인 → pending/rejected/already_trainer 분기
    // (2) none 이면 신규 등록 화면
    try {
      const { data: stat, error: statErr } = await supabase.rpc('trainer_get_signup_status', {
        p_email: au.email ?? null,
      })
      if (statErr) {
        console.error('[handleAuthUser] get_signup_status 실패:', statErr)
        showToast('가입 상태 조회 오류: ' + statErr.message)
        return
      }
      const status = stat?.status || 'none'
      if (status === 'pending') {
        setSignupInfo(stat)
        setScreen('pending')
        return
      }
      if (status === 'rejected') {
        setSignupInfo(stat)
        setScreen('rejected')
        return
      }
      if (status === 'already_trainer') {
        // race: status 는 trainer 인데 row 매핑 실패. resolve 재시도 1회.
        const retry = await supabase.rpc('trainer_resolve_or_create', { p_email: au.email ?? null })
        if (retry.data && retry.data.id) { await _loginWithRecord(retry.data); return }
        showToast('계정 매핑 오류가 발생했어요. 다시 로그인해주세요.')
        return
      }
      // none → 신규 등록 화면
      setRegName(au.user_metadata?.full_name || au.user_metadata?.name || au.email?.split('@')[0] || '')
      setScreen('reg')
    } catch(e) {
      console.error('[handleAuthUser] signup_status catch:', e)
      showToast('가입 상태 조회 오류: ' + (e.message || e))
    }
  }

  async function loadFeatureGates(trainerId) {
    try {
      // 구독 상태 확인
      const now = new Date().toISOString()
      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('trainer_id', trainerId)
        .gt('valid_until', now)
        .maybeSingle()
      if (subErr) { console.warn('[loadFeatureGates] 구독 조회 실패:', subErr.message) }
      else setIsPaid(!!sub)
      // 관리자가 설정한 feature gates 불러오기
      const { data: fg, error: fgErr } = await supabase.from('app_settings').select('value').eq('key', 'feature_gates').maybeSingle()
      if (fgErr) { console.warn('[loadFeatureGates] 게이트 설정 조회 실패:', fgErr.message) }
      else if (fg?.value?.free && fg?.value?.paid) setFeatureGates(fg.value)
    } catch(e) { console.warn('[loadFeatureGates] 오류:', e.message) }
  }

  async function _loginWithRecord(t) {
    setTrainer(t); setCredits(t.credits ?? 0); setScreen('app')
    showToast('✓ 환영해요, ' + t.name + ' 트레이너님!')
    try {
      const { data: libData, error: libErr } = await supabase.from('workout_routines').select('*')
        .eq('trainer_id', t.id).is('member_id', null).order('created_at', { ascending: false })
      if (libErr) console.warn('[_loginWithRecord] 루틴 라이브러리 로드 실패:', libErr.message)
      else setTrainerLibraryRoutines(libData || [])
    } catch(e) { console.warn('[_loginWithRecord] 루틴 라이브러리 오류:', e.message) }
    // loadAiUsage / loadFeatureGates 는 각 함수 내부에서 에러를 처리함 — 래퍼 불필요
    loadAiUsage(t.id)
    loadFeatureGates(t.id)
  }

  async function register() {
    if (!regName) { showToast('이름을 입력해주세요'); return }
    if (!agreedTerms || !agreedPrivacy) { showToast('이용약관 및 개인정보처리방침에 동의해주세요'); return }
    if (!authUser) { showToast('먼저 소셜 로그인을 해주세요'); setScreen('login'); return }
    try {
      // Phase D-4.1 (053) — 화이트리스트 전환:
      // 직접 trainers INSERT → admin 승인 대기열 (trainer_signup_requests) 에 pending row 생성.
      // admin 승인 후에야 trainers 행이 생기고 다음 로그인 시 (a) 분기로 매핑됨.
      const { data: result, error: reqErr } = await supabase.rpc('trainer_create_signup_request', {
        p_email: authUser.email ?? '',
        p_name:  regName,
      })
      if (reqErr) {
        console.error('[register] create_signup_request error:', reqErr)
        throw new Error(reqErr.message || reqErr.code || JSON.stringify(reqErr))
      }
      const status = result?.status
      if (status === 'already_trainer') {
        // race: 사이에 admin 이 사전등록 등으로 trainer 만들어준 경우 → resolve 재시도
        const retry = await supabase.rpc('trainer_resolve_or_create', { p_email: authUser.email ?? null })
        if (retry.data && retry.data.id) { await _loginWithRecord(retry.data); return }
        showToast('계정 매핑 오류가 발생했어요. 다시 로그인해주세요.')
        return
      }
      if (status === 'rejected') {
        setSignupInfo(result)
        setScreen('rejected')
        return
      }
      // pending (신규 또는 기존)
      setSignupInfo({ status: 'pending', name: regName, email: authUser.email })
      setScreen('pending')
      showToast('✓ 가입 요청이 접수됐어요. 관리자 승인을 기다려주세요.')
    } catch(e) {
      console.error('[register] catch:', e)
      const msg = e.message || JSON.stringify(e)
      setRegError(msg)
      showToast('오류: ' + msg)
    }
  }

  // OAuth 인증 상태 감지
  // Supabase v2 의 SIGNED_IN 이벤트는 token refresh 시점 (탭 활성화 / focus 등) 에도
  // 다시 발화됨. 가드 없이 처리하면 창 전환마다 handleAuthUser → _loginWithRecord
  // 가 재실행되어 환영 toast 가 반복적으로 노출됨. ref 로 1회 처리만 보장.
  const isAuthenticatedRef = useRef(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isAuthenticatedRef.current) {
        isAuthenticatedRef.current = true
        handleAuthUser(session.user)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (isAuthenticatedRef.current) return  // token refresh 재진입 무시
        isAuthenticatedRef.current = true
        handleAuthUser(session.user)
      }
      if (event === 'SIGNED_OUT') {
        isAuthenticatedRef.current = false
        setAuthUser(null); setTrainer(null); setMembers([]); setLogs([]); setScreen('landing')
      }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (trainer) {
      loadMembers()    // 완료 후 내부에서 computeAllRiskScores 호출
      loadLogs()
      loadProducts()
      loadTodayAttendance()  // 오늘 출석 — loadMembers와 독립적으로 병렬 실행
    }
  }, [trainer])

  // C-002: 90일 이상 된 수업일지 영상/사진 lazy cleanup.
  //   - service_role key 노출 없이 본인 데이터만 정리 (RLS 가 trainer_id 만 허용)
  //   - 24시간 gate: 같은 트레이너가 자주 재마운트해도 하루 1번만 실행
  //   - 실패해도 silent — 다음 마운트에서 재시도 (본 흐름 막지 않음)
  useEffect(() => {
    if (!trainer?.id) return
    const KEY = `lastSessionMediaCleanup_${trainer.id}`
    const last = Number(localStorage.getItem(KEY) || 0)
    if (Date.now() - last < 86400_000) return  // 24h 내 실행했으면 skip
    cleanupOldSessionMedia(supabase, trainer.id, 90)
      .then(r => {
        if (r?.cleaned > 0) console.log('[cleanup] 90일 이상 영상/사진', r.cleaned, '개 정리')
      })
      .catch(e => console.warn('[cleanup] 실패:', e.message))
      .finally(() => {
        try { localStorage.setItem(KEY, String(Date.now())) } catch {}
      })
  }, [trainer?.id])

  async function loadMembers() {
    // is_personal=true 만 조회: CRM 에서 등록된 센터 회원(false)은 트레이너 포털에 노출 X
    // U-005 fix: error 무시하던 부분 — silent fail 방지
    const { data, error } = await supabase.from('members').select('*')
      .eq('trainer_id', trainer.id).eq('is_personal', true)
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[loadMembers]', error.message)
      showToast('회원 목록을 불러오지 못했어요')
      return
    }
    setMembers(data || [])
    computeAllRiskScores(data || [])  // 리스크 점수는 회원 데이터 필요 → 직후 호출
    // loadTodayAttendance 는 useEffect에서 명시적으로 독립 호출됨
  }

  async function computeAllRiskScores(memberList) {
    // members.suspended 컬럼 부재 — 전체 회원 대상으로 계산
    const active = (memberList || [])
    if (!active.length) return
    try {
      // P1 fix (비용 폭탄 방지): 회원 100명+ 트레이너 진입 시 health_records / attendance
      // 가 limit 없어 row read 수천~만 건 폭증 위험. 위험 점수는 최근 60일 데이터로 충분
      // 하므로 record_date 필터 + limit 1000 하드 캡 추가.
      const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
      const cutoffDate = sixtyDaysAgo.toISOString().split('T')[0]
      const memberIds = active.map(m => m.id)
      const [logsAll, healthAll, attendAll] = await Promise.all([
        supabase.from('logs').select('id,member_id,created_at,session_rating,exercises_data')
          .eq('trainer_id', trainer.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('health_records').select('id,member_id,record_date,morning_weight,sleep_level')
          .in('member_id', memberIds).gte('record_date', cutoffDate)
          .order('record_date', { ascending: false }).limit(1000),
        supabase.from('attendance').select('member_id,attended_date')
          .in('member_id', memberIds).gte('attended_date', cutoffDate)
          .order('attended_date', { ascending: false }).limit(1000),
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
    setHistoryLoading(true)
    const { data } = await supabase
      .from('logs')
      .select('id, created_at, read_at, report_id, member_id, members(name)')
      .eq('trainer_id', trainer.id)
      .order('created_at', { ascending: false })
      .range(0, 19)
    const rows = data || []
    setLogs(rows)
    setHistoryOffset(rows.length)
    setHistoryHasMore(rows.length === 20)
    setHistoryFiltered(null)
    setHistoryLoading(false)
  }

  async function loadMoreHistory() {
    if (historyLoading || !historyHasMore) return
    setHistoryLoading(true)
    const from = historyOffset
    const { data } = await supabase
      .from('logs')
      .select('id, created_at, read_at, report_id, member_id, members(name)')
      .eq('trainer_id', trainer.id)
      .order('created_at', { ascending: false })
      .range(from, from + 19)
    const rows = data || []
    setLogs(prev => [...prev, ...rows])
    setHistoryOffset(prev => prev + rows.length)
    setHistoryHasMore(rows.length === 20)
    setHistoryLoading(false)
  }

  async function loadHistoryFiltered(dateStr) {
    if (!dateStr) { setHistoryFiltered(null); return }
    setHistoryLoading(true)
    const fromTs = dateStr + 'T00:00:00'
    const toTs   = dateStr + 'T23:59:59.999'
    const { data } = await supabase
      .from('logs')
      .select('id, created_at, read_at, report_id, member_id, members(name)')
      .eq('trainer_id', trainer.id)
      .gte('created_at', fromTs)
      .lte('created_at', toTs)
      .order('created_at', { ascending: false })
    setHistoryFiltered(data || [])
    setHistoryLoading(false)
  }

  async function loadProducts() {
    if (!trainer) return
    const { data } = await supabase.from('products').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: true })
    setProducts(data || [])
  }

  // 주간 리더보드 로드 (소속 센터 gym_id로 격리, 무제한 fetch 차단)
  async function loadLeaderboard() {
    setLbLoading(true)
    try {
      // 자기 센터에 소속이 없으면 리더보드 자체를 노출하지 않음 (스코프 누수 방지)
      const myGymId = trainer?.gym_id
      if (!myGymId) {
        setLeaderboard({ list: [], totalLogs: 0, totalRead: 0, overallRate: 0 })
        return
      }

      // 이번 주 월요일 0시
      const now = new Date()
      const daysFromMon = (now.getDay() + 6) % 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - daysFromMon)
      monday.setHours(0, 0, 0, 0)

      // ① 우리 센터 트레이너 명단 (이름 매핑 + log 필터 화이트리스트)
      const { data: gymTrainers, error: trainersErr } = await supabase
        .from('trainers')
        .select('id, name')
        .eq('gym_id', myGymId)
        .limit(500)
      if (trainersErr) throw trainersErr
      const trainerMap = {}
      const allowedIds = new Set()
      ;(gymTrainers || []).forEach(t => {
        trainerMap[t.id] = t.name
        allowedIds.add(String(t.id))
      })
      if (allowedIds.size === 0) {
        setLeaderboard({ list: [], totalLogs: 0, totalRead: 0, overallRate: 0 })
        return
      }

      // ② 동일 센터 트레이너의 이번 주 로그만 조회 (gym_id 격리 + 상한)
      const { data: logsData, error: logsErr } = await supabase
        .from('logs')
        .select('trainer_id, read_at')
        .gte('created_at', monday.toISOString())
        .in('trainer_id', Array.from(allowedIds))
        .limit(5000)
      if (logsErr) throw logsErr

      // 방어적 후처리: 우리 센터 ID 화이트리스트로 한 번 더 필터
      const weekLogs = (logsData || []).filter(l => allowedIds.has(String(l.trainer_id)))

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
    } catch(e) {
      setLeaderboard(null)
      showToast('리더보드 데이터를 불러오지 못했어요')
      console.warn('[loadLeaderboard] 오류:', e?.message)
    } finally {
      setLbLoading(false)
    }
  }
  useEffect(() => {
    if (tab === 'settings' && trainer) {
      loadLeaderboard()
      loadPlanSettings()
    }
  }, [tab])

  async function loadPlanSettings() {
    try {
      const { data, error } = await supabase.from('app_settings').select('key, value').in('key', ['plan_guide_visible', 'plans'])
      if (error) { console.warn('[loadPlanSettings] 플랜 설정 조회 실패:', error.message); return }
      if (data) {
        const vis  = data.find(r => r.key === 'plan_guide_visible')
        const plns = data.find(r => r.key === 'plans')

        // ── String Boolean 함정 방어 ──
        // DB 에 저장된 값이 jsonb 'false' 또는 stringified '"false"' 인 경우
        // 그대로 setState 하면 'false' 문자열이 Truthy 로 평가되어 가드를 무력화한다.
        // 정확히 true/'true' 일 때만 노출, 그 외(false/'false'/null/숫자 등)는 모두 숨김.
        if (vis != null) {
          let raw = vis.value
          // jsonb 컬럼이 stringified JSON 으로 저장된 케이스(예: '"false"') 안전 디시리얼라이즈
          if (typeof raw === 'string') {
            try { raw = JSON.parse(raw) } catch { /* 원본 string 유지 */ }
          }
          const isVisible = (raw === true || raw === 'true')
          setPlanGuideVisible(isVisible)
        }

        // plans 도 동일 패턴으로 jsonb/string 양형 호환 안전 파싱
        if (plns != null) {
          let plansRaw = plns.value
          if (typeof plansRaw === 'string') {
            try { plansRaw = JSON.parse(plansRaw) } catch { plansRaw = null }
          }
          if (Array.isArray(plansRaw)) setPlansList(plansRaw)
        }
      }
    } catch(e) { console.warn('[loadPlanSettings] 오류:', e.message) }
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
    } catch(e) {
      setPayMonthData(null)
      showToast('결제 내역을 불러오지 못했어요')
      console.warn('[loadMonthPayments] 오류:', e.message)
    } finally {
      setPayMonthLoading(false)
    }
  }
  useEffect(() => { if (tab === 'revenue' && trainer) loadMonthPayments(payMonthStr) }, [tab, payMonthStr])

  // 매출 탭에서 회원별 누적/최근 결제를 단일 배치 쿼리로 채워둠 (N+1 방지)
  useEffect(() => {
    if (tab !== 'revenue' || !trainer || !members.length) return
    const memberIds = members.map(m => m.id)
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('id, member_id, amount, paid_at, product_name')
          .in('member_id', memberIds)
          .order('paid_at', { ascending: false })
        if (error) throw error
        if (cancelled) return
        const grouped = {}
        ;(data || []).forEach(p => {
          if (!grouped[p.member_id]) grouped[p.member_id] = { confirmed: 0, recentPays: [] }
          grouped[p.member_id].confirmed += (p.amount || 0)
          if (grouped[p.member_id].recentPays.length < 3) grouped[p.member_id].recentPays.push(p)
        })
        memberIds.forEach(id => { if (!grouped[id]) grouped[id] = { confirmed: 0, recentPays: [] } })
        setRevenueByMember(grouped)
      } catch (e) {
        console.warn('[revenueByMember] 배치 로드 실패:', e?.message)
      }
    })()
    return () => { cancelled = true }
  }, [tab, trainer, members, revenueRefreshKey])
  // (제거됨) 1:1 문의 탭은 카카오 채널 외부 우회 — 내부 DB(inquiries) 호출 없음

  // ── 승인된 센터명 조회 (gym_id → gyms.name) ─────────────────
  useEffect(() => {
    if (trainer?.gym_id && trainer?.approval_status !== 'pending') {
      supabase.from('gyms').select('name').eq('id', trainer.gym_id).maybeSingle()
        .then(({ data }) => { if (data?.name) setGymName(data.name) })
    } else {
      setGymName('')
    }
  }, [trainer?.gym_id, trainer?.approval_status])

  // ── 센터 검색 ────────────────────────────────────────────────
  async function searchGyms() {
    const q = gymSearchQuery.trim()
    if (!q) return
    setGymSearchLoading(true)
    const { data } = await supabase
      .from('gyms')
      .select('id, name, address')
      .ilike('name', `%${q}%`)
      .limit(8)
    setGymSearchResults(data || [])
    setGymSearchLoading(false)
  }

  async function submitJoinRequest(gym) {
    if (!trainer?.id) return
    setJoinLoading(true)
    const { error } = await supabase
      .from('trainers')
      .update({ gym_id: gym.id, approval_status: 'pending' })
      .eq('id', trainer.id)
    setJoinLoading(false)
    if (error) { showToast('요청 중 오류가 발생했어요: ' + error.message); return }
    // 로컬 trainer 상태 업데이트
    setTrainer(prev => ({ ...prev, gym_id: gym.id, approval_status: 'pending' }))
    setGymName(gym.name)   // 센터명 미리 캐시 (pending 화면에서도 이름 표시 가능)
    setGymSearchResults([])
    setGymSearchQuery('')
    showToast('✓ 가입 요청을 보냈어요! 센터 대표님 승인을 기다려주세요 🙏')
  }

  async function cancelJoinRequest() {
    if (!trainer?.id) return
    const { error } = await supabase
      .from('trainers')
      .update({ gym_id: null, approval_status: 'approved' })
      .eq('id', trainer.id)
    if (error) { showToast('취소 중 오류: ' + error.message); return }
    setTrainer(prev => ({ ...prev, gym_id: null, approval_status: 'approved' }))
    showToast('요청을 취소했어요')
  }

  // (제거됨) loadInquiries / submitInquiry — 1:1 문의는 카카오 채널 외부 우회로 전환되어 내부 DB 저장 0건.

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
    if (paymentBusy) return
    const f = paymentForm
    const prod = products.find(p => p.id === f.productId)
    if (!prod) { showToast('상품을 선택해주세요'); return }
    const amount = f.taxIncluded ? (prod.price_incl_tax||prod.price_excl_tax) : prod.price_excl_tax
    setPaymentBusy(true)
    try {
      const { error: insErr } = await supabase.from('payments').insert({
        trainer_id: trainer.id, member_id: currentMemberId,
        product_id: prod.id, product_name: prod.name,
        session_count: prod.session_count, amount,
        tax_included: f.taxIncluded, memo: f.memo,
        payment_method: f.paymentMethod || 'card',
        payment_method_memo: (['payments_app','local_currency'].includes(f.paymentMethod) && f.paymentMethodMemo) ? f.paymentMethodMemo : null
      })
      if (insErr) throw insErr
      // 회원 total_sessions 업데이트
      const m = members.find(x => x.id === currentMemberId)
      const { error: updErr } = await supabase.from('members')
        .update({ total_sessions: (m?.total_sessions||0) + prod.session_count })
        .eq('id', currentMemberId)
      if (updErr) throw updErr
      await loadMembers(); await loadPayments(currentMemberId)
      setPaymentForm({productId:'',memo:'',taxIncluded:false,paymentMethod:'card',paymentMethodMemo:''})
      setRevenueRefreshKey(k => k + 1)
      loadMonthPayments(payMonthStr)
      showToast('✓ 상품 등록이 완료됐어요')
    } catch(e) {
      console.error('상품 등록 오류:', e)
      showToast('오류: ' + (e?.message || '상품 등록 실패'))
    } finally {
      setPaymentBusy(false)
    }
  }

  async function deletePayment(payment) {
    if (paymentBusy) return
    // 이중 안전장치: 모달 확인 후에도 window.confirm으로 한 번 더 검증
    const guard = window.confirm(
      '⚠️ 상품 등록 취소 시 해당 회원의 잔여 세션 수가 자동으로 역산(차감)됩니다.\n정말 취소하시겠습니까?'
    )
    if (!guard) return
    setPaymentBusy(true)
    try {
      const { error: delErr } = await supabase.from('payments').delete().eq('id', payment.id)
      if (delErr) throw delErr
      // 회원 total_sessions 복원
      const m = members.find(x => x.id === currentMemberId)
      const { error: updErr } = await supabase.from('members')
        .update({ total_sessions: Math.max(0,(m?.total_sessions||0) - payment.session_count) })
        .eq('id', currentMemberId)
      if (updErr) throw updErr
      await loadMembers(); await loadPayments(currentMemberId)
      setRevenueRefreshKey(k => k + 1)
      loadMonthPayments(payMonthStr)
      showToast('상품 등록이 취소됐어요')
    } catch(e) {
      console.error('상품 등록 취소 오류:', e)
      showToast('오류: ' + (e?.message || '취소 실패'))
    } finally {
      setPaymentBusy(false)
    }
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
      let uploadedHoldPath = null  // C-002: insert 실패 시 롤백 대상
      if (f.photoFile) {
        // Storage RLS: 첫 폴더 = auth.uid()::text 강제 (trainer.auth_id == auth.uid())
        const authUid = trainer?.auth_id || null
        if (!authUid) {
          showToast('정지 사진 업로드는 로그인 후 가능해요')
        } else {
          try {
            // C-102: 클라이언트 압축 (1200px / WebP 0.80)
            const { blob } = await sharedCompressImage(f.photoFile, { maxSize: 1200 })
            const path = `${authUid}/${Date.now()}.webp`
            const { error: upErr } = await supabase.storage.from('hold-photos').upload(path, blob, { contentType: 'image/webp' })
            if (!upErr) {
              uploadedHoldPath = path
              const { data: urlData } = supabase.storage.from('hold-photos').getPublicUrl(path)
              photoUrl = urlData.publicUrl
            }
          } catch (compErr) {
            console.warn('hold-photo 압축/업로드 실패:', compErr.message)
          }
        }
      }
      const { error: insertErr } = await supabase.from('member_holds').insert({
        member_id: currentMemberId, trainer_id: trainer.id,
        product_id: f.productId || null, product_name: prod?.name || null,
        start_date: f.startDate, end_date: f.endDate,
        reason: f.reason || null, photo_url: photoUrl
      })
      if (insertErr) {
        // C-002: insert 실패 시 storage 롤백 — orphan 차단
        if (uploadedHoldPath) await removeStorageOnError(supabase, 'hold-photos', uploadedHoldPath)
        throw insertErr
      }
      // members.suspended 컬럼 부재 — DB update 차단, member_holds 만으로 정지 상태 추적
      await loadMembers(); await loadHolds(currentMemberId)
      setHoldModal(false)
      showToast('✓ 정지(홀딩)가 등록됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deleteHold(holdId, memberId) {
    const mId = memberId || currentMemberId
    try {
      const { error: delErr } = await supabase.from('member_holds').delete().eq('id', holdId)
      if (delErr) throw delErr
      // members.suspended 컬럼 부재 — 정지 해제 update 차단, member_holds 삭제만으로 처리
      await loadMembers()
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

  // 오늘 출석한 회원 ID 목록 로드 (회원 리스트 퀵 액션용)
  async function loadTodayAttendance() {
    if (!trainer?.id) return
    const todayStr = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('attendance')
      .select('member_id')
      .eq('trainer_id', trainer.id)
      .eq('attended_date', todayStr)
    setTodayAttendSet(new Set((data || []).map(a => a.member_id)))
  }

  // 회원 카드에서 오늘 출석 즉시 토글 (별도 페이지 이동 없음)
  async function quickToggleToday(e, memberId) {
    e.stopPropagation()
    const todayStr = new Date().toISOString().slice(0, 10)
    if (todayAttendSet.has(memberId)) {
      // 취소
      const { data: existing } = await supabase
        .from('attendance').select('id')
        .eq('member_id', memberId).eq('attended_date', todayStr).maybeSingle()
      if (existing) await supabase.from('attendance').delete().eq('id', existing.id)
      setTodayAttendSet(prev => { const next = new Set(prev); next.delete(memberId); return next })
      showToast('출석 취소됐어요')
    } else {
      // 등록
      const { error } = await supabase.from('attendance')
        .insert({ trainer_id: trainer.id, member_id: memberId, attended_date: todayStr })
      if (!error) {
        setTodayAttendSet(prev => new Set([...prev, memberId]))
        showToast('✓ 오늘 출석 완료!')
      }
    }
  }
  useEffect(() => { if (rtab === 'attendance' && currentMemberId) loadAttendance(currentMemberId) }, [rtab, attendanceMonth, currentMemberId])

  function showTabFn(t) {
    const TAB_GATE = { history:'history_tab', schedule:'schedule_tab', revenue:'revenue_tab' }
    if (TAB_GATE[t] && !canUse(TAB_GATE[t])) {
      showToast('🔒 유료 플랜 전용 기능이에요. 플랜 업그레이드 후 이용 가능합니다.')
      return
    }
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

  // openRecord — 회원 카드 onClick 에서 호출되는 음성 일지 기록 진입점.
  // setAudioData 등 모든 setter 는 TrainerApp 컴포넌트(L1508~) 의 같은 closure 안에서 정의되어 있어
  // ReferenceError 가 발생할 수 없는 구조. 안전망으로 setter 존재 여부를 한 번 더 검증한다.
  function openRecord(memberId) {
    setCurrentMemberId(memberId)
    setExercises([])
    setActivePage('page-record')
    if (typeof setAudioData === 'function') setAudioData(null)
    if (typeof setShowPreview === 'function') setShowPreview(false)
    if (typeof setShowSend === 'function') setShowSend(false)
    if (typeof setRawInput === 'function') setRawInput('')
    if (typeof setFinalContent === 'function') setFinalContent('')
    safeSetRtab('write')
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
      // suspended 필드 제거 — members.suspended 컬럼 부재
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
      // C-002: DB cascade 로 logs/member_holds 등이 삭제되기 *전* 에 storage 정리.
      // (cascade 후엔 photo_url 못 읽으므로 orphan 발생)
      const memberRow = members.find(m => m.id === editMemberForm.id)
      if (memberRow) {
        const { ok, errors } = await cleanupMemberStorage(supabase, memberRow, trainer)
        if (!ok) console.warn('[deleteMember] storage cleanup 일부 실패:', errors)
      }
      await supabase.from('members').delete().eq('id', editMemberForm.id)
      await loadMembers()
      setDeleteConfirmModal(false)
      setEditMemberModal(false)
      showToast('회원이 삭제됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // === EXERCISES ===
  function openAddExercise() { setNewSets([]); setEditingExId(null); setExName(''); setSetWeight(''); setSetReps(''); setSetRir(''); setSetFeel(''); setExModal(true) }
  function addSet() {
    if (!setReps) { showToast('횟수를 입력해주세요'); return }
    const safeWeight = setWeight.trim() !== '' ? setWeight.trim() : ''
    const safeReps   = setReps.trim()   !== '' ? setReps.trim()   : '0'
    setNewSets([...newSets, { weight: safeWeight, reps: safeReps, rir: setRir, feel: setFeel }])
    setSetWeight(''); setSetReps(''); setSetRir(''); setSetFeel('')
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

  // === MEDIA (V3) ===

  /** Canvas API로 이미지 압축 → WebP dataURL (의존성 없음, iOS 완벽 지원) */
  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const MAX = 1200
        let { width, height } = img
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('이미지 변환 실패')); return }
          const reader = new FileReader()
          reader.onload = e => resolve({ dataUrl: e.target.result, sizeKB: Math.round(blob.size / 1024) })
          reader.readAsDataURL(blob)
        }, 'image/webp', 0.80)
        URL.revokeObjectURL(url)
      }
      img.onerror = () => reject(new Error('이미지 로드 실패'))
      img.src = url
    })
  }

  /** Canvas + <video> 첫 프레임 추출 → WebP (FFmpeg 실패 시 폴백용) */
  async function extractVideoThumbnail(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      const url   = URL.createObjectURL(file)
      video.muted = true; video.playsInline = true
      video.onloadeddata = () => {
        video.currentTime = 0
      }
      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        const MAX = 480
        let { videoWidth: w, videoHeight: h } = video
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url)
          if (!blob) { reject(new Error('썸네일 추출 실패')); return }
          const reader = new FileReader()
          reader.onload = e => resolve({ dataUrl: e.target.result, sizeKB: Math.round(blob.size / 1024), isFallback: true })
          reader.readAsDataURL(blob)
        }, 'image/webp', 0.75)
      }
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('동영상 로드 실패')) }
      video.src = url
    })
  }

  /** 영상 길이 조회 */
  function getVideoDuration(file) {
    return new Promise(resolve => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => { resolve(video.duration); URL.revokeObjectURL(video.src) }
      video.onerror = () => resolve(0)
      video.src = URL.createObjectURL(file)
    })
  }

  /** 시간 포맷 (초 → mm:ss) */
  function fmtTime(sec) {
    const s = Math.floor(sec)
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  }

  /** MediaRecorder로 영상 구간 추출 (데스크탑/Android Chrome 지원) */
  // C-001: 영상 길이 60초 제한 + 비트레이트 1Mbps 로 감소.
  // 정상 사용 시 트리머가 30초 구간을 잘라내는 게 표준 패턴이므로 60초 cap 은
  // 안전 마진이 충분한 abuse 방지 한계. (이전: 무제한 → +$168/월 abuse 가능)
  function trimVideoSegment(file, startSec, endSec) {
    return new Promise((resolve, reject) => {
      const MAX_DURATION_SEC = 60 // 60 초
      if (endSec - startSec > MAX_DURATION_SEC) {
        reject(new Error(`영상 길이는 최대 ${MAX_DURATION_SEC}초까지 가능합니다`))
        return
      }
      const video = document.createElement('video')
      video.muted = false
      video.playsInline = true
      video.preload = 'auto'
      video.addEventListener('loadedmetadata', () => {
        try {
          const stream = video.captureStream ? video.captureStream()
                       : video.mozCaptureStream ? video.mozCaptureStream()
                       : null
          if (!stream) { reject(new Error('captureStream 미지원 (iOS)'));  return }

          const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
          const mime   = types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm'
          const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_000_000 })
          const chunks = []
          recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
          recorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop())
            URL.revokeObjectURL(video.src)
            const blob = new Blob(chunks, { type: mime.split(';')[0] })
            resolve(blob)
          }
          video.currentTime = startSec
          video.addEventListener('seeked', () => {
            recorder.start(200)
            video.play()
            const durationMs = (endSec - startSec) * 1000
            setTimeout(() => { video.pause(); recorder.stop() }, durationMs + 300)
          }, { once: true })
        } catch(e) { reject(e) }
      }, { once: true })
      video.onerror = () => reject(new Error('영상 로드 실패'))
      video.src = URL.createObjectURL(file)
    })
  }

  /** 트리머 모달 열기 */
  function openVideoTrimmer(file) {
    const url = URL.createObjectURL(file)
    setVideoTrimFile(file)
    setTrimBlobUrl(url)
    setTrimStart(0)
    setTrimEnd(60)
    setTrimDuration(0)
    setShowVideoTrimmer(true)
    setMediaProcessing(false)
    setMediaProgress('')
    getVideoDuration(file).then(d => {
      setTrimDuration(d)
      setTrimEnd(Math.min(60, d))
    })
  }

  /** 트리머 적용 */
  async function applyVideoTrim() {
    if (!videoTrimFile) return
    setIsTrimming(true)
    setMediaProgress(`영상 편집 중... (${Math.round(trimEnd - trimStart)}초 구간)`)
    try {
      const blob    = await trimVideoSegment(videoTrimFile, trimStart, trimEnd)
      const blobUrl = URL.createObjectURL(blob)
      const sizeKB  = Math.round(blob.size / 1024)
      setMediaFiles(prev => [...prev, {
        id: Date.now() + Math.random(),
        name: videoTrimFile.name,
        type: blob.type || 'video/webm',
        dataUrl: blobUrl,
        sizeKB,
        isVideo: true,
        blob,
      }])
      closeVideoTrimmer()
      showToast(`✓ ${Math.round(trimEnd - trimStart)}초 영상이 첨부됐어요`)
    } catch(e) {
      // iOS / 미지원 환경 폴백: 원본 그대로 첨부
      console.warn('영상 트림 실패, 원본 첨부:', e.message)
      const blobUrl = URL.createObjectURL(videoTrimFile)
      setMediaFiles(prev => [...prev, {
        id: Date.now() + Math.random(),
        name: videoTrimFile.name,
        type: videoTrimFile.type || 'video/mp4',
        dataUrl: blobUrl,
        sizeKB: Math.round(videoTrimFile.size / 1024),
        isVideo: true,
        blob: videoTrimFile,
        trimStart,
        trimEnd,
      }])
      closeVideoTrimmer()
      showToast('영상을 원본 그대로 첨부했어요 (브라우저 편집 미지원)')
    } finally {
      setIsTrimming(false)
      setMediaProgress('')
    }
    // 다음 대기 파일 처리
    if (pendingTrimFilesRef.current.length > 0) {
      const next = pendingTrimFilesRef.current.shift()
      openVideoTrimmer(next)
    }
  }

  /** 트리머 닫기 */
  function closeVideoTrimmer() {
    setShowVideoTrimmer(false)
    setVideoTrimFile(null)
    if (trimBlobUrl) { URL.revokeObjectURL(trimBlobUrl); setTrimBlobUrl(null) }
  }

  /** 파일 선택 핸들러 — 이미지/동영상 분기 처리 */
  async function handleMediaSelect(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (mediaFiles.length + files.length > 5) {
      showToast('미디어는 최대 5개까지 첨부할 수 있어요')
      if (mediaInputRef.current) mediaInputRef.current.value = ''
      return
    }
    if (mediaInputRef.current) mediaInputRef.current.value = ''

    setMediaProcessing(true)
    setMediaProgress('미디어를 앱에 맞게 최적화하고 있습니다 ⏳')

    const results    = []
    const videoQueue = []  // 30초 초과 영상 → 트리머 큐

    // C-001: 30초 이하 영상도 파일 크기 50MB 초과 시 차단 (4K 등 거대 원본 방어)
    const MAX_VIDEO_SIZE_MB = 50

    for (const file of files) {
      const isVideo = file.type.startsWith('video/')
      if (isVideo) {
        const dur = await getVideoDuration(file)
        if (dur > 30) {
          videoQueue.push(file)   // 트리머 처리
        } else {
          // 30초 이하 영상 — size 검증 후 그대로 첨부
          const sizeMB = file.size / (1024 * 1024)
          if (sizeMB > MAX_VIDEO_SIZE_MB) {
            showToast(`영상 파일이 너무 커요 (현재 ${sizeMB.toFixed(1)}MB / 최대 ${MAX_VIDEO_SIZE_MB}MB). 화질을 낮춰 찍거나 30초 이상으로 찍어 트리머에서 잘라주세요`)
            continue
          }
          const blobUrl = URL.createObjectURL(file)
          results.push({
            id: Date.now() + Math.random(),
            name: file.name,
            type: file.type || 'video/mp4',
            dataUrl: blobUrl,
            sizeKB: Math.round(file.size / 1024),
            isVideo: true,
            blob: file,
          })
        }
      } else {
        setMediaProgress(`이미지 압축 중: ${file.name}`)
        try {
          const { dataUrl, sizeKB } = await compressImage(file)
          results.push({ id: Date.now() + Math.random(), name: file.name, type: 'image/webp', dataUrl, sizeKB, isVideo: false })
        } catch(err) {
          showToast(`${file.name} 처리 실패: ${err.message}`)
        }
      }
    }

    if (results.length > 0) setMediaFiles(prev => [...prev, ...results])
    setMediaProcessing(false)
    setMediaProgress('')

    // 트리머 큐 처리
    if (videoQueue.length > 0) {
      pendingTrimFilesRef.current = videoQueue.slice(1)
      openVideoTrimmer(videoQueue[0])
    }
  }

  function removeMedia(id) {
    setMediaFiles(prev => prev.filter(f => f.id !== id))
  }

  // === SPEECH (Web Speech API) ===
  function toggleSpeech() {
    // API 미지원 환경 처리
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechSupported(false)
      showToast('마이크 인식이 원활하지 않아요. 텍스트 창을 터치 후 스마트폰 키보드의 마이크 버튼을 사용해 보세요.')
      return
    }

    // 이미 듣고 있으면 → 중지
    if (isListening) {
      try { recognitionRef.current?.stop() } catch(_) {}
      setIsListening(false)
      return
    }

    // 새 인스턴스 생성
    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = false       // 짧은 브리핑 → 1회 완성 방식
    recognition.interimResults = false   // 최종 결과만 받아 중간 노이즈 방지
    recognition.maxAlternatives = 1

    // 인식 결과 → rawInput에 이어붙이기
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript || ''
      if (transcript.trim()) {
        setRawInput(prev => prev ? prev.trimEnd() + ' ' + transcript : transcript)
      }
    }

    // 오류 처리 (iOS Safari 권한 거부 / network / aborted 모두 커버)
    recognition.onerror = (e) => {
      const ignorable = ['aborted', 'no-speech']
      if (!ignorable.includes(e.error)) {
        showToast('마이크 인식이 원활하지 않아요. 텍스트 창을 터치 후 스마트폰 키보드의 마이크 버튼을 사용해 보세요.')
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    // onend — iOS Safari가 권한 없이 강제 종료할 때 state 동기화
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setIsListening(true)
    } catch(e) {
      showToast('마이크 인식이 원활하지 않아요. 텍스트 창을 터치 후 스마트폰 키보드의 마이크 버튼을 사용해 보세요.')
      setIsListening(false)
      recognitionRef.current = null
    }
  }

  // === GENERATE ===
  async function generateLog() {
    if (!rawInput.trim() && !exercises.length) { showToast('수업 내용을 입력해주세요'); return }
    const key = centralApiKey
    if (!key) { showToast('AI 서비스 준비 중이에요. 잠시 후 다시 시도해주세요'); return }

    // ── 크레딧 체크 ──────────────────────────────────────────
    if (credits <= 0) { setShowLimitModal(true); return }
    // ─────────────────────────────────────────────────────────

    // ── 잔여 수업 체크 ────────────────────────────────────────
    const m = currentMember
    const remainSessions = (m?.total_sessions || 0) - (m?.done_sessions || 0)
    if (remainSessions <= 0) {
      showToast('잔여 수업이 0회예요. 수업권을 먼저 추가해주세요.')
      return
    }
    // ─────────────────────────────────────────────────────────

    setGenerating(true); setShowPreview(false); setShowSend(false)
    setAiStatus('AI가 회원님을 위한 맞춤형 리포트를 작성하고 있습니다...')
    try {
      // P0 fix (비용 폭탄 방지): Gemini 호출 전 트레이너 월 한도 확인.
      // 그동안 AI 일지는 use_ai_credit (post-call) 만 있고 사전 한도 체크가 없어
      // ai_monthly_limit 도달 후에도 호출 가능했음.
      try {
        if (trainer?.id) {
          const { data: usage } = await supabase.rpc('get_ai_usage', { p_trainer_id: trainer.id })
          if (usage?.blocked) {
            showToast('AI 월 한도를 모두 사용했어요. 다음달에 다시 시도해주세요.')
            setGenerating(false); setAiStatus('')
            return
          }
        }
      } catch (e) {
        console.warn('[generateLog] get_ai_usage 실패 — 한도 체크 skip:', e?.message)
      }

      const combinedInput = extraInstruction?.trim()
        ? (rawInput || '') + '\n\n[추가 지시사항]\n' + extraInstruction.trim()
        : (rawInput || '')
      const prompt = buildSessionLogPrompt({
        trainer,
        member:      m,
        exercises,
        rawInput:    combinedInput,
        hasAudio:    false,
        perspective: perspectiveChip || 'rehab',
      })

      const text = await callGemini(key, GEMINI_MODEL, prompt, { timeoutMs: 45000 })

      setShowPreview(true); setPreviewContent(text); setFinalContent(text); setShowSend(true)
      // mediaFiles 는 state에 보관됨. 미디어 Storage 업로드 + DB logs INSERT는
      // sendKakao() 에서 수행됨 (생성 미리보기 → 확인 → 전송 흐름)

      showToast('✦ 수업일지 생성 완료!')

      // ── 크레딧 차감 ──────────────────────────────────────
      try {
        const { data: result, error: creditErr } = await supabase.rpc('use_ai_credit', { p_trainer_id: trainer.id })
        if (creditErr) {
          showToast('크레딧 차감에 실패했어요')
          console.warn('[generateLog] use_ai_credit 오류:', creditErr.message)
        } else if (result?.success) {
          setCredits(result.credits)
        }
      } catch(e) {
        showToast('크레딧 차감 중 오류가 발생했어요')
        console.warn('[generateLog] use_ai_credit catch:', e.message)
      }
      // ─────────────────────────────────────────────────────
    } catch(e) {
      showToast('오류: ' + e.message)
      // rawInput 유지 — 에러 시 입력 내용 보존됨 (state 그대로)
    } finally {
      setGenerating(false)
      setAiStatus('')
    }
  }

  // === SEND ===
  async function sendKakao() {
    const m = currentMember
    if (!finalContent) { showToast('먼저 수업일지를 생성해주세요'); return }
    const reportId = Date.now().toString(36) + Math.random().toString(36).substr(2,5)
    // C-002: 업로드 도중/이후 어디서 실패해도 storage·DB orphan 차단
    //   - uploadedMediaPaths : session-media 에 올라간 path 들 — catch 에서 일괄 remove
    //   - sotSessionId        : logs insert 실패 시 함께 만들어진 workout_sessions row 도 삭제
    const uploadedMediaPaths = []
    let sotSessionId = null
    try {
      const exData = exercises.map(ex => ({
        name: ex.name,
        sets: ex.sets.map(s => ({
          weight: s.weight != null && s.weight !== '' ? String(s.weight) : '',
          reps:   s.reps   != null && s.reps   !== '' ? String(s.reps)   : '0',
          rir:    s.rir    != null                    ? s.rir             : '',
          feel:   s.feel   || '',
        })),
      }))

      // ── 미디어 업로드 (session-media 버킷) ───────────────────────────────
      // 업로드 실패 시 즉시 에러를 throw — 빈값이 DB에 저장되는 것을 차단한다
      // 부분 업로드된 파일은 catch 의 일괄 remove 로 정리 (uploadedMediaPaths)
      const mediaPayload = []
      for (const mf of mediaFiles) {
        let blob
        try {
          blob = mf.blob instanceof Blob ? mf.blob
               : await fetch(mf.dataUrl).then(r => r.blob())
        } catch (fetchErr) {
          throw new Error(`미디어 읽기 실패 (${mf.id}): ${fetchErr.message}`)
        }
        const ext  = mf.type.includes('webm') ? 'webm' : mf.isVideo ? 'mp4' : 'webp'
        const path = `${trainer.id}/${reportId}/${mf.id}.${ext}`
        console.log('[sendKakao] 스토리지 업로드 시도:', path, '| size:', blob.size, 'bytes')
        const { error: upErr } = await supabase.storage
          .from('session-media')
          .upload(path, blob, { contentType: mf.type, upsert: false })
        if (upErr) {
          throw new Error(`미디어 업로드 실패 (${path}): ${upErr.message}`)
        }
        uploadedMediaPaths.push(path)  // C-002: 후속 단계 실패 시 롤백 대상
        const { data: { publicUrl } } = supabase.storage.from('session-media').getPublicUrl(path)
        console.log('[sendKakao] 업로드 완료:', publicUrl)
        mediaPayload.push({ url: publicUrl, type: mf.isVideo ? 'video' : 'image' })
      }
      // ─────────────────────────────────────────────────────────────────────

      // ─── SoT(단일 진실원) 통합 ──────────────────────────────────────────
      // 운동 데이터(exData)는 workout_sessions(SoT) 1곳에만 JSONB로 저장하고,
      // logs 테이블에는 session_id 참조만 남긴다. logs.exercises_data 는 더 이상 사용 안 함(Payload 경량화).
      // 사전조건: supabase_cleanup_cron.sql 로 logs.session_id 컬럼이 추가돼 있어야 함.
      // sotSessionId 는 함수 본체에 선언됨 (catch 에서 logs 실패 시 이 row 삭제).
      try {
        const exArr = Array.isArray(exData) ? exData : []
        if (exArr.length > 0) {
          const cleanExArr = exArr
            .filter(e => e && (e.name || '').toString().trim())
            .map(({ localId, ...rest }) => rest)
          if (cleanExArr.length > 0) {
            const totalVolume = (cleanExArr || []).reduce((tot, ex) => {
              const sets = ex?.sets || []
              return tot + sets.reduce((s, set) => s + ((parseFloat(set?.weight) || 0) * (parseInt(set?.reps) || 0)), 0)
            }, 0)
            const today = new Date().toISOString().split('T')[0]
            const { data: sotRow, error: sotErr } = await supabase
              .from('workout_sessions')
              .insert({
                member_id:    currentMemberId,
                trainer_id:   trainer.id,
                source:       'trainer',
                title:        null,
                workout_date: today,
                duration_min: null,
                memo:         null,
                exercises:    cleanExArr,
                total_volume: totalVolume,
              })
              .select('id')
              .single()
            if (sotErr) {
              console.warn('[sendKakao] SoT workout_sessions insert 실패:', sotErr.message)
            } else if (sotRow?.id) {
              sotSessionId = sotRow.id
            }
          }
        }
      } catch (sotE) {
        console.warn('[sendKakao] SoT 처리 중 예외:', sotE?.message)
      }

      // logs 인서트 — 무거운 JSONB 제거, session_id 참조만 보유 (Payload 경량화)
      const insertData = {
        trainer_id:     trainer.id,
        member_id:      currentMemberId,
        content:        finalContent,
        session_number: m.done_sessions + 1,
        report_id:      reportId,
        session_id:     sotSessionId,   // ← SoT 참조 (workout_sessions.id)
        media_urls:     mediaPayload,   // [] or [{url, type}, ...]
      }
      console.log('[sendKakao] DB Insert Payload:', JSON.stringify(insertData, null, 2))

      const { error: logErr } = await supabase.from('logs').insert(insertData)
      if (logErr) throw new Error('일지 저장 실패: ' + logErr.message)

      const { error: memErr } = await supabase.from('members')
        .update({ done_sessions: m.done_sessions + 1 })
        .eq('id', currentMemberId)
      if (memErr) console.warn('[sendKakao] 세션 카운트 업데이트 실패:', memErr.message)

      await loadMembers(); await loadLogs()
      showToast('📱 회원 앱으로 일지가 전송되었습니다.')
      setTimeout(() => {
        // 모든 setter 는 TrainerApp closure 내부 정의 — 안전망으로 존재 여부 검증 후 호출
        if (typeof setShowSend === 'function') setShowSend(false)
        if (typeof setShowPreview === 'function') setShowPreview(false)
        if (typeof setAudioData === 'function') setAudioData(null)
        if (typeof setRawInput === 'function') setRawInput('')
        if (typeof setPerspectiveChip === 'function') setPerspectiveChip('rehab')
        if (typeof setExtraInstruction === 'function') setExtraInstruction('')
        if (typeof setFinalContent === 'function') setFinalContent('')
        if (typeof setExercises === 'function') setExercises([])
        if (typeof setMediaFiles === 'function') setMediaFiles([])
      }, 1500)
    } catch(e) {
      console.error('[sendKakao] 오류:', e)
      // C-002: 부분 진행분 정리 — storage(session-media) + DB(workout_sessions)
      //        cleanup 실패는 silent (본 흐름 회복은 사용자 retry 에 맡김).
      try {
        if (uploadedMediaPaths.length > 0) {
          await supabase.storage.from('session-media').remove(uploadedMediaPaths)
          console.log('[sendKakao] 롤백: session-media', uploadedMediaPaths.length, '개 정리')
        }
      } catch (rollErr) {
        console.warn('[sendKakao] session-media 롤백 실패:', rollErr.message)
      }
      try {
        if (sotSessionId) {
          await supabase.from('workout_sessions').delete().eq('id', sotSessionId)
          console.log('[sendKakao] 롤백: workout_sessions', sotSessionId, '삭제')
        }
      } catch (rollErr) {
        console.warn('[sendKakao] workout_sessions 롤백 실패:', rollErr.message)
      }
      showToast('오류: ' + e.message)
    }
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

  // 모달 열기 — initialBlock 으로 add/edit 분기. 모달 자체는 ScheduleModal 이 관리.
  function openAddBlock(ds, start, end) {
    setEditingBlock({
      date: ds || dStr(new Date()),
      start: start || '09:00',
      end:   end   || '10:00',
      type:  'lesson',
      color: 'green',
      memberId: members[0]?.id || '',
    })
  }
  function openEditBlock(id) {
    const b = blocks.find(x => x.id === id)
    if (b) setEditingBlock(b)
  }

  // 콜백 — useCallback 으로 메모. ScheduleModal(memo) 의 props 안정화.
  const closeScheduleModal = useCallback(() => setEditingBlock(null), [])

  const handleSaveBlock = useCallback(async (block, errorMsg) => {
    // 모달 내부 검증 실패 시 errorMsg 만 전달됨
    if (errorMsg) { showToast(errorMsg); return }
    const id = block.id || Date.now().toString()
    const next = { ...block, id }
    setBlocks(prev => block.id
      ? prev.map(b => b.id === block.id ? next : b)
      : [...prev, next])
    setEditingBlock(null)
    showToast(block.id ? '✓ 수정됐어요!' : '✓ 스케쥴 추가됐어요!')
    if (notifEnabled && Notification.permission === 'granted' && trainer?.id && import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      try {
        const memberName = next.type === 'lesson'
          ? (members.find(m => m.id === next.memberId)?.name || '회원')
          : (next.title || '개인일정')
        await scheduleNotification(trainer.id, next, memberName, notifMinutes)
      } catch(e) { console.warn('알림 예약 실패:', e) }
    }
  // showToast 는 외부 hook 결과라 안정적이라 가정. trainer.id / notif* / members 는 deps.
  }, [notifEnabled, notifMinutes, trainer?.id, members])

  const handleDeleteBlock = useCallback(async (id) => {
    // U-014: 실수 클릭 방지 — confirm 추가
    if (!window.confirm('정말 삭제할까요? 일정과 알림 예약 모두 사라지며 복구할 수 없습니다.')) return
    setBlocks(prev => prev.filter(b => b.id !== id))
    setEditingBlock(null)
    showToast('삭제됐어요')
    if (trainer?.id && import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      try { await deleteScheduledNotification(trainer.id, id) } catch(e) {}
    }
  }, [trainer?.id])

  const handleCancelLesson = useCallback((id, cancelType, cancelDetail) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, cancelled: true, cancelType, cancelDetail } : b))
    setEditingBlock(null)
    showToast('취소 처리됐어요')
  }, [])

  // === RENDER SCHEDULE GRID ===
  function renderScheduleGrid() {
    const todayStr = dStr(new Date())
    const totalSlots = (EH-SH)*60/SMIN; const totalPx = totalSlots*SPX

    // 평일(월~금, 원래 요일 index 0~4) 은 항상 표시.
    // 주말(토=5, 일=6) 은 해당 날짜에 일정이 있을 때만 컬럼 노출 (에브리타임 방식).
    // 필터해도 요일 라벨이 어긋나지 않도록 원래 요일 인덱스(idx)/라벨을 보존.
    const cols = getWeekDates()
      .map((d, idx) => ({ d, idx, label: DAYS[idx], ds: dStr(d) }))
      .filter(({ idx, ds }) => idx < 5 || (blocksByDate[ds] || []).length > 0)

    const nDays = cols.length
    // 5일(평일만) → 모바일 한 화면에 꽉 채움(가로 스크롤 X).
    // 6~7일(주말 일정 존재) → 기존처럼 minmax(88px)+minWidth 로 가로 스크롤 허용.
    const fit = nDays <= 5
    const colTrack     = fit ? 'minmax(0, 1fr)' : 'minmax(88px, 1fr)'
    const gridMinWidth = fit ? '100%' : `${48 + nDays * 88}px`

    return (
      // fit 모드: sg-wrap 미세 가로 스크롤 차단 (서브픽셀 반올림 대비 이중 안전).
      <div className="sg-wrap" style={fit ? { overflowX: 'hidden' } : undefined}>
        {/* sg-fit: CSS 의 .sg-th/.sg-dc min-width:88px 를 0 으로 풀어 minmax(0,1fr) 실작동 */}
        <div className={`sg${fit ? ' sg-fit' : ''}`} style={{display:'grid',gridTemplateColumns:`48px repeat(${nDays}, ${colTrack})`,minWidth:gridMinWidth}}>
          <div className="sg-th-e" style={{height:'36px'}}></div>
          {cols.map(({ d, idx, label }) => {
            const isToday = dStr(d)===todayStr
            return <div key={idx} className={`sg-th${isToday?' today':''}`}><span className="d">{d.getDate()}</span>{label}</div>
          })}
          <div className="sg-tc" style={{height:totalPx+'px',position:'relative'}}>
            {Array.from({length:totalSlots+1}).map((_,s) => {
              const min=s*SMIN
              if (min%60===0) { const h=SH+min/60; return <div key={s} className="sg-tl" style={{top:s*SPX+'px'}}>{h}:00</div> }
              return null
            })}
          </div>
          {cols.map(({ ds }) => {
            const dayBlocks = blocksByDate[ds] || []
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

    // ── 페이월 (무료 플랜) ──────────────────────────────────────
    if (!canUse('revenue_tab')) {
      const FAKE_PAYS = [
        { name:'김지수', product:'PT 30회', method:'💳 카드',  amount:900000, date:'5월 2일' },
        { name:'이민호', product:'PT 20회', method:'💵 현금',  amount:600000, date:'4월 28일' },
        { name:'박수빈', product:'그룹 10회',method:'📱 페이', amount:200000, date:'4월 25일' },
      ]
      return (
        <div style={{ position:'relative', borderRadius:'16px', overflow:'hidden', minHeight:'480px' }}>
          {/* ── 흐릿한 가짜 배경 ── */}
          <div style={{ filter:'blur(5px)', opacity:0.3, pointerEvents:'none', userSelect:'none' }}>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px 18px', marginBottom:'10px' }}>
              <div style={{ fontSize:'11px', color:'var(--text-dim)', marginBottom:'4px' }}>이번 달 총 결제액</div>
              <div style={{ fontSize:'38px', fontWeight:800, color:'#60a5fa' }}>1,700,000원</div>
              <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>12건 결제</div>
            </div>
            {FAKE_PAYS.map((p,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 13px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', marginBottom:'7px' }}>
                <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:'var(--accent)', color:'#0f0f0f', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'13px', flexShrink:0 }}>{p.name[0]}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:600 }}>{p.name} · {p.product}</div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{p.method} · {p.date}</div>
                </div>
                <div style={{ fontSize:'13px', fontWeight:700, color:'var(--accent)' }}>{p.amount.toLocaleString()}원</div>
              </div>
            ))}
          </div>
          {/* ── 중앙 오버레이 ── */}
          <div style={{
            position:'absolute', inset:0,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            background:'rgba(10,10,10,0.65)', backdropFilter:'blur(2px)',
            padding:'32px 28px', textAlign:'center',
            borderRadius:'16px',
          }}>
            <div style={{ fontSize:'44px', marginBottom:'16px' }}>🔒</div>
            <div style={{ fontSize:'17px', fontWeight:800, color:'#f9fafb', marginBottom:'10px', letterSpacing:'-0.3px' }}>
              프리미엄 전용 기능입니다
            </div>
            <div style={{ fontSize:'13px', color:'#9ca3af', lineHeight:1.75, marginBottom:'24px' }}>
              월별 매출 추이와 자동 정산 기능을<br/>사용해보세요!
            </div>
            <div style={{ fontSize:'11px', color:'#6b7280', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'10px 16px', lineHeight:1.6 }}>
              💡 설정 → 플랜에서 업그레이드 후 이용할 수 있어요
            </div>
          </div>
        </div>
      )
    }
    // ───────────────────────────────────────────────────────────

    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate()-(now.getDay()||7)+1); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const weekLogs = logs.filter(l => new Date(l.created_at) >= weekStart)
    const monthLogs = logs.filter(l => new Date(l.created_at) >= monthStart)
    const remainRevenue = members.reduce((s,m) => s+(m.session_price||0)*(m.total_sessions-m.done_sessions), 0)
    // P0 perf fix: 외부 memberById useMemo (members 변경 시만 재생성) 활용 → O(N×M) → O(N).
    const weekRevenue = weekLogs.reduce((s,l) => s + (memberById.get(l.member_id)?.session_price || 0), 0)
    const monthRevenue = monthLogs.reduce((s,l) => s + (memberById.get(l.member_id)?.session_price || 0), 0)
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

        {/* ── Hero: 이번 달 총 결제액 ── */}
        {(() => {
          const [py, pm] = payMonthStr.split('-').map(Number)
          const isCurrentMonth = py === new Date().getFullYear() && pm === new Date().getMonth()+1
          return (
            <div className="card" style={{marginBottom:'14px',padding:'20px 18px'}}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                <div>
                  <div style={{ fontSize:'11px', fontWeight:600, color:'var(--text-dim)', marginBottom:'6px', letterSpacing:'0.04em', textTransform:'uppercase' }}>
                    {isCurrentMonth ? '이번 달' : `${py}년 ${pm}월`} 총 결제액
                  </div>
                  <div style={{ fontSize:'36px', fontWeight:800, color:'var(--accent-text)', lineHeight:1, fontFamily:"'DM Mono',monospace" }}>
                    {payMonthLoading ? '—' : (payMonthData?.total ?? 0).toLocaleString()}
                    <span style={{ fontSize:'16px', fontWeight:400, color:'var(--text-muted)', marginLeft:'4px' }}>원</span>
                  </div>
                  <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'6px' }}>
                    {payMonthLoading ? '조회 중...' : `${payMonthData?.count ?? 0}건 결제`}
                  </div>
                </div>
                {/* 월 선택 버튼 */}
                <div style={{ position:'relative', flexShrink:0 }}>
                  <button title="월 선택" style={{
                    width:'34px', height:'34px', borderRadius:'9px',
                    border:'1px solid var(--border)', background:'var(--surface2)',
                    color:'var(--text-muted)', fontSize:'16px', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', padding:0,
                  }}>📅
                    <input type="month" value={payMonthStr}
                      max={new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')}
                      onChange={e=>{ if(e.target.value) setPayMonthStr(e.target.value) }}
                      style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%', height:'100%' }}
                    />
                  </button>
                </div>
              </div>
              {/* 진행 바 */}
              <div style={{ marginTop:'14px', height:'3px', background:'var(--border)', borderRadius:'2px', overflow:'hidden' }}>
                <div style={{ height:'100%', background:'var(--accent)',
                  width: (payMonthData?.total ?? 0) > 0 ? '100%' : '0%',
                  transition:'width 0.6s ease', borderRadius:'2px' }} />
              </div>
            </div>
          )
        })()}

        {/* 새로고침 버튼 (원래 헤더 — 텍스트만 유지) */}
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
        </div>

        {/* 주간 리포트 — 접기/펼치기 */}
        {canUse('weekly_report') ? (
          <>
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
          </>
        ) : (
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px dashed rgba(255,255,255,0.12)',borderRadius:'10px',padding:'14px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px',opacity:0.7}}>
            <span style={{fontSize:'20px'}}>🔒</span>
            <div>
              <div style={{fontSize:'13px',fontWeight:700}}>주간 AI 리포트</div>
              <div style={{fontSize:'11px',color:'var(--text-dim)'}}>유료 플랜에서 이용 가능해요.</div>
            </div>
          </div>
        )}

        {canUse('settlement') ? (
          <>
            <div className="section-label">정산 분석</div>
            <SettlementBreakdown trainerId={trainer?.id} showToast={showToast} members={members} />
          </>
        ) : (
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px dashed rgba(255,255,255,0.12)',borderRadius:'10px',padding:'14px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px',opacity:0.7}}>
            <span style={{fontSize:'20px'}}>🔒</span>
            <div>
              <div style={{fontSize:'13px',fontWeight:700}}>정산 분석</div>
              <div style={{fontSize:'11px',color:'var(--text-dim)'}}>유료 플랜에서 이용 가능해요.</div>
            </div>
          </div>
        )}

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
              const cached = revenueByMember[m.id]
              return (
                <MemberRevenueCard key={m.id} m={m} mWeekLogs={mWeekLogs} mMonthLogs={mMonthLogs}
                  attendRate={attendRate} cancelledBlocks={cancelledBlocks}
                  remain={remain} pct={pct} price={price}
                  dayOfMonth={dayOfMonth} daysInMonth={daysInMonth}
                  confirmed={cached ? cached.confirmed : null}
                  recentPays={cached ? cached.recentPays : []}
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

            {/* 카카오톡/페이스북 등 인앱 브라우저 사용자 안내 */}
            <InAppBrowserBanner />

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
              {/* Kakao OAuth — 2026-05-11 비활성화
                  카카오 디벨로퍼스 앱 등록 + Supabase Provider 연동 + 이메일 동의 검수가
                  완료되지 않아 현재 카카오 로그인 시도 시 에러 발생. 베타 운영 단계에서는
                  Google OAuth 만으로 충분. 정식 출시 단계(Phase E) 에서 카카오 디벨로퍼스
                  설정 후 아래 블록 주석만 해제하면 복원됨. signInWithKakao 함수는 보존.
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
              */}
            </div>

            <div style={{marginTop:'16px',padding:'10px 0',borderTop:'1px solid #F3F4F6',textAlign:'center'}}>
              <span style={{fontSize:'11px',color:'#9CA3AF',lineHeight:1.7}}>
                로그인 시{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{color:'#6B7280',textDecoration:'underline'}}>이용약관</a>
                {' '}및{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{color:'#6B7280',textDecoration:'underline'}}>개인정보처리방침</a>
                에 동의한 것으로 간주됩니다.
              </span>
            </div>

            <div style={{textAlign:'center',marginTop:'12px'}}>
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

            {/* ── 동의 항목 ── */}
            <div style={{marginTop:'20px',display:'flex',flexDirection:'column',gap:'10px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#374151',marginBottom:'4px'}}>서비스 이용 동의</div>

              {/* 이용약관 */}
              <label style={{display:'flex',alignItems:'flex-start',gap:'10px',cursor:'pointer'}}>
                <input type="checkbox" checked={agreedTerms} onChange={e=>setAgreedTerms(e.target.checked)}
                  style={{marginTop:'2px',width:'16px',height:'16px',accentColor:'#4d7c0f',flexShrink:0}} />
                <span style={{fontSize:'13px',color:'#374151',lineHeight:1.6}}>
                  <span style={{color:'#ef4444',fontWeight:700,marginRight:'3px'}}>[필수]</span>
                  <a href="/terms" target="_blank" rel="noopener noreferrer"
                    style={{color:'#4d7c0f',fontWeight:600,textDecoration:'underline'}}>이용약관</a>에 동의합니다
                </span>
              </label>

              {/* 개인정보처리방침 */}
              <label style={{display:'flex',alignItems:'flex-start',gap:'10px',cursor:'pointer'}}>
                <input type="checkbox" checked={agreedPrivacy} onChange={e=>setAgreedPrivacy(e.target.checked)}
                  style={{marginTop:'2px',width:'16px',height:'16px',accentColor:'#4d7c0f',flexShrink:0}} />
                <span style={{fontSize:'13px',color:'#374151',lineHeight:1.6}}>
                  <span style={{color:'#ef4444',fontWeight:700,marginRight:'3px'}}>[필수]</span>
                  <a href="/privacy" target="_blank" rel="noopener noreferrer"
                    style={{color:'#4d7c0f',fontWeight:600,textDecoration:'underline'}}>개인정보처리방침</a>에 동의합니다
                </span>
              </label>

            </div>

            <button className="btn btn-primary btn-full"
              style={{
                marginTop:'16px',padding:'13px',fontSize:'14px',
                opacity: (agreedTerms && agreedPrivacy) ? 1 : 0.45,
                cursor: (agreedTerms && agreedPrivacy) ? 'pointer' : 'not-allowed',
              }}
              onClick={register}>
              트레이너 등록 완료
            </button>
            {regError && (
              <div style={{marginTop:'10px',padding:'10px 12px',background:'rgba(239,68,68,0.08)',
                border:'1px solid rgba(239,68,68,0.3)',borderRadius:'8px',
                fontSize:'11px',color:'#ef4444',lineHeight:1.5,wordBreak:'break-all'}}>
                ⚠️ {regError}
              </div>
            )}
            <div style={{textAlign:'center',marginTop:'16px'}}>
              <span style={{fontSize:'13px',color:'#4d7c0f',cursor:'pointer',fontWeight:600}}
                onClick={()=>setScreen('login')}>← 뒤로</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === 가입 요청 승인 대기 화면 (053 화이트리스트) ===
  if (screen === 'pending') {
    return (
      <div className="login-wrap">
        <div style={{width:'100%',maxWidth:'440px'}}>
          <div style={{background:'#fff',border:'1px solid #E1E4D9',borderRadius:'22px',
            padding:'40px 32px',boxShadow:'0 8px 40px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04)'}}>
            <div style={{textAlign:'center',marginBottom:'8px',fontSize:'42px'}}>⏳</div>
            <div style={{textAlign:'center',fontSize:'20px',fontWeight:800,color:'#111',marginBottom:'8px',letterSpacing:'-0.3px'}}>
              가입 요청 승인 대기 중
            </div>
            <div style={{textAlign:'center',fontSize:'13px',color:'#6B7280',lineHeight:1.7,marginBottom:'20px'}}>
              관리자 검토 후 승인되면 다시 로그인해 이용할 수 있어요.<br/>
              평일 기준 1~2일 내에 처리될 예정이에요.
            </div>
            {signupInfo && (
              <div style={{background:'#f9fafb',border:'1px solid #E1E4D9',borderRadius:'10px',
                padding:'14px 16px',marginBottom:'18px',fontSize:'13px',color:'#374151',lineHeight:1.7}}>
                <div>이름: <strong style={{color:'#111'}}>{signupInfo.name || regName || '-'}</strong></div>
                <div>이메일: <strong style={{color:'#111'}}>{signupInfo.email || authUser?.email || '-'}</strong></div>
                <div>상태: <span style={{color:'#d97706',fontWeight:700}}>승인 대기</span></div>
              </div>
            )}
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'10px',
              padding:'12px 14px',fontSize:'12px',color:'#92400e',lineHeight:1.7,marginBottom:'18px'}}>
              💡 승인 알림은 별도로 발송되지 않아요. ownapp(카카오채널)로 문의 주세요.
            </div>
            <button className="btn btn-primary btn-full"
              style={{padding:'13px',fontSize:'14px'}}
              onClick={async () => {
                await supabase.auth.signOut()
                setSignupInfo(null); setAuthUser(null); setScreen('login')
              }}>
              로그아웃
            </button>
            <div style={{textAlign:'center',marginTop:'14px'}}>
              <Link to="/" style={{fontSize:'12px',color:'#9CA3AF',textDecoration:'none'}}>← 메인으로</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === 가입 요청 거부됨 화면 (053 화이트리스트) ===
  if (screen === 'rejected') {
    return (
      <div className="login-wrap">
        <div style={{width:'100%',maxWidth:'440px'}}>
          <div style={{background:'#fff',border:'1px solid #E1E4D9',borderRadius:'22px',
            padding:'40px 32px',boxShadow:'0 8px 40px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04)'}}>
            <div style={{textAlign:'center',marginBottom:'8px',fontSize:'42px'}}>🚫</div>
            <div style={{textAlign:'center',fontSize:'20px',fontWeight:800,color:'#111',marginBottom:'8px',letterSpacing:'-0.3px'}}>
              가입이 거부되었어요
            </div>
            <div style={{textAlign:'center',fontSize:'13px',color:'#6B7280',lineHeight:1.7,marginBottom:'20px'}}>
              현재 이 이메일로는 트레이너 앱 이용이 어려운 상태예요.
            </div>
            {signupInfo?.reason && (
              <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.25)',
                borderRadius:'10px',padding:'14px 16px',marginBottom:'18px',
                fontSize:'13px',color:'#991b1b',lineHeight:1.7}}>
                <div style={{fontWeight:700,marginBottom:'4px'}}>사유</div>
                <div>{signupInfo.reason}</div>
              </div>
            )}
            <div style={{background:'#f9fafb',border:'1px solid #E1E4D9',borderRadius:'10px',
              padding:'12px 14px',fontSize:'12px',color:'#6B7280',lineHeight:1.7,marginBottom:'18px'}}>
              문의가 있으시면 카카오 채널을 통해 연락주세요.
            </div>
            <button className="btn btn-primary btn-full"
              style={{padding:'13px',fontSize:'14px'}}
              onClick={async () => {
                await supabase.auth.signOut()
                setSignupInfo(null); setAuthUser(null); setScreen('login')
              }}>
              로그아웃
            </button>
            <div style={{textAlign:'center',marginTop:'14px'}}>
              <Link to="/" style={{fontSize:'12px',color:'#9CA3AF',textDecoration:'none'}}>← 메인으로</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === 퇴사 처리된 계정 차단 화면 ===
  if (trainer?.employment_status === 'resigned') {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg, #f4f4f2)', padding: '24px',
      }}>
        <div style={{
          maxWidth: '360px', width: '100%',
          background: '#fff', border: '1px solid #E1E4D9',
          borderRadius: '20px', padding: '40px 28px', textAlign: 'center',
          boxShadow: '0 8px 40px rgba(0,0,0,0.07)',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🚫</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#111', marginBottom: '8px', letterSpacing: '-0.3px' }}>
            접근이 제한됐어요
          </div>
          <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.7, marginBottom: '28px' }}>
            현재 <strong style={{ color: '#111' }}>퇴사 처리된 계정</strong>입니다.<br />
            소속 센터 대표님께 문의해 복직 처리를 요청하세요.
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); setTrainer(null); setScreen('landing') }}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px',
              background: '#f3f4f6', border: '1px solid #E1E4D9',
              fontSize: '13px', fontWeight: 600, color: '#374151',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  // === MAIN APP ===
  // 하단 탭이 있는 메인 페이지 목록 (서브페이지에서는 탭 숨김)
  const MAIN_PAGES = ['page-members','page-history','page-schedule','page-revenue','page-settings','page-support']
  const TAB_LABELS = {members:'회원',history:'발송기록',schedule:'시간표',revenue:'매출관리',settings:'설정',support:'문의'}
  const TAB_ICONS = {
    members: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active?'#10B981':'#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
    history: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active?'#10B981':'#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    ),
    schedule: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active?'#10B981':'#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    revenue: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active?'#10B981':'#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>
    ),
    settings: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active?'#10B981':'#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
    support: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active?'#10B981':'#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  }
  return (
    <div style={{paddingBottom: MAIN_PAGES.includes(activePage) ? '72px' : '0'}}>
      {/* 최초 로그인 1회 약관 동의 모달 (user_metadata.terms_agreed 미설정 시 강제 노출) */}
      <TermsAgreementModal />
      <div className="topbar-t">
        <div className="topbar-left"><Link to="/" style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'18px',textDecoration:'none'}}>⌂</Link><div className="topbar-title">오<span>운</span></div></div>
        <button className="settings-btn" onClick={()=>setSettingsModal(true)}>⚙ AI 설정</button>
      </div>

      {/* ── 하단 고정 네비게이션 ── */}
      {MAIN_PAGES.includes(activePage) && (
        <div style={{
          position:'fixed', bottom:0, left:0, right:0, zIndex:200,
          background:'#fff',
          borderTop:'1px solid #E5E7EB',
          display:'flex',
          boxShadow:'0 -2px 16px rgba(0,0,0,0.07)',
          paddingBottom:'env(safe-area-inset-bottom)',
        }}>
          {['members','history','schedule','revenue','settings','support'].map(t => {
            const TAB_GATE = { history:'history_tab', schedule:'schedule_tab', revenue:'revenue_tab' }
            const locked = TAB_GATE[t] && !canUse(TAB_GATE[t])
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => showTabFn(t)}
                style={{
                  flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center',
                  gap:'3px', padding:'9px 2px 7px',
                  border:'none', background:'none',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  fontFamily:'inherit',
                  transition:'color 0.15s', minHeight:'54px',
                  position:'relative',
                  opacity: locked ? 0.5 : 1,
                }}
              >
                {active && (
                  <span style={{
                    position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
                    width:'28px', height:'2.5px', borderRadius:'0 0 3px 3px',
                    background:'#10B981',
                  }}/>
                )}
                {TAB_ICONS[t](active)}
                <span style={{
                  fontSize:'9.5px', fontWeight: active ? 700 : 400, lineHeight:1,
                  color: active ? '#10B981' : '#9CA3AF',
                }}>
                  {TAB_LABELS[t]}
                  {locked && <span style={{marginLeft:'2px'}}>🔒</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* MEMBERS LIST */}
      {activePage === 'page-members' && (
        <div className="page-t">
          <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={()=>{
              const plan = isPaid ? 'paid' : 'free'
              const limit = featureGates[plan]?.member_limit ?? 9999
              if (members.length >= limit) { showToast(`🔒 현재 플랜에서는 최대 ${limit}명까지 등록 가능해요. 플랜 업그레이드 후 이용하세요.`); return }
              setAddForm({name:'',kakao_phone:'',phone:'',birthdate:'',address:'',email:'',special_notes:'',purpose:'체형교정',visit_source:'',visit_source_memo:'',total:'',done:'0',price:'',memo:''});setActivePage('page-add-member')
            }}>+ 회원 추가</button>
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
              // members.suspended 컬럼 부재 — 잔여 세션 기반으로만 분기
              const r = m.total_sessions - m.done_sessions
              if (r <= 0) return 'expired'
              if (r <= 3) return 'expiring'
              return 'active'
            }
            const STATUS_LABEL = { active:'활성', expiring:'만료예정', expired:'만료' }
            const STATUS_COLOR = { active:'#4ade80', expiring:'#f97316', expired:'#ef4444' }
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
              if (memberFilter === '이탈위험') {
                const rs = riskMap[m.id]
                return rs && (rs.riskLevel === 'risk' || rs.riskLevel === 'critical')
              }
              return true
            }).sort((a,b) => {
              if (memberSort === 'name')   return a.name.localeCompare(b.name, 'ko')
              if (memberSort === 'expire') return (a.total_sessions-a.done_sessions) - (b.total_sessions-b.done_sessions)
              if (memberSort === 'risk')   return (riskMap[b.id]?.riskScore ?? 0) - (riskMap[a.id]?.riskScore ?? 0)
              // 기본(created) 정렬: 이탈 위험도 critical/risk를 최상단 고정 후 등록일 내림차순
              const RISK_ORDER = { critical:0, risk:1, watch:2, safe:3 }
              const aOrd = RISK_ORDER[riskMap[a.id]?.riskLevel ?? 'safe'] ?? 3
              const bOrd = RISK_ORDER[riskMap[b.id]?.riskLevel ?? 'safe'] ?? 3
              if (aOrd !== bOrd) return aOrd - bOrd
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
                  {canUse('risk_analysis') && Object.keys(riskMap).length > 0 && (() => {
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
                  const status     = getStatus(m)
                  const remain     = m.total_sessions - m.done_sessions
                  const pct        = m.total_sessions > 0 ? Math.round((m.done_sessions / m.total_sessions) * 100) : 0
                  const low        = remain <= 3
                  const riskResult = riskMap[m.id]
                  const riskLv     = riskResult ? getRiskLevel(riskResult.riskScore) : null
                  // 좌측 컬러바 색상: critical→빨강, risk→주황, watch→노랑, safe/없음→투명
                  const barColor   = riskLv && riskResult.riskLevel !== 'safe' ? riskLv.color : 'transparent'
                  const isAttendedToday = todayAttendSet.has(m.id)
                  return (
                    <div
                      key={m.id}
                      onClick={() => openRecord(m.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderLeft: `3.5px solid ${barColor}`,
                        borderRadius: '12px',
                        padding: '13px 14px 10px',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                        boxShadow: riskResult?.riskLevel === 'critical' ? `0 0 0 1px ${riskLv.color}28` : 'none',
                      }}
                    >
                      {/* 상단: 아바타 + 이름 + 뱃지 | 잔여 세션 */}
                      <div style={{display:'flex',alignItems:'center',gap:'11px'}}>
                        {/* 아바타 */}
                        <div style={{
                          width:'40px',height:'40px',borderRadius:'50%',flexShrink:0,
                          background:'var(--accent)',color:'#0f0f0f',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontWeight:800,fontSize:'15px',
                        }}>
                          {m.name[0]}
                        </div>
                        {/* 이름 + 뱃지 */}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'15px',fontWeight:700,color:'var(--text)',lineHeight:1.2,marginBottom:'4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                            {m.name}
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:'4px',flexWrap:'wrap'}}>
                            <span style={{fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'4px',background:STATUS_COLOR[status]+'22',color:STATUS_COLOR[status],border:`1px solid ${STATUS_COLOR[status]}44`,flexShrink:0}}>
                              {STATUS_LABEL[status]}
                            </span>
                            {riskLv && riskResult.riskLevel !== 'safe' && (
                              <span style={{fontSize:'10px',fontWeight:700,padding:'1px 6px',borderRadius:'4px',background:riskLv.bg,color:riskLv.color,border:`1px solid ${riskLv.color}44`,flexShrink:0}}>
                                {riskLv.emoji} {riskLv.label}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* 잔여 세션 수 */}
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:'22px',fontWeight:800,lineHeight:1,color: low ? '#ef4444' : 'var(--text)'}}>
                            {remain}
                          </div>
                          <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>
                            / {m.total_sessions}회
                          </div>
                        </div>
                      </div>

                      {/* 세션 프로그레스 바 */}
                      <div className="session-bar-bg" style={{marginTop:'10px',marginBottom:'0'}}>
                        <div className={`session-bar-fill${low?' low':''}`} style={{width:pct+'%'}} />
                      </div>

                      {/* 하단: 퀵 액션 */}
                      <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:'6px',marginTop:'10px'}}>
                        <button
                          onClick={e => quickToggleToday(e, m.id)}
                          style={{
                            display:'flex',alignItems:'center',gap:'4px',
                            padding:'5px 10px',borderRadius:'8px',border:'1px solid',
                            fontSize:'11px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                            background: isAttendedToday ? 'rgba(74,222,128,0.12)' : 'var(--surface2)',
                            color:      isAttendedToday ? '#4ade80'               : 'var(--text-muted)',
                            borderColor:isAttendedToday ? 'rgba(74,222,128,0.4)'  : 'var(--border)',
                            transition:'all 0.15s',
                          }}
                        >
                          📅 {isAttendedToday ? '출석완료' : '출석'}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openRecord(m.id) }}
                          style={{
                            display:'flex',alignItems:'center',gap:'4px',
                            padding:'5px 10px',borderRadius:'8px',
                            border:'1px solid rgba(59,130,246,0.35)',
                            background:'rgba(59,130,246,0.10)',
                            color:'#60a5fa',
                            fontSize:'11px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                          }}
                        >
                          📝 일지
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{padding:'5px 8px',fontSize:'13px'}}
                          onClick={e => { e.stopPropagation(); openEditMember(m) }}
                        >
                          ✏️
                        </button>
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
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'14px'}}>
            <div style={{flex:1,position:'relative'}}>
              <span style={{position:'absolute',left:'11px',top:'50%',transform:'translateY(-50%)',fontSize:'15px',pointerEvents:'none'}}>📅</span>
              <input
                type="date"
                value={historyDateFilter}
                onChange={e=>{
                  const v = e.target.value
                  setHistoryDateFilter(v)
                  loadHistoryFiltered(v)
                }}
                style={{width:'100%',padding:'9px 36px 9px 36px',borderRadius:'10px',
                  border:'1px solid '+(historyDateFilter?'var(--accent)':'var(--border)'),
                  background: historyDateFilter?'rgba(200,241,53,0.06)':'var(--surface)',
                  color: historyDateFilter?'var(--accent)':'var(--text-muted)',
                  fontSize:'13px',fontFamily:'inherit',boxSizing:'border-box',cursor:'pointer'}}
              />
              {historyDateFilter && (
                <button
                  onClick={()=>{ setHistoryDateFilter(''); setHistoryFiltered(null) }}
                  style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',
                    background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'17px',lineHeight:1,padding:0}}>
                  ×
                </button>
              )}
            </div>
            {historyDateFilter && historyFiltered !== null && (
              <div style={{fontSize:'11px',color:'var(--accent)',whiteSpace:'nowrap',fontWeight:600}}>
                {historyFiltered.length}건
              </div>
            )}
          </div>

          {/* 타임라인 피드 */}
          {(() => {
            const displayList = historyFiltered !== null ? historyFiltered : logs

            // 빈 상태
            if (!historyLoading && !displayList.length) {
              if (historyDateFilter) return (
                <div className="empty">
                  <div style={{fontSize:'32px',marginBottom:'10px'}}>🗓</div>
                  <p style={{color:'var(--text-muted)'}}>
                    {new Date(historyDateFilter+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric'})}에 발송된 일지가 없어요
                  </p>
                </div>
              )
              return <div className="empty"><div style={{fontSize:'36px',marginBottom:'12px'}}>📋</div><p>발송한 수업일지가 없어요.</p></div>
            }

            return (
              <div style={{
                background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:'14px',overflow:'hidden',boxShadow:'var(--shadow-sm)',
              }}>
                {displayList.map((l, idx) => {
                  const d   = new Date(l.created_at)
                  const pad = n => String(n).padStart(2,'0')
                  const dateTimeStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
                  const memberName = l.members?.name || memberById.get(l.member_id)?.name || '(알 수 없음)'
                  const initial    = memberName[0] || '?'

                  // 읽음 배지 텍스트
                  let readBadge
                  if (l.read_at) {
                    const rd  = new Date(l.read_at)
                    const rStr = `${pad(rd.getMonth()+1)}/${pad(rd.getDate())} ${pad(rd.getHours())}:${pad(rd.getMinutes())}`
                    readBadge = (
                      <span style={{
                        fontSize:'10px',fontWeight:600,whiteSpace:'nowrap',
                        color:'#22c55e',background:'rgba(34,197,94,0.1)',
                        border:'1px solid rgba(34,197,94,0.25)',
                        padding:'2px 7px',borderRadius:'6px',
                      }}>✔ 읽음 {rStr}</span>
                    )
                  } else {
                    readBadge = (
                      <span style={{
                        fontSize:'10px',fontWeight:500,whiteSpace:'nowrap',
                        color:'#9ca3af',background:'var(--surface2)',
                        border:'1px solid var(--border)',
                        padding:'2px 7px',borderRadius:'6px',
                      }}>안 읽음</span>
                    )
                  }

                  return (
                    <div key={l.id} style={{
                      display:'flex',alignItems:'center',gap:'12px',
                      padding:'13px 14px',
                      borderBottom: idx < displayList.length-1 ? '1px solid var(--border)' : 'none',
                    }}>
                      {/* 아바타 */}
                      <div style={{
                        width:'36px',height:'36px',borderRadius:'50%',
                        background:'var(--accent)',color:'#111',
                        display:'flex',alignItems:'center',justifyContent:'center',
                        fontWeight:800,fontSize:'14px',flexShrink:0,
                      }}>{initial}</div>

                      {/* 본문 */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'3px'}}>
                          <span style={{fontSize:'13px',fontWeight:700,color:'var(--text)'}}>{memberName}</span>
                          {readBadge}
                        </div>
                        <div style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace"}}>
                          {dateTimeStr}
                        </div>
                      </div>

                      {/* 링크 복사 버튼 */}
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          const url = window.location.origin + '/report?id=' + (l.report_id || l.id)
                          try {
                            await navigator.clipboard.writeText(url)
                            showToast('🔗 링크가 복사되었습니다')
                          } catch {
                            showToast('복사에 실패했어요. 브라우저 설정을 확인해 주세요.')
                          }
                        }}
                        style={{
                          flexShrink:0,background:'none',
                          border:'1.5px solid var(--border)',
                          borderRadius:'8px',padding:'5px 10px',
                          fontSize:'11px',color:'var(--text-muted)',
                          cursor:'pointer',fontFamily:'inherit',
                          transition:'all 0.15s',whiteSpace:'nowrap',
                        }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor='#60a5fa'; e.currentTarget.style.color='#60a5fa' }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)' }}
                      >🔗 링크 복사</button>
                    </div>
                  )
                })}

                {/* 더보기 버튼 (날짜 필터 없을 때만) */}
                {!historyDateFilter && (
                  historyHasMore ? (
                    <div style={{padding:'12px 14px',borderTop:'1px solid var(--border)',textAlign:'center'}}>
                      <button
                        onClick={loadMoreHistory}
                        disabled={historyLoading}
                        style={{
                          background:'none',border:'1.5px solid var(--border)',
                          borderRadius:'9px',padding:'8px 20px',
                          fontSize:'12px',color:historyLoading?'var(--text-dim)':'var(--text-muted)',
                          cursor:historyLoading?'default':'pointer',fontFamily:'inherit',
                          transition:'all 0.15s',
                        }}>
                        {historyLoading ? '불러오는 중…' : '⬇ 더보기'}
                      </button>
                    </div>
                  ) : displayList.length > 0 ? (
                    <div style={{padding:'10px',textAlign:'center',fontSize:'11px',color:'var(--text-dim)',borderTop:'1px solid var(--border)'}}>
                      모든 발송 기록을 불러왔어요
                    </div>
                  ) : null
                )}
              </div>
            )
          })()}

          {/* 초기 로딩 스켈레톤 */}
          {historyLoading && !logs.length && !historyFiltered && (
            <div style={{display:'flex',flexDirection:'column',gap:'8px',marginTop:'4px'}}>
              {[1,2,3].map(i=>(
                <div key={i} style={{
                  height:'62px',borderRadius:'14px',
                  background:'var(--surface2)',border:'1px solid var(--border)',
                  animation:'pulse 1.4s ease-in-out infinite',opacity:0.6,
                }}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SCHEDULE */}
      {activePage === 'page-schedule' && (
        <div className="page-t">
          {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
            <div style={{
              display:'flex', alignItems:'flex-start', gap:'10px',
              background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.4)',
              borderRadius:'10px', padding:'12px 14px', marginBottom:'12px',
            }}>
              <span style={{fontSize:'18px',flexShrink:0}}>⚠️</span>
              <div style={{fontSize:'12px',color:'#fbbf24',lineHeight:1.65}}>
                브라우저 알림 권한이 {Notification.permission === 'denied' ? '차단' : '미허용'}되어 있어 일정 푸시 알림을 받을 수 없습니다.
                기기 설정에서 알림 권한을 허용해 주세요.
              </div>
            </div>
          )}
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
          {!canUse('push_notif') && (
            <div style={{background:'rgba(255,255,255,0.03)',border:'1px dashed rgba(255,255,255,0.12)',borderRadius:'10px',padding:'12px 14px',marginBottom:'12px',display:'flex',alignItems:'center',gap:'10px',opacity:0.7}}>
              <span style={{fontSize:'18px'}}>🔒</span>
              <div>
                <div style={{fontSize:'13px',fontWeight:600}}>Web Push 알림</div>
                <div style={{fontSize:'11px',color:'var(--text-dim)'}}>유료 플랜에서 이용 가능해요.</div>
              </div>
            </div>
          )}
          {canUse('push_notif') && <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px 14px',marginBottom:'12px'}}>
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
          </div>}

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
                <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>{trainer?.email || '오운 이용 중'}</div>
              </div>
              {isPaid ? (
                <div style={{fontSize:'11px',padding:'4px 10px',borderRadius:'20px',
                  background:'linear-gradient(135deg,rgba(167,139,250,0.2),rgba(251,191,36,0.18))',
                  color:'#fbbf24',border:'1px solid rgba(251,191,36,0.4)',fontWeight:700,flexShrink:0}}>
                  👑 Premium
                </div>
              ) : (
                <div style={{fontSize:'11px',padding:'4px 10px',borderRadius:'20px',
                  background:'var(--surface2)',color:'var(--text-muted)',
                  border:'1px solid var(--border)',fontWeight:600,flexShrink:0}}>
                  Free
                </div>
              )}
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

          {/* ── 3열 상세 플랜 카드 (관리자 포털과 동기화된 Free / Pro / Premium) ── */}
          {planGuideVisible === true && (() => {
            const fallbackPlans = [
              { id: 'free',    name: 'Free',    price: '무료',         color: '#9ca3af', highlight: false, current: !isPaid, badge: null,        enabled: true, features: ['회원 5명', 'AI 일지 월 20회', '식단 기록', '기본 통계'] },
              { id: 'pro',     name: 'Pro',     price: '₩9,900/월',   color: '#60a5fa', highlight: false, current: false,  badge: '출시 예정',   enabled: true, features: ['회원 무제한', 'AI 일지 무제한', '주간 리포트 AI', '매출 분석'] },
              { id: 'premium', name: 'Premium', price: '₩19,900/월',  color: '#c8f135', highlight: true,  current: isPaid, badge: '출시 예정',   enabled: true, features: ['Pro 전체 포함', '루틴 마켓 무제한', '카카오 자동 발송', '우선 지원'] },
            ]
            const sourcePlans = (Array.isArray(plansList) && plansList.length > 0) ? plansList : fallbackPlans
            const visiblePlans = sourcePlans.filter(p => p.enabled !== false)
            return (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  💎 플랜 안내
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '10px',
                }}>
                  {visiblePlans.map(plan => {
                    const accent = plan.color || '#9ca3af'
                    return (
                      <div key={plan.id} style={{
                        position: 'relative',
                        border: `1px solid ${plan.highlight ? 'rgba(200,241,53,0.45)' : 'var(--border)'}`,
                        background: plan.highlight ? 'rgba(200,241,53,0.05)' : 'var(--surface)',
                        borderRadius: '14px',
                        padding: '18px 14px 14px',
                        boxSizing: 'border-box',
                      }}>
                        {plan.current && (
                          <span style={{
                            position: 'absolute', top: '-10px', left: '12px',
                            background: '#9ca3af', color: '#0f0f0f',
                            fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '8px',
                          }}>현재 플랜</span>
                        )}
                        {plan.badge && !plan.current && (
                          <span style={{
                            position: 'absolute', top: '-10px', left: '12px',
                            background: plan.highlight ? 'var(--accent)' : '#60a5fa', color: '#0f0f0f',
                            fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '8px',
                          }}>{plan.badge}</span>
                        )}
                        <div style={{ fontWeight: 800, color: accent, fontSize: '15px', marginBottom: '4px' }}>{plan.name}</div>
                        <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '10px', color: 'var(--text)' }}>{plan.price}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {(plan.features || []).map((f, i) => (
                            <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>· {f}</div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 프리미엄 플랜 이용문의 — 내부 문의 탭으로 이동 */}
                <button
                  type="button"
                  onClick={() => { setTab('support'); setActivePage('page-support') }}
                  style={{
                    width: '100%', marginTop: '12px',
                    padding: '12px',
                    borderRadius: '10px', border: 'none',
                    background: 'linear-gradient(135deg,#a78bfa 0%,#818cf8 100%)',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                    letterSpacing: '-0.2px',
                    boxShadow: '0 2px 12px rgba(167,139,250,0.35)',
                  }}
                >
                  ✨ 프리미엄 플랜 이용문의
                </button>
              </div>
            )
          })()}

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

          {/* ── 센터 연동 ── */}
          <div style={{margin:'28px 0 0',height:'1px',background:'var(--border)'}} />
          <div style={{marginTop:'24px',marginBottom:'8px',fontSize:'12px',fontWeight:700,color:'var(--text-muted)',letterSpacing:'0.08em'}}>
            🏢 센터 연동
          </div>

          {/* 상태 A: 이미 승인된 센터 소속 */}
          {trainer?.gym_id && trainer?.approval_status !== 'pending' && (
            <div style={{background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.2)',
              borderRadius:'12px',padding:'14px 16px',display:'flex',alignItems:'center',gap:'10px'}}>
              <span style={{fontSize:'20px'}}>✅</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'#4ade80'}}>
                  {gymName ? gymName : '센터 소속 확인됨'}
                </div>
                <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'2px'}}>
                  {gymName ? '소속 센터가 확인됐어요' : '센터 정보를 불러오는 중...'}
                </div>
              </div>
            </div>
          )}

          {/* 상태 B: 승인 대기 중 */}
          {trainer?.gym_id && trainer?.approval_status === 'pending' && (
            <div style={{background:'rgba(250,204,21,0.06)',border:'1px solid rgba(250,204,21,0.25)',
              borderRadius:'12px',padding:'14px 16px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
                <span style={{fontSize:'20px'}}>⏳</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'#facc15'}}>승인 대기 중</div>
                  <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'2px'}}>
                    {gymName ? `${gymName} · ` : ''}센터 대표님의 승인을 기다리고 있어요
                  </div>
                </div>
              </div>
              <button onClick={cancelJoinRequest}
                style={{width:'100%',padding:'8px',borderRadius:'8px',border:'1px solid rgba(239,68,68,0.3)',
                  background:'rgba(239,68,68,0.06)',color:'#f87171',fontSize:'12px',fontWeight:600,
                  cursor:'pointer',fontFamily:'inherit'}}>
                요청 취소
              </button>
            </div>
          )}

          {/* 상태 C: 센터 미소속 → 검색 + 요청 */}
          {!trainer?.gym_id && (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px 16px'}}>
              <div style={{fontSize:'12px',color:'var(--text-dim)',marginBottom:'12px',lineHeight:1.6}}>
                소속 센터가 없어요. 센터를 검색해서 가입 요청을 보내세요.
              </div>
              <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
                <input
                  value={gymSearchQuery}
                  onChange={e => setGymSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchGyms()}
                  placeholder="센터 이름 검색..."
                  style={{flex:1,padding:'9px 12px',borderRadius:'8px',border:'1px solid var(--border)',
                    background:'var(--surface2)',color:'var(--text)',fontSize:'13px',fontFamily:'inherit',outline:'none'}}
                />
                <button onClick={searchGyms} disabled={gymSearchLoading}
                  style={{padding:'9px 14px',borderRadius:'8px',border:'none',
                    background:'var(--accent)',color:'#0f0f0f',fontSize:'12px',fontWeight:700,
                    cursor:'pointer',fontFamily:'inherit',flexShrink:0,
                    opacity:gymSearchLoading?0.6:1}}>
                  {gymSearchLoading ? '…' : '검색'}
                </button>
              </div>

              {/* 검색 결과 */}
              {gymSearchResults.length > 0 && (
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {gymSearchResults.map(g => (
                    <div key={g.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                      padding:'10px 12px',borderRadius:'8px',
                      background:'var(--surface2)',border:'1px solid var(--border)'}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>{g.name}</div>
                        {g.address && <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'1px',
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.address}</div>}
                      </div>
                      <button
                        onClick={() => submitJoinRequest(g)}
                        disabled={joinLoading}
                        style={{marginLeft:'10px',flexShrink:0,padding:'6px 12px',borderRadius:'7px',border:'none',
                          background:'var(--accent)',color:'#0f0f0f',fontSize:'11px',fontWeight:700,
                          cursor:'pointer',fontFamily:'inherit',opacity:joinLoading?0.6:1}}>
                        요청
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {gymSearchResults.length === 0 && gymSearchQuery && !gymSearchLoading && (
                <div style={{textAlign:'center',padding:'12px',fontSize:'12px',color:'var(--text-dim)'}}>
                  검색 결과가 없어요
                </div>
              )}
            </div>
          )}

          {/* ── Danger Zone ── */}
          <div style={{marginTop:'40px'}}>
            {/* 구분선 */}
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
              <div style={{flex:1,height:'1px',background:'rgba(239,68,68,0.2)'}} />
              <span style={{fontSize:'10px',fontWeight:700,color:'#f87171',letterSpacing:'0.10em',whiteSpace:'nowrap'}}>
                DANGER ZONE
              </span>
              <div style={{flex:1,height:'1px',background:'rgba(239,68,68,0.2)'}} />
            </div>
            <div style={{background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.18)',borderRadius:'14px',padding:'14px 16px'}}>
              <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'12px',lineHeight:1.6}}>
                아래 버튼은 계정에 영향을 줍니다. 신중하게 진행해 주세요.
              </div>
              <button
                onClick={async () => {
                  if (!window.confirm('정말 로그아웃 하시겠습니까?')) return
                  await supabase.auth.signOut()
                  setAuthUser(null); setTrainer(null)
                  setMembers([]); setLogs([])
                  setScreen('landing')
                }}
                style={{
                  width:'100%',padding:'13px',borderRadius:'10px',
                  border:'1px solid rgba(239,68,68,0.35)',
                  background:'rgba(239,68,68,0.07)',
                  color:'#ef4444',fontSize:'14px',fontWeight:700,
                  cursor:'pointer',fontFamily:'inherit',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.13)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(239,68,68,0.07)'}
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ 1:1 문의 탭 — 카카오 채널 외부 우회 ══════════════════ */}
      {activePage === 'page-support' && (
        <div className="page-t" style={{paddingBottom:'40px'}}>
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', minHeight:'420px',
            padding:'40px 20px', textAlign:'center',
          }}>
            <div style={{ fontSize:'44px', marginBottom:'14px', lineHeight:1 }}>💬</div>
            <div style={{ fontSize:'18px', fontWeight:800, color:'var(--text)', letterSpacing:'-0.4px', marginBottom:'8px' }}>
              1:1 문의는 카카오 채널로 안내드려요
            </div>
            <div style={{ fontSize:'13px', color:'var(--text-dim)', lineHeight:1.7, marginBottom:'24px', maxWidth:'360px' }}>
              빠르고 간편한 응대를 위해 외부 메신저 채널로 연결해 드립니다.
              <br/>채널 이용 시 카카오 자체의 개인정보 처리방침이 적용됩니다.
            </div>

            <button
              type="button"
              onClick={() => {
                // 폴백: 오운 카카오톡 채널 (@ownapp). admin 의 urgent_inquiry_url 설정이 우선.
                const url = (urgentInquiryUrl && urgentInquiryUrl.trim()) || 'https://pf.kakao.com/_ownapp'
                try { window.open(url, '_blank', 'noopener,noreferrer') }
                catch { showToast('1:1 문의 채널을 여는 데 실패했어요') }
              }}
              style={{
                display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'10px',
                width:'100%', maxWidth:'340px',
                padding:'14px 20px', borderRadius:'12px',
                border:'1px solid #FEE500', background:'#FEE500', color:'#191919',
                fontSize:'14px', fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                boxShadow:'0 4px 14px rgba(254,229,0,0.45)',
              }}
            >
              💛 1:1 문의하기 (카카오 채널)
            </button>

            {/* 안내 텍스트 */}
            <div style={{
              marginTop:'28px',
              width:'100%', maxWidth:'420px',
              background:'var(--surface)',
              border:'1px solid var(--border)',
              borderRadius:'12px',
              padding:'16px 18px',
              textAlign:'left',
            }}>
              <div style={{ fontSize:'12px', fontWeight:800, color:'var(--text)', marginBottom:'10px' }}>
                💡 다음과 같은 사항들을 문의하실 수 있습니다:
              </div>
              <ul style={{ margin:0, paddingLeft:'18px', fontSize:'12px', color:'var(--text-muted)', lineHeight:1.9 }}>
                <li>일반 문의 및 서비스 이용 방법</li>
                <li>결제, 구독 변경 및 해지</li>
                <li>오류 신고 및 버그 제보</li>
                <li>신규 기능 제안 및 피드백</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ADD MEMBER */}
      {activePage === 'page-add-member' && (
        <div className="page-t">
          <div className="record-header"><button className="back-btn" onClick={()=>{setActivePage('page-members');setTab('members')}}>←</button><div style={{fontSize:'15px',fontWeight:700}}>회원 추가</div></div>
          <div className="section-label" style={{marginTop:0}}>기본 정보</div>
          <div className="form-group"><label>이름 *</label><input type="text" value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="홍길동" /></div>
          <div className="form-group"><label>휴대폰 번호</label><input type="text" value={addForm.kakao_phone} onChange={e=>setAddForm({...addForm,kakao_phone:e.target.value})} placeholder="010-1234-5678" /></div>
          <div className="form-group"><label>전화번호 뒷 4자리 (회원 포털 로그인용) *</label><input type="text" value={addForm.phone} onChange={e=>setAddForm({...addForm,phone:e.target.value})} placeholder="1234" maxLength={4} /></div>
          <div className="form-group"><label>생년월일</label><input type="date" value={addForm.birthdate} onChange={e=>setAddForm({...addForm,birthdate:e.target.value})} /></div>
          <div className="form-group"><label>주소</label><input type="text" value={addForm.address} onChange={e=>setAddForm({...addForm,address:e.target.value})} placeholder="서울시 강남구..." /></div>
          <div className="form-group">
            <label style={{display:'flex',alignItems:'center',gap:'6px'}}>
              이메일 <span style={{color:'#ef4444',fontSize:'12px',fontWeight:700}}>필수</span>
              <button type="button" onClick={()=>setShowEmailGuide(true)}
                style={{width:'18px',height:'18px',borderRadius:'50%',border:'1px solid #9CA3AF',
                  background:'none',color:'#9CA3AF',fontSize:'11px',fontWeight:700,
                  cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                  flexShrink:0,fontFamily:'inherit',lineHeight:1}}>?</button>
            </label>
            <input type="email" value={addForm.email} onChange={e=>setAddForm({...addForm,email:e.target.value})} placeholder="example@gmail.com" />
          </div>
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
              {/* members.suspended 컬럼 부재 — 정지 상태 표시 라벨 제거, 정지 등록 진입점만 유지 */}
              <button className="btn btn-sm" style={{fontSize:'12px',whiteSpace:'nowrap',background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text-muted)'}}
                onClick={()=>{setHoldForm({startDate:'',endDate:'',productId:'',reason:'',photoFile:null,photoPreview:''});loadHolds(currentMemberId);setHoldModal(true)}}>
                ⏸ 정지
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
            {[
              { key:'write',      label:'📝 수업일지' },
              { key:'attendance', label:'📅 출석부'   },
              { key:'health',     label:'⚖️ 건강기록' },
              { key:'holds',      label:'⏸ 정지기록' },
              { key:'personal',   label:'🏃 개인운동' },
              { key:'insight',    label:'🤖 AI 분석'  },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`rtab-btn${(rtab||'write') === key ? ' active' : ''}`}
                onClick={() => {
                  safeSetRtab(key)
                  if (key === 'holds') loadHolds(currentMemberId)
                }}
              >
                {label}
              </button>
            ))}
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

          {/* write 탭 — rtab가 null/undefined/알 수 없는 값이면 여기가 fallback */}
          {(rtab === 'write' || !['write','attendance','health','holds','personal','insight'].includes(rtab ?? '')) && (
            <div>
              <div className="section-label">1단계 — 수업 브리핑 입력</div>
              <div className="card">

                {/* ── AI 음성 마이크 버튼 (Web Speech API) ── */}
                {speechSupported && (
                  <button
                    onClick={toggleSpeech}
                    style={{
                      width: '100%',
                      marginBottom: '14px',
                      padding: '15px 16px',
                      borderRadius: '12px',
                      border: isListening
                        ? '1.5px solid rgba(239,68,68,0.55)'
                        : '1.5px solid rgba(59,130,246,0.45)',
                      background: isListening
                        ? 'rgba(239,68,68,0.10)'
                        : 'rgba(59,130,246,0.12)',
                      color: isListening ? '#f87171' : '#60a5fa',
                      fontSize: '14px',
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      transition: 'all 0.2s',
                      minHeight: '52px',
                    }}
                  >
                    <span style={{
                      fontSize: '20px',
                      display: 'inline-block',
                      animation: isListening ? 'pulse 1s ease-in-out infinite' : 'none',
                    }}>
                      🤖
                    </span>
                    <span>
                      {isListening ? 'AI가 듣고 있어요 — 탭하면 중지' : 'AI 음성으로 일지 쓰기'}
                    </span>
                    {isListening && (
                      <span style={{
                        display: 'inline-flex',
                        gap: '3px',
                        alignItems: 'center',
                        marginLeft: '2px',
                      }}>
                        {[0, 0.2, 0.4].map((delay, i) => (
                          <span key={i} style={{
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: '#f87171',
                            animation: `pulse 1s ease-in-out ${delay}s infinite`,
                            display: 'inline-block',
                          }} />
                        ))}
                      </span>
                    )}
                  </button>
                )}

                {/* ── V3 미디어 첨부 버튼 ── */}
                <button
                  onClick={() => !mediaProcessing && mediaFiles.length < 5 && mediaInputRef.current?.click()}
                  disabled={mediaProcessing || mediaFiles.length >= 5}
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '11px 16px',
                    borderRadius: '12px',
                    border: '1.5px dashed var(--border)',
                    background: 'transparent',
                    color: mediaFiles.length >= 5 ? 'var(--text-dim)' : 'var(--text-muted)',
                    fontSize: '13px',
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    cursor: mediaProcessing || mediaFiles.length >= 5 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: mediaFiles.length >= 5 ? 0.45 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  <span>🖼️</span>
                  <span>
                    {mediaFiles.length >= 5
                      ? '미디어 최대 5개 첨부됨'
                      : `사진·영상 첨부 (JPG · PNG · MP4 · MOV 등, 최대 5개)${mediaFiles.length ? ` · ${mediaFiles.length}개 선택됨` : ''}`}
                  </span>
                </button>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  style={{display:'none'}}
                  onChange={handleMediaSelect}
                />

                {/* 변환 중 프로그레스 */}
                {mediaProcessing && (
                  <div style={{
                    display:'flex',alignItems:'center',gap:'10px',
                    padding:'12px 14px',marginBottom:'10px',
                    background:'var(--surface2)',borderRadius:'10px',
                    border:'1px solid var(--border)',
                  }}>
                    <div style={{
                      width:'18px',height:'18px',flexShrink:0,
                      border:'2px solid var(--border)',borderTop:'2px solid var(--accent)',
                      borderRadius:'50%',animation:'spin 0.9s linear infinite',
                    }} />
                    <span style={{fontSize:'12px',color:'var(--text-muted)',lineHeight:1.5}}>
                      {mediaProgress || '미디어를 앱에 맞게 최적화하고 있습니다 ⏳'}
                    </span>
                  </div>
                )}

                {/* 모바일 STT 최적화 메인 텍스트 입력 */}
                <div style={{marginBottom:'6px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:'12px',fontWeight:600,color:'var(--text-muted)'}}>수업 내용 브리핑</span>
                  {rawInput.trim() && (
                    <button
                      onClick={() => setRawInput('')}
                      style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'12px',padding:'2px 6px',borderRadius:'4px'}}
                    >
                      지우기 ×
                    </button>
                  )}
                </div>
                <textarea
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder={speechSupported
                    ? '위 버튼을 눌러서 음성인식을 사용하면, 분석후 텍스트로 변환됩니다!\n수기로 직접 입력하셔도 됩니다!'
                    : '이 브라우저는 음성인식이 지원되지 않아요.\n수기로 직접 입력하시거나, 스마트폰 자판의 마이크 버튼을 사용해주세요.'}
                  style={{
                    width:'100%',
                    minHeight:'160px',
                    padding:'14px',
                    borderRadius:'10px',
                    border: isListening
                      ? '1.5px solid rgba(239,68,68,0.4)'
                      : '1.5px solid var(--border)',
                    background:'var(--surface2)',
                    color:'var(--text)',
                    fontSize:'14px',
                    lineHeight:'1.65',
                    fontFamily:'inherit',
                    resize:'vertical',
                    boxSizing:'border-box',
                    marginBottom:'8px',
                    transition: 'border-color 0.2s',
                  }}
                />
                <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom: mediaFiles.length ? '10px' : '16px',paddingLeft:'2px'}}>
                  ✦ 수업 후 1분간 핵심만 간단히 말하거나 입력하세요. AI가 전문 일지로 변환해 드려요.
                </div>

                {/* 썸네일 프리뷰 — 가로 스크롤 */}
                {mediaFiles.length > 0 && (
                  <div style={{
                    display:'flex',gap:'10px',
                    overflowX:'auto',
                    paddingBottom:'10px',
                    marginBottom:'6px',
                    WebkitOverflowScrolling:'touch',
                    scrollbarWidth:'none',
                  }}>
                    {mediaFiles.map(f => (
                      <div key={f.id} style={{position:'relative',flexShrink:0}}>
                        {f.isVideo ? (
                          <video
                            src={f.dataUrl}
                            muted playsInline loop
                            style={{
                              width:'96px',height:'96px',
                              objectFit:'cover',borderRadius:'10px',
                              border:'1px solid var(--border)',display:'block',
                            }}
                          />
                        ) : (
                          <img
                            src={f.dataUrl}
                            alt={f.name}
                            style={{
                              width:'96px',height:'96px',
                              objectFit:'cover',
                              borderRadius:'10px',
                              border:'1px solid var(--border)',
                              display:'block',
                            }}
                          />
                        )}
                        {/* 파일 크기 뱃지 */}
                        <div style={{
                          position:'absolute',bottom:'5px',left:'5px',
                          background:'rgba(0,0,0,0.55)',
                          color:'#fff',fontSize:'9px',fontWeight:600,
                          padding:'2px 5px',borderRadius:'4px',
                          backdropFilter:'blur(4px)',
                        }}>
                          {f.isVideo ? '🎬 ' : ''}{f.sizeKB}KB
                        </div>
                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => removeMedia(f.id)}
                          style={{
                            position:'absolute',top:'-6px',right:'-6px',
                            width:'20px',height:'20px',
                            borderRadius:'50%',border:'none',
                            background:'var(--danger, #ef4444)',
                            color:'#fff',fontSize:'12px',lineHeight:'20px',
                            cursor:'pointer',padding:0,
                            display:'flex',alignItems:'center',justifyContent:'center',
                            boxShadow:'0 1px 4px rgba(0,0,0,0.3)',
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── AI 해석 관점 — 칩 버튼 ── */}
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px',marginTop:'6px'}}>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                  <span style={{fontSize:'11px',color:'var(--text-dim)'}}>AI 해석 관점</span>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                </div>
                {/* 칩 버튼 4개 */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'10px'}}>
                  {[
                    { value:'rehab',       label:'🩹 재활·부상 케어',  activeColor:'#f9a8d4', activeBg:'rgba(249,168,212,0.15)', activeBorder:'rgba(249,168,212,0.5)', paid:false },
                    { value:'motivation',  label:'💪 동기부여·심리',   activeColor:'#86efac', activeBg:'rgba(134,239,172,0.15)', activeBorder:'rgba(134,239,172,0.5)', paid:false },
                    { value:'performance', label:'🏆 퍼포먼스·기술',   activeColor:'#fcd34d', activeBg:'rgba(252,211,77,0.15)',  activeBorder:'rgba(252,211,77,0.5)',  paid:true  },
                    { value:'diet',        label:'🥗 다이어트·체성분', activeColor:'#c4b5fd', activeBg:'rgba(196,181,253,0.15)', activeBorder:'rgba(196,181,253,0.5)', paid:true  },
                  ].map(chip => {
                    const isActive = (perspectiveChip || 'rehab') === chip.value
                    const showCrown = chip.paid && !isPaid
                    return (
                      <button
                        key={chip.value}
                        onClick={() => setPerspectiveChip(chip.value)}
                        style={{
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          gap:'4px',
                          padding:'10px 8px',
                          borderRadius:'10px',
                          border: isActive ? `1.5px solid ${chip.activeBorder}` : '1.5px solid var(--border)',
                          background: isActive ? chip.activeBg : 'transparent',
                          color: isActive ? chip.activeColor : 'var(--text-muted)',
                          fontSize:'12px',
                          fontWeight: isActive ? 700 : 400,
                          cursor:'pointer',
                          transition:'all 0.15s',
                          lineHeight:1.3,
                          textAlign:'center',
                          minHeight:'44px',
                        }}
                      >
                        <span>{chip.label}</span>
                        {showCrown && <span style={{fontSize:'11px',marginLeft:'2px'}}>👑</span>}
                      </button>
                    )
                  })}
                </div>
                {/* 추가 지시사항 오버라이드 */}
                <div style={{marginBottom:'16px'}}>
                  <textarea
                    value={extraInstruction || ''}
                    onChange={e => setExtraInstruction(e.target.value)}
                    placeholder="추가 지시사항 (선택) — 예: 왼쪽 무릎 통증 언급해줘"
                    rows={2}
                    style={{resize:'none',fontSize:'12px',color:'var(--text-muted)'}}
                  />
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
                          <span className="ex-set-info">{s.weight ? s.weight+'kg · ' : ''}{s.reps}회{s.feel?' · '+s.feel:''}</span>
                          {s.rir!=='' && s.rir!==undefined && <span className="ex-set-rir">RIR {s.rir}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{width:'100%',padding:'10px',marginBottom:'8px'}} onClick={openAddExercise}>+ 운동 종목 추가</button>
                {/* RIR 가이드 — 아코디언 */}
                <button
                  onClick={() => setShowRirGuide(v => !v)}
                  style={{
                    display:'flex',
                    alignItems:'center',
                    gap:'6px',
                    background:'none',
                    border:'none',
                    padding:'6px 0',
                    cursor:'pointer',
                    color:'var(--text-dim)',
                    fontSize:'11px',
                    marginBottom: showRirGuide ? '8px' : '0',
                  }}
                >
                  <span>ℹ️ RIR 입력 가이드 보기</span>
                  <span style={{fontSize:'10px',transition:'transform 0.2s',display:'inline-block',transform: showRirGuide ? 'rotate(180deg)' : 'rotate(0deg)'}}>▼</span>
                </button>
                {showRirGuide && (
                  <div className="rir-guide">
                    <div className="rir-item rir-2"><div className="rir-badge">2 RIR 추천</div><div className="rir-label">부상위험↑ · 협응성 복합운동</div><div className="rir-moves">벤치프레스 · 스쿼트 · 데드리프트</div></div>
                    <div className="rir-item rir-1"><div className="rir-badge">1 RIR 추천</div><div className="rir-label">큰 근육 · 부상위험 낮은 복합운동</div><div className="rir-moves">렛풀다운 · 시티드로우 · 덤벨체스트프레스 · 런지</div></div>
                    <div className="rir-item rir-0"><div className="rir-badge">0 RIR 추천</div><div className="rir-label">자극 위주 · 단일관절 고립운동</div><div className="rir-moves">사이드레터럴레이즈 · 덤벨컬 · 케이블푸쉬다운 · 레그익스텐션</div></div>
                  </div>
                )}
              </div>
              <div className="section-label">2단계 — AI 수업일지 생성</div>
              {generating && (
                <div style={{
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                  padding:'28px 16px',gap:'14px',
                  background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:'14px',marginBottom:'14px',
                }}>
                  <div style={{
                    width:'36px',height:'36px',
                    border:'3px solid var(--border)',
                    borderTop:'3px solid var(--accent)',
                    borderRadius:'50%',
                    animation:'spin 1s linear infinite',
                  }} />
                  <div style={{fontSize:'13px',fontWeight:500,color:'var(--text-muted)',textAlign:'center',lineHeight:1.6}}>
                    {aiStatus || 'AI가 회원님을 위한 맞춤형 리포트를 작성하고 있습니다...'}
                  </div>
                </div>
              )}
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
                canUse('ai_journal') ? (
                  <button
                    className="btn btn-primary"
                    style={{width:'100%',marginBottom:'10px',
                      opacity: credits <= 0 || ((currentMember?.total_sessions||0)-(currentMember?.done_sessions||0)) <= 0 ? 0.5 : 1,
                      cursor: credits <= 0 || ((currentMember?.total_sessions||0)-(currentMember?.done_sessions||0)) <= 0 ? 'not-allowed' : 'pointer'}}
                    onClick={generateLog}
                  >
                    {credits <= 0
                      ? '🔒 크레딧 부족'
                      : ((currentMember?.total_sessions||0)-(currentMember?.done_sessions||0)) <= 0
                        ? '🔒 잔여 수업 없음'
                        : '✦ AI 수업일지 생성'}
                  </button>
                ) : (
                  <div style={{background:'rgba(255,255,255,0.04)',border:'1px dashed rgba(255,255,255,0.15)',borderRadius:'10px',padding:'18px',textAlign:'center',marginBottom:'10px'}}>
                    <div style={{fontSize:'24px',marginBottom:'6px'}}>🔒</div>
                    <div style={{fontWeight:700,fontSize:'13px',marginBottom:'4px'}}>유료 플랜 전용 기능</div>
                    <div style={{fontSize:'12px',color:'var(--text-dim)'}}>AI 수업일지 생성은 유료 플랜에서 이용 가능해요.</div>
                  </div>
                )
              )}
              {showSend && (
                <div>
                  <div className="section-label">3단계 — 발송</div>
                  <button className="btn btn-primary" style={{width:'100%',marginBottom:'8px'}} onClick={sendKakao}>
                    <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                      📱 회원 앱으로 전송하기
                    </span>
                  </button>
                  <div style={{fontSize:'12px',color:'var(--text-dim)',textAlign:'center',marginBottom:'10px'}}>
                    회원님의 오운 앱으로 수업 리포트가 전달돼요
                  </div>
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
              {canUse('ai_insight') ? (
                <AiInsightPanel member={currentMember} apiKey={centralApiKey} />
              ) : (
                <div style={{background:'rgba(255,255,255,0.04)',border:'1px dashed rgba(255,255,255,0.15)',borderRadius:'10px',padding:'16px',textAlign:'center',marginBottom:'10px'}}>
                  <div style={{fontSize:'20px',marginBottom:'6px'}}>🔒</div>
                  <div style={{fontWeight:700,fontSize:'13px',marginBottom:'4px'}}>유료 플랜 전용</div>
                  <div style={{fontSize:'12px',color:'var(--text-dim)'}}>AI 회원 인사이트는 유료 플랜에서 이용 가능해요.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PAYMENT CANCEL CONFIRM MODAL — 결제 관리 모달 위에 떠야 하므로 zIndex 강제 */}
      <Modal open={!!cancelPaymentTarget} onClose={()=>setCancelPaymentTarget(null)} title="결제 취소 확인" maxWidth="320px" zIndex={2000}>
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
          <button className="btn btn-primary" style={{flex:1,background:'var(--danger)',color:'#fff',opacity:paymentBusy?0.55:1,cursor:paymentBusy?'not-allowed':'pointer'}} disabled={paymentBusy} onClick={()=>{deletePayment(cancelPaymentTarget);setCancelPaymentTarget(null)}}>{paymentBusy ? '처리 중…' : '네'}</button>
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
            <button className="btn btn-primary" style={{width:'100%',opacity:paymentBusy?0.55:1,cursor:paymentBusy?'not-allowed':'pointer'}} disabled={paymentBusy} onClick={addPayment}>{paymentBusy ? '처리 중…' : '상품 등록'}</button>
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
                      <button style={{fontSize:'10px',color:'var(--danger)',background:'none',border:'none',cursor:'pointer',padding:0}} onClick={e=>{e.stopPropagation();setCancelPaymentTarget(p)}}>취소</button>
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
        <div className="form-group"><label>휴대폰 번호</label><input type="text" value={editMemberForm.kakao_phone||''} onChange={e=>setEditMemberForm({...editMemberForm,kakao_phone:e.target.value})} placeholder="010-1234-5678" /></div>
        <div className="form-group"><label>전화번호 뒷 4자리 (회원 포털 로그인용) *</label><input type="text" value={editMemberForm.phone||''} onChange={e=>setEditMemberForm({...editMemberForm,phone:e.target.value})} placeholder="1234" maxLength={4} /></div>
        <div className="form-group"><label>생년월일</label><input type="date" value={editMemberForm.birthdate||''} onChange={e=>setEditMemberForm({...editMemberForm,birthdate:e.target.value})} /></div>
        <div className="form-group"><label>주소</label><input type="text" value={editMemberForm.address||''} onChange={e=>setEditMemberForm({...editMemberForm,address:e.target.value})} placeholder="서울시 강남구..." /></div>
        <div className="form-group">
            <label style={{display:'flex',alignItems:'center',gap:'6px'}}>
              이메일 <span style={{color:'#ef4444',fontSize:'12px',fontWeight:700}}>필수</span>
              <button type="button" onClick={()=>setShowEmailGuide(true)}
                style={{width:'18px',height:'18px',borderRadius:'50%',border:'1px solid #9CA3AF',
                  background:'none',color:'#9CA3AF',fontSize:'11px',fontWeight:700,
                  cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                  flexShrink:0,fontFamily:'inherit',lineHeight:1}}>?</button>
            </label>
            <input type="email" value={editMemberForm.email||''} onChange={e=>setEditMemberForm({...editMemberForm,email:e.target.value})} placeholder="example@gmail.com" />
          </div>
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
          {/* 헤더 — Nested Button(<button> in <button>) HTML 표준 위반 회피를 위해 div + role=button 으로 전환 */}
          <div
            role="button"
            tabIndex={0}
            onClick={()=>setSessionAdvOpen(o=>!o)}
            onKeyDown={e=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSessionAdvOpen(o=>!o) } }}
            style={{
              width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
              background: sessionAdvOpen ? 'var(--surface2)' : 'var(--surface2)',
              border:'1px solid var(--border)',borderRadius: sessionAdvOpen ? '10px 10px 0 0' : '10px',
              padding:'10px 14px',cursor:'pointer',fontFamily:'inherit',transition:'border-radius 0.15s',
              boxSizing:'border-box',userSelect:'none',
            }}
          >
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'12px',fontWeight:700,color:'var(--text)'}}>⚙️ 세션 직접 수정</span>
              <span style={{fontSize:'10px',color:'var(--text-dim)',fontWeight:400}}>앱 이전·오류 수정·증정 세션 전용</span>
              {/* ? 버튼 — 내부 button 그대로 유지 (이제 외부가 div 라 중첩 위반 해소) */}
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
          </div>

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
                    const mem = memberById.get(l.member_id)
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
                    const mem = memberById.get(l.member_id)
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


      {/* ── 영상 구간 편집(Trimmer) 모달 ── */}
      {showVideoTrimmer && trimBlobUrl && (
        <div style={{
          position:'fixed',inset:0,
          background:'rgba(0,0,0,0.88)',
          zIndex:9000,
          display:'flex',alignItems:'center',justifyContent:'center',
          padding:'16px',
        }}>
          <div style={{
            background:'var(--surface)',borderRadius:'18px',
            width:'100%',maxWidth:'480px',
            maxHeight:'92vh',overflowY:'auto',padding:'20px',
          }}>
            {/* 헤더 */}
            <div style={{fontWeight:800,fontSize:'15px',color:'var(--text)',marginBottom:'14px',textAlign:'center'}}>
              ✂️ 영상 구간 편집
            </div>

            {/* 💡 Tip 알림창 */}
            <div style={{
              background:'rgba(59,130,246,0.08)',
              border:'1px solid rgba(59,130,246,0.25)',
              borderRadius:'10px',padding:'12px 14px',marginBottom:'14px',
            }}>
              <div style={{fontSize:'12px',color:'#93c5fd',lineHeight:1.7}}>
                💡 Tip. 핵심만 쏙쏙, 하이라이트 편집! 긴 영상은 회원님이 끝까지 보기 힘들어요. 가장 중요한 자세 교정 구간(최대 60초)만 잘라서 100% 몰입형 피드백을 전달해 보세요!
              </div>
            </div>

            {/* 영상 미리보기 */}
            <video
              ref={trimVideoRef}
              src={trimBlobUrl}
              controls
              playsInline
              style={{
                width:'100%',borderRadius:'10px',
                marginBottom:'16px',maxHeight:'220px',
                objectFit:'contain',background:'#000',
              }}
            />

            {/* 구간 슬라이더 */}
            {trimDuration > 0 && (
              <>
                <div style={{marginBottom:'12px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}>
                    <span style={{fontSize:'11px',color:'var(--text-dim)'}}>시작 지점</span>
                    <span style={{fontSize:'12px',fontWeight:700,color:'var(--text)',fontFamily:"'DM Mono',monospace"}}>{fmtTime(trimStart)}</span>
                  </div>
                  <input
                    type="range" min="0"
                    max={Math.max(0, trimDuration - 1)}
                    step="0.5" value={trimStart}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      setTrimStart(v)
                      if (trimEnd - v < 2) setTrimEnd(Math.min(trimDuration, v + 2))
                      if (trimVideoRef.current) trimVideoRef.current.currentTime = v
                    }}
                    style={{width:'100%',accentColor:'#60a5fa'}}
                  />
                </div>
                <div style={{marginBottom:'16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}>
                    <span style={{fontSize:'11px',color:'var(--text-dim)'}}>종료 지점 (최대 60초)</span>
                    <span style={{fontSize:'12px',fontWeight:700,color:'var(--text)',fontFamily:"'DM Mono',monospace"}}>{fmtTime(trimEnd)}</span>
                  </div>
                  <input
                    type="range"
                    min={trimStart + 1}
                    max={Math.min(trimDuration, trimStart + 60)}
                    step="0.5" value={trimEnd}
                    onChange={e => setTrimEnd(parseFloat(e.target.value))}
                    style={{width:'100%',accentColor:'#60a5fa'}}
                  />
                </div>
                <div style={{
                  textAlign:'center',fontSize:'13px',fontWeight:700,
                  color:'#60a5fa',marginBottom:'16px',
                  background:'rgba(96,165,250,0.08)',borderRadius:'8px',padding:'8px',
                }}>
                  선택 구간: {fmtTime(trimStart)} ~ {fmtTime(trimEnd)}
                  &nbsp;·&nbsp;{Math.round(trimEnd - trimStart)}초
                </div>
              </>
            )}

            {/* 편집 진행 표시 */}
            {isTrimming && (
              <div style={{
                textAlign:'center',fontSize:'12px',color:'var(--text-dim)',
                marginBottom:'12px',padding:'10px',
                background:'var(--surface2)',borderRadius:'8px',
              }}>
                <div style={{
                  display:'inline-block',width:'14px',height:'14px',
                  border:'2px solid var(--border)',borderTopColor:'#60a5fa',
                  borderRadius:'50%',animation:'spin 0.8s linear infinite',
                  marginRight:'8px',verticalAlign:'middle',
                }} />
                {mediaProgress || '영상을 편집하고 있어요...'}
              </div>
            )}

            {/* 버튼 행 */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <button
                onClick={closeVideoTrimmer}
                disabled={isTrimming}
                style={{
                  padding:'12px',borderRadius:'10px',
                  border:'1px solid var(--border)',
                  background:'var(--surface2)',color:'var(--text-muted)',
                  fontSize:'13px',fontWeight:600,cursor:'pointer',
                  fontFamily:'inherit',opacity:isTrimming?0.5:1,
                }}
              >취소</button>
              <button
                onClick={applyVideoTrim}
                disabled={isTrimming}
                style={{
                  padding:'12px',borderRadius:'10px',border:'none',
                  background:'#60a5fa',color:'#fff',
                  fontSize:'13px',fontWeight:700,cursor:'pointer',
                  fontFamily:'inherit',opacity:isTrimming?0.6:1,
                }}
              >{isTrimming ? '편집 중...' : '✂️ 구간 저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 이메일 필수 안내 모달 */}
      <Modal open={showEmailGuide} onClose={()=>setShowEmailGuide(false)} title="이메일을 입력하는 이유">
        <div style={{fontSize:'13px',lineHeight:1.7}}>
          {[
            { icon:'🔗', title:'수업 리포트 직접 전달', desc:'AI가 생성한 수업일지 리포트 링크를 이메일로도 전달할 수 있어요. 카카오톡이 없는 회원도 리포트를 받을 수 있어요.' },
            { icon:'🔐', title:'회원 포털 로그인 연동', desc:'회원이 앱에서 자신의 수업 기록, 진행률, 식단을 직접 확인할 수 있는 회원 포털의 계정으로 사용돼요.' },
            { icon:'📣', title:'공지 및 안내 발송', desc:'휴무일, 일정 변경 등 센터 공지를 이메일로 발송할 때 사용돼요.' },
            { icon:'🛡️', title:'개인정보 보호', desc:'수집된 이메일은 오운 서비스 내에서만 사용되며 외부에 공유되지 않아요.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{display:'flex',gap:'12px',marginBottom:'16px',alignItems:'flex-start'}}>
              <span style={{fontSize:'22px',flexShrink:0}}>{icon}</span>
              <div>
                <div style={{fontWeight:700,color:'#111',marginBottom:'3px'}}>{title}</div>
                <div style={{color:'#6B7280',fontSize:'12px'}}>{desc}</div>
              </div>
            </div>
          ))}
          <div style={{background:'#f9fafb',border:'1px solid #E1E4D9',
            borderRadius:'10px',padding:'12px 14px',fontSize:'12px',color:'#6B7280',marginTop:'4px'}}>
            💡 이메일 입력 시 회원이 더 풍부한 서비스를 받을 수 있어요.
          </div>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:'16px'}} onClick={()=>setShowEmailGuide(false)}>확인</button>
      </Modal>

      {/* EXERCISE MODAL */}
      <Modal open={exModal} onClose={()=>setExModal(false)} title={editingExId?'운동 수정':'운동 종목 추가'} maxWidth="400px">
        <div className="form-group"><label>운동 종목명</label><input type="text" value={exName} onChange={e=>setExName(e.target.value)} placeholder="예: 벤치프레스" /></div>
        <div className="section-label" style={{marginTop:0}}>세트 기록</div>
        {newSets.map((s,i)=>(
          <div key={i} className="ex-set-item">
            <span className="ex-set-num">{i+1}세트</span>
            <span className="ex-set-info">{s.weight ? s.weight+'kg · ' : ''}{s.reps}회{s.feel?' · '+s.feel.substring(0,20):''}</span>
            {s.rir!=='' && s.rir!==undefined && <span className="ex-set-rir">RIR {s.rir}</span>}
            <button className="ex-set-remove" onClick={()=>setNewSets(newSets.filter((_,j)=>j!==i))}>×</button>
          </div>
        ))}
        <div className="add-set-form">
          {/* 무게 + 횟수 — 모바일 숫자 키패드 유도 */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <div>
              <label style={{fontSize:'11px'}}>무게 (kg)</label>
              <input
                type="number" inputMode="decimal" pattern="[0-9]*"
                value={setWeight} onChange={e=>setSetWeight(e.target.value)}
                placeholder="60" min="0"
                style={{minHeight:'44px'}}
              />
            </div>
            <div>
              <label style={{fontSize:'11px'}}>횟수</label>
              <input
                type="number" inputMode="decimal" pattern="[0-9]*"
                value={setReps} onChange={e=>setSetReps(e.target.value)}
                placeholder="10" min="0"
                style={{minHeight:'44px'}}
              />
            </div>
          </div>
          <div style={{marginBottom:'8px'}}>
            <label style={{fontSize:'11px'}}>RIR</label>
            <input type="number" inputMode="decimal" pattern="[0-9]*" value={setRir} onChange={e=>setSetRir(e.target.value)} placeholder="2" min="0" max="10" style={{minHeight:'44px'}} />
          </div>
          <div className="form-group" style={{marginBottom:'8px'}}><label style={{fontSize:'11px'}}>이번 세트 감각 / 느낀점</label><textarea value={setFeel} onChange={e=>setSetFeel(e.target.value)} placeholder="예) 3세트 때 팔꿈치 당김" rows={2} style={{minHeight:'60px'}}></textarea></div>
          <button className="btn btn-ghost btn-sm" onClick={addSet} style={{width:'100%',padding:'8px'}}>+ 세트 추가</button>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:'10px'}} onClick={confirmAddExercise}>운동 저장</button>
      </Modal>

      {/* SCHEDULE MODAL — form state 가 자체적으로 격리된 별도 컴포넌트.
          부모(TrainerApp) 의 다른 state 변경에 영향 없음 → 모달 input 응답성 ↑ */}
      <ScheduleModal
        open={!!editingBlock}
        initialBlock={editingBlock}
        members={members}
        colors={COLORS}
        onClose={closeScheduleModal}
        onSave={handleSaveBlock}
        onDelete={handleDeleteBlock}
        onCancelLesson={handleCancelLesson}
      />
    </div>
  )
}
