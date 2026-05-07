import { useState, useEffect, useRef } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'
import Modal from '@trainer-log/shared/components/common/Modal'
import TermsAgreementModal from '@trainer-log/shared/components/common/TermsAgreementModal'
import { EXERCISE_DB } from '../lib/exercises'
import { Link } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import { callGeminiMultipart, buildFoodVisionParts, parseFoodVisionResult } from '@trainer-log/shared/lib/ai_templates'
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

// ── 스크롤 애니메이션 헬퍼 ─────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}
function FadeUp({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.1)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0px)' : 'translateY(40px)',
      transition: `opacity 0.8s cubic-bezier(.22,1,.36,1) ${delay}ms, transform 0.8s cubic-bezier(.22,1,.36,1) ${delay}ms`,
    }}>{children}</div>
  )
}
function SlideCard({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.06)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0px)' : 'translateY(36px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      height: '100%',
    }}>{children}</div>
  )
}

export default function MemberPortal() {
  const showToast = useToast()
  const [showLanding, setShowLanding] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [member, setMember] = useState(null)
  const [tab, setTab] = useState('logs')
  const [memberLogs, setMemberLogs] = useState([])
  const [logsOffset,  setLogsOffset]  = useState(0)
  const [logsHasMore, setLogsHasMore] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  const [videoSpeeds, setVideoSpeeds] = useState({}) // logId → playbackRate
  const [logRatings, setLogRatings]   = useState({}) // logId → 선택한 평점 (1~5, pending)
  const [ratingSaving, setRatingSaving] = useState(null) // 저장 중인 logId
  const [healthRecords, setHealthRecords] = useState([])
  const [dietRecords, setDietRecords] = useState([])
  const [selectedSleep, setSelectedSleep] = useState(null)
  const [authUser, setAuthUser] = useState(null)
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
  const [communityTab, setCommunityTab] = useState('notice') // 'notice' | 'free'
  const [posts, setPosts] = useState([])
  const [myReactions, setMyReactions] = useState({})   // postId -> Set of reactions
  const [reactionCounts, setReactionCounts] = useState({}) // postId -> {emoji: count}
  const [postModal, setPostModal] = useState(false)
  const [postContent, setPostContent] = useState('')
  const [postPhotoFile, setPostPhotoFile] = useState(null)
  const [postPhotoPreview, setPostPhotoPreview] = useState('')

  // Notices (공지사항) state - 읽기 전용 (관리는 AdminPortal에서)
  const [notices, setNotices] = useState([])

  // Diet v2 state
  const [trainerApiKey, setTrainerApiKey] = useState('')
  const [dietLogs, setDietLogs] = useState([])
  const [dietDate, setDietDate] = useState(() => new Date().toISOString().split('T')[0])
  const [showFoodModal, setShowFoodModal] = useState(false)
  const INITIAL_FOOD_FORM = {
    mealType: 'breakfast', name: '', amountG: '100',
    calPerG: '', proteinPerG: '', carbsPerG: '', fatPerG: '',
    fiberPerG: '', sodiumPerG: '', sugarPerG: '',
    photoFile: null, photoPreview: '', aiLoading: false, aiConfidence: '',
  }
  const [foodForm, setFoodForm] = useState(INITIAL_FOOD_FORM)
  const foodPhotoInputRef = useRef(null)
  const [foodSuggestions, setFoodSuggestions] = useState([])
  const [showFoodSuggestions, setShowFoodSuggestions] = useState(false)
  const foodSearchTimer = useRef(null)

  // 자주쓰는 식단 템플릿
  const [dietTemplates, setDietTemplates] = useState([])
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [saveTemplateMealType, setSaveTemplateMealType] = useState('')
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [applyTemplateMealType, setApplyTemplateMealType] = useState('breakfast')
  // 비동기 액션 연타 방어 가드
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [savingWorkout, setSavingWorkout] = useState(false)
  const [creatingPost, setCreatingPost] = useState(false)

  // 1:1 문의 → 카카오 오픈채팅 우회 (inquiries 테이블 사용 중단, 운영 비용 절감)
  // app_settings.urgent_inquiry_url 가 있으면 그 URL을, 없으면 폴백 URL을 새창으로 연다.
  const FALLBACK_INQUIRY_URL = 'https://open.kakao.com/'
  const [inquiryUrl, setInquiryUrl] = useState(FALLBACK_INQUIRY_URL)
  useEffect(() => {
    let cancelled = false
    supabase.from('app_settings').select('value').eq('key', 'urgent_inquiry_url').maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const raw = data?.value
        const url = typeof raw === 'string' ? raw.replace(/^"|"$/g, '').trim() : ''
        if (url) setInquiryUrl(url)
      })
    return () => { cancelled = true }
  }, [])
  function openInquiryChat() {
    try {
      window.open(inquiryUrl, '_blank', 'noopener,noreferrer')
    } catch {
      showToast('1:1 문의 채널을 여는 데 실패했어요')
    }
  }

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

  /* ── OAuth 로그인 ────────────────────────────────────────── */
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/member' },
    })
    if (error) showToast('구글 로그인 오류: ' + error.message)
  }
  async function signInWithKakao() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: window.location.origin + '/member' },
    })
    if (error) showToast('카카오 로그인 오류: ' + error.message)
  }

  async function handleAuthUser(au) {
    setAuthUser(au)
    try {
      // auth_id로 조회
      const { data: byId } = await supabase.from('members').select('*').eq('auth_id', au.id).maybeSingle()
      if (byId) { await _loginWithRecord(byId); return }
      // email로 조회 (기존 회원 연동)
      if (au.email) {
        const { data: byEmail } = await supabase.from('members').select('*').eq('email', au.email).maybeSingle()
        if (byEmail) {
          await supabase.from('members').update({ auth_id: au.id }).eq('id', byEmail.id)
          await _loginWithRecord({ ...byEmail, auth_id: au.id }); return
        }
      }
      // 미등록 회원
      showToast('등록된 회원 정보가 없어요. 트레이너에게 이메일 등록을 요청하세요')
      await supabase.auth.signOut()
      setAuthUser(null)
    } catch(e) {
      showToast('오류: ' + e.message)
      await supabase.auth.signOut()
      setAuthUser(null)
    }
  }

  async function _loginWithRecord(m) {
    setMember(m); setLoggedIn(true)
    showToast('✓ 환영해요, ' + m.name + '님!')
  }

  async function logout() {
    await supabase.auth.signOut()
    setMember(null); setLoggedIn(false); setAuthUser(null)
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null }
  }

  // OAuth 인증 상태 감지
  useEffect(() => {
    // 중앙 Gemini API 키 로드 (앱 마운트 시 1회)
    supabase.from('app_settings')
      .select('value')
      .eq('key', 'gemini_api_key')
      .single()
      .then(({ data }) => {
        if (data?.value) {
          // JSONB 컬럼 특성상 이중따옴표 제거 필수
          const centralKey = String(data.value).replace(/^"|"$/g, '')
          if (centralKey) setTrainerApiKey(centralKey)
        }
      })
      .catch(e => console.warn('[app_settings] Gemini 키 로드 실패:', e.message))

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthUser(session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleAuthUser(session.user)
      if (event === 'SIGNED_OUT') { setAuthUser(null); setMember(null); setLoggedIn(false) }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (member) {
      loadAll()
      setHTarget(member.target_weight || ''); setHStart(member.start_weight || '')
      setHAge(member.age || ''); setHHeight(member.height || ''); setHSpecial(member.special_note || '')
    }
  }, [member])

  async function loadAll() {
    try {
      const [l, h] = await Promise.all([
        supabase.from('logs')
          .select('id, created_at, read_at, session_number, content, media_urls, session_rating, exercises_data, session_id, workout_session:workout_sessions(exercises)')
          .eq('member_id', member.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('health_records').select('*').eq('member_id', member.id).order('record_date', { ascending: false }).limit(60),
      ])
      const logRows = l.data || []
      setMemberLogs(logRows)
      setLogsOffset(logRows.length)
      setLogsHasMore(logRows.length === 20)
      const hRows = h.data || []
      setHealthRecords(hRows)
      setDietRecords(hRows.filter(r => r.diet_note != null).slice(0, 30))
    } catch(e) {
      console.warn('[loadAll] 데이터 로드 실패:', e.message)
    }
  }

  async function loadMoreLogs() {
    if (logsLoading || !logsHasMore || !member) return
    setLogsLoading(true)
    const { data } = await supabase
      .from('logs')
      .select('id, created_at, read_at, session_number, content, media_urls, session_rating, exercises_data, session_id, workout_session:workout_sessions(exercises)')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .range(logsOffset, logsOffset + 19)
    const rows = data || []
    setMemberLogs(prev => [...prev, ...rows])
    setLogsOffset(prev => prev + rows.length)
    setLogsHasMore(rows.length === 20)
    setLogsLoading(false)
  }

  // 로그 카드 내 모든 <video> 의 배속을 일괄 변경
  function changeVideoSpeed(logId, rate) {
    document.querySelectorAll(`video[data-vid-key^="${logId}_"]`).forEach(vid => {
      vid.playbackRate = rate
    })
    setVideoSpeeds(prev => ({ ...prev, [logId]: rate }))
  }

  // 수업 평점 저장 (회원이 직접 입력)
  async function saveLogRating(logId, rating) {
    if (!rating || ratingSaving) return
    setRatingSaving(logId)
    try {
      const { error } = await supabase.from('logs').update({ session_rating: rating }).eq('id', logId)
      if (error) { showToast('평점 저장에 실패했어요'); return }
      // memberLogs state에도 즉시 반영
      setMemberLogs(prev => prev.map(l => l.id === logId ? { ...l, session_rating: rating } : l))
      // pending 선택 초기화
      setLogRatings(prev => { const n = { ...prev }; delete n[logId]; return n })
      showToast('✓ 평점이 저장됐어요!')
    } catch (e) {
      showToast('오류: ' + e.message)
    } finally {
      setRatingSaving(null)
    }
  }

  useEffect(() => {
    if (tab === 'health' && healthRecords.length) setTimeout(renderChart, 200)
  }, [tab, healthRecords])

  useEffect(() => {
    if (tab === 'workout' && member) {
      loadWorkoutSessions()
      loadWorkoutRoutines()
    }
  }, [tab, member])

  useEffect(() => {
    if (tab === 'logs' && member && memberLogs.length === 0) {
      supabase.from('logs')
        .select('id, created_at, read_at, session_number, content, media_urls, session_rating, exercises_data, session_id, workout_session:workout_sessions(exercises)')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => {
          const rows = data || []
          setMemberLogs(rows)
          setLogsOffset(rows.length)
          setLogsHasMore(rows.length === 20)
        })
    }
  }, [tab, member])

  useEffect(() => {
    if (tab === 'community' && member) {
      loadPosts()
      loadNotices()
    }
  }, [tab, member])

  useEffect(() => {
    if (tab === 'diet' && member) {
      loadDietLogs(dietDate)
      loadDietTemplates()
    }
  }, [tab, dietDate, member])

  // ── 식단 v2 함수 ─────────────────────────────────────────────

  async function loadDietLogs(date) {
    if (!member) return
    try {
      const { data, error } = await supabase
        .from('diet_logs')
        .select('*')
        .eq('member_id', member.id)
        .eq('record_date', date)
        .order('created_at', { ascending: true })
      if (error) { console.warn('[loadDietLogs] 로드 실패:', error.message); return }
      setDietLogs(data || [])
    } catch(e) { console.warn('[loadDietLogs] 오류:', e.message) }
  }

  function openFoodModal(mealType) {
    setFoodForm({ ...INITIAL_FOOD_FORM, mealType })
    setFoodSuggestions([]); setShowFoodSuggestions(false)
    setShowFoodModal(true)
  }

  async function recognizeFoodFromPhoto(file) {
    if (!trainerApiKey) { showToast('AI 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요'); return }
    setFoodForm(p => ({ ...p, aiLoading: true }))
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
          setFoodForm(p => ({
            ...p,
            name:       result.food_name,
            amountG:    String(result.estimated_amount_g),
            calPerG:    result.calories_per_g != null ? String(Number(result.calories_per_g).toFixed(6)) : '',
            proteinPerG:result.protein_per_g  != null ? String(Number(result.protein_per_g).toFixed(6))  : '',
            carbsPerG:  result.carbs_per_g    != null ? String(Number(result.carbs_per_g).toFixed(6))    : '',
            fatPerG:    result.fat_per_g      != null ? String(Number(result.fat_per_g).toFixed(6))      : '',
            fiberPerG:  result.fiber_per_g    != null ? String(Number(result.fiber_per_g).toFixed(6))    : '',
            sodiumPerG: result.sodium_per_g   != null ? String(Number(result.sodium_per_g).toFixed(6))   : '',
            sugarPerG:  result.sugar_per_g    != null ? String(Number(result.sugar_per_g).toFixed(6))    : '',
            aiConfidence: result.confidence,
            aiLoading: false,
          }))
          showToast('✓ 음식을 인식했어요! 내용을 확인해주세요')
        } catch (err) {
          showToast('인식 실패: ' + err.message)
          setFoodForm(p => ({ ...p, aiLoading: false }))
        }
      }
      reader.readAsDataURL(file)
    } catch (err) {
      showToast('오류: ' + err.message)
      setFoodForm(p => ({ ...p, aiLoading: false }))
    }
  }

  function onFoodNameChange(val) {
    setFoodForm(p => ({ ...p, name: val }))
    clearTimeout(foodSearchTimer.current)
    if (val.trim().length < 2) { setFoodSuggestions([]); setShowFoodSuggestions(false); return }
    foodSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('food_master')
        .select('id,food_name,food_category,calories_per_g,protein_per_g,carbs_per_g,fat_per_g,fiber_per_g,sodium_per_g,sugar_per_g')
        .ilike('food_name', `%${val.trim()}%`)
        .limit(8)
      setFoodSuggestions(data || [])
      setShowFoodSuggestions(!!(data?.length))
    }, 300)
  }

  function selectFoodSuggestion(item) {
    setFoodForm(p => ({
      ...p,
      name:       item.food_name,
      calPerG:    item.calories_per_g != null ? String(item.calories_per_g) : p.calPerG,
      proteinPerG:item.protein_per_g  != null ? String(item.protein_per_g)  : p.proteinPerG,
      carbsPerG:  item.carbs_per_g    != null ? String(item.carbs_per_g)    : p.carbsPerG,
      fatPerG:    item.fat_per_g      != null ? String(item.fat_per_g)      : p.fatPerG,
      fiberPerG:  item.fiber_per_g    != null ? String(item.fiber_per_g)    : p.fiberPerG,
      sodiumPerG: item.sodium_per_g   != null ? String(item.sodium_per_g)   : p.sodiumPerG,
      sugarPerG:  item.sugar_per_g    != null ? String(item.sugar_per_g)    : p.sugarPerG,
    }))
    setShowFoodSuggestions(false)
    setFoodSuggestions([])
  }

  async function addFoodItem() {
    if (!foodForm.name.trim()) { showToast('음식 이름을 입력해주세요'); return }
    const amtG = parseFloat(foodForm.amountG) || 100
    try {
      let photo_url = null
      if (foodForm.photoFile) {
        // Storage RLS: 첫 폴더 = auth.uid()::text 강제 (member.auth_id == auth.uid())
        const authUid = member?.auth_id || null
        if (!authUid) {
          console.warn('사진 업로드 차단: 익명 상태(auth_id 없음)')
        } else {
          try {
            const ext = (foodForm.photoFile.name.split('.').pop() || 'jpg').toLowerCase()
            const path = `${authUid}/${Date.now()}.${ext}`
            const { data: upData, error: upErr } = await supabase.storage.from('diet-photos').upload(path, foodForm.photoFile)
            if (upErr) {
              console.warn('사진 업로드 실패 (영양소 정보는 저장됩니다):', upErr.message)
            } else if (upData) {
              const { data: { publicUrl } } = supabase.storage.from('diet-photos').getPublicUrl(path)
              photo_url = publicUrl
            }
          } catch (uploadErr) {
            console.warn('사진 업로드 오류:', uploadErr)
          }
        }
      }
      const row = {
        member_id:      member.id,
        record_date:    dietDate,
        meal_type:      foodForm.mealType,
        food_name:      foodForm.name.trim(),
        amount_g:       amtG,
        calories_per_g: parseFloat(foodForm.calPerG)     || null,
        protein_per_g:  parseFloat(foodForm.proteinPerG) || null,
        carbs_per_g:    parseFloat(foodForm.carbsPerG)   || null,
        fat_per_g:      parseFloat(foodForm.fatPerG)     || null,
        fiber_per_g:    parseFloat(foodForm.fiberPerG)   || null,
        sodium_per_g:   parseFloat(foodForm.sodiumPerG)  || null,
        sugar_per_g:    parseFloat(foodForm.sugarPerG)   || null,
        photo_url,
        ai_recognized: !!foodForm.aiConfidence,
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

  // ── 식단 템플릿 함수 ─────────────────────────────────────────

  async function loadDietTemplates() {
    if (!member) return
    try {
      const { data, error } = await supabase
        .from('diet_templates')
        .select('*')
        .eq('member_id', member.id)
        .order('used_count', { ascending: false })
      if (error) { console.warn('[loadDietTemplates] 로드 실패:', error.message); return }
      setDietTemplates(data || [])
    } catch(e) { console.warn('[loadDietTemplates] 오류:', e.message) }
  }

  function openSaveTemplateModal(mealType) {
    const items = dietLogs.filter(i => i.meal_type === mealType)
    if (!items.length) { showToast('저장할 식단이 없어요'); return }
    setSaveTemplateMealType(mealType)
    const label = { breakfast:'아침', lunch:'점심', dinner:'저녁', snack:'간식' }[mealType] || mealType
    setSaveTemplateName(label + ' 식단')
    setShowSaveTemplateModal(true)
  }

  async function saveCurrentMealAsTemplate() {
    if (savingTemplate) return
    if (!saveTemplateName.trim()) { showToast('이름을 입력해주세요'); return }
    const items = dietLogs
      .filter(i => i.meal_type === saveTemplateMealType)
      .map(i => ({
        food_name:      i.food_name,
        amount_g:       i.amount_g,
        calories_per_g: i.calories_per_g,
        protein_per_g:  i.protein_per_g,
        carbs_per_g:    i.carbs_per_g,
        fat_per_g:      i.fat_per_g,
        fiber_per_g:    i.fiber_per_g,
        sodium_per_g:   i.sodium_per_g,
        sugar_per_g:    i.sugar_per_g,
      }))
    setSavingTemplate(true)
    try {
      const { error } = await supabase.from('diet_templates').insert({
        member_id: member.id,
        name:      saveTemplateName.trim(),
        meal_type: saveTemplateMealType,
        items,
      })
      if (error) throw error
      setShowSaveTemplateModal(false)
      await loadDietTemplates()
      showToast('✓ 식단 매크로가 저장됐어요!')
    } catch (e) {
      console.error('식단 매크로 저장 오류:', e)
      showToast('오류: ' + (e?.message || '저장 실패'))
    } finally {
      setSavingTemplate(false)
    }
  }

  function openApplyTemplateModal(template) {
    setSelectedTemplate(template)
    setApplyTemplateMealType(template.meal_type || 'breakfast')
    setShowApplyTemplateModal(true)
  }

  async function applyTemplate() {
    if (applyingTemplate) return
    if (!selectedTemplate) return
    const rows = selectedTemplate.items.map(item => ({
      member_id:      member.id,
      record_date:    dietDate,
      meal_type:      applyTemplateMealType,
      food_name:      item.food_name,
      amount_g:       item.amount_g,
      calories_per_g: item.calories_per_g,
      protein_per_g:  item.protein_per_g,
      carbs_per_g:    item.carbs_per_g,
      fat_per_g:      item.fat_per_g,
      fiber_per_g:    item.fiber_per_g,
      sodium_per_g:   item.sodium_per_g,
      sugar_per_g:    item.sugar_per_g,
      ai_recognized:  false,
    }))
    setApplyingTemplate(true)
    try {
      const { error: insErr } = await supabase.from('diet_logs').insert(rows)
      if (insErr) throw insErr
      // used_count 증가
      const { error: updErr } = await supabase.from('diet_templates')
        .update({ used_count: (selectedTemplate.used_count || 0) + 1 })
        .eq('id', selectedTemplate.id)
      if (updErr) throw updErr
      setShowApplyTemplateModal(false)
      const appliedName = selectedTemplate.name
      setSelectedTemplate(null)
      await loadDietLogs(dietDate)
      await loadDietTemplates()
      showToast(`✓ ${appliedName} 식단이 적용됐어요!`)
    } catch (e) {
      console.error('식단 매크로 적용 오류:', e)
      showToast('오류: ' + (e?.message || '적용 실패'))
    } finally {
      setApplyingTemplate(false)
    }
  }

  async function deleteTemplate(id, e) {
    e.stopPropagation()
    const { error } = await supabase.from('diet_templates').delete().eq('id', id)
    if (!error) { await loadDietTemplates(); showToast('삭제됐어요') }
  }

  function renderChart() {
    const records = healthRecords.filter(r => r.morning_weight).slice(0,14).reverse()
    if (!records.length || !chartRef.current) return
    if (chartInstance.current) chartInstance.current.destroy()
    const ctx = chartRef.current.getContext('2d')
    chartInstance.current = new Chart(ctx, {
      type:'line',
      data:{labels:records.map(r=>formatDate(r.record_date)),datasets:[
        {label:'공복 체중',data:records.map(r=>r.morning_weight),borderColor:'#10B981',backgroundColor:'rgba(16,185,129,0.08)',tension:0.4,pointRadius:4,pointBackgroundColor:'#10B981',pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2.5,fill:true},
        ...(member?.target_weight?[{label:'목표',data:Array(records.length).fill(member.target_weight),borderColor:'#d1fae5',borderDash:[5,4],borderWidth:2,pointRadius:0,fill:false}]:[])
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#9CA3AF'}},y:{grid:{color:'#F3F4F6'},ticks:{font:{size:10},color:'#9CA3AF',callback:v=>v+'kg'}}}}
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
    const log = memberLogs[i]
    const d = new Date(log.created_at)
    const dateStr = d.toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric'})
    const contentLines = (log.content || '').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
    const win = window.open('','_blank','width=800,height=900')
    win.document.write(`<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8">
<title>수업일지_${member.name}_${log.session_number}회차</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans KR',sans-serif;background:#fff;color:#1a1a1a;padding:40px}
  .header{background:#1a1a1a;color:#c8f135;padding:20px 24px;border-radius:8px;margin-bottom:24px}
  .header h1{font-size:22px;font-weight:700;letter-spacing:2px;margin-bottom:6px}
  .header p{color:#fff;font-size:13px;opacity:0.85}
  .section{background:#f8f8f8;border-radius:8px;padding:20px 24px;margin-bottom:16px}
  .section-title{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
  .content{font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-word}
  .footer{margin-top:32px;text-align:center;font-size:11px;color:#aaa}
  @media print{body{padding:20px}.no-print{display:none}}
</style>
</head><body>
<div class="header">
  <h1>오운</h1>
  <p>${member.name} &nbsp;|&nbsp; ${dateStr} &nbsp;|&nbsp; ${log.session_number}회차</p>
</div>
<div class="section">
  <div class="section-title">수업 일지</div>
  <div class="content">${contentLines}</div>
</div>
${(log.workout_session?.exercises || log.exercises_data) ? `<div class="section"><div class="section-title">운동 데이터</div><div class="content">${JSON.stringify(log.workout_session?.exercises || log.exercises_data,null,2)}</div></div>` : ''}
<div class="footer">© 오운 &nbsp;·&nbsp; 본 일지는 트레이너와 회원 간 비공개 문서입니다.</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`)
    win.document.close()
    showToast('✓ 인쇄 창이 열렸어요 — "PDF로 저장"을 선택하세요!')
  }

  // === PERSONAL WORKOUT ===
  async function loadWorkoutSessions() {
    try {
      const { data, error } = await supabase.from('workout_sessions').select('*').eq('member_id', member.id).order('workout_date', { ascending: false })
      if (error) { console.warn('[loadWorkoutSessions] 로드 실패:', error.message); return }
      setWorkoutSessions(data || [])
    } catch(e) { console.warn('[loadWorkoutSessions] 오류:', e.message) }
  }
  async function loadWorkoutRoutines() {
    try {
      const { data, error } = await supabase.from('workout_routines').select('*').eq('member_id', member.id).order('created_at', { ascending: false })
      if (error) { console.warn('[loadWorkoutRoutines] 로드 실패:', error.message); return }
      setWorkoutRoutines(data || [])
    } catch(e) { console.warn('[loadWorkoutRoutines] 오류:', e.message) }
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
    return (exercises||[]).reduce((total, ex) => {
      const sets = ex?.sets || []
      return total + sets.reduce((s, set) => s + ((parseFloat(set?.weight)||0) * (parseInt(set?.reps)||0)), 0)
    }, 0)
  }
  async function saveWorkoutSession() {
    if (savingWorkout) return
    const f = workoutForm
    if (!f.date) { showToast('날짜를 입력해주세요'); return }
    setSavingWorkout(true)
    try {
      const exercises = (f.exercises||[]).filter(e => e?.name?.trim())
      const total_volume = calcVolume(exercises)
      // localId는 프론트 전용 — DB 저장 시 제거
      const cleanExercises = exercises.map(({ localId, ...rest }) => rest)
      if (workoutEditId) {
        const { error } = await supabase.from('workout_sessions')
          .update({ title: f.title||null, workout_date: f.date, duration_min: parseInt(f.duration_min)||null, memo: f.memo||null, exercises: cleanExercises, total_volume })
          .eq('id', workoutEditId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workout_sessions')
          .insert({ member_id: member.id, trainer_id: member.trainer_id||null, source: 'member', title: f.title||null, workout_date: f.date, duration_min: parseInt(f.duration_min)||null, memo: f.memo||null, exercises: cleanExercises, total_volume })
        if (error) throw error
      }
      await loadWorkoutSessions()
      setWorkoutModal(false)
      showToast(workoutEditId ? '✓ 운동일지가 수정됐어요' : '✓ 운동일지가 저장됐어요')
    } catch(e) {
      console.error('saveWorkoutSession error:', e)
      const msg = e?.message || ''
      if (msg.includes('workout_sessions') && msg.includes('exist')) {
        showToast('오류: 운동 기록 테이블이 없어요. 관리자에게 문의하세요.')
      } else if (msg.includes('source')) {
        showToast('오류: DB 컬럼 누락 — Supabase SQL Editor에서 035_workout_sessions_fix.sql을 실행해주세요.')
      } else if (msg.includes('violates foreign key')) {
        showToast('오류: 트레이너 정보가 올바르지 않아요.')
      } else if (msg.includes('permission') || msg.includes('policy')) {
        showToast('오류: 저장 권한이 없어요. 관리자에게 문의하세요.')
      } else {
        showToast('저장 실패: ' + (msg || '알 수 없는 오류'))
      }
    } finally {
      setSavingWorkout(false)
    }
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
    } catch(e) { setPosts([]); console.warn('[loadPosts] 오류:', e.message) }
  }
  async function createPost() {
    if (creatingPost) return
    if (!postContent.trim() && !postPhotoFile) { showToast('내용이나 사진을 추가해주세요'); return }
    setCreatingPost(true)
    try {
      let photo_url = null
      if (postPhotoFile) {
        // Storage RLS: 첫 폴더 = auth.uid()::text 강제
        const authUid = member?.auth_id || null
        if (!authUid) throw new Error('사진 업로드는 로그인 후 가능해요')
        const ext = postPhotoFile.name.split('.').pop()
        const path = `${authUid}/${Date.now()}.${ext}`
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
    } catch(e) {
      console.error('게시글 작성 오류:', e)
      showToast('오류: ' + (e?.message || '게시 실패'))
    } finally {
      setCreatingPost(false)
    }
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

  // === NOTICES (공지사항) - 읽기 전용 ===
  async function loadNotices() {
    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setNotices(data || [])
    } catch(e) { setNotices([]); console.warn('[loadNotices] 오류:', e.message) }
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
      <div style={{background:'#F7F8F4',color:'#111827',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden'}}>

        {/* ── 네비바 ── */}
        <div style={{background:'#fff',borderBottom:'1px solid #E1E4D9',padding:'14px 24px',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          boxShadow:'0 1px 8px rgba(0,0,0,0.05)',position:'sticky',top:0,zIndex:10}}>
          <div style={{fontSize:'17px',fontWeight:900,letterSpacing:'-0.5px',color:'#111'}}>
            오<span style={{background:'#c8f135',color:'#111',padding:'1px 7px',borderRadius:'5px',marginLeft:'2px'}}>운</span>
          </div>
          <Link to="/" style={{fontSize:'12px',color:'#9CA3AF',textDecoration:'none',fontWeight:500}}>← 메인으로</Link>
        </div>

        {/* ── 히어로 ── */}
        <FadeUp>
          <div style={{background:'#fff',borderBottom:'1px solid #E1E4D9',padding:'52px 24px 44px',textAlign:'center'}}>
            <div style={{maxWidth:'440px',margin:'0 auto'}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11px',fontWeight:700,
                letterSpacing:'0.13em',color:'#10B981',background:'rgba(59,130,246,0.08)',padding:'5px 14px',
                borderRadius:'20px',border:'1px solid rgba(59,130,246,0.22)',marginBottom:'22px'}}>
                <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'#3b82f6',display:'inline-block'}}/>
                MEMBER PORTAL
              </div>
              <h1 style={{fontSize:'clamp(26px,6vw,42px)',fontWeight:900,letterSpacing:'-2px',lineHeight:1.1,
                color:'#111827',margin:'0 0 14px'}}>
                내 운동 기록을<br/>
                <span style={{color:'#10B981',background:'rgba(59,130,246,0.08)',padding:'2px 10px',borderRadius:'8px'}}>한눈에 확인</span>
              </h1>
              <p style={{fontSize:'14px',color:'#6B7280',lineHeight:1.9,margin:'0 auto 32px',maxWidth:'300px'}}>
                트레이너와 연결된 나만의 건강 기록장.
                수업일지·체중·식단·운동을 모두 여기서 관리하세요.
              </p>
              <button onClick={()=>setShowLanding(false)} style={{
                background:'#c8f135',color:'#111',padding:'14px 36px',borderRadius:'12px',
                fontWeight:800,fontSize:'14px',border:'none',cursor:'pointer',
                boxShadow:'0 4px 20px rgba(200,241,53,0.4)',fontFamily:'inherit',
                display:'block',width:'100%',maxWidth:'280px',marginLeft:'auto',marginRight:'auto',
                marginBottom:'12px',transition:'all 0.2s'}}>
                회원 로그인하기
              </button>
              <p style={{fontSize:'12px',color:'#9CA3AF',margin:0}}>트레이너에게 등록된 회원만 입장할 수 있어요</p>
            </div>
          </div>
        </FadeUp>

        {/* ── 기능 카드 ── */}
        <div style={{maxWidth:'640px',margin:'0 auto',padding:'36px 20px 60px'}}>
          <FadeUp>
            <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.1em',color:'#9CA3AF',
              textAlign:'center',marginBottom:'20px'}}>회원 포털 주요 기능</div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'28px'}}>
            {FEATURES.map((f,i)=>(
              <SlideCard key={i} delay={i * 80}>
                <div style={{background:'#fff',border:'1px solid #E1E4D9',borderRadius:'14px',
                  padding:'20px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)',height:'100%',boxSizing:'border-box'}}>
                  <div style={{fontSize:'26px',marginBottom:'10px'}}>{f.icon}</div>
                  <div style={{fontSize:'13px',fontWeight:700,color:'#111827',marginBottom:'6px'}}>{f.title}</div>
                  <div style={{fontSize:'11px',color:'#6B7280',lineHeight:1.65}}>{f.desc}</div>
                </div>
              </SlideCard>
            ))}
          </div>

          {/* 근육 다이어그램 배너 */}
          <FadeUp delay={100}>
            <div style={{background:'linear-gradient(135deg,#f0fcd4,#ecfccb)',
              border:'1px solid rgba(200,241,53,0.52)',borderRadius:'16px',
              padding:'22px',display:'flex',alignItems:'center',gap:'20px',marginBottom:'20px'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:'11px',fontWeight:700,color:'#4d7c0f',letterSpacing:'0.08em',marginBottom:'8px'}}>PERSONAL WORKOUT</div>
                <div style={{fontSize:'14px',fontWeight:800,color:'#111827',marginBottom:'8px',lineHeight:1.4}}>
                  근육 다이어그램으로<br/>오늘 운동 한눈에 확인
                </div>
                <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                  {['가슴','등','어깨','하체','코어'].map((m,i)=>{
                    const c=['#ef4444','#3b82f6','#8b5cf6','#22c55e','#eab308'][i]
                    return <span key={m} style={{fontSize:'10px',padding:'2px 7px',borderRadius:'5px',
                      background:c+'18',color:c,border:`1px solid ${c}38`,fontWeight:600}}>{m}</span>
                  })}
                </div>
              </div>
              <svg width="48" height="110" viewBox="0 0 80 180" style={{flexShrink:0}}>
                <circle cx="40" cy="12" r="11" fill="#d1d5db"/>
                <rect x="35" y="22" width="10" height="8" rx="2" fill="#d1d5db"/>
                <ellipse cx="21" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
                <ellipse cx="59" cy="38" rx="9" ry="8" fill="#8b5cf6"/>
                <path d="M30 32 Q40 37 50 32 L52 65 Q40 69 28 65 Z" fill="#ef4444"/>
                <rect x="29" y="65" width="22" height="28" rx="3" fill="#eab308"/>
                <ellipse cx="32" cy="120" rx="11" ry="19" fill="#22c55e"/>
                <ellipse cx="48" cy="120" rx="11" ry="19" fill="#22c55e"/>
              </svg>
            </div>
          </FadeUp>

          <FadeUp delay={150}>
            <button onClick={()=>setShowLanding(false)} style={{
              width:'100%',background:'#111827',border:'none',color:'#fff',
              padding:'14px',borderRadius:'12px',fontWeight:700,fontSize:'14px',
              cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
              로그인하고 시작하기 →
            </button>
          </FadeUp>
        </div>
      </div>
    )
  }

  // === LOGIN ===
  if (!loggedIn) {
    return (
      <div className="m-login-wrap">
        <div style={{width:'100%',maxWidth:'400px'}}>
          <div className="m-login-card">
            {/* 로고 */}
            <div style={{marginBottom:'28px'}}>
              <div className="m-login-logo">오운</div>
              <div className="m-login-sub">회원 전용 포털에 오신 것을 환영해요</div>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'10px',marginTop:'8px'}}>
              {/* Google */}
              <button onClick={signInWithGoogle} style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,
                width:'100%',padding:'13px 20px',borderRadius:'10px',
                border:'1px solid #E1E4D9',background:'#fff',color:'#111',
                fontSize:'14px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                <svg width="18" height="18" viewBox="0 0 18 18" style={{flexShrink:0}}>
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Google로 로그인
              </button>
              {/* Kakao */}
              <button onClick={signInWithKakao} style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,
                width:'100%',padding:'13px 20px',borderRadius:'10px',
                border:'none',background:'#FEE500',color:'#191919',
                fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{flexShrink:0}}>
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M9 1C4.582 1 1 3.806 1 7.25c0 2.178 1.417 4.09 3.56 5.19l-.91 3.394c-.08.3.264.535.518.356L8.44 13.84c.184.016.37.024.56.024 4.418 0 8-2.806 8-6.25S13.418 1 9 1z"
                    fill="#191919"/>
                </svg>
                카카오로 로그인
              </button>
            </div>

            <div style={{textAlign:'center',marginTop:'16px'}}>
              <span style={{fontSize:'13px',color:'#4d7c0f',cursor:'pointer',fontWeight:600}}
                onClick={()=>setShowLanding(true)}>← 앱 소개 보기</span>
            </div>
          </div>

          <div style={{textAlign:'center',marginTop:'14px',fontSize:'12px',color:'#9CA3AF'}}>
            트레이너에게 이메일이 등록된 회원만 로그인할 수 있어요
          </div>
        </div>
      </div>
    )
  }

  const pct = member.total_sessions>0 ? Math.round((member.done_sessions/member.total_sessions)*100) : 0
  const remain = member.total_sessions - member.done_sessions

  // ── 하단 네비 아이콘 정의 ────────────────────────────────────────
  const NAV_ITEMS = [
    {
      key: 'logs', label: '수업일지',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? '#10B981' : '#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="10" y1="9"  x2="8" y2="9"/>
        </svg>
      ),
    },
    {
      key: 'health', label: '체중관리',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? '#10B981' : '#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
      ),
    },
    {
      key: 'diet', label: '식단',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? '#10B981' : '#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 010 8h-1"/>
          <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
          <line x1="6" y1="1" x2="6" y2="4"/>
          <line x1="10" y1="1" x2="10" y2="4"/>
          <line x1="14" y1="1" x2="14" y2="4"/>
        </svg>
      ),
    },
    {
      key: 'workout', label: '운동',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? '#10B981' : '#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5h11M6.5 17.5h11M3 10h3v4H3zM18 10h3v4h-3zM6.5 12h11"/>
        </svg>
      ),
    },
    {
      key: 'community', label: '커뮤니티',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? '#10B981' : '#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      ),
    },
  ]

  return (
    <div className="member-portal" style={{paddingBottom:'72px'}}>
      {/* 최초 로그인 1회 약관 동의 모달 (user_metadata.terms_agreed 미설정 시 강제 노출) */}
      <TermsAgreementModal />
      <div className="m-topbar">
        <div className="m-topbar-title">오운</div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <button
            type="button"
            onClick={openInquiryChat}
            title="1:1 문의 (카카오 오픈채팅)"
            style={{
              border:'1px solid #FEE500',background:'#FEE500',color:'#191919',
              fontWeight:700,fontSize:'12px',borderRadius:'8px',padding:'6px 10px',
              cursor:'pointer',fontFamily:'inherit'
            }}
          >
            💬 1:1 문의
          </button>
          <button className="m-logout-btn" onClick={logout}>로그아웃</button>
        </div>
      </div>

      {/* ── 하단 고정 네비게이션 ── */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:200,
        background:'#fff',
        borderTop:'1px solid #E5E7EB',
        display:'flex',
        boxShadow:'0 -2px 16px rgba(0,0,0,0.07)',
        paddingBottom:'env(safe-area-inset-bottom)',
      }}>
        {NAV_ITEMS.map(({ key, label, icon }) => {
          const active = tab === key
          return (
            <button key={key} onClick={()=>setTab(key)} style={{
              flex:1, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center',
              gap:'3px', padding:'9px 4px 7px',
              border:'none', background:'none',
              cursor:'pointer', fontFamily:'inherit',
              transition:'color 0.15s', minHeight:'54px',
              position:'relative',
            }}>
              {active && (
                <span style={{
                  position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
                  width:'28px', height:'2.5px', borderRadius:'0 0 3px 3px',
                  background:'#10B981',
                }}/>
              )}
              {icon(active)}
              <span style={{
                fontSize:'10px', fontWeight: active ? 700 : 400, lineHeight:1,
                color: active ? '#10B981' : '#9CA3AF',
              }}>{label}</span>
            </button>
          )
        })}
      </div>

      {/* ── 수업일지 ── */}
      {tab === 'logs' && (
        <div className="m-page">

          {/* 헤더 카드 — 세션 현황 */}
          {(() => {
            const ratedLogs = memberLogs.filter(l => l.session_rating)
            const avgRating = ratedLogs.length
              ? (ratedLogs.reduce((s, l) => s + l.session_rating, 0) / ratedLogs.length).toFixed(1)
              : null
            return (
          <div style={{
            background:'linear-gradient(135deg,#10B981 0%,#059669 100%)',
            borderRadius:'18px', padding:'20px', marginBottom:'20px', color:'#fff',
          }}>
            <div style={{fontSize:'16px',fontWeight:800,marginBottom:'2px'}}>
              {member.name} 회원님 👋
            </div>
            <div style={{fontSize:'12px',opacity:0.85,marginBottom:'16px'}}>
              {member.lesson_purpose || '열심히 운동 중!'}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
              {[
                {num: member.done_sessions,        label:'완료 세션'},
                {num: remain,                       label:'잔여 세션'},
                {num: pct+'%',                      label:'진행률'},
                {num: avgRating ? '⭐ '+avgRating : '—', label:'평균 평점'},
              ].map(({num, label}) => (
                <div key={label} style={{
                  background:'rgba(255,255,255,0.15)', borderRadius:'10px', padding:'10px 8px', textAlign:'center',
                }}>
                  <div style={{fontSize:'18px',fontWeight:800,lineHeight:1}}>{num}</div>
                  <div style={{fontSize:'10px',opacity:0.85,marginTop:'3px'}}>{label}</div>
                </div>
              ))}
            </div>
            {/* 프로그레스 바 */}
            <div style={{background:'rgba(255,255,255,0.25)',borderRadius:'4px',height:'6px',overflow:'hidden'}}>
              <div style={{height:'100%',background:'#fff',borderRadius:'4px',width:pct+'%',transition:'width 0.6s ease'}}/>
            </div>
          </div>
            )
          })()}

          {/* 일지 목록 */}
          <div style={{fontSize:'11px',fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',marginBottom:'12px'}}>
            수업일지 · {memberLogs.length}건
          </div>

          {!memberLogs.length && (
            <div style={{
              textAlign:'center', padding:'48px 20px', color:'#9CA3AF',
              background:'#F9FAFB', borderRadius:'16px', border:'1px dashed #E5E7EB',
            }}>
              <div style={{fontSize:'36px',marginBottom:'12px'}}>📋</div>
              <div style={{fontSize:'14px',fontWeight:600,marginBottom:'4px',color:'#6B7280'}}>아직 수업일지가 없어요</div>
              <div style={{fontSize:'12px'}}>첫 수업 후에 확인해보세요!</div>
            </div>
          )}

          {memberLogs.map((l,i) => {
            const d = new Date(l.created_at)
            const isOpen = openLogIdx === i
            const isNew  = !l.read_at

            const markRead = async () => {
              if (!l.read_at) {
                await supabase.from('logs').update({ read_at: new Date().toISOString() }).eq('id', l.id)
                setMemberLogs(prev => prev.map((x,j) => j===i ? {...x, read_at: new Date().toISOString()} : x))
              }
            }

            // ── media_urls 안전 파싱 ─────────────────────────────────────
            let mediaArray = []
            try {
              const raw = l.media_urls
              if (typeof raw === 'string' && raw.trim().startsWith('[')) {
                mediaArray = JSON.parse(raw)
              } else if (Array.isArray(raw)) {
                mediaArray = raw
              }
              if (!Array.isArray(mediaArray)) mediaArray = []
            } catch (e) {
              console.error('[MemberPortal] media_urls 파싱 오류 (log id:', l.id, ')', e)
              mediaArray = []
            }
            if (isOpen) {
              console.log('[MemberPortal] log', l.id, '| media_urls raw:', l.media_urls, '| parsed:', mediaArray)
            }

            const hasVideos = mediaArray.some(m => m?.type === 'video')
            const currentSpeed = videoSpeeds[l.id] || 1.0

            return (
              <div key={l.id} style={{
                background:'#fff',
                borderRadius:'16px',
                boxShadow: isOpen
                  ? '0 4px 20px rgba(16,185,129,0.10), 0 1px 4px rgba(0,0,0,0.06)'
                  : '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
                marginBottom:'10px',
                overflow:'hidden',
                border: isOpen ? '1px solid rgba(16,185,129,0.18)' : '1px solid #F3F4F6',
                transition:'box-shadow 0.2s, border-color 0.2s',
              }}>

                {/* ── 카드 헤더 (토글) ── */}
                <div
                  onClick={()=>{ setOpenLogIdx(isOpen?null:i); if(!isOpen) markRead() }}
                  style={{
                    padding:'15px 16px', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    userSelect:'none',
                  }}
                >
                  <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                    {/* 날짜 컬럼 */}
                    <div style={{
                      width:'44px', height:'44px', borderRadius:'12px', flexShrink:0,
                      background: isNew ? '#F0FDF4' : '#F9FAFB',
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      border: isNew ? '1px solid #A7F3D0' : '1px solid #E5E7EB',
                    }}>
                      <div style={{fontSize:'16px',fontWeight:800,lineHeight:1,color: isNew ? '#10B981' : '#374151'}}>
                        {d.getDate()}
                      </div>
                      <div style={{fontSize:'9px',fontWeight:500,color: isNew ? '#34D399' : '#9CA3AF',marginTop:'1px'}}>
                        {d.toLocaleDateString('ko-KR',{month:'short'})}
                      </div>
                    </div>
                    {/* 텍스트 */}
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'3px'}}>
                        <span style={{fontSize:'14px',fontWeight:700,color:'#111'}}>
                          {d.toLocaleDateString('ko-KR',{weekday:'short'})} 수업
                        </span>
                        {isNew && (
                          <span style={{
                            fontSize:'9px', fontWeight:700, padding:'2px 6px',
                            borderRadius:'20px', background:'#10B981', color:'#fff',
                            letterSpacing:'0.04em',
                          }}>NEW</span>
                        )}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span style={{
                          fontSize:'11px', fontWeight:600, padding:'2px 7px',
                          borderRadius:'6px', background:'#F0FDF4', color:'#10B981',
                        }}>{l.session_number}회차</span>
                        {l.session_rating && (
                          <span style={{fontSize:'11px',fontWeight:600,padding:'2px 7px',borderRadius:'6px',background:'#FEF3C7',color:'#D97706'}}>
                            ⭐ {l.session_rating}
                          </span>
                        )}
                        <span style={{fontSize:'11px',color:'#9CA3AF'}}>
                          {d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}
                        </span>
                        {mediaArray.length > 0 && (
                          <span style={{fontSize:'11px',color:'#9CA3AF'}}>
                            · 📎 {mediaArray.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 화살표 */}
                  <div style={{
                    width:'28px', height:'28px', borderRadius:'50%',
                    background:'#F9FAFB', border:'1px solid #E5E7EB',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'11px', color:'#9CA3AF', flexShrink:0,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition:'transform 0.22s cubic-bezier(.4,0,.2,1)',
                  }}>▼</div>
                </div>

                {/* ── 펼쳐진 내용 ── */}
                {isOpen && (
                  <div style={{borderTop:'1px solid #F3F4F6'}}>

                    {/* AI 일지 텍스트 */}
                    <div style={{
                      padding:'16px',
                      fontSize:'13.5px', lineHeight:'1.85', color:'#374151',
                      whiteSpace:'pre-wrap', wordBreak:'break-word',
                    }}>
                      {l.content}
                    </div>

                    {/* 미디어 영역 */}
                    {mediaArray.length > 0 && (
                      <div style={{padding:'0 16px 16px'}}>

                        {/* 배속 컨트롤 (영상이 있을 때만) */}
                        {hasVideos && (
                          <div style={{
                            display:'flex', alignItems:'center', gap:'6px',
                            marginBottom:'10px', flexWrap:'wrap',
                          }}>
                            <span style={{fontSize:'11px',fontWeight:600,color:'#6B7280',marginRight:'2px'}}>
                              배속
                            </span>
                            {[0.5, 1.0, 1.5, 2.0].map(rate => (
                              <button
                                key={rate}
                                onClick={() => changeVideoSpeed(l.id, rate)}
                                style={{
                                  padding:'4px 11px', borderRadius:'20px',
                                  fontSize:'11px', fontWeight:600, cursor:'pointer',
                                  fontFamily:'inherit', transition:'all 0.15s',
                                  border: currentSpeed === rate ? 'none' : '1px solid #E5E7EB',
                                  background: currentSpeed === rate ? '#10B981' : '#F9FAFB',
                                  color: currentSpeed === rate ? '#fff' : '#6B7280',
                                  boxShadow: currentSpeed === rate ? '0 1px 6px rgba(16,185,129,0.25)' : 'none',
                                }}
                              >{rate}x</button>
                            ))}
                          </div>
                        )}

                        {/* 미디어 그리드 */}
                        <div style={{
                          display:'grid',
                          gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))',
                          gap:'8px',
                        }}>
                          {mediaArray.map((m, mi) => (
                            m?.type === 'video' ? (
                              <video
                                key={mi}
                                data-vid-key={`${l.id}_${mi}`}
                                src={`${m?.url}#t=0.001`}
                                crossOrigin="anonymous"
                                controls
                                playsInline
                                preload="metadata"
                                style={{
                                  width:'100%', borderRadius:'10px',
                                  maxHeight:'260px', objectFit:'contain',
                                  background:'#000', display:'block',
                                }}
                              />
                            ) : (
                              <img
                                key={mi}
                                src={m?.url}
                                alt={`첨부 사진 ${mi + 1}`}
                                crossOrigin="anonymous"
                                style={{
                                  width:'100%', borderRadius:'10px',
                                  objectFit:'cover', maxHeight:'260px', display:'block',
                                }}
                              />
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 액션 버튼 */}
                    <div style={{
                      padding:'12px 16px',
                      borderTop:'1px solid #F9FAFB',
                      display:'flex', gap:'8px',
                    }}>
                      <button onClick={()=>downloadPDF(i)} style={{
                        flex:1, padding:'9px 12px', borderRadius:'10px',
                        border:'1px solid #E5E7EB', background:'#F9FAFB',
                        fontSize:'12px', fontWeight:600, cursor:'pointer',
                        fontFamily:'inherit', color:'#374151',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
                        transition:'background 0.15s',
                      }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"
                          viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="12" y1="18" x2="12" y2="12"/>
                          <line x1="9" y1="15" x2="15" y2="15"/>
                        </svg>
                        PDF 저장
                      </button>
                      <button onClick={()=>copyLog(i)} style={{
                        flex:1, padding:'9px 12px', borderRadius:'10px',
                        border:'1px solid #E5E7EB', background:'#F9FAFB',
                        fontSize:'12px', fontWeight:600, cursor:'pointer',
                        fontFamily:'inherit', color:'#374151',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
                        transition:'background 0.15s',
                      }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"
                          viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        텍스트 복사
                      </button>
                    </div>

                    {/* ── 수업 평점 ── */}
                    {(() => {
                      const savedRating  = l.session_rating   // DB에 이미 저장된 값
                      const pendingRating = logRatings[l.id]  // 현재 선택 중인 값
                      const isSaving     = ratingSaving === l.id
                      const displayRating = pendingRating || savedRating || 0
                      return (
                        <div style={{
                          margin:'0 16px 16px',
                          background:'#F0FDF4',
                          border:'1px solid #A7F3D0',
                          borderRadius:'12px',
                          padding:'12px 14px',
                        }}>
                          <div style={{
                            fontSize:'11px', fontWeight:700, color:'#065f46',
                            marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px',
                          }}>
                            ⭐ 이번 수업 평점
                            {savedRating && !pendingRating && (
                              <span style={{
                                fontSize:'10px', fontWeight:600, padding:'1px 7px',
                                borderRadius:'20px', background:'#10B981', color:'#fff',
                              }}>저장됨 {savedRating}/5</span>
                            )}
                          </div>
                          <div style={{display:'flex', gap:'6px', marginBottom:'10px'}}>
                            {[1,2,3,4,5].map(n => (
                              <button
                                key={n}
                                onClick={() => setLogRatings(prev => ({ ...prev, [l.id]: n }))}
                                style={{
                                  flex:1, padding:'8px 0', borderRadius:'8px',
                                  fontSize:'14px', fontWeight:700, cursor:'pointer',
                                  fontFamily:'inherit', transition:'all 0.15s',
                                  border: displayRating === n
                                    ? '1.5px solid #10B981'
                                    : '1px solid #A7F3D0',
                                  background: displayRating === n ? '#10B981' : '#fff',
                                  color: displayRating === n ? '#fff' : '#6B7280',
                                  boxShadow: displayRating === n ? '0 2px 8px rgba(16,185,129,0.25)' : 'none',
                                  transform: displayRating === n ? 'scale(1.06)' : 'scale(1)',
                                }}>
                                {n}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => saveLogRating(l.id, pendingRating)}
                            disabled={!pendingRating || isSaving}
                            style={{
                              width:'100%', padding:'9px', borderRadius:'10px',
                              border:'none', fontSize:'12px', fontWeight:700,
                              cursor: pendingRating && !isSaving ? 'pointer' : 'not-allowed',
                              fontFamily:'inherit', transition:'all 0.2s',
                              background: pendingRating
                                ? 'linear-gradient(135deg,#10B981 0%,#059669 100%)'
                                : '#E5E7EB',
                              color: pendingRating ? '#fff' : '#9CA3AF',
                              opacity: pendingRating && !isSaving ? 1 : 0.6,
                              boxShadow: pendingRating ? '0 2px 8px rgba(16,185,129,0.30)' : 'none',
                            }}>
                            {isSaving ? '저장 중...' : pendingRating ? `${pendingRating}점으로 저장` : '점수를 선택해주세요'}
                          </button>
                        </div>
                      )
                    })()}

                  </div>
                )}
              </div>
            )
          })}

          {/* 더보기 */}
          {logsHasMore && (
            <button
              onClick={loadMoreLogs}
              disabled={logsLoading}
              style={{
                width:'100%', marginTop:'4px', padding:'13px',
                borderRadius:'12px', border:'1px solid #E5E7EB',
                background:'#F9FAFB', fontSize:'13px', fontWeight:600,
                color:'#374151', cursor:'pointer', fontFamily:'inherit',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              }}
            >
              {logsLoading
                ? <><span style={{animation:'spin 1s linear infinite',display:'inline-block'}}>⟳</span> 불러오는 중...</>
                : '↓ 이전 수업일지 더보기'}
            </button>
          )}
        </div>
      )}

      {/* ── 체중관리 ── */}
      {tab === 'health' && (
        <div className="m-page">
          {!member.target_weight && !member.start_weight && (
            <div style={{
              background:'#F0FDF4',border:'1px solid #A7F3D0',borderRadius:'12px',
              padding:'12px 14px',marginBottom:'16px',fontSize:'12px',color:'#065f46',fontWeight:500,
            }}>💡 아래 목표 설정에서 목표/시작 체중을 먼저 입력해주세요!</div>
          )}

          {/* 통계 카드 그리드 */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
            {[
              {icon:'🎯',label:'목표 체중',val:member.target_weight,unit:'kg',accent:false},
              {icon:'📌',label:'시작 체중',val:member.start_weight,unit:'kg',accent:false},
              {icon:'⚖️',label:'현재 공복',val:currentW,unit:'kg',accent:true},
              {icon:'📉',label:'총 감량',val:lost,unit:'kg',accent:true},
            ].map(({icon,label,val,unit,accent})=>(
              <div key={label} style={{
                background:'#fff',borderRadius:'16px',padding:'14px',
                boxShadow:'0 1px 3px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.04)',
                border: accent ? '1px solid #A7F3D0' : '1px solid #F3F4F6',
              }}>
                <div style={{fontSize:'20px',marginBottom:'6px'}}>{icon}</div>
                <div style={{
                  fontSize:'22px',fontWeight:800,lineHeight:1,
                  color: accent ? '#10B981' : '#111',
                }}>{val||'—'}<span style={{fontSize:'12px',fontWeight:500,color:'#9CA3AF',marginLeft:'3px'}}>{unit}</span></div>
                <div style={{fontSize:'10px',color:'#9CA3AF',marginTop:'4px'}}>{label}</div>
              </div>
            ))}
          </div>

          {/* 진행률 카드 */}
          <div style={{
            background:'#fff',borderRadius:'16px',padding:'16px',marginBottom:'14px',
            boxShadow:'0 1px 3px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.04)',
            border:'1px solid #F3F4F6',
          }}>
            {[
              {label:'감량률',val:lostPct,color:'#10B981'},
              {label:'목표 달성률',val:goalPct,color:goalPct>=100?'#10B981':'#10B981'},
            ].map(({label,val,color})=>(
              <div key={label} style={{marginBottom:'12px'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                  <span style={{fontSize:'12px',fontWeight:600,color:'#374151'}}>{label}</span>
                  <span style={{fontSize:'12px',fontWeight:700,color,fontFamily:"'DM Mono',monospace"}}>{val}%</span>
                </div>
                <div style={{height:'7px',background:'#F3F4F6',borderRadius:'4px',overflow:'hidden'}}>
                  <div style={{height:'100%',width:Math.min(100,val)+'%',background:'linear-gradient(90deg,#10B981,#059669)',borderRadius:'4px',transition:'width 0.5s ease'}}/>
                </div>
              </div>
            ))}
          </div>

          {/* 체중 추이 차트 */}
          <div style={{
            background:'#fff',borderRadius:'16px',padding:'16px',marginBottom:'14px',
            boxShadow:'0 1px 3px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.04)',
            border:'1px solid #F3F4F6',
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
              <span style={{fontSize:'13px',fontWeight:700,color:'#111'}}>체중 변화 추이</span>
              <span style={{fontSize:'11px',color:'#9CA3AF'}}>최근 14일 · 공복 체중</span>
            </div>
            <div style={{position:'relative',height:'200px'}}><canvas ref={chartRef}></canvas></div>
          </div>

          {/* 오늘 기록 입력 */}
          <div style={{
            fontSize:'11px',fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',marginBottom:'10px',
          }}>오늘 체중 기록</div>
          <div style={{
            background:'#fff',borderRadius:'16px',padding:'16px',marginBottom:'14px',
            boxShadow:'0 1px 3px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.04)',
            border:'1px solid #F3F4F6',
          }}>
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
            <div className="form-group" style={{marginBottom:'14px'}}><label>📅 날짜</label><input type="date" value={hDate} onChange={e=>setHDate(e.target.value)} /></div>
            <button onClick={saveHealthRecord} style={{
              width:'100%',padding:'12px',borderRadius:'12px',border:'none',
              background:'linear-gradient(135deg,#10B981,#059669)',color:'#fff',
              fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',
            }}>체중 기록 저장</button>
          </div>

          {/* 일별 기록 */}
          <div style={{fontSize:'11px',fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',marginBottom:'10px'}}>일별 기록</div>
          {healthRecords.filter(r=>r.morning_weight||r.evening_weight).slice(0,14).map(r => {
            const diff = (r.morning_weight&&r.evening_weight)?(r.evening_weight-r.morning_weight).toFixed(1):null
            return (
              <div key={r.id} style={{
                background:'#fff',borderRadius:'14px',padding:'13px 14px',marginBottom:'8px',
                boxShadow:'0 1px 3px rgba(0,0,0,0.05)',border:'1px solid #F3F4F6',
                display:'flex',alignItems:'center',justifyContent:'space-between',
              }}>
                <div style={{fontSize:'12px',fontWeight:600,color:'#374151',minWidth:'48px'}}>{formatDate(r.record_date)}</div>
                <div style={{display:'flex',gap:'12px',flex:1,justifyContent:'center'}}>
                  {[{v:r.morning_weight,l:'공복'},{v:r.evening_weight,l:'저녁'}].map(({v,l})=>(
                    <div key={l} style={{textAlign:'center'}}>
                      <div style={{fontSize:'14px',fontWeight:700,color:v?'#111':'#d1d5db'}}>{v||'—'}</div>
                      <div style={{fontSize:'9px',color:'#9CA3AF'}}>{l}</div>
                    </div>
                  ))}
                  {diff && (
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:'13px',fontWeight:700,color:parseFloat(diff)>0?'#ef4444':'#10B981'}}>{parseFloat(diff)>0?'+':''}{diff}</div>
                      <div style={{fontSize:'9px',color:'#9CA3AF'}}>증감</div>
                    </div>
                  )}
                </div>
                {r.sleep_level && (
                  <div style={{display:'flex',gap:'2px'}}>
                    {Array.from({length:10},(_,i)=>(
                      <div key={i} style={{
                        width:'5px',height:'14px',borderRadius:'2px',
                        background: i<r.sleep_level ? '#10B981' : '#E5E7EB',
                      }}/>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {!healthRecords.filter(r=>r.morning_weight||r.evening_weight).length && (
            <div style={{textAlign:'center',padding:'32px 20px',color:'#9CA3AF',background:'#F9FAFB',borderRadius:'16px',border:'1px dashed #E5E7EB'}}>
              <div style={{fontSize:'28px',marginBottom:'8px'}}>⚖️</div>
              <div style={{fontSize:'13px'}}>체중 기록이 없어요. 위에서 기록해보세요!</div>
            </div>
          )}

          {/* 목표 설정 */}
          <div style={{fontSize:'11px',fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',margin:'16px 0 10px'}}>목표 설정</div>
          <div style={{
            background:'#fff',borderRadius:'16px',padding:'16px',marginBottom:'14px',
            boxShadow:'0 1px 3px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.04)',
            border:'1px solid #F3F4F6',
          }}>
            <div className="two-col">
              <div className="form-group"><label>🎯 목표 체중 (kg)</label><input type="number" value={hTarget} onChange={e=>setHTarget(e.target.value)} placeholder="60" step="0.1" /></div>
              <div className="form-group"><label>📌 시작 체중 (kg)</label><input type="number" value={hStart} onChange={e=>setHStart(e.target.value)} placeholder="75" step="0.1" /></div>
            </div>
            <div className="two-col">
              <div className="form-group"><label>나이</label><input type="number" value={hAge} onChange={e=>setHAge(e.target.value)} placeholder="28" /></div>
              <div className="form-group"><label>키 (cm)</label><input type="number" value={hHeight} onChange={e=>setHHeight(e.target.value)} placeholder="165" step="0.1" /></div>
            </div>
            <div className="form-group" style={{marginBottom:'14px'}}><label>특이사항</label><input type="text" value={hSpecial} onChange={e=>setHSpecial(e.target.value)} placeholder="무릎 통증, 알레르기 등" /></div>
            <button onClick={saveProfile} style={{
              width:'100%',padding:'12px',borderRadius:'12px',border:'1px solid #E5E7EB',
              background:'#F9FAFB',fontSize:'14px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',color:'#374151',
            }}>목표 저장</button>
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
            <div style={{background:'#fff',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',padding:'14px 16px',marginBottom:'12px'}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label style={{color:'#10B981',fontWeight:700,fontSize:'12px'}}>📅 날짜</label>
                <input type="date" value={dietDate} onChange={e => setDietDate(e.target.value)} style={{borderColor:'#A7F3D0'}} />
              </div>
            </div>

            {/* 자주쓰는 식단 */}
            <div style={{background:'#fff',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'12px',padding:'14px 16px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#10B981',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'0.05em'}}>⚡ 자주쓰는 식단</div>
              {dietTemplates.length === 0 ? (
                <div style={{fontSize:'12px',color:'var(--m-text-dim)',padding:'4px 0'}}>
                  아직 저장된 식단이 없어요. 식사 항목을 추가한 뒤 <strong>💾 저장</strong> 버튼으로 등록하세요.
                </div>
              ) : (
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                  {dietTemplates.map(tpl => {
                    const totalCal = tpl.items.reduce((s, i) => s + (i.calories_per_g != null ? i.calories_per_g * i.amount_g : 0), 0)
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => openApplyTemplateModal(tpl)}
                        style={{
                          display:'flex',alignItems:'center',gap:'6px',
                          background:'#F0FDF4',border:'1.5px solid #A7F3D0',
                          borderRadius:'20px',padding:'6px 12px 6px 10px',
                          cursor:'pointer',userSelect:'none',
                        }}
                      >
                        <span style={{fontSize:'12px',fontWeight:700,color:'#065F46'}}>{tpl.name}</span>
                        {totalCal > 0 && <span style={{fontSize:'10px',color:'#10B981',fontWeight:700}}>{totalCal.toFixed(0)}kcal</span>}
                        <span style={{fontSize:'10px',color:'#6EE7B7',marginLeft:'2px'}}>{tpl.items.length}가지</span>
                        <button
                          onClick={e => deleteTemplate(tpl.id, e)}
                          style={{background:'none',border:'none',color:'#A7F3D0',fontSize:'13px',cursor:'pointer',padding:'0 0 0 4px',lineHeight:1}}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 일일 영양소 요약 */}
            {hasMacros && (
              <div style={{background:'#fff',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'14px',padding:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'#10B981',marginBottom:'12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>🔥 오늘 총 섭취</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
                  {[
                    { label:'칼로리', val: totalCal.toFixed(0), unit:'kcal', color:'#f97316', bg:'#fff7ed' },
                    { label:'단백질', val: totalProt.toFixed(1), unit:'g', color:'#3b82f6', bg:'#eff6ff' },
                    { label:'탄수화물', val: totalCarb.toFixed(1), unit:'g', color:'#eab308', bg:'#fefce8' },
                    { label:'지방',   val: totalFat.toFixed(1), unit:'g', color:'#ef4444', bg:'#fef2f2' },
                  ].map(n => (
                    <div key={n.label} style={{textAlign:'center',background:n.bg,borderRadius:'12px',padding:'10px 4px',border:`1px solid ${n.color}22`}}>
                      <div style={{fontSize:'16px',fontWeight:800,color:n.color,lineHeight:1}}>{n.val}</div>
                      <div style={{fontSize:'9px',color:n.color,opacity:0.7,marginTop:'2px'}}>{n.unit}</div>
                      <div style={{fontSize:'9px',color:'var(--m-text-muted)',marginTop:'2px'}}>{n.label}</div>
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
                      <div style={{display:'flex',borderRadius:'8px',overflow:'hidden',height:'9px',gap:'2px'}}>
                        <div style={{flex:pProt,background:'#3b82f6',minWidth:pProt>0?'2px':0,borderRadius:'4px'}} />
                        <div style={{flex:pCarb,background:'#eab308',minWidth:pCarb>0?'2px':0,borderRadius:'4px'}} />
                        <div style={{flex:pFat, background:'#ef4444',minWidth:pFat>0?'2px':0,borderRadius:'4px'}} />
                      </div>
                      <div style={{display:'flex',gap:'10px',marginTop:'6px',fontSize:'10px',color:'var(--m-text-dim)'}}>
                        <span style={{color:'#3b82f6',fontWeight:600}}>● 단백질 {pProt}%</span>
                        <span style={{color:'#eab308',fontWeight:600}}>● 탄수 {pCarb}%</span>
                        <span style={{color:'#ef4444',fontWeight:600}}>● 지방 {pFat}%</span>
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
                <div key={key} style={{background:'#fff',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'12px',padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{fontSize:'14px',fontWeight:700,color:'#111'}}>{label}</span>
                      {cal > 0 && <span style={{fontSize:'11px',color:'#10B981',fontWeight:700,background:'#F0FDF4',padding:'2px 8px',borderRadius:'10px'}}>{cal.toFixed(0)} kcal</span>}
                    </div>
                    <div style={{display:'flex',gap:'6px'}}>
                      <button
                        onClick={() => openSaveTemplateModal(key)}
                        style={{background:'none',color:'#10B981',border:'1.5px solid #A7F3D0',borderRadius:'8px',padding:'5px 10px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}
                        title="이 식사를 자주쓰는 식단으로 저장"
                      >💾 저장</button>
                      <button
                        onClick={() => openFoodModal(key)}
                        style={{background:'linear-gradient(135deg,#10B981,#059669)',color:'#fff',border:'none',borderRadius:'8px',padding:'5px 14px',fontSize:'12px',fontWeight:700,cursor:'pointer'}}
                      >+ 추가</button>
                    </div>
                  </div>
                  {!items.length && (
                    <div style={{fontSize:'12px',color:'var(--m-text-dim)',padding:'10px 0',textAlign:'center'}}>아직 기록이 없어요 🍽️</div>
                  )}
                  {items.map(item => {
                    const cal   = item.calories_per_g != null ? (item.calories_per_g * item.amount_g).toFixed(0) : null
                    const prot  = item.protein_per_g  != null ? (item.protein_per_g  * item.amount_g).toFixed(1) : null
                    const carb  = item.carbs_per_g    != null ? (item.carbs_per_g    * item.amount_g).toFixed(1) : null
                    const fat   = item.fat_per_g      != null ? (item.fat_per_g      * item.amount_g).toFixed(1) : null
                    return (
                      <div key={item.id} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'10px 0',borderTop:'1px solid #F0FDF4'}}>
                        {item.photo_url && (
                          <img src={item.photo_url} alt={item.food_name} crossOrigin="anonymous" style={{width:'48px',height:'48px',objectFit:'cover',borderRadius:'10px',flexShrink:0}} />
                        )}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'3px'}}>
                            <span style={{fontSize:'13px',fontWeight:600,color:'#111'}}>{item.food_name}</span>
                            {item.ai_recognized && <span style={{fontSize:'9px',background:'#F0FDF4',color:'#059669',borderRadius:'4px',padding:'1px 5px',fontWeight:700}}>AI</span>}
                          </div>
                          <div style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{item.amount_g}g</div>
                          {(cal || prot || carb || fat) && (
                            <div style={{fontSize:'11px',color:'var(--m-text-muted)',marginTop:'3px',display:'flex',gap:'8px',flexWrap:'wrap'}}>
                              {cal  && <span style={{color:'#f97316',fontWeight:600}}>{cal} kcal</span>}
                              {prot && <span style={{color:'#3b82f6'}}>단백질 {prot}g</span>}
                              {carb && <span style={{color:'#eab308'}}>탄수 {carb}g</span>}
                              {fat  && <span style={{color:'#ef4444'}}>지방 {fat}g</span>}
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

            {/* 식단 저장 모달 */}
            {showSaveTemplateModal && (
              <Modal open={true} onClose={() => setShowSaveTemplateModal(false)}>
                <div style={{padding:'4px 0'}}>
                  <div style={{fontSize:'16px',fontWeight:800,marginBottom:'6px'}}>💾 자주쓰는 식단으로 저장</div>
                  <div style={{fontSize:'12px',color:'var(--m-text-dim)',marginBottom:'16px'}}>
                    {{ breakfast:'🍳 아침', lunch:'🍱 점심', dinner:'🍽️ 저녁', snack:'🧃 간식' }[saveTemplateMealType]} 식단 항목 {dietLogs.filter(i => i.meal_type === saveTemplateMealType).length}가지를 저장합니다
                  </div>

                  {/* 저장할 항목 미리보기 */}
                  <div style={{background:'#f8f8f6',borderRadius:'10px',padding:'10px 12px',marginBottom:'14px'}}>
                    {dietLogs.filter(i => i.meal_type === saveTemplateMealType).map(item => {
                      const cal = item.calories_per_g != null ? (item.calories_per_g * item.amount_g).toFixed(0) : null
                      return (
                        <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:'1px solid #eee'}}>
                          <span style={{fontSize:'13px',fontWeight:600}}>{item.food_name}</span>
                          <span style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{item.amount_g}g {cal && <span style={{color:'#f97316'}}>{cal}kcal</span>}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="form-group" style={{marginBottom:'16px'}}>
                    <label>저장 이름</label>
                    <input
                      type="text"
                      value={saveTemplateName}
                      onChange={e => setSaveTemplateName(e.target.value)}
                      placeholder="예: 다이어트 아침, 벌크업 점심"
                      autoFocus
                    />
                  </div>

                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-outline" style={{flex:1}} onClick={() => setShowSaveTemplateModal(false)}>취소</button>
                    <button className="btn btn-primary" style={{flex:2,opacity:savingTemplate?0.55:1,cursor:savingTemplate?'not-allowed':'pointer'}} disabled={savingTemplate} onClick={saveCurrentMealAsTemplate}>{savingTemplate ? '저장 중…' : '저장'}</button>
                  </div>
                </div>
              </Modal>
            )}

            {/* 식단 적용 모달 */}
            {showApplyTemplateModal && selectedTemplate && (
              <Modal open={true} onClose={() => { setShowApplyTemplateModal(false); setSelectedTemplate(null) }}>
                <div style={{padding:'4px 0'}}>
                  <div style={{fontSize:'16px',fontWeight:800,marginBottom:'4px'}}>⚡ {selectedTemplate.name}</div>
                  <div style={{fontSize:'12px',color:'var(--m-text-dim)',marginBottom:'14px'}}>
                    {selectedTemplate.items.length}가지 · 사용 {selectedTemplate.used_count}회
                  </div>

                  {/* 항목 목록 */}
                  <div style={{background:'#f8f8f6',borderRadius:'10px',padding:'10px 12px',marginBottom:'14px'}}>
                    {selectedTemplate.items.map((item, idx) => {
                      const cal = item.calories_per_g != null ? (item.calories_per_g * item.amount_g).toFixed(0) : null
                      const prot = item.protein_per_g != null ? (item.protein_per_g * item.amount_g).toFixed(1) : null
                      return (
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid #eee'}}>
                          <div>
                            <div style={{fontSize:'13px',fontWeight:600,color:'#111'}}>{item.food_name}</div>
                            <div style={{fontSize:'11px',color:'var(--m-text-dim)'}}>{item.amount_g}g</div>
                          </div>
                          <div style={{textAlign:'right',fontSize:'11px'}}>
                            {cal && <div style={{color:'#f97316',fontWeight:600}}>{cal} kcal</div>}
                            {prot && <div style={{color:'var(--m-text-dim)'}}>단백질 {prot}g</div>}
                          </div>
                        </div>
                      )
                    })}
                    {(() => {
                      const total = selectedTemplate.items.reduce((s,i) => s + (i.calories_per_g != null ? i.calories_per_g * i.amount_g : 0), 0)
                      return total > 0 ? (
                        <div style={{display:'flex',justifyContent:'flex-end',paddingTop:'8px',fontSize:'12px',fontWeight:700,color:'#f97316'}}>
                          합계 {total.toFixed(0)} kcal
                        </div>
                      ) : null
                    })()}
                  </div>

                  {/* 적용할 식사 선택 */}
                  <div className="form-group" style={{marginBottom:'16px'}}>
                    <label>적용할 식사</label>
                    <select value={applyTemplateMealType} onChange={e => setApplyTemplateMealType(e.target.value)}>
                      <option value="breakfast">🍳 아침</option>
                      <option value="lunch">🍱 점심</option>
                      <option value="dinner">🍽️ 저녁</option>
                      <option value="snack">🧃 간식</option>
                    </select>
                  </div>

                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-outline" style={{flex:1}} onClick={() => { setShowApplyTemplateModal(false); setSelectedTemplate(null) }}>취소</button>
                    <button className="btn btn-primary" style={{flex:2,opacity:applyingTemplate?0.55:1,cursor:applyingTemplate?'not-allowed':'pointer'}} disabled={applyingTemplate} onClick={applyTemplate}>
                      {applyingTemplate ? '적용 중…' : (dietDate === today() ? '오늘 식단에 적용' : `${formatDate(dietDate)}에 적용`)}
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            {/* 음식 추가 모달 */}
            {showFoodModal && (
              <Modal open={true} onClose={() => setShowFoodModal(false)}>
                <div style={{padding:'4px 0'}}>
                  <div style={{fontSize:'16px',fontWeight:800,marginBottom:'16px'}}>
                    {{'breakfast':'🍳 아침','lunch':'🍱 점심','dinner':'🍽️ 저녁','snack':'🧃 간식'}[foodForm.mealType]} 음식 추가
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
                        setFoodForm(p => ({ ...p, photoFile: f, photoPreview: URL.createObjectURL(f) }))
                        recognizeFoodFromPhoto(f)
                      }}
                    />
                    {!foodForm.photoPreview ? (
                      <button
                        onClick={() => foodPhotoInputRef.current?.click()}
                        style={{width:'100%',padding:'14px',border:'2px dashed #ddd',borderRadius:'12px',background:'none',cursor:'pointer',color:'var(--m-text-dim)',fontSize:'13px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}
                      >
                        📸 사진으로 자동 인식
                      </button>
                    ) : (
                      <div style={{position:'relative',marginBottom:'8px'}}>
                        <img src={foodForm.photoPreview} alt="food" crossOrigin="anonymous" style={{width:'100%',maxHeight:'160px',objectFit:'cover',borderRadius:'12px'}} />
                        {foodForm.aiLoading && (
                          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.55)',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'13px',gap:'8px'}}>
                            <span style={{fontSize:'20px',animation:'spin 1s linear infinite',display:'inline-block'}}>⟳</span> AI 분석 중...
                          </div>
                        )}
                        {foodForm.aiConfidence && !foodForm.aiLoading && (
                          <div style={{position:'absolute',top:'8px',right:'8px',background:'rgba(56,142,60,0.9)',color:'#fff',borderRadius:'8px',padding:'2px 8px',fontSize:'11px'}}>
                            {{'high':'정확도 높음','medium':'정확도 보통','low':'정확도 낮음'}[foodForm.aiConfidence] || foodForm.aiConfidence}
                          </div>
                        )}
                        <button
                          onClick={() => setFoodForm(p => ({ ...p, photoFile: null, photoPreview: '', aiConfidence: '' }))}
                          style={{position:'absolute',top:'8px',left:'8px',background:'rgba(0,0,0,0.5)',border:'none',color:'#fff',borderRadius:'6px',width:'24px',height:'24px',cursor:'pointer',fontSize:'14px'}}
                        >×</button>
                      </div>
                    )}
                  </div>

                  {/* 음식 이름 + 양 */}
                  <div className="two-col" style={{marginBottom:'10px'}}>
                    <div className="form-group" style={{marginBottom:0,position:'relative'}}>
                      <label>음식 이름</label>
                      <input
                        type="text"
                        value={foodForm.name}
                        onChange={e => onFoodNameChange(e.target.value)}
                        onBlur={() => setTimeout(() => setShowFoodSuggestions(false), 150)}
                        onFocus={() => foodSuggestions.length && setShowFoodSuggestions(true)}
                        placeholder="닭가슴살 샐러드"
                        autoComplete="off"
                      />
                      {showFoodSuggestions && (
                        <div style={{
                          position:'absolute', top:'100%', left:0, right:0, zIndex:999,
                          background:'#fff', border:'1px solid #e5e5e5', borderRadius:'10px',
                          boxShadow:'0 4px 16px rgba(0,0,0,0.12)', maxHeight:'220px',
                          overflowY:'auto', marginTop:'4px',
                        }}>
                          {foodSuggestions.map(item => (
                            <div
                              key={item.id}
                              onMouseDown={() => selectFoodSuggestion(item)}
                              style={{
                                padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #f5f5f5',
                                display:'flex', justifyContent:'space-between', alignItems:'center',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background='#f8f8f6'}
                              onMouseLeave={e => e.currentTarget.style.background='#fff'}
                            >
                              <div>
                                <div style={{fontSize:'13px',fontWeight:600,color:'#111'}}>{item.food_name}</div>
                                {item.food_category && <div style={{fontSize:'10px',color:'#aaa',marginTop:'1px'}}>{item.food_category}</div>}
                              </div>
                              {item.calories_per_g != null && (
                                <div style={{fontSize:'11px',color:'#f97316',fontWeight:600,flexShrink:0,marginLeft:'8px'}}>
                                  {(item.calories_per_g * 100).toFixed(0)} kcal
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>섭취량 (g)</label>
                      <input type="number" value={foodForm.amountG} onChange={e=>setFoodForm(p=>({...p,amountG:e.target.value}))} placeholder="100" min="1" />
                    </div>
                  </div>

                  {/* 영양소 (g당 값으로 저장, 표시는 100g당) */}
                  <div style={{fontSize:'11px',color:'var(--m-text-dim)',marginBottom:'6px',fontWeight:600}}>
                    영양소 (100g 기준 — AI가 자동 입력, 수정 가능)
                  </div>
                  <div className="two-col" style={{marginBottom:'6px'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>칼로리 (kcal)</label>
                      <input type="number" value={foodForm.calPerG !== '' ? (parseFloat(foodForm.calPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodForm(p=>({...p,calPerG:e.target.value ? String(parseFloat(e.target.value)/100) : ''}))}
                        placeholder="150" step="0.1" min="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>단백질 (g)</label>
                      <input type="number" value={foodForm.proteinPerG !== '' ? (parseFloat(foodForm.proteinPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodForm(p=>({...p,proteinPerG:e.target.value ? String(parseFloat(e.target.value)/100) : ''}))}
                        placeholder="20" step="0.1" min="0" />
                    </div>
                  </div>
                  <div className="two-col" style={{marginBottom:'6px'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>탄수화물 (g)</label>
                      <input type="number" value={foodForm.carbsPerG !== '' ? (parseFloat(foodForm.carbsPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodForm(p=>({...p,carbsPerG:e.target.value ? String(parseFloat(e.target.value)/100) : ''}))}
                        placeholder="10" step="0.1" min="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>지방 (g)</label>
                      <input type="number" value={foodForm.fatPerG !== '' ? (parseFloat(foodForm.fatPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodForm(p=>({...p,fatPerG:e.target.value ? String(parseFloat(e.target.value)/100) : ''}))}
                        placeholder="5" step="0.1" min="0" />
                    </div>
                  </div>
                  <div className="two-col" style={{marginBottom:'6px'}}>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>식이섬유 (g)</label>
                      <input type="number" value={foodForm.fiberPerG !== '' ? (parseFloat(foodForm.fiberPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodForm(p=>({...p,fiberPerG:e.target.value ? String(parseFloat(e.target.value)/100) : ''}))}
                        placeholder="2" step="0.1" min="0" />
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label>당류 (g)</label>
                      <input type="number" value={foodForm.sugarPerG !== '' ? (parseFloat(foodForm.sugarPerG)*100).toFixed(1) : ''}
                        onChange={e=>setFoodForm(p=>({...p,sugarPerG:e.target.value ? String(parseFloat(e.target.value)/100) : ''}))}
                        placeholder="3" step="0.1" min="0" />
                    </div>
                  </div>
                  <div className="form-group" style={{marginBottom:'14px'}}>
                    <label>나트륨 (mg)</label>
                    <input type="number" value={foodForm.sodiumPerG !== '' ? (parseFloat(foodForm.sodiumPerG)*100).toFixed(0) : ''}
                      onChange={e=>setFoodForm(p=>({...p,sodiumPerG:e.target.value ? String(parseFloat(e.target.value)/100) : ''}))}
                      placeholder="300" step="1" min="0" />
                  </div>

                  {/* 실시간 계산 미리보기 */}
                  {foodForm.calPerG && foodForm.amountG && (
                    <div style={{background:'#f8f8f6',borderRadius:'10px',padding:'10px 12px',marginBottom:'14px',fontSize:'12px'}}>
                      <div style={{fontWeight:700,marginBottom:'4px',color:'#111'}}>📊 {foodForm.amountG}g 기준 계산값</div>
                      <div style={{display:'flex',gap:'12px',flexWrap:'wrap',color:'var(--m-text-muted)'}}>
                        {foodForm.calPerG     && <span style={{color:'#f97316'}}>{(parseFloat(foodForm.calPerG)*parseFloat(foodForm.amountG)).toFixed(0)} kcal</span>}
                        {foodForm.proteinPerG && <span>단백질 {(parseFloat(foodForm.proteinPerG)*parseFloat(foodForm.amountG)).toFixed(1)}g</span>}
                        {foodForm.carbsPerG   && <span>탄수 {(parseFloat(foodForm.carbsPerG)*parseFloat(foodForm.amountG)).toFixed(1)}g</span>}
                        {foodForm.fatPerG     && <span>지방 {(parseFloat(foodForm.fatPerG)*parseFloat(foodForm.amountG)).toFixed(1)}g</span>}
                      </div>
                    </div>
                  )}

                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-outline" style={{flex:1}} onClick={() => setShowFoodModal(false)}>취소</button>
                    <button className="btn btn-primary" style={{flex:2}} onClick={addFoodItem} disabled={foodForm.aiLoading}>
                      {foodForm.aiLoading ? 'AI 분석 중...' : '추가'}
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
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'14px'}}>
              {[
                ['이번 달 운동', monthSessions.length+'회', '#10B981', '#F0FDF4', '#A7F3D0'],
                ['총 볼륨', monthVolume>=1000?(monthVolume/1000).toFixed(1)+'t':Math.round(monthVolume)+'kg', '#10B981', '#F0FDF4', '#A7F3D0'],
                ['전체 기록', workoutSessions.length+'회', '#6b7280', '#f9fafb', '#e5e7eb'],
              ].map(([label,val,color,bg,border])=>(
                <div key={label} style={{background:bg,borderRadius:'14px',padding:'12px',border:`1px solid ${border}`,boxShadow:'0 1px 6px rgba(0,0,0,0.04)'}}>
                  <div style={{fontSize:'10px',color:'#6b7280',marginBottom:'5px',fontWeight:600}}>{label}</div>
                  <div style={{fontSize:'17px',fontWeight:800,fontFamily:"'DM Mono',monospace",color}}>{val}</div>
                </div>
              ))}
            </div>
            {/* 버튼 */}
            <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
              {workoutRoutines.length > 0 && (
                <button style={{flex:1,padding:'10px',border:'1.5px solid #A7F3D0',borderRadius:'12px',background:'#fff',color:'#10B981',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}} onClick={()=>setWorkoutRoutineModal(true)}>📋 루틴 불러오기</button>
              )}
              <button style={{flex:1,padding:'10px',border:'none',borderRadius:'12px',background:'linear-gradient(135deg,#10B981,#059669)',color:'#fff',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 2px 8px rgba(16,185,129,0.3)'}} onClick={()=>openWorkoutModal()}>+ 운동 기록</button>
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
                <div key={s.id} style={{background:'#fff',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'12px',padding:'14px 16px',cursor:'pointer',border:'1px solid #f0f0f0'}} onClick={()=>setWorkoutDetailId(isOpen?null:s.id)}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'5px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'14px',fontWeight:700,color:'#111'}}>{s.title||'운동'}</span>
                        <span style={{fontSize:'11px',color:'#6b7280',background:'#f3f4f6',padding:'1px 7px',borderRadius:'6px'}}>{dateStr}</span>
                        {s.duration_min && <span style={{fontSize:'11px',color:'#6b7280',background:'#f3f4f6',padding:'1px 7px',borderRadius:'6px'}}>⏱ {s.duration_min}분</span>}
                      </div>
                      <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'5px'}}>
                        {muscles.map(mg=>(
                          <span key={mg} style={{fontSize:'10px',padding:'2px 8px',borderRadius:'6px',background:(MUSCLE_COLOR[mg]||'#6b7280')+'22',color:MUSCLE_COLOR[mg]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[mg]||'#6b7280')}44`,fontWeight:600}}>{mg}</span>
                        ))}
                      </div>
                      <div style={{fontSize:'12px',color:'#10B981',fontWeight:600}}>운동 {exList.length}종목 · 총 볼륨 {vol>=1000?(vol/1000).toFixed(1)+'t':Math.round(vol)+'kg'}</div>
                    </div>
                    <span style={{color:'#10B981',fontSize:'13px',flexShrink:0,marginTop:'2px',transition:'transform 0.2s',transform:isOpen?'rotate(180deg)':'rotate(0deg)'}}>▼</span>
                  </div>
                  {isOpen && (
                    <div style={{marginTop:'14px',borderTop:'1px solid #F0FDF4',paddingTop:'14px'}} onClick={e=>e.stopPropagation()}>
                      <MuscleDiagram primary={allPrimary} secondary={allSecondary} />
                      {exList.map((ex,ei)=>{
                        const exVol = ex.sets.reduce((s,set)=>s+((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)),0)
                        const dbEx = EXERCISE_DB.find(d => d.name === ex.name)
                        return (
                          <div key={ei} style={{marginBottom:'12px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                              <span style={{fontSize:'13px',fontWeight:700,color:'#111'}}>{ex.name}</span>
                              {ex.muscle_group && <span style={{fontSize:'10px',padding:'2px 8px',borderRadius:'6px',background:(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')+'22',color:MUSCLE_COLOR[ex.muscle_group]||'#6b7280',border:`1px solid ${(MUSCLE_COLOR[ex.muscle_group]||'#6b7280')}44`,fontWeight:600}}>{ex.muscle_group}</span>}
                              {dbEx && <span style={{fontSize:'10px',color:'#aaa'}}>장비: {dbEx.eq}</span>}
                              <span style={{fontSize:'11px',color:'#10B981',fontWeight:600,marginLeft:'auto'}}>볼륨 {Math.round(exVol)}kg</span>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:'6px'}}>
                              {ex.sets.map((set,si)=>(
                                <div key={si} style={{background:'#F0FDF4',borderRadius:'10px',padding:'8px',fontSize:'12px',textAlign:'center',border:'1px solid #A7F3D0'}}>
                                  <div style={{color:'#10B981',fontSize:'10px',fontWeight:700,marginBottom:'3px'}}>{si+1}세트</div>
                                  <div style={{fontWeight:700,fontFamily:"'DM Mono',monospace",color:'#111'}}>{set.weight||'—'}kg × {set.reps||'—'}회</div>
                                  {set.rest_sec && <div style={{color:'#6b7280',fontSize:'10px',marginTop:'2px'}}>휴식 {set.rest_sec}초</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {s.memo && <div style={{marginTop:'10px',fontSize:'12px',color:'#555',padding:'10px 12px',background:'#F0FDF4',borderRadius:'10px',borderLeft:'3px solid #10B981'}}>💬 {s.memo}</div>}
                      <div style={{display:'flex',gap:'8px',marginTop:'14px'}}>
                        <button style={{flex:1,padding:'9px',border:'1.5px solid #A7F3D0',borderRadius:'10px',background:'#fff',color:'#10B981',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}} onClick={()=>openWorkoutModal(s)}>✏️ 수정</button>
                        <button style={{flex:1,padding:'9px',border:'1.5px solid #fecaca',borderRadius:'10px',background:'#fff',color:'#ef4444',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}} onClick={()=>deleteWorkoutSession(s.id)}>삭제</button>
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
          {/* 헤더 */}
          <div style={{marginBottom:'14px'}}>
            <div style={{fontSize:'18px',fontWeight:800,color:'#111'}}>🤝 커뮤니티</div>
            <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>트레이너 공지 및 회원 자유 게시판</div>
          </div>

          {/* 서브 탭 */}
          <div style={{display:'flex',gap:'0',marginBottom:'16px',background:'#F0FDF4',borderRadius:'12px',padding:'4px',border:'1px solid #A7F3D0'}}>
            {[['notice','📢 공지사항'],['free','💬 자유게시판']].map(([key,label])=>(
              <button key={key} onClick={()=>setCommunityTab(key)}
                style={{flex:1,padding:'9px 0',border:'none',borderRadius:'9px',cursor:'pointer',fontSize:'13px',fontWeight:700,fontFamily:'inherit',transition:'all 0.15s',
                  background: communityTab===key ? '#fff' : 'transparent',
                  color: communityTab===key ? '#10B981' : '#6b7280',
                  boxShadow: communityTab===key ? '0 2px 8px rgba(16,185,129,0.15)' : 'none'}}>
                {label}
              </button>
            ))}
          </div>

          {/* ── 공지사항 탭 ── */}
          {communityTab === 'notice' && (
            <div>
              {!notices.length && (
                <div className="empty">
                  <div style={{fontSize:'32px',marginBottom:'12px'}}>📢</div>
                  <p>등록된 공지사항이 없어요</p>
                </div>
              )}
              {notices.map(notice => (
                <div key={notice.id} style={{background:'#fff',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'12px',padding:'16px',borderLeft: notice.is_pinned ? '4px solid #10B981' : '4px solid transparent'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
                      {notice.is_pinned && <span style={{fontSize:'10px',padding:'2px 8px',background:'#F0FDF4',color:'#10B981',borderRadius:'6px',fontWeight:700,flexShrink:0,border:'1px solid #A7F3D0'}}>📌 고정</span>}
                      <div style={{fontSize:'14px',fontWeight:700,color:'#1a1a1a',wordBreak:'break-word'}}>{notice.title}</div>
                    </div>
                    <p style={{fontSize:'13px',lineHeight:'1.7',margin:'0 0 10px',color:'#444',wordBreak:'break-word',whiteSpace:'pre-wrap'}}>{notice.content}</p>
                    <div style={{fontSize:'11px',color:'#6b7280',display:'flex',alignItems:'center',gap:'4px'}}>
                      <span>{notice.author_name}</span>
                      <span>·</span>
                      <span>{formatRelative(notice.created_at)}</span>
                      {notice.updated_at !== notice.created_at && <span style={{color:'#10B981'}}>· 수정됨</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 자유게시판 탭 ── */}
          {communityTab === 'free' && (
            <div>
              <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'14px'}}>
                {member.trainer_id && (
                  <button
                    onClick={()=>setPostModal(true)}
                    style={{padding:'9px 18px',border:'none',borderRadius:'12px',background:'linear-gradient(135deg,#10B981,#059669)',color:'#fff',fontSize:'13px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 2px 8px rgba(16,185,129,0.3)'}}
                  >+ 글쓰기</button>
                )}
              </div>
              {!member.trainer_id && (
                <div className="empty">커뮤니티는 트레이너에게 등록된 회원만 이용할 수 있어요.</div>
              )}
              {member.trainer_id && !posts.length && (
                <div className="empty"><div style={{fontSize:'32px',marginBottom:'12px'}}>💬</div><p>아직 게시물이 없어요</p><p style={{fontSize:'12px',marginTop:'4px'}}>첫 번째 게시물을 올려보세요!</p></div>
              )}
              {posts.map(post => {
                const counts = reactionCounts[post.id] || {}
                const mine = myReactions[post.id] || new Set()
                const totalReactions = Object.values(counts).reduce((a,b)=>a+b,0)
                return (
                  <div key={post.id} style={{background:'#fff',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'14px',padding:'16px',border:'1px solid #f0f0f0'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
                      <div style={{width:'38px',height:'38px',borderRadius:'50%',background:'linear-gradient(135deg,#10B981,#059669)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'15px',fontWeight:800,flexShrink:0,boxShadow:'0 2px 6px rgba(16,185,129,0.3)'}}>
                        {(post.member_name||'?')[0]}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:700,color:'#111'}}>{post.member_name||'회원'}</div>
                        <div style={{fontSize:'11px',color:'#6b7280'}}>{formatRelative(post.created_at)}</div>
                      </div>
                      {post.member_id === member.id && (
                        <button onClick={()=>deletePost(post.id)} style={{background:'none',border:'none',color:'#d1d5db',cursor:'pointer',fontSize:'18px',padding:'2px 6px',lineHeight:1}}>×</button>
                      )}
                    </div>
                    {post.content && <p style={{fontSize:'14px',lineHeight:'1.7',margin:'0 0 12px',color:'#333',wordBreak:'break-word'}}>{post.content}</p>}
                    {post.photo_url && (
                      <img src={post.photo_url} alt="첨부 사진" crossOrigin="anonymous" style={{width:'100%',borderRadius:'12px',objectFit:'cover',maxHeight:'340px',marginBottom:'12px',display:'block'}} />
                    )}
                    {totalReactions > 0 && (
                      <div style={{fontSize:'12px',color:'#6b7280',marginBottom:'10px',display:'flex',flexWrap:'wrap',gap:'6px'}}>
                        {REACTIONS.filter(r=>counts[r]>0).map(r=>(
                          <span key={r} style={{background:'#F0FDF4',padding:'2px 8px',borderRadius:'10px',color:'#059669',fontWeight:600}}>{r} {counts[r]}</span>
                        ))}
                      </div>
                    )}
                    <div style={{display:'flex',flexWrap:'wrap',gap:'6px',borderTop:'1px solid #F0FDF4',paddingTop:'12px'}}>
                      {REACTIONS.map(r => (
                        <button key={r} onClick={()=>toggleReaction(post.id, r)}
                          style={{padding:'6px 11px',borderRadius:'20px',border:'1.5px solid',fontSize:'13px',cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                            background: mine.has(r) ? '#F0FDF4' : '#fafafa',
                            borderColor: mine.has(r) ? '#10B981' : '#e5e7eb',
                            fontWeight: mine.has(r) ? 700 : 400,
                            transform: mine.has(r) ? 'scale(1.08)' : 'scale(1)'}}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
        <button className="btn btn-primary" style={{width:'100%',opacity:savingWorkout?0.55:1,cursor:savingWorkout?'not-allowed':'pointer'}} disabled={savingWorkout} onClick={saveWorkoutSession}>{savingWorkout ? '저장 중…' : (workoutEditId?'수정 완료':'기록 완료')}</button>
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
        <button className="btn btn-primary" style={{width:'100%',opacity:creatingPost?0.55:1,cursor:creatingPost?'not-allowed':'pointer'}} disabled={creatingPost} onClick={createPost}>{creatingPost ? '게시 중…' : '게시하기'}</button>
      </Modal>
    </div>
  )
}
