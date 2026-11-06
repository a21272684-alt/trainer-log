import AdminIcon from '../components/AdminIcon'
import { Badge, Switch } from '../components/ui'

// 플랜 · 기능 권한 — 예전엔 '플랜 안내(앱에 보이는 문구)'와 '기능 권한(실제로 열리는 기능)'이 따로 있어서
// 문구는 "회원 무제한"인데 실제 제한은 5명 같은 어긋남이 생겨도 알기 어려웠음 → 한 화면 + 어긋남 경고.

const TIERS = [
  { id: 'free', label: '무료' },
  { id: 'pro', label: 'Pro' },
  { id: 'premium', label: 'Premium' },
]
const UNLIMITED = 9999
const limitText = (n) => (Number(n) >= UNLIMITED ? '무제한' : `${Number(n) || 0}명`)

// 플랜 카드 문구에서 '회원 N명 / 회원 무제한'을 읽어 실제 제한과 비교
function findMismatches(plans, gates) {
  const out = []
  for (const p of plans) {
    const g = gates[p.id]
    if (!g || p.enabled === false) continue
    for (const f of p.features || []) {
      const m = String(f).match(/회원[^0-9무]*(무제한|(\d+)\s*명)/)
      if (!m) continue
      const cardUnlimited = m[1] === '무제한'
      const cardN = cardUnlimited ? UNLIMITED : Number(m[2])
      const real = Number(g.member_limit ?? 0)
      const same = cardUnlimited ? real >= UNLIMITED : real === cardN
      if (!same) out.push({ plan: p, text: f, real })
    }
  }
  return out
}

export default function PlansPage({
  plans, planGuideVisible, onToggleVisible, onTogglePlan, onEditPlan,
  featureGates, featureDefs, onToggleGate, onSetMemberLimit, onSaveMemberLimit,
}) {
  const mismatches = findMismatches(plans, featureGates)

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">구독·매출</p>
          <h1 className="adm-page-title">플랜 · 기능 권한</h1>
        </div>
        <label className="adm-inline-switch">
          <span>트레이너 앱에 플랜 안내 보이기</span>
          <Switch checked={planGuideVisible} onChange={onToggleVisible} label="플랜 안내 보이기" />
        </label>
      </header>

      {mismatches.length > 0 && (
        <div className="adm-alert" role="alert">
          <AdminIcon name="alert" size={18} strokeWidth={2.2} />
          <div>
            <b>안내 문구와 실제 권한이 달라요</b>
            <ul>
              {mismatches.map((x, i) => (
                <li key={i}>{x.plan.name} 카드엔 “{x.text}”라고 적혀 있는데, 실제 회원 제한은 <b>{limitText(x.real)}</b>이에요.
                  <button type="button" className="adm-link" onClick={() => onEditPlan(x.plan)}>문구 고치기</button></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section>
        <p className="adm-section-label" style={{ margin: '0 0 8px' }}>앱에 보이는 플랜 안내</p>
        <div className="adm-plan-grid">
          {plans.map(p => {
            const on = p.enabled !== false
            return (
              <article key={p.id} className={`adm-plan-card${on ? '' : ' is-off'}${p.highlight ? ' is-highlight' : ''}`}>
                <div className="adm-plan-top">
                  <div>
                    <div className="adm-plan-name">{p.name} {p.badge && <Badge tone={p.highlight ? 'lime' : 'blue'}>{p.badge}</Badge>} {p.current && <Badge tone="muted">현재 플랜</Badge>}</div>
                    <div className="adm-plan-price">{p.price}</div>
                  </div>
                  <Switch checked={on} onChange={() => onTogglePlan(p.id)} label={`${p.name} 안내 보이기`} />
                </div>
                <ul className="adm-plan-feats">{(p.features || []).map(f => <li key={f}><AdminIcon name="check" size={14} strokeWidth={2.4} />{f}</li>)}</ul>
                {featureGates[p.id] && <p className="adm-plan-real">실제 회원 제한 <b>{limitText(featureGates[p.id].member_limit)}</b></p>}
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => onEditPlan(p)}>문구 수정</button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="adm-table">
        <div className="adm-tr adm-th adm-cols-gates">
          <div>기능</div><div>설명</div>{TIERS.map(t => <div key={t.id} style={{ textAlign: 'center' }}>{t.label}</div>)}
        </div>
        {featureDefs.map(fd => (
          <div key={fd.key} className="adm-tr adm-cols-gates">
            <span className="adm-num" style={{ fontWeight: 700 }}>{fd.label}</span>
            <span className="adm-cell-sub" style={{ marginTop: 0 }}>{fd.desc}</span>
            {TIERS.map(t => (
              <span key={t.id} style={{ display: 'flex', justifyContent: 'center' }}>
                <Switch checked={!!featureGates[t.id]?.[fd.key]} onChange={() => onToggleGate(t.id, fd.key)} label={`${t.label} ${fd.label}`} />
              </span>
            ))}
          </div>
        ))}
        <div className="adm-tr adm-cols-gates" style={{ background: '#FAFBF7' }}>
          <span className="adm-num" style={{ fontWeight: 700 }}>최대 회원 수</span>
          <span className="adm-cell-sub" style={{ marginTop: 0 }}>9999 = 무제한 · 입력 후 칸을 벗어나면 저장</span>
          {TIERS.map(t => (
            <span key={t.id} style={{ display: 'flex', justifyContent: 'center' }}>
              <input className="adm-input adm-input--sm" type="number" min="0" aria-label={`${t.label} 최대 회원 수`}
                value={featureGates[t.id]?.member_limit ?? 0}
                onChange={e => onSetMemberLimit(t.id, e.target.value)} onBlur={onSaveMemberLimit} />
            </span>
          ))}
        </div>
      </section>
      <p className="adm-foot-note">스위치를 누르면 바로 저장되고 트레이너 앱에 즉시 반영돼요. AI 수업일지는 권한이 꺼져 있어도 무료 횟수(크레딧) 안에서는 쓸 수 있어요.</p>
    </div>
  )
}
