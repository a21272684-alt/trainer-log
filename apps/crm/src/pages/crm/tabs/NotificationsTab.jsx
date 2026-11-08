import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import CrmIcon from '../components/CrmIcon'
import TopbarActions from '../components/TopbarActions'
import { passSummary, fmtDot, LONG_ABSENT_DAYS, EXPIRING_DAYS, EXPIRING_SESSIONS } from '../lib/memberFilters'

// ── 알림 발송 ───────────────────────────────────────────────────
// 챙겨야 할 회원을 골라 회원 앱으로 보낼 안내를 만든다.
// 아직 발송이 연결되지 않아 보내기 버튼은 잠겨 있다 (회원 앱 알림 연결 후 열 예정).

const TYPES = [
  { key: 'expiring', label: '만료 임박', tone: '#92400E',
    desc: `${EXPIRING_SESSIONS}회 이하로 남았거나 ${EXPIRING_DAYS}일 안에 끝나는 회원`,
    msg: gym => `${gym}에서 안내드려요. {이름} 회원님의 회원권이 곧 끝나요. 재등록을 원하시면 데스크나 담당 트레이너에게 편하게 말씀해 주세요.` },
  { key: 'expired', label: '횟수 소진', tone: '#BE123C',
    desc: '남은 횟수와 기간이 모두 끝난 회원',
    msg: gym => `${gym}에서 안내드려요. {이름} 회원님, 수업 횟수를 모두 쓰셨어요. 다시 함께 운동하고 싶으시면 편하게 말씀해 주세요.` },
  { key: 'risk', label: '이탈 위험', tone: '#BE123C',
    desc: '이탈 위험 분석에서 위험 이상',
    msg: gym => `${gym}에서 안부 전해요. {이름} 회원님, 요즘 운동은 어떠세요? 궁금하거나 불편한 점이 있으면 편하게 말씀해 주세요.` },
  { key: 'inactive', label: '오래 안 옴', tone: 'var(--text)',
    desc: `${LONG_ABSENT_DAYS}일 넘게 출석이 없는 회원`,
    msg: gym => `${gym}에서 안부 전해요. {이름} 회원님, 오랫동안 뵙지 못했네요. 건강하게 지내고 계신가요? 다시 함께 운동해요.` },
]

const TOKENS = [
  ['{이름}', '회원 이름'],
  ['{남은횟수}', '남은 횟수'],
  ['{만료일}', '만료일'],
]

export default function NotificationsTab({ gymId, gymName, members, trainers }) {
  const [statsMap,  setStatsMap]  = useState({})
  const [riskMap,   setRiskMap]   = useState({})
  const [absentMap, setAbsentMap] = useState({})
  const [active,    setActive]    = useState('expiring')
  const [selected,  setSelected]  = useState(new Set())
  const [message,   setMessage]   = useState('')
  const textRef = useRef(null)
  const center  = gymName || '센터'

  useEffect(() => {
    if (!gymId) return
    let alive = true
    Promise.all([
      supabase.rpc('crm_member_stats', { p_gym_id: gymId }),
      supabase.rpc('crm_long_absent', { p_gym_id: gymId, p_days: LONG_ABSENT_DAYS }),
      members.length
        ? supabase.from('member_risk_scores').select('member_id, risk_level, risk_score').in('member_id', members.map(m => m.id))
        : Promise.resolve({ data: [] }),
    ]).then(([s, a, r]) => {
      if (!alive) return
      if (s.error) console.error('[crm_member_stats]', s.error)
      if (a.error) console.error('[crm_long_absent]', a.error)
      setStatsMap(Object.fromEntries((s.data || []).map(x => [x.member_id, x])))
      setAbsentMap(Object.fromEntries((a.data || []).map(x => [x.member_id, x])))
      setRiskMap(Object.fromEntries((r.data || []).map(x => [x.member_id, x])))
    })
    return () => { alive = false }
  }, [gymId, members])

  const groups = useMemo(() => {
    const trainerName = id => trainers.find(t => t.id === id)?.name
    const out = { expiring: [], expired: [], risk: [], inactive: [] }
    members.forEach(m => {
      const p = passSummary(m, statsMap[m.id])
      const sub = [p.passName || (p.status === 'none' ? '결제 전' : '회원권'), trainerName(m.trainer_id) && `담당 ${trainerName(m.trainer_id)}`].filter(Boolean).join(' · ')
      const base = { m, p, sub }
      if (p.status === 'expiring') {
        out.expiring.push({ ...base, sort: p.endLeft ?? 999, right: p.dLabel || `${p.remain}회 남음` })
      }
      if (p.status === 'expired') out.expired.push({ ...base, sort: 0, right: '끝남' })
      const risk = riskMap[m.id]
      if (risk && (risk.risk_level === 'risk' || risk.risk_level === 'critical')) {
        out.risk.push({ ...base, sort: -risk.risk_score, right: `${risk.risk_score}점` })
      }
      const away = absentMap[m.id]
      if (away) out.inactive.push({ ...base, sort: -(away.days ?? 9999), right: away.days != null ? `${away.days}일째` : '방문 없음' })
    })
    Object.values(out).forEach(list => list.sort((a, b) => (a.sort - b.sort) || (a.m.name || '').localeCompare(b.m.name || '', 'ko')))
    return out
  }, [members, trainers, statsMap, riskMap, absentMap])

  const targets  = groups[active]
  const type     = TYPES.find(t => t.key === active)
  const picked   = targets.filter(t => selected.has(t.m.id))

  // 대상 묶음이 바뀌면 안내 문구를 바꾸고 전체를 고른다
  useEffect(() => { setMessage(type.msg(center)) }, [active, center]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected(new Set(targets.map(t => t.m.id))) }, [targets])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function insertToken(token) {
    const el = textRef.current
    const at = el ? el.selectionStart : message.length
    const end = el ? el.selectionEnd : message.length
    setMessage(message.slice(0, at) + token + message.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = at + token.length
    })
  }

  // 미리보기는 고른 회원 중 첫 번째 기준
  const sample = picked[0] || targets[0]
  const preview = message
    .replaceAll('{이름}', sample?.m.name || '홍길동')
    .replaceAll('{남은횟수}', sample ? `${sample.p.remain}회` : '3회')
    .replaceAll('{만료일}', sample?.p.endDate ? fmtDot(sample.p.endDate) : '2026.12.31')

  return (
    <div className="nt">
      <TopbarActions>
        <span className="nt-soon">발송 연결 준비 중</span>
      </TopbarActions>

      <section className="nt-types" aria-label="보낼 대상">
        {TYPES.map(t => (
          <button key={t.key} type="button" className={`nt-type ${active === t.key ? 'on' : ''}`} aria-pressed={active === t.key}
            onClick={() => setActive(t.key)}>
            <span className="nt-type-top">
              <b>{t.label}</b>
              <em style={{ color: groups[t.key].length ? t.tone : 'var(--text-dim)' }}>{groups[t.key].length}명</em>
            </span>
            <span className="nt-type-desc">{t.desc}</span>
          </button>
        ))}
      </section>

      <div className="nt-layout">
        <section className="nt-people" aria-label="받는 회원">
          <div className="nt-people-head">
            <h2>받는 회원 <span>{targets.length}명 중 {picked.length}명 선택</span></h2>
            <span className="nt-people-acts">
              <button type="button" onClick={() => setSelected(new Set(targets.map(t => t.m.id)))}>전체 선택</button>
              <button type="button" onClick={() => setSelected(new Set())}>해제</button>
            </span>
          </div>
          {targets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CrmIcon name="users" size={30} /></div>
              <div className="empty-state-text">{type.label} 회원이 없어요</div>
            </div>
          ) : (
            <div className="nt-people-list">
              {targets.map(({ m, sub, right }) => (
                <label key={m.id} className="nt-person">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  <span className="nt-person-text">
                    <b>{m.name}</b>
                    <small>{sub}</small>
                  </span>
                  <em>{right}</em>
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="nt-right">
          <section className="nt-compose" aria-label="메시지">
            <div className="nt-write">
              <label htmlFor="nt-msg">메시지</label>
              <textarea id="nt-msg" ref={textRef} rows={6} value={message} onChange={e => setMessage(e.target.value)} />
              <div className="nt-tokens">
                {TOKENS.map(([token, label]) => (
                  <button key={token} type="button" onClick={() => insertToken(token)}>+ {label}</button>
                ))}
              </div>
              <div className="nt-send">
                <span>회원 앱 알림이 연결되면 보낼 수 있어요</span>
                <button type="button" className="btn btn-primary btn-lg" disabled>{picked.length}명에게 보내기</button>
              </div>
            </div>
            <div className="nt-phone" aria-label="회원 앱에서 보이는 모습">
              <span className="nt-phone-cap">회원 앱에서 이렇게 보여요</span>
              <div className="nt-bubble">
                <div className="nt-bubble-top">
                  <span className="nt-bubble-logo" aria-hidden="true">운</span>
                  <b>오운 · {center}</b>
                  <em>지금</em>
                </div>
                <p>{preview || '메시지를 입력하면 여기에 보여요'}</p>
              </div>
            </div>
          </section>

          <section className="nt-history" aria-label="보낸 기록">
            <h2>보낸 기록</h2>
            <div className="rev-empty">아직 보낸 알림이 없어요. 발송이 연결되면 여기에 쌓여요.</div>
          </section>
        </div>
      </div>
    </div>
  )
}
