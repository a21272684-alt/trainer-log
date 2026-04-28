import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import {
  COMMUNITY_ACCESS,
  ROLE_META,
  PHOTO_REQUIRED_ROLES,
  PROFESSIONAL_ROLES,
  getViewableCategories,
  getWritableCategories,
} from '../lib/permissions'
import {
  publishRoutineTemplate,
  getRoutineTemplate,
  makeEmptyWeek,
  makeEmptyDay,
  ROUTINE_GOALS,
  ROUTINE_LEVELS,
  weeksToPreviewDay,
} from '../lib/routineTemplates'
import RoutineTemplateBuilder from '../components/community/RoutineTemplateBuilder'
import RoutineTemplateViewer from '../components/community/RoutineTemplateViewer'
import ApplyRoutineModal from '../components/community/ApplyRoutineModal'
import { buildRoutineAnalysisPrompt, callGemini } from '../lib/ai_templates'
import '../styles/community.css'

/* ============================================================
   카테고리 & 역할 권한 — src/lib/permissions.js 에서 중앙 관리
   ┌─────────────────────┬──────────────────────────┬──────────────────────┐
   │ 카테고리             │ view                     │ write                │
   ├─────────────────────┼──────────────────────────┼──────────────────────┤
   │ 레슨 회원 모집       │ 전체                     │ trainer              │
   │ 트레이너 찾기        │ member, trainer, owner   │ member               │
   │ 수강생 구인(교육)    │ 전체                     │ educator, instructor │
   │ 트레이너 채용        │ gym_owner, trainer       │ gym_owner            │
   │ 센터 구직            │ gym_owner                │ trainer              │
   │ 센터 제휴·협력       │ gym_owner                │ gym_owner            │
   │ 교육 과정 홍보       │ trainer, educator, owner │ educator, instructor │
   └─────────────────────┴──────────────────────────┴──────────────────────┘
   ============================================================ */
// permissions.js 에서 COMMUNITY_ACCESS, ROLE_META, PHOTO_REQUIRED_ROLES,
// PROFESSIONAL_ROLES, getViewableCategories, getWritableCategories 를 import
// (파일 상단 참고)

// 하위 호환 별칭 (기존 코드 참조 방식 유지)
const CATEGORIES = COMMUNITY_ACCESS
const ROLES = ROLE_META

// roles: string | string[] 모두 수용 — admin extra_roles 지원
function getVisibleCats(roleOrRoles) {
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  return Object.entries(COMMUNITY_ACCESS)
    .filter(([, cfg]) => roles.some(r => cfg.view.includes(r)))
    .map(([key]) => key)
}
function getWritableCats(roleOrRoles) {
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  return Object.entries(COMMUNITY_ACCESS)
    .filter(([, cfg]) => roles.some(r => cfg.write.includes(r)))
    .map(([key]) => key)
}

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

/* ── 뱃지 컴포넌트 ─────────────────────────────────────────── */
function CatBadge({ cat }) {
  const c = COMMUNITY_ACCESS[cat]; if (!c) return null
  return (
    <span className="cat-badge" style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}33` }}>
      {c.emoji} {c.label}
    </span>
  )
}
function RoleBadge({ role }) {
  const r = ROLE_META[role]; if (!r) return null
  return <span className="role-badge">{r.emoji} {r.label}</span>
}
function StatusBadge({ status }) {
  const map = {
    pending:  ['대기중',  'status-pending'],
    accepted: ['수락됨',  'status-accepted'],
    rejected: ['거절됨',  'status-rejected'],
  }
  const [label, cls] = map[status] || ['?', '']
  return <span className={`status-badge ${cls}`}>{label}</span>
}

/* ── 프로필 아바타 ─────────────────────────────────────────── */
function Avatar({ user, size = 32 }) {
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--comm)', color: '#0a0a0a',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>
      {user?.name?.[0] || '?'}
    </div>
  )
}

/* ============================================================
   메인 컴포넌트
   ============================================================ */
export default function CommunityPortal() {
  const showToast = useToast()
  const navigate = useNavigate()
  const photoInputRef    = useRef(null)
  const postImageRef     = useRef(null)

  // ── 인증 상태 ─────────────────────────────────────────────
  const [screen, setScreen]     = useState('loading')
  const [user, setUser]         = useState(null)   // community_users row
  const [authUser, setAuthUser] = useState(null)   // supabase auth user

  // ── 회원가입 폼 ───────────────────────────────────────────
  const [regName,         setRegName]         = useState('')
  const [regRole,         setRegRole]         = useState('')
  const [regLocation,     setRegLocation]     = useState('')
  const [regBio,          setRegBio]          = useState('')
  const [regPhone,        setRegPhone]        = useState('')
  const [regPhoto,        setRegPhoto]        = useState(null)
  const [regPhotoPreview, setRegPhotoPreview] = useState('')
  const [uploading,       setUploading]       = useState(false)

  // ── 피드 ──────────────────────────────────────────────────
  const [posts,      setPosts]      = useState([])
  const [filter,     setFilter]     = useState(null)
  const [showClosed, setShowClosed] = useState(false)
  const [loading,    setLoading]    = useState(false)

  // ── 글 상세 ───────────────────────────────────────────────
  const [selectedPost,      setSelectedPost]      = useState(null)
  const [contacts,          setContacts]          = useState([])
  const [myContact,         setMyContact]         = useState(null)
  const [showContactModal,  setShowContactModal]  = useState(false)
  const [contactMsg,        setContactMsg]        = useState('')

  // ── 글쓰기 ────────────────────────────────────────────────
  const [writeCat,      setWriteCat]      = useState('')
  const [writeTitle,    setWriteTitle]    = useState('')
  const [writeContent,  setWriteContent]  = useState('')
  const [writeLocation,      setWriteLocation]      = useState('')
  const [writeTags,          setWriteTags]          = useState([])
  const [writeTagInput,      setWriteTagInput]      = useState('')
  const [writeImages,        setWriteImages]        = useState([])     // File[]
  const [writeImagePreviews, setWriteImagePreviews] = useState([])     // string[]

  // ── 내 활동 ───────────────────────────────────────────────
  const [myTab,             setMyTab]             = useState('posts')
  const [myPosts,           setMyPosts]           = useState([])
  const [sentContacts,      setSentContacts]      = useState([])
  const [receivedContacts,  setReceivedContacts]  = useState([])

  // ── 마켓 ──────────────────────────────────────────────────
  const [marketItems,      setMarketItems]      = useState([])
  const [marketLoading,    setMarketLoading]    = useState(false)
  const [marketFilter,     setMarketFilter]     = useState(null) // 'routine'|'program'|'nutrition'|'content'|null
  const [selectedMarket,   setSelectedMarket]   = useState(null) // 상세 보기 중인 상품
  const [marketContent,    setMarketContent]    = useState(null) // 구매 후 열람 가능한 전문
  const [myPurchases,      setMyPurchases]      = useState([])   // 내가 구매한 post_id[]
  const [purchasing,       setPurchasing]       = useState(false)
  const [sellerStats,      setSellerStats]      = useState(null)
  // 마켓 글쓰기 전용 필드
  const [writePrice,       setWritePrice]       = useState(0)
  const [writeMarketType,  setWriteMarketType]  = useState('routine')
  const [writeFullContent, setWriteFullContent] = useState('')
  const [myPurchasedItems, setMyPurchasedItems] = useState([]) // 구매한 마켓 상품 (post 포함)
  const [mySellerStats,    setMySellerStats]    = useState(null) // 마이페이지용 판매 통계

  // ── 루틴 템플릿 빌더 ──────────────────────────────────────
  const [routineWeeksData,   setRoutineWeeksData]   = useState([makeEmptyWeek(1)])
  const [routineGoal,        setRoutineGoal]        = useState('hypertrophy')
  const [routineLevel,       setRoutineLevel]       = useState('intermediate')
  const [routineDurationW,   setRoutineDurationW]   = useState(4)
  const [routineDaysPerW,    setRoutineDaysPerW]    = useState(3)
  const [routineEquipment,   setRoutineEquipment]   = useState([])
  // ── 루틴 상세 뷰어 ────────────────────────────────────────
  const [routineTemplate,    setRoutineTemplate]    = useState(null) // get_routine_template() 결과
  const [routineLoading,     setRoutineLoading]     = useState(false)
  const [showApplyModal,     setShowApplyModal]     = useState(false)
  const [applyWeekNum,       setApplyWeekNum]       = useState(1)
  const [trainerMembers,     setTrainerMembers]     = useState([]) // 적용 대상 회원 목록
  const [trainerId,          setTrainerId]          = useState(null) // trainers.id (트레이너 역할)
  // ── AI 루틴 분석 ──────────────────────────────────────────
  const [routineAnalysis,    setRoutineAnalysis]    = useState('')
  const [analyzingRoutine,   setAnalyzingRoutine]   = useState(false)

  // ── 커뮤니티 랜딩 CMS ─────────────────────────────────────
  const [commHero, setCommHero] = useState({
    badge:       'FITNESS COMMUNITY',
    headline:    '피트니스 업계의',
    highlight:   '구인·구직 커뮤니티',
    subheadline: '트레이너·회원·교육강사·센터 대표가 함께하는\n피트니스 전문 매칭 플랫폼입니다.',
    cta:         'Google로 시작하기',
  })

  useEffect(() => {
    supabase.from('app_settings').select('key, value').eq('key', 'landing_community_hero')
      .then(({ data }) => {
        const row = data?.find(r => r.key === 'landing_community_hero')
        if (row?.value) setCommHero(row.value)
      })
  }, [])

  /* ── 앱 시작 시 인증 확인 ─────────────────────────────────── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthUser(session.user)
      else setScreen('landing')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleAuthUser(session.user)
      if (event === 'SIGNED_OUT') { setUser(null); setAuthUser(null); setScreen('landing') }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleAuthUser(googleUser) {
    setAuthUser(googleUser)
    const { data } = await supabase
      .from('community_users')
      .select('*')
      .eq('auth_id', googleUser.id)
      .maybeSingle()

    if (data) { setUser(data); setScreen('feed') }
    else {
      setRegName(googleUser.user_metadata?.full_name || googleUser.email?.split('@')[0] || '')
      setScreen('register')
    }
  }

  /* ── Google 로그인 ───────────────────────────────────────── */
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/community' },
    })
    if (error) showToast('구글 로그인 오류: ' + error.message)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setAuthUser(null); setScreen('login')
  }

  /* ── 프로필 사진 선택 ────────────────────────────────────── */
  function handlePhotoChange(e) {
    const file = e.target.files[0]; if (!file) return
    if (!file.type.startsWith('image/')) return showToast('이미지 파일만 업로드 가능합니다')
    if (file.size > 5 * 1024 * 1024) return showToast('5MB 이하 이미지를 선택해주세요')
    setRegPhoto(file)
    setRegPhotoPreview(URL.createObjectURL(file))
  }

  async function uploadPhoto(file, authId) {
    const ext = file.name.split('.').pop()
    const fileName = `${authId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('community-profiles')
      .upload(fileName, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('community-profiles').getPublicUrl(fileName)
    return data.publicUrl
  }

  /* ── 게시글 이미지 업로드 ───────────────────────────────── */
  async function uploadPostImages(files) {
    if (!files.length) return []
    const urls = []
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const name = `posts/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('community-posts').upload(name, file)
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('community-posts').getPublicUrl(name)
      urls.push(data.publicUrl)
    }
    return urls
  }

  function handlePostImageChange(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const remaining = 5 - writeImages.length
    const toAdd = files.slice(0, remaining)
    if (toAdd.some(f => !f.type.startsWith('image/'))) return showToast('이미지 파일만 업로드 가능합니다')
    if (toAdd.some(f => f.size > 10 * 1024 * 1024))    return showToast('10MB 이하 이미지만 업로드 가능합니다')
    setWriteImages(prev => [...prev, ...toAdd])
    toAdd.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setWriteImagePreviews(prev => [...prev, ev.target.result])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function removeWriteImage(idx) {
    setWriteImages(prev        => prev.filter((_, i) => i !== idx))
    setWriteImagePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  function resetWriteForm() {
    setWriteCat(''); setWriteTitle(''); setWriteContent('')
    setWriteLocation(''); setWriteTags([]); setWriteTagInput('')
    setWriteImages([]); setWriteImagePreviews([])
  }

  /* ── 회원가입 ────────────────────────────────────────────── */
  async function register() {
    if (!regName.trim()) return showToast('이름을 입력해주세요')
    if (!regRole) return showToast('역할을 선택해주세요')
    if (PHOTO_REQUIRED_ROLES.includes(regRole) && !regPhoto)
      return showToast('트레이너 / 교육강사는 프로필 사진이 필수입니다')

    setUploading(true)
    try {
      let avatarUrl = null
      if (regPhoto) avatarUrl = await uploadPhoto(regPhoto, authUser.id)

      const { data, error } = await supabase
        .from('community_users')
        .insert({
          auth_id:    authUser.id,
          name:       regName.trim(),
          role:       regRole,
          location:   regLocation.trim() || null,
          bio:        regBio.trim() || null,
          phone:      regPhone.trim() || null,
          avatar_url: avatarUrl,
        })
        .select().single()

      if (error) throw error
      setUser(data); setScreen('feed')
      showToast('환영합니다! 커뮤니티에 오신 걸 환영해요 🎉')
    } catch { showToast('가입 중 오류가 발생했습니다') }
    setUploading(false)
  }

  /* ── 피드 로드 ───────────────────────────────────────────── */
  useEffect(() => {
    if (screen === 'feed' && user) loadPosts()
  }, [screen, filter, showClosed, user])

  async function loadPosts() {
    setLoading(true)
    try {
      const effRoles = [user.role, ...(user.admin_permissions?.extra_roles || [])]
      const visibleCats = getVisibleCats(effRoles)
      let q = supabase
        .from('community_posts')
        .select('*, author:community_users(*)')
        .order('created_at', { ascending: false })

      if (!showClosed) q = q.eq('status', 'active')

      if (filter) {
        // 특정 카테고리 탭: 내 글 + 해당 카테고리 접근 가능 글
        q = q.eq('category', filter)
        if (!visibleCats.includes(filter)) q = q.eq('user_id', user.id)
      } else {
        // 전체(접근 가능 카테고리): 내 글 + 볼 수 있는 카테고리
        const orParts = [`user_id.eq.${user.id}`]
        if (visibleCats.length) orParts.push(`category.in.(${visibleCats.join(',')})`)
        q = q.or(orParts.join(','))
      }

      const { data, error } = await q
      if (error) throw error
      setPosts(data || [])
    } catch { showToast('게시글을 불러오지 못했습니다') }
    setLoading(false)
  }

  /* ── 글 상세 ─────────────────────────────────────────────── */
  async function openDetail(post) {
    setSelectedPost(post); setContacts([]); setMyContact(null)
    setContactMsg(`안녕하세요! 저는 ${user?.name}입니다.`)
    setScreen('detail')

    const { data } = await supabase
      .from('community_contacts')
      .select('*, requester:community_users(*)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })

    const list = data || []
    setContacts(list)
    setMyContact(list.find(c => c.requester_id === user?.id) || null)
  }

  /* ── 연락하기 ────────────────────────────────────────────── */
  async function sendContact() {
    if (!contactMsg.trim()) return showToast('메시지를 입력해주세요')
    const { error } = await supabase.from('community_contacts').insert({
      post_id: selectedPost.id, requester_id: user.id, message: contactMsg.trim(),
    })
    if (error) {
      if (error.code === '23505') return showToast('이미 연락 요청을 보냈습니다')
      return showToast('오류가 발생했습니다')
    }
    await supabase.from('community_posts')
      .update({ contact_count: (selectedPost.contact_count || 0) + 1 })
      .eq('id', selectedPost.id)
    showToast('연락 요청을 보냈습니다')
    setShowContactModal(false)
    setSelectedPost(p => ({ ...p, contact_count: (p.contact_count || 0) + 1 }))
    openDetail(selectedPost)
  }

  async function updateContactStatus(contactId, status) {
    await supabase.from('community_contacts').update({ status }).eq('id', contactId)
    showToast(status === 'accepted' ? '수락했습니다' : '거절했습니다')
    openDetail(selectedPost)
  }

  /* ── 마감 / 삭제 ─────────────────────────────────────────── */
  async function closePost(postId) {
    await supabase.from('community_posts').update({ status: 'closed' }).eq('id', postId)
    showToast('마감 처리되었습니다')
    if (screen === 'detail') setSelectedPost(p => ({ ...p, status: 'closed' }))
    if (screen === 'mypage') loadMyData()
  }
  async function deletePost(postId) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('community_posts').delete().eq('id', postId)
    showToast('삭제되었습니다'); setScreen('feed')
  }

  /* ── 글 등록 ─────────────────────────────────────────────── */
  async function createPost() {
    if (!writeCat) return showToast('카테고리를 선택해주세요')
    if (!writeTitle.trim()) return showToast('제목을 입력해주세요')
    if (!writeContent.trim()) return showToast('내용을 입력해주세요')
    // 카테고리별 write 권한 재검증 (UI 우회 방어) — extra_roles 포함
    const catCfg = COMMUNITY_ACCESS[writeCat]
    const effRoles = [user.role, ...(user.admin_permissions?.extra_roles || [])]
    if (catCfg && !effRoles.some(r => catCfg.write.includes(r))) {
      return showToast(`'${catCfg.label}' 카테고리에 글을 올릴 권한이 없습니다`)
    }
    setUploading(true)
    let imageUrls = []
    try {
      imageUrls = await uploadPostImages(writeImages)
    } catch {
      setUploading(false)
      return showToast('이미지 업로드 중 오류가 발생했습니다')
    }
    const { error } = await supabase.from('community_posts').insert({
      user_id: user.id, category: writeCat,
      title: writeTitle.trim(), content: writeContent.trim(),
      location: writeLocation.trim() || null,
      tags: writeTags.length > 0 ? writeTags : null,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      status: 'active',
    })
    setUploading(false)
    if (error) {
      console.error('createPost error:', error)
      return showToast(`등록 오류: ${error.message}`)
    }
    showToast('게시글이 등록되었습니다')
    resetWriteForm()
    setScreen('feed')
  }

  function handleTagKey(e) {
    if (e.key !== 'Enter') return; e.preventDefault()
    const val = writeTagInput.trim(); if (!val) return
    if (writeTags.length >= 5) return showToast('태그는 최대 5개까지 추가할 수 있습니다')
    if (!writeTags.includes(val)) setWriteTags(p => [...p, val])
    setWriteTagInput('')
  }

  /* ── 내 활동 데이터 ──────────────────────────────────────── */
  useEffect(() => {
    if (screen === 'mypage' && user) loadMyData()
  }, [screen])

  async function loadMyData() {
    const { data: postsData } = await supabase
      .from('community_posts')
      .select('*, author:community_users(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setMyPosts(postsData || [])

    const { data: sentData } = await supabase
      .from('community_contacts')
      .select('*, post:community_posts(*)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })
    setSentContacts(sentData || [])

    const ids = (postsData || []).map(p => p.id)
    if (ids.length) {
      const { data: rcvData } = await supabase
        .from('community_contacts')
        .select('*, requester:community_users(*), post:community_posts(title)')
        .in('post_id', ids)
        .order('created_at', { ascending: false })
      setReceivedContacts(rcvData || [])
    } else setReceivedContacts([])

    // 구매한 마켓 상품 로드
    const { data: purchaseData } = await supabase
      .from('market_purchases')
      .select('*, post:community_posts(*, author:community_users(*))')
      .eq('buyer_id', user.id)
      .order('purchased_at', { ascending: false })
    setMyPurchasedItems((purchaseData || []).filter(p => p.post))
    setMyPurchases((purchaseData || []).map(p => p.post_id))

    // 판매자(educator/instructor)인 경우 판매 통계 로드
    if (['educator', 'instructor'].includes(user.role)) {
      const { data: statsData } = await supabase.rpc('get_seller_stats', { p_seller_id: user.id })
      setMySellerStats(statsData)
    }
  }

  /* ── 마켓 데이터 로드 ───────────────────────────────────── */
  useEffect(() => {
    if (screen === 'market' && user) loadMarketItems()
  }, [screen, marketFilter, user])

  useEffect(() => {
    if (screen === 'market_detail' && selectedMarket) loadMarketDetail()
  }, [screen, selectedMarket])

  async function loadMarketItems() {
    setMarketLoading(true)
    try {
      let q = supabase
        .from('community_posts')
        .select('*, author:community_users(*)')
        .eq('category', 'educator_market')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      if (marketFilter) q = q.eq('market_type', marketFilter)
      const { data, error } = await q
      if (error) throw error
      setMarketItems(data || [])
      // 내 구매 목록
      const { data: purchased } = await supabase
        .from('market_purchases')
        .select('post_id')
        .eq('buyer_id', user.id)
      setMyPurchases((purchased || []).map(p => p.post_id))
    } catch { showToast('마켓을 불러오지 못했습니다') }
    setMarketLoading(false)
  }

  async function loadMarketDetail() {
    // 전문 콘텐츠 (구매자 또는 판매자만 열람 가능)
    const isSeller  = selectedMarket?.user_id === user?.id
    const isPurchased = myPurchases.includes(selectedMarket?.id)
    if (isSeller || isPurchased || selectedMarket?.price === 0) {
      const { data } = await supabase
        .from('market_item_contents')
        .select('*')
        .eq('post_id', selectedMarket.id)
        .maybeSingle()
      setMarketContent(data)
    } else {
      setMarketContent(null)
    }
    // 판매자인 경우 통계 로드
    if (isSeller) {
      const { data } = await supabase.rpc('get_seller_stats', { p_seller_id: user.id })
      setSellerStats(data)
    }
    // 루틴 타입이면 템플릿 데이터 로드
    if (selectedMarket?.market_type === 'routine') {
      await loadRoutineTemplate(selectedMarket.id)
      // 트레이너 역할이면 회원 목록 + trainer ID 로드
      if (user?.role === 'trainer') {
        const { data: trainerRow } = await supabase
          .from('trainers')
          .select('id')
          .eq('user_id', supabase.auth.getUser ? (await supabase.auth.getUser()).data?.user?.id : null)
          .maybeSingle()
        if (trainerRow) {
          setTrainerId(trainerRow.id)
          const { data: memberRows } = await supabase
            .from('members')
            .select('id, name, goal')
            .eq('trainer_id', trainerRow.id)
            .eq('status', 'active')
            .order('name')
          setTrainerMembers(memberRows || [])
        }
      }
    }
  }

  /* ── 루틴 템플릿 상세 로드 ──────────────────────────────── */
  async function loadRoutineTemplate(postId) {
    setRoutineLoading(true)
    setRoutineTemplate(null)
    try {
      const data = await getRoutineTemplate(postId, user?.id)
      setRoutineTemplate(data?.ok ? data : null)
    } catch { /* 템플릿 없는 상품은 무시 */ }
    setRoutineLoading(false)
  }

  /* ── 루틴 AI 분석 ───────────────────────────────────────── */
  async function analyzeRoutine() {
    if (!routineTemplate || analyzingRoutine) return
    const apiKey = localStorage.getItem('gemini_api_key')
    if (!apiKey) return showToast('Gemini API 키가 없습니다')
    setAnalyzingRoutine(true)
    setRoutineAnalysis('')
    try {
      const prompt = buildRoutineAnalysisPrompt({
        title:         selectedMarket?.title || '',
        goal:          routineTemplate.goal,
        level:         routineTemplate.level,
        durationWeeks: routineTemplate.duration_weeks,
        daysPerWeek:   routineTemplate.days_per_week,
        weeksData:     routineTemplate.weeks_data || [],
      })
      const result = await callGemini(apiKey, 'gemini-2.5-flash-lite', prompt, { timeoutMs: 45000 })
      setRoutineAnalysis(result)
    } catch (e) { showToast('AI 분석 실패: ' + e.message) }
    setAnalyzingRoutine(false)
  }

  async function purchaseItem(item) {
    if (purchasing) return
    setPurchasing(true)
    try {
      const { data, error } = await supabase.rpc('purchase_market_item', {
        p_post_id:  item.id,
        p_buyer_id: user.id,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || '구매 처리 실패')
      setMyPurchases(prev => [...prev, item.id])

      // ── 루틴 타입: 트레이너 앱 workout_routines 에 즉시 복사 ──
      if (item.market_type === 'routine' && user.role === 'trainer') {
        try {
          // trainer.id 조회 (authUser.id 기반)
          let tId = trainerId
          if (!tId && authUser?.id) {
            const { data: tRow } = await supabase
              .from('trainers').select('id').eq('user_id', authUser.id).maybeSingle()
            if (tRow) { tId = tRow.id; setTrainerId(tRow.id) }
          }
          if (tId) {
            // routine_templates 에서 exercises 추출
            const { data: rt } = await supabase
              .from('routine_templates')
              .select('weeks_data, preview_day')
              .eq('post_id', item.id)
              .maybeSingle()

            // 첫 번째 주차 첫 번째 날의 exercises → workout_routines 포맷으로 변환
            const exercises = (() => {
              const week1 = rt?.weeks_data?.[0]
              const day1  = week1?.days?.[0]
              if (day1?.exercises?.length) {
                return day1.exercises.map(ex => ({
                  name: ex.name,
                  sets: (ex.sets || []).map(s => ({
                    weight:   s.weight_note || '',
                    reps:     s.reps || '10',
                    rest_sec: s.rest_sec || 90,
                  })),
                }))
              }
              // fallback: preview_day (already in workout_routines format)
              return rt?.preview_day || []
            })()

            await supabase.from('workout_routines').insert({
              trainer_id: tId,
              member_id:  null,       // 트레이너 보관함 (회원 미지정)
              name:       `[마켓] ${item.title}`,
              exercises,
            })
          }
        } catch { /* 루틴 복사 실패는 무시 — 구매 자체는 성공 */ }
      }

      showToast(
        item.market_type === 'routine' && user.role === 'trainer'
          ? '✅ 구매 완료! 트레이너 앱 루틴 보관함에 저장됐어요'
          : item.price === 0 ? '✓ 무료 상품을 받았어요' : '✓ 구매가 완료됐어요'
      )
      // 전문 콘텐츠 로드
      const { data: content } = await supabase
        .from('market_item_contents')
        .select('*')
        .eq('post_id', item.id)
        .maybeSingle()
      setMarketContent(content)
    } catch (e) { showToast(e.message) }
    setPurchasing(false)
  }

  async function createMarketPost() {
    if (!writeTitle.trim())   return showToast('제목을 입력해주세요')
    if (!writeContent.trim()) return showToast('미리보기 내용을 입력해주세요')
    if (writePrice < 0)       return showToast('가격을 확인해주세요')

    // ── 루틴 타입: publishRoutineTemplate 사용 ──────────────
    if (writeMarketType === 'routine') {
      const hasExercises = routineWeeksData.some(w =>
        w.days?.some(d => d.exercises?.some(e => e.name?.trim()))
      )
      if (!hasExercises) return showToast('최소 1개 이상의 종목을 추가해주세요')
      try {
        await publishRoutineTemplate({
          sellerCommunityId: user.id,
          title:             writeTitle.trim(),
          previewText:       writeContent.trim(),
          price:             writePrice,
          tags:              writeTags.length > 0 ? writeTags : null,
          goal:              routineGoal,
          level:             routineLevel,
          durationWeeks:     routineDurationW,
          daysPerWeek:       routineDaysPerW,
          equipment:         routineEquipment,
          weeksData:         routineWeeksData,
        })
        showToast('🛒 루틴 템플릿이 마켓에 등록됐어요!')
        setWriteTitle(''); setWriteContent(''); setWriteTags([])
        setWritePrice(0); setWriteMarketType('routine'); setWriteFullContent('')
        setRoutineWeeksData([makeEmptyWeek(1)])
        setRoutineGoal('hypertrophy'); setRoutineLevel('intermediate')
        setRoutineEquipment([]); setRoutineDurationW(4); setRoutineDaysPerW(3)
        setScreen('market')
      } catch { showToast('등록 중 오류가 발생했습니다') }
      return
    }

    // ── 기타 타입: 기존 로직 ───────────────────────────────
    const { data: post, error } = await supabase
      .from('community_posts')
      .insert({
        user_id: user.id, category: 'educator_market',
        title:   writeTitle.trim(), content: writeContent.trim(),
        tags:    writeTags.length > 0 ? writeTags : null,
        price:   writePrice,
        market_type: writeMarketType,
      })
      .select('id')
      .single()
    if (error) return showToast('등록 중 오류가 발생했습니다')
    // 전문 콘텐츠 저장
    if (writeFullContent.trim()) {
      await supabase.from('market_item_contents').insert({
        post_id:      post.id,
        full_content: writeFullContent.trim(),
      })
    }
    showToast('🛒 상품이 마켓에 등록됐어요!')
    setWriteTitle(''); setWriteContent(''); setWriteTags([])
    setWritePrice(0); setWriteMarketType('routine'); setWriteFullContent('')
    setScreen('market')
  }

  /* ============================================================
     RENDER
     ============================================================ */

  /* ── 로딩 ────────────────────────────────────────────────── */
  if (screen === 'loading') return (
    <div className="comm-login-wrap">
      <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>잠시만요...</div>
    </div>
  )

  /* ── 커뮤니티 랜딩 ──────────────────────────────────────────── */
  if (screen === 'landing') {
    const COMM_FEATURES = Object.values(COMMUNITY_ACCESS).map(c => ({
      icon: c.emoji, title: c.label, desc: c.desc, color: c.color,
    }))
    return (
      <div style={{background:'#0c0c10',color:'#fff',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden'}}>
        {/* 배경 글로우 */}
        <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,overflow:'hidden'}}>
          <div style={{position:'absolute',top:'5%',right:'-15%',width:'600px',height:'500px',
            background:'radial-gradient(ellipse,rgba(224,64,251,0.05) 0%,transparent 65%)'}}/>
          <div style={{position:'absolute',bottom:'15%',left:'-10%',width:'500px',height:'400px',
            background:'radial-gradient(ellipse,rgba(79,195,247,0.04) 0%,transparent 65%)'}}/>
        </div>

        {/* 상단 바 */}
        <div style={{position:'relative',zIndex:1,padding:'18px 24px',display:'flex',alignItems:'center',
          justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{fontSize:'16px',fontWeight:900,letterSpacing:'-1px'}}>
            오<span style={{color:'#c8f135'}}>운</span>
            <span style={{fontSize:'11px',fontWeight:600,color:'rgba(255,255,255,0.4)',
              marginLeft:'8px',letterSpacing:'0.08em'}}>COMMUNITY</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{fontSize:'12px',color:'rgba(255,255,255,0.4)',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>← 메인으로</button>
        </div>

        <div style={{position:'relative',zIndex:1,maxWidth:'640px',margin:'0 auto',padding:'48px 24px 80px'}}>
          {/* 히어로 */}
          <div style={{textAlign:'center',marginBottom:'52px'}}>
            <div style={{display:'inline-block',fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',
              color:'#ff9800',background:'rgba(255,152,0,0.1)',padding:'5px 14px',borderRadius:'20px',
              border:'1px solid rgba(255,152,0,0.25)',marginBottom:'20px'}}>
              {commHero.badge}
            </div>
            <h1 style={{fontSize:'clamp(30px,7vw,50px)',fontWeight:900,letterSpacing:'-2px',lineHeight:1.1,margin:'0 0 16px'}}>
              {commHero.headline}<br/><span style={{color:'#ff9800'}}>{commHero.highlight}</span>
            </h1>
            <p style={{fontSize:'14px',color:'rgba(255,255,255,0.5)',lineHeight:1.85,maxWidth:'360px',margin:'0 auto 36px',whiteSpace:'pre-line'}}>
              {commHero.subheadline}
            </p>
            <button onClick={()=>setScreen('login')} style={{
              background:'linear-gradient(135deg,#ff9800,#f57c00)',color:'#fff',
              padding:'15px 36px',borderRadius:'12px',fontWeight:800,fontSize:'15px',
              border:'none',cursor:'pointer',boxShadow:'0 4px 24px rgba(255,152,0,0.35)',
              fontFamily:'inherit',display:'block',width:'100%',
              maxWidth:'300px',marginLeft:'auto',marginRight:'auto',marginBottom:'12px'}}>
              {commHero.cta}
            </button>
            <p style={{fontSize:'12px',color:'rgba(255,255,255,0.3)',margin:0}}>Google 계정으로 5초 만에 가입할 수 있어요</p>
          </div>

          {/* 카테고리 그리드 */}
          <div style={{marginBottom:'36px'}}>
            <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.1em',color:'rgba(255,255,255,0.3)',
              textAlign:'center',marginBottom:'20px'}}>커뮤니티 카테고리 6가지</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              {COMM_FEATURES.map((f,i)=>(
                <div key={i} style={{background:'rgba(255,255,255,0.04)',border:`1px solid ${f.color}25`,
                  borderRadius:'14px',padding:'18px',backdropFilter:'blur(8px)'}}>
                  <div style={{fontSize:'22px',marginBottom:'8px'}}>{f.icon}</div>
                  <div style={{fontSize:'13px',fontWeight:700,color:f.color,marginBottom:'5px'}}>{f.title}</div>
                  <div style={{fontSize:'11px',color:'rgba(255,255,255,0.4)',lineHeight:1.6}}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 역할별 접근 배너 — permissions.js ROLE_META 기반 동적 렌더 */}
          <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:'16px',padding:'24px',marginBottom:'32px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'rgba(255,255,255,0.5)',
              letterSpacing:'0.08em',marginBottom:'14px'}}>역할별 맞춤 접근</div>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'12px'}}>
              {Object.entries(ROLE_META)
                .filter(([key]) => key !== 'instructor')  // educator 별칭 중복 제거
                .map(([key, r]) => (
                  <span key={key} style={{fontSize:'12px',padding:'5px 12px',borderRadius:'8px',
                    background:r.color+'15',color:r.color,border:`1px solid ${r.color}30`,fontWeight:600}}>
                    {r.emoji} {r.label}
                  </span>
                ))}
            </div>
            <div style={{fontSize:'12px',color:'rgba(255,255,255,0.35)',lineHeight:1.7}}>
              역할에 따라 볼 수 있는 카테고리와 글쓰기 권한이 달라져요.
            </div>
          </div>

          <button onClick={()=>setScreen('login')} style={{
            width:'100%',background:'rgba(255,255,255,0.06)',
            border:'1px solid rgba(255,255,255,0.15)',color:'#fff',
            padding:'14px',borderRadius:'12px',fontWeight:600,fontSize:'14px',
            cursor:'pointer',fontFamily:'inherit'}}>
            커뮤니티 입장하기 →
          </button>
        </div>
      </div>
    )
  }

  /* ── 로그인 (Google OAuth) ────────────────────────────────── */
  if (screen === 'login') return (
    <div className="comm-login-wrap">
      <div className="comm-login-card">
        <div className="comm-logo">오운</div>
        <div className="comm-badge">COMMUNITY</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.7 }}>
          트레이너 · 회원 · 교육강사 · 센터 대표가<br/>함께하는 구인·구직·매칭 커뮤니티
        </p>

        <button className="google-login-btn" onClick={signInWithGoogle}>
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Google로 시작하기
        </button>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← 홈으로</button>
        </div>
      </div>
    </div>
  )

  /* ── 회원가입 (Google 연동 후) ────────────────────────────── */
  if (screen === 'register') return (
    <div className="comm-login-wrap" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="comm-login-card" style={{ maxWidth: 440 }}>
        <div className="comm-logo">프로필 <span>설정</span></div>
        <div className="comm-badge">거의 다 됐어요!</div>

        {/* 프로필 사진 업로드 */}
        <div className="form-group">
          <label>
            프로필 사진
            {PHOTO_REQUIRED_ROLES.includes(regRole) && (
              <span style={{ color: 'var(--danger)', marginLeft: 4 }}>* 필수</span>
            )}
            {!PHOTO_REQUIRED_ROLES.includes(regRole) && regRole && (
              <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>(선택)</span>
            )}
          </label>
          <div className="photo-upload-area" onClick={() => photoInputRef.current?.click()}>
            {regPhotoPreview
              ? <img src={regPhotoPreview} alt="preview" className="photo-preview" />
              : (
                <div className="photo-placeholder">
                  <div style={{ fontSize: 32 }}>📸</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                    {PHOTO_REQUIRED_ROLES.includes(regRole)
                      ? '사진을 클릭해서 업로드하세요 (필수)'
                      : '클릭해서 사진 업로드 (선택)'}
                  </div>
                </div>
              )}
          </div>
          <input
            ref={photoInputRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={handlePhotoChange}
          />
        </div>

        <div className="form-group">
          <label>이름</label>
          <input type="text" placeholder="홍길동" value={regName} onChange={e => setRegName(e.target.value)} />
        </div>

        {/* 역할 선택 — 커뮤니티(Google OAuth)용 역할만 표시 */}
        <div className="form-group">
          <label>역할을 선택해주세요</label>
          <div className="role-grid">
            {(() => {
              const ORDER = ['member', 'trainer', 'gym_owner', 'educator'];
              return Object.entries(ROLE_META)
                .filter(([key]) => ORDER.includes(key))
                .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b));
            })().map(([key, r]) => (
                <div key={key}
                  className={`role-card ${regRole === key ? 'selected' : ''}`}
                  onClick={() => setRegRole(key)}>
                  <div className="role-card-icon">{r.emoji}</div>
                  <div className="role-card-label">{r.label}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.4 }}>
                    {r.desc}
                  </div>
                  {PHOTO_REQUIRED_ROLES.includes(key) && (
                    <div style={{ fontSize: 9, color: 'var(--comm)', marginTop: 2 }}>사진 필수</div>
                  )}
                </div>
              ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>활동 지역 (선택)</label>
            <input type="text" placeholder="서울 강남" value={regLocation} onChange={e => setRegLocation(e.target.value)} />
          </div>
          <div className="form-group">
            <label>연락처 뒷 4자리 (선택)</label>
            <input type="text" placeholder="1234" maxLength={4}
              value={regPhone} onChange={e => setRegPhone(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>

        <div className="form-group">
          <label>한줄 소개 (선택)</label>
          <input type="text" placeholder="예: PT 경력 5년, 다이어트 전문"
            value={regBio} onChange={e => setRegBio(e.target.value)} />
        </div>

        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: 8, background: '#4fc3f7', color: '#0a0a0a', opacity: uploading ? 0.6 : 1 }}
          onClick={register}
          disabled={uploading}
        >
          {uploading ? '가입 중...' : '가입 완료'}
        </button>
      </div>
    </div>
  )

  /* ── 피드 화면 ────────────────────────────────────────────── */
  if (screen === 'feed') {
    // 접근 차단 유저
    if (user?.admin_permissions?.banned) {
      return (
        <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'12px',background:'var(--bg)'}}>
          <div style={{fontSize:'32px'}}>🚫</div>
          <div style={{fontWeight:700,fontSize:'15px',color:'var(--text)'}}>커뮤니티 접근이 차단됐습니다</div>
          <div style={{fontSize:'12px',color:'var(--text-dim)'}}>관리자에게 문의해주세요</div>
          <button className="btn btn-ghost btn-sm" style={{marginTop:'8px'}} onClick={signOut}>로그아웃</button>
        </div>
      )
    }
    const effRoles = [user.role, ...(user.admin_permissions?.extra_roles || [])]
    const visibleCats = getVisibleCats(effRoles)
    const writableCats = getWritableCats(effRoles)

    return (
      <div className="comm-portal">
        {/* 헤더 */}
        <div className="comm-header">
          <div>
            <div className="comm-header-logo">오운</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>커뮤니티</div>
          </div>
          <div className="comm-header-actions">
            <Avatar user={user} size={28} />
            <RoleBadge role={user?.role} />
            <button className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
              onClick={() => setScreen('market')}>
              🛒 마켓
            </button>
            {writableCats.length > 0 && (
              <button className="write-btn-comm"
                onClick={() => { setWriteCat(writableCats[0]); setScreen('write') }}>
                + 글쓰기
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setScreen('mypage')}>내 활동</button>
          </div>
        </div>

        {/* 카테고리 필터 탭 (전체 탭 없음, 역할에 따라 표시) */}
        <div className="cat-tabs-wrap">
          <div className="cat-tabs">
            {visibleCats.map(key => {
              const c = CATEGORIES[key]
              return (
                <button key={key}
                  className={`cat-tab ${filter === key ? 'active' : ''}`}
                  onClick={() => setFilter(filter === key ? null : key)}>
                  {c.emoji} {c.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 피드 */}
        <div className="comm-feed">
          <div className="feed-options">
            <span className="feed-count">
              {filter ? CATEGORIES[filter]?.label : '전체 접근 가능'} · {posts.length}건
            </span>
            <button className="toggle-closed" onClick={() => setShowClosed(v => !v)}>
              <span>{showClosed ? '✓' : '○'}</span> 마감 포함
            </button>
          </div>

          {loading && <div className="comm-loading">불러오는 중...</div>}
          {!loading && posts.length === 0 && (
            <div className="comm-empty">
              <div className="comm-empty-icon">📭</div>
              <div>게시글이 없습니다</div>
              {writableCats.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12 }}>첫 번째 글을 작성해보세요!</div>
              )}
            </div>
          )}
          {posts.map(post => (
            <PostCard key={post.id} post={post} onOpen={() => openDetail(post)} myId={user.id} />
          ))}
        </div>
      </div>
    )
  }

  /* ── 🛒 마켓 목록 화면 ─────────────────────────────────────── */
  if (screen === 'market') {
    const MARKET_TYPES = [
      { key: 'routine',   label: '운동 루틴',  emoji: '🏋️' },
      { key: 'program',   label: '트레이닝 프로그램', emoji: '📅' },
      { key: 'nutrition', label: '식단 가이드', emoji: '🥗' },
      { key: 'content',   label: '교육 콘텐츠', emoji: '📖' },
    ]
    const effRoles = [user.role, ...(user.admin_permissions?.extra_roles || [])]
    const writableCats = getWritableCats(effRoles)
    const canSell = writableCats.includes('educator_market')

    return (
      <div className="comm-portal">
        <div className="comm-header">
          <button className="comm-back" onClick={() => setScreen('feed')}>←</button>
          <div className="comm-header-logo" style={{ fontSize: 15 }}>🛒 교육자 마켓</div>
          {canSell && (
            <button className="write-btn-comm"
              onClick={() => { setWriteCat('educator_market'); setScreen('market_write') }}>
              + 상품 등록
            </button>
          )}
        </div>

        {/* 타입 필터 */}
        <div className="cat-tabs-wrap">
          <div className="cat-tabs">
            <button className={`cat-tab ${!marketFilter ? 'active' : ''}`}
              onClick={() => setMarketFilter(null)}>
              전체
            </button>
            {MARKET_TYPES.map(t => (
              <button key={t.key}
                className={`cat-tab ${marketFilter === t.key ? 'active' : ''}`}
                onClick={() => setMarketFilter(marketFilter === t.key ? null : t.key)}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="comm-feed">
          <div className="feed-options">
            <span className="feed-count">
              {marketFilter ? MARKET_TYPES.find(t => t.key === marketFilter)?.label : '전체'} · {marketItems.length}개
            </span>
          </div>
          {marketLoading && <div className="comm-loading">불러오는 중...</div>}
          {!marketLoading && marketItems.length === 0 && (
            <div className="comm-empty">
              <div className="comm-empty-icon">🛒</div>
              <div>등록된 상품이 없습니다</div>
              {canSell && <div style={{ marginTop: 8, fontSize: 12 }}>첫 상품을 등록해보세요!</div>}
            </div>
          )}
          {marketItems.map(item => (
            <MarketCard key={item.id}
              item={item}
              isPurchased={myPurchases.includes(item.id)}
              isMine={item.user_id === user.id}
              onOpen={() => { setSelectedMarket(item); setMarketContent(null); setScreen('market_detail') }}
            />
          ))}
        </div>
      </div>
    )
  }

  /* ── 🛒 마켓 상세 화면 ──────────────────────────────────────── */
  if (screen === 'market_detail' && selectedMarket) {
    const item       = selectedMarket
    const isMine     = item.user_id === user.id
    const isPurchased = myPurchases.includes(item.id)
    const isFree     = item.price === 0
    const hasAccess  = isMine || isPurchased || isFree
    const MARKET_TYPE_LABELS = { routine:'🏋️ 운동 루틴', program:'📅 트레이닝 프로그램', nutrition:'🥗 식단 가이드', content:'📖 교육 콘텐츠' }

    return (
      <div className="comm-portal">
        <div className="comm-header">
          <button className="comm-back" onClick={() => { setSelectedMarket(null); setScreen('market') }}>←</button>
          <div className="comm-header-logo" style={{ fontSize: 14 }}>상품 상세</div>
          {isMine && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
              onClick={() => deletePost(item.id)}>삭제</button>
          )}
        </div>

        <div style={{ padding: '16px' }}>
          {/* 뱃지 행 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid #34d39944' }}>
              🛒 마켓
            </span>
            {item.market_type && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                {MARKET_TYPE_LABELS[item.market_type] || item.market_type}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 12px', borderRadius: 20, marginLeft: 'auto',
              background: item.price === 0 ? 'rgba(52,211,153,0.2)' : 'rgba(200,241,53,0.2)',
              color:      item.price === 0 ? '#34d399' : '#c8f135',
              border:     `1px solid ${item.price === 0 ? '#34d39966' : '#c8f13566'}` }}>
              {item.price === 0 ? '무료' : `${item.price.toLocaleString()}원`}
            </span>
          </div>

          {/* 제목 */}
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, lineHeight: 1.3 }}>{item.title}</div>

          {/* 작성자 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            padding: '10px 12px', background: 'var(--surface2)', borderRadius: 10 }}>
            <Avatar user={item.author} size={36} />
            <div>
              <RoleBadge role={item.author?.role} />
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{item.author?.name}</div>
              {item.author?.location && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>📍 {item.author.location}</div>}
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>
              <div>구매 {item.purchase_count || 0}회</div>
              <div>{timeAgo(item.created_at)}</div>
            </div>
          </div>

          {/* 태그 */}
          {item.tags?.length > 0 && (
            <div className="post-tags" style={{ marginBottom: 14 }}>
              {item.tags.map(t => <span key={t} className="post-tag">#{t}</span>)}
            </div>
          )}

          {/* 미리보기 */}
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6 }}>
            📋 미리보기
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px', fontSize: 14,
            lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: 16, color: 'var(--text)' }}>
            {item.content}
          </div>

          {/* ── 루틴 타입 — RoutineTemplateViewer ── */}
          {item.market_type === 'routine' ? (
            <div>
              {routineLoading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)', fontSize: 13 }}>
                  루틴 데이터 불러오는 중...
                </div>
              ) : (
                <>
                  {/* 구매 버튼 (미구매 + 유료 상품) */}
                  {!hasAccess && (
                    <div style={{
                      background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)',
                      borderRadius: 10, padding: '16px', textAlign: 'center', marginBottom: 16,
                    }}>
                      <button onClick={() => purchaseItem(item)} disabled={purchasing}
                        style={{
                          width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                          fontWeight: 800, fontSize: 15, cursor: purchasing ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', background: '#34d399', color: '#0a0a0a',
                          opacity: purchasing ? 0.7 : 1,
                        }}>
                        {purchasing ? '처리 중...' : item.price === 0 ? '무료로 받기' : `${item.price.toLocaleString()}원 구매하기`}
                      </button>
                    </div>
                  )}

                  <RoutineTemplateViewer
                    templateData={routineTemplate}
                    post={item}
                    isOwner={isMine}
                    canApply={user?.role === 'trainer' && hasAccess}
                    onApply={weekNum => {
                      setApplyWeekNum(weekNum)
                      setShowApplyModal(true)
                    }}
                  />

                  {/* AI 분석 버튼 (교육자 본인 + 구매자) */}
                  {hasAccess && routineTemplate?.has_access && (
                    <div style={{ marginTop: 16 }}>
                      <button onClick={analyzeRoutine} disabled={analyzingRoutine}
                        style={{
                          width: '100%', padding: '11px', borderRadius: 10,
                          border: '1px solid rgba(200,241,53,0.3)',
                          background: 'rgba(200,241,53,0.08)', color: '#c8f135',
                          fontWeight: 700, fontSize: 13, cursor: analyzingRoutine ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', opacity: analyzingRoutine ? 0.7 : 1,
                        }}>
                        {analyzingRoutine ? '🤖 AI 분석 중...' : '🤖 AI 루틴 밸런스 분석'}
                      </button>
                      {routineAnalysis && (
                        <div style={{
                          marginTop: 12, background: 'rgba(200,241,53,0.05)',
                          border: '1px solid rgba(200,241,53,0.15)',
                          borderRadius: 10, padding: '14px',
                          fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text)',
                        }}>
                          {routineAnalysis}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* ── 기타 타입 — 기존 전문 콘텐츠 ── */
            hasAccess ? (
              marketContent ? (
                <div>
                  <div style={{ fontSize: 12, color: '#34d399', fontWeight: 700, marginBottom: 8 }}>
                    ✅ {isFree ? '무료 전문 콘텐츠' : isMine ? '📦 전문 콘텐츠 (본인)' : '🔓 구매 완료 — 전문 콘텐츠'}
                  </div>
                  <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.25)',
                    borderRadius: 10, padding: '14px', fontSize: 14, lineHeight: 1.8,
                    whiteSpace: 'pre-wrap', color: 'var(--text)', marginBottom: 16 }}>
                    {marketContent.full_content}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: 13 }}>
                  {isFree ? '전문 콘텐츠가 없습니다' : '전문 콘텐츠를 불러오는 중...'}
                </div>
              )
            ) : (
              <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)',
                borderRadius: 10, padding: '20px', textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  구매하면 전문 콘텐츠를 열람할 수 있습니다
                </div>
                <button onClick={() => purchaseItem(item)} disabled={purchasing}
                  style={{ padding: '12px 32px', borderRadius: 10, border: 'none', fontWeight: 800,
                    fontSize: 15, cursor: purchasing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    background: '#34d399', color: '#0a0a0a', opacity: purchasing ? 0.7 : 1 }}>
                  {purchasing ? '처리 중...' : item.price === 0 ? '무료로 받기' : `${item.price.toLocaleString()}원 구매하기`}
                </button>
              </div>
            )
          )}

          {/* 적용 모달 (트레이너 전용) */}
          {showApplyModal && routineTemplate && (
            <ApplyRoutineModal
              templateData={routineTemplate}
              post={item}
              trainerId={trainerId}
              members={trainerMembers}
              initialWeek={applyWeekNum}
              onApplied={(routineId, memberId) => {
                setShowApplyModal(false)
                showToast('✅ 루틴이 회원에게 적용됐어요!')
              }}
              onClose={() => setShowApplyModal(false)}
            />
          )}

          {/* 판매자 전용 — 구매자 목록 */}
          {isMine && sellerStats && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10 }}>
                📊 판매 통계
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  ['총 판매', sellerStats.total_sales + '건'],
                  ['총 수익', (sellerStats.total_revenue || 0).toLocaleString() + '원'],
                  ['유료 상품', sellerStats.paid_items + '개'],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399' }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              {(sellerStats.recent_purchases || []).length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>최근 구매자</div>
              )}
              {(sellerStats.recent_purchases || []).map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                  <span>{p.buyer_name}</span>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>
                    {p.amount === 0 ? '무료' : p.amount.toLocaleString() + '원'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── 🛒 마켓 상품 등록 화면 ────────────────────────────────── */
  if (screen === 'market_write') {
    const MARKET_TYPES = [
      { key: 'routine',   label: '운동 루틴',      emoji: '🏋️', desc: '운동 순서·세트·반복수 등의 운동 루틴' },
      { key: 'program',   label: '트레이닝 프로그램', emoji: '📅', desc: '주차별 구조화된 트레이닝 계획' },
      { key: 'nutrition', label: '식단 가이드',     emoji: '🥗', desc: '목표별 식단·칼로리·영양소 가이드' },
      { key: 'content',   label: '교육 콘텐츠',     emoji: '📖', desc: '강의 자료·PDF·세미나 노트 등' },
    ]
    return (
      <div className="comm-portal">
        <div className="comm-header">
          <button className="comm-back" onClick={() => setScreen('market')}>←</button>
          <div className="comm-header-logo" style={{ fontSize: 15 }}>🛒 상품 등록</div>
          <div style={{ width: 60 }} />
        </div>
        <div className="comm-write">
          <div className="comm-write-card">
            <div className="write-title-text">어떤 콘텐츠를 판매하시겠어요?</div>

            {/* 상품 유형 */}
            <div className="form-group">
              <label>상품 유형 <span style={{ color: 'var(--danger)' }}>*</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {MARKET_TYPES.map(t => (
                  <div key={t.key}
                    onClick={() => setWriteMarketType(t.key)}
                    style={{
                      padding: '12px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                      border: writeMarketType === t.key ? '2px solid #34d399' : '1px solid var(--border)',
                      background: writeMarketType === t.key ? 'rgba(52,211,153,0.1)' : 'var(--surface2)',
                    }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{t.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: writeMarketType === t.key ? '#34d399' : 'var(--text)' }}>
                      {t.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>
                      {t.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 가격 */}
            <div className="form-group">
              <label>가격 <span style={{ color: 'var(--danger)' }}>*</span></label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number" min={0} step={1000}
                  placeholder="0 = 무료"
                  value={writePrice}
                  onChange={e => setWritePrice(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>원</span>
                <button type="button"
                  onClick={() => setWritePrice(0)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
                    background: writePrice === 0 ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
                    color: writePrice === 0 ? '#34d399' : 'var(--text-dim)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                  무료
                </button>
              </div>
              {writePrice > 0 && (
                <div style={{ fontSize: 11, color: '#c8f135', marginTop: 4 }}>
                  💡 결제는 구매자와 직접 협의 후 처리해주세요 (현재 명예 과금 방식)
                </div>
              )}
            </div>

            {/* 제목 */}
            <div className="form-group">
              <label>상품명 <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input type="text" placeholder="예: 12주 벌크업 프로그램 (중급자용)" maxLength={50}
                value={writeTitle} onChange={e => setWriteTitle(e.target.value)} />
              <div className="char-count">{writeTitle.length}/50</div>
            </div>

            {/* 미리보기 (공개) */}
            <div className="form-group">
              <label>
                미리보기 내용 <span style={{ color: 'var(--danger)' }}>*</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6, fontWeight: 400 }}>
                  모든 사람에게 공개됩니다
                </span>
              </label>
              <textarea rows={4}
                placeholder="상품 소개, 구성 요약, 기대 효과 등을 적어주세요"
                maxLength={400}
                value={writeContent}
                onChange={e => setWriteContent(e.target.value)} />
              <div className="char-count">{writeContent.length}/400</div>
            </div>

            {/* 루틴 타입 → 빌더 / 나머지 → 전문 콘텐츠 textarea */}
            {writeMarketType === 'routine' ? (
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: 8 }}>
                  🏋️ 루틴 구성
                  <span style={{ fontSize: 10, color: '#34d399', marginLeft: 6, fontWeight: 400 }}>
                    구매자에게 공개되는 운동 프로그램
                  </span>
                </label>
                <RoutineTemplateBuilder
                  weeksData={routineWeeksData}
                  onChange={setRoutineWeeksData}
                  durationWeeks={routineDurationW}
                  daysPerWeek={routineDaysPerW}
                  goal={routineGoal}
                  level={routineLevel}
                  equipment={routineEquipment}
                  onMetaChange={meta => {
                    if (meta.goal          !== undefined) setRoutineGoal(meta.goal)
                    if (meta.level         !== undefined) setRoutineLevel(meta.level)
                    if (meta.durationWeeks !== undefined) setRoutineDurationW(meta.durationWeeks)
                    if (meta.daysPerWeek   !== undefined) setRoutineDaysPerW(meta.daysPerWeek)
                    if (meta.equipment     !== undefined) setRoutineEquipment(meta.equipment)
                  }}
                />
              </div>
            ) : (
              <div className="form-group">
                <label>
                  전문 콘텐츠
                  <span style={{ fontSize: 10, color: '#34d399', marginLeft: 6, fontWeight: 400 }}>
                    구매자에게만 공개됩니다
                  </span>
                </label>
                <textarea rows={8}
                  placeholder={`구매 후 공개할 상세 내용을 입력하세요.\n\n예시:\n■ 1주차: 기초 체력 평가 → 스쿼트 3×12, 데드리프트 3×10...\n■ 2주차: 볼륨 증가 → ...`}
                  value={writeFullContent}
                  onChange={e => setWriteFullContent(e.target.value)} />
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                  빈 칸이면 전문 콘텐츠 없이 등록됩니다
                </div>
              </div>
            )}

            {/* 태그 */}
            <div className="form-group">
              <label>태그 (Enter로 추가 · 최대 5개)</label>
              <div className="tag-input-wrap">
                {writeTags.map(tag => (
                  <span key={tag} className="tag-chip">
                    #{tag}
                    <button onClick={() => setWriteTags(p => p.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
                <input className="tag-raw-input" type="text"
                  placeholder={writeTags.length < 5 ? '예: 중급자, 벌크업' : ''}
                  value={writeTagInput}
                  onChange={e => setWriteTagInput(e.target.value)}
                  onKeyDown={handleTagKey}
                  disabled={writeTags.length >= 5} />
              </div>
            </div>

            {/* 미리보기 요약 */}
            {writeTitle && (
              <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)',
                borderRadius: 10, padding: 14, marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: '#34d399', fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em' }}>
                  등록 미리보기
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12,
                    background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid #34d39944' }}>
                    {MARKET_TYPES.find(t => t.key === writeMarketType)?.emoji} {MARKET_TYPES.find(t => t.key === writeMarketType)?.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 12,
                    background: writePrice === 0 ? 'rgba(52,211,153,0.2)' : 'rgba(200,241,53,0.2)',
                    color: writePrice === 0 ? '#34d399' : '#c8f135' }}>
                    {writePrice === 0 ? '무료' : `${writePrice.toLocaleString()}원`}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>{writeTitle}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }}
                onClick={() => setScreen('market')}>취소</button>
              <button className="write-btn-comm" style={{ flex: 2, background: '#34d399', color: '#0a0a0a' }}
                onClick={createMarketPost}>
                🛒 마켓에 등록하기
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── 글쓰기 화면 ──────────────────────────────────────────── */
  if (screen === 'write') {
    const effRoles = [user.role, ...(user.admin_permissions?.extra_roles || [])]
    const writableCats = getWritableCats(effRoles)
    return (
      <div className="comm-portal">
        <div className="comm-header">
          <button className="comm-back" onClick={() => setScreen('feed')}>←</button>
          <div className="comm-header-logo">글쓰기</div>
          <div style={{ width: 60 }} />
        </div>
        <div className="comm-write">
          <div className="comm-write-card">
            <div className="write-title-text">어떤 내용을 올리시겠어요?</div>

            {/* 카테고리 선택 */}
            <div className="form-group">
              <label>카테고리</label>
              <div className="cat-select-grid">
                {Object.entries(CATEGORIES).map(([key, cat]) => {
                  const disabled = !writableCats.includes(key)
                  return (
                    <div key={key}
                      className={`cat-select-item ${writeCat === key ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                      onClick={() => !disabled && setWriteCat(key)}>
                      <span className="cat-select-icon">{cat.emoji}</span>
                      <div className="cat-select-info">
                        <div className="cat-select-label">{cat.label}</div>
                        <div className="cat-select-desc">{cat.desc}</div>
                      </div>
                      {writeCat === key && <span style={{ color: '#4fc3f7' }}>✓</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {writeCat && <div className="cat-hint">💡 {CATEGORIES[writeCat]?.hint}</div>}

            <div className="form-group">
              <label>제목 <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input type="text" placeholder="제목을 입력해주세요" maxLength={50}
                value={writeTitle} onChange={e => setWriteTitle(e.target.value)} />
              <div className="char-count">{writeTitle.length}/50</div>
            </div>

            <div className="form-group">
              <label>내용 <span style={{ color: 'var(--danger)' }}>*</span></label>
              <textarea rows={6} placeholder="상세한 내용을 적어주세요" maxLength={500}
                value={writeContent} onChange={e => setWriteContent(e.target.value)} />
              <div className="char-count">{writeContent.length}/500</div>
            </div>

            <div className="form-group">
              <label>지역 (선택)</label>
              <input type="text" placeholder="예: 서울 강남, 부산 해운대"
                value={writeLocation} onChange={e => setWriteLocation(e.target.value)} />
            </div>

            {/* 사진 첨부 */}
            <div className="form-group">
              <label>사진 첨부 <span style={{fontWeight:400,color:'var(--text-dim)',fontSize:'11px'}}>최대 5장 · 10MB 이하</span></label>
              <div className="post-image-grid">
                {writeImagePreviews.map((src, i) => (
                  <div key={i} className="post-image-thumb">
                    <img src={src} alt="" />
                    <button className="post-image-remove" onClick={() => removeWriteImage(i)}>×</button>
                  </div>
                ))}
                {writeImages.length < 5 && (
                  <div className="post-image-add" onClick={() => postImageRef.current?.click()}>
                    <span style={{fontSize:'20px'}}>📷</span>
                    <span style={{fontSize:'11px',color:'var(--text-dim)'}}>사진 추가</span>
                  </div>
                )}
              </div>
              <input ref={postImageRef} type="file" accept="image/*" multiple style={{display:'none'}}
                onChange={handlePostImageChange} />
            </div>

            <div className="form-group">
              <label>태그 (Enter로 추가 · 최대 5개)</label>
              <div className="tag-input-wrap">
                {writeTags.map(tag => (
                  <span key={tag} className="tag-chip">
                    #{tag}
                    <button onClick={() => setWriteTags(p => p.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
                <input className="tag-raw-input" type="text"
                  placeholder={writeTags.length < 5 ? '태그 입력...' : ''}
                  value={writeTagInput}
                  onChange={e => setWriteTagInput(e.target.value)}
                  onKeyDown={handleTagKey}
                  disabled={writeTags.length >= 5} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { resetWriteForm(); setScreen('feed') }}>취소</button>
              <button className="write-btn-comm" style={{ flex: 2, opacity: uploading ? 0.6 : 1 }}
                onClick={createPost} disabled={uploading}>
                {uploading ? '업로드 중...' : '등록하기'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── 글 상세 화면 ─────────────────────────────────────────── */
  if (screen === 'detail' && selectedPost) {
    const isMyPost = selectedPost.user_id === user?.id
    const isClosed = selectedPost.status === 'closed'
    const authorIsProf = PROFESSIONAL_ROLES.includes(selectedPost.author?.role)

    return (
      <div className="comm-portal">
        <div className="comm-header">
          <button className="comm-back" onClick={() => setScreen('feed')}>←</button>
          <div className="comm-header-logo">게시글</div>
          <div style={{ width: 60 }} />
        </div>

        <div className="comm-detail">
          <div className="detail-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <CatBadge cat={selectedPost.category} />
              {isClosed && <span className="status-badge status-rejected">마감</span>}
            </div>

            <div className="detail-title">{selectedPost.title}</div>

            {/* 작성자 정보 + 프로필 사진 */}
            <div className="detail-author-row">
              <Avatar user={selectedPost.author} size={36} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedPost.author?.name}</span>
                  <RoleBadge role={selectedPost.author?.role} />
                </div>
                {selectedPost.author?.bio && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{selectedPost.author.bio}</div>
                )}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(selectedPost.created_at)}</span>
            </div>

            {selectedPost.location && (
              <div className="detail-location">📍 {selectedPost.location}</div>
            )}

            <div className="detail-content">{selectedPost.content}</div>

            {/* 첨부 이미지 */}
            {selectedPost.image_urls?.length > 0 && (
              <div className="detail-image-grid">
                {selectedPost.image_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="detail-image-wrap">
                    <img src={url} alt={`첨부 이미지 ${i + 1}`} className="detail-image" />
                  </a>
                ))}
              </div>
            )}

            {selectedPost.tags?.length > 0 && (
              <div className="detail-tags">
                {selectedPost.tags.map(t => <span key={t} className="post-tag">#{t}</span>)}
              </div>
            )}

            {/* 내 글 액션 */}
            {isMyPost && (
              <div className="detail-actions" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                {!isClosed && (
                  <button className="btn btn-ghost btn-sm" onClick={() => closePost(selectedPost.id)}>마감하기</button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => deletePost(selectedPost.id)}>삭제</button>
              </div>
            )}

            {/* 다른 사람 글 액션 */}
            {!isMyPost && !isClosed && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                {myContact ? (
                  <div className="my-contact-sent">
                    연락 요청을 보냈습니다 · <StatusBadge status={myContact.status} />
                    {myContact.status === 'accepted' && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        수락되었습니다. 카카오톡 오픈채팅으로 연락해보세요.
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="write-btn-comm" style={{ width: '100%' }}
                    onClick={() => setShowContactModal(true)}>
                    연락하기
                  </button>
                )}
              </div>
            )}
            {!isMyPost && isClosed && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                마감된 게시글입니다
              </div>
            )}
          </div>

          {/* 연락 요청 목록 (내 글일 때) */}
          {isMyPost && (
            <div className="contacts-section">
              <div className="contacts-title">연락 요청 {contacts.length}건</div>
              {contacts.length === 0 && (
                <div className="comm-empty" style={{ padding: '20px 0' }}>아직 연락 요청이 없습니다</div>
              )}
              {contacts.map(c => (
                <div key={c.id} className="contact-item">
                  <div className="contact-item-top">
                    <div className="contact-item-info">
                      <Avatar user={c.requester} size={28} />
                      <RoleBadge role={c.requester?.role} />
                      <span>{c.requester?.name}</span>
                      {c.requester?.location && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· {c.requester.location}</span>
                      )}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.message && <div className="contact-item-msg">"{c.message}"</div>}
                  {c.requester?.bio && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>{c.requester.bio}</div>
                  )}
                  {c.status === 'accepted' && (
                    <div className="contact-phone-reveal">
                      📞 연락처: ***-****-{c.requester?.phone || '????'}
                      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                        카카오톡 오픈채팅으로 추가 연락을 권장합니다
                      </div>
                    </div>
                  )}
                  {c.status === 'pending' && (
                    <div className="contact-item-actions">
                      <button className="btn btn-primary btn-sm"
                        style={{ background: '#4fc3f7', color: '#0a0a0a' }}
                        onClick={() => updateContactStatus(c.id, 'accepted')}>수락</button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => updateContactStatus(c.id, 'rejected')}>거절</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 연락하기 모달 */}
        {showContactModal && (
          <div className="comm-modal-overlay" onClick={e => e.target === e.currentTarget && setShowContactModal(false)}>
            <div className="comm-modal">
              <div className="comm-modal-title">
                <span>연락하기</span>
                <button className="close-btn" onClick={() => setShowContactModal(false)}>×</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
                글쓴이에게 자기소개 메시지를 보내세요
              </div>
              <div className="form-group">
                <textarea rows={4} value={contactMsg} onChange={e => setContactMsg(e.target.value)} />
              </div>
              <button className="write-btn-comm" style={{ width: '100%' }} onClick={sendContact}>전송하기</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── 내 활동 화면 ─────────────────────────────────────────── */
  if (screen === 'mypage') return (
    <div className="comm-portal">
      <div className="comm-header">
        <button className="comm-back" onClick={() => setScreen('feed')}>←</button>
        <div className="comm-header-logo">내 활동</div>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>로그아웃</button>
      </div>

      <div className="comm-mypage">
        {/* 프로필 카드 */}
        <div className="my-profile-card">
          <div className="my-profile-top">
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <Avatar user={user} size={56} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <RoleBadge role={user?.role} />
                </div>
                <div className="my-profile-name">{user?.name}</div>
                {user?.bio && <div className="my-profile-bio">{user.bio}</div>}
                {user?.location && <div className="my-profile-location">📍 {user.location}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="mypage-tabs">
          <button className={`mypage-tab ${myTab === 'posts' ? 'active' : ''}`} onClick={() => setMyTab('posts')}>
            내가 쓴 글 ({myPosts.length})
          </button>
          <button className={`mypage-tab ${myTab === 'contacts' ? 'active' : ''}`} onClick={() => setMyTab('contacts')}>
            연락 내역
          </button>
          <button className={`mypage-tab ${myTab === 'purchased' ? 'active' : ''}`} onClick={() => setMyTab('purchased')}>
            내 구매 ({myPurchasedItems.length})
          </button>
          {['educator', 'instructor'].includes(user?.role) && (
            <button className={`mypage-tab ${myTab === 'sales' ? 'active' : ''}`} onClick={() => setMyTab('sales')}>
              판매 현황
            </button>
          )}
        </div>

        <div className="mypage-content">
          {myTab === 'posts' && (
            <>
              {myPosts.length === 0 && (
                <div className="comm-empty">
                  <div className="comm-empty-icon">📝</div>
                  <div>작성한 글이 없습니다</div>
                </div>
              )}
              {myPosts.map(post => (
                <div key={post.id} style={{ position: 'relative' }}>
                  <PostCard post={post} onOpen={() => openDetail(post)} myId={user.id} />
                  {post.status === 'active' && (
                    <button className="btn btn-ghost btn-sm"
                      style={{ position: 'absolute', top: 12, right: 12, fontSize: 10 }}
                      onClick={e => { e.stopPropagation(); closePost(post.id) }}>
                      마감
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {myTab === 'purchased' && (
            <>
              {myPurchasedItems.length === 0 && (
                <div className="comm-empty">
                  <div className="comm-empty-icon">🛒</div>
                  <div>구매한 상품이 없습니다</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}
                    onClick={() => setScreen('market')}>
                    마켓 둘러보기 →
                  </button>
                </div>
              )}
              {myPurchasedItems.map(purchase => {
                const item = purchase.post
                if (!item) return null
                const MARKET_TYPE_LABELS = { routine:'🏋️ 운동 루틴', program:'📅 프로그램', nutrition:'🥗 식단', content:'📖 콘텐츠' }
                return (
                  <div key={purchase.id}
                    style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px', marginBottom: 10, cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedMarket(item)
                      setMarketContent(null)
                      setScreen('market_detail')
                    }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                      {item.market_type && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
                          background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                          {MARKET_TYPE_LABELS[item.market_type]}
                        </span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: purchase.amount_paid === 0 ? 'rgba(52,211,153,0.12)' : 'rgba(200,241,53,0.12)',
                        color: purchase.amount_paid === 0 ? '#34d399' : '#c8f135' }}>
                        {purchase.amount_paid === 0 ? '무료' : `${purchase.amount_paid.toLocaleString()}원`}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
                        {timeAgo(purchase.purchased_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{item.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--comm)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0a0a0a' }}>
                        {item.author?.name?.[0] || '?'}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{item.author?.name}</span>
                      <span style={{ fontSize: 10, color: '#34d399', marginLeft: 'auto' }}>🔓 열람 가능</span>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {myTab === 'sales' && ['educator', 'instructor'].includes(user?.role) && (
            <>
              {/* 판매 통계 요약 */}
              {mySellerStats ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                    {[
                      ['총 상품', (mySellerStats.total_items || 0) + '개', '#34d399'],
                      ['총 판매', (mySellerStats.total_sales || 0) + '건', '#c8f135'],
                      ['총 수익', ((mySellerStats.total_revenue || 0)).toLocaleString() + '원', '#ff9800'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {[
                      ['무료 상품', (mySellerStats.free_items || 0) + '개'],
                      ['유료 상품', (mySellerStats.paid_items || 0) + '개'],
                    ].map(([l, v]) => (
                      <div key={l} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{l}</div>
                      </div>
                    ))}
                  </div>

                  {/* 최근 구매자 목록 */}
                  {(mySellerStats.recent_purchases || []).length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>
                        최근 구매 내역
                      </div>
                      {(mySellerStats.recent_purchases || []).map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.buyer_name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{p.post_title}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: p.amount === 0 ? '#34d399' : '#c8f135' }}>
                              {p.amount === 0 ? '무료' : p.amount.toLocaleString() + '원'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{timeAgo(p.purchased_at)}</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  <button className="write-btn-comm"
                    style={{ width: '100%', marginTop: 12, background: '#34d399', color: '#0a0a0a' }}
                    onClick={() => setScreen('market')}>
                    🛒 내 마켓 관리하기
                  </button>
                </>
              ) : (
                <div className="comm-empty">
                  <div className="comm-empty-icon">📊</div>
                  <div>판매 데이터가 없습니다</div>
                  <button className="write-btn-comm"
                    style={{ marginTop: 12, background: '#34d399', color: '#0a0a0a' }}
                    onClick={() => { setWriteMarketType('routine'); setScreen('market_write') }}>
                    첫 상품 등록하기
                  </button>
                </div>
              )}
            </>
          )}

          {myTab === 'contacts' && (
            <>
              <div className="contact-history-section">
                <div className="contact-history-title">내가 보낸 연락</div>
                {sentContacts.length === 0 && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>보낸 연락이 없습니다</div>
                )}
                {sentContacts.map(c => (
                  <div key={c.id} className="sent-contact-item">
                    <div className="sent-contact-post-title">{c.post?.title}</div>
                    {c.message && <div className="sent-contact-msg">"{c.message}"</div>}
                    <div className="sent-contact-footer">
                      <StatusBadge status={c.status} />
                      <span>{timeAgo(c.created_at)}</span>
                    </div>
                    {c.status === 'accepted' && (
                      <div className="contact-phone-reveal" style={{ marginTop: 8 }}>
                        연락이 수락되었습니다. 글쓴이에게 직접 연락해보세요.
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="contact-history-section">
                <div className="contact-history-title">받은 연락 요청</div>
                {receivedContacts.length === 0 && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>받은 연락이 없습니다</div>
                )}
                {receivedContacts.map(c => (
                  <div key={c.id} className="contact-item">
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>글: {c.post?.title}</div>
                    <div className="contact-item-top">
                      <div className="contact-item-info">
                        <Avatar user={c.requester} size={26} />
                        <RoleBadge role={c.requester?.role} />
                        <span>{c.requester?.name}</span>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    {c.message && <div className="contact-item-msg">"{c.message}"</div>}
                    {c.status === 'accepted' && (
                      <div className="contact-phone-reveal">
                        📞 ***-****-{c.requester?.phone || '????'}
                      </div>
                    )}
                    {c.status === 'pending' && (
                      <div className="contact-item-actions">
                        <button className="btn btn-primary btn-sm"
                          style={{ background: '#4fc3f7', color: '#0a0a0a' }}
                          onClick={() => updateContactStatus(c.id, 'accepted')}>수락</button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => updateContactStatus(c.id, 'rejected')}>거절</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return null
}

/* ============================================================
   PostCard 컴포넌트
   ============================================================ */
function PostCard({ post, onOpen, myId }) {
  const isClosed  = post.status === 'closed'
  const isMyPost  = post.user_id === myId
  const showPhoto = ['trainer', 'instructor'].includes(post.author?.role)

  return (
    <div className={`post-card ${isClosed ? 'closed' : ''}`} onClick={onOpen}>
      {/* 카드 상단: 카테고리 뱃지 */}
      <div className="post-card-top">
        <CatBadge cat={post.category} />
        {isMyPost && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>내 글</span>}
      </div>

      <div className="post-title" style={{ marginTop: 8 }}>{post.title}</div>

      {post.location && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0' }}>📍 {post.location}</div>
      )}

      <div className="post-preview">
        {post.content.length > 80 ? post.content.slice(0, 80) + '...' : post.content}
      </div>

      {post.tags?.length > 0 && (
        <div className="post-tags">
          {post.tags.map(t => <span key={t} className="post-tag">#{t}</span>)}
        </div>
      )}

      {/* 첨부 이미지 썸네일 (첫 장만) */}
      {post.image_urls?.length > 0 && (
        <div className="post-card-thumb-wrap">
          <img src={post.image_urls[0]} alt="" className="post-card-thumb" />
          {post.image_urls.length > 1 && (
            <span className="post-card-thumb-count">+{post.image_urls.length - 1}</span>
          )}
        </div>
      )}

      {/* 작성자 정보 + 프로필 사진 */}
      <div className="post-meta">
        <div className="post-author">
          {showPhoto
            ? <Avatar user={post.author} size={24} />
            : <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{post.author?.name?.[0] || '?'}</div>
          }
          <RoleBadge role={post.author?.role} />
          <span>{post.author?.name}</span>
          {post.author?.location && <span>· {post.author.location}</span>}
        </div>
        <div className="post-stats">
          {post.contact_count > 0 && <span>💬 {post.contact_count}</span>}
          <span>{timeAgo(post.created_at)}</span>
        </div>
      </div>

      {isClosed && (
        <div className="closed-overlay">
          <span className="closed-badge-big">마감</span>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   MarketCard 컴포넌트
   ============================================================ */
function MarketCard({ item, isPurchased, isMine, onOpen }) {
  const MARKET_TYPE_LABELS = {
    routine:   { label: '운동 루틴',      emoji: '🏋️' },
    program:   { label: '트레이닝 프로그램', emoji: '📅' },
    nutrition: { label: '식단 가이드',     emoji: '🥗' },
    content:   { label: '교육 콘텐츠',     emoji: '📖' },
  }
  const typeInfo = MARKET_TYPE_LABELS[item.market_type] || { label: item.market_type, emoji: '📦' }
  const isFree   = item.price === 0

  return (
    <div
      onClick={onOpen}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px',
        marginBottom: 10,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#34d39966'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* 상단 뱃지 행 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, fontWeight: 600,
          background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
          {typeInfo.emoji} {typeInfo.label}
        </span>
        {isMine && (
          <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, fontWeight: 600,
            background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
            내 상품
          </span>
        )}
        {isPurchased && !isMine && (
          <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, fontWeight: 600,
            background: 'rgba(52,211,153,0.2)', color: '#34d399' }}>
            🔓 구매완료
          </span>
        )}
        {/* 가격 — 오른쪽 정렬 */}
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, padding: '3px 12px', borderRadius: 12,
          background: isFree ? 'rgba(52,211,153,0.18)' : 'rgba(200,241,53,0.18)',
          color:      isFree ? '#34d399' : '#c8f135',
          border:     `1px solid ${isFree ? '#34d39944' : '#c8f13544'}` }}>
          {isFree ? '무료' : `${item.price.toLocaleString()}원`}
        </span>
      </div>

      {/* 제목 */}
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>
        {item.title}
      </div>

      {/* 미리보기 */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
        {item.content?.length > 90 ? item.content.slice(0, 90) + '...' : item.content}
      </div>

      {/* 태그 */}
      {item.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {item.tags.map(t => (
            <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8,
              background: 'var(--surface2)', color: 'var(--text-dim)' }}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 작성자 + 구매 수 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%',
          background: 'var(--comm)', color: '#0a0a0a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
          {item.author?.name?.[0] || '?'}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.author?.name}</span>
        {item.author?.role && (
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6,
            background: (ROLE_META[item.author.role]?.color || '#888') + '18',
            color: ROLE_META[item.author.role]?.color || '#888' }}>
            {ROLE_META[item.author.role]?.emoji} {ROLE_META[item.author.role]?.label}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-dim)' }}>
          {item.purchase_count > 0 && (
            <span>🛒 {item.purchase_count}</span>
          )}
          <span>{timeAgo(item.created_at)}</span>
        </div>
      </div>
    </div>
  )
}
