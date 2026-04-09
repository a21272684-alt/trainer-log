import { useState, useEffect, useRef } from 'react'
import { supabase, GEMINI_MODEL } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import { Link } from 'react-router-dom'
import '../styles/trainer.css'

// 통합 매출 내역 (revenue 탭용)
function RevenuePaymentList({ trainerId, members }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    if (!trainerId) return
    supabase.from('payments').select('*').eq('trainer_id', trainerId).order('paid_at', { ascending: false }).limit(50)
      .then(({ data }) => setList(data || []))
  }, [trainerId])
  if (!list) return <div style={{padding:'12px',color:'var(--text-dim)',fontSize:'13px'}}>불러오는 중...</div>
  if (!list.length) return <div className="empty" style={{padding:'20px'}}><p>결제 내역이 없어요</p></div>
  const total = list.reduce((s,p) => s+p.amount, 0)
  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'8px'}}>
        <span style={{fontSize:'12px',color:'var(--text-muted)'}}>총 <span style={{color:'var(--accent)',fontWeight:700}}>{total.toLocaleString()}원</span></span>
      </div>
      {list.map(p => {
        const mem = members.find(m => m.id === p.member_id)
        const d = new Date(p.paid_at).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
        return (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
            <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'var(--accent)',color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'12px',flexShrink:0}}>{mem?.name[0]||'?'}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',fontWeight:500}}>{mem?.name||'회원'} · {p.product_name}</div>
              <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{d} · {p.session_count}회{p.memo?' · '+p.memo:''}{p.tax_included?' (부가세포함)':''}</div>
            </div>
            <div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--accent)',flexShrink:0}}>{p.amount.toLocaleString()}원</div>
          </div>
        )
      })}
    </div>
  )
}

// 회원별 분석 카드 (확정 매출 = payments 합계)
function MemberRevenueCard({ m, mWeekLogs, mMonthLogs, attendRate, cancelledBlocks, remain, pct, price, dayOfMonth, daysInMonth, trainerId }) {
  const [confirmed, setConfirmed] = useState(null)
  useEffect(() => {
    if (!trainerId) return
    supabase.from('payments').select('amount').eq('member_id', m.id)
      .then(({ data }) => setConfirmed((data||[]).reduce((s,p)=>s+p.amount,0)))
  }, [m.id, trainerId])
  return (
    <div className="card" style={{marginBottom:'12px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
        <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'var(--accent)',color:'#0f0f0f',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'14px'}}>{m.name[0]}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:'14px',fontWeight:600}}>{m.name}</div>
          <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{m.lesson_purpose||''} · 단가 {price ? price.toLocaleString()+'원' : '미설정'}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:'16px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--accent)'}}>{confirmed!=null?confirmed.toLocaleString():'—'}<span style={{fontSize:'11px'}}>원</span></div>
          <div style={{fontSize:'10px',color:'var(--text-dim)'}}>확정 매출</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'12px'}}>
        {[
          [attendRate!==null?attendRate+'%':'—','주간출석률',attendRate!==null?(attendRate>=80?'#4ade80':attendRate>=60?'#facc15':'var(--danger)'):'var(--text-dim)'],
          [mWeekLogs.length,'주당소진','var(--text)'],
          [mMonthLogs.length,'월간소진','var(--text)'],
          [dayOfMonth>0&&mMonthLogs.length>0?Math.round(mMonthLogs.length/dayOfMonth*daysInMonth):0,'월간예상','#60a5fa']
        ].map(([v,l,c],i)=>(
          <div key={i} style={{textAlign:'center',padding:'8px',background:'var(--surface2)',borderRadius:'8px'}}>
            <div style={{fontSize:'15px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:c}}>{v}</div>
            <div style={{fontSize:'10px',color:'var(--text-dim)',marginTop:'2px'}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{height:'4px',background:'var(--border)',borderRadius:'2px',overflow:'hidden',marginBottom:'8px'}}>
        <div style={{height:'100%',background:'var(--accent)',borderRadius:'2px',width:pct+'%'}}></div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'var(--text-muted)'}}>
        <span>{m.done_sessions}회 완료 · 잔여 {remain}회</span>
        {price>0 && <span style={{color:'var(--accent)'}}>잔여 예상 수익 {(price*remain).toLocaleString()}원</span>}
      </div>
      {cancelledBlocks.length>0 && (
        <div style={{marginTop:'10px',paddingTop:'10px',borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:'10px',color:'var(--danger)',marginBottom:'6px'}}>취소 이력 {cancelledBlocks.length}건</div>
          {cancelledBlocks.slice(-3).map((b,i)=>(
            <div key={i} style={{fontSize:'11px',color:'var(--text-muted)',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              {b.date} · {b.cancelType}{b.cancelDetail?' — '+b.cancelDetail:''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const COLORS=[{id:'green',bg:'#c8f135',tx:'#1a3300'},{id:'blue',bg:'#60a5fa',tx:'#1e3a5f'},{id:'purple',bg:'#a78bfa',tx:'#2e1065'},{id:'coral',bg:'#fb923c',tx:'#431407'},{id:'pink',bg:'#f472b6',tx:'#500724'},{id:'teal',bg:'#2dd4bf',tx:'#134e4a'},{id:'yellow',bg:'#facc15',tx:'#422006'},{id:'gray',bg:'#94a3b8',tx:'#1e293b'}]
const DAYS=['월','화','수','목','금','토','일']
const SH=6,EH=23,SMIN=5,SPX=4

export default function TrainerApp() {
  const showToast = useToast()
  const [screen, setScreen] = useState('login') // login, reg, app
  const [trainer, setTrainer] = useState(null)
  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('members')
  const [activePage, setActivePage] = useState('page-members')
  const [currentMemberId, setCurrentMemberId] = useState(null)
  const [exercises, setExercises] = useState([])
  const [audioData, setAudioData] = useState(null)
  const [audioMime, setAudioMime] = useState(null)
  const [audioName, setAudioName] = useState('')
  const [audioSize, setAudioSize] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [previewContent, setPreviewContent] = useState('')
  const [finalContent, setFinalContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [rtab, setRtab] = useState('write')
  const [healthData, setHealthData] = useState(null)

  // Member sort
  const [memberSort, setMemberSort] = useState('created') // 'name' | 'created' | 'expire'

  // Add member form
  const [addForm, setAddForm] = useState({name:'',kakao_phone:'',phone:'',email:'',purpose:'체형교정',total:'',done:'0',price:'',memo:''})

  // Edit member modal
  const [editMemberModal, setEditMemberModal] = useState(false)
  const [editMemberForm, setEditMemberForm] = useState({})
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false)

  // Attendance
  const [attendanceDates, setAttendanceDates] = useState([]) // [{id, attended_date}]
  const [attendanceMonth, setAttendanceMonth] = useState(() => { const n=new Date(); return {y:n.getFullYear(),m:n.getMonth()} })

  // Products & Payments
  const [products, setProducts] = useState([])
  const [payments, setPayments] = useState([])
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentTab, setPaymentTab] = useState('pay') // 'pay' | 'products'
  const [productFormModal, setProductFormModal] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [productForm, setProductForm] = useState({name:'',count:'',priceEx:'',priceIn:''})
  const [paymentForm, setPaymentForm] = useState({productId:'',memo:'',customAmount:'',taxIncluded:false})
  const [cancelPaymentTarget, setCancelPaymentTarget] = useState(null) // 취소 확인 대상 payment

  // Exercise modal
  const [exModal, setExModal] = useState(false)
  const [exName, setExName] = useState('')
  const [newSets, setNewSets] = useState([])
  const [editingExId, setEditingExId] = useState(null)
  const [setReps, setSetReps] = useState('')
  const [setRir, setSetRir] = useState('')
  const [setFeel, setSetFeel] = useState('')

  // Settings modal
  const [settingsModal, setSettingsModal] = useState(false)
  const [apiKey, setApiKey] = useState('')

  // Schedule
  const [weekOff, setWeekOff] = useState(0)
  const [blocks, setBlocks] = useState(() => JSON.parse(localStorage.getItem('tl_sch')||'[]'))
  const [schModal, setSchModal] = useState(false)
  const [editBlockId, setEditBlockId] = useState(null)
  const [selColor, setSelColor] = useState('green')
  const [selType, setSelType] = useState('lesson')
  const [blockDate, setBlockDate] = useState('')
  const [blockStart, setBlockStart] = useState('09:00')
  const [blockEnd, setBlockEnd] = useState('10:00')
  const [blockMemo, setBlockMemo] = useState('')
  const [blockMemberId, setBlockMemberId] = useState('')
  const [blockTitle, setBlockTitle] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelType, setCancelType] = useState('')
  const [cancelDetail, setCancelDetail] = useState('')

  // Login
  const [loginName, setLoginName] = useState('')
  const [loginPhone, setLoginPhone] = useState('')
  const [regName, setRegName] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regApi, setRegApi] = useState('')

  const audioInputRef = useRef(null)

  useEffect(() => { localStorage.setItem('tl_sch', JSON.stringify(blocks)) }, [blocks])

  const currentMember = members.find(m => m.id === currentMemberId)

  async function login() {
    if (!loginName || !loginPhone) { showToast('이름과 전화번호를 입력해주세요'); return }
    try {
      const { data } = await supabase.from('trainers').select('*').eq('name', loginName).eq('phone', loginPhone)
      if (!data?.length) { showToast('등록된 트레이너 정보가 없어요'); return }
      setTrainer(data[0]); setApiKey(data[0].api_key || ''); setScreen('app')
      showToast('✓ 환영해요, ' + data[0].name + ' 트레이너님!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function register() {
    if (!regName || !regPhone) { showToast('이름과 전화번호를 입력해주세요'); return }
    try {
      const { data: ex } = await supabase.from('trainers').select('*').eq('name', regName).eq('phone', regPhone)
      if (ex?.length) { showToast('이미 등록됐어요. 로그인해주세요'); setScreen('login'); return }
      await supabase.from('trainers').insert({ name: regName, phone: regPhone, api_key: regApi })
      showToast('✓ 등록 완료! 로그인해주세요'); setScreen('login')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  useEffect(() => { if (trainer) { loadMembers(); loadLogs(); loadProducts() } }, [trainer])

  async function loadMembers() {
    const { data } = await supabase.from('members').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: false })
    setMembers(data || [])
  }
  async function loadLogs() {
    const { data } = await supabase.from('logs').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: false }).limit(50)
    setLogs(data || [])
  }

  async function loadProducts() {
    if (!trainer) return
    const { data } = await supabase.from('products').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: true })
    setProducts(data || [])
  }
  async function loadPayments(memberId) {
    const { data } = await supabase.from('payments').select('*').eq('member_id', memberId).order('paid_at', { ascending: false })
    setPayments(data || [])
  }
  async function saveProduct() {
    const f = productForm
    if (!f.name || !f.count) { showToast('상품명과 횟수를 입력해주세요'); return }
    const payload = { trainer_id: trainer.id, name: f.name, session_count: parseInt(f.count)||0, price_excl_tax: parseInt(f.priceEx)||0, price_incl_tax: parseInt(f.priceIn)||0 }
    try {
      if (editingProductId) {
        await supabase.from('products').update(payload).eq('id', editingProductId)
        showToast('✓ 상품이 수정됐어요')
      } else {
        await supabase.from('products').insert(payload)
        showToast('✓ 상품이 추가됐어요')
      }
      await loadProducts(); setProductFormModal(false)
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deleteProduct(id) {
    try {
      await supabase.from('products').delete().eq('id', id)
      await loadProducts(); showToast('상품이 삭제됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function addPayment() {
    const f = paymentForm
    const prod = products.find(p => p.id === f.productId)
    if (!prod) { showToast('상품을 선택해주세요'); return }
    const amount = f.taxIncluded ? (prod.price_incl_tax||prod.price_excl_tax) : prod.price_excl_tax
    try {
      await supabase.from('payments').insert({
        trainer_id: trainer.id, member_id: currentMemberId,
        product_id: prod.id, product_name: prod.name,
        session_count: prod.session_count, amount,
        tax_included: f.taxIncluded, memo: f.memo
      })
      // 회원 total_sessions 업데이트
      const m = members.find(x => x.id === currentMemberId)
      await supabase.from('members').update({ total_sessions: (m?.total_sessions||0) + prod.session_count }).eq('id', currentMemberId)
      await loadMembers(); await loadPayments(currentMemberId)
      setPaymentForm({productId:'',memo:'',taxIncluded:false})
      showToast('✓ 결제가 등록됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deletePayment(payment) {
    try {
      await supabase.from('payments').delete().eq('id', payment.id)
      // 회원 total_sessions 복원
      const m = members.find(x => x.id === currentMemberId)
      await supabase.from('members').update({ total_sessions: Math.max(0,(m?.total_sessions||0) - payment.session_count) }).eq('id', currentMemberId)
      await loadMembers(); await loadPayments(currentMemberId)
      showToast('결제가 취소됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // Attendance
  async function loadAttendance(memberId) {
    const { y, m } = attendanceMonth
    const from = `${y}-${String(m+1).padStart(2,'0')}-01`
    const to = `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}`
    const { data } = await supabase.from('attendance').select('*').eq('member_id', memberId).gte('attended_date', from).lte('attended_date', to)
    setAttendanceDates(data || [])
  }
  async function toggleAttendance(dateStr) {
    const existing = attendanceDates.find(a => a.attended_date === dateStr)
    if (existing) {
      await supabase.from('attendance').delete().eq('id', existing.id)
    } else {
      await supabase.from('attendance').insert({ trainer_id: trainer.id, member_id: currentMemberId, attended_date: dateStr })
    }
    await loadAttendance(currentMemberId)
  }
  useEffect(() => { if (rtab === 'attendance' && currentMemberId) loadAttendance(currentMemberId) }, [rtab, attendanceMonth, currentMemberId])

  function showTabFn(t) {
    setTab(t)
    setActivePage('page-' + t)
  }

  // === MEMBERS ===
  async function addMember() {
    if (!addForm.name || !addForm.phone) { showToast('이름과 전화번호를 입력해주세요'); return }
    try {
      await supabase.from('members').insert({
        trainer_id: trainer.id, name: addForm.name, kakao_phone: addForm.kakao_phone, phone: addForm.phone, email: addForm.email,
        lesson_purpose: addForm.purpose, total_sessions: parseInt(addForm.total)||0, done_sessions: parseInt(addForm.done)||0,
        session_price: parseInt(addForm.price)||0, memo: addForm.memo
      })
      await loadMembers(); setActivePage('page-members'); setTab('members'); showToast('✓ 회원이 추가됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  function openRecord(memberId) {
    setCurrentMemberId(memberId); setExercises([]); setActivePage('page-record')
    setAudioData(null); setShowPreview(false); setShowSend(false); setRawInput(''); setFinalContent(''); setRtab('write')
  }

  function openEditMember(m) {
    setEditMemberForm({
      id: m.id, name: m.name, kakao_phone: m.kakao_phone||'', phone: m.phone||'',
      email: m.email||'', purpose: m.lesson_purpose||'체형교정',
      total: String(m.total_sessions||0), done: String(m.done_sessions||0),
      price: String(m.session_price||0), memo: m.memo||''
    })
    setEditMemberModal(true)
  }

  async function updateMember() {
    const f = editMemberForm
    if (!f.name || !f.phone) { showToast('이름과 전화번호를 입력해주세요'); return }
    try {
      await supabase.from('members').update({
        name: f.name, kakao_phone: f.kakao_phone, phone: f.phone, email: f.email,
        lesson_purpose: f.purpose, total_sessions: parseInt(f.total)||0,
        done_sessions: parseInt(f.done)||0, session_price: parseInt(f.price)||0, memo: f.memo
      }).eq('id', f.id)
      await loadMembers()
      setEditMemberModal(false)
      showToast('✓ 회원 정보가 수정됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function deleteMember() {
    try {
      await supabase.from('members').delete().eq('id', editMemberForm.id)
      await loadMembers()
      setDeleteConfirmModal(false)
      setEditMemberModal(false)
      showToast('회원이 삭제됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // === AUDIO ===
  function handleAudio(e) {
    const file = e.target.files[0]; if (!file) return
    if (file.size > 100*1024*1024) { showToast('파일이 너무 커요. 100MB 이하만 가능해요.'); return }
    setAudioName(file.name); setAudioSize((file.size/(1024*1024)).toFixed(1) + ' MB')
    const reader = new FileReader()
    reader.onload = ev => {
      setAudioData(ev.target.result.split(',')[1])
      setAudioMime(file.type || 'audio/m4a')
      showToast('✓ 파일 업로드 완료!')
    }
    reader.readAsDataURL(file)
  }
  function removeAudio() { setAudioData(null); if (audioInputRef.current) audioInputRef.current.value = '' }

  // === EXERCISES ===
  function openAddExercise() { setNewSets([]); setEditingExId(null); setExName(''); setSetReps(''); setSetRir(''); setSetFeel(''); setExModal(true) }
  function addSet() {
    if (!setReps) { showToast('횟수를 입력해주세요'); return }
    setNewSets([...newSets, { reps: setReps, rir: setRir, feel: setFeel }])
    setSetReps(''); setSetRir(''); setSetFeel('')
  }
  function confirmAddExercise() {
    if (!exName) { showToast('운동 종목명을 입력해주세요'); return }
    if (!newSets.length) { showToast('세트를 최소 1개 추가해주세요'); return }
    if (editingExId) {
      setExercises(exercises.map(e => e.id === editingExId ? { id: editingExId, name: exName, sets: [...newSets] } : e))
    } else {
      setExercises([...exercises, { id: Date.now().toString(), name: exName, sets: [...newSets] }])
    }
    setExModal(false)
  }
  function editExercise(id) {
    const ex = exercises.find(e => e.id === id); if (!ex) return
    setEditingExId(id); setNewSets([...ex.sets]); setExName(ex.name); setExModal(true)
  }

  // === GENERATE ===
  async function generateLog() {
    if (!audioData && !rawInput && !exercises.length) { showToast('녹음 파일을 업로드하거나 내용을 입력해주세요'); return }
    const key = apiKey || trainer.api_key
    if (!key) { showToast('설정에서 Gemini API 키를 먼저 입력해주세요'); setSettingsModal(true); return }
    const m = currentMember; const remain = Math.max(0, m.total_sessions - m.done_sessions - 1)
    setGenerating(true); setShowPreview(false)
    const exStr = exercises.map(ex => {
      const setsStr = ex.sets.map((s,i) => '  '+(i+1)+'세트 '+s.reps+'회'+(s.rir!==''?' (RIR '+s.rir+')':'')+(s.feel?' → '+s.feel:'')).join('\n')
      return '- '+ex.name+':\n'+setsStr
    }).join('\n')
    const prompt = '당신은 전문 퍼스널 트레이너의 수업일지 작성 도우미입니다.\n\n⚠️ 중요 규칙:\n1. 음성에 수업과 무관한 사적 대화가 포함되어 있을 수 있습니다. 이런 내용은 완전히 무시하세요.\n2. 세트별 RIR과 감각 정보를 반드시 포함하세요.\n3. 중복 내용 제거, 운동별 분류, 친근하고 전문적인 톤, 이모지 사용\n\n[트레이너]: '+trainer.name+'\n[회원]: '+m.name+'\n[세션]: '+(m.done_sessions+1)+'회차 (전체 '+m.total_sessions+'회, 남은 '+remain+'회)\n'+(exStr?'\n[운동 기록]:\n'+exStr:'')+(rawInput?'\n[추가 메모]:\n'+rawInput:'')+'\n\n아래 형식으로 작성:\n📋 수업일지 - '+m.name+' 회원님\n📅 '+new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'})+' | '+(m.done_sessions+1)+'/'+m.total_sessions+'회차\n\n🏋️ 오늘의 운동\n[운동별 세트 기록]\n\n💬 트레이너 코멘트\n[피드백]\n\n🎯 다음 수업 목표\n[2~3가지]\n\n📌 세션 현황: '+(m.done_sessions+1)+'/'+m.total_sessions+'회 완료 · 남은 '+remain+'회\n— '+trainer.name+' 드림'
    try {
      let parts = []
      if (audioData) {
        setAiStatus('AI가 수업 녹음을 분석하는 중...')
        parts.push({inline_data:{mime_type:audioMime,data:audioData}})
        parts.push({text:'\n위 음성에서 운동/수업 관련 내용만 추출하세요.\n\n'+prompt})
      } else { parts.push({text:prompt}) }
      setAiStatus('AI가 수업일지를 작성하는 중...')
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+GEMINI_MODEL+':generateContent?key='+key,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}]})
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      setGenerating(false); setShowPreview(true); setPreviewContent(text); setFinalContent(text); setShowSend(true)
      showToast('✦ 수업일지 생성 완료!')
    } catch(e) { setGenerating(false); showToast('오류: ' + e.message) }
  }

  // === SEND ===
  async function sendKakao() {
    const m = currentMember; if (!finalContent) { showToast('먼저 수업일지를 생성해주세요'); return }
    const reportId = Date.now().toString(36) + Math.random().toString(36).substr(2,5)
    try {
      const exData = exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({reps:s.reps,rir:s.rir,feel:s.feel,weight:s.weight||''})) }))
      await supabase.from('logs').insert({ trainer_id:trainer.id, member_id:currentMemberId, content:finalContent, session_number:m.done_sessions+1, report_id:reportId, exercises_data:exData })
      await supabase.from('members').update({ done_sessions: m.done_sessions+1 }).eq('id', currentMemberId)
      await loadMembers(); await loadLogs()
      const reportUrl = window.location.origin + '/report?id=' + reportId
      const kakaoMsg = m.name + ' 회원님, 오늘 수업 리포트가 도착했어요! 👇\n' + reportUrl
      navigator.clipboard.writeText(kakaoMsg).then(() => showToast('✓ 리포트 링크 복사! 카카오톡에서 붙여넣기 하세요')).catch(()=>{})
      setTimeout(() => { window.location.href = 'kakaolink://open'; setTimeout(() => window.open('https://talk.kakao.com','_blank'), 1200) }, 800)
      setTimeout(() => { setShowSend(false); setShowPreview(false); setAudioData(null); setRawInput(''); setFinalContent(''); setExercises([]) }, 2000)
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function saveSettings() {
    try {
      await supabase.from('trainers').update({ api_key: apiKey }).eq('id', trainer.id)
      setTrainer({...trainer, api_key: apiKey}); setSettingsModal(false); showToast('✓ 설정이 저장됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  // === HEALTH VIEW ===
  async function loadHealthView() {
    try {
      const { data: records } = await supabase.from('health_records').select('*').eq('member_id', currentMemberId).order('record_date', { ascending: false }).limit(30)
      setHealthData(records || [])
    } catch(e) { setHealthData([]) }
  }
  useEffect(() => { if (rtab === 'health' && currentMemberId) loadHealthView() }, [rtab, currentMemberId])

  // === SCHEDULE HELPERS ===
  function getWeekDates() {
    const now = new Date(); const day = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate()-(day===0?6:day-1)+weekOff*7)
    return Array.from({length:7},(_,i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d })
  }
  const dStr = d => d.toISOString().split('T')[0]
  const tToSlot = t => { const[h,m]=t.split(':').map(Number); return(h-SH)*60/SMIN+m/SMIN }
  const slotToT = s => { const tot=SH*60+s*SMIN; return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0') }

  function openAddBlock(ds, start, end) {
    setEditBlockId(null); setBlockDate(ds||dStr(new Date())); setBlockStart(start||'09:00'); setBlockEnd(end||'10:00')
    setBlockMemo(''); setBlockTitle(''); setSelType('lesson'); setSelColor('green')
    setBlockMemberId(members[0]?.id || ''); setShowCancelForm(false); setCancelType(''); setCancelDetail(''); setSchModal(true)
  }
  function openEditBlock(id) {
    const b = blocks.find(x => x.id === id); if (!b) return
    setEditBlockId(id); setBlockDate(b.date); setBlockStart(b.start); setBlockEnd(b.end)
    setBlockMemo(b.memo||''); setBlockTitle(b.title||''); setSelType(b.type); setSelColor(b.color)
    setBlockMemberId(b.memberId||''); setShowCancelForm(false); setCancelType(''); setCancelDetail(''); setSchModal(true)
  }
  function toggleCancel() {
    if (showCancelForm) {
      if (!cancelType) { showToast('취소 사유를 선택해주세요'); return }
      if (!editBlockId) return
      setBlocks(blocks.map(b => b.id===editBlockId ? {...b, cancelled:true, cancelType, cancelDetail} : b))
      setSchModal(false); showToast('취소 처리됐어요')
    } else {
      setShowCancelForm(true)
    }
  }
  function saveBlock() {
    if (!blockDate||!blockStart||!blockEnd) { showToast('날짜와 시간을 입력해주세요'); return }
    if (blockStart>=blockEnd) { showToast('종료 시간이 시작보다 늦어야 해요'); return }
    const block = { id:editBlockId||Date.now().toString(), date:blockDate, start:blockStart, end:blockEnd, type:selType, color:selColor, memo:blockMemo.trim(), memberId:selType==='lesson'?blockMemberId:null, title:selType==='personal'?blockTitle.trim():null }
    setBlocks(editBlockId ? blocks.map(b=>b.id===editBlockId?block:b) : [...blocks,block])
    setSchModal(false); showToast(editBlockId?'✓ 수정됐어요!':'✓ 스케쥴 추가됐어요!')
  }
  function deleteBlock() { if (!editBlockId) return; setBlocks(blocks.filter(b=>b.id!==editBlockId)); setSchModal(false); showToast('삭제됐어요') }

  // === RENDER SCHEDULE GRID ===
  function renderScheduleGrid() {
    const dates = getWeekDates(); const todayStr = dStr(new Date())
    const totalSlots = (EH-SH)*60/SMIN; const totalPx = totalSlots*SPX
    return (
      <div className="sg-wrap">
        <div className="sg" style={{display:'grid',gridTemplateColumns:'40px repeat(7,1fr)',minWidth:'480px'}}>
          <div className="sg-th-e" style={{height:'36px'}}></div>
          {dates.map((d,i) => {
            const isToday = dStr(d)===todayStr
            return <div key={i} className={`sg-th${isToday?' today':''}`}><span className="d">{d.getDate()}</span>{DAYS[i]}</div>
          })}
          <div className="sg-tc" style={{height:totalPx+'px',position:'relative'}}>
            {Array.from({length:totalSlots+1}).map((_,s) => {
              const min=s*SMIN
              if (min%60===0) { const h=SH+min/60; return <div key={s} className="sg-tl" style={{top:s*SPX+'px'}}>{h}:00</div> }
              return null
            })}
          </div>
          {dates.map(d => {
            const ds = dStr(d); const dayBlocks = blocks.filter(b=>b.date===ds)
            return (
              <div key={ds} className="sg-dc" style={{height:totalPx+'px'}} onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect(); const y = e.clientY-rect.top
                const slot = Math.round(y/SPX); const maxSlot = totalSlots
                openAddBlock(ds, slotToT(Math.max(0,slot)), slotToT(Math.min(slot+12,maxSlot)))
              }}>
                {Array.from({length:totalSlots}).map((_,s) => {
                  const min=s*SMIN
                  if (min%60===0) return <div key={s} className="sg-hl" style={{top:s*SPX+'px',borderTop:'1px solid var(--border)'}}></div>
                  if (min%30===0) return <div key={s} className="sg-hl" style={{top:s*SPX+'px',borderTop:'1px dashed rgba(255,255,255,0.04)'}}></div>
                  return null
                })}
                {dayBlocks.map(b => {
                  const h = Math.max((tToSlot(b.end)-tToSlot(b.start))*SPX-2,14); const top = tToSlot(b.start)*SPX+1
                  const col = COLORS.find(c=>c.id===b.color)||COLORS[0]
                  const label = b.type==='lesson'?(members.find(m=>m.id===b.memberId)?.name||'회원'):(b.title||'개인일정')
                  const cancelledStyle = b.cancelled ? {opacity:0.4,textDecoration:'line-through'} : {}
                  return (
                    <div key={b.id} className="sg-blk" style={{top:top+'px',height:h+'px',background:b.cancelled?'#444':col.bg,color:b.cancelled?'#aaa':col.tx,...cancelledStyle}} onClick={e => { e.stopPropagation(); openEditBlock(b.id) }}>
                      <span className="bn">{label}</span>
                      {h>22 && <span className="bt">{b.start}~{b.end}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // === 매출관리 ===
  function renderRevenue() {
    if (!members.length) return <div style={{textAlign:'center',padding:'40px',color:'var(--text-dim)'}}>회원을 먼저 추가해주세요</div>
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate()-(now.getDay()||7)+1); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const weekLogs = logs.filter(l => new Date(l.created_at) >= weekStart)
    const monthLogs = logs.filter(l => new Date(l.created_at) >= monthStart)
    const remainRevenue = members.reduce((s,m) => s+(m.session_price||0)*(m.total_sessions-m.done_sessions), 0)
    const weekRevenue = weekLogs.reduce((s,l) => { const m=members.find(x=>x.id===l.member_id); return s+(m?.session_price||0) }, 0)
    const monthRevenue = monthLogs.reduce((s,l) => { const m=members.find(x=>x.id===l.member_id); return s+(m?.session_price||0) }, 0)
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
    const projectedMonth = dayOfMonth>0 ? Math.round(monthRevenue/dayOfMonth*daysInMonth) : 0
    // payments는 전체 로드가 필요하므로 revenuePayments state 사용 (없으면 빈 배열)
    return (
      <div>
        <div style={{marginBottom:'14px'}}>
          <div className="section-label">전체 매출 현황</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
            {[
              [weekRevenue,'이번 주 매출',weekLogs.length+'회 수업','var(--accent)'],
              [monthRevenue,'이번 달 매출',monthLogs.length+'회 수업','var(--accent)'],
              [projectedMonth,'월말 예상 매출',dayOfMonth+'/'+daysInMonth+'일 기준','#facc15'],
              [remainRevenue,'잔여 예상 수익','남은 세션 기준','#60a5fa'],
            ].map(([v,label,sub,c],i)=>(
              <div key={i} className="card" style={{marginBottom:0,padding:'14px'}}>
                <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'6px'}}>{label}</div>
                <div style={{fontSize:'20px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:c}}>{v.toLocaleString()}원</div>
                <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'3px'}}>{sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="section-label">통합 매출 내역</div>
        <RevenuePaymentList trainerId={trainer?.id} members={members} />

        <div className="section-label" style={{marginTop:'20px'}}>회원별 분석</div>
        {members.map(m => {
          const mLogs = logs.filter(l => l.member_id === m.id)
          const mWeekLogs = mLogs.filter(l => new Date(l.created_at) >= weekStart)
          const mMonthLogs = mLogs.filter(l => new Date(l.created_at) >= monthStart)
          const price = m.session_price || 0
          const weekBlocks = blocks.filter(b => b.type==='lesson' && b.memberId===m.id && !b.cancelled && new Date(b.date+'T00:00:00')>=weekStart && new Date(b.date+'T00:00:00')<=now)
          const attendRate = weekBlocks.length>0 ? Math.round((mWeekLogs.length/weekBlocks.length)*100) : null
          const cancelledBlocks = blocks.filter(b => b.memberId===m.id && b.cancelled)
          const remain = m.total_sessions - m.done_sessions
          const pct = m.total_sessions>0 ? Math.round((m.done_sessions/m.total_sessions)*100) : 0
          return (
            <MemberRevenueCard key={m.id} m={m} mWeekLogs={mWeekLogs} mMonthLogs={mMonthLogs}
              attendRate={attendRate} cancelledBlocks={cancelledBlocks}
              remain={remain} pct={pct} price={price}
              dayOfMonth={dayOfMonth} daysInMonth={daysInMonth}
              trainerId={trainer?.id} />
          )
        })}
      </div>
    )
  }

  // === LOGIN SCREEN ===
  if (screen === 'login') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div style={{fontSize:'26px',marginBottom:'10px'}}>💪</div>
          <div className="login-title">TRAINER<span style={{color:'var(--accent)'}}>LOG</span></div>
          <div className="login-sub">트레이너 전용 앱</div>
          <div className="form-group"><label>이름</label><input type="text" value={loginName} onChange={e=>setLoginName(e.target.value)} placeholder="홍길동" /></div>
          <div className="form-group"><label>전화번호 뒷 4자리</label><input type="password" value={loginPhone} onChange={e=>setLoginPhone(e.target.value)} placeholder="1234" maxLength={4} onKeyDown={e=>e.key==='Enter'&&login()} /></div>
          <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={login}>로그인</button>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'14px'}}>
            <span style={{fontSize:'12px',color:'var(--accent)',cursor:'pointer'}} onClick={()=>setScreen('reg')}>트레이너 등록 →</span>
            <Link to="/" style={{fontSize:'12px',color:'var(--text-dim)',textDecoration:'none'}}>← 메인으로</Link>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'reg') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-title">트레이너 등록</div>
          <div className="login-sub">처음 한 번만 등록하세요</div>
          <div className="form-group"><label>이름</label><input type="text" value={regName} onChange={e=>setRegName(e.target.value)} placeholder="홍길동" /></div>
          <div className="form-group"><label>전화번호 뒷 4자리</label><input type="password" value={regPhone} onChange={e=>setRegPhone(e.target.value)} placeholder="1234" maxLength={4} /></div>
          <div className="form-group">
            <label>Gemini API 키 <a href="https://aistudio.google.com/app/apikey" target="_blank" style={{color:'var(--accent)',fontSize:'11px'}}>무료 발급</a></label>
            <input type="text" value={regApi} onChange={e=>setRegApi(e.target.value)} placeholder="AIza..." />
          </div>
          <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={register}>등록 완료</button>
          <div style={{textAlign:'center',marginTop:'12px'}}><span style={{fontSize:'12px',color:'var(--accent)',cursor:'pointer'}} onClick={()=>setScreen('login')}>← 로그인으로</span></div>
        </div>
      </div>
    )
  }

  // === MAIN APP ===
  return (
    <div>
      <div className="topbar-t">
        <div className="topbar-left"><Link to="/" style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'18px',textDecoration:'none'}}>⌂</Link><div className="topbar-title">TRAINER<span>LOG</span></div></div>
        <button className="settings-btn" onClick={()=>setSettingsModal(true)}>⚙ 설정</button>
      </div>
      <div className="tabs-t">
        {['members','history','schedule','revenue'].map(t => (
          <div key={t} className={`tab-t${tab===t?' active':''}`} onClick={()=>showTabFn(t)}>
            {{members:'회원',history:'발송기록',schedule:'시간표',revenue:'매출관리'}[t]}
          </div>
        ))}
      </div>

      {/* MEMBERS LIST */}
      {activePage === 'page-members' && (
        <div className="page-t">
          <div style={{marginBottom:'10px'}}><button className="btn btn-primary" style={{width:'100%'}} onClick={()=>{setAddForm({name:'',kakao_phone:'',phone:'',email:'',purpose:'체형교정',total:'',done:'0',price:'',memo:''});setActivePage('page-add-member')}}>+ 회원 추가</button></div>
          {members.length > 0 && (
            <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
              {[['created','등록일자순'],['name','이름순'],['expire','만료예정순']].map(([key,label])=>(
                <button key={key}
                  onClick={()=>setMemberSort(key)}
                  style={{flex:1,padding:'7px 4px',borderRadius:'8px',border:'1px solid',fontSize:'11px',fontWeight:500,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                    background: memberSort===key ? 'var(--accent)' : 'var(--surface2)',
                    color: memberSort===key ? '#0f0f0f' : 'var(--text-muted)',
                    borderColor: memberSort===key ? 'var(--accent)' : 'var(--border)'}}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {!members.length && <div className="empty"><div style={{fontSize:'36px',marginBottom:'12px'}}>👥</div><p>아직 회원이 없어요.<br/>위에서 첫 회원을 추가해보세요!</p></div>}
          {[...members].sort((a,b) => {
            if (memberSort === 'name') return a.name.localeCompare(b.name, 'ko')
            if (memberSort === 'expire') return (a.total_sessions-a.done_sessions) - (b.total_sessions-b.done_sessions)
            return new Date(b.created_at) - new Date(a.created_at) // created (기본)
          }).map(m => {
            const pct = m.total_sessions>0?Math.round((m.done_sessions/m.total_sessions)*100):0
            const remain = m.total_sessions-m.done_sessions; const low = remain<=3
            return (
              <div key={m.id} className="member-card" onClick={()=>openRecord(m.id)}>
                <div className="member-avatar">{m.name[0]}</div>
                <div className="member-info">
                  <div className="member-name">{m.name}</div>
                  <div className="member-meta">📱 {m.phone}{m.lesson_purpose?' · '+m.lesson_purpose:''}</div>
                  <div className="session-bar-bg"><div className={`session-bar-fill${low?' low':''}`} style={{width:pct+'%'}}></div></div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <span className={`session-badge${low?' low':''}`}>{m.done_sessions}/{m.total_sessions}</span>
                  <button className="btn btn-ghost btn-sm" style={{padding:'4px 8px',fontSize:'13px'}} onClick={e=>{e.stopPropagation();openEditMember(m)}}>✏️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* HISTORY */}
      {activePage === 'page-history' && (
        <div className="page-t">
          {!logs.length && <div className="empty"><div style={{fontSize:'36px',marginBottom:'12px'}}>📋</div><p>발송한 수업일지가 없어요.</p></div>}
          {logs.map(l => {
            const d = new Date(l.created_at)
            const ds = d.toLocaleDateString('ko-KR',{month:'long',day:'numeric'})+' '+d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
            const m = members.find(x=>x.id===l.member_id)
            return (
              <div key={l.id} className="history-item">
                <div className="history-date">{ds} · {m?m.name:'회원'} · {l.session_number}회차</div>
                <div className="history-preview">{l.content?.substring(0,120)}...</div>
              </div>
            )
          })}
        </div>
      )}

      {/* SCHEDULE */}
      {activePage === 'page-schedule' && (
        <div className="page-t">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
            <div className="week-nav">
              <button className="week-nav-btn" onClick={()=>setWeekOff(weekOff-1)}>‹</button>
              <div className="week-label">{(() => { const d = getWeekDates(); return (d[0].getMonth()+1)+'/'+d[0].getDate()+' — '+(d[6].getMonth()+1)+'/'+d[6].getDate() })()}</div>
              <button className="week-nav-btn" onClick={()=>setWeekOff(weekOff+1)}>›</button>
            </div>
            <div style={{display:'flex',gap:'6px'}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setWeekOff(0)} style={{fontSize:'12px'}}>오늘</button>
              <button className="btn btn-primary btn-sm" onClick={()=>openAddBlock(null,null,null)} style={{fontSize:'12px'}}>+ 추가</button>
            </div>
          </div>
          {renderScheduleGrid()}
        </div>
      )}

      {/* REVENUE */}
      {activePage === 'page-revenue' && (
        <div className="page-t">{renderRevenue()}</div>
      )}

      {/* ADD MEMBER */}
      {activePage === 'page-add-member' && (
        <div className="page-t">
          <div className="record-header"><button className="back-btn" onClick={()=>{setActivePage('page-members');setTab('members')}}>←</button><div style={{fontSize:'15px',fontWeight:700}}>회원 추가</div></div>
          <div className="form-group"><label>이름</label><input type="text" value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="홍길동" /></div>
          <div className="form-group"><label>전화번호 (카카오톡 발송용)</label><input type="text" value={addForm.kakao_phone} onChange={e=>setAddForm({...addForm,kakao_phone:e.target.value})} placeholder="010-1234-5678" /></div>
          <div className="form-group"><label>전화번호 뒷 4자리 (회원 포털 로그인용)</label><input type="text" value={addForm.phone} onChange={e=>setAddForm({...addForm,phone:e.target.value})} placeholder="1234" maxLength={4} /></div>
          <div className="form-group"><label>이메일 (선택)</label><input type="email" value={addForm.email} onChange={e=>setAddForm({...addForm,email:e.target.value})} placeholder="example@gmail.com" /></div>
          <div className="form-group"><label>레슨 목적 (필수)</label>
            <select value={addForm.purpose} onChange={e=>setAddForm({...addForm,purpose:e.target.value})}>
              {['체형교정','근비대','다이어트','체력향상','재활','스포츠퍼포먼스','유지관리','기타'].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="divider"></div>
          <div className="section-label">세션 관리</div>
          <div className="two-col">
            <div className="form-group"><label>총 세션 수</label><input type="number" value={addForm.total} onChange={e=>setAddForm({...addForm,total:e.target.value})} placeholder="30" min="1" /></div>
            <div className="form-group"><label>완료한 세션</label><input type="number" value={addForm.done} onChange={e=>setAddForm({...addForm,done:e.target.value})} placeholder="0" min="0" /></div>
          </div>
          <div className="form-group"><label>세션 단가 (원, 예상매출 계산용)</label><input type="number" value={addForm.price} onChange={e=>setAddForm({...addForm,price:e.target.value})} placeholder="60000" min="0" /></div>
          <div className="form-group"><label>메모 (선택)</label><input type="text" value={addForm.memo} onChange={e=>setAddForm({...addForm,memo:e.target.value})} placeholder="부상 이력, 목표 등" /></div>
          <button className="btn btn-primary" style={{width:'100%'}} onClick={addMember}>회원 추가 완료</button>
        </div>
      )}

      {/* RECORD */}
      {activePage === 'page-record' && currentMember && (
        <div className="page-t">
          <div className="record-header"><button className="back-btn" onClick={()=>{setActivePage('page-members');setTab('members')}}>←</button>
            <div style={{flex:1}}><div style={{fontSize:'15px',fontWeight:700}}>{currentMember.name}</div><div style={{fontSize:'12px',color:'var(--text-muted)'}}>📱 {currentMember.phone}{currentMember.lesson_purpose?' · '+currentMember.lesson_purpose:''}</div></div>
            <button className="btn btn-primary btn-sm" style={{fontSize:'12px',whiteSpace:'nowrap'}} onClick={()=>{setPaymentTab('pay');setPaymentForm({productId:'',memo:'',taxIncluded:false});loadPayments(currentMemberId);setPaymentModal(true)}}>💳 결제</button>
          </div>
          <div className="card" style={{marginBottom:'14px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}>
              <span style={{fontSize:'13px',fontWeight:500}}>세션 현황</span>
              <span className="pill">{currentMember.done_sessions}회 완료 · {currentMember.total_sessions-currentMember.done_sessions}회 남음</span>
            </div>
            <div className="session-bar-bg"><div className={`session-bar-fill${(currentMember.total_sessions-currentMember.done_sessions)<=3?' low':''}`} style={{width:(currentMember.total_sessions>0?Math.round((currentMember.done_sessions/currentMember.total_sessions)*100):0)+'%'}}></div></div>
          </div>
          <div className="rtab-row">
            <button className={`btn ${rtab==='write'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('write')} style={{fontSize:'12px'}}>📝 수업일지</button>
            <button className={`btn ${rtab==='attendance'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('attendance')} style={{fontSize:'12px'}}>📅 출석부</button>
            <button className={`btn ${rtab==='health'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setRtab('health')} style={{fontSize:'12px'}}>⚖️ 건강기록</button>
          </div>

          {rtab === 'attendance' && (() => {
            const { y, m } = attendanceMonth
            const firstDay = new Date(y, m, 1)
            const daysInMonth = new Date(y, m+1, 0).getDate()
            const startDow = (firstDay.getDay()+6)%7 // 월=0
            const todayStr = new Date().toISOString().split('T')[0]
            const attendedSet = new Set(attendanceDates.map(a => a.attended_date))
            const monthCount = attendanceDates.length
            return (
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                  <button className="week-nav-btn" onClick={()=>setAttendanceMonth(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1})}>‹</button>
                  <div style={{fontSize:'14px',fontWeight:700}}>{y}년 {m+1}월 <span style={{fontSize:'12px',color:'var(--accent)',fontWeight:400}}>({monthCount}회 출석)</span></div>
                  <button className="week-nav-btn" onClick={()=>setAttendanceMonth(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1})}>›</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'8px'}}>
                  {['월','화','수','목','금','토','일'].map(d=><div key={d} style={{textAlign:'center',fontSize:'11px',color:'var(--text-dim)',padding:'4px 0'}}>{d}</div>)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
                  {Array.from({length:startDow}).map((_,i)=><div key={'e'+i}></div>)}
                  {Array.from({length:daysInMonth}).map((_,i)=>{
                    const day = i+1
                    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const isAttended = attendedSet.has(dateStr)
                    const isToday = dateStr === todayStr
                    const isFuture = dateStr > todayStr
                    return (
                      <div key={day} onClick={()=>!isFuture&&toggleAttendance(dateStr)}
                        style={{aspectRatio:'1',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'8px',fontSize:'13px',fontWeight:isAttended?700:400,cursor:isFuture?'default':'pointer',
                          background:isAttended?'var(--accent)':isToday?'rgba(200,241,53,0.12)':'var(--surface2)',
                          color:isAttended?'#0f0f0f':isToday?'var(--accent)':isFuture?'var(--text-dim)':'var(--text)',
                          border:isToday&&!isAttended?'1px solid rgba(200,241,53,0.4)':'1px solid transparent',
                          opacity:isFuture?0.4:1}}>
                        {day}
                      </div>
                    )
                  })}
                </div>
                {attendanceDates.length>0 && (
                  <div style={{marginTop:'16px'}}>
                    <div className="section-label">출석 일시</div>
                    {[...attendanceDates].sort((a,b)=>b.attended_date.localeCompare(a.attended_date)).map(a=>(
                      <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
                        <div style={{fontSize:'13px'}}>
                          {new Date(a.attended_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{fontSize:'11px',color:'var(--accent)',background:'rgba(200,241,53,0.1)',padding:'2px 8px',borderRadius:'4px'}}>출석</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {rtab === 'health' && (
            <div>
              {!healthData ? <div className="empty">불러오는 중...</div> : (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
                    {[[currentMember.target_weight,'목표 체중','var(--accent)'],[healthData.find(r=>r.morning_weight)?.morning_weight,'현재 체중','var(--text)'],[currentMember.start_weight,'시작 체중','var(--text)'],[(currentMember.start_weight&&healthData.find(r=>r.morning_weight)?.morning_weight?(currentMember.start_weight-healthData.find(r=>r.morning_weight).morning_weight).toFixed(1)+'kg':'—'),'감량','var(--accent)']].map(([v,l,c],i)=>(
                      <div key={i} className="card" style={{marginBottom:0,padding:'12px'}}><div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'4px'}}>{l}</div><div style={{fontSize:'18px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:c}}>{v||'—'}</div></div>
                    ))}
                  </div>
                  <div className="section-label">체중 기록</div>
                  {healthData.filter(r=>r.morning_weight||r.evening_weight).slice(0,10).map(r => {
                    const diff = (r.morning_weight&&r.evening_weight)?(r.evening_weight-r.morning_weight).toFixed(1):null
                    const ds = new Date(r.record_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
                    return (
                      <div key={r.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'6px'}}>
                        <div style={{fontSize:'11px',color:'var(--text-dim)',fontFamily:"'DM Mono',monospace",minWidth:'40px'}}>{ds}</div>
                        <div style={{flex:1,display:'flex',gap:'16px'}}>
                          <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{r.morning_weight||'—'}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>공복</div></div>
                          <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{r.evening_weight||'—'}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>저녁</div></div>
                          {diff && <div style={{textAlign:'center'}}><div style={{fontSize:'14px',fontWeight:700,fontFamily:"'DM Mono',monospace",color:diff>0?'#ff5c5c':'#4ade80'}}>{diff>0?'+':''}{diff}</div><div style={{fontSize:'10px',color:'var(--text-dim)'}}>일중증가</div></div>}
                        </div>
                        {r.sleep_level && <div style={{fontSize:'11px',color:'var(--text-muted)'}}>💤 {r.sleep_level}/10</div>}
                      </div>
                    )
                  })}
                  {!healthData.filter(r=>r.morning_weight||r.evening_weight).length && <div className="empty">체중 기록 없음</div>}
                </>
              )}
            </div>
          )}

          {rtab === 'write' && (
            <div>
              <div className="section-label">1단계 — 수업 녹음 업로드</div>
              <div className="card">
                {!audioData ? (
                  <div id="upload-area" onClick={()=>audioInputRef.current?.click()} style={{border:'1.5px dashed var(--border)',borderRadius:'10px',padding:'22px 16px',textAlign:'center',cursor:'pointer',marginBottom:'14px'}}>
                    <div style={{fontSize:'28px',marginBottom:'8px'}}>🎙</div>
                    <div style={{fontSize:'13px',fontWeight:500,color:'var(--text-muted)'}}>음성 메모 파일 업로드</div>
                    <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'4px'}}>m4a · mp3 · wav 지원</div>
                  </div>
                ) : (
                  <div style={{display:'flex',background:'var(--surface2)',borderRadius:'8px',padding:'10px 14px',marginBottom:'14px',alignItems:'center',gap:'10px'}}>
                    <span style={{fontSize:'20px'}}>🎵</span>
                    <div style={{flex:1}}><div style={{fontSize:'13px',fontWeight:500}}>{audioName}</div><div style={{fontSize:'11px',color:'var(--text-dim)'}}>{audioSize}</div></div>
                    <button onClick={removeAudio} style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'18px'}}>×</button>
                  </div>
                )}
                <input ref={audioInputRef} type="file" accept="audio/*" style={{display:'none'}} onChange={handleAudio} />
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                  <span style={{fontSize:'11px',color:'var(--text-dim)'}}>추가 메모 (선택)</span>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}}></div>
                </div>
                <div className="form-group"><textarea value={rawInput} onChange={e=>setRawInput(e.target.value)} placeholder="녹음에 없는 내용을 추가로 입력하세요." rows={3}></textarea></div>
                <div className="section-label" style={{marginTop:'4px'}}>운동 종목 기록 (선택)</div>
                {exercises.map(ex => (
                  <div key={ex.id} className="ex-block">
                    <div className="ex-block-header">
                      <span className="ex-block-name">{ex.name}</span>
                      <div className="ex-block-actions">
                        <button className="btn btn-ghost btn-sm" onClick={()=>editExercise(ex.id)} style={{fontSize:'11px',padding:'4px 10px'}}>수정</button>
                        <button className="ex-set-remove" onClick={()=>setExercises(exercises.filter(e=>e.id!==ex.id))} style={{fontSize:'16px',marginLeft:'4px'}}>×</button>
                      </div>
                    </div>
                    <div className="ex-set-list">
                      {ex.sets.map((s,i) => (
                        <div key={i} className="ex-set-item">
                          <span className="ex-set-num">{i+1}세트</span>
                          <span className="ex-set-info">{s.reps}회{s.feel?' · '+s.feel:''}</span>
                          {s.rir!=='' && <span className="ex-set-rir">RIR {s.rir}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{width:'100%',padding:'10px',marginBottom:'8px'}} onClick={openAddExercise}>+ 운동 종목 추가</button>
                <div className="section-label" style={{marginTop:'12px'}}>RIR 가이드</div>
                <div className="rir-guide">
                  <div className="rir-item rir-2"><div className="rir-badge">2 RIR 추천</div><div className="rir-label">부상위험↑ · 협응성 복합운동</div><div className="rir-moves">벤치프레스 · 스쿼트 · 데드리프트</div></div>
                  <div className="rir-item rir-1"><div className="rir-badge">1 RIR 추천</div><div className="rir-label">큰 근육 · 부상위험 낮은 복합운동</div><div className="rir-moves">렛풀다운 · 시티드로우 · 덤벨체스트프레스 · 런지</div></div>
                  <div className="rir-item rir-0"><div className="rir-badge">0 RIR 추천</div><div className="rir-label">자극 위주 · 단일관절 고립운동</div><div className="rir-moves">사이드레터럴레이즈 · 덤벨컬 · 케이블푸쉬다운 · 레그익스텐션</div></div>
                </div>
              </div>
              <div className="section-label">2단계 — AI 수업일지 생성</div>
              {generating && <div className="ai-status"><div className="ai-dot"></div><span>{aiStatus}</span></div>}
              {showPreview && (
                <div>
                  <div className="preview-card">{previewContent}</div>
                  <div className="form-group"><label>수정이 필요하면 직접 편집하세요</label><textarea value={finalContent} onChange={e=>setFinalContent(e.target.value)} rows={12} style={{fontSize:'13px',lineHeight:'1.8'}}></textarea></div>
                </div>
              )}
              {!generating && !showPreview && <button className="btn btn-primary" style={{width:'100%',marginBottom:'10px'}} onClick={generateLog}>✦ AI 수업일지 생성</button>}
              {showSend && (
                <div>
                  <div className="section-label">3단계 — 발송</div>
                  <button className="btn btn-primary" style={{width:'100%',marginBottom:'8px'}} onClick={sendKakao}>
                    <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#0f0f0f"><path d="M12 3C6.477 3 2 6.582 2 11c0 2.83 1.634 5.33 4.127 6.89l-1.07 3.97a.5.5 0 0 0 .733.556L10.13 19.7A11.6 11.6 0 0 0 12 19.8c5.523 0 10-3.582 10-8S17.523 3 12 3z"/></svg>
                      리포트 링크 카카오톡으로 보내기
                    </span>
                  </button>
                  <div style={{fontSize:'12px',color:'var(--text-dim)',textAlign:'center',marginBottom:'10px'}}>회원이 링크를 클릭하면 예쁜 리포트 페이지가 열려요</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PAYMENT CANCEL CONFIRM MODAL */}
      <Modal open={!!cancelPaymentTarget} onClose={()=>setCancelPaymentTarget(null)} title="결제 취소 확인" maxWidth="320px">
        <div style={{textAlign:'center',padding:'8px 0 20px'}}>
          <div style={{fontSize:'32px',marginBottom:'12px'}}>⚠️</div>
          <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px'}}>정말로 결제를 취소하시겠습니까?</div>
          {cancelPaymentTarget && (
            <div style={{fontSize:'12px',color:'var(--text-muted)',lineHeight:'1.7'}}>
              {cancelPaymentTarget.product_name}<br/>
              {cancelPaymentTarget.amount.toLocaleString()}원 · {cancelPaymentTarget.session_count}회<br/>
              <span style={{color:'var(--danger)',fontSize:'11px'}}>취소 시 해당 세션 수가 차감됩니다.</span>
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setCancelPaymentTarget(null)}>아니오</button>
          <button className="btn btn-primary" style={{flex:1,background:'var(--danger)',color:'#fff'}} onClick={()=>{deletePayment(cancelPaymentTarget);setCancelPaymentTarget(null)}}>네</button>
        </div>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal open={paymentModal} onClose={()=>setPaymentModal(false)} title={`결제 관리 — ${currentMember?.name||''}`}>
        <div className="type-row" style={{marginBottom:'14px'}}>
          <button className={`type-btn${paymentTab==='pay'?' active':''}`} onClick={()=>setPaymentTab('pay')}>💳 결제 등록</button>
          <button className={`type-btn${paymentTab==='history'?' active':''}`} onClick={()=>setPaymentTab('history')}>📋 결제 내역</button>
          <button className={`type-btn${paymentTab==='products'?' active':''}`} onClick={()=>setPaymentTab('products')}>🗂 상품 관리</button>
        </div>

        {paymentTab === 'pay' && (
          <div>
            <div className="form-group">
              <label>상품 선택</label>
              <select value={paymentForm.productId} onChange={e=>setPaymentForm({...paymentForm,productId:e.target.value})}>
                <option value="">상품을 선택하세요</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.session_count}회)</option>)}
              </select>
            </div>
            {paymentForm.productId && (() => {
              const prod = products.find(p=>p.id===paymentForm.productId)
              return prod ? (
                <div style={{background:'var(--surface2)',borderRadius:'8px',padding:'12px',marginBottom:'12px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                    <div>
                      <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'3px'}}>부가세 미포함</div>
                      <div style={{fontSize:'15px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{(prod.price_excl_tax||0).toLocaleString()}원</div>
                    </div>
                    <div>
                      <div style={{fontSize:'10px',color:'var(--text-dim)',marginBottom:'3px'}}>부가세 포함</div>
                      <div style={{fontSize:'15px',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{(prod.price_incl_tax||0).toLocaleString()}원</div>
                    </div>
                  </div>
                  <div style={{marginTop:'10px'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                      <input type="checkbox" checked={paymentForm.taxIncluded} onChange={e=>setPaymentForm({...paymentForm,taxIncluded:e.target.checked})} />
                      부가세 포함 금액으로 결제
                    </label>
                  </div>
                  <div style={{marginTop:'8px',fontSize:'12px',color:'var(--text-muted)'}}>
                    결제 금액: <span style={{color:'var(--accent)',fontWeight:700}}>{(paymentForm.taxIncluded?(prod.price_incl_tax||prod.price_excl_tax):prod.price_excl_tax).toLocaleString()}원</span>
                    {' '}· 세션 {prod.session_count}회 추가
                  </div>
                </div>
              ) : null
            })()}
            <div className="form-group">
              <label>메모 (선택)</label>
              <input type="text" value={paymentForm.memo} onChange={e=>setPaymentForm({...paymentForm,memo:e.target.value})} placeholder="특이사항, 할인 내용 등" />
            </div>
            <button className="btn btn-primary" style={{width:'100%'}} onClick={addPayment}>결제 등록</button>
            {!products.length && <div style={{marginTop:'10px',fontSize:'12px',color:'var(--text-muted)',textAlign:'center'}}>상품을 먼저 등록해주세요 → 상품 관리 탭</div>}
          </div>
        )}

        {paymentTab === 'history' && (
          <div>
            {payments.length === 0
              ? <div className="empty"><p>결제 내역이 없어요</p></div>
              : payments.map(p => (
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'var(--surface2)',borderRadius:'8px',marginBottom:'8px'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:500}}>{p.product_name}</div>
                    <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{new Date(p.paid_at).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'})} · {p.session_count}회{p.tax_included?' · 부가세포함':''}{p.memo?' · '+p.memo:''}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:'14px',fontWeight:700,color:'var(--accent)',fontFamily:"'DM Mono',monospace"}}>{p.amount.toLocaleString()}원</div>
                    <button style={{fontSize:'10px',color:'var(--danger)',background:'none',border:'none',cursor:'pointer',padding:0}} onClick={()=>setCancelPaymentTarget(p)}>취소</button>
                  </div>
                </div>
              ))
            }
            {payments.length > 0 && (
              <div style={{textAlign:'right',paddingTop:'8px',borderTop:'1px solid var(--border)',fontSize:'12px',color:'var(--text-muted)'}}>
                총 결제: <span style={{color:'var(--accent)',fontWeight:700}}>{payments.reduce((s,p)=>s+p.amount,0).toLocaleString()}원</span>
              </div>
            )}
          </div>
        )}

        {paymentTab === 'products' && (
          <div>
            <button className="btn btn-primary btn-sm" style={{marginBottom:'12px'}} onClick={()=>{setEditingProductId(null);setProductForm({name:'',count:'',priceEx:'',priceIn:''});setProductFormModal(true)}}>+ 상품 추가</button>
            {products.length === 0
              ? <div className="empty"><p>등록된 상품이 없어요</p></div>
              : products.map(p => (
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'var(--surface2)',borderRadius:'8px',marginBottom:'8px'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:600}}>{p.name} <span style={{fontWeight:400,color:'var(--text-muted)'}}>({p.session_count}회)</span></div>
                    <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>
                      미포함 {(p.price_excl_tax||0).toLocaleString()}원 / 포함 {(p.price_incl_tax||0).toLocaleString()}원
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'6px'}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:'11px',padding:'4px 8px'}} onClick={()=>{setEditingProductId(p.id);setProductForm({name:p.name,count:String(p.session_count),priceEx:String(p.price_excl_tax||0),priceIn:String(p.price_incl_tax||0)});setProductFormModal(true)}}>수정</button>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:'11px',padding:'4px 8px',color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)'}} onClick={()=>deleteProduct(p.id)}>삭제</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </Modal>

      {/* PRODUCT FORM MODAL */}
      <Modal open={productFormModal} onClose={()=>setProductFormModal(false)} title={editingProductId?'상품 수정':'상품 추가'} maxWidth="360px">
        <div className="form-group"><label>상품명</label><input type="text" value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} placeholder="예: 30회 패키지" /></div>
        <div className="form-group"><label>횟수</label><input type="number" value={productForm.count} onChange={e=>setProductForm({...productForm,count:e.target.value})} placeholder="30" min="1" /></div>
        <div className="divider"></div>
        <div className="section-label">단가 설정</div>
        <div className="two-col">
          <div className="form-group"><label>부가세 미포함 (원)</label><input type="number" value={productForm.priceEx} onChange={e=>setProductForm({...productForm,priceEx:e.target.value})} placeholder="1500000" min="0" /></div>
          <div className="form-group"><label>부가세 포함 (원)</label><input type="number" value={productForm.priceIn} onChange={e=>setProductForm({...productForm,priceIn:e.target.value})} placeholder="1650000" min="0" /></div>
        </div>
        {productForm.count && productForm.priceEx && (
          <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'12px'}}>
            세션 단가: 미포함 {Math.round((parseInt(productForm.priceEx)||0)/(parseInt(productForm.count)||1)).toLocaleString()}원 / 포함 {Math.round((parseInt(productForm.priceIn)||0)/(parseInt(productForm.count)||1)).toLocaleString()}원
          </div>
        )}
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={productForm.memo||''} onChange={e=>setProductForm({...productForm,memo:e.target.value})} placeholder="할인 조건 등" /></div>
        <button className="btn btn-primary" style={{width:'100%'}} onClick={saveProduct}>저장</button>
      </Modal>

      {/* EDIT MEMBER MODAL */}
      <Modal open={editMemberModal} onClose={()=>setEditMemberModal(false)} title="회원 정보 수정">
        <div className="form-group"><label>이름</label><input type="text" value={editMemberForm.name||''} onChange={e=>setEditMemberForm({...editMemberForm,name:e.target.value})} placeholder="홍길동" /></div>
        <div className="form-group"><label>전화번호 (카카오톡 발송용)</label><input type="text" value={editMemberForm.kakao_phone||''} onChange={e=>setEditMemberForm({...editMemberForm,kakao_phone:e.target.value})} placeholder="010-1234-5678" /></div>
        <div className="form-group"><label>전화번호 뒷 4자리 (회원 포털 로그인용)</label><input type="text" value={editMemberForm.phone||''} onChange={e=>setEditMemberForm({...editMemberForm,phone:e.target.value})} placeholder="1234" maxLength={4} /></div>
        <div className="form-group"><label>이메일 (선택)</label><input type="email" value={editMemberForm.email||''} onChange={e=>setEditMemberForm({...editMemberForm,email:e.target.value})} placeholder="example@gmail.com" /></div>
        <div className="form-group"><label>레슨 목적</label>
          <select value={editMemberForm.purpose||'체형교정'} onChange={e=>setEditMemberForm({...editMemberForm,purpose:e.target.value})}>
            {['체형교정','근비대','다이어트','체력향상','재활','스포츠퍼포먼스','유지관리','기타'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="divider"></div>
        <div className="section-label">세션 관리</div>
        <div className="two-col">
          <div className="form-group"><label>총 세션 수</label><input type="number" value={editMemberForm.total||''} onChange={e=>setEditMemberForm({...editMemberForm,total:e.target.value})} placeholder="30" min="1" /></div>
          <div className="form-group"><label>완료한 세션</label><input type="number" value={editMemberForm.done||''} onChange={e=>setEditMemberForm({...editMemberForm,done:e.target.value})} placeholder="0" min="0" /></div>
        </div>
        <div className="form-group"><label>세션 단가 (원)</label><input type="number" value={editMemberForm.price||''} onChange={e=>setEditMemberForm({...editMemberForm,price:e.target.value})} placeholder="60000" min="0" /></div>
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={editMemberForm.memo||''} onChange={e=>setEditMemberForm({...editMemberForm,memo:e.target.value})} placeholder="부상 이력, 목표 등" /></div>
        <button className="btn btn-primary" style={{width:'100%',marginBottom:'8px'}} onClick={updateMember}>저장</button>
        <button className="btn btn-ghost" style={{width:'100%',color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)'}} onClick={()=>setDeleteConfirmModal(true)}>회원 삭제</button>
      </Modal>

      {/* DELETE CONFIRM MODAL */}
      <Modal open={deleteConfirmModal} onClose={()=>setDeleteConfirmModal(false)} title="회원 삭제" maxWidth="320px">
        <div style={{textAlign:'center',padding:'8px 0 20px'}}>
          <div style={{fontSize:'32px',marginBottom:'12px'}}>⚠️</div>
          <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px'}}>{editMemberForm.name} 회원을 삭제할까요?</div>
          <div style={{fontSize:'12px',color:'var(--text-muted)',lineHeight:'1.6'}}>수업일지, 건강기록 등 관련 데이터는<br/>삭제되지 않습니다.</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setDeleteConfirmModal(false)}>취소</button>
          <button className="btn btn-primary" style={{flex:1,background:'var(--danger)',color:'#fff'}} onClick={deleteMember}>삭제</button>
        </div>
      </Modal>

      {/* SETTINGS MODAL */}
      <Modal open={settingsModal} onClose={()=>setSettingsModal(false)} title="설정">
        <div className="form-group"><label>트레이너 이름</label><input type="text" value={trainer?.name||''} readOnly style={{opacity:0.6}} /></div>
        <div className="divider"></div>
        <div className="form-group">
          <label>Gemini API 키 <a href="https://aistudio.google.com/app/apikey" target="_blank" style={{color:'var(--accent)',fontSize:'11px'}}>무료 발급</a></label>
          <input type="text" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="AIza..." />
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={saveSettings}>저장</button>
      </Modal>

      {/* EXERCISE MODAL */}
      <Modal open={exModal} onClose={()=>setExModal(false)} title={editingExId?'운동 수정':'운동 종목 추가'} maxWidth="400px">
        <div className="form-group"><label>운동 종목명</label><input type="text" value={exName} onChange={e=>setExName(e.target.value)} placeholder="예: 벤치프레스" /></div>
        <div className="section-label" style={{marginTop:0}}>세트 기록</div>
        {newSets.map((s,i)=>(
          <div key={i} className="ex-set-item">
            <span className="ex-set-num">{i+1}세트</span>
            <span className="ex-set-info">{s.reps}회{s.feel?' · '+s.feel.substring(0,20):''}</span>
            {s.rir!=='' && <span className="ex-set-rir">RIR {s.rir}</span>}
            <button className="ex-set-remove" onClick={()=>setNewSets(newSets.filter((_,j)=>j!==i))}>×</button>
          </div>
        ))}
        <div className="add-set-form">
          <div className="set-form-row">
            <div><label style={{fontSize:'11px'}}>횟수</label><input type="number" value={setReps} onChange={e=>setSetReps(e.target.value)} placeholder="10" min="1" /></div>
            <div><label style={{fontSize:'11px'}}>RIR</label><input type="number" value={setRir} onChange={e=>setSetRir(e.target.value)} placeholder="2" min="0" max="10" /></div>
          </div>
          <div className="form-group" style={{marginBottom:'8px'}}><label style={{fontSize:'11px'}}>이번 세트 감각 / 느낀점</label><textarea value={setFeel} onChange={e=>setSetFeel(e.target.value)} placeholder="예) 3세트 때 팔꿈치 당김" rows={2} style={{minHeight:'60px'}}></textarea></div>
          <button className="btn btn-ghost btn-sm" onClick={addSet} style={{width:'100%',padding:'8px'}}>+ 세트 추가</button>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:'10px'}} onClick={confirmAddExercise}>운동 저장</button>
      </Modal>

      {/* SCHEDULE MODAL */}
      <Modal open={schModal} onClose={()=>setSchModal(false)} title={editBlockId?'스케쥴 수정':'스케쥴 추가'} maxWidth="360px">
        <div className="type-row">
          <button className={`type-btn${selType==='lesson'?' active':''}`} onClick={()=>setSelType('lesson')}>🏋️ 수업</button>
          <button className={`type-btn${selType==='personal'?' active':''}`} onClick={()=>setSelType('personal')}>📌 개인일정</button>
        </div>
        {selType==='lesson' && <div className="form-group"><label>회원</label><select value={blockMemberId} onChange={e=>setBlockMemberId(e.target.value)}>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
        {selType==='personal' && <div className="form-group"><label>일정 제목</label><input type="text" value={blockTitle} onChange={e=>setBlockTitle(e.target.value)} placeholder="미팅, 휴식 등" /></div>}
        <div className="form-group"><label>날짜</label><input type="date" value={blockDate} onChange={e=>setBlockDate(e.target.value)} /></div>
        <div className="form-group"><label>시간</label><div className="time-row"><input type="time" value={blockStart} onChange={e=>setBlockStart(e.target.value)} step="300" /><span>~</span><input type="time" value={blockEnd} onChange={e=>setBlockEnd(e.target.value)} step="300" /></div></div>
        <div className="form-group"><label>메모 (선택)</label><input type="text" value={blockMemo} onChange={e=>setBlockMemo(e.target.value)} placeholder="특이사항" /></div>
        <div className="form-group"><label>색상</label><div className="color-row">{COLORS.map(c=><div key={c.id} className={`color-btn${selColor===c.id?' sel':''}`} style={{background:c.bg}} onClick={()=>setSelColor(c.id)}></div>)}</div></div>
        {showCancelForm && (
          <div>
            <div style={{height:'1px',background:'var(--border)',margin:'12px 0'}}></div>
            <div className="form-group">
              <label style={{color:'var(--danger)'}}>취소 사유</label>
              <select value={cancelType} onChange={e=>setCancelType(e.target.value)}>
                <option value="">사유 선택</option>
                <option value="회원 개인 사정">회원 개인 사정</option>
                <option value="회원 질병/부상">회원 질병/부상</option>
                <option value="트레이너 사정">트레이너 사정</option>
                <option value="시설 문제">시설 문제</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{color:'var(--danger)'}}>취소 상세 내용 (선택)</label>
              <textarea value={cancelDetail} onChange={e=>setCancelDetail(e.target.value)} placeholder="취소 사유를 자세히 적어주세요" rows={2} style={{minHeight:'60px'}}></textarea>
            </div>
          </div>
        )}
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={saveBlock}>저장</button>
          {editBlockId && (
            <button className="btn btn-ghost btn-sm" onClick={toggleCancel} style={{color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)',background:showCancelForm?'rgba(255,92,92,0.1)':'none'}}>
              {showCancelForm ? '취소 확정' : '취소 처리'}
            </button>
          )}
          {editBlockId && !showCancelForm && <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)'}} onClick={deleteBlock}>삭제</button>}
        </div>
      </Modal>
    </div>
  )
}
