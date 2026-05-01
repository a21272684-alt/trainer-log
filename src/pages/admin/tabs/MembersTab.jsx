import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import { computeRiskScore, RISK_LEVELS } from '../lib/churnRisk'

const mono = { fontFamily: "'DM Mono', monospace" }
const krw  = n => Number(n||0).toLocaleString() + '원'

function RiskBadge({ riskRow }) {
  if (!riskRow) return <span style={{ color:'var(--text-dim)', fontSize:'11px' }}>미분석</span>
  const lvl = RISK_LEVELS[riskRow.risk_level]
  if (!lvl) return null
  return (
    <div>
      <span className="badge" style={{ background:lvl.bg, color:lvl.color, border:`1px solid ${lvl.color}33` }}>{lvl.emoji} {lvl.label}</span>
      <div className="risk-bar" style={{ width:'60px', marginTop:'4px' }}>
        <div className="risk-bar-fill" style={{ width:`${riskRow.risk_score}%`, background:lvl.color }} />
      </div>
    </div>
  )
}

function MemberDetailModal({ member, trainer, gymId, onClose }) {
  const [tab, setTab] = useState('info')
  const [payments, setPayments] = useState([])
  const [lockers,  setLockers]  = useState([])
  const [riskData, setRiskData] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [newLocker, setNewLocker] = useState({ rental_type:'locker', locker_number:'', uniform_size:'', memo:'' })
  const [showLockerForm, setShowLockerForm] = useState(false)
  const showToast = useToast()

  const remain = Math.max(0, (member.total_sessions||0) - (member.done_sessions||0))
  const pct    = member.total_sessions > 0 ? Math.round(member.done_sessions / member.total_sessions * 100) : 0

  useEffect(() => {
    loadPayments()
    loadLockers()
    loadRisk()
  }, [member.id])

  async function loadPayments() {
    const { data } = await supabase.from('payments').select('*, products(name)')
      .eq('member_id', member.id).order('paid_at', { ascending: false })
    setPayments(data || [])
  }

  async function loadLockers() {
    const { data } = await supabase.from('locker_rentals')
      .select('*').eq('member_id', member.id).order('created_at', { ascending: false })
    setLockers(data || [])
  }

  async function loadRisk() {
    const { data } = await supabase.from('member_risk_scores')
      .select('*').eq('member_id', member.id).maybeSingle()
    setRiskData(data)
  }

  async function analyzeRisk() {
    setAnalyzing(true)
    try {
      const [logsRes, healthRes, attendRes] = await Promise.all([
        supabase.from('logs').select('*').eq('member_id', member.id).order('created_at',{ascending:false}).limit(100),
        supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date',{ascending:false}).limit(60),
        supabase.from('attendance').select('*').eq('member_id', member.id),
      ])
      const r = computeRiskScore(member, logsRes.data||[], healthRes.data||[], attendRes.data||[])
      await supabase.from('member_risk_scores').upsert({
        member_id: member.id, trainer_id: member.trainer_id,
        attend_score: r.attendScore, health_score: r.healthScore, rating_score: r.ratingScore,
        risk_score: r.riskScore, risk_level: r.riskLevel, flags: r.flags,
      }, { onConflict: 'member_id' })
      setRiskData({ ...r, risk_score: r.riskScore, risk_level: r.riskLevel })
      showToast('✓ 분석 완료')
    } catch(e) { showToast('오류: ' + e.message) }
    finally { setAnalyzing(false) }
  }

  async function addLocker() {
    if (!newLocker.rental_type) return
    const { error } = await supabase.from('locker_rentals').insert({
      gym_id: gymId, member_id: member.id, trainer_id: member.trainer_id,
      ...newLocker, start_date: new Date().toISOString().slice(0,10),
    })
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 대여 등록 완료')
    setShowLockerForm(false)
    setNewLocker({ rental_type:'locker', locker_number:'', uniform_size:'', memo:'' })
    loadLockers()
  }

  async function returnItem(id) {
    await supabase.from('locker_rentals').update({ returned_at: new Date().toISOString(), end_date: new Date().toISOString().slice(0,10) }).eq('id', id)
    showToast('✓ 반납 처리 완료')
    loadLockers()
  }

  const TABS = [
    { key:'info',    label:'기본 정보' },
    { key:'payment', label:'결제 내역' },
    { key:'locker',  label:'대여 현황' },
    { key:'risk',    label:'이탈 위험' },
  ]

  return (
    <div>
      {/* 탭 헤더 */}
      <div style={{ display:'flex', gap:'4px', marginBottom:'16px', borderBottom:'1px solid var(--border)', paddingBottom:'12px' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding:'5px 12px', borderRadius:'6px', border:'none', fontSize:'11px', fontWeight:600, cursor:'pointer', fontFamily:'inherit',
              background: tab===t.key ? 'var(--accent)' : 'var(--surface2)',
              color: tab===t.key ? '#0a0a0a' : 'var(--text-muted)' }}
          >{t.label}</button>
        ))}
      </div>

      {/* 기본 정보 탭 */}
      {tab === 'info' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px', marginBottom:'16px' }}>
            {[['전화번호', member.phone||'—'], ['담당 트레이너', trainer?.name??'—'], ['운동 목적', member.lesson_purpose||'—'], ['방문 경로', member.visit_source||'—']].map(([k,v]) => (
              <div key={k} style={{ background:'var(--surface2)', borderRadius:'8px', padding:'10px 12px' }}>
                <div style={{ color:'var(--text-dim)', fontSize:'10px', marginBottom:'3px' }}>{k}</div>
                <div style={{ fontWeight:500 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">세션 현황</div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'8px' }}>
              <span style={{ color:'var(--text-muted)' }}>{member.done_sessions}회 완료 / {member.total_sessions}회 전체</span>
              <span style={{ ...mono, color: remain===0?'var(--text-dim)':remain<=3?'var(--orange)':'var(--accent)', fontWeight:700 }}>잔여 {remain}회</span>
            </div>
            <div style={{ height:'6px', borderRadius:'3px', background:'var(--border)' }}>
              <div style={{ height:'100%', borderRadius:'3px', width:`${pct}%`, background: remain===0?'var(--text-dim)':'var(--accent)', transition:'width 0.4s' }} />
            </div>
          </div>
        </div>
      )}

      {/* 결제 내역 탭 */}
      {tab === 'payment' && (
        <div>
          {payments.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">결제 내역이 없어요</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>날짜</th><th>상품</th><th style={{ textAlign:'right' }}>금액</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize:'11px', color:'var(--text-muted)' }}>{p.paid_at?.slice(0,10)}</td>
                    <td style={{ fontSize:'12px' }}>{p.product_name || p.products?.name || '—'}<br /><span style={{ fontSize:'10px', color:'var(--text-dim)' }}>{p.session_count}회권</span></td>
                    <td style={{ textAlign:'right', ...mono, color:'var(--accent)', fontWeight:700 }}>{krw(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 대여 현황 탭 */}
      {tab === 'locker' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>락커 · 운동복 대여 현황</div>
            <button className="btn btn-primary" style={{ padding:'5px 10px', fontSize:'11px' }} onClick={() => setShowLockerForm(v => !v)}>+ 대여 등록</button>
          </div>
          {showLockerForm && (
            <div className="card" style={{ marginBottom:'12px' }}>
              <div className="card-title">신규 대여 등록</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
                <div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>대여 종류</div>
                  <select className="input" value={newLocker.rental_type} onChange={e => setNewLocker(v=>({...v, rental_type:e.target.value}))}>
                    <option value="locker">락커</option>
                    <option value="uniform">운동복</option>
                  </select>
                </div>
                {newLocker.rental_type === 'locker'
                  ? <div><div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>락커 번호</div>
                      <input className="input" placeholder="예: A-12" value={newLocker.locker_number} onChange={e => setNewLocker(v=>({...v, locker_number:e.target.value}))} /></div>
                  : <div><div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>사이즈</div>
                      <select className="input" value={newLocker.uniform_size} onChange={e => setNewLocker(v=>({...v, uniform_size:e.target.value}))}>
                        <option value="">선택</option>
                        {['XS','S','M','L','XL','XXL'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                }
              </div>
              <input className="input" placeholder="메모 (선택)" value={newLocker.memo} onChange={e => setNewLocker(v=>({...v,memo:e.target.value}))} style={{ marginBottom:'8px' }} />
              <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={addLocker}>등록</button>
            </div>
          )}
          {lockers.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🔒</div><div className="empty-state-text">대여 내역이 없어요</div></div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {lockers.map(l => (
                <div key={l.id} style={{ background:'var(--surface2)', borderRadius:'10px', padding:'12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:600 }}>
                      {l.rental_type === 'locker' ? `🔒 락커 ${l.locker_number||'—'}` : `👕 운동복 ${l.uniform_size||'—'}`}
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'2px' }}>
                      {l.start_date} ~ {l.end_date || '사용 중'}
                      {l.memo && ` · ${l.memo}`}
                    </div>
                  </div>
                  {!l.returned_at
                    ? <button className="btn btn-secondary" style={{ padding:'4px 10px', fontSize:'11px' }} onClick={() => returnItem(l.id)}>반납</button>
                    : <span style={{ fontSize:'11px', color:'var(--text-dim)' }}>반납 완료</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 이탈 위험 탭 */}
      {tab === 'risk' && (
        <div>
          {riskData ? (() => {
            const lvl = RISK_LEVELS[riskData.risk_level]
            return lvl ? (
              <div>
                <div style={{ background:lvl.bg, border:`1px solid ${lvl.color}44`, borderRadius:'10px', padding:'16px', marginBottom:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:'28px', marginBottom:'4px' }}>{lvl.emoji}</div>
                  <div style={{ ...mono, fontSize:'32px', fontWeight:800, color:lvl.color }}>{riskData.risk_score}<span style={{ fontSize:'13px', color:'var(--text-dim)' }}>/100</span></div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:lvl.color, marginTop:'2px' }}>{lvl.label}</div>
                </div>
                {[['출석 위험도', riskData.attend_score, 40, 'var(--orange)'],
                  ['건강기록 중단', riskData.health_score, 30, 'var(--yellow)'],
                  ['수업 평점 저하', riskData.rating_score, 30, 'var(--purple)']].map(([label, score, max, color]) => score !== undefined && (
                  <div key={label} style={{ marginBottom:'8px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'var(--text-muted)', marginBottom:'3px' }}>
                      <span>{label}</span><span style={{ ...mono, color, fontWeight:700 }}>{score} / {max}</span>
                    </div>
                    <div style={{ height:'4px', borderRadius:'2px', background:'var(--surface2)' }}>
                      <div style={{ height:'100%', borderRadius:'2px', width:`${Math.round(score/max*100)}%`, background:color }} />
                    </div>
                  </div>
                ))}
                {(riskData.flags||[]).map((f,i) => (
                  <div key={i} style={{ display:'flex', gap:'6px', fontSize:'11px', color:'var(--orange)', background:'rgba(249,115,22,0.06)', border:'1px solid rgba(249,115,22,0.2)', borderRadius:'6px', padding:'6px 10px', marginBottom:'4px' }}>
                    <span>⚠</span><span>{f}</span>
                  </div>
                ))}
              </div>
            ) : null
          })() : (
            <div style={{ textAlign:'center', padding:'20px', color:'var(--text-dim)', fontSize:'12px' }}>분석 전입니다. 아래 버튼을 눌러 분석해주세요.</div>
          )}
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:'12px' }} onClick={analyzeRisk} disabled={analyzing}>
            {analyzing ? <><span className="spinner">✦</span> 분석 중...</> : '📊 이탈 위험 분석'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function MembersTab({ members: membersProp, trainers, gymId }) {
  const showToast = useToast()
  const [localMembers, setLocalMembers] = useState(membersProp)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [riskMap,  setRiskMap]  = useState({})
  const [selected, setSelected] = useState(null)

  // ── 신규 회원 등록 모달 상태 ──
  const [addModal,  setAddModal]  = useState(false)
  const [addForm,   setAddForm]   = useState({ name: '', phone: '', trainer_id: '' })
  const [addError,  setAddError]  = useState('')
  const [saving,    setSaving]    = useState(false)

  // 부모에서 members prop이 교체되면 동기화 (초기 로드 등)
  useEffect(() => { setLocalMembers(membersProp) }, [membersProp])

  useEffect(() => { loadRiskScores() }, [localMembers])

  async function loadRiskScores() {
    if (!localMembers.length) return
    const { data } = await supabase.from('member_risk_scores').select('*').in('member_id', localMembers.map(m => m.id))
    const map = {}
    ;(data||[]).forEach(r => { map[r.member_id] = r })
    setRiskMap(map)
  }

  // 재직 중인 트레이너만 선택 가능 (employment_status 미설정 레거시 포함)
  const activeTrainers = trainers.filter(t => !t.employment_status || t.employment_status === 'active')

  function openAddModal() {
    setAddForm({ name: '', phone: '', trainer_id: activeTrainers[0]?.id ?? '' })
    setAddError('')
    setAddModal(true)
  }

  async function handleAdd() {
    const name  = addForm.name.trim()
    const phone = addForm.phone.trim()
    if (!name)               { setAddError('이름을 입력해주세요.'); return }
    if (!phone)              { setAddError('연락처를 입력해주세요.'); return }
    if (!addForm.trainer_id) { setAddError('담당 트레이너를 선택해주세요.'); return }

    setSaving(true)
    setAddError('')
    try {
      // ── 중복 방어: 같은 gym 내 동일 phone ──
      const { data: dup } = await supabase
        .from('members').select('id').eq('gym_id', gymId).eq('phone', phone).maybeSingle()
      if (dup) { setAddError('이미 등록된 연락처입니다.'); return }

      // ── INSERT ──
      const { data: inserted, error } = await supabase
        .from('members')
        .insert({ name, phone, trainer_id: addForm.trainer_id, gym_id: gymId })
        .select().single()
      if (error) { setAddError('오류: ' + error.message); return }

      showToast(`✓ ${inserted.name} 회원이 등록됐어요`)
      // 즉시 로컬 상태 앞에 추가 (await load() 없음)
      setLocalMembers(prev => [inserted, ...prev])
      setAddModal(false)
    } finally {
      setSaving(false)
    }
  }

  const filtered = localMembers
    .filter(m => {
      const rem  = Math.max(0,(m.total_sessions||0)-(m.done_sessions||0))
      const risk = riskMap[m.id]
      if (filter==='active')   return rem > 0
      if (filter==='expiring') return rem <= 3 && rem > 0
      if (filter==='risk')     return risk && (risk.risk_level==='risk'||risk.risk_level==='critical')
      if (filter==='expired')  return rem === 0
      return true
    })
    .filter(m => !search || m.name.includes(search) || (m.phone||'').includes(search))
    .sort((a,b) => (riskMap[b.id]?.risk_score??-1) - (riskMap[a.id]?.risk_score??-1))

  return (
    <div>
      <div className="filter-bar">
        <div className="search-bar" style={{ maxWidth:'240px' }}>
          <span className="search-icon">🔍</span>
          <input className="input" placeholder="이름·전화번호 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {[['all','전체'],['active','진행 중'],['expiring','만료 예정'],['risk','이탈 위험'],['expired','세션 소진']].map(([v,l]) => (
          <button key={v} className={`filter-chip ${filter===v?'active':''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:'12px', color:'var(--text-dim)' }}>{filtered.length}명</span>
        <button className="btn btn-primary" style={{ padding:'6px 14px', fontSize:'12px', flexShrink:0 }} onClick={openAddModal}>
          + 신규 회원 등록
        </button>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">해당하는 회원이 없어요</div></div>
        ) : (
          <table className="data-table">
            <thead><tr>
              <th>회원</th><th>담당 트레이너</th>
              <th style={{ textAlign:'right' }}>세션 현황</th>
              <th style={{ textAlign:'right' }}>잔여</th>
              <th>이탈 위험도</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.map(m => {
                const remain = Math.max(0,(m.total_sessions||0)-(m.done_sessions||0))
                const pct    = m.total_sessions > 0 ? Math.round(m.done_sessions/m.total_sessions*100) : 0
                const tName  = trainers.find(t => t.id===m.trainer_id)?.name ?? '—'
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight:600, fontSize:'13px' }}>{m.name}</div>
                      <div style={{ fontSize:'11px', color:'var(--text-dim)' }}>{m.phone||'—'}</div>
                    </td>
                    <td style={{ fontSize:'12px', color:'var(--text-muted)' }}>{tName}</td>
                    <td style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'12px' }}>{m.done_sessions} / {m.total_sessions}회</div>
                      <div style={{ height:'3px', background:'var(--border)', borderRadius:'2px', marginTop:'4px', width:'60px', marginLeft:'auto' }}>
                        <div style={{ height:'100%', borderRadius:'2px', width:`${pct}%`, background: remain===0?'var(--text-dim)':'var(--accent)' }} />
                      </div>
                    </td>
                    <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace", color: remain===0?'var(--text-dim)':remain<=3?'var(--orange)':'var(--green)', fontWeight:600 }}>{remain}회</td>
                    <td><RiskBadge riskRow={riskMap[m.id]} /></td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding:'5px 10px', fontSize:'11px' }} onClick={() => setSelected(m)}>상세</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.name} 회원 상세` : ''} maxWidth="520px">
        {selected && (
          <MemberDetailModal
            member={selected}
            trainer={trainers.find(t => t.id === selected.trainer_id)}
            gymId={gymId}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>

      {/* ── 신규 회원 등록 모달 ── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="신규 회원 등록" maxWidth="400px">
        <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>

          {/* 이름 */}
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'5px' }}>이름 *</div>
            <input className="input" placeholder="홍길동"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {/* 연락처 */}
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'5px' }}>연락처 *</div>
            <input className="input" placeholder="010-0000-0000"
              value={addForm.phone}
              onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
          </div>

          {/* 담당 트레이너 */}
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600, marginBottom:'5px' }}>담당 트레이너 *</div>
            {activeTrainers.length === 0 ? (
              <div style={{ fontSize:'12px', color:'var(--text-dim)', padding:'8px 0' }}>재직 중인 트레이너가 없어요</div>
            ) : (
              <select className="input" value={addForm.trainer_id}
                onChange={e => setAddForm(f => ({ ...f, trainer_id: e.target.value }))}>
                {activeTrainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* 에러 메시지 */}
          {addError && (
            <div style={{
              padding:'8px 12px', borderRadius:'8px', fontSize:'12px',
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444',
            }}>
              ⚠️ {addError}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:'8px' }}>
          <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}
            onClick={() => setAddModal(false)}>취소</button>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
            onClick={handleAdd} disabled={saving || activeTrainers.length === 0}>
            {saving ? '등록 중...' : '등록'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
