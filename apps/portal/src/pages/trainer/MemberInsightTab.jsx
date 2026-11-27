// 트레이너 앱 — 회원 상세 '인사이트' 탭 (TrainerApp 에서 떼어냄). 이 탭에서만 쓰는 AI 인사이트 · 이탈 위험 패널도 함께 옮김.
import { useState } from 'react'
import Icon from '../../components/Icon'
import { supabase, GEMINI_MODEL } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'
import { computeStats, buildInsightPrompt, callGeminiInsight } from '@trainer-log/shared/lib/memberInsights'
import { computeRiskScore, getRiskLevel } from '@trainer-log/shared/lib/churnRisk'
import { isNativeApp } from '../../lib/nativeAuth'

const HIDE_PURCHASE = isNativeApp()

export default function MemberInsightTab({ member, risk, canInsight, apiKey }) {
  return (
      <div>
        {/* 이탈 위험 분석 */}
        <div style={{marginBottom:'18px'}}>
          <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',marginBottom:'10px',display:'flex',alignItems:'center',gap:'6px'}}>
            <span>이탈 위험 분석</span>
            {risk && (() => {
              const lv = getRiskLevel(risk.riskScore)
              return <span style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:lv.bg,color:lv.color,border:`1px solid ${lv.color}33`}}>{lv.emoji} {lv.label} ({risk.riskScore}점)</span>
            })()}
          </div>
          <RiskPanel member={member} />
        </div>
        <div style={{height:'1px',background:'var(--border)',marginBottom:'18px'}} />
        {/* AI 인사이트 */}
        <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-muted)',marginBottom:'10px'}}>AI 인사이트</div>
        {canInsight ? (
          <AiInsightPanel member={member} apiKey={apiKey} />
        ) : (
          <div style={{background:'var(--surface2)',border:'1px dashed var(--border)',borderRadius:'10px',padding:'16px',textAlign:'center',marginBottom:'10px'}}>
            <div style={{marginBottom:'6px',color:'var(--text-muted)'}}><Icon name="lock" size={20} /></div>
            <div style={{fontWeight:700,fontSize:'13px',marginBottom:'4px'}}>{HIDE_PURCHASE ? 'AI 회원 인사이트' : '유료 플랜 전용'}</div>
            <div style={{fontSize:'12px',color:'var(--text-dim)'}}>{HIDE_PURCHASE ? '현재 이용할 수 없는 기능이에요.' : 'AI 회원 인사이트는 유료 플랜에서 이용 가능해요.'}</div>
          </div>
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
      const text   = await callGeminiInsight(apiKey, GEMINI_MODEL, prompt, { purpose: 'insight' })
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

  const mono = { fontVariantNumeric:'tabular-nums' }

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
      '✅': { color:'#3F6212', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)' },
      '⚠️': { color:'#92400E', bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.2)' },
      '💡': { color:'#1D4ED8', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
      '💪': { color:'var(--accent-text)', bg: 'rgba(200,241,53,0.08)', border: 'rgba(200,241,53,0.2)' },
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
                      <span style={{color:'var(--accent-text)',fontSize:'10px',marginLeft:'2px'}}>{e.cnt}</span>
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
          borderRadius:'10px',padding:'12px',marginBottom:'12px',fontSize:'12px',color:'#B91C1C'}}>
          {errMsg}
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
          {phase === 'done' ? '다시 분석하기' : '이번 주 AI 인사이트 만들기'}
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

  const mono = { fontVariantNumeric:'tabular-nums' }

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
              <div style={{fontSize:'11px',color:'var(--text-dim)',marginBottom:'8px',fontWeight:600}}>위험 신호</div>
              {result.flags.map((f, i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',
                  background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.2)',
                  borderRadius:'8px',padding:'8px 10px',marginBottom:'6px',fontSize:'12px',color:'#C2410C'}}>
                  <Icon name="alert" size={14} /><span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {result.flags.length === 0 && (
            <div style={{textAlign:'center',padding:'12px',fontSize:'12px',color:'#3F6212'}}>
              현재 이탈 위험 신호 없음
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
            다시 분석
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div style={{color:'#B91C1C',fontSize:'12px',textAlign:'center',padding:'12px'}}>분석 중 오류가 발생했어요</div>
      )}

      {(phase === 'idle' || phase === 'loading') && (
        <button onClick={analyze} disabled={phase === 'loading'}
          style={{width:'100%',padding:'12px',borderRadius:'8px',border:'none',
            background: phase === 'loading' ? 'var(--surface2)' : '#f97316',
            color: phase === 'loading' ? 'var(--text-dim)' : '#fff',
            fontWeight:700,fontSize:'13px',cursor: phase === 'loading' ? 'not-allowed' : 'pointer',fontFamily:'inherit'}}>
          {phase === 'loading' ? '분석 중...' : '이탈 위험 분석 시작'}
        </button>
      )}
    </div>
  )
}
