import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'

const CONTRACT_TYPES = { pt:'PT 계약', group:'그룹 수업', membership:'회원권' }

function SignatureCanvas({ onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const lastPos = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1e2329'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#e8ecf0'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = useCallback((e) => {
    e.preventDefault()
    setDrawing(true)
    const canvas = canvasRef.current
    lastPos.current = getPos(e, canvas)
  }, [])

  const draw = useCallback((e) => {
    if (!drawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setHasStrokes(true)
  }, [drawing])

  const stopDraw = useCallback(() => setDrawing(false), [])

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1e2329'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  function handleSave() {
    if (!hasStrokes) return
    const canvas = canvasRef.current
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div>
      <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'8px' }}>아래 영역에 서명해주세요</div>
      <canvas
        ref={canvasRef}
        width={440} height={180}
        style={{ width:'100%', height:'180px', borderRadius:'10px', border:'1px solid var(--border)', touchAction:'none', cursor:'crosshair', display:'block' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
        <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={clearCanvas}>초기화</button>
        <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={onCancel}>취소</button>
        <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} disabled={!hasStrokes} onClick={handleSave}>서명 완료</button>
      </div>
    </div>
  )
}

export default function ContractsTab({ gymId, trainers, members }) {
  const showToast = useToast()
  const [contracts, setContracts]   = useState([])
  const [showForm,  setShowForm]    = useState(false)
  const [selected,  setSelected]    = useState(null)
  const [showSign,  setShowSign]    = useState(false)
  const [signing,   setSigning]     = useState(false)
  const [filter,    setFilter]      = useState('all')

  const [form, setForm] = useState({
    member_id: '', trainer_id: '', contract_type: 'pt',
    product_name: '', session_count: '', amount: '',
    start_date: '', end_date: '', special_terms: '',
  })

  useEffect(() => { loadContracts() }, [gymId])

  async function loadContracts() {
    const { data } = await supabase.from('member_contracts')
      .select('*, members(name, phone), trainers(name)')
      .eq('gym_id', gymId).order('created_at', { ascending: false })
    setContracts(data || [])
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.member_id || !form.product_name) { showToast('회원과 상품명을 입력해주세요'); return }
    const { data, error } = await supabase.from('member_contracts').insert({
      gym_id: gymId, member_id: form.member_id, trainer_id: form.trainer_id || null,
      contract_type: form.contract_type, product_name: form.product_name,
      session_count: form.session_count ? Number(form.session_count) : null,
      amount: form.amount ? Number(form.amount) : null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      special_terms: form.special_terms || null, status: 'draft',
    }).select().single()
    if (error) { showToast('오류: ' + error.message); return }
    showToast('✓ 계약서 초안 생성')
    setShowForm(false)
    setForm({ member_id:'', trainer_id:'', contract_type:'pt', product_name:'', session_count:'', amount:'', start_date:'', end_date:'', special_terms:'' })
    await loadContracts()
    setSelected(data)
  }

  async function handleSign(dataUrl) {
    if (!selected) return
    setSigning(true)
    try {
      // Base64 → Blob
      const res   = await fetch(dataUrl)
      const blob  = await res.blob()
      const path  = `${gymId}/${selected.id}/signature.png`
      const { error: upErr } = await supabase.storage.from('contract-signatures').upload(path, blob, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('contract-signatures').getPublicUrl(path)
      await supabase.from('member_contracts').update({ signature_url: publicUrl, signed_at: new Date().toISOString(), status: 'signed' }).eq('id', selected.id)
      showToast('✓ 서명 완료')
      setShowSign(false)
      await loadContracts()
      const { data: updated } = await supabase.from('member_contracts').select('*, members(name, phone), trainers(name)').eq('id', selected.id).single()
      setSelected(updated)
    } catch(e) { showToast('오류: ' + e.message) }
    finally { setSigning(false) }
  }

  async function handleCancel(id) {
    await supabase.from('member_contracts').update({ status: 'cancelled' }).eq('id', id)
    showToast('계약서 취소됨')
    setSelected(null)
    loadContracts()
  }

  const filtered = contracts.filter(c => filter === 'all' || c.status === filter)

  const STATUS = {
    draft:     { label:'초안', color:'var(--yellow)',  bg:'rgba(250,204,21,0.1)' },
    signed:    { label:'서명 완료', color:'var(--green)', bg:'rgba(74,222,128,0.1)' },
    cancelled: { label:'취소됨', color:'var(--red)',   bg:'rgba(248,113,113,0.1)' },
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ display:'flex', gap:'6px' }}>
          {[['all','전체'],['draft','초안'],['signed','서명 완료'],['cancelled','취소']].map(([v,l]) => (
            <button key={v} className={`filter-chip ${filter===v?'active':''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ padding:'6px 14px', fontSize:'12px' }} onClick={() => setShowForm(v=>!v)}>+ 계약서 작성</button>
      </div>

      {/* 계약서 생성 폼 */}
      {showForm && (
        <div className="card" style={{ marginBottom:'16px' }}>
          <div className="card-title">계약서 작성</div>
          <form onSubmit={handleCreate}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'8px' }}>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>회원 *</div>
                <select className="input" value={form.member_id} onChange={e => setForm(v=>({...v,member_id:e.target.value}))}>
                  <option value="">선택</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>담당 트레이너</div>
                <select className="input" value={form.trainer_id} onChange={e => setForm(v=>({...v,trainer_id:e.target.value}))}>
                  <option value="">선택</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>계약 종류</div>
                <select className="input" value={form.contract_type} onChange={e => setForm(v=>({...v,contract_type:e.target.value}))}>
                  {Object.entries(CONTRACT_TYPES).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            </div>
            <input className="input" placeholder="상품명 *" value={form.product_name} onChange={e => setForm(v=>({...v,product_name:e.target.value}))} style={{ marginBottom:'8px' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
              <input className="input" type="number" placeholder="세션 수" value={form.session_count} onChange={e => setForm(v=>({...v,session_count:e.target.value}))} />
              <input className="input" type="number" placeholder="금액 (원)" value={form.amount} onChange={e => setForm(v=>({...v,amount:e.target.value}))} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
              <div><div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>시작일</div><input className="input" type="date" value={form.start_date} onChange={e => setForm(v=>({...v,start_date:e.target.value}))} /></div>
              <div><div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>종료일</div><input className="input" type="date" value={form.end_date} onChange={e => setForm(v=>({...v,end_date:e.target.value}))} /></div>
            </div>
            <textarea className="input" placeholder="특약 사항 (선택)" rows={2} value={form.special_terms} onChange={e => setForm(v=>({...v,special_terms:e.target.value}))} style={{ resize:'none', marginBottom:'8px' }} />
            <div style={{ display:'flex', gap:'8px' }}>
              <button type="button" className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowForm(false)}>취소</button>
              <button type="submit" className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>초안 저장</button>
            </div>
          </form>
        </div>
      )}

      {/* 계약서 목록 */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">📝</div><div className="empty-state-text">계약서가 없어요</div></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>회원</th><th>상품</th><th>기간</th><th style={{textAlign:'right'}}>금액</th><th>상태</th><th></th></tr></thead>
            <tbody>
              {filtered.map(c => {
                const st = STATUS[c.status] || STATUS.draft
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight:600, fontSize:'13px' }}>{c.members?.name || '—'}</div>
                      <div style={{ fontSize:'11px', color:'var(--text-dim)' }}>{c.members?.phone || ''}</div>
                    </td>
                    <td>
                      <div style={{ fontSize:'13px' }}>{c.product_name}</div>
                      <div style={{ fontSize:'11px', color:'var(--text-dim)' }}>{CONTRACT_TYPES[c.contract_type]} · {c.session_count ? `${c.session_count}회` : '—'}</div>
                    </td>
                    <td style={{ fontSize:'11px', color:'var(--text-muted)' }}>{c.start_date || '—'} ~<br />{c.end_date || '—'}</td>
                    <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:'12px', color:'var(--accent)', fontWeight:700 }}>
                      {c.amount ? c.amount.toLocaleString() + '원' : '—'}
                    </td>
                    <td><span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span></td>
                    <td><button className="btn btn-secondary" style={{ padding:'4px 10px', fontSize:'11px' }} onClick={() => setSelected(c)}>상세</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 계약서 상세 모달 */}
      <Modal open={!!selected && !showSign} onClose={() => setSelected(null)} title="계약서 상세" maxWidth="500px">
        {selected && (() => {
          const st = STATUS[selected.status] || STATUS.draft
          return (
            <div>
              <div style={{ background:'var(--surface2)', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
                  <div>
                    <div style={{ fontSize:'16px', fontWeight:700 }}>{selected.product_name}</div>
                    <div style={{ fontSize:'12px', color:'var(--text-dim)', marginTop:'2px' }}>{CONTRACT_TYPES[selected.contract_type]}</div>
                  </div>
                  <span className="badge" style={{ background:st.bg, color:st.color }}>{st.label}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px' }}>
                  {[['회원', selected.members?.name||'—'], ['담당 트레이너', selected.trainers?.name||'—'],
                    ['세션 수', selected.session_count ? `${selected.session_count}회` : '—'],
                    ['금액', selected.amount ? selected.amount.toLocaleString()+'원' : '—'],
                    ['시작일', selected.start_date||'—'], ['종료일', selected.end_date||'—']].map(([k,v]) => (
                    <div key={k} style={{ background:'var(--surface3)', borderRadius:'6px', padding:'8px 10px' }}>
                      <div style={{ fontSize:'10px', color:'var(--text-dim)', marginBottom:'2px' }}>{k}</div>
                      <div style={{ fontWeight:500 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {selected.special_terms && (
                  <div style={{ marginTop:'10px', padding:'10px', background:'var(--surface3)', borderRadius:'8px', fontSize:'12px', color:'var(--text-muted)' }}>
                    <div style={{ fontSize:'10px', color:'var(--text-dim)', marginBottom:'4px' }}>특약 사항</div>
                    {selected.special_terms}
                  </div>
                )}
              </div>

              {/* 서명 정보 */}
              {selected.status === 'signed' && selected.signature_url ? (
                <div className="card" style={{ marginBottom:'12px' }}>
                  <div className="card-title">서명</div>
                  <img src={selected.signature_url} alt="서명" style={{ width:'100%', borderRadius:'8px', border:'1px solid var(--border)' }} />
                  <div style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'6px' }}>
                    서명 완료: {selected.signed_at ? new Date(selected.signed_at).toLocaleString('ko-KR') : '—'}
                  </div>
                </div>
              ) : selected.status === 'draft' ? (
                <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginBottom:'8px' }} onClick={() => { setShowSign(true) }}>
                  ✍️ 서명하기
                </button>
              ) : null}

              {selected.status !== 'cancelled' && (
                <button className="btn btn-secondary" style={{ width:'100%', justifyContent:'center', color:'var(--red)', borderColor:'rgba(248,113,113,0.3)' }} onClick={() => handleCancel(selected.id)}>
                  계약 취소
                </button>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* 서명 모달 */}
      <Modal open={showSign} onClose={() => setShowSign(false)} title="전자 서명" maxWidth="500px">
        <SignatureCanvas
          onSave={handleSign}
          onCancel={() => setShowSign(false)}
        />
        {signing && <div style={{ textAlign:'center', marginTop:'10px', color:'var(--text-dim)', fontSize:'12px' }}><span className="spinner">✦</span> 서명 저장 중...</div>}
      </Modal>
    </div>
  )
}
