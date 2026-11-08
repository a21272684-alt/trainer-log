import { useState, useEffect, useMemo } from 'react'
import CrmIcon from '../components/CrmIcon'
import TopbarActions from '../components/TopbarActions'
import { supabase, GEMINI_MODEL } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import { generateWeeklyReport, fetchRecentReports, parseReportSections, getPrevMondayStr } from '@trainer-log/shared/lib/gymReport'

// ── 주간 리포트 ─────────────────────────────────────────────────
// 왼쪽 주 목록 + 오른쪽 문서. AI 호출을 아끼려고 마지막으로 만든 뒤 7일이 지나야 다시 만들 수 있다.

const LOCK_DAYS = 7
const SECTION_MARKS = ['#4D7C0F', '#B45309', '#4F46E5', '#0891B2', '#BE123C']

const man = n => (Number(n || 0) / 10000).toFixed(0) + '만원'
const stripMark = line => line.replace(/^[^\p{L}\p{N}]+/u, '').trim()   // 제목 앞 이모지 제거
const monthDay = d => {
  if (!d) return ''
  const [, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return `${m}월 ${day}일`
}
const dotDate = d => String(d || '').slice(5, 10).replace('-', '.')

function weekLabel(r) {
  const [, m, d] = String(r.week_end || r.week_start).split('-').map(Number)
  return `${m}월 ${Math.ceil(d / 7)}주`
}

function StatsGrid({ stats }) {
  if (!stats) return null
  const items = [
    ['이번 주 출석', (stats.attendance?.this_week ?? '—') + '회'],
    ['수업 완료',   (stats.sessions?.this_week ?? '—') + '회'],
    ['이번 주 매출', man(stats.revenue?.this_week)],
    ['신규 회원',   (stats.members?.new_this_week ?? '—') + '명'],
    ['이탈 위험',   (stats.members?.at_risk ?? '—') + '명'],
    ['만료 예정',   (stats.members?.expiring ?? '—') + '명'],
  ]
  return (
    <div className="rp-kpis">
      {items.map(([label, val]) => <div key={label}><span>{label}</span><b>{val}</b></div>)}
    </div>
  )
}

function ReportBody({ text }) {
  let mark = 0
  return parseReportSections(text).map((sec, i) => {
    if (!sec.emoji) return <p key={i} className="rp-intro">{sec.body}</p>
    const [head, ...rest] = sec.body.split('\n')
    const title = stripMark(head)
    const lines = rest.map(l => l.trim()).filter(Boolean)
    if (title.includes('한마디')) {
      return <div key={i} className="rp-note"><b>{title}</b>{lines.map((l, j) => <p key={j}>{l}</p>)}</div>
    }
    const color = SECTION_MARKS[mark++ % SECTION_MARKS.length]
    return (
      <section key={i} className="rp-sec">
        <h3><i style={{ background: color }} />{title}</h3>
        {lines.map((l, j) => <p key={j}>{l}</p>)}
      </section>
    )
  })
}

export default function ReportsTab({ gymId, gymName }) {
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
    } catch (e) { setPhase('error'); setErrMsg(e.message) }
  }

  useEffect(() => { loadReports() }, [gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate(existingReport = null) {
    if (!gymId) { showToast('센터 정보가 없어요'); return }
    setPhase('loading'); setErrMsg('')
    try {
      let reportRow = existingReport
      if (!reportRow) {
        const { data } = await supabase.rpc('create_pending_weekly_report', { p_gym_id: gymId })
        if (data) {
          const { data: row } = await supabase.from('gym_weekly_reports').select('*').eq('id', data).single()
          reportRow = row
        }
        if (!reportRow) { setPhase('error'); setErrMsg('리포트를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); return }
      }
      await generateWeeklyReport({ supabase, apiKey: '', model: GEMINI_MODEL, gymId, reportId: reportRow.id, weekStart: reportRow.week_start || getPrevMondayStr(), onStatus: setStatus })
      showToast('주간 리포트를 만들었어요')
      await loadReports()
      setPhase('done')
    } catch (e) { setPhase('error'); setErrMsg(e.message) }
  }

  const pendingReports = reports.filter(r => r.status === 'pending' || r.status === 'error')
  const doneReports    = reports.filter(r => r.status === 'done')

  const nextAt = useMemo(() => {
    const last = Math.max(0, ...reports.filter(r => r.status === 'done' && r.generated_at).map(r => new Date(r.generated_at).getTime()))
    return last ? new Date(last + LOCK_DAYS * 86400000) : null
  }, [reports])
  const locked = !!nextAt && nextAt > new Date()
  const busy = phase === 'loading'

  return (
    <div className="rp">
      <TopbarActions>
        {locked ? (
          <span className="rp-lock"><CrmIcon name="lock" size={15} stroke={2.1} />다시 만들기는 {nextAt.getMonth() + 1}월 {nextAt.getDate()}일부터</span>
        ) : selected?.status === 'done' ? (
          <button type="button" className="btn btn-secondary btn-lg" disabled={busy} onClick={() => handleGenerate({ ...selected, status: 'pending' })}>다시 만들기</button>
        ) : null}
      </TopbarActions>

      {pendingReports.map(r => (
        <div key={r.id} className="rp-pending">
          <div style={{ minWidth: 0 }}>
            <b>{r.status === 'error' ? '만들지 못했어요 — 다시 시도해 주세요' : '새 주간 리포트가 기다리고 있어요'}</b>
            <small>{monthDay(r.week_start)} – {monthDay(r.week_end)}</small>
            {r.error_message && <small className="err">{r.error_message}</small>}
          </div>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => handleGenerate(r)} disabled={busy}>
            {busy ? statusMsg : 'AI 리포트 지금 만들기'}
          </button>
        </div>
      ))}

      {reports.length === 0 && !busy && (
        <div className="rp-empty">
          <CrmIcon name="note" size={36} />
          <p>아직 만든 리포트가 없어요.<br />지난주 데이터로 첫 리포트를 만들 수 있어요.</p>
          <button type="button" className="btn btn-primary" onClick={() => handleGenerate()}>첫 리포트 만들기</button>
        </div>
      )}

      {busy && <div className="rp-status"><span className="spinner" style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>✦</span>{statusMsg}</div>}
      {phase === 'error' && errMsg && <div className="pause-error" role="alert">{errMsg}</div>}

      {doneReports.length > 0 && (
        <div className="rp-layout">
          <nav className="rp-weeks" aria-label="주간 리포트 목록">
            {doneReports.map(r => (
              <button key={r.id} type="button" className={selected?.id === r.id ? 'on' : ''} aria-current={selected?.id === r.id ? 'page' : undefined} onClick={() => setSelected(r)}>
                <b>{weekLabel(r)}</b>
                <span>{dotDate(r.week_start)} – {dotDate(r.week_end)}</span>
              </button>
            ))}
          </nav>

          {selected?.status === 'done' && (
            <article className="rp-doc">
              <header>
                <p>
                  {[gymName, selected.generated_at && `AI가 ${new Date(selected.generated_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric' })}에 작성`].filter(Boolean).join(' · ')}
                </p>
                <h2>{monthDay(selected.week_start)} – {monthDay(selected.week_end)} 운영 리포트</h2>
              </header>
              <StatsGrid stats={selected.stats_snapshot} />
              <ReportBody text={selected.report_text || ''} />
            </article>
          )}
        </div>
      )}

      {doneReports.length > 0 && pendingReports.length === 0 && !busy && !locked && (
        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => handleGenerate()}>이번 주 리포트 만들기</button>
      )}
    </div>
  )
}
