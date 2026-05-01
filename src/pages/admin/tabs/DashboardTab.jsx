import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { RISK_LEVELS } from '../lib/churnRisk'

const mono = { fontFamily: "'DM Mono', monospace" }
const man  = n => (Number(n || 0) / 10000).toFixed(0) + '만원'

export default function DashboardTab({ gym, gymId, trainers, members }) {
  const [monthRevenue, setMonthRevenue] = useState(null)
  const [riskCounts,   setRiskCounts]   = useState({ critical: 0, risk: 0, watch: 0 })
  const [expiring,     setExpiring]     = useState(0)

  const now        = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`

  useEffect(() => { if (gymId) loadStats() }, [gymId, members])

  async function loadStats() {
    const trainerIds = trainers.map(t => t.id)
    if (trainerIds.length > 0) {
      const { data: pays } = await supabase
        .from('payments').select('amount')
        .in('trainer_id', trainerIds).gte('paid_at', monthStart)
      setMonthRevenue((pays || []).reduce((s, p) => s + p.amount, 0))
    }
    const { data: scores } = await supabase
      .from('member_risk_scores').select('risk_level, member_id')
      .in('member_id', members.map(m => m.id))
    const counts = { critical: 0, risk: 0, watch: 0, safe: 0 }
    ;(scores || []).forEach(s => { if (counts[s.risk_level] !== undefined) counts[s.risk_level]++ })
    setRiskCounts(counts)
    setExpiring(members.filter(m => {
      const rem = Math.max(0, (m.total_sessions||0) - (m.done_sessions||0))
      return rem <= 3 && rem > 0
    }).length)
  }

  const activeMembers = members.filter(m => Math.max(0,(m.total_sessions||0)-(m.done_sessions||0)) > 0).length

  const kpis = [
    { label: '소속 트레이너', value: trainers.length + '명', color: 'var(--blue)',   icon: '👤' },
    { label: '활성 회원',     value: activeMembers + '명',   color: 'var(--green)',  icon: '🏃' },
    { label: '이번달 매출',   value: monthRevenue !== null ? man(monthRevenue) : '—', color: 'var(--accent)', icon: '💰' },
    { label: '만료 예정',     value: expiring + '명',        color: expiring > 0 ? 'var(--orange)' : 'var(--text-muted)', icon: '⚠️' },
    { label: '이탈 위험',     value: (riskCounts.critical + riskCounts.risk) + '명', color: (riskCounts.critical+riskCounts.risk) > 0 ? 'var(--red)' : 'var(--text-muted)', icon: '🔴' },
    { label: '전체 회원',     value: members.length + '명',  color: 'var(--purple)', icon: '👥' },
  ]

  return (
    <div>
      <div className="kpi-grid">
        {kpis.map(k => (
          <div className="kpi-card" key={k.label}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: '22px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* 트레이너별 현황 */}
      <div className="card">
        <div className="card-title">트레이너별 현황</div>
        {trainers.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">소속 트레이너가 없어요</div></div>
        ) : (
          <table className="data-table">
            <thead><tr>
              <th>이름</th><th>직급</th><th>고용형태</th>
              <th style={{ textAlign:'right' }}>담당 회원</th>
              <th style={{ textAlign:'right' }}>활성 회원</th>
            </tr></thead>
            <tbody>
              {trainers.map(t => {
                const tM = members.filter(m => m.trainer_id === t.id)
                const tA = tM.filter(m => Math.max(0,(m.total_sessions||0)-(m.done_sessions||0)) > 0).length
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight:600 }}>{t.name}</td>
                    <td><span className="badge" style={{ background:'rgba(96,165,250,0.12)', color:'var(--blue)' }}>{t.trainer_ranks?.label ?? '미설정'}</span></td>
                    <td style={{ color:'var(--text-muted)', fontSize:'12px' }}>
                      {t.employment_type === 'employee' ? '정직원' : t.employment_type === 'freelance' ? '프리랜서' : t.employment_type === 'rental' ? '대관' : '—'}
                    </td>
                    <td style={{ textAlign:'right', ...mono }}>{tM.length}명</td>
                    <td style={{ textAlign:'right', ...mono, color:'var(--green)' }}>{tA}명</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 위험 회원 요약 */}
      {(riskCounts.critical + riskCounts.risk) > 0 && (
        <div className="card" style={{ marginTop:'16px', borderColor:'rgba(248,113,113,0.3)' }}>
          <div className="card-title" style={{ color:'var(--red)' }}>⚠️ 즉시 케어 필요 회원</div>
          <div style={{ display:'flex', gap:'12px' }}>
            {riskCounts.critical > 0 && (
              <div style={{ flex:1, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'10px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'22px', fontWeight:700, color:'var(--red)', ...mono }}>{riskCounts.critical}</div>
                <div style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'4px' }}>🔴 이탈 임박</div>
              </div>
            )}
            {riskCounts.risk > 0 && (
              <div style={{ flex:1, background:'rgba(249,115,22,0.08)', border:'1px solid rgba(249,115,22,0.2)', borderRadius:'10px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'22px', fontWeight:700, color:'var(--orange)', ...mono }}>{riskCounts.risk}</div>
                <div style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'4px' }}>🟠 위험</div>
              </div>
            )}
            {riskCounts.watch > 0 && (
              <div style={{ flex:1, background:'rgba(250,204,21,0.08)', border:'1px solid rgba(250,204,21,0.2)', borderRadius:'10px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'22px', fontWeight:700, color:'var(--yellow)', ...mono }}>{riskCounts.watch}</div>
                <div style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'4px' }}>🟡 관찰</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
