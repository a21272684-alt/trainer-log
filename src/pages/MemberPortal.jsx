import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import Modal from '../components/common/Modal'
import { EXERCISE_DB } from '../lib/exercises'
import { Link } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import { callGeminiMultipart, buildFoodVisionParts, parseFoodVisionResult } from '../lib/ai_templates'
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
  const [showLanding, setShowLanding] = useState(true)
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

  // Diet v2 state
  const [trainerApiKey, setTrainerApiKey] = useState('')
  const [dietLogs, setDietLogs] = useState([])
  const [dietDate, setDietDate] = useState(() => new Date().toISOString().split('T')[0])
  const [showFoodModal, setShowFoodModal] = useState(false)
  const [foodMealType, setFoodMealType] = useState('breakfast')
  const [foodName, setFoodName] = useState('')
  const [foodAmountG, setFoodAmountG] = useState('100')
  const [foodCalPerG, setFoodCalPerG] = useState('')
  const [foodProteinPerG, setFoodProteinPerG] = useState('')
  const [foodCarbsPerG, setFoodCarbsPerG] = useState('')
  const [foodFatPerG, setFoodFatPerG] = useState('')
  const [foodFiberPerG, setFoodFiberPerG] = useState('')
  const [foodSodiumPerG, setFoodSodiumPerG] = useState('')
  const [foodSugarPerG, setFoodSugarPerG] = useState('')
  const [foodPhotoFile, setFoodPhotoFile] = useState(null)
  const [foodPhotoPreview, setFoodPhotoPreview] = useState('')
  const [foodAiLoading, setFoodAiLoading] = useState(false)
  const [foodAiConfidence, setFoodAiConfidence] = useState('')
  const foodPhotoInputRef = useRef(null)

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
      const m = data[0]
      setMember(m); setLoggedIn(true)
      if (m.trainer_id) {
        const { data: tData } = await supabase.from('trainers').select('api_key').eq('id', m.trainer_id).single()
        if (tData?.api_key) setTrainerApiKey(tData.api_key)
      }
      showToast('✓ 환영해요, '+m.name+'님!')
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

  useEffect(() => {
    if (tab === 'diet' && member) loadDietLogs(dietDate)
  }, [tab, dietDate])

  // ── 식단 v2 함수 ─────────────────────────────────────────────

  async function loadDietLogs(date) {
    if (!member) return
    const { data } = await supabase
      .from('diet_logs')
      .select('*')
      .eq('member_id', member.id)
      .eq('record_date', date)
      .order('created_at', { ascending: true })
    setDietLogs(data || [])
  }

  function openFoodModal(mealType) {
    setFoodMealType(mealType)
    setFoodName(''); setFoodAmountG('100')
    setFoodCalPerG(''); setFoodProteinPerG(''); setFoodCarbsPerG('')
    setFoodFatPerG(''); setFoodFiberPerG(''); setFoodSodiumPerG(''); setFoodSugarPerG('')
    setFoodPhotoFile(null); setFoodPhotoPreview(''); setFoodAiConfidence('')
    setShowFoodModal(true)
  }

  async function recognizeFoodFromPhoto(file) {
    if (!trainerApiKey) { showToast('트레이너에게 AI 기능 활성화를 요청해주세요'); return }
    setFoodAiLoading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const dataUrl = e.target.result
          const base64 = dataUrl.split(',')[1]
          const mimeType = file.type || 'image/jpeg'
          const parts = buildFoodVisionParts(base64, mimeType)
          const GEMINI_MODEL = 'gemini-2.5-flash-lite'
          const text = await callGeminiMultipart(trainerApiKey, GEMINI_MODEL, parts, { timeoutMs: 45000 })
          const result = parseFoodVisionResult(text)
          setFoodName(result.food_name)
          setFoodAmountG(String(result.estimated_amount_g))
          setFoodCalPerG(result.calories_per_g != null ? String(Number(result.calories_per_g).toFixed(6)) : '')
          setFoodProteinPerG(result.protein_per_g != null ? String(Number(result.protein_per_g).toFixed(6)) : '')
          setFoodCarbsPerG(result.carbs_per_g != null ? String(Number(result.carbs_per_g).toFixed(6)) : '')
          setFoodFatPerG(result.fat_per_g != null ? String(Number(result.fat_per_g).toFixed(6)) : '')
          setFoodFiberPerG(result.fiber_per_g != null ? String(Number(result.fiber_per_g).toFixed(6)) : '')
          setFoodSodiumPerG(result.sodium_per_g != null ? String(Number(result.sodium_per_g).toFixed(6)) : '')
          setFoodSugarPerG(result.sugar_per_g != null ? String(Number(result.sugar_per_g).toFixed(6)) : '')
          setFoodAiConfidence(result.confidence)
          showToast('✓ 음식을 인식했어요! 내용을 확인해주세요')
        } catch (err) {
          showToast('인식 실패: ' + err.message)
        } finally {
          setFoodAiLoading(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (err) {
      showToast('오류: ' + err.message)
      setFoodAiLoading(false)
    }
  }

  async function addFoodItem() {
    if (!foodName.trim()) { showToast('음식 이름을 입력해주세요'); return }
    const amtG = parseFloat(foodAmountG) || 100
    try {
      let photo_url = null
      if (foodPhotoFile) {
        const ext = foodPhotoFile.name.split('.').pop()
        const path = `${member.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('diet-photos').upload(path, foodPhotoFile)
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('diet-photos').getPublicUrl(path)
          photo_url = publicUrl
        }
      }
      const row = {
        member_id:      member.id,
        record_date:    dietDate,
        meal_type:      foodMealType,
        food_name:      foodName.trim(),
        amount_g:       amtG,
        calories_per_g: parseFloat(foodCalPerG) || null,
        protein_per_g:  parseFloat(foodProteinPerG) || null,
        carbs_per_g:    parseFloat(foodCarbsPerG) || null,
        fat_per_g:      parseFloat(foodFatPerG) || null,
        fiber_per_g:    parseFloat(foodFiberPerG) || null,
        sodium_per_g:   parseFloat(foodSodiumPerG) || null,
        sugar_per_g:    parseFloat(foodSugarPerG) || null,
        photo_url,
        ai_recognized: !!foodAiConfidence,
      }
      const { error } = await supabase.from('diet_logs').insert(row)
      if (error) throw error
      setShowFoodModal(false)
      await loadDietLogs(dietDate)
      showToast('✓ 음식이 추가됐어요!')
    } catch (e) { showToast('오류: ' + e.message) }
  }

  async function removeFoodItem(id) {
    const { error } = await supabase.from('diet_logs').delete().eq('id', id)
    if (!error) { await loadDietLogs(dietDate); showToast('삭제됐어요') }
    else showToast('오류: ' + error.message)
  }

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

  // === MEMBER LANDING ===
  if (!loggedIn && showLanding) {
    const FEATURES = [
      { icon:'📋', title:'수업일지 열람', desc:'트레이너가 작성한 수업일지를 열람하고 PDF로 저장해요' },
      { icon:'⚖️', title:'체중·건강 추적', desc:'공복/저녁 체중, 수면을 기록하고 14일 추이를 확인해요' },
      { icon:'🏃', title:'개인운동 일지', desc:'60+ 종목 자동완성, 세트·볼륨 계산, 근육 다이어그램 제공' },
      { icon:'🤝', title:'회원 커뮤니티', desc:'같은 센터 회원들과 운동 일상을 사진·이모지로 공유해요' },
    ]
    return (
      <div style={{background:'#f5f5f3',color:'#111',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden'}}>
        {/* 상단 바 */}
        <div style={{background:'#111',padding:'18px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:'16px',fontWeight:900,letterSpacing:'-1px',color:'#fff'}}>
            TRAINER<span style={{color:'#c8f135'}}>LOG</span>
          </div>
          <Link to="/" style={{fontSize:'12px',color:'rgba(255,255,255,0.4)',textDecoration:'none'}}>← 메인으로</Link>
        </div>

        {/* 히어로 */}
        <div style={{background:'#111',padding:'40px 24px 52px',textAlign:'center',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,
            background:'radial-gradient(ellipse at 60% 50%,rgba(200,241,53,0.08) 0%,transparent 65%)',
            pointerEvents:'none'}}/>
          <div style={{position:'relative',zIndex:1,maxWidth:'480px',margin:'0 auto'}}>
            <div style={{display:'inline-block',fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',
              color:'#c8f135',background:'rgba(200,241,53,0.12)',padding:'5px 14px',borderRadius:'20px',
              border:'1px solid rgba(200,241,53,0.25)',marginBottom:'20px'}}>
              MEMBER PORTAL
            </div>
            <h1 style={{fontSize:'clamp(28px,7vw,44px)',fontWeight:900,letterSpacing:'-2px',lineHeight:1.1,
              color:'#fff',margin:'0 0 14px'}}>
              내 운동 기록을<br/>한눈에 확인
            </h1>
            <p style={{fontSize:'14px',color:'rgba(255,255,255,0.55)',lineHeight:1.85,margin:'0 auto 32px',maxWidth:'320px'}}>
              트레이너와 연결된 나만의 건강 기록장.
              수업일지·체중·식단·운동을 모두 여기서 관리하세요.
            </p>
            <button onClick={()=>setShowLanding(false)} style={{
              background:'#c8f135',color:'#111',padding:'14px 36px',borderRadius:'12px',
              fontWeight:800,fontSize:'15px',border:'none',cursor:'pointer',
              boxShadow:'0 4px 20px rgba(200,241,53,0.4)',fontFamily:'inherit',
              display:'block',width:'100%',maxWidth:'300px',marginLeft:'auto',marginRight:'auto',marginBottom:'10px'}}>
              회원 로그인하기
            </button>
            <p style={{fontSize:'12px',color:'rgba(255,255,255,0.3)',margin:0}}>트레이너에게 등록된 회원만 입장할 수 있어요</p>
          </div>
        </div>

        {/* 기능 카드 */}
        <div style={{maxWidth:'640px',margin:'0 auto',padding:'40px 20px 60px'}}>
          <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.1em',color:'#aaa',
            textAlign:'center',marginBottom:'20px'}}>회원 포털 주요 기능</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'32px'}}>
            {FEATURES.map((f,i)=>(
              <div key={i} style={{background:'#fff',border:'1px solid #e5e5e0',borderRadius:'16px',padding:'20px',
                boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
                <div style={{fontSize:'26px',marginBottom:'10px'}}>{f.icon}</div>
                <div style={{fontSize:'13px',fontWeight:700,color:'#111',marginBottom:'6px'}}>{f.title}</div>
                <div style={{fontSize:'11px',color:'#888',lineHeight:1.65}}>{f.desc}</div>
              </div>
            ))}
          </div>

          {/* 근육 미리보기 배너 */}
          <div style={{background:'#111',borderRadius:'16px',padding:'22px',display:'flex',
            alignItems:'center',gap:'20px',marginBottom:'24px'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'#c8f135',letterSpacing:'0.08em',marginBottom:'8px'}}>PERSONAL WORKOUT</div>
              <div style={{fontSize:'14px',fontWeight:700,color:'#fff',marginBottom:'6px',lineHeight:1.4}}>
                근육 다이어그램으로<br/>오늘 운동 한눈에 확인
              </div>
              <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                {['가슴','등','어깨','하체','코어'].map((m,i)=>{
                  const c=['#ef4444','#3b82f6','#8b5cf6','#22c55e','#eab308'][i]
                  return <span key={m} style={{fontSize:'10px',padding:'2px 7px',borderRadius:'5px',
                    background:c+'22',color:c,border:`1px solid ${c}44`,fontWeight:600}}>{m}</span>
                })}
              </div>
            </div>
            <svg width="44" height="100" viewBox="0 0 80 180">
              <circle cx="40" cy="12" r="11" fill="#2a2a2a"/>
              <rect x="35" y="22" width="10" height="8" rx="2" fill="#2a2a2a"/>
              <ellipse cx="21" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
              <ellipse cx="59" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
              <path d="M30 32 Q40 37 50 32 L52 65 Q40 69 28 65 Z" fill="#ef4444"/>
              <rect x="29" y="65" width="22" height="28" rx="3" fill="#eab308"/>
              <ellipse cx="32" cy="120" rx="11" ry="19" fill="#22c55e"/>
              <ellipse cx="48" cy="120" rx="11" ry="19" fill="#22c55e"/>
            </svg>
          </div>

          <button onClick={()=>setShowLanding(false)} style={{
            width:'100%',background:'#111',border:'none',color:'#fff',
            padding:'14px',borderRadius:'12px',fontWeight:700,fontSize:'14px',
            cursor:'pointer',fontFamily:'inherit'}}>
            로그인하고 시작하기 →
          </button>
        </div>
      </div>
    )
  }

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
          <div style={{textAlign:'center',marginTop:'14px'}}>
            <span style={{fontSize:'12px',color:'var(--m-text-dim)',cursor:'pointer'}} onClick={()=>setShowLanding(true)}>← 뒤로</span>
          </div>
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
      {tab === 'diet' && (() => {
        const nutriVal = (item, key) => {
          const perG = item[key]
          return perG != null ? perG * item.amount_g : null
        }
        const sumNutri = (key) => dietLogs.reduce((acc, item) => {
          const v = nutriVal(item, key)
          return acc + (v != null ? v : 0)
        }, 0)
        const totalCal  = sumNutri('calories_per_g')
        const totalProt = sumNutri('protein_per_g')
        const totalCarb = sumNutri('carbs_per_g')
        const totalFat  = sumNutri('fat_per_g')
        const hasMacros = dietLogs.some(i => i.calories_per_g != null)
        const MEAL_TYPES = [
          { key: 'breakfast', label: '🍳 아침' },
          { key: 'lunch',     label: '🍱 점심' },
          { key: 'dinner',    label: '🍽️ 저녁' },
          { key: 'snack',     label: '🧃 간식' },
        ]
        const mealCal = (key) => dietLogs
          .filter(i => i.meal_type === key)
          .reduce((a, i) => a + (i.calories_per_g != null ? i.calories_per_g * i.amount_g : 0), 0)

        return (
          <div className="m-page">
            {/* 날짜 선택 */}
            <div className="card" style={{padding:'12px 16px',marginBottom:'10px'}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label>📅 날짜</label>
                <input type="date" value={dietDate} onChange={e => setDietDate(e.target.value)} />
              </div>
            </div>

            {/* 일일 영양소 요약 */}
            {hasMacros && (
              <div className="card" style={{marginBottom:'14px',padding:'14px 16px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--m-text-dim)',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'0.05em'}}>오늘 총 섭취</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'12px'}}>
                  {[
                    { label:'칼로리', val: totalCal.toFixed(0), unit:'kcal', color:'#f97316' },
                    { label:'단백질', val: totalProt.toFixed(1), unit:'g', color:'#3b82f6' },
                    { label:'탄수화물', val: totalCarb.toFixed(1), unit:'g', color:'#eab308' },
                    { label:'지방',   val: totalFat.toFixed(1), unit:'g', color:'#ef4444' },
                  ].map(n => (
                    <div key={n.label} style={{textAlign:'center',background:'#f8f8f6',borderRadius:'10px',padding:'8px 4px'}}>
                      <div style={{fontSize:'16px',fontWeight:800,color:n.color,lineHeight:1}}>{n.val}</div>
                      <div style={{fontSize:'9px',color:'var(--m-text-dim)',marginTop:'2px'}}>{n.unit}</div>
                      <div style={{fontSize:'10px',color:'var(--m-text-muted)',marginTop:'1px'}}>{n.label}</div>
                    </div>
                  ))}
                </div>
                {/* 매크로 바 */}
                {(() => {
                  const total = totalProt + totalCarb + totalFat
                  if (!total) return null
                  const pProt = Math.round(totalProt / total * 100)
                  const pCarb = Math.round(totalCarb / total * 100)
                  const pFat  = 100 - pProt - pCarb
                  return (
                    <div>
                      <div style={{display:'flex',borderRadius:'6px',overflow:'hidden',height:'8px',gap:'2px'}}>
                        <div style={{flex:pProt,background:'#3b82f6',minWidth:pProt>0?'2px':0}} />
                        <div style={{flex:pCarb,background:'#eab308',minWidth:pCarb>0?'2px':0}} />
                        <div style={{flex:pFat, background:'#ef4444',minWidth:pFat>0?'2px':0}} />
                      </div>
                      <div style={{display:'flex',gap:'10px',marginTop:'5px',fontSize:'10px',color:'var(--m-text-dim)'}}>
                        <span style={{color:'#3b82f6'}}>● 단백질 {pProt}%</span>
                        <span style={{color:'#eab308'}}>● 탄수화물 {pCarb}%</span>
                        <span style={{color:'#ef4444'}}>● 지방 {pFat}%</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 식사별 섹션 */}
            {MEAL_TYPES.map(({ key, label }) => {
              const items = dietLogs.filter(i => i.meal_type === key)
              const cal   = mealCal(key)
              return (
                <div key={key} className="card" style={{marginBottom:'10px',padding:'12px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <span style={{fontSize:'14px',fontWeight:700}}>{label}</span>
                      {cal > 0 && <span style={{fontSize:'11px',color:'#f97316',fontWeight:600}}>{cal.toFixed(0)} kcal</span>}
                    </div>
                    <button
                      onClick={() => openFoodModal(key)}
                      style={{background:'#111',color:'#c8f135',border:'none',borderRadius:'8px',padding:'5px 12px',fontSize:'12px',fontWeight:700,cursor:'pointer'}}
                    >+ 추가</button>
                  </div>
                  {!items.length && (
                    <div style={{fontSize:'12px',color:'var(--m-text-dim)',padding:'6px 0'}}>아직 기록이 없어요</div>
                  )}
                  {items.map(item => {
                    const cal   = item.calories_per_g != null ? (item.calories_per_g * item.amount_g).toFixed(0) : null
                    const prot  = item.protein_per_g  != null ? (item.protein_per_g  * item.amount_g).toFixed(1) : null
                    const carb  = item.carbs_per_g    != null ? (item.carbs_per_g    * item.amount_g).toFixed(1) : null
                    const fat   = item.fat_per_g      != null ? (item.fat_per_g      * item.amount_g).toFixed(1) : null
                    return (
                      <div key={item.id} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'8px 0',borderTop:'1px solid #f0f0ee'}}>
                        {item.photo_url && (
                          <img src={item.photo_url} alt={item.food_name} style={{width:'48px',height:'48px',objectFit:'cover',borderRadius:'8px',flexShrink:0}} />
                        )}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'3px'}}>
                            <span style={{fontSize:'13px',fontWeight:600,color:'#111'}}>{item.food_name}</span>
                            {item.ai_recognized && <span style={{fontSize:'9px',background:'#e8f5e9',color:'#388e3c',borderRadius:'4px',padding:'1px 5px'}}>AI</span>}
                          </div>
                          <div style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{item.amount_g}g</div>
                          {(cal || prot || carb || fat) && (
                            <div style={{fontSize:'11px',color:'var(--m-text-muted)',marginTop:'2px',display:'flex',gap:'8px',flexWrap:'wrap'}}>
                              {cal  && <span style={{color:'#f97316'}}>{cal} kcal</span>}
                              {prot && <span>단백질 {prot}g</span>}
                              {carb && <span>탄수 {carb}g</span>}
                              {fat  && <span>지방 {fat}g</span>}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeFoodItem(item.id)}
                          style={{background:'none',border:'none',color:'#ccc',fontSize:'16px',cursor:'pointer',padding:'0 2px',flexShrink:0}}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* 음식 추가 모달 */}
            {showFoodModal && (
              <Modal open={true} onClose={() => setShowFoodModal(false)}>
                <div style={{padding:'4px 0'}}>
                  <div style={{fontSize:'16px',fontWeight:800,marginBottom:'16px'}}>
                    {{'breakfast':'🍳 아침','lunch':'🍱 점심','dinner':'🍽️ 저녁','snack':'🧃 간식'}[foodMealType]} 음식 추가
                  </div>

                  {/* 사진 업로드 + AI 인식 */}
                  <div style={{marginBottom:'14px'}}>
                    <input
                      ref={foodPhotoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{display:'none'}}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        setFoodPhotoFile(f)
                        setFoodPhotoPreview(URL.createObjectURL(f))
                        recognizeFoodFromPhoto(f)
                      }}
                    />
                    {!foodPhotoPreview ? (
                      <button
                        onClick={() => foodPhotoInputRef.current?.click()}
                        style={{width:'100%',padding:'14px',border:'2px dashed #ddd',borderRadius:'12px',background:'none',cursor:'pointer',color:'var(--m-text-dim)',fontSize:'13px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}
                      >
                        📸 사진으로 자동 인식
                      </button>
                    ) : (
                      <div style={{position:'relative',marginBottom:'8px'}}>
                        <img src={foodPhotoPreview} alt="food" style={{width:'100%',maxHeight:'160px',objectFit:'cover',borderRadius:'12px'}} />
                        {foodAiLoading && (
                          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.55)',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'13px',gap:'8px'}}>
                            <span style={{fontSize:'20px',animation:'spin 1s linear infinite',display:'inline-block'}}>⟳</span> AI 분석 중...
                          </div>
                        )}
                        {foodAiConfidence && !foodAiLoading && (
                          <div style={{position:'absolute',top:'8px',right:'8px',background:'rgba(56,142,60,0.9)',color:'#fff',borderRadius:'8px',padding:'2px 8px',fontSize:'11px'}}>
                            {{'high':'정확도 높음','medium':'정확도 보통','low':'정확도 낮음'}[foodAiConfidence] || foodAiConfidence}
                          </div>
                        )}
                        <button
                          onClick={() => { setFoodPhotoFile(null); setFoodPhotoPreview(''); setFoodAiConfidence('') }}
                          style={{position:'absolute',top:'8px',left:'8px',background:'rgba(0,0,0,0.5)',border:'none',color:'#fff',borderRadius:'6px',width:'24px',height:'24px',cursor:'pointer',fontSize:'14px'}}
                        >×</button>
                      </div>
                    )}
                  </div>

                  {/* 음식 이름 + 양 */}
                  <div className="two-col" style={{marginBottom:'10px'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>음식 이름</label>
                      <input type="text" value={foodName} onChange={e=>setFoodName(e.target.value)} placeholder="닭가슴살 샐러드" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>섭취량 (g)</label>
                      <input type="number" value={foodAmountG} onChange={e=>setFoodAmountG(e.target.value)} placeholder="100" min="1" />
                    </div>
                  </div>

                  {/* 영양소 (g당 값으로 저장, 표시는 100g당) */}
                  <div style={{fontSize:'11px',color:'var(--m-text-dim)',marginBottom:'6px',fontWeight:600}}>
                    영양소 (100g 기준 — AI가 자동 입력, 수정 가능)
                  </div>
                  <div className="two-col" style={{marginBottom:'6px'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>칼로리 (kcal)</label>
                      <input type="number" value={foodCalPerG !== '' ? (parseFloat(foodCalPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodCalPerG(e.target.value ? String(parseFloat(e.target.value)/100) : '')}
                        placeholder="150" step="0.1" min="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>단백질 (g)</label>
                      <input type="number" value={foodProteinPerG !== '' ? (parseFloat(foodProteinPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodProteinPerG(e.target.value ? String(parseFloat(e.target.value)/100) : '')}
                        placeholder="20" step="0.1" min="0" />
                    </div>
                  </div>
                  <div className="two-col" style={{marginBottom:'6px'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>탄수화물 (g)</label>
                      <input type="number" value={foodCarbsPerG !== '' ? (parseFloat(foodCarbsPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodCarbsPerG(e.target.value ? String(parseFloat(e.target.value)/100) : '')}
                        placeholder="10" step="0.1" min="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>지방 (g)</label>
                      <input type="number" value={foodFatPerG !== '' ? (parseFloat(foodFatPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodFatPerG(e.target.value ? String(parseFloat(e.target.value)/100) : '')}
                        placeholder="5" step="0.1" min="0" />
                    </div>
                  </div>
                  <div className="two-col" style={{marginBottom:'6px'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>식이섬유 (g)</label>
                      <input type="number" value={foodFiberPerG !== '' ? (parseFloat(foodFiberPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodFiberPerG(e.target.value ? String(parseFloat(e.target.value)/100) : '')}
                        placeholder="2" step="0.1" min="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>당류 (g)</label>
                      <input type="number" value={foodSugarPerG !== '' ? (parseFloat(foodSugarPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodSugarPerG(e.target.value ? String(parseFloat(e.target.value)/100) : '')}
                        placeholder="3" step="0.1" min="0" />
                    </div>
                  </div>
                  <div className="form-group" style={{marginBottom:'14px'}}>
                    <label>나트륨 (mg)</label>
                    <input type="number" value={foodSodiumPerG !== '' ? (parseFloat(foodSodiumPerG)*100).toFixed(0) : ''}
                      onChange={e=>setFoodSodiumPerG(e.target.value ? String(parseFloat(e.target.value)/100) : '')}
                      placeholder="300" step="1" min="0" />
                  </div>

                  {/* 실시간 계산 미리보기 */}
                  {foodCalPerG && foodAmountG && (
                    <div style={{background:'#f8f8f6',borderRadius:'10px',padding:'10px 12px',marginBottom:'14px',fontSize:'12px'}}>
                      <div style={{fontWeight:700,marginBottom:'4px',color:'#111'}}>📊 {foodAmountG}g 기준 계산값</div>
                      <div style={{display:'flex',gap:'12px',flexWrap:'wrap',color:'var(--m-text-muted)'}}>
                        {foodCalPerG && <span style={{color:'#f97316'}}>{(parseFloat(foodCalPerG)*parseFloat(foodAmountG)).toFixed(0)} kcal</span>}
                        {foodProteinPerG && <span>단백질 {(parseFloat(foodProteinPerG)*parseFloat(foodAmountG)).toFixed(1)}g</span>}
                        {foodCarbsPerG && <span>탄수 {(parseFloat(foodCarbsPerG)*parseFloat(foodAmountG)).toFixed(1)}g</span>}
                        {foodFatPerG && <span>지방 {(parseFloat(foodFatPerG)*parseFloat(foodAmountG)).toFixed(1)}g</span>}
                      </div>
                    </div>
                  )}

                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-outline" style={{flex:1}} onClick={() => setShowFoodModal(false)}>취소</button>
                    <button className="btn btn-primary" style={{flex:2}} onClick={addFoodItem} disabled={foodAiLoading}>
                      {foodAiLoading ? 'AI 분석 중...' : '추가'}
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        )
      })()}

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
