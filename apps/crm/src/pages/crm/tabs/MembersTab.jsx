import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '../components/CrmToast'
import Modal from '../components/CrmModal'
import CrmIcon from '../components/CrmIcon'
import TopbarActions from '../components/TopbarActions'
import MemberFilterPanel from '../components/MemberFilterPanel'
import MemberDetailPanel from '../components/MemberDetailPanel'
import PaymentDialog from '../components/PaymentDialog'
import {
  EMPTY_FILTERS, STATUS_CHIPS, matchStatus, matchFilters,
  filterTags, daysSince, passSummary, fmtDot, fmtMan, LONG_ABSENT_DAYS,
} from '../lib/memberFilters'

// ── 회원 관리 ───────────────────────────────────────────────────
// 왼쪽 목록 + 오른쪽 상세 패널. 챙겨야 할 회원(만료 임박)이 위로 온다.

const PAGE_SIZE = 20
const STATUS_ORDER = { expiring: 0, active: 1, expired: 2, none: 3 }
const RISK_FLAG = new Set(['risk', 'critical'])

const seenText = d => (d == null ? '—' : d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`)
const phoneTail = p => {
  const digits = (p || '').replace(/\D/g, '')
  return digits ? `···${digits.slice(-4)}` : '번호 없음'
}

function Pager({ page, pageCount, onPage }) {
  if (pageCount <= 1) return null
  const start = Math.max(1, Math.min(page - 2, pageCount - 4))
  const pages = []
  for (let i = start; i <= Math.min(pageCount, start + 4); i++) pages.push(i)
  return (
    <span className="mb-pager">
      <button type="button" aria-label="이전 페이지" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      {pages.map(n => (
        <button key={n} type="button" className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined}
          onClick={() => onPage(n)}>{n}</button>
      ))}
      <button type="button" aria-label="다음 페이지" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>›</button>
    </span>
  )
}

export default function MembersTab({ members: membersProp, trainers, gymId, currentTrainer, focus, onFocusDone }) {
  const showToast = useToast()
  const [localMembers, setLocalMembers] = useState(membersProp)
  const [filter,      setFilter]      = useState('all')
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const [riskMap,     setRiskMap]     = useState({})
  const [selectedId,  setSelectedId]  = useState(null)

  // ── 고급 필터 · 저장한 조건 ──
  const [filters,     setFilters]     = useState(EMPTY_FILTERS)
  const [panelOpen,   setPanelOpen]   = useState(false)
  const [statsMap,    setStatsMap]    = useState({})   // crm_member_stats 결과 { [memberId]: row }
  const [segments,    setSegments]    = useState([])
  const [activeSegId, setActiveSegId] = useState(null)

  // 결제 창
  const [payTarget,       setPayTarget]       = useState(null)
  const [paymentsVersion, setPaymentsVersion] = useState(0)

  // 신규 회원 등록
  const [addModal, setAddModal] = useState(false)
  const [addForm,  setAddForm]  = useState({ name: '', phone: '', trainer_id: '' })
  const [addError, setAddError] = useState('')
  const [saving,   setSaving]   = useState(false)

  // 부모에서 회원 목록이 바뀌면 동기화
  useEffect(() => { setLocalMembers(membersProp) }, [membersProp])

  // 대시보드에서 넘어올 때 — 특정 회원 상세 열기 · 상태 필터 적용
  useEffect(() => {
    if (!focus) return
    if (focus.filter) { setFilter(focus.filter); setPage(1) }
    if (focus.memberId && membersProp.some(m => m.id === focus.memberId)) setSelectedId(focus.memberId)
    onFocusDone?.()
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadRiskScores()
    if (gymId) loadStats()
  }, [localMembers.length, gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (gymId) loadSegments() }, [gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 결제 · 출석은 담당분만 읽을 수 있어 센터 전체 집계는 함수(RPC)로 받는다
  async function loadStats() {
    const { data, error } = await supabase.rpc('crm_member_stats', { p_gym_id: gymId })
    if (error) { console.error('[crm_member_stats]', error); return }
    const map = {}
    ;(data || []).forEach(r => { map[r.member_id] = r })
    setStatsMap(map)
  }

  async function loadRiskScores() {
    if (!localMembers.length) return
    const { data } = await supabase.from('member_risk_scores').select('*')
      .in('member_id', localMembers.map(m => m.id))
    const map = {}
    ;(data || []).forEach(r => { map[r.member_id] = r })
    setRiskMap(map)
  }

  async function loadSegments() {
    const { data, error } = await supabase.from('crm_segments')
      .select('id, name, filters').eq('gym_id', gymId).order('created_at')
    if (error) { console.error('[crm_segments]', error); return }
    setSegments(data || [])
  }

  async function saveSegment(name, segFilters) {
    const { data, error } = await supabase.from('crm_segments')
      .insert({ gym_id: gymId, name, filters: segFilters, created_by: currentTrainer?.id ?? null })
      .select('id, name, filters').single()
    if (error) { alert('조건 저장 실패: ' + error.message); return false }
    setSegments(prev => [...prev, data])
    setFilters(segFilters)          // 저장한 조건을 바로 적용
    setActiveSegId(data.id)
    setPage(1)
    return true
  }

  async function deleteSegment(seg) {
    if (!confirm(`'${seg.name}' 조건을 지울까요?`)) return
    const { error } = await supabase.from('crm_segments').delete().eq('id', seg.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setSegments(prev => prev.filter(s => s.id !== seg.id))
    if (activeSegId === seg.id) setActiveSegId(null)
  }

  function applySegment(seg) {
    setPage(1)
    if (activeSegId === seg.id) { setActiveSegId(null); setFilters(EMPTY_FILTERS); return }
    setActiveSegId(seg.id)
    setFilters({ ...EMPTY_FILTERS, ...seg.filters })
  }

  function applyFilters(next) {
    setFilters(next)
    setActiveSegId(null)
    setPage(1)
  }

  function removeTag(keys) {
    applyFilters({ ...filters, ...Object.fromEntries(keys.map(k => [k, EMPTY_FILTERS[k]])) })
  }

  // 결제 뒤 남은 횟수가 바뀌므로 그 회원 줄을 다시 읽는다
  async function refreshMember(id) {
    const { data } = await supabase.from('members').select('*').eq('id', id).maybeSingle()
    if (data) setLocalMembers(prev => prev.map(m => (m.id === id ? data : m)))
  }

  // 재직 중인 트레이너만 담당으로 고를 수 있음 (근무 상태 미설정 옛 계정 포함)
  const activeTrainers = trainers.filter(t => !t.employment_status || t.employment_status === 'active')

  function openAddModal() {
    setAddForm({ name: '', phone: '', trainer_id: activeTrainers[0]?.id ?? '' })
    setAddError('')
    setAddModal(true)
  }

  async function handleAdd() {
    const name  = addForm.name.trim()
    const phone = addForm.phone.trim()
    if (!name)               { setAddError('이름을 입력해 주세요.'); return }
    if (!phone)              { setAddError('연락처를 입력해 주세요.'); return }
    if (!addForm.trainer_id) { setAddError('담당 트레이너를 골라 주세요.'); return }

    setSaving(true)
    setAddError('')
    try {
      const { data: dup } = await supabase
        .from('members').select('id')
        .eq('trainer_id', addForm.trainer_id)
        .eq('phone', phone)
        .maybeSingle()
      if (dup) { setAddError('이미 등록된 연락처예요.'); return }

      // 센터에서 등록한 회원은 트레이너 앱의 '개인 레슨 회원' 목록에 나오지 않는다 (049 is_personal)
      const { data: inserted, error } = await supabase
        .from('members')
        .insert({ name, phone, trainer_id: addForm.trainer_id, is_personal: false })
        .select().single()
      if (error) { setAddError('오류: ' + error.message); return }

      showToast(`${inserted.name} 님을 등록했어요`)
      setLocalMembers(prev => [inserted, ...prev])
      setSelectedId(inserted.id)
      setAddModal(false)
    } catch (err) {
      console.error(err)
      setAddError('등록 중 오류가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  // 상태 칩 + 고급 필터 + 검색을 모두 통과한 회원, 챙겨야 할 순서로
  const rows = useMemo(() => {
    const q = search.trim()
    const digits = q.replace(/\D/g, '')
    return localMembers
      .map(m => ({ m, p: passSummary(m, statsMap[m.id]) }))
      .filter(({ p }) => matchStatus(p.status, filter))
      .filter(({ m }) => matchFilters(m, statsMap[m.id], riskMap[m.id], filters))
      .filter(({ m }) => !q || m.name?.includes(q) || (digits && (m.phone || '').replace(/\D/g, '').includes(digits)))
      .sort((a, b) => (STATUS_ORDER[a.p.status] - STATUS_ORDER[b.p.status])
        || (a.m.name || '').localeCompare(b.m.name || '', 'ko'))
  }, [localMembers, statsMap, riskMap, filter, filters, search])

  const statusCounts = useMemo(() => {
    const c = { all: localMembers.length, active: 0, expiring: 0, expired: 0, none: 0 }
    localMembers.forEach(m => {
      const st = passSummary(m, statsMap[m.id]).status
      c[st]++
      if (st === 'expiring') c.active++
    })
    return c
  }, [localMembers, statsMap])

  const tags     = filterTags(filters, trainers)
  const purposes = useMemo(
    () => [...new Set(localMembers.map(m => m.lesson_purpose).filter(Boolean))].sort(),
    [localMembers])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const curPage   = Math.min(page, pageCount)
  const pageRows  = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)
  const selected  = localMembers.find(m => m.id === selectedId) || null
  const trainerName = id => trainers.find(t => t.id === id)?.name ?? '—'

  return (
    <div className="mb-wrap">
      <TopbarActions>
        <button type="button" className={`btn btn-secondary btn-lg ${panelOpen ? 'is-on' : ''}`} aria-expanded={panelOpen}
          onClick={() => setPanelOpen(o => !o)}>
          <CrmIcon name="filter" size={16} />고급 필터{tags.length > 0 ? ` ${tags.length}` : ''}
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={openAddModal}>
          <CrmIcon name="plus" size={16} stroke={2.4} />신규 회원 등록
        </button>
      </TopbarActions>

      <div className="mb-main">
        <div className="mb-bar">
          <div className="mb-chips" role="group" aria-label="상태">
            {STATUS_CHIPS.map(([v, l]) => (
              <button key={v} type="button"
                className={`mb-chip ${v === 'expiring' ? 'warn' : ''} ${filter === v ? 'on' : ''}`}
                aria-pressed={filter === v}
                onClick={() => { setFilter(v); setPage(1) }}>
                {l} {statusCounts[v]}
              </button>
            ))}
          </div>
          <label className="mb-search">
            <CrmIcon name="search" size={15} stroke={2.2} />
            <input type="search" aria-label="이름 · 전화번호 검색" placeholder="이름 · 전화번호"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </label>
        </div>

        {segments.length > 0 && (
          <div className="mb-saved">
            <span className="mb-saved-label">저장한 조건</span>
            {segments.map(seg => (
              <span key={seg.id} className={`mb-seg ${activeSegId === seg.id ? 'on' : ''}`}>
                <button type="button" aria-pressed={activeSegId === seg.id} onClick={() => applySegment(seg)}>{seg.name}</button>
                <button type="button" className="x" aria-label={`${seg.name} 조건 지우기`} onClick={() => deleteSegment(seg)}>×</button>
              </span>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="mb-saved">
            <span className="mb-saved-label">적용 중</span>
            {tags.map(t => (
              <button key={t.text} type="button" className="mb-tag" aria-label={`${t.text} 조건 해제`} onClick={() => removeTag(t.keys)}>
                {t.text} ×
              </button>
            ))}
          </div>
        )}

        <MemberFilterPanel open={panelOpen} filters={filters} trainers={trainers} purposes={purposes}
          onApply={applyFilters} onSaveSegment={saveSegment} />

        <section className="mb-list" aria-label="회원 목록">
          {rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CrmIcon name="users" size={30} /></div>
              <div className="empty-state-text">해당하는 회원이 없어요</div>
            </div>
          ) : (
            <>
              <div className="mb-scroll">
                <table className="mb-table">
                  <thead>
                    <tr>
                      <th>회원</th>
                      <th>담당</th>
                      <th>잔여 · 회원권</th>
                      <th>만료</th>
                      <th>마지막 출석</th>
                      <th className="r">누적 결제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(({ m, p }) => {
                      const stat    = statsMap[m.id]
                      const isSel   = selectedId === m.id
                      const seen    = daysSince(stat?.last_attended)
                      const atRisk  = RISK_FLAG.has(riskMap[m.id]?.risk_level)
                      return (
                        <tr key={m.id} className={isSel ? 'sel' : ''} tabIndex={0} aria-current={isSel ? 'true' : undefined}
                          aria-label={`${m.name} 회원 상세 열기`}
                          onClick={() => setSelectedId(m.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(m.id) } }}>
                          <td>
                            <span className="mb-who">
                              <span className={`mb-av ${isSel ? 'sel' : p.level === 'closed' ? 'closed' : ''}`} aria-hidden="true">{(m.name || '?')[0]}</span>
                              <span className="mb-who-text">
                                <span className="mb-name">{m.name}{atRisk && <em>이탈 위험</em>}</span>
                                <span className="mb-tail">{phoneTail(m.phone)}</span>
                              </span>
                            </span>
                          </td>
                          <td className="mb-trainer">{trainerName(m.trainer_id)}</td>
                          <td>
                            <span className="mb-pass">
                              <span className="mb-track"><span className={`lv-${p.level}`} style={{ width: `${Math.round(p.ratio * 100)}%` }} /></span>
                              <span className={`mb-left lv-${p.level}`}>{p.left}</span>
                            </span>
                            <span className="mb-pass-name">{p.passName || (p.status === 'none' ? '결제 전' : '—')}</span>
                          </td>
                          <td>
                            <span className="mb-end">{p.endDate ? fmtDot(p.endDate) : '—'}</span>
                            {p.dLabel && <span className={`mb-d lv-${p.dLevel}`}>{p.dLabel}</span>}
                          </td>
                          <td className={`mb-seen ${seen != null && seen >= LONG_ABSENT_DAYS ? 'away' : ''}`}>{seenText(seen)}</td>
                          <td className="mb-paid">{stat?.total_paid ? fmtMan(stat.total_paid) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mb-foot">
                <span><b>{(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, rows.length)}</b> / {rows.length}명</span>
                <Pager page={curPage} pageCount={pageCount} onPage={setPage} />
              </div>
            </>
          )}
        </section>
      </div>

      {selected && (
        <>
          <div className="mb-backdrop" onClick={() => setSelectedId(null)} />
          <aside className="mb-panel" aria-label="회원 상세">
            <MemberDetailPanel key={selected.id}
              member={selected}
              stat={statsMap[selected.id]}
              trainer={trainers.find(t => t.id === selected.trainer_id)}
              gymId={gymId}
              currentTrainer={currentTrainer}
              paymentsVersion={paymentsVersion}
              onClose={() => setSelectedId(null)}
              onPay={() => setPayTarget(selected)} />
          </aside>
        </>
      )}

      <PaymentDialog
        open={!!payTarget}
        member={payTarget}
        gymId={gymId}
        trainers={trainers}
        currentTrainer={currentTrainer}
        onClose={() => setPayTarget(null)}
        onPaid={() => {
          setPaymentsVersion(v => v + 1)
          if (gymId) loadStats()
          if (payTarget) refreshMember(payTarget.id)
        }}
      />

      <Modal open={addModal} onClose={() => setAddModal(false)} title="신규 회원 등록" maxWidth="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          <label className="pause-field"><span>이름</span>
            <input className="input" placeholder="홍길동" value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="pause-field"><span>연락처</span>
            <input className="input" placeholder="010-0000-0000" value={addForm.phone}
              onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
          </label>
          <label className="pause-field"><span>담당 트레이너</span>
            {activeTrainers.length === 0
              ? <span style={{ fontSize: '12.5px', color: 'var(--text-dim)', padding: '8px 0' }}>재직 중인 트레이너가 없어요</span>
              : (
                <select className="input" value={addForm.trainer_id}
                  onChange={e => setAddForm(f => ({ ...f, trainer_id: e.target.value }))}>
                  {activeTrainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
          </label>
          {addError && <div className="pause-error" role="alert">{addError}</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setAddModal(false)}>취소</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
            onClick={handleAdd} disabled={saving || activeTrainers.length === 0}>
            {saving ? '등록 중…' : '등록'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
