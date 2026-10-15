import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from './CrmToast'
import { todayStr } from '../lib/ticketDateCalc'
import { pt, couponCond, errText, LEDGER_KIND } from '../lib/benefits'

// ── 회원 상세 · 혜택 ─────────────────────────────────────────────
// 보유 마일리지·쿠폰·마일리지 내역. 쿠폰 발급·직접 조정은 권한자만 (RPC 가 다시 검사).

const mono = { fontFamily: "'DM Mono', monospace" }
const md = d => String(d).slice(5, 10).replace('-', '/')
const mdAt = iso => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` }

export default function MemberBenefitsPanel({ member, gymId, version }) {
  const showToast = useToast()
  const [data, setData]       = useState(null)
  const [coupons, setCoupons] = useState([])   // 발급 가능한 쿠폰 종류
  const [mode, setMode]       = useState('')   // '' | 'issue' | 'adjust'
  const [pick, setPick]       = useState('')
  const [delta, setDelta]     = useState('')
  const [sign, setSign]       = useState(1)
  const [memo, setMemo]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => { load() }, [member.id, version]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data: d, error: e } = await supabase.rpc('crm_member_benefits', { p_member_id: member.id })
    if (e) { console.error('[crm_member_benefits]', e); setData({ error: true }); return }
    setData(d)
    if (d?.can_manage) {
      const { data: list } = await supabase.rpc('crm_coupon_list', { p_gym_id: gymId })
      setCoupons((list || []).filter(c => c.active && (!c.valid_until || c.valid_until >= todayStr())))
    }
  }

  function open(next) { setMode(mode === next ? '' : next); setError(''); setPick(''); setDelta(''); setMemo(''); setSign(1) }

  async function issue() {
    if (!pick) return setError('발급할 쿠폰을 골라주세요.')
    setBusy(true); setError('')
    const { error: e } = await supabase.rpc('crm_issue_coupon', { p_coupon_id: pick, p_member_ids: [member.id] })
    setBusy(false)
    if (e) return setError(errText(e))
    showToast?.('쿠폰을 발급했어요'); setMode(''); load()
  }

  async function adjust() {
    const n = Math.floor(Number(delta))
    if (!(n > 0)) return setError('포인트를 입력해주세요.')
    if (!memo.trim()) return setError('조정 사유를 적어주세요.')
    setBusy(true); setError('')
    const { error: e } = await supabase.rpc('crm_mileage_adjust', { p_member_id: member.id, p_delta: sign * n, p_memo: memo.trim() })
    setBusy(false)
    if (e) return setError(errText(e))
    showToast?.(`마일리지 ${sign > 0 ? '+' : '−'}${pt(n)} 조정했어요`); setMode(''); load()
  }

  if (!data) return <div className="rev-empty">불러오는 중…</div>
  if (data.error) return <div className="rev-empty">혜택 정보를 불러오지 못했어요</div>
  const nearest = data.coupons[0]?.expires_at

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="bn-grid2">
        <div className="bn-stat lime">
          <div className="bn-stat-label" style={{ color: '#4D6A00' }}>마일리지</div>
          <div className="bn-stat-value">{pt(data.balance)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {data.expiring_30 > 0 ? `30일 안에 소멸 예정 ${pt(data.expiring_30)}` : data.settings?.enabled ? '곧 소멸될 포인트 없음' : '센터에서 마일리지 꺼짐'}
          </div>
        </div>
        <div className="bn-stat">
          <div className="bn-stat-label">사용 가능 쿠폰</div>
          <div className="bn-stat-value">{data.coupons.length}장</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{nearest ? `가장 빠른 만료 ${md(nearest)}` : '보유 쿠폰 없음'}</div>
        </div>
      </div>

      {data.can_manage && (
        <>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className={`bn-mini ${mode === 'issue' ? 'strong' : ''}`} onClick={() => open('issue')}>+ 쿠폰 발급</button>
            <button className={`bn-mini ${mode === 'adjust' ? 'strong' : ''}`} onClick={() => open('adjust')}>마일리지 직접 조정</button>
          </div>
          {mode === 'issue' && (
            <div className="pause-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {coupons.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>발급할 수 있는 쿠폰이 없어요. 쿠폰·마일리지 탭에서 먼저 만들어주세요.</div>
              ) : (
                <select className="input" aria-label="발급할 쿠폰" value={pick} onChange={e => setPick(e.target.value)}>
                  <option value="">쿠폰 선택</option>
                  {coupons.map(c => <option key={c.id} value={c.id}>{c.name} · {couponCond(c)}</option>)}
                </select>
              )}
              {error && <div className="pause-error" role="alert">{error}</div>}
              <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={busy || !pick} onClick={issue}>{busy ? '발급 중…' : '발급'}</button>
            </div>
          )}
          {mode === 'adjust' && (
            <div className="pause-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className={`filter-chip ${sign > 0 ? 'active' : ''}`} onClick={() => setSign(1)}>+ 지급</button>
                <button type="button" className={`filter-chip ${sign < 0 ? 'active' : ''}`} onClick={() => setSign(-1)}>− 차감</button>
                <input className="input" type="number" min={1} style={{ ...mono, textAlign: 'right', flex: 1 }} aria-label="조정할 포인트" placeholder="포인트" value={delta} onChange={e => setDelta(e.target.value)} />
              </div>
              <input className="input" maxLength={80} placeholder="사유 (예: 이벤트 보상, 오적립 정정)" aria-label="조정 사유" value={memo} onChange={e => setMemo(e.target.value)} />
              {error && <div className="pause-error" role="alert">{error}</div>}
              <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={busy} onClick={adjust}>{busy ? '저장 중…' : '조정 저장'}</button>
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: '13px', fontWeight: 700 }}>보유 쿠폰</div>
      {data.coupons.length === 0 ? <div className="rev-empty" style={{ padding: '6px 0', textAlign: 'left' }}>보유한 쿠폰이 없어요</div>
        : data.coupons.map(mc => (
          <div key={mc.id} className="pause-row" style={{ padding: '9px 12px', fontSize: '12px' }}>
            <span style={{ minWidth: 0 }}><b>{mc.coupon.name}</b> <span style={{ color: 'var(--text-muted)' }}>· {couponCond(mc.coupon)}</span></span>
            <span style={{ ...mono, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>~{md(mc.expires_at)}</span>
          </div>
        ))}

      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>마일리지 내역</div>
      {data.ledger.length === 0 ? <div className="rev-empty" style={{ padding: '6px 0', textAlign: 'left' }}>내역이 없어요</div>
        : data.ledger.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ ...mono, color: 'var(--text-muted)' }}>{mdAt(l.at)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{LEDGER_KIND[l.kind]}{l.memo ? ` · ${l.memo}` : ''}{l.by ? ` (${l.by})` : ''}</span>
            <span style={{ ...mono, whiteSpace: 'nowrap', color: l.delta > 0 ? '#3F6212' : l.delta < 0 ? '#B42318' : 'var(--text-muted)' }}>
              {l.kind === 'coupon_issue' ? '쿠폰' : (l.delta > 0 ? '+' : l.delta < 0 ? '−' : '') + pt(Math.abs(l.delta))}
            </span>
          </div>
        ))}
    </div>
  )
}
