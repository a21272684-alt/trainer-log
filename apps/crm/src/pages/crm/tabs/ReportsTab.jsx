import { useState, useEffect } from 'react'
import { supabase, GEMINI_MODEL } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import { generateWeeklyReport, fetchRecentReports, parseReportSections, getPrevMondayStr } from '@trainer-log/shared/lib/gymReport'

const man = n => (Number(n||0)/10000).toFixed(0) + '만원'

function StatsGrid({ stats }) {
  if (!stats) return null
  const items = [
    ['이번 주 출석', (stats.attendance?.this_week ?? '—') + '회', 'var(--blue)'],
    ['신규 회원',   (stats.members?.new_this_week ?? '—') + '명', 'var(--green)'],
    ['이번 주 매출', man(stats.revenue?.this_week),               'var(--accent)'],
    ['이탈 위험',   (stats.members?.at_risk ?? '—') + '명',      stats.members?.at_risk > 0 ? 'var(--red)' : 'var(--text-dim)'],
    ['만료 예정',   (stats.members?.expiring ?? '—') + '명',     stats.members?.expiring > 0 ? 'var(--orange)' : 'var(--text-dim)'],
    ['수업 완료',   (stats.sessions?.this_week ?? '—') + '회',   'var(--purple)'],
  ]
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px', marginBottom:'16px' }}>
      {items.map(([label,val,color]) => (
        <div key={label} style={{ background:'var(--surface2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'14px', fontWeight:700, color }}>{val}</div>
          <div style={{ fontSize:'9px', color:'var(--text-dim)', marginTop:'2px' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

export default function ReportsTab({ gymId, apiKey }) {
  const [reports,   setReports]  = useState([])
  const [selected,  setSelected] = useState(null)
  const [phase,     setPhase]    = useState('idle')
  const [statusMsg, setStatus]   = useState('')
  const [errMsg,    setErrMsg]   = useState('')
  const showToast = useToast()

  async function loadReports() {
    if (!gymId) return
    setPhase('loading'); setStatus('리포트 목록 불러오는 중...')
    try {
      const list = await fetchRecentReports(supabase, gymId)
      setReports(list)
      if (list.length > 0) setSelected(list[0])
      setPhase('idle')
    } catch(e) { setPhase('error'); setErrMsg(e.message) }
  }

  useEffect(() => { loadReports() }, [gymId])

  async function handleGenerate(existingReport = null) {
    if (!apiKey) { showToast('설정에서 Gemini API 키를 입력해주세요'); return }
    if (!gymId)  { showToast('센터 정보가 없어요'); return }
    setPhase('loading'); setErrMsg('')
    try {
      let reportRow = existingReport
      if (!reportRow) {
        const { data } = await supabase.rpc('create_pending_weekly_report', { p_gym_id: gymId })
        if (data) {
          const { data: row } = await supabase.from('gym_weekly_reports').select('*').eq('id', data).single()
          reportRow = row
        }
        if (!reportRow) { setPhase('error'); setErrMsg('리포트 레코드 생성 실패'); return }
      }
      await generateWeeklyReport({ supabase, apiKey, model: GEMINI_MODEL, gymId, reportId: reportRow.id, weekStart: reportRow.week_start || getPrevMondayStr(), onStatus: setStatus })
      showToast('✓ 주간 리포트 생성 완료')
      await loadReports()
      setPhase('done')
    } catch(e) { setPhase('error'); setErrMsg(e.message) }
  }

  function renderReport(text) {
    return parseReportSections(text).map((sec, i) => {
      if (!sec.emoji) return <p key={i} style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'8px' }}>{sec.body}</p>
      return (
        <div key={i} style={{ background:sec.style.bg, border:`1px solid ${sec.style.border}`, borderRadius:'10px', padding:'14px', marginBottom:'10px' }}>
          <pre style={{ margin:0, fontSize:'13px', lineHeight:1.7, color:'var(--text)', whiteSpace:'pre-wrap', fontFamily:"'Noto Sans KR', sans-serif" }}>{sec.body}</pre>
        </div>
      )
    })
  }

  const pendingReports = reports.filter(r => r.status==='pending' || r.status==='error')
  const doneReports    = reports.filter(r => r.status==='done')

  return (
    <div style={{ maxWidth:'720px' }}>
      {!apiKey && (
        <div style={{ background:'rgba(250,204,21,0.06)', border:'1px solid rgba(250,204,21,0.2)', borderRadius:'10px', padding:'12px', marginBottom:'16px', fontSize:'12px', color:'var(--yellow)' }}>
          ⚠️ 우측 상단 설정에서 Gemini API 키를 입력해야 AI 리포트를 생성할 수 있어요.
        </div>
      )}
      {pendingReports.map(r => (
        <div key={r.id} style={{ background:'rgba(250,204,21,0.06)', border:'1px solid rgba(250,204,21,0.2)', borderRadius:'10px', padding:'14px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'var(--yellow)', marginBottom:'6px' }}>
            {r.status==='error' ? '⚠️ 생성 실패 — 재시도 필요' : '📋 새 주간 리포트 대기 중'}
          </div>
          <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'8px' }}>기준: {r.week_start} ~ {r.week_end || ''}</div>
          {r.error_message && <div style={{ fontSize:'11px', color:'var(--red)', marginBottom:'8px' }}>{r.error_message}</div>}
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={() => handleGenerate(r)} disabled={phase==='loading'}>
            {phase==='loading' ? statusMsg : '🤖 AI 리포트 지금 생성'}
          </button>
        </div>
      ))}
      {reports.length === 0 && phase !== 'loading' && (
        <div style={{ textAlign:'center', padding:'40px 0', marginBottom:'14px' }}>
          <div style={{ fontSize:'36px', marginBottom:'10px' }}>📄</div>
          <div style={{ fontSize:'12px', color:'var(--text-dim)', marginBottom:'16px' }}>생성된 리포트가 없어요.<br />직전 주 데이터로 첫 리포트를 생성할 수 있어요.</div>
          <button className="btn btn-primary" onClick={() => handleGenerate()}>📊 첫 리포트 생성</button>
        </div>
      )}
      {phase==='loading' && (
        <div style={{ textAlign:'center', padding:'20px', color:'var(--text-dim)', fontSize:'13px', marginBottom:'14px' }}>
          <span className="spinner" style={{ fontSize:'24px', display:'block', marginBottom:'8px' }}>✦</span>
          {statusMsg}
        </div>
      )}
      {phase==='error' && errMsg && (
        <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:'10px', padding:'12px', marginBottom:'14px', fontSize:'12px', color:'var(--red)' }}>⚠️ {errMsg}</div>
      )}
      {doneReports.length > 0 && (
        <>
          <div style={{ display:'flex', gap:'6px', overflowX:'auto', marginBottom:'14px', paddingBottom:'2px' }}>
            {doneReports.map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                style={{ flexShrink:0, padding:'5px 12px', borderRadius:'8px', border:'1px solid', fontSize:'10px', fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
                  background: selected?.id===r.id ? 'var(--accent)' : 'var(--surface2)',
                  color: selected?.id===r.id ? '#0a0a0a' : 'var(--text-muted)',
                  borderColor: selected?.id===r.id ? 'var(--accent)' : 'var(--border)' }}
              >{r.week_start}</button>
            ))}
          </div>
          {selected?.status==='done' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:700 }}>{selected.week_start} ~ {selected.week_end}</div>
                  <div style={{ fontSize:'10px', color:'var(--text-dim)', marginTop:'2px' }}>생성: {selected.generated_at ? new Date(selected.generated_at).toLocaleString('ko-KR') : '—'}</div>
                </div>
                <button className="btn btn-secondary" onClick={() => handleGenerate({ ...selected, status:'pending' })}>🔄 재생성</button>
              </div>
              <StatsGrid stats={selected.stats_snapshot} />
              {renderReport(selected.report_text || '')}
            </div>
          )}
        </>
      )}
      {doneReports.length > 0 && pendingReports.length === 0 && phase !== 'loading' && (
        <button className="btn btn-secondary" style={{ width:'100%', justifyContent:'center', marginTop:'10px' }} onClick={() => handleGenerate()}>
          + 이번 주 리포트 수동 생성
        </button>
      )}
    </div>
  )
}
