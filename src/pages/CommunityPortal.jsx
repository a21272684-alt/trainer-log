import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import '../styles/community.css'

/* ============================================================
   상수 정의
   ============================================================ */
const CATEGORIES = {
  trainer_seeks_member: {
    label: '트레이너 구인',
    desc: '회원 모집',
    emoji: '💪',
    color: '#c8f135',
    bg: 'rgba(200,241,53,0.12)',
    hint: '수업 가능 시간대, 전문 분야, 희망 지역 등을 적어주세요',
  },
  member_seeks_trainer: {
    label: '트레이너 찾기',
    desc: '트레이너 구인',
    emoji: '🏃',
    color: '#4fc3f7',
    bg: 'rgba(79,195,247,0.12)',
    hint: '원하는 운동 목표, 가능한 시간대, 예산 등을 적어주세요',
  },
  instructor_seeks_student: {
    label: '강의 수강생',
    desc: '수강생 모집',
    emoji: '📚',
    color: '#ff9800',
    bg: 'rgba(255,152,0,0.12)',
    hint: '강의 주제, 대상 (트레이너/관장 등), 일정 등을 적어주세요',
  },
  gym_seeks_trainer: {
    label: '직원 구인',
    desc: '트레이너 채용',
    emoji: '🏢',
    color: '#e040fb',
    bg: 'rgba(224,64,251,0.12)',
    hint: '센터 위치, 근무 조건, 우대사항 등을 적어주세요',
  },
  trainer_seeks_gym: {
    label: '센터 구직',
    desc: '근무 센터 구함',
    emoji: '🔍',
    color: '#ff5c5c',
    bg: 'rgba(255,92,92,0.12)',
    hint: '가능 지역, 경력, 전문 분야 등을 적어주세요',
  },
}

const ROLES = {
  trainer:   { label: '트레이너',    emoji: '💪' },
  member:    { label: '회원',        emoji: '🏃' },
  instructor:{ label: '교육강사',    emoji: '📚' },
  gym_owner: { label: '헬스장 대표', emoji: '🏢' },
}

// 역할별 작성 가능한 카테고리
const ROLE_CATS = {
  trainer:   ['trainer_seeks_member', 'trainer_seeks_gym'],
  member:    ['member_seeks_trainer'],
  instructor:['instructor_seeks_student'],
  gym_owner: ['gym_seeks_trainer'],
}

const CAT_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'trainer_seeks_member',     label: '트레이너 구인' },
  { key: 'member_seeks_trainer',     label: '트레이너 찾기' },
  { key: 'instructor_seeks_student', label: '강의 수강생' },
  { key: 'gym_seeks_trainer',        label: '직원 구인' },
  { key: 'trainer_seeks_gym',        label: '센터 구직' },
]

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function CatBadge({ cat }) {
  const c = CATEGORIES[cat]
  if (!c) return null
  return (
    <span className="cat-badge" style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}33` }}>
      {c.emoji} {c.label}
    </span>
  )
}

function RoleBadge({ role }) {
  const r = ROLES[role]
  if (!r) return null
  return <span className="role-badge">{r.emoji} {r.label}</span>
}

function StatusBadge({ status }) {
  const map = { pending: ['대기중', 'status-pending'], accepted: ['수락됨', 'status-accepted'], rejected: ['거절됨', 'status-rejected'] }
  const [label, cls] = map[status] || ['?', '']
  return <span className={`status-badge ${cls}`}>{label}</span>
}

/* ============================================================
   메인 컴포넌트
   ============================================================ */
export default function CommunityPortal() {
  const showToast = useToast()
  const navigate = useNavigate()

  // ── Auth ──────────────────────────────────────────────────
  const [screen, setScreen] = useState('login')
  const [user, setUser] = useState(null)

  // ── Login form ────────────────────────────────────────────
  const [loginName, setLoginName] = useState('')
  const [loginPhone, setLoginPhone] = useState('')

  // ── Register form ─────────────────────────────────────────
  const [regName, setRegName] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regRole, setRegRole] = useState('')
  const [regLocation, setRegLocation] = useState('')
  const [regBio, setRegBio] = useState('')

  // ── Feed ──────────────────────────────────────────────────
  const [posts, setPosts] = useState([])
  const [filter, setFilter] = useState('all')
  const [showClosed, setShowClosed] = useState(false)
  const [loading, setLoading] = useState(false)

  // ── Detail ────────────────────────────────────────────────
  const [selectedPost, setSelectedPost] = useState(null)
  const [contacts, setContacts] = useState([])
  const [myContact, setMyContact] = useState(null)
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactMsg, setContactMsg] = useState('')

  // ── Write ─────────────────────────────────────────────────
  const [writeCat, setWriteCat] = useState('')
  const [writeTitle, setWriteTitle] = useState('')
  const [writeContent, setWriteContent] = useState('')
  const [writeLocation, setWriteLocation] = useState('')
  const [writeTags, setWriteTags] = useState([])
  const [writeTagInput, setWriteTagInput] = useState('')

  // ── MyPage ────────────────────────────────────────────────
  const [myTab, setMyTab] = useState('posts')
  const [myPosts, setMyPosts] = useState([])
  const [sentContacts, setSentContacts] = useState([])
  const [receivedContacts, setReceivedContacts] = useState([])

  /* ── 피드 로드 ───────────────────────────────────────────── */
  useEffect(() => {
    if (screen === 'feed') loadPosts()
  }, [screen, filter, showClosed])

  async function loadPosts() {
    setLoading(true)
    try {
      let q = supabase
        .from('community_posts')
        .select('*, author:community_users(*)')
        .order('created_at', { ascending: false })

      if (!showClosed) q = q.eq('status', 'active')
      if (filter !== 'all') q = q.eq('category', filter)

      const { data, error } = await q
      if (error) throw error
      setPosts(data || [])
    } catch {
      showToast('게시글을 불러오지 못했습니다')
    }
    setLoading(false)
  }

  /* ── 로그인 ──────────────────────────────────────────────── */
  async function login() {
    if (!loginName.trim() || !loginPhone.trim()) return showToast('이름과 전화번호를 입력해주세요')
    const { data } = await supabase
      .from('community_users')
      .select('*')
      .eq('name', loginName.trim())
      .eq('phone', loginPhone.trim())
      .maybeSingle()

    if (data) {
      setUser(data)
      setScreen('feed')
    } else {
      showToast('등록된 계정이 없습니다. 회원가입을 해주세요')
      setRegName(loginName)
      setRegPhone(loginPhone)
      setScreen('register')
    }
  }

  /* ── 회원가입 ────────────────────────────────────────────── */
  async function register() {
    if (!regName.trim() || !regPhone.trim()) return showToast('이름과 전화번호를 입력해주세요')
    if (!regRole) return showToast('역할을 선택해주세요')

    const { data, error } = await supabase
      .from('community_users')
      .insert({
        name: regName.trim(),
        phone: regPhone.trim(),
        role: regRole,
        location: regLocation.trim() || null,
        bio: regBio.trim() || null,
      })
      .select()
      .single()

    if (error) return showToast('가입 중 오류가 발생했습니다')
    setUser(data)
    setScreen('feed')
    showToast('환영합니다! 커뮤니티에 오신 걸 환영해요')
  }

  /* ── 글 상세 열기 ────────────────────────────────────────── */
  async function openDetail(post) {
    setSelectedPost(post)
    setMyContact(null)
    setContacts([])
    setScreen('detail')

    const { data } = await supabase
      .from('community_contacts')
      .select('*, requester:community_users(*)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })

    const list = data || []
    setContacts(list)
    if (user) setMyContact(list.find(c => c.requester_id === user.id) || null)
    setContactMsg(`안녕하세요! 저는 ${user?.name}입니다.`)
  }

  /* ── 연락하기 ────────────────────────────────────────────── */
  async function sendContact() {
    if (!contactMsg.trim()) return showToast('메시지를 입력해주세요')

    const { error } = await supabase.from('community_contacts').insert({
      post_id: selectedPost.id,
      requester_id: user.id,
      message: contactMsg.trim(),
    })

    if (error) {
      if (error.code === '23505') return showToast('이미 연락 요청을 보냈습니다')
      return showToast('오류가 발생했습니다')
    }

    await supabase
      .from('community_posts')
      .update({ contact_count: (selectedPost.contact_count || 0) + 1 })
      .eq('id', selectedPost.id)

    showToast('연락 요청을 보냈습니다')
    setShowContactModal(false)
    setSelectedPost(p => ({ ...p, contact_count: (p.contact_count || 0) + 1 }))
    openDetail(selectedPost)
  }

  /* ── 연락 상태 변경 ──────────────────────────────────────── */
  async function updateContactStatus(contactId, status) {
    await supabase.from('community_contacts').update({ status }).eq('id', contactId)
    showToast(status === 'accepted' ? '수락했습니다' : '거절했습니다')
    openDetail(selectedPost)
  }

  /* ── 마감 ────────────────────────────────────────────────── */
  async function closePost(postId) {
    await supabase.from('community_posts').update({ status: 'closed' }).eq('id', postId)
    showToast('마감 처리되었습니다')
    if (screen === 'detail') setSelectedPost(p => ({ ...p, status: 'closed' }))
    if (screen === 'mypage') loadMyData()
  }

  /* ── 삭제 ────────────────────────────────────────────────── */
  async function deletePost(postId) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('community_posts').delete().eq('id', postId)
    showToast('삭제되었습니다')
    setScreen('feed')
  }

  /* ── 글 등록 ─────────────────────────────────────────────── */
  async function createPost() {
    if (!writeCat) return showToast('카테고리를 선택해주세요')
    if (!writeTitle.trim()) return showToast('제목을 입력해주세요')
    if (!writeContent.trim()) return showToast('내용을 입력해주세요')

    const { error } = await supabase.from('community_posts').insert({
      user_id: user.id,
      category: writeCat,
      title: writeTitle.trim(),
      content: writeContent.trim(),
      location: writeLocation.trim() || null,
      tags: writeTags.length > 0 ? writeTags : null,
    })

    if (error) return showToast('등록 중 오류가 발생했습니다')
    showToast('게시글이 등록되었습니다')
    setWriteCat(''); setWriteTitle(''); setWriteContent('')
    setWriteLocation(''); setWriteTags([])
    setScreen('feed')
  }

  /* ── 태그 입력 ───────────────────────────────────────────── */
  function handleTagKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const val = writeTagInput.trim()
      if (!val) return
      if (writeTags.length >= 5) return showToast('태그는 최대 5개까지 추가할 수 있습니다')
      if (!writeTags.includes(val)) setWriteTags(prev => [...prev, val])
      setWriteTagInput('')
    }
  }

  /* ── 내 활동 데이터 로드 ─────────────────────────────────── */
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
    if (ids.length > 0) {
      const { data: rcvData } = await supabase
        .from('community_contacts')
        .select('*, requester:community_users(*), post:community_posts(title)')
        .in('post_id', ids)
        .order('created_at', { ascending: false })
      setReceivedContacts(rcvData || [])
    } else {
      setReceivedContacts([])
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */

  /* ── 로그인 화면 ──────────────────────────────────────────── */
  if (screen === 'login') return (
    <div className="comm-login-wrap">
      <div className="comm-login-card">
        <div className="comm-logo">TRAINER<span>LOG</span></div>
        <div className="comm-badge">COMMUNITY</div>

        <div className="form-group">
          <label>이름</label>
          <input type="text" placeholder="홍길동"
            value={loginName} onChange={e => setLoginName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()} />
        </div>
        <div className="form-group">
          <label>전화번호 뒷 4자리</label>
          <input type="text" placeholder="1234" maxLength={4}
            value={loginPhone} onChange={e => setLoginPhone(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && login()} />
        </div>

        <button className="btn btn-primary btn-full" style={{ marginTop: 8, background: '#4fc3f7', color: '#0a0a0a' }} onClick={login}>
          로그인
        </button>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button className="btn btn-ghost btn-full" onClick={() => { setRegName(''); setRegPhone(''); setRegRole(''); setRegLocation(''); setRegBio(''); setScreen('register') }}>
            처음이신가요? 가입하기
          </button>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← 홈으로</button>
        </div>
      </div>
    </div>
  )

  /* ── 회원가입 화면 ────────────────────────────────────────── */
  if (screen === 'register') return (
    <div className="comm-login-wrap">
      <div className="comm-login-card" style={{ maxWidth: 420 }}>
        <button className="comm-back" onClick={() => setScreen('login')} style={{ marginBottom: 12, fontSize: 14 }}>
          ← 뒤로
        </button>
        <div className="comm-logo">커뮤니티 <span>가입</span></div>
        <div className="comm-badge">SIGN UP</div>

        <div className="form-group">
          <label>이름</label>
          <input type="text" placeholder="홍길동"
            value={regName} onChange={e => setRegName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>전화번호 뒷 4자리</label>
          <input type="text" placeholder="1234" maxLength={4}
            value={regPhone} onChange={e => setRegPhone(e.target.value.replace(/\D/g, ''))} />
        </div>

        <div className="form-group">
          <label>나는 어떤 역할인가요?</label>
          <div className="role-grid">
            {Object.entries(ROLES).map(([key, r]) => (
              <div key={key}
                className={`role-card ${regRole === key ? 'selected' : ''}`}
                onClick={() => setRegRole(key)}>
                <div className="role-card-icon">{r.emoji}</div>
                <div className="role-card-label">{r.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>활동 지역 (선택)</label>
          <input type="text" placeholder="예: 서울 강남, 부산 해운대"
            value={regLocation} onChange={e => setRegLocation(e.target.value)} />
        </div>

        <div className="form-group">
          <label>한줄 소개 (선택)</label>
          <input type="text" placeholder="예: PT 경력 5년, 다이어트 전문"
            value={regBio} onChange={e => setRegBio(e.target.value)} />
        </div>

        <button className="btn btn-primary btn-full"
          style={{ marginTop: 8, background: '#4fc3f7', color: '#0a0a0a' }}
          onClick={register}>
          가입 완료
        </button>
      </div>
    </div>
  )

  /* ── 피드 화면 ────────────────────────────────────────────── */
  if (screen === 'feed') return (
    <div className="comm-portal">
      {/* 헤더 */}
      <div className="comm-header">
        <div>
          <div className="comm-header-logo">TRAINER<span>LOG</span></div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>커뮤니티</div>
        </div>
        <div className="comm-header-actions">
          <RoleBadge role={user?.role} />
          <button className="write-btn-comm" onClick={() => { setWriteCat(ROLE_CATS[user?.role]?.[0] || ''); setScreen('write') }}>
            + 글쓰기
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setScreen('mypage')}>내 활동</button>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="cat-tabs-wrap">
        <div className="cat-tabs">
          {CAT_FILTERS.map(f => (
            <button key={f.key}
              className={`cat-tab ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 피드 */}
      <div className="comm-feed">
        <div className="feed-options">
          <span className="feed-count">게시글 {posts.length}개</span>
          <button className="toggle-closed" onClick={() => setShowClosed(v => !v)}>
            <span>{showClosed ? '✓' : '○'}</span> 마감 포함
          </button>
        </div>

        {loading && <div className="comm-loading">불러오는 중...</div>}

        {!loading && posts.length === 0 && (
          <div className="comm-empty">
            <div className="comm-empty-icon">📭</div>
            <div>아직 게시글이 없습니다</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>첫 번째 글을 작성해보세요!</div>
          </div>
        )}

        {posts.map(post => (
          <PostCard key={post.id} post={post} onOpen={() => openDetail(post)} />
        ))}
      </div>
    </div>
  )

  /* ── 글쓰기 화면 ──────────────────────────────────────────── */
  if (screen === 'write') {
    const allowedCats = ROLE_CATS[user?.role] || []
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
                  const disabled = !allowedCats.includes(key)
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

            {/* 카테고리 힌트 */}
            {writeCat && (
              <div className="cat-hint">
                💡 {CATEGORIES[writeCat]?.hint}
              </div>
            )}

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
              <label>태그 (선택 · Enter로 추가 · 최대 5개)</label>
              <div className="tag-input-wrap">
                {writeTags.map(tag => (
                  <span key={tag} className="tag-chip">
                    #{tag}
                    <button onClick={() => setWriteTags(prev => prev.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
                <input
                  className="tag-raw-input"
                  type="text"
                  placeholder={writeTags.length < 5 ? '태그 입력...' : ''}
                  value={writeTagInput}
                  onChange={e => setWriteTagInput(e.target.value)}
                  onKeyDown={handleTagKey}
                  disabled={writeTags.length >= 5}
                />
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

    return (
      <div className="comm-portal">
        <div className="comm-header">
          <button className="comm-back" onClick={() => setScreen('feed')}>←</button>
          <div className="comm-header-logo">게시글</div>
          <div style={{ width: 60 }} />
        </div>

        <div className="comm-detail">
          {/* 본문 카드 */}
          <div className="detail-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <CatBadge cat={selectedPost.category} />
              {isClosed && <span className="status-badge status-rejected">마감</span>}
            </div>

            <div className="detail-title">{selectedPost.title}</div>

            <div className="detail-author-row">
              <RoleBadge role={selectedPost.author?.role} />
              <span>{selectedPost.author?.name}</span>
              {selectedPost.author?.location && (
                <span>· 📍 {selectedPost.author.location}</span>
              )}
              <span style={{ marginLeft: 'auto' }}>{timeAgo(selectedPost.created_at)}</span>
            </div>

            {selectedPost.location && (
              <div className="detail-location">📍 {selectedPost.location}</div>
            )}

            <div className="detail-content">{selectedPost.content}</div>

            {selectedPost.tags?.length > 0 && (
              <div className="detail-tags">
                {selectedPost.tags.map(t => (
                  <span key={t} className="post-tag">#{t}</span>
                ))}
              </div>
            )}

            {/* 내 글 액션 */}
            {isMyPost && (
              <div className="detail-actions" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                {!isClosed && (
                  <button className="btn btn-ghost btn-sm" onClick={() => closePost(selectedPost.id)}>
                    마감하기
                  </button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => deletePost(selectedPost.id)}>
                  삭제
                </button>
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
                        수락되었습니다. 카카오톡 오픈채팅 또는 DM으로 연락해보세요.
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="write-btn-comm btn-full"
                    style={{ width: '100%' }}
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
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                      {c.requester.bio}
                    </div>
                  )}

                  {c.status === 'accepted' && (
                    <div className="contact-phone-reveal">
                      📞 연락처: ***-****-{c.requester?.phone}
                      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                        카카오톡 오픈채팅으로 추가 연락을 권장합니다
                      </div>
                    </div>
                  )}

                  {c.status === 'pending' && (
                    <div className="contact-item-actions">
                      <button className="btn btn-primary btn-sm"
                        style={{ background: '#4fc3f7', color: '#0a0a0a' }}
                        onClick={() => updateContactStatus(c.id, 'accepted')}>
                        수락
                      </button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => updateContactStatus(c.id, 'rejected')}>
                        거절
                      </button>
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
                <textarea rows={4} placeholder="자기소개 메시지"
                  value={contactMsg} onChange={e => setContactMsg(e.target.value)} />
              </div>
              <button className="write-btn-comm btn-full" style={{ width: '100%' }} onClick={sendContact}>
                전송하기
              </button>
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
        <button className="btn btn-ghost btn-sm"
          onClick={() => { setUser(null); setScreen('login'); setLoginName(''); setLoginPhone('') }}>
          로그아웃
        </button>
      </div>

      <div className="comm-mypage">
        {/* 프로필 카드 */}
        <div className="my-profile-card">
          <div className="my-profile-top">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <RoleBadge role={user?.role} />
              </div>
              <div className="my-profile-name">{user?.name}</div>
              {user?.bio && <div className="my-profile-bio">{user.bio}</div>}
              {user?.location && <div className="my-profile-location">📍 {user.location}</div>}
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
          {/* 내가 쓴 글 */}
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
                  <PostCard post={post} onOpen={() => openDetail(post)} />
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

          {/* 연락 내역 */}
          {myTab === 'contacts' && (
            <>
              {/* 내가 보낸 연락 */}
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

              {/* 받은 연락 요청 */}
              <div className="contact-history-section">
                <div className="contact-history-title">받은 연락 요청</div>
                {receivedContacts.length === 0 && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>받은 연락이 없습니다</div>
                )}
                {receivedContacts.map(c => (
                  <div key={c.id} className="contact-item">
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                      글: {c.post?.title}
                    </div>
                    <div className="contact-item-top">
                      <div className="contact-item-info">
                        <RoleBadge role={c.requester?.role} />
                        <span>{c.requester?.name}</span>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    {c.message && <div className="contact-item-msg">"{c.message}"</div>}
                    {c.requester?.bio && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                        {c.requester.bio}
                      </div>
                    )}
                    {c.status === 'accepted' && (
                      <div className="contact-phone-reveal">
                        📞 연락처: ***-****-{c.requester?.phone}
                      </div>
                    )}
                    {c.status === 'pending' && (
                      <div className="contact-item-actions">
                        <button className="btn btn-primary btn-sm"
                          style={{ background: '#4fc3f7', color: '#0a0a0a' }}
                          onClick={() => updateContactStatus(c.id, 'accepted')}>
                          수락
                        </button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => updateContactStatus(c.id, 'rejected')}>
                          거절
                        </button>
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
function PostCard({ post, onOpen }) {
  const cat = CATEGORIES[post.category]
  const isClosed = post.status === 'closed'

  return (
    <div className={`post-card ${isClosed ? 'closed' : ''}`} onClick={onOpen}>
      <div className="post-card-top">
        <div className="post-title">{post.title}</div>
        <CatBadge cat={post.category} />
      </div>

      {post.location && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
          📍 {post.location}
        </div>
      )}

      <div className="post-preview">
        {post.content.length > 80 ? post.content.slice(0, 80) + '...' : post.content}
      </div>

      {post.tags?.length > 0 && (
        <div className="post-tags">
          {post.tags.map(t => <span key={t} className="post-tag">#{t}</span>)}
        </div>
      )}

      <div className="post-meta">
        <div className="post-author">
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
