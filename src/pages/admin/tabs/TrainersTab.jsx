import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'

const mono = { fontFamily: "'DM Mono', monospace" }

// ── 직급 설정 모달 (센터 커스텀 직급 기반) ──────────────────────
function RankEditModal({ trainer, gymId, onClose, onSaved }) {
  const showToast = useToast()
  const [gymRanks,   setGymRanks]   = useState([])
  const [rankId,     setRankId]     = useState(trainer.gym_rank_id || '')
  const [customRate, setCustomRate] = useState(
    trainer.incentive_rate != null ? String(Math.round(trainer.incentive_rate * 100)) : ''
  )
  const [empType, setEmpType] = useState(trainer.employment_type || '')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    supabase.from('gym_ranks').select('*').eq('gym_id', gymId).order('sort_order')
      .then(({ data }) => setGymRanks(data || []))
  }, [gymId])

  const selectedRank = gymRanks.find(r => r.id === rankId)

  async function handleSave() {
    setSaving(true)
    const updates = {
      gym_rank_id:     rankId || null,
      employment_type: empType || null,
      incentive_rate:  customRate !== '' ? Number(customRate) / 100
                       : selectedRank ? selectedRank.default_incentive_rate
                       : null,
    }
    const { error } = await supabase.from('trainers').update(updates).eq('id', trainer.id)
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 직급/고용형태 저장 완료')
    onSaved()
    onClose()
  }

  return (
    <div>
      {/* 직급 선택 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>직급</div>
        {gymRanks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontSize: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
            ⚠️ 아직 등록된 직급이 없어요.<br />
            <span style={{ fontSize: '11px' }}>센터 설정 → 직원 관리에서 먼저 추가하세요.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button onClick={() => setRankId('')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: '8px',
                border: `1px solid ${rankId === '' ? 'var(--accent)' : 'var(--border)'}`,
                background: rankId === '' ? 'rgba(200,241,53,0.08)' : 'var(--surface2)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
            >
              <span style={{ fontSize: '13px', color: rankId === '' ? 'var(--accent)' : 'var(--text-muted)' }}>미설정</span>
              {rankId === '' && <span style={{ fontSize: '12px', color: 'var(--accent)' }}>✓</span>}
            </button>
            {gymRanks.map(r => (
              <button key={r.id} onClick={() => setRankId(r.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: '8px',
                  border: `1px solid ${rankId === r.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: rankId === r.id ? 'rgba(200,241,53,0.08)' : 'var(--surface2)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: rankId === r.id ? 'var(--accent)' : 'var(--text)' }}>{r.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    기본급 {Number(r.base_salary).toLocaleString()}원 · 인센티브 {Math.round(r.default_incentive_rate * 100)}%
                  </div>
                </div>
                {rankId === r.id && <span style={{ fontSize: '12px', color: 'var(--accent)' }}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 고용 형태 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>고용 형태</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[['fulltime', '정직원'], ['freelance', '프리랜서'], ['', '미설정']].map(([v, l]) => (
            <button key={v} onClick={() => setEmpType(v)}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                border: `1px solid ${empType === v ? 'var(--accent)' : 'var(--border)'}`,
                background: empType === v ? 'rgba(200,241,53,0.08)' : 'var(--surface2)',
                color: empType === v ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit' }}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* 개인 인센티브율 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>
          개인 인센티브율 <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(비워두면 직급 기본값 적용)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input className="input" type="number" min={0} max={100}
            placeholder={selectedRank ? `기본: ${Math.round(selectedRank.default_incentive_rate * 100)}%` : '예: 12'}
            value={customRate} onChange={e => setCustomRate(e.target.value)} style={{ flex: 1 }} />
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>%</span>
        </div>
        {customRate !== '' && (
          <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>✓ 직급 기본값 대신 {customRate}% 적용</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>취소</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ── 정산 패널 ─────────────────────────────────────────────────
function SettlementPanel({ trainerId, showToast }) {
  const now = new Date()
  const [year,  setYear]      = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [snap,  setSnap]      = useState(null)
  const [settle,setSettle]    = useState(null)
  const [rankInfo,setRankInfo]= useState(null)
  const [loading,setLoading]  = useState(false)
  const [calculating,setCalc] = useState(false)
  const [showDetail,setShowDetail] = useState(false)

  useEffect(() => { if (trainerId) load() }, [trainerId, year, month])

  async function load() {
    setLoading(true)
    const [snapRes, settleRes, rankRes] = await Promise.all([
      supabase.rpc('get_snapshot_preview', { p_trainer_id: trainerId, p_year: year, p_month: month }),
      supabase.from('settlements').select('*').eq('trainer_id', trainerId).eq('period_year', year).eq('period_month', month).maybeSingle(),
      supabase.from('trainers').select('*, trainer_ranks(*)').eq('id', trainerId).maybeSingle(),
    ])
    setSnap(snapRes.data || [])
    setSettle(settleRes.data || null)
    setRankInfo(rankRes.data || null)
    setLoading(false)
  }

  async function handleCalculate() {
    setCalc(true)
    const { data, error } = await supabase.rpc('calculate_settlement', { p_trainer_id: trainerId, p_year: year, p_month: month })
    setCalc(false)
    if (error) { showToast('오류: ' + error.message); return }
    setSettle(data)
    showToast('✓ 정산 계산 완료')
  }

  async function handleConfirm() {
    if (!settle?.id) return
    const { error } = await supabase.rpc('confirm_settlement', { p_settlement_id: settle.id })
    if (error) { showToast('오류: ' + error.message); return }
    await load(); showToast('✓ 정산 확정됨')
  }

  async function handleMarkPaid() {
    if (!settle?.id) return
    const { error } = await supabase.rpc('mark_settlement_paid', { p_settlement_id: settle.id, p_paid_at: new Date().toISOString() })
    if (error) { showToast('오류: ' + error.message); return }
    await load(); showToast('✓ 지급 완료 처리됨')
  }

  const prevMonth = () => { if (month===1){setYear(y=>y-1);setMonth(12)} else setMonth(m=>m-1) }
  const nextMonth = () => {
    const isCurrent = year===now.getFullYear() && month===now.getMonth()+1
    if (isCurrent) return
    if (month===12){setYear(y=>y+1);setMonth(1)} else setMonth(m=>m+1)
  }

  const paySnap       = (snap||[]).find(s=>s.snapshot_type==='payment')
  const rank          = rankInfo?.trainer_ranks
  const totalPayments = settle?.incentive_base ?? paySnap?.base_amount_total ?? 0
  const baseSalary    = settle?.base_salary ?? rank?.base_salary ?? 0
  const incentiveRate = settle?.incentive_rate ?? rankInfo?.incentive_rate ?? rank?.default_incentive_rate ?? 0.10
  const incentiveAmt  = settle?.incentive_amount ?? Math.round(totalPayments * incentiveRate)
  const taxAmt        = settle?.tax_amount ?? Math.round((baseSalary+incentiveAmt)*0.033)
  const centerRevenue = totalPayments - incentiveAmt
  const trainerPayout = baseSalary + incentiveAmt - taxAmt
  const payCount      = paySnap?.event_count ?? 0
  const lessonSnap    = (snap||[]).find(s=>s.snapshot_type==='lesson')
  const lessonCount   = lessonSnap?.event_count ?? 0
  const status        = settle?.status ?? 'none'
  const isCurrent     = year===now.getFullYear() && month===now.getMonth()+1

  const STATUS_META = {
    none:      { label:'계산 전',  color:'var(--text-dim)',  bg:'var(--surface2)' },
    draft:     { label:'초안',     color:'var(--yellow)',    bg:'rgba(250,204,21,0.1)' },
    confirmed: { label:'확정',     color:'var(--blue)',      bg:'rgba(96,165,250,0.1)' },
    paid:      { label:'지급완료', color:'var(--accent)',    bg:'rgba(200,241,53,0.1)' },
  }
  const sm = STATUS_META[status] || STATUS_META.none

  return (
    <div className="card">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <button onClick={prevMonth} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'18px', cursor:'pointer' }}>‹</button>
          <span style={{ fontSize:'14px', fontWeight:700, minWidth:'90px', textAlign:'center' }}>{year}년 {month}월</span>
          <button onClick={nextMonth} disabled={isCurrent} style={{ background:'none', border:'none', fontSize:'18px', cursor:isCurrent?'not-allowed':'pointer', color:isCurrent?'var(--border)':'var(--text-muted)' }}>›</button>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          {rank && <span style={{ fontSize:'11px', color:'var(--text-dim)', background:'var(--surface2)', borderRadius:'6px', padding:'3px 8px' }}>{rank.label ?? '미설정'} · {Math.round(incentiveRate*100)}%</span>}
          <span style={{ fontSize:'11px', fontWeight:600, borderRadius:'6px', padding:'3px 8px', color:sm.color, background:sm.bg }}>{sm.label}</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'24px', color:'var(--text-dim)' }}><span className="spinner">✦</span></div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'12px' }}>
            {[['센터 수익', centerRevenue, 'var(--blue)', `${totalPayments>0?Math.round(centerRevenue/totalPayments*100):0}% 귀속`],
              ['트레이너 실수령', trainerPayout, 'var(--accent)', '기본급+인센-세금'],
              ['세금 3.3%', taxAmt, 'var(--red)', '원천징수']].map(([label,value,color,sub]) => (
              <div key={label} style={{ background:`${color}12`, border:`1px solid ${color}30`, borderRadius:'10px', padding:'12px 10px', textAlign:'center' }}>
                <div style={{ fontSize:'9px', color, fontWeight:600, letterSpacing:'0.4px', marginBottom:'6px' }}>{label}</div>
                <div style={{ ...mono, fontSize:'15px', fontWeight:700, color }}>{value.toLocaleString()}</div>
                <div style={{ fontSize:'9px', color:'var(--text-dim)', marginTop:'3px' }}>{sub}</div>
              </div>
            ))}
          </div>

          {totalPayments > 0 && (
            <div style={{ marginBottom:'12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>
                <span>총 결제액 <span style={{ ...mono, color:'var(--text)', fontWeight:600 }}>{totalPayments.toLocaleString()}원</span></span>
                <span style={{ color:'var(--text-dim)' }}>{payCount}건 · 수업 {lessonCount}회</span>
              </div>
              <div style={{ height:'6px', borderRadius:'3px', background:'var(--border)', overflow:'hidden', display:'flex' }}>
                <div style={{ width:`${totalPayments>0?centerRevenue/totalPayments*100:0}%`, background:'var(--blue)', transition:'width 0.4s' }} />
                <div style={{ width:`${totalPayments>0?incentiveAmt/totalPayments*100:0}%`, background:'var(--accent)', transition:'width 0.4s' }} />
              </div>
            </div>
          )}

          <button onClick={() => setShowDetail(d=>!d)} style={{ background:'none', border:'none', color:'var(--text-dim)', fontSize:'11px', cursor:'pointer', padding:'4px 0', marginBottom:'4px' }}>
            {showDetail ? '▲' : '▼'} 상세 내역
          </button>
          {showDetail && (
            <div style={{ background:'var(--surface2)', borderRadius:'8px', padding:'12px', marginBottom:'12px', fontSize:'12px' }}>
              {[['기본급', baseSalary, '직급 월 고정급여'],['결제 합계', totalPayments, `${payCount}건`],
                ['인센티브율', null, `${Math.round(incentiveRate*100)}%`],['인센티브액', incentiveAmt, `결제액 × ${Math.round(incentiveRate*100)}%`],
                ['세전 합계', baseSalary+incentiveAmt, '기본급 + 인센티브'],['원천징수(3.3%)', taxAmt, '세전 × 3.3%'],
                ['──────────', null, ''],['트레이너 실수령', trainerPayout, '세후 지급액'],['센터 귀속', centerRevenue, `결제액의 ${totalPayments>0?Math.round(centerRevenue/totalPayments*100):0}%`],
              ].map(([label,value,sub],i) => label.startsWith('─') ? (
                <div key={i} style={{ borderTop:'1px solid var(--border)', margin:'8px 0' }} />
              ) : (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'3px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color:'var(--text-muted)' }}>{label}</span>
                  <span>
                    {value!==null ? <span style={{ ...mono, fontWeight:600 }}>{value.toLocaleString()}원</span> : <span style={{ color:'var(--accent)', fontWeight:600 }}>{sub}</span>}
                    {value!==null && sub && <span style={{ fontSize:'10px', color:'var(--text-dim)', marginLeft:'6px' }}>{sub}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex', gap:'8px' }}>
            {(status==='none'||status==='draft') && (
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleCalculate} disabled={calculating}>
                {calculating ? '계산 중...' : status==='draft' ? '🔄 재계산' : '📊 정산 계산'}
              </button>
            )}
            {status==='draft' && <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={handleConfirm}>✅ 확정</button>}
            {status==='confirmed' && <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleMarkPaid}>💸 지급 완료</button>}
            {status==='paid' && <div style={{ flex:1, textAlign:'center', fontSize:'12px', color:'var(--accent)', padding:'8px', background:'rgba(200,241,53,0.08)', borderRadius:'8px' }}>🎉 지급 완료된 정산</div>}
          </div>
        </>
      )}
    </div>
  )
}

// ── 메인 TrainersTab ──────────────────────────────────────────
export default function TrainersTab({ trainers, members, gymId }) {
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [editTarget,      setEditTarget]      = useState(null)
  const [localTrainers,   setLocalTrainers]   = useState(trainers)
  const showToast = useToast()

  // trainers prop 변경 시 동기화
  useEffect(() => { setLocalTrainers(trainers) }, [trainers])

  async function refreshTrainer(id) {
    const { data } = await supabase.from('trainers').select('*, trainer_ranks(*)').eq('id', id).maybeSingle()
    if (data) {
      setLocalTrainers(prev => prev.map(t => t.id === id ? data : t))
      if (selectedTrainer?.id === id) setSelectedTrainer(data)
    }
  }

  return (
    <div>

      <div style={{ display:'grid', gridTemplateColumns: selectedTrainer ? '340px 1fr' : '1fr', gap:'16px', alignItems:'start' }}>
        {/* 트레이너 목록 */}
        <div>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
              <div className="section-title">소속 트레이너</div>
            </div>
            {localTrainers.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">소속 트레이너가 없어요</div></div>
            ) : (
              <div>
                {localTrainers.map(t => {
                  const tMembers   = members.filter(m => m.trainer_id === t.id)
                  const tActive    = tMembers.filter(m => Math.max(0,(m.total_sessions||0)-(m.done_sessions||0)) > 0).length
                  const isSelected = selectedTrainer?.id === t.id
                  const empLabel   = t.employment_type === 'fulltime' ? '정직원' : t.employment_type === 'freelance' ? '프리랜서' : null

                  return (
                    <div key={t.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px' }}>
                        {/* 아바타 + 이름 (클릭 → 정산 패널) */}
                        <button onClick={() => setSelectedTrainer(isSelected ? null : t)}
                          style={{ display:'flex', alignItems:'center', gap:'12px', flex:1, border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                            background: isSelected ? 'rgba(200,241,53,0.06)' : 'none', borderRadius:'8px', padding:'4px 0' }}
                        >
                          <div style={{ width:'38px', height:'38px', borderRadius:'50%', flexShrink:0, background: isSelected?'var(--accent)':'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', fontWeight:700, color: isSelected?'#0a0a0a':'var(--text)' }}>
                            {t.name[0]}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'13px', fontWeight:600, color: isSelected?'var(--accent)':'var(--text)' }}>{t.name}</div>
                            <div style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'2px', display:'flex', alignItems:'center', gap:'4px', flexWrap:'wrap' }}>
                              {t.gym_ranks?.label
                                ? <span style={{ color:'var(--blue)' }}>{t.gym_ranks.label}</span>
                                : t.trainer_ranks?.label
                                ? <span style={{ color:'var(--text-muted)' }}>{t.trainer_ranks.label}</span>
                                : <span style={{ color:'var(--orange)' }}>직급 미설정</span>}
                              {empLabel && <span>· {empLabel}</span>}
                              <span>· 회원 {tMembers.length}명 (활성 {tActive})</span>
                            </div>
                          </div>
                        </button>
                        {/* 직급 설정 버튼 */}
                        <button
                          className="btn btn-secondary"
                          style={{ padding:'4px 10px', fontSize:'11px', flexShrink:0 }}
                          onClick={() => setEditTarget(t)}
                          title="직급 설정"
                        >
                          ✏️ 직급
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 정산 패널 */}
        {selectedTrainer && (
          <div>
            <div style={{ marginBottom:'12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:700, color:'#0a0a0a' }}>
                  {selectedTrainer.name[0]}
                </div>
                <div>
                <div style={{ fontWeight:700 }}>{selectedTrainer.name}</div>
                <div style={{ fontSize:'11px', color:'var(--text-dim)' }}>
                  {selectedTrainer.gym_ranks?.label ?? selectedTrainer.trainer_ranks?.label ?? '직급 미설정'} · 정산 내역
                </div>
              </div>
              </div>
              <button className="btn btn-secondary" style={{ padding:'5px 10px', fontSize:'11px' }} onClick={() => setEditTarget(selectedTrainer)}>
                ✏️ 직급 설정
              </button>
            </div>
            <SettlementPanel trainerId={selectedTrainer.id} showToast={showToast} />
          </div>
        )}
      </div>

      {/* 직급 설정 모달 */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={editTarget ? `${editTarget.name} — 직급 설정` : ''} maxWidth="420px">
        {editTarget && (
          <RankEditModal
            trainer={editTarget}
            gymId={gymId}
            onClose={() => setEditTarget(null)}
            onSaved={() => refreshTrainer(editTarget.id)}
          />
        )}
      </Modal>
    </div>
  )
}
