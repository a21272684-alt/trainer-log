import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import { EXERCISE_DB } from '../lib/exercises'
import { Link } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import '../styles/member.css'

Chart.register(...registerables)

const MUSCLE_GROUPS = ['가슴','등','어깨','이두','삼두','하체','코어','유산소','전신']
const MUSCLE_COLOR = {'가슴':'#ef4444','등':'#3b82f6','어깨':'#8b5cf6','이두':'#f97316','삼두':'#06b6d4','하체':'#22c55e','코어':'#eab308','유산소':'#ec4899','전신':'#6b7280'}
const REACTIONS = ['❤️','🔥','💪','👏','😮','💯','🙌']

function MuscleDiagram({ primary = [], secondary = [] }) {
  if (!primary.length && !secondary.length) return null
  const c = (m) => {
    if (primary.includes(m)) return MUSCLE_COLOR[m] || '#888'
    if (secondary.includes(m)) return (MUSCLE_COLOR[m] || '#888') + '55'
    return '#e5e7eb'
  }
  return (
    <div style={{display:'flex',justifyContent:'center',gap:'20px',margin:'8px 0 12px',padding:'10px',background:'#f5f5f5',borderRadius:'12px'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'10px',color:'#aaa',marginBottom:'4px'}}>앞면</div>
        <svg width="80" height="180" viewBox="0 0 80 180">
          <circle cx="40" cy="12" r="11" fill="#d1d5db"/>
          <rect x="35" y="22" width="10" height="8" rx="2" fill="#d1d5db"/>
          <ellipse cx="21" cy="38" rx="9" ry="8" fill={c('어깨')}/>
          <ellipse cx="59" cy="38" rx="9" ry="8" fill={c('어깨')}/>
          <path d="M30 32 Q40 37 50 32 L52 65 Q40 69 28 65 Z" fill={c('가슴')}/>
          <rect x="29" y="65" width="22" height="28" rx="3" fill={c('코어')}/>
          <ellipse cx="15" cy="57" rx="6" ry="14" fill={c('이두')}/>
          <ellipse cx="65" cy="57" rx="6" ry="14" fill={c('이두')}/>
          <ellipse cx="14" cy="80" rx="5" ry="11" fill="#d1d5db"/>
          <ellipse cx="66" cy="80" rx="5" ry="11" fill="#d1d5db"/>
          <ellipse cx="32" cy="120" rx="11" ry="19" fill={c('하체')}/>
          <ellipse cx="48" cy="120" rx="11" ry="19" fill={c('하체')}/>
          <ellipse cx="31" cy="154" rx="8" ry="14" fill={c('하체')} opacity="0.7"/>
          <ellipse cx="49" cy="154" rx="8" ry="14" fill={c('하체')} opacity="0.7"/>
        </svg>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'10px',color:'#aaa',marginBottom:'4px'}}>뒷면</div>
        <svg width="80" height="180" viewBox="0 0 80 180">
          <circle cx="40" cy="12" r="11" fill="#d1d5db"/>
          <rect x="35" y="22" width="10" height="8" rx="2" fill="#d1d5db"/>
          <ellipse cx="21" cy="38" rx="9" ry="8" fill={c('어깨')}/>
          <ellipse cx="59" cy="38" rx="9" ry="8" fill={c('어깨')}/>
          <path d="M28 32 Q40 37 52 32 L54 65 Q40 70 26 65 Z" fill={c('등')}/>
          <rect x="29" y="65" width="22" height="14" rx="3" fill={c('등')} opacity="0.6"/>
          <rect x="29" y="80" width="22" height="13" rx="3" fill={c('코어')} opacity="0.5"/>
          <ellipse cx="15" cy="57" rx="6" ry="14" fill={c('삼두')}/>
          <ellipse cx="65" cy="57" rx="6" ry="14" fill={c('삼두')}/>
          <ellipse cx="14" cy="80" rx="5" ry="11" fill="#d1d5db"/>
          <ellipse cx="66" cy="80" rx="5" ry="11" fill="#d1d5db"/>
          <ellipse cx="32" cy="120" rx="11" ry="19" fill={c('하체')}/>
          <ellipse cx="48" cy="120" rx="11" ry="19" fill={c('하체')}/>
          <ellipse cx="31" cy="154" rx="8" ry="14" fill={c('하체')} opacity="0.7"/>
          <ellipse cx="49" cy="154" rx="8" ry="14" fill={c('하체')} opacity="0.7"/>
        </svg>
      </div>
      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:'4px'}}>
        {[...primary.map(m=>({m,type:'주동근'})),...secondary.map(m=>({m,type:'보조근'}))].map(({m,type})=>(
          <div key={m+type} style={{display:'flex',alignItems:'center',gap:'5px'}}>
            <div style={{width:'8px',height:'8px',borderRadius:'50%',background:MUSCLE_COLOR[m]||'#888',opacity:type==='보조근'?0.5:1,flexShrink:0}}></div>
            <span style={{fontSize:'10px',color:'#555',lineHeight:1}}>{m}</span>
            <span style={{fontSize:'9px',color:'#aaa'}}>{type==='주동근'?'●':'○'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MemberPortal() {
  const showToast = useToast()
  const [loggedIn, setLoggedIn] = useState(false)
  const [member, setMember] = useState(null)
  const [tab, setTab] = useState('logs')
  const [memberLogs, setMemberLogs] = useState([])
  const [healthRecords, setHealthRecords] = useState([])
  const [dietRecords, setDietRecords] = useState([])
  const [selectedSleep, setSelectedSleep] = useState(null)
  const [loginName, setLoginName] = useState('')
  const [loginPhone, setLoginPhone] = useState('')
  const [hMorning, setHMorning] = useState('')
  const [hEvening, setHEvening] = useState('')
  const [hDate, setHDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dDate, setDDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dBreakfast, setDBreakfast] = useState('')
  const [dLunch, setDLunch] = useState('')
  const [dDinner, setDDinner] = useState('')
  const [dSnack, setDSnack] = useState('')
  const [hTarget, setHTarget] = useState('')
  const [hStart, setHStart] = useState('')
  const [hAge, setHAge] = useState('')
  const [hHeight, setHHeight] = useState('')
  const [hSpecial, setHSpecial] = useState('')
  const [openLogIdx, setOpenLogIdx] = useState(null)
  const chartRef = useRef(null)
  const chartInstance = useRef(null)

  // Workout state
  const emptyWEx = () => ({localId:Date.now().toString()+Math.random(),name:'',muscle_group:'',sets:[{weight:'',reps:'',rest_sec:''}]})
  const [workoutSessions, setWorkoutSessions] = useState([])
  const [workoutRoutines, setWorkoutRoutines] = useState([])
  const [workoutModal, setWorkoutModal] = useState(false)
  const [workoutEditId, setWorkoutEditId] = useState(null)
  const [workoutForm, setWorkoutForm] = useState({date:'',title:'',duration_min:'',memo:'',exercises:[emptyWEx()]})
  const [workoutRoutineModal, setWorkoutRoutineModal] = useState(false)
  const [workoutSaveRoutineName, setWorkoutSaveRoutineName] = useState('')
  const [workoutDetailId, setWorkoutDetailId] = useState(null)
  const [exQuery, setExQuery] = useState({}) // localId -> query text (for autocomplete visibility)

  // Community state
  const [posts, setPosts] = useState([])
  const [myReactions, setMyReactions] = useState({})   // postId -> Set of reactions
  const [reactionCounts, setReactionCounts] = useState({}) // postId -> {emoji: count}
  const [postModal, setPostModal] = useState(false)
  const [postContent, setPostContent] = useState('')
  const [postPhotoFile, setPostPhotoFile] = useState(null)
  const [postPhotoPreview, setPostPhotoPreview] = useState('')

  const today = () => new Date().toISOString().split('T')[0]
  const formatDate = (str) => new Date(str+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
  const formatRelative = (str) => {
    const diff = Date.now() - new Date(str).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금 전'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일 전`
    return new Date(str).toLocaleDateString('ko-KR', {month:'short',day:'numeric'})
  }

  async function login() {
    if (!loginName || !loginPhone) { showToast('이름과 전화번호 뒷자리를 입력해주세요'); return }
    try {
      const { data } = await supabase.from('members').select('*').eq('name', loginName).eq('phone', loginPhone)
      if (!data?.length) { showToast('등록된 회원 정보가 없어요. 트레이너에게 문의하세요'); return }
      setMember(data[0]); setLoggedIn(true)
      showToast('✓ 환영해요, '+data[0].name+'님!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  function logout() {
    setMember(null); setLoggedIn(false); setLoginName(''); setLoginPhone('')
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null }
  }

  useEffect(() => {
    if (member) {
      loadAll()
      setHTarget(member.target_weight || ''); setHStart(member.start_weight || '')
      setHAge(member.age || ''); setHHeight(member.height || ''); setHSpecial(member.special_note || '')
    }
  }, [member])

  async function loadAll() {
    const [l, h, d] = await Promise.all([
      supabase.from('logs').select('*').eq('member_id', member.id).order('created_at', { ascending: false }),
      supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date', { ascending: false }).limit(60),
      supabase.from('health_records').select('*').eq('member_id', member.id).not('diet_note','is',null).order('record_date', { ascending: false }).limit(30),
    ])
    setMemberLogs(l.data || []); setHealthRecords(h.data || []); setDietRecords(d.data || [])
  }

  useEffect(() => {
    if (tab === 'health' && healthRecords.length) setTimeout(renderChart, 200)
  }, [tab, healthRecords])

  useEffect(() => {
    if (tab === 'workout' && member) {
      loadWorkoutSessions()
      loadWorkoutRoutines()
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'community' && member) loadPosts()
  }, [tab])

  function renderChart() {
    const records = healthRecords.filter(r => r.morning_weight).slice(0,14).reverse()
    if (!records.length || !chartRef.current) return
    if (chartInstance.current) chartInstance.current.destroy()
    const ctx = chartRef.current.getContext('2d')
    chartInstance.current = new Chart(ctx, {
      type:'line',
      data:{labels:records.map(r=>formatDate(r.record_date)),datasets:[
        {label:'공복 체중',data:records.map(r=>r.morning_weight),borderColor:'#111',backgroundColor:'rgba(17,17,17,0.05)',tension:0.35,pointRadius:4,pointBackgroundColor:'#111',borderWidth:2,fill:true},
        ...(member?.target_weight?[{label:'목표',data:Array(records.length).fill(member.target_weight),borderColor:'#c8f135',borderDash:[6,4],borderWidth:2,pointRadius:0,fill:false}]:[])
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#aaa'}},y:{grid:{color:'#f0f0ee'},ticks:{font:{size:10},color:'#aaa',callback:v=>v+'kg'}}}}
    })
  }

  async function saveHealthRecord() {
    const morning = parseFloat(hMorning) || null; const evening = parseFloat(hEvening) || null
    if (!morning && !evening) { showToast('체중을 입력해주세요'); return }
    try {
      await supabase.from('health_records').insert({ member_id:member.id, record_date:hDate||today(), morning_weight:morning, evening_weight:evening, sleep_level:selectedSleep, weight:morning })
      setHMorning(''); setHEvening(''); setSelectedSleep(null)
      const { data } = await supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date', { ascending: false }).limit(60)
      setHealthRecords(data || []); showToast('✓ 체중이 기록됐어요!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function saveProfile() {
    try {
      const updates = { target_weight:parseFloat(hTarget)||null, start_weight:parseFloat(hStart)||null, age:parseInt(hAge)||null, height:parseFloat(hHeight)||null, special_note:hSpecial.trim()||null }
      await supabase.from('members').update(updates).eq('id', member.id)
      setMember({...member, ...updates}); showToast('✓ 목표가 저장됐어요!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  async function saveDiet() {
    const parts = [dBreakfast&&'🍳 아침: '+dBreakfast, dLunch&&'🍱 점심: '+dLunch, dDinner&&'🍽️ 저녁: '+dDinner, dSnack&&'🧃 간식: '+dSnack].filter(Boolean)
    if (!parts.length) { showToast('식단을 입력해주세요'); return }
    try {
      await supabase.from('health_records').insert({ member_id:member.id, record_date:dDate||today(), diet_note:parts.join('\n') })
      setDBreakfast(''); setDLunch(''); setDDinner(''); setDSnack('')
      const { data } = await supabase.from('health_records').select('*').eq('member_id', member.id).not('diet_note','is',null).order('record_date', { ascending: false }).limit(30)
      setDietRecords(data || []); showToast('✓ 식단이 기록됐어요!')
    } catch(e) { showToast('오류: ' + e.message) }
  }

  function copyLog(i) { navigator.clipboard.writeText(memberLogs[i].content).then(()=>showToast('✓ 복사됐어요!')) }

  function downloadPDF(i) {
    import('jspdf').then(({jsPDF}) => {
      const log = memberLogs[i]; const d = new Date(log.created_at)
      const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
      doc.setFillColor(26,26,26); doc.rect(0,0,210,28,'F'); doc.setTextColor(200,241,53); doc.setFontSize(16); doc.text('TRAINERLOG',14,12)
      doc.setTextColor(255,255,255); doc.setFontSize(10); doc.text(member.name+' | '+d.toLocaleDateString('ko-KR')+' | '+log.session_number+'회차',14,22)
      doc.setTextColor(30,30,30); doc.setFontSize(10); doc.text(doc.splitTextToSize(log.content,182),14,40)
      doc.save('수업일지_'+member.name+'_'+log.session_number+'회차.pdf'); showToast('✓ PDF 저장됐어요!')
    })
  }

  // === PERSONAL WORKOUT ===
  async function loadWorkoutSessions() {
    const { data, error } = await supabase.from('workout_sessions').select('*').eq('member_id', member.id).order('workout_date', { ascending: false })
    if (!error) setWorkoutSessions(data || [])
  }
  async function loadWorkoutRoutines() {
    const { data, error } = await supabase.from('workout_routines').select('*').eq('member_id', member.id).order('created_at', { ascending: false })
    if (!error) setWorkoutRoutines(data || [])
  }
  function openWorkoutModal(session = null) {
    const t = new Date().toISOString().split('T')[0]
    if (session) {
      setWorkoutEditId(session.id)
      setWorkoutForm({ date: session.workout_date, title: session.title||'', duration_min: session.duration_min||'', memo: session.memo||'', exercises: session.exercises?.length ? session.exercises.map(e=>({...e,localId:e.localId||Date.now().toString()+Math.random()})) : [emptyWEx()] })
    } else {
      setWorkoutEditId(null)
      setWorkoutForm({ date: t, title: '', duration_min: '', memo: '', exercises: [emptyWEx()] })
    }
    setWorkoutSaveRoutineName('')
    setExQuery({})
    setWorkoutModal(true)
  }
  function calcVolume(exercises) {
    return exercises.reduce((total, ex) => total + ex.sets.reduce((s, set) => s + ((parseFloat(set.weight)||0) * (parseInt(set.reps)||0)), 0), 0)
  }
  async function saveWorkoutSession() {
    const f = workoutForm
    if (!f.date) { showToast('날짜를 입력해주세요'); return }
    const exercises = f.exercises.filter(e => e.name.trim())
    const total_volume = calcVolume(exercises)
    try {
      if (workoutEditId) {
        const { error } = await supabase.from('workout_sessions').update({ title: f.title||null, workout_date: f.date, duration_min: parseInt(f.duration_min)||null, memo: f.memo||null, exercises, total_volume }).eq('id', workoutEditId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workout_sessions').insert({ member_id: member.id, trainer_id: member.trainer_id||null, source: 'member', title: f.title||null, workout_date: f.date, duration_min: parseInt(f.duration_min)||null, memo: f.memo||null, exercises, total_volume })
        if (error) throw error
      }
      await loadWorkoutSessions()
      setWorkoutModal(false)
      showToast(workoutEditId ? '✓ 운동일지가 수정됐어요' : '✓ 운동일지가 저장됐어요')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function deleteWorkoutSession(id) {
    const { error } = await supabase.from('workout_sessions').delete().eq('id', id)
    if (!error) { await loadWorkoutSessions(); showToast('삭제됐어요') }
    else showToast('오류: ' + error.message)
  }
  async function saveAsRoutine() {
    if (!workoutSaveRoutineName.trim()) { showToast('루틴 이름을 입력해주세요'); return }
    const exercises = workoutForm.exercises.filter(e => e.name.trim())
    const { error } = await supabase.from('workout_routines').insert({ trainer_id: member.trainer_id||null, member_id: member.id, name: workoutSaveRoutineName.trim(), exercises })
    if (!error) { await loadWorkoutRoutines(); setWorkoutSaveRoutineName(''); showToast('✓ 루틴으로 저장됐어요') }
    else showToast('오류: ' + error.message)
  }
  async function deleteWorkoutRoutine(id) {
    const { error } = await supabase.from('workout_routines').delete().eq('id', id)
    if (!error) { await loadWorkoutRoutines(); showToast('루틴이 삭제됐어요') }
  }
  function loadRoutineIntoForm(routine) {
    const t = new Date().toISOString().split('T')[0]
    setWorkoutEditId(null)
    setWorkoutForm({ date: t, title: routine.name, duration_min: '', memo: '', exercises: routine.exercises.map(e=>({...e,localId:Date.now().toString()+Math.random(),sets:e.sets.map(s=>({...s,weight:'',reps:'',rest_sec:''})) })) })
    setWorkoutRoutineModal(false)
    setExQuery({})
    setWorkoutModal(true)
  }
  function wfAddEx() { setWorkoutForm(f=>({...f,exercises:[...f.exercises,emptyWEx()]})) }
  function wfRemoveEx(localId) { setWorkoutForm(f=>({...f,exercises:f.exercises.filter(e=>e.localId!==localId)})) }
  function wfUpdateEx(localId, key, val) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,[key]:val}:e)})) }
  function wfAddSet(localId) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,sets:[...e.sets,{weight:'',reps:'',rest_sec:''}]}:e)})) }
  function wfRemoveSet(localId, idx) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,sets:e.sets.filter((_,i)=>i!==idx)}:e)})) }
  function wfUpdateSet(localId, idx, key, val) { setWorkoutForm(f=>({...f,exercises:f.exercises.map(e=>e.localId===localId?{...e,sets:e.sets.map((s,i)=>i===idx?{...s,[key]:val}:s)}:e)})) }
  function handleExNameChange(localId, val) {
    wfUpdateEx(localId, 'name', val)
    const match = EXERCISE_DB.find(e => e.name === val)
    if (match) wfUpdateEx(localId, 'muscle_group', match.primary[0] || '')
    setExQuery(q => ({...q, [localId]: val}))
  }
  function selectExSuggestion(localId, ex) {
    wfUpdateEx(localId, 'name', ex.name)
    wfUpdateEx(localId, 'muscle_group', ex.primary[0] || '')
    setExQuery(q => ({...q, [localId]: ''}))
  }

  // === COMMUNITY ===
  async function loadPosts() {
    if (!member?.trainer_id) { setPosts([]); return }
    try {
      const { data: postsData, error } = await supabase
        .from('member_posts')
        .select('*')
        .eq('trainer_id', member.trainer_id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) { setPosts([]); return }  // 테이블 미생성 등 오류 시 빈 피드로 표시
      setPosts(postsData || [])
      if (postsData?.length) {
        const ids = postsData.map(p => p.id)
        const { data: reactData } = await supabase.from('member_reactions').select('*').in('post_id', ids)
        if (reactData) {
          const counts = {}; const mine = {}
          for (const r of reactData) {
            if (!counts[r.post_id]) counts[r.post_id] = {}
            counts[r.post_id][r.reaction] = (counts[r.post_id][r.reaction] || 0) + 1
            if (r.member_id === member.id) {
              if (!mine[r.post_id]) mine[r.post_id] = new Set()
              mine[r.post_id].add(r.reaction)
            }
          }
          setReactionCounts(counts)
          setMyReactions(mine)
        }
      }
    } catch(e) { setPosts([]) }  // 오류 시 토스트 없이 빈 피드
  }
  async function createPost() {
    if (!postContent.trim() && !postPhotoFile) { showToast('내용이나 사진을 추가해주세요'); return }
    try {
      let photo_url = null
      if (postPhotoFile) {
        const ext = postPhotoFile.name.split('.').pop()
        const path = `${member.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('community-photos').upload(path, postPhotoFile)
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('community-photos').getPublicUrl(path)
        photo_url = publicUrl
      }
      const { error } = await supabase.from('member_posts').insert({
        member_id: member.id, member_name: member.name,
        trainer_id: member.trainer_id, content: postContent.trim() || null, photo_url,
      })
      if (error) throw error
      setPostContent(''); setPostPhotoFile(null); setPostPhotoPreview(''); setPostModal(false)
      await loadPosts()
      showToast('✓ 게시됐어요!')
    } catch(e) { showToast('오류: ' + e.message) }
  }
  async function toggleReaction(postId, reaction) {
    const mySet = myReactions[postId] || new Set()
    const hasIt = mySet.has(reaction)
    // Optimistic update
    setMyReactions(prev => {
      const next = {...prev}; const s = new Set(next[postId] || [])
      hasIt ? s.delete(reaction) : s.add(reaction)
      next[postId] = s; return next
    })
    setReactionCounts(prev => {
      const next = {...prev}
      if (!next[postId]) next[postId] = {}
      const n = (next[postId][reaction] || 0) + (hasIt ? -1 : 1)
      next[postId] = {...next[postId]}
      if (n <= 0) delete next[postId][reaction]; else next[postId][reaction] = n
      return next
    })
    try {
      if (hasIt) {
        await supabase.from('member_reactions').delete().eq('post_id', postId).eq('member_id', member.id).eq('reaction', reaction)
      } else {
        await supabase.from('member_reactions').upsert({ post_id: postId, member_id: member.id, reaction }, { onConflict: 'post_id,member_id,reaction' })
      }
    } catch(e) { showToast('오류가 발생했어요'); loadPosts() }
  }
  async function deletePost(postId) {
    const { error } = await supabase.from('member_posts').delete().eq('id', postId)
    if (!error) { await loadPosts(); showToast('삭제됐어요') }
    else showToast('오류: ' + error.message)
  }

  // === COMPUTED ===
  const latestMorning = healthRecords.find(r => r.morning_weight)
  const currentW = latestMorning?.morning_weight || null
  const lost = (member?.start_weight && currentW) ? (member.start_weight - currentW).toFixed(1) : null
  const lostPct = (member?.start_weight && lost) ? ((lost/member.start_weight)*100).toFixed(1) : 0
  const goalPct = (member?.start_weight && member?.target_weight && lost && member.start_weight !== member.target_weight) ? Math.min(100, Math.round((lost/(member.start_weight-member.target_weight))*100)) : 0

  // === LOGIN ===
  if (!loggedIn) {
    return (
      <div className="m-login-wrap">
        <div className="m-login-card">
          <div className="m-login-logo">TRAINER<span>LOG</span></div>
          <div className="m-login-sub">회원 전용 포털입니다</div>
          <div className="form-group"><label>이름</label><input type="text" value={loginName} onChange={e=>setLoginName(e.target.value)} placeholder="홍길동" /></div>
          <div className="form-group"><label>전화번호 뒷 4자리</label><input type="password" value={loginPhone} onChange={e=>setLoginPhone(e.target.value)} placeholder="1234" maxLength={4} onKeyDown={e=>e.key==='Enter'&&login()} /></div>
          <button className="btn btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={login}>로그인</button>
          <div style={{textAlign:'center',marginTop:'14px'}}><Link to="/" style={{fontSize:'12px',color:'var(--m-text-dim)',textDecoration:'none'}}>← 메인으로</Link></div>
        </div>
      </div>
    )
  }

  const pct = member.total_sessions>0 ? Math.round((member.done_sessions/member.total_sessions)*100) : 0
  const remain = member.total_sessions - member.done_sessions

  return (
    <div className="member-portal">
      <div className="m-topbar">
        <div className="m-topbar-title">TRAINER<span>LOG</span></div>
        <button className="m-logout-btn" onClick={logout}>로그아웃</button>
      </div>
      <div className="m-tabs" style={{overflowX:'auto',display:'flex',WebkitOverflowScrolling:'touch',scrollbarWidth:'none'}}>
        {['logs','health','diet','workout','community'].map(t => (
          <div key={t} className={`m-tab${tab===t?' active':''}`} onClick={()=>setTab(t)} style={{whiteSpace:'nowrap',flexShrink:0}}>
            {{logs:'📋 수업일지',health:'⚖️ 체중관리',diet:'🥗 식단기록',workout:'🏃 개인운동',community:'🤝 커뮤니티'}[t]}
          </div>
        ))}
      </div>

      {/* 수업일지 */}
      {tab === 'logs' && (
        <div className="m-page">
          <div className="m-member-header">
            <div className="m-member-header-name">{member.name} 회원님 👋</div>
            <div className="m-member-header-meta">{member.lesson_purpose || '열심히 운동 중!'}</div>
            <div className="m-session-stats">
              <div className="m-stat-box"><div className="m-stat-num">{member.done_sessions}</div><div className="m-stat-label">완료</div></div>
              <div className="m-stat-box"><div className="m-stat-num">{remain}</div><div className="m-stat-label">남은 세션</div></div>
              <div className="m-stat-box"><div className="m-stat-num">{pct}%</div><div className="m-stat-label">진행률</div></div>
            </div>
            <div className="m-session-bar-bg"><div className="m-session-bar-fill" style={{width:pct+'%'}}></div></div>
          </div>
          <div className="section-label">수업일지</div>
          {!memberLogs.length && <div className="empty">아직 수업일지가 없어요.<br/>첫 수업 후에 확인해보세요!</div>}
          {memberLogs.map((l,i) => {
            const d = new Date(l.created_at); const isOpen = openLogIdx === i
            return (
              <div key={l.id} className="m-log-item">
                <div className="m-log-item-header" onClick={()=>setOpenLogIdx(isOpen?null:i)}>
                  <div><div style={{fontSize:'14px',fontWeight:500,marginBottom:'2px'}}>{d.toLocaleDateString('ko-KR',{month:'long',day:'numeric'})}</div><div className="m-log-item-date">{d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</div></div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}><span className="m-log-session">{l.session_number}회차</span><span className={`chevron${isOpen?' open':''}`}>▼</span></div>
                </div>
                {isOpen && <div className="m-log-body">{l.content}</div>}
                {isOpen && (
                  <div className="m-log-footer">
                    <button className="btn btn-outline btn-sm" onClick={()=>downloadPDF(i)}>📄 PDF</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>copyLog(i)}>📋 복사</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 체중관리 */}
      {tab === 'health' && (
        <div className="m-page">
          {!member.target_weight && !member.start_weight && <div className="m-setup-banner">💡 아래 목표 설정에서 목표/시작 체중을 먼저 입력해주세요!</div>}
          <div className="m-weight-stats">
            <div className="m-weight-card dark"><div className="m-weight-card-label">🎯 목표 체중</div><div className="m-weight-card-num">{member.target_weight||'—'}<span className="m-weight-card-unit">kg</span></div></div>
            <div className="m-weight-card"><div className="m-weight-card-label">📌 시작 체중</div><div className="m-weight-card-num">{member.start_weight||'—'}<span className="m-weight-card-unit">kg</span></div></div>
            <div className="m-weight-card green"><div className="m-weight-card-label">⚖️ 현재 공복 체중</div><div className="m-weight-card-num">{currentW||'—'}<span className="m-weight-card-unit">kg</span></div></div>
            <div className="m-weight-card green"><div className="m-weight-card-label">📉 총 감량</div><div className="m-weight-card-num">{lost||'—'}<span className="m-weight-card-unit">kg</span></div></div>
          </div>
          <div className="card">
            <div className="m-progress-wrap"><div className="m-progress-row"><span>감량률</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{lostPct}%</span></div><div className="m-progress-bg"><div className="m-progress-fill" style={{width:Math.min(100,lostPct)+'%'}}></div></div></div>
            <div className="m-progress-wrap" style={{marginBottom:0}}><div className="m-progress-row"><span>목표 달성률</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600,color:goalPct>=100?'#16a34a':'var(--m-accent)'}}>{goalPct}%</span></div><div className="m-progress-bg"><div className="m-progress-fill" style={{width:goalPct+'%'}}></div></div></div>
          </div>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
              <span style={{fontSize:'13px',fontWeight:600}}>체중 변화 추이</span>
              <span style={{fontSize:'11px',color:'var(--m-text-dim)'}}>최근 14일 · 공복 체중</span>
            </div>
            <div style={{position:'relative',height:'200px',marginBottom:'4px'}}><canvas ref={chartRef}></canvas></div>
          </div>
          <div className="section-label">오늘 체중 기록</div>
          <div className="card">
            <div className="two-col" style={{marginBottom:'12px'}}>
              <div className="form-group" style={{marginBottom:0}}><label>🌅 공복 체중 (아침, kg)</label><input type="number" value={hMorning} onChange={e=>setHMorning(e.target.value)} placeholder="68.5" step="0.1" /></div>
              <div className="form-group" style={{marginBottom:0}}><label>🌙 저녁 체중 (kg)</label><input type="number" value={hEvening} onChange={e=>setHEvening(e.target.value)} placeholder="69.2" step="0.1" /></div>
            </div>
            <div className="form-group">
              <label>😴 수면 레벨 (1~10)</label>
              <div className="m-sleep-selector">
                {Array.from({length:10},(_,i)=>(
                  <button key={i} className={`m-sleep-btn${selectedSleep&&i<selectedSleep?' active':''}`} onClick={()=>setSelectedSleep(i+1)}>{i+1}</button>
                ))}
              </div>
            </div>
            <div className="form-group"><label>📅 날짜</label><input type="date" value={hDate} onChange={e=>setHDate(e.target.value)} /></div>
            <button className="btn btn-primary" style={{width:'100%'}} onClick={saveHealthRecord}>체중 기록 저장</button>
          </div>
          <div className="section-label">일별 기록</div>
          {healthRecords.filter(r=>r.morning_weight||r.evening_weight).slice(0,14).map(r => {
            const diff = (r.morning_weight&&r.evening_weight)?(r.evening_weight-r.morning_weight).toFixed(1):null
            return (
              <div key={r.id} className="m-daily-item">
                <div className="m-daily-date">{formatDate(r.record_date)}</div>
                <div className="m-daily-weights">
                  <div className="m-daily-w"><div className="m-daily-w-num">{r.morning_weight||'—'}</div><div className="m-daily-w-label">공복</div></div>
                  <div className="m-daily-w"><div className="m-daily-w-num">{r.evening_weight||'—'}</div><div className="m-daily-w-label">저녁</div></div>
                  {diff && <div className="m-daily-w"><div className="m-daily-w-num" style={{color:diff>0?'#e53935':'#16a34a'}}>{diff>0?'+':''}{diff}</div><div className="m-daily-w-label">일중증가</div></div>}
                </div>
                {r.sleep_level && <div className="m-sleep-pips">{Array.from({length:10},(_,i)=><div key={i} className={`m-sleep-pip${i<r.sleep_level?' on':''}`}></div>)}</div>}
              </div>
            )
          })}
          {!healthRecords.filter(r=>r.morning_weight||r.evening_weight).length && <div className="empty">체중 기록이 없어요.<br/>위에서 오늘 체중을 기록해보세요!</div>}
          <div className="section-label">목표 설정</div>
          <div className="card">
            <div className="two-col">
              <div className="form-group"><label>🎯 목표 체중 (kg)</label><input type="number" value={hTarget} onChange={e=>setHTarget(e.target.value)} placeholder="60" step="0.1" /></div>
              <div className="form-group"><label>📌 시작 체중 (kg)</label><input type="number" value={hStart} onChange={e=>setHStart(e.target.value)} placeholder="75" step="0.1" /></div>
            </div>
            <div className="two-col">
              <div className="form-group"><label>나이</label><input type="number" value={hAge} onChange={e=>setHAge(e.target.value)} placeholder="28" /></div>
              <div className="form-group"><label>키 (cm)</label><input type="number" value={hHeight} onChange={e=>setHHeight(e.target.value)} placeholder="165" step="0.1" /></div>
            </div>
            <div className="form-group"><label>특이사항</label><input type="text" value={hSpecial} onChange={e=>setHSpecial(e.target.value)} placeholder="무릎 통증, 알레르기 등" /></div>
            <button className="btn btn-outline" style={{width:'100%'}} onClick={saveProfile}>목표 저장</button>
          </div>
        </div>
      )}

      {/* 식단기록 */}
      {tab === 'diet' && (
        <div className="m-page">
          <div className="section-label">오늘의 식단 기록</div>
          <div className="card">
            <div className="form-group"><label>📅 날짜</label><input type="date" value={dDate} onChange={e=>setDDate(e.target.value)} /></div>
            {[['🍳 아침',dBreakfast,setDBreakfast],['🍱 점심',dLunch,setDLunch],['🍽️ 저녁',dDinner,setDDinner],['🧃 간식',dSnack,setDSnack]].map(([label,val,setter]) => (
              <div key={label} className="m-meal-section">
                <div className="m-meal-label">{label}</div>
                <textarea value={val} onChange={e=>setter(e.target.value)} placeholder="직접 입력하세요" rows={2}></textarea>
              </div>
            ))}
            <button className="btn btn-primary" style={{width:'100%'}} onClick={saveDiet}>식단 저장</button>
          </div>
          <div className="section-label">식단 기록 히스토리</div>
          {!dietRecords.length && <div className="empty">식단 기록이 없어요.<br/>위에서 오늘 식단을 기록해보세요!</div>}
          {dietRecords.map(r => (
            <div key={r.id} className="m-diet-history-item">
              <div style={{fontSize:'11px',color:'var(--m-text-dim)',fontFamily:"'DM Mono',monospace",marginBottom:'8px'}}>{formatDate(r.record_date)}</div>
              <div style={{fontSize:'13px',lineHeight:'1.8',whiteSpace:'pre-wrap',color:'var(--m-text-muted)'}}>{r.diet_note}</div>
            </div>
          ))}
        </div>
      )}

      {/* 개인운동 */}
      {tab === 'workout' && (() => {
        const now = new Date()
        const thisMonth = now.toISOString().slice(0,7)
        const monthSessions = workoutSessions.filter(s => s.workout_date?.startsWith(thisMonth))
        const monthVolume = monthSessions.reduce((s,ss)=>s+(ss.total_volume||0),0)
        return (
          <div className="m-page">
            {/* 이번 달 요약 */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
              {[
                ['이번 달 운동', monthSessions.length+'회', '#22c55e'],
                ['총 볼륨', monthVolume>=1000?(monthVolume/1000).toFixed(1)+'t':Math.round(monthVolume)+'kg', '#22c55e'],
                ['전체 기록', workoutSessions.length+'회', 'var(--m-text-dim)'],
              ].map(([label,val,color])=>(
                <div key={label} className="card" style={{marginBottom:0,padding:'10px 12px'}}>
                  <div style={{fontSize:'10px',color:'var(--m-text-dim)',marginBottom:'3px'}}>{label}</div>
                  <div style={{fontSize:'16px',fontWeight:700,fontFamily:"'DM Mono',monospace",color}}>{val}</div>
                </div>
              ))}
            </div>
            {/* 버튼 */}
            <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
              {workoutRoutines.length > 0 && (
                <button className="btn btn-outline btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>setWorkoutRoutineModal(true)}>📋 루틴 불러오기</button>
              )}
              <button className="btn btn-primary btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>openWorkoutModal()}>+ 운동 기록</button>
            </div>
            {/* 세션 이력 */}
            {!workoutSessions.length && <div className="empty"><div style={{fontSize:'32px',marginBottom:'12px'}}>🏃</div><p>아직 개인 운동 기록이 없어요</p><p style={{fontSize:'12px',marginTop:'4px'}}>위 버튼으로 오늘 운동을 기록해보세요!</p></div>}
            {workoutSessions.map(s => {
              const isOpen = workoutDetailId === s.id
              const exList = s.exercises || []
              const vol = s.total_volume || 0
              const dateStr = new Date(s.workout_date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})
              const allPrimary = [...new Set(exList.flatMap(e => {
                const dbEx = EXERCISE_DB.find(d => d.name === e.name)
                return dbEx ? dbEx.primary : (e.muscle_group ? [e.muscle_group] : [])
              }))]
              const allSecondary = [...new Set(exList.flatMap(e => {
                const dbEx = EXERCISE_DB.find(d => d.name === e.name)
                return dbEx ? dbEx.secondary : []
              }).filter(m => !allPrimary.includes(m)))]
              const muscles = [...new Set(exList.map(e=>e.muscle_group).filter(Boolean))]
              return (
                <div key={s.id} className="card" style={{marginBottom:'10px',cursor:'pointer'}} onClick={()=>setWorkoutDetailId(isOpen?null:s.id)}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'14px',fontWeight:600}}>{s.title||'운동'}</span>
                        <span style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{dateStr}</span>
                        {s.duration_min && <span style={{fontSize:'11px',color:'var(--m-text-dim)'}}>⏱ {s.duration_min}분</span>}
                      </div>
                      <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'4px'}}>
                        {muscles.map(mg=>(
                          <span key={mg} style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(MUSCLE_COLOR[mg]||'#6b7280')+'22',color:MUSCLE_COLOR[mg]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[mg]||'#6b7280')}44`}}>{mg}</span>
                        ))}
                      </div>
                      <div style={{fontSize:'12px',color:'var(--m-text-dim)'}}>운동 {exList.length}종목 · 총 볼륨 {vol>=1000?(vol/1000).toFixed(1)+'t':Math.round(vol)+'kg'}</div>
                    </div>
                    <span style={{color:'var(--m-text-dim)',fontSize:'14px',flexShrink:0,marginTop:'2px'}}>{isOpen?'▲':'▼'}</span>
                  </div>
                  {isOpen && (
                    <div style={{marginTop:'12px',borderTop:'1px solid #eee',paddingTop:'12px'}} onClick={e=>e.stopPropagation()}>
                      <MuscleDiagram primary={allPrimary} secondary={allSecondary} />
                      {exList.map((ex,ei)=>{
                        const exVol = ex.sets.reduce((s,set)=>s+((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)),0)
                        const dbEx = EXERCISE_DB.find(d => d.name === ex.name)
                        return (
                          <div key={ei} style={{marginBottom:'10px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                              <span style={{fontSize:'13px',fontWeight:600}}>{ex.name}</span>
                              {ex.muscle_group && <span style={{fontSize:'10px',padding:'1px 7px',borderRadius:'4px',background:(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')+'22',color:MUSCLE_COLOR[ex.muscle_group]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')}44`}}>{ex.muscle_group}</span>}
                              {dbEx && <span style={{fontSize:'10px',color:'#aaa'}}>장비: {dbEx.eq}</span>}
                              <span style={{fontSize:'11px',color:'var(--m-text-dim)',marginLeft:'auto'}}>볼륨 {Math.round(exVol)}kg</span>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:'4px'}}>
                              {ex.sets.map((set,si)=>(
                                <div key={si} style={{background:'#f5f5f5',borderRadius:'6px',padding:'6px 8px',fontSize:'12px',textAlign:'center'}}>
                                  <div style={{color:'#aaa',fontSize:'10px',marginBottom:'2px'}}>{si+1}세트</div>
                                  <div style={{fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{set.weight||'—'}kg × {set.reps||'—'}회</div>
                                  {set.rest_sec && <div style={{color:'#aaa',fontSize:'10px',marginTop:'2px'}}>휴식 {set.rest_sec}초</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {s.memo && <div style={{marginTop:'8px',fontSize:'12px',color:'var(--m-text-muted)',padding:'8px',background:'#f5f5f5',borderRadius:'6px'}}>💬 {s.memo}</div>}
                      <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
                        <button className="btn btn-outline btn-sm" style={{flex:1,fontSize:'12px'}} onClick={()=>openWorkoutModal(s)}>✏️ 수정</button>
                        <button className="btn btn-outline btn-sm" style={{flex:1,fontSize:'12px',color:'#ef4444'}} onClick={()=>deleteWorkoutSession(s.id)}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* 커뮤니티 */}
      {tab === 'community' && (
        <div className="m-page">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
            <div>
              <div style={{fontSize:'15px',fontWeight:700}}>운동 일상 공유</div>
              <div style={{fontSize:'12px',color:'var(--m-text-dim)',marginTop:'2px'}}>나의 일상을 나눠보세요☺️</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={()=>setPostModal(true)} style={{fontSize:'12px'}}>+ 글쓰기</button>
          </div>
          {!member.trainer_id && (
            <div className="empty">커뮤니티는 트레이너에게 등록된 회원만 이용할 수 있어요.</div>
          )}
          {member.trainer_id && !posts.length && (
            <div className="empty"><div style={{fontSize:'32px',marginBottom:'12px'}}>🤝</div><p>아직 게시물이 없어요</p><p style={{fontSize:'12px',marginTop:'4px'}}>첫 번째 게시물을 올려보세요!</p></div>
          )}
          {posts.map(post => {
            const counts = reactionCounts[post.id] || {}
            const mine = myReactions[post.id] || new Set()
            const totalReactions = Object.values(counts).reduce((a,b)=>a+b,0)
            return (
              <div key={post.id} className="card" style={{marginBottom:'12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
                  <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'linear-gradient(135deg,#667eea,#764ba2)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'14px',fontWeight:700,flexShrink:0}}>
                    {(post.member_name||'?')[0]}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:600}}>{post.member_name||'회원'}</div>
                    <div style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{formatRelative(post.created_at)}</div>
                  </div>
                  {post.member_id === member.id && (
                    <button onClick={()=>deletePost(post.id)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:'16px',padding:'2px 6px'}}>×</button>
                  )}
                </div>
                {post.content && <p style={{fontSize:'14px',lineHeight:'1.65',margin:'0 0 10px',color:'#333',wordBreak:'break-word'}}>{post.content}</p>}
                {post.photo_url && (
                  <img src={post.photo_url} alt="첨부 사진" style={{width:'100%',borderRadius:'10px',objectFit:'cover',maxHeight:'340px',marginBottom:'10px',display:'block'}} />
                )}
                {/* 반응 카운트 */}
                {totalReactions > 0 && (
                  <div style={{fontSize:'12px',color:'var(--m-text-dim)',marginBottom:'8px',display:'flex',flexWrap:'wrap',gap:'6px'}}>
                    {REACTIONS.filter(r=>counts[r]>0).map(r=>(
                      <span key={r}>{r} {counts[r]}</span>
                    ))}
                  </div>
                )}
                {/* 반응 버튼 */}
                <div style={{display:'flex',flexWrap:'wrap',gap:'6px',borderTop:'1px solid #f0f0f0',paddingTop:'10px'}}>
                  {REACTIONS.map(r => (
                    <button key={r} onClick={()=>toggleReaction(post.id, r)}
                      style={{padding:'5px 10px',borderRadius:'20px',border:'1px solid',fontSize:'13px',cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                        background: mine.has(r) ? '#fff3e0' : '#fafafa',
                        borderColor: mine.has(r) ? '#f97316' : '#e5e7eb',
                        fontWeight: mine.has(r) ? 600 : 400}}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* WORKOUT MODAL */}
      <Modal open={workoutModal} onClose={()=>setWorkoutModal(false)} title={workoutEditId?'운동일지 수정':'운동 기록'} maxWidth="520px">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
          <div className="form-group" style={{marginBottom:0}}><label>날짜</label><input type="date" value={workoutForm.date} onChange={e=>setWorkoutForm(f=>({...f,date:e.target.value}))} /></div>
          <div className="form-group" style={{marginBottom:0}}><label>운동 시간 (분)</label><input type="number" value={workoutForm.duration_min} onChange={e=>setWorkoutForm(f=>({...f,duration_min:e.target.value}))} placeholder="60" min="1" /></div>
        </div>
        <div className="form-group"><label>제목 (선택)</label><input type="text" value={workoutForm.title} onChange={e=>setWorkoutForm(f=>({...f,title:e.target.value}))} placeholder="상체 / 하체 / 풀바디..." /></div>
        {workoutForm.exercises.map((ex, ei) => {
          const query = exQuery[ex.localId] || ''
          const suggestions = query.length >= 1
            ? EXERCISE_DB.filter(e => e.name.includes(query) && e.name !== ex.name).slice(0,6)
            : []
          const dbEx = EXERCISE_DB.find(e => e.name === ex.name)
          return (
            <div key={ex.localId} style={{background:'#f9f9f9',borderRadius:'10px',padding:'12px',marginBottom:'10px',border:'1px solid #eee'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                <span style={{fontSize:'12px',color:'#aaa',fontWeight:600,minWidth:'24px'}}>{ei+1}</span>
                <div style={{flex:1,position:'relative'}}>
                  <input type="text" value={ex.name}
                    onChange={e=>handleExNameChange(ex.localId, e.target.value)}
                    onFocus={()=>setExQuery(q=>({...q,[ex.localId]:ex.name}))}
                    placeholder="운동 이름 입력 또는 검색"
                    style={{width:'100%',fontSize:'13px',fontWeight:500}} />
                  {suggestions.length > 0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid #e5e7eb',borderRadius:'8px',boxShadow:'0 4px 12px rgba(0,0,0,0.1)',zIndex:100,overflow:'hidden',marginTop:'2px'}}>
                      {suggestions.map(s=>(
                        <div key={s.name} onMouseDown={()=>selectExSuggestion(ex.localId,s)}
                          style={{padding:'8px 12px',cursor:'pointer',fontSize:'13px',display:'flex',alignItems:'center',gap:'8px',borderBottom:'1px solid #f5f5f5'}}
                          onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                          onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                          <span style={{flex:1}}>{s.name}</span>
                          <span style={{fontSize:'10px',color:MUSCLE_COLOR[s.primary[0]]||'#aaa',padding:'1px 6px',background:(MUSCLE_COLOR[s.primary[0]]||'#6b7280')+'15',borderRadius:'4px'}}>{s.primary[0]}</span>
                          <span style={{fontSize:'10px',color:'#ccc'}}>{s.eq}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {workoutForm.exercises.length > 1 && (
                  <button onClick={()=>wfRemoveEx(ex.localId)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:'18px',flexShrink:0,padding:0}}>×</button>
                )}
              </div>
              {/* 근육군 선택 */}
              <div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginBottom:'10px'}}>
                {MUSCLE_GROUPS.map(mg=>(
                  <button key={mg} type="button" onClick={()=>wfUpdateEx(ex.localId,'muscle_group',ex.muscle_group===mg?'':mg)}
                    style={{padding:'3px 9px',borderRadius:'6px',border:'1px solid',fontSize:'11px',cursor:'pointer',fontFamily:'inherit',
                      background: ex.muscle_group===mg ? (MUSCLE_COLOR[mg]||'#888') : 'transparent',
                      color: ex.muscle_group===mg ? '#fff' : (MUSCLE_COLOR[mg]||'#888'),
                      borderColor: MUSCLE_COLOR[mg]||'#888', opacity: ex.muscle_group===mg ? 1 : 0.6}}>
                    {mg}
                  </button>
                ))}
              </div>
              {/* 근육 다이어그램 (운동 선택 시) */}
              {dbEx && <MuscleDiagram primary={dbEx.primary} secondary={dbEx.secondary} />}
              {/* 세트 그리드 */}
              <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 24px',gap:'4px',marginBottom:'4px',alignItems:'center'}}>
                <span style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>세트</span>
                <span style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>무게(kg)</span>
                <span style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>횟수</span>
                <span style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>휴식(초)</span>
                <span></span>
              </div>
              {ex.sets.map((set,si)=>(
                <div key={si} style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 24px',gap:'4px',marginBottom:'4px',alignItems:'center'}}>
                  <span style={{fontSize:'11px',color:'#aaa',textAlign:'center',flexShrink:0}}>{si+1}</span>
                  <input type="number" value={set.weight} onChange={e=>wfUpdateSet(ex.localId,si,'weight',e.target.value)} placeholder="0" min="0" step="0.5" style={{padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                  <input type="number" value={set.reps} onChange={e=>wfUpdateSet(ex.localId,si,'reps',e.target.value)} placeholder="0" min="0" style={{padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                  <input type="number" value={set.rest_sec} onChange={e=>wfUpdateSet(ex.localId,si,'rest_sec',e.target.value)} placeholder="60" min="0" style={{padding:'5px 6px',fontSize:'12px',textAlign:'center'}} />
                  {ex.sets.length > 1
                    ? <button onClick={()=>wfRemoveSet(ex.localId,si)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:'16px',padding:0,textAlign:'center'}}>×</button>
                    : <span></span>
                  }
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:'4px',fontSize:'11px'}} onClick={()=>wfAddSet(ex.localId)}>+ 세트 추가</button>
            </div>
          )
        })}
        <button className="btn btn-ghost" style={{width:'100%',marginBottom:'12px'}} onClick={wfAddEx}>+ 운동 종목 추가</button>
        <div className="form-group"><label>메모 (선택)</label><textarea value={workoutForm.memo} onChange={e=>setWorkoutForm(f=>({...f,memo:e.target.value}))} placeholder="오늘 컨디션, 특이사항 등" rows={2} style={{resize:'vertical'}} /></div>
        <div style={{display:'flex',gap:'6px',marginBottom:'12px',padding:'10px',background:'#f5f5f5',borderRadius:'8px',border:'1px solid #eee'}}>
          <input type="text" value={workoutSaveRoutineName} onChange={e=>setWorkoutSaveRoutineName(e.target.value)} placeholder="루틴 이름 입력 후 저장" style={{flex:1,fontSize:'12px'}} />
          <button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:'12px'}} onClick={saveAsRoutine}>루틴 저장</button>
        </div>
        <button className="btn btn-primary" style={{width:'100%'}} onClick={saveWorkoutSession}>{workoutEditId?'수정 완료':'기록 완료'}</button>
      </Modal>

      {/* ROUTINE MODAL */}
      <Modal open={workoutRoutineModal} onClose={()=>setWorkoutRoutineModal(false)} title="루틴 불러오기">
        {!workoutRoutines.length && <div className="empty"><p>저장된 루틴이 없어요</p></div>}
        {workoutRoutines.map(r=>(
          <div key={r.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px',background:'#f9f9f9',border:'1px solid #eee',borderRadius:'8px',marginBottom:'8px'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',fontWeight:600,marginBottom:'4px'}}>{r.name}</div>
              <div style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{(r.exercises||[]).length}종목 · {(r.exercises||[]).map(e=>e.name).filter(Boolean).join(', ').slice(0,40)}</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{flexShrink:0,fontSize:'12px'}} onClick={()=>loadRoutineIntoForm(r)}>불러오기</button>
            <button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:'12px',color:'#ef4444',padding:'4px 6px'}} onClick={()=>deleteWorkoutRoutine(r.id)}>×</button>
          </div>
        ))}
      </Modal>

      {/* POST CREATE MODAL */}
      <Modal open={postModal} onClose={()=>setPostModal(false)} title="운동 일상 공유" maxWidth="400px">
        <div className="form-group">
          <label>내용</label>
          <textarea value={postContent} onChange={e=>setPostContent(e.target.value)}
            placeholder="오늘 운동 어땠나요? 공유하고 싶은 일상을 적어보세요 💪"
            rows={4} style={{resize:'vertical'}} />
        </div>
        <div className="form-group">
          <label>사진 첨부 (선택)</label>
          <input type="file" accept="image/*" onChange={e=>{
            const file = e.target.files?.[0]; if (!file) return
            setPostPhotoFile(file)
            setPostPhotoPreview(URL.createObjectURL(file))
          }} style={{fontSize:'12px'}} />
          {postPhotoPreview && (
            <div style={{marginTop:'8px',position:'relative',display:'inline-block'}}>
              <img src={postPhotoPreview} alt="미리보기" style={{maxWidth:'100%',maxHeight:'200px',borderRadius:'8px',objectFit:'cover',display:'block'}} />
              <button onClick={()=>{setPostPhotoFile(null);setPostPhotoPreview('')}}
                style={{position:'absolute',top:'4px',right:'4px',background:'rgba(0,0,0,0.55)',border:'none',borderRadius:'50%',width:'22px',height:'22px',color:'#fff',cursor:'pointer',fontSize:'13px',lineHeight:'22px',textAlign:'center'}}>✕</button>
            </div>
          )}
        </div>
        <button className="btn btn-primary" style={{width:'100%'}} onClick={createPost}>게시하기</button>
      </Modal>
    </div>
  )
}
