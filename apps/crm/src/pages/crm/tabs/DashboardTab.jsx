import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import CrmIcon from '../components/CrmIcon'
import {
  memberStatus, remainOf, daysUntil, LONG_ABSENT_DAYS, EXPIRING_SESSIONS, EXPIRING_DAYS,
} from '../lib/memberFilters'

// ── 대시보드 ────────────────────────────────────────────────────
// 오늘 숫자 · 트레이너별 오늘 시간표 · 곧 시작하는 수업 · 만료 임박 · 트레이너별 현황 · 이탈 위험.
// 시간표는 트레이너 앱 시간표를 crm_gym_schedule(102) 로 읽는다(수업만, 읽기 전용).
// 매출은 매출 분석과 같은 crm_revenue_report — 대표는 센터 전체, 직원은 본인 매출.

const PX = 40                       // 시간표 1시간 높이
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toMin = hm => {
  const [h, m] = String(hm || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null
}
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const EMP = { employee: '정직원', freelance: '프리랜서', rental: '대관' }

// 아바타 색 — 트레이너 순서대로 고정 배정
const AV = [
  ['#ECFCCB', '#3F6212'], ['#E0E7FF', '#3730A3'], ['#CFFAFE', '#155E75'],
  ['#FEF3C7', '#92400E'], ['#FCE7F3', '#9D174D'], ['#F2F3EF', '#374151'],
]

function money(v) {
  const n = Number(v || 0)
  if (Math.abs(n) >= 10000) return { num: Math.round(n / 10000).toLocaleString(), unit: '만원' }
  return { num: n.toLocaleString(), unit: '원' }
}
const moneyText = v => { const m = money(v); return m.num + m.unit }

function untilText(mins) {
  if (mins <= 0) return '지금'
  const h = Math.floor(mins / 60), m = mins % 60
  return h ? `${h}시간${m ? ` ${m}분` : ''} 뒤` : `${m}분 뒤`
}

// 같은 열에서 시간이 겹치는 수업은 나란히 — 겹치는 묶음마다 칸(lane)을 나눈다
function withLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => a.s - b.s || Number(a.cancelled) - Number(b.cancelled))
  const out = []
  let group = [], groupEnd = -1
  const flush = () => {
    const lanes = []
    const placed = group.map(b => {
      let lane = lanes.findIndex(end => end <= b.s)
      if (lane === -1) { lane = lanes.length; lanes.push(b.e) } else lanes[lane] = b.e
      return { ...b, lane }
    })
    for (const b of placed) out.push({ ...b, lanes: lanes.length })
    group = []; groupEnd = -1
  }
  for (const b of sorted) {
    if (group.length && b.s >= groupEnd) flush()
    group.push(b); groupEnd = Math.max(groupEnd, b.e)
  }
  if (group.length) flush()
  return out
}

function ranges(now) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  const mon = new Date(y, m, d - ((now.getDay() + 6) % 7))
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  const lastMonthDays = new Date(y, m, 0).getDate()
  return {
    today: ymd(now), weekFrom: ymd(mon), weekTo: ymd(sun),
    weekLabel: `${mon.getMonth() + 1}월 ${mon.getDate()}일 – ${sun.getMonth() + 1 === mon.getMonth() + 1 ? '' : `${sun.getMonth() + 1}월 `}${sun.getDate()}일`,
    monthFrom: ymd(new Date(y, m, 1)),
    prevFrom: ymd(new Date(y, m - 1, 1)),
    prevTo: ymd(new Date(y, m - 1, Math.min(d, lastMonthDays))),
    month: m + 1,
  }
}

function Kpi({ label, value, unit, sub, subTone, icon, iconTone, tone, onClick, ariaLabel }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`db-kpi${tone ? ' ' + tone : ''}`} onClick={onClick}
      aria-label={ariaLabel}>
      <span className="db-kpi-top">
        <span className="db-kpi-label">{label}</span>
        <span className={`db-kpi-ic${iconTone ? ' ' + iconTone : ''}`}><CrmIcon name={icon} size={16} stroke={2.1} /></span>
      </span>
      <span className="db-kpi-value">{value}<small>{unit}</small></span>
      <span className={`db-kpi-sub${subTone ? ' ' + subTone : ''}`}>{sub}</span>
    </Tag>
  )
}

function KpiSkeleton() {
  return (
    <div className="db-kpi" aria-hidden="true">
      <span className="db-skel" style={{ height: 14, width: '55%' }} />
      <span className="db-skel" style={{ height: 30, width: '40%', marginTop: 6 }} />
      <span className="db-skel" style={{ height: 12, width: '70%', marginTop: 4 }} />
    </div>
  )
}

const CHECKIN_TEXT = {
  ok:      ['입장함', 'ok'],
  already: ['이미 입장', 'ok'],
  expired: ['만료로 거부', 'bad'],
  paused:  ['정지 중', 'bad'],
  error:   ['처리 실패', 'bad'],
}

export default function DashboardTab({
  gymId, trainers, members, canManageAttendance,
  onNavigate, onOpenMember, onSummary,
}) {
  const [now, setNow]         = useState(() => new Date())
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkins, setCheckins] = useState({})   // 시간표 블록 id → 입장 처리 결과

  const r = useMemo(() => ranges(now), [now.toDateString()]) // eslint-disable-line react-hooks/exhaustive-deps

  // 지금 시각선 · '곧 시작' 을 1분마다 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (gymId) load()
  }, [gymId, members.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const ids = members.map(m => m.id)
    const [sch, stats, absent, rev, revPrev, risk, att] = await Promise.all([
      supabase.rpc('crm_gym_schedule', { p_gym_id: gymId, p_from: r.weekFrom, p_to: r.weekTo }),
      supabase.rpc('crm_member_stats', { p_gym_id: gymId }),
      supabase.rpc('crm_long_absent', { p_gym_id: gymId, p_days: LONG_ABSENT_DAYS }),
      supabase.rpc('crm_revenue_report', { p_gym_id: gymId, p_from: r.monthFrom, p_to: r.today }),
      supabase.rpc('crm_revenue_report', { p_gym_id: gymId, p_from: r.prevFrom, p_to: r.prevTo }),
      ids.length
        ? supabase.from('member_risk_scores').select('member_id, risk_level, risk_score, flags').in('member_id', ids)
        : Promise.resolve({ data: [] }),
      supabase.rpc('crm_attendance_day', { p_gym_id: gymId, p_date: r.today }),
    ])
    for (const [k, res] of Object.entries({ sch, stats, absent, rev, revPrev, risk, att })) {
      if (res?.error) console.error(`[DashboardTab] ${k}:`, res.error)
    }
    const statsMap = {}
    ;(stats.data || []).forEach(s => { statsMap[s.member_id] = s })
    setData({
      lessons:  sch.error ? null : (sch.data || []),
      statsMap, statsOk: !stats.error,
      absent:   absent.error ? null : (absent.data || []),
      rev:      rev.error ? null : rev.data,
      revPrev:  revPrev.error ? null : revPrev.data,
      risk:     risk.data || [],
      rejected: att.data?.rejected_count ?? 0,
    })
    setLoading(false)
  }

  // ── 파생 값 ────────────────────────────────────────────────────
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const view = useMemo(() => {
    if (!data) return null
    const lessons = data.lessons || []
    const today = lessons.filter(l => l.date === r.today)
      .map(l => ({ ...l, s: toMin(l.start), e: toMin(l.end) ?? (toMin(l.start) + 50) }))
      .filter(l => l.s != null)
      .sort((a, b) => a.s - b.s)
    const todayLive = today.filter(l => !l.cancelled)

    const status = {}
    for (const m of members) status[m.id] = memberStatus(m, data.statsMap[m.id], now)
    const using = members.filter(m => status[m.id] === 'active' || status[m.id] === 'expiring')
    const expiring = members.filter(m => status[m.id] === 'expiring')
      .map(m => {
        const remain = remainOf(m)
        const endLeft = daysUntil(data.statsMap[m.id]?.membership_end, now)
        const few = m.total_sessions > 0 && remain > 0 && remain <= EXPIRING_SESSIONS
        return { m, remain, endLeft, few }
      })
      .sort((a, b) => (a.endLeft ?? 999) - (b.endLeft ?? 999) || a.remain - b.remain)

    const weekByTrainer = {}
    for (const l of lessons) if (!l.cancelled) weekByTrainer[l.trainer_id] = (weekByTrainer[l.trainer_id] || 0) + 1

    const cur = data.rev?.current, prev = data.revPrev?.current
    const net = cur ? cur.sales - cur.refund : null
    const prevNet = prev ? prev.sales - prev.refund : null
    const revByName = {}
    for (const t of data.rev?.by_trainer || []) revByName[t.name] = t.amount

    const memberById = Object.fromEntries(members.map(m => [m.id, m]))
    const riskCount = { critical: 0, risk: 0, watch: 0 }
    for (const x of data.risk) if (riskCount[x.risk_level] !== undefined) riskCount[x.risk_level]++
    const riskTop = data.risk
      .filter(x => (x.risk_level === 'critical' || x.risk_level === 'risk') && memberById[x.member_id])
      .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
      .slice(0, 3)
      .map(x => ({ ...x, member: memberById[x.member_id] }))

    return { today, todayLive, status, using, expiring, weekByTrainer, net, prevNet,
      scope: data.rev?.scope, revByName, riskCount, riskTop }
  }, [data, members, now, r.today])

  // 사이드바 배지(오늘 수업 · 만료 임박 · 입장 거부)
  useEffect(() => {
    if (!view || !onSummary) return
    onSummary({
      todayLessons: data.lessons ? view.todayLive.length : null,
      expiring: view.expiring.length,
      rejected: data.rejected,
    })
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  async function checkin(l) {
    setCheckins(c => ({ ...c, [l.id]: { busy: true } }))
    const { data: res, error } = await supabase.rpc('crm_kiosk_checkin',
      { p_gym_id: gymId, p_member_id: l.member_id, p_source: 'staff' })
    setCheckins(c => ({ ...c, [l.id]: error ? { status: 'error', msg: error.message } : res }))
  }

  const trainerIdx = useMemo(() => Object.fromEntries(trainers.map((t, i) => [t.id, i])), [trainers])
  const avStyle = id => {
    const [bg, fg] = AV[(trainerIdx[id] ?? 0) % AV.length]
    return { background: bg, color: fg }
  }
  const trainerName = id => trainers.find(t => t.id === id)?.name || '트레이너'

  // ── 렌더 ───────────────────────────────────────────────────────
  if (loading || !view) {
    return (
      <div className="db">
        <div className="db-kpis">{Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)}</div>
        <div className="db-row">
          <div className="db-card db-wide"><div className="db-skel" style={{ height: 320 }} /></div>
          <div className="db-card"><div className="db-skel" style={{ height: 320 }} /></div>
        </div>
      </div>
    )
  }

  const v = view
  const lessonsOk = data.lessons != null
  const remainingToday = v.todayLive.filter(l => l.s > nowMin).length
  const rev = money(v.net)
  const delta = v.net == null || v.prevNet == null ? null
    : v.prevNet === 0 ? null : (v.net - v.prevNet) / Math.abs(v.prevNet) * 100
  const isGymScope = v.scope === 'gym'

  // 시간표 열: 오늘 수업이 있는 트레이너만, 센터 트레이너 순서대로
  const cols = trainers
    .map(t => ({ t, blocks: withLanes(v.today.filter(l => l.trainer_id === t.id)) }))
    .filter(c => c.blocks.length > 0)
  const startH = Math.min(9, ...v.today.map(l => Math.floor(l.s / 60)))
  const endH   = Math.max(22, ...v.today.map(l => Math.ceil(l.e / 60)))
  const nowTop = nowMin >= startH * 60 && nowMin <= endH * 60 ? (nowMin - startH * 60) / 60 * PX : null
  const gridCols = `52px repeat(${Math.max(cols.length, 1)}, minmax(150px, 1fr))`
  const soon = v.todayLive.filter(l => l.s > nowMin).slice(0, 3)

  const blockState = l => l.cancelled ? 'cancel' : l.e <= nowMin ? 'done' : l.s <= nowMin ? 'now' : 'next'
  const STATE_LABEL = { cancel: '취소', done: '끝남', now: '진행 중', next: '예정' }

  const showRevCol = isGymScope
  const trCols = showRevCol
    ? 'minmax(0, 1.8fr) 0.9fr 0.8fr 0.8fr 0.9fr 1fr'
    : 'minmax(0, 1.8fr) 0.9fr 0.8fr 0.8fr 0.9fr'

  return (
    <div className="db">
      {/* ── 오늘 숫자 ── */}
      <section className="db-kpis" aria-label="오늘 숫자">
        <Kpi label="오늘 수업" icon="calendar"
          value={lessonsOk ? v.todayLive.length : '—'} unit="건"
          sub={lessonsOk ? (v.todayLive.length ? `남은 수업 ${remainingToday}건` : '오늘 잡힌 수업이 없어요') : '시간표를 불러오지 못했어요'}
          onClick={() => onNavigate('schedule')} ariaLabel="오늘 수업 — 수업 예약으로 이동" />
        <Kpi label="이용 중인 회원" icon="users"
          value={v.using.length} unit="명" sub={`전체 회원 ${members.length}명`}
          onClick={() => onNavigate('members', { filter: 'active' })} ariaLabel="이용 중인 회원 — 회원 관리로 이동" />
        <Kpi label="만료 임박" icon="clock" tone="amber"
          value={v.expiring.length} unit="명"
          sub={v.expiring.length ? '재등록 안내가 필요해요' : `${EXPIRING_DAYS}일 안 · ${EXPIRING_SESSIONS}회 이하 없음`}
          onClick={() => onNavigate('members', { filter: 'expiring' })} ariaLabel="만료 임박 회원 — 회원 관리로 이동" />
        <Kpi label={`${LONG_ABSENT_DAYS}일 넘게 안 온 회원`} icon="userAway" iconTone="rose"
          value={data.absent ? data.absent.length : '—'} unit="명"
          sub={data.absent ? '회원권은 남아 있어요' : '불러오지 못했어요'}
          onClick={() => onNavigate('attendance')} ariaLabel="오래 안 온 회원 — 출석 관리로 이동" />
        <Kpi label={`${r.month}월 ${isGymScope ? '' : '내 '}매출`} icon="chart"
          value={v.net == null ? '—' : rev.num} unit={v.net == null ? '' : rev.unit}
          sub={v.net == null ? '불러오지 못했어요'
            : delta == null ? '지난달 같은 기간 기록 없음'
            : `지난달 같은 기간보다 ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}%`}
          subTone={delta == null ? '' : delta >= 0 ? 'up' : 'down'}
          onClick={() => onNavigate('revenue')} ariaLabel="이번 달 매출 — 매출 분석으로 이동" />
      </section>

      <div className="db-row">
        {/* ── 오늘 시간표 ── */}
        <section className="db-card db-wide" aria-label="오늘 시간표">
          <div className="db-card-head">
            <h2 className="db-card-title">오늘 시간표<small>트레이너별</small></h2>
            <div className="db-legend">
              <span><i className="lg-done" />끝난 수업</span>
              <span><i className="lg-next" />예정</span>
              <span><i className="lg-cancel" />취소</span>
              <button type="button" className="db-link" onClick={() => onNavigate('schedule')}>주간 보기</button>
            </div>
          </div>
          {!lessonsOk ? (
            <div className="db-empty">시간표를 불러오지 못했어요. 새로고침을 눌러 주세요.</div>
          ) : cols.length === 0 ? (
            <div className="db-empty">
              오늘 잡힌 수업이 없어요.<br />
              트레이너가 오운 앱 시간표에 수업을 넣으면 여기에 보여요.
            </div>
          ) : (
            <div className="tt-scroll">
              <div className="tt" style={{ minWidth: 52 + cols.length * 150 }}>
                <div className="tt-head" style={{ gridTemplateColumns: gridCols }}>
                  <span />
                  {cols.map(c => (
                    <div key={c.t.id} className="tt-col-head">
                      <span className="db-av" style={avStyle(c.t.id)}>{c.t.name?.[0] || '?'}</span>
                      <span className="db-who">
                        <b>{c.t.name}</b>
                        <span>{c.t.trainer_ranks?.label || EMP[c.t.employment_type] || '트레이너'}</span>
                      </span>
                      <span className="db-chip">{c.blocks.filter(b => !b.cancelled).length}건</span>
                    </div>
                  ))}
                </div>
                <div className="tt-body" style={{ gridTemplateColumns: gridCols, height: (endH - startH) * PX }}>
                  <div className="tt-hours" aria-hidden="true">
                    {Array.from({ length: endH - startH + 1 }).map((_, i) => (
                      <span key={i} className="tt-hour" style={{ top: Math.max(0, i * PX - 7) }}>{pad(startH + i)}:00</span>
                    ))}
                  </div>
                  {cols.map(c => (
                    <div key={c.t.id} className="tt-col">
                      {c.blocks.map(l => {
                        const st = blockState(l)
                        const top = (l.s - startH * 60) / 60 * PX + 2
                        const h = Math.max(26, (l.e - l.s) / 60 * PX - 4)
                        const who = l.member_name || '회원'
                        const sub = [l.start, l.product].filter(Boolean).join(' · ')
                        return (
                          <div key={l.id} className={`tt-block ${st}`}
                            style={{ top, height: h, right: 'auto',
                              left: `calc(${l.lane} * (100% - 12px) / ${l.lanes} + 6px)`,
                              width: `calc((100% - 12px) / ${l.lanes} - ${l.lanes > 1 ? 3 : 0}px)` }}
                            title={`${l.start}–${l.end || ''} ${who}${l.product ? ' · ' + l.product : ''} (${STATE_LABEL[st]})`}>
                            <span className="tt-line"><span className="tt-who">{who}</span><span className="tt-tag">{STATE_LABEL[st]}</span></span>
                            {h >= 34 && <span className="tt-sub">{sub}</span>}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  {nowTop != null && (
                    <div className="tt-now" style={{ top: nowTop }} aria-hidden="true">
                      <span>{pad(now.getHours())}:{pad(now.getMinutes())}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="db-stack">
          {/* ── 곧 시작하는 수업 ── */}
          <section className="db-card" aria-label="곧 시작하는 수업">
            <div className="db-card-head" style={{ marginBottom: 4 }}>
              <h2 className="db-card-title">곧 시작하는 수업</h2>
              <button type="button" className="db-link" onClick={() => onNavigate('attendance')}>출석 관리</button>
            </div>
            {!lessonsOk ? <div className="db-empty">불러오지 못했어요</div>
              : soon.length === 0 ? <div className="db-empty">오늘 남은 수업이 없어요</div>
              : soon.map(l => {
                const ck = checkins[l.id]
                const done = ck && !ck.busy && (CHECKIN_TEXT[ck.status] || ['확인 필요', 'bad'])
                return (
                  <div key={l.id} className="db-list-row">
                    <span className="db-time"><b>{l.start}</b><span>{untilText(l.s - nowMin)}</span></span>
                    <span className="db-who">
                      <b>{l.member_name || '회원'}</b>
                      <span>{[trainerName(l.trainer_id), l.product, l.remain != null ? `잔여 ${l.remain}회` : null].filter(Boolean).join(' · ')}</span>
                      {done && done[1] === 'bad' && (
                        <span className="db-note bad">
                          {ck.status === 'expired' ? '회원권이 끝나 입장할 수 없어요'
                            : ck.status === 'paused' ? '회원권 정지 중이에요 · 출석 관리에서 풀 수 있어요'
                            : ck.status === 'error' ? `처리하지 못했어요 (${ck.msg || '오류'})`
                            : '출석 관리에서 확인해 주세요'}
                        </span>
                      )}
                    </span>
                    {canManageAttendance && l.member_id && (
                      <button type="button" className={`db-act${done ? ' ' + done[1] : ''}`}
                        disabled={!!ck} onClick={() => checkin(l)}>
                        {ck?.busy ? '처리 중…' : done ? done[0] : '입장 처리'}
                      </button>
                    )}
                  </div>
                )
              })}
          </section>

          {/* ── 만료 임박 ── */}
          <section className="db-card" aria-label="만료가 가까운 회원">
            <div className="db-card-head" style={{ marginBottom: 4 }}>
              <h2 className="db-card-title">만료가 가까운 회원{v.expiring.length > 0 && <span className="db-pill">{v.expiring.length}</span>}</h2>
              <button type="button" className="db-link" onClick={() => onNavigate('members', { filter: 'expiring' })}>전체</button>
            </div>
            {v.expiring.length === 0 ? (
              <div className="db-empty">{EXPIRING_DAYS}일 안에 끝나거나 {EXPIRING_SESSIONS}회 이하로 남은 회원이 없어요</div>
            ) : v.expiring.slice(0, 5).map(({ m, remain, endLeft, few }) => {
              const urgent = (endLeft != null && endLeft <= 7) || (few && remain <= 1)
              return (
                <button key={m.id} type="button" className="db-list-row as-btn" onClick={() => onOpenMember(m)}>
                  <span className="db-av sm" style={urgent ? { background: '#FFE4E6', color: '#BE123C' } : { background: '#FEF3C7', color: '#92400E' }}>{m.name?.[0] || '?'}</span>
                  <span className="db-who">
                    <b>{m.name}</b>
                    <span>담당 {trainerName(m.trainer_id)}{data.statsMap[m.id]?.membership_end ? ` · ${data.statsMap[m.id].membership_end.slice(5).replace('-', '/')}까지` : ''}</span>
                  </span>
                  <span className="db-right">
                    <b>{few ? `${remain}회 남음` : '만료 예정'}</b>
                    <span>{endLeft == null ? '횟수 기준' : endLeft === 0 ? 'D-day' : `D-${endLeft}`}</span>
                  </span>
                </button>
              )
            })}
          </section>
        </div>
      </div>

      <div className="db-row">
        {/* ── 트레이너별 현황 ── */}
        <section className="db-card db-wide flush" aria-label="트레이너별 현황">
          <div className="db-card-head pad">
            <h2 className="db-card-title">트레이너별 현황<small>이번 주 {r.weekLabel}</small></h2>
            {isGymScope && <button type="button" className="db-link" onClick={() => onNavigate('settlement')}>센터 정산</button>}
          </div>
          {trainers.length === 0 ? <div className="db-empty">소속 트레이너가 없어요</div> : (
            <div className="db-table">
              <div className="db-tr head" style={{ gridTemplateColumns: trCols }}>
                <span>트레이너</span><span>고용 형태</span><span className="num">담당 회원</span>
                <span className="num">이용 중</span><span className="num">이번 주 수업</span>
                {showRevCol && <span className="num">{r.month}월 매출</span>}
              </div>
              {trainers.map(t => {
                const mine = members.filter(m => m.trainer_id === t.id)
                const act = mine.filter(m => v.status[m.id] === 'active' || v.status[m.id] === 'expiring').length
                return (
                  <div key={t.id} className="db-tr" style={{ gridTemplateColumns: trCols }}>
                    <span className="db-tr-name">
                      <span className="db-av sm" style={avStyle(t.id)}>{t.name?.[0] || '?'}</span>
                      <span className="db-who"><b>{t.name}</b><span>{t.trainer_ranks?.label || (t.role === 'owner' ? '대표' : '트레이너')}</span></span>
                    </span>
                    <span><span className="db-chip">{EMP[t.employment_type] || '미설정'}</span></span>
                    <span className="num">{mine.length}명</span>
                    <span className="num">{act}명</span>
                    <span className="num">{lessonsOk ? `${v.weekByTrainer[t.id] || 0}회` : '—'}</span>
                    {showRevCol && <span className="num strong">{moneyText(v.revByName[t.name] || 0)}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 바로 챙겨야 할 회원 ── */}
        <section className="db-card" aria-label="바로 챙겨야 할 회원">
          <div className="db-card-head" style={{ marginBottom: 0 }}>
            <h2 className="db-card-title">바로 챙겨야 할 회원</h2>
            <span className="db-card-note">이탈 위험 분석</span>
          </div>
          <div className="db-risk">
            <div className="rose"><span>이탈 임박</span><b>{v.riskCount.critical}<small>명</small></b></div>
            <div className="amber"><span>위험</span><b>{v.riskCount.risk}<small>명</small></b></div>
            <div><span>지켜보기</span><b>{v.riskCount.watch}<small>명</small></b></div>
          </div>
          {v.riskTop.length === 0 ? (
            <div className="db-empty">지금 바로 챙길 회원은 없어요</div>
          ) : v.riskTop.map(x => (
            <button key={x.member_id} type="button" className="db-list-row as-btn" onClick={() => onOpenMember(x.member)}>
              <span className="db-who">
                <b>{x.member.name}</b>
                <span>{(Array.isArray(x.flags) && typeof x.flags[0] === 'string' && x.flags[0]) || `위험 점수 ${x.risk_score}점`}</span>
              </span>
              <span className={`db-tag ${x.risk_level === 'critical' ? 'rose' : 'amber'}`}>
                {x.risk_level === 'critical' ? '이탈 임박' : '위험'}
              </span>
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}

// 상단 제목 아래 — 오늘 날짜 · 지금 시각 (1분마다 갱신)
export function DashboardSubtitle() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000)
    return () => clearInterval(t)
  }, [])
  return <>{now.getFullYear()}년 {now.getMonth() + 1}월 {now.getDate()}일 {WEEKDAY[now.getDay()]}요일 · 지금 {pad(now.getHours())}:{pad(now.getMinutes())}</>
}
