import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import CrmIcon from '../components/CrmIcon'

// ── 수업 예약 (센터 전체 시간표) ───────────────────────────────────
// 트레이너가 오운 앱 시간표에 넣은 수업을 crm_gym_schedule(102) 로 읽어 주간 · 목록으로 보여준다.
// 읽기 전용 — 수업 추가 · 변경은 트레이너 앱에서 한다.

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toMin = hm => {
  const [h, m] = String(hm || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null
}
const DOW = ['월', '화', '수', '목', '금', '토', '일']
const DOW_SUN = ['일', '월', '화', '수', '목', '금', '토']

// 트레이너 순서대로 고정 색 (카드 바탕 · 글자 · 점)
const TONES = [
  ['#F3F8E3', '#2F4A0B', '#65A30D'], ['#EEF2FF', '#312E81', '#6366F1'], ['#ECFEFF', '#164E63', '#0891B2'],
  ['#FFFBEB', '#78350F', '#D97706'], ['#FDF2F8', '#831843', '#DB2777'], ['#F2F3EF', '#374151', '#6B7280'],
]

function mondayOf(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
}

export default function ScheduleTab({ gymId, trainers, members, onOpenMember }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [lessons,   setLessons]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [only,      setOnly]      = useState('')        // 트레이너 필터
  const [view,      setView]      = useState('week')    // week | list
  const [selId,     setSelId]     = useState(null)
  const [now,       setNow]       = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)), [weekStart])
  const from = ymd(days[0]), to = ymd(days[6])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setSelId(null)
    supabase.rpc('crm_gym_schedule', { p_gym_id: gymId, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setError(error.message); setLessons([]) } else setLessons(data || [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [gymId, from, to])

  const tIndex  = useMemo(() => Object.fromEntries(trainers.map((t, i) => [t.id, i])), [trainers])
  const tName   = id => trainers.find(t => t.id === id)?.name || '트레이너'
  const tone    = id => TONES[(tIndex[id] ?? 0) % TONES.length]
  const todayS  = ymd(now)
  const nowMin  = now.getHours() * 60 + now.getMinutes()

  const rows = useMemo(() => lessons
    .filter(l => !only || l.trainer_id === only)
    .map(l => ({ ...l, s: toMin(l.start) }))
    .filter(l => l.s != null)
    .sort((a, b) => (a.date === b.date ? a.s - b.s : a.date < b.date ? -1 : 1)), [lessons, only])

  const live = rows.filter(l => !l.cancelled)
  const byDay = useMemo(() => {
    const m = {}
    for (const l of rows) (m[l.date] ||= []).push(l)
    return m
  }, [rows])
  const sel = rows.find(l => l.id === selId) || null
  const isPast = l => l.date < todayS || (l.date === todayS && (toMin(l.end) ?? l.s + 50) <= nowMin)

  const weekLabel = `${days[0].getMonth() + 1}월 ${days[0].getDate()}일 – ${days[6].getMonth() !== days[0].getMonth() ? `${days[6].getMonth() + 1}월 ` : ''}${days[6].getDate()}일`
  const thisWeek = ymd(mondayOf(new Date())) === from

  function shiftWeek(n) {
    setWeekStart(w => new Date(w.getFullYear(), w.getMonth(), w.getDate() + n * 7))
  }

  function cardStyle(l) {
    const [bg, fg] = tone(l.trainer_id)
    if (l.cancelled) return { background: 'var(--surface2)', color: 'var(--text-dim)' }
    if (isPast(l))   return { background: 'var(--bg)', color: 'var(--text-dim)' }
    return { background: bg, color: fg }
  }

  const detailMember = sel?.member_id ? members.find(m => m.id === sel.member_id) : null
  const stateTag = l => l.cancelled ? ['gray', '취소'] : isPast(l) ? ['olive', '끝남'] : ['indigo', '예정']

  return (
    <div className="sc">
      <div className="sc-bar">
        <div className="sc-nav">
          <button type="button" className="sc-icon-btn" aria-label="지난주" onClick={() => shiftWeek(-1)}>‹</button>
          <span className="sc-week">{weekLabel}</span>
          <button type="button" className="sc-icon-btn" aria-label="다음 주" onClick={() => shiftWeek(1)}>›</button>
          {!thisWeek && <button type="button" className="sc-text-btn" onClick={() => setWeekStart(mondayOf(new Date()))}>이번 주</button>}
          <span className="sc-count">수업 {live.length}건</span>
        </div>
        <div className="sc-chips" role="group" aria-label="트레이너">
          <button type="button" className={`sc-chip${!only ? ' on' : ''}`} aria-pressed={!only} onClick={() => setOnly('')}>전체</button>
          {trainers.map(t => (
            <button key={t.id} type="button" className={`sc-chip${only === t.id ? ' on' : ''}`} aria-pressed={only === t.id}
              onClick={() => setOnly(only === t.id ? '' : t.id)}>
              <i style={{ background: tone(t.id)[2] }} />{t.name}
            </button>
          ))}
        </div>
        <div className="rev-seg" role="group" aria-label="보기">
          <button type="button" className={view === 'week' ? 'on' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>주간</button>
          <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>목록</button>
        </div>
      </div>

      <p className="sc-note">
        <CrmIcon name="calendar" size={15} />
        트레이너가 오운 앱 시간표에 넣은 수업이에요. 수업 추가 · 변경은 트레이너 앱에서 해요.
      </p>

      {error ? (
        <div className="card db-empty">시간표를 불러오지 못했어요. 새로고침을 눌러 주세요.</div>
      ) : (
        <div className="sc-body">
          <section className="sc-main" aria-label={view === 'week' ? '주간 시간표' : '수업 목록'}>
            {view === 'week' ? (
              <div className="sc-week-scroll">
                <div className={`sc-grid${loading ? ' loading' : ''}`}>
                  {days.map((d, i) => {
                    const ds = ymd(d)
                    const isToday = ds === todayS
                    const list = byDay[ds] || []
                    const nowAt = isToday ? list.findIndex(l => l.s > nowMin) : -2
                    const nowLine = <div className="sc-now" aria-hidden="true"><span>{pad(now.getHours())}:{pad(now.getMinutes())}</span></div>
                    return (
                      <div key={ds} className={`sc-col${isToday ? ' today' : ''}`}>
                        <div className={`sc-head${isToday ? ' today' : ''}${i >= 5 ? ' weekend' : ''}`}>
                          <span>{DOW[i]}</span><b>{d.getDate()}</b>
                        </div>
                        <div className="sc-items">
                          {list.length === 0 && <span className="sc-none">—</span>}
                          {list.map((l, k) => (
                            <div key={l.id} className="sc-slot">
                              {k === nowAt && nowLine}
                              <button type="button" className={`sc-card${sel?.id === l.id ? ' sel' : ''}`}
                                style={cardStyle(l)} aria-pressed={sel?.id === l.id}
                                onClick={() => setSelId(sel?.id === l.id ? null : l.id)}
                                title={`${l.start}–${l.end || ''} ${l.member_name || '회원'} · ${tName(l.trainer_id)}`}>
                                <span className="sc-card-top"><b>{l.start}</b>{l.cancelled && <em>취소</em>}</span>
                                <span className={`sc-card-who${l.cancelled ? ' strike' : ''}`}>{l.member_name || '회원'}</span>
                                <span className="sc-card-sub">{tName(l.trainer_id)}</span>
                              </button>
                            </div>
                          ))}
                          {isToday && list.length > 0 && nowAt === -1 && nowLine}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>날짜</th><th>시간</th><th>회원</th><th>트레이너</th><th>이용권</th><th style={{ textAlign: 'right' }}>잔여</th><th>상태</th></tr></thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={7} className="rev-empty">{loading ? '불러오는 중이에요' : '이번 주 수업이 없어요'}</td></tr>}
                    {rows.map(l => {
                      const d = new Date(l.date + 'T00:00:00')
                      const [cls, label] = stateTag(l)
                      return (
                        <tr key={l.id} className="member-row" onClick={() => setSelId(l.id)} style={{ opacity: l.cancelled ? 0.6 : 1 }}>
                          <td>{d.getMonth() + 1}/{d.getDate()} ({DOW_SUN[d.getDay()]})</td>
                          <td>{l.start}{l.end ? `–${l.end}` : ''}</td>
                          <td style={{ fontWeight: 700 }}>{l.member_name || '회원'}</td>
                          <td>{tName(l.trainer_id)}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{l.product || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{l.remain != null ? `${l.remain}회` : '—'}</td>
                          <td><span className={`db-tag ${cls}`}>{label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="sc-side" aria-label="고른 수업">
            {!sel ? (
              <div className="sc-side-empty">
                <CrmIcon name="calendar" size={22} />
                <p>수업을 누르면 여기에 자세히 보여요</p>
              </div>
            ) : (
              <>
                <div className="sc-side-head">
                  <div className="sc-side-when">
                    <span>{sel.date === todayS ? '오늘' : `${Number(sel.date.slice(5, 7))}월 ${Number(sel.date.slice(8))}일`} {sel.start}{sel.end ? ` – ${sel.end}` : ''}</span>
                    <button type="button" className="sc-icon-btn plain" aria-label="닫기" onClick={() => setSelId(null)}><CrmIcon name="close" size={16} /></button>
                  </div>
                  <h2>{sel.member_name || '회원'}</h2>
                  <div className="sc-tags">
                    <span className="db-tag" style={{ background: tone(sel.trainer_id)[0], color: tone(sel.trainer_id)[1] }}>담당 {tName(sel.trainer_id)}</span>
                    <span className={`db-tag ${stateTag(sel)[0]}`}>{stateTag(sel)[1]}</span>
                  </div>
                </div>
                <dl className="sc-facts">
                  <div><dt>이용권</dt><dd>{sel.product || '—'}</dd></div>
                  <div><dt>남은 횟수</dt><dd>{sel.remain != null ? `${sel.remain}회` : '—'}</dd></div>
                </dl>
                {detailMember && onOpenMember && (
                  <div className="sc-side-foot">
                    <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => onOpenMember(detailMember)}>회원 상세 열기</button>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
