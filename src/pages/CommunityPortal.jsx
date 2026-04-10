import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import '../styles/community.css'

/* ============================================================
   카테고리 정의
   viewAccess  : 해당 카테고리 게시글을 볼 수 있는 역할
   writeAccess : 해당 카테고리에 글을 쓸 수 있는 역할
   ============================================================ */
const CATEGORIES = {
  trainer_seeks_member: {
    label: '직원 구인',
    desc: '직원 모집',
    emoji: '💼',
    color: '#c8f135',
    bg: 'rgba(200,241,53,0.12)',
    hint: '모집 조건, 전문 분야, 근무 지역 등을 적어주세요',
    viewAccess:  ['gym_owner', 'trainer'],
    writeAccess: ['gym_owner', 'trainer'],
  },
  member_seeks_trainer: {
    label: '나만의 트레이너 찾기',
    desc: '트레이너 구인',
    emoji: '🏃',
    color: '#4fc3f7',
    bg: 'rgba(79,195,247,0.12)',
    hint: '원하는 운동 목표, 가능한 시간대, 예산 등을 적어주세요',
    viewAccess:  ['member', 'trainer'],
    writeAccess: ['member', 'trainer'],
  },
  instructor_seeks_student: {
    label: '수강생 구인(교육)',
    desc: '수강생 모집',
    emoji: '📚',
    color: '#ff9800',
    bg: 'rgba(255,152,0,0.12)',
    hint: '강의 주제, 대상 (트레이너/관장 등), 일정 등을 적어주세요',
    viewAccess:  ['trainer', 'member', 'instructor', 'gym_owner'],
    writeAccess: ['instructor'],
  },
  gym_seeks_trainer: {
    label: '트레이너 채용',
    desc: '채용 공고',
    emoji: '🏢',
    color: '#e040fb',
    bg: 'rgba(224,64,251,0.12)',
    hint: '센터 위치, 근무 조건, 우대사항 등을 적어주세요',
    viewAccess:  ['gym_owner', 'trainer'],
    writeAccess: ['gym_owner'],
  },
  trainer_seeks_gym: {
    label: '센터 구직',
    desc: '근무 센터 구함',
    emoji: '🔍',
    color: '#ff5c5c',
    bg: 'rgba(255,92,92,0.12)',
    hint: '가능 지역, 경력, 전문 분야 등을 적어주세요',
    viewAccess:  ['trainer', 'gym_owner'],
    writeAccess: ['trainer'],
  },
}

const ROLES = {
  trainer:    { label: '트레이너',    emoji: '💪' },
  member:     { label: '회원',        emoji: '🏃' },
  instructor: { label: '교육강사',    emoji: '📚' },
  gym_owner:  { label: '헬스장 대표', emoji: '🏢' },
}

// 이 역할은 프로필 사진 필수
const PHOTO_REQUIRED_ROLES = ['trainer', 'instructor']

function getVisibleCats(role) {
  return Object.entries(CATEGORIES)
    .filter(([, c]) => c.viewAccess.includes(role))
    .map(([k]) => k)
}
function getWritableCats(role) {
  return Object.entries(CATEGORIES)
    .filter(([, c]) => c.writeAccess.includes(role))
    .map(([k]) => k)
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
  const c = CATEGORIES[cat]; if (!c) return null
  return (
    <span className="cat-badge" style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}33` }}>
      {c.emoji} {c.label}
    </span>
  )
}
function RoleBadge({ role }) {
  const r = ROLES[role]; if (!r) return null
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
  const photoInputRef = useRef(null)

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
  const [writeLocation, setWriteLocation] = useState('')
  const [writeTags,     setWriteTags]     = useState([])
  const [writeTagInput, setWriteTagInput] = useState('')

  // ── 내 활동 ───────────────────────────────────────────────
  const [myTab,             setMyTab]             = useState('posts')
  const [myPosts,           setMyPosts]           = useState([])
  const [sentContacts,      setSentContacts]      = useState([])
  const [receivedContacts,  setReceivedContacts]  = useState([])

  /* ── 앱 시작 시 인증 확인 ─────────────────────────────────── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthUser(session.user)
      else setScreen('login')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleAuthUser(session.user)
      if (event === 'SIGNED_OUT') { setUser(null); setAuthUser(null); setScreen('login') }
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

  /* ── 회원가입 ────────────────────────────────────────────── */
  async function register() {
    if (!regName.trim()) return showToast('이름을 입력해주세요')
    if (!regRole) return showToast('역할을 선택해주세요')
    if (PHOTO_REQUIRED_ROLES.includes(regRole) && !regPhoto)
      return showToast('트레이너 / 교육강사는 프로필 사진이 필수입니다 📸')

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
      const visibleCats = getVisibleCats(user.role)
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
    const { error } = await supabase.from('community_posts').insert({
      user_id: user.id, category: writeCat,
      title: writeTitle.trim(), content: writeContent.trim(),
      location: writeLocation.trim() || null,
      tags: writeTags.length > 0 ? writeTags : null,
    })
    if (error) return showToast('등록 중 오류가 발생했습니다')
    showToast('게시글이 등록되었습니다')
    setWriteCat(''); setWriteTitle(''); setWriteContent('')
    setWriteLocation(''); setWriteTags([])
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

  /* ── 로그인 (Google OAuth) ────────────────────────────────── */
  if (screen === 'login') return (
    <div className="comm-login-wrap">
      <div className="comm-login-card">
        <div className="comm-logo">TRAINER<span>LOG</span></div>
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

        {/* 역할 선택 */}
        <div className="form-group">
          <label>역할을 선택해주세요</label>
          <div className="role-grid">
            {Object.entries(ROLES).map(([key, r]) => (
              <div key={key}
                className={`role-card ${regRole === key ? 'selected' : ''}`}
                onClick={() => setRegRole(key)}>
                <div className="role-card-icon">{r.emoji}</div>
                <div className="role-card-label">{r.label}</div>
                {PHOTO_REQUIRED_ROLES.includes(key) && (
                  <div style={{ fontSize: 9, color: 'var(--comm)', marginTop: 3 }}>사진 필수</div>
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
    const visibleCats = getVisibleCats(user.role)
    const writableCats = getWritableCats(user.role)

    return (
      <div className="comm-portal">
        {/* 헤더 */}
        <div className="comm-header">
          <div>
            <div className="comm-header-logo">TRAINER<span>LOG</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>커뮤니티</div>
          </div>
          <div className="comm-header-actions">
            <Avatar user={user} size={28} />
            <RoleBadge role={user?.role} />
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

  /* ── 글쓰기 화면 ──────────────────────────────────────────── */
  if (screen === 'write') {
    const writableCats = getWritableCats(user.role)
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
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setScreen('feed')}>취소</button>
              <button className="write-btn-comm" style={{ flex: 2 }} onClick={createPost}>등록하기</button>
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
    const authorIsProf = ['trainer', 'instructor'].includes(selectedPost.author?.role)

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
