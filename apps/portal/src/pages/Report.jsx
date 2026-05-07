import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useSearchParams } from 'react-router-dom'
import '../styles/report.css'

function getTier(sessions) {
  if (sessions >= 100) return { label:'💎 다이아', cls:'tier-gold' }
  if (sessions >= 50)  return { label:'🥇 골드',   cls:'tier-gold' }
  if (sessions >= 20)  return { label:'🥈 실버',   cls:'tier-silver' }
  return { label:'🥉 브론즈', cls:'tier-bronze' }
}

function parseReportContent(text) {
  const lines = text.split('\n'); const sections = []; let current = null
  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) { if (current) current.body += '\n'; return }
    const isHeader = /^[🏋️💬🎯📌✅📈📝💪⭐🔥]/.test(trimmed) && trimmed.length < 30
    if (isHeader) { if (current && current.body.trim()) sections.push(current); current = { title: trimmed, body: '' } }
    else { if (!current) current = { title:'', body:'' }; current.body += (current.body ? '\n' : '') + trimmed }
  })
  if (current && current.body.trim()) sections.push(current)
  return sections
}

export default function Report() {
  const [searchParams] = useSearchParams()
  const [loading,   setLoading]   = useState(true)
  const [authUser,  setAuthUser]  = useState(undefined) // undefined=확인 중, null=미로그인
  const [error,     setError]     = useState(false)
  const [log,       setLog]       = useState(null)
  const [member,    setMember]    = useState(null)
  const [trainer,   setTrainer]   = useState(null)

  const [toastMsg,     setToastMsg]     = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  function showToastMsg(msg) { setToastMsg(msg); setToastVisible(true); setTimeout(()=>setToastVisible(false), 2500) }

  useEffect(() => {
    async function init() {
      // ① 로그인 세션 확인 — 비로그인이면 내용 로드 없이 차단
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user ?? null
      setAuthUser(user)
      if (!user) { setLoading(false); return }
      // ② 로그인 확인 후 데이터 로드
      await loadReport()
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadReport() {
    const reportId = searchParams.get('id')
    if (!reportId) { setError(true); setLoading(false); return }
    try {
      const { data: logs } = await supabase
        .from('logs').select('*').eq('report_id', reportId)
      if (!logs?.length) { setError(true); setLoading(false); return }
      const l = logs[0]
      const [{ data: members }, { data: trainers }] = await Promise.all([
        supabase.from('members').select('*').eq('id', l.member_id),
        supabase.from('trainers').select('name').eq('id', l.trainer_id),
      ])
      // 읽음 처리 — read_at이 없으면 최초 열람 시각 기록
      if (!l.read_at) {
        await supabase.from('logs').update({ read_at: new Date().toISOString() }).eq('id', l.id)
      }
      setLog(l); setMember(members?.[0]); setTrainer(trainers?.[0]); setLoading(false)
    } catch(e) { setError(true); setLoading(false) }
  }

  /* ── 로딩 ── */
  if (loading) return (
    <div className="rpt-loading-wrap">
      <div className="rpt-loading-spinner"></div>
      <div className="rpt-loading-text">리포트를 불러오는 중...</div>
    </div>
  )

  /* ── 미로그인 차단 화면 ── */
  if (authUser === null) return (
    <div className="rpt-loading-wrap">
      <div style={{fontSize:'48px',marginBottom:'16px'}}>🔒</div>
      <div className="rpt-error-title" style={{marginBottom:'10px'}}>
        로그인이 필요해요
      </div>
      <div className="rpt-error-sub" style={{lineHeight:1.75,maxWidth:'280px',textAlign:'center'}}>
        개인정보 보호를 위해<br/>
        회원 전용 앱 <strong>'오운'</strong>에서<br/>
        로그인 후 열람할 수 있습니다.
      </div>
      <a
        href="/"
        style={{
          marginTop:'24px',display:'inline-block',
          background:'#c8f135',color:'#0d0d0d',
          padding:'12px 28px',borderRadius:'100px',
          fontSize:'14px',fontWeight:700,textDecoration:'none',
        }}
      >오운 앱으로 이동</a>
    </div>
  )

  /* ── 에러 ── */
  if (error) return (
    <div className="rpt-loading-wrap">
      <div className="rpt-error-icon">🔍</div>
      <div className="rpt-error-title">리포트를 찾을 수 없어요</div>
      <div className="rpt-error-sub">링크가 만료됐거나 잘못된 주소예요.<br/>트레이너에게 다시 요청해주세요.</div>
    </div>
  )

  /* ── 본문 ── */
  const trainerName = trainer?.name || '트레이너'
  const d       = new Date(log.created_at)
  const total   = member?.total_sessions || 0
  const done    = member?.done_sessions  || 0
  const remain  = total - done
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0
  const tier    = getTier(done)
  const exercises = log.exercises_data
  const content   = log.content || ''
  const sections  = parseReportContent(content)

  let volumes = []
  if (exercises?.length) {
    exercises.forEach(ex => {
      const totalVol = ex.sets.reduce((sum,s) => {
        const w = parseFloat(s.weight)||0; const r = parseInt(s.reps)||0; return sum + w*r
      }, 0)
      if (totalVol > 0) volumes.push({ name: ex.name, vol: totalVol })
    })
  }
  const maxVol = volumes.length ? Math.max(...volumes.map(v => v.vol)) : 0

  return (
    <div className="report-page">
      {/* ── 헤더 ── */}
      <div className="rpt-header">
        <div className="rpt-brand">오운 · 수업 리포트</div>
        <div className="rpt-trainer-row">
          <div className="rpt-trainer-avatar">{trainerName[0]}</div>
          <div>
            <div className="rpt-trainer-name">{trainerName} 트레이너</div>
            <div className="rpt-trainer-sub">퍼스널 트레이너</div>
          </div>
        </div>
        <div className="rpt-date">
          {d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}
        </div>
        <div className="rpt-session">{log.session_number}회차 수업</div>
      </div>

      <div className="rpt-body">
        {/* 세션 현황 */}
        <div className="rpt-session-card">
          <div className="rpt-stats-row">
            <div className="rpt-stat"><div className="rpt-stat-num">{done}</div><div className="rpt-stat-label">총 출석</div></div>
            <div className="rpt-stat"><div className="rpt-stat-num">{remain}</div><div className="rpt-stat-label">잔여 회차</div></div>
            <div className="rpt-stat"><div className="rpt-stat-num">{log.session_number}</div><div className="rpt-stat-label">오늘 회차</div></div>
          </div>
          <div className="rpt-progress-label-row"><span>진행률</span><span>{pct}%</span></div>
          <div className="rpt-progress-track">
            <div className="rpt-progress-fill" style={{width:pct+'%'}}></div>
          </div>
          <div style={{marginTop:'10px'}}>
            <span className={`rpt-tier-badge ${tier.cls}`}>{tier.label}</span>
          </div>
        </div>

        {/* 운동 기록 */}
        {exercises?.length > 0 && (
          <div className="rpt-section">
            <div className="rpt-section-title"><span className="rpt-section-icon">🏋️</span>오늘의 운동</div>
            {exercises.map((ex, i) => {
              const totalVol = ex.sets.reduce((sum,s) => sum+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0)
              return (
                <div key={i} style={{marginBottom:'12px'}}>
                  <div className="rpt-ex-row">
                    <span className="rpt-ex-name">{ex.name}</span>
                    <span className="rpt-ex-detail">{ex.sets.length}세트</span>
                    {totalVol > 0 && <span className="rpt-ex-vol">{totalVol.toLocaleString()}</span>}
                  </div>
                  <div className="rpt-set-detail-wrap">
                    {ex.sets.map((s, j) => {
                      const rirClass = s.rir==0?'rir-0':s.rir==1?'rir-1':'rir-2'
                      return (
                        <div key={j} className="rpt-set-detail-item">
                          <span className="rpt-set-num">{j+1}세트</span>
                          <span className="rpt-set-info">
                            {s.weight ? `${s.weight}kg · ` : ''}{s.reps}회{s.feel ? ' · '+s.feel : ''}
                          </span>
                          {s.rir!==''&&s.rir!==undefined &&
                            <span className={`rpt-set-rir ${rirClass}`}>RIR {s.rir}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 볼륨 차트 */}
        {volumes.length > 0 && (
          <div className="rpt-section">
            <div className="rpt-section-title"><span className="rpt-section-icon">📊</span>종목별 볼륨</div>
            {volumes.map((v, i) => (
              <div key={i} className="rpt-vol-bar-row">
                <span className="rpt-vol-bar-label">{v.name}</span>
                <div className="rpt-vol-bar-track">
                  <div className="rpt-vol-bar-fill" style={{width:Math.round((v.vol/maxVol)*100)+'%'}}></div>
                </div>
                <span className="rpt-vol-bar-num">{v.vol.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* AI 수업일지 */}
        <div className="rpt-section">
          <div className="rpt-section-title"><span className="rpt-section-icon">✨</span>수업 리포트</div>
          {sections.length ? sections.map((s, i) => (
            <div key={i} className="rpt-ai-content-block">
              {s.title && <div className="rpt-ai-block-label">{s.title}</div>}
              <div className="rpt-ai-block-text">{s.body}</div>
            </div>
          )) : <div className="rpt-ai-content">{content}</div>}
        </div>

        {/* 첨부 미디어 */}
        {Array.isArray(log.media_urls) && log.media_urls.length > 0 && (
          <div className="rpt-section">
            <div className="rpt-section-title">
              <span className="rpt-section-icon">📎</span>첨부 미디어
            </div>
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',
              gap:'10px',
            }}>
              {log.media_urls.map((m, i) => (
                m.type === 'video' ? (
                  <video
                    key={i}
                    src={m.url}
                    controls
                    playsInline
                    style={{
                      width:'100%',borderRadius:'10px',
                      maxHeight:'260px',objectFit:'contain',
                      background:'#000',display:'block',
                    }}
                  />
                ) : (
                  <img
                    key={i}
                    src={m.url}
                    alt={`첨부 사진 ${i+1}`}
                    style={{
                      width:'100%',borderRadius:'10px',
                      objectFit:'cover',display:'block',
                      maxHeight:'260px',
                    }}
                  />
                )
              ))}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="rpt-footer">
          <div className="rpt-footer-brand">오운</div>
          <div className="rpt-footer-sub">트레이너와 회원을 연결하는 스마트 수업 리포트</div>
          <div style={{
            marginTop:'12px',fontSize:'11px',color:'#9ca3af',lineHeight:1.65,
            padding:'10px 12px',borderRadius:'8px',
            background:'rgba(156,163,175,0.08)',border:'1px solid rgba(156,163,175,0.15)',
          }}>
            ⚠️ 첨부된 미디어는 서버 안정성을 위해 3개월(90일) 후 자동 삭제됩니다.
          </div>
        </div>
      </div>

      {/* 토스트 */}
      <div style={{
        position:'fixed',top:'20px',left:'50%',transform:'translateX(-50%)',
        background:'#c8f135',color:'#0d0d0d',
        padding:'10px 20px',borderRadius:'100px',
        fontSize:'13px',fontWeight:700,zIndex:9999,
        opacity:toastVisible?1:0,transition:'opacity 0.3s',
        whiteSpace:'nowrap',pointerEvents:'none',
      }}>{toastMsg}</div>
    </div>
  )
}
