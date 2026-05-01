import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import GymRankManager from '../components/GymRankManager'
import TrainersTab from './TrainersTab'

const mono = { fontFamily: "'DM Mono', monospace" }

// ── 공용 서브탭 바 ────────────────────────────────────────────────
function SubTabBar({ tabs, active, onChange, variant = 'pill' }) {
  if (variant === 'underline') {
    return (
      <div style={{
        display: 'flex', gap: '0', marginBottom: '24px',
        borderBottom: '1px solid var(--border)',
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            padding: '9px 18px', border: 'none', borderBottom: '2px solid',
            borderBottomColor: active === t.key ? 'var(--accent)' : 'transparent',
            background: 'none', color: active === t.key ? 'var(--accent)' : 'var(--text-dim)',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s', marginBottom: '-1px',
          }}>
            {t.icon && <span style={{ marginRight: '5px' }}>{t.icon}</span>}
            {t.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div style={{
      display: 'inline-flex', gap: '3px', marginBottom: '24px',
      background: 'var(--surface)', borderRadius: '12px',
      padding: '4px', border: '1px solid var(--border)',
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '7px 18px', borderRadius: '9px', border: 'none',
          fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          background: active === t.key ? 'var(--surface3)' : 'none',
          color: active === t.key ? 'var(--text)' : 'var(--text-dim)',
          boxShadow: active === t.key ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
          transition: 'all 0.15s',
        }}>
          {t.icon && <span style={{ marginRight: '5px' }}>{t.icon}</span>}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ① 직원 관리
// ────────────────────────────────────────────────────────────────
function StaffPanel({ gymId }) {
  const showToast = useToast()
  const [trainers,         setTrainers]         = useState([])   // employment_status = active
  const [resignedTrainers, setResignedTrainers] = useState([])   // employment_status = resigned
  const [pendingTrainers,  setPendingTrainers]  = useState([])   // approval_status   = pending
  const [gymRanks,         setGymRanks]         = useState([])
  const [loading,          setLoading]          = useState(true)
  const [approving,        setApproving]        = useState(null)
  const [resigning,        setResigning]        = useState(null) // id being resigned/reinstated
  const [showResigned,     setShowResigned]     = useState(false)
  const [addModal,     setAddModal]     = useState(false)
  const [editModal,    setEditModal]    = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [resignTarget, setResignTarget] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [gymId])

  async function load() {
    setLoading(true)
    const [activeRes, resignedRes, pendingRes, rRes] = await Promise.all([
      // 재직 중 (approved + active)
      supabase.from('trainers').select('*, trainer_ranks(*)')
        .eq('gym_id', gymId)
        .neq('approval_status', 'pending')
        .eq('employment_status', 'active')
        .order('created_at'),
      // 퇴사자 (approved + resigned)
      supabase.from('trainers').select('*, trainer_ranks(*)')
        .eq('gym_id', gymId)
        .neq('approval_status', 'pending')
        .eq('employment_status', 'resigned')
        .order('created_at'),
      // 가입 대기
      supabase.from('trainers').select('id, name, email, phone, created_at')
        .eq('gym_id', gymId)
        .eq('approval_status', 'pending')
        .order('created_at'),
      supabase.from('gym_ranks').select('*')
        .eq('gym_id', gymId).order('sort_order'),
    ])
    setTrainers(activeRes.data || [])
    setResignedTrainers(resignedRes.data || [])
    setPendingTrainers(pendingRes.data || [])
    setGymRanks(rRes.data || [])
    setLoading(false)
  }

  // 가입 승인
  async function handleApprove(trainer) {
    setApproving(trainer.id)
    const { error } = await supabase
      .from('trainers')
      .update({ approval_status: 'approved', employment_status: 'active' })
      .eq('id', trainer.id)
    setApproving(null)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`✓ ${trainer.name} 님을 승인했어요`)
    await load()
  }

  // 가입 거절 (지원 단계이므로 gym_id 초기화는 유지)
  async function handleReject(trainer) {
    setApproving(trainer.id)
    const { error } = await supabase
      .from('trainers')
      .update({ gym_id: null, approval_status: 'approved' })
      .eq('id', trainer.id)
    setApproving(null)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`${trainer.name} 님의 요청을 거절했어요`)
    await load()
  }

  const EMP_LABEL = { rental: '대관', freelance: '프리랜서', employee: '정직원', fulltime: '정직원' }

  async function handleAdd() {
    if (!form.name.trim())  { showToast('이름을 입력하세요'); return }
    if (!form.phone.trim()) { showToast('연락처를 입력하세요'); return }
    setSaving(true)
    const { error } = await supabase.from('trainers').insert({
      name: form.name.trim(), phone: form.phone.trim(),
      gym_id: gymId, employment_status: 'active', approval_status: 'approved',
    })
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 직원이 등록됐어요')
    setAddModal(false); setForm({ name: '', phone: '' }); await load()
  }

  async function handleEdit() {
    if (!form.name.trim()) { showToast('이름을 입력하세요'); return }
    setSaving(true)
    const { error } = await supabase.from('trainers').update({
      name: form.name.trim(), phone: form.phone.trim(),
    }).eq('id', editTarget.id)
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 정보가 수정됐어요')
    setEditModal(false); await load()
  }

  // 퇴사 처리 — gym_id 보존, employment_status만 resigned
  async function handleResign() {
    if (!resignTarget) return
    const { error } = await supabase.from('trainers')
      .update({ employment_status: 'resigned' })
      .eq('id', resignTarget.id)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`${resignTarget.name} 님을 퇴사 처리했어요`)
    setResignTarget(null); await load()
  }

  // 복직 처리
  async function handleReinstate(trainer) {
    setResigning(trainer.id)
    const { error } = await supabase.from('trainers')
      .update({ employment_status: 'active' })
      .eq('id', trainer.id)
    setResigning(null)
    if (error) { showToast('오류: ' + error.message); return }
    showToast(`✓ ${trainer.name} 님을 복직 처리했어요`)
    await load()
  }

  function openEdit(t) {
    setEditTarget(t); setForm({ name: t.name, phone: t.phone || '' }); setEditModal(true)
  }

  return (
    <div>

      {/* ── 가입 대기열 ── */}
      {pendingTrainers.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>⏳ 가입 대기열</div>
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
              background: 'rgba(250,204,21,0.15)', color: '#facc15',
              border: '1px solid rgba(250,204,21,0.3)',
            }}>{pendingTrainers.length}명 대기 중</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingTrainers.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                background: 'rgba(250,204,21,0.04)',
                border: '1px solid rgba(250,204,21,0.2)',
                borderRadius: '10px',
              }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, color: '#facc15',
                }}>{t.name?.[0] || '?'}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.email || t.phone || '연락처 없음'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleApprove(t)}
                    disabled={approving === t.id}
                    style={{
                      padding: '5px 12px', borderRadius: '7px',
                      background: 'rgba(74,222,128,0.15)', color: '#4ade80',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid rgba(74,222,128,0.3)', outline: 'none',
                      opacity: approving === t.id ? 0.5 : 1,
                    }}>
                    {approving === t.id ? '…' : '✓ 승인'}
                  </button>
                  <button
                    onClick={() => handleReject(t)}
                    disabled={approving === t.id}
                    style={{
                      padding: '5px 12px', borderRadius: '7px',
                      background: 'rgba(248,113,113,0.08)', color: '#f87171',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid rgba(248,113,113,0.25)',
                      opacity: approving === t.id ? 0.5 : 1,
                    }}>
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0' }} />
        </div>
      )}

      {/* ── 직원 목록 헤더 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>직원 목록</div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
            센터에 소속된 직원 관리
          </div>
        </div>
        <button className="btn btn-primary" style={{ gap: '5px' }}
          onClick={() => { setForm({ name: '', phone: '' }); setAddModal(true) }}>
          + 직원 추가
        </button>
      </div>

      {/* ── 재직 중 직원 테이블 ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          <span className="spinner" style={{ display: 'block', marginBottom: '8px', fontSize: '22px' }}>✦</span>
          불러오는 중...
        </div>
      ) : trainers.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: '24px' }}>
          <div className="empty-state-icon">👤</div>
          <div className="empty-state-text">재직 중인 직원이 없어요</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>직급</th>
                <th>고용형태</th>
                <th>등록일</th>
                <th style={{ width: '110px' }}></th>
              </tr>
            </thead>
            <tbody>
              {trainers.map(t => {
                const rank = gymRanks.find(r => r.id === t.gym_rank_id)
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                          background: 'rgba(200,241,53,0.12)', border: '1px solid rgba(200,241,53,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700, color: 'var(--accent)',
                        }}>{t.name[0]}</div>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{t.name}</span>
                      </div>
                    </td>
                    <td style={{ ...mono, fontSize: '12px', color: 'var(--text-muted)' }}>{t.phone}</td>
                    <td>
                      {rank
                        ? <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', background: 'rgba(200,241,53,0.1)', color: 'var(--accent)', border: '1px solid rgba(200,241,53,0.25)' }}>{rank.label}</span>
                        : <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {EMP_LABEL[t.employment_type] || '미설정'}
                      </span>
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-dim)', ...mono }}>
                      {new Date(t.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => openEdit(t)}>편집</button>
                        <button className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '10px', color: 'var(--red)', borderColor: 'rgba(248,113,113,0.3)' }}
                          onClick={() => setResignTarget(t)}>퇴사</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 퇴사자 아코디언 ── */}
      {resignedTrainers.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setShowResigned(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontSize: '12px', fontWeight: 600, textAlign: 'left',
            }}>
            <span>{showResigned ? '▾' : '▸'}</span>
            <span>퇴사자 {resignedTrainers.length}명</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}>
              기록 보존 중 · gym_id 유지
            </span>
          </button>

          {showResigned && (
            <div style={{ marginTop: '8px' }}>
              <table className="data-table" style={{
                opacity: 0.65, filter: 'grayscale(40%)',
                border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden',
              }}>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>연락처</th>
                    <th>직급</th>
                    <th>고용형태</th>
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {resignedTrainers.map(t => {
                    const rank = gymRanks.find(r => r.id === t.gym_rank_id)
                    return (
                      <tr key={t.id} style={{ color: 'var(--text-dim)' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                              background: 'rgba(150,150,150,0.1)', border: '1px solid rgba(150,150,150,0.2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px', fontWeight: 700, color: 'var(--text-dim)',
                            }}>{t.name[0]}</div>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{t.name}</span>
                          </div>
                        </td>
                        <td style={{ ...mono, fontSize: '12px' }}>{t.phone}</td>
                        <td>
                          {rank
                            ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: 'rgba(150,150,150,0.08)', border: '1px solid rgba(150,150,150,0.15)' }}>{rank.label}</span>
                            : <span style={{ fontSize: '11px' }}>—</span>}
                        </td>
                        <td>
                          <span style={{ fontSize: '11px' }}>
                            {EMP_LABEL[t.employment_type] || '미설정'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleReinstate(t)}
                            disabled={resigning === t.id}
                            style={{
                              padding: '3px 8px', fontSize: '10px', borderRadius: '6px',
                              background: 'rgba(74,222,128,0.08)', color: '#4ade80',
                              border: '1px solid rgba(74,222,128,0.25)', cursor: 'pointer',
                              fontFamily: 'inherit', fontWeight: 600,
                              opacity: resigning === t.id ? 0.5 : 1,
                            }}>
                            {resigning === t.id ? '…' : '복직'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 직급 관리 (GymRankManager 재사용) ── */}
      <GymRankManager gymId={gymId} onChanged={load} />

      {/* ── 직원 추가 모달 ── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="직원 추가" maxWidth="380px">
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.65, marginBottom: '16px' }}>
          트레이너 앱에 이미 가입된 계정이라면 동일한 이름·연락처를 입력하세요.
          계정이 연동됩니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {[['name','이름 *','김트레이너'], ['phone','연락처 *','010-0000-0000']].map(([k,l,ph]) => (
            <div key={k}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>{l}</div>
              <input className="input" placeholder={ph} value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setAddModal(false)}>취소</button>
          <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={handleAdd} disabled={saving}>
            {saving ? '등록 중...' : '등록'}
          </button>
        </div>
      </Modal>

      {/* ── 직원 편집 모달 ── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="직원 정보 편집" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {[['name','이름'], ['phone','연락처']].map(([k,l]) => (
            <div key={k}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '5px' }}>{l}</div>
              <input className="input" value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditModal(false)}>취소</button>
          <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={handleEdit} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </Modal>

      {/* ── 퇴사 처리 확인 모달 ── */}
      <Modal open={!!resignTarget} onClose={() => setResignTarget(null)} title="퇴사 처리" maxWidth="360px">
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '20px' }}>
          <strong style={{ color: 'var(--text)' }}>{resignTarget?.name}</strong>님을 퇴사 처리할까요?<br />
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            수업 기록·정산 내역은 그대로 보존돼요. 언제든 복직 처리할 수 있어요.
          </span>
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setResignTarget(null)}>취소</button>
          <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--red)', color: '#fff', border: 'none' }}
            onClick={handleResign}>퇴사 처리</button>
        </div>
      </Modal>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ② 센터 로그
// ────────────────────────────────────────────────────────────────
function CenterLogPanel({ gymId, trainers }) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => { load() }, [gymId])

  async function load() {
    setLoading(true)
    const trainerIds = (trainers || []).map(t => t.id)

    if (trainerIds.length === 0) { setEvents([]); setLoading(false); return }

    const [membersRes, paymentsRes, logsRes] = await Promise.all([
      supabase.from('members')
        .select('id, name, trainer_id, created_at')
        .in('trainer_id', trainerIds)
        .order('created_at', { ascending: false }).limit(60),
      supabase.from('payments')
        .select('id, amount, product_name, trainer_id, paid_at, payment_method, payment_method_memo')
        .in('trainer_id', trainerIds)
        .order('paid_at', { ascending: false }).limit(60),
      supabase.from('logs')
        .select('id, content, trainer_id, created_at')
        .in('trainer_id', trainerIds)
        .order('created_at', { ascending: false }).limit(60),
    ])

    const trainerMap = Object.fromEntries((trainers || []).map(t => [t.id, t.name]))
    const METHOD_ICON = {
      cash: '💵', card: '💳', transfer: '🏦', local_currency: '🪙', payments_app: '📱',
    }

    const allEvents = [
      ...(membersRes.data || []).map(m => ({
        id: 'member_' + m.id,
        type: 'member',
        icon: '👤', color: 'var(--blue)', bg: 'rgba(96,165,250,0.12)',
        title: '회원 등록',
        desc:  m.name,
        sub:   `담당 · ${trainerMap[m.trainer_id] || '—'}`,
        at:    m.created_at,
      })),
      ...(paymentsRes.data || []).map(p => {
        const mIcon = METHOD_ICON[p.payment_method] || '💳'
        const memo  = p.payment_method_memo ? ` (${p.payment_method_memo})` : ''
        return {
          id: 'pay_' + p.id,
          type: 'payment',
          icon: '💰', color: 'var(--accent)', bg: 'rgba(200,241,53,0.10)',
          title: '결제',
          desc:  `${p.product_name} · ${Number(p.amount).toLocaleString()}원`,
          sub:   `${mIcon}${memo} · ${trainerMap[p.trainer_id] || '—'}`,
          at:    p.paid_at,
        }
      }),
      ...(logsRes.data || []).map(l => ({
        id: 'log_' + l.id,
        type: 'log',
        icon: '📝', color: 'var(--purple)', bg: 'rgba(167,139,250,0.12)',
        title: '수업일지',
        desc:  (l.content || '').slice(0, 60) + ((l.content || '').length > 60 ? '…' : ''),
        sub:   `트레이너 · ${trainerMap[l.trainer_id] || '—'}`,
        at:    l.created_at,
      })),
    ]

    allEvents.sort((a, b) => new Date(b.at) - new Date(a.at))
    setEvents(allEvents.slice(0, 120))
    setLoading(false)
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    const d    = new Date(iso)
    const diff = (Date.now() - d) / 1000
    if (diff < 60)    return '방금'
    if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const FILTERS = [
    { key: 'all',     label: '전체',    count: events.length },
    { key: 'member',  label: '회원 등록', count: events.filter(e => e.type === 'member').length },
    { key: 'payment', label: '결제',    count: events.filter(e => e.type === 'payment').length },
    { key: 'log',     label: '수업일지', count: events.filter(e => e.type === 'log').length },
  ]
  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter)

  return (
    <div>
      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button key={f.key} className={`filter-chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}>
            {f.label}
            {f.count > 0 && <span style={{ opacity: 0.7, marginLeft: '3px' }}>({f.count})</span>}
          </button>
        ))}
        <button className="btn btn-secondary"
          style={{ marginLeft: 'auto', padding: '5px 12px', fontSize: '11px' }}
          onClick={load}>
          🔄 새로고침
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
          <span className="spinner" style={{ display: 'block', marginBottom: '10px', fontSize: '22px' }}>✦</span>
          로그를 불러오는 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-text">아직 활동 로그가 없어요</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(evt => (
            <div key={evt.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '11px 14px',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = evt.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              {/* 아이콘 */}
              <div style={{
                width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: evt.bg, fontSize: '15px',
              }}>{evt.icon}</div>

              {/* 내용 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px',
                    background: evt.bg, color: evt.color,
                  }}>{evt.title}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{evt.desc}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{evt.sub}</div>
              </div>

              {/* 시간 */}
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0, ...mono, textAlign: 'right', minWidth: '56px' }}>
                {fmtDate(evt.at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ③-A 센터 기본정보 설정
// ────────────────────────────────────────────────────────────────
function GymInfoPanel({ gymId, gym, onGymUpdate }) {
  const showToast = useToast()
  const [form, setForm] = useState({
    name:        gym?.name        || '',
    location:    gym?.location    || '',
    phone:       gym?.phone       || '',
    website:     gym?.website     || '',
    description: gym?.description || '',
  })
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(false)

  // 최신 gym 데이터 로드
  useEffect(() => { loadGym() }, [gymId])

  async function loadGym() {
    setLoading(true)
    const { data } = await supabase.from('gyms').select('*').eq('id', gymId).single()
    if (data) setForm({
      name:        data.name        || '',
      location:    data.location    || '',
      phone:       data.phone       || '',
      website:     data.website     || '',
      description: data.description || '',
    })
    setLoading(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast('센터명을 입력하세요'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('gyms')
      .update({
        name:        form.name.trim()        || null,
        location:    form.location.trim()    || null,
        phone:       form.phone.trim()       || null,
        website:     form.website.trim()     || null,
        description: form.description.trim() || null,
      })
      .eq('id', gymId)
      .select()
      .single()
    setSaving(false)
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 센터 정보가 업데이트됐어요')
    onGymUpdate?.(data)
  }

  const FIELDS = [
    { key: 'name',        label: '센터명 *',       ph: 'OO 피트니스' },
    { key: 'location',    label: '주소',            ph: '서울시 강남구 ...' },
    { key: 'phone',       label: '대표 전화',       ph: '02-0000-0000' },
    { key: 'website',     label: '홈페이지 / SNS',  ph: 'https://instagram.com/...' },
  ]

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
      <span className="spinner" style={{ display: 'block', marginBottom: '8px', fontSize: '22px' }}>✦</span>
      불러오는 중...
    </div>
  )

  return (
    <div style={{ maxWidth: '560px' }}>
      <div className="card">
        <div className="card-title" style={{ marginBottom: '20px' }}>센터 기본정보</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {FIELDS.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '5px' }}>
                {f.label}
              </label>
              <input className="input" placeholder={f.ph}
                value={form[f.key]}
                onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '5px' }}>소개 / 메모</label>
            <textarea className="input" rows={3}
              placeholder="센터 소개, 운영 시간, 내부 메모 등"
              value={form.description}
              onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
              style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={loadGym} disabled={loading}>원래대로</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '✓ 저장'}
          </button>
        </div>
      </div>

      {/* 센터 ID 정보 박스 */}
      <div style={{
        marginTop: '16px', padding: '12px 14px',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: '10px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8,
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>센터 ID (읽기 전용)</div>
        <div style={{ ...mono, fontSize: '10px', wordBreak: 'break-all' }}>{gymId}</div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ③-B 권한 설정
// ────────────────────────────────────────────────────────────────
const PERM_DEFS = [
  { key: 'crm_access',       label: 'CRM 포털 접근', desc: '이 포털에 로그인 가능',          color: 'var(--accent)',  bg: 'rgba(200,241,53,0.12)' },
  { key: 'view_all_members', label: '전체 회원 열람', desc: '모든 트레이너의 회원 조회',      color: 'var(--blue)',    bg: 'rgba(96,165,250,0.12)' },
  { key: 'manage_products',  label: '상품 관리',      desc: '상품 등록·수정·삭제',           color: 'var(--purple)',  bg: 'rgba(167,139,250,0.12)' },
  { key: 'view_settlement',  label: '정산 열람',      desc: '직원 정산 내역 조회',           color: 'var(--green)',   bg: 'rgba(74,222,128,0.12)' },
]

function PermToggle({ active, color, onChange, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width: '34px', height: '19px', borderRadius: '10px', position: 'relative',
        background: active ? color : 'var(--surface3)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px', width: '13px', height: '13px',
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.18s', left: active ? '18px' : '3px',
      }} />
    </div>
  )
}

function PermissionsPanel({ gymId }) {
  const showToast = useToast()
  const [trainers,  setTrainers]  = useState([])
  const [gymRanks,  setGymRanks]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [savingKey, setSavingKey] = useState(null)   // `${trainerId}_${permKey}`
  const [noColumn,  setNoColumn]  = useState(false)

  useEffect(() => { load() }, [gymId])

  async function load() {
    setLoading(true)
    const [tRes, rRes] = await Promise.all([
      supabase.from('trainers').select('id, name, phone, gym_rank_id, employment_type, created_at, crm_permissions')
        .eq('gym_id', gymId).order('created_at'),
      supabase.from('gym_ranks').select('*').eq('gym_id', gymId).order('sort_order'),
    ])
    if (tRes.error?.message?.includes('crm_permissions')) {
      setNoColumn(true); setLoading(false); return
    }
    setTrainers(tRes.data || [])
    setGymRanks(rRes.data || [])
    setNoColumn(false)
    setLoading(false)
  }

  async function toggle(trainerId, permKey, curPerms) {
    const sk = `${trainerId}_${permKey}`
    setSavingKey(sk)
    const newPerms = { ...curPerms, [permKey]: !curPerms[permKey] }
    const { error } = await supabase.from('trainers')
      .update({ crm_permissions: newPerms }).eq('id', trainerId)
    setSavingKey(null)
    if (error) { showToast('오류: ' + error.message); return }
    setTrainers(prev => prev.map(t => t.id === trainerId ? { ...t, crm_permissions: newPerms } : t))
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)' }}>
      <span className="spinner" style={{ display: 'block', marginBottom: '10px', fontSize: '22px' }}>✦</span>
      불러오는 중...
    </div>
  )

  // crm_permissions 컬럼 미생성 안내
  if (noColumn) return (
    <div style={{ maxWidth: '600px' }}>
      <div style={{
        background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.25)',
        borderRadius: '12px', padding: '20px',
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>⚠️</div>
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>DB 마이그레이션이 필요해요</div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '16px' }}>
          권한 설정을 사용하려면 Supabase SQL Editor에서 아래 SQL을 실행하세요.
        </div>
        <pre style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '14px', fontSize: '11px',
          color: 'var(--text-muted)', overflowX: 'auto', lineHeight: 1.6,
        }}>
{`ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS crm_permissions
  JSONB NOT NULL DEFAULT '{}';`}
        </pre>
        <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={load}>
          🔄 다시 확인
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {/* 안내 배너 */}
      <div style={{
        background: 'rgba(200,241,53,0.05)', border: '1px solid rgba(200,241,53,0.18)',
        borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
        maxWidth: '720px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.7,
      }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>💡 권한 설정</span>
        {'  '}각 직원에게 허용할 기능을 설정해요. 권한은 향후 앱 업데이트에서 실제 접근 제어에 적용돼요.
      </div>

      {trainers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔐</div>
          <div className="empty-state-text">소속 직원이 없어요</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '720px' }}>
          {trainers.map(t => {
            const perms = t.crm_permissions || {}
            const rank  = gymRanks.find(r => r.id === t.gym_rank_id)
            return (
              <div key={t.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '16px 18px',
              }}>
                {/* 직원 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(200,241,53,0.1)', border: '1px solid rgba(200,241,53,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: 'var(--accent)',
                  }}>{t.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px' }}>
                      {rank?.label ?? '직급 미설정'} · {t.phone}
                    </div>
                  </div>
                  {/* 활성 권한 수 요약 */}
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'right' }}>
                    {PERM_DEFS.filter(pd => perms[pd.key]).length}/{PERM_DEFS.length} 권한
                  </div>
                </div>

                {/* 권한 토글 그리드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: '8px' }}>
                  {PERM_DEFS.map(pd => {
                    const active    = !!perms[pd.key]
                    const isSaving  = savingKey === `${t.id}_${pd.key}`
                    return (
                      <div key={pd.key}
                        onClick={isSaving ? undefined : () => toggle(t.id, pd.key, perms)}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: '8px',
                          padding: '11px 12px', borderRadius: '10px',
                          border: `1px solid ${active ? pd.color + '45' : 'var(--border)'}`,
                          background: active ? pd.bg : 'var(--surface2)',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s', opacity: isSaving ? 0.6 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: active ? pd.color : 'var(--text-muted)' }}>
                            {pd.label}
                          </span>
                          <PermToggle active={active} color={pd.color} disabled={isSaving} onChange={() => toggle(t.id, pd.key, perms)} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.5 }}>{pd.desc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// ③ 고급 설정 (래퍼)
// ────────────────────────────────────────────────────────────────
function AdvancedPanel({ gymId, gym, onGymUpdate }) {
  const [advTab, setAdvTab] = useState('info')

  const ADV_TABS = [
    { key: 'info',        label: '센터 기본정보 설정' },
    { key: 'permissions', label: '권한 설정' },
  ]

  return (
    <div>
      <SubTabBar tabs={ADV_TABS} active={advTab} onChange={setAdvTab} variant="underline" />
      {advTab === 'info'        && <GymInfoPanel gymId={gymId} gym={gym} onGymUpdate={onGymUpdate} />}
      {advTab === 'permissions' && <PermissionsPanel gymId={gymId} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 메인 SettingsTab export
// ────────────────────────────────────────────────────────────────
export default function SettingsTab({ gymId, gym, trainers, members, onGymUpdate }) {
  const [subTab, setSubTab] = useState('staff')

  const MAIN_TABS = [
    { key: 'staff',      icon: '👥', label: '직원 관리' },
    { key: 'settlement', icon: '💰', label: '직원 급여 정산' },
    { key: 'log',        icon: '📋', label: '센터 로그' },
    { key: 'advanced',   icon: '⚙️', label: '고급 설정' },
  ]

  return (
    <div>
      <SubTabBar tabs={MAIN_TABS} active={subTab} onChange={setSubTab} />

      {subTab === 'staff'      && <StaffPanel gymId={gymId} />}
      {subTab === 'settlement' && <TrainersTab trainers={trainers} members={members || []} gymId={gymId} />}
      {subTab === 'log'        && <CenterLogPanel gymId={gymId} trainers={trainers} />}
      {subTab === 'advanced'   && <AdvancedPanel gymId={gymId} gym={gym} onGymUpdate={onGymUpdate} />}
    </div>
  )
}
